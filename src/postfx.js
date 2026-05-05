import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass }       from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass }     from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass }       from 'three/addons/postprocessing/GTAOPass.js';

/**
 * Modern post-processing pipeline:
 *   Render -> GTAO (contact shadows) -> GodRays -> Bloom -> Grade (CA + grain + vignette) -> SMAA -> Output (ACES + sRGB)
 *
 * Use composer.render() in the main loop. Update sun UV each frame via setSunUV(uv).
 */
export function createComposer(renderer, scene, camera) {
  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // ---- GTAO (Ground-Truth Ambient Occlusion) ----
  // Adds contact shadows where geometry meets — grounds every object naturally.
  const gtao = new GTAOPass(scene, camera, w, h);
  if (gtao.updateGtaoMaterial) {
    gtao.updateGtaoMaterial({
      radius: 0.6,
      distanceExponent: 1.6,
      thickness: 0.4,
      scale: 1.0,
      samples: 16,
      distanceFallOff: 1.0,
    });
  }
  if (typeof gtao.blendIntensity === 'number') gtao.blendIntensity = 0.85;
  composer.addPass(gtao);

  // ---- God rays from the sun (radial sampling of bright pixels) ----
  const godRays = new ShaderPass(GodRaysShader);
  composer.addPass(godRays);

  // ---- Bloom ----
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.85);
  bloom.threshold = 0.82;
  bloom.strength  = 0.65;
  bloom.radius    = 0.75;
  composer.addPass(bloom);

  // ---- Color grade + chromatic aberration + film grain + vignette ----
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const smaa = new SMAAPass(w * dpr, h * dpr);
  composer.addPass(smaa);

  const output = new OutputPass();
  composer.addPass(output);

  return {
    composer, bloom, grade, godRays, gtao, smaa, renderPass,
    setSize(width, height) {
      composer.setSize(width, height);
      bloom.setSize(width, height);
      if (gtao.setSize) gtao.setSize(width, height);
      smaa.setSize(width * dpr, height * dpr);
    },
    /** Pass current sun screen UV (0..1) and visibility (0..1) */
    setSunUV(uv, visibility = 1) {
      godRays.uniforms.uSunUv.value.copy(uv);
      godRays.uniforms.uIntensity.value = 0.9 * visibility;
    },
    tick(dt) {
      grade.uniforms.uTime.value += dt;
    },
    setScene(s, c) {
      renderPass.scene = s;
      renderPass.camera = c;
      gtao.scene = s;
      gtao.camera = c;
    },
  };
}

// -------------------------------------------------------- GOD RAYS SHADER ---
const GodRaysShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uSunUv:     { value: new THREE.Vector2(0.5, 0.5) },
    uIntensity: { value: 0.0 },         // 0 disables; main.js sets per-frame
    uDecay:     { value: 0.965 },
    uExposure:  { value: 0.20 },
    uDensity:   { value: 0.65 },
    uThreshold: { value: 0.78 },        // brightness needed to contribute
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2  uSunUv;
    uniform float uIntensity;
    uniform float uDecay;
    uniform float uExposure;
    uniform float uDensity;
    uniform float uThreshold;
    varying vec2 vUv;

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;

      if (uIntensity <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }

      const int SAMPLES = 60;
      vec2 deltaUv = (vUv - uSunUv) / float(SAMPLES) * uDensity;
      vec2 uv = vUv;
      float decay = 1.0;
      vec3 godrays = vec3(0.0);

      for (int i = 0; i < SAMPLES; i++) {
        uv -= deltaUv;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        // Only let the brightest pixels (sun + sky highlights) contribute
        float lum = max(s.r, max(s.g, s.b));
        float w = smoothstep(uThreshold, 1.0, lum);
        godrays += s * w * decay * uExposure;
        decay *= uDecay;
      }

      // Distance falloff so rays don't bleed across the full screen
      float dist = length(vUv - uSunUv);
      float fade = 1.0 - smoothstep(0.0, 1.4, dist);

      gl_FragColor = vec4(base + godrays * uIntensity * fade, 1.0);
    }
  `,
};

// ---------------------------------------------------- COLOR GRADE SHADER ---
const GradeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0.0 },
    uVignette:   { value: 0.95 },
    uSaturation: { value: 1.10 },
    uContrast:   { value: 1.05 },
    uBrightness: { value: 0.55 },
    uTint:       { value: new THREE.Color(1.0, 1.0, 0.98) },
    uChroma:     { value: 0.0035 },          // chromatic aberration strength
    uGrain:      { value: 0.025 },           // film grain
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uBrightness;
    uniform vec3  uTint;
    uniform float uChroma;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

    void main() {
      vec2 d = vUv - 0.5;

      // Chromatic aberration — radial offset on R/B channels.
      vec2 off = d * uChroma;
      float r = texture2D(tDiffuse, vUv + off).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - off).b;
      vec3 c = vec3(r, g, b);

      // Saturation
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);

      // Contrast around 0.5
      c = (c - 0.5) * uContrast + 0.5;

      // Brightness + warm tint
      c *= uBrightness;
      c *= uTint;

      // Vignette
      float v = smoothstep(0.85, 0.30, length(d));
      c *= mix(1.0, v, uVignette * 0.45);

      // Filmic grain
      float n = hash(vUv * 1024.0 + uTime * 60.0) - 0.5;
      c += n * uGrain;

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
