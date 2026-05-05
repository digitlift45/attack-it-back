import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns } from './_shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { applyWind } from '../effects/wind.js';
import { createDust, createLeaves } from '../effects/particles.js';
import { createWater } from '../effects/water.js';

function swampHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const damp = Math.min(1, r / 10);
  // Very flat, slightly bumpy ground. Most of it will be under water.
  const h =
    Math.sin(x * 0.1) * 0.4 +
    Math.cos(z * 0.12) * 0.4;
  return h * damp - 0.2; // Shifted down so water covers it naturally
}

export function buildSwamp(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'swamp');

  const SIZE = 240;
  addTerrain(scene, SIZE * 1.6, 0x223311, swampHeight, { segments: 180, roughness: 1.0 });

  // Murky shallow water
  const water = createWater(scene, SIZE * 1.6, {
    segments: 100,
    colorShallow: new THREE.Color(0x334422),
    colorDeep:    new THREE.Color(0x112211),
    foamColor:    new THREE.Color(0x556644),
    opacity:      0.85,
    waveHeight:   0.05,
    waveSpeed:    0.5,
  });
  water.setSun(atmo.sunDir, new THREE.Color(0x88aa88));
  // Place water slightly above average ground level
  water.water.position.y = 0.1;

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(5678);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 1, flatShading: true });
  const leafMat = applyWind(
    new THREE.MeshStandardMaterial({ color: 0x223311, roughness: 1, flatShading: true }),
    { sway: 0.05, speed: 0.6 }
  );

  // Add dead/swampy trees
  for (let i = 0; i < 200; i++) {
    const x = (rng() - 0.5) * SIZE;
    const z = (rng() - 0.5) * SIZE;
    if (x*x + z*z < 8*8) continue;
    const gy = swampHeight(x, z);

    const trunkH = 3 + rng() * 4;
    const trunkR = 0.2 + rng() * 0.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR, trunkR * 1.5, trunkH, 6), trunkMat);
    trunk.position.set(x, gy + trunkH / 2, z);
    trunk.rotation.x = (rng() - 0.5) * 0.2;
    trunk.rotation.z = (rng() - 0.5) * 0.2;
    trunk.castShadow = true;
    scene.add(trunk);

    // Some trees have leaves
    if (rng() < 0.7) {
      const foliage = new THREE.Mesh(new THREE.SphereGeometry(1.5 + rng(), 6, 5), leafMat);
      foliage.position.set(x, gy + trunkH, z);
      foliage.scale.y = 0.6;
      foliage.castShadow = true;
      scene.add(foliage);
      colliders.push(foliage);
    }

    obstacles.push(aabbFromBox(x, z, trunkR * 3, trunkR * 3));
    colliders.push(trunk);
    
    if (rng() < 0.3) chestSpots.push({ x: x + (rng() - 0.5) * 4, z: z + (rng() - 0.5) * 4 });
  }

  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 40 + rng() * 60;
    spawnPoints.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  while (chestSpots.length < 30) {
    const a = rng() * Math.PI * 2;
    const r = 20 + rng() * 80;
    chestSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, (x, z) => Math.max(0.1, swampHeight(x, z)));

  // Swarm of fireflies/bugs
  const bugs = createDust(scene, { count: 400, radius: 100, color: 0xaaffaa, size: 0.08 });
  const murkyLeaves = createLeaves(scene, { count: 300, radius: 100, top: 12 });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: { x: 0, z: 0 }, bounds,
    getGroundHeight: (x, z) => Math.max(0.1, swampHeight(x, z)), // player walks on water surface or ground
    atmo,
    water,
    particles: [bugs, murkyLeaves],
  };
}