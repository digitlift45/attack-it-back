import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addBoundarySigns } from './shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { applyWind } from '../effects/wind.js';
import { createWater } from '../effects/water.js';
import { createDust } from '../effects/particles.js';

export function buildArchipelago(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'archipelago');

  const SIZE = 240;

  // Animated water (custom shader: waves + fresnel + foam + sun glint).
  const water = createWater(scene, SIZE * 1.8, {
    segments: 180,
    colorShallow: new THREE.Color(0x4fb3e5),
    colorDeep:    new THREE.Color(0x0a3c66),
  });
  water.setSun(atmo.sunDir, new THREE.Color(0xffe5b3));

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(7);

  // Generate islands. Each island is a flat sand cylinder
  const islands = [];
  const TRY = 200;
  for (let i = 0; i < TRY && islands.length < 40; i++) {
    const x = (rng() - 0.5) * (SIZE - 20);
    const z = (rng() - 0.5) * (SIZE - 20);
    const r = 6 + rng() * 10;
    let ok = true;
    for (const o of islands) {
      const dx = o.x - x, dz = o.z - z;
      if (Math.sqrt(dx*dx + dz*dz) < o.r + r + 6) { ok = false; break; }
    }
    if (!ok) continue;
    islands.push({ x, z, r });
  }

  for (const isl of islands) {
    // Sand top
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(isl.r, isl.r * 1.1, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0xead7a1, roughness: 1, flatShading: true })
    );
    sand.position.set(isl.x, 0.15, isl.z);
    sand.receiveShadow = true;
    scene.add(sand);

    // a few palm trees on each island
    const palms = 1 + Math.floor(rng() * 3);
    for (let p = 0; p < palms; p++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * (isl.r * 0.6);
      const px = isl.x + Math.cos(a) * r;
      const pz = isl.z + Math.sin(a) * r;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x6e3a1a, roughness: 1, flatShading: true })
      );
      trunk.position.set(px, 1.2 + 0.15, pz);
      trunk.castShadow = true;
      scene.add(trunk);

      const fronds = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 6, 5),
        applyWind(
          new THREE.MeshStandardMaterial({ color: 0x2e8b3a, roughness: 1, flatShading: true }),
          { sway: 0.10, speed: 1.2 },
        ),
      );
      fronds.position.set(px, 2.5 + 0.15, pz);
      fronds.scale.set(1.4, 0.5, 1.4);
      fronds.castShadow = true;
      scene.add(fronds);

      obstacles.push(aabbFromBox(px, pz, 0.45, 0.45));
      colliders.push(trunk, fronds);
    }

    // Spawn / chest hints
    if (rng() < 0.85) chestSpots.push({ x: isl.x, z: isl.z });
    spawnPoints.push({ x: isl.x, z: isl.z });

    // a small rock or two
    if (rng() < 0.6) {
      const rx = isl.x + (rng() - 0.5) * isl.r;
      const rz = isl.z + (rng() - 0.5) * isl.r;
      const rad = 0.35 + rng() * 0.4;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rad, 0),
        new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 1, flatShading: true })
      );
      rock.position.set(rx, rad * 0.5 + 0.15, rz);
      rock.castShadow = true;
      scene.add(rock);
      obstacles.push(aabbFromBox(rx, rz, rad * 1.6, rad * 1.6));
      colliders.push(rock);
    }
  }

  // Build wooden bridges to connect islands to the central one.
  // Pick the island closest to center as main, then bridge to the rest.
  islands.sort((a, b) => (a.x*a.x + a.z*a.z) - (b.x*b.x + b.z*b.z));
  const main = islands[0];
  for (let i = 1; i < islands.length; i++) {
    addBridge(scene, obstacles, colliders, main.x, main.z, islands[i].x, islands[i].z);
  }

  // Player starts on the main island
  const playerStart = { x: main ? main.x : 0, z: main ? main.z : 0 };

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, null);

  // Sea spray / haze drifting over the water
  const dust = createDust(scene, { count: 800, radius: 100, color: 0xeaf6ff });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart, bounds,
    atmo,
    water,
    particles: [dust],
  };
}

function addBridge(scene, obstacles, colliders, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx*dx + dz*dz);
  const angle = Math.atan2(dx, dz);
  const planks = Math.max(2, Math.floor(len / 1.2));
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 1 });
  for (let i = 1; i < planks; i++) {
    const t = i / planks;
    const px = x1 + dx * t;
    const pz = z1 + dz * t;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), wood);
    plank.position.set(px, 0.18, pz);
    plank.rotation.y = angle;
    plank.receiveShadow = true;
    scene.add(plank);
    colliders.push(plank);
  }
}
