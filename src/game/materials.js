import * as THREE from "three";

/**
 * Dim studio with neutral soft boxes: gives glass the long vertical highlights of a product shot.
 * Kept white on purpose; tinted boxes show up as coloured reflections and shift the liquid hues.
 */
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(24, 14, 24),
    new THREE.MeshBasicMaterial({ color: 0x140e0a, side: THREE.BackSide })
  );
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ color: 0x2c2926 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -6.9;
  env.add(floor);

  const box = (w, h, intensity, position, lookAt, tint = 0xffffff) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    mesh.position.copy(position);
    mesh.lookAt(lookAt);
    env.add(mesh);
  };
  const center = new THREE.Vector3(0, 0, 0);
  box(9, 5, 1.4, new THREE.Vector3(0, 6.8, 1), center, 0xfff8f0);
  box(1.6, 9, 2.6, new THREE.Vector3(-10, 1.5, 4), center, 0xfff4ea);
  box(1.2, 9, 1.8, new THREE.Vector3(10, 1.5, 2), center, 0xfff4ea);
  box(6, 2.4, 1, new THREE.Vector3(1, 2, 11.5), center, 0xffffff);
  box(4, 7, 0.9, new THREE.Vector3(-3, 1, -11.5), center, 0xffffff);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    obj.material.dispose();
  });
  return texture;
}

/**
 * Thin clear glass. Alpha follows Fresnel so rims and silhouettes read solid while the
 * faces stay clear; reflections are added unattenuated (premultiplied blending).
 */
export function createGlassMaterial(side) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf3f8f6,
    roughness: 0.035,
    metalness: 0,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 3.2,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float baseMask;\nvarying float vBaseMask;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBaseMask = baseMask;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBaseMask;")
      .replace(
        "#include <opaque_fragment>",
        `
        float glassNV = saturate(abs(dot(normal, normalize(vViewPosition))));
        float glassFres = pow(1.0 - glassNV, 3.0);
        float glassAlpha = clamp(0.012 + glassFres * 0.5, 0.0, 0.85);
        vec3 glassBody = vec3(0.02, 0.032, 0.03) + totalDiffuse * 0.03;
        // The thick base reads as solid, faintly green glass instead of vanishing into the bench.
        glassAlpha = max(glassAlpha, vBaseMask * (0.05 + 0.4 * glassFres));
        glassBody = mix(glassBody, vec3(0.45, 0.58, 0.54) * (0.25 + totalDiffuse * 0.2), vBaseMask * 0.5);
        // Clamp below the bloom threshold: brighter highlights bloomed into a white smear over the glass.
        gl_FragColor = vec4(glassBody * glassAlpha + min(totalSpecular * 1.2, vec3(0.85)), glassAlpha);
        `
      )
      .replace("#include <premultiplied_alpha_fragment>", "");
  };
  material.customProgramCacheKey = () => "pigment-glass";
  return material;
}

const NOISE_GLSL = `
float liqHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float liqNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(liqHash(i), liqHash(i + vec3(1, 0, 0)), f.x), mix(liqHash(i + vec3(0, 1, 0)), liqHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(liqHash(i + vec3(0, 0, 1)), liqHash(i + vec3(1, 0, 1)), f.x), mix(liqHash(i + vec3(0, 1, 1)), liqHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
float liqFbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * liqNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
`;

/**
 * Liquid body. The mesh is the whole glass cavity; fragments above the world-space surface plane are
 * discarded and the back faces that remain are shaded (and depth-written) as the flat surface,
 * so the liquid stays level however the glass tilts.
 */
export function createLiquidMaterial() {
  const uniforms = {
    uPlane: { value: new THREE.Vector4(0, 1, 0, 0) },
    uImpact: { value: new THREE.Vector3(0, -10, 0) },
    uRipple: { value: 0 },
    uInflow: { value: 0 },
    uInflowColor: { value: new THREE.Color() },
    uTime: { value: 0 },
    uGlow: { value: 0.24 },
    uLocal: { value: new THREE.Matrix4() },
    uShape: { value: new THREE.Vector4(0.3, 0.3, 1, 1) },
    uShape2: { value: new THREE.Vector2(0, 0.03) },
    uAxis: { value: new THREE.Vector2() },
    uSwirlAngle: { value: 0 },
    uSwirlRate: { value: 0 },
    uFoam: { value: 0 },
    uSparkle: { value: 0.6 }
  };
  // Coloured water, not paint: light passes through (transmission) and is absorbed with depth
  // (attenuation), so thin edges read light and the middle rich. Values are refreshed every frame
  // from the game config; transmission must stay above 0 or the shader would be rebuilt.
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.04,
    metalness: 0,
    ior: 1.33,
    transmission: 0.85,
    thickness: 0.5,
    attenuationColor: 0xffffff,
    attenuationDistance: 0.35,
    specularIntensity: 1,
    envMapIntensity: 0.8,
    side: THREE.DoubleSide
  });
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLiqWorld;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvLiqWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vLiqWorld;
        #ifndef USE_TRANSMISSION
        uniform mat4 projectionMatrix; // the transmission chunk already declares it
        #endif
        uniform vec4 uPlane;
        uniform vec3 uImpact;
        uniform float uRipple;
        uniform float uInflow;
        uniform vec3 uInflowColor;
        uniform float uTime;
        uniform float uGlow;
        uniform mat4 uLocal;
        uniform vec4 uShape;
        uniform vec2 uShape2;
        uniform vec2 uAxis;
        uniform float uSwirlAngle;
        uniform float uSwirlRate;
        uniform float uFoam;
        uniform float uSparkle;
        ${NOISE_GLSL}`
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (dot(vLiqWorld, uPlane.xyz) > uPlane.w) discard;
        vec3 liqPos = vLiqWorld;
        float liqWall = 1.0;
        if (!gl_FrontFacing) {
          vec3 rd = normalize(vLiqWorld - cameraPosition);
          float denom = dot(rd, uPlane.xyz);
          float t = (uPlane.w - dot(cameraPosition, uPlane.xyz)) / (abs(denom) < 1e-4 ? -1e-4 : denom);
          liqPos = cameraPosition + rd * max(t, 0.0);
          // Only a surface point inside the glass is real; otherwise the ray went under the surface
          // through the near wall, and that wall must show instead.
          vec3 liqLocal = (uLocal * vec4(liqPos, 1.0)).xyz;
          float liqT = clamp(liqLocal.y / uShape.z, 0.0, 1.0);
          float liqR = uShape.x + (uShape.y - uShape.x) * pow(liqT, uShape.w) + uShape2.x * sin(PI * liqT) - uShape2.y;
          if (length(liqLocal.xz) > liqR + 0.004) discard;
          liqWall = length(vLiqWorld - liqPos);
          vec4 liqClip = projectionMatrix * viewMatrix * vec4(liqPos, 1.0);
          gl_FragDepth = clamp(liqClip.z / liqClip.w * 0.5 + 0.5, 0.0, 1.0);
        } else {
          gl_FragDepth = gl_FragCoord.z;
        }
        float liqDepth = uPlane.w - dot(liqPos, uPlane.xyz);
        vec2 liqDx = liqPos.xz - uImpact.xz;
        float liqImpactDist = length(liqDx) + 1e-4;
        // Swirl: sample the patterns in a frame that turns around the glass axis, faster near the
        // centre, which winds the plume into spiral arms.
        vec2 liqRel = liqPos.xz - uAxis;
        float liqAxisDist = length(liqRel);
        float liqTurn = uSwirlAngle * (0.6 + 1.6 * exp(-liqAxisDist * 7.0));
        float liqC = cos(liqTurn);
        float liqS = sin(liqTurn);
        vec3 liqSwirlPos = vec3(uAxis.x + liqC * liqRel.x - liqS * liqRel.y, liqPos.y, uAxis.y + liqS * liqRel.x + liqC * liqRel.y);
        vec2 liqSwirlDx = liqSwirlPos.xz - uImpact.xz;
        float liqSwirlImpact = length(liqSwirlDx) + 1e-4;
        float liqFoamMask = 0.0;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Incoming color billows down from the impact point with ragged edges, plus faint streaks.
        // Only a glass that is being poured into pays for it (uniform branches are coherent).
        float liqWarp = 0.5;
        if (uInflow > 0.002 || uFoam > 0.002) {
          vec3 liqFlow = vec3(liqSwirlPos.x * 3.2, liqSwirlPos.y * 1.6 + uTime * 0.55, liqSwirlPos.z * 3.2);
          liqWarp = liqFbm(liqFlow + vec3(0.0, 0.0, uTime * 0.2));
        }
        if (uInflow > 0.002) {
          float liqPlumeR = 0.1 + 0.3 * smoothstep(0.0, 0.6, liqDepth);
          float liqPlume = 1.0 - smoothstep(liqPlumeR * 0.25, liqPlumeR, liqSwirlImpact + (liqWarp - 0.5) * 0.45);
          float liqStreak = smoothstep(0.58, 0.72, liqFbm(vec3(liqSwirlPos.xz * 2.4, liqPos.y * 0.9 - uTime * 0.25).xzy));
          float liqMarble = clamp(liqPlume + liqStreak * 0.45, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uInflowColor, clamp(liqMarble * uInflow, 0.0, 0.92));
        }
        // Beer-Lambert-ish tint: the chord through the body is longest facing the viewer, and looking
        // down through the surface sees the full depth, so those read deeper and more saturated.
        float liqFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float liqThick = gl_FrontFacing ? liqFacing * liqFacing : 0.85;
        // Hue-preserving: darken and saturate instead of a per-channel power, which would turn yellow orange.
        float liqLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 liqDeep = max(mix(vec3(liqLuma), diffuseColor.rgb, 1.18), 0.0) * 0.8;
        diffuseColor.rgb = mix(diffuseColor.rgb * 1.06, liqDeep, liqThick);
        diffuseColor.rgb *= mix(1.0, 0.82, smoothstep(0.0, 0.8, liqDepth));
        // Foam: a bubbly patch around the impact and a ring against the glass, on the surface only.
        if (uFoam > 0.002) {
          float liqAtSurface = gl_FrontFacing ? 1.0 - smoothstep(0.0, 0.02, liqDepth) : 1.0;
          float liqRing = gl_FrontFacing ? 0.3 : 1.0 - smoothstep(0.0, 0.07, liqWall);
          float liqCells = smoothstep(0.35, 0.75, liqNoise(vec3(liqSwirlPos.xz * 60.0, uTime * 0.4)));
          float liqFoamShape = exp(-liqSwirlImpact * liqSwirlImpact * 9.0) + liqRing * 0.6 + smoothstep(0.55, 0.8, liqWarp) * 0.4;
          liqFoamMask = clamp(liqFoamShape * uFoam * liqAtSurface, 0.0, 1.0) * (0.45 + 0.55 * liqCells);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.0), 0.8), liqFoamMask);
        }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, liqFoamMask);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        if (!gl_FrontFacing) {
          vec3 liqN = uPlane.xyz;
          float wave = cos(liqImpactDist * 62.0 - uTime * 15.0) * exp(-liqImpactDist * 6.0) * uRipple;
          liqN.xz += (liqDx / liqImpactDist) * wave * 0.3;
          vec3 jitterP = vec3(liqPos.xz * 16.0, uTime * 1.6);
          liqN.xz += (vec2(liqNoise(jitterP), liqNoise(jitterP + 5.3)) - 0.5) * (0.006 + 0.08 * uRipple + 0.12 * liqFoamMask);
          // Spiral waves while the liquid spins.
          float liqArm = sin(liqAxisDist * 38.0 - atan(liqRel.y, liqRel.x) * 2.0 - uTime * 7.0);
          liqN.xz += vec2(-liqRel.y, liqRel.x) / (liqAxisDist + 1e-3) * liqArm * uSwirlRate * 0.05;
          normal = normalize((viewMatrix * vec4(normalize(liqN), 0.0)).xyz);
          nonPerturbedNormal = normal;
        }`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float liqNV = saturate(dot(normal, normalize(vViewPosition)));
        float liqRim = gl_FrontFacing ? pow(1.0 - liqNV, 2.0) : 0.0;
        float liqPulse = 1.0 + 0.18 * sin(uTime * 1.9 + liqPos.y * 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * uGlow * liqPulse * (0.5 + liqRim);
        // Motes of light drifting up through the potion.
        vec3 liqSparkP = liqSwirlPos * 34.0 + vec3(0.0, -uTime * 1.3, 0.0);
        // One round mote per lattice cell at a random spot (thresholded value noise would look square).
        vec3 liqCell = floor(liqSparkP);
        vec3 liqJit = vec3(liqHash(liqCell), liqHash(liqCell + 7.1), liqHash(liqCell + 3.7));
        float liqMote = 1.0 - smoothstep(0.0, 0.11, length(fract(liqSparkP) - (0.2 + liqJit * 0.6)));
        float liqSpark = step(0.8, liqHash(liqCell + 1.3)) * liqMote * (0.55 + 0.45 * sin(uTime * 7.0 + liqJit.x * 40.0));
        totalEmissiveRadiance += mix(diffuseColor.rgb, vec3(1.0), 0.55) * liqSpark * uSparkle * (1.0 - liqFoamMask) * 1.6;
`
      )
      .replace(
        "#include <opaque_fragment>",
        // Keep the liquid under the bloom threshold, scaling the colour as a whole so a hot highlight
        // stays tinted instead of clipping to white (it bloomed into a white column over the glass).
        `outgoingLight *= min(1.0, 0.95 / max(max(outgoingLight.r, outgoingLight.g), max(outgoingLight.b, 1e-4)));
        #include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => "pigment-liquid";
  return material;
}

/** Pour stream and droplets: same glossy liquid, no clipping. */
export function createStreamMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.075,
    metalness: 0,
    ior: 1.33,
    clearcoat: 0,
    envMapIntensity: 1.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.05
  });
}

/** Soft radial blot used for contact shadows and glows. */
export function createBlotTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
