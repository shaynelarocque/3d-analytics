import * as THREE from 'three';
import { PathGraph } from './pathfinding.js';
import { Ride, RIDE_TYPES, RIDE_FOOTPRINTS, RIDE_CATALOG } from './rides.js';
import { ParkLayout, T } from './parkLayout.js';

// ── RCT2 colour palette ──────────────────────────────────────────────────────
const STONE = 0xc8b898;
const STONE_DARK = 0xa09070;
const WOOD = 0xb07830;
const WOOD_DARK = 0x8b5e20;
const GRASS = 0x48a830;
const DIRT = 0xc8a868;
const EARTH = 0x8b6b4a;
const EARTH_DARK = 0x5a3a1a;

const STREET_W = 6;
const STREET_GAP = 3;
const STREET_START_Z = -6;


// ── Noise utility ────────────────────────────────────────────────────────────
function _hash(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
}

function noise2D(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = _hash(ix, iz), b = _hash(ix + 1, iz);
  const c = _hash(ix, iz + 1), d = _hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x, z, octaves = 3) {
  let val = 0, amp = 1, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, z * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / total;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function createTextTexture(text, opts = {}) {
  const { fontSize = 20, fontColor = '#1a1a1a', bgColor = '#c6b790', width = 256, height = 64 } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, height); ctx.lineTo(0, 0); ctx.lineTo(width, 0);
  ctx.stroke();
  ctx.strokeStyle = '#6b5e3e';
  ctx.beginPath();
  ctx.moveTo(width, 0); ctx.lineTo(width, height); ctx.lineTo(0, height);
  ctx.stroke();

  ctx.fillStyle = fontColor;
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let display = text;
  while (ctx.measureText(display).width > width - 20 && display.length > 3) {
    display = display.slice(0, -4) + '...';
  }
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText(display, width / 2 + 1, height / 2 + 1);
  ctx.fillStyle = fontColor;
  ctx.fillText(display, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

// ── Data classes ─────────────────────────────────────────────────────────────

export class Room {
  constructor(name, worldPosition, visitorCount, nodeId, bounds) {
    this.name = name;
    this.position = worldPosition;
    this.visitorCount = visitorCount;
    this.nodeId = nodeId;
    this.bounds = bounds;
    this.characters = [];
    this.ride = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  WORLD
// ══════════════════════════════════════════════════════════════════════════════

export class World {
  constructor(scene, uiScene) {
    this.scene = scene;
    this.uiScene = uiScene || scene;
    this.rooms = [];
    this.rides = [];
    this.clickableObjects = [];
    this.pathGraph = new PathGraph();
    this.siteName = 'THEME PARK';
    this.billboards = [];
    this.balloons = [];
    this.fountain = null;
  }

  build(pages) {
    // Generate tile-based layout first (determines map size)
    const layout = new ParkLayout();
    const plan = layout.generate(pages);
    this.plan = plan;

    // Ground and earth sides scale to grid
    const worldSize = plan.gridSize * 2; // tiles * tile_size
    this.createGround(worldSize);
    this._createEarthSides(worldSize);
    this.createSky();

    // Render everything from the plan
    this._buildPathGraphFromPlan(plan);
    this._placeRidesFromPlan(plan);
    this._renderPaths(plan);
    this._renderQueues(plan);
    this._renderDecorations(plan);
    this._renderPerimeterFence(plan);
    this._renderTrainTrack();
    this._createEntranceGate();
    this._createPlaza();

    console.log(`%c[World] Build complete: ${this.rooms.length} rides, path nodes: ${this.pathGraph.nodes.size}`, 'color:#ce93d8');
    this.pathGraph.dump();

    return this.rooms;
  }

  findRoom(pageName) {
    return this.rooms.find(r => r.name === pageName);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TERRAIN
  // ══════════════════════════════════════════════════════════════════════════

  createGround(worldSize = 200) {
    const SIZE = worldSize + 40; // add margin around the grid
    const SEGS = 50;
    const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
    const pos = groundGeo.attributes.position;

    // Flat terrain — all vertices at h=0
    // Vertex colours for grass variation
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(GRASS);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), wz = -pos.getY(i);
      const c = base.clone();
      c.offsetHSL(0, 0, (fbm(wx * 0.08, wz * 0.08, 2) - 0.5) * 0.1);
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.02);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ── Earth cliff sides ──

  _createEarthSides(worldSize = 200) {
    const HALF = (worldSize + 40) / 2;
    const DEPTH = 4;
    const segW = 5;
    const earthMat = mat(EARTH);
    const earthDkMat = mat(EARTH_DARK);

    // Four edges of the 200x200 ground
    for (let side = 0; side < 4; side++) {
      const count = Math.ceil(HALF * 2 / segW);
      for (let i = 0; i < count; i++) {
        const t = -HALF + i * segW + segW / 2;

        let x, z, w, d;
        if (side === 0) { x = t; z = -HALF; w = segW; d = 0.5; }       // back
        else if (side === 1) { x = t; z = HALF; w = segW; d = 0.5; }    // front
        else if (side === 2) { x = -HALF; z = t; w = 0.5; d = segW; }   // left
        else { x = HALF; z = t; w = 0.5; d = segW; }                     // right

        // Top layer (lighter earth)
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, DEPTH * 0.4, d), earthMat);
        top.position.set(x, -DEPTH * 0.2, z);
        this.scene.add(top);

        // Bottom layer (darker earth)
        const bot = new THREE.Mesh(new THREE.BoxGeometry(w, DEPTH * 0.6, d), earthDkMat);
        bot.position.set(x, -DEPTH * 0.4 - DEPTH * 0.3, z);
        this.scene.add(bot);
      }
    }
  }

  createSky() {
    // Ortho camera uses clear color — no sky geometry needed
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ENTRANCE GATE
  // ══════════════════════════════════════════════════════════════════════════

  _createEntranceGate() {
    // Gate at the south fence line (map edge)
    const gateWorld = this.plan ? this.plan.grid.tileToWorld(Math.floor(this.plan.gridSize / 2), 3) : { x: 0, z: -74 };
    const gateZ = gateWorld.z;
    const stoneMat = mat(STONE);
    const stDkMat = mat(STONE_DARK);
    const woodMat = mat(WOOD);

    // Two stone pillars
    for (const xSign of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.5, 1.2), stoneMat);
      pillar.position.set(xSign * 3.5, 2.25, gateZ);
      pillar.castShadow = true;
      this.scene.add(pillar);

      // Pillar cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), stDkMat);
      cap.position.set(xSign * 3.5, 4.6, gateZ);
      this.scene.add(cap);

      // Lamp on each pillar
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat(0xf0d830));
      lamp.position.set(xSign * 3.5, 5, gateZ);
      this.scene.add(lamp);
    }

    // Arch beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1, 0.8), woodMat);
    beam.position.set(0, 5, gateZ);
    beam.castShadow = true;
    this.scene.add(beam);

    // Arch trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.15, 1), stDkMat);
    trim.position.set(0, 5.55, gateZ);
    this.scene.add(trim);

    // Park name sign (in uiScene for crisp text)
    const name = this.siteName || 'THEME PARK';
    const signTex = createTextTexture(name, {
      fontSize: 32, fontColor: '#1a1a1a', bgColor: '#f0d830', width: 512, height: 80,
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 0.7),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthTest: false })
    );
    sign.position.set(0, 5.9, gateZ + 0.5);
    sign.renderOrder = 999;
    sign.userData.billboard = true;
    this.uiScene.add(sign);
    this.billboards.push(sign);

    // Turnstile posts
    for (const tx of [-1.8, -0.6, 0.6, 1.8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.15), mat(0x808890));
      post.position.set(tx, 0.55, gateZ);
      post.castShadow = true;
      this.scene.add(post);
      // Crossbar
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), mat(0x808890));
      bar.position.set(tx, 0.75, gateZ);
      this.scene.add(bar);
    }

    // Short entry path south of gate to station
    for (let z = gateZ - 8; z <= gateZ - 1; z += 1.5) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.06, 1.8),
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(DIRT).offsetHSL(0, 0, (Math.random() - 0.5) * 0.03),
        })
      );
      seg.position.set(0, 0.09, z);
      seg.receiveShadow = true;
      this.scene.add(seg);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CENTRAL PLAZA WITH FOUNTAIN
  // ══════════════════════════════════════════════════════════════════════════

  _createPlaza() {
    // Circular dirt plaza
    const plazaGeo = new THREE.CircleGeometry(9, 20);
    // Add concentric colour rings
    const plazaColors = new Float32Array(plazaGeo.attributes.position.count * 3);
    for (let i = 0; i < plazaGeo.attributes.position.count; i++) {
      const x = plazaGeo.attributes.position.getX(i);
      const y = plazaGeo.attributes.position.getY(i);
      const r = Math.sqrt(x * x + y * y);
      const ring = Math.floor(r / 1.5) % 2;
      const c = new THREE.Color(DIRT).offsetHSL(0, 0, ring === 0 ? 0 : -0.04);
      plazaColors[i * 3] = c.r;
      plazaColors[i * 3 + 1] = c.g;
      plazaColors[i * 3 + 2] = c.b;
    }
    plazaGeo.setAttribute('color', new THREE.BufferAttribute(plazaColors, 3));

    const plaza = new THREE.Mesh(plazaGeo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    plaza.rotation.x = -Math.PI / 2;
    // Plaza + fountain at dead center (0, 0) — the crossroads hub
    plaza.position.set(0, 0.08, 0);
    this.scene.add(plaza);

    // ── Grand Fountain ──
    const fountainGroup = new THREE.Group();

    // Lower pool — wide octagonal basin
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4, 0.5, 8), mat(STONE));
    pool.position.y = 0.25; pool.castShadow = true; fountainGroup.add(pool);
    const poolWater = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.15, 8),
      new THREE.MeshLambertMaterial({ color: 0x3090d0, transparent: true, opacity: 0.55, flatShading: true })
    );
    poolWater.position.y = 0.55; fountainGroup.add(poolWater);

    // Upper tier — smaller raised basin
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.8, 8), mat(STONE_DARK));
    tier2.position.y = 0.9; tier2.castShadow = true; fountainGroup.add(tier2);
    const tier2Water = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.1, 8),
      new THREE.MeshLambertMaterial({ color: 0x50b0e0, transparent: true, opacity: 0.6, flatShading: true })
    );
    tier2Water.position.y = 1.35; fountainGroup.add(tier2Water);
    this.fountain = { basin: poolWater };

    // Central column
    const fCol = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6), mat(STONE));
    fCol.position.y = 2.1; fCol.castShadow = true; fountainGroup.add(fCol);

    // Crown ornament at top
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.5, 6), mat(0xf0c020));
    crown.position.y = 3.5; fountainGroup.add(crown);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), mat(0xf0c020));
    finial.position.y = 3.9; fountainGroup.add(finial);

    // 4 water spouts shooting outward from the upper tier
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const spoutBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat(STONE_DARK));
      spoutBase.position.set(Math.cos(angle) * 1.2, 1.4, Math.sin(angle) * 1.2);
      fountainGroup.add(spoutBase);
    }

    // Water droplets — more and larger for dramatic effect
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 0.8 + Math.random() * 1.5;
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x80d0f0, transparent: true, opacity: 0.7 })
      );
      drop.position.set(Math.cos(angle) * dist, 1.5 + Math.random() * 1.5, Math.sin(angle) * dist);
      drop.userData.dropBase = drop.position.y;
      drop.userData.dropPhase = Math.random() * Math.PI * 2;
      fountainGroup.add(drop);
    }


    fountainGroup.position.set(0, 0, 0);
    this.scene.add(fountainGroup);

  }

  _createLampPost(x, z, withLight = false) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 0.12), mat(0x404040));
    pole.position.set(x, 1.75, z);
    pole.castShadow = true;
    this.scene.add(pole);

    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat(0xf0d830));
    lantern.position.set(x, 3.6, z);
    this.scene.add(lantern);

    if (withLight) {
      const light = new THREE.PointLight(0xf0d830, 0.3, 10);
      light.position.set(x, 3.6, z);
      this.scene.add(light);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FURNITURE HELPERS (called from tile-plan rendering)
  // ══════════════════════════════════════════════════════════════════════════

  _createBench(x, z, rotY = 0) {
    const bench = new THREE.Group();
    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.5), mat(WOOD));
    seat.position.y = 0.45;
    bench.add(seat);
    // Legs
    for (const lx of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), mat(WOOD_DARK));
      leg.position.set(lx, 0.22, 0);
      bench.add(leg);
    }
    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.08), mat(WOOD));
    back.position.set(0, 0.7, -0.2);
    bench.add(back);

    bench.position.set(x, 0, z);
    bench.rotation.y = rotY;
    this.scene.add(bench);
  }

  _createTrashCan(x, z) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 1.0, 6), mat(0x306030));
    body.position.set(x, 0.5, z);
    body.castShadow = true;
    this.scene.add(body);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 6), mat(0x285028));
    rim.position.set(x, 1.04, z);
    this.scene.add(rim);
  }

  _createInfoBoard(x, z, text) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.15), mat(WOOD));
    post.position.set(x, 1, z);
    post.castShadow = true;
    this.scene.add(post);

    const boardTex = createTextTexture(text, { fontSize: 24, width: 256, height: 48 });
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.5),
      new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, depthTest: false })
    );
    board.position.set(x, 2, z);
    board.renderOrder = 999;
    board.userData.billboard = true;
    this.uiScene.add(board);
    this.billboards.push(board);
  }


  // ══════════════════════════════════════════════════════════════════════════
  //  TILE-PLAN DRIVEN LAYOUT
  // ══════════════════════════════════════════════════════════════════════════

  _buildPathGraphFromPlan(plan) {
    const grid = plan.grid;
    for (const nd of plan.pathNodeDefs) {
      const { x, z } = grid.tileToWorld(nd.col, nd.row);
      this.pathGraph.addNode(nd.id, new THREE.Vector3(x, 0, z));
    }
    for (const edge of plan.pathEdgeDefs) {
      this.pathGraph.addEdge(edge.from, edge.to);
    }
  }

  _placeRidesFromPlan(plan) {
    const grid = plan.grid;

    for (const rp of plan.ridePlacements) {
      const { type: rideType, page, topLeftCol, topLeftRow, tilesW, tilesD, rotation, entryTile, exitTile } = rp;

      // Ride center in world coords
      const centerCol = topLeftCol + tilesW / 2;
      const centerRow = topLeftRow + tilesD / 2;
      const { x, z } = grid.tileToWorld(Math.floor(centerCol), Math.floor(centerRow));

      const ride = new Ride(this.scene, rideType, page.x, page.y);
      ride.group.position.set(x, 0, z);
      ride.group.rotation.y = rotation;
      this.scene.add(ride.group);
      this.rides.push(ride);

      // Entry position (where guests join queue / board)
      const entryWorld = entryTile
        ? grid.tileToWorld(entryTile.col, entryTile.row)
        : { x, z: z + tilesD + 2 };
      ride.entrancePosition.set(entryWorld.x, 0, entryWorld.z);

      // Exit position (where guests leave after riding)
      if (exitTile) {
        const exitWorld = grid.tileToWorld(exitTile.col, exitTile.row);
        ride.exitPosition = new THREE.Vector3(exitWorld.x, 0, exitWorld.z);
      } else {
        ride.exitPosition = ride.entrancePosition.clone();
      }

      // Queue positions (for QueueManager)
      if (rp.queuePath && rp.queuePath.length > 0) {
        ride.queuePositions = rp.queuePath.map(qt => {
          const w = grid.tileToWorld(qt.col, qt.row);
          return new THREE.Vector3(w.x, 0, w.z);
        });
      }

      // Ride node IDs
      const rideNodeId = `room:${page.x}`;
      ride.rideNodeId = rideNodeId;

      // Signs
      const displayName = this._shortName(page.x);
      const signY = this._rideSignHeight(rideType);
      const signTex = createTextTexture(displayName, { fontSize: 36, width: 512, height: 96 });
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 0.8),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthTest: false })
      );
      signMesh.position.set(x, signY, z);
      signMesh.renderOrder = 999;
      signMesh.userData.billboard = true;
      this.uiScene.add(signMesh);

      const countTex = createTextTexture(`${page.y} visits`, { fontSize: 24, fontColor: '#1a1a1a', width: 256, height: 48 });
      const countMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.45),
        new THREE.MeshBasicMaterial({ map: countTex, transparent: true, depthTest: false })
      );
      countMesh.position.set(x, signY - 0.8, z);
      countMesh.renderOrder = 999;
      countMesh.userData.billboard = true;
      this.uiScene.add(countMesh);
      this.billboards.push(signMesh, countMesh);

      // Room + bounds
      const halfW = (tilesW * 2) / 2;
      const halfD = (tilesD * 2) / 2;
      const bounds = {
        minX: x - halfW + 0.5, maxX: x + halfW - 0.5,
        minZ: z - halfD + 0.5, maxZ: z + halfD - 0.5,
      };
      const ridePos = new THREE.Vector3(x, 0, z);
      const room = new Room(page.x, ridePos, page.y, rideNodeId, bounds);
      room.ride = ride;
      this.rooms.push(room);

    }
  }

  _renderPaths(plan) {
    const grid = plan.grid;
    for (const pt of plan.pathTiles) {
      const { x, z } = grid.tileToWorld(pt.col, pt.row);
      const isRoad = pt.type === T.ROAD;

      const color = isRoad ? 0x505050 : DIRT;
      const jitter = 0.15;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(
          1.8 + Math.random() * 0.4,
          isRoad ? 0.07 : 0.06,
          1.8 + Math.random() * 0.4
        ),
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04),
        })
      );
      seg.position.set(
        x + (Math.random() - 0.5) * jitter,
        0.09,
        z + (Math.random() - 0.5) * jitter
      );
      seg.rotation.y = (Math.random() - 0.5) * 0.09; // slight rotation jitter
      seg.receiveShadow = true;
      this.scene.add(seg);

      // Road center line
      if (isRoad && pt.col === 40 && pt.row % 2 === 0) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.02, 1.5),
          new THREE.MeshBasicMaterial({ color: 0xeeee88 })
        );
        line.position.set(x, 0.11, z);
        this.scene.add(line);
      }
    }
  }

  _renderQueues(plan) {
    // Queue areas are just path tiles — no fencing, guests line up naturally
    for (const qt of plan.queueAreas) {
      const { x, z } = plan.grid.tileToWorld(qt.col, qt.row);
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.06, 1.9),
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(DIRT).offsetHSL(0, 0, -0.03),
        })
      );
      seg.position.set(x, 0.09, z);
      seg.receiveShadow = true;
      this.scene.add(seg);
    }
  }

  _renderDecorations(plan) {
    const grid = plan.grid;
    const stallColors = [0xd03020, 0x2060c0, 0xf0c020, 0x30a030, 0xe07020];
    const stallNames = ['Burgers', 'Drinks', 'Candy', 'Ice Cream', 'Gifts'];
    let stallIdx = 0;
    const balloonColors = [0xd03020, 0x2060c0, 0xf0c020, 0x30a030, 0xe060a0, 0xe07020, 0x8040c0];
    let balloonIdx = 0;

    for (const dec of plan.decorations) {
      const { x, z } = grid.tileToWorld(dec.col, dec.row);

      switch (dec.type) {
        case 'bench':
          this._createBench(x, z, dec.rotation);
          break;

        case 'lamp':
          this._createLampPost(x, z, Math.random() < 0.15);
          break;

        case 'trash':
          this._createTrashCan(x, z);
          break;

        case 'flower': {
          const bed = new THREE.Group();
          // Stone border
          const border = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1.8), mat(STONE_DARK));
          border.position.y = 0.12; bed.add(border);
          // Soil fill
          const soil = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), mat(0x6b4a2a));
          soil.position.y = 0.18; bed.add(soil);
          // Flowers with stems
          const fColors = [0xd03020, 0xf0c020, 0xe060a0, 0x40c0c0, 0xff8040, 0x8040c0];
          for (let f = 0; f < 6; f++) {
            const fx = (Math.random() - 0.5) * 1.2;
            const fz = (Math.random() - 0.5) * 1.2;
            // Stem
            const stemH = 0.4 + Math.random() * 0.4;
            const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, stemH, 0.06), mat(0x2d7018));
            stem.position.set(fx, 0.35 + stemH / 2, fz); bed.add(stem);
            // Bloom
            const bloom = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), mat(fColors[f]));
            bloom.position.set(fx, 0.35 + stemH + 0.1, fz);
            bloom.castShadow = true; bed.add(bloom);
          }
          bed.position.set(x, 0, z);
          this.scene.add(bed);
          break;
        }

        case 'stall': // legacy
        case 'stall_burger': case 'stall_drinks': case 'stall_candy':
        case 'stall_icecream': case 'stall_gifts': case 'stall_popcorn':
        case 'stall_souvenirs': {
          const stallNameMap = {
            stall: 'Burgers', stall_burger: 'Burgers', stall_drinks: 'Drinks',
            stall_candy: 'Candy', stall_icecream: 'Ice Cream', stall_gifts: 'Gifts',
            stall_popcorn: 'Popcorn', stall_souvenirs: 'Souvenirs',
          };
          const stall = new THREE.Group();
          const counter = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.5), mat(STONE));
          counter.position.y = 0.6; counter.castShadow = true; stall.add(counter);
          const sTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.7), mat(STONE_DARK));
          sTop.position.y = 1.25; stall.add(sTop);
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 2), mat(stallColors[stallIdx % stallColors.length]));
          canopy.position.set(0, 2.2, -0.3); canopy.rotation.x = 0.15; canopy.castShadow = true; stall.add(canopy);
          for (const px of [-1, 1]) {
            const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), mat(WOOD));
            pole.position.set(px, 1.1, -0.8); pole.castShadow = true; stall.add(pole);
          }
          stall.position.set(x, 0, z); stall.rotation.y = dec.rotation;
          this.scene.add(stall);
          const sName = stallNameMap[dec.type] || 'Shop';
          const sTex = createTextTexture(sName, { fontSize: 28, width: 256, height: 48, bgColor: '#e8dcc0' });
          const sSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.35), new THREE.MeshBasicMaterial({ map: sTex, transparent: true, depthTest: false }));
          sSign.position.set(x, 2.6, z); sSign.renderOrder = 999; sSign.userData.billboard = true;
          this.uiScene.add(sSign); this.billboards.push(sSign);
          stallIdx++;
          break;
        }

        case 'mascot': {
          // Chunky mascot figure (like a costumed character)
          const mascot = new THREE.Group();
          const bodyColor = [0xd03020, 0x2060c0, 0xf0c020, 0x30a030, 0xe060a0][Math.floor(Math.random() * 5)];
          const mBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.0), mat(bodyColor));
          mBody.position.y = 1.2; mBody.castShadow = true; mascot.add(mBody);
          // Big head
          const mHead = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), mat(bodyColor));
          mHead.position.y = 2.7; mHead.castShadow = true; mascot.add(mHead);
          // Eyes
          for (const ex of [-0.3, 0.3]) {
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.15), mat(0xffffff));
            eye.position.set(ex, 2.8, 0.55); mascot.add(eye);
            const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), mat(0x1a1a1a));
            pupil.position.set(ex, 2.75, 0.62); mascot.add(pupil);
          }
          // Smile
          const smile = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), mat(0x1a1a1a));
          smile.position.set(0, 2.4, 0.62); mascot.add(smile);
          mascot.position.set(x, 0, z); mascot.rotation.y = dec.rotation;
          this.scene.add(mascot);
          break;
        }

        case 'balloon_cart': {
          // Cart with bunch of balloons
          const cart = new THREE.Group();
          const cartBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.8), mat(WOOD));
          cartBody.position.y = 0.5; cartBody.castShadow = true; cart.add(cartBody);
          // Wheels
          for (const wz of [-0.35, 0.35]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6), mat(0x1a1a1a));
            w.rotation.z = Math.PI / 2; w.position.set(0.55, 0.2, wz); cart.add(w);
          }
          // Pole
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), mat(0x808080));
          pole.position.set(0, 2.0, 0); cart.add(pole);
          // Balloons
          const bColors = [0xd03020, 0x2060c0, 0xf0c020, 0x30a030, 0xe060a0];
          for (let b = 0; b < 5; b++) {
            const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshLambertMaterial({ color: bColors[b], flatShading: true }));
            balloon.position.set((Math.random() - 0.5) * 0.6, 3.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
            balloon.castShadow = true; cart.add(balloon);
          }
          cart.position.set(x, 0, z); cart.rotation.y = dec.rotation;
          this.scene.add(cart);
          break;
        }

        case 'info_board': {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.15), mat(WOOD));
          post.position.set(x, 1, z); post.castShadow = true; this.scene.add(post);
          const texts = ['Park Map', 'You Are Here', 'Info', 'Rides →', '← Exit'];
          const boardTex = createTextTexture(texts[Math.floor(Math.random() * texts.length)], { fontSize: 24, width: 256, height: 48 });
          const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, depthTest: false }));
          board.position.set(x, 2, z); board.renderOrder = 999; board.userData.billboard = true;
          this.uiScene.add(board); this.billboards.push(board);
          break;
        }

        case 'photo_spot': {
          // Camera-shaped frame
          const frame = new THREE.Group();
          const archL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat(0xf0c020));
          archL.position.set(-1.2, 1.5, 0); frame.add(archL);
          const archR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat(0xf0c020));
          archR.position.set(1.2, 1.5, 0); frame.add(archR);
          const archTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.2), mat(0xf0c020));
          archTop.position.set(0, 3.1, 0); frame.add(archTop);
          const camIcon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.15), mat(0x1a1a1a));
          camIcon.position.set(0, 3.5, 0); frame.add(camIcon);
          frame.position.set(x, 0, z); frame.rotation.y = dec.rotation;
          this.scene.add(frame);
          break;
        }

        case 'fountain_small': {
          const fb = new THREE.Group();
          const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.4, 8), mat(STONE));
          basin.position.y = 0.2; fb.add(basin);
          const waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0x4090d0, transparent: true, opacity: 0.5, flatShading: true }));
          waterDisc.position.y = 0.35; fb.add(waterDisc);
          const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6), mat(STONE_DARK));
          spout.position.y = 0.7; fb.add(spout);
          fb.position.set(x, 0, z);
          this.scene.add(fb);
          break;
        }

        case 'arcade_cabinet': {
          const cab = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.7), mat(0x2040a0));
          body.position.y = 0.9; body.castShadow = true; cab.add(body);
          const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), mat(0x40ff40));
          screen.position.set(0, 1.4, 0.38); cab.add(screen);
          const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.25, 0.1), mat(0xf0c020));
          marquee.position.set(0, 1.85, 0.35); cab.add(marquee);
          cab.position.set(x, 0, z); cab.rotation.y = dec.rotation;
          this.scene.add(cab);
          break;
        }

        case 'strength_test': {
          const st = new THREE.Group();
          const tower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), mat(0xd03020));
          tower.position.y = 2; tower.castShadow = true; st.add(tower);
          const bell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), mat(0xf0c020));
          bell.position.y = 4.1; st.add(bell);
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), mat(WOOD));
          base.position.y = 0.2; st.add(base);
          st.position.set(x, 0, z);
          this.scene.add(st);
          break;
        }

        case 'face_paint': {
          const fp = new THREE.Group();
          const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5), mat(0xe060a0));
          chair.position.y = 0.4; fp.add(chair);
          const easel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.8), mat(WOOD));
          easel.position.set(0.6, 0.8, 0); fp.add(easel);
          const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.6), mat(0xf0f0f0));
          canvas.position.set(0.63, 0.9, 0); fp.add(canvas);
          const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 6), mat(0xd03020));
          umbrella.position.set(0.3, 2.5, 0); fp.add(umbrella);
          const uPole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.06), mat(WOOD));
          uPole.position.set(0.3, 1.2, 0); fp.add(uPole);
          fp.position.set(x, 0, z); fp.rotation.y = dec.rotation;
          this.scene.add(fp);
          break;
        }

        case 'restroom': {
          const rr = new THREE.Group();
          const rrBody = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 2), mat(0xc0a080));
          rrBody.position.y = 1.25; rrBody.castShadow = true; rr.add(rrBody);
          const rrRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.2, 2.3), mat(0x6b5e3e));
          rrRoof.position.y = 2.6; rr.add(rrRoof);
          const rrDoor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.05), mat(0x4080c0));
          rrDoor.position.set(0, 0.8, 1.03); rr.add(rrDoor);
          const rrSign = createTextTexture('Restrooms', { fontSize: 24, width: 256, height: 48, bgColor: '#4080c0', fontColor: '#ffffff' });
          const rrSignMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshBasicMaterial({ map: rrSign, transparent: true, depthTest: false }));
          rrSignMesh.position.set(x, 3, z); rrSignMesh.renderOrder = 999; rrSignMesh.userData.billboard = true;
          this.uiScene.add(rrSignMesh); this.billboards.push(rrSignMesh);
          rr.position.set(x, 0, z); rr.rotation.y = dec.rotation;
          this.scene.add(rr);
          break;
        }

        case 'first_aid': {
          const fa = new THREE.Group();
          // White tent
          const tent = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), mat(0xf0f0f0));
          tent.position.y = 1; tent.castShadow = true; fa.add(tent);
          const tentRoof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1, 4), mat(0xf0f0f0));
          tentRoof.position.y = 2.5; tentRoof.rotation.y = Math.PI / 4; fa.add(tentRoof);
          // Red cross
          const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.05), mat(0xd03020));
          crossH.position.set(0, 1.5, 1.12); fa.add(crossH);
          const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.05), mat(0xd03020));
          crossV.position.set(0, 1.5, 1.12); fa.add(crossV);
          // Open flap
          const flap = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.05), mat(0xe8e8e8));
          flap.position.set(0.7, 0.75, 1.1); flap.rotation.y = 0.4; fa.add(flap);
          fa.position.set(x, 0, z); fa.rotation.y = dec.rotation;
          this.scene.add(fa);
          break;
        }

        case 'information_kiosk': {
          const kiosk = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.5, 6), mat(0xc6b790));
          body.position.y = 1.25; body.castShadow = true; kiosk.add(body);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 6), mat(0x2060c0));
          roof.position.y = 3; kiosk.add(roof);
          // "?" sign
          const qTex = createTextTexture('?', { fontSize: 48, width: 64, height: 64, bgColor: '#2060c0', fontColor: '#ffffff' });
          const qSign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: qTex, transparent: true, depthTest: false }));
          qSign.position.set(x, 3.6, z); qSign.renderOrder = 999; qSign.userData.billboard = true;
          this.uiScene.add(qSign); this.billboards.push(qSign);
          // Map display
          const mapBoard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), mat(0xf0e8c0));
          mapBoard.position.set(0, 1.5, 1.02); kiosk.add(mapBoard);
          kiosk.position.set(x, 0, z); kiosk.rotation.y = dec.rotation;
          this.scene.add(kiosk);
          break;
        }

        case 'stage_performer': {
          const stage = new THREE.Group();
          // Raised platform
          const platform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 2.5), mat(WOOD));
          platform.position.y = 0.25; platform.castShadow = true; stage.add(platform);
          // Performer (simple figure)
          const perfBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.3), mat(0xe060a0));
          perfBody.position.y = 1; perfBody.castShadow = true; stage.add(perfBody);
          const perfHead = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat(0xf5c6a0));
          perfHead.position.y = 1.7; stage.add(perfHead);
          // Mic stand
          const micPole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.04), mat(0x404040));
          micPole.position.set(0.5, 1.15, 0); stage.add(micPole);
          const mic = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), mat(0x1a1a1a));
          mic.position.set(0.5, 1.85, 0); stage.add(mic);
          // Small speaker
          const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), mat(0x1a1a1a));
          speaker.position.set(-1, 0.75, 0); stage.add(speaker);
          stage.position.set(x, 0, z); stage.rotation.y = dec.rotation;
          this.scene.add(stage);
          break;
        }

        case 'tree':
          this.createTree(new THREE.Vector3(x, 0, z));
          break;
      }
    }

    // Balloons near paths
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 25;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist - 10;
      const color = balloonColors[i % balloonColors.length];

      const balloon = new THREE.Group();
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.8, 4), mat(0x808080));
      string.position.y = 0.9;
      balloon.add(string);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 6, 6),
        new THREE.MeshLambertMaterial({ color, flatShading: true })
      );
      sphere.position.y = 2;
      sphere.castShadow = true;
      balloon.add(sphere);

      balloon.position.set(bx, 0, bz);
      balloon.userData.baseY = 2;
      this.scene.add(balloon);
      this.balloons.push(balloon);
    }
  }

  _renderPerimeterFence(plan) {
    const grid = plan.grid;
    for (const ft of plan.fenceTiles) {
      const { x, z } = grid.tileToWorld(ft.col, ft.row);

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), mat(WOOD));
      post.position.set(x, 0.6, z);
      post.castShadow = true;
      this.scene.add(post);

      // Rail orientation depends on side
      const isNS = ft.side === 'north' || ft.side === 'south';
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(isNS ? 2.0 : 0.06, 0.06, isNS ? 0.06 : 2.0),
        mat(WOOD_DARK)
      );
      rail.position.set(x, 0.9, z);
      this.scene.add(rail);
      const rail2 = new THREE.Mesh(
        new THREE.BoxGeometry(isNS ? 2.0 : 0.06, 0.06, isNS ? 0.06 : 2.0),
        mat(WOOD_DARK)
      );
      rail2.position.set(x, 0.5, z);
      this.scene.add(rail2);
    }
  }

  _renderTrainTrack() {
    const railMat = mat(0x808890);
    const pillarMat = mat(0x707880);

    // Elevated monorail — oval loop, radius from layout plan
    const MONO_Y = 4.5;
    const R = this.plan?.monoRadius || 58;
    const trackPts = [
      new THREE.Vector3(0, MONO_Y, -R),             // 0: South station (t=0)
      new THREE.Vector3(R * 0.55, MONO_Y, -R * 0.55),
      new THREE.Vector3(R, MONO_Y, 0),              // 2: East station (t≈0.25)
      new THREE.Vector3(R * 0.55, MONO_Y, R * 0.55),
      new THREE.Vector3(0, MONO_Y, R),              // 4: North station (t≈0.5)
      new THREE.Vector3(-R * 0.55, MONO_Y, R * 0.55),
      new THREE.Vector3(-R, MONO_Y, 0),             // 6: West station (t≈0.75)
      new THREE.Vector3(-R * 0.55, MONO_Y, -R * 0.55),
    ];
    const trackCurve = new THREE.CatmullRomCurve3(trackPts, true, 'catmullrom', 0.4);
    this.trainPath = trackCurve;

    // Render monorail guideway — solid concrete beam with side rails
    const beamMat = mat(0xd0d0d0); // light concrete color
    const numSegs = 300; // more segments = smoother, no gaps
    for (let i = 0; i < numSegs; i++) {
      const t = i / numSegs;
      const pos = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

      // Main guideway beam (wide concrete)
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.5), beamMat);
      beam.position.copy(pos);
      beam.position.y -= 0.1;
      beam.lookAt(pos.clone().add(tangent));
      this.scene.add(beam);

      // Side guide rails (darker, thinner)
      for (const side of [-0.8, 0.8]) {
        const guideRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 2.5), railMat);
        guideRail.position.copy(pos).add(right.clone().multiplyScalar(side));
        guideRail.position.y += 0.15;
        guideRail.lookAt(guideRail.position.clone().add(tangent));
        this.scene.add(guideRail);
      }

      // Support pillar every 8 segments — T-shaped column
      if (i % 8 === 0) {
        // Vertical column
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, MONO_Y - 0.5, 0.6), pillarMat);
        col.position.set(pos.x, (MONO_Y - 0.5) / 2, pos.z);
        col.castShadow = true;
        this.scene.add(col);
        // T-cap (wider at top to support beam)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.2), pillarMat);
        cap.position.set(pos.x, MONO_Y - 0.6, pos.z);
        cap.lookAt(cap.position.clone().add(tangent));
        this.scene.add(cap);
      }
    }

    // 4 stations
    const stationNames = ['South', 'East', 'North', 'West'];
    const stationTs = [0, 0.25, 0.5, 0.75];
    // Inward direction for stairs (toward park center)
    const stationInward = [
      new THREE.Vector3(0, 0, 1),   // south → stairs go north (+Z)
      new THREE.Vector3(-1, 0, 0),  // east → stairs go west (-X)
      new THREE.Vector3(0, 0, -1),  // north → stairs go south (-Z)
      new THREE.Vector3(1, 0, 0),   // west → stairs go east (+X)
    ];

    for (let s = 0; s < 4; s++) {
      const sPos = trackCurve.getPointAt(stationTs[s]);

      // Platform — rotated 90° for E/W stations
      const isEW = s === 1 || s === 3;
      const platW = isEW ? 5 : 8, platD = isEW ? 8 : 5;
      const platform = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.35, platD), mat(0x9e8b6e));
      platform.position.set(sPos.x, MONO_Y - 0.2, sPos.z);
      platform.receiveShadow = true;
      this.scene.add(platform);

      // Shelter roof
      const shW = isEW ? 4 : 7, shD = isEW ? 7 : 4;
      const shelter = new THREE.Mesh(new THREE.BoxGeometry(shW, 0.15, shD), mat(0xd03020));
      shelter.position.set(sPos.x, MONO_Y + 2.5, sPos.z);
      shelter.castShadow = true;
      this.scene.add(shelter);

      // Shelter posts
      const posts = isEW
        ? [[-1.5, -3], [-1.5, 3], [1.5, -3], [1.5, 3]]
        : [[-3, -1.5], [3, -1.5], [-3, 1.5], [3, 1.5]];
      for (const [dx, dz] of posts) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.15), mat(0x808890));
        post.position.set(sPos.x + dx, MONO_Y + 1.2, sPos.z + dz);
        this.scene.add(post);
      }

      // Staircase as a rotated group — build along +Z then rotate to face inward
      const inward = stationInward[s];
      const stairGroup = new THREE.Group();
      const NUM_STEPS = 10;
      const stepW = 1.8, stepD = 0.7, stepH = 0.15;
      const stairSpacing = 0.8;

      for (let step = 0; step < NUM_STEPS; step++) {
        const t = step / (NUM_STEPS - 1);
        const stepY = MONO_Y - 0.3 - t * (MONO_Y - 0.3);
        const sz = 2.5 + step * stairSpacing;
        const tread = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, stepD), mat(0xc0b090));
        tread.position.set(0, Math.max(0.1, stepY), sz);
        tread.receiveShadow = true;
        stairGroup.add(tread);
      }

      // Railings on both sides
      for (const side of [-1, 1]) {
        const rx = side * (stepW / 2 + 0.06);
        // Top post (at platform)
        const postTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, MONO_Y + 0.5, 0.1), mat(0x808890));
        postTop.position.set(rx, MONO_Y / 2, 2.5);
        stairGroup.add(postTop);
        // Bottom post (at ground)
        const endZ = 2.5 + (NUM_STEPS - 1) * stairSpacing;
        const postBot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat(0x808890));
        postBot.position.set(rx, 0.6, endZ);
        stairGroup.add(postBot);
        // Diagonal handrail
        const railLen = Math.sqrt((NUM_STEPS * stairSpacing) ** 2 + MONO_Y ** 2);
        const railAngle = Math.atan2(MONO_Y, NUM_STEPS * stairSpacing);
        const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, railLen), mat(0x808890));
        handrail.position.set(rx, MONO_Y / 2 + 0.4, 2.5 + (NUM_STEPS / 2) * stairSpacing);
        handrail.rotation.x = railAngle;
        stairGroup.add(handrail);
      }

      // Position at station and rotate to face inward direction
      stairGroup.position.set(sPos.x, 0, sPos.z);
      stairGroup.rotation.y = Math.atan2(inward.x, inward.z);
      this.scene.add(stairGroup);

      // Station name sign
      const signTex = createTextTexture(stationNames[s] + ' Station', { fontSize: 28, width: 256, height: 48 });
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 0.5),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthTest: false })
      );
      sign.position.set(sPos.x, MONO_Y + 3.2, sPos.z);
      sign.renderOrder = 999;
      sign.userData.billboard = true;
      this.uiScene.add(sign);
      this.billboards.push(sign);
    }
  }

  createTree(position) {
    const tree = new THREE.Group();
    tree.position.copy(position);
    const trunkH = 1.5 + Math.random() * 1.5;
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.6, trunkH, 0.6), mat(0x8b5e20));
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    const greenBase = Math.random() > 0.5 ? 0x38a028 : 0x2d8818;
    const foliageMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(greenBase).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
      flatShading: true,
    });
    const layers = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < layers; i++) {
      const size = 2.8 - i * 0.6 + Math.random() * 0.4;
      const foliage = new THREE.Mesh(new THREE.BoxGeometry(size, 1.2, size), foliageMat);
      foliage.position.y = trunkH + i * 1.0;
      foliage.castShadow = true;
      tree.add(foliage);
    }
    this.scene.add(tree);
  }

  createRock(position) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(0x808080).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15),
        flatShading: true,
      })
    );
    rock.position.copy(position);
    rock.position.y = 0.2;
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1, 0.6 + Math.random() * 0.4, 1);
    rock.castShadow = true;
    this.scene.add(rock);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ANIMATION
  // ══════════════════════════════════════════════════════════════════════════

  updateDecorations(delta) {
    const t = performance.now() * 0.001;

    // Balloon bobbing
    for (let i = 0; i < this.balloons.length; i++) {
      const b = this.balloons[i];
      const sphere = b.children[1];
      if (sphere) sphere.position.y = b.userData.baseY + Math.sin(t * 1.5 + i * 1.3) * 0.15;
    }

    // Fountain water
    if (this.fountain) {
      this.fountain.basin.position.y = 0.72 + Math.sin(t * 2) * 0.02;
      // Animate droplets
      this.fountain.basin.parent?.children.forEach(child => {
        if (child.userData.dropBase != null) {
          const phase = child.userData.dropPhase;
          const cycle = (t * 1.5 + phase) % 2;
          child.position.y = child.userData.dropBase + Math.sin(cycle * Math.PI) * 0.8;
          child.material.opacity = cycle < 1.5 ? 0.7 : 0.2;
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _rideSignHeight(type) {
    const heights = {
      ferris_wheel: 14, roller_coaster: 7, carousel: 7, swing_ride: 8,
      spinning_cups: 4, drop_tower: 16, loop_coaster: 9, log_flume: 6,
      pirate_ship: 9, bumper_cars: 5, haunted_house: 9, go_karts: 3,
      observation_tower: 15, mini_railway: 3, merry_go_round: 6,
      top_spin: 10, river_rapids: 4, wild_mouse: 6, enterprise: 12,
      ghost_train: 7,
    };
    return heights[type] || 6;
  }

  _shortName(url) {
    if (url === '/') return 'Home';
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MINIMAP
  // ══════════════════════════════════════════════════════════════════════════

  updateMinimap(minimapCanvas, camera, characters) {
    const ctx = minimapCanvas.getContext('2d');
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const scale = w / 120;

    // Grass background
    ctx.fillStyle = '#48a830';
    ctx.fillRect(0, 0, w, h);

    // Plaza (positioned from plan)
    if (this.plan) {
      const pc = this.plan.grid.tileToWorld(this.plan.plazaCenter.col, this.plan.plazaCenter.row);
      ctx.fillStyle = '#c8a868';
      ctx.beginPath();
      ctx.arc(w / 2 + pc.x * scale, h / 2 - pc.z * scale, 8 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Paths and roads from tile grid
    if (this.plan) {
      for (const pt of this.plan.pathTiles) {
        const tw = this.plan.grid.tileToWorld(pt.col, pt.row);
        const px = w / 2 + tw.x * scale;
        const py = h / 2 - tw.z * scale;
        ctx.fillStyle = pt.type === T.ROAD ? '#505050' : '#c8a868';
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    // Rides
    const rideColors = {
      ferris_wheel: '#d03020', roller_coaster: '#2060c0', carousel: '#f0c020',
      swing_ride: '#e07020', spinning_cups: '#e060a0', drop_tower: '#808890',
      loop_coaster: '#8040c0', log_flume: '#3080c0', pirate_ship: '#6b3020',
      bumper_cars: '#20b0b0', haunted_house: '#302030', go_karts: '#30a030',
      observation_tower: '#40a0a0',
    };

    this.rides.forEach(ride => {
      const rx = w / 2 + ride.group.position.x * scale;
      const ry = h / 2 - ride.group.position.z * scale;
      const fp = RIDE_FOOTPRINTS[ride.type];
      const sw = Math.max(4, fp.width * scale * 0.4);
      const sh = Math.max(4, fp.depth * scale * 0.4);
      ctx.fillStyle = rideColors[ride.type] || '#b07830';
      ctx.fillRect(rx - sw / 2, ry - sh / 2, sw, sh);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rx - sw / 2, ry - sh / 2, sw, sh);
    });

    // Characters
    characters.forEach(char => {
      if (char.isRiding) return;
      const cx = w / 2 + char.group.position.x * scale;
      const cy = h / 2 - char.group.position.z * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    });

    // Camera
    ctx.fillStyle = '#e03030';
    ctx.fillRect(w / 2 + camera.position.x * scale - 2, h / 2 - camera.position.z * scale - 2, 4, 4);

    // Entrance marker at gate position
    ctx.fillStyle = '#f0d830';
    ctx.fillRect(w / 2 - 2, h / 2 + 68 * scale - 1, 4, 3);
  }
}
