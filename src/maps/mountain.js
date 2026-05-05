import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns } from './_shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { applyWind } from '../effects/wind.js';
import { createSnow, createDust } from '../effects/particles.js';

function mountainHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const damp = Math.min(1, r / 14);
  const h =
    Math.sin(x * 0.04) * 1.8 +
    Math.cos(z * 0.05) * 1.6 +
    Math.sin((x + z) * 0.07) * 0.9 +
    Math.cos((x - z) * 0.10) * 0.6;
  return h * damp;
}

export function buildMountain(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'mountain');

  const SIZE = 240;
  addTerrain(scene, SIZE * 1.6, 0xeaf1f8, mountainHeight, { segments: 140, roughness: 0.9 });

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(42);

  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const r = 100 + rng() * 15;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    addPeak(scene, obstacles, colliders, x, z, 14 + rng() * 10, 28 + rng() * 24, mountainHeight(x, z));
  }

  for (let i = 0; i < 30; i++) {
    const x = (rng() - 0.5) * 180;
    const z = (rng() - 0.5) * 180;
    if (x*x + z*z < 12*12) continue;
    addPeak(scene, obstacles, colliders, x, z, 5 + rng() * 4, 10 + rng() * 10, mountainHeight(x, z));
    if (rng() < 0.5) chestSpots.push({ x: x + (rng() - 0.5) * 8, z: z + (rng() - 0.5) * 8 });
  }

  // Pines
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 1, flatShading: true });
  const pineMat  = applyWind(
    new THREE.MeshStandardMaterial({ color: 0x1f4d34, roughness: 1, flatShading: true }),
    { sway: 0.07, speed: 0.7 },
  );

  for (let i = 0; i < 150; i++) {
    const x = (rng() - 0.5) * 200;
    const z = (rng() - 0.5) * 200;
    if (x*x + z*z < 10*10) continue;
    const groundY = mountainHeight(x, z);

    const trunkH = 1.8 + rng() * 1.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, trunkH, 6), trunkMat);
    trunk.position.set(x, groundY + trunkH / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const pine = new THREE.Mesh(new THREE.ConeGeometry(0.9 + rng() * 0.4, 2.2 + rng() * 0.8, 6), pineMat);
    pine.position.set(x, groundY + trunkH + 1.0, z);
    pine.rotation.y = rng() * Math.PI;
    pine.castShadow = true;
    scene.add(pine);

    const snowCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
    );
    snowCap.position.set(x, groundY + trunkH + 2.0, z);
    scene.add(snowCap);

    obstacles.push(aabbFromBox(x, z, 0.4, 0.4));
    colliders.push(trunk, pine);
  }

  addCabin(scene, obstacles, colliders, 0, 6, mountainHeight(0, 6));

  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 50 + rng() * 40;
    spawnPoints.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  while (chestSpots.length < 30) {
    const a = rng() * Math.PI * 2;
    const r = 20 + rng() * 80;
    chestSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, mountainHeight);

  // Snow + a touch of dust drifting around
  const snow = createSnow(scene, { count: 1800, radius: 120, top: 40 });
  const dust = createDust(scene, { count: 200, radius: 60, color: 0xeef4ff });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: { x: 0, z: -2 }, bounds,
    getGroundHeight: mountainHeight,
    atmo,
    particles: [snow, dust],
  };
}

function addPeak(scene, obstacles, colliders, x, z, baseR, height, groundY = 0) {
  const stone = new THREE.Mesh(
    new THREE.ConeGeometry(baseR, height, 14, 1),
    new THREE.MeshStandardMaterial({ color: 0x6e7686, roughness: 1, flatShading: true })
  );
  stone.position.set(x, groundY + height / 2, z);
  stone.castShadow = true;
  stone.receiveShadow = true;
  scene.add(stone);

  const snowH = height * 0.35;
  const snowR = baseR * 0.35;
  const snow = new THREE.Mesh(
    new THREE.ConeGeometry(snowR, snowH, 14, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  );
  snow.position.set(x, groundY + height - snowH / 2, z);
  scene.add(snow);

  obstacles.push(aabbFromBox(x, z, baseR * 1.6, baseR * 1.6));
  colliders.push(stone);
}

function addCabin(scene, obstacles, colliders, x, z, groundY = 0) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a18, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });

  const w = 5, d = 4, h = 2.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
  body.position.set(x, groundY + h/2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  const roofMesh = new THREE.Mesh(
    new THREE.ConeGeometry(Math.sqrt(w*w + d*d) / 2, 1.6, 4),
    roof
  );
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.position.set(x, groundY + h + 0.8, z);
  roofMesh.castShadow = true;
  scene.add(roofMesh);

  obstacles.push(aabbFromBox(x, z, w, d));
  colliders.push(body, roofMesh);
}
