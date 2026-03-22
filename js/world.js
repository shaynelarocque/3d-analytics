import * as THREE from 'three';

const STONE_COLOR = 0x8c8c8c;
const STONE_DARK = 0x6e6e6e;
const WOOD_COLOR = 0x8b6914;
const WOOD_DARK = 0x6b4f12;
const ROOF_COLOR = 0x9e3b2c;
const GRASS_COLOR = 0x3a7d30;
const DIRT_COLOR = 0x9e8b6e;

function stoneMat(color = STONE_COLOR) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function woodMat(color = WOOD_COLOR) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function createTextTexture(text, options = {}) {
  const {
    fontSize = 20,
    fontColor = '#ffcc00',
    bgColor = '#3a2e1eee',
    width = 256,
    height = 64,
    font = 'bold monospace',
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = '#5a4d3a';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  ctx.fillStyle = fontColor;
  ctx.font = `${fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Truncate long text
  let displayText = text;
  while (ctx.measureText(displayText).width > width - 20 && displayText.length > 3) {
    displayText = displayText.slice(0, -4) + '...';
  }
  ctx.fillText(displayText, width / 2, height / 2);

  // Black text shadow effect
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#000';
  ctx.fillText(displayText, width / 2 + 1, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export class Room {
  constructor(name, position, visitorCount) {
    this.name = name;
    this.position = position;
    this.visitorCount = visitorCount;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.userData = { type: 'room', room: this };
    this.doorPosition = new THREE.Vector3(
      position.x,
      0,
      position.z + 4.5
    );
    this.characters = [];
  }

  get doorWorldPos() {
    return this.doorPosition;
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.rooms = [];
    this.clickableObjects = [];
  }

  build(pages) {
    this.createGround();
    this.createSky();
    this.createRooms(pages);
    this.createDecorations();
    return this.rooms;
  }

  createGround() {
    // Main grass
    const groundGeo = new THREE.PlaneGeometry(200, 200, 20, 20);
    // Slightly randomize vertices for terrain feel
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, pos.getZ(i) + (Math.random() - 0.5) * 0.3);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshLambertMaterial({
      color: GRASS_COLOR,
      flatShading: true,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Central dirt area
    const dirtGeo = new THREE.CircleGeometry(8, 12);
    const dirtMat = new THREE.MeshLambertMaterial({ color: DIRT_COLOR });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.02;
    this.scene.add(dirt);
  }

  createSky() {
    const skyGeo = new THREE.SphereGeometry(95, 16, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87CEEB,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Simple clouds
    for (let i = 0; i < 12; i++) {
      const cloudGroup = new THREE.Group();
      const cloudMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
      });

      for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) {
        const size = 2 + Math.random() * 3;
        const cloudPart = new THREE.Mesh(
          new THREE.BoxGeometry(size, size * 0.4, size * 0.8),
          cloudMat
        );
        cloudPart.position.set(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 2
        );
        cloudGroup.add(cloudPart);
      }

      const angle = Math.random() * Math.PI * 2;
      const radius = 40 + Math.random() * 40;
      cloudGroup.position.set(
        Math.cos(angle) * radius,
        25 + Math.random() * 15,
        Math.sin(angle) * radius
      );
      cloudGroup.userData.cloudSpeed = 0.1 + Math.random() * 0.2;
      cloudGroup.userData.cloudAngle = angle;
      cloudGroup.userData.cloudRadius = radius;
      this.scene.add(cloudGroup);
    }
  }

  createRooms(pages) {
    if (!pages || pages.length === 0) return;

    const cols = Math.ceil(Math.sqrt(pages.length));
    const spacing = 14;
    const offsetX = -(cols - 1) * spacing / 2;
    const offsetZ = -15;

    pages.forEach((page, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = offsetX + col * spacing;
      const z = offsetZ - row * spacing;

      const pos = new THREE.Vector3(x, 0, z);
      const room = new Room(page.x, pos, page.y);
      this.buildRoom(room);
      this.createPath(new THREE.Vector3(0, 0, 0), pos);
      this.rooms.push(room);
    });
  }

  buildRoom(room) {
    const g = room.group;

    // Determine building size based on visitor count
    const scale = Math.min(1 + room.visitorCount / 200, 1.5);
    const w = 6 * scale;
    const h = 4;
    const d = 6 * scale;
    const wallThick = 0.3;
    const doorW = 2;
    const doorH = 3;

    const stone = stoneMat();
    const stoneDk = stoneMat(STONE_DARK);

    // Floor
    const floorGeo = new THREE.BoxGeometry(w, 0.15, d);
    const floor = new THREE.Mesh(floorGeo, woodMat(0x9e8b6e));
    floor.position.y = 0.075;
    floor.receiveShadow = true;
    g.add(floor);

    // Back wall
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, wallThick), stone
    );
    backWall.position.set(0, h / 2, -d / 2 + wallThick / 2);
    backWall.castShadow = true;
    g.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick, h, d), stone
    );
    leftWall.position.set(-w / 2 + wallThick / 2, h / 2, 0);
    leftWall.castShadow = true;
    g.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick, h, d), stone
    );
    rightWall.position.set(w / 2 - wallThick / 2, h / 2, 0);
    rightWall.castShadow = true;
    g.add(rightWall);

    // Front wall (with door opening)
    const sideW = (w - doorW) / 2;
    const frontZ = d / 2 - wallThick / 2;

    const frontLeft = new THREE.Mesh(
      new THREE.BoxGeometry(sideW, h, wallThick), stone
    );
    frontLeft.position.set(-w / 2 + sideW / 2, h / 2, frontZ);
    frontLeft.castShadow = true;
    g.add(frontLeft);

    const frontRight = new THREE.Mesh(
      new THREE.BoxGeometry(sideW, h, wallThick), stone
    );
    frontRight.position.set(w / 2 - sideW / 2, h / 2, frontZ);
    frontRight.castShadow = true;
    g.add(frontRight);

    // Above door
    const aboveDoor = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, h - doorH, wallThick), stone
    );
    aboveDoor.position.set(0, doorH + (h - doorH) / 2, frontZ);
    g.add(aboveDoor);

    // Door frame (darker stone)
    const frameThick = 0.15;
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, doorH, wallThick + 0.05), stoneDk
    );
    leftFrame.position.set(-doorW / 2, doorH / 2, frontZ);
    g.add(leftFrame);

    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, doorH, wallThick + 0.05), stoneDk
    );
    rightFrame.position.set(doorW / 2, doorH / 2, frontZ);
    g.add(rightFrame);

    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + frameThick * 2, frameThick, wallThick + 0.05), stoneDk
    );
    topFrame.position.set(0, doorH, frontZ);
    g.add(topFrame);

    // Peaked roof
    const roofHeight = 2;
    const roofOverhang = 0.8;
    const roofGeo = new THREE.BufferGeometry();
    const rw = w / 2 + roofOverhang;
    const rd = d / 2 + roofOverhang;
    const vertices = new Float32Array([
      // Left slope
      -rw, h, rd,   0, h + roofHeight, rd,   -rw, h, -rd,
      0, h + roofHeight, rd,   0, h + roofHeight, -rd,   -rw, h, -rd,
      // Right slope
      rw, h, rd,   rw, h, -rd,   0, h + roofHeight, rd,
      0, h + roofHeight, rd,   rw, h, -rd,   0, h + roofHeight, -rd,
      // Front triangle
      -rw, h, rd,   0, h + roofHeight, rd,   rw, h, rd,
      // Back triangle
      -rw, h, -rd,   rw, h, -rd,   0, h + roofHeight, -rd,
    ]);
    roofGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeo.computeVertexNormals();

    const roofMat = new THREE.MeshLambertMaterial({
      color: ROOF_COLOR,
      flatShading: true,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.castShadow = true;
    g.add(roof);

    // Sign above door
    const signTexture = createTextTexture(room.name, {
      fontSize: 18,
      width: 256,
      height: 48,
    });
    const signGeo = new THREE.PlaneGeometry(2.5, 0.5);
    const signMat = new THREE.MeshBasicMaterial({
      map: signTexture,
      transparent: true,
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, doorH + 0.5, frontZ + 0.2);
    g.add(sign);

    // Visitor count sign
    const countTexture = createTextTexture(`${room.visitorCount} visits`, {
      fontSize: 14,
      fontColor: '#00ff00',
      width: 128,
      height: 32,
    });
    const countGeo = new THREE.PlaneGeometry(1.5, 0.35);
    const countMat = new THREE.MeshBasicMaterial({
      map: countTexture,
      transparent: true,
    });
    const countSign = new THREE.Mesh(countGeo, countMat);
    countSign.position.set(0, doorH + 1.1, frontZ + 0.2);
    g.add(countSign);

    // Window on left wall (just a dark square)
    const windowGeo = new THREE.PlaneGeometry(1, 1);
    const windowMat = new THREE.MeshBasicMaterial({
      color: 0x1a1a2e,
      transparent: true,
      opacity: 0.7,
    });
    const windowMesh = new THREE.Mesh(windowGeo, windowMat);
    windowMesh.position.set(-w / 2 + 0.01, h / 2 + 0.5, 0);
    windowMesh.rotation.y = Math.PI / 2;
    g.add(windowMesh);

    // Window frame
    const wfGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
    const wfMat = woodMat(WOOD_DARK);
    const wf1 = new THREE.Mesh(wfGeo, wfMat);
    wf1.position.set(-w / 2 + 0.01, h / 2 + 0.5, 0);
    g.add(wf1);

    // Light inside room (warm glow)
    const light = new THREE.PointLight(0xffa500, 0.5, 8);
    light.position.set(0, 2.5, 0);
    g.add(light);

    // Add all meshes to clickable list
    g.traverse((child) => {
      if (child.isMesh) {
        this.clickableObjects.push(child);
      }
    });

    this.scene.add(g);
  }

  createPath(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const length = dir.length();
    dir.normalize();

    const pathWidth = 1.5;
    const segments = Math.ceil(length / 2);

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const pos = new THREE.Vector3().lerpVectors(from, to, t);
      pos.y = 0.03;

      const segGeo = new THREE.BoxGeometry(
        pathWidth + Math.random() * 0.5,
        0.02,
        2.2
      );
      const segMat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(DIRT_COLOR).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05),
      });
      const seg = new THREE.Mesh(segGeo, segMat);
      seg.position.copy(pos);
      seg.rotation.y = Math.atan2(dir.x, dir.z);
      seg.receiveShadow = true;
      this.scene.add(seg);
    }
  }

  createDecorations() {
    // Trees scattered around
    const treePositions = [];
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 55;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      // Avoid placing too close to rooms
      const tooClose = this.rooms.some(r =>
        Math.abs(r.position.x - x) < 10 && Math.abs(r.position.z - z) < 10
      );
      if (!tooClose) {
        treePositions.push(new THREE.Vector3(x, 0, z));
      }
    }

    treePositions.forEach(pos => this.createTree(pos));

    // Spawn point marker (like Lumbridge home teleport spot)
    this.createSpawnMarker();

    // Some rocks
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 60;
      this.createRock(new THREE.Vector3(
        Math.cos(angle) * dist,
        0,
        Math.sin(angle) * dist
      ));
    }
  }

  createTree(position) {
    const tree = new THREE.Group();
    tree.position.copy(position);

    // Trunk
    const trunkH = 2 + Math.random() * 2;
    const trunkGeo = new THREE.BoxGeometry(0.5, trunkH, 0.5);
    const trunk = new THREE.Mesh(trunkGeo, woodMat(0x5a3a1a));
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Foliage (stacked cubes like OSRS trees)
    const foliageMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x2d6e1e).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1),
      flatShading: true,
    });

    const layers = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < layers; i++) {
      const size = 2.5 - i * 0.5 + Math.random() * 0.5;
      const foliage = new THREE.Mesh(
        new THREE.BoxGeometry(size, 1.5, size),
        foliageMat
      );
      foliage.position.y = trunkH + i * 1.2;
      foliage.rotation.y = Math.random() * 0.5;
      foliage.castShadow = true;
      tree.add(foliage);
    }

    this.scene.add(tree);
  }

  createSpawnMarker() {
    // Glowing circle on ground
    const markerGeo = new THREE.RingGeometry(1.5, 2, 8);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.05;
    this.scene.add(marker);

    // Home icon/sign
    const signTexture = createTextTexture('SPAWN', {
      fontSize: 16,
      fontColor: '#ffcc00',
      bgColor: '#00000088',
      width: 128,
      height: 32,
    });
    const signGeo = new THREE.PlaneGeometry(1.5, 0.4);
    const signMat = new THREE.MeshBasicMaterial({
      map: signTexture,
      transparent: true,
      depthTest: false,
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3, 0);
    sign.renderOrder = 999;
    // Billboard - will be updated in render loop
    sign.userData.billboard = true;
    this.scene.add(sign);
    this.spawnSign = sign;
  }

  createRock(position) {
    const rockGeo = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0);
    const rockMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x808080).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15),
      flatShading: true,
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
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

    ctx.fillStyle = '#2d5a1e';
    ctx.fillRect(0, 0, w, h);

    // Dirt paths
    ctx.fillStyle = '#7a6b4e';
    ctx.fillRect(w / 2 - 2, 0, 4, h);
    ctx.fillRect(0, h / 2, w, 4);

    // Rooms
    this.rooms.forEach(room => {
      const rx = w / 2 + room.position.x * scale;
      const ry = h / 2 - room.position.z * scale;
      ctx.fillStyle = '#8c7050';
      ctx.fillRect(rx - 3, ry - 3, 6, 6);
      ctx.strokeStyle = '#5a4030';
      ctx.strokeRect(rx - 3, ry - 3, 6, 6);
    });

    // Characters (white dots)
    characters.forEach(char => {
      const cx = w / 2 + char.group.position.x * scale;
      const cy = h / 2 - char.group.position.z * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    });

    // Camera indicator
    const camX = w / 2 + camera.position.x * scale;
    const camY = h / 2 - camera.position.z * scale;
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(camX, camY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Spawn point
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
