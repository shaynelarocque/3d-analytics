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

// ── Ride catalogue ────────────────────────────────────────────────────────────

export const RIDE_TYPES = [
  'ferris_wheel',
  'roller_coaster',
  'carousel',
  'swing_ride',
  'spinning_cups',
  'drop_tower',
  'loop_coaster',
  'log_flume',
  'pirate_ship',
  'bumper_cars',
  'haunted_house',
  'go_karts',
  'observation_tower',
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
    this.rideNodeId = null;

    this._build();
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
    character.group.position.copy(this.entrancePosition);
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
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.4), metalMat);
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
    wheel.rotation.z -= 0.0015; // very slow continuous rotation
    // Counter-rotate gondolas to keep them upright
    for (const c of this.animatedParts.gondolaContainers) {
      c.rotation.z = -wheel.rotation.z;
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

    // Car (moves along track)
    const carGroup = new THREE.Group();
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.6), mat(R_YELLOW));
    carBody.position.y = 0.6;
    carBody.castShadow = true;
    carGroup.add(carBody);

    // Car front
    const carFront = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.3), mat(R_RED));
    carFront.position.set(0, 0.8, 0.9);
    carGroup.add(carFront);

    const startPos = curve.getPointAt(0);
    carGroup.position.copy(startPos);
    g.add(carGroup);

    this.animatedParts.carGroup = carGroup;
    this.animatedParts.carT = 0;
    this.seats.push({ group: carGroup, occupied: false, character: null });
    // Second seat in same car
    this.seats.push({ group: carGroup, occupied: false, character: null });
  }

  _updateRollerCoaster(delta) {
    const { curve, carGroup } = this.animatedParts;
    if (!curve || !carGroup) return;

    // Advance car along track
    this.animatedParts.carT = (this.animatedParts.carT + delta * 0.06) % 1;
    const t = this.animatedParts.carT;

    const pos = curve.getPointAt(t);
    const nextPos = curve.getPointAt((t + 0.01) % 1);
    carGroup.position.copy(pos);
    carGroup.lookAt(nextPos);
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

    // Conical roof (striped effect via two cones)
    const roofMat1 = mat(R_RED);
    const roofMat2 = mat(R_WHITE);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(platformR + 0.8, 1.8, 12), roofMat1);
    roof.position.y = 5.1;
    roof.castShadow = true;
    spinner.add(roof);
    // Roof trim ring
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(platformR + 0.9, platformR + 0.9, 0.15, 12), roofMat2);
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
      seatGroup.rotation.y = -angle + Math.PI / 2;

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
    spinner.rotation.y += 0.008;

    // Bob horses up/down (each at a different phase)
    const horseGroups = this.seats;
    for (let i = 0; i < horseGroups.length; i++) {
      if (this.type !== 'carousel') continue;
      const seat = horseGroups[i].group;
      const angle = (i / numHorses) * Math.PI * 2;
      const hx = Math.cos(angle + spinner.rotation.y) * (platformR - 0.8);
      const hz = Math.sin(angle + spinner.rotation.y) * (platformR - 0.8);
      // Gentle bob
      seat.position.y = 1.2 + Math.sin(this.animTime * 2 + i * 1.2) * 0.3;
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

    // Conical canopy
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(discR + 0.5, 1.2, 10), mat(R_RED));
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
    topGroup.rotation.y += 0.012;

    // Angle chains outward based on spin speed
    const swingAngle = 0.35; // fixed tilt outward
    for (const seat of this.seats) {
      if (!seat.pivot) continue;
      // Tilt chain outward from center
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
    spinner.rotation.y += 0.006;

    // Each cup also rotates individually
    if (cupGroups) {
      for (let i = 0; i < cupGroups.length; i++) {
        cupGroups[i].rotation.y -= 0.02 + i * 0.003;
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

    // Car
    const carGroup = new THREE.Group();
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 1.4), mat(R_ORANGE));
    carBody.position.y = 0.5;
    carBody.castShadow = true;
    carGroup.add(carBody);
    carGroup.position.copy(curve.getPointAt(0));
    g.add(carGroup);

    this.animatedParts.carGroup = carGroup;
    this.animatedParts.carT = 0;
    this.seats.push({ group: carGroup, occupied: false, character: null });
    this.seats.push({ group: carGroup, occupied: false, character: null });
  }

  _updateLoopCoaster(delta) {
    const { curve, carGroup } = this.animatedParts;
    if (!curve || !carGroup) return;
    this.animatedParts.carT = (this.animatedParts.carT + delta * 0.07) % 1;
    const pos = curve.getPointAt(this.animatedParts.carT);
    const nextPos = curve.getPointAt((this.animatedParts.carT + 0.01) % 1);
    carGroup.position.copy(pos);
    carGroup.lookAt(nextPos);
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

    // Log boat
    const logGroup = new THREE.Group();
    const log = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 2), mat(0x6b4226));
    log.position.y = 0.1;
    log.castShadow = true;
    logGroup.add(log);
    // Hollow center
    const hollow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.4), mat(0x4a2f1a));
    hollow.position.y = 0.25;
    logGroup.add(hollow);
    logGroup.position.copy(curve.getPointAt(0));
    g.add(logGroup);

    this.animatedParts.logGroup = logGroup;
    this.animatedParts.logT = 0;
    this.seats.push({ group: logGroup, occupied: false, character: null });
    this.seats.push({ group: logGroup, occupied: false, character: null });

    // Platform
    const platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 3), mat(0x9e8b6e));
    platform.position.set(0, 0.12, 3);
    platform.receiveShadow = true;
    g.add(platform);
  }

  _updateLogFlume(delta) {
    const { curve, logGroup, splashes } = this.animatedParts;
    if (!curve || !logGroup) return;

    this.animatedParts.logT = (this.animatedParts.logT + delta * 0.04) % 1;
    const pos = curve.getPointAt(this.animatedParts.logT);
    const nextPos = curve.getPointAt((this.animatedParts.logT + 0.01) % 1);
    logGroup.position.copy(pos);
    logGroup.lookAt(nextPos);

    // Animate splash particles
    if (splashes) {
      for (const s of splashes) {
        s.position.y = s.userData.splashBase + Math.sin(this.animTime * 3 + s.position.x * 5) * 0.3;
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

    // A-frame supports
    for (const zOff of [-2, 2]) {
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
    const axle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 5), metalMat);
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
    // Pendulum swing — max angle varies with a slow breath
    const maxAngle = 0.6 + Math.sin(this.animTime * 0.15) * 0.15;
    shipPivot.rotation.z = Math.sin(this.animTime * 0.8) * maxAngle;
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

    // Roof structure (poles + canopy)
    for (const [px, pz] of [[-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat(R_METAL));
      pole.position.set(px, 1.6, pz);
      pole.castShadow = true;
      g.add(pole);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.15, 6.5), mat(R_RED));
    canopy.position.y = 3.2;
    canopy.castShadow = true;
    g.add(canopy);

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

  _updateBumperCars() {
    const { carGroups } = this.animatedParts;
    if (!carGroups) return;
    for (let i = 0; i < carGroups.length; i++) {
      const phase = this.animTime * (0.4 + i * 0.12) + i * 1.5;
      const r = 2 + Math.sin(this.animTime * 0.3 + i * 2) * 0.8;
      carGroups[i].position.set(
        Math.cos(phase) * r,
        0,
        Math.sin(phase) * r * 0.7
      );
      carGroups[i].rotation.y = phase + Math.PI / 2;
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

    // Boarded windows
    for (const [wx, wz] of [[-2.5, 3.05], [2.5, 3.05]]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), mat(0x605020));
      win.position.set(wx, 2.5, wz);
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

    for (let i = 0; i < kartGroups.length; i++) {
      kartTs[i] = (kartTs[i] + delta * (0.06 + i * 0.008)) % 1;
      const pos = curve.getPointAt(kartTs[i]);
      const nextPos = curve.getPointAt((kartTs[i] + 0.01) % 1);
      kartGroups[i].position.copy(pos);
      kartGroups[i].lookAt(nextPos);
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
    // Gentle rotation
    cabin.rotation.y += 0.004;
    // Slow rise and lower
    const cycle = Math.sin(this.animTime * 0.2) * 0.5 + 0.5; // 0 to 1
    cabin.position.y = towerH * 0.4 + cycle * (towerH * 0.4);
  }
}
