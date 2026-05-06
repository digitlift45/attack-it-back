import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns, addCabin, addCampProps } from './shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { createDust, createEmbers } from '../effects/particles.js';
import { createWater } from '../effects/water.js';

function volcanoHeight(x, z) {
  const r = Math.hypot(x, z);
  // Center is a sunken caldera/crater, surrounded by high ridges
  const crater = Math.min(1, r / 20); // 0 at center, 1 at 20m
  const rim = Math.max(0, 1 - Math.abs(r - 25) / 15); // peak at 25m
  
  const noise = Math.sin(x * 0.1) * 0.8 + Math.cos(z * 0.12) * 0.7 + Math.sin((x+z)*0.2)*0.4;
  
  return crater * 2 + rim * 5 + noise - 2.5; 
}

export function buildVolcano(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'volcano');

  const SIZE = 240;
  // Dark basalt/obsidian rock
  addTerrain(scene, SIZE * 1.6, 0x1a1111, volcanoHeight, { segments: 180, roughness: 0.9, flatShading: true });

  // Lava lake in the crater
  const lava = createWater(scene, SIZE * 1.6, {
    segments: 80,
    colorShallow: new THREE.Color(0xff4400),
    colorDeep:    new THREE.Color(0xaa1100),
    foamColor:    new THREE.Color(0xffaa00),
    opacity:      1.0,
    waveHeight:   0.15,
    waveSpeed:    0.3,
  });
  lava.water.position.y = -1.5;
  lava.setSun(atmo.sunDir, new THREE.Color(0xff3300));
  
  // Lava glow — three large warm point lights spread across the crater so the
  // rim and cabin are illuminated, not just the center of the lake.
  const lavaPositions = [
    { x: 0,   z: 0,  intensity: 3.2, distance: 80 },
    { x: 14,  z: 0,  intensity: 2.0, distance: 70 },
    { x: -14, z: 0,  intensity: 2.0, distance: 70 },
  ];
  for (const lp of lavaPositions) {
    const light = new THREE.PointLight(0xff5520, lp.intensity, lp.distance, 1.6);
    light.position.set(lp.x, 2, lp.z);
    scene.add(light);
  }

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(888);

  // Sharp obsidian spikes
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x0a0505, roughness: 0.7, metalness: 0.4, flatShading: true });

  for (let i = 0; i < 200; i++) {
    const x = (rng() - 0.5) * SIZE;
    const z = (rng() - 0.5) * SIZE;
    const r = Math.hypot(x, z);
    if (r < 18) continue; // clear lava lake
    const gy = volcanoHeight(x, z);

    if (rng() < 0.7) {
      // Obsidian spike
      const baseR = 1 + rng() * 2;
      const h = 4 + rng() * 8;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(baseR, h, 5), spikeMat);
      spike.position.set(x, gy + h / 2, z);
      spike.rotation.x = (rng() - 0.5) * 0.4;
      spike.rotation.z = (rng() - 0.5) * 0.4;
      spike.castShadow = true; spike.receiveShadow = true;
      scene.add(spike);
      
      obstacles.push(aabbFromBox(x, z, baseR * 1.5, baseR * 1.5));
      colliders.push(spike);
    } else {
      // Flat rock suitable for a chest
      const rad = 1.5 + rng() * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), spikeMat);
      rock.position.set(x, gy + rad * 0.4, z);
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
      
      obstacles.push(aabbFromBox(x, z, rad * 1.8, rad * 1.8));
      colliders.push(rock);
      
      if (rng() < 0.6) chestSpots.push({ x, z });
    }
  }

  // Spawns mostly around the rim
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 30 + rng() * 60;
    spawnPoints.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  while (chestSpots.length < 30) {
    const a = rng() * Math.PI * 2;
    const r = 20 + rng() * 80;
    chestSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, (x, z) => Math.max(-1.5, volcanoHeight(x, z)));

  // Player home: a basecamp cabin on the crater rim, door facing the lava.
  const cabinX = 0, cabinZ = 30;
  const groundFn = (x, z) => Math.max(-1.5, volcanoHeight(x, z));
  const cabin = addCabin(scene, cabinX, cabinZ, { facing: Math.PI, groundHeight: groundFn });
  obstacles.push(...cabin.obstacles);
  colliders.push(...cabin.colliders);
  const tickables = [];
  addCampProps(scene, { x: cabinX, z: cabinZ }, {
    rng, count: 7, inner: 7, radius: 16,
    groundHeight: groundFn,
    obstacles, colliders, tickables,
    avoid: [{ x: cabinX, z: cabinZ, r: 6 }],
  });

  const embers = createEmbers(scene, { count: 800, radius: 100 });
  const ash = createDust(scene, { count: 600, radius: 100, color: 0x332222, opacity: 0.8 });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: cabin.spawnInside,
    bounds,
    getGroundHeight: groundFn,
    atmo,
    water: lava,
    particles: [embers, ash, ...tickables],
  };
}