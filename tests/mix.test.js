import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, PASS_PERCENT, SUPPLY } from "../src/game/levels.js";
import { KEYS, matchPercent, mixRgb, oklab, pigmentRgb, totalVolume } from "../src/game/mix.js";
import { createSession, finish, nextLevel, retry, starsFor } from "../src/game/session.js";
import {
  SHAPES,
  capacityAt,
  cavityOf,
  lipLevel,
  scaleSpec,
  segmentArea,
  solveLevel,
  volumeBelow
} from "../src/game/vessels.js";

const hue = (rgb) => {
  const [, a, b] = oklab(rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

test("pigments mix the way a painter expects", () => {
  assert.deepEqual(mixRgb({ r: 2 }), pigmentRgb("r"));
  assert.equal(mixRgb({}), null);
  const green = mixRgb({ y: 1, b: 1 });
  assert.ok(green[1] > green[0] && green[1] > green[2], "yellow + blue is green");
  const orange = hue(mixRgb({ r: 1, y: 1 }));
  assert.ok(orange > hue(pigmentRgb("r")) && orange < hue(pigmentRgb("y")), "orange sits between red and yellow");
  const pink = mixRgb({ r: 1, w: 2 });
  assert.ok(pink[1] > pigmentRgb("r")[1] + 0.3, "white lightens");
  assert.equal(totalVolume({ r: 1, y: 2, b: 0, w: 0.5 }), 3.5);
});

test("match percent rewards the right ratio, not the amount", () => {
  const recipe = { r: 1, b: 1 };
  assert.equal(matchPercent(recipe, { r: 0.4, b: 0.4 }), 100);
  const close = matchPercent(recipe, { r: 0.5, b: 0.45 });
  const far = matchPercent(recipe, { r: 0.7, b: 0.3 });
  assert.ok(close >= PASS_PERCENT, `a 10% slip should still pass (${close})`);
  assert.ok(far < PASS_PERCENT, `a 70/30 split should fail (${far})`);
  assert.ok(matchPercent(recipe, { r: 1 }) < 50);
  assert.equal(matchPercent(recipe, {}), 0);
});

test("every level is reachable with the glasses it offers", () => {
  for (const level of LEVELS) {
    const total = totalVolume(level.target);
    for (const key of KEYS) {
      const share = (level.target[key] || 0) / total;
      if (share > 0) assert.ok(level.sources.includes(key), `${level.name} needs ${key}`);
      assert.ok(share <= SUPPLY, `${level.name}: ${key} share ${share} exceeds supply`);
    }
  }
});

test("session scores a finished glass and only advances on a pass", () => {
  const session = createSession(LEVELS);
  const miss = finish(session, { r: 1 });
  assert.equal(miss.pass, false);
  assert.equal(nextLevel(session), false);
  retry(session);
  assert.equal(session.result, null);
  const hit = finish(session, { r: 0.5, y: 0.5 });
  assert.equal(hit.pass, true);
  assert.equal(hit.stars, 3);
  assert.equal(nextLevel(session), true);
  assert.equal(session.index, 1);
  assert.equal(starsFor(PASS_PERCENT - 1), 0);
});

test("disc segments and cavity volumes are consistent", () => {
  assert.ok(Math.abs(segmentArea(1, 0) - Math.PI / 2) < 1e-9);
  assert.equal(segmentArea(1, 2), Math.PI);
  assert.equal(segmentArea(1, -2), 0);
  const cavity = cavityOf(SHAPES.tumbler);
  const up = { x: 0, y: 1, z: 0 };
  assert.ok(Math.abs(volumeBelow(cavity, up, cavity.top + 1) - cavity.capacity) < 1e-9);
  const half = cavity.capacity / 2;
  assert.ok(Math.abs(volumeBelow(cavity, up, solveLevel(cavity, up, half)) - half) < 1e-5);
});

test("tilting a glass keeps its volume and lowers what it can hold", () => {
  const cavity = cavityOf(SHAPES.highball);
  const volume = cavity.capacity * 0.6;
  const tilted = { x: Math.sin(0.5), y: Math.cos(0.5), z: 0 };
  const c = solveLevel(cavity, tilted, volume);
  assert.ok(Math.abs(volumeBelow(cavity, tilted, c) - volume) < 1e-5);
  assert.ok(lipLevel(cavity, tilted) < cavity.top);
  let last = Infinity;
  for (const deg of [0, 30, 60, 90, 120]) {
    const a = (deg * Math.PI) / 180;
    const cap = capacityAt(cavity, { x: Math.sin(a), y: Math.cos(a), z: 0 });
    assert.ok(cap <= last + 1e-9, `capacity shrinks with tilt (${deg}°)`);
    last = cap;
  }
  assert.ok(last < cavity.capacity * 0.02, "tipped past horizontal it holds almost nothing");
});

test("a scaled glass holds about k^3 times as much", () => {
  const base = cavityOf(SHAPES.tumbler).capacity;
  const grown = cavityOf(scaleSpec(SHAPES.tumbler, 1.3)).capacity;
  assert.ok(Math.abs(grown / base - 1.3 ** 3) < 0.08, `ratio ${grown / base}`);
  assert.equal(scaleSpec(SHAPES.tumbler, 1), SHAPES.tumbler);
});
