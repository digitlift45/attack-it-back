import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns, addCabin, addCampProps } from './shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { applyWind } from '../effects/wind.js';
import { createDust, createLeaves, createPixels } from '../effects/particles.js';
import { createWater } from '../effects/water.js';

// A small circular pond sits to the south-east of the cabin clearing. The
// height function carves the pond out of the terrain so the water actually
// has a basin to sit in instead of clipping through the ground plane.
const POND_X = 18, POND_Z = 18, POND_R = 10, POND_DEPTH = 1.4;

function forestHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const damp = Math.min(1, r / 12);
  const h =
    Math.sin(x * 0.045) * 1.6 +
    Math.cos(z * 0.055) * 1.4 +
    Math.sin((x + z) * 0.07) * 0.7 +
    Math.cos((x - z) * 0.09) * 0.5;
  let y = h * damp;

  const pondR = Math.hypot(x - POND_X, z - POND_Z);
  if (pondR < POND_R) {
    const t = 1 - pondR / POND_R;
    y -= POND_DEPTH * t * t;
  }
  return y;
}

export function buildForest(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'forest');

  const SIZE = 240;
  addTerrain(scene, SIZE * 1.6, 0x3e6b2a, forestHeight, { segments: 180 });

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(2024);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 1, flatShading: true });

  // Wind-swayed leaf materials. We share three so trees feel varied but draw
  // calls stay reasonable. applyWind hooks each into the global wind ticker.
  const leafMats = [
    applyWind(new THREE.MeshStandardMaterial({ color: 0x2a5d2a, roughness: 1, flatShading: true }), { sway: 0.10, speed: 0.9 }),
    applyWind(new THREE.MeshStandardMaterial({ color: 0x3a7a32, roughness: 1, flatShading: true }), { sway: 0.12, speed: 1.1 }),
    applyWind(new THREE.MeshStandardMaterial({ color: 0x255423, roughness: 1, flatShading: true }), { sway: 0.08, speed: 0.7 }),
  ];

  // A small forest pond just off the central clearing. Sized to actually fit
  // the carved-out basin in `forestHeight`.
  const water = createWater(scene, POND_R * 2.4, {
    segments: 24,
    colorShallow: new THREE.Color(0x4fb88c),
    colorDeep:    new THREE.Color(0x123a2a),
    foamColor:    new THREE.Color(0xeaffea),
    opacity:      0.92,
    waveHeight:   0.04,
    waveSpeed:    0.6,
  });
  water.setSun(atmo.sunDir, new THREE.Color(0xccffcc));
  water.water.position.set(POND_X, -0.05, POND_Z);

  // Trees, with a cleared central plaza for the cabin + camp + pond.
  for (let i = 0; i < 400; i++) {
    const x = (rng() - 0.5) * SIZE;
    const z = (rng() - 0.5) * SIZE;
    // Skip the cabin clearing and the pond.
    if (x*x + z*z < 22*22) continue;
    if ((x - POND_X) ** 2 + (z - POND_Z) ** 2 < (POND_R + 1.5) ** 2) continue;
    const groundY = forestHeight(x, z);

    const trunkH = 2.5 + rng() * 2.5;
    const trunkR = 0.18 + rng() * 0.15;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR, trunkR * 1.2, trunkH, 6), trunkMat);
    trunk.position.set(x, groundY + trunkH / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const foliageR = 1.3 + rng() * 1.0;
    const foliageH = 2.5 + rng() * 1.5;
    const leafMat = leafMats[Math.floor(rng() * leafMats.length)];
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(foliageR, foliageH, 6), leafMat);
    foliage.position.set(x, groundY + trunkH + foliageH / 2 - 0.3, z);
    foliage.castShadow = true;
    scene.add(foliage);

    obstacles.push(aabbFromBox(x, z, trunkR * 2.4, trunkR * 2.4));
    colliders.push(trunk);
    colliders.push(foliage);
  }

  // Rocks
  for (let i = 0; i < 100; i++) {
    const x = (rng() - 0.5) * SIZE;
    const z = (rng() - 0.5) * SIZE;
    if (x*x + z*z < 8*8) continue;
    if ((x - POND_X) ** 2 + (z - POND_Z) ** 2 < POND_R * POND_R) continue;
    const groundY = forestHeight(x, z);
    const r = 0.5 + rng() * 1.0;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 1, flatShading: true })
    );
    rock.position.set(x, groundY + r * 0.5, z);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    obstacles.push(aabbFromBox(x, z, r * 1.8, r * 1.8));
    colliders.push(rock);

    if (rng() < 0.35) chestSpots.push({ x: x + (rng() - 0.5) * 4, z: z + (rng() - 0.5) * 4 });
  }

  // Bushes — also windy
  const bushMat = applyWind(
    new THREE.MeshStandardMaterial({ color: 0x2e6c2a, roughness: 1 }),
    { sway: 0.05, speed: 0.8 },
  );
  for (let i = 0; i < 200; i++) {
    const x = (rng() - 0.5) * SIZE;
    const z = (rng() - 0.5) * SIZE;
    const groundY = forestHeight(x, z);
    if (groundY < -0.3) continue; // don't spawn bushes underwater
    if ((x - POND_X) ** 2 + (z - POND_Z) ** 2 < POND_R * POND_R) continue;
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 + rng() * 0.4, 10, 8),
      bushMat,
    );
    bush.position.set(x, groundY + 0.4, z);
    bush.castShadow = true;
    scene.add(bush);
  }

  // Spawn points
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 30 + rng() * 70;
    spawnPoints.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  while (chestSpots.length < 30) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 80;
    chestSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, forestHeight);

  // Player home: a cabin in the central plaza, with a small camp around it.
  const cabin = addCabin(scene, 0, 0, { facing: 0, groundHeight: forestHeight });
  obstacles.push(...cabin.obstacles);
  colliders.push(...cabin.colliders);
  const tickables = [];
  addCampProps(scene, { x: 0, z: 0 }, {
    rng, count: 9, inner: 7, radius: 18,
    groundHeight: forestHeight,
    obstacles, colliders, tickables,
    avoid: [{ x: 0, z: 0, r: 6 }, { x: cabin.doorOutside.x, z: cabin.doorOutside.z, r: 2.5 }],
  });

  // Atmospheric particles
  const dust   = createDust(scene,   { count: 600, radius: 100, color: 0xfff4e0 });
  const leaves = createLeaves(scene, { count: 400, radius: 100, top: 16 });
  // Tiny pixel sparkles drifting through the woods.
  const pixels = createPixels(scene, {
    count: 1500, radius: 90, height: 14,
    colors: [0xffffaa, 0xa0e0a0, 0xffe6c0, 0xffffff],
  });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: cabin.spawnInside, bounds,
    getGroundHeight: forestHeight,
    atmo, water,
    particles: [dust, leaves, pixels, ...tickables],
  };
}
