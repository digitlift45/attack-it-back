import * as THREE from 'three';

/**
 * Stylized cloud system: billboard sprites with a procedurally-baked soft alpha
 * texture, drifting slowly across the sky. Returns a tick() to advance the drift.
 */
export function createClouds(scene, opts = {}) {
  const count   = opts.count   ?? 28;
  const radius  = opts.radius  ?? 220;
  const yMin    = opts.yMin    ?? 60;
  const yMax    = opts.yMax    ?? 130;
  const tint    = opts.tint    ?? 0xffffff;
  const opacity = opts.opacity ?? 0.85;
  const speed   = opts.speed   ?? 1.0;
  const minScale= opts.minScale?? 28;
  const maxScale= opts.maxScale?? 70;

  // One shared texture for all clouds — keeps draw cost tiny.
  const tex = generateCloudTexture(256);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: tint,
    opacity,
    transparent: true,
    depthWrite: false,
  });

  const clouds = [];
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(mat);
    const angle = Math.random() * Math.PI * 2;
    const r = radius * (0.55 + Math.random() * 0.5);
    sprite.position.set(
      Math.cos(angle) * r,
      yMin + Math.random() * (yMax - yMin),
      Math.sin(angle) * r,
    );
    const s = minScale + Math.random() * (maxScale - minScale);
    sprite.scale.set(s, s * (0.45 + Math.random() * 0.2), s);
    sprite.userData.driftSpeed = (0.6 + Math.random() * 0.8) * speed;
    sprite.userData.driftAngle = Math.random() * Math.PI * 2;
    sprite.renderOrder = -10;            // draw before opaque world (cheap behind-everything trick)
    scene.add(sprite);
    clouds.push(sprite);
  }

  return {
    clouds,
    tick(dt) {
      for (const c of clouds) {
        c.position.x += Math.cos(c.userData.driftAngle) * c.userData.driftSpeed * dt;
        c.position.z += Math.sin(c.userData.driftAngle) * c.userData.driftSpeed * dt;
        const r = Math.hypot(c.position.x, c.position.z);
        if (r > radius * 1.25) {
          // Wrap around to opposite side
          c.position.x = -c.position.x * 0.95;
          c.position.z = -c.position.z * 0.95;
        }
      }
    },
  };
}

/** Generates a billowy white-on-transparent cloud sprite via canvas. */
function generateCloudTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Layered radial blobs — gives a soft cumulus look.
  const cx = size / 2, cy = size / 2;

  const main = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.5);
  main.addColorStop(0, 'rgba(255,255,255,1)');
  main.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 16; i++) {
    const x = cx + (Math.random() - 0.5) * size * 0.55;
    const y = cy + (Math.random() - 0.5) * size * 0.30;
    const r = size * (0.07 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.45 + Math.random() * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** A bright sun disc placed in the sky direction. Used by god-rays sampling. */
export function createSunDisc(scene, sunDir, opts = {}) {
  const distance = opts.distance ?? 400;
  const size     = opts.size     ?? 18;
  const color    = opts.color    ?? 0xfff4cf;

  const tex = makeSunTexture();
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    depthWrite: false,
    depthTest: false,         // always visible
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, size);
  sprite.position.copy(sunDir).multiplyScalar(distance);
  sprite.renderOrder = 1000;
  scene.add(sprite);
  return sprite;
}

function makeSunTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, size / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,250,220,0.9)');
  g.addColorStop(0.45, 'rgba(255,210,140,0.35)');
  g.addColorStop(1.00, 'rgba(255,180,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
