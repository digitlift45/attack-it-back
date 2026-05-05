import * as THREE from 'three';
import { aabbFromBox } from '../util.js';
import { setupAtmosphere, ATMOSPHERES } from '../sky.js';

/**
 * Convenience: pull a preset atmosphere for the given map and apply it.
 * Returns { sky, sun, hemi, sunDir }.
 */
export function applyAtmosphere(scene, renderer, presetId, overrides = {}) {
  const preset = ATMOSPHERES[presetId] || ATMOSPHERES.forest;
  return setupAtmosphere(scene, renderer, { ...preset, ...overrides });
}

export function addGround(scene, size, color, opts = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 32, 32);
  
  // To get flat shading on a plane, we should jitter it slightly or just let the lighting hit it.
  // We'll leave it as a flat plane but ensure the material matches the low-poly aesthetic.
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 1.0,
    metalness: opts.metalness ?? 0.0,
    flatShading: opts.flatShading ?? true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

/**
 * Builds a vertex-displaced terrain mesh from a heightFn(x, z).
 * Returns { mesh, heightFn } so callers can sample heights to place objects.
 *
 * Notes:
 * - The plane is rotated to be horizontal BEFORE displacing y, so heightFn
 *   receives world-space (x, z) and returns world-space y.
 * - segments controls the LOD of the hills. 96 looks great in 90-100 unit maps.
 */
export function addTerrain(scene, size, color, heightFn, opts = {}) {
  const segments = opts.segments ?? 80; // Lower segments for blockier low-poly look
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const positions = geo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, heightFn(x, z));
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 1.0,
    metalness: opts.metalness ?? 0.0,
    flatShading: opts.flatShading ?? true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  return { mesh, heightFn };
}

// Adds invisible boundary walls so the player can't walk off the world.
export function addBoundaryObstacles(obstacles, bounds, thickness = 1000) {
  const { minX, maxX, minZ, maxZ } = bounds;
  obstacles.push(
    { minX: minX - thickness, maxX: minX,             minZ: minZ - thickness, maxZ: maxZ + thickness },
    { minX: maxX,             maxX: maxX + thickness, minZ: minZ - thickness, maxZ: maxZ + thickness },
    { minX: minX - thickness, maxX: maxX + thickness, minZ: minZ - thickness, maxZ: minZ },
    { minX: minX - thickness, maxX: maxX + thickness, minZ: maxZ,             maxZ: maxZ + thickness },
  );
}

let _cautionMat = null;
export function getCautionMaterial() {
  if (_cautionMat) return _cautionMat;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // Yellow background
  ctx.fillStyle = '#f0c000';
  ctx.fillRect(0, 0, 256, 128);
  
  // Black diagonal stripes
  ctx.fillStyle = '#111';
  for (let i = -128; i < 512; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 20, 0);
    ctx.lineTo(i - 108, 128);
    ctx.lineTo(i - 128, 128);
    ctx.fill();
  }
  
  // "RESTRICTED AREA" text box
  ctx.fillStyle = '#111';
  ctx.fillRect(40, 34, 176, 60);
  ctx.fillStyle = '#f0c000';
  ctx.fillRect(44, 38, 168, 52);
  
  ctx.fillStyle = '#111';
  ctx.font = '900 22px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RESTRICTED', 128, 56);
  ctx.fillText('AREA', 128, 80);
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  
  _cautionMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.8,
    metalness: 0.2,
  });
  return _cautionMat;
}

export function addBoundarySigns(scene, bounds, getGroundHeight) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const mat = getCautionMaterial();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  
  const step = 40; // Place a sign every 40 units
  
  function placeSign(x, z, angle) {
    const gy = getGroundHeight ? getGroundHeight(x, z) : 0;
    
    // Create the sign group
    const g = new THREE.Group();
    g.position.set(x, gy, z);
    g.rotation.y = angle;
    
    // Posts
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6), postMat);
    postL.position.set(-1.2, 1.0, 0);
    postL.castShadow = true;
    
    const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6), postMat);
    postR.position.set(1.2, 1.0, 0);
    postR.castShadow = true;
    
    // Sign board
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 0.1), mat);
    board.position.set(0, 1.6, 0);
    board.castShadow = true;
    
    g.add(postL, postR, board);
    scene.add(g);
  }
  
  // Top and Bottom edges (Z)
  for (let x = minX + 20; x <= maxX - 20; x += step) {
    placeSign(x, minZ + 2, 0);          // Face positive Z (inwards)
    placeSign(x, maxZ - 2, Math.PI);    // Face negative Z (inwards)
  }
  
  // Left and Right edges (X)
  for (let z = minZ + 20; z <= maxZ - 20; z += step) {
    placeSign(minX + 2, z, Math.PI/2);  // Face positive X (inwards)
    placeSign(maxX - 2, z, -Math.PI/2); // Face negative X (inwards)
  }
}

export function addBoxBuilding(scene, x, z, w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h/2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return { mesh: m, aabb: aabbFromBox(x, z, w, d) };
}
