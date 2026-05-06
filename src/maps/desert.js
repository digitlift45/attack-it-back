import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns, getCautionMaterial, addCabin, addCampProps } from './shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { createDust } from '../effects/particles.js';

function desertHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const damp = Math.min(1, r / 15);
  // Sand dunes
  const h =
    Math.sin(x * 0.08) * 0.8 +
    Math.cos(z * 0.09) * 0.7 +
    Math.sin((x + z) * 0.1) * 0.5 +
    Math.cos((x - z) * 0.12) * 0.4;
  return h * damp;
}

export function buildDesert(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'desert');

  const SIZE = 240;
  addTerrain(scene, SIZE * 1.6, 0xaa7744, desertHeight, { segments: 180, roughness: 1.0 });

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(1234);

  // Add sandstone pillars/canyons around edges
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const r = 50 + rng() * 50;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const gy = desertHeight(x, z);
    
    const w = 4 + rng() * 8;
    const d = 4 + rng() * 8;
    const h = 10 + rng() * 25;
    
    const mat = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.9, flatShading: true });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    pillar.position.set(x, gy + h/2, z);
    pillar.rotation.y = rng() * Math.PI;
    pillar.castShadow = true; pillar.receiveShadow = true;
    scene.add(pillar);
    
    // Crude AABB (slightly oversized for rotation)
    const size = Math.max(w, d) * 1.2;
    obstacles.push(aabbFromBox(x, z, size, size));
    colliders.push(pillar);
    
    if (rng() < 0.4) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.8, 0.05),
        getCautionMaterial()
      );
      sign.position.set(x, gy + 1.2, z);
      sign.rotation.y = pillar.rotation.y;
      sign.position.x += Math.cos(pillar.rotation.y + Math.PI/2) * (d/2 + 0.01);
      sign.position.z += Math.sin(pillar.rotation.y + Math.PI/2) * (d/2 + 0.01);
      sign.receiveShadow = true;
      scene.add(sign);
    }
  }

  // Add cacti and small rocks
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x336622, roughness: 0.8, flatShading: true });
  for (let i = 0; i < 120; i++) {
    const x = (rng() - 0.5) * SIZE;
    const z = (rng() - 0.5) * SIZE;
    if (x*x + z*z < 8*8) continue;
    const gy = desertHeight(x, z);

    if (rng() < 0.6) {
      // Cactus
      const h = 2 + rng() * 2;
      const cactus = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, h, 6), cactusMat);
      cactus.position.set(x, gy + h/2, z);
      cactus.castShadow = true;
      scene.add(cactus);
      obstacles.push(aabbFromBox(x, z, 0.6, 0.6));
      colliders.push(cactus);
    } else {
      // Rock
      const rad = 0.5 + rng() * 1.5;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rad, 0),
        new THREE.MeshStandardMaterial({ color: 0x6e5040, roughness: 1, flatShading: true })
      );
      rock.position.set(x, gy + rad * 0.5, z);
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
      obstacles.push(aabbFromBox(x, z, rad * 1.8, rad * 1.8));
      colliders.push(rock);
      
      if (rng() < 0.4) chestSpots.push({ x: x + (rng() - 0.5) * 5, z: z + (rng() - 0.5) * 5 });
    }
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
  addBoundarySigns(scene, bounds, desertHeight);

  // Player home: a desert outpost cabin in a flat clearing.
  const cabin = addCabin(scene, 0, 0, { facing: 0, groundHeight: desertHeight });
  obstacles.push(...cabin.obstacles);
  colliders.push(...cabin.colliders);
  const tickables = [];
  addCampProps(scene, { x: 0, z: 0 }, {
    rng, count: 8, inner: 7, radius: 17,
    groundHeight: desertHeight,
    obstacles, colliders, tickables,
    avoid: [{ x: 0, z: 0, r: 6 }],
  });

  // Blowing sand/dust
  const sand = createDust(scene, { count: 800, radius: 100, color: 0xffd0aa, opacity: 0.6 });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: cabin.spawnInside, bounds,
    getGroundHeight: desertHeight,
    atmo,
    particles: [sand, ...tickables],
  };
}