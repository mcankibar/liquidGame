import * as THREE from "three";

// Glass shapes, in world units (a glass is roughly one unit tall). `bulge` swells the middle,
// `curve` bends the taper so the wall is not a straight cone.
export const SHAPES = {
  mixer: { height: 1.34, rBottom: 0.47, rTop: 0.53, wall: 0.026, base: 0.12, bulge: 0, curve: 1 },
  tumbler: { height: 1.04, rBottom: 0.31, rTop: 0.38, wall: 0.022, base: 0.13, bulge: 0, curve: 1 },
  highball: { height: 1.26, rBottom: 0.3, rTop: 0.32, wall: 0.02, base: 0.15, bulge: 0, curve: 1 },
  tulip: { height: 1.1, rBottom: 0.29, rTop: 0.33, wall: 0.02, base: 0.11, bulge: 0.07, curve: 1.4 },
  sample: { height: 0.92, rBottom: 0.29, rTop: 0.34, wall: 0.02, base: 0.12, bulge: 0.03, curve: 1.2 },
  rocks: { height: 0.9, rBottom: 0.39, rTop: 0.41, wall: 0.026, base: 0.17, bulge: 0, curve: 1 }
};

const SLICES = 40;

/** Same glass shape, uniformly scaled. */
export function scaleSpec(spec, k) {
  if (k === 1) return spec;
  const { height, rBottom, rTop, wall, base, bulge } = spec;
  return {
    ...spec,
    height: height * k,
    rBottom: rBottom * k,
    rTop: rTop * k,
    wall: wall * k,
    base: base * k,
    bulge: bulge * k
  };
}
const LIQUID_INSET = 0.005;

export function outerRadius(spec, y) {
  const t = Math.min(1, Math.max(0, y / spec.height));
  return spec.rBottom + (spec.rTop - spec.rBottom) * t ** spec.curve + spec.bulge * Math.sin(Math.PI * t);
}

export function innerRadius(spec, y) {
  return outerRadius(spec, y) - spec.wall;
}

/** Cavity sampled as stacked discs, used for every volume query. */
export function cavityOf(spec) {
  const bottom = spec.base;
  const top = spec.height;
  const dy = (top - bottom) / SLICES;
  const slices = [];
  let capacity = 0;
  for (let i = 0; i < SLICES; i++) {
    const y = bottom + (i + 0.5) * dy;
    const r = innerRadius(spec, y) - LIQUID_INSET;
    slices.push({ y, r });
    capacity += Math.PI * r * r * dy;
  }
  return {
    slices,
    dy,
    bottom,
    top,
    capacity,
    rimInner: innerRadius(spec, top) - LIQUID_INSET,
    rimOuter: outerRadius(spec, top)
  };
}

/** Area of the part of a disc of radius r with x < a. */
export function segmentArea(r, a) {
  if (a >= r) return Math.PI * r * r;
  if (a <= -r) return 0;
  return r * r * Math.acos(-a / r) + a * Math.sqrt(r * r - a * a);
}

/** Integral of segmentArea(r, t) dt from -r to a. */
function segmentAreaIntegral(r, a) {
  if (a <= -r) return 0;
  if (a >= r) return Math.PI * r * r * a;
  return a * segmentArea(r, a) + (2 / 3) * (r * r - a * a) ** 1.5;
}

/**
 * Liquid volume below the plane dot(p, up) = c, in glass-local space.
 * `up` is world up expressed in the glass frame (unit length). Each slice is integrated exactly
 * across its thickness, so the level moves smoothly even when the glass stands upright.
 */
export function volumeBelow(cavity, up, c) {
  const side = Math.max(Math.hypot(up.x, up.z), 1e-6);
  const half = cavity.dy / 2;
  let volume = 0;
  for (const { y, r } of cavity.slices) {
    if (Math.abs(up.y) < 1e-4) {
      volume += segmentArea(r, (c - y * up.y) / side) * cavity.dy;
      continue;
    }
    const a0 = (c - (y - half) * up.y) / side;
    const a1 = (c - (y + half) * up.y) / side;
    volume += (side / up.y) * (segmentAreaIntegral(r, a0) - segmentAreaIntegral(r, a1));
  }
  return volume;
}

/** Plane offset c that holds `volume` in the tilted glass (volume is clamped to what fits). */
export function solveLevel(cavity, up, volume) {
  const side = Math.hypot(up.x, up.z);
  let lo = Infinity;
  let hi = -Infinity;
  const half = cavity.dy / 2;
  for (const { y, r } of cavity.slices) {
    for (const yy of [y - half, y + half]) {
      lo = Math.min(lo, yy * up.y - r * side);
      hi = Math.max(hi, yy * up.y + r * side);
    }
  }
  if (volume <= 0) return lo;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (volumeBelow(cavity, up, mid) < volume) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Plane offset through the lowest point of the rim: the most the tilted glass can hold. */
export function lipLevel(cavity, up) {
  return cavity.top * up.y - cavity.rimInner * Math.hypot(up.x, up.z);
}

export function capacityAt(cavity, up) {
  return volumeBelow(cavity, up, lipLevel(cavity, up));
}

function arc(points, cx, cy, radius, from, to, steps) {
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push(new THREE.Vector2(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
  }
}

/** Closed solid-glass profile: punted foot, outer wall, rounded lip, inner wall, thick base. */
export function glassProfile(spec) {
  const { height: H, wall, base } = spec;
  const foot = 0.03;
  const inner = 0.035;
  const lip = wall / 2;
  const points = [new THREE.Vector2(0, 0.018)];
  const rb = outerRadius(spec, 0);
  points.push(new THREE.Vector2(rb * 0.45, 0.012), new THREE.Vector2(rb * 0.78, 0.002));
  arc(points, rb - foot, foot, foot, -Math.PI / 2, 0, 5);
  for (let i = 1; i <= 24; i++) {
    const y = foot + ((H - lip - foot) * i) / 24;
    points.push(new THREE.Vector2(outerRadius(spec, y), y));
  }
  arc(points, outerRadius(spec, H) - lip, H - lip, lip, 0, Math.PI, 7);
  for (let i = 1; i <= 24; i++) {
    const y = H - lip - ((H - lip - (base + inner)) * i) / 24;
    points.push(new THREE.Vector2(innerRadius(spec, y), y));
  }
  const ri = innerRadius(spec, base + inner);
  arc(points, ri - inner, base + inner, inner, 0, -Math.PI / 2, 6);
  points.push(new THREE.Vector2((ri - inner) * 0.5, base - 0.004), new THREE.Vector2(0, base - 0.006));
  return points;
}

/** Liquid volume surface: follows the inner glass a hair inside, closed at the rim. */
export function liquidProfile(spec) {
  const { height: H, base } = spec;
  const inner = 0.035 - LIQUID_INSET;
  const y0 = base + LIQUID_INSET;
  const ri = innerRadius(spec, y0 + inner) - LIQUID_INSET;
  const points = [new THREE.Vector2(0, y0 - 0.001), new THREE.Vector2((ri - inner) * 0.5, y0)];
  arc(points, ri - inner, y0 + inner, inner, -Math.PI / 2, 0, 6);
  for (let i = 1; i <= 24; i++) {
    const y = y0 + inner + ((H - LIQUID_INSET - y0 - inner) * i) / 24;
    points.push(new THREE.Vector2(innerRadius(spec, y) - LIQUID_INSET, y));
  }
  // Close the mouth: when the surface reaches the lip, rays leaving through the rim still need a
  // back face to draw the surface on, otherwise the liquid looks sliced off at the rim.
  const top = H - LIQUID_INSET;
  const rim = innerRadius(spec, top) - LIQUID_INSET;
  points.push(new THREE.Vector2(rim - 0.004, top), new THREE.Vector2(rim * 0.5, top), new THREE.Vector2(0, top));
  return points;
}
