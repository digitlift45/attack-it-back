import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createClouds, createSunDisc } from './effects/clouds.js';

/**
 * Adds a physically-based sky, sun light, hemisphere fill, fog, environment
 * reflections (PMREM), animated clouds, and a sun disc for god-ray sampling.
 *
 * Returns:
 *   { sky, sun, hemi, sunDir, sunDisc, clouds, tick(dt) }
 */
export function setupAtmosphere(scene, renderer, opts = {}) {
  const {
    elevation = 30, azimuth = 180,
    turbidity = 6, rayleigh = 2, mieCoeff = 0.005, mieG = 0.8,
    sunIntensity = 3.5, sunColor = 0xfff5dc,
    hemiSkyColor = 0x9bc4ff, hemiGroundColor = 0x4a3a26, hemiIntensity = 0.9,
    fogColor = 0xbfd6f0, fogNear = 30, fogFar = 140,
    exposure = 1.0,

    // Cloud presets
    clouds = true,
    cloudCount = 28,
    cloudTint = 0xffffff,
    cloudOpacity = 0.85,
    cloudYMin = 60, cloudYMax = 130,
    cloudSpeed = 1.0,
  } = opts;

  // -------- Sky shader --------
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value       = turbidity;
  u.rayleigh.value        = rayleigh;
  u.mieCoefficient.value  = mieCoeff;
  u.mieDirectionalG.value = mieG;

  const phi   = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // -------- Sun directional light --------
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 400;
  sun.shadow.camera.left   = -180;
  sun.shadow.camera.right  =  180;
  sun.shadow.camera.top    =  180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);

  // -------- Hemisphere fill --------
  const hemi = new THREE.HemisphereLight(hemiSkyColor, hemiGroundColor, hemiIntensity);
  scene.add(hemi);

  // -------- Fog --------
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

  // -------- PMREM environment for material reflections --------
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(sky, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  renderer.toneMappingExposure = exposure;

  // -------- Sun disc (used by god-rays sampling and visible sun) --------
  const sunDisc = createSunDisc(scene, sunDir, {
    distance: 400,
    size: 22,
    color: new THREE.Color(sunColor),
  });

  // -------- Animated clouds --------
  let cloudSys = null;
  if (clouds) {
    cloudSys = createClouds(scene, {
      count: cloudCount,
      tint: cloudTint,
      opacity: cloudOpacity,
      yMin: cloudYMin,
      yMax: cloudYMax,
      speed: cloudSpeed,
      radius: 240,
    });
  }

  function tick(dt) {
    if (cloudSys) cloudSys.tick(dt);
  }

  return { sky, sun, hemi, sunDir, sunDisc, clouds: cloudSys, tick };
}

/**
 * Per-map atmosphere presets.
 */
export const ATMOSPHERES = {
  city: {
    elevation: 4, azimuth: 260, // dusk
    turbidity: 16, rayleigh: 4.0, mieCoeff: 0.02, mieG: 0.85,
    sunIntensity: 3.5, sunColor: 0xff8844,
    hemiSkyColor: 0xffaa55, hemiGroundColor: 0x2a1030, hemiIntensity: 0.6,
    fogColor: 0x4a1530, fogNear: 35, fogFar: 200, // purple fog
    exposure: 0.60,
    cloudCount: 24, cloudTint: 0xffaa66, cloudOpacity: 0.7, cloudSpeed: 0.6,
    cloudYMin: 70, cloudYMax: 140,
  },
  forest: {
    elevation: 35, azimuth: 200,
    turbidity: 5, rayleigh: 1.8, mieCoeff: 0.005, mieG: 0.8,
    sunIntensity: 4.5, sunColor: 0xfff4d6, // warm bright sun
    hemiSkyColor: 0x8fc6ff, hemiGroundColor: 0x2a5a16, hemiIntensity: 1.1,
    fogColor: 0x85d590, fogNear: 45, fogFar: 220,
    exposure: 0.60,
    cloudCount: 40, cloudTint: 0xffffff, cloudOpacity: 0.85, cloudSpeed: 1.0,
    cloudYMin: 55, cloudYMax: 120,
  },
  archipelago: {
    elevation: 55, azimuth: 160,
    turbidity: 2.5, rayleigh: 1.0, mieCoeff: 0.003, mieG: 0.78,
    sunIntensity: 5.0, sunColor: 0xffffff,
    hemiSkyColor: 0x7bdeff, hemiGroundColor: 0xffd781, hemiIntensity: 1.4,
    fogColor: 0x74d8ff, fogNear: 60, fogFar: 280, // bright cyan/blue
    exposure: 0.65,
    cloudCount: 32, cloudTint: 0xffffff, cloudOpacity: 0.95, cloudSpeed: 1.2,
    cloudYMin: 60, cloudYMax: 110,
  },
  mountain: {
    elevation: 18, azimuth: 210,
    turbidity: 6, rayleigh: 3.0, mieCoeff: 0.008, mieG: 0.82,
    sunIntensity: 3.5, sunColor: 0xffeedd,
    hemiSkyColor: 0x96bdeb, hemiGroundColor: 0xe3e7eb, hemiIntensity: 1.2,
    fogColor: 0xa4c1ee, fogNear: 50, fogFar: 240, // cool blue
    exposure: 0.55,
    cloudCount: 42, cloudTint: 0xddeefb, cloudOpacity: 0.75, cloudSpeed: 1.4,
    cloudYMin: 50, cloudYMax: 110,
  },
  desert: {
    elevation: 45, azimuth: 120,
    turbidity: 10, rayleigh: 3.5, mieCoeff: 0.015, mieG: 0.85,
    sunIntensity: 4.8, sunColor: 0xffeedd,
    hemiSkyColor: 0xffcc88, hemiGroundColor: 0xcc5522, hemiIntensity: 1.3,
    fogColor: 0xeeaa66, fogNear: 30, fogFar: 220, // warm orange
    exposure: 0.65,
    cloudCount: 22, cloudTint: 0xffe0b0, cloudOpacity: 0.65, cloudSpeed: 0.8,
    cloudYMin: 80, cloudYMax: 140,
  },
  swamp: {
    elevation: 12, azimuth: 90,
    turbidity: 18, rayleigh: 5.0, mieCoeff: 0.025, mieG: 0.9,
    sunIntensity: 1.5, sunColor: 0x88ff88,
    hemiSkyColor: 0x334422, hemiGroundColor: 0x0a1a0a, hemiIntensity: 0.8,
    fogColor: 0x112211, fogNear: 5, fogFar: 120, // dark green
    exposure: 0.50,
    cloudCount: 30, cloudTint: 0x88aa77, cloudOpacity: 0.8, cloudSpeed: 0.5,
    cloudYMin: 40, cloudYMax: 90,
  },
  volcano: {
    elevation: -2, azimuth: 180, // sun just below horizon
    turbidity: 20, rayleigh: 6, mieCoeff: 0.05, mieG: 0.9,
    sunIntensity: 0.5, sunColor: 0xff3311,
    hemiSkyColor: 0x440000, hemiGroundColor: 0xff2200, hemiIntensity: 0.6,
    fogColor: 0x330000, fogNear: 25, fogFar: 160, // dark red
    exposure: 0.50,
    cloudCount: 35, cloudTint: 0xff2200, cloudOpacity: 0.95, cloudSpeed: 0.4,
    cloudYMin: 40, cloudYMax: 100,
  },
  ruins: {
    elevation: 30, azimuth: 120,
    turbidity: 12, rayleigh: 1.5, mieCoeff: 0.01, mieG: 0.8,
    sunIntensity: 1.2, sunColor: 0xccddee,
    hemiSkyColor: 0x556677, hemiGroundColor: 0x112222, hemiIntensity: 1.1,
    fogColor: 0x445555, fogNear: 30, fogFar: 180, // overcast
    exposure: 0.55,
    cloudCount: 50, cloudTint: 0x778899, cloudOpacity: 0.95, cloudSpeed: 0.8,
    cloudYMin: 50, cloudYMax: 90,
  },
};
