import * as THREE from 'three';

// ── RCT2 ride colour palette ──────────────────────────────────────────────────
const R_RED    = 0xd03020;
const R_BLUE   = 0x2060c0;
const R_YELLOW = 0xf0c020;
const R_GREEN  = 0x30a030;
const R_PURPLE = 0x8040c0;
const R_ORANGE = 0xe07020;
const R_PINK   = 0xe060a0;
const R_CYAN   = 0x20b0b0;
const R_WHITE  = 0xf0e8d8;
const R_METAL  = 0x808890;
const R_WOOD   = 0xb07830;

const SEAT_COLORS = [R_RED, R_BLUE, R_YELLOW, R_GREEN, R_PURPLE, R_ORANGE, R_PINK, R_CYAN];

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// Circus-tent striped cone: vertex-colored geometry with alternating segment colors
function circusTentCone(radius, height, numStripes, color1, color2) {
  const segments = numStripes * 2;
  const geo = new THREE.ConeGeometry(radius, height, segments);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const c1 = new THREE.Color(color1);
  const c2 = new THREE.Color(color2);

  // ConeGeometry layout: tip vertex repeated per segment, then base center,
  // then ring vertices. Each side face uses 3 consecutive verts (triangle).
  // Faces are grouped by segment index.
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    // Determine which segment this vertex belongs to via its angle
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = posAttr.getY(i);
    let segIdx = 0;
    if (Math.abs(x) < 0.001 && Math.abs(z) < 0.001) {
      // Tip or base center — will be colored by neighboring faces
      // Use segment 0 color (will blend)
      segIdx = 0;
    } else {
      const angle = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
      segIdx = Math.floor(angle * segments) % segments;
    }
    const c = segIdx % 2 === 0 ? c1 : c2;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const meshMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return new THREE.Mesh(geo, meshMat);
}

// ── Ride catalogue ────────────────────────────────────────────────────────────

export const RIDE_TYPES = [
  'ferris_wheel', 'roller_coaster', 'carousel', 'swing_ride', 'spinning_cups',
  'drop_tower', 'loop_coaster', 'log_flume', 'pirate_ship', 'bumper_cars',
  'haunted_house', 'go_karts', 'observation_tower',
  'mini_railway', 'merry_go_round', 'top_spin', 'river_rapids',
  'wild_mouse', 'enterprise', 'ghost_train',
];

export const RIDE_FOOTPRINTS = {
  ferris_wheel:      { width: 12, depth: 6 },
  roller_coaster:    { width: 14, depth: 10 },
  carousel:          { width: 8,  depth: 8 },
  swing_ride:        { width: 8,  depth: 8 },
  spinning_cups:     { width: 8,  depth: 8 },
  drop_tower:        { width: 5,  depth: 5 },
  loop_coaster:      { width: 12, depth: 8 },
  log_flume:         { width: 14, depth: 8 },
  pirate_ship:       { width: 10, depth: 6 },
  bumper_cars:       { width: 10, depth: 8 },
  haunted_house:     { width: 10, depth: 8 },
  go_karts:          { width: 14, depth: 10 },
  observation_tower: { width: 6,  depth: 6 },
  mini_railway:      { width: 20, depth: 4 },
  merry_go_round:    { width: 6,  depth: 6 },
  top_spin:          { width: 10, depth: 8 },
  river_rapids:      { width: 16, depth: 16 },
  wild_mouse:        { width: 12, depth: 10 },
  enterprise:        { width: 10, depth: 10 },
  ghost_train:       { width: 12, depth: 8 },
};

export const RIDE_CATALOG = {
  ferris_wheel:      { tilesW: 6, tilesD: 4, entrance: { col: 3, row: 4, facing: 'south' } },
  roller_coaster:    { tilesW: 7, tilesD: 6, entrance: { col: 3, row: 6, facing: 'south' } },
  carousel:          { tilesW: 5, tilesD: 5, entrance: { col: 2, row: 5, facing: 'south' } },
  swing_ride:        { tilesW: 5, tilesD: 5, entrance: { col: 2, row: 5, facing: 'south' } },
  spinning_cups:     { tilesW: 5, tilesD: 5, entrance: { col: 2, row: 5, facing: 'south' } },
  drop_tower:        { tilesW: 3, tilesD: 3, entrance: { col: 1, row: 3, facing: 'south' } },
  loop_coaster:      { tilesW: 7, tilesD: 5, entrance: { col: 3, row: 5, facing: 'south' } },
  log_flume:         { tilesW: 8, tilesD: 5, entrance: { col: 4, row: 5, facing: 'south' } },
  pirate_ship:       { tilesW: 6, tilesD: 4, entrance: { col: 3, row: 4, facing: 'south' } },
  bumper_cars:       { tilesW: 6, tilesD: 5, entrance: { col: 3, row: 5, facing: 'south' } },
  haunted_house:     { tilesW: 6, tilesD: 5, entrance: { col: 3, row: 5, facing: 'south' } },
  go_karts:          { tilesW: 8, tilesD: 6, entrance: { col: 4, row: 6, facing: 'south' } },
  observation_tower: { tilesW: 4, tilesD: 4, entrance: { col: 2, row: 4, facing: 'south' } },
  mini_railway:      { tilesW: 10, tilesD: 3, entrance: { col: 5, row: 3, facing: 'south' } },
  merry_go_round:    { tilesW: 4, tilesD: 4, entrance: { col: 2, row: 4, facing: 'south' } },
  top_spin:          { tilesW: 6, tilesD: 5, entrance: { col: 3, row: 5, facing: 'south' } },
  river_rapids:      { tilesW: 9, tilesD: 9, entrance: { col: 4, row: 9, facing: 'south' } },
  wild_mouse:        { tilesW: 7, tilesD: 6, entrance: { col: 3, row: 6, facing: 'south' } },
  enterprise:        { tilesW: 6, tilesD: 6, entrance: { col: 3, row: 6, facing: 'south' } },
  ghost_train:       { tilesW: 7, tilesD: 5, entrance: { col: 3, row: 5, facing: 'south' } },
};

// ── Ride class ────────────────────────────────────────────────────────────────

export class Ride {
  constructor(scene, type, name, visitorCount) {
    this.scene = scene;
    this.type = type;
    this.name = name;
    this.visitorCount = visitorCount;
    this.group = new THREE.Group();
    this.animTime = Math.random() * Math.PI * 2;
    this.seats = [];           // { group, occupied, character }
    this.animatedParts = {};
    this.entrancePosition = new THREE.Vector3();
    this.exitPosition = null;      // set by world.js from plan
    this.queuePositions = null;    // array of Vector3, set by world.js
    this.rideNodeId = null;

    this._build();
    this._addVisualDetails();
  }

  // ── dispatch ──

  _build() {
    const fn = {
      ferris_wheel:      () => this._buildFerrisWheel(),
      roller_coaster:    () => this._buildRollerCoaster(),
      carousel:          () => this._buildCarousel(),
      swing_ride:        () => this._buildSwingRide(),
      spinning_cups:     () => this._buildSpinningCups(),
      drop_tower:        () => this._buildDropTower(),
      loop_coaster:      () => this._buildLoopCoaster(),
      log_flume:         () => this._buildLogFlume(),
      pirate_ship:       () => this._buildPirateShip(),
      bumper_cars:       () => this._buildBumperCars(),
      haunted_house:     () => this._buildHauntedHouse(),
      go_karts:          () => this._buildGoKarts(),
      observation_tower: () => this._buildObservationTower(),
      mini_railway:      () => this._buildMiniRailway(),
      merry_go_round:    () => this._buildMerryGoRound(),
      top_spin:          () => this._buildTopSpin(),
      river_rapids:      () => this._buildRiverRapids(),
      wild_mouse:        () => this._buildWildMouse(),
      enterprise:        () => this._buildEnterprise(),
      ghost_train:       () => this._buildGhostTrain(),
    };
    (fn[this.type] || fn.carousel)();
  }

  update(delta) {
    this.animTime += delta;
    const fn = {
      ferris_wheel:      () => this._updateFerrisWheel(delta),
      roller_coaster:    () => this._updateRollerCoaster(delta),
      carousel:          () => this._updateCarousel(delta),
      swing_ride:        () => this._updateSwingRide(delta),
      spinning_cups:     () => this._updateSpinningCups(delta),
      drop_tower:        () => this._updateDropTower(delta),
      loop_coaster:      () => this._updateLoopCoaster(delta),
      log_flume:         () => this._updateLogFlume(delta),
      pirate_ship:       () => this._updatePirateShip(delta),
      bumper_cars:       () => this._updateBumperCars(delta),
      haunted_house:     () => this._updateHauntedHouse(delta),
      go_karts:          () => this._updateGoKarts(delta),
      observation_tower: () => this._updateObservationTower(delta),
      mini_railway:      () => this._updateMiniRailway(delta),
      merry_go_round:    () => this._updateMerryGoRound(delta),
      top_spin:          () => this._updateTopSpin(delta),
      river_rapids:      () => this._updateRiverRapids(delta),
      wild_mouse:        () => this._updateWildMouse(delta),
      enterprise:        () => this._updateEnterprise(delta),
      ghost_train:       () => this._updateGhostTrain(delta),
    };
    (fn[this.type] || fn.carousel)();
  }

  // ── guest management ──

  boardGuest(character) {
    const seat = this.seats.find(s => !s.occupied);
    if (!seat) return false;
    seat.occupied = true;
    seat.character = character;
    // Reparent character into the seat group
    if (character.group.parent) character.group.parent.remove(character.group);
    character.group.position.set(0, 0, 0);
    character.group.rotation.set(0, 0, 0);
    seat.group.add(character.group);
    return true;
  }

  disembarkGuest(character) {
    const seat = this.seats.find(s => s.character === character);
    if (!seat) return;
    seat.occupied = false;
    seat.character = null;
    seat.group.remove(character.group);
    character.group.position.copy(this.exitPosition || this.entrancePosition);
    character.group.rotation.set(0, 0, 0);
    this.scene.add(character.group);
  }

  hasAvailableSeat() {
    return this.seats.some(s => !s.occupied);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FERRIS WHEEL
  // ═══════════════════════════════════════════════════════════════════════════

  _buildFerrisWheel() {
    const g = this.group;
    const wheelR = 5;
    const wheelY = 6.5;
    const metalMat = mat(R_METAL);
    const whiteMat = mat(R_WHITE);

    // ── A-frame supports on front & back ──
    for (const zOff of [-1.5, 1.5]) {
      // Two angled legs per side
      for (const xSign of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, wheelY + 0.5, 0.35), metalMat);
        leg.position.set(xSign * 1.4, (wheelY + 0.5) / 2, zOff);
        leg.rotation.z = -xSign * 0.15;
        leg.castShadow = true;
        g.add(leg);
      }
      // Cross beam at top
      const cross = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 0.3), metalMat);
      cross.position.set(0, wheelY + 0.3, zOff);
      cross.castShadow = true;
      g.add(cross);
    }

    // Axle (runs along Z)
    const axle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4), metalMat);
    axle.position.set(0, wheelY, 0);
    g.add(axle);

    // ── Rotating wheel assembly ──
    const wheel = new THREE.Group();
    wheel.position.set(0, wheelY, 0);

    const numGondolas = 8;
    const gondolaContainers = [];

    for (let i = 0; i < numGondolas; i++) {
      const angle = (i / numGondolas) * Math.PI * 2;

      // Spoke
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 2, 0.12, 0.12), whiteMat);
      spoke.rotation.z = angle;
      spoke.castShadow = true;
      wheel.add(spoke);

      // Gondola container (counter-rotates to stay level)
      const container = new THREE.Group();
      container.position.set(
        Math.cos(angle) * wheelR,
        Math.sin(angle) * wheelR,
        0
      );

      // Gondola body
      const color = SEAT_COLORS[i % SEAT_COLORS.length];
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.2), mat(color));
      gondola.castShadow = true;
      container.add(gondola);

      // Hanger bar
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), metalMat);
      bar.position.y = 0.9;
      container.add(bar);

      wheel.add(container);
      gondolaContainers.push(container);

      this.seats.push({ group: container, occupied: false, character: null });
    }

    // Rim ring (approximated with box segments)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const a2 = ((i + 1) / 24) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), metalMat);
      seg.position.set(
        Math.cos(a) * wheelR,
        Math.sin(a) * wheelR,
        0
      );
      seg.rotation.z = a + Math.PI / 2;
      wheel.add(seg);
    }

    g.add(wheel);
    this.animatedParts.wheel = wheel;
    this.animatedParts.gondolaContainers = gondolaContainers;

    // Base platform
    const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 5), mat(0x9e8b6e));
    platform.position.set(0, 0.12, 0);
    platform.receiveShadow = true;
    g.add(platform);

    // Fence along front
    for (let x = -3.5; x <= 3.5; x += 1.4) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), mat(R_WOOD));
      post.position.set(x, 0.5, 2.2);
      post.castShadow = true;
      g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 0.12), mat(R_WOOD));
    rail.position.set(0, 0.8, 2.2);
    g.add(rail);
  }

  _updateFerrisWheel() {
    const wheel = this.animatedParts.wheel;
    if (!wheel) return;
    // Slow rotation with slight speed variation (wind effect)
    const windSpeed = 0.0015 + Math.sin(this.animTime * 0.3) * 0.0003;
    wheel.rotation.z -= windSpeed;
    // Counter-rotate gondolas + gentle sway
    for (let i = 0; i < this.animatedParts.gondolaContainers.length; i++) {
      const c = this.animatedParts.gondolaContainers[i];
      c.rotation.z = -wheel.rotation.z + Math.sin(this.animTime * 1.5 + i * 0.8) * 0.04;
      c.rotation.x = Math.sin(this.animTime * 0.8 + i) * 0.06; // gentle rocking
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROLLER COASTER
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRollerCoaster() {
    const g = this.group;
    const metalMat = mat(R_METAL);

    // Track curve (closed loop with hills)
    const pts = [
      new THREE.Vector3( 0,   0.5,  3.5),
      new THREE.Vector3( 3.5, 0.5,  4),
      new THREE.Vector3( 5.5, 2,    2),
      new THREE.Vector3( 6,   4.5,  0),
      new THREE.Vector3( 5,   3.5, -2),
      new THREE.Vector3( 3,   1.5, -4),
      new THREE.Vector3( 0,   0.8, -4.5),
      new THREE.Vector3(-3,   1.5, -3.5),
      new THREE.Vector3(-5,   3,   -1),
      new THREE.Vector3(-5.5, 3.5,  1),
      new THREE.Vector3(-4,   1.5,  3),
      new THREE.Vector3(-1.5, 0.5,  4),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;

    // Track segments (thick for RCT2 feel)
    const trackMat = mat(R_RED);
    const tieMat = mat(R_WOOD);
    const numSegs = 60;
    for (let i = 0; i < numSegs; i++) {
      const t = i / numSegs;
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();

      // Track tie (cross piece)
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.3), tieMat);
      tie.position.copy(pos);
      tie.lookAt(pos.clone().add(tangent));
      tie.castShadow = true;
      g.add(tie);

      // Rails (two side rails)
      for (const xOff of [-0.6, 0.6]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.5), trackMat);
        const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
        rail.position.copy(pos).add(right.multiplyScalar(xOff));
        rail.position.y += 0.12;
        rail.lookAt(rail.position.clone().add(tangent));
        g.add(rail);
      }

      // Support pillar every 5 segments (if track is above ground)
      if (i % 5 === 0 && pos.y > 1) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, pos.y, 0.3),
          metalMat
        );
        pillar.position.set(pos.x, pos.y / 2, pos.z);
        pillar.castShadow = true;
        g.add(pillar);
      }
    }

    // Station/platform at the front
    const station = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 3), mat(0x9e8b6e));
    station.position.set(0, 0.15, 3.5);
    station.receiveShadow = true;
    g.add(station);

    // Station roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.2, 3.5), mat(R_BLUE));
    roof.position.set(0, 2.5, 3.5);
    roof.castShadow = true;
    g.add(roof);
    // Roof supports
    for (const [rx, rz] of [[-1.8, 2], [1.8, 2], [-1.8, 5], [1.8, 5]]) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 0.2), mat(R_BLUE));
      sup.position.set(rx, 1.3, rz);
      sup.castShadow = true;
      g.add(sup);
    }

    // Train of 5 cars chained along the track
    const NUM_CARS = 5;
    const CAR_SPACING = 0.025; // parameter offset between cars
    const carColors = [R_YELLOW, R_RED, R_BLUE, R_GREEN, R_ORANGE];
    const carGroups = [];

    for (let c = 0; c < NUM_CARS; c++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.3), mat(carColors[c % carColors.length]));
      body.position.y = 0.55;
      body.castShadow = true;
      car.add(body);

      // Front bumper on lead car only
      if (c === 0) {
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.25), mat(R_RED));
        front.position.set(0, 0.7, 0.75);
        car.add(front);
      }

      // Connector between cars (except first)
      if (c > 0) {
        const conn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), mat(R_METAL));
        conn.position.set(0, 0.4, 0.8);
        car.add(conn);
      }

      const t = (c * CAR_SPACING) % 1;
      car.position.copy(curve.getPointAt(t));
      g.add(car);
      carGroups.push(car);
      this.seats.push({ group: car, occupied: false, character: null });
    }

    this.animatedParts.carGroups = carGroups;
    this.animatedParts.carT = 0;
    this.animatedParts.carSpacing = CAR_SPACING;
  }

  _updateRollerCoaster(delta) {
    const { curve, carGroups, carSpacing } = this.animatedParts;
    if (!curve || !carGroups) return;

    // Speed varies with height — faster on downhills
    const leadPos = curve.getPointAt(this.animatedParts.carT);
    const nextCheck = curve.getPointAt((this.animatedParts.carT + 0.02) % 1);
    const slope = nextCheck.y - leadPos.y;
    const baseSpeed = 0.06;
    const speed = baseSpeed + Math.max(0, -slope * 0.08); // faster going down

    this.animatedParts.carT = (this.animatedParts.carT + delta * speed) % 1;
    const t = this.animatedParts.carT;

    for (let i = 0; i < carGroups.length; i++) {
      const carT = (t - i * carSpacing + 1) % 1;
      const pos = curve.getPointAt(carT);
      const nextPos = curve.getPointAt((carT + 0.01) % 1);
      carGroups[i].position.copy(pos);
      const worldNext = this.group.localToWorld(nextPos.clone());
      carGroups[i].lookAt(worldNext);
      // Bank into turns
      const tangent = curve.getTangentAt(carT);
      const nextTangent = curve.getTangentAt((carT + 0.02) % 1);
      const turn = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
      carGroups[i].rotation.z = Math.max(-0.2, Math.min(0.2, -turn * 3));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CAROUSEL
  // ═══════════════════════════════════════════════════════════════════════════

  _buildCarousel() {
    const g = this.group;
    const numHorses = 6;
    const platformR = 3;

    // Base platform
    const baseMat = mat(0x9e8b6e);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(platformR + 0.5, platformR + 0.5, 0.3, 12), baseMat);
    base.position.y = 0.15;
    base.receiveShadow = true;
    g.add(base);

    // Spinning platform with horses
    const spinner = new THREE.Group();
    spinner.position.y = 0;

    // Platform disc
    const discMat = mat(R_YELLOW);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(platformR, platformR, 0.25, 12), discMat);
    disc.position.y = 0.4;
    disc.receiveShadow = true;
    spinner.add(disc);

    // Central pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.5, 8), mat(R_RED));
    pole.position.y = 2.5;
    pole.castShadow = true;
    spinner.add(pole);

    // Conical roof with circus-tent stripes
    const roof = circusTentCone(platformR + 0.8, 1.8, 8, R_RED, R_WHITE);
    roof.position.y = 5.1;
    roof.castShadow = true;
    spinner.add(roof);
    // Roof trim ring
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(platformR + 0.9, platformR + 0.9, 0.15, 24), mat(R_WHITE));
    trim.position.y = 4.2;
    spinner.add(trim);
    // Finial
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.5, 6), mat(R_YELLOW));
    finial.position.y = 6.1;
    spinner.add(finial);

    // Horses
    for (let i = 0; i < numHorses; i++) {
      const angle = (i / numHorses) * Math.PI * 2;
      const hx = Math.cos(angle) * (platformR - 0.8);
      const hz = Math.sin(angle) * (platformR - 0.8);
      const color = SEAT_COLORS[i % SEAT_COLORS.length];

      // Horse pole
      const horsePole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), mat(R_METAL));
      horsePole.position.set(hx, 2, hz);
      spinner.add(horsePole);

      // Horse seat group (for guest attachment)
      const seatGroup = new THREE.Group();
      seatGroup.position.set(hx, 1.2, hz);
      seatGroup.rotation.y = -angle;

      // Horse body (box)
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1.2), mat(color));
      body.castShadow = true;
      seatGroup.add(body);
      // Horse head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.4), mat(color));
      head.position.set(0, 0.3, 0.6);
      seatGroup.add(head);
      // Legs
      for (const [lx, lz] of [[-0.15, 0.3], [0.15, 0.3], [-0.15, -0.3], [0.15, -0.3]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), mat(color));
        leg.position.set(lx, -0.5, lz);
        seatGroup.add(leg);
      }

      spinner.add(seatGroup);
      this.seats.push({ group: seatGroup, occupied: false, character: null });
    }

    g.add(spinner);
    this.animatedParts.spinner = spinner;
    this.animatedParts.numHorses = numHorses;
    this.animatedParts.platformR = platformR;

    // Fence
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      // Skip the front (entrance gap)
      if (a > Math.PI * 1.6 || a < Math.PI * 0.15) continue;
      const fx = Math.cos(a) * (platformR + 1.2);
      const fz = Math.sin(a) * (platformR + 1.2);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), mat(R_WOOD));
      post.position.set(fx, 0.4, fz);
      post.castShadow = true;
      g.add(post);
    }
  }

  _updateCarousel() {
    const { spinner, numHorses, platformR } = this.animatedParts;
    if (!spinner) return;
    // Speed oscillates — speeds up then slows (like a real carousel cycle)
    const speedCycle = 0.008 + Math.sin(this.animTime * 0.2) * 0.003;
    spinner.rotation.y += speedCycle;

    // Bob horses up/down with galloping motion
    const horseGroups = this.seats;
    for (let i = 0; i < horseGroups.length; i++) {
      if (this.type !== 'carousel') continue;
      const seat = horseGroups[i].group;
      // Galloping bob with slight forward tilt
      const bobPhase = this.animTime * 2.5 + i * 1.2;
      seat.position.y = 1.2 + Math.sin(bobPhase) * 0.35;
      seat.rotation.x = Math.sin(bobPhase) * 0.08; // slight tilt forward/back
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SWING RIDE (Chair-O-Planes)
  // ═══════════════════════════════════════════════════════════════════════════

  _buildSwingRide() {
    const g = this.group;
    const numSwings = 6;
    const towerH = 5;
    const discR = 2.8;

    // Central tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.8, towerH, 0.8), mat(R_RED));
    tower.position.y = towerH / 2;
    tower.castShadow = true;
    g.add(tower);

    // Spinning top assembly
    const topGroup = new THREE.Group();
    topGroup.position.y = towerH;

    // Top disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(discR, discR, 0.25, 10), mat(R_YELLOW));
    disc.castShadow = true;
    topGroup.add(disc);

    // Conical canopy with circus-tent stripes
    const canopy = circusTentCone(discR + 0.5, 1.2, 6, R_RED, R_WHITE);
    canopy.position.y = 0.8;
    canopy.castShadow = true;
    topGroup.add(canopy);

    // Finial
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.4, 6), mat(R_YELLOW));
    fin.position.y = 1.5;
    topGroup.add(fin);

    // Swing chains + seats
    for (let i = 0; i < numSwings; i++) {
      const angle = (i / numSwings) * Math.PI * 2;

      // Chain pivot (at disc edge)
      const chainPivot = new THREE.Group();
      chainPivot.position.set(
        Math.cos(angle) * (discR - 0.3),
        -0.1,
        Math.sin(angle) * (discR - 0.3)
      );

      // Chain (thin box)
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2, 0.06), mat(R_METAL));
      chain.position.y = -1;
      chainPivot.add(chain);

      // Seat group (for guest)
      const seatGroup = new THREE.Group();
      seatGroup.position.y = -2.1;

      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.15, 0.5),
        mat(SEAT_COLORS[i % SEAT_COLORS.length])
      );
      seat.castShadow = true;
      seatGroup.add(seat);

      chainPivot.add(seatGroup);
      topGroup.add(chainPivot);

      this.seats.push({ group: seatGroup, occupied: false, character: null, pivot: chainPivot });
    }

    g.add(topGroup);
    this.animatedParts.topGroup = topGroup;

    // Base platform
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.25, 10), mat(0x9e8b6e));
    base.position.y = 0.12;
    base.receiveShadow = true;
    g.add(base);
  }

  _updateSwingRide() {
    const { topGroup } = this.animatedParts;
    if (!topGroup) return;

    // Speed builds up then slows down in cycles
    const speedCycle = 0.012 + Math.sin(this.animTime * 0.15) * 0.006;
    topGroup.rotation.y += speedCycle;

    // Swing angle increases with speed (centrifugal effect)
    const swingAngle = 0.25 + (speedCycle / 0.018) * 0.2;
    for (const seat of this.seats) {
      if (!seat.pivot) continue;
      const angle = Math.atan2(seat.pivot.position.z, seat.pivot.position.x);
      seat.pivot.rotation.x = Math.sin(angle + topGroup.rotation.y + Math.PI / 2) * swingAngle;
      seat.pivot.rotation.z = -Math.cos(angle + topGroup.rotation.y + Math.PI / 2) * swingAngle;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SPINNING CUPS
  // ═══════════════════════════════════════════════════════════════════════════

  _buildSpinningCups() {
    const g = this.group;
    const numCups = 4;
    const platformR = 3;

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(platformR + 0.5, platformR + 0.5, 0.2, 10), mat(0x9e8b6e));
    base.position.y = 0.1;
    base.receiveShadow = true;
    g.add(base);

    // Spinning platform
    const spinner = new THREE.Group();

    // Platform disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(platformR, platformR, 0.2, 10), mat(R_PINK));
    disc.position.y = 0.3;
    disc.receiveShadow = true;
    spinner.add(disc);

    // Center ornament
    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 1.5, 8), mat(R_YELLOW));
    center.position.y = 1.1;
    center.castShadow = true;
    spinner.add(center);
    const teapotTop = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 0.4, 8), mat(R_YELLOW));
    teapotTop.position.y = 2;
    spinner.add(teapotTop);

    // Cups
    for (let i = 0; i < numCups; i++) {
      const angle = (i / numCups) * Math.PI * 2;
      const color = SEAT_COLORS[i % SEAT_COLORS.length];

      // Arm from center to cup position
      const armLen = platformR - 1.2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, armLen), mat(R_METAL));
      arm.position.set(
        Math.cos(angle) * armLen / 2,
        0.45,
        Math.sin(angle) * armLen / 2
      );
      arm.rotation.y = -angle;
      spinner.add(arm);

      // Cup group (spins independently)
      const cupGroup = new THREE.Group();
      cupGroup.position.set(
        Math.cos(angle) * armLen,
        0.4,
        Math.sin(angle) * armLen
      );

      // Cup body (wider at top = inverted truncated cone)
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.6, 1.0, 8),
        mat(color)
      );
      cup.position.y = 0.5;
      cup.castShadow = true;
      cupGroup.add(cup);

      // Handle
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.3), mat(color));
      handle.position.set(0.85, 0.6, 0);
      cupGroup.add(handle);

      // Saucer
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 8), mat(R_WHITE));
      saucer.position.y = 0.05;
      cupGroup.add(saucer);

      spinner.add(cupGroup);

      // Seat is the cup itself
      this.seats.push({ group: cupGroup, occupied: false, character: null });
    }

    g.add(spinner);
    this.animatedParts.spinner = spinner;
    this.animatedParts.cupGroups = this.seats.map(s => s.group);

    // Decorative fence
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (a > Math.PI * 1.7 || a < Math.PI * 0.1) continue;
      const fx = Math.cos(a) * (platformR + 1);
      const fz = Math.sin(a) * (platformR + 1);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), mat(R_WOOD));
      post.position.set(fx, 0.35, fz);
      post.castShadow = true;
      g.add(post);
    }
  }

  _updateSpinningCups() {
    const { spinner, cupGroups } = this.animatedParts;
    if (!spinner) return;
    // Platform speed pulses
    spinner.rotation.y += 0.006 + Math.sin(this.animTime * 0.4) * 0.003;

    // Each cup spins with variable bursts (like guests spinning the wheel)
    if (cupGroups) {
      for (let i = 0; i < cupGroups.length; i++) {
        const burst = Math.sin(this.animTime * 1.5 + i * 2.5);
        cupGroups[i].rotation.y -= 0.015 + burst * 0.015 + i * 0.003;
        // Slight wobble
        cupGroups[i].rotation.x = Math.sin(this.animTime * 2 + i) * 0.03;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DROP TOWER
  // ═══════════════════════════════════════════════════════════════════════════

  _buildDropTower() {
    const g = this.group;
    const towerH = 13;
    const metalMat = mat(R_METAL);

    // Central tower (4 vertical rails)
    for (const [rx, rz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, towerH, 0.25), metalMat);
      rail.position.set(rx, towerH / 2, rz);
      rail.castShadow = true;
      g.add(rail);
    }

    // Cross braces every 2 units
    for (let y = 1; y < towerH; y += 2) {
      for (const axis of ['x', 'z']) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(
          axis === 'x' ? 1.05 : 0.1,
          0.1,
          axis === 'z' ? 1.05 : 0.1
        ), metalMat);
        brace.position.y = y;
        g.add(brace);
      }
    }

    // Top cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), mat(R_RED));
    cap.position.y = towerH + 0.25;
    cap.castShadow = true;
    g.add(cap);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), mat(R_YELLOW));
    beacon.position.y = towerH + 0.8;
    g.add(beacon);

    // Moving platform with seats
    const platform = new THREE.Group();
    platform.position.y = 1;

    // Platform ring
    const ring = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2.4), metalMat);
    platform.add(ring);

    // 4 seats around the tower
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const seatGroup = new THREE.Group();
      seatGroup.position.set(
        Math.cos(angle) * 1.2,
        -0.3,
        Math.sin(angle) * 1.2
      );
      seatGroup.rotation.y = -angle;

      const seatMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.3),
        mat(SEAT_COLORS[i % SEAT_COLORS.length])
      );
      seatMesh.castShadow = true;
      seatGroup.add(seatMesh);

      // Foot rest
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), metalMat);
      foot.position.y = -0.45;
      foot.position.z = 0.15;
      seatGroup.add(foot);

      platform.add(seatGroup);
      this.seats.push({ group: seatGroup, occupied: false, character: null });
    }

    g.add(platform);
    this.animatedParts.platform = platform;
    this.animatedParts.towerH = towerH;
    this.animatedParts.dropPhase = 'rising'; // rising, pause, dropping, bounce
    this.animatedParts.dropTimer = 0;

    // Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 4), mat(0x9e8b6e));
    base.position.y = 0.12;
    base.receiveShadow = true;
    g.add(base);
  }

  _updateDropTower(delta) {
    const { platform, towerH } = this.animatedParts;
    if (!platform) return;

    const speed = 1;
    this.animatedParts.dropTimer += delta * speed;
    const t = this.animatedParts.dropTimer;
    const cycleLen = 8;
    const phase = t % cycleLen;

    if (phase < 3) {
      platform.position.y = 1 + (phase / 3) * (towerH - 3);
    } else if (phase < 3.8) {
      platform.position.y = towerH - 2;
    } else if (phase < 4.3) {
      const dropT = (phase - 3.8) / 0.5;
      platform.position.y = (towerH - 2) * (1 - dropT * dropT) + 1;
    } else if (phase < 5.5) {
      const bounceT = (phase - 4.3) / 1.2;
      platform.position.y = 1 + Math.sin(bounceT * Math.PI * 3) * (2 * (1 - bounceT));
    } else {
      platform.position.y = 1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOOP COASTER — purple track with vertical loop
  // ═══════════════════════════════════════════════════════════════════════════

  _buildLoopCoaster() {
    const g = this.group;
    const trackMat = mat(R_PURPLE);
    const tieMat = mat(R_WOOD);
    const metalMat = mat(R_METAL);

    // Track curve: tight figure-8 with a vertical loop
    const pts = [
      new THREE.Vector3( 0,   0.5,  3),
      new THREE.Vector3( 3,   0.5,  3.5),
      new THREE.Vector3( 4.5, 2,    1),
      new THREE.Vector3( 4,   5,    0),    // top of loop
      new THREE.Vector3( 3,   7,   -0.5),  // loop peak
      new THREE.Vector3( 2,   5,   -1),    // loop descend
      new THREE.Vector3( 2.5, 2,   -2),
      new THREE.Vector3( 1,   0.8, -3.5),
      new THREE.Vector3(-1.5, 0.8, -3.5),
      new THREE.Vector3(-3,   2,   -2),
      new THREE.Vector3(-4,   3.5,  0),
      new THREE.Vector3(-3.5, 2,    2),
      new THREE.Vector3(-1.5, 0.5,  3.5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;

    const numSegs = 50;
    for (let i = 0; i < numSegs; i++) {
      const t = i / numSegs;
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.3), tieMat);
      tie.position.copy(pos);
      tie.lookAt(pos.clone().add(tangent));
      tie.castShadow = true;
      g.add(tie);

      for (const xOff of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.45), trackMat);
        const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
        rail.position.copy(pos).add(right.multiplyScalar(xOff));
        rail.position.y += 0.1;
        rail.lookAt(rail.position.clone().add(tangent));
        g.add(rail);
      }

      if (i % 4 === 0 && pos.y > 1) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.25, pos.y, 0.25), metalMat);
        pillar.position.set(pos.x, pos.y / 2, pos.z);
        pillar.castShadow = true;
        g.add(pillar);
      }
    }

    // Station
    const station = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 2.5), mat(0x9e8b6e));
    station.position.set(0, 0.15, 3);
    station.receiveShadow = true;
    g.add(station);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 3), mat(R_PURPLE));
    roof.position.set(0, 2.5, 3);
    roof.castShadow = true;
    g.add(roof);

    // 3-car train chain (like roller coaster)
    const NUM_CARS = 3;
    const CAR_SPACING = 0.025;
    const loopCarColors = [R_PURPLE, R_ORANGE, R_CYAN];
    const carGroups = [];
    for (let c = 0; c < NUM_CARS; c++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.2), mat(loopCarColors[c]));
      body.position.y = 0.5; body.castShadow = true; car.add(body);
      if (c > 0) {
        const conn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), mat(R_METAL));
        conn.position.set(0, 0.35, 0.7); car.add(conn);
      }
      car.position.copy(curve.getPointAt(c * CAR_SPACING));
      g.add(car); carGroups.push(car);
      this.seats.push({ group: car, occupied: false, character: null });
    }
    this.animatedParts.carGroups = carGroups;
    this.animatedParts.carSpacing = CAR_SPACING;
    this.animatedParts.carT = 0;
  }

  _updateLoopCoaster(delta) {
    const { curve, carGroups, carSpacing } = this.animatedParts;
    if (!curve || !carGroups) return;

    const curPos = curve.getPointAt(this.animatedParts.carT);
    const aheadPos = curve.getPointAt((this.animatedParts.carT + 0.02) % 1);
    const slope = aheadPos.y - curPos.y;
    const speed = 0.07 + Math.max(0, -slope * 0.08);

    this.animatedParts.carT = (this.animatedParts.carT + delta * speed) % 1;
    const t = this.animatedParts.carT;
    for (let i = 0; i < carGroups.length; i++) {
      const carT = (t - i * carSpacing + 1) % 1;
      const pos = curve.getPointAt(carT);
      const nextPos = curve.getPointAt((carT + 0.01) % 1);
      carGroups[i].position.copy(pos);
      const worldNext = this.group.localToWorld(nextPos.clone());
      carGroups[i].lookAt(worldNext);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOG FLUME — water channel with splash
  // ═══════════════════════════════════════════════════════════════════════════

  _buildLogFlume() {
    const g = this.group;
    const waterMat = mat(0x3080c0);
    const woodMat = mat(R_WOOD);

    // Channel curve
    const pts = [
      new THREE.Vector3( 0,   0.3,  3),
      new THREE.Vector3( 4,   0.3,  3),
      new THREE.Vector3( 5.5, 0.5,  1),
      new THREE.Vector3( 5,   2,   -1),
      new THREE.Vector3( 3.5, 3.5, -2.5),
      new THREE.Vector3( 0,   3.8, -3),
      new THREE.Vector3(-3,   3,   -2),
      new THREE.Vector3(-5,   1.5,  0),
      new THREE.Vector3(-4,   0.5,  2),
      new THREE.Vector3(-1.5, 0.3,  3.5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;

    // Channel segments (water trough)
    const numSegs = 40;
    for (let i = 0; i < numSegs; i++) {
      const t = i / numSegs;
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();

      // Water surface
      const water = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.2), waterMat);
      water.position.copy(pos);
      water.position.y -= 0.2;
      water.lookAt(pos.clone().add(tangent));
      g.add(water);

      // Channel walls (two sides)
      for (const xOff of [-0.9, 0.9]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 1.2), woodMat);
        const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
        wall.position.copy(pos).add(right.multiplyScalar(xOff));
        wall.lookAt(wall.position.clone().add(tangent));
        wall.castShadow = true;
        g.add(wall);
      }

      // Support pillars
      if (i % 5 === 0 && pos.y > 0.8) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, pos.y, 0.3), mat(R_METAL));
        pillar.position.set(pos.x, pos.y / 2, pos.z);
        pillar.castShadow = true;
        g.add(pillar);
      }
    }

    // Splash zone at drop point (white boxes)
    for (let i = 0; i < 6; i++) {
      const splash = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        mat(R_WHITE)
      );
      splash.position.set(
        (Math.random() - 0.5) * 2,
        0.3 + Math.random() * 0.8,
        3 + (Math.random() - 0.5)
      );
      splash.userData.splashBase = splash.position.y;
      g.add(splash);
      if (!this.animatedParts.splashes) this.animatedParts.splashes = [];
      this.animatedParts.splashes.push(splash);
    }

    // 3 log boats in a chain
    const NUM_LOGS = 3;
    const LOG_SPACING = 0.04;
    const logGroups = [];
    for (let l = 0; l < NUM_LOGS; l++) {
      const logGroup = new THREE.Group();
      const log = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 2), mat(0x6b4226));
      log.position.y = 0.1; log.castShadow = true; logGroup.add(log);
      const hollow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.4), mat(0x4a2f1a));
      hollow.position.y = 0.25; logGroup.add(hollow);
      logGroup.position.copy(curve.getPointAt(l * LOG_SPACING));
      g.add(logGroup);
      logGroups.push(logGroup);
      this.seats.push({ group: logGroup, occupied: false, character: null });
    }
    this.animatedParts.logGroups = logGroups;
    this.animatedParts.logSpacing = LOG_SPACING;
    this.animatedParts.logT = 0;

    // Platform
    const platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 3), mat(0x9e8b6e));
    platform.position.set(0, 0.12, 3);
    platform.receiveShadow = true;
    g.add(platform);
  }

  _updateLogFlume(delta) {
    const { curve, logGroups, logSpacing, splashes } = this.animatedParts;
    if (!curve || !logGroups) return;

    // Speed varies with slope
    const curPos = curve.getPointAt(this.animatedParts.logT);
    const aheadPos = curve.getPointAt((this.animatedParts.logT + 0.02) % 1);
    const slope = aheadPos.y - curPos.y;
    const speed = 0.04 + Math.max(0, -slope * 0.1);

    this.animatedParts.logT = (this.animatedParts.logT + delta * speed) % 1;
    const t = this.animatedParts.logT;

    for (let i = 0; i < logGroups.length; i++) {
      const logT = (t - i * logSpacing + 1) % 1;
      const pos = curve.getPointAt(logT);
      const nextPos = curve.getPointAt((logT + 0.01) % 1);
      logGroups[i].position.copy(pos);
      const worldNext = this.group.localToWorld(nextPos.clone());
      logGroups[i].lookAt(worldNext);
      // Tilt on slopes
      const lSlope = curve.getPointAt((logT + 0.02) % 1).y - pos.y;
      logGroups[i].rotation.x = lSlope * 0.5;
    }

    // Animate splash particles (bigger splashes at high speed)
    if (splashes) {
      const splashIntensity = speed > 0.06 ? 1.5 : 1;
      for (const s of splashes) {
        s.position.y = s.userData.splashBase + Math.sin(this.animTime * 3 + s.position.x * 5) * 0.3 * splashIntensity;
        s.material.opacity = 0.5 + Math.sin(this.animTime * 2 + s.position.z) * 0.3;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PIRATE SHIP — swinging pendulum
  // ═══════════════════════════════════════════════════════════════════════════

  _buildPirateShip() {
    const g = this.group;
    const metalMat = mat(R_METAL);

    // A-frame supports — spread wide so hull clears them during swing
    for (const zOff of [-3, 3]) {
      for (const xSign of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.35), metalMat);
        leg.position.set(xSign * 1.5, 3, zOff);
        leg.rotation.z = -xSign * 0.2;
        leg.castShadow = true;
        g.add(leg);
      }
      const cross = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 0.3), metalMat);
      cross.position.set(0, 6.2, zOff);
      g.add(cross);
    }

    // Axle
    const axle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 7), metalMat);
    axle.position.set(0, 6, 0);
    g.add(axle);

    // Swinging ship assembly (pivots at axle)
    const shipPivot = new THREE.Group();
    shipPivot.position.set(0, 6, 0);

    // Arm connecting axle to ship
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), metalMat);
    arm.position.y = -2;
    shipPivot.add(arm);

    // Ship hull
    const hullGroup = new THREE.Group();
    hullGroup.position.y = -4.5;

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 4), mat(0x6b3020));
    hull.castShadow = true;
    hullGroup.add(hull);

    // Ship bow (pointed front)
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1), mat(0x6b3020));
    bow.position.set(0, 0.1, 2.3);
    bow.rotation.x = -0.2;
    hullGroup.add(bow);

    // Ship stern
    const stern = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.6), mat(0x6b3020));
    stern.position.set(0, 0.2, -2);
    hullGroup.add(stern);

    // Deck railing
    for (const xOff of [-0.8, 0.8]) {
      const railing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 3.8), mat(R_YELLOW));
      railing.position.set(xOff, 0.7, 0);
      hullGroup.add(railing);
    }

    // Mast
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.15), mat(R_WOOD));
    mast.position.set(0, 1.7, 0);
    hullGroup.add(mast);
    // Flag
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), mat(0x1a1a1a));
    flag.position.set(0.5, 2.8, 0);
    hullGroup.add(flag);

    shipPivot.add(hullGroup);
    g.add(shipPivot);

    this.animatedParts.shipPivot = shipPivot;
    this.animatedParts.hullGroup = hullGroup;

    // 4 seats along the ship
    for (let i = 0; i < 4; i++) {
      const seatGroup = new THREE.Group();
      seatGroup.position.set(0, 0.5, -1.2 + i * 0.8);
      hullGroup.add(seatGroup);
      this.seats.push({ group: seatGroup, occupied: false, character: null });
    }

    // Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 5), mat(0x9e8b6e));
    base.position.set(0, 0.12, 0);
    base.receiveShadow = true;
    g.add(base);
  }

  _updatePirateShip() {
    const { shipPivot } = this.animatedParts;
    if (!shipPivot) return;
    // Pendulum swing — builds up to full swing then eases back (20s cycle)
    const cycle = (this.animTime * 0.05) % 1; // 0→1 over ~20s
    const envelope = cycle < 0.6
      ? Math.min(1, cycle / 0.3)   // ramp up over first 30%
      : Math.max(0.3, 1 - (cycle - 0.6) / 0.4); // ease back
    const maxAngle = 0.3 + envelope * 0.55;
    const swing = Math.sin(this.animTime * 0.8) * maxAngle;
    shipPivot.rotation.z = swing;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BUMPER CARS — walled arena with orbiting cars
  // ═══════════════════════════════════════════════════════════════════════════

  _buildBumperCars() {
    const g = this.group;
    const wallMat = mat(R_BLUE);

    // Arena floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.15, 6), mat(0x606060));
    floor.position.y = 0.08;
    floor.receiveShadow = true;
    g.add(floor);

    // Arena walls
    for (const [w, h, d, x, z] of [
      [8.4, 1, 0.3, 0, -3],   // back
      [8.4, 1, 0.3, 0,  3],   // front (with gap)
      [0.3, 1, 6.3, -4, 0],   // left
      [0.3, 1, 6.3,  4, 0],   // right
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, 0.6, z);
      wall.castShadow = true;
      g.add(wall);
    }

    // Stripe on walls
    const stripeMat = mat(R_YELLOW);
    for (const [w, d, x, z] of [[8.4, 0.3, 0, -3], [8.4, 0.3, 0, 3], [0.3, 6.3, -4, 0], [0.3, 6.3, 4, 0]]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), stripeMat);
      stripe.position.set(x, 1.05, z);
      g.add(stripe);
    }

    // No roof — open air bumper cars arena

    // Bumper cars (4, each orbiting differently)
    const carColors = [R_RED, R_YELLOW, R_GREEN, R_CYAN];
    const carGroups = [];
    for (let i = 0; i < 4; i++) {
      const carGroup = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.2), mat(carColors[i]));
      body.position.y = 0.4;
      body.castShadow = true;
      carGroup.add(body);
      // Bumper ring
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1.4), mat(R_METAL));
      bumper.position.y = 0.25;
      carGroup.add(bumper);
      // Antenna
      const ant = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), mat(R_METAL));
      ant.position.set(0, 0.9, -0.4);
      carGroup.add(ant);

      g.add(carGroup);
      carGroups.push(carGroup);
      this.seats.push({ group: carGroup, occupied: false, character: null });
    }
    this.animatedParts.carGroups = carGroups;
  }

  _updateBumperCars(delta) {
    const { carGroups } = this.animatedParts;
    if (!carGroups) return;

    // Initialize per-car state if needed
    if (!this.animatedParts.bumperStates) {
      this.animatedParts.bumperStates = carGroups.map((_, i) => ({
        angle: (i / 4) * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.5,
        turnRate: (Math.random() - 0.5) * 2,
        turnTimer: 1 + Math.random() * 2,
        bumpCooldown: 0,
      }));
    }
    const states = this.animatedParts.bumperStates;

    for (let i = 0; i < carGroups.length; i++) {
      const s = states[i];
      s.turnTimer -= delta;
      s.bumpCooldown -= delta;

      // Change direction randomly
      if (s.turnTimer <= 0) {
        s.turnRate = (Math.random() - 0.5) * 3;
        s.speed = 0.4 + Math.random() * 0.6;
        s.turnTimer = 0.8 + Math.random() * 2;
      }

      s.angle += s.turnRate * delta;
      const car = carGroups[i];
      const dx = Math.cos(s.angle) * s.speed * delta * 3;
      const dz = Math.sin(s.angle) * s.speed * delta * 3;
      const nx = car.position.x + dx;
      const nz = car.position.z + dz;

      // Keep in arena bounds
      if (Math.abs(nx) < 3.5 && Math.abs(nz) < 2.5) {
        car.position.x = nx;
        car.position.z = nz;
      } else {
        s.angle += Math.PI * 0.7; // bounce off wall
        s.turnTimer = 0; // immediate turn change
      }

      car.rotation.y = s.angle + Math.PI / 2;

      // Bump detection — check proximity to other cars
      for (let j = i + 1; j < carGroups.length; j++) {
        const other = carGroups[j];
        const dist = car.position.distanceTo(other.position);
        if (dist < 1.5 && s.bumpCooldown <= 0) {
          // Bump! Both cars wobble
          car.rotation.z = (Math.random() - 0.5) * 0.3;
          other.rotation.z = (Math.random() - 0.5) * 0.3;
          s.angle += Math.PI * 0.5;
          states[j].angle -= Math.PI * 0.5;
          s.bumpCooldown = 0.5;
          states[j].bumpCooldown = 0.5;
        }
      }

      // Recover wobble from bumps
      car.rotation.z *= 0.92;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HAUNTED HOUSE — dark ride building
  // ═══════════════════════════════════════════════════════════════════════════

  _buildHauntedHouse() {
    const g = this.group;
    const darkMat = mat(0x302030);
    const trimMat = mat(0x504050);

    // Main building
    const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), darkMat);
    walls.position.y = 2;
    walls.castShadow = true;
    g.add(walls);

    // Peaked roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.5, 2.5, 4), mat(0x201820));
    roof.position.y = 5;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // Tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 1.5), darkMat);
    tower.position.set(-2.5, 5, -1.5);
    tower.castShadow = true;
    g.add(tower);
    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.5, 4), mat(0x201820));
    towerRoof.position.set(-2.5, 7, -1.5);
    towerRoof.rotation.y = Math.PI / 4;
    g.add(towerRoof);

    // Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.1), mat(0x4a2020));
    door.position.set(0, 1.25, 3.05);
    g.add(door);

    // Boarded windows on ALL faces
    const windowPositions = [
      // Front face (z = 3.05)
      [-2.5, 2.5, 3.05, 0], [2.5, 2.5, 3.05, 0],
      // Back face (z = -3.05)
      [-2.5, 2.5, -3.05, 0], [2.5, 2.5, -3.05, 0], [0, 3, -3.05, 0],
      // Left face (x = -4.05) — rotated 90°
      [-4.05, 2.5, -1, 1], [-4.05, 2.5, 1.5, 1],
      // Right face (x = 4.05) — rotated 90°
      [4.05, 2.5, -1, 1], [4.05, 2.5, 1.5, 1], [4.05, 3, 0, 1],
    ];
    for (const [wx, wy, wz, rotated] of windowPositions) {
      const winW = rotated ? 0.1 : 1, winD = rotated ? 1 : 0.1;
      const win = new THREE.Mesh(new THREE.BoxGeometry(winW, 1, winD), mat(0x605020));
      win.position.set(wx, wy, wz);
      g.add(win);
      // Board
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.15), mat(R_WOOD));
      board.position.set(wx, 2.5, wz + 0.1);
      board.rotation.z = 0.3;
      g.add(board);
    }

    // Bats on roof
    const bats = [];
    for (let i = 0; i < 4; i++) {
      const batGroup = new THREE.Group();
      batGroup.position.set(
        (Math.random() - 0.5) * 6,
        5.5 + Math.random() * 2,
        (Math.random() - 0.5) * 4
      );
      // Body
      const batBody = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), mat(0x1a1a1a));
      batGroup.add(batBody);
      // Wings
      for (const xSign of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.2), mat(0x2a2a2a));
        wing.position.set(xSign * 0.25, 0, 0);
        wing.userData.wingSign = xSign;
        batGroup.add(wing);
      }
      g.add(batGroup);
      bats.push(batGroup);
    }
    this.animatedParts.bats = bats;

    // Lanterns
    const lantern1 = new THREE.PointLight(0xff6600, 0.8, 6);
    lantern1.position.set(-1, 2.5, 3.2);
    g.add(lantern1);
    const lantern2 = new THREE.PointLight(0xff6600, 0.8, 6);
    lantern2.position.set(1, 2.5, 3.2);
    g.add(lantern2);
    this.animatedParts.lanterns = [lantern1, lantern2];

    // Cart (exits from door, loops back)
    const cartGroup = new THREE.Group();
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1.4), mat(0x3a1a3a));
    cart.position.y = 0.4;
    cart.castShadow = true;
    cartGroup.add(cart);
    cartGroup.position.set(0, 0, 3.5);
    g.add(cartGroup);

    this.seats.push({ group: cartGroup, occupied: false, character: null });
    this.seats.push({ group: cartGroup, occupied: false, character: null });

    // Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 7), mat(0x505050));
    base.position.y = 0.07;
    base.receiveShadow = true;
    g.add(base);
  }

  _updateHauntedHouse() {
    const { bats, lanterns } = this.animatedParts;
    // Bats flutter
    if (bats) {
      for (let i = 0; i < bats.length; i++) {
        const bat = bats[i];
        bat.position.y += Math.sin(this.animTime * 3 + i * 2) * 0.003;
        bat.position.x += Math.sin(this.animTime * 0.5 + i) * 0.003;
        bat.children.forEach(child => {
          if (child.userData.wingSign) {
            child.rotation.z = child.userData.wingSign * Math.sin(this.animTime * 8 + i) * 0.4;
          }
        });
      }
    }
    // Lantern flicker
    if (lanterns) {
      for (const l of lanterns) {
        l.intensity = 0.6 + Math.sin(this.animTime * 5) * 0.3 + Math.random() * 0.1;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GO-KARTS — oval track with karts
  // ═══════════════════════════════════════════════════════════════════════════

  _buildGoKarts() {
    const g = this.group;
    const trackMat = mat(0x404040);
    const barrierMat = mat(R_RED);

    // Oval track curve
    const pts = [];
    const rx = 5.5, rz = 3.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * rx, 0.1, Math.sin(a) * rz));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;

    // Track surface segments
    for (let i = 0; i < 30; i++) {
      const t = i / 30;
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.5), trackMat);
      seg.position.copy(pos);
      seg.lookAt(pos.clone().add(tangent));
      seg.receiveShadow = true;
      g.add(seg);
    }

    // Barriers (inner and outer)
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

      for (const [off, c] of [[1.4, barrierMat], [-1.4, mat(R_WHITE)]]) {
        const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 1.2), c);
        barrier.position.copy(pos).add(right.multiplyScalar(off));
        barrier.position.y = 0.3;
        barrier.lookAt(barrier.position.clone().add(tangent));
        barrier.castShadow = true;
        g.add(barrier);
      }
    }

    // Tyre barriers at corners
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const tx = Math.cos(a) * (rx + 1.8);
      const tz = Math.sin(a) * (rz + 1.8);
      for (let j = 0; j < 3; j++) {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 6), mat(0x1a1a1a));
        tyre.position.set(tx + (Math.random() - 0.5) * 0.4, 0.15, tz + (Math.random() - 0.5) * 0.4);
        tyre.rotation.x = Math.PI / 2;
        g.add(tyre);
      }
    }

    // 4 karts
    const kartColors = [R_RED, R_BLUE, R_YELLOW, R_GREEN];
    const kartGroups = [];
    for (let i = 0; i < 4; i++) {
      const kart = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.2), mat(kartColors[i]));
      body.position.y = 0.3;
      body.castShadow = true;
      kart.add(body);
      // Engine block
      const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), mat(R_METAL));
      engine.position.set(0, 0.4, -0.5);
      kart.add(engine);
      // 4 tiny wheels
      for (const [wx, wz] of [[-0.35, 0.35], [0.35, 0.35], [-0.35, -0.35], [0.35, -0.35]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6), mat(0x1a1a1a));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.12, wz);
        kart.add(wheel);
      }
      g.add(kart);
      kartGroups.push(kart);
      this.seats.push({ group: kart, occupied: false, character: null });
    }
    this.animatedParts.kartGroups = kartGroups;
    this.animatedParts.kartTs = [0, 0.25, 0.5, 0.75]; // staggered positions
  }

  _updateGoKarts(delta) {
    const { curve, kartGroups, kartTs } = this.animatedParts;
    if (!curve || !kartGroups) return;

    // Initialize per-kart speed variation if not set
    if (!this.animatedParts.kartSpeeds) {
      this.animatedParts.kartSpeeds = kartGroups.map(() => 0.06 + Math.random() * 0.02);
      this.animatedParts.kartSpeedTimers = kartGroups.map(() => Math.random() * 5);
    }
    const { kartSpeeds, kartSpeedTimers } = this.animatedParts;

    for (let i = 0; i < kartGroups.length; i++) {
      // Simulate racing — speed fluctuates (bursts and coasting)
      kartSpeedTimers[i] -= delta;
      if (kartSpeedTimers[i] <= 0) {
        kartSpeeds[i] = 0.04 + Math.random() * 0.05; // speed burst or coast
        kartSpeedTimers[i] = 1 + Math.random() * 3;   // change again in 1-4s
      }

      kartTs[i] = (kartTs[i] + delta * kartSpeeds[i]) % 1;
      const pos = curve.getPointAt(kartTs[i]);
      const nextPos = curve.getPointAt((kartTs[i] + 0.01) % 1);
      kartGroups[i].position.copy(pos);
      // Fix: use world-space lookAt so karts turn with the track
      const worldNext = this.group.localToWorld(nextPos.clone());
      kartGroups[i].lookAt(worldNext);

      // Keep karts level (no pitch from lookAt), slight lean into turns
      kartGroups[i].rotation.x = 0; // prevent nose-diving
      const tangent = curve.getTangentAt(kartTs[i]);
      const nextTangent = curve.getTangentAt((kartTs[i] + 0.02) % 1);
      const turnRate = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
      kartGroups[i].rotation.z = Math.max(-0.15, Math.min(0.15, -turnRate * 2)); // clamped lean
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  OBSERVATION TOWER — rotating cabin, gentle rise/lower
  // ═══════════════════════════════════════════════════════════════════════════

  _buildObservationTower() {
    const g = this.group;
    const metalMat = mat(R_METAL);
    const towerH = 12;

    // Central column
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, towerH, 8), metalMat);
    column.position.y = towerH / 2;
    column.castShadow = true;
    g.add(column);

    // Cross braces
    for (let y = 2; y < towerH; y += 3) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), metalMat);
      brace.position.y = y;
      g.add(brace);
      const brace2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), metalMat);
      brace2.position.y = y;
      g.add(brace2);
    }

    // Top cap
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1, 8), mat(R_RED));
    cap.position.y = towerH + 0.5;
    g.add(cap);

    // Rotating observation cabin
    const cabin = new THREE.Group();

    // Cabin body (hexagonal-ish box with windows)
    const cabinBody = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2, 8), mat(R_CYAN));
    cabinBody.castShadow = true;
    cabin.add(cabinBody);

    // Window band
    const windowBand = new THREE.Mesh(
      new THREE.CylinderGeometry(2.05, 2.05, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, flatShading: true })
    );
    windowBand.position.y = 0.3;
    cabin.add(windowBand);

    // Floor
    const cabinFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.15, 8), metalMat);
    cabinFloor.position.y = -1;
    cabin.add(cabinFloor);

    cabin.position.y = towerH * 0.6;
    g.add(cabin);

    this.animatedParts.cabin = cabin;
    this.animatedParts.towerH = towerH;

    // 4 seats inside cabin
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const seatGroup = new THREE.Group();
      seatGroup.position.set(Math.cos(angle) * 1.2, -0.5, Math.sin(angle) * 1.2);
      cabin.add(seatGroup);
      this.seats.push({ group: seatGroup, occupied: false, character: null });
    }

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.25, 8), mat(0x9e8b6e));
    base.position.y = 0.12;
    base.receiveShadow = true;
    g.add(base);
  }

  _updateObservationTower() {
    const { cabin, towerH } = this.animatedParts;
    if (!cabin) return;
    cabin.rotation.y += 0.004;
    const cycle = Math.sin(this.animTime * 0.2) * 0.5 + 0.5;
    cabin.position.y = towerH * 0.4 + cycle * (towerH * 0.4);
    // Beacon pulse
    if (this.animatedParts.beacon) {
      const pulse = 0.8 + Math.sin(this.animTime * 3) * 0.4;
      this.animatedParts.beacon.scale.setScalar(pulse);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MINI RAILWAY — small looping track with a train
  // ═══════════════════════════════════════════════════════════════════════════

  _buildMiniRailway() {
    const g = this.group;
    const pts = [
      new THREE.Vector3(-7, 0.3, 0), new THREE.Vector3(-5, 0.3, 1.5),
      new THREE.Vector3(0, 0.3, 1.5), new THREE.Vector3(5, 0.3, 1.5),
      new THREE.Vector3(7, 0.3, 0), new THREE.Vector3(5, 0.3, -1.5),
      new THREE.Vector3(0, 0.3, -1.5), new THREE.Vector3(-5, 0.3, -1.5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;
    // Track
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const pos = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.2), mat(R_WOOD));
      tie.position.copy(pos); tie.lookAt(pos.clone().add(tan)); g.add(tie);
    }
    // Train cars
    const trainColors = [R_RED, R_BLUE, R_GREEN, R_YELLOW];
    const cars = [];
    for (let c = 0; c < 4; c++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.2), mat(trainColors[c]));
      body.position.y = 0.4; body.castShadow = true; car.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.0), mat(trainColors[c]));
      roof.position.y = 0.75; car.add(roof);
      g.add(car); cars.push(car);
      this.seats.push({ group: car, occupied: false, character: null });
      this.seats.push({ group: car, occupied: false, character: null });
    }
    this.animatedParts.cars = cars;
    this.animatedParts.trainT = 0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 5), mat(0x9e8b6e));
    base.position.y = 0.07; base.receiveShadow = true; g.add(base);
  }
  _updateMiniRailway(delta) {
    const { curve, cars } = this.animatedParts;
    if (!curve || !cars) return;
    this.animatedParts.trainT = (this.animatedParts.trainT + delta * 0.03) % 1;
    for (let i = 0; i < cars.length; i++) {
      const t = (this.animatedParts.trainT - i * 0.06 + 1) % 1;
      const pos = curve.getPointAt(t);
      const next = curve.getPointAt((t + 0.01) % 1);
      cars[i].position.copy(pos);
      const wn = this.group.localToWorld(next.clone());
      cars[i].lookAt(wn);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MERRY-GO-ROUND — gentle spinning platform with horses
  // ═══════════════════════════════════════════════════════════════════════════

  _buildMerryGoRound() {
    const g = this.group;
    const R = 2.5, numH = 8;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.2, 12), mat(0x9e8b6e));
    base.position.y = 0.1; base.receiveShadow = true; g.add(base);
    const spinner = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.15, 12), mat(R_YELLOW));
    disc.position.y = 0.3; spinner.add(disc);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.5, 6), mat(R_RED));
    pole.position.y = 2; spinner.add(pole);
    const roof = circusTentCone(R + 0.5, 1.5, 8, R_RED, R_WHITE);
    roof.position.y = 4; spinner.add(roof);
    for (let i = 0; i < numH; i++) {
      const a = (i / numH) * Math.PI * 2;
      const hx = Math.cos(a) * (R - 0.5), hz = Math.sin(a) * (R - 0.5);
      const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 4), mat(R_METAL));
      hp.position.set(hx, 1.5, hz); spinner.add(hp);
      const sg = new THREE.Group();
      sg.position.set(hx, 1, hz); sg.rotation.y = -a;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.9), mat(SEAT_COLORS[i % SEAT_COLORS.length]));
      body.castShadow = true; sg.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), mat(SEAT_COLORS[i % SEAT_COLORS.length]));
      head.position.set(0, 0.25, 0.45); sg.add(head);
      spinner.add(sg);
      this.seats.push({ group: sg, occupied: false, character: null });
    }
    g.add(spinner);
    this.animatedParts.spinner = spinner;
    this.animatedParts.numH = numH;
  }
  _updateMerryGoRound() {
    const { spinner, numH } = this.animatedParts;
    if (!spinner) return;
    spinner.rotation.y += 0.006;
    for (let i = 0; i < this.seats.length; i++) {
      if (this.type !== 'merry_go_round') continue;
      this.seats[i].group.position.y = 1 + Math.sin(this.animTime * 1.8 + i * 0.9) * 0.2;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TOP SPIN — pendulum + rotating gondola
  // ═══════════════════════════════════════════════════════════════════════════

  _buildTopSpin() {
    const g = this.group;
    const metalMat = mat(R_METAL);
    for (const zOff of [-3, 3]) {
      for (const xSign of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), metalMat);
        leg.position.set(xSign * 2, 3.5, zOff); leg.rotation.z = -xSign * 0.1; leg.castShadow = true; g.add(leg);
      }
      const cross = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 0.3), metalMat);
      cross.position.set(0, 7.2, zOff); g.add(cross);
    }
    const axle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 7), metalMat);
    axle.position.set(0, 7, 0); g.add(axle);
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 7, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 0.25), metalMat);
    arm.position.y = -2.5; armPivot.add(arm);
    const gondola = new THREE.Group();
    gondola.position.y = -5;
    const gondolaBody = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 2), mat(R_ORANGE));
    gondolaBody.castShadow = true; gondola.add(gondolaBody);
    for (let i = 0; i < 8; i++) {
      const sg = new THREE.Group();
      sg.position.set((i - 3.5) * 0.5, -0.2, (i % 2 === 0) ? 0.5 : -0.5);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.3), mat(SEAT_COLORS[i % SEAT_COLORS.length]));
      seat.castShadow = true; sg.add(seat);
      gondola.add(sg);
      this.seats.push({ group: sg, occupied: false, character: null });
    }
    armPivot.add(gondola);
    g.add(armPivot);
    this.animatedParts.armPivot = armPivot;
    this.animatedParts.gondola = gondola;
    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 7), mat(0x9e8b6e));
    base.position.y = 0.12; base.receiveShadow = true; g.add(base);
  }
  _updateTopSpin(delta) {
    const { armPivot, gondola } = this.animatedParts;
    if (!armPivot) return;
    const swing = Math.sin(this.animTime * 0.6) * (0.8 + Math.sin(this.animTime * 0.1) * 0.4);
    armPivot.rotation.z = swing;
    gondola.rotation.z = -swing + Math.sin(this.animTime * 1.2) * 0.5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RIVER RAPIDS — circular raft on water channel
  // ═══════════════════════════════════════════════════════════════════════════

  _buildRiverRapids() {
    const g = this.group;
    const waterMat = mat(0x3080c0);
    const pts = [
      new THREE.Vector3(0, 0.3, 6), new THREE.Vector3(5, 0.3, 5),
      new THREE.Vector3(7, 0.3, 0), new THREE.Vector3(5, 0.3, -5),
      new THREE.Vector3(0, 0.3, -6), new THREE.Vector3(-5, 0.3, -5),
      new THREE.Vector3(-7, 0.3, 0), new THREE.Vector3(-5, 0.3, 5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;
    for (let i = 0; i < 50; i++) {
      const t = i / 50;
      const pos = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const water = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.5), waterMat);
      water.position.copy(pos); water.position.y -= 0.1; water.lookAt(pos.clone().add(tan)); g.add(water);
      for (const xOff of [-1.3, 1.3]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.5), mat(0x808080));
        const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        wall.position.copy(pos).add(right.multiplyScalar(xOff)); wall.lookAt(wall.position.clone().add(tan)); g.add(wall);
      }
    }
    const raft = new THREE.Group();
    const raftBody = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.4, 8), mat(R_YELLOW));
    raftBody.position.y = 0.2; raftBody.castShadow = true; raft.add(raftBody);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sg = new THREE.Group();
      sg.position.set(Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5);
      raft.add(sg);
      this.seats.push({ group: sg, occupied: false, character: null });
    }
    raft.position.copy(curve.getPointAt(0));
    g.add(raft);
    this.animatedParts.raft = raft;
    this.animatedParts.raftT = 0;
  }
  _updateRiverRapids(delta) {
    const { curve, raft } = this.animatedParts;
    if (!curve || !raft) return;
    this.animatedParts.raftT = (this.animatedParts.raftT + delta * 0.03) % 1;
    const pos = curve.getPointAt(this.animatedParts.raftT);
    const next = curve.getPointAt((this.animatedParts.raftT + 0.01) % 1);
    raft.position.copy(pos);
    const wn = this.group.localToWorld(next.clone());
    raft.lookAt(wn);
    raft.rotation.y += Math.sin(this.animTime * 2) * 0.02; // raft spin
    // Raft bounce on rapids
    raft.position.y += Math.sin(this.animTime * 4) * 0.08;
    raft.rotation.x = Math.sin(this.animTime * 3) * 0.04; // pitch
    raft.rotation.z = Math.sin(this.animTime * 2.5 + 1) * 0.03; // roll
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WILD MOUSE — sharp hairpin coaster
  // ═══════════════════════════════════════════════════════════════════════════

  _buildWildMouse() {
    const g = this.group;
    const pts = [
      new THREE.Vector3(0, 0.5, 4), new THREE.Vector3(4, 2, 3),
      new THREE.Vector3(5, 3, 0), new THREE.Vector3(4, 3.5, -3),
      new THREE.Vector3(0, 3, -4), new THREE.Vector3(-4, 2.5, -3),
      new THREE.Vector3(-5, 2, 0), new THREE.Vector3(-4, 1, 3),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.3);
    this.animatedParts.curve = curve;
    const trackMat = mat(R_YELLOW);
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const pos = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.25), mat(R_METAL));
      tie.position.copy(pos); tie.lookAt(pos.clone().add(tan)); tie.castShadow = true; g.add(tie);
      for (const xOff of [-0.5, 0.5]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.4), trackMat);
        const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        rail.position.copy(pos).add(right.multiplyScalar(xOff)); rail.position.y += 0.08;
        rail.lookAt(rail.position.clone().add(tan)); g.add(rail);
      }
      if (i % 4 === 0 && pos.y > 1) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.25, pos.y, 0.25), mat(R_METAL));
        pillar.position.set(pos.x, pos.y / 2, pos.z); pillar.castShadow = true; g.add(pillar);
      }
    }
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.2), mat(R_ORANGE));
    body.position.y = 0.5; body.castShadow = true; car.add(body);
    car.position.copy(curve.getPointAt(0)); g.add(car);
    this.animatedParts.car = car; this.animatedParts.carT = 0;
    this.seats.push({ group: car, occupied: false, character: null });
    this.seats.push({ group: car, occupied: false, character: null });
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 8), mat(0x9e8b6e));
    base.position.y = 0.07; base.receiveShadow = true; g.add(base);
  }
  _updateWildMouse(delta) {
    const { curve, car } = this.animatedParts;
    if (!curve || !car) return;
    const curPos = curve.getPointAt(this.animatedParts.carT);
    const ahead = curve.getPointAt((this.animatedParts.carT + 0.02) % 1);
    const slope = ahead.y - curPos.y;
    const speed = 0.06 + Math.max(0, -slope * 0.1);
    this.animatedParts.carT = (this.animatedParts.carT + delta * speed) % 1;
    const pos = curve.getPointAt(this.animatedParts.carT);
    const next = curve.getPointAt((this.animatedParts.carT + 0.01) % 1);
    car.position.copy(pos);
    const wn = this.group.localToWorld(next.clone());
    car.lookAt(wn);
    // Dramatic lean on hairpin turns
    car.rotation.x = 0;
    const tan = curve.getTangentAt(this.animatedParts.carT);
    const nTan = curve.getTangentAt((this.animatedParts.carT + 0.02) % 1);
    const turnRate = tan.x * nTan.z - tan.z * nTan.x;
    car.rotation.z = Math.max(-0.3, Math.min(0.3, -turnRate * 5));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ENTERPRISE — spinning wheel that tilts upright
  // ═══════════════════════════════════════════════════════════════════════════

  _buildEnterprise() {
    const g = this.group;
    const metalMat = mat(R_METAL);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), metalMat);
    tower.position.y = 3; tower.castShadow = true; g.add(tower);
    const tiltPivot = new THREE.Group();
    tiltPivot.position.y = 5.5;
    const wheel = new THREE.Group();
    const numSeats = 16;
    const wheelR = 4;
    for (let i = 0; i < numSeats; i++) {
      const a = (i / numSeats) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 2, 0.08, 0.08), metalMat);
      spoke.rotation.z = a; wheel.add(spoke);
      const sg = new THREE.Group();
      sg.position.set(Math.cos(a) * wheelR, Math.sin(a) * wheelR, 0);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), mat(SEAT_COLORS[i % SEAT_COLORS.length]));
      seat.castShadow = true; sg.add(seat);
      wheel.add(sg);
      this.seats.push({ group: sg, occupied: false, character: null });
    }
    // Rim
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), metalMat);
      seg.position.set(Math.cos(a) * wheelR, Math.sin(a) * wheelR, 0);
      seg.rotation.z = a + Math.PI / 2; wheel.add(seg);
    }
    tiltPivot.add(wheel);
    g.add(tiltPivot);
    this.animatedParts.wheel = wheel;
    this.animatedParts.tiltPivot = tiltPivot;
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 9), mat(0x9e8b6e));
    base.position.y = 0.12; base.receiveShadow = true; g.add(base);
  }
  _updateEnterprise() {
    const { wheel, tiltPivot } = this.animatedParts;
    if (!wheel) return;
    wheel.rotation.z += 0.015;
    // Tilt gradually upright then back down
    const tiltCycle = (this.animTime * 0.08) % 1;
    const tilt = tiltCycle < 0.5
      ? Math.min(Math.PI / 2 * 0.85, tiltCycle * 2 * Math.PI / 2 * 0.85)
      : Math.max(0, (1 - tiltCycle) * 2 * Math.PI / 2 * 0.85);
    tiltPivot.rotation.x = tilt;
    // Counter-rotate seats to stay upright (when tilted)
    for (const s of this.seats) {
      if (this.type !== 'enterprise') continue;
      s.group.rotation.z = -wheel.rotation.z;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GHOST TRAIN — spooky tunnel ride
  // ═══════════════════════════════════════════════════════════════════════════

  _buildGhostTrain() {
    const g = this.group;
    const darkMat = mat(0x1a1a2e);
    const purpleMat = mat(0x4a2060);
    // Building
    const building = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), darkMat);
    building.position.y = 2.5; building.castShadow = true; g.add(building);
    // Peaked roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 7), purpleMat);
    roof.position.y = 5.2; roof.castShadow = true; g.add(roof);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 5), purpleMat);
    peak.position.y = 5.7; g.add(peak);
    // Entrance arch (dark opening)
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 0.3), mat(0x000000));
    entrance.position.set(0, 1.5, 3.1); g.add(entrance);
    // Skull above entrance
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), mat(0xe0e0d0));
    skull.position.set(0, 3.5, 3.2); g.add(skull);
    for (const ex of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.1), mat(0xd03020));
      eye.position.set(ex, 3.55, 3.55); g.add(eye);
    }
    // Spooky fence
    for (let i = -3; i <= 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), mat(0x303030));
      post.position.set(i * 1.2, 0.75, 3.5); post.castShadow = true; g.add(post);
      const point = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), mat(0x303030));
      point.position.set(i * 1.2, 1.6, 3.5); g.add(point);
    }
    // Track (hidden inside but car emerges)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.3, 3.5), new THREE.Vector3(2, 0.3, 0),
      new THREE.Vector3(0, 0.3, -2), new THREE.Vector3(-2, 0.3, 0),
    ], true, 'catmullrom', 0.5);
    this.animatedParts.curve = curve;
    const cart = new THREE.Group();
    const cartBody = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 1.6), purpleMat);
    cartBody.position.y = 0.5; cartBody.castShadow = true; cart.add(cartBody);
    cart.position.copy(curve.getPointAt(0)); g.add(cart);
    this.animatedParts.cart = cart; this.animatedParts.cartT = 0;
    this.seats.push({ group: cart, occupied: false, character: null });
    this.seats.push({ group: cart, occupied: false, character: null });
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 7), mat(0x9e8b6e));
    base.position.y = 0.07; base.receiveShadow = true; g.add(base);
  }
  _updateGhostTrain(delta) {
    const { curve, cart, cartLantern } = this.animatedParts;
    if (!curve || !cart) return;
    this.animatedParts.cartT = (this.animatedParts.cartT + delta * 0.025) % 1;
    const pos = curve.getPointAt(this.animatedParts.cartT);
    const next = curve.getPointAt((this.animatedParts.cartT + 0.01) % 1);
    cart.position.copy(pos);
    const wn = this.group.localToWorld(next.clone());
    cart.lookAt(wn);
    // Lantern flicker
    if (cartLantern) {
      const flicker = 0.7 + Math.sin(this.animTime * 8) * 0.2 + Math.random() * 0.15;
      cartLantern.scale.setScalar(flicker);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VISUAL DETAIL PASS — adds decorative elements to all rides after build
  // ═══════════════════════════════════════════════════════════════════════════

  _addVisualDetails() {
    const g = this.group;
    const metalMat = mat(R_METAL);
    const woodMat = mat(R_WOOD);
    const darkMat = mat(0x1a1a1a);
    const yellowMat = mat(R_YELLOW);
    const whiteMat = mat(R_WHITE);

    switch (this.type) {

      case 'ferris_wheel': {
        // Decorative lights along rim
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const light = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), yellowMat);
          light.position.set(Math.cos(a) * 5, Math.sin(a) * 5 + 6.5, 0);
          g.add(light);
        }
        // Cross-bracing on A-frame
        for (const zOff of [-1.5, 1.5]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4, 0.12), metalMat);
          brace.position.set(0, 3.5, zOff); brace.rotation.z = 0.5; g.add(brace);
        }
        break;
      }

      case 'roller_coaster': {
        // Wheels on each car + lap bars
        if (this.animatedParts.carGroups) {
          for (const car of this.animatedParts.carGroups) {
            for (const [wx, wz] of [[-0.4, 0.4], [0.4, 0.4], [-0.4, -0.4], [0.4, -0.4]]) {
              const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 6), darkMat);
              wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.15, wz); car.add(wheel);
            }
            // Lap bar
            const lapBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), metalMat);
            lapBar.position.set(0, 0.9, 0.2); car.add(lapBar);
          }
        }
        break;
      }

      case 'carousel': {
        // Decorative panels around platform edge
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 1.2),
            mat(SEAT_COLORS[i % SEAT_COLORS.length]));
          panel.position.set(Math.cos(a) * 3.2, 0.7, Math.sin(a) * 3.2);
          panel.rotation.y = a;
          if (this.animatedParts.spinner) this.animatedParts.spinner.add(panel);
        }
        break;
      }

      case 'swing_ride': {
        // Light ring around disc edge
        if (this.animatedParts.topGroup) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), yellowMat);
            light.position.set(Math.cos(a) * 2.6, -0.05, Math.sin(a) * 2.6);
            this.animatedParts.topGroup.add(light);
          }
        }
        break;
      }

      case 'spinning_cups': {
        // Teapot lid and spout on center ornament
        if (this.animatedParts.spinner) {
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.2, 6), yellowMat);
          lid.position.y = 2.3; this.animatedParts.spinner.add(lid);
          const spout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.5), yellowMat);
          spout.position.set(0.6, 1.5, 0); spout.rotation.z = -0.5;
          this.animatedParts.spinner.add(spout);
        }
        break;
      }

      case 'drop_tower': {
        // Warning stripes on cap
        for (let i = 0; i < 4; i++) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.3),
            mat(i % 2 === 0 ? R_RED : R_YELLOW));
          stripe.position.set(0, 13.1 + i * 0.12, 0); g.add(stripe);
        }
        // Shoulder harness on each seat
        for (const seat of this.seats) {
          const harness = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.08), metalMat);
          harness.position.set(0, 0.5, -0.15); seat.group.add(harness);
        }
        break;
      }

      case 'pirate_ship': {
        // Portholes on hull
        if (this.animatedParts.hullGroup) {
          for (let i = -1; i <= 1; i++) {
            for (const xOff of [-0.85, 0.85]) {
              const port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.3), darkMat);
              port.position.set(xOff, 0.3, i * 1.2);
              this.animatedParts.hullGroup.add(port);
            }
          }
          // Cannons
          for (const xOff of [-0.9, 0.9]) {
            const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.5, 6), darkMat);
            cannon.rotation.z = Math.PI / 2;
            cannon.position.set(xOff * 1.1, 0.2, 0.5);
            this.animatedParts.hullGroup.add(cannon);
          }
        }
        break;
      }

      case 'bumper_cars': {
        // Floor markings
        for (let x = -3; x <= 3; x += 2) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 5), yellowMat);
          line.position.set(x, 0.17, 0); g.add(line);
        }
        // Spark poles on cars (antenna with yellow tip)
        for (const seat of this.seats) {
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04), metalMat);
          pole.position.y = 0.9; seat.group.add(pole);
          const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), yellowMat);
          tip.position.y = 1.45; seat.group.add(tip);
        }
        break;
      }

      case 'haunted_house': {
        // Gravestones in front yard
        for (let i = 0; i < 4; i++) {
          const grave = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.15), mat(0x808080));
          grave.position.set(-2.5 + i * 1.5, 0.35, 4.5);
          grave.rotation.z = (Math.random() - 0.5) * 0.15;
          g.add(grave);
        }
        // Green fog at entrance
        for (let i = 0; i < 3; i++) {
          const fog = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1),
            new THREE.MeshLambertMaterial({ color: 0x40c040, transparent: true, opacity: 0.25, flatShading: true }));
          fog.position.set((Math.random() - 0.5) * 2, 0.3, 3.5 + i * 0.5);
          g.add(fog);
        }
        break;
      }

      case 'go_karts': {
        // Checkered flag at start/finish
        const flagPole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), metalMat);
        flagPole.position.set(0, 1.25, 3.8); g.add(flagPole);
        const flag = new THREE.Group();
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          const sq = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.03),
            mat((r + c) % 2 === 0 ? 0xffffff : 0x1a1a1a));
          sq.position.set(c * 0.2 + 0.15, 2.3 - r * 0.2, 3.8); g.add(sq);
        }
        // Spoiler wings on karts
        if (this.animatedParts.kartGroups) {
          for (const kart of this.animatedParts.kartGroups) {
            const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.2), metalMat);
            spoiler.position.set(0, 0.55, -0.6); kart.add(spoiler);
            const spoilerLegs = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), metalMat);
            spoilerLegs.position.set(0, 0.45, -0.6); kart.add(spoilerLegs);
          }
        }
        break;
      }

      case 'observation_tower': {
        // Beacon light at very top
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), yellowMat);
        beacon.position.y = 13.5; g.add(beacon);
        this.animatedParts.beacon = beacon;
        // Railing around cabin
        if (this.animatedParts.cabin) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), metalMat);
            post.position.set(Math.cos(a) * 2.15, -0.7, Math.sin(a) * 2.15);
            this.animatedParts.cabin.add(post);
          }
        }
        break;
      }

      case 'mini_railway': {
        // Wheels on each car
        if (this.animatedParts.cars) {
          for (const car of this.animatedParts.cars) {
            for (const [wx, wz] of [[-0.35, 0.35], [0.35, 0.35], [-0.35, -0.35], [0.35, -0.35]]) {
              const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6), darkMat);
              w.rotation.z = Math.PI / 2; w.position.set(wx, 0.1, wz); car.add(w);
            }
          }
        }
        // Station platform at track start
        const stn = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 1.5), mat(0x9e8b6e));
        stn.position.set(-7, 0.18, 2.5); g.add(stn);
        break;
      }

      case 'merry_go_round': {
        // Horse legs for each horse seat
        for (const seat of this.seats) {
          if (this.type !== 'merry_go_round') continue;
          for (const [lx, lz] of [[-0.12, 0.25], [0.12, 0.25], [-0.12, -0.25], [0.12, -0.25]]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08),
              mat(SEAT_COLORS[0]));
            leg.position.set(lx, -0.4, lz); seat.group.add(leg);
          }
          // Saddle
          const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.4), mat(R_WOOD));
          saddle.position.set(0, 0.3, 0); seat.group.add(saddle);
        }
        break;
      }

      case 'top_spin': {
        // Safety bars over seats
        if (this.animatedParts.gondola) {
          for (let i = 0; i < 4; i++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), metalMat);
            bar.position.set((i - 1.5) * 1, 0.5, 0);
            this.animatedParts.gondola.add(bar);
          }
          // Operator booth at base
          const booth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mat(R_BLUE));
          booth.position.set(3.5, 0.75, 0); g.add(booth);
          const boothRoof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.8), mat(R_RED));
          boothRoof.position.set(3.5, 1.6, 0); g.add(boothRoof);
        }
        break;
      }

      case 'river_rapids': {
        // Rope handles around raft
        if (this.animatedParts.raft) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), mat(R_WOOD));
            handle.position.set(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9);
            this.animatedParts.raft.add(handle);
          }
        }
        // Boulders in channel
        for (let i = 0; i < 6; i++) {
          const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.3, 0),
            new THREE.MeshLambertMaterial({ color: 0x808080, flatShading: true }));
          const a = Math.random() * Math.PI * 2;
          const r = 5 + Math.random() * 2;
          boulder.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
          boulder.scale.set(1, 0.6, 1);
          g.add(boulder);
        }
        break;
      }

      case 'wild_mouse': {
        // Mouse ears on car
        if (this.animatedParts.car) {
          for (const ex of [-0.25, 0.25]) {
            const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), darkMat);
            ear.position.set(ex, 0.9, 0.5);
            this.animatedParts.car.add(ear);
          }
          // Windshield
          const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, flatShading: true }));
          windshield.position.set(0, 0.75, 0.55);
          this.animatedParts.car.add(windshield);
        }
        break;
      }

      case 'enterprise': {
        // Gondola pod enclosures around each seat
        for (const seat of this.seats) {
          if (this.type !== 'enterprise') continue;
          const pod = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), metalMat);
          pod.position.y = -0.05; pod.material = new THREE.MeshLambertMaterial({
            color: R_METAL, flatShading: true, transparent: true, opacity: 0.4 });
          seat.group.add(pod);
        }
        // Hub cap at wheel center
        const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 8), mat(R_RED));
        hubCap.rotation.x = Math.PI / 2;
        if (this.animatedParts.wheel) this.animatedParts.wheel.add(hubCap);
        break;
      }

      case 'ghost_train': {
        // Gravestones in front
        for (let i = 0; i < 3; i++) {
          const grave = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.12), mat(0x808080));
          grave.position.set(-2 + i * 2, 0.3, 4);
          grave.rotation.z = (Math.random() - 0.5) * 0.2;
          g.add(grave);
        }
        // Green fog at entrance
        for (let i = 0; i < 4; i++) {
          const fog = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.8),
            new THREE.MeshLambertMaterial({ color: 0x30a040, transparent: true, opacity: 0.2, flatShading: true }));
          fog.position.set((Math.random() - 0.5) * 2, 0.2, 3.5);
          g.add(fog);
        }
        // Cart lantern
        if (this.animatedParts.cart) {
          const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), yellowMat);
          lantern.position.set(0, 0.8, 0.7);
          this.animatedParts.cart.add(lantern);
          this.animatedParts.cartLantern = lantern;
        }
        break;
      }

      case 'log_flume': {
        // Bark ridges on log
        if (this.animatedParts.logGroup) {
          for (let i = 0; i < 4; i++) {
            const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.15), mat(0x5a3a1a));
            ridge.position.set(0, 0.35, -0.6 + i * 0.4);
            this.animatedParts.logGroup.add(ridge);
          }
          // Splash guard at bow
          const guard = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.15), mat(0x6b4226));
          guard.position.set(0, 0.35, 0.95); guard.rotation.x = -0.3;
          this.animatedParts.logGroup.add(guard);
        }
        break;
      }
    }
  }
}
