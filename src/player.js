import * as THREE from 'three';
import { WEAPONS, buildViewModel } from './weapons.js';

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.maxHp = localStorage.getItem('survive_hpBoost') === 'true' ? 400 : 100;
    this.hp = this.maxHp;
    this.alive = true;

    // movement
    this.velocityY = 0;
    this.onGround = true;
    this.height = 1.7;
    this.radius = 0.4;

    // weapons
    this.inventory = {
      fists:   { owned: true,  ammo: Infinity },
      pistol:  { owned: false, ammo: 0 },
      shotgun: { owned: false, ammo: 0 },
      rifle:   { owned: false, ammo: 0 },
    };
    this.mags = { pistol: 0, shotgun: 0, rifle: 0 }; // current rounds in magazine
    this.currentWeapon = 'fists';
    this.cooldown = 0;
    this.reloading = 0;

    this.viewModelGroup = new THREE.Group();
    this.viewModel = null;
    this.equip('fists');
  }

  weapon() { return WEAPONS[this.currentWeapon]; }

  damage(n) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0) { this.alive = false; }
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  equip(id) {
    if (!this.inventory[id] || !this.inventory[id].owned) return;
    this.currentWeapon = id;
    this.cooldown = 0.15; // small swap delay
    this.reloading = 0;
    this.equipT = 0.3;

    while (this.viewModelGroup.children.length) this.viewModelGroup.remove(this.viewModelGroup.children[0]);
    this.viewModel = buildViewModel(id);
    this.viewModelGroup.add(this.viewModel);
  }

  pickupWeapon(id, ammo) {
    const slot = this.inventory[id];
    if (!slot) return false;
    const wasOwned = slot.owned;
    slot.owned = true;
    slot.ammo = (slot.ammo === Infinity) ? Infinity : slot.ammo + ammo;
    if (!wasOwned) {
      // load a magazine
      const w = WEAPONS[id];
      const need = Math.min(w.magSize, slot.ammo);
      this.mags[id] = need;
      slot.ammo -= need;
      this.equip(id);
      return { newWeapon: true };
    }
    return { newWeapon: false };
  }

  pickupAmmo(id, amount) {
    const slot = this.inventory[id];
    if (!slot || !slot.owned) return false;
    slot.ammo += amount;
    return true;
  }

  startReload() {
    const id = this.currentWeapon;
    const w = WEAPONS[id];
    if (w.melee) return;
    if (this.reloading > 0) return;
    if (this.mags[id] >= w.magSize) return;
    if (this.inventory[id].ammo <= 0) return;
    this.reloading = w.reloadTime;
    this.reloadingMax = w.reloadTime;
  }

  finishReload() {
    const id = this.currentWeapon;
    const w = WEAPONS[id];
    const need = w.magSize - this.mags[id];
    const take = Math.min(need, this.inventory[id].ammo);
    this.mags[id] += take;
    this.inventory[id].ammo -= take;
  }

  tick(dt) {
    if (this.equipT > 0) {
      this.equipT = Math.max(0, this.equipT - dt);
    }
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.reloading = 0; this.finishReload(); }
    }
  }

  canFire() {
    if (!this.alive) return false;
    if (this.cooldown > 0) return false;
    if (this.reloading > 0) return false;
    const id = this.currentWeapon;
    const w = WEAPONS[id];
    if (w.melee) return true;
    return this.mags[id] > 0;
  }

  consumeShot() {
    const id = this.currentWeapon;
    const w = WEAPONS[id];
    if (w.melee) { this.cooldown = w.fireRate; return; }
    this.mags[id] = Math.max(0, this.mags[id] - 1);
    this.cooldown = w.fireRate;
    if (this.mags[id] === 0 && this.inventory[id].ammo > 0) this.startReload();
  }

  ammoText() {
    const id = this.currentWeapon;
    const w = WEAPONS[id];
    if (w.melee) return '∞';
    const reserve = this.inventory[id].ammo;
    return `${this.mags[id]} / ${reserve}`;
  }
}
