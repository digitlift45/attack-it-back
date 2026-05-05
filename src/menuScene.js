import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createClouds, createSunDisc } from './effects/clouds.js';
import { createDust } from './effects/particles.js';

/**
 * Cinematic animated background for the home screen — physically-based sky,
 * drifting clouds, dust motes, slow camera dolly. Renders into the supplied
 * canvas. Returns { dispose, pause(), resume() }.
 */
export function createMenuScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  resize();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.60;

  const scene = new THREE.Scene();

  // Sun direction — golden hour
  const elevation = 12;
  const azimuth = 195;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

  // Sky shader
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value = 9;
  u.rayleigh.value = 2.6;
  u.mieCoefficient.value = 0.008;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Sun disc + warm fill light
  createSunDisc(scene, sunDir, { distance: 400, size: 24, color: new THREE.Color(0xffd9a0) });
  const fill = new THREE.HemisphereLight(0xffd0a0, 0x1a1a30, 1.0);
  scene.add(fill);
  const dir = new THREE.DirectionalLight(0xffd9a0, 0.6);
  dir.position.copy(sunDir).multiplyScalar(50);
  scene.add(dir);

  // Drifting clouds + dust
  const clouds = createClouds(scene, {
    count: 38,
    tint: 0xffd6a8,
    opacity: 0.85,
    yMin: 30, yMax: 120,
    speed: 1.8,
    radius: 260,
    minScale: 30, maxScale: 90,
  });
  const dust = createDust(scene, { count: 200, radius: 60, color: 0xffe6c0 });

  // Camera with a slight slow dolly
  const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 800);
  camera.position.set(0, 6, 0);
  camera.lookAt(sunDir.x * 100, 8, sunDir.z * 100);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(400, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);

  // Add some buildings with bridges to the menu background
  const rng = () => Math.random();
  const buildings = new Map();
  const gridStep = 14;

  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue; // Leave center empty for camera
      if (rng() < 0.15) continue;

      const w = 6 + rng() * 4;
      const d = 6 + rng() * 4;
      const h = 8 + rng() * 20;
      const cx = gx * gridStep + (rng() - 0.5) * 2;
      const cz = gz * gridStep + (rng() - 0.5) * 2;

      buildings.set(`${gx},${gz}`, { cx, cz, w, d, h });

      const grayTones = [0x2a3344, 0x323c50, 0x283142, 0x364159, 0x2e3849, 0x444b5e];
      const color = grayTones[Math.floor(rng() * grayTones.length)];

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, h/2 - 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  // Add sagging bridges between adjacent buildings
  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      const b1 = buildings.get(`${gx},${gz}`);
      if (!b1) continue;
      
      const neighbors = [
        buildings.get(`${gx+1},${gz}`),
        buildings.get(`${gx},${gz+1}`)
      ];

      for (const b2 of neighbors) {
        if (!b2) continue;
        if (rng() < 0.2) continue; // Almost every building gets a bridge now

        const dx = b2.cx - b1.cx;
        const dz = b2.cz - b1.cz;
        const len = Math.sqrt(dx*dx + dz*dz) - (Math.max(b1.w, b1.d)/2 + Math.max(b2.w, b2.d)/2) * 0.5;
        if (len <= 0) continue;

        const planks = Math.max(4, Math.floor(len / 1.2));
        const angle = Math.atan2(dx, dz);
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.9 });
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8c7b64, roughness: 1.0 });

        const startX = b1.cx + (dx / Math.sqrt(dx*dx + dz*dz)) * (b1.w / 2 - 0.5);
        const startZ = b1.cz + (dz / Math.sqrt(dx*dx + dz*dz)) * (b1.d / 2 - 0.5);
        const startY = b1.h - 2;

        const endX = b2.cx - (dx / Math.sqrt(dx*dx + dz*dz)) * (b2.w / 2 - 0.5);
        const endZ = b2.cz - (dz / Math.sqrt(dx*dx + dz*dz)) * (b2.d / 2 - 0.5);
        const endY = b2.h - 2;

        const rdx = endX - startX;
        const rdy = endY - startY;
        const rdz = endZ - startZ;
        const bridgeLen = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz);
        const sag = bridgeLen * 0.15;

        for (let i = 0; i <= planks; i++) {
          const t = i / planks;
          const sagY = 4 * sag * t * (t - 1);
          
          const px = startX + rdx * t;
          const py = startY + rdy * t + sagY;
          const pz = startZ + rdz * t;
          
          const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.0), woodMat);
          plank.position.set(px, py, pz);
          plank.rotation.y = angle;
          
          const slope = rdy + 4 * sag * (2 * t - 1);
          plank.rotation.x = Math.atan2(slope, bridgeLen);

          plank.castShadow = true; plank.receiveShadow = true;
          scene.add(plank);
        }
        
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

  // Distant silhouette mountains for depth
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const r = 180 + Math.random() * 40;
    const h = 40 + Math.random() * 40;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(20 + Math.random() * 15, h, 6),
      new THREE.MeshStandardMaterial({ color: 0x0e1320, roughness: 1, flatShading: true })
    );
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    scene.add(m);
  }

  let running = true;
  let t = 0;
  const startTime = performance.now();

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    t += dt;

    // Slow orbit + bob so the sky feels alive
    const elapsed = (now - startTime) / 1000;
    camera.position.x = Math.sin(elapsed * 0.06) * 8;
    camera.position.z = Math.cos(elapsed * 0.06) * 8;
    camera.position.y = 6 + Math.sin(elapsed * 0.2) * 0.4;
    camera.lookAt(sunDir.x * 60, 14 + Math.sin(elapsed * 0.15) * 1, sunDir.z * 60);

    clouds.tick(dt);
    dust.tick(dt, camera.position);

    renderer.render(scene, camera);
  }
  let lastTime = performance.now();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  window.addEventListener('resize', resize);
  frame();

  return {
    dispose() {
      running = false;
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
    pause() { running = false; },
    resume() {
      if (!running) {
        running = true;
        lastTime = performance.now();
        frame();
      }
    },
  };
}
