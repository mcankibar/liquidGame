import * as THREE from "three";
import { defaultGameConfig } from "../gameConfig/defaultGameConfig.js";

const streamConfig = defaultGameConfig.components.stream;
const RADIAL = 10;
const MAX_POINTS = 150;
const MAX_DROPS = 90;

/**
 * A falling pour. Points are emitted at the lip and fly ballistically; the tube is rebuilt through
 * them every frame, so the stream bends with the glass, thins as it speeds up and its tail falls
 * away when pouring stops. Each point carries the volume it delivers on impact.
 */
export class PourStream {
  constructor(scene, material) {
    this.points = [];
    this.material = material;
    const ringCount = MAX_POINTS;
    this.positions = new Float32Array(ringCount * RADIAL * 3);
    this.normals = new Float32Array(ringCount * RADIAL * 3);
    this.indices = new Uint16Array((ringCount - 1) * RADIAL * 6);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.flowing = false;
    this.tmp = { t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3(), prevN: new THREE.Vector3() };
  }

  get active() {
    return this.points.length > 0;
  }

  /** `flow` is the pour strength in 0..1, `volume` what this point delivers. */
  emit(position, velocity, flow, volume) {
    if (this.points.length >= MAX_POINTS) this.points.shift();
    this.points.push({
      p: position.clone(),
      v: velocity.clone(),
      flow,
      volume,
      connected: this.flowing,
      age: 0,
      seed: Math.random() * 100
    });
    this.flowing = true;
  }

  stop() {
    this.flowing = false;
  }

  /** `absorb(point)` returns true when the point has landed and should be removed. */
  step(dt, absorb) {
    const alive = [];
    for (let i = 0; i < this.points.length; i++) {
      const pt = this.points[i];
      pt.v.y -= streamConfig.gravity * dt;
      pt.p.addScaledVector(pt.v, dt);
      pt.age += dt;
      if (absorb(pt) || pt.age > 2.5) {
        const next = this.points[i + 1];
        if (next) next.connected = false;
        continue;
      }
      alive.push(pt);
    }
    this.points = alive;
  }

  rebuild(time) {
    const pts = this.points;
    const count = pts.length;
    const { t, n, b, prevN } = this.tmp;
    let index = 0;
    let runStart = true;
    for (let i = 0; i < count; i++) {
      const pt = pts[i];
      const prev = pts[i - 1];
      const next = pts[i + 1];
      const nextLinked = next && next.connected;
      const linked = pt.connected && prev;
      if (nextLinked && linked) t.subVectors(next.p, prev.p);
      else if (nextLinked) t.subVectors(next.p, pt.p);
      else if (linked) t.subVectors(pt.p, prev.p);
      else t.copy(pt.v);
      if (t.lengthSq() < 1e-10) t.set(0, -1, 0);
      t.normalize();
      if (!linked || runStart) {
        n.set(Math.abs(t.y) < 0.9 ? 0 : 1, Math.abs(t.y) < 0.9 ? 1 : 0, 0);
        n.addScaledVector(t, -n.dot(t)).normalize();
      } else {
        n.copy(prevN).addScaledVector(t, -prevN.dot(t));
        if (n.lengthSq() < 1e-8) n.set(1, 0, 0);
        n.normalize();
      }
      prevN.copy(n);
      b.crossVectors(t, n);
      runStart = !nextLinked;

      // Continuity: the cross-section shrinks as the fall speeds the liquid up.
      const speed = Math.max(pt.v.length(), 0.7);
      let radius = (0.01 + 0.034 * Math.sqrt(pt.flow)) * Math.sqrt(0.7 / speed) * streamConfig.thickness;
      if (!linked) radius *= 0.55;
      if (!nextLinked && i < count - 1) radius *= 0.7;
      if (i === count - 1 && this.flowing) radius *= 1.25;
      radius *= 1 + Math.sin(pt.seed + time * 26) * 0.07;
      radius = Math.min(0.05, Math.max(0.0035, radius));

      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = n.x * ca + b.x * sa;
        const ny = n.y * ca + b.y * sa;
        const nz = n.z * ca + b.z * sa;
        const o = (i * RADIAL + j) * 3;
        this.positions[o] = pt.p.x + nx * radius;
        this.positions[o + 1] = pt.p.y + ny * radius;
        this.positions[o + 2] = pt.p.z + nz * radius;
        this.normals[o] = nx;
        this.normals[o + 1] = ny;
        this.normals[o + 2] = nz;
      }
      if (nextLinked) {
        for (let j = 0; j < RADIAL; j++) {
          const a0 = i * RADIAL + j;
          const a1 = i * RADIAL + ((j + 1) % RADIAL);
          const b0 = a0 + RADIAL;
          const b1 = a1 + RADIAL;
          this.indices[index++] = a0;
          this.indices[index++] = a1;
          this.indices[index++] = b0;
          this.indices[index++] = a1;
          this.indices[index++] = b1;
          this.indices[index++] = b0;
        }
      }
    }
    this.geometry.setDrawRange(0, index);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.index.needsUpdate = true;
    this.mesh.visible = index > 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
  }
}

/** Pooled splash droplets. */
export class Droplets {
  constructor(scene, material) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), material, MAX_DROPS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.drops = [];
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.dir = new THREE.Vector3();
  }

  spawn(position, velocity, radius, color) {
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push({ p: position.clone(), v: velocity.clone(), r: radius, color: color.clone(), age: 0 });
  }

  step(dt, sink) {
    this.drops = this.drops.filter((d) => {
      d.v.y -= streamConfig.gravity * dt;
      d.p.addScaledVector(d.v, dt);
      d.age += dt;
      return d.age < 1.5 && !sink(d);
    });
    this.drops.forEach((d, i) => {
      const speed = d.v.length();
      this.dir.copy(d.v).divideScalar(speed || 1);
      this.quat.setFromUnitVectors(this.up, this.dir);
      const stretch = 1 + Math.min(speed * 0.12, 0.9);
      this.scale.set(d.r / Math.sqrt(stretch), d.r * stretch, d.r / Math.sqrt(stretch));
      this.matrix.compose(d.p, this.quat, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, d.color);
    });
    this.mesh.count = this.drops.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.drops = [];
    this.mesh.count = 0;
  }
}
