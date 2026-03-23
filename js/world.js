import * as THREE from 'three';
import { PathGraph } from './pathfinding.js';

// RCT2 color palette — bright, saturated, toylike
const STONE = 0xc8b898;
const STONE_DARK = 0xa09070;
const WOOD = 0xb07830;
const WOOD_DARK = 0x8b5e20;
const GRASS = 0x48a830;
const DIRT = 0xc8a868;

const ROOM_W = 6;
const ROOM_D = 6;
const CORRIDOR_D = 3;
const WALL_H = 3.5;
const WALL_THICK = 0.3;
const INNER_WALL = 0.15;
const DOOR_W = 2;
const DOOR_H = 2.8;
const STREET_W = 6;
const STREET_GAP = 3;
const STREET_START_Z = -6;

function getHouseFootprint(house) {
  const n = house.pages.length;
  const cols = Math.min(n, 5);
  const hasCorr = n > 1;
  return {
    width: cols * ROOM_W,
    depth: ROOM_D + (hasCorr ? CORRIDOR_D : 0),
  };
}

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function createTextTexture(text, opts = {}) {
  const { fontSize = 20, fontColor = '#1a1a1a', bgColor = '#c6b790', width = 256, height = 64 } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // RCT2-style beveled sign background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  // Raised bevel: light top/left, dark bottom/right
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
  // Text shadow (RCT2 style light shadow)
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText(display, width / 2 + 1, height / 2 + 1);
  ctx.fillStyle = fontColor;
  ctx.fillText(display, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

// --- Data classes ---

export class Room {
  constructor(name, worldPosition, visitorCount, nodeId, bounds) {
    this.name = name;
    this.position = worldPosition;
    this.visitorCount = visitorCount;
    this.nodeId = nodeId; // pathfinding node ID
    this.bounds = bounds; // {minX, maxX, minZ, maxZ} for wander area
    this.characters = [];
  }
}

class House {
  constructor(name, pageEntries) {
    this.name = name;
    this.pages = pageEntries; // [{x: url, y: count}, ...]
    this.rooms = [];
    this.group = new THREE.Group();
    this.doorNodeId = null;
  }
}

// --- Group pages into houses by URL prefix ---

function groupPagesIntoHouses(pages) {
  // Step 1: group by first path segment
  const topGroups = new Map();

  for (const page of pages) {
    const parts = page.x.split('/').filter(Boolean);
    const key = parts.length === 0 ? '/' : '/' + parts[0];
    if (!topGroups.has(key)) topGroups.set(key, []);
    topGroups.get(key).push(page);
  }

  // Step 2: within each top group, check for sub-groups at depth 2 with 2+ pages
  // If found, extract them into their own house
  const houses = [];

  for (const [key, groupPages] of topGroups) {
    if (key === '/') {
      const name = 'Home';
      houses.push(new House(name, groupPages));
      continue;
    }

    const seg1 = key.slice(1);
    const displayName = seg1.charAt(0).toUpperCase() + seg1.slice(1);

    // Find depth-2 sub-groups
    const subGroups = new Map();
    const remainder = [];

    for (const page of groupPages) {
      const parts = page.x.split('/').filter(Boolean);
      if (parts.length >= 3) {
        // Has a depth-2 prefix like /works/play
        const subKey = parts[1];
        if (!subGroups.has(subKey)) subGroups.set(subKey, []);
        subGroups.get(subKey).push(page);
      } else {
        remainder.push(page);
      }
    }

    // Extract sub-groups with 2+ pages into their own houses
    for (const [subKey, subPages] of subGroups) {
      if (subPages.length >= 2) {
        const subName = subKey.replace(/-/g, ' ');
        houses.push(new House(subName.charAt(0).toUpperCase() + subName.slice(1), subPages));
      } else {
        // Single page sub-group stays in parent
        remainder.push(...subPages);
      }
    }

    // Parent house with remaining pages
    if (remainder.length > 0) {
      houses.push(new House(displayName, remainder));
    }
  }

  console.groupCollapsed(`%c[World] Grouped ${pages.length} pages → ${houses.length} houses`, 'color:#ce93d8');
  houses.forEach(h => {
    console.log(`  ${h.name} (${h.pages.length} rooms): [${h.pages.map(p => p.x).join(', ')}]`);
  });
  console.groupEnd();

  return houses;
}

// --- World ---

export class World {
  constructor(scene) {
    this.scene = scene;
    this.rooms = []; // flat list of all rooms
    this.houses = [];
    this.clickableObjects = [];
    this.pathGraph = new PathGraph();
  }

  build(pages) {
    this.createGround();
    this.createSky();

    // Set up core path nodes
    this.pathGraph.addNode('spawn', new THREE.Vector3(0, 0, 8));
    this.pathGraph.addNode('hub', new THREE.Vector3(0, 0, 0));
    this.pathGraph.addNode('exit', new THREE.Vector3(0, 0, 40));
    this.pathGraph.addEdge('spawn', 'hub');
    this.pathGraph.addEdge('spawn', 'exit');

    this.houses = groupPagesIntoHouses(pages);
    this.layoutHouses();
    this.createDecorations();

    console.log(`%c[World] Build complete: ${this.rooms.length} rooms, ${this.houses.length} houses`, 'color:#ce93d8');
    this.pathGraph.dump();

    return this.rooms;
  }

  findRoom(pageName) {
    return this.rooms.find(r => r.name === pageName);
  }

  layoutHouses() {
    const count = this.houses.length;
    if (count === 0) return;

    // Sort: larger houses first, then by traffic
    this.houses.sort((a, b) => {
      const sizeA = Math.min(a.pages.length, 5);
      const sizeB = Math.min(b.pages.length, 5);
      if (sizeB !== sizeA) return sizeB - sizeA;
      const trafficA = a.pages.reduce((s, p) => s + p.y, 0);
      const trafficB = b.pages.reduce((s, p) => s + p.y, 0);
      return trafficB - trafficA;
    });

    // Place houses on alternating sides of a central street
    let leftZ = STREET_START_Z;
    let rightZ = STREET_START_Z;

    this.houses.forEach((house) => {
      const { width, depth } = getHouseFootprint(house);
      const halfW = width / 2;
      const halfD = depth / 2;

      // Pick the side with less Z extent (greedy balance)
      const useLeft = leftZ >= rightZ;
      const xSign = useLeft ? -1 : 1;
      const x = xSign * (STREET_W / 2 + halfW + 1); // +1 for breathing room
      const cursorZ = useLeft ? leftZ : rightZ;
      const z = cursorZ - halfD;

      house.group.position.set(x, 0, z);
      this.buildHouse(house);
      this.scene.add(house.group);

      // Draw side-branch path from street to door (extends past threshold into building)
      const doorZ = z + halfD + 0.8;
      const pastDoor = x + (useLeft ? -1.5 : 1.5); // extend slightly past the door
      this._drawPathSegment(new THREE.Vector3(0, 0, doorZ), new THREE.Vector3(pastDoor, 0, doorZ));

      // Wider dirt patch at the doorway entrance
      const doorPatch = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_W + 1, 0.06, 2.5),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(DIRT).offsetHSL(0, 0, -0.03) })
      );
      doorPatch.position.set(x, 0.09, doorZ);
      doorPatch.receiveShadow = true;
      this.scene.add(doorPatch);

      // Advance cursor
      if (useLeft) {
        leftZ = z - halfD - STREET_GAP;
      } else {
        rightZ = z - halfD - STREET_GAP;
      }
    });

    // Build main street spine + path graph nodes
    const streetEndZ = Math.min(leftZ, rightZ) - 2;
    this.streetExtentZ = streetEndZ;
    this._createMainStreet(STREET_START_Z + 4, streetEndZ);

    // Add street spine nodes to path graph
    const streetNodes = ['hub'];
    let nodeZ = STREET_START_Z;
    while (nodeZ > streetEndZ) {
      const nodeId = `street:${Math.round(nodeZ)}`;
      this.pathGraph.addNode(nodeId, new THREE.Vector3(0, 0, nodeZ));
      this.pathGraph.addEdge(streetNodes[streetNodes.length - 1], nodeId);
      streetNodes.push(nodeId);
      nodeZ -= 8;
    }

    // Connect each house door to nearest street spine node
    this.houses.forEach(house => {
      const doorPos = this.pathGraph.nodes.get(house.doorNodeId)?.position;
      if (!doorPos) return;

      let bestNode = 'hub';
      let bestDist = Infinity;
      for (const sn of streetNodes) {
        const snPos = this.pathGraph.nodes.get(sn).position;
        const dist = Math.abs(snPos.z - doorPos.z);
        if (dist < bestDist) {
          bestDist = dist;
          bestNode = sn;
        }
      }
      this.pathGraph.addEdge(bestNode, house.doorNodeId);
    });
  }

  buildHouse(house) {
    const n = house.pages.length;
    const cols = Math.min(n, 5);
    const hasCorr = n > 1;
    const totalW = cols * ROOM_W;
    const totalD = ROOM_D + (hasCorr ? CORRIDOR_D : 0);
    const halfW = totalW / 2;
    const halfD = totalD / 2;
    const g = house.group;
    const housePos = house.group.position;

    const stoneMat = mat(STONE);
    const stoneDkMat = mat(STONE_DARK);
    const floorMat = mat(0x9e8b6e);

    // Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(totalW, 0.15, totalD), floorMat);
    floor.position.y = 0.075;
    floor.receiveShadow = true;
    g.add(floor);

    // Back wall
    this._addWall(g, totalW, WALL_H, WALL_THICK, 0, WALL_H / 2, -halfD + WALL_THICK / 2, stoneMat);

    // Left wall
    this._addWall(g, WALL_THICK, WALL_H, totalD, -halfW + WALL_THICK / 2, WALL_H / 2, 0, stoneMat);

    // Right wall
    this._addWall(g, WALL_THICK, WALL_H, totalD, halfW - WALL_THICK / 2, WALL_H / 2, 0, stoneMat);

    // Front wall with main door (centered)
    const frontZ = halfD - WALL_THICK / 2;
    const sideW = (totalW - DOOR_W) / 2;
    if (sideW > 0.01) {
      this._addWall(g, sideW, WALL_H, WALL_THICK, -halfW + sideW / 2, WALL_H / 2, frontZ, stoneMat);
      this._addWall(g, sideW, WALL_H, WALL_THICK, halfW - sideW / 2, WALL_H / 2, frontZ, stoneMat);
    }
    // Above door
    this._addWall(g, DOOR_W, WALL_H - DOOR_H, WALL_THICK, 0, DOOR_H + (WALL_H - DOOR_H) / 2, frontZ, stoneMat);
    // Door frame
    this._addWall(g, 0.12, DOOR_H, WALL_THICK + 0.05, -DOOR_W / 2, DOOR_H / 2, frontZ, stoneDkMat);
    this._addWall(g, 0.12, DOOR_H, WALL_THICK + 0.05, DOOR_W / 2, DOOR_H / 2, frontZ, stoneDkMat);
    this._addWall(g, DOOR_W + 0.24, 0.12, WALL_THICK + 0.05, 0, DOOR_H, frontZ, stoneDkMat);

    // House name sign above door
    const signTex = createTextTexture(house.name, { fontSize: 22, width: 256, height: 48 });
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.5),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true })
    );
    signMesh.position.set(0, DOOR_H + 0.5, frontZ + 0.2);
    g.add(signMesh);

    // Door path node (just outside the door) — connected to street in layoutHouses()
    const doorWorldPos = new THREE.Vector3(housePos.x, 0, housePos.z + halfD + 0.8);
    house.doorNodeId = `door:${house.name}`;
    this.pathGraph.addNode(house.doorNodeId, doorWorldPos);

    // Inside-door node (just inside the door)
    const insideDoorId = `inside:${house.name}`;
    const insideDoorPos = new THREE.Vector3(housePos.x, 0, housePos.z + halfD - 1);
    this.pathGraph.addNode(insideDoorId, insideDoorPos);
    this.pathGraph.addEdge(house.doorNodeId, insideDoorId);

    if (hasCorr) {
      // --- Multi-room house with corridor ---
      const corrZ = halfD - CORRIDOR_D / 2; // corridor center Z (local)
      const roomAreaZ = halfD - CORRIDOR_D; // where corridor meets rooms (local)

      // Corridor-room divider wall (with door openings per room)
      for (let i = 0; i < cols; i++) {
        const cx = -halfW + i * ROOM_W + ROOM_W / 2;
        const segW = (ROOM_W - DOOR_W) / 2;

        // Left segment
        this._addWall(g, segW, WALL_H, INNER_WALL,
          cx - ROOM_W / 2 + segW / 2, WALL_H / 2, roomAreaZ, stoneMat);
        // Right segment
        this._addWall(g, segW, WALL_H, INNER_WALL,
          cx + ROOM_W / 2 - segW / 2, WALL_H / 2, roomAreaZ, stoneMat);
        // Above door
        this._addWall(g, DOOR_W, WALL_H - DOOR_H, INNER_WALL,
          cx, DOOR_H + (WALL_H - DOOR_H) / 2, roomAreaZ, stoneMat);
      }

      // Vertical divider walls between rooms (from corridor-room wall to back wall)
      for (let i = 1; i < cols; i++) {
        const divX = -halfW + i * ROOM_W;
        const divLen = ROOM_D;
        const divZ = -halfD + divLen / 2;
        this._addWall(g, INNER_WALL, WALL_H, divLen, divX, WALL_H / 2, divZ, stoneMat);
      }

      // Corridor path nodes (one per room column)
      const corrNodes = [];
      for (let i = 0; i < cols; i++) {
        const cx = -halfW + i * ROOM_W + ROOM_W / 2;
        const nodeId = `corr:${house.name}:${i}`;
        const worldPos = new THREE.Vector3(housePos.x + cx, 0, housePos.z + corrZ);
        this.pathGraph.addNode(nodeId, worldPos);
        corrNodes.push(nodeId);

        // Connect adjacent corridor nodes
        if (i > 0) {
          this.pathGraph.addEdge(corrNodes[i - 1], nodeId);
        }
      }

      // Connect inside-door to nearest corridor node (middle column)
      const midCol = Math.floor(cols / 2);
      this.pathGraph.addEdge(insideDoorId, corrNodes[midCol]);
      // Also connect to col 0 and last if different, for wider houses
      if (midCol !== 0) this.pathGraph.addEdge(insideDoorId, corrNodes[0]);
      if (midCol !== cols - 1) this.pathGraph.addEdge(insideDoorId, corrNodes[cols - 1]);

      // Create rooms
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const cx = -halfW + col * ROOM_W + ROOM_W / 2;
        const roomCenterZ = -halfD + ROOM_D / 2;

        const roomNodeId = `room:${house.pages[i].x}`;
        const worldPos = new THREE.Vector3(housePos.x + cx, 0, housePos.z + roomCenterZ);
        this.pathGraph.addNode(roomNodeId, worldPos);
        this.pathGraph.addEdge(corrNodes[col], roomNodeId);

        const bounds = {
          minX: housePos.x + cx - ROOM_W / 2 + 0.5,
          maxX: housePos.x + cx + ROOM_W / 2 - 0.5,
          minZ: housePos.z - halfD + 0.5,
          maxZ: housePos.z + roomAreaZ - 0.5,
        };

        const room = new Room(house.pages[i].x, worldPos, house.pages[i].y, roomNodeId, bounds);
        house.rooms.push(room);
        this.rooms.push(room);

        // Room label on back wall
        const labelTex = createTextTexture(this._shortName(house.pages[i].x), {
          fontSize: 14, width: 192, height: 32, fontColor: '#2e7d32',
        });
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(1.8, 0.35),
          new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
        );
        label.position.set(cx, WALL_H - 0.5, -halfD + WALL_THICK + 0.05);
        g.add(label);

        // Visitor count
        const countTex = createTextTexture(`${house.pages[i].y} visits`, {
          fontSize: 12, fontColor: '#1a1a1a', width: 128, height: 24,
        });
        const countLabel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.25),
          new THREE.MeshBasicMaterial({ map: countTex, transparent: true })
        );
        countLabel.position.set(cx, WALL_H - 1, -halfD + WALL_THICK + 0.05);
        g.add(countLabel);

        // Room light
        const light = new THREE.PointLight(0xfff0c0, 0.5, 8);
        light.position.set(cx, 2.5, roomCenterZ);
        g.add(light);
      }
    } else {
      // --- Single-room house ---
      const roomNodeId = `room:${house.pages[0].x}`;
      const worldPos = new THREE.Vector3(housePos.x, 0, housePos.z);
      this.pathGraph.addNode(roomNodeId, worldPos);
      this.pathGraph.addEdge(insideDoorId, roomNodeId);

      const bounds = {
        minX: housePos.x - halfW + 0.5,
        maxX: housePos.x + halfW - 0.5,
        minZ: housePos.z - halfD + 0.5,
        maxZ: housePos.z + halfD - 1,
      };

      const room = new Room(house.pages[0].x, worldPos, house.pages[0].y, roomNodeId, bounds);
      house.rooms.push(room);
      this.rooms.push(room);

      // Room label
      const labelTex = createTextTexture(this._shortName(house.pages[0].x), {
        fontSize: 14, width: 192, height: 32, fontColor: '#2e7d32',
      });
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.35),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
      );
      label.position.set(0, WALL_H - 0.5, -halfD + WALL_THICK + 0.05);
      g.add(label);

      // Count
      const countTex = createTextTexture(`${house.pages[0].y} visits`, {
        fontSize: 12, fontColor: '#1a1a1a', width: 128, height: 24,
      });
      const countLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.25),
        new THREE.MeshBasicMaterial({ map: countTex, transparent: true })
      );
      countLabel.position.set(0, WALL_H - 1, -halfD + WALL_THICK + 0.05);
      g.add(countLabel);

      // Light
      const light = new THREE.PointLight(0xfff0c0, 0.5, 8);
      light.position.set(0, 2.5, 0);
      g.add(light);

      // Window on left wall
      const winMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0x4080c0, transparent: true, opacity: 0.6 })
      );
      winMesh.position.set(-halfW + 0.01, WALL_H / 2 + 0.5, 0);
      winMesh.rotation.y = Math.PI / 2;
      g.add(winMesh);
    }

    // Make all meshes clickable
    g.traverse((child) => {
      if (child.isMesh) {
        this.clickableObjects.push(child);
      }
    });
  }

  _addWall(group, w, h, d, x, y, z, material) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    group.add(wall);
    return wall;
  }

  _shortName(url) {
    if (url === '/') return 'Home';
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  }

  createGround() {
    // RCT2-style flat, bright green ground (low subdivisions for chunky look)
    const groundGeo = new THREE.PlaneGeometry(200, 200, 10, 10);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, pos.getZ(i) + (Math.random() - 0.5) * 0.08);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshLambertMaterial({
      color: GRASS,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Central dirt plaza (square for RCT2 feel)
    const dirtGeo = new THREE.PlaneGeometry(16, 16);
    const dirtMat = new THREE.MeshLambertMaterial({ color: DIRT });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.08;
    this.scene.add(dirt);
  }

  createSky() {
    // No sky sphere or clouds needed — ortho camera uses clear color as sky.
    // RCT2 has no visible sky geometry, just flat color background.
  }

  _drawPathSegment(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const length = dir.length();
    if (length < 0.5) return;
    dir.normalize();

    const segments = Math.ceil(length / 2);
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const pos = new THREE.Vector3().lerpVectors(from, to, t);
      pos.y = 0.1;

      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(1.5 + Math.random() * 0.3, 0.05, 2.2),
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(DIRT).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05),
        })
      );
      seg.position.copy(pos);
      seg.rotation.y = Math.atan2(dir.x, dir.z);
      seg.receiveShadow = true;
      this.scene.add(seg);
    }
  }

  _createMainStreet(startZ, endZ) {
    const length = Math.abs(endZ - startZ);
    const segments = Math.ceil(length / 2);

    for (let i = 0; i <= segments; i++) {
      const z = startZ - (i / segments) * length;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(STREET_W + 1, 0.06, 2.2),
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(DIRT).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04),
        })
      );
      seg.position.set(0, 0.09, z);
      seg.receiveShadow = true;
      this.scene.add(seg);
    }
  }

  createDecorations() {
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 55;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const tooClose = this.houses.some(h => {
        const fp = getHouseFootprint(h);
        return Math.abs(h.group.position.x - x) < (fp.width / 2 + 5) &&
               Math.abs(h.group.position.z - z) < (fp.depth / 2 + 5);
      });
      if (!tooClose) this.createTree(new THREE.Vector3(x, 0, z));
    }

    this.createSpawnMarker();

    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 60;
      this.createRock(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
    }
  }

  createTree(position) {
    const tree = new THREE.Group();
    tree.position.copy(position);

    // RCT2-style chunky tree
    const trunkH = 1.5 + Math.random() * 1.5;
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.6, trunkH, 0.6), mat(0x8b5e20));
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Bright green foliage — very saturated RCT2 style
    const greenBase = Math.random() > 0.5 ? 0x38a028 : 0x2d8818;
    const foliageMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(greenBase).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
      flatShading: true,
    });

    // Round-ish canopy from stacked boxes (RCT2 style)
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

  createSpawnMarker() {
    // RCT2-style entrance marker — bright yellow on dirt
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2, 6),
      new THREE.MeshBasicMaterial({ color: 0xf0d830, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.09;
    this.scene.add(marker);

    const signTex = createTextTexture('PARK ENTRANCE', {
      fontSize: 14, fontColor: '#1a1a1a', bgColor: '#f0d830', width: 192, height: 32,
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 0.4),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthTest: false })
    );
    sign.position.set(0, 3, 0);
    sign.renderOrder = 999;
    sign.userData.billboard = true;
    this.scene.add(sign);
    this.spawnSign = sign;
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

  updateMinimap(minimapCanvas, camera, characters) {
    const ctx = minimapCanvas.getContext('2d');
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const scale = w / 120;

    // RCT2-style minimap: bright green grass
    ctx.fillStyle = '#48a830';
    ctx.fillRect(0, 0, w, h);

    // Main street — sandy brown
    ctx.fillStyle = '#c8a868';
    const streetTopY = h / 2 - (STREET_START_Z + 4) * scale;
    const streetBotY = h / 2 - (this.streetExtentZ || -50) * scale;
    ctx.fillRect(w / 2 - 3, streetTopY, 6, streetBotY - streetTopY);

    // Houses — warm brown rooftops
    this.houses.forEach(house => {
      const rx = w / 2 + house.group.position.x * scale;
      const ry = h / 2 - house.group.position.z * scale;
      const size = 3 + house.rooms.length * 2;
      ctx.fillStyle = '#b07830';
      ctx.fillRect(rx - size / 2, ry - size / 2, size, size);
      ctx.strokeStyle = '#8b5e20';
      ctx.strokeRect(rx - size / 2, ry - size / 2, size, size);
    });

    // Characters — bright white pixels
    characters.forEach(char => {
      const cx = w / 2 + char.group.position.x * scale;
      const cy = h / 2 - char.group.position.z * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    });

    // Camera — red square
    const camX = w / 2 + camera.position.x * scale;
    const camY = h / 2 - camera.position.z * scale;
    ctx.fillStyle = '#e03030';
    ctx.fillRect(camX - 2, camY - 2, 4, 4);

    // Spawn — yellow square
    ctx.fillStyle = '#f0d830';
    ctx.fillRect(w / 2 - 2, h / 2 - 2, 4, 4);
  }
}
