// Pigment volumes are continuous. Colors mix in an RYB cube so the results match painter intuition
// (yellow + blue = green, red + white = pink); white carries no pigment and only dilutes.

export const PIGMENTS = {
  r: { id: "r", name: "Kırmızı", ryb: [1, 0, 0] },
  y: { id: "y", name: "Sarı", ryb: [0, 1, 0] },
  b: { id: "b", name: "Mavi", ryb: [0, 0, 1] },
  w: { id: "w", name: "Beyaz", ryb: [0, 0, 0] }
};

export const KEYS = Object.keys(PIGMENTS);

// sRGB colors at the eight corners of the RYB cube.
const CORNERS = [
  [0, 0, 0, [0.97, 0.965, 0.95]],
  [1, 0, 0, [0.9, 0.05, 0.11]],
  [0, 1, 0, [1, 0.84, 0.06]],
  [0, 0, 1, [0.06, 0.27, 0.86]],
  [1, 1, 0, [1, 0.45, 0.02]],
  [1, 0, 1, [0.78, 0.05, 0.6]],
  [0, 1, 1, [0.05, 0.6, 0.26]],
  [1, 1, 1, [0.16, 0.1, 0.07]]
];

export function emptyMix() {
  return { r: 0, y: 0, b: 0, w: 0 };
}

export function totalVolume(mix) {
  return KEYS.reduce((sum, key) => sum + (mix[key] || 0), 0);
}

export function rybToRgb([R, Y, B]) {
  const out = [0, 0, 0];
  for (const [r, y, b, rgb] of CORNERS) {
    const weight = (r ? R : 1 - R) * (y ? Y : 1 - Y) * (b ? B : 1 - B);
    out[0] += rgb[0] * weight;
    out[1] += rgb[1] * weight;
    out[2] += rgb[2] * weight;
  }
  return out;
}

/** Mixed pigment strength per RYB axis. Strength is conserved so red + yellow is a full orange, not a pale one. */
export function mixRyb(mix) {
  let total = 0;
  let strength = 0;
  const sum = [0, 0, 0];
  for (const key of KEYS) {
    const amount = mix[key] || 0;
    if (amount <= 0) continue;
    const ryb = PIGMENTS[key].ryb;
    total += amount;
    strength += Math.max(...ryb) * amount;
    for (let i = 0; i < 3; i++) sum[i] += ryb[i] * amount;
  }
  if (total <= 0) return null;
  const avg = sum.map((v) => v / total);
  const peak = Math.max(...avg);
  if (peak <= 0) return avg;
  const scale = strength / total / peak;
  return avg.map((v) => Math.min(1, v * scale));
}

/** sRGB triple in 0..1, or null for an empty mix. */
export function mixRgb(mix) {
  const ryb = mixRyb(mix);
  return ryb ? rybToRgb(ryb) : null;
}

export function pigmentRgb(key) {
  return rybToRgb(PIGMENTS[key].ryb);
}

export function toHex(rgb) {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function oklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

export function colorDistance(a, b) {
  const p = oklab(a);
  const q = oklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// An OKLab distance of MATCH_SPAN reads as 0%; ~0.02 (barely visible) still scores above 90%.
const MATCH_SPAN = 0.3;

/** 0..100 similarity between the recipe color and the poured mix. */
export function matchPercent(recipe, mix) {
  const want = mixRgb(recipe);
  const got = mixRgb(mix);
  if (!want || !got) return 0;
  const score = Math.max(0, 1 - colorDistance(want, got) / MATCH_SPAN);
  return Math.round(100 * score ** 1.35);
}
