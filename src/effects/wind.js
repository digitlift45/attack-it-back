import * as THREE from 'three';

/**
 * Wind sway helper. Patches a MeshStandardMaterial via onBeforeCompile so its
 * vertices sway based on world position + time. Only the upper part of the
 * geometry sways (foliage tops, not the base). All patched materials share a
 * single `uTime` uniform that you advance once per frame via tickWind(t).
 */

const _windMaterials = [];

export function applyWind(material, opts = {}) {
  const sway       = opts.sway      ?? 0.10;
  const speed      = opts.speed     ?? 1.0;
  // Threshold for which local-Y values get to sway (so trunks don't move).
  const minHeight  = opts.minHeight ?? 0.0;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    if (prev) prev(shader);

    shader.uniforms.uWindTime    = { value: 0 };
    shader.uniforms.uWindSway    = { value: sway };
    shader.uniforms.uWindSpeed   = { value: speed };
    shader.uniforms.uWindMinH    = { value: minHeight };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
#include <common>
uniform float uWindTime;
uniform float uWindSway;
uniform float uWindSpeed;
uniform float uWindMinH;
      `)
      .replace('#include <begin_vertex>', `
#include <begin_vertex>
{
  // World-space wind so neighbouring trees sway together but not in lockstep.
  vec3 worldP = (modelMatrix * vec4(position, 1.0)).xyz;
  float h = max(0.0, position.y - uWindMinH);
  float t = uWindTime * uWindSpeed;
  float w = sin(t + worldP.x * 0.30 + worldP.z * 0.18) * uWindSway * h;
  float w2 = cos(t * 1.3 + worldP.z * 0.22) * uWindSway * 0.5 * h;
  transformed.x += w;
  transformed.z += w2;
}
      `);

    material.userData.windShader = shader;
  };

  // Force a re-compile in case the material was already used.
  material.needsUpdate = true;

  _windMaterials.push(material);
  return material;
}

export function tickWind(time) {
  for (const m of _windMaterials) {
    const s = m.userData.windShader;
    if (s) s.uniforms.uWindTime.value = time;
  }
}

export function clearWind() {
  _windMaterials.length = 0;
}
