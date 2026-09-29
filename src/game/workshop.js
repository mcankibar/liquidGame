import * as THREE from "three";
import { defaultGameConfig } from "../gameConfig/defaultGameConfig.js";

const workshopConfig = defaultGameConfig.components.workshop;

// Procedural alchemist's workshop: oak bench, dark stone wall, a parchment of alchemical symbols,
// books and drifting dust. No image files.

export const BENCH_BACK = -4.2;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas2d(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext("2d")];
}

function toTexture(canvas, repeat, srgb = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function oakTexture() {
  const [canvas, ctx] = canvas2d(1024, 1024);
  const rand = rng(21);
  const planks = 6;
  const ph = 1024 / planks;
  for (let p = 0; p < planks; p++) {
    const tone = 70 + rand() * 22;
    ctx.fillStyle = `rgb(${tone + 34},${tone + 12},${tone - 18})`;
    ctx.fillRect(0, p * ph, 1024, ph);
    for (let i = 0; i < 70; i++) {
      const y = p * ph + rand() * ph;
      const dark = rand() < 0.5;
      ctx.strokeStyle = dark ? `rgba(40,22,10,${0.08 + rand() * 0.18})` : `rgba(190,140,90,${0.05 + rand() * 0.08})`;
      ctx.lineWidth = 0.6 + rand() * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * (2 + rand() * 3));
      ctx.stroke();
    }
    if (rand() < 0.7) {
      const kx = rand() * 1024;
      const ky = p * ph + ph * (0.3 + rand() * 0.4);
      for (let r = 18; r > 2; r -= 3) {
        ctx.strokeStyle = `rgba(45,25,12,${0.25})`;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 2.2, r * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(20,10,4,0.75)";
    ctx.fillRect(0, p * ph, 1024, 3);
  }
  return toTexture(canvas, [4.8, 1]);
}

function stoneTexture() {
  const [canvas, ctx] = canvas2d(1024, 1024);
  const rand = rng(5);
  ctx.fillStyle = "#1f1a16";
  ctx.fillRect(0, 0, 1024, 1024);
  let y = 0;
  while (y < 1024) {
    const h = 70 + rand() * 50;
    let x = -rand() * 120;
    while (x < 1024) {
      const w = 110 + rand() * 120;
      const tone = 70 + rand() * 38;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, `rgb(${tone + 12},${tone + 6},${tone})`);
      g.addColorStop(1, `rgb(${tone - 16},${tone - 20},${tone - 24})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      const inset = 5;
      const r = 14;
      ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, r);
      ctx.fill();
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,240,220"},${0.04 + rand() * 0.06})`;
        ctx.fillRect(x + rand() * w, y + rand() * h, 2 + rand() * 8, 2 + rand() * 5);
      }
      x += w;
    }
    y += h;
  }
  return toTexture(canvas, [12, 4]);
}

const SYMBOLS = ["☉", "☽", "☿", "♀", "♂", "♃", "♄", "△", "▽", "♁", "✶", "☼"];

function parchmentTexture() {
  const [canvas, ctx] = canvas2d(768, 1024);
  const rand = rng(9);
  const g = ctx.createRadialGradient(384, 512, 100, 384, 512, 620);
  g.addColorStop(0, "#e8d3a4");
  g.addColorStop(1, "#a9824d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 768, 1024);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(90,55,20,${rand() * 0.06})`;
    ctx.fillRect(rand() * 768, rand() * 1024, 3 + rand() * 18, 2 + rand() * 12);
  }
  ctx.strokeStyle = "rgba(70,40,15,0.8)";
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 688, 944);
  ctx.fillStyle = "#4a2a10";
  ctx.textAlign = "center";
  ctx.font = "italic 700 58px Palatino, Georgia, serif";
  ctx.fillText("Ars Alchimia", 384, 128);
  ctx.beginPath();
  ctx.arc(384, 470, 230, 0, Math.PI * 2);
  ctx.moveTo(384 + 160, 470);
  ctx.arc(384, 470, 160, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    ctx[i ? "lineTo" : "moveTo"](384 + Math.cos(a) * 230, 470 + Math.sin(a) * 230);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.font = "44px serif";
  SYMBOLS.forEach((symbol, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / SYMBOLS.length;
    ctx.fillText(symbol, 384 + Math.cos(a) * 195, 486 + Math.sin(a) * 195);
  });
  ctx.font = "90px serif";
  ctx.fillText("☿", 384, 500);
  ctx.font = "italic 30px Palatino, Georgia, serif";
  ["Solve et coagula", "Aqua · Ignis · Terra · Aer"].forEach((line, i) => ctx.fillText(line, 384, 800 + i * 56));
  return toTexture(canvas);
}

/** Circle of runes used under the goal glass. */
export function runeTexture() {
  const [canvas, ctx] = canvas2d(512, 512);
  ctx.translate(256, 256);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 5;
  for (const r of [240, 200, 120]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Rune-like glyphs drawn as strokes, so no special font is needed.
  const rand = rng(41);
  const count = 22;
  ctx.lineWidth = 3;
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.rotate((i / count) * Math.PI * 2);
    ctx.translate(0, -220);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    for (let b = 0; b < 1 + Math.floor(rand() * 2); b++) {
      const y = -12 + rand() * 16;
      const dir = rand() < 0.5 ? -1 : 1;
      ctx.moveTo(0, y);
      ctx.lineTo(dir * 9, y + (rand() < 0.5 ? 8 : -8));
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * 190, Math.sin(a) * 190);
  }
  ctx.stroke();
  return toTexture(canvas);
}

function softDot(inner, outer) {
  const [canvas, ctx] = canvas2d(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(canvas);
}

function books(rand) {
  const group = new THREE.Group();
  const colors = [0x5a1f1a, 0x1f3a2a, 0x2a2440, 0x6b4a1c, 0x3b2a1a];
  let y = 0;
  for (let i = 0; i < 3 + Math.floor(rand() * 2); i++) {
    const h = 0.09 + rand() * 0.05;
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 + rand() * 0.2, h, 0.5 + rand() * 0.12),
      new THREE.MeshLambertMaterial({ color: colors[Math.floor(rand() * colors.length)] })
    );
    book.position.y = y + h / 2;
    book.rotation.y = (rand() - 0.5) * 0.4;
    y += h;
    group.add(book);
  }
  return group;
}

function dust(map) {
  const count = 60;
  const rand = rng(33);
  const seeds = [];
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds.push({ x: (rand() - 0.5) * 9, y: 0.3 + rand() * 4.5, z: BENCH_BACK + 0.4 + rand() * 5, p: rand() * 10 });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map,
      color: 0xffc98a,
      size: 0.05,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  points.frustumCulled = false;
  return { points, seeds };
}

export function createWorkshop() {
  const group = new THREE.Group();
  group.name = "workshop";
  const rand = rng(77);

  // Lambert, no bump: the wall and bench cover most of the screen, so they must shade cheaply.
  // Both run far past the play area so wide landscape screens never see the empty background.
  const oak = new THREE.MeshLambertMaterial({ map: oakTexture() });
  const depth = 7.7;
  const front = BENCH_BACK + depth;
  const top = new THREE.Mesh(new THREE.BoxGeometry(48, 0.24, depth), oak);
  top.position.set(0, -0.12, BENCH_BACK + depth / 2);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(48, 10, 0.1), new THREE.MeshBasicMaterial({ color: 0x1c1008 }));
  apron.position.set(0, -5.1, front - 0.1);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 24),
    new THREE.MeshLambertMaterial({ map: stoneTexture(), color: 0xd8c8b8 })
  );
  wall.position.set(0, 12, BENCH_BACK);

  const parchment = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2),
    new THREE.MeshLambertMaterial({ map: parchmentTexture() })
  );
  parchment.position.set(2.3, 2.6, BENCH_BACK + 0.03);
  parchment.rotation.z = -0.03;
  group.add(top, apron, wall, parchment);

  for (const [x, z, r] of [
    [-3.1, BENCH_BACK + 0.6, 0.2],
    [2.6, BENCH_BACK + 0.55, -0.15]
  ]) {
    const stack = books(rand);
    stack.position.set(x, 0, z);
    stack.rotation.y = r;
    group.add(stack);
  }

  const motes = dust(softDot("rgba(255,240,210,1)", "rgba(255,190,110,0.5)"));
  group.add(motes.points);

  function update(time) {
    motes.points.visible = workshopConfig.dust;
    const pos = motes.points.geometry.attributes.position;
    motes.seeds.forEach((s, i) => {
      pos.setXYZ(
        i,
        s.x + Math.sin(time * 0.21 + s.p) * 0.4,
        s.y + Math.sin(time * 0.13 + s.p * 1.7) * 0.3,
        s.z + Math.cos(time * 0.17 + s.p) * 0.3
      );
    });
    pos.needsUpdate = true;
  }

  return { group, update };
}
