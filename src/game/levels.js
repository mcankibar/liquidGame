// Target recipes use the same pigments as the source glasses, so every target is reachable.
// No pigment takes more than 60% of a recipe; each source holds SUPPLY of the goal volume.

export const SUPPLY = 0.66;
export const PASS_PERCENT = 85;

export const LEVELS = [
  { id: 1, name: "Turuncu", target: { r: 1, y: 1 }, sources: ["r", "y"] },
  { id: 2, name: "Yeşil", target: { y: 1, b: 1 }, sources: ["y", "r", "b"] },
  { id: 3, name: "Magenta", target: { r: 1, b: 1 }, sources: ["r", "w", "b"] },
  { id: 4, name: "Pembe", target: { r: 1, w: 1.5 }, sources: ["y", "r", "w"] },
  { id: 5, name: "Lavanta", target: { r: 1, b: 1, w: 2 }, sources: ["b", "r", "w", "y"] },
  { id: 6, name: "Petrol mavisi", target: { b: 2, y: 1, w: 1 }, sources: ["y", "w", "b", "r"] },
  { id: 7, name: "Kiremit", target: { r: 2, y: 1.5, b: 1 }, sources: ["r", "b", "w", "y"] }
];
