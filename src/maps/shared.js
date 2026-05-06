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

// ---------------------------------------------------------------------------
//  CABIN  --  a small log cabin you can walk into. The doorway is a real gap
//  in the front wall (no obstacle there) so movement into and out of the
//  cabin "just works" with the existing AABB collision.
//
//  The cabin is built as four walls (with the front wall split around the
//  doorway), a pitched roof, gable end caps, a chimney, a wood floor, and a
//  few interior props (bed, table with lantern). Returns the obstacles to
//  push into the map's obstacle list, plus useful spawn anchors.
// ---------------------------------------------------------------------------
export function addCabin(scene, cx, cz, opts = {}) {
  const width      = opts.width      ?? 8;
  const depth      = opts.depth      ?? 8;
  const wallH      = opts.wallHeight ?? 3.4;
  const wallT      = opts.wallThick  ?? 0.35;
  const doorW      = opts.doorWidth  ?? 1.6;
  const doorH      = opts.doorHeight ?? 2.3;
  const facing     = opts.facing     ?? 0;     // door points along this yaw (0 = -Z)
  const groundY    = (opts.groundHeight ?? ((x, z) => 0))(cx, cz);

  const logMat   = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.95, flatShading: true });
  const trimMat  = new THREE.MeshStandardMaterial({ color: 0x4a2f17, roughness: 0.95, flatShading: true });
  const roofMat  = new THREE.MeshStandardMaterial({ color: 0x3a2114, roughness: 1.0,  flatShading: true });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85, flatShading: true });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 1.0,  flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd180, emissive: 0xffaa55, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.1 });
  const beddingMat = new THREE.MeshStandardMaterial({ color: 0x9c2a2a, roughness: 1, flatShading: true });

  // Build the cabin in a group so we can rotate it as one unit.
  const g = new THREE.Group();
  g.position.set(cx, groundY, cz);
  g.rotation.y = facing;
  scene.add(g);

  const colliders = [];

  // Floor — slightly inset so the wall planks read as resting on it.
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width - wallT, 0.15, depth - wallT),
    floorMat,
  );
  floor.position.set(0, 0.075, 0);
  floor.receiveShadow = true;
  g.add(floor); colliders.push(floor);

  // Helper to add a wall segment with logs (a stack of horizontal cylinders is
  // pretty but expensive; one box with flat shading reads fine and keeps the
  // poly count low).
  function addWall(localX, localZ, segW, segD, segH, isVertical = false) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(segW, segH, segD),
      logMat,
    );
    mesh.position.set(localX, segH / 2, localZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh); colliders.push(mesh);
    return mesh;
  }

  // Back wall (full width, opposite the door).
  addWall(0, depth/2 - wallT/2, width, wallT, wallH);
  // Left + right walls (full depth).
  addWall(-width/2 + wallT/2, 0, wallT, depth, wallH);
  addWall( width/2 - wallT/2, 0, wallT, depth, wallH);

  // Front wall is split around the doorway:
  //   [ LEFT |   DOOR GAP   | RIGHT ]   and a lintel above the door.
  const sideW = (width - doorW) / 2;
  addWall(-(width/2) + sideW/2, -depth/2 + wallT/2, sideW, wallT, wallH);
  addWall( (width/2) - sideW/2, -depth/2 + wallT/2, sideW, wallT, wallH);
  // Lintel above the door (visual only, not added to obstacles so the player
  // can always walk through the doorway).
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(doorW + 0.1, wallH - doorH, wallT),
    logMat,
  );
  lintel.position.set(0, doorH + (wallH - doorH) / 2, -depth/2 + wallT/2);
  lintel.castShadow = true; lintel.receiveShadow = true;
  g.add(lintel); colliders.push(lintel);

  // Door frame trim around the doorway (cosmetic).
  const trimT = 0.08;
  const trimL = new THREE.Mesh(new THREE.BoxGeometry(trimT, doorH, wallT + 0.04), trimMat);
  trimL.position.set(-doorW/2, doorH/2, -depth/2 + wallT/2);
  const trimR = trimL.clone(); trimR.position.x = doorW/2;
  g.add(trimL, trimR); colliders.push(trimL, trimR);

  // The door itself — a single plank, swung open against the inside wall.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(doorW, doorH, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x5a3520, roughness: 0.9, flatShading: true }),
  );
  // Hinge on the right side, swung ~110° inward.
  const hinge = new THREE.Group();
  hinge.position.set(doorW/2, doorH/2, -depth/2 + wallT/2 + 0.05);
  door.position.set(-doorW/2, 0, 0);
  hinge.add(door);
  hinge.rotation.y = -1.9;
  g.add(hinge); colliders.push(door);

  // Windows on the left, right, and back walls — emissive glass so they look
  // lit from inside even at dusk.
  function addWindow(localX, localZ, rotY) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.0, 0.05),
      trimMat,
    );
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.8),
      glassMat,
    );
    frame.position.set(localX, 1.8, localZ);
    glass.position.set(localX, 1.8, localZ + (rotY === 0 ? 0.04 : -0.04));
    frame.rotation.y = rotY;
    glass.rotation.y = rotY + (rotY === 0 ? Math.PI : 0);
    g.add(frame, glass);
    colliders.push(frame);
  }
  addWindow(-width/2 + wallT/2 + 0.03,  depth/4, -Math.PI/2);
  addWindow( width/2 - wallT/2 - 0.03, -depth/4,  Math.PI/2);
  addWindow( 0, depth/2 - wallT/2 - 0.03, 0);

  // Pitched roof — two slanted planes meeting at a ridge.
  const roofOverhang = 0.6;
  const roofW = width  + roofOverhang * 2;
  const roofD = depth  + roofOverhang * 2;
  const roofH = 2.2;
  const slopeLen = Math.sqrt((roofD/2) ** 2 + roofH ** 2);
  const slopeAngle = Math.atan2(roofH, roofD/2);

  const roofGeo = new THREE.BoxGeometry(roofW, 0.12, slopeLen);
  const roofA = new THREE.Mesh(roofGeo, roofMat);
  const roofB = new THREE.Mesh(roofGeo, roofMat);
  roofA.position.set(0, wallH + roofH/2 - 0.05, -depth/4 + roofOverhang/4);
  roofA.rotation.x = -slopeAngle;
  roofB.position.set(0, wallH + roofH/2 - 0.05,  depth/4 - roofOverhang/4);
  roofB.rotation.x =  slopeAngle;
  roofA.castShadow = roofB.castShadow = true;
  roofA.receiveShadow = roofB.receiveShadow = true;
  g.add(roofA, roofB); colliders.push(roofA, roofB);

  // Triangular gable end caps so you can't see daylight through the eaves.
  function addGable(zSign) {
    const shape = new THREE.Shape();
    shape.moveTo(-width/2, 0);
    shape.lineTo( width/2, 0);
    shape.lineTo(0, roofH);
    shape.lineTo(-width/2, 0);
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, logMat);
    mesh.position.set(0, wallH, zSign * (depth/2 - wallT/2));
    mesh.rotation.y = zSign > 0 ? Math.PI : 0;
    mesh.castShadow = true;
    g.add(mesh); colliders.push(mesh);
  }
  addGable(-1); addGable( 1);

  // Stone chimney on the back-right corner.
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, wallH + roofH + 0.6, 0.9),
    stoneMat,
  );
  chimney.position.set(width/2 - 1.0, (wallH + roofH + 0.6) / 2, depth/2 - 1.0);
  chimney.castShadow = true; chimney.receiveShadow = true;
  g.add(chimney); colliders.push(chimney);

  // ----- Interior props -----
  // Bed against the back-left wall.
  const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 1.2), trimMat);
  bedFrame.position.set(-width/2 + 1.4, 0.35, depth/2 - 1.1);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.05), beddingMat);
  mattress.position.set(-width/2 + 1.4, 0.65, depth/2 - 1.1);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.9), new THREE.MeshStandardMaterial({ color: 0xeae0d0, roughness: 1, flatShading: true }));
  pillow.position.set(-width/2 + 0.5, 0.85, depth/2 - 1.1);
  bedFrame.castShadow = mattress.castShadow = pillow.castShadow = true;
  g.add(bedFrame, mattress, pillow);

  // Small table with a lantern — emissive + warm point light gives the cabin
  // an inviting interior glow.
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), trimMat);
  tableTop.position.set(width/2 - 1.4, 0.95, -depth/2 + 1.5);
  const legGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
  for (const [sx, sz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) {
    const leg = new THREE.Mesh(legGeo, trimMat);
    leg.position.set(width/2 - 1.4 + sx, 0.45, -depth/2 + 1.5 + sz);
    g.add(leg);
  }
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.5, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb060, emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.6 }),
  );
  lantern.position.set(width/2 - 1.4, 1.26, -depth/2 + 1.5);
  const lanternLight = new THREE.PointLight(0xffb070, 1.1, 14, 1.6);
  lanternLight.position.copy(lantern.position).add(new THREE.Vector3(0, 0.15, 0));
  g.add(tableTop, lantern, lanternLight);

  // ----- Obstacles for the colliding walls. Coordinates are world-space and
  // account for the cabin's rotation, so the AABB walls always line up with
  // the visible geometry.
  const obstacles = [];
  function pushWallAABB(localX, localZ, segW, segD) {
    const c = Math.cos(facing), s = Math.sin(facing);
    const wx = cx + (localX * c + localZ * s);
    const wz = cz + (-localX * s + localZ * c);
    // Keep AABB axis-aligned by using the larger of the two extents on each
    // axis when the cabin is rotated 90° increments. For arbitrary angles we
    // pick whichever footprint is larger so the wall isn't passable.
    const halfW = Math.abs(segW * c) / 2 + Math.abs(segD * s) / 2;
    const halfD = Math.abs(segW * s) / 2 + Math.abs(segD * c) / 2;
    obstacles.push({ minX: wx - halfW, maxX: wx + halfW, minZ: wz - halfD, maxZ: wz + halfD });
  }
  pushWallAABB(0,                       depth/2 - wallT/2, width, wallT);  // back
  pushWallAABB(-width/2 + wallT/2,      0,                 wallT, depth);  // left
  pushWallAABB( width/2 - wallT/2,      0,                 wallT, depth);  // right
  pushWallAABB(-(width/2) + sideW/2,   -depth/2 + wallT/2, sideW, wallT);  // front-left
  pushWallAABB( (width/2) - sideW/2,   -depth/2 + wallT/2, sideW, wallT);  // front-right
  // Chimney
  pushWallAABB( width/2 - 1.0,          depth/2 - 1.0,     0.9,  0.9);

  // Spawn anchors in world space. `facing` is the yaw (around Y) so the
  // caller can rotate the player's camera to look out through the doorway.
  const spawnInside = {
    x: cx + Math.sin(facing) * (depth/4),
    z: cz + Math.cos(facing) * (depth/4),
    facing,
  };
  const doorOutside = {
    x: cx - Math.sin(facing) * (depth/2 + 2),
    z: cz - Math.cos(facing) * (depth/2 + 2),
    facing,
  };

  return { obstacles, colliders, group: g, spawnInside, doorOutside, facing };
}

// ---------------------------------------------------------------------------
//  CAMP PROPS  --  campfires, tents, log seats, lantern posts, supply crates.
//  Scattered around a central anchor point. Pushes obstacles for solid props
//  and `tickables` for animated ones (campfire flicker).
// ---------------------------------------------------------------------------
export function addCampProps(scene, around, opts = {}) {
  const rng         = opts.rng         ?? Math.random;
  const count       = opts.count       ?? 9;
  const radius      = opts.radius      ?? 16;
  const inner       = opts.inner       ?? 7;     // keep props clear of the cabin
  const groundFn    = opts.groundHeight ?? ((x, z) => 0);
  const obstacles   = opts.obstacles;            // pushed into when given
  const tickables   = opts.tickables;            // pushed into when given
  const colliders   = opts.colliders;
  const avoid       = opts.avoid       ?? [];    // array of {x,z,r} to skip

  const types = ['campfire', 'tent', 'log', 'log', 'crate', 'lantern', 'logpile'];
  let placedCampfire = 0;

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const r = inner + rng() * (radius - inner);
    const x = around.x + Math.cos(a) * r;
    const z = around.z + Math.sin(a) * r;

    // Don't drop a prop on top of an existing one.
    if (avoid.some(v => (x - v.x) ** 2 + (z - v.z) ** 2 < (v.r ?? 2) ** 2)) continue;

    let kind = types[Math.floor(rng() * types.length)];
    // Guarantee at least one campfire near the cabin.
    if (i === 0 && placedCampfire === 0) kind = 'campfire';
    if (kind === 'campfire' && placedCampfire >= 2) kind = 'log';

    if (kind === 'campfire') {
      placedCampfire++;
      const cf = createCampfire(scene, x, groundFn(x, z), z);
      if (tickables) tickables.push(cf);
      avoid.push({ x, z, r: 3 });
    } else if (kind === 'tent') {
      addTent(scene, x, z, groundFn(x, z), rng);
      if (obstacles) obstacles.push({ minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.4, maxZ: z + 1.4 });
      avoid.push({ x, z, r: 3.5 });
    } else if (kind === 'log') {
      addLogSeat(scene, x, z, groundFn(x, z), rng);
      avoid.push({ x, z, r: 2 });
    } else if (kind === 'crate') {
      const m = addSupplyCrate(scene, x, z, groundFn(x, z), rng);
      if (obstacles) obstacles.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
      if (colliders) colliders.push(m);
      avoid.push({ x, z, r: 1.5 });
    } else if (kind === 'lantern') {
      addLanternPost(scene, x, z, groundFn(x, z));
      avoid.push({ x, z, r: 1.2 });
    } else if (kind === 'logpile') {
      addLogPile(scene, x, z, groundFn(x, z), rng);
      if (obstacles) obstacles.push({ minX: x - 1.0, maxX: x + 1.0, minZ: z - 0.6, maxZ: z + 0.6 });
      avoid.push({ x, z, r: 2 });
    }
  }
}

const _stoneMat = new THREE.MeshStandardMaterial({ color: 0x55524e, roughness: 1, flatShading: true });
const _logMat   = new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 1, flatShading: true });
const _flameMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5e1a, emissiveIntensity: 2.4, roughness: 0.4 });

export function createCampfire(scene, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  scene.add(g);

  // Ring of stones around the pit.
  const stoneCount = 7;
  for (let i = 0; i < stoneCount; i++) {
    const a = (i / stoneCount) * Math.PI * 2;
    const sx = Math.cos(a) * 0.85;
    const sz = Math.sin(a) * 0.85;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + Math.random() * 0.1, 0), _stoneMat);
    stone.position.set(sx, 0.18, sz);
    stone.rotation.set(Math.random(), Math.random(), Math.random());
    stone.castShadow = true; stone.receiveShadow = true;
    g.add(stone);
  }

  // Crossed logs.
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), _logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.18 + (i % 2) * 0.1;
    log.castShadow = true;
    g.add(log);
  }

  // Flame — a small upward cone with strong emissive so bloom catches it.
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.1, 6),
    _flameMat.clone(),
  );
  flame.position.y = 0.85;
  g.add(flame);

  // Warm point light to spill onto nearby props.
  const light = new THREE.PointLight(0xff8a3a, 1.6, 10, 1.8);
  light.position.set(0, 1.0, 0);
  g.add(light);

  // Tickable: gentle flicker + a bit of vertical wobble on the flame.
  let t = Math.random() * 10;
  return {
    tick(dt) {
      t += dt;
      const flicker = 1.0 + Math.sin(t * 9.0) * 0.18 + (Math.random() - 0.5) * 0.18;
      light.intensity = 1.5 * flicker;
      flame.scale.set(0.9 + flicker * 0.15, 0.85 + flicker * 0.2, 0.9 + flicker * 0.15);
      flame.material.emissiveIntensity = 2.0 + flicker * 0.6;
    },
  };
}

function addTent(scene, x, z, y, rng) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rng() * Math.PI * 2;
  scene.add(g);

  const fabricMat = new THREE.MeshStandardMaterial({
    color: rng() < 0.5 ? 0x9a4a2a : 0x4a6a3a,
    roughness: 1.0,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  // Pyramid body.
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.0, 4), fabricMat);
  body.position.y = 1.0;
  body.rotation.y = Math.PI / 4;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // A tied-back triangular flap so the tent reads as openable.
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-0.4, 0); flapShape.lineTo(0.4, 0); flapShape.lineTo(0, 1.4); flapShape.lineTo(-0.4, 0);
  const flap = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), fabricMat);
  flap.position.set(0.6, 0, 0.05);
  flap.rotation.y = -0.4;
  g.add(flap);

  // Tent peg + guy line (just two crossed boxes for cheap detail).
  const peg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), _logMat);
  peg.position.set(2.0, 0.15, 0);
  g.add(peg);
}

function addLogSeat(scene, x, z, y, rng) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rng() * Math.PI * 2;
  scene.add(g);

  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 1.8, 8),
    _logMat,
  );
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.32;
  log.castShadow = true; log.receiveShadow = true;
  g.add(log);
}

function addSupplyCrate(scene, x, z, y, rng) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rng() * Math.PI * 2;
  scene.add(g);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6e4a26, roughness: 0.95, flatShading: true });
  const trimMat  = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.95, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.0), crateMat);
  body.position.y = 0.45;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // Plank trim around the top + bottom edges so it doesn't read as a flat box.
  for (const sy of [0.06, 0.84]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 1.05), trimMat);
    trim.position.y = sy;
    g.add(trim);
  }
  return body;
}

function addLanternPost(scene, x, z, y) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  scene.add(g);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), _logMat);
  post.position.y = 1.2;
  post.castShadow = true;
  g.add(post);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 4), _logMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.2, 2.2, 0);
  g.add(arm);

  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.4, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb060, emissiveIntensity: 1.4, roughness: 0.5, metalness: 0.6 }),
  );
  lantern.position.set(0.4, 2.05, 0);
  g.add(lantern);

  const light = new THREE.PointLight(0xffb060, 0.7, 9, 1.8);
  light.position.set(0.4, 2.0, 0);
  g.add(light);
}

function addLogPile(scene, x, z, y, rng) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rng() * Math.PI * 2;
  scene.add(g);

  const positions = [
    [-0.4, 0.18, 0], [0.4, 0.18, 0],
    [-0.4, 0.55, 0], [0.4, 0.55, 0],
    [0,    0.92, 0],
  ];
  for (const [px, py, pz] of positions) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 8), _logMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(px, py, pz);
    log.castShadow = true; log.receiveShadow = true;
    g.add(log);
  }
}
