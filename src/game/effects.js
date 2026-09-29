import * as THREE from "three";

const MAX_BUBBLES = 70;
const MAX_PUFFS = 36;

/**
 * Foam bubbles riding the liquid surface: born at the pour impact, they drift outward with the swirl,
 * stay inside the glass and pop after a moment.
 */
export class SurfaceBubbles {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.02,
        metalness: 0,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.6,
        clearcoat: 1
      }),
      MAX_BUBBLES
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.bubbles = [];
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.pos = new THREE.Vector3();
  }

  spawn(x, z, radius, color) {
    if (this.bubbles.length >= MAX_BUBBLES) this.bubbles.shift();
    const a = Math.random() * Math.PI * 2;
    const speed = 0.08 + Math.random() * 0.22;
    this.bubbles.push({
      x,
      z,
      vx: Math.cos(a) * speed,
      vz: Math.sin(a) * speed,
      r: radius,
      life: 1.2 + Math.random() * 1.8,
      age: 0,
      color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.6)
    });
  }

  /** `vessel` gives the surface height, the glass centre, its inner radius and the swirl rate. */
  step(dt, vessel, onPop) {
    this.bubbles = this.bubbles.filter((b) => {
      b.age += dt;
      const dx = b.x - vessel.cx;
      const dz = b.z - vessel.cz;
      // Swirl carries bubbles around the axis.
      b.x += (b.vx - dz * vessel.swirl) * dt;
      b.z += (b.vz + dx * vessel.swirl) * dt;
      b.vx *= 1 - dt * 1.2;
      b.vz *= 1 - dt * 1.2;
      const d = Math.hypot(b.x - vessel.cx, b.z - vessel.cz);
      const limit = vessel.radius - b.r * 1.2;
      if (d > limit && d > 0) {
        b.x = vessel.cx + ((b.x - vessel.cx) / d) * limit;
        b.z = vessel.cz + ((b.z - vessel.cz) / d) * limit;
      }
      if (b.age > b.life) {
        onPop?.(b);
        return false;
      }
      return true;
    });
    this.bubbles.forEach((b, i) => {
      const grow = Math.min(1, b.age * 6) * (1 - Math.max(0, (b.age - b.life + 0.15) / 0.15));
      const r = b.r * Math.max(0.05, grow);
      this.pos.set(b.x, vessel.surfaceY(b.x, b.z) + r * 0.25, b.z);
      this.scale.set(r, r * 0.8, r);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, b.color);
    });
    this.mesh.count = this.bubbles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.bubbles = [];
    this.mesh.count = 0;
  }
}

function smokeTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 14; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.4;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.4;
    const r = size * (0.15 + Math.random() * 0.25);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Wisps of colored potion vapor that rise, swell, turn and fade. */
export class Vapor {
  constructor(scene) {
    this.map = smokeTexture();
    this.puffs = [];
    this.pool = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.map,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0
        })
      );
      sprite.visible = false;
      sprite.renderOrder = 7;
      scene.add(sprite);
      this.pool.push(sprite);
    }
  }

  emit(position, color, size = 0.35, strength = 1) {
    const sprite = this.pool.find((s) => !s.visible);
    if (!sprite) return;
    sprite.visible = true;
    sprite.position.copy(position);
    sprite.material.color.copy(color).lerp(new THREE.Color(1, 1, 1), 0.25);
    sprite.material.rotation = Math.random() * Math.PI * 2;
    this.puffs.push({
      sprite,
      age: 0,
      life: 2.2 + Math.random() * 1.4,
      size,
      strength,
      vx: (Math.random() - 0.5) * 0.08,
      vy: 0.22 + Math.random() * 0.18,
      spin: (Math.random() - 0.5) * 0.8
    });
  }

  step(dt) {
    this.puffs = this.puffs.filter((p) => {
      p.age += dt;
      const t = p.age / p.life;
      const s = p.sprite;
      if (t >= 1) {
        s.visible = false;
        return false;
      }
      s.position.x += p.vx * dt;
      s.position.y += p.vy * dt;
      s.material.rotation += p.spin * dt;
      s.scale.setScalar(p.size * (0.6 + t * 1.6));
      s.material.opacity = Math.sin(Math.PI * t) * 0.32 * p.strength;
      return true;
    });
  }

  clear() {
    for (const p of this.puffs) p.sprite.visible = false;
    this.puffs = [];
  }
}

const MAX_SPARKS = 120;

function sparkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Glowing motes shed by a magic pour; they float, twinkle and fade. */
export class Sparks {
  constructor(scene) {
    this.positions = new Float32Array(MAX_SPARKS * 3);
    this.colors = new Float32Array(MAX_SPARKS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: sparkTexture(),
        size: 0.06,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.sparks = [];
  }

  spawn(position, color) {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    this.sparks.push({
      p: position.clone(),
      v: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.35, (Math.random() - 0.5) * 0.5),
      color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.4),
      age: 0,
      life: 0.5 + Math.random() * 0.7,
      seed: Math.random() * 10
    });
  }

  step(dt, time) {
    this.sparks = this.sparks.filter((s) => {
      s.age += dt;
      s.v.multiplyScalar(1 - dt * 1.5);
      s.v.y -= 0.15 * dt;
      s.p.addScaledVector(s.v, dt);
      return s.age < s.life;
    });
    this.sparks.forEach((s, i) => {
      const fade = Math.sin(Math.PI * (s.age / s.life)) * (0.6 + 0.4 * Math.sin(time * 20 + s.seed));
      this.positions.set([s.p.x, s.p.y, s.p.z], i * 3);
      this.colors.set([s.color.r * fade, s.color.g * fade, s.color.b * fade], i * 3);
    });
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, this.sparks.length);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.sparks = [];
    this.points.geometry.setDrawRange(0, 0);
  }
}
