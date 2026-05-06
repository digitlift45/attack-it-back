import * as THREE from 'three';

/**
 * Low-poly wandering wildlife. Each animal is built from primitives (boxes,
 * cylinders, cones) with `flatShading: true` to match the game's overall
 * stylized look. Animals wander toward a randomly-chosen waypoint inside a
 * home radius around their spawn, then pick a new one. Their legs do a
 * small walk-cycle bob and birds bank as they orbit.
 *
 * `addAnimals(scene, type, count, opts)` is the convenience API maps use.
 * It returns an array of tickable objects to push into `state.particles`
 * so the existing main-loop tick already drives them.
 */

// ---------------------------------------------------------------------------
//  Materials (shared across animals to keep draw calls + memory low)
// ---------------------------------------------------------------------------
const palettes = {
  deer:    { body: 0xa07050, belly: 0xd0b090, head: 0xa07050, antler: 0x6e4a26 },
  wolf:    { body: 0x60625a, belly: 0x808078, head: 0x4a4c44, antler: 0x000000 },
  rabbit:  { body: 0xb8a890, belly: 0xefe6d4, head: 0xb8a890, antler: 0xb8a890 },
  fox:     { body: 0xc05a18, belly: 0xeed8b8, head: 0xc05a18, antler: 0xffffff },
  frog:    { body: 0x4a8a3a, belly: 0xe0e090, head: 0x4a8a3a, antler: 0x000000 },
  crow:    { body: 0x111111, belly: 0x222222, head: 0x111111, antler: 0xeeaa44 },
  lizard:  { body: 0x886633, belly: 0xc0a060, head: 0x886633, antler: 0x000000 },
  bird:    { body: 0xeeeeee, belly: 0xffffff, head: 0xeeeeee, antler: 0xffaa44 },
};

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
  }
  return matCache.get(color);
}

// ---------------------------------------------------------------------------
//  Builders for individual creatures. Each returns a THREE.Group containing
//  the geometry, with `userData.legs` so the wander tick can swing the legs.
// ---------------------------------------------------------------------------
function buildQuadruped(palette, opts = {}) {
  const bodyW = opts.bodyW ?? 0.7;
  const bodyH = opts.bodyH ?? 0.6;
  const bodyD = opts.bodyD ?? 1.5;
  const legH  = opts.legH  ?? 0.7;
  const legR  = opts.legR  ?? 0.08;
  const headW = opts.headW ?? 0.45;

  const g = new THREE.Group();
  const bodyMat  = mat(palette.body);
  const bellyMat = mat(palette.belly);
  const headMat  = mat(palette.head);

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), bodyMat);
  body.position.y = legH + bodyH/2;
  body.castShadow = true;
  g.add(body);

  // Lighter belly stripe for visual variety.
  const belly = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.96, bodyH * 0.45, bodyD * 0.96), bellyMat);
  belly.position.y = legH + bodyH * 0.25;
  g.add(belly);

  // Head + neck.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(headW * 0.6, headW * 0.6, headW * 0.9), bodyMat);
  neck.position.set(0, legH + bodyH * 0.7, bodyD/2 + headW * 0.3);
  neck.rotation.x = -0.2;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headW, headW * 1.1), headMat);
  head.position.set(0, legH + bodyH * 0.95, bodyD/2 + headW * 0.95);
  head.castShadow = true;
  g.add(head);

  // Snout (slight bump on the front of the head).
  const snout = new THREE.Mesh(new THREE.BoxGeometry(headW * 0.55, headW * 0.45, headW * 0.5), headMat);
  snout.position.set(0, legH + bodyH * 0.85, bodyD/2 + headW * 1.55);
  g.add(snout);

  // Tiny dark eyes — two small black boxes either side of the head.
  const eyeMat = mat(0x111111);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), eyeMat);
    eye.position.set(sx * headW * 0.35, legH + bodyH * 1.05, bodyD/2 + headW * 1.15);
    g.add(eye);
  }

  // Tail (cosmetic).
  const tail = new THREE.Mesh(new THREE.BoxGeometry(headW * 0.4, headW * 0.4, headW * 0.5), bodyMat);
  tail.position.set(0, legH + bodyH * 0.8, -bodyD/2 - headW * 0.2);
  g.add(tail);

  // Legs as separate groups so we can swing them in the walk cycle.
  const legs = [];
  const offsets = [
    [ bodyW/2 - legR,  bodyD/2 - legR],
    [-bodyW/2 + legR,  bodyD/2 - legR],
    [ bodyW/2 - legR, -bodyD/2 + legR],
    [-bodyW/2 + legR, -bodyD/2 + legR],
  ];
  for (let i = 0; i < 4; i++) {
    const [lx, lz] = offsets[i];
    const leg = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(legR, legR, legH, 5), bodyMat);
    cyl.position.y = -legH / 2;
    cyl.castShadow = true;
    leg.add(cyl);
    leg.position.set(lx, legH, lz);
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
  g.userData.bodyMesh = body;

  return g;
}

function buildDeer() {
  const g = buildQuadruped(palettes.deer, { bodyD: 1.6, legH: 0.85, headW: 0.4 });
  // Antlers — two pronged forks on the head.
  const antlerMat = mat(palettes.deer.antler);
  function fork(side) {
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), antlerMat);
    root.position.set(side * 0.12, 1.7, 1.2);
    root.rotation.z = side * -0.4;
    root.castShadow = true;
    g.add(root);
    for (let i = 0; i < 3; i++) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 4), antlerMat);
      tine.position.set(side * (0.18 + i * 0.05), 1.85, 1.18 - i * 0.06);
      tine.rotation.z = side * (-0.4 - i * 0.2);
      g.add(tine);
    }
  }
  fork(-1); fork(1);
  return g;
}

function buildWolf() {
  return buildQuadruped(palettes.wolf, { bodyW: 0.55, bodyH: 0.55, bodyD: 1.4, legH: 0.55, headW: 0.4 });
}

function buildFox() {
  return buildQuadruped(palettes.fox, { bodyW: 0.45, bodyH: 0.45, bodyD: 1.1, legH: 0.4, headW: 0.32 });
}

function buildRabbit() {
  const g = new THREE.Group();
  const fur = mat(palettes.rabbit.body);
  const belly = mat(palettes.rabbit.belly);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), fur);
  body.position.y = 0.35;
  body.scale.set(1, 0.9, 1.4);
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), fur);
  head.position.set(0, 0.55, 0.4);
  g.add(head);

  // Long ears.
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.05), fur);
    ear.position.set(sx * 0.08, 0.85, 0.4);
    ear.rotation.z = sx * 0.1;
    g.add(ear);
  }

  // Cotton tail.
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), belly);
  tail.position.set(0, 0.45, -0.3);
  g.add(tail);

  // Tiny eyes.
  const eyeMat = mat(0x111111);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), eyeMat);
    eye.position.set(sx * 0.1, 0.6, 0.55);
    g.add(eye);
  }

  // Hop-only "legs" — invisible but the tick will hop the whole body.
  g.userData.legs = [];
  g.userData.hop = true;
  g.userData.bodyMesh = body;
  return g;
}

function buildFrog() {
  const g = new THREE.Group();
  const skin  = mat(palettes.frog.body);
  const belly = mat(palettes.frog.belly);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin);
  body.position.y = 0.25;
  body.scale.set(1.2, 0.7, 1);
  body.castShadow = true;
  g.add(body);

  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), belly);
  bel.position.y = 0.18;
  bel.scale.set(1.1, 0.4, 0.9);
  g.add(bel);

  // Bulging eyes on top.
  for (const sx of [-1, 1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(0xfff8d0));
    sclera.position.set(sx * 0.12, 0.42, 0.05);
    g.add(sclera);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), mat(0x111111));
    pupil.position.set(sx * 0.12, 0.45, 0.1);
    g.add(pupil);
  }

  // Folded back legs sticking out.
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.4), skin);
    leg.position.set(sx * 0.18, 0.18, -0.15);
    g.add(leg);
  }

  g.userData.legs = [];
  g.userData.hop = true;
  g.userData.hopHeight = 0.5;
  g.userData.bodyMesh = body;
  return g;
}

function buildLizard() {
  const g = buildQuadruped(palettes.lizard, { bodyW: 0.35, bodyH: 0.18, bodyD: 0.9, legH: 0.18, headW: 0.22 });
  // Long tail extension.
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.7, 5), mat(palettes.lizard.body));
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.22, -0.7);
  g.add(tail);
  return g;
}

// Birds (and crows) fly above the map in a slow orbit. They don't use the
// quadruped walk cycle; a separate flyer tick swings their wings instead.
function buildFlyer(palette, scale = 1) {
  const g = new THREE.Group();
  const bodyMat = mat(palette.body);
  const beakMat = mat(palette.antler);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.45), bodyMat);
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), bodyMat);
  head.position.set(0, 0.04, 0.28);
  g.add(head);

  // Beak.
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.04, 0.42);
  g.add(beak);

  // Wings — left + right. Pivoted at the body so the tick can flap them.
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, 0.05, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.28), bodyMat);
    wing.position.set(side * 0.3, 0, 0);
    pivot.add(wing);
    g.add(pivot);
    wings.push({ pivot, side });
  }

  g.scale.setScalar(scale);
  g.userData.wings = wings;
  g.userData.flyer = true;
  return g;
}

function buildBird() { return buildFlyer(palettes.bird, 1.0); }
function buildCrow() { return buildFlyer(palettes.crow, 1.2); }

// ---------------------------------------------------------------------------
//  Wander tick — picks waypoints inside a home radius and walks toward them.
//  Returns a tickable object compatible with state.particles (tick(dt, cam)).
// ---------------------------------------------------------------------------
function makeWander(group, opts) {
  const home   = opts.home   ?? { x: 0, z: 0 };
  const radius = opts.radius ?? 30;
  const speed  = opts.speed  ?? 1.4;
  const groundFn = opts.groundHeight ?? ((x, z) => 0);

  let target = pickTarget();
  function pickTarget() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    return { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
  }

  const isHopper = !!group.userData.hop;
  const hopHeight = group.userData.hopHeight ?? 0.35;
  let phase = Math.random() * Math.PI * 2;
  let pauseT = Math.random() * 2;
  const baseY = group.position.y;

  return {
    group,
    tick(dt) {
      if (pauseT > 0) {
        pauseT -= dt;
        // Idle bob.
        group.position.y = groundFn(group.position.x, group.position.z) + Math.sin(phase * 4) * 0.02;
        phase += dt;
        return;
      }
      const dx = target.x - group.position.x;
      const dz = target.z - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        target = pickTarget();
        pauseT = 0.5 + Math.random() * 2.5;
        return;
      }
      const inv = 1 / dist;
      group.position.x += dx * inv * speed * dt;
      group.position.z += dz * inv * speed * dt;
      group.rotation.y = Math.atan2(dx, dz);

      const groundY = groundFn(group.position.x, group.position.z);
      if (isHopper) {
        // Sinusoidal hop using the cycle phase.
        phase += dt * 6;
        const hop = Math.max(0, Math.sin(phase));
        group.position.y = groundY + hop * hopHeight;
      } else {
        group.position.y = groundY;
        phase += dt * 8;
        const swing = Math.sin(phase) * 0.4;
        const legs = group.userData.legs;
        if (legs && legs.length === 4) {
          legs[0].rotation.x =  swing;
          legs[1].rotation.x = -swing;
          legs[2].rotation.x = -swing;
          legs[3].rotation.x =  swing;
        }
      }
      void baseY;
    },
  };
}

// Flyer tick — orbits the home point at altitude with wing flap + bank.
function makeFlyer(group, opts) {
  const home   = opts.home   ?? { x: 0, z: 0 };
  const radius = opts.radius ?? 50;
  const speed  = opts.speed  ?? 1.0;
  const altitude = opts.altitude ?? 18;

  let theta = Math.random() * Math.PI * 2;
  const wobble = 1 + Math.random() * 0.4;

  return {
    group,
    tick(dt) {
      theta += dt * speed * 0.4 * wobble;
      const r = radius + Math.sin(theta * 0.7) * radius * 0.15;
      const y = altitude + Math.sin(theta * 1.3) * 1.5;
      group.position.set(home.x + Math.cos(theta) * r, y, home.z + Math.sin(theta) * r);
      group.rotation.y = -theta + Math.PI;
      group.rotation.z = Math.sin(theta * 4) * 0.25;

      // Wing flap.
      const flap = Math.sin(theta * 12) * 0.7;
      const wings = group.userData.wings;
      if (wings) {
        wings[0].pivot.rotation.z = -flap;
        wings[1].pivot.rotation.z =  flap;
      }
    },
  };
}

const BUILDERS = {
  deer:   buildDeer,
  wolf:   buildWolf,
  fox:    buildFox,
  rabbit: buildRabbit,
  frog:   buildFrog,
  lizard: buildLizard,
  bird:   buildBird,
  crow:   buildCrow,
};

/**
 * Convenience: scatter `count` animals of `type` around `home` and return an
 * array of tickables. The map should push them into `state.particles` so the
 * existing tick loop drives their wander.
 */
export function addAnimals(scene, type, count, opts = {}) {
  const builder = BUILDERS[type];
  if (!builder) return [];
  const home   = opts.home   ?? { x: 0, z: 0 };
  const radius = opts.radius ?? 40;
  const groundFn = opts.groundHeight ?? ((x, z) => 0);
  const altitude = opts.altitude ?? 18;
  const speed = opts.speed;

  const tickables = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = home.x + Math.cos(a) * r;
    const z = home.z + Math.sin(a) * r;
    const g = builder();

    if (g.userData.flyer) {
      g.position.set(x, altitude, z);
      scene.add(g);
      tickables.push(makeFlyer(g, { home, radius, altitude, speed: speed ?? 1.0 }));
    } else {
      g.position.set(x, groundFn(x, z), z);
      scene.add(g);
      tickables.push(makeWander(g, { home, radius, groundHeight: groundFn, speed: speed ?? 1.4 }));
    }
  }
  return tickables;
}
