import * as THREE from 'three';

// --- Reference Frame Contract ---
// Axes: +X right, +Y up, +Z toward camera (Three.js default right-handed)
// Units: 1 unit ≈ 1 meter
// Character anchors: feet at y=0 (minY = 0)
// Character forward: local -Z (Three.js Object3D convention)
// Character height: ~2 units from feet to top of head

const SKIN_TONES = [0xf5c6a0, 0xd4a373, 0xc08050, 0x8b6b4a, 0xf0d0b0, 0xb07840];
// RCT2-style bright guest clothing
const SHIRT_COLORS = [0xe84040, 0x4080e8, 0x40c840, 0xf0c020, 0xd050d0, 0x40d0d0, 0xf06020, 0x8060e0, 0xe86090, 0x60c060];
const PANTS_COLORS = [0x3040a0, 0x808080, 0x805020, 0x404040, 0x206060, 0x604080, 0x306030];
const HAIR_COLORS = [0x2c1a0e, 0x8b4513, 0xdaa520, 0xc0392b, 0x1a1a1a, 0xf5f5dc, 0x6e3b1e];

const WALK_SPEED = 3.5;
const WANDER_SPEED = 1.2;
const ANIM_SPEED = 8;

// --- Shared geometry pool (instantiate once, reuse across all characters) ---
const SHARED_GEO = {
  head: new THREE.BoxGeometry(0.5, 0.5, 0.5),
  hair: new THREE.BoxGeometry(0.52, 0.18, 0.52),
  eye: new THREE.BoxGeometry(0.08, 0.08, 0.06),
  torso: new THREE.BoxGeometry(0.5, 0.6, 0.3),
  arm: new THREE.BoxGeometry(0.18, 0.55, 0.2),
  hand: new THREE.BoxGeometry(0.14, 0.12, 0.16),
  leg: new THREE.BoxGeometry(0.2, 0.5, 0.24),
  boot: new THREE.BoxGeometry(0.22, 0.14, 0.3),
  shadow: new THREE.CircleGeometry(0.3, 8),
};

// Shared materials (keyed by color hex, cached on first use)
const materialCache = new Map();
function getMat(color) {
  if (!materialCache.has(color)) {
    materialCache.set(color, new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.9, metalness: 0,
    }));
  }
  return materialCache.get(color);
}

const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
});
const EYE_MAT = getMat(0x000000);
const BOOT_COLOR = 0x3e2723;

export class Character {
  constructor(scene, spawnPos) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);

    // Waypoint-based movement
    this.waypoints = [];
    this.waypointIndex = 0;
    this.isWalking = false;
    this.currentSpeed = WALK_SPEED;

    // Journey system
    this.journey = null;
    this.journeyStepIndex = 0;
    this.currentRoom = null;

    // Idle / wander in room
    this.isIdling = false;
    this.idleTimer = 0;
    this.wanderTimer = 0;
    this.roomBounds = null; // {minX, maxX, minZ, maxZ} world coords

    // State
    this.isLeaving = false;
    this.isDead = false;
    this.isRiding = false;
    this.currentRide = null;
    this.isFlying = false;       // launched off a ride
    this.flyVelocity = null;     // THREE.Vector3
    this.animTime = Math.random() * Math.PI * 2;
    this.chatBubble = null;
    this.chatTimer = 0;

    // Callbacks set by app
    this.onExplode = null;       // (character, worldPos) => spawn particles

    // References (set by app)
    this.pathGraph = null;
    this.worldRef = null;
    this.uiScene = null; // crisp overlay scene for chat bubbles
    this.onJourneyStep = null; // callback(character, stepInfo)

    this.buildModel();
    scene.add(this.group);
  }

  buildModel() {
    const skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    const pants = PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];
    const hair = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];

    const skinMat = getMat(skin);
    const shirtMat = getMat(shirt);
    const pantsMat = getMat(pants);
    const hairMat = getMat(hair);
    const bootMat = getMat(BOOT_COLOR);

    // Head (anchor: bottom of head at y=1.4, top at y=1.9)
    this.head = new THREE.Mesh(SHARED_GEO.head, skinMat);
    this.head.position.y = 1.65;
    this.head.castShadow = true;
    this.group.add(this.head);

    const hairMesh = new THREE.Mesh(SHARED_GEO.hair, hairMat);
    hairMesh.position.y = 0.26;
    this.head.add(hairMesh);

    const leftEye = new THREE.Mesh(SHARED_GEO.eye, EYE_MAT);
    leftEye.position.set(-0.12, 0.02, 0.26);
    this.head.add(leftEye);
    const rightEye = new THREE.Mesh(SHARED_GEO.eye, EYE_MAT);
    rightEye.position.set(0.12, 0.02, 0.26);
    this.head.add(rightEye);

    // Torso
    this.torso = new THREE.Mesh(SHARED_GEO.torso, shirtMat);
    this.torso.position.y = 1.1;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Arms (pivoted at shoulder for swing animation)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.34, 1.35, 0);
    const la = new THREE.Mesh(SHARED_GEO.arm, shirtMat);
    la.position.y = -0.25;
    la.castShadow = true;
    this.leftArmPivot.add(la);
    const lh = new THREE.Mesh(SHARED_GEO.hand, skinMat);
    lh.position.y = -0.52;
    this.leftArmPivot.add(lh);
    this.group.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.34, 1.35, 0);
    const ra = new THREE.Mesh(SHARED_GEO.arm, shirtMat);
    ra.position.y = -0.25;
    ra.castShadow = true;
    this.rightArmPivot.add(ra);
    const rh = new THREE.Mesh(SHARED_GEO.hand, skinMat);
    rh.position.y = -0.52;
    this.rightArmPivot.add(rh);
    this.group.add(this.rightArmPivot);

    // Legs (pivoted at hip, feet at y=0)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.12, 0.8, 0);
    const ll = new THREE.Mesh(SHARED_GEO.leg, pantsMat);
    ll.position.y = -0.25;
    ll.castShadow = true;
    this.leftLegPivot.add(ll);
    const lb = new THREE.Mesh(SHARED_GEO.boot, bootMat);
    lb.position.set(0, -0.5, 0.03);
    this.leftLegPivot.add(lb);
    this.group.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.12, 0.8, 0);
    const rl = new THREE.Mesh(SHARED_GEO.leg, pantsMat);
    rl.position.y = -0.25;
    rl.castShadow = true;
    this.rightLegPivot.add(rl);
    const rb = new THREE.Mesh(SHARED_GEO.boot, bootMat);
    rb.position.set(0, -0.5, 0.03);
    this.rightLegPivot.add(rb);
    this.group.add(this.rightLegPivot);

    // Shadow blob (at ground plane y=0)
    const shadow = new THREE.Mesh(SHARED_GEO.shadow, SHADOW_MAT);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);
  }

  // Set a journey: array of { page, duration }
  setJourney(journey, pathGraph, worldRef) {
    this.journey = journey;
    this.journeyStepIndex = 0;
    this.pathGraph = pathGraph;
    this.worldRef = worldRef;
    const pages = journey.steps?.map(s => s.page) || [];
    console.log(`%c[Character] setJourney: ${pages.length} steps → [${pages.join(' → ')}]`, 'color:#80cbc4');
    this._startNextStep();
  }

  _startNextStep() {
    if (!this.journey || this.journeyStepIndex >= this.journey.steps.length) {
      console.log(`%c[Character] Journey complete, leaving`, 'color:#80cbc4');
      this._leave();
      return;
    }

    const step = this.journey.steps[this.journeyStepIndex];
    const room = this.worldRef.findRoom(step.page);

    if (!room) {
      console.warn(`%c[Character] Room not found: "${step.page}", skipping step ${this.journeyStepIndex}`, 'color:#ff9800');
      this.journeyStepIndex++;
      this._startNextStep();
      return;
    }

    // Find path from current position to room interior
    const pos = this.group.position;
    console.log(`%c[Character] Step ${this.journeyStepIndex}: "${step.page}" → node "${room.nodeId}" (from ${pos.x.toFixed(1)},${pos.z.toFixed(1)})`, 'color:#80cbc4');

    const path = this.pathGraph.getPathFromPosition(this.group.position, room.nodeId);
    if (!path) {
      console.error(`%c[Character] ✗ No path to "${room.nodeId}"`, 'color:#ff5252');
      this.journeyStepIndex++;
      this._startNextStep();
      return;
    }

    console.log(`%c[Character] ✓ Path found: ${path.length} waypoints, duration=${step.duration.toFixed(1)}s`, 'color:#69f0ae');

    this.currentRoom = room;
    this.roomBounds = room.bounds;
    this.pendingStep = step; // stored until arrival
    this.idleTimer = step.duration;
    this.isIdling = false;
    this.isWalking = true;
    this.currentSpeed = WALK_SPEED;
    this.waypoints = path;
    this.waypointIndex = 0;
  }

  _leave() {
    this.isLeaving = true;
    this.currentRoom = null;
    // Try parking first, fall back to exit
    const targetNode = this.pathGraph.nodes.has('parking') ? 'parking' : 'exit';
    const path = this.pathGraph.getPathFromPosition(this.group.position, targetNode);
    if (path) {
      console.log(`%c[Character] Leaving via ${path.length} waypoints to ${targetNode}`, 'color:#80cbc4');
      this.waypoints = path;
      this.waypointIndex = 0;
      this.isWalking = true;
      this.currentSpeed = WALK_SPEED;
    } else {
      console.error(`%c[Character] ✗ No path to ${targetNode} — dying immediately`, 'color:#ff5252');
      this.isDead = true;
    }
  }

  _launchFromRide() {
    // Get world position while still on the ride
    const worldPos = new THREE.Vector3();
    this.group.getWorldPosition(worldPos);

    // Detach from ride
    this.currentRide.disembarkGuest(this);
    this.isRiding = false;
    this.currentRide = null;

    // Place at the world position we captured
    this.group.position.copy(worldPos);

    // Launch velocity: random horizontal direction + strong upward
    const angle = Math.random() * Math.PI * 2;
    const hSpeed = 8 + Math.random() * 10;
    this.flyVelocity = new THREE.Vector3(
      Math.cos(angle) * hSpeed,
      12 + Math.random() * 8,   // strong upward launch
      Math.sin(angle) * hSpeed
    );
    this.isFlying = true;
    this.isLeaving = true; // so cleanup knows they were leaving
  }

  _pickWanderTarget() {
    if (!this.roomBounds) return null;
    const b = this.roomBounds;
    const margin = 0.5;
    return new THREE.Vector3(
      b.minX + margin + Math.random() * (b.maxX - b.minX - margin * 2),
      0,
      b.minZ + margin + Math.random() * (b.maxZ - b.minZ - margin * 2),
    );
  }

  update(delta) {
    this.animTime += delta * ANIM_SPEED;

    // Walking along waypoints
    if (this.isWalking && this.waypoints.length > 0) {
      const target = this.waypoints[this.waypointIndex];
      const dir = new THREE.Vector3().subVectors(target, this.group.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist < 0.3) {
        this.waypointIndex++;
        if (this.waypointIndex >= this.waypoints.length) {
          // Arrived at final waypoint
          this.isWalking = false;
          if (this.isLeaving) {
            this.isDead = true;
          } else {
            // Arrived — board ride if available, otherwise idle/wander
            if (this.onArrivedAtRoom && this.pendingStep) {
              console.log(`%c[Character] Arrived at "${this.pendingStep.page}", idling for ${this.pendingStep.duration.toFixed(1)}s`, 'color:#69f0ae');
              this.onArrivedAtRoom(this, this.pendingStep);
              this.pendingStep = null;
            }

            if (this.currentRoom?.ride && this.currentRoom.ride.hasAvailableSeat()) {
              // Board the ride!
              this.isRiding = true;
              this.currentRide = this.currentRoom.ride;
              this.currentRide.boardGuest(this);
            } else {
              // Normal idle/wander in bounds
              this.isIdling = true;
              this.wanderTimer = 1 + Math.random() * 2;
            }
          }
        }
      } else {
        dir.normalize();
        this.group.position.add(dir.multiplyScalar(this.currentSpeed * delta));
        this.group.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }

    // Riding a ride
    if (this.isRiding) {
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) {
        const isLastStep = this.journeyStepIndex >= (this.journey?.steps?.length || 0) - 1;
        const launchChance = isLastStep ? 0.35 : 0; // 35% chance on final ride

        if (launchChance > 0 && Math.random() < launchChance) {
          // FLY OFF THE RIDE!
          this._launchFromRide();
        } else {
          // Normal disembark
          this.currentRide.disembarkGuest(this);
          this.isRiding = false;
          this.currentRide = null;
          this.journeyStepIndex++;
          this._startNextStep();
        }
      }
    }

    // Flying through the air after launch
    if (this.isFlying && this.flyVelocity) {
      this.flyVelocity.y -= 15 * delta; // gravity
      this.group.position.add(this.flyVelocity.clone().multiplyScalar(delta));
      // Tumble wildly
      this.group.rotation.x += delta * 8;
      this.group.rotation.z += delta * 6;

      // Hit the ground
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.isFlying = false;
        if (this.onExplode) {
          this.onExplode(this, this.group.position.clone());
        }
        this.isDead = true;
      }
    }

    // Idling in room (wander around)
    if (this.isIdling) {
      this.idleTimer -= delta;
      this.wanderTimer -= delta;

      if (this.idleTimer <= 0) {
        // Done idling, move to next journey step
        this.isIdling = false;
        this.journeyStepIndex++;
        this._startNextStep();
      } else if (this.wanderTimer <= 0) {
        // Pick a new wander target
        const wanderTarget = this._pickWanderTarget();
        if (wanderTarget) {
          this.waypoints = [wanderTarget];
          this.waypointIndex = 0;
          this.isWalking = true;
          this.isIdling = false;
          this.currentSpeed = WANDER_SPEED;
          // Re-enter idle after reaching wander target
          this._wanderReturnToIdle = true;
        }
        this.wanderTimer = 2 + Math.random() * 3;
      }
    }

    // Handle wander→idle transition
    if (this._wanderReturnToIdle && !this.isWalking && !this.isIdling && !this.isLeaving && !this.isDead && !this.isRiding) {
      this._wanderReturnToIdle = false;
      this.isIdling = true;
      this.wanderTimer = 1.5 + Math.random() * 2;
    }

    // Animations
    if (this.isRiding) {
      // Riding pose: arms raised, subtle sway
      this.leftLegPivot.rotation.x *= 0.9;
      this.rightLegPivot.rotation.x *= 0.9;
      this.leftArmPivot.rotation.x = -2.2 + Math.sin(this.animTime * 0.8) * 0.15;
      this.rightArmPivot.rotation.x = -2.2 + Math.sin(this.animTime * 0.8 + 1) * 0.15;
      const breathe = Math.sin(this.animTime * 0.5) * 0.01;
      this.torso.position.y = 1.1 + breathe;
      this.head.position.y = 1.65 + breathe;
      this.head.rotation.y = Math.sin(this.animTime * 0.2) * 0.4;
    } else if (this.isWalking) {
      const speed = this.currentSpeed === WANDER_SPEED ? 0.4 : 0.6;
      const swing = Math.sin(this.animTime) * speed;
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;
      this.leftArmPivot.rotation.x = -swing * 0.5;
      this.rightArmPivot.rotation.x = swing * 0.5;
      this.torso.position.y = 1.1 + Math.abs(Math.sin(this.animTime * 2)) * 0.03;
      this.head.position.y = 1.65 + Math.abs(Math.sin(this.animTime * 2)) * 0.03;
    } else {
      // Idle: subtle breathing + looking around
      this.leftLegPivot.rotation.x *= 0.9;
      this.rightLegPivot.rotation.x *= 0.9;
      this.leftArmPivot.rotation.x *= 0.9;
      this.rightArmPivot.rotation.x *= 0.9;
      const breathe = Math.sin(this.animTime * 0.3) * 0.01;
      this.torso.position.y = 1.1 + breathe;
      this.head.position.y = 1.65 + breathe;
      this.head.rotation.y = Math.sin(this.animTime * 0.15) * 0.3;
    }

    // Chat bubble: track position + timer
    if (this.chatBubble && this.uiScene) {
      const worldPos = new THREE.Vector3();
      this.group.getWorldPosition(worldPos);
      this.chatBubble.position.set(worldPos.x, worldPos.y + 2.8, worldPos.z);
    }
    if (this.chatTimer > 0) {
      this.chatTimer -= delta;
      if (this.chatTimer <= 0 && this.chatBubble) {
        (this.uiScene || this.group).remove(this.chatBubble);
        this.chatBubble = null;
      }
    }
  }

  showChatBubble(text) {
    if (this.chatBubble) {
      (this.uiScene || this.group).remove(this.chatBubble);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // RCT2-style thought bubble: beveled panel
    ctx.fillStyle = '#c6b790';
    ctx.fillRect(8, 8, 496, 112);
    // Raised bevel
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(8, 120); ctx.lineTo(8, 8); ctx.lineTo(504, 8);
    ctx.stroke();
    ctx.strokeStyle = '#6b5e3e';
    ctx.beginPath();
    ctx.moveTo(504, 8); ctx.lineTo(504, 120); ctx.lineTo(8, 120);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64, 480);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: false,
    });
    this.chatBubble = new THREE.Sprite(spriteMat);
    this.chatBubble.scale.set(3.5, 0.9, 1);

    if (this.uiScene) {
      // Place in crisp overlay scene — position tracked each frame
      const worldPos = new THREE.Vector3();
      this.group.getWorldPosition(worldPos);
      this.chatBubble.position.set(worldPos.x, worldPos.y + 2.8, worldPos.z);
      this.uiScene.add(this.chatBubble);
    } else {
      this.chatBubble.position.y = 2.8;
      this.group.add(this.chatBubble);
    }

    this.chatTimer = 4;
  }

  dispose() {
    this.scene.remove(this.group);
    // Clean up chat bubble from uiScene if present
    if (this.chatBubble) {
      (this.uiScene || this.group).remove(this.chatBubble);
      if (this.chatBubble.material?.map) {
        this.chatBubble.material.map.dispose();
        this.chatBubble.material.dispose();
      }
      this.chatBubble = null;
    }
  }
}
