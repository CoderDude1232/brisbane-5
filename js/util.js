'use strict';
// Small math + collision helpers shared by every system.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniform grid of axis-aligned boxes {minX,maxX,minZ,maxZ,minY,maxY}.
class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.cells = new Map();
    this.q = 0;
    this.all = [];
  }
  _k(cx, cz) { return (cx + 512) * 1024 + (cz + 512); }
  insert(b) {
    if (b.minY === undefined) b.minY = 0;
    this.all.push(b);
    const c = this.cell;
    for (let cx = Math.floor(b.minX / c); cx <= Math.floor(b.maxX / c); cx++)
      for (let cz = Math.floor(b.minZ / c); cz <= Math.floor(b.maxZ / c); cz++) {
        const k = this._k(cx, cz);
        let a = this.cells.get(k);
        if (!a) { a = []; this.cells.set(k, a); }
        a.push(b);
      }
  }
  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const q = ++this.q, c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++)
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const a = this.cells.get(this._k(cx, cz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const b = a[i];
          if (b._q !== q) { b._q = q; out.push(b); }
        }
      }
    return out;
  }
}

// Ray vs box (slab test). Returns entry distance or -1.
function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let t0 = 0, t1 = maxT;
  const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
  for (let i = 0; i < 3; i++) {
    const [o, d, mn, mx] = axes[i];
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; continue; }
    let a = (mn - o) / d, c = (mx - o) / d;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  return t0;
}

// Ray vs sphere. Returns distance or -1.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

function fmtMoney(n) {
  return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
