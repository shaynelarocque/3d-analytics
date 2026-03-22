import * as THREE from 'three';

const SKIN_TONES = [0xf5c6a0, 0xd4a373, 0xc08050, 0x8b6b4a, 0xf0d0b0, 0xb07840];
const SHIRT_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x1abc9c, 0xe74c3c, 0x3498db, 0xd35400, 0x16a085];
const PANTS_COLORS = [0x2c3e50, 0x7f8c8d, 0x6b4226, 0x1a5276, 0x4a235a, 0x1c2833, 0x5d4037];
const HAIR_COLORS = [0x2c1a0e, 0x8b4513, 0xdaa520, 0xc0392b, 0x1a1a1a, 0xf5f5dc, 0x6e3b1e];

const WALK_SPEED = 3.5;
const WANDER_SPEED = 1.2;
const ANIM_SPEED = 8;

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
    this.animTime = Math.random() * Math.PI * 2;
    this.chatBubble = null;
    this.chatTimer = 0;

    // References (set by app)
    this.pathGraph = null;
    this.worldRef = null;
    this.onJourneyStep = null; // callback(character, stepInfo)

    this.buildModel();
    scene.add(this.group);
  }

  buildModel() {
    const skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    const pants = PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];
    const hair = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];

    const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.head = new THREE.Mesh(headGeo, mat(skin));
    this.head.position.y = 1.65;
    this.head.castShadow = true;
    this.group.add(this.head);

    // Hair
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.52), mat(hair));
    hairMesh.position.y = 0.26;
    this.head.add(hairMesh);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.06);
    const eyeMat = mat(0x000000);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 0.02, 0.26);
    this.head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 0.02, 0.26);
    this.head.add(rightEye);

    // Torso
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), mat(shirt));
    this.torso.position.y = 1.1;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.55, 0.2);
    const handGeo = new THREE.BoxGeometry(0.14, 0.12, 0.16);

    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.34, 1.35, 0);
    this.leftArmPivot.add(new THREE.Mesh(armGeo, mat(shirt)));
    this.leftArmPivot.children[0].position.y = -0.25;
    this.leftArmPivot.children[0].castShadow = true;
    this.leftArmPivot.add(new THREE.Mesh(handGeo, mat(skin)));
    this.leftArmPivot.children[1].position.y = -0.52;
    this.group.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.34, 1.35, 0);
    this.rightArmPivot.add(new THREE.Mesh(armGeo, mat(shirt)));
    this.rightArmPivot.children[0].position.y = -0.25;
    this.rightArmPivot.children[0].castShadow = true;
    this.rightArmPivot.add(new THREE.Mesh(handGeo, mat(skin)));
    this.rightArmPivot.children[1].position.y = -0.52;
    this.group.add(this.rightArmPivot);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.24);
    const bootGeo = new THREE.BoxGeometry(0.22, 0.14, 0.3);
    const bootMat = mat(0x3e2723);

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.12, 0.8, 0);
    this.leftLegPivot.add(new THREE.Mesh(legGeo, mat(pants)));
    this.leftLegPivot.children[0].position.y = -0.25;
    this.leftLegPivot.children[0].castShadow = true;
    const lb = new THREE.Mesh(bootGeo, bootMat);
    lb.position.set(0, -0.5, 0.03);
    this.leftLegPivot.add(lb);
    this.group.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.12, 0.8, 0);
    this.rightLegPivot.add(new THREE.Mesh(legGeo, mat(pants)));
    this.rightLegPivot.children[0].position.y = -0.25;
    this.rightLegPivot.children[0].castShadow = true;
    const rb = new THREE.Mesh(bootGeo, bootMat);
    rb.position.set(0, -0.5, 0.03);
    this.rightLegPivot.add(rb);
    this.group.add(this.rightLegPivot);

    // Shadow blob
    const shadowGeo = new THREE.CircleGeometry(0.3, 8);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
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
    this._startNextStep();
  }

  _startNextStep() {
    if (!this.journey || this.journeyStepIndex >= this.journey.steps.length) {
      // Journey complete — leave
      this._leave();
      return;
    }

    const step = this.journey.steps[this.journeyStepIndex];
    const room = this.worldRef.findRoom(step.page);

    if (!room) {
      // Room not found, skip this step
      this.journeyStepIndex++;
      this._startNextStep();
      return;
    }

    // Find path from current position to room interior
    const path = this.pathGraph.getPathFromPosition(this.group.position, room.nodeId);
    if (!path) {
      this.journeyStepIndex++;
      this._startNextStep();
      return;
    }

    this.currentRoom = room;
    this.roomBounds = room.bounds;
    this.idleTimer = step.duration;
    this.isIdling = false;
    this.isWalking = true;
    this.currentSpeed = WALK_SPEED;
    this.waypoints = path;
    this.waypointIndex = 0;

    // Callback for chat log
    if (this.onJourneyStep) {
      this.onJourneyStep(this, step);
    }
  }

  _leave() {
    this.isLeaving = true;
    this.currentRoom = null;
    const exitNodeId = 'exit';
    const path = this.pathGraph.getPathFromPosition(this.group.position, exitNodeId);
    if (path) {
      this.waypoints = path;
      this.waypointIndex = 0;
      this.isWalking = true;
      this.currentSpeed = WALK_SPEED;
    } else {
      this.isDead = true;
    }
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
            // Start idling in room
            this.isIdling = true;
            this.wanderTimer = 1 + Math.random() * 2;
          }
        }
      } else {
        dir.normalize();
        this.group.position.add(dir.multiplyScalar(this.currentSpeed * delta));
        this.group.rotation.y = Math.atan2(dir.x, dir.z);
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
    if (this._wanderReturnToIdle && !this.isWalking && !this.isIdling && !this.isLeaving && !this.isDead) {
      this._wanderReturnToIdle = false;
      this.isIdling = true;
      this.wanderTimer = 1.5 + Math.random() * 2;
    }

    // Animations
    if (this.isWalking) {
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

    // Chat bubble timer
    if (this.chatTimer > 0) {
      this.chatTimer -= delta;
      if (this.chatTimer <= 0 && this.chatBubble) {
        this.group.remove(this.chatBubble);
        this.chatBubble = null;
      }
    }
  }

  showChatBubble(text) {
    if (this.chatBubble) {
      this.group.remove(this.chatBubble);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000cc';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 40, 4);
    ctx.fill();

    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 28, 230);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: false,
    });
    this.chatBubble = new THREE.Sprite(spriteMat);
    this.chatBubble.position.y = 2.3;
    this.chatBubble.scale.set(2, 0.5, 1);
    this.group.add(this.chatBubble);

    this.chatTimer = 4;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}
