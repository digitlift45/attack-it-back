import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { Player } from './player.js';
import { WEAPONS } from './weapons.js';
import { Enemy } from './enemies.js';
import { Chest } from './chests.js';
import { buildMap } from './maps/index.js';
import { buildCharacter } from './character.js';
import { createComposer } from './postfx.js';
import { tickWind, clearWind } from './effects/wind.js';
import { createMenuScene } from './menuScene.js';
import { rand, randInt, clamp, dist2, moveWithCollision, collidesCircleAabb, findClearSpawn } from './util.js';

// Global persistent state
const persist = {
  get coins() { return parseInt(localStorage.getItem('survive_coins') || '0', 10); },
  set coins(v) { localStorage.setItem('survive_coins', v); },
  get hpBoost() { return localStorage.getItem('survive_hpBoost') === 'true'; },
  set hpBoost(v) { localStorage.setItem('survive_hpBoost', v); },
  get shades() { return localStorage.getItem('survive_shades') === 'true'; },
  set shades(v) { localStorage.setItem('survive_shades', v); },
  get hat() { return localStorage.getItem('survive_hat') === 'true'; },
  set hat(v) { localStorage.setItem('survive_hat', v); },
};

const settings = {
  fov: parseInt(localStorage.getItem('set_fov') || '78', 10),
  sens: parseFloat(localStorage.getItem('set_sens') || '1.0'),
  quality: localStorage.getItem('set_quality') || 'high',
  bob: localStorage.getItem('set_bob') !== 'false',
  showFps: localStorage.getItem('set_fps') === 'true',
  brightness: parseInt(localStorage.getItem('set_brightness') || '100', 10),
  volume: parseInt(localStorage.getItem('set_volume') || '100', 10),
  difficulty: localStorage.getItem('set_difficulty') || 'normal',
};

// ----------------------- DOM refs -----------------------
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
const canvas = document.getElementById('canvas');

const hpFill = document.getElementById('hp-fill');
const hpText = document.getElementById('hp-text');
const waveNum = document.getElementById('wave-num');
const killCount = document.getElementById('kill-count');
const enemyCount = document.getElementById('enemy-count');
const promptEl = document.getElementById('prompt');
const hitFlash = document.getElementById('hit-flash');
const damageVignette = document.getElementById('damage-vignette');
const drownVignette = document.getElementById('drown-vignette');
const pickupToast = document.getElementById('pickup-toast');

const minimapCanvas = document.getElementById('minimap');
const minimapName = document.getElementById('minimap-name');
const minimapCtx = minimapCanvas?.getContext('2d');

const crosshair = document.getElementById('crosshair');
const hitMarker = document.getElementById('hit-marker');
const killMarker = document.getElementById('kill-marker');

const pauseMenu = document.getElementById('pause-menu');
const settingsMenu = document.getElementById('settings-menu');
const gameOver = document.getElementById('game-over');
const clickToPlay = document.getElementById('click-to-play');
const finalWave = document.getElementById('final-wave');
const finalKills = document.getElementById('final-kills');
const fpsCounter = document.getElementById('fps-counter');

// Settings DOM
const btnSettingsOpen = document.getElementById('btn-settings-open');
const btnSettingsClose = document.getElementById('btn-settings-close');
const btnSettingsPause = document.getElementById('btn-settings-pause');
const inFov = document.getElementById('set-fov');
const inSens = document.getElementById('set-sens');
const inQuality = document.getElementById('set-quality');
const inBob = document.getElementById('set-bob');
const inFps = document.getElementById('set-fps');
const inBrightness = document.getElementById('set-brightness');
const inVolume = document.getElementById('set-volume');
const inDifficulty = document.getElementById('set-difficulty');
const valFov = document.getElementById('fov-val');
const valSens = document.getElementById('sens-val');
const valBrightness = document.getElementById('brightness-val');
const valVolume = document.getElementById('volume-val');

// ----------------------- App state ----------------------
const state = {
  running: false,
  paused: false,
  alive: true,
  mapId: null,
  scene: null,
  renderer: null,
  camera: null,
  controls: null,
  player: null,
  obstacles: [],
  colliders: [],
  enemies: [],
  chests: [],
  spawnPoints: [],
  bounds: null,
  kills: 0,
  wave: 0,
  waveTimer: 3,         // time until next wave
  waveActive: false,
  toSpawn: 0,           // remaining enemies to spawn this wave
  spawnInterval: 1.4,
  spawnAccum: 0,
  keys: new Set(),
  mouseDown: false,
  lastTime: performance.now(),
  flashes: [],          // muzzle flash points to fade
  bulletTracers: [],    // {line, life, maxLife}
};

// ----------------------- Home screen wiring -------------
document.querySelectorAll('.map-card').forEach(card => {
  card.addEventListener('click', () => {
    const mapId = card.getAttribute('data-map');
    startGame(mapId);
  });
});

document.getElementById('btn-resume').addEventListener('click', () => {
  pauseMenu.classList.add('hidden');
  state.controls?.lock();
});

const cpToggle = document.getElementById('cp-toggle');
const cpPanel  = document.getElementById('controls-panel');
if (cpToggle && cpPanel) {
  cpToggle.addEventListener('click', () => {
    const collapsed = cpPanel.classList.toggle('collapsed');
    cpToggle.textContent = collapsed ? '+' : '−';
  });
}
document.getElementById('btn-quit').addEventListener('click', quitToMenu);
document.getElementById('btn-quit2').addEventListener('click', quitToMenu);
document.getElementById('btn-retry').addEventListener('click', () => {
  gameOver.classList.add('hidden');
  startGame(state.mapId);
});

const homeCoins = document.getElementById('home-coins');
const btnBuyHp = document.getElementById('buy-hp');
const btnBuyShades = document.getElementById('buy-shades');
const btnBuyHat = document.getElementById('buy-hat');

function updateMenuUI() {
  if (homeCoins) homeCoins.textContent = persist.coins;
  
  if (btnBuyHp) {
    if (persist.hpBoost) { btnBuyHp.classList.add('owned'); btnBuyHp.disabled = true; btnBuyHp.querySelector('span').textContent = 'HP BOOST (OWNED)'; }
    else { btnBuyHp.disabled = persist.coins < parseInt(btnBuyHp.dataset.cost); }
  }
  if (btnBuyShades) {
    if (persist.shades) { btnBuyShades.classList.add('owned'); btnBuyShades.disabled = true; btnBuyShades.querySelector('span').textContent = 'COOL SHADES (OWNED)'; }
    else { btnBuyShades.disabled = persist.coins < parseInt(btnBuyShades.dataset.cost); }
  }
  if (btnBuyHat) {
    if (persist.hat) { btnBuyHat.classList.add('owned'); btnBuyHat.disabled = true; btnBuyHat.querySelector('span').textContent = 'TACTICAL HELMET (OWNED)'; }
    else { btnBuyHat.disabled = persist.coins < parseInt(btnBuyHat.dataset.cost); }
  }
}

if (btnBuyHp) btnBuyHp.addEventListener('click', () => { if (persist.coins >= 5) { persist.coins -= 5; persist.hpBoost = true; updateMenuUI(); } });
if (btnBuyShades) btnBuyShades.addEventListener('click', () => { if (persist.coins >= 20) { persist.coins -= 20; persist.shades = true; updateMenuUI(); if (charPreviewApp) charPreviewApp.updateChar(); } });
if (btnBuyHat) btnBuyHat.addEventListener('click', () => { if (persist.coins >= 30) { persist.coins -= 30; persist.hat = true; updateMenuUI(); if (charPreviewApp) charPreviewApp.updateChar(); } });

updateMenuUI();

// ----------------------- Settings UI --------------------
function initSettingsUI() {
  inFov.value = settings.fov;
  valFov.textContent = settings.fov;
  inSens.value = settings.sens;
  valSens.textContent = settings.sens.toFixed(1);
  inQuality.value = settings.quality;
  inBob.checked = settings.bob;
  inFps.checked = settings.showFps;
  inBrightness.value = settings.brightness;
  valBrightness.textContent = settings.brightness;
  inVolume.value = settings.volume;
  valVolume.textContent = settings.volume;
  inDifficulty.value = settings.difficulty;

  inFov.addEventListener('input', e => { valFov.textContent = e.target.value; });
  inSens.addEventListener('input', e => { valSens.textContent = parseFloat(e.target.value).toFixed(1); });
  inBrightness.addEventListener('input', e => { valBrightness.textContent = e.target.value; });
  inVolume.addEventListener('input', e => { valVolume.textContent = e.target.value; });

  btnSettingsOpen?.addEventListener('click', () => {
    settingsMenu.classList.remove('hidden');
  });
  
  btnSettingsPause?.addEventListener('click', () => {
    pauseMenu.classList.add('hidden');
    settingsMenu.classList.remove('hidden');
    settingsMenu.dataset.fromPause = 'true';
  });

  btnSettingsClose?.addEventListener('click', () => {
    settings.fov = parseInt(inFov.value, 10);
    settings.sens = parseFloat(inSens.value);
    settings.quality = inQuality.value;
    settings.bob = inBob.checked;
    settings.showFps = inFps.checked;
    settings.brightness = parseInt(inBrightness.value, 10);
    settings.volume = parseInt(inVolume.value, 10);
    settings.difficulty = inDifficulty.value;

    localStorage.setItem('set_fov', settings.fov);
    localStorage.setItem('set_sens', settings.sens);
    localStorage.setItem('set_quality', settings.quality);
    localStorage.setItem('set_bob', settings.bob);
    localStorage.setItem('set_fps', settings.showFps);
    localStorage.setItem('set_brightness', settings.brightness);
    localStorage.setItem('set_volume', settings.volume);
    localStorage.setItem('set_difficulty', settings.difficulty);

    applySettings();
    settingsMenu.classList.add('hidden');
    
    if (settingsMenu.dataset.fromPause === 'true') {
      pauseMenu.classList.remove('hidden');
      delete settingsMenu.dataset.fromPause;
    }
  });
}
initSettingsUI();

function applySettings() {
  if (state.camera) {
    state.baseFov = settings.fov;
    state.camera.fov = settings.fov + state.fovPunch;
    state.camera.updateProjectionMatrix();
  }
  if (state.controls) {
    state.controls.pointerSpeed = settings.sens;
  }
  
  if (settings.showFps) {
    fpsCounter.classList.remove('hidden');
  } else {
    fpsCounter.classList.add('hidden');
  }

  // Quality toggles
  if (state.renderer) {
    state.renderer.shadowMap.type = settings.quality === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  }
  if (state.fx) {
    // Toggle expensive passes based on quality
    const isLow = settings.quality === 'low';
    const isHigh = settings.quality === 'high';
    
    // GTAO is heavy, disable on low
    state.fx.gtao.enabled = !isLow;
    
    // Bloom disable on low
    state.fx.bloom.enabled = !isLow;
    
    // SMAA disable on low
    state.fx.smaa.enabled = !isLow;
    
    // Godrays only on high
    state.fx.godRays.enabled = isHigh;

    // Apply brightness scaling
    state.fx.grade.uniforms.uBrightness.value = 0.55 * (settings.brightness / 100);
  }
}

// ----------------------- Start / quit -------------------
function startGame(mapId) {
  state.mapId = mapId;
  homeScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  gameOver.classList.add('hidden');
  clickToPlay.classList.add('hidden');

  // Stop the menu's animated background so it doesn't eat GPU during the game
  if (state.menuScene) state.menuScene.pause();

  resetWorld();
  buildWorld(mapId);
  state.running = true;
  state.lastTime = performance.now();

  // Try to lock pointer immediately. Some browsers require a user gesture; clicking the map card counts.
  setTimeout(() => state.controls.lock(), 50);

  if (!state._loopStarted) {
    state._loopStarted = true;
    requestAnimationFrame(loop);
  }
}

function quitToMenu() {
  state.running = false;
  if (state.controls?.isLocked) state.controls.unlock();
  pauseMenu.classList.add('hidden');
  gameOver.classList.add('hidden');
  clickToPlay.classList.add('hidden');
  gameScreen.classList.add('hidden');
  homeScreen.classList.remove('hidden');

  if (state.menuScene) state.menuScene.resume();

  disposeScene();
}

function disposeScene() {
  if (state.scene) {
    state.scene.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  }
  state.scene = null;
  state.enemies = [];
  state.chests = [];
  state.obstacles = [];
  state.colliders = [];
  state.playerBody = null;
}

// ----------------------- World setup --------------------
function resetWorld() {
  if (state.renderer) state.renderer.dispose();
  state.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.setSize(window.innerWidth, window.innerHeight, false);
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.0;

  state.scene = new THREE.Scene();

  state.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 800);
  state.camera.position.set(0, 1.7, 0);
  state.baseFov = 78;
  state.fovPunch = 0;

  state.controls = new PointerLockControls(state.camera, document.body);

  state.controls.addEventListener('lock', () => {
    state.paused = false;
    pauseMenu.classList.add('hidden');
    clickToPlay.classList.add('hidden');
  });
  state.controls.addEventListener('unlock', () => {
    if (!state.alive) return;
    if (!state.running) return;
    state.paused = true;
    pauseMenu.classList.remove('hidden');
  });

  state.player = new Player(state.camera);
  // Attach view model so we can render it as part of the camera.
  state.camera.add(state.player.viewModelGroup);
  state.scene.add(state.camera);

  // Build the player's body for first-person — only legs + boots are kept so the
  // player doesn't see their own head, arms, or belly when looking down/around.
  state.playerBody = buildCharacter({ includeHead: false, includeArms: false, includeTorso: false });
  state.playerBody.userData.walkPhase = 0;
  state.scene.add(state.playerBody);

  state.kills = 0;
  state.wave = 0;
  state.waveTimer = 3;
  state.waveActive = false;
  state.toSpawn = 0;
  state.spawnAccum = 0;
  state.alive = true;
  state.flashes = [];
  state.bulletTracers = [];
  state.muzzleLights = [];
  state._drops = [];
  state.particles = [];
  state.water = null;
  state.atmo = null;
  state.dyingEnemies = [];
  state.bloodParticles = [];
  state._decals = [];
  state.windTime = 0;

  clearWind();

  applySettings();
}

function buildWorld(mapId) {
  const m = buildMap(mapId, state.scene, state.renderer);

  // Set up the postprocessing pipeline (bloom + grade + SMAA + tone-mapped output).
  state.fx = createComposer(state.renderer, state.scene, state.camera);

  if (minimapName) minimapName.textContent = mapId.toUpperCase();
  setupMinimap();

  state.obstacles = m.obstacles;
  state.colliders = m.colliders;
  state.ladders = m.ladders || [];
  state.bounds = m.bounds;
  state.getGroundHeight = m.getGroundHeight || (() => 0);
  state.particles = m.particles || [];
  state.water     = m.water     || null;
  state.atmo      = m.atmo      || null;

  // Filter spawn points and chest spots to ensure they are not inside obstacles
  state.spawnPoints = m.spawnPoints.filter(p => !collidesCircleAabb(p.x, state.getGroundHeight(p.x, p.z), p.z, 0.6, state.obstacles));
  const validChestSpots = m.chestSpots.filter(p => !collidesCircleAabb(p.x, state.getGroundHeight(p.x, p.z), p.z, 0.8, state.obstacles));

  // Position player at terrain height. We run the requested spawn through
  // `findClearSpawn` so the player can never end up clipped inside a wall —
  // if the spot is blocked we spiral outward and pick the nearest clear one.
  const safeStart = findClearSpawn(m.playerStart, state.bounds, state.obstacles);
  state.playerStart = safeStart;
  const startY = state.getGroundHeight(safeStart.x, safeStart.z);
  state.camera.position.set(safeStart.x, startY + state.player.height, safeStart.z);
  // Face the open doorway (the cabin tells us its yaw via playerStart.facing)
  // so the spawn feels intentional and consistent across runs.
  state.camera.rotation.set(0, m.playerStart.facing ?? 0, 0);
  state.camera.up.set(0, 1, 0);

  // Drop chests, snapping each to the terrain height under it.
  const chestCount = clamp(validChestSpots.length, 6, 14);
  const used = [];
  for (let i = 0; i < chestCount; i++) {
    const idx = (i * 17 + 3) % validChestSpots.length;
    const spot = validChestSpots[idx];
    if (!spot) continue;
    if (used.some(u => dist2(u.x, u.z, spot.x, spot.z) < 9)) continue;
    used.push(spot);
    const gy = state.getGroundHeight(spot.x, spot.z);
    const chest = new Chest(spot.x, spot.z);
    chest.position.y = gy;
    chest.mesh.position.y = gy;
    state.chests.push(chest);
    state.scene.add(chest.mesh);
  }

  updateHUD();
}

// ----------------------- Input --------------------------
window.addEventListener('keydown', (e) => {
  state.keys.add(e.code);
  if (e.code === 'Escape') {
    // PointerLock auto-unlock -> handled in unlock listener
  }
  if (e.code === 'KeyR') state.player?.startReload();
  if (e.code === 'Digit1') tryEquip('fists');
  if (e.code === 'Digit2') tryEquip('pistol');
  if (e.code === 'Digit3') tryEquip('shotgun');
  if (e.code === 'Digit4') tryEquip('rifle');
  if (e.code === 'KeyE') tryOpenChest();
});
window.addEventListener('keyup', (e) => state.keys.delete(e.code));
window.addEventListener('mousedown', (e) => {
  if (!state.running || state.paused || !state.alive) return;
  if (e.button === 0) state.mouseDown = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) state.mouseDown = false;
});
window.addEventListener('resize', () => {
  if (!state.renderer) return;
  state.renderer.setSize(window.innerWidth, window.innerHeight, false);
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  if (state.fx) state.fx.setSize(window.innerWidth, window.innerHeight);
});

// Show "click to play" overlay when game is running and pointer is unlocked but pause menu isn't open (alive only)
canvas.addEventListener('click', () => {
  if (state.running && state.alive && !state.controls.isLocked && !pauseMenu.classList.contains('hidden') === false) {
    state.controls.lock();
  }
});

function tryEquip(id) {
  if (!state.player) return;
  if (!state.player.inventory[id]?.owned) return;
  state.player.equip(id);
  updateHUD();
}

// ----------------------- Helpers ------------------------
function showToast(text, color = '#aef0a0') {
  pickupToast.textContent = text;
  pickupToast.style.color = color;
  pickupToast.classList.remove('show');
  void pickupToast.offsetWidth;
  pickupToast.classList.add('show');
  clearTimeout(pickupToast._t);
  pickupToast._t = setTimeout(() => pickupToast.classList.remove('show'), 1300);
}

function flashHit() {
  hitFlash.classList.add('flash');
  setTimeout(() => hitFlash.classList.remove('flash'), 100);
}

// ----------------------- Open chest ---------------------
function tryOpenChest() {
  if (!state.alive || !state.running) return;
  const px = state.camera.position.x, pz = state.camera.position.z;
  let nearest = null, nd = 4;
  for (const c of state.chests) {
    if (c.opened) continue;
    const d = Math.sqrt(dist2(px, pz, c.position.x, c.position.z));
    if (d < nd) { nd = d; nearest = c; }
  }
  if (!nearest) return;
  const loot = nearest.open();
  if (!loot) return;
  if (loot.type === 'hp') {
    state.player.heal(loot.amount);
    showToast(`+${loot.amount} HP`, '#aef0a0');
  } else if (loot.type === 'gun') {
    const result = state.player.pickupWeapon(loot.id, loot.ammo);
    const weaponLabel = WEAPONS[loot.id].name;
    if (result.newWeapon) {
      showToast(`PICKED UP ${weaponLabel}`, '#ffd86b');
    } else {
      showToast(`+${loot.ammo} ${weaponLabel} AMMO`, '#ffd86b');
    }
  }
  updateHUD();
}

// ----------------------- Movement -----------------------
const moveDir = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

function updatePlayerMovement(dt) {
  if (!state.alive) return;
  const speed = 5.2;
  const jumpSpeed = 6.0;
  const gravity = 16.0;

  // build move direction in camera-relative space
  state.controls.getDirection(fwd);
  fwd.y = 0; fwd.normalize();
  right.set(fwd.z, 0, -fwd.x);

  moveDir.set(0, 0, 0);
  if (state.keys.has('KeyW')) moveDir.add(fwd);
  if (state.keys.has('KeyS')) moveDir.sub(fwd);
  if (state.keys.has('KeyA')) moveDir.add(right);
  if (state.keys.has('KeyD')) moveDir.sub(right);
  if (moveDir.lengthSq() > 0) moveDir.normalize();

  const cam = state.camera;
  const pos = { x: cam.position.x, y: cam.position.y - state.player.height, z: cam.position.z };

  let onLadder = false;
  if (state.ladders) {
    for (const lad of state.ladders) {
      if (cam.position.x >= lad.minX && cam.position.x <= lad.maxX &&
          cam.position.z >= lad.minZ && cam.position.z <= lad.maxZ &&
          pos.y >= lad.minY - 0.5 && pos.y <= lad.maxY) {
        onLadder = true;
        break;
      }
    }
  }
  state.player.onLadder = onLadder;

  if (onLadder) {
    state.player.onGround = true; // resets jump state
    let vert = 0;
    if (state.keys.has('KeyW')) vert = 4;
    if (state.keys.has('KeyS')) vert = -4;
    state.player.velocityY = vert;
    cam.position.y += state.player.velocityY * dt;
    
    if (state.keys.has('Space')) {
       // jump off ladder
       state.player.velocityY = jumpSpeed * 0.8;
       state.player.onGround = false;
       state.player.onLadder = false;
       onLadder = false;
    }
  }

  const dx = moveDir.x * speed * dt;
  const dz = moveDir.z * speed * dt;
  moveWithCollision(pos, dx, dz, state.player.radius, state.obstacles);
  cam.position.x = pos.x;
  cam.position.z = pos.z;

  let groundY = (state.getGroundHeight ? state.getGroundHeight(cam.position.x, cam.position.z) : 0);
  for (const o of state.obstacles) {
    if (cam.position.x >= o.minX && cam.position.x <= o.maxX &&
        cam.position.z >= o.minZ && cam.position.z <= o.maxZ) {
      if (o.maxY !== Infinity && (pos.y >= o.maxY - 0.5 || onLadder)) {
        groundY = Math.max(groundY, o.maxY);
      }
    }
  }

  if (!onLadder) {
    // jump + gravity
    if (state.keys.has('Space') && state.player.onGround) {
      state.player.velocityY = jumpSpeed;
      state.player.onGround = false;
    }
    state.player.velocityY -= gravity * dt;
    cam.position.y += state.player.velocityY * dt;

    const floorY = groundY + state.player.height;
    if (cam.position.y <= floorY) {
      if (!state.player.onGround) {
        state.landDipT = 0.3; // start land dip
      }
      
      // If we're walking up a slope, smoothly step up rather than snapping
      if (state.player.onGround) {
        cam.position.y += (floorY - cam.position.y) * Math.min(1, dt * 18);
      } else {
        cam.position.y = floorY;
      }
      state.player.velocityY = 0;
      state.player.onGround = true;
    } else {
      state.player.onGround = false;
    }
  } else {
    // Clamping to roof if we reach it
    const floorY = groundY + state.player.height;
    if (cam.position.y <= floorY) {
      cam.position.y = floorY;
    }
  }

  // clamp inside bounds
  if (state.bounds) {
    cam.position.x = clamp(cam.position.x, state.bounds.minX + 1, state.bounds.maxX - 1);
    cam.position.z = clamp(cam.position.z, state.bounds.minZ + 1, state.bounds.maxZ - 1);
  }

  // Tiny breathing/walk-bob sway on the viewmodel group (additive — base offsets
  // live inside the viewmodel itself).
  const moving = (state.keys.has('KeyW') || state.keys.has('KeyA') || state.keys.has('KeyS') || state.keys.has('KeyD')) ? 1 : 0;
  const sway = state.player.viewModelGroup;
  if (sway && sway.children.length) {
    if (settings.bob) {
      const t = performance.now() * 0.005;
      sway.position.y = Math.sin(t * 2.5) * 0.015 * (1 + moving * 1.5);
      sway.position.x = Math.cos(t * 1.3) * 0.015 * (1 + moving * 1.5);
      // Add a slight roll for more dramatic movement feel
      sway.rotation.z = Math.sin(t * 1.3) * 0.02 * moving;
    } else {
      sway.position.y = 0;
      sway.position.x = 0;
      sway.rotation.z = 0;
    }
  }

  // Sync the player body to the camera (yaw only — body stays upright when you pitch up/down).
  if (state.playerBody) {
    state.playerBody.position.set(cam.position.x, cam.position.y - state.player.height, cam.position.z);
    // Face the same direction as the camera, projected to the ground plane.
    state.controls.getDirection(_dirHelper);
    state.playerBody.lookAt(
      cam.position.x + _dirHelper.x,
      state.playerBody.position.y,
      cam.position.z + _dirHelper.z,
    );

    // Walk cycle: swing legs when moving.
    const ud = state.playerBody.userData;
    ud.walkPhase += dt * (moving ? 9 : 0);
    const swing = moving ? Math.sin(ud.walkPhase) * 0.55 : 0;
    if (ud.hipL) ud.hipL.rotation.x =  swing;
    if (ud.hipR) ud.hipR.rotation.x = -swing;
    // Damp back to neutral when you stop
    if (!moving) {
      if (ud.hipL) ud.hipL.rotation.x *= 0.85;
      if (ud.hipR) ud.hipR.rotation.x *= 0.85;
    }
  }
}

const _dirHelper = new THREE.Vector3();
const _sunUv = new THREE.Vector2();

// ----------------------- Shooting -----------------------
const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

function tryFire() {
  if (!state.alive || !state.running || state.paused) return;
  if (!state.mouseDown) return;
  if (!state.player.canFire()) return;

  const w = state.player.weapon();
  state.player.consumeShot();

  // Visual feedback every shot: viewmodel kick + FOV punch.
  applyShotFeedback(w);

  // Melee: hit closest enemy in front within range
  if (w.melee) {
    state.controls.getDirection(_dir);
    _origin.copy(state.camera.position);
    let best = null, bestD = w.range;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ex = e.position.x - _origin.x, ez = e.position.z - _origin.z;
      const d = Math.sqrt(ex*ex + ez*ez);
      if (d > bestD) continue;
      const facingDot = (ex/d) * _dir.x + (ez/d) * _dir.z;
      if (facingDot > 0.6) { bestD = d; best = e; }
    }
    if (best) {
      const hp = state.camera.position.clone().add(_dir.clone().multiplyScalar(bestD * 0.9));
      hp.y = best.position.y + 1.0;
      onEnemyHit(best, w.damage, hp);
    }
    return;
  }

  // Muzzle flash for ranged weapons (one bright bloom-able ball at the barrel tip).
  spawnMuzzleFlash();

  // Ranged: raycast through camera
  for (let p = 0; p < w.pellets; p++) {
    state.controls.getDirection(_dir);
    if (w.spread > 0) {
      _dir.x += (Math.random() - 0.5) * w.spread;
      _dir.y += (Math.random() - 0.5) * w.spread;
      _dir.z += (Math.random() - 0.5) * w.spread;
      _dir.normalize();
    }
    _origin.copy(state.camera.position);
    _ray.set(_origin, _dir);
    _ray.far = w.range;

    // Build candidate list = enemy meshes + map colliders
    const enemyMeshes = state.enemies.filter(e => e.alive).map(e => e.mesh);
    const targets = [...state.colliders, ...enemyMeshes];

    // We need to recurse for enemy groups
    const hits = _ray.intersectObjects(targets, true);
    let hit = null;
    if (hits.length) hit = hits[0];

    // tracer
    addTracer(_origin.clone(), hit ? hit.point.clone() : _origin.clone().add(_dir.clone().multiplyScalar(w.range)));

      if (hit) {
      const enemyHit = findEnemyByMesh(hit.object);
      if (enemyHit) {
        let dmg = w.damage;
        if (hit.object === enemyHit.head) dmg = Math.round(dmg * 1.7);
        onEnemyHit(enemyHit, dmg, hit.point.clone());
      } else {
        // Transform face normal into world space
        const worldNormal = hit.face?.normal ? hit.face.normal.clone()
          .transformDirection(hit.object.matrixWorld).normalize() : null;
        spawnImpact(hit.point, worldNormal);
      }
    }
  }
}

// ----- Visual feedback for shooting (kick, flash, FOV punch) -----
const _muzzleWorld = new THREE.Vector3();
function spawnMuzzleFlash() {
  const vmg = state.player?.viewModelGroup;
  const muzzle = vmg?.children?.[0]?.userData?.muzzle;
  if (!muzzle) return;

  // Place a bright sphere at the barrel tip in world space.
  muzzle.getWorldPosition(_muzzleWorld);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 1 })
  );
  flash.position.copy(_muzzleWorld);
  flash.userData.life = 0.07;
  flash.userData.max = 0.07;
  state.scene.add(flash);
  state.bulletTracers.push({ line: flash, life: 0.07, max: 0.07 });

  // A short-lived point light for actual scene illumination
  const pl = new THREE.PointLight(0xffd060, 6, 6, 2);
  pl.position.copy(_muzzleWorld);
  pl.userData.life = 0.07;
  pl.userData.max = 0.07;
  state.scene.add(pl);
  state.muzzleLights = state.muzzleLights || [];
  state.muzzleLights.push({ light: pl, life: 0.07, max: 0.07 });
}

function applyShotFeedback(w) {
  const vmg = state.player?.viewModelGroup;
  if (!vmg) return;

  // Kick the viewmodel back + slight upward rotation, settles in the tick.
  vmg.userData.kickZ = (vmg.userData.kickZ || 0) + (w.melee ? 0.06 : (w.id === 'shotgun' ? 0.16 : w.id === 'rifle' ? 0.07 : 0.10));
  vmg.userData.kickPitch = (vmg.userData.kickPitch || 0) + (w.melee ? 0 : (w.id === 'shotgun' ? 0.16 : w.id === 'rifle' ? 0.05 : 0.08));

  // FOV punch (slight zoom-out feeling)
  if (state.baseFov != null) {
    const punch = w.melee ? 0.4 : (w.id === 'shotgun' ? 2.2 : w.id === 'rifle' ? 0.9 : 1.4);
    state.fovPunch = Math.min(state.fovPunch + punch, 6);
  }

  const root = vmg.children[0];
  if (root?.userData) {
    // For fists: swing the next-up hand forward
    if (root.userData.fists) {
      const which = root.userData.nextPunch || 'right';
      const hand = which === 'right' ? root.userData.rightHand : root.userData.leftHand;
      if (hand) hand.userData.punchT = 0.001; // start animation
      root.userData.nextPunch = which === 'right' ? 'left' : 'right';
    }
    // For pistol: slide blowback
    if (w.id === 'pistol') root.userData.slideT = 0.001;
    // For shotgun: pump action
    if (w.id === 'shotgun') root.userData.pumpT = 0.001;
  }
}

function tickViewmodel(dt) {
  const vmg = state.player?.viewModelGroup;
  if (!vmg) return;
  const root = vmg.children[0];

  // Settle the kick (move-back and pitch-up)
  vmg.userData.kickZ = (vmg.userData.kickZ || 0) * Math.max(0, 1 - dt * 14);
  vmg.userData.kickPitch = (vmg.userData.kickPitch || 0) * Math.max(0, 1 - dt * 14);
  
  if (root) {
    // Pistol Slide
    if (root.userData.slide) {
      if (root.userData.slideT != null) {
        root.userData.slideT += dt;
        const dur = 0.15;
        const phase = root.userData.slideT / dur;
        if (phase >= 1) {
          root.userData.slideT = null;
          root.userData.slide.position.z = -0.06; // original
        } else {
          const k = 1 - Math.abs(phase * 2 - 1);
          root.userData.slide.position.z = -0.06 + k * 0.05;
        }
      }
    }

    // Shotgun Pump
    if (root.userData.pump) {
      if (root.userData.pumpT != null) {
        root.userData.pumpT += dt;
        const dur = 0.5;
        const phase = root.userData.pumpT / dur;
        if (phase >= 1) {
          root.userData.pumpT = null;
          root.userData.pump.position.z = -0.18; // original
          if (root.userData.pumpHand) root.userData.pumpHand.position.z = -0.20;
        } else {
          // pull back, hold, push forward
          let k = 0;
          if (phase < 0.4) k = phase / 0.4;
          else if (phase < 0.6) k = 1;
          else k = 1 - (phase - 0.6) / 0.4;
          root.userData.pump.position.z = -0.18 + k * 0.12;
          if (root.userData.pumpHand) root.userData.pumpHand.position.z = -0.20 + k * 0.12;
        }
      }
    }

    // Reload animation
    let reloadY = 0;
    let reloadRotX = 0;
    if (state.player.reloading > 0 && state.player.reloadingMax) {
      const phase = 1.0 - (state.player.reloading / state.player.reloadingMax);
      const k = Math.sin(phase * Math.PI); // 0 -> 1 -> 0
      reloadY = -0.3 * k;
      reloadRotX = 0.8 * k;
    }
    
    // Equip animation
    let equipY = 0;
    if (state.player.equipT > 0) {
      const phase = state.player.equipT / 0.3;
      const k = phase * phase; // Ease out
      equipY = -0.6 * k;
    }

    // Landing dip animation
    let landDip = 0;
    if (state.landDipT > 0) {
      state.landDipT = Math.max(0, state.landDipT - dt);
      const phase = state.landDipT / 0.3;
      const k = Math.sin(phase * Math.PI);
      landDip = -0.1 * k;
    }

    const baseZ = root.userData.fists ? -0.10 : -0.38;
    const baseY = root.userData.fists ? -0.05 : -0.20;
    const baseX = root.userData.fists ?  0.00 :  0.18;
    root.position.set(baseX, baseY + reloadY + equipY + landDip, baseZ + (vmg.userData.kickZ || 0));
    root.rotation.set(-(vmg.userData.kickPitch || 0) + reloadRotX, 0, 0);
  }

  // Animate fist punches
  if (root?.userData?.fists) {
    for (const hand of [root.userData.rightHand, root.userData.leftHand]) {
      if (!hand) continue;
      if (hand.userData.punchT == null) continue;
      hand.userData.punchT += dt;
      const t = hand.userData.punchT;
      const dur = 0.20;
      const phase = t / dur; // 0..1
      if (phase >= 1) {
        hand.userData.punchT = null;
        hand.position.z = -0.30;
      } else {
        // Out and back
        const k = 1 - Math.abs(phase * 2 - 1);
        hand.position.z = -0.30 - k * 0.30;
      }
    }
  }

  // Update muzzle point lights
  if (state.muzzleLights?.length) {
    for (let i = state.muzzleLights.length - 1; i >= 0; i--) {
      const ml = state.muzzleLights[i];
      ml.life -= dt;
      ml.light.intensity = 6 * Math.max(0, ml.life / ml.max);
      if (ml.life <= 0) {
        state.scene.remove(ml.light);
        state.muzzleLights.splice(i, 1);
      }
    }
  }
}

function findEnemyByMesh(mesh) {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (mesh === e.mesh) return e;
    let p = mesh;
    while (p) {
      if (p === e.mesh) return e;
      p = p.parent;
    }
  }
  return null;
}

function onEnemyHit(enemy, dmg, hitPoint) {
  const wasAlive = enemy.alive;
  enemy.hit(dmg);
  // Visual feedback: hit marker for damage, kill marker for kill
  showHitMarker(enemy.alive ? 'hit' : 'kill');
  // Blood particles at the hit point
  if (hitPoint) spawnBlood(hitPoint, enemy.alive ? 8 : 18);
  if (wasAlive && !enemy.alive) {
    state.kills++;
    persist.coins++;
    updateMenuUI();

    // Roblox-style death: break the mesh apart into individual falling pieces
    const parts = [
      enemy.parts.body, enemy.parts.head, enemy.parts.legL,
      enemy.parts.legR, enemy.parts.armL, enemy.parts.armR
    ];
    // Keep eyes attached to the head
    enemy.parts.head.add(enemy.parts.eyeL, enemy.parts.eyeR);

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    
    // Detach each part, put it in world space, and set up its fall physics
    for (const part of parts) {
      if (!part) continue;
      part.getWorldPosition(worldPos);
      part.getWorldQuaternion(worldQuat);
      
      state.scene.attach(part);
      part.position.copy(worldPos);
      part.quaternion.copy(worldQuat);
      
      state.dyingEnemies.push({
        mesh: part,
        t: 0,
        lifetime: 3.0,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 4 + 2,
          (Math.random() - 0.5) * 4
        ),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        )
      });
    }

    // Remove the empty parent group
    state.scene.remove(enemy.mesh);

    if (Math.random() < 0.18) dropAmmoAt(enemy.position.x, enemy.position.z);
    updateHUD();
  }
}

// ----- Hit / kill marker on the crosshair -----
function showHitMarker(kind) {
  const el = (kind === 'kill') ? killMarker : hitMarker;
  if (!el) return;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 220);
}

// ----- Blood particle burst at a world point -----
const _bloodMat = new THREE.MeshBasicMaterial({ color: 0xa10f0f, transparent: true, opacity: 1 });
function spawnBlood(point, count = 12) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), _bloodMat.clone());
    m.position.copy(point);
    const v = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 3.5 + 0.5,
      (Math.random() - 0.5) * 4,
    );
    state.scene.add(m);
    state.bloodParticles.push({ mesh: m, vel: v, life: 0.6, max: 0.6 });
  }
}

function dropAmmoAt(x, z) {
  const drop = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffd86b, emissive: 0x553a00, roughness: 0.5, metalness: 0.6 })
  );
  const gy = state.getGroundHeight ? state.getGroundHeight(x, z) : 0;
  drop.position.set(x, gy + 0.3, z);
  drop.userData.isAmmoDrop = true;
  drop.userData.spinT = 0;
  drop.userData.gy = gy;
  state.scene.add(drop);
  state._drops = state._drops || [];
  state._drops.push(drop);
}

function addTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geo, mat);
  state.scene.add(line);
  state.bulletTracers.push({ line, life: 0.08, max: 0.08 });
}

function spawnImpact(point, normal) {
  // Bright spark (briefly) — bloom picks this up.
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0 })
  );
  spark.position.copy(point);
  state.scene.add(spark);
  state.bulletTracers.push({ line: spark, life: 0.10, max: 0.10 });

  // Smoke puff
  const puff = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xb8b1a0, transparent: true, opacity: 0.55, depthWrite: false })
  );
  puff.position.copy(point);
  state.scene.add(puff);
  state.bulletTracers.push({ line: puff, life: 0.32, max: 0.32 });

  // Persistent decal — small dark disc oriented to the surface normal.
  if (normal) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 14),
      new THREE.MeshBasicMaterial({ color: 0x101015, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    disc.position.copy(point).addScaledVector(normal, 0.005);
    disc.lookAt(point.clone().add(normal));
    disc.renderOrder = 1;
    state.scene.add(disc);
    state._decals = state._decals || [];
    state._decals.push({ mesh: disc, life: 12, max: 12 });

    // Cap at 80 decals to avoid eternal growth
    if (state._decals.length > 80) {
      const old = state._decals.shift();
      state.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }
}

// ----------------------- Wave manager -------------------
function tickWaves(dt) {
  if (!state.waveActive) {
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) {
      state.wave++;
      state.toSpawn = 4 + state.wave * 2;
      state.spawnInterval = Math.max(0.5, 1.4 - state.wave * 0.07);
      state.spawnAccum = 0;
      state.waveActive = true;
      showToast(`WAVE ${state.wave}`, '#ff9966');
      updateHUD();
    }
    return;
  }
  if (state.toSpawn > 0) {
    state.spawnAccum += dt;
    if (state.spawnAccum >= state.spawnInterval) {
      state.spawnAccum = 0;
      state.toSpawn--;
      spawnEnemy();
    }
  }
  if (state.toSpawn <= 0 && state.enemies.every(e => !e.alive)) {
    // Wave cleared
    state.waveActive = false;
    state.waveTimer = 6;
    showToast(`WAVE ${state.wave} CLEARED`, '#aef0a0');
    // Heal a tiny bit between waves
    state.player.heal(15);
    updateHUD();
  }
}

function spawnEnemy() {
  if (!state.spawnPoints.length) return;
  // Pick kind based on wave
  let kind = 'grunt';
  const r = Math.random();
  if (state.wave >= 3 && r < 0.35) kind = 'runner';
  if (state.wave >= 5 && r < 0.15) kind = 'brute';
  const radius = kind === 'brute' ? 0.6 : 0.45;

  let ex = 0, ez = 0, gy = 0;
  let found = false;
  
  for (let i = 0; i < 15; i++) {
    const idx = Math.floor(Math.random() * state.spawnPoints.length);
    const p = state.spawnPoints[idx];
    const tryX = p.x + (Math.random() - 0.5) * 4;
    const tryZ = p.z + (Math.random() - 0.5) * 4;
    gy = state.getGroundHeight(tryX, tryZ);
    if (!collidesCircleAabb(tryX, gy, tryZ, radius * 1.1, state.obstacles)) {
      ex = tryX; ez = tryZ;
      found = true;
      break;
    }
  }

  // Fallback if we couldn't find a spot (rare, but just in case)
  if (!found) {
    const p = state.spawnPoints[Math.floor(Math.random() * state.spawnPoints.length)];
    ex = p.x; ez = p.z; gy = state.getGroundHeight(ex, ez);
  }

  let diffMult = 1.0;
  if (settings.difficulty === 'easy') diffMult = 0.5;
  if (settings.difficulty === 'hard') diffMult = 2.0;

  const e = new Enemy(ex, ez, kind, diffMult);
  e.position.y = gy;
  state.enemies.push(e);
  state.scene.add(e.mesh);
}

// ----------------------- Minimap ------------------------
function setupMinimap() {
  if (!minimapCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = minimapCanvas.clientWidth || 184;
  const cssH = minimapCanvas.clientHeight || 184;
  minimapCanvas.width  = cssW * dpr;
  minimapCanvas.height = cssH * dpr;
  minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.miniSize = { w: cssW, h: cssH };
}

const _miniDir = new THREE.Vector3();
function drawMinimap() {
  if (!minimapCtx || !state.bounds) return;
  const ctx = minimapCtx;
  const { w: W, h: H } = state.miniSize || { w: 184, h: 184 };
  const b = state.bounds;
  const mapW = b.maxX - b.minX;
  const mapH = b.maxZ - b.minZ;
  const pad = 6;
  const scale = Math.min((W - pad * 2) / mapW, (H - pad * 2) / mapH);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const offX = W / 2 - cx * scale;
  const offY = H / 2 - cz * scale;

  const w2m = (x, z) => ({ x: x * scale + offX, y: z * scale + offY });

  // Clear with subtle radar tint
  ctx.clearRect(0, 0, W, H);
  const grd = ctx.createRadialGradient(W/2, H/2, 8, W/2, H/2, W/2);
  grd.addColorStop(0, 'rgba(40, 60, 80, 0.55)');
  grd.addColorStop(1, 'rgba(10, 14, 22, 0.9)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Map boundary outline
  const a = w2m(b.minX, b.minZ);
  const c = w2m(b.maxX, b.maxZ);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 10;
  for (let gx = Math.ceil(b.minX / step) * step; gx <= b.maxX; gx += step) {
    const p1 = w2m(gx, b.minZ); const p2 = w2m(gx, b.maxZ);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  }
  for (let gz = Math.ceil(b.minZ / step) * step; gz <= b.maxZ; gz += step) {
    const p1 = w2m(b.minX, gz); const p2 = w2m(b.maxX, gz);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();

  // Obstacles (skip the giant boundary walls we added behind the bounds)
  ctx.fillStyle = 'rgba(170, 180, 200, 0.55)';
  for (const o of state.obstacles) {
    const ocx = (o.minX + o.maxX) / 2;
    const ocz = (o.minZ + o.maxZ) / 2;
    if (ocx < b.minX || ocx > b.maxX || ocz < b.minZ || ocz > b.maxZ) continue;
    const p1 = w2m(o.minX, o.minZ);
    const p2 = w2m(o.maxX, o.maxZ);
    ctx.fillRect(p1.x, p1.y, Math.max(2, p2.x - p1.x), Math.max(2, p2.y - p1.y));
  }

  // Chests
  const tNow = performance.now();
  for (const ch of state.chests) {
    const p = w2m(ch.position.x, ch.position.z);
    if (ch.opened) {
      ctx.fillStyle = 'rgba(160, 130, 70, 0.5)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      const pulse = 0.7 + 0.3 * Math.sin(tNow / 250);
      ctx.fillStyle = `rgba(255, 216, 107, ${pulse})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill();
      // glow ring
      ctx.strokeStyle = `rgba(255, 216, 107, ${pulse * 0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5 + (1 - pulse) * 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Enemies
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const p = w2m(e.position.x, e.position.z);
    ctx.fillStyle = 'rgba(255, 90, 90, 0.95)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2); ctx.fill();
  }

  // Player (white triangle, points where camera looks)
  if (state.camera) {
    const px = state.camera.position.x;
    const pz = state.camera.position.z;
    const p = w2m(px, pz);

    state.controls.getDirection(_miniDir);
    const len = Math.hypot(_miniDir.x, _miniDir.z) || 1;
    const fx = _miniDir.x / len, fz = _miniDir.z / len;
    const perpX = -fz, perpZ = fx;

    const fwdLen = 6;   // pixels in each direction
    const sideLen = 4;
    const head = { x: p.x + fx * fwdLen,         y: p.y + fz * fwdLen };
    const bL   = { x: p.x - fx * 2 + perpX * sideLen, y: p.y - fz * 2 + perpZ * sideLen };
    const bR   = { x: p.x - fx * 2 - perpX * sideLen, y: p.y - fz * 2 - perpZ * sideLen };

    // Dropshadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(head.x, head.y + 1); ctx.lineTo(bL.x, bL.y + 1); ctx.lineTo(bR.x, bR.y + 1);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y); ctx.lineTo(bL.x, bL.y); ctx.lineTo(bR.x, bR.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Compass tick (N marker)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '700 9px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', W / 2, 9);
}

// ----------------------- HUD ----------------------------
let lastHpShown = 100;
function updateHUD() {
  if (!state.player) return;
  const hp = state.player.hp;
  hpFill.style.width = `${(hp / state.player.maxHp) * 100}%`;
  hpText.textContent = String(Math.round(hp));
  killCount.textContent = String(state.kills);
  waveNum.textContent = String(state.wave);
  enemyCount.textContent = String(state.enemies.filter(e => e.alive).length);

  // Update inventory bar
  const slots = ['fists', 'pistol', 'shotgun', 'rifle'];
  slots.forEach((id, index) => {
    const el = document.getElementById(`slot-${index + 1}`);
    if (!el) return;
    const inv = state.player.inventory[id];
    
    if (inv && inv.owned) {
      el.classList.add('owned');
      el.querySelector('.inv-ammo').textContent = id === 'fists' ? '∞' : `${state.player.mags[id]} / ${inv.ammo}`;
    } else {
      el.classList.remove('owned');
      el.querySelector('.inv-ammo').textContent = '—';
    }

    if (state.player.currentWeapon === id) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Damage feedback if HP dropped
  if (hp < lastHpShown - 0.5) {
    damageVignette.style.opacity = '1';
    setTimeout(() => damageVignette.style.opacity = '0', 250);
  }
  lastHpShown = hp;
}

let _fpsFrames = 0;
let _fpsLastTime = performance.now();

// ----------------------- Game loop ----------------------
function loop(t) {
  requestAnimationFrame(loop);
  
  if (settings.showFps) {
    _fpsFrames++;
    if (t - _fpsLastTime >= 1000) {
      fpsCounter.textContent = `${Math.round((_fpsFrames * 1000) / (t - _fpsLastTime))} FPS`;
      _fpsFrames = 0;
      _fpsLastTime = t;
    }
  }

  if (!state.running) return;

  const dt = Math.min(0.05, (t - state.lastTime) / 1000);
  state.lastTime = t;
  const renderFrame = () => (state.fx ? state.fx.composer.render() : state.renderer.render(state.scene, state.camera));

  if (state.paused) { renderFrame(); return; }
  if (!state.alive) { renderFrame(); return; }

  // Update
  updatePlayerMovement(dt);
  state.player.tick(dt);
  tryFire();
  tickViewmodel(dt);

  // Atmospherics
  state.windTime += dt;
  tickWind(state.windTime);
  if (state.atmo?.tick) state.atmo.tick(dt);
  if (state.water?.tick) state.water.tick(dt, state.camera);

  // Particle systems re-center on the player so their cloud follows you
  const pPos = state.camera.position;
  for (const p of state.particles) p.tick(dt, pPos);

  // God-rays sun screen UV (only when sun is visibly in front of camera)
  if (state.fx && state.atmo?.sunDir) {
    const sunWorld = state.atmo.sunDir.clone().multiplyScalar(400);
    sunWorld.add(state.camera.position);
    const v = sunWorld.project(state.camera);
    const visible = v.z < 1 && v.x > -1.4 && v.x < 1.4 && v.y > -1.4 && v.y < 1.4;
    if (visible) {
      _sunUv.set((v.x + 1) * 0.5, (v.y + 1) * 0.5);
      // Falloff at the edges so we don't get a sharp on/off
      const edge = Math.max(Math.abs(v.x), Math.abs(v.y));
      const vis = 1 - Math.max(0, (edge - 0.6) / 0.6);
      state.fx.setSunUV(_sunUv, Math.max(0, Math.min(1, vis)));
    } else {
      state.fx.setSunUV(_sunUv, 0);
    }
    state.fx.tick(dt);
  }

  // Dynamic crosshair: spread when moving / firing / hit
  if (crosshair) {
    const moving = (state.keys.has('KeyW') || state.keys.has('KeyA') || state.keys.has('KeyS') || state.keys.has('KeyD'));
    const firing = state.mouseDown && state.player.canFire();
    const target = 4 + (moving ? 4 : 0) + (firing ? 6 : 0) + (state.player.onGround ? 0 : 4);
    state._cxSpread = (state._cxSpread ?? 4) + (target - (state._cxSpread ?? 4)) * Math.min(1, dt * 12);
    crosshair.style.setProperty('--spread', `${state._cxSpread.toFixed(1)}px`);
  }

  for (const c of state.chests) c.update(dt);

  for (const e of state.enemies) {
    e.update(dt, state.player, state.obstacles, state.enemies, state.getGroundHeight);
  }

  // Dying enemies: Roblox-style break apart and fall, bouncing on terrain
  if (state.dyingEnemies.length) {
    for (let i = state.dyingEnemies.length - 1; i >= 0; i--) {
      const d = state.dyingEnemies[i];
      d.t += dt;
      
      d.vel.y -= 15 * dt; // gravity
      d.mesh.position.addScaledVector(d.vel, dt);
      
      d.mesh.rotation.x += d.rotSpeed.x * dt;
      d.mesh.rotation.y += d.rotSpeed.y * dt;
      d.mesh.rotation.z += d.rotSpeed.z * dt;

      // Bounce off terrain
      const gy = state.getGroundHeight ? state.getGroundHeight(d.mesh.position.x, d.mesh.position.z) : 0;
      if (d.mesh.position.y < gy + 0.1) {
        d.mesh.position.y = gy + 0.1;
        d.vel.y *= -0.5; // bounce dampening
        d.vel.x *= 0.7;  // friction
        d.vel.z *= 0.7;
        d.rotSpeed.multiplyScalar(0.7);
      }

      // Fade out near the end of lifetime
      if (d.t > d.lifetime - 1.0) {
        const k = 1.0 - (d.lifetime - d.t); // 0 to 1 fade
        d.mesh.traverse(o => {
          if (o.isMesh && o.material) {
            if (o.material.transparent !== true) {
              o.material = o.material.clone();
              o.material.transparent = true;
            }
            o.material.opacity = 1 - k;
          }
        });
      }

      if (d.t >= d.lifetime) {
        state.scene.remove(d.mesh);
        // Note: we don't dispose geometry/materials here because they are shared with living enemies
        state.dyingEnemies.splice(i, 1);
      }
    }
  }

  // Drowning / Lava damage. We only count the player as "in" the water/lava
  // when they're (a) actually submerged below the surface AND (b) standing
  // within the water plane's xz extent. Without (b) any low spot anywhere on
  // the map would trigger damage, which is what was happening on swamp/forest.
  if (state.water?.damaging !== false && state.water) {
    const isLava = state.mapId === 'volcano';
    const wMesh  = state.water.water;
    const waterY = wMesh.position.y;
    const playerFeetY = state.camera.position.y - state.player.height;

    const halfSize = (state.water.size ?? Infinity) / 2;
    const dx = state.camera.position.x - wMesh.position.x;
    const dz = state.camera.position.z - wMesh.position.z;
    const inXZ = Math.abs(dx) <= halfSize && Math.abs(dz) <= halfSize;

    // Lava damages on any contact with the surface; water requires the player
    // to actually be submerged a bit so wet ground at exactly the water level
    // doesn't constantly tick down their HP.
    const submerged = waterY - playerFeetY;
    const minSubmersion = isLava ? 0.0 : 0.2;

    if (inXZ && submerged >= minSubmersion) {
      if (isLava) {
        drownVignette.classList.add('lava');
        state.player.damage(50 * dt);
      } else {
        drownVignette.classList.remove('lava');
        state.player.damage(15 * dt);
      }
      drownVignette.style.opacity = '1';
    } else {
      drownVignette.style.opacity = '0';
    }
  } else {
    drownVignette.style.opacity = '0';
  }

  // Bullet decals — fade out over their last second of life
  if (state._decals?.length) {
    for (let i = state._decals.length - 1; i >= 0; i--) {
      const d = state._decals[i];
      d.life -= dt;
      if (d.life < 1) d.mesh.material.opacity = Math.max(0, d.life * 0.9);
      if (d.life <= 0) {
        state.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        state._decals.splice(i, 1);
      }
    }
  }

  // Blood particles
  if (state.bloodParticles.length) {
    for (let i = state.bloodParticles.length - 1; i >= 0; i--) {
      const b = state.bloodParticles[i];
      b.life -= dt;
      b.vel.y -= 12 * dt; // gravity
      b.mesh.position.x += b.vel.x * dt;
      b.mesh.position.y += b.vel.y * dt;
      b.mesh.position.z += b.vel.z * dt;
      const a = Math.max(0, b.life / b.max);
      b.mesh.material.opacity = a;
      if (b.life <= 0) {
        state.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        state.bloodParticles.splice(i, 1);
      }
    }
  }

  // Drop pickups
  if (state._drops?.length) {
    for (let i = state._drops.length - 1; i >= 0; i--) {
      const d = state._drops[i];
      d.userData.spinT += dt;
      d.rotation.y = d.userData.spinT * 3;
      d.position.y = (d.userData.gy ?? 0) + 0.3 + Math.sin(d.userData.spinT * 4) * 0.05;
      const px = state.camera.position.x, pz = state.camera.position.z;
      const dx = px - d.position.x, dz = pz - d.position.z;
      if (dx*dx + dz*dz < 1.5*1.5) {
        // give ammo to current weapon if owned, else pistol if owned, else nothing
        const id = state.player.currentWeapon !== 'fists' ? state.player.currentWeapon : 'pistol';
        if (state.player.inventory[id]?.owned) {
          const give = id === 'shotgun' ? 4 : id === 'rifle' ? 12 : 8;
          state.player.pickupAmmo(id, give);
          showToast(`+${give} ${WEAPONS[id].name} AMMO`, '#ffd86b');
        }
        state.scene.remove(d);
        state._drops.splice(i, 1);
      }
    }
  }

  // Tracers / impacts
  for (let i = state.bulletTracers.length - 1; i >= 0; i--) {
    const tr = state.bulletTracers[i];
    tr.life -= dt;
    const a = Math.max(0, tr.life / tr.max);
    if (tr.line.material) {
      tr.line.material.opacity = a;
      tr.line.material.transparent = true;
    }
    if (tr.life <= 0) {
      state.scene.remove(tr.line);
      tr.line.geometry?.dispose?.();
      tr.line.material?.dispose?.();
      state.bulletTracers.splice(i, 1);
    }
  }

  // Cull dead enemies (mesh removed earlier, but keep for safety)
  state.enemies = state.enemies.filter(e => e.alive);

  // "Press E" prompt when near a closed chest
  let nearChest = false;
  for (const c of state.chests) {
    if (c.opened) continue;
    const px = state.camera.position.x, pz = state.camera.position.z;
    if (dist2(px, pz, c.position.x, c.position.z) < 4) { nearChest = true; break; }
  }
  promptEl.classList.toggle('hidden', !nearChest);

  // Hit flash if HP dropped this frame
  if (state.player.hp < lastHpShown - 0.5) flashHit();

  tickWaves(dt);
  updateHUD();
  drawMinimap();

  // Death
  if (!state.player.alive) {
    state.alive = false;
    if (state.controls.isLocked) state.controls.unlock();
    finalWave.textContent = state.wave;
    finalKills.textContent = state.kills;
    pauseMenu.classList.add('hidden');
    gameOver.classList.remove('hidden');
  }

  // Smoothly recover from any FOV punch that shooting added.
  if (state.fovPunch > 0.0001) {
    state.fovPunch *= Math.max(0, 1 - dt * 8);
    state.camera.fov = state.baseFov + state.fovPunch;
    state.camera.updateProjectionMatrix();
  }

  renderFrame();
}

// ----------------------- Home screen character preview ---
function initCharPreview() {
  const container = document.getElementById('char-preview');
  if (!container) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(28, container.clientWidth / container.clientHeight, 0.1, 50);
  camera.position.set(0, 1.45, 4.6);
  camera.lookAt(0, 1.05, 0);

  // Rim + key light to make the character pop on the dark card.
  const key = new THREE.DirectionalLight(0xfff1d6, 1.0);
  key.position.set(2, 4, 3); key.castShadow = true;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a7a, 0.6);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xa8b0c8, 0.55));

  // A subtle floor disc so he isn't floating
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 32),
    new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 1 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.001;
  disc.receiveShadow = true;
  scene.add(disc);

  let chad = buildCharacter({
    includeHead: true, includeArms: true,
    wearShades: localStorage.getItem('survive_shades') === 'true',
    wearHat: localStorage.getItem('survive_hat') === 'true'
  });
  scene.add(chad);

  let t = 0;
  function tick() {
    requestAnimationFrame(tick);
    t += 0.012;
    if (chad) {
      chad.rotation.y = Math.sin(t) * 0.55;
      chad.position.y = Math.sin(t * 1.6) * 0.015;
    }
    renderer.render(scene, camera);
  }
  tick();

  // Resize with the page
  window.addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  return {
    dispose() {
      container.innerHTML = '';
      renderer.dispose();
    },
    updateChar() {
      if (chad) scene.remove(chad);
      chad = buildCharacter({
        includeHead: true, includeArms: true,
        wearShades: localStorage.getItem('survive_shades') === 'true',
        wearHat: localStorage.getItem('survive_hat') === 'true'
      });
      scene.add(chad);
    }
  };
}

const charPreviewApp = initCharPreview();

// Animated 3D background behind the home screen.
const menuBgCanvas = document.getElementById('menu-bg');
if (menuBgCanvas) {
  state.menuScene = createMenuScene(menuBgCanvas);
}
