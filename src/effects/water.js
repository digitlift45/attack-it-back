import * as THREE from 'three';

/**
 * Stylized animated water — vertex-displaced waves, fresnel-blended deep/shallow
 * colors, and white foam where the wave crest is high. Returns tick() for time.
 */
export function createWater(scene, size = 220, opts = {}) {
  const segments      = opts.segments      ?? 160;
  const colorShallow  = opts.colorShallow  ?? new THREE.Color(0x4fb3e5);
  const colorDeep     = opts.colorDeep     ?? new THREE.Color(0x0a3c66);
  const foamColor     = opts.foamColor     ?? new THREE.Color(0xffffff);
  const opacity       = opts.opacity       ?? 0.94;
  const waveHeight    = opts.waveHeight    ?? 0.22;
  const waveSpeed     = opts.waveSpeed     ?? 1.0;

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uColorShallow: { value: colorShallow },
      uColorDeep:    { value: colorDeep },
      uFoamColor:    { value: foamColor },
      uOpacity:      { value: opacity },
      uFresnelPower: { value: 2.4 },
      uWaveHeight:   { value: waveHeight },
      uWaveSpeed:    { value: waveSpeed },
      uCameraPosition: { value: new THREE.Vector3() },
      uSunDir:       { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uSunColor:     { value: new THREE.Color(1, 0.95, 0.85) },
    },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uWaveHeight;
      uniform float uWaveSpeed;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      // Sample the wave at a given world-XZ coordinate
      float waveY(vec2 p, float t) {
        float w1 = sin(p.x * 0.16 + t * 1.0) * cos(p.y * 0.18 + t * 0.7);
        float w2 = sin(p.x * 0.30 - t * 0.6) * cos(p.y * 0.21 + t * 0.9) * 0.55;
        float w3 = sin(p.y * 0.45 + t * 1.2) * 0.30;
        return (w1 + w2 + w3);
      }

      void main() {
        float t = uTime * uWaveSpeed;
        vec3 p = position;
        p.y += waveY(p.xz, t) * uWaveHeight;

        // Numerical normal: sample the wave a tiny step away in X and Z
        float eps = 0.5;
        float hx = waveY(p.xz + vec2(eps, 0.0), t) * uWaveHeight;
        float hz = waveY(p.xz + vec2(0.0, eps), t) * uWaveHeight;
        vec3 dx = vec3(eps, hx - p.y, 0.0);
        vec3 dz = vec3(0.0, hz - p.y, eps);
        vec3 n = normalize(cross(dz, dx));

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos    = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * n);

        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uColorShallow;
      uniform vec3  uColorDeep;
      uniform vec3  uFoamColor;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform float uOpacity;
      uniform float uFresnelPower;
      uniform vec3  uCameraPosition;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 V = normalize(uCameraPosition - vWorldPos);
        float fres = pow(1.0 - max(dot(vWorldNormal, V), 0.0), uFresnelPower);

        // Base color: deep -> shallow on fresnel
        vec3 col = mix(uColorDeep, uColorShallow, fres);

        // Foam where wave crest is high in world Y
        float foam = smoothstep(0.06, 0.20, vWorldPos.y);
        col = mix(col, uFoamColor, foam * 0.55);

        // Sky/sun-tinted reflection on highly-fresnel pixels
        col = mix(col, uColorShallow * 1.6, fres * 0.35);

        // Specular sun glint (Blinn-Phong-ish)
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(vWorldNormal, H), 0.0), 80.0);
        col += uSunColor * spec * 0.9;

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });

  const water = new THREE.Mesh(geo, mat);
  water.position.y = 0;
  water.receiveShadow = false;
  water.castShadow = false;
  scene.add(water);

  return {
    water, mat, size,
    // Maps can flip this to opt out of drowning damage (e.g. ambient swamp
    // murk that's just visual). Defaults to true so existing maps still work.
    damaging: true,
    setSun(dir, color) {
      mat.uniforms.uSunDir.value.copy(dir);
      if (color) mat.uniforms.uSunColor.value.copy(color);
    },
    tick(dt, camera) {
      mat.uniforms.uTime.value += dt;
      if (camera) mat.uniforms.uCameraPosition.value.copy(camera.position);
    },
  };
}
