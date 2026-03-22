import * as THREE from 'three';

const SKIN_TONES = [0xf5c6a0, 0xd4a373, 0xc08050, 0x8b6b4a, 0xf0d0b0, 0xb07840];
const SHIRT_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x1abc9c, 0xe74c3c, 0x3498db, 0xd35400, 0x16a085];
const PANTS_COLORS = [0x2c3e50, 0x7f8c8d, 0x6b4226, 0x1a5276, 0x4a235a, 0x1c2833, 0x5d4037];
const HAIR_COLORS = [0x2c1a0e, 0x8b4513, 0xdaa520, 0xc0392b, 0x1a1a1a, 0xf5f5dc, 0x6e3b1e];

const WALK_SPEED = 3.5;
const ANIM_SPEED = 8;

export class Character {
  constructor(scene, spawnPos) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);

    this.target = null;
    this.targetRoom = null;
    this.velocity = new THREE.Vector3();
    this.isWalking = false;
    this.animTime = Math.random() * Math.PI * 2;
    this.lifetime = 0;
    this.maxLifetime = 30 + Math.random() * 60;
    this.isDead = false;
    this.isLeaving = false;
    this.chatBubble = null;
    this.chatTimer = 0;

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

    // Hair (on top of head)
    const hairGeo = new THREE.BoxGeometry(0.52, 0.18, 0.52);
    const hairMesh = new THREE.Mesh(hairGeo, mat(hair));
    hairMesh.position.y = 0.26;
    this.head.add(hairMesh);

    // Eyes (two small black cubes)
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.06);
    const eyeMat = mat(0x000000);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 0.02, 0.26);
    this.head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 0.02, 0.26);
    this.head.add(rightEye);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.6, 0.3);
    this.torso = new THREE.Mesh(torsoGeo, mat(shirt));
    this.torso.position.y = 1.1;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.55, 0.2);

    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.34, 1.35, 0);
    const leftArm = new THREE.Mesh(armGeo, mat(shirt));
    leftArm.position.y = -0.25;
    leftArm.castShadow = true;
    this.leftArmPivot.add(leftArm);
    this.group.add(this.leftArmPivot);

    // Skin-colored hand at bottom of arm
    const handGeo = new THREE.BoxGeometry(0.14, 0.12, 0.16);
    const leftHand = new THREE.Mesh(handGeo, mat(skin));
    leftHand.position.y = -0.52;
    this.leftArmPivot.add(leftHand);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.34, 1.35, 0);
    const rightArm = new THREE.Mesh(armGeo, mat(shirt));
    rightArm.position.y = -0.25;
    rightArm.castShadow = true;
    this.rightArmPivot.add(rightArm);
    this.group.add(this.rightArmPivot);

    const rightHand = new THREE.Mesh(handGeo, mat(skin));
    rightHand.position.y = -0.52;
    this.rightArmPivot.add(rightHand);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.24);

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.12, 0.8, 0);
    const leftLeg = new THREE.Mesh(legGeo, mat(pants));
    leftLeg.position.y = -0.25;
    leftLeg.castShadow = true;
    this.leftLegPivot.add(leftLeg);
    this.group.add(this.leftLegPivot);

    // Boot
    const bootGeo = new THREE.BoxGeometry(0.22, 0.14, 0.3);
    const bootMat = mat(0x3e2723);
    const leftBoot = new THREE.Mesh(bootGeo, bootMat);
    leftBoot.position.set(0, -0.5, 0.03);
    this.leftLegPivot.add(leftBoot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.12, 0.8, 0);
    const rightLeg = new THREE.Mesh(legGeo, mat(pants));
    rightLeg.position.y = -0.25;
    rightLeg.castShadow = true;
    this.rightLegPivot.add(rightLeg);
    this.group.add(this.rightLegPivot);

    const rightBoot = new THREE.Mesh(bootGeo, bootMat);
    rightBoot.position.set(0, -0.5, 0.03);
    this.rightLegPivot.add(rightBoot);

    // Shadow blob under character
    const shadowGeo = new THREE.CircleGeometry(0.3, 8);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);
  }

  setTarget(position, room) {
    this.target = position.clone();
    this.targetRoom = room;
    this.isWalking = true;
  }

  setLeaving(exitPos) {
    this.isLeaving = true;
    this.target = exitPos.clone();
    this.isWalking = true;
  }

  update(delta) {
    this.lifetime += delta;
    this.animTime += delta * ANIM_SPEED;

    if (this.isWalking && this.target) {
      const dir = new THREE.Vector3().subVectors(this.target, this.group.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist < 0.3) {
        this.isWalking = false;
        this.target = null;
        if (this.isLeaving) {
          this.isDead = true;
        }
      } else {
        dir.normalize();
        this.group.position.add(dir.multiplyScalar(WALK_SPEED * delta));
        // Face movement direction
        this.group.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }

    // Walking animation
    if (this.isWalking) {
      const swing = Math.sin(this.animTime) * 0.6;
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;
      this.leftArmPivot.rotation.x = -swing * 0.5;
      this.rightArmPivot.rotation.x = swing * 0.5;
      // Slight body bob
      this.torso.position.y = 1.1 + Math.abs(Math.sin(this.animTime * 2)) * 0.03;
      this.head.position.y = 1.65 + Math.abs(Math.sin(this.animTime * 2)) * 0.03;
    } else {
      // Idle animation - subtle breathing
      this.leftLegPivot.rotation.x *= 0.9;
      this.rightLegPivot.rotation.x *= 0.9;
      this.leftArmPivot.rotation.x *= 0.9;
      this.rightArmPivot.rotation.x *= 0.9;
      const breathe = Math.sin(this.animTime * 0.3) * 0.01;
      this.torso.position.y = 1.1 + breathe;
      this.head.position.y = 1.65 + breathe;
      // Occasionally look around
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
    const textWidth = Math.min(ctx.measureText(text).width + 16, 240);
    const x = (256 - textWidth) / 2;
    ctx.roundRect(x, 8, textWidth, 40, 4);
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
      map: texture,
      transparent: true,
      depthTest: false,
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
