import * as THREE from 'three';
import { rand, randInt } from './util.js';

const CHEST_SIZE = { w: 0.9, h: 0.7, d: 0.6 };

export class Chest {
  constructor(x, z) {
    this.opened = false;
    this.position = new THREE.Vector3(x, 0, z);
    this.loot = pickLoot();

    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const wood = new THREE.MeshStandardMaterial({ color: 0x6e3a16, roughness: 0.8 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4, metalness: 0.7 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(CHEST_SIZE.w, CHEST_SIZE.h * 0.6, CHEST_SIZE.d), wood);
    base.position.y = CHEST_SIZE.h * 0.3;
    base.castShadow = true;
    base.receiveShadow = true;

    const lid = new THREE.Mesh(new THREE.BoxGeometry(CHEST_SIZE.w, CHEST_SIZE.h * 0.4, CHEST_SIZE.d), wood);
    lid.position.y = CHEST_SIZE.h * 0.6 + CHEST_SIZE.h * 0.2;
    lid.castShadow = true;
    this.lidPivotY = lid.position.y;
    this.lid = lid;

    // gold trim
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(CHEST_SIZE.w + 0.02, 0.03, CHEST_SIZE.d + 0.02), trim);
    t1.position.y = CHEST_SIZE.h * 0.6;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), trim);
    lock.position.set(0, CHEST_SIZE.h * 0.55, CHEST_SIZE.d / 2 + 0.02);

    // glow ring on the ground
    const ringGeo = new THREE.RingGeometry(0.7, 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.ring = ring;

    group.add(base, lid, t1, lock, ring);
    this.mesh = group;

    this.bobT = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.bobT += dt;
    if (this.ring) this.ring.material.opacity = 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(this.bobT * 3));
    if (this.opened) {
      // animate the lid opening
      this.lid.rotation.x = Math.max(this.lid.rotation.x - dt * 3, -1.2);
    }
  }

  open() {
    if (this.opened) return null;
    this.opened = true;
    if (this.ring) this.ring.visible = false;
    return this.loot;
  }
}

function pickLoot() {
  // 35% HP pack, 65% gun (or ammo if you already have it)
  const r = Math.random();
  if (r < 0.35) {
    return { type: 'hp', amount: randInt(25, 60) };
  }
  // weighted gun: pistol common, shotgun/rifle rarer
  const guns = [
    { id: 'pistol',  weight: 5 },
    { id: 'shotgun', weight: 3 },
    { id: 'rifle',   weight: 3 },
  ];
  const total = guns.reduce((s, g) => s + g.weight, 0);
  let pick = Math.random() * total;
  for (const g of guns) {
    if ((pick -= g.weight) <= 0) {
      const ammoBase = { pistol: 24, shotgun: 12, rifle: 60 }[g.id];
      return { type: 'gun', id: g.id, ammo: ammoBase };
    }
  }
}
