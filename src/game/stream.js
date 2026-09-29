import * as THREE from "three";
import { defaultGameConfig } from "../gameConfig/defaultGameConfig.js";

const streamConfig = defaultGameConfig.components.stream;
const RADIAL = 10;
const MAX_POINTS = 150;
const MAX_DROPS = 90;
const CIRCLE = Array.from({ length: RADIAL }, (_, j) => {
  const a = (j / RADIAL) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});

/**
 * A falling pour. Points are emitted at the lip and fly ballistically; the tube is rebuilt through
 * them every frame, so the stream bends with the glass, thins as it speeds up and its tail falls
 * away when pouring stops. Each point carries the volume it delivers on impact.
 */
export class PourStream {
  constructor(scene, material) {
    this.points = [];
    this.pool = [];
    this.renderPoints = [];
    this.radii = new Float32Array(MAX_POINTS + 1);
    this.lip = { p: new THREE.Vector3(), v: new THREE.Vector3(), flow: 0, age: 0, connected: true };
    this.material = material;
    const ringCount = MAX_POINTS + 1; // One visual-only ring stays attached to the lip.
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
    // At capacity, coalesce the oldest packet rather than silently losing its volume.
    if (this.points.length >= MAX_POINTS) {
      const oldest = this.points.shift();
      this.points[0].volume += oldest.volume;
      this.points[0].connected = false;
      this.pool.push(oldest);
    }
    const pt = this.pool.pop() ?? { p: new THREE.Vector3(), v: new THREE.Vector3() };
    pt.p.copy(position);
    pt.v.copy(velocity);
    pt.flow = flow;
    pt.volume = volume;
    pt.connected = this.flowing;
    pt.age = 0;
    this.points.push(pt);
    this.lip.p.copy(position);
    this.lip.v.copy(velocity);
    this.lip.flow = flow;
    this.flowing = true;
  }

  stop() {
    this.flowing = false;
  }

  /** `absorb(point)` returns true when the point has landed and should be removed. */
  step(dt, absorb) {
    let alive = 0;
    for (let i = 0; i < this.points.length; i++) {
      const pt = this.points[i];
      pt.v.y -= streamConfig.gravity * dt;
      pt.p.addScaledVector(pt.v, dt);
      pt.age += dt;
      if (absorb(pt) || pt.age > 2.5) {
        const next = this.points[i + 1];
        if (next) next.connected = false;
        this.pool.push(pt);
        continue;
      }
      this.points[alive++] = pt;
    }
    this.points.length = alive;
  }

  rebuild(time, lipPosition) {
    const pts = this.renderPoints;
    const physicalCount = this.points.length;
    const attached = this.flowing && physicalCount > 0;
    pts.length = physicalCount + (attached ? 1 : 0);
    for (let i = 0; i < physicalCount; i++) pts[i] = this.points[i];
    if (attached) {
      if (lipPosition) this.lip.p.copy(lipPosition);
      pts[physicalCount] = this.lip;
    }
    const count = pts.length;
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      this.mesh.visible = false;
      return;
    }
    // A coherent travelling disturbance, rather than unrelated random ring sizes.
    for (let i = 0; i < count; i++) {
      const pt = pts[i];
      const speed = Math.max(pt.v.length(), 0.65);
      let radius = (0.012 + 0.066 * Math.sqrt(pt.flow)) * Math.sqrt(0.7 / speed) * streamConfig.thickness;
      radius *= 1 + Math.sin(pt.age * 32 - time * 8) * 0.025;
      if (!pt.connected || i === 0) radius *= 0.65;
      if (i === count - 1 && !attached) radius *= 0.55;
      this.radii[i] = Math.min(0.095, Math.max(0.0035, radius));
    }
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

      const radius = this.radii[i];
      const lo = linked ? i - 1 : i;
      const hi = nextLinked ? i + 1 : i;
      const distance = pts[hi].p.distanceTo(pts[lo].p);
      const slope =
        distance > 1e-5 ? THREE.MathUtils.clamp((this.radii[hi] - this.radii[lo]) / distance, -0.7, 0.7) : 0;
      // The liquid leaves the rim as a small sheet and rounds out as it falls.
      const flatten = attached ? 1 + 0.3 * Math.exp(-pt.age * 40) : 1;
      for (let j = 0; j < RADIAL; j++) {
        const [ca, sa] = CIRCLE[j];
        const o = (i * RADIAL + j) * 3;
        this.positions[o] = pt.p.x + ((n.x * ca) / flatten + b.x * sa * flatten) * radius;
        this.positions[o + 1] = pt.p.y + ((n.y * ca) / flatten + b.y * sa * flatten) * radius;
        this.positions[o + 2] = pt.p.z + ((n.z * ca) / flatten + b.z * sa * flatten) * radius;
        const sx = n.x * ca * flatten + (b.x * sa) / flatten - t.x * slope;
        const sy = n.y * ca * flatten + (b.y * sa) / flatten - t.y * slope;
        const sz = n.z * ca * flatten + (b.z * sa) / flatten - t.z * slope;
        const invLength = 1 / Math.hypot(sx, sy, sz);
        this.normals[o] = sx * invLength;
        this.normals[o + 1] = sy * invLength;
        this.normals[o + 2] = sz * invLength;
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
    for (const attribute of [this.geometry.attributes.position, this.geometry.attributes.normal]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * RADIAL * 3);
      attribute.needsUpdate = true;
    }
    if (index > 0) {
      this.geometry.index.clearUpdateRanges();
      this.geometry.index.addUpdateRange(0, index);
      this.geometry.index.needsUpdate = true;
    }
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
