// Procedural canvas textures: every surface in the yard is painted at load
// from seeded noise, so the entry ships zero image assets and every load
// paints the same depot. The surface sheets are drawn in light greys so the
// material colour tints them — one corrugated sheet serves the rust-red
// and the steel-blue container alike.
import * as THREE from 'three';

function mulberry(seed) {
  let a = seed | 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function speckle(g, rand, w, h, n, alpha) {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha + 0.03})`;
    g.fillRect(rand() * w, rand() * h, 2, 2);
  }
}

// Shipping-container steel: vertical ribs, panel seams with rivets, rust
// streaks bleeding down from the seams, worn bright edges top and bottom.
export function corrugatedTexture() {
  const [c, g] = makeCanvas(512, 512);
  const rand = mulberry(11);
  g.fillStyle = '#c9ccd1';
  g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) {
    const grad = g.createLinearGradient(x, 0, x + 32, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.34)');
    grad.addColorStop(0.28, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.03)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 32, 512);
  }
  for (const y of [128, 384]) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, y - 2, 512, 4);
    g.fillStyle = 'rgba(30,30,34,0.55)';
    for (let x = 16; x < 512; x += 32) {
      g.beginPath();
      g.arc(x, y + 9, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 30; i += 1) {
    const x = rand() * 512;
    const y = rand() > 0.6 ? 128 : 0;
    const len = 60 + rand() * 320;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(146,84,44,0.42)');
    grad.addColorStop(1, 'rgba(146,84,44,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, 3 + rand() * 9, len);
  }
  g.fillStyle = 'rgba(0,0,0,0.20)';
  g.fillRect(0, 500, 512, 12);
  g.fillStyle = 'rgba(255,255,255,0.20)';
  g.fillRect(0, 0, 512, 5);
  speckle(g, rand, 512, 512, 2600, 0.05);
  return toTexture(c);
}

// Crate timber: four planks with grain, knots, gaps and nail heads.
export function woodTexture() {
  const [c, g] = makeCanvas(512, 512);
  const rand = mulberry(23);
  g.fillStyle = '#d8d2c4';
  g.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 4; p += 1) {
    const y = p * 128;
    g.fillStyle = `rgba(${120 + rand() * 40 | 0},${96 + rand() * 30 | 0},${58 + rand() * 22 | 0},0.20)`;
    g.fillRect(0, y, 512, 128);
    for (let i = 0; i < 42; i += 1) {
      g.strokeStyle = `rgba(88,64,32,${0.05 + rand() * 0.11})`;
      g.lineWidth = 1 + rand() * 1.6;
      g.beginPath();
      const gy = y + 8 + rand() * 112;
      g.moveTo(0, gy);
      g.bezierCurveTo(150, gy + (rand() - 0.5) * 7, 340, gy + (rand() - 0.5) * 7, 512, gy);
      g.stroke();
    }
    g.fillStyle = 'rgba(24,18,10,0.65)';
    g.fillRect(0, y + 125, 512, 3);
    for (const nx of [14, 498]) {
      g.fillStyle = 'rgba(30,30,34,0.8)';
      g.beginPath();
      g.arc(nx, y + 16, 3, 0, Math.PI * 2);
      g.arc(nx, y + 112, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const x = 40 + rand() * 430;
    const y = 40 + rand() * 430;
    const grad = g.createRadialGradient(x, y, 1, x, y, 9 + rand() * 8);
    grad.addColorStop(0, 'rgba(70,48,22,0.75)');
    grad.addColorStop(1, 'rgba(70,48,22,0)');
    g.fillStyle = grad;
    g.fillRect(x - 18, y - 18, 36, 36);
  }
  speckle(g, rand, 512, 512, 1500, 0.04);
  return toTexture(c);
}

// Depot concrete: fine noise, soft stains, one panel cross, hairline cracks.
export function concreteTexture() {
  const [c, g] = makeCanvas(512, 512);
  const rand = mulberry(37);
  g.fillStyle = '#cbccd0';
  g.fillRect(0, 0, 512, 512);
  speckle(g, rand, 512, 512, 5200, 0.05);
  for (let i = 0; i < 8; i += 1) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 50 + rand() * 120;
    const grad = g.createRadialGradient(x, y, 4, x, y, r);
    grad.addColorStop(0, `rgba(66,68,74,${0.08 + rand() * 0.09})`);
    grad.addColorStop(1, 'rgba(66,68,74,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = 'rgba(52,54,60,0.30)';
  g.fillRect(254, 0, 3, 512);
  g.fillRect(0, 254, 512, 3);
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineWidth = 1;
  for (let y = 64; y < 512; y += 128) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(38,40,46,0.5)';
  for (let i = 0; i < 4; i += 1) {
    let x = rand() * 512;
    let y = rand() * 300;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s += 1) {
      x += (rand() - 0.5) * 46;
      y += 18 + rand() * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c);
}

// Soft radial glow, shared by the lamp sprites and their ground pools.
export function glowTexture() {
  const [c, g] = makeCanvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c, false);
}

// One puffy cloud sprite: overlapping soft blobs, edges fully faded.
export function cloudTexture() {
  const [c, g] = makeCanvas(256, 128);
  const rand = mulberry(51);
  for (let i = 0; i < 16; i += 1) {
    const x = 44 + rand() * 168;
    const y = 48 + rand() * 34;
    const r = 20 + rand() * 30;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.20)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c, false);
}

// Distant block silhouettes with a scatter of lit windows.
export function skylineTexture() {
  const [c, g] = makeCanvas(256, 256);
  const rand = mulberry(67);
  g.fillStyle = '#171d28';
  g.fillRect(0, 0, 256, 256);
  for (let x = 10; x < 246; x += 17) {
    for (let y = 14; y < 240; y += 23) {
      const r = rand();
      g.fillStyle = r < 0.16 ? 'rgba(255,202,122,0.92)' : r < 0.23 ? 'rgba(169,198,232,0.85)' : '#232c3d';
      g.fillRect(x, y, 8, 11);
    }
  }
  const grad = g.createLinearGradient(0, 190, 0, 256);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = grad;
  g.fillRect(0, 190, 256, 66);
  return toTexture(c, false);
}
