import * as THREE from 'three';

/**
 * Per-map atmospheric particle systems. All return { points, tick(dt, playerPos) }.
 * The points group is auto-recentered on the player so we never see the edge.
 *
 * Each uses a shared circular sprite texture for soft particles.
 */

let _circTex = null;
function getCircleTexture() {
  if (_circTex) return _circTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _circTex = new THREE.CanvasTexture(c);
  _circTex.colorSpace = THREE.SRGBColorSpace;
  return _circTex;
}

let _starTex = null;
function getStarTexture() {
  // small sharp dot for embers
  if (_starTex) return _starTex;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,200,80,0.8)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _starTex = new THREE.CanvasTexture(c);
  _starTex.colorSpace = THREE.SRGBColorSpace;
  return _starTex;
}

function makePoints(scene, count, color, size, opts = {}) {
  const positions = new Float32Array(count * 3);
  const offsets   = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[3*i+0] = (Math.random() - 0.5) * (opts.radius ?? 60) * 2;
    positions[3*i+1] = Math.random() * (opts.height ?? 12);
    positions[3*i+2] = (Math.random() - 0.5) * (opts.radius ?? 60) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size,
    map: opts.starTex ? getStarTexture() : getCircleTexture(),
    transparent: true,
    opacity: opts.opacity ?? 0.85,
    depthWrite: false,
    sizeAttenuation: true,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return { points, geo, positions };
}

// ----------------------------------------------------------------- DUST ---
export function createDust(scene, opts = {}) {
  const count  = opts.count  ?? 240;
  const radius = opts.radius ?? 28;
  const { points, geo, positions } = makePoints(scene, count, opts.color ?? 0xfff4e0, opts.size ?? 0.06, {
    radius, height: 8, opacity: 0.5, additive: true,
  });

  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = Math.random() * Math.PI * 2;

  return {
    points,
    tick(dt, playerPos) {
      for (let i = 0; i < count; i++) {
        positions[3*i+1] += dt * 0.18;
        positions[3*i+0] += Math.sin(phases[i] + positions[3*i+1] * 0.5) * dt * 0.15;
        positions[3*i+2] += Math.cos(phases[i] + positions[3*i+1] * 0.5) * dt * 0.15;
        if (positions[3*i+1] > 8 || Math.abs(positions[3*i+0]) > radius || Math.abs(positions[3*i+2]) > radius) {
          positions[3*i+0] = (Math.random() - 0.5) * radius * 2;
          positions[3*i+1] = Math.random() * 0.5;
          positions[3*i+2] = (Math.random() - 0.5) * radius * 2;
        }
      }
      if (playerPos) points.position.set(playerPos.x, 0, playerPos.z);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ----------------------------------------------------------------- SNOW ---
export function createSnow(scene, opts = {}) {
  const count  = opts.count  ?? 700;
  const radius = opts.radius ?? 70;
  const top    = opts.top    ?? 35;
  const { points, geo, positions } = makePoints(scene, count, 0xffffff, 0.18, {
    radius, height: top, opacity: 0.95, additive: false,
  });

  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    vel[3*i+0] = (Math.random() - 0.5) * 0.35;
    vel[3*i+1] = -1.0 - Math.random() * 1.2;
    vel[3*i+2] = (Math.random() - 0.5) * 0.35;
  }

  return {
    points,
    tick(dt, playerPos) {
      for (let i = 0; i < count; i++) {
        positions[3*i+0] += vel[3*i+0] * dt + Math.sin(positions[3*i+1] * 0.5) * 0.25 * dt;
        positions[3*i+1] += vel[3*i+1] * dt;
        positions[3*i+2] += vel[3*i+2] * dt;
        if (positions[3*i+1] < -2) {
          positions[3*i+0] = (Math.random() - 0.5) * radius * 2;
          positions[3*i+1] = top;
          positions[3*i+2] = (Math.random() - 0.5) * radius * 2;
        }
      }
      if (playerPos) points.position.set(playerPos.x, 0, playerPos.z);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------- LEAVES ---
export function createLeaves(scene, opts = {}) {
  const count  = opts.count  ?? 240;
  const radius = opts.radius ?? 50;
  const top    = opts.top    ?? 18;
  const colors = [0xa8d662, 0xd9a64a, 0x8bbf3f, 0xc7843b];

  // Slightly larger sprites with a brown-yellow tint
  const { points, geo, positions } = makePoints(scene, count, 0xc7a347, 0.30, {
    radius, height: top, opacity: 0.85, additive: false,
  });

  // Per-leaf phase + tint variance
  const phases = new Float32Array(count);
  const tints  = new Float32Array(count * 3);
  const colorAttr = new THREE.BufferAttribute(tints, 3);
  for (let i = 0; i < count; i++) {
    phases[i] = Math.random() * Math.PI * 2;
    const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
    tints[3*i+0] = c.r; tints[3*i+1] = c.g; tints[3*i+2] = c.b;
  }
  geo.setAttribute('color', colorAttr);
  points.material.vertexColors = true;
  points.material.needsUpdate = true;

  return {
    points,
    tick(dt, playerPos) {
      for (let i = 0; i < count; i++) {
        const ph = phases[i];
        positions[3*i+0] += Math.sin(ph + positions[3*i+1] * 0.4) * 0.6 * dt;
        positions[3*i+1] -= 0.7 * dt;
        positions[3*i+2] += Math.cos(ph + positions[3*i+1] * 0.5) * 0.5 * dt;
        if (positions[3*i+1] < -0.2) {
          positions[3*i+0] = (Math.random() - 0.5) * radius * 2;
          positions[3*i+1] = top;
          positions[3*i+2] = (Math.random() - 0.5) * radius * 2;
        }
      }
      if (playerPos) points.position.set(playerPos.x, 0, playerPos.z);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------- PIXELS ---
// Tiny crisp square particles drifting through the air. Uses a nearest-
// filtered square texture so each particle reads as an actual pixel rather
// than the soft glow that the dust/embers use. Cheap to render in big
// counts because it's still just a single Points draw call.
let _squareTex = null;
function getSquareTexture() {
  if (_squareTex) return _squareTex;
  const size = 8;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  _squareTex = new THREE.CanvasTexture(c);
  _squareTex.colorSpace = THREE.SRGBColorSpace;
  _squareTex.magFilter = THREE.NearestFilter;
  _squareTex.minFilter = THREE.NearestFilter;
  return _squareTex;
}

export function createPixels(scene, opts = {}) {
  const count   = opts.count   ?? 1500;
  const radius  = opts.radius  ?? 90;
  const top     = opts.height  ?? 14;
  const colors  = opts.colors  ?? [0xffffff, 0xffeaa0, 0xa0ddff, 0xffd0c0];
  const size    = opts.size    ?? 0.05;
  const opacity = opts.opacity ?? 0.75;

  const positions = new Float32Array(count * 3);
  const tints     = new Float32Array(count * 3);
  const phases    = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[3*i+0] = (Math.random() - 0.5) * radius * 2;
    positions[3*i+1] = Math.random() * top;
    positions[3*i+2] = (Math.random() - 0.5) * radius * 2;
    const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
    tints[3*i+0] = c.r; tints[3*i+1] = c.g; tints[3*i+2] = c.b;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(tints, 3));

  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size,
    map: getSquareTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    tick(dt, playerPos) {
      for (let i = 0; i < count; i++) {
        positions[3*i+1] += dt * 0.10 * (1 + Math.sin(phases[i]) * 0.3);
        positions[3*i+0] += Math.sin(phases[i] + positions[3*i+1] * 0.3) * dt * 0.06;
        positions[3*i+2] += Math.cos(phases[i] + positions[3*i+1] * 0.3) * dt * 0.06;
        if (positions[3*i+1] > top || Math.abs(positions[3*i+0]) > radius || Math.abs(positions[3*i+2]) > radius) {
          positions[3*i+0] = (Math.random() - 0.5) * radius * 2;
          positions[3*i+1] = Math.random() * 0.5;
          positions[3*i+2] = (Math.random() - 0.5) * radius * 2;
        }
      }
      if (playerPos) points.position.set(playerPos.x, 0, playerPos.z);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------- EMBERS ---
export function createEmbers(scene, opts = {}) {
  const count  = opts.count  ?? 180;
  const radius = opts.radius ?? 30;

  const { points, geo, positions } = makePoints(scene, count, 0xffb464, 0.25, {
    radius, height: 6, opacity: 1.0, additive: true, starTex: true,
  });

  return {
    points,
    tick(dt, playerPos) {
      for (let i = 0; i < count; i++) {
        positions[3*i+1] += (0.4 + Math.sin(positions[3*i+0]) * 0.1) * dt;
        positions[3*i+0] += Math.sin(positions[3*i+1] * 1.3) * 0.08 * dt;
        positions[3*i+2] += Math.cos(positions[3*i+1] * 1.1) * 0.08 * dt;
        if (positions[3*i+1] > 8) {
          positions[3*i+0] = (Math.random() - 0.5) * radius * 2;
          positions[3*i+1] = -0.5;
          positions[3*i+2] = (Math.random() - 0.5) * radius * 2;
        }
      }
      if (playerPos) points.position.set(playerPos.x, 0, playerPos.z);
      geo.attributes.position.needsUpdate = true;
    },
  };
}
