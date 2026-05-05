import * as THREE from 'three';

export function rand(min, max) { return Math.random() * (max - min) + min; }
export function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx*dx + dz*dz; }

// Mulberry32 seeded RNG so map layouts feel hand-made but reproducible per run.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Very simple AABB obstacle list. Each obstacle is { minX, maxX, minZ, maxZ }.
// Resolves a 2D move against axis-aligned boxes by sliding (per-axis).
export function moveWithCollision(pos, dx, dz, radius, obstacles) {
  // Try X
  const tryX = pos.x + dx;
  if (!collidesCircleAabb(tryX, pos.y, pos.z, radius, obstacles)) pos.x = tryX;
  // Try Z
  const tryZ = pos.z + dz;
  if (!collidesCircleAabb(pos.x, pos.y, tryZ, radius, obstacles)) pos.z = tryZ;
}

export function collidesCircleAabb(x, y, z, r, obstacles) {
  for (const o of obstacles) {
    if (o.maxY !== undefined && y >= o.maxY) continue;
    const cx = clamp(x, o.minX, o.maxX);
    const cz = clamp(z, o.minZ, o.maxZ);
    const dx = x - cx, dz = z - cz;
    if (dx*dx + dz*dz < r*r) return true;
  }
  return false;
}

// Helper to push a box obstacle from a Three.js mesh + size.
export function aabbFromBox(cx, cz, sx, sz, maxY = Infinity) {
  return { minX: cx - sx/2, maxX: cx + sx/2, minZ: cz - sz/2, maxZ: cz + sz/2, maxY };
}

export function tmpVec3() { return new THREE.Vector3(); }
