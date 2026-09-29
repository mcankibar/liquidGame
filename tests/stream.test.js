import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PourStream } from "../src/game/stream.js";

function fixture(t) {
  const material = new THREE.MeshBasicMaterial();
  const stream = new PourStream(new THREE.Scene(), material);
  t.after(() => {
    stream.dispose();
    material.dispose();
  });
  return stream;
}
const lip = new THREE.Vector3(0, 1.4, 0);
const velocity = new THREE.Vector3(0.6, -0.05, 0);
const amount = 0.002;

test("first emitted packet is visible and attached to the lip without adding volume", (t) => {
  const stream = fixture(t);
  stream.emit(lip, velocity, 0.5, amount);
  stream.step(1 / 120, () => false);
  const before = stream.points[0].p.clone();
  const movedLip = lip.clone().addScalar(0.03);
  stream.rebuild(1, movedLip);
  assert.equal(stream.points.length, 1);
  assert.equal(stream.points[0].volume, amount);
  assert.ok(stream.points[0].p.equals(before), "rendering must not move simulation packets");
  assert.ok(stream.mesh.visible);
  const center = new THREE.Vector3();
  for (let j = 0; j < 10; j++) center.add(new THREE.Vector3().fromArray(stream.positions, (10 + j) * 3));
  center.divideScalar(10);
  assert.ok(center.distanceTo(movedLip) < 1e-6);
});

test("stop and restart never bridge separate pours", (t) => {
  const stream = fixture(t);
  stream.emit(lip, velocity, 0.5, amount);
  stream.step(1 / 120, () => false);
  stream.stop();
  stream.rebuild(1, lip);
  assert.equal(stream.geometry.drawRange.count, 0);
  stream.emit(lip.clone().addScalar(0.5), velocity, 0.5, amount);
  stream.step(1 / 120, () => false);
  stream.rebuild(2, lip);
  assert.equal(stream.geometry.drawRange.count, 60, "only the new packet-to-lip segment should draw");
  assert.ok(Array.from(stream.indices.slice(0, 60)).every((i) => i >= 10));
});

test("stream conserves delivered volume while recycling packets", (t) => {
  const stream = fixture(t);
  let emitted = 0,
    delivered = 0;
  const absorb = (pt) => {
    if (pt.p.y > 0) return false;
    delivered += pt.volume;
    return true;
  };
  for (let frame = 0; frame < 600; frame++) {
    stream.emit(lip, velocity, 0.5, amount);
    emitted += amount;
    stream.step(1 / 120, absorb);
  }
  stream.stop();
  for (let frame = 0; frame < 240; frame++) stream.step(1 / 120, absorb);
  assert.equal(stream.points.length, 0);
  assert.ok(Math.abs(delivered - emitted) < 1e-10);
  assert.ok(stream.pool.length < 60, "normal pours should reuse a bounded set of packets");
});

test("capacity overflow coalesces volume and active geometry fits its buffers", (t) => {
  const stream = fixture(t);
  for (let i = 0; i < 200; i++) stream.emit(lip.clone().addScaledVector(velocity, i / 120), velocity, 0.8, amount);
  assert.equal(stream.points.length, 150);
  assert.ok(Math.abs(stream.points.reduce((v, p) => v + p.volume, 0) - 200 * amount) < 1e-10);
  stream.rebuild(2, lip);
  const count = stream.geometry.drawRange.count;
  assert.ok(count <= stream.indices.length);
  assert.ok(Array.from(stream.indices.slice(0, count)).every((i) => i < stream.positions.length / 3));
  assert.ok(Array.from(stream.positions).every(Number.isFinite));
  for (let i = 0; i < 151; i++)
    for (let j = 0; j < 10; j++) {
      const normal = new THREE.Vector3().fromArray(stream.normals, (i * 10 + j) * 3);
      assert.ok(Math.abs(normal.length() - 1) < 1e-5);
    }
});

test("absorbing an interior packet breaks connectivity without skipping survivors", (t) => {
  const stream = fixture(t);
  for (let i = 0; i < 3; i++) stream.emit(lip, velocity, 0.5, i + 1);
  stream.step(1 / 120, (pt) => pt.volume === 2);
  assert.deepEqual(
    stream.points.map((p) => p.volume),
    [1, 3]
  );
  assert.equal(stream.points[1].connected, false);
  stream.stop();
  stream.rebuild(1);
  assert.equal(stream.geometry.drawRange.count, 0);
});

test("empty streams do not dirty GPU attributes and short streams upload only active rings", (t) => {
  const stream = fixture(t);
  const pos = stream.geometry.attributes.position;
  stream.rebuild(1);
  assert.equal(pos.version, 0);
  stream.emit(lip, velocity, 0.5, amount);
  stream.step(1 / 120, () => false);
  stream.rebuild(1, lip);
  assert.deepEqual(pos.updateRanges, [{ start: 0, count: 60 }]);
});
