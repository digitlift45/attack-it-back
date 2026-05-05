import { buildCity } from './city.js';
import { buildForest } from './forest.js';
import { buildArchipelago } from './archipelago.js';
import { buildMountain } from './mountain.js';
import { buildDesert } from './desert.js';
import { buildSwamp } from './swamp.js';
import { buildVolcano } from './volcano.js';
import { buildRuins } from './ruins.js';

export function buildMap(id, scene, renderer) {
  switch (id) {
    case 'city': return buildCity(scene, renderer);
    case 'forest': return buildForest(scene, renderer);
    case 'archipelago': return buildArchipelago(scene, renderer);
    case 'mountain': return buildMountain(scene, renderer);
    case 'desert': return buildDesert(scene, renderer);
    case 'swamp': return buildSwamp(scene, renderer);
    case 'volcano': return buildVolcano(scene, renderer);
    case 'ruins': return buildRuins(scene, renderer);
    default: return buildForest(scene, renderer);
  }
}

/**
 * All map builders return:
 * {
 *   obstacles: [{minX,maxX,minZ,maxZ}, ...],   // 2D AABBs for collision (player + enemies)
 *   colliders: THREE.Object3D[],               // meshes for raycasting (bullets)
 *   spawnPoints: [{x,z}, ...],                 // enemy spawn candidates
 *   chestSpots: [{x,z}, ...],                  // candidate chest locations
 *   playerStart: {x,z},
 *   bounds: { minX, maxX, minZ, maxZ },        // world boundary (walls auto-added)
 *   sky: 0xRRGGBB                              // background color
 * }
 */
