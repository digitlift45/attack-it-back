import * as THREE from 'three';

/**
 * Stylized character — smooth limbs (cylinders), rounded head (sphere), proper
 * proportions. Group origin sits at the feet (y = 0), eyes at y ≈ 1.78.
 *
 * userData.hipL/hipR -> rotate around X to swing legs (walk cycle)
 * userData.shoulderL/shoulderR -> arm pivots for swing animation
 * userData.head -> head group (subtle look-at idle)
 */
export function buildCharacter({ includeHead = true, includeArms = true, includeTorso = true, wearShades = false, wearHat = false } = {}) {
  const g = new THREE.Group();

  const M = (color, opts = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.7, metalness: 0.0, flatShading: true, ...opts,
  });
  const skinMat   = M(0xeec39a);
  const hairMat   = M(0xc9943a, { roughness: 0.55 });
  const shirtMat  = M(0x14171f, { roughness: 0.85 });
  const beltMat   = M(0x2a2e36, { roughness: 0.5, metalness: 0.2 });
  const pantsMat  = M(0x556b2c, { roughness: 0.85 });
  const bootMat   = M(0x141008, { roughness: 0.85 });
  const eyeWhite  = M(0xffffff, { roughness: 0.4 });
  const pupilMat  = M(0x101418);
  const mouthMat  = M(0x6b1a1a);
  const gloveMat  = M(0x141414, { roughness: 0.65 });
  const shadeMat  = M(0x000000, { roughness: 0.2, metalness: 0.8 });
  const hatMat    = M(0x222a1f, { roughness: 0.85 });

  // ---------- LEGS ----------
  // Hip pivots so we can swing the legs.
  const HIP_Y   = 0.95;
  const LEG_LEN = 0.85;

  function makeLeg() {
    const hip = new THREE.Group();
    // Thigh + shin as one taper for visual smoothness
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.10, LEG_LEN, 6),
      pantsMat,
    );
    leg.position.y = -LEG_LEN / 2;
    leg.castShadow = true; leg.receiveShadow = true;

    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.115, 6, 5), pantsMat);
    knee.position.y = -LEG_LEN * 0.5;

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.30), bootMat);
    boot.position.set(0, -LEG_LEN - 0.02, 0.05);
    boot.castShadow = true; boot.receiveShadow = true;

    hip.add(leg, knee, boot);
    return hip;
  }
  const hipL = makeLeg(); hipL.position.set(-0.13, HIP_Y, 0);
  const hipR = makeLeg(); hipR.position.set( 0.13, HIP_Y, 0);
  g.add(hipL, hipR);

  // ---------- TORSO ----------
  // Skipped in first-person mode so the camera doesn't peer into the player's
  // belly when they look down.
  if (includeTorso) {
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.26, 0.65, 8),
      shirtMat,
    );
    torso.position.set(0, 1.30, 0);
    torso.scale.z = 0.78;       // chest narrower front-to-back
    torso.castShadow = true; torso.receiveShadow = true;
    g.add(torso);

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.30, 0.07, 8),
      beltMat,
    );
    belt.position.set(0, 0.95, 0);
    belt.scale.z = 0.78;
    g.add(belt);
  }

  // ---------- ARMS ----------
  let shoulderL, shoulderR;
  if (includeArms) {
    function makeArm() {
      const shoulder = new THREE.Group();
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.10, 0.20, 6),
        shirtMat,
      );
      sleeve.position.y = -0.10;
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.075, 0.46, 6),
        skinMat,
      );
      arm.position.y = -0.43;
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), skinMat);
      elbow.position.y = -0.66;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 5), gloveMat);
      hand.position.y = -0.78;
      hand.scale.z = 1.2;
      shoulder.add(sleeve, arm, elbow, hand);
      shoulder.castShadow = true;
      return shoulder;
    }
    shoulderL = makeArm(); shoulderL.position.set(-0.36, 1.55, 0);
    shoulderR = makeArm(); shoulderR.position.set( 0.36, 1.55, 0);
    g.add(shoulderL, shoulderR);
  }

  // ---------- HEAD ----------
  let headGroup = null;
  if (includeHead) {
    headGroup = new THREE.Group();
    headGroup.position.set(0, 1.78, 0);

    // Skull (sphere) + jaw extension for a slightly squared jaw
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), skinMat);
    skull.castShadow = true;
    headGroup.add(skull);

    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      skinMat,
    );
    jaw.position.set(0, -0.06, 0.02);
    jaw.scale.set(0.95, 0.55, 0.85);
    headGroup.add(jaw);

    // Neck (cylinder)
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.085, 0.12, 6),
      skinMat,
    );
    neck.position.set(0, -0.18, 0);
    headGroup.add(neck);

    // Hair: cap on top + a little fringe in front
    if (!wearHat) {
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.205, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairMat,
      );
      hairCap.position.y = 0.005;
      headGroup.add(hairCap);

      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.12), hairMat);
      fringe.position.set(0, 0.12, 0.16);
      fringe.rotation.x = -0.3;
      headGroup.add(fringe);
    } else {
      // Tactical Helmet
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.21, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.65),
        hatMat
      );
      helmet.position.y = 0.02;
      
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.16), hatMat);
      visor.position.set(0, 0.12, 0.18);
      visor.rotation.x = -0.15;
      
      headGroup.add(helmet, visor);
    }

    // Eyes
    if (!wearShades) {
      function eye(xOffset) {
        const grp = new THREE.Group();
        grp.position.set(xOffset, 0.02, 0.18);
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeWhite);
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), pupilMat);
        p.position.z = 0.018;
        grp.add(w, p);
        return grp;
      }
      headGroup.add(eye(-0.07), eye(0.07));
    } else {
      // Sunglasses
      const shadeBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.04), shadeMat);
      shadeBar.position.set(0, 0.04, 0.19);
      
      const shadeArmL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.20), shadeMat);
      shadeArmL.position.set(-0.18, 0.04, 0.08);
      const shadeArmR = shadeArmL.clone(); shadeArmR.position.x = 0.18;
      
      headGroup.add(shadeBar, shadeArmL, shadeArmR);
    }

    // Mouth — tiny dark slit
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.014, 0.02),
      mouthMat,
    );
    mouth.position.set(0, -0.10, 0.18);
    headGroup.add(mouth);

    g.add(headGroup);
  }

  g.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  g.userData.hipL = hipL;
  g.userData.hipR = hipR;
  g.userData.shoulderL = shoulderL;
  g.userData.shoulderR = shoulderR;
  g.userData.head = headGroup;

  return g;
}
