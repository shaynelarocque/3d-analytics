// ═══════════════════════════════════════════════════════════════════════════
//  TILE-BASED PARK LAYOUT ENGINE — 4-Hub Organic Road Network
//  Dynamic grid size based on page count. Each tile = 2×2 world units.
//  4 monorail stations at S/E/N/W, curved ring road, quadrant ride placement.
// ═══════════════════════════════════════════════════════════════════════════

import { RIDE_TYPES, RIDE_CATALOG } from './rides.js';

export const T = {
  EMPTY: 0, PATH: 1, RIDE: 2, QUEUE: 3, DECORATION: 4,
  PLAZA: 5, FENCE: 6, WATER: 7, PARKING: 8, ROAD: 9,
};

const TILE  = 2;
const AVE_W = 3;
const FENCE_INSET = 3;
const PLAZA_R_MAIN = 4;
const PLAZA_R_SUB  = 3;

// Compute grid size from page count: minimum 80, scales up for more rides
function computeGridSize(pageCount) {
  // Each ride needs ~14x12 effective tiles (footprint + spacing buffer)
  // 4 quadrants, so rides per quadrant = ceil(pageCount/4)
  // Each quadrant needs sqrt(ridesPerQuad) * 16 tiles per side
  const perQuad = Math.ceil(pageCount / 4);
  const quadSide = Math.ceil(Math.sqrt(perQuad)) * 16 + 10;
  const needed = quadSide * 2 + 20; // two quadrants + center roads + margins
  return Math.max(80, Math.min(160, Math.ceil(needed / 2) * 2)); // even number, 80-160
}

// ── TileGrid ────────────────────────────────────────────────────────────────

export class TileGrid {
  constructor(size) {
    this.size = size;
    this.half = size * TILE / 2;
    this.data = new Uint8Array(size * size);
  }
  idx(c, r) { return r * this.size + c; }
  get(c, r) { return this.inBounds(c, r) ? this.data[this.idx(c, r)] : -1; }
  set(c, r, t) { if (this.inBounds(c, r)) this.data[this.idx(c, r)] = t; }
  inBounds(c, r) { return c >= 0 && c < this.size && r >= 0 && r < this.size; }
  isClear(c, r, w, h) {
    for (let rr = r; rr < r + h; rr++)
      for (let cc = c; cc < c + w; cc++)
        if (this.get(cc, rr) !== T.EMPTY) return false;
    return true;
  }
  stamp(c, r, w, h, t) {
    for (let rr = r; rr < r + h; rr++)
      for (let cc = c; cc < c + w; cc++) this.set(cc, rr, t);
  }
  tileToWorld(c, r) {
    return { x: c * TILE - this.half + TILE / 2, z: r * TILE - this.half + TILE / 2 };
  }
  worldToTile(wx, wz) {
    return { col: Math.floor((wx + this.half) / TILE), row: Math.floor((wz + this.half) / TILE) };
  }
  neighbors4(c, r) {
    const n = [];
    if (c > 0) n.push({ col: c - 1, row: r });
    if (c < this.size - 1) n.push({ col: c + 1, row: r });
    if (r > 0) n.push({ col: c, row: r - 1 });
    if (r < this.size - 1) n.push({ col: c, row: r + 1 });
    return n;
  }
  pathNeighborCount(c, r) {
    let n = 0;
    for (const nb of this.neighbors4(c, r)) {
      const t = this.get(nb.col, nb.row);
      if (t === T.PATH || t === T.ROAD || t === T.PLAZA || t === T.QUEUE) n++;
    }
    return n;
  }
}

// ── ParkLayout ──────────────────────────────────────────────────────────────

export class ParkLayout {

  generate(pages) {
    const G = computeGridSize(pages.length);
    const grid = new TileGrid(G);
    const CX = Math.floor(G / 2);
    const CY = Math.floor(G / 2);

    const ridePlacements = [], queueAreas = [], decorations = [], fenceTiles = [];
    const pathNodeDefs = [], pathEdgeDefs = [];

    // Hub positions scale with grid size
    const hubOffset = Math.floor(G * 0.31); // ~31% from center
    const HUBS = {
      south: { col: CX, row: CY - hubOffset },
      east:  { col: CX + hubOffset, row: CY },
      north: { col: CX, row: CY + hubOffset },
      west:  { col: CX - hubOffset, row: CY },
    };

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 1 — Hub plazas
    // ════════════════════════════════════════════════════════════════════════

    // Center fountain plaza — reserve space so rides don't overlap
    this._stampCircle(grid, CX, CY, 6, T.PLAZA);

    this._stampCircle(grid, HUBS.south.col, HUBS.south.row, PLAZA_R_MAIN, T.PLAZA);
    this._stampCircle(grid, HUBS.east.col,  HUBS.east.row,  PLAZA_R_SUB,  T.PLAZA);
    this._stampCircle(grid, HUBS.north.col, HUBS.north.row, PLAZA_R_SUB,  T.PLAZA);
    this._stampCircle(grid, HUBS.west.col,  HUBS.west.row,  PLAZA_R_SUB,  T.PLAZA);

    // Path from south plaza to map edge (entrance)
    for (let r = FENCE_INSET + 1; r < HUBS.south.row - PLAZA_R_MAIN; r++) {
      grid.stamp(CX - 1, r, AVE_W, 1, T.PATH);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 2 — Ring road + cross-roads
    // ════════════════════════════════════════════════════════════════════════

    const hubOrder = ['south', 'east', 'north', 'west'];
    for (let i = 0; i < 4; i++) {
      this._stampCurvedRoad(grid, HUBS[hubOrder[i]], HUBS[hubOrder[(i + 1) % 4]], G);
    }
    this._stampCurvedRoad(grid, HUBS.south, HUBS.north, G);
    this._stampCurvedRoad(grid, HUBS.east,  HUBS.west, G);

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 3 — Place rides along roads with branching side-paths
    // ════════════════════════════════════════════════════════════════════════

    const sorted = [...pages].sort((a, b) => b.y - a.y);
    const maxVisits = sorted.length > 0 ? sorted[0].y : 1;

    const shuffledTypes = [];
    while (shuffledTypes.length < sorted.length + 13) {
      const batch = [...RIDE_TYPES].sort(() => Math.random() - 0.5);
      shuffledTypes.push(...batch);
    }

    // Collect all road/path tiles as candidate anchor points
    const roadTiles = [];
    for (let r = FENCE_INSET + 4; r < G - FENCE_INSET - 4; r++)
      for (let c = FENCE_INSET + 4; c < G - FENCE_INSET - 4; c++)
        if (grid.get(c, r) === T.PATH || grid.get(c, r) === T.PLAZA) roadTiles.push({ col: c, row: r });

    // Shuffle road tiles for randomized placement
    for (let i = roadTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roadTiles[i], roadTiles[j]] = [roadTiles[j], roadTiles[i]];
    }

    // For each page, find a road tile and place the ride perpendicular to it
    let roadIdx = 0;
    for (let pi = 0; pi < sorted.length; pi++) {
      const page = sorted[pi];
      const rideType = shuffledTypes[pi];
      const cat = RIDE_CATALOG[rideType];
      if (!cat) continue;

      const placement = this._placeRideAlongRoad(grid, rideType, cat, page, roadTiles, roadIdx, maxVisits, G, CX, CY);
      if (placement) {
        ridePlacements.push(placement);
        if (placement.queueTiles) queueAreas.push(...placement.queueTiles);
        roadIdx = (roadIdx + Math.floor(roadTiles.length / sorted.length)) % roadTiles.length;
      } else {
        roadIdx = (roadIdx + 10) % roadTiles.length;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 4 — BFS connect, decorations, fence, path nodes
    // ════════════════════════════════════════════════════════════════════════

    for (const rp of ridePlacements) {
      if (!rp.entryTile) continue;
      if (this._touchesPath(grid, rp.entryTile.col, rp.entryTile.row)) continue;
      this._bfsConnect(grid, rp.entryTile.col, rp.entryTile.row);
    }

    this._placeDecorations(grid, decorations, CX, CY, G);
    this._placePerimeterFence(grid, fenceTiles, G);
    this._buildPathNodes(grid, ridePlacements, pathNodeDefs, pathEdgeDefs, HUBS, CX, G);

    const pathTiles = [];
    for (let r = 0; r < G; r++)
      for (let c = 0; c < G; c++) {
        const t = grid.get(c, r);
        if (t === T.PATH || t === T.ROAD || t === T.QUEUE) pathTiles.push({ col: c, row: r, type: t });
      }

    // Monorail radius in world units (for world.js track rendering)
    const monoRadius = hubOffset * TILE * 1.05;

    return {
      grid, ridePlacements, pathTiles, queueAreas, decorations,
      fenceTiles, pathNodeDefs, pathEdgeDefs,
      gateRow: HUBS.south.row - PLAZA_R_MAIN - 3,
      plazaCenter: HUBS.south,
      hubPositions: HUBS,
      stationRow: FENCE_INSET + 1,
      gridSize: G,
      monoRadius,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ROAD GENERATION
  // ════════════════════════════════════════════════════════════════════════

  _stampCircle(grid, cx, cy, r, type) {
    for (let rr = cy - r; rr <= cy + r; rr++)
      for (let cc = cx - r; cc <= cx + r; cc++)
        if ((cc - cx) ** 2 + (rr - cy) ** 2 <= r * r) grid.set(cc, rr, type);
  }

  _stampCurvedRoad(grid, from, to, G) {
    const dx = to.col - from.col;
    const dy = to.row - from.row;
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len, py = dx / len;
    const wobble1 = (Math.random() - 0.5) * len * 0.3;
    const wobble2 = (Math.random() - 0.5) * len * 0.3;
    const cp1 = { col: from.col + dx * 0.33 + px * wobble1, row: from.row + dy * 0.33 + py * wobble1 };
    const cp2 = { col: from.col + dx * 0.66 + px * wobble2, row: from.row + dy * 0.66 + py * wobble2 };

    const steps = Math.ceil(len * 1.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t, t3 = t2 * t;
      const mt = 1 - t, mt2 = mt * mt, mt3 = mt2 * mt;
      const c = Math.round(mt3 * from.col + 3 * mt2 * t * cp1.col + 3 * mt * t2 * cp2.col + t3 * to.col);
      const r = Math.round(mt3 * from.row + 3 * mt2 * t * cp1.row + 3 * mt * t2 * cp2.row + t3 * to.row);
      grid.stamp(Math.max(FENCE_INSET, c - 1), r, AVE_W, 1, T.PATH);
      grid.stamp(c, Math.max(FENCE_INSET, r - 1), 1, AVE_W, T.PATH);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RIDE PLACEMENT
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Place a ride by picking a road tile, walking perpendicular to find clear space,
   * then stamping a connector path back to the road. This spreads rides across the
   * entire road network instead of clustering in quadrant centers.
   */
  _placeRideAlongRoad(grid, rideType, cat, page, roadTiles, startIdx, maxVisits, G, CX, CY) {
    const { tilesW, tilesD } = cat;
    const SPACING = 2;
    const MARGIN = FENCE_INSET + 2;

    // Try multiple road tiles as anchor points
    for (let attempt = 0; attempt < roadTiles.length; attempt++) {
      const anchor = roadTiles[(startIdx + attempt * 7) % roadTiles.length];

      // Try 4 perpendicular directions from this road tile, at varying distances
      const dirs = [
        { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
        { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
      ];
      // Shuffle directions for variety
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }

      for (const dir of dirs) {
        // Try distances from 4 to 15 tiles away from the road
        for (let dist = 4 + Math.floor(Math.random() * 4); dist <= 15; dist += 2) {
          const rideCol = anchor.col + dir.dc * dist - Math.floor(tilesW / 2);
          const rideRow = anchor.row + dir.dr * dist - Math.floor(tilesD / 2);

          // Bounds check
          if (rideCol < MARGIN || rideCol + tilesW > G - MARGIN) continue;
          if (rideRow < MARGIN || rideRow + tilesD > G - MARGIN) continue;
          if (!grid.isClear(rideCol, rideRow, tilesW, tilesD)) continue;

          // Spacing check — no other RIDE tiles within buffer
          let tooClose = false;
          for (let sr = rideRow - SPACING; sr < rideRow + tilesD + SPACING && !tooClose; sr++)
            for (let sc = rideCol - SPACING; sc < rideCol + tilesW + SPACING && !tooClose; sc++) {
              if (sc >= rideCol && sc < rideCol + tilesW && sr >= rideRow && sr < rideRow + tilesD) continue;
              if (grid.get(sc, sr) === T.RIDE) tooClose = true;
            }
          if (tooClose) continue;

          // Place the ride
          grid.stamp(rideCol, rideRow, tilesW, tilesD, T.RIDE);

          // Entry on the side facing the anchor road tile
          const flipTypes = ['roller_coaster', 'loop_coaster', 'log_flume', 'haunted_house'];
          const flip = flipTypes.includes(rideType);
          const entryCol = rideCol + Math.floor(tilesW / 2);
          let entryRow;
          if (dir.dr < 0) { // ride is north of road
            entryRow = flip ? rideRow - 1 : rideRow + tilesD;
          } else if (dir.dr > 0) { // ride is south of road
            entryRow = flip ? rideRow + tilesD : rideRow - 1;
          } else { // ride is east/west — use nearest row side
            entryRow = rideRow + tilesD; // default south
          }

          const exitCol = Math.min(rideCol + tilesW - 1, entryCol + 2);
          const exitRow = entryRow;

          // Queue tile at entry
          const queueTiles = [];
          if (grid.get(entryCol, entryRow) === T.EMPTY) {
            grid.set(entryCol, entryRow, T.QUEUE);
            queueTiles.push({ col: entryCol, row: entryRow });
          }

          // Stamp a side-path from the ride entry back to the anchor road tile
          this._stampSidePath(grid, entryCol, entryRow, anchor.col, anchor.row, G);

          // Connect exit too
          if (grid.get(exitCol, exitRow) === T.EMPTY) {
            grid.set(exitCol, exitRow, T.PATH);
          }
          this._bfsConnect(grid, exitCol, exitRow);

          const rotation = (dir.dr < 0) ? Math.PI : 0;
          return {
            type: rideType, page,
            topLeftCol: rideCol, topLeftRow: rideRow, tilesW, tilesD, rotation,
            entryTile: { col: entryCol, row: entryRow },
            exitTile: { col: exitCol, row: exitRow },
            queueTiles, queuePath: [...queueTiles].reverse(),
          };
        }
      }
    }
    return null;
  }

  /** Stamp an L-shaped or straight path from (c1,r1) toward (c2,r2) */
  _stampSidePath(grid, c1, r1, c2, r2, G) {
    // Walk in row direction first, then column (L-shape)
    const dr = r2 > r1 ? 1 : -1;
    const dc = c2 > c1 ? 1 : -1;
    let c = c1, r = r1;
    // Vertical leg
    while (r !== r2) {
      r += dr;
      if (grid.get(c, r) === T.EMPTY) grid.set(c, r, T.PATH);
      if (grid.get(c, r) === T.PATH || grid.get(c, r) === T.PLAZA) break; // reached existing path
    }
    // Horizontal leg (if needed)
    while (c !== c2) {
      c += dc;
      if (grid.get(c, r) === T.EMPTY) grid.set(c, r, T.PATH);
      if (grid.get(c, r) === T.PATH || grid.get(c, r) === T.PLAZA) break;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  BFS
  // ════════════════════════════════════════════════════════════════════════

  _touchesPath(grid, col, row) {
    for (const n of grid.neighbors4(col, row)) {
      const t = grid.get(n.col, n.row);
      if (t === T.PATH || t === T.ROAD || t === T.PLAZA) return true;
    }
    return false;
  }

  _bfsConnect(grid, startCol, startRow) {
    const visited = new Set();
    const queue = [{ col: startCol, row: startRow, path: [] }];
    visited.add(`${startCol},${startRow}`);
    while (queue.length > 0) {
      const { col, row, path } = queue.shift();
      for (const n of grid.neighbors4(col, row)) {
        const key = `${n.col},${n.row}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const t = grid.get(n.col, n.row);
        if (t === T.PATH || t === T.ROAD || t === T.PLAZA) {
          for (const p of path) if (grid.get(p.col, p.row) === T.EMPTY) grid.set(p.col, p.row, T.PATH);
          return;
        }
        if (t === T.EMPTY) queue.push({ col: n.col, row: n.row, path: [...path, { col: n.col, row: n.row }] });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DECORATIONS
  // ════════════════════════════════════════════════════════════════════════

  _placeDecorations(grid, decorations, CX, CY, G) {
    // ── Clutter pool: small attractions placed along main arterials ──
    const clutterPool = [
      'stall_burger', 'stall_drinks', 'stall_candy', 'stall_icecream', 'stall_gifts',
      'stall_popcorn', 'stall_souvenirs',
      'mascot', 'mascot',
      'balloon_cart', 'balloon_cart',
      'photo_spot',
      'fountain_small',
      'arcade_cabinet', 'arcade_cabinet',
      'strength_test',
      'face_paint',
      'restroom',
      'first_aid',
      'information_kiosk',
      'stage_performer',
    ];
    let clutterIdx = 0;

    // First pass: place clutter along arterials (PATH tiles with 2+ path neighbors = main roads)
    let bench = 0, lamp = 0;
    const placed = new Set();

    for (let r = FENCE_INSET; r < G - FENCE_INSET; r++)
      for (let c = FENCE_INSET; c < G - FENCE_INSET; c++) {
        if (grid.get(c, r) !== T.EMPTY) continue;
        const pn = grid.pathNeighborCount(c, r);
        if (pn === 0) continue;

        // Clutter from pool — place generously along main roads
        if (pn >= 2 && Math.random() < 0.12 && !placed.has(`${c},${r}`)) {
          grid.set(c, r, T.DECORATION);
          const clutterType = clutterPool[clutterIdx % clutterPool.length];
          const nb = grid.neighbors4(c, r).find(n => grid.get(n.col, n.row) === T.PATH);
          const rot = nb ? Math.atan2(nb.col - c, nb.row - r) : Math.random() * Math.PI * 2;
          decorations.push({ type: clutterType, col: c, row: r, rotation: rot });
          clutterIdx++;
          // Mark nearby tiles to prevent clutter clustering
          for (const n of grid.neighbors4(c, r)) placed.add(`${n.col},${n.row}`);
          continue;
        }

        // Benches along quieter paths
        if (pn === 1 && bench % 4 === 0 && Math.random() < 0.3) {
          grid.set(c, r, T.DECORATION);
          const nb = grid.neighbors4(c, r).find(n => { const t = grid.get(n.col, n.row); return t === T.PATH || t === T.ROAD; });
          decorations.push({ type: 'bench', col: c, row: r, rotation: nb ? Math.atan2(nb.col - c, nb.row - r) : 0 });
          bench++; continue;
        }

        // Lamp posts
        if (pn === 1 && lamp % 3 === 0 && Math.random() < 0.2) {
          grid.set(c, r, T.DECORATION);
          decorations.push({ type: 'lamp', col: c, row: r, rotation: 0 });
          lamp++; continue;
        }

        // Trash cans
        if (pn === 1 && Math.random() < 0.05) {
          grid.set(c, r, T.DECORATION);
          decorations.push({ type: 'trash', col: c, row: r, rotation: 0 });
        }

        // Flower beds near plazas
        const dx = c - CX, dz = r - CY;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 12 && pn >= 1 && Math.random() < 0.1) {
          grid.set(c, r, T.DECORATION);
          decorations.push({ type: 'flower', col: c, row: r, rotation: 0 });
        }
      }

    // Trees in empty space
    for (let r = FENCE_INSET; r < G - FENCE_INSET; r++)
      for (let c = FENCE_INSET; c < G - FENCE_INSET; c++) {
        if (grid.get(c, r) !== T.EMPTY) continue;
        const dx = c - CX, dz = r - CY;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 10) continue;
        if (Math.random() < 0.02 + (dist / (G * 0.5)) * 0.06) {
          grid.set(c, r, T.DECORATION);
          decorations.push({ type: 'tree', col: c, row: r, rotation: Math.random() * Math.PI * 2 });
        }
      }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FENCE
  // ════════════════════════════════════════════════════════════════════════

  _placePerimeterFence(grid, fenceTiles, G) {
    const min = FENCE_INSET, max = G - FENCE_INSET - 1;
    const gateMin = Math.floor(G / 2) - 1, gateMax = Math.floor(G / 2) + 1;
    for (let c = min; c <= max; c++) {
      const isGateGap = c >= gateMin && c <= gateMax;
      if (!isGateGap && grid.get(c, min) === T.EMPTY) fenceTiles.push({ col: c, row: min, side: 'south' });
      if (grid.get(c, max) === T.EMPTY) fenceTiles.push({ col: c, row: max, side: 'north' });
    }
    for (let r = min; r <= max; r++) {
      if (grid.get(min, r) === T.EMPTY) fenceTiles.push({ col: min, row: r, side: 'west' });
      if (grid.get(max, r) === T.EMPTY) fenceTiles.push({ col: max, row: r, side: 'east' });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PATH GRAPH
  // ════════════════════════════════════════════════════════════════════════

  _buildPathNodes(grid, ridePlacements, nodeDefs, edgeDefs, HUBS, CX, G) {
    nodeDefs.push({ id: 'hub_south', col: HUBS.south.col, row: HUBS.south.row });
    nodeDefs.push({ id: 'hub_east',  col: HUBS.east.col,  row: HUBS.east.row });
    nodeDefs.push({ id: 'hub_north', col: HUBS.north.col, row: HUBS.north.row });
    nodeDefs.push({ id: 'hub_west',  col: HUBS.west.col,  row: HUBS.west.row });
    nodeDefs.push({ id: 'hub', col: HUBS.south.col, row: HUBS.south.row });
    nodeDefs.push({ id: 'spawn', col: CX, row: HUBS.south.row - PLAZA_R_MAIN - 1 });
    nodeDefs.push({ id: 'station', col: CX, row: FENCE_INSET + 1 });
    nodeDefs.push({ id: 'exit', col: CX, row: FENCE_INSET + 1 });

    edgeDefs.push({ from: 'spawn', to: 'hub_south' });
    edgeDefs.push({ from: 'spawn', to: 'station' });
    // Monorail shortcut edges
    edgeDefs.push({ from: 'hub_south', to: 'hub_east' });
    edgeDefs.push({ from: 'hub_east', to: 'hub_north' });
    edgeDefs.push({ from: 'hub_north', to: 'hub_west' });
    edgeDefs.push({ from: 'hub_west', to: 'hub_south' });
    edgeDefs.push({ from: 'hub_south', to: 'hub_north' });
    edgeDefs.push({ from: 'hub_east', to: 'hub_west' });

    for (const rp of ridePlacements) {
      const cc = rp.topLeftCol + Math.floor(rp.tilesW / 2);
      const cr = rp.topLeftRow + Math.floor(rp.tilesD / 2);
      const rideId = `room:${rp.page.x}`;
      const entryId = `ride-entrance:${rp.page.x}`;
      nodeDefs.push({ id: rideId, col: cc, row: cr });
      if (rp.entryTile) {
        nodeDefs.push({ id: entryId, col: rp.entryTile.col, row: rp.entryTile.row });
        edgeDefs.push({ from: entryId, to: rideId });
      }
    }

    let idx = 0;
    const walkable = new Set();
    for (let r = 0; r < G; r++)
      for (let c = 0; c < G; c++) {
        const t = grid.get(c, r);
        if (t === T.PATH || t === T.ROAD || t === T.QUEUE || t === T.PLAZA) walkable.add(`${c},${r}`);
      }

    const nodeAt = new Map();
    for (const nd of nodeDefs) nodeAt.set(`${nd.col},${nd.row}`, nd.id);

    for (let r = 0; r < G; r++)
      for (let c = 0; c < G; c++) {
        const key = `${c},${r}`;
        if (!walkable.has(key) || nodeAt.has(key)) continue;
        const pn = grid.pathNeighborCount(c, r);
        if (pn !== 2 || (c + r) % 4 === 0) {
          const id = `street:${idx++}`;
          nodeDefs.push({ id, col: c, row: r });
          nodeAt.set(key, id);
        }
      }

    for (const nd of nodeDefs) {
      this._connectNode(grid, nd.col, nd.row, nd.id, nodeAt, walkable, edgeDefs);
    }
  }

  _connectNode(grid, sc, sr, sid, nodeAt, walkable, edgeDefs) {
    const visited = new Set();
    const q = [{ col: sc, row: sr, dist: 0 }];
    visited.add(`${sc},${sr}`);
    const connected = new Set();
    while (q.length > 0) {
      const { col, row, dist } = q.shift();
      for (const n of grid.neighbors4(col, row)) {
        const key = `${n.col},${n.row}`;
        if (visited.has(key) || !walkable.has(key)) continue;
        visited.add(key);
        const nid = nodeAt.get(key);
        if (nid && nid !== sid && !connected.has(nid)) {
          connected.add(nid);
          if (sid < nid) edgeDefs.push({ from: sid, to: nid });
          continue;
        }
        if (dist < 6) q.push({ col: n.col, row: n.row, dist: dist + 1 });
      }
    }
  }
}
