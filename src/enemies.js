import * as THREE from 'three';
import { rand, dist2, clamp, collidesCircleAabb } from './util.js';

const tmpDir = new THREE.Vector3();

export class Enemy {
  constructor(x, z, kind = 'grunt', difficultyMultiplier = 1.0) {
    this.kind = kind;
    this.position = new THREE.Vector3(x, 0, z);
    this.radius = 0.45;
    this.height = 1.8;

    if (kind === 'grunt') {
      this.maxHp = 50; this.speed = 2.6; this.damage = 12; this.attackRange = 1.5; this.attackCd = 0.9;
      this.color = 0x8b3a3a;
    } else if (kind === 'runner') {
      this.maxHp = 30; this.speed = 4.4; this.damage = 8; this.attackRange = 1.4; this.attackCd = 0.6;
      this.color = 0xc06b1e;
    } else if (kind === 'brute') {
      this.maxHp = 140; this.speed = 1.8; this.damage = 25; this.attackRange = 1.8; this.attackCd = 1.4;
      this.color = 0x5a1e6b;
      this.radius = 0.6; this.height = 2.2;
    }

    this.maxHp *= difficultyMultiplier;
    this.damage *= difficultyMultiplier;
    
    this.hp = this.maxHp;
    this.cooldown = 0;
    this.alive = true;
    this.flashT = 0;

    // Build a simple humanoid mesh.
    const group = new THREE.Group();
    // Torso uses the "color" (red/orange/purple for Grunt/Runner/Brute)
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.8, flatShading: true });
    // Fully white head, arms, legs
    const limbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });

    // Torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(this.radius*1.6, this.height*0.45, this.radius*1.0), bodyMat);
    body.position.y = this.height * 0.45 / 2 + this.height * 0.35;
    body.castShadow = true;

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(this.radius*1.0, this.radius*1.0, this.radius*1.0), limbMat);
    head.position.y = body.position.y + this.height*0.45/2 + this.radius*0.5 + 0.02;
    head.castShadow = true;

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(this.radius*0.5, this.height*0.4, this.radius*0.5), limbMat);
    legL.position.set(-this.radius*0.4, this.height*0.2, 0); legL.castShadow = true;
    const legR = legL.clone(); legR.position.x = this.radius*0.4;

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(this.radius*0.4, this.height*0.4, this.radius*0.4), limbMat);
    armL.position.set(-this.radius*1.0, body.position.y, 0); armL.castShadow = true;
    const armR = armL.clone(); armR.position.x = this.radius*1.0;

    // Eyes (creepy red dots)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.12, head.position.y + 0.05, this.radius*0.5 + 0.01);
    eyeR.position.set( 0.12, head.position.y + 0.05, this.radius*0.5 + 0.01);

    group.add(body, head, legL, legR, armL, armR, eyeL, eyeR);
    group.position.copy(this.position);

    this.mesh = group;
    // Store parts so we can animate walking and break them apart on death
    this.parts = { body, head, legL, legR, armL, armR, eyeL, eyeR };
    this._bodyBase = bodyMat; // for hit flash
    this._headBase = limbMat;
    this.walkT = Math.random() * Math.PI * 2;
  }

  hit(dmg) {
    this.hp -= dmg;
    this.flashT = 0.12;
    if (this.hp <= 0) { this.alive = false; }
  }

  update(dt, player, obstacles, enemies, getGroundHeight) {
    if (!this.alive) return;
    this.cooldown = Math.max(0, this.cooldown - dt);

    const dx = player.camera.position.x - this.position.x;
    const dz = player.camera.position.z - this.position.z;
    const distSq = dx*dx + dz*dz;
    const dist = Math.sqrt(distSq);

    // Face the player
    const yaw = Math.atan2(dx, dz);
    this.mesh.rotation.y = yaw;

    // attack
    if (dist < this.attackRange + this.radius && this.cooldown <= 0) {
      player.damage(this.damage);
      this.cooldown = this.attackCd;
      this.flashT = 0.05;
    }

    if (dist > this.attackRange + this.radius - 0.2) {
      // move toward player
      const ux = dx / (dist || 1);
      const uz = dz / (dist || 1);
      let vx = ux * this.speed;
      let vz = uz * this.speed;

      // simple separation from other enemies (avoid stacking)
      for (const o of enemies) {
        if (o === this || !o.alive) continue;
        const ddx = this.position.x - o.position.x;
        const ddz = this.position.z - o.position.z;
        const d2 = ddx*ddx + ddz*ddz;
        const minD = (this.radius + o.radius) * 1.05;
        if (d2 < minD*minD && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const f = (minD - d) / minD * 2.5;
          vx += (ddx/d) * f;
          vz += (ddz/d) * f;
        }
      }

      const tryX = this.position.x + vx * dt;
      if (!collidesCircleAabb(tryX, this.position.y, this.position.z, this.radius, obstacles)) this.position.x = tryX;
      const tryZ = this.position.z + vz * dt;
      if (!collidesCircleAabb(this.position.x, this.position.y, tryZ, this.radius, obstacles)) this.position.z = tryZ;

      // walk anim
      this.walkT += dt * 8;
      const swing = Math.sin(this.walkT) * 0.4;
      this.parts.legL.rotation.x =  swing;
      this.parts.legR.rotation.x = -swing;
      this.parts.armL.rotation.x = -swing;
      this.parts.armR.rotation.x =  swing;
    } else {
      this.parts.legL.rotation.x *= 0.85;
      this.parts.legR.rotation.x *= 0.85;
      this.parts.armL.rotation.x *= 0.85;
      this.parts.armR.rotation.x *= 0.85;
    }

    // Sit on the terrain
    if (getGroundHeight) this.position.y = getGroundHeight(this.position.x, this.position.z);
    this.mesh.position.x = this.position.x;
    this.mesh.position.y = this.position.y;
    this.mesh.position.z = this.position.z;

    // hit flash effect (tint body)
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = clamp(this.flashT / 0.12, 0, 1);
      this.parts.body.material = makeTintMat(this._bodyBase, 0xffffff, k);
      this.parts.head.material = makeTintMat(this._headBase, 0xffffff, k);
      this.parts.legL.material = makeTintMat(this._headBase, 0xffffff, k);
      this.parts.armL.material = makeTintMat(this._headBase, 0xffffff, k);
    } else {
      this.parts.body.material = this._bodyBase;
      this.parts.head.material = this._headBase;
      this.parts.legL.material = this._headBase; // legR, armL, armR share this material
      this.parts.armL.material = this._headBase;
    }
  }
}

const _matCache = new Map();
function makeTintMat(base, tint, k) {
  const key = `${base.uuid}_${k.toFixed(2)}`;
  let m = _matCache.get(key);
  if (m) return m;
  m = base.clone();
  m.color = base.color.clone().lerp(new THREE.Color(tint), k);
  _matCache.set(key, m);
  // Cap the cache
  if (_matCache.size > 60) {
    const first = _matCache.keys().next().value;
    const old = _matCache.get(first);
    old.dispose && old.dispose();
    _matCache.delete(first);
  }
  return m;
}
