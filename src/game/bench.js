import * as THREE from "three";
import gsap from "gsap";
import {
  SHAPES,
  cavityOf,
  scaleSpec,
  capacityAt,
  glassProfile,
  innerRadius,
  liquidProfile,
  solveLevel,
  outerRadius
} from "./vessels.js";
import {
  createBlotTexture,
  createGlassMaterial,
  createLiquidMaterial,
  createStreamMaterial,
  createStudioEnvironment
} from "./materials.js";
import { Droplets, PourStream } from "./stream.js";
import { BENCH_BACK, createWorkshop, runeTexture } from "./workshop.js";
import { Sparks, SurfaceBubbles, Vapor } from "./effects.js";
import { emptyMix, matchPercent, mixRgb, pigmentRgb } from "./mix.js";
import { SUPPLY } from "./levels.js";
import { levelOf } from "./session.js";
import { defaultGameConfig } from "../gameConfig/defaultGameConfig.js";

const DEG = Math.PI / 180;
const SOURCE_SHAPES = ["tumbler", "highball", "tulip", "rocks"];
const STEP = 1 / 120;
const LIGHT_DIR = new THREE.Vector2(-0.55, -0.5).normalize();
const TAG_LIFT = 0.3;
// Live tuning values; the Scene Debugger edits this object in place.
const cfg = defaultGameConfig.components;
const referenceZ = () => BENCH_BACK + cfg.goalShelf.distanceFromWall;

const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function srgbColor(rgb, target = new THREE.Color()) {
  return target.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

/** Sources carry SUPPLY of the goal volume and grow (uniformly) past sources.startFill. */
function sourceScale(shape, goalVolume) {
  const room = cavityOf(SHAPES[shape]).capacity * cfg.sources.startFill;
  return Math.max(1, Math.cbrt((goalVolume * SUPPLY) / room) * 1.02);
}

export class MixingBench {
  constructor(scene, camera, canvas, renderer, hooks) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.hooks = hooks;
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.environment = createStudioEnvironment(renderer);

    this.glassBack = createGlassMaterial(THREE.BackSide);
    this.glassFront = createGlassMaterial(THREE.FrontSide);
    this.blot = createBlotTexture();
    this.dropMaterial = createStreamMaterial();
    this.dropMaterial.emissive.set(0x000000);
    this.droplets = new Droplets(scene, this.dropMaterial);
    this.bubbles = new SurfaceBubbles(scene);
    this.vapor = new Vapor(scene);
    this.sparks = new Sparks(scene);
    this.runes = runeTexture();
    this.addStudio();

    this.vessels = [];
    this.sources = [];
    this.target = null;
    this.active = null;
    this.held = false;
    this.locked = true;
    this.finished = false;
    this.settle = 0;
    this.accumulator = 0;
    this.pourStrength = 0;
    this.time = 0;
    this.needsFrame = true;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.tmpColor = new THREE.Color();

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  /** How full the mixer is relative to its fill line (0..1). */
  get fillRatio() {
    return this.target ? Math.min(1, this.target.volume / this.goalVolume) : 0;
  }

  get busy() {
    return this.finished;
  }

  /** Scales every environment-lit material's reflections; re-applied after a level rebuild. */
  setEnvironmentIntensity(k) {
    if (k === this.envIntensity && !this.envDirty) return;
    this.envIntensity = k;
    this.envDirty = false;
    this.scene.traverse((obj) => {
      const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of materials) {
        if (m.envMapIntensity === undefined) continue;
        m.userData.baseEnvIntensity ??= m.envMapIntensity;
        m.envMapIntensity = m.userData.baseEnvIntensity * k;
      }
    });
  }

  addStudio() {
    this.workshop = createWorkshop();
    this.scene.add(this.workshop.group);
  }

  /** The goal, shown as a sample glass of the target color with a pulsing glow around it. */
  buildReference(rgb) {
    const v = this.buildVessel("sample", null);
    srgbColor(rgb, v.color);
    v.liquidMaterial.color.copy(v.color);
    v.volume = v.cavity.capacity * 0.68;
    v.home.set(0, 1.6, referenceZ());
    v.scale = cfg.goalShelf.glassScalePortrait;
    v.group.scale.setScalar(v.scale);
    v.group.rotation.x = cfg.goalShelf.tilt * DEG;
    v.shadow.visible = false;
    v.contact.visible = false;
    // Oak wall shelf on iron brackets, reaching back to the wall. Unit-sized parts are stretched in
    // layoutShelf() so the shelf fits whatever wall distance and scale the config asks for.
    // The shelf has its own group so the glass can drop onto it and fly off without taking it along.
    const shelfGroup = new THREE.Group();
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.07, 1),
      new THREE.MeshLambertMaterial({ color: 0x7a4e2a, emissive: 0x1a0c04 })
    );
    const iron = new THREE.MeshLambertMaterial({ color: 0x2a2624 });
    const brackets = [-0.8, 0.8].map((x) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), iron);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), iron);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), iron);
      strut.rotation.x = 0.55;
      shelfGroup.add(arm, post, strut);
      return { x, arm, post, strut };
    });
    shelfGroup.add(plank);
    this.group.add(shelfGroup);
    v.shelf = { group: shelfGroup, plank, brackets };
    v.drop = 0; // world units the glass hangs above its shelf spot (enter / exit animations)

    const glowColor = v.color.clone();
    const tint = (extra = {}) => ({ color: glowColor, transparent: true, depthWrite: false, ...extra });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(tint({ map: this.blot })));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.006;
    pool.scale.setScalar(1.6);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(v.spec.rBottom + 0.1, 0.014, 8, 64),
      new THREE.MeshBasicMaterial(tint())
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012;
    // Colored Fresnel shell just outside the glass: reads as a glowing outline on any background.
    const rim = new THREE.Mesh(
      v.group.children[1].geometry,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: glowColor }, uStrength: { value: 0 } },
        vertexShader: `
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position * vec3(1.07, 1.02, 1.07), 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uStrength;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
            gl_FragColor = vec4(uColor, f * uStrength);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false
      })
    );
    rim.renderOrder = 6;
    const sparkCount = 26;
    const sparkSeeds = [];
    for (let i = 0; i < sparkCount; i++) {
      sparkSeeds.push({ a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 0.25, t: Math.random() });
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
    const sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial(
        tint({ map: this.blot, color: glowColor.clone().lerp(new THREE.Color(1, 1, 1), 0.35), size: 0.06 })
      )
    );
    sparks.frustumCulled = false;
    const runes = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(tint({ map: this.runes, blending: THREE.AdditiveBlending }))
    );
    runes.rotation.x = -Math.PI / 2;
    runes.position.y = 0.01;
    runes.scale.setScalar(1.25);
    v.group.add(pool, ring, sparks, rim, runes);
    v.glow = { pool, ring, sparks, rim, runes, sparkSeeds };
    return v;
  }

  animateGlow(v) {
    const g = v.glow;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
    const k = cfg.goalShelf.glow;
    // Lean the glass and its shelf towards the player so the liquid inside shows.
    v.group.rotation.x = cfg.goalShelf.tilt * DEG;
    g.pool.material.opacity = (0.4 + pulse * 0.2) * k;
    g.ring.material.opacity = (0.6 + pulse * 0.4) * k;
    g.rim.material.uniforms.uStrength.value = (0.7 + pulse * 0.5) * k;
    g.sparks.material.opacity = k;
    g.runes.rotation.z = this.time * 0.35;
    g.runes.material.opacity = (0.45 + pulse * 0.35) * k;
    g.ring.scale.setScalar(1 + pulse * 0.06);
    const pos = g.sparks.geometry.attributes.position;
    g.sparkSeeds.forEach((s, i) => {
      const t = (s.t + this.time * 0.22) % 1;
      const a = s.a + this.time * 0.6;
      pos.setXYZ(i, Math.cos(a) * s.r, 0.05 + t * (v.spec.height + 0.5), Math.sin(a) * s.r);
    });
    pos.needsUpdate = true;
  }

  show(session) {
    this.session = session;
    this.clearLevel();
    const level = levelOf(session);
    this.recipe = level.target;

    this.reference = this.buildReference(mixRgb(level.target));
    // The mixer's fill line sets the goal volume; every source then carries SUPPLY of it and grows
    // (uniformly) when that would fill it past sources.startFill.
    const mixer = cfg.mixer;
    this.target = this.buildVessel("mixer", null, THREE.MathUtils.clamp(mixer.scale, 0.3, 3));
    this.target.home.set(mixer.position.x, mixer.position.y, mixer.position.z);
    this.goalVolume = this.target.cavity.capacity * THREE.MathUtils.clamp(mixer.fillLevel, 0.1, 0.92);
    this.sources = level.sources.map((key, i) => {
      const shape = SOURCE_SHAPES[i % SOURCE_SHAPES.length];
      return this.buildVessel(shape, key, sourceScale(shape, this.goalVolume));
    });
    this.vessels = [this.target, this.reference, ...this.sources];

    // Sources stand on an arc in front of the mixer; the whole group can be offset.
    const group = cfg.sources;
    const count = this.sources.length;
    const spread = (group.spread > 0 ? group.spread : [0, 0, 26, 50, 62][count]) * DEG;
    const { x: cx, y: cy, z: cz } = group.position;
    const slots = this.sources.map((_, i) => (count > 1 ? -spread + (2 * spread * i) / (count - 1) : 0));
    // The middle of the arc stands right in front of the mixer, so a tall glass there covers it on
    // screen: the shortest glasses take the most central slots, the tall ones the ends.
    const byCentre = slots.map((a, i) => i).sort((i, j) => Math.abs(slots[i]) - Math.abs(slots[j]));
    const byHeight = [...this.sources].sort((p, q) => p.spec.height - q.spec.height);
    byCentre.forEach((slot, rank) => {
      const v = byHeight[rank];
      const a = slots[slot];
      v.home.set(cx + Math.sin(a) * group.arcWidth, cy, cz + Math.cos(a) * group.arcDepth);
      v.side = v.home.x < this.target.home.x - 0.01 ? -1 : 1;
    });

    for (const v of this.sources) {
      v.volume = this.goalVolume * SUPPLY;
      v.hover = this.hoverTilt(v);
      v.clearance = this.clearance(v);
    }
    this.framing = this.framingLayout();
    this.target.mix = emptyMix();
    this.target.volume = 0;
    this.addFillLine(this.target);

    for (const v of this.vessels) {
      v.group.position.copy(v.home);
      v.prevCenter.copy(v.home);
      this.group.add(v.group);
    }
    this.active = null;
    this.held = false;
    this.locked = false;
    this.transitioning = false;
    this.offstage = false;
    this.finished = false;
    this.settle = 0;
    this.lastPercent = -1;
    this.lastFill = -1;
    this.needsFrame = true;
    this.envDirty = true;
    this.updateVisuals(0);
    this.emitProgress();
  }

  /**
   * Sideways distance that takes `v` fully off-screen towards `side`; wide landscape screens need
   * much more than tall ones, so measure it with the camera.
   */
  offstageX(v, side) {
    const p = this.tmp;
    const r = v.spec.rTop * (v.scale || 1) + 0.1;
    for (let d = 3; d < 60; d += 0.5) {
      const x = v.home.x + side * (d - r);
      const low = p.set(x, v.home.y, v.home.z).project(this.camera).x;
      const high = p.set(x, v.home.y + v.spec.height * (v.scale || 1), v.home.z).project(this.camera).x;
      if (Math.min(side * low, side * high) > 1.05) return v.home.x + side * d;
    }
    return v.home.x + side * 60;
  }

  /** How high the goal glass must hang above its shelf to be out of sight. */
  offstageLift() {
    const r = this.reference;
    for (let d = 2; d < 60; d += 0.5) {
      if (this.tmp.set(r.home.x, r.home.y + d, r.home.z).project(this.camera).y > 1.1) return d;
    }
    return 60;
  }

  /** Put the level's glasses off-screen (sources to their side, mixer to the left, goal up high). */
  stageOut() {
    for (const v of this.sources) v.group.position.x = this.offstageX(v, v.side);
    this.target.group.position.x = this.offstageX(this.target, -1);
    this.reference.drop = this.offstageLift();
    this.offstage = true;
    this.locked = true;
    this.transitioning = true;
    this.syncReference();
  }

  /** Slide the glasses in, then drop the goal onto its shelf. Resolves when the level is playable. */
  enter() {
    this.stageOut();
    this.offstage = false;
    return new Promise((resolve) => {
      // One timeline: the goal drops onto its shelf while the glasses slide in, not after them.
      const tl = gsap.timeline({
        onComplete: () => {
          this.transitioning = false;
          this.locked = false;
          resolve();
        }
      });
      const slide = (v, at) => tl.to(v.group.position, { x: v.home.x, duration: 0.75, ease: "power3.out" }, at);
      slide(this.target, 0);
      this.sources.forEach((v, i) => slide(v, 0.08 + i * 0.06));
      tl.to(this.reference, { drop: 0, duration: 0.8, ease: "bounce.out" }, 0.05);
      this.hooks.onSlide?.();
    });
  }

  /** Sources and mixer slide off to the sides, the goal flies up. Resolves when all are gone. */
  exit() {
    this.locked = true;
    this.transitioning = true;
    this.held = false;
    return new Promise((resolve) => {
      const away = (v, x, delay) => gsap.to(v.group.position, { x, duration: 0.55, ease: "power2.in", delay });
      this.sources.forEach((v, i) => away(v, this.offstageX(v, v.side), i * 0.06));
      away(this.target, this.offstageX(this.target, 1), 0.1);
      this.hooks.onSlide?.();
      // A little hop first, then it shoots up (a back-in ease would dip it through the shelf).
      gsap
        .timeline({ delay: 0.05 })
        .to(this.reference, { drop: 0.25, duration: 0.14, ease: "power2.out" })
        .to(this.reference, { drop: this.offstageLift(), duration: 0.5, ease: "power3.in" });
      gsap.delayedCall(0.8, resolve);
    });
  }

  clearLevel() {
    this.droplets.clear();
    this.bubbles.clear();
    this.vapor.clear();
    this.sparks.clear();
    gsap.killTweensOf(this.vessels.flatMap((v) => [v, v.group.position]));
    for (const v of this.vessels) {
      if (v.shelf) {
        v.shelf.group.removeFromParent();
        v.shelf.group.traverse((obj) => obj.isMesh && obj.geometry.dispose());
      }
      v.group.removeFromParent();
      v.group.traverse((obj) => {
        if (obj.isMesh && obj.geometry) obj.geometry.dispose();
      });
      v.liquidMaterial.dispose();
      if (v.glow) {
        for (const part of [v.glow.pool, v.glow.ring, v.glow.sparks, v.glow.rim, v.glow.runes]) {
          part.material.dispose();
        }
        v.glow.sparks.geometry.dispose();
      }
      if (v.stream) {
        v.stream.dispose();
        v.stream.material.dispose();
      }
      v.shadow.removeFromParent();
      v.shadow.material.dispose();
      v.contact.removeFromParent();
      v.contact.material.dispose();
    }
    this.vessels = [];
    this.sources = [];
  }

  buildVessel(shapeName, key, scale = 1) {
    const spec = scaleSpec(SHAPES[shapeName], scale);
    const cavity = cavityOf(spec);
    const group = new THREE.Group();
    const glassGeometry = new THREE.LatheGeometry(glassProfile(spec), 48);
    // 1 at the foot of the glass, fading out below the inside floor: the glass shader tints that band
    // as thick glass. The floor itself stays clear, or it reads as a pale layer of liquid.
    const ys = glassGeometry.attributes.position;
    const baseMask = new Float32Array(ys.count);
    for (let i = 0; i < ys.count; i++)
      baseMask[i] = 1 - THREE.MathUtils.smoothstep(ys.getY(i), spec.base * 0.35, spec.base * 0.85);
    glassGeometry.setAttribute("baseMask", new THREE.BufferAttribute(baseMask, 1));
    const back = new THREE.Mesh(glassGeometry, this.glassBack);
    back.renderOrder = 2;
    const front = new THREE.Mesh(glassGeometry, this.glassFront);
    front.renderOrder = 4;
    const liquidMaterial = createLiquidMaterial();
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile(spec), 40), liquidMaterial);
    liquid.frustumCulled = false;
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.rTop + 0.12, spec.rBottom + 0.12, spec.height + 0.2, 12),
      hiddenMaterial
    );
    hit.position.y = spec.height / 2;
    group.add(liquid, back, front, hit);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.blot, color: 0x1c140c, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    // Tight dark contact shadow right under the base, so the glass sits on the bench.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.blot, color: 0x120a04, transparent: true, depthWrite: false })
    );
    contact.rotation.x = -Math.PI / 2;
    this.group.add(shadow, contact);

    const vessel = {
      shapeName,
      key,
      spec,
      cavity,
      group,
      liquid,
      liquidMaterial,
      uniforms: liquidMaterial.userData.uniforms,
      hit,
      shadow,
      contact,
      volume: 0,
      color: new THREE.Color(),
      home: new THREE.Vector3(),
      side: 1,
      mode: "home",
      t: 0,
      tilt: 0,
      tiltVel: 0,
      tiltTarget: 0,
      angle: 0,
      from: { pos: new THREE.Vector3(), angle: 0 },
      wobble: { x: 0, z: 0, vx: 0, vz: 0 },
      prevCenter: new THREE.Vector3(),
      prevVel: new THREE.Vector3(),
      level: 0,
      inflow: 0,
      foam: 0,
      swirlRate: 0,
      swirlAngle: 0,
      drips: 0,
      dripClock: 0,
      vaporClock: 0,
      ripple: 0,
      splashClock: 0,
      stream: null
    };
    if (key) {
      srgbColor(pigmentRgb(key), vessel.color);
      const streamMaterial = createStreamMaterial();
      streamMaterial.color.copy(vessel.color);
      streamMaterial.emissive.copy(vessel.color);
      vessel.stream = new PourStream(this.scene, streamMaterial);
    }
    liquidMaterial.color.copy(vessel.color);
    vessel.uniforms.uShape.value.set(spec.rBottom, spec.rTop, spec.height, spec.curve);
    vessel.uniforms.uShape2.value.set(spec.bulge, spec.wall + 0.005);
    return vessel;
  }

  addFillLine(v) {
    const y = this.levelHeight(v, this.goalVolume);
    const radius = outerRadius(v.spec, y) + 0.004;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const dashes = 40;
    const dashGeometry = new THREE.TorusGeometry(radius, 0.0055, 5, 5, ((Math.PI * 2) / dashes) * 0.55);
    const line = new THREE.Group();
    for (let i = 0; i < dashes; i++) {
      const dash = new THREE.Mesh(dashGeometry, material);
      dash.rotation.set(Math.PI / 2, 0, (i / dashes) * Math.PI * 2);
      dash.renderOrder = 5;
      line.add(dash);
    }
    line.position.y = y;
    const tickGeometry = new THREE.TorusGeometry(radius, 0.003, 4, 24, 0.35);
    const tickMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    for (let i = 1; i <= 4; i++) {
      const ty = v.spec.base + ((y - v.spec.base) * i) / 5;
      const tick = new THREE.Mesh(tickGeometry, tickMaterial);
      tick.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.175 + 0.5);
      tick.scale.setScalar((outerRadius(v.spec, ty) + 0.004) / radius);
      tick.position.y = ty;
      tick.renderOrder = 5;
      v.group.add(tick);
    }
    v.group.add(line);
  }

  /** Height of the liquid surface in an upright glass holding `volume`. */
  levelHeight(v, volume) {
    return solveLevel(v.cavity, WORLD_UP, volume);
  }

  /** Resting tilt over the mixer: slight, but never enough to spill a full source. */
  hoverTilt(v) {
    let tilt = cfg.pour.hoverTilt * DEG;
    while (tilt > 4 * DEG && capacityAt(v.cavity, this.localUp(tilt, this.tmp)) < v.volume * 1.04) tilt -= DEG;
    return tilt;
  }

  /** Height of the pour lip above the mixer rim so the tilted source clears it. */
  clearance(v) {
    const a = v.hover;
    const lipX = -v.cavity.rimOuter;
    const lipY = v.spec.height;
    let lowest = 0;
    for (let i = 0; i <= 8; i++) {
      const y = (v.spec.height * i) / 8;
      for (const s of [-1, 1]) {
        const x = s * outerRadius(v.spec, y) - lipX;
        const dy = y - lipY;
        lowest = Math.min(lowest, x * Math.sin(a) + dy * Math.cos(a));
      }
    }
    return -lowest + 0.07;
  }

  localUp(tilt, out) {
    return out.set(Math.sin(tilt), Math.cos(tilt), 0);
  }

  anchor(v, out, t = this.target) {
    return out.set(t.home.x + v.side * t.spec.rTop * 0.42, t.home.y + t.spec.height + v.clearance, t.home.z);
  }

  /** Glass position that keeps its lip on the anchor at the given tilt (it pivots on the lip). */
  pourPosition(v, tilt, out, target = this.target) {
    const angle = v.side * tilt;
    const lx = -v.side * v.cavity.rimOuter;
    const ly = v.spec.height;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.anchor(v, out, target);
    out.x -= lx * c - ly * s;
    out.y -= lx * s + ly * c;
    return out;
  }

  sendToPour(v) {
    v.mode = "going";
    v.t = 0;
    v.from.pos.copy(v.group.position);
    v.from.angle = v.angle;
    v.tiltTarget = v.hover;
  }

  sendHome(v) {
    v.mode = "back";
    v.t = 0;
    v.from.pos.copy(v.group.position);
    v.from.angle = v.angle;
    v.tiltTarget = 0;
    if (this.active === v) this.active = null;
  }

  onPointerDown(event) {
    if (this.locked || event.button > 0 || !this.camera) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.sources.map((v) => v.hit),
      false
    );
    const picked = hits.length ? this.sources.find((v) => v.hit === hits[0].object) : null;
    if (picked && picked !== this.active && picked.volume > this.goalVolume * 0.004) {
      if (this.active) this.sendHome(this.active);
      this.active = picked;
      this.sendToPour(picked);
      this.hooks.onPick?.();
    }
    if (this.active) this.held = true;
  }

  onPointerUp() {
    this.held = false;
  }

  tick(dt) {
    if (!this.target) return;
    this.time += dt;
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    // Strongest pour of this frame (0..1), read by the audio.
    this.pourStrength = 0;
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.step(STEP);
    }
    this.syncReference();
    this.updateVisuals(dt);
    this.updateEffects(dt);
    this.workshop.update(this.time);
    this.animateGlow(this.reference);
    this.tagReference();
    this.checkFinish(dt);
    this.emitProgress();
    this.guide();
  }

  step(h) {
    for (const v of this.sources) {
      this.moveSource(v, h);
      this.pour(v, h);
      this.drip(v, h);
      if (v.stream.active) v.stream.step(h, (pt) => this.absorb(pt, v));
    }
    this.slosh(this.target, h);
    for (const v of this.sources) this.slosh(v, h);
    this.droplets.step(h, (d) => this.sink(d));
  }

  moveSource(v, h) {
    if (v.mode === "pour" && this.held && this.active === v && !this.locked) {
      const rate = (v.stream.flowing ? cfg.pour.pourTiltSpeed : cfg.pour.tiltSpeed) * DEG;
      v.tiltTarget = Math.min(cfg.pour.maxTilt * DEG, Math.max(v.tiltTarget, v.tilt - 4 * DEG) + rate * h);
    } else if (v.mode === "pour" || v.mode === "going") {
      v.tiltTarget = v.hover;
    }
    v.tiltVel += ((v.tiltTarget - v.tilt) * cfg.pour.tiltSpring - v.tiltVel * cfg.pour.tiltDamping) * h;
    v.tilt += v.tiltVel * h;

    const pos = v.group.position;
    if (v.mode === "going" || v.mode === "back") {
      v.t = Math.min(1, v.t + h / Math.max(0.05, cfg.pour.travelTime));
      const e = easeInOut(v.t);
      const lift = Math.sin(Math.PI * e) * 0.45;
      if (v.mode === "going") {
        this.pourPosition(v, v.tilt, this.tmp);
        pos.lerpVectors(v.from.pos, this.tmp, e);
        v.angle = THREE.MathUtils.lerp(v.from.angle, v.side * v.tilt, e);
      } else {
        pos.lerpVectors(v.from.pos, v.home, e);
        v.angle = THREE.MathUtils.lerp(v.from.angle, 0, e);
        v.tilt = Math.abs(v.angle);
        v.tiltVel = 0;
      }
      pos.y += lift;
      if (v.t >= 1) v.mode = v.mode === "going" ? "pour" : "home";
    } else if (v.mode === "pour") {
      this.pourPosition(v, v.tilt, pos);
      v.angle = v.side * v.tilt;
    }
    v.group.rotation.set(0, 0, v.angle);

    if (
      v === this.active &&
      v.mode === "pour" &&
      !this.held &&
      v.volume <= this.goalVolume * 0.002 &&
      !v.stream.flowing
    ) {
      this.sendHome(v);
    }
  }

  /** World position of the rim point the liquid leaves from. */
  lipPoint(v, out) {
    const s = Math.sign(v.angle) || 1;
    const c = Math.cos(v.angle);
    const sn = Math.sin(v.angle);
    const lx = -s * v.cavity.rimOuter;
    const ly = v.spec.height;
    return out.set(
      v.group.position.x + lx * c - ly * sn,
      v.group.position.y + lx * sn + ly * c - 0.012,
      v.group.position.z
    );
  }

  stopPour(v) {
    // A pour that just ended leaves a few drops clinging to the lip.
    if (v.stream.flowing && v.volume > 1e-6) {
      v.drips = 2 + Math.floor(Math.random() * 3);
      v.dripClock = 0.12;
    }
    v.stream.stop();
  }

  drip(v, h) {
    if (v.drips <= 0 || Math.abs(v.angle) < 5 * DEG) return;
    v.dripClock -= h;
    if (v.dripClock > 0) return;
    v.dripClock = 0.1 + Math.random() * 0.22;
    v.drips -= 1;
    const s = Math.sign(v.angle) || 1;
    this.droplets.spawn(
      this.lipPoint(v, this.tmp2),
      this.tmp.set(-s * (0.05 + Math.random() * 0.08), -0.15, 0),
      0.009 + Math.random() * 0.006,
      v.color
    );
  }

  pour(v, h) {
    if (this.finished || v.volume <= 1e-7 || Math.abs(v.angle) < 2 * DEG) {
      this.stopPour(v);
      return;
    }
    const up = this.localUp(v.angle, this.tmp);
    const capacity = capacityAt(v.cavity, up);
    const excess = v.volume - capacity;
    if (excess <= this.goalVolume * 0.0008) {
      this.stopPour(v);
      return;
    }
    const maxFlow = this.goalVolume * cfg.pour.maxFlow;
    const flow = Math.min(maxFlow, excess * cfg.pour.flowGain + this.goalVolume * 0.03);
    const amount = Math.min(v.volume, flow * h);
    v.volume -= amount;

    const s = Math.sign(v.angle) || 1;
    const lip = this.lipPoint(v, this.tmp2);
    const strength = flow / maxFlow;
    this.pourStrength = Math.max(this.pourStrength, strength);
    const speed = 0.2 + 0.8 * Math.sqrt(strength);
    const velocity = this.tmp.set(-s * speed, -0.05, (Math.random() - 0.5) * 0.02);
    v.stream.emit(lip, velocity, strength, amount);
  }

  targetSurfaceY(x, z) {
    const p = this.target.uniforms.uPlane.value;
    return (p.w - p.x * x - p.z * z) / p.y;
  }

  insideTarget(p) {
    const t = this.target;
    const y = THREE.MathUtils.clamp(p.y - t.home.y, t.spec.base, t.spec.height);
    return Math.hypot(p.x - t.home.x, p.z - t.home.z) < innerRadius(t.spec, y) - 0.01;
  }

  absorb(pt, source) {
    const t = this.target;
    if (!this.insideTarget(pt.p)) return pt.p.y < 0;
    const surface = Math.max(this.targetSurfaceY(pt.p.x, pt.p.z), t.home.y + t.spec.base);
    if (pt.p.y > surface) return false;
    if (pt.volume > 0) {
      t.mix[source.key] += pt.volume;
      t.volume += pt.volume;
      const share = pt.volume / this.goalVolume;
      t.inflow = Math.min(1, t.inflow + share * 7);
      t.uniforms.uInflowColor.value.copy(source.color);
      t.uniforms.uImpact.value.copy(pt.p);
      t.ripple = Math.min(1, t.ripple + share * 30);
      t.foam = Math.min(1, t.foam + share * 10);
      t.swirlRate = Math.min(2.6, t.swirlRate + share * 22);
      if (cfg.effects.bubbles && Math.random() < share * 90) {
        this.bubbles.spawn(
          pt.p.x + (Math.random() - 0.5) * 0.08,
          pt.p.z + (Math.random() - 0.5) * 0.08,
          0.008 + Math.random() * 0.016,
          source.color
        );
      }
      t.wobble.vx += (Math.random() - 0.5) * share * 40;
      t.wobble.vz += (Math.random() - 0.5) * share * 40;
      pt.volume = 0;
      t.splashClock += share * 60;
      while (t.splashClock > 1) {
        t.splashClock -= 1;
        if (!cfg.effects.splash) continue;
        const spread = 0.5 + Math.random() * 0.6;
        const angle = Math.random() * Math.PI * 2;
        this.droplets.spawn(
          this.tmp.set(pt.p.x, surface + 0.01, pt.p.z),
          this.tmp2.set(Math.cos(angle) * spread * 0.5, 0.9 + Math.random() * 1.6, Math.sin(angle) * spread * 0.5),
          0.005 + Math.random() * 0.008,
          source.color
        );
      }
    }
    return pt.p.y < surface - 0.12;
  }

  sink(drop) {
    if (drop.p.y < 0) return true;
    if (drop.v.y > 0 || !this.insideTarget(drop.p)) return false;
    return drop.p.y < Math.max(this.targetSurfaceY(drop.p.x, drop.p.z), this.target.home.y + this.target.spec.base);
  }

  slosh(v, h) {
    const hgt = v.spec.height * 0.4;
    const cx = v.group.position.x - Math.sin(v.angle) * hgt;
    const cy = v.group.position.y + Math.cos(v.angle) * hgt;
    const cz = v.group.position.z;
    const vx = (cx - v.prevCenter.x) / h;
    const vy = (cy - v.prevCenter.y) / h;
    const vz = (cz - v.prevCenter.z) / h;
    const ax = THREE.MathUtils.clamp((vx - v.prevVel.x) / h, -60, 60);
    const az = THREE.MathUtils.clamp((vz - v.prevVel.z) / h, -60, 60);
    v.prevCenter.set(cx, cy, cz);
    v.prevVel.set(vx, vy, vz);
    const w = v.wobble;
    const gain = 0.0075 * cfg.liquid.slosh;
    w.vx += (-130 * w.x - 2.6 * w.vx + ax * gain) * h;
    w.vz += (-130 * w.z - 2.6 * w.vz + az * gain) * h;
    w.x = THREE.MathUtils.clamp(w.x + w.vx * h, -0.35, 0.35);
    w.z = THREE.MathUtils.clamp(w.z + w.vz * h, -0.35, 0.35);
  }

  updateVisuals(dt) {
    for (const v of this.vessels) {
      v.group.updateMatrixWorld();
      this.updateLiquid(v, dt);
      if (v !== this.reference) this.updateBlots(v);
    }
    for (const v of this.sources) if (v.stream) v.stream.rebuild(this.time);
  }

  /** Share of white pigment: white makes a milky, cloudy liquid instead of clear coloured water. */
  whiteShare(v) {
    if (v.key) return v.key === "w" ? 1 : 0;
    const mix = v === this.target ? v.mix : this.recipe;
    const total = (mix.r || 0) + (mix.y || 0) + (mix.b || 0) + (mix.w || 0);
    return total > 0 ? (mix.w || 0) / total : 0;
  }

  updateWater(v) {
    const m = v.liquidMaterial;
    const water = cfg.liquid;
    const milky = this.whiteShare(v);
    m.transmission = Math.max(0.001, water.clarity * (1 - 0.9 * milky));
    m.roughness = water.roughness + milky * 0.25;
    // A paler absorption colour keeps the hue: fully saturated absorption turns thick yellow orange.
    m.attenuationColor.copy(v.color).lerp(WHITE, 0.35);
    m.attenuationDistance = water.tintDistance * (1 + milky * 3);
    // Light passing through is tinted by the base colour too, so keep that one paler.
    m.color.copy(v.color).lerp(WHITE, 0.05 * (1 - milky));
    // Real white paint reflects ~60% under this much light; full albedo glowed like a lamp and its
    // bloom washed out every colour around it.
    m.color.multiplyScalar(1 - 0.4 * milky);
    m.thickness = v.spec.rTop * 1.6 * (v.scale || 1);
  }

  updateLiquid(v, dt) {
    const u = v.uniforms;
    u.uTime.value = this.time;
    // Milky liquid glowing reads as a lamp.
    u.uGlow.value = cfg.liquid.glow * (1 - 0.7 * this.whiteShare(v));
    u.uSparkle.value = cfg.liquid.sparkle;
    v.liquid.visible = v.volume > this.goalVolume * 0.0015;

    // The goal glass leans towards the player (about x); the cavity is round, so the same solve
    // with that lean gives its level surface.
    const up = this.localUp(v === this.reference ? v.group.rotation.x : v.angle, this.tmp);
    const c = solveLevel(v.cavity, up, v.volume);
    const origin = v.group.position;
    const k = v.scale || 1;
    const axial =
      k *
      (Math.abs(up.y) > 0.25 ? THREE.MathUtils.clamp(c / up.y, v.cavity.bottom, v.cavity.top) : v.cavity.bottom + 0.2);
    const px = origin.x - Math.sin(v.angle) * axial;
    const pz = origin.z;
    const py = c * k + origin.y;
    const n = this.tmp2.set(v.wobble.x, 1, v.wobble.z).normalize();
    u.uPlane.value.set(n.x, n.y, n.z, px * n.x + py * n.y + pz * n.z);
    // Glasses move under tweens between renders, so refresh the matrix the clip test uses.
    v.group.updateMatrixWorld();
    u.uLocal.value.copy(v.group.matrixWorld).invert();
    u.uAxis.value.set(origin.x, origin.z);
    v.level = py - origin.y;
    this.updateWater(v);

    if (v === this.target) {
      const rgb = mixRgb(v.mix);
      if (rgb) {
        const goal = srgbColor(rgb, this.tmpColor);
        if (v.fresh === undefined || v.fresh) {
          v.color.copy(goal);
          v.fresh = false;
        } else {
          v.color.lerp(goal, 1 - Math.exp(-dt * 1.6));
        }
      }
      v.inflow *= Math.exp(-dt * 0.55);
      v.ripple *= Math.exp(-dt * 2.2);
      v.foam *= Math.exp(-dt * cfg.liquid.foamDecay);
      v.swirlRate *= Math.exp(-dt * cfg.liquid.swirlDecay);
      v.swirlAngle += v.swirlRate * dt;
      u.uFoam.value = v.foam;
      u.uSwirlRate.value = v.swirlRate;
      u.uSwirlAngle.value = v.swirlAngle;
      u.uInflow.value = v.inflow;
      u.uRipple.value = v.ripple;
    }
  }

  updateBlots(v) {
    const lift = Math.max(0, v.group.position.y);
    const base = v.spec.rBottom * 2.9;
    const spread = 1 + lift * 0.5;
    v.shadow.position.set(
      v.group.position.x + LIGHT_DIR.x * (0.08 + lift * 0.25),
      0.003,
      v.group.position.z + LIGHT_DIR.y * (0.08 + lift * 0.25)
    );
    v.shadow.scale.set(base * spread * 1.1, base * spread * 1.25, 1);
    v.shadow.material.opacity = 0.35 * Math.exp(-lift * 2.5);
    // The contact shadow only exists while the glass touches the bench.
    v.contact.position.set(v.group.position.x, 0.004, v.group.position.z);
    v.contact.scale.setScalar(v.spec.rBottom * 2.35);
    v.contact.material.opacity = 0.28 * Math.exp(-lift * 14) * Math.cos(Math.min(Math.abs(v.angle), Math.PI / 2));
  }

  updateEffects(dt) {
    const t = this.target;
    const level = THREE.MathUtils.clamp(t.level, t.spec.base, t.spec.height);
    this.bubbles.step(dt, {
      cx: t.group.position.x,
      cz: t.group.position.z,
      radius: innerRadius(t.spec, level) - 0.01,
      swirl: t.swirlRate * 0.8,
      surfaceY: (x, z) => this.targetSurfaceY(x, z)
    });
    this.vapor.step(dt);
    this.sparks.step(dt, this.time);

    // Potion vapor curling up from the mixer and the goal glass.
    if (t.volume > this.goalVolume * 0.05) {
      t.vaporClock += cfg.effects.vapor ? dt * cfg.effects.vaporRate * (1 + t.inflow * 5.7) : 0;
      while (t.vaporClock > 1) {
        t.vaporClock -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * innerRadius(t.spec, level) * 0.6;
        const x = t.group.position.x + Math.cos(a) * r;
        const z = t.group.position.z + Math.sin(a) * r;
        this.vapor.emit(this.tmp.set(x, this.targetSurfaceY(x, z) + 0.05, z), t.color, 0.4, 0.5);
      }
    }
    const ref = this.reference;
    if (Math.abs(ref.drop) > 0.01) ref.vaporClock = 0;
    else ref.vaporClock += cfg.effects.vapor ? dt * cfg.effects.vaporRate * 1.3 : 0;
    while (ref.vaporClock > 1) {
      ref.vaporClock -= 1;
      const top = ref.uniforms.uPlane.value.w;
      this.vapor.emit(
        this.tmp.set(ref.home.x + (Math.random() - 0.5) * 0.2, top + 0.05, ref.home.z),
        ref.color,
        0.55,
        1
      );
    }

    // Glowing motes shed along active pours.
    for (const v of this.sources) {
      const pts = v.stream.points;
      if (!v.stream.flowing || pts.length < 4) continue;
      if (cfg.effects.sparks && Math.random() < dt * 22)
        this.sparks.spawn(pts[Math.floor(Math.random() * pts.length)].p, v.color);
    }
  }

  checkFinish(dt) {
    if (this.finished) {
      const calm = this.sources.every((v) => !v.stream.active && v.mode === "home") && this.droplets.drops.length === 0;
      if (!calm) return;
      this.settle += dt;
      if (this.settle > 0.45 && !this.reported) {
        this.reported = true;
        this.hooks.onFinish?.({ ...this.target.mix });
      }
      return;
    }
    let falling = 0;
    for (const v of this.sources) for (const pt of v.stream.points) falling += pt.volume;
    const full = this.target.volume + falling >= this.goalVolume * 0.995;
    const drained = this.sources.every((v) => v.volume <= this.goalVolume * 0.002 && !v.stream.active);
    if (full || (drained && this.target.volume > 0)) {
      this.finished = true;
      this.locked = true;
      this.held = false;
      this.reported = false;
      for (const v of this.sources) if (v.mode !== "home") this.sendHome(v);
      this.hooks.onChange?.();
    }
  }

  emitProgress() {
    if (!this.target) return;
    const fill = Math.min(1, this.target.volume / this.goalVolume);
    const percent = this.target.volume > 1e-6 ? matchPercent(this.recipe, this.target.mix) : null;
    const fillStep = Math.round(fill * 200);
    if (percent === this.lastPercent && fillStep === this.lastFill) return;
    this.lastPercent = percent;
    this.lastFill = fillStep;
    this.hooks.onProgress?.({ fill, percent });
  }

  /**
   * First level only, until something has been poured: point at a glass to tap, then, once a glass
   * hovers over the mixer, press-and-hold on it.
   */
  guide() {
    const teaching = this.session?.index === 0 && !this.finished && this.target.volume < this.goalVolume * 0.02;
    if (!teaching || !this.camera || this.held || this.transitioning) {
      this.setGuide(null);
      return;
    }
    // The hand rests below-left of what it taps, so point at the right-most glass to keep it on screen.
    const rightmost = this.sources.reduce((a, b) => (b.home.x > a.home.x ? b : a));
    const v = this.active && this.active.mode === "pour" ? this.active : this.active ? null : rightmost;
    if (!v) {
      this.setGuide(null);
      return;
    }
    const p = this.tmp.set(0, v.spec.height * 0.5, 0);
    v.group.localToWorld(p);
    this.setGuide({ ...this.screenPoint(p), hold: v === this.active });
  }

  setGuide(guide) {
    const key = guide ? `${Math.round(guide.x)},${Math.round(guide.y)},${guide.hold}` : "";
    if (key === this.guideKey) return;
    this.guideKey = key;
    this.hooks.onGuide?.(guide);
  }

  screenPoint(world) {
    const p = this.tmp.copy(world).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  tagReference() {
    if (!this.camera || !this.reference) return;
    const r = this.reference;
    if (this.transitioning) {
      this.hooks.onReferenceTag?.(null);
      return;
    }
    this.tmp2.copy(r.home);
    this.tmp2.y += r.spec.height * r.scale + TAG_LIFT;
    this.hooks.onReferenceTag?.(this.screenPoint(this.tmp2));
  }

  frame(camera) {
    this.camera = camera;
    if (!this.target) return;
    this.frameCamera(camera);
    // Waiting off-stage (title screen): the off-screen distances depend on the new framing.
    if (this.offstage) this.stageOut();
  }

  frameCamera(camera) {
    const cam = cfg.camera;
    // Wider screens look down more steeply: from the phone-portrait angle the middle source glass
    // overlaps the mixer's base. Tall phones use `direction`, landscape `landscapeDirection`, and
    // squarer screens (tablets) blend between the two.
    const blend = THREE.MathUtils.smoothstep(camera.aspect, 0.5, 1);
    const p = cam.direction;
    const l = cam.landscapeDirection;
    const dir = new THREE.Vector3(
      THREE.MathUtils.lerp(p.x, l.x, blend),
      THREE.MathUtils.lerp(p.y, l.y, blend),
      THREE.MathUtils.lerp(p.z, l.z, blend)
    ).normalize();
    const points = [];
    // Framed as if the mixer had its default size, so resizing it never moves the camera.
    const { target: t, sources } = this.framing;
    for (const v of sources) {
      for (const s of [-1, 1]) {
        points.push(new THREE.Vector3(v.home.x + s * (v.spec.rTop + 0.05), 0, v.home.z + v.spec.rTop));
        points.push(new THREE.Vector3(v.home.x + s * (v.spec.rTop + 0.05), v.spec.height, v.home.z));
      }
      // Outline of the glass across the pour, from resting tilt to fully tipped.
      for (const tilt of [v.hover, 50 * DEG, 90 * DEG, 110 * DEG]) {
        const pos = this.pourPosition(v, tilt, new THREE.Vector3(), t);
        const angle = v.side * tilt;
        for (const [x, y] of [
          [-v.spec.rBottom, 0],
          [v.spec.rBottom, 0],
          [-v.spec.rTop, v.spec.height],
          [v.spec.rTop, v.spec.height]
        ]) {
          points.push(
            new THREE.Vector3(
              pos.x + x * Math.cos(angle) - y * Math.sin(angle),
              pos.y + x * Math.sin(angle) + y * Math.cos(angle),
              pos.z
            )
          );
        }
      }
    }
    points.push(
      new THREE.Vector3(t.home.x - t.spec.rTop, t.spec.height, t.home.z),
      new THREE.Vector3(t.home.x + t.spec.rTop, t.spec.height, t.home.z)
    );
    // The pour zone stays under the goal shelf, which sits top-centre just below the HUD card.
    const portrait = camera.aspect < 1;
    const margins = portrait ? cam.portrait : cam.landscape;
    const { bottom, side } = margins;
    const rect = this.canvas.getBoundingClientRect();
    // The tag pill is drawn up to ~40px above its anchor, so the anchor sits tagGap px under the card.
    // The tag gap shrinks on short screens so the HUD does not eat half of the view.
    const tagGap = Math.min(cfg.goalShelf.tagGap, rect.height * 0.14);
    const safeTop = 1 - (2 * ((this.hooks.safeTop?.() ?? 90) + tagGap - rect.top)) / rect.height;
    camera.updateProjectionMatrix();
    if (!cam.autoFrame) {
      camera.position.set(cam.position.x, cam.position.y, cam.position.z);
      camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
      camera.updateMatrixWorld();
      this.placeReference(camera, safeTop, portrait);
      return;
    }
    let top = margins.top;
    if (!cfg.goalShelf.autoPlace) {
      this.fitCamera(camera, points, dir, top, bottom, side);
      this.placeReference(camera, safeTop, portrait);
      return;
    }
    for (let pass = 0; pass < 3; pass++) {
      this.fitCamera(camera, points, dir, top, bottom, side);
      const shelfBottom = this.placeReference(camera, safeTop, portrait);
      if (shelfBottom - 0.03 >= top) break;
      top = shelfBottom - 0.05;
    }
  }

  /**
   * Stand-ins for the mixer and sources at the mixer's default size (same places, same shapes),
   * used only for camera framing.
   */
  framingLayout() {
    const spec = SHAPES.mixer;
    const goal = cavityOf(spec).capacity * THREE.MathUtils.clamp(cfg.mixer.fillLevel, 0.1, 0.92);
    const target = { home: this.target.home, spec };
    const sources = this.sources.map((v) => {
      const vSpec = scaleSpec(SHAPES[v.shapeName], sourceScale(v.shapeName, goal));
      const proxy = { spec: vSpec, cavity: cavityOf(vSpec), home: v.home, side: v.side, volume: goal * SUPPLY };
      proxy.hover = this.hoverTilt(proxy);
      proxy.clearance = this.clearance(proxy);
      return proxy;
    });
    return { target, sources };
  }

  fitCamera(camera, points, dir, top, bottom, side) {
    const look = new THREE.Vector3(cfg.camera.lookAt.x, cfg.camera.lookAt.y, cfg.camera.lookAt.z);
    let dist = 7;
    const ndc = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      camera.position.copy(look).addScaledVector(dir, dist);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      let minY = Infinity;
      let maxY = -Infinity;
      let maxX = 0;
      for (const point of points) {
        ndc.copy(point).project(camera);
        minY = Math.min(minY, ndc.y);
        maxY = Math.max(maxY, ndc.y);
        maxX = Math.max(maxX, Math.abs(ndc.x));
      }
      const scale = Math.max((maxY - minY) / (top - bottom), maxX / side);
      const shift = (maxY + minY) / 2 - (top + bottom) / 2;
      look.y += shift * dist * Math.tan((camera.fov * Math.PI) / 360) * 0.8;
      dist *= 1 + (scale - 1) * 0.7;
    }
    camera.position.copy(look).addScaledVector(dir, Math.max(dist, 3));
    camera.lookAt(look);
    camera.updateMatrixWorld();
    // Very short, wide screens push the camera far back; keep the whole workshop inside the far plane
    // (with the default 100 it clipped everything and the scene went black).
    const far = Math.max(100, dist * 2 + 60);
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  /** Shelf stays at the goal's home; the glass sits `drop` above it while it falls in or flies out. */
  syncReference() {
    const r = this.reference;
    if (!r) return;
    r.group.position.set(r.home.x, r.home.y + r.drop, r.home.z);
    r.shelf.group.position.copy(r.home);
    r.shelf.group.scale.setScalar(r.scale);
    r.shelf.group.rotation.x = r.group.rotation.x;
  }

  /** Screen y (CSS px) just under the shelf's brackets; the title screen hangs its text from it. */
  shelfBottomPx() {
    const r = this.reference;
    if (!this.camera || !r) return null;
    return this.screenPoint(this.tmp2.set(r.home.x, r.home.y - 0.3 * r.scale, r.home.z)).y;
  }

  /** Stretch the shelf parts (built in glass-local units) to the configured size and wall distance. */
  layoutShelf(r) {
    const shelf = cfg.goalShelf;
    // The parchment hangs beside the goal glass, above the title screen's text.
    this.workshop.parchment.position.y = r.home.y + 0.9;
    const gap = Math.max(0.05, (r.home.z - BENCH_BACK) / r.scale);
    const width = shelf.shelfWidth / r.scale;
    const thick = shelf.shelfThickness / r.scale;
    const { plank, brackets } = r.shelf;
    plank.material.color.set(shelf.shelfColor);
    plank.scale.set(width / 2.2, thick / 0.07, gap + 0.3);
    plank.position.set(0, -thick / 2, 0.3 - (gap + 0.3) / 2);
    for (const b of brackets) {
      const { arm, post, strut } = b;
      const x = Math.sign(b.x) * Math.max(0.1, width / 2 - 0.3);
      arm.scale.z = gap * 0.8;
      arm.position.set(x, -0.1, -gap * 0.6);
      post.position.set(x, -0.25, -gap + 0.03);
      strut.scale.z = gap * 0.62;
      strut.position.set(x, -0.26, -gap * 0.72);
    }
  }

  /**
   * Put the goal glass on its shelf, horizontally centred, with its tag just under `safeTop` (NDC).
   * Returns the NDC height of the shelf's underside so the pour zone can be kept below it.
   */
  placeReference(camera, safeTop, portrait) {
    const r = this.reference;
    const shelf = cfg.goalShelf;
    r.scale = portrait ? shelf.glassScalePortrait : shelf.glassScaleLandscape;
    r.group.scale.setScalar(r.scale);
    const ndc = new THREE.Vector3();
    if (!shelf.autoPlace) {
      r.home.set(shelf.position.x, shelf.position.y, shelf.position.z);
      this.syncReference();
      this.layoutShelf(r);
      return ndc.set(r.home.x, r.home.y - 0.45, r.home.z + 0.3).project(camera).y;
    }
    const refZ = referenceZ();
    const h = r.spec.height * r.scale;
    const tagRoom = TAG_LIFT;
    let target = safeTop - 0.25;
    for (let i = 0; i < 4; i++) {
      const ray = new THREE.Vector3(0, target, 0.5).unproject(camera).sub(camera.position).normalize();
      const t = (refZ - camera.position.z) / ray.z;
      const center = camera.position.clone().addScaledVector(ray, t);
      r.home.set(0, center.y - h / 2, refZ);
      const tagTop = ndc.set(0, r.home.y + h + tagRoom, refZ).project(camera).y;
      target += safeTop - tagTop;
    }
    this.syncReference();
    this.layoutShelf(r);
    return ndc.set(0, r.home.y - 0.45, refZ + 0.3).project(camera).y;
  }
}
