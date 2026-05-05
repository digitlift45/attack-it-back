import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns } from './_shared.js';
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
  
  // Point light for the lava glow
  const lavaLight = new THREE.PointLight(0xff4400, 2.0, 50);
  lavaLight.position.set(0, 2, 0);
  scene.add(lavaLight);

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

  const embers = createEmbers(scene, { count: 800, radius: 100 });
  const ash = createDust(scene, { count: 600, radius: 100, color: 0x332222, opacity: 0.8 });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: { x: 0, z: 30 }, // start on the rim, looking at the lake
    bounds,
    getGroundHeight: (x, z) => Math.max(-1.5, volcanoHeight(x, z)),
    atmo,
    water: lava,
    particles: [embers, ash],
  };
}