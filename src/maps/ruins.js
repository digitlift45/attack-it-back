import * as THREE from 'three';
import { applyAtmosphere, addBoundaryObstacles, addTerrain, addBoundarySigns, getCautionMaterial, addCabin, addCampProps } from './shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { applyWind } from '../effects/wind.js';
import { createDust, createLeaves, createPixels } from '../effects/particles.js';

function ruinsHeight(x, z) {
  const r = Math.hypot(x, z);
  const damp = Math.min(1, r / 12);
  // Gently rolling, mostly flat
  const h = Math.sin(x * 0.05) * 0.8 + Math.cos(z * 0.06) * 0.6;
  return h * damp;
}

export function buildRuins(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'ruins');

  const SIZE = 240;
  // Mossy stone ground
  addTerrain(scene, SIZE * 1.6, 0x4a554a, ruinsHeight, { segments: 180, roughness: 1.0 });

  const obstacles = [];
  const colliders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  const rng = makeRng(1001);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.9 });
  const mossMat = applyWind(new THREE.MeshStandardMaterial({ color: 0x33aa44, roughness: 1 }), { sway: 0.05, speed: 0.6 });

  // Add ancient pillars and ruined walls
  // Let's create a grid-like ancient temple layout that has decayed
  const gridStep = 12;
  for (let gx = -9; gx <= 9; gx++) {
    for (let gz = -9; gz <= 9; gz++) {
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1 && !(gx===0 && gz===0)) continue; // Keep a central plaza, but put something dead center
      
      const cx = gx * gridStep + (rng() - 0.5) * 2;
      const cz = gz * gridStep + (rng() - 0.5) * 2;
      const gy = ruinsHeight(cx, cz);
      
      const type = rng();
      
      if (gx === 0 && gz === 0) {
        // Central altar
        const altar = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6), stoneMat);
        altar.position.set(0, gy + 1, 0);
        altar.castShadow = true; altar.receiveShadow = true;
        scene.add(altar);
        obstacles.push(aabbFromBox(0, 0, 6, 6));
        colliders.push(altar);
        chestSpots.push({ x: 0, z: 0 }); // guarantee chest on altar
      }
      else if (type < 0.4) {
        // Broken pillar
        const h = 2 + rng() * 10;
        const w = 1.5;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(w, w, h, 6), stoneMat);
        pillar.position.set(cx, gy + h/2, cz);
        pillar.rotation.y = rng() * Math.PI;
        if (rng() < 0.2) {
          pillar.rotation.x = (rng() - 0.5) * 0.4;
          pillar.rotation.z = (rng() - 0.5) * 0.4;
        }
        pillar.castShadow = true; pillar.receiveShadow = true;
        scene.add(pillar);
        obstacles.push(aabbFromBox(cx, cz, w*2.2, w*2.2));
        colliders.push(pillar);
        
        // Sometimes moss/vines on pillar
        if (rng() < 0.5) {
          const moss = new THREE.Mesh(new THREE.CylinderGeometry(w+0.1, w+0.1, h*0.4, 6), mossMat);
          moss.position.set(cx, gy + h*0.8, cz);
          moss.rotation.copy(pillar.rotation);
          scene.add(moss);
        }
      }
      else if (type < 0.7) {
        // Ruined wall section
        const w = 8 + rng() * 6;
        const h = 3 + rng() * 5;
        const d = 1.5;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
        wall.position.set(cx, gy + h/2, cz);
        wall.rotation.y = (rng() < 0.5 ? 0 : Math.PI/2) + (rng() - 0.5) * 0.2;
        wall.castShadow = true; wall.receiveShadow = true;
        scene.add(wall);
        
        // AABB computation depends on rotation roughly
        const size = Math.max(w, d) * 1.2;
        obstacles.push(aabbFromBox(cx, cz, size, size));
        colliders.push(wall);
        
        // Add a caution sign flat against the wall occasionally
        if (rng() < 0.5) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.8, 0.05),
            getCautionMaterial()
          );
          sign.position.set(cx, gy + 1.2, cz);
          // offset it to be flat against the wall face
          sign.rotation.y = wall.rotation.y;
          sign.position.x += Math.cos(wall.rotation.y + Math.PI/2) * (d/2 + 0.01);
          sign.position.z += Math.sin(wall.rotation.y + Math.PI/2) * (d/2 + 0.01);
          sign.receiveShadow = true;
          scene.add(sign);
        }
        
        if (rng() < 0.4) chestSpots.push({ x: cx + 2, z: cz + 2 });
      }
    }
  }

  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 35 + rng() * 70;
    spawnPoints.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  while (chestSpots.length < 30) {
    const a = rng() * Math.PI * 2;
    const r = 10 + rng() * 80;
    chestSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, ruinsHeight);

  // Player home: an explorer's cabin set up among the ruins, door facing the
  // central altar so the player can see the objective on spawn.
  const cabinX = 0, cabinZ = 25;
  const cabin = addCabin(scene, cabinX, cabinZ, { facing: Math.PI, groundHeight: ruinsHeight });
  obstacles.push(...cabin.obstacles);
  colliders.push(...cabin.colliders);
  const tickables = [];
  addCampProps(scene, { x: cabinX, z: cabinZ }, {
    rng, count: 8, inner: 7, radius: 16,
    groundHeight: ruinsHeight,
    obstacles, colliders, tickables,
    avoid: [{ x: cabinX, z: cabinZ, r: 6 }],
  });

  const dust = createDust(scene, { count: 600, radius: 100, color: 0x88aabb });
  const leaves = createLeaves(scene, { count: 300, radius: 100, top: 18 });
  const pixels = createPixels(scene, {
    count: 1500, radius: 100, height: 16,
    colors: [0x88ccff, 0xc0c8d0, 0xffe6a0, 0xffffff],
  });

  return {
    obstacles, colliders, spawnPoints, chestSpots,
    playerStart: cabin.spawnInside,
    bounds,
    getGroundHeight: ruinsHeight,
    atmo,
    particles: [dust, leaves, pixels, ...tickables],
  };
}