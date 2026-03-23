import * as THREE from 'three';
import { PathGraph } from './pathfinding.js';
import { Ride, RIDE_TYPES, RIDE_FOOTPRINTS } from './rides.js';

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

const POND_X = 28, POND_Z = 12, POND_R = 6;

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
    this.pondWater = null;
    this.fountain = null;
  }

  build(pages) {
    this.createGround();
    this._createEarthSides();
    this.createSky();

    // Core path nodes
    this.pathGraph.addNode('spawn', new THREE.Vector3(0, 0, 8));
    this.pathGraph.addNode('hub', new THREE.Vector3(0, 0, 0));
    this.pathGraph.addNode('exit', new THREE.Vector3(0, 0, 40));
    this.pathGraph.addEdge('spawn', 'hub');
    this.pathGraph.addEdge('spawn', 'exit');

    this.layoutRides(pages);
    this.createParkingLot();
    this._createEntranceGate();
    this._createPlaza();
    this._createParkFurniture();
    this.createDecorations();

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

  createGround() {
    const SIZE = 200;
    const SEGS = 50;
    const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
    const pos = groundGeo.attributes.position;

    // Height map: flat center, rolling hills at perimeter, pond depression
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i);
      const gy = pos.getY(i);
      const wx = gx, wz = -gy; // world coords after -PI/2 rotation
      const dist = Math.sqrt(wx * wx + wz * wz);

      let h = 0;
      // Hills at perimeter (keep center flat for rides)
      if (dist > 35) {
        const blend = Math.min(1, (dist - 35) / 40);
        h = (fbm(wx * 0.025, wz * 0.025) - 0.4) * 3 * blend;
        h = Math.max(h, 0); // no negative hills in outer area
      }

      // Pond depression
      const pd = Math.sqrt((wx - POND_X) ** 2 + (wz - POND_Z) ** 2);
      if (pd < POND_R + 2) {
        const pondBlend = Math.max(0, 1 - pd / (POND_R + 2));
        const dip = -0.7 * pondBlend * pondBlend;
        h = Math.min(h + dip, dip);
      }

      pos.setZ(i, h);
    }

    // Vertex colours for grass variation
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(GRASS);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), wz = -pos.getY(i);
      const c = base.clone();
      // Noise-based lightness variation
      c.offsetHSL(0, 0, (fbm(wx * 0.08, wz * 0.08, 2) - 0.5) * 0.1);
      // Darker near pond
      const pd = Math.sqrt((wx - POND_X) ** 2 + (wz - POND_Z) ** 2);
      if (pd < POND_R + 4) c.offsetHSL(0.03, -0.05, -0.04);
      // Random micro-variation
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

    // ── Pond water surface ──
    const waterGeo = new THREE.CircleGeometry(POND_R, 16);
    const water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({
      color: 0x3080c0, transparent: true, opacity: 0.55, flatShading: true,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(POND_X, -0.15, POND_Z);
    this.scene.add(water);
    this.pondWater = water;

    // Earth banks around pond
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bank = new THREE.Mesh(
        new THREE.BoxGeometry(1.6 + Math.random() * 0.4, 0.35, 0.7),
        mat(EARTH)
      );
      bank.position.set(
        POND_X + Math.cos(a) * (POND_R + 0.3),
        -0.1,
        POND_Z + Math.sin(a) * (POND_R + 0.3)
      );
      bank.rotation.y = a;
      bank.castShadow = true;
      this.scene.add(bank);
    }

    // Reeds near pond
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = POND_R - 0.5 + Math.random() * 2;
      const reed = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.2 + Math.random() * 0.8, 0.06),
        mat(0x2d7018)
      );
      reed.position.set(
        POND_X + Math.cos(a) * r,
        0.4,
        POND_Z + Math.sin(a) * r
      );
      this.scene.add(reed);
    }
  }

  // ── Earth cliff sides ──

  _createEarthSides() {
    const HALF = 100;
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
    const gateZ = 9;
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

    // Widened entry path from parking to gate to hub
    for (let z = 5; z <= 17; z += 1.5) {
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

    // Fences along entry path
    for (const xSign of [-1, 1]) {
      const fx = xSign * 3;
      for (let z = 6; z <= 16; z += 2) {
        const fPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat(WOOD));
        fPost.position.set(fx, 0.45, z);
        fPost.castShadow = true;
        this.scene.add(fPost);
      }
      // Rail
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 11), mat(WOOD));
      rail.position.set(fx, 0.75, 11);
      this.scene.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 11), mat(WOOD));
      rail2.position.set(fx, 0.45, 11);
      this.scene.add(rail2);
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
    plaza.position.y = 0.08;
    this.scene.add(plaza);

    // ── Fountain ──
    const fountainGroup = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 0.6, 8), mat(STONE));
    base.position.y = 0.3;
    base.castShadow = true;
    fountainGroup.add(base);

    // Basin (water)
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 0.25, 8),
      new THREE.MeshLambertMaterial({ color: 0x4090d0, transparent: true, opacity: 0.5, flatShading: true })
    );
    basin.position.y = 0.72;
    fountainGroup.add(basin);
    this.fountain = { basin };

    // Column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.8, 6), mat(STONE_DARK));
    col.position.y = 1.5;
    col.castShadow = true;
    fountainGroup.add(col);

    // Spout top
    const spout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), mat(0x80c0e0));
    spout.position.y = 2.5;
    fountainGroup.add(spout);

    // Water droplets (tiny spheres)
    for (let i = 0; i < 5; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x80c0e0, transparent: true, opacity: 0.7 })
      );
      drop.position.set(
        (Math.random() - 0.5) * 0.6,
        1.5 + Math.random() * 1,
        (Math.random() - 0.5) * 0.6
      );
      drop.userData.dropBase = drop.position.y;
      drop.userData.dropPhase = Math.random() * Math.PI * 2;
      fountainGroup.add(drop);
    }

    this.scene.add(fountainGroup);

    // ── Flower beds at compass points ──
    const flowerColors = [0xd03020, 0xf0c020, 0xe060a0, 0x8040c0, 0xff8040, 0x40c0c0];
    for (const [fx, fz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) {
      const bed = new THREE.Group();
      const soil = new THREE.Mesh(new THREE.BoxGeometry(2, 0.35, 2), mat(0x9a7848));
      soil.position.y = 0.18;
      soil.castShadow = true;
      bed.add(soil);
      const border = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), mat(STONE_DARK));
      border.position.y = 0.38;
      bed.add(border);
      // Flowers
      for (let f = 0; f < 6; f++) {
        const flower = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.3, 0.25),
          mat(flowerColors[f % flowerColors.length])
        );
        flower.position.set(
          (Math.random() - 0.5) * 1.4,
          0.55,
          (Math.random() - 0.5) * 1.4
        );
        bed.add(flower);
      }
      bed.position.set(fx, 0, fz);
      this.scene.add(bed);
    }

    // ── Lamp posts around plaza ──
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const lx = Math.cos(a) * 8;
      const lz = Math.sin(a) * 8;
      this._createLampPost(lx, lz, i < 2); // first 2 get point lights
    }
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
  //  PARK FURNITURE
  // ══════════════════════════════════════════════════════════════════════════

  _createParkFurniture() {
    const mainEnd = this.streetExtentZ || -50;

    // ── Benches along main street ──
    for (let z = STREET_START_Z - 4; z > mainEnd + 3; z -= 8) {
      const side = Math.floor((z - STREET_START_Z) / 8) % 2 === 0 ? -1 : 1;
      this._createBench(side * (STREET_W / 2 + 1.5), z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    // ── Trash cans ──
    for (let z = STREET_START_Z - 6; z > mainEnd + 5; z -= 12) {
      const side = Math.floor((z - STREET_START_Z) / 12) % 2 === 0 ? 1 : -1;
      this._createTrashCan(side * (STREET_W / 2 + 1), z);
    }

    // ── Lamp posts along main street ──
    for (let z = STREET_START_Z - 2; z > mainEnd + 3; z -= 10) {
      for (const xSign of [-1, 1]) {
        this._createLampPost(xSign * (STREET_W / 2 + 0.5), z);
      }
    }

    // ── Info boards ──
    this._createInfoBoard(4, STREET_START_Z + 1, 'Welcome!');
    if (mainEnd < -20) {
      this._createInfoBoard(-4, (STREET_START_Z + mainEnd) / 2, 'Rides');
    }

    // ── Extra flower beds near junctions ──
    for (const [fx, fz] of [[3, STREET_START_Z], [-3, STREET_START_Z]]) {
      const bed = new THREE.Group();
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), mat(0x9a7848));
      soil.position.y = 0.15;
      bed.add(soil);
      for (let f = 0; f < 4; f++) {
        const flower = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.25, 0.2),
          mat([0xd03020, 0xf0c020, 0xe060a0, 0x40c0c0][f])
        );
        flower.position.set((Math.random() - 0.5) * 1, 0.42, (Math.random() - 0.5) * 1);
        bed.add(flower);
      }
      bed.position.set(fx, 0, fz);
      this.scene.add(bed);
    }
  }

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
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.6, 6), mat(0x306030));
    body.position.set(x, 0.3, z);
    body.castShadow = true;
    this.scene.add(body);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 6), mat(0x285028));
    rim.position.set(x, 0.63, z);
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
  //  PARKING LOT
  // ══════════════════════════════════════════════════════════════════════════

  createParkingLot() {
    const asphalt = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0x505050 })
    );
    asphalt.position.set(0, 0.07, 22);
    asphalt.receiveShadow = true;
    this.scene.add(asphalt);

    for (let i = -3; i <= 3; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.02, 3),
        new THREE.MeshBasicMaterial({ color: 0xeeeeee })
      );
      line.position.set(i * 2, 0.12, 22);
      this.scene.add(line);
    }

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.15, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x808080 })
    );
    border.position.set(0, 0.08, 17.2);
    this.scene.add(border);

    this.pathGraph.addNode('parking', new THREE.Vector3(0, 0, 20));
    this.pathGraph.addEdge('spawn', 'parking');
    this.pathGraph.addEdge('parking', 'exit');

    // Access road from parking lot off into the distance
    for (let z = 27; z <= 60; z += 2) {
      const roadSeg = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.07, 2.4),
        new THREE.MeshLambertMaterial({ color: 0x505050 })
      );
      roadSeg.position.set(0, 0.06, z);
      roadSeg.receiveShadow = true;
      this.scene.add(roadSeg);
    }
    // Center line
    for (let z = 27; z <= 58; z += 4) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.02, 1.5),
        new THREE.MeshBasicMaterial({ color: 0xeeee88 })
      );
      line.position.set(0, 0.11, z);
      this.scene.add(line);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RIDE LAYOUT (unchanged logic)
  // ══════════════════════════════════════════════════════════════════════════

  layoutRides(pages) {
    if (pages.length === 0) return;

    const sorted = [...pages].sort((a, b) => b.y - a.y);
    const MAIN_MAX = Math.min(6, sorted.length);
    const mainPages = sorted.slice(0, MAIN_MAX);
    const crossPages = sorted.slice(MAIN_MAX);
    const allStreetNodes = ['hub'];

    // Main avenue
    let leftZ = STREET_START_Z;
    let rightZ = STREET_START_Z;

    mainPages.forEach((page, idx) => {
      const rideType = RIDE_TYPES[idx % RIDE_TYPES.length];
      const { x, z, useLeft } = this._placeRide(page, rideType, idx, leftZ, rightZ, 0);
      const footprint = RIDE_FOOTPRINTS[rideType];
      if (useLeft) {
        leftZ = z - footprint.depth / 2 - STREET_GAP;
      } else {
        rightZ = z - footprint.depth / 2 - STREET_GAP;
      }
    });

    const mainEndZ = Math.min(leftZ, rightZ) - 2;
    this.streetExtentZ = mainEndZ;
    this._createMainStreet(STREET_START_Z + 4, mainEndZ);

    let nodeZ = STREET_START_Z;
    while (nodeZ > mainEndZ) {
      const nodeId = `street:${Math.round(nodeZ)}`;
      this.pathGraph.addNode(nodeId, new THREE.Vector3(0, 0, nodeZ));
      this.pathGraph.addEdge(allStreetNodes[allStreetNodes.length - 1], nodeId);
      allStreetNodes.push(nodeId);
      nodeZ -= 8;
    }

    // Cross streets
    if (crossPages.length > 0) {
      const junctionZ = Math.max(mainEndZ + 5, -40);
      const junctionId = allStreetNodes[allStreetNodes.length - 1];
      const eastPages = crossPages.filter((_, i) => i % 2 === 0);
      const westPages = crossPages.filter((_, i) => i % 2 === 1);

      for (const [sidePages, xDir, label] of [[eastPages, 1, 'east'], [westPages, -1, 'west']]) {
        if (sidePages.length === 0) continue;
        const crossStartX = xDir * 12;
        const crossEndX = crossStartX + xDir * (sidePages.length - 1) * 14;

        // Continuous cross-street surface from hub to furthest ride
        const minX = Math.min(0, crossStartX, crossEndX) - 2;
        const maxX = Math.max(0, crossStartX, crossEndX) + 2;
        const streetLen = maxX - minX;
        const crossSegs = Math.ceil(streetLen / 2);
        for (let si = 0; si <= crossSegs; si++) {
          const sx = minX + (si / crossSegs) * streetLen;
          const seg = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.06, STREET_W + 1),
            new THREE.MeshLambertMaterial({
              color: new THREE.Color(DIRT).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04),
            })
          );
          seg.position.set(sx, 0.09, junctionZ);
          seg.receiveShadow = true;
          this.scene.add(seg);
        }

        const crossNodes = [];
        for (let ni = 0; ni < sidePages.length + 1; ni++) {
          const crossX = crossStartX + xDir * ni * 14;
          if (Math.abs(crossX) > 75) break;
          const crossNodeId = `cross-${label}:${ni}`;
          this.pathGraph.addNode(crossNodeId, new THREE.Vector3(crossX, 0, junctionZ));
          if (crossNodes.length > 0) this.pathGraph.addEdge(crossNodes[crossNodes.length - 1], crossNodeId);
          crossNodes.push(crossNodeId);
          allStreetNodes.push(crossNodeId);
        }
        if (crossNodes.length > 0) this.pathGraph.addEdge(junctionId, crossNodes[0]);

        sidePages.forEach((page, idx) => {
          const globalIdx = MAIN_MAX + (xDir === 1 ? idx * 2 : idx * 2 + 1);
          const rideType = RIDE_TYPES[globalIdx % RIDE_TYPES.length];
          const footprint = RIDE_FOOTPRINTS[rideType];
          const halfW = footprint.width / 2, halfD = footprint.depth / 2;
          const rideX = crossStartX + xDir * idx * 14;
          if (Math.abs(rideX) > 75) return;

          const useTop = idx % 2 === 0;
          const rideZ = junctionZ + (useTop ? -1 : 1) * (STREET_W / 2 + halfD + 1.5);
          const ride = new Ride(this.scene, rideType, page.x, page.y);
          ride.group.position.set(rideX, 0, rideZ);
          if (useTop) ride.group.rotation.y = Math.PI;
          this.scene.add(ride.group);
          this.rides.push(ride);

          this._addRideSignsAndNodes(ride, page, rideType, rideX, rideZ, halfW, halfD);

          const entranceZ = useTop ? rideZ + halfD + 1 : rideZ - halfD - 1;
          this._drawPathSegment(
            new THREE.Vector3(rideX, 0, junctionZ),
            new THREE.Vector3(rideX, 0, entranceZ)
          );
        });
      }
    }

    // Connect ride entrances to nearest street node
    this.rides.forEach(ride => {
      const entranceNodeId = `ride-entrance:${ride.name}`;
      const entrancePos = this.pathGraph.nodes.get(entranceNodeId)?.position;
      if (!entrancePos) return;
      let bestNode = 'hub', bestDist = Infinity;
      for (const sn of allStreetNodes) {
        const snPos = this.pathGraph.nodes.get(sn)?.position;
        if (!snPos) continue;
        const dist = entrancePos.distanceTo(snPos);
        if (dist < bestDist) { bestDist = dist; bestNode = sn; }
      }
      this.pathGraph.addEdge(bestNode, entranceNodeId);
    });

    this._createVendorStalls(mainEndZ);
    this._createBalloons();
  }

  _placeRide(page, rideType, globalIdx, leftZ, rightZ, streetCenterX) {
    const footprint = RIDE_FOOTPRINTS[rideType];
    const halfW = footprint.width / 2, halfD = footprint.depth / 2;
    const useLeft = leftZ >= rightZ;
    const xSign = useLeft ? -1 : 1;
    const x = streetCenterX + xSign * (STREET_W / 2 + halfW + 1.5);
    const cursorZ = useLeft ? leftZ : rightZ;
    const z = Math.max(cursorZ - halfD, -75);

    const ride = new Ride(this.scene, rideType, page.x, page.y);
    ride.group.position.set(x, 0, z);
    if (!useLeft) ride.group.rotation.y = Math.PI;
    this.scene.add(ride.group);
    this.rides.push(ride);
    this._addRideSignsAndNodes(ride, page, rideType, x, z, halfW, halfD);

    const entranceZ = z + halfD + 1;
    this._drawPathSegment(
      new THREE.Vector3(streetCenterX, 0, entranceZ),
      new THREE.Vector3(x + (useLeft ? 1 : -1), 0, entranceZ)
    );
    const doorPatch = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.06, 2.5),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(DIRT).offsetHSL(0, 0, -0.03) })
    );
    doorPatch.position.set(x, 0.09, entranceZ);
    doorPatch.receiveShadow = true;
    this.scene.add(doorPatch);

    return { x, z, useLeft };
  }

  _addRideSignsAndNodes(ride, page, rideType, x, z, halfW, halfD) {
    const displayName = this._shortName(page.x);
    const signTex = createTextTexture(displayName, { fontSize: 36, width: 512, height: 96 });
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 0.8),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthTest: false })
    );
    const signY = this._rideSignHeight(rideType);
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

    const entranceZ = z + halfD + 1;
    const entrancePos = new THREE.Vector3(x, 0, entranceZ);
    const entranceNodeId = `ride-entrance:${page.x}`;
    this.pathGraph.addNode(entranceNodeId, entrancePos);
    ride.entrancePosition.copy(entrancePos);

    const rideNodeId = `room:${page.x}`;
    const ridePos = new THREE.Vector3(x, 0, z);
    this.pathGraph.addNode(rideNodeId, ridePos);
    this.pathGraph.addEdge(entranceNodeId, rideNodeId);
    ride.rideNodeId = rideNodeId;

    const bounds = {
      minX: x - halfW + 0.5, maxX: x + halfW - 0.5,
      minZ: z - halfD + 0.5, maxZ: z + halfD - 0.5,
    };
    const room = new Room(page.x, ridePos, page.y, rideNodeId, bounds);
    room.ride = ride;
    this.rooms.push(room);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VENDOR STALLS & BALLOONS
  // ══════════════════════════════════════════════════════════════════════════

  _createVendorStalls(mainEndZ) {
    const stallColors = [0xd03020, 0x2060c0, 0xf0c020, 0x30a030, 0xe07020];
    const stallNames = ['Burgers', 'Drinks', 'Candy', 'Ice Cream', 'Gifts'];
    const stallZ = [];
    for (let z = STREET_START_Z - 8; z > mainEndZ + 5; z -= 15) stallZ.push(z);

    stallZ.forEach((z, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * 2.5;
      const stall = new THREE.Group();

      const counter = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.5), mat(STONE));
      counter.position.y = 0.6;
      counter.castShadow = true;
      stall.add(counter);

      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.7), mat(STONE_DARK));
      top.position.y = 1.25;
      stall.add(top);

      const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 2), mat(stallColors[i % stallColors.length]));
      canopy.position.set(0, 2.2, side * -0.3);
      canopy.rotation.x = side * 0.15;
      canopy.castShadow = true;
      stall.add(canopy);

      for (const px of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), mat(WOOD));
        pole.position.set(px, 1.1, side * -0.8);
        pole.castShadow = true;
        stall.add(pole);
      }

      stall.position.set(x, 0, z);
      this.scene.add(stall);

      const name = stallNames[i % stallNames.length];
      const stallSignTex = createTextTexture(name, { fontSize: 28, width: 256, height: 48, bgColor: '#e8dcc0' });
      const stallSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.35),
        new THREE.MeshBasicMaterial({ map: stallSignTex, transparent: true, depthTest: false })
      );
      stallSign.position.set(x, 2.6, z);
      stallSign.renderOrder = 999;
      stallSign.userData.billboard = true;
      this.uiScene.add(stallSign);
      this.billboards.push(stallSign);
    });
  }

  _createBalloons() {
    const balloonColors = [0xd03020, 0x2060c0, 0xf0c020, 0x30a030, 0xe060a0, 0xe07020, 0x8040c0];
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 20;
      const bx = Math.cos(angle) * dist;
      const bz = STREET_START_Z - Math.random() * 40;
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

  // ══════════════════════════════════════════════════════════════════════════
  //  PATHS
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  //  DECORATIONS (trees, rocks)
  // ══════════════════════════════════════════════════════════════════════════

  createDecorations() {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 60;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      // Avoid rides, pond, and entrance path
      const tooClose = this.rides.some(ride => {
        const fp = RIDE_FOOTPRINTS[ride.type];
        return Math.abs(ride.group.position.x - x) < (fp.width / 2 + 5) &&
               Math.abs(ride.group.position.z - z) < (fp.depth / 2 + 5);
      });
      const nearPond = Math.sqrt((x - POND_X) ** 2 + (z - POND_Z) ** 2) < POND_R + 4;
      const nearPath = Math.abs(x) < 4 && z > 0 && z < 25;
      if (!tooClose && !nearPond && !nearPath) {
        this.createTree(new THREE.Vector3(x, 0, z));
      }
    }

    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 65;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const nearPond = Math.sqrt((x - POND_X) ** 2 + (z - POND_Z) ** 2) < POND_R + 3;
      if (!nearPond) this.createRock(new THREE.Vector3(x, 0, z));
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

    // Pond water ripple
    if (this.pondWater) {
      this.pondWater.position.y = -0.15 + Math.sin(t * 0.8) * 0.03;
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
      observation_tower: 15,
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

    // Pond
    ctx.fillStyle = '#3080c0';
    ctx.beginPath();
    ctx.ellipse(
      w / 2 + POND_X * scale,
      h / 2 - POND_Z * scale,
      POND_R * scale,
      POND_R * scale,
      0, 0, Math.PI * 2
    );
    ctx.fill();

    // Plaza
    ctx.fillStyle = '#c8a868';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 8 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Main street
    ctx.fillStyle = '#c8a868';
    const streetTopY = h / 2 - (STREET_START_Z + 4) * scale;
    const streetBotY = h / 2 - (this.streetExtentZ || -50) * scale;
    ctx.fillRect(w / 2 - 3, streetTopY, 6, streetBotY - streetTopY);

    // Parking lot
    ctx.fillStyle = '#505050';
    ctx.fillRect(w / 2 - 8, h / 2 - 22 * scale, 16, 10 * scale);

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

    // Entrance
    ctx.fillStyle = '#f0d830';
    ctx.fillRect(w / 2 - 2, h / 2 - 9 * scale - 1, 4, 3);
  }
}
