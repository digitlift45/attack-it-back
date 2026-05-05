import * as THREE from 'three';

export const WEAPONS = {
  fists: {
    id: 'fists', name: 'FISTS',
    damage: 14, fireRate: 0.30, range: 2.4, spread: 0, pellets: 1,
    magSize: Infinity, reserve: Infinity, reloadTime: 0,
    melee: true, color: 0xd9b48a,
  },
  pistol: {
    id: 'pistol', name: 'PISTOL',
    damage: 22, fireRate: 0.22, range: 60, spread: 0.012, pellets: 1,
    magSize: 12, reserve: 48, reloadTime: 1.1,
    color: 0x1c2129,
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN',
    damage: 11, fireRate: 0.75, range: 28, spread: 0.09, pellets: 7,
    magSize: 6, reserve: 24, reloadTime: 1.7,
    color: 0x6b3a1a,
  },
  rifle: {
    id: 'rifle', name: 'RIFLE',
    damage: 18, fireRate: 0.09, range: 90, spread: 0.022, pellets: 1,
    magSize: 30, reserve: 90, reloadTime: 1.6,
    color: 0x2e3138,
  },
};

// ---- Shared materials ----
const GLOVE_COLOR = 0x141414;
const WRIST_COLOR = 0x2a2e36;
const SKIN_COLOR  = 0xeec39a;

const gloveMat = new THREE.MeshStandardMaterial({ color: GLOVE_COLOR, roughness: 0.55, metalness: 0.0, flatShading: true });
const wristMat = new THREE.MeshStandardMaterial({ color: WRIST_COLOR, roughness: 0.45, metalness: 0.15, flatShading: true });
const skinMat  = new THREE.MeshStandardMaterial({ color: SKIN_COLOR,  roughness: 0.6, flatShading: true });

/**
 * Builds a hand: bare-skin forearm (cylinder) + tactical wristband + gloved
 * palm (rounded box) + four fingers (small rounded boxes) + thumb.
 *
 * Group origin is at the WRIST. Forearm extends in -Y, fingers point in +Y.
 */
export function buildHand(side = 'right', { length = 0.34, glove = true } = {}) {
  const g = new THREE.Group();
  const knuckleMat = glove ? gloveMat : skinMat;

  // Forearm — gently tapered cylinder
  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.045, length, 6),
    skinMat,
  );
  forearm.position.y = -length / 2;
  g.add(forearm);

  // Wristband (slightly fatter cylinder)
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.062, 0.06, 6),
    wristMat,
  );
  cuff.position.y = 0.005;
  g.add(cuff);

  // Palm — rounded box (BoxGeometry + scale + radius via SphereGeometry caps)
  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.10, 0.115),
    knuckleMat,
  );
  palm.position.y = 0.07;
  g.add(palm);

  // Knuckle ridge (slight bump on top of palm)
  const knuck = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.04, 0.045), knuckleMat);
  knuck.position.set(0, 0.105, 0.035);
  g.add(knuck);

  // Four fingers (small rounded boxes pointing forward)
  for (let i = 0; i < 4; i++) {
    const fx = -0.030 + i * 0.020;
    const finger = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.05, 0.06),
      knuckleMat,
    );
    finger.position.set(fx, 0.085, 0.085);
    g.add(finger);
  }

  // Thumb on the inside (right hand: negative X; left hand: positive X)
  const thumb = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.05, 0.04),
    knuckleMat,
  );
  thumb.position.set(side === 'right' ? -0.052 : 0.052, 0.075, 0.025);
  thumb.rotation.z = side === 'right' ? 0.4 : -0.4;
  g.add(thumb);

  g.traverse(o => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; }
  });
  g.userData.side = side;
  return g;
}

function addMuzzleMarker(parent, x, y, z) {
  const m = new THREE.Object3D();
  m.position.set(x, y, z);
  m.name = 'muzzle';
  parent.add(m);
  return m;
}

/**
 * Builds the first-person viewmodel for `weaponId`.
 *   userData.muzzle      -> Object3D at the barrel tip (for muzzle flashes)
 *   userData.rightHand   -> right hand pivot (animated for fists)
 *   userData.leftHand    -> left hand pivot (when present)
 *   userData.kind        -> weapon id
 *   userData.fists       -> true for the fists viewmodel
 */
export function buildViewModel(weaponId) {
  const group = new THREE.Group();
  group.userData.kind = weaponId;

  const w = WEAPONS[weaponId];
  if (!w) return group;

  if (w.melee) return buildFistsViewModel(group);

  const matBody  = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.42, metalness: 0.6, flatShading: true });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.32, metalness: 0.9, flatShading: true });
  const matWood  = new THREE.MeshStandardMaterial({ color: 0x4d2d14, roughness: 0.75, metalness: 0.0, flatShading: true });

  if (weaponId === 'pistol')  buildPistol(group, matBody, matMetal);
  if (weaponId === 'shotgun') buildShotgun(group, matBody, matMetal, matWood);
  if (weaponId === 'rifle')   buildRifle(group, matBody, matMetal);

  group.traverse(o => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; }
  });

  group.position.set(0.18, -0.20, -0.40);
  return group;
}

// ---------------------------------------------------------------- PISTOL ---
function buildPistol(group, matBody, matMetal) {
  const slide = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.085, 0.32),
    matMetal,
  );
  slide.position.set(0, 0.02, -0.06);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.06, 0.22),
    matBody,
  );
  frame.position.set(0, -0.04, -0.04);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6),
    matMetal,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.22);

  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.18, 0.09),
    matBody,
  );
  grip.position.set(0, -0.16, 0.02);
  // Soften the bottom edge with a small sphere (looks rounded under tone-mapped lighting)
  const gripCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 6, 5),
    matBody,
  );
  gripCap.position.set(0, -0.25, 0.02);
  gripCap.scale.set(1.3, 0.5, 1.4);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.022), matMetal);
  trigger.position.set(0, -0.08, -0.02);

  const trigGuard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 8), matMetal);
  trigGuard.position.set(0, -0.085, -0.02);
  trigGuard.rotation.x = Math.PI / 2;

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.03), matMetal);
  sight.position.set(0, 0.07, -0.18);

  group.add(slide, frame, barrel, grip, gripCap, trigger, trigGuard, sight);

  const hand = buildHand('right');
  hand.position.set(0.0, -0.20, 0.05);
  hand.rotation.set(-0.5, 0, 0);
  group.add(hand);
  group.userData.rightHand = hand;

  group.userData.muzzle = addMuzzleMarker(group, 0, 0.02, -0.30);
  group.userData.slide = slide;
}

// --------------------------------------------------------------- SHOTGUN ---
function buildShotgun(group, matBody, matMetal, matWood) {
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.30), matWood);
  stock.position.set(0, -0.04, 0.20);

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.20), matMetal);
  receiver.position.set(0, 0.0, 0.0);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.60, 6), matMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -0.32);

  const barrelTip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6), matMetal);
  barrelTip.rotation.x = Math.PI / 2;
  barrelTip.position.set(0, 0.04, -0.60);

  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.14), matWood);
  pump.position.set(0, -0.05, -0.18);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.03), matMetal);
  sight.position.set(0, 0.10, -0.58);

  group.add(stock, receiver, barrel, barrelTip, pump, sight);

  // Right hand on the stock grip; left hand on the pump.
  const right = buildHand('right');
  right.position.set(0.0, -0.18, 0.12);
  right.rotation.set(-0.55, 0.0, 0.0);
  group.add(right);
  group.userData.rightHand = right;

  const left = buildHand('left');
  left.position.set(-0.06, -0.18, -0.20);
  left.rotation.set(-0.55, 0.6, -0.3);
  group.add(left);
  group.userData.leftHand = left;

  group.userData.muzzle = addMuzzleMarker(group, 0, 0.04, -0.66);
  group.userData.pump = pump;
  group.userData.pumpHand = left;
}

// ----------------------------------------------------------------- RIFLE ---
function buildRifle(group, matBody, matMetal) {
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.22), matBody);
  stock.position.set(0, -0.02, 0.20);

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.32), matBody);
  receiver.position.set(0, 0.0, -0.05);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 6), matMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -0.45);

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.30), matBody);
  handguard.position.set(0, 0.0, -0.32);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.10), matMetal);
  mag.position.set(0, -0.14, -0.05);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), matBody);
  grip.position.set(0, -0.13, 0.04);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.06), matMetal);
  sight.position.set(0, 0.10, -0.05);

  // Front sight post
  const fSight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.018), matMetal);
  fSight.position.set(0, 0.085, -0.66);

  group.add(stock, receiver, barrel, handguard, mag, grip, sight, fSight);

  const right = buildHand('right');
  right.position.set(0.0, -0.20, 0.07);
  right.rotation.set(-0.4, 0, 0);
  group.add(right);
  group.userData.rightHand = right;

  const left = buildHand('left');
  left.position.set(-0.04, -0.18, -0.30);
  left.rotation.set(-0.55, 0.5, -0.25);
  group.add(left);
  group.userData.leftHand = left;

  group.userData.muzzle = addMuzzleMarker(group, 0, 0.04, -0.74);
}

// ------------------------------------------------------------------ FISTS ---
function buildFistsViewModel(group) {
  const left  = buildHand('left',  { length: 0.30 });
  const right = buildHand('right', { length: 0.30 });

  left.position.set(-0.14, -0.16, -0.30);
  left.rotation.set(-1.2, 0.2, 0.4);

  right.position.set(0.14, -0.16, -0.30);
  right.rotation.set(-1.2, -0.2, -0.4);

  group.add(left, right);
  group.userData.leftHand  = left;
  group.userData.rightHand = right;
  group.userData.fists = true;
  group.userData.nextPunch = 'right';

  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  group.position.set(0, -0.05, -0.10);
  return group;
}
