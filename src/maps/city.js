import * as THREE from 'three';
import { addGround, applyAtmosphere, addBoundaryObstacles, addBoundarySigns, getCautionMaterial, addCabin, addCampProps } from './shared.js';
import { aabbFromBox, makeRng } from '../util.js';
import { createEmbers, createDust } from '../effects/particles.js';

export function buildCity(scene, renderer) {
  const atmo = applyAtmosphere(scene, renderer, 'city');

  const SIZE = 200;
  addGround(scene, SIZE * 1.6, 0x1a1f29, { roughness: 0.95 }); // dark asphalt

  const obstacles = [];
  const colliders = [];
  const ladders = [];
  const chestSpots = [];
  const spawnPoints = [];
  const bounds = { minX: -SIZE/2, maxX: SIZE/2, minZ: -SIZE/2, maxZ: SIZE/2 };

  // Painted street lines (just for vibe)
  for (let i = -10; i <= 10; i++) {
    const x = i * 10;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, SIZE),
      new THREE.MeshStandardMaterial({ color: 0xffd86b, roughness: 1, emissive: 0x111111 })
    );
    line.rotation.x = -Math.PI/2;
    line.position.set(x, 0.02, 0);
    scene.add(line);
  }

  const rng = makeRng(1337);
  // Generate buildings on a grid, leaving streets between them
  const gridStep = 14;
  const buildings = new Map();

  for (let gx = -7; gx <= 7; gx++) {
    for (let gz = -7; gz <= 7; gz++) {
      // Skip the center to give the player a starting plaza
      if (Math.abs(gx) <= 0 && Math.abs(gz) <= 0) continue;
      // small chance to skip a block (alleys)
      if (rng() < 0.18) {
        chestSpots.push({ x: gx * gridStep, z: gz * gridStep });
        spawnPoints.push({ x: gx * gridStep, z: gz * gridStep });
        continue;
      }

      const w = 6 + rng() * 4;
      const d = 6 + rng() * 4;
      const h = 4 + rng() * 14;
      const cx = gx * gridStep + (rng() - 0.5) * 2;
      const cz = gz * gridStep + (rng() - 0.5) * 2;

      buildings.set(`${gx},${gz}`, { cx, cz, w, d, h });

      const grayTones = [0x2a3344, 0x323c50, 0x283142, 0x364159, 0x2e3849, 0x444b5e];
      const color = grayTones[Math.floor(rng() * grayTones.length)];

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        emissive: 0x000000,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, h/2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // Tiny window emissive plane on the front (just decorative)
      addWindows(scene, mesh, w, h, d, color);

      obstacles.push(aabbFromBox(cx, cz, w, d, h));
      colliders.push(mesh);

      // Add a caution sign at ground level to tell players they can't go inside
      if (rng() < 0.6) {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 0.8, 0.05),
          getCautionMaterial()
        );
        const isX = rng() < 0.5;
        const dir = rng() < 0.5 ? 1 : -1;
        if (isX) {
          sign.position.set(cx + dir * (w/2 + 0.01), 1.2, cz + (rng()-0.5)*(d-2.5));
          sign.rotation.y = dir === 1 ? Math.PI/2 : -Math.PI/2;
        } else {
          sign.position.set(cx + (rng()-0.5)*(w-2.5), 1.2, cz + dir * (d/2 + 0.01));
          sign.rotation.y = dir === 1 ? 0 : Math.PI;
        }
        sign.receiveShadow = true;
        scene.add(sign);
      }

      // Add a ladder on the side sometimes
      if (rng() < 0.4) {
        const isX = rng() < 0.5;
        const dir = rng() < 0.5 ? 1 : -1;
        let lx = cx, lz = cz;
        let rx = 0, ry = 0;
        
        const ladMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.5 });
        const lg = new THREE.Group();
        
        if (isX) {
           lx = cx + dir * (w/2 + 0.1);
           const railL = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), ladMat);
           const railR = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), ladMat);
           railL.position.set(0, h/2, -0.4);
           railR.position.set(0, h/2, 0.4);
           lg.add(railL, railR);
           for(let y = 0.4; y < h + 0.5; y += 0.8) {
              const rung = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), ladMat);
              rung.position.set(0, y, 0);
              lg.add(rung);
           }
           ladders.push({
             minX: lx - 0.4, maxX: lx + 0.4,
             minZ: lz - 0.5, maxZ: lz + 0.5,
             minY: 0, maxY: h
           });
        } else {
           lz = cz + dir * (d/2 + 0.1);
           const railL = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), ladMat);
           const railR = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), ladMat);
           railL.position.set(-0.4, h/2, 0);
           railR.position.set(0.4, h/2, 0);
           lg.add(railL, railR);
           for(let y = 0.4; y < h + 0.5; y += 0.8) {
              const rung = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), ladMat);
              rung.position.set(0, y, 0);
              lg.add(rung);
           }
           ladders.push({
             minX: lx - 0.5, maxX: lx + 0.5,
             minZ: lz - 0.4, maxZ: lz + 0.4,
             minY: 0, maxY: h
           });
        }
        lg.position.set(lx, 0, lz);
        scene.add(lg);
      }

      // chest in alleys around this building
      if (rng() < 0.5) chestSpots.push({ x: cx + (rng() - 0.5) * gridStep, z: cz + (rng() - 0.5) * gridStep });
      spawnPoints.push({ x: cx + (rng() < 0.5 ? -1 : 1) * (w + 4), z: cz + (rng() < 0.5 ? -1 : 1) * (d + 4) });
    }
  }

  // Add sagging bridges between adjacent buildings
  for (let gx = -7; gx <= 7; gx++) {
    for (let gz = -7; gz <= 7; gz++) {
      const b1 = buildings.get(`${gx},${gz}`);
      if (!b1) continue;
      
      const neighbors = [
        buildings.get(`${gx+1},${gz}`),
        buildings.get(`${gx},${gz+1}`)
      ];

      for (const b2 of neighbors) {
        if (!b2) continue;
        if (rng() < 0.4) continue; // Not every adjacent building gets a bridge

        const dx = b2.cx - b1.cx;
        const dz = b2.cz - b1.cz;
        const len = Math.sqrt(dx*dx + dz*dz) - (Math.max(b1.w, b1.d)/2 + Math.max(b2.w, b2.d)/2) * 0.5;
        if (len <= 0) continue;

        const bridgeGroup = new THREE.Group();
        const planks = Math.max(4, Math.floor(len / 1.2));
        const angle = Math.atan2(dx, dz);
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.9 });
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8c7b64, roughness: 1.0 });

        // Start point and end point
        const startX = b1.cx + (dx / Math.sqrt(dx*dx + dz*dz)) * (b1.w / 2 - 0.5);
        const startZ = b1.cz + (dz / Math.sqrt(dx*dx + dz*dz)) * (b1.d / 2 - 0.5);
        const startY = b1.h;

        const endX = b2.cx - (dx / Math.sqrt(dx*dx + dz*dz)) * (b2.w / 2 - 0.5);
        const endZ = b2.cz - (dz / Math.sqrt(dx*dx + dz*dz)) * (b2.d / 2 - 0.5);
        const endY = b2.h;

        const rdx = endX - startX;
        const rdy = endY - startY;
        const rdz = endZ - startZ;
        const bridgeLen = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz);
        const sag = bridgeLen * 0.15; // amount of sag

        for (let i = 0; i <= planks; i++) {
          const t = i / planks;
          // Catenary approximation using parabola
          const sagY = 4 * sag * t * (t - 1);
          
          const px = startX + rdx * t;
          const py = startY + rdy * t + sagY;
          const pz = startZ + rdz * t;
          
          const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.0), woodMat);
          plank.position.set(px, py, pz);
          plank.rotation.y = angle;
          
          // Tilt the plank based on the slope of the sag
          const slope = rdy + 4 * sag * (2 * t - 1);
          plank.rotation.x = Math.atan2(slope, bridgeLen);

          plank.castShadow = true; plank.receiveShadow = true;
          scene.add(plank);
          colliders.push(plank);
          
          // The bridge is walkable, so we add an obstacle piece for the player to walk on it
          // Make it slightly wider to prevent falling off easily
          obstacles.push({
            minX: px - 1.2, maxX: px + 1.2,
            minZ: pz - 1.2, maxZ: pz + 1.2,
            maxY: py
          });
        }
        
        // Ropes
        const ropeGeo = new THREE.CylinderGeometry(0.04, 0.04, bridgeLen, 4);
        ropeGeo.rotateX(Math.PI / 2);
        
        // We need a custom curved geometry for the sagging rope or just use short segments.
        // Let's use a TubeGeometry or just let the player see the planks and skip the complex ropes.
        // Actually, we can just create a line or string of spheres for the rope if we want, or keep it simple with just planks.
        // I will add handrails with simple cylinders between the planks.
        for (let i = 0; i < planks; i++) {
            const t1 = i / planks;
            const t2 = (i + 1) / planks;
            
            const px1 = startX + rdx * t1, py1 = startY + rdy * t1 + 4 * sag * t1 * (t1 - 1) + 1.2, pz1 = startZ + rdz * t1;
            const px2 = startX + rdx * t2, py2 = startY + rdy * t2 + 4 * sag * t2 * (t2 - 1) + 1.2, pz2 = startZ + rdz * t2;
            
            const pDx = px2 - px1, pDy = py2 - py1, pDz = pz2 - pz1;
            const pLen = Math.sqrt(pDx*pDx + pDy*pDy + pDz*pDz);
            
            const ropeR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, pLen, 4), ropeMat);
            const ropeL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, pLen, 4), ropeMat);
            
            ropeR.position.set((px1+px2)/2 + Math.cos(angle)*0.8, (py1+py2)/2, (pz1+pz2)/2 - Math.sin(angle)*0.8);
            ropeL.position.set((px1+px2)/2 - Math.cos(angle)*0.8, (py1+py2)/2, (pz1+pz2)/2 + Math.sin(angle)*0.8);
            
            ropeR.lookAt(px2 + Math.cos(angle)*0.8, py2, pz2 - Math.sin(angle)*0.8);
            ropeR.rotateX(Math.PI/2);
            ropeL.lookAt(px2 - Math.cos(angle)*0.8, py2, pz2 + Math.sin(angle)*0.8);
            ropeL.rotateX(Math.PI/2);

            scene.add(ropeR, ropeL);
        }
      }
    }
  }

  // Street lamps in the middle plaza
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    addLamp(scene, x, z);
  }

  // Player home: a survivors' shack set up in the central plaza, with a
  // small camp of supplies around it (campfires, crates, lanterns).
  const cabin = addCabin(scene, 0, 0, { facing: 0 });
  obstacles.push(...cabin.obstacles);
  colliders.push(...cabin.colliders);
  const tickables = [];
  addCampProps(scene, { x: 0, z: 0 }, {
    rng, count: 8, inner: 6.5, radius: 12,
    obstacles, colliders, tickables,
    avoid: [{ x: 0, z: 0, r: 6 }],
  });

  addBoundaryObstacles(obstacles, bounds);
  addBoundarySigns(scene, bounds, null);

  const embers = createEmbers(scene, { count: 350, radius: 80 });
  const dust   = createDust(scene,   { count: 400, radius: 80, color: 0xffd6a0 });

  return {
    obstacles, colliders, ladders, spawnPoints, chestSpots,
    playerStart: cabin.spawnInside, bounds,
    atmo,
    particles: [embers, dust, ...tickables],
  };
}

function addWindows(scene, building, w, h, d, baseColor) {
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffd86b,
    emissive: 0xffaa3a,
    emissiveIntensity: 0.8,
    roughness: 1,
  });
  const rows = Math.max(1, Math.floor(h / 2.2));
  const cols = Math.max(1, Math.floor(w / 1.6));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.4) continue;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), winMat);
      const x = building.position.x - w/2 + 0.8 + c * (w - 1.6) / Math.max(1, cols - 1);
      const y = 1.2 + r * (h - 2) / Math.max(1, rows - 1);
      win.position.set(x, y, building.position.z + d/2 + 0.01);
      scene.add(win);
    }
  }
}

function addLamp(scene, x, z) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 })
  );
  post.position.set(x, 1.5, z);
  scene.add(post);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffefa8, emissive: 0xffd86b, emissiveIntensity: 1.5 })
  );
  bulb.position.set(x, 3.0, z);
  scene.add(bulb);

  const light = new THREE.PointLight(0xffd1a0, 0.8, 14, 2);
  light.position.set(x, 2.9, z);
  scene.add(light);
}
