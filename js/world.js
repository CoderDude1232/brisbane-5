'use strict';
// Brisbane: river, road grid, suburbs, bridges. Pure data generation (no THREE) lives here
// so it can be sanity-checked headless; meshes are built in worldBuild.js.

const GRID = 60, NL = 35, ORIGIN = -1020, HALF = 1020, ROADW = 14, SIDEW = 20;
const NB = NL - 1;
const RIVER_HW = 30;
const MCELL = 4, MW = Math.ceil((2 * HALF) / MCELL);
const lineC = (i) => ORIGIN + i * GRID;
const blockIdx = (v) => Math.floor((v - ORIGIN) / GRID);
const MT = { x: -790, z: -430, R: 250, H: 125 };

// The Brown Snake, roughly: Toowong -> South Bank -> around the CBD -> Kangaroo Point ->
// New Farm -> out past Hamilton.
const RIVER_PTS = [
  [-1150, 70], [-950, 40], [-760, 70], [-600, 130], [-450, 175], [-320, 215], [-170, 240],
  [-40, 228], [60, 195], [118, 125], [142, 30], [152, -80], [182, -168], [250, -222],
  [330, -190], [356, -80], [372, 40], [425, 118], [505, 122], [558, 40], [566, -90],
  [548, -220], [592, -350], [700, -412], [820, -362], [900, -250], [1010, -205], [1150, -190],
];

const SUBURBS = [
  ['Brisbane CBD', -50, -30, 'cbd'], ['Spring Hill', -110, -330, 'mid'],
  ['Fortitude Valley', 210, -390, 'valley'], ['Kangaroo Point', 255, -50, 'mid'],
  ['South Bank', -40, 330, 'mid'], ['West End', -280, 380, 'suburb'],
  ['Woolloongabba', 250, 270, 'mid'], ['East Brisbane', 480, 280, 'suburb'],
  ['New Farm', 470, -80, 'suburb'], ['Teneriffe', 660, -520, 'mid'],
  ['Newstead', 420, -560, 'industrial'], ['Bowen Hills', 140, -620, 'industrial'],
  ['Herston', -120, -610, 'mid'], ['Red Hill', -380, -560, 'suburb'],
  ['Paddington', -420, -300, 'suburb'], ['Milton', -430, 30, 'mid'],
  ['Petrie Terrace', -280, -140, 'mid'], ['Toowong', -760, -80, 'suburb'],
  ['Auchenflower', -600, -10, 'suburb'], ['St Lucia', -700, 360, 'suburb'],
  ['Highgate Hill', -250, 620, 'suburb'], ['Dutton Park', -40, 640, 'suburb'],
  ['Annerley', 60, 880, 'suburb'], ['Greenslopes', 350, 760, 'suburb'],
  ['Coorparoo', 650, 600, 'suburb'], ['Bulimba', 820, -60, 'suburb'],
  ['Hawthorne', 820, 220, 'suburb'], ['Hamilton', 900, -620, 'suburb'],
  ['Ashgrove', -720, -760, 'suburb'], ['Kelvin Grove', -300, -820, 'mid'],
  ['Windsor', 100, -880, 'suburb'], ['Mt Coot-tha', MT.x, MT.z, 'mountain'],
  ['Indooroopilly', -950, 300, 'suburb'], ['Fairfield', -300, 900, 'suburb'],
  ['Norman Park', 650, 320, 'suburb'], ['Albion', 420, -900, 'suburb'],
];

const BRIDGE_NAMES = [
  ['Story Bridge', 240, -240], ['Captain Cook Bridge', 120, 150], ['Victoria Bridge', -60, 230],
  ['Go Between Bridge', -240, 230], ['William Jolly Bridge', -180, 235],
  ['Kangaroo Point Bridge', 150, -20], ['Merivale Bridge', -400, 190],
  ['Walter Taylor Bridge', -900, 50], ['Gateway Bridge', 1000, -200],
  ['Bulimba Ferry Bridge', 560, -60], ['Breakfast Creek Bridge', 700, -400],
  ['Kurilpa Bridge', -150, 230], ['Goodwill Bridge', 60, 200], ['Green Bridge', -700, 100],
  ['Indooroopilly Toll Bridge', -840, 60], ['Teneriffe Crossing', 600, -380], ['New Farm Crossing', 340, -60],
  ['Hawthorne Crossing', 480, 120], ['Newstead Crossing', 820, -340], ['Norman Creek Bridge', 360, 0],
];

const World = {
  mask: new Uint8Array(MW * MW),
  H: new Uint8Array(NL * NL), // H[i*NL+j]: (i,j)-(i+1,j)
  V: new Uint8Array(NL * NL), // V[i*NL+j]: (i,j)-(i,j+1)
  blocks: [],
  bridges: [],
  river: [], // resampled points {x,z,s}
  riverLen: 0,
  hash: new SpatialHash(32),
  landmarks: {},
  pois: {},

  isWater(x, z) {
    const ix = Math.floor((x + HALF) / MCELL), iz = Math.floor((z + HALF) / MCELL);
    if (ix < 0 || iz < 0 || ix >= MW || iz >= MW) return false;
    return this.mask[ix * MW + iz] === 1;
  },
  onBridge(x, z) {
    for (const b of this.bridges) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return b;
    return null;
  },
  inRiver(x, z) { return this.isWater(x, z) && !this.onBridge(x, z); },
  groundY(x, z) {
    const dx = x - MT.x, dz = z - MT.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d >= MT.R) return 0;
    const t = 1 - d / MT.R;
    const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
    return MT.H * s + 5 * Math.sin(x * 0.045) * Math.cos(z * 0.05) * s;
  },
  edge(i1, j1, i2, j2) {
    if (j1 === j2 && Math.abs(i1 - i2) === 1) { const i = Math.min(i1, i2); return i >= 0 && i < NL - 1 ? this.H[i * NL + j1] : 0; }
    if (i1 === i2 && Math.abs(j1 - j2) === 1) { const j = Math.min(j1, j2); return j >= 0 && j < NL - 1 ? this.V[i1 * NL + j] : 0; }
    return 0;
  },
  setEdge(i1, j1, i2, j2, v) {
    if (j1 === j2) this.H[Math.min(i1, i2) * NL + j1] = v;
    else this.V[i1 * NL + Math.min(j1, j2)] = v;
  },
  // Neighbouring nodes reachable by car (1 road, 2 bridge) or, with peds=true, also mall (3).
  neighbors(i, j, peds) {
    const out = [];
    const ok = (t) => t === 1 || t === 2 || (peds && t === 3);
    if (ok(this.edge(i, j, i + 1, j))) out.push([i + 1, j]);
    if (ok(this.edge(i, j, i - 1, j))) out.push([i - 1, j]);
    if (ok(this.edge(i, j, i, j + 1))) out.push([i, j + 1]);
    if (ok(this.edge(i, j, i, j - 1))) out.push([i, j - 1]);
    return out;
  },
  nearestNode(x, z) {
    const bi = Math.round((x - ORIGIN) / GRID), bj = Math.round((z - ORIGIN) / GRID);
    let best = null, bd = 1e9;
    for (let r = 0; r < 4 && !best; r++)
      for (let i = bi - r; i <= bi + r; i++)
        for (let j = bj - r; j <= bj + r; j++) {
          if (i < 0 || j < 0 || i >= NL || j >= NL) continue;
          if (!this.neighbors(i, j).length) continue;
          const d = (lineC(i) - x) ** 2 + (lineC(j) - z) ** 2;
          if (d < bd) { bd = d; best = [i, j]; }
        }
    return best;
  },
  // Shortest road path (BFS) between nodes; returns list of [i,j] excluding start.
  path(a, b) {
    if (!a || !b) return null;
    const N = NL * NL, prev = new Int32Array(N).fill(-1);
    const s = a[0] * NL + a[1], t = b[0] * NL + b[1];
    const q = [s]; prev[s] = s;
    while (q.length) {
      const c = q.shift();
      if (c === t) break;
      const ci = (c / NL) | 0, cj = c % NL;
      for (const [ni, nj] of this.neighbors(ci, cj)) {
        const n = ni * NL + nj;
        if (prev[n] === -1) { prev[n] = c; q.push(n); }
      }
    }
    if (prev[t] === -1) return null;
    const out = [];
    for (let c = t; c !== s; c = prev[c]) out.push([(c / NL) | 0, c % NL]);
    return out.reverse();
  },
  suburbAt(x, z) {
    let best = SUBURBS[0], bd = 1e18;
    for (const s of SUBURBS) {
      const d = (s[1] - x) ** 2 + (s[2] - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (x > -225 && x < 120 && z > -235 && z < 170) return SUBURBS[0];
    return best;
  },
  block(i, j) { return i >= 0 && j >= 0 && i < NB && j < NB ? this.blocks[i * NB + j] : null; },
  blockAt(x, z) { return this.block(blockIdx(x), blockIdx(z)); },

  generate() {
    this._river();
    this._roads();
    this._blocks();
  },

  _river() {
    const P = RIVER_PTS, pts = [];
    for (let k = 0; k < P.length - 1; k++) {
      const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)];
      for (let s = 0; s < 20; s++) {
        const t = s / 20, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
      }
    }
    pts.push({ x: P[P.length - 1][0], z: P[P.length - 1][1] });
    // Resample evenly every 4 units.
    const out = [{ x: pts[0].x, z: pts[0].z, s: 0 }];
    let acc = 0, total = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      let d = 0;
      while (acc + (L - d) >= 4) {
        d += 4 - acc; acc = 0; total += 4;
        const t = d / L;
        out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), s: total });
      }
      acc += L - d;
    }
    this.river = out;
    this.riverLen = total;
    const r = RIVER_HW, rc = Math.ceil(r / MCELL) + 1;
    for (const p of out) {
      const cx = Math.floor((p.x + HALF) / MCELL), cz = Math.floor((p.z + HALF) / MCELL);
      for (let ix = cx - rc; ix <= cx + rc; ix++)
        for (let iz = cz - rc; iz <= cz + rc; iz++) {
          if (ix < 0 || iz < 0 || ix >= MW || iz >= MW) continue;
          const wx = ix * MCELL - HALF + 2, wz = iz * MCELL - HALF + 2;
          if ((wx - p.x) ** 2 + (wz - p.z) ** 2 < r * r) this.mask[ix * MW + iz] = 1;
        }
    }
  },

  _segFlags(x1, z1, x2, z2) {
    let wet = false, mtn = false;
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = lerp(x1, x2, t), z = lerp(z1, z2, t);
      if (this.isWater(x, z)) wet = true;
      if (Math.hypot(x - MT.x, z - MT.z) < MT.R - 10) mtn = true;
    }
    return { wet, mtn };
  },

  _roads() {
    const WET = 9;
    for (let i = 0; i < NL - 1; i++)
      for (let j = 0; j < NL; j++) {
        const f = this._segFlags(lineC(i), lineC(j), lineC(i + 1), lineC(j));
        this.H[i * NL + j] = f.mtn ? 0 : f.wet ? WET : 1;
      }
    for (let i = 0; i < NL; i++)
      for (let j = 0; j < NL - 1; j++) {
        const f = this._segFlags(lineC(i), lineC(j), lineC(i), lineC(j + 1));
        this.V[i * NL + j] = f.mtn ? 0 : f.wet ? WET : 1;
      }
    // Bridge every other line where the river crossing is short; drop the rest.
    const bridgeLine = (dir, line, a, b) => {
      // a..b inclusive edge indices along the line
      const x0 = dir === 'H' ? lineC(a) : lineC(line), z0 = dir === 'H' ? lineC(line) : lineC(a);
      const x1 = dir === 'H' ? lineC(b + 1) : lineC(line), z1 = dir === 'H' ? lineC(line) : lineC(b + 1);
      const len = b - a + 1;
      const ok = line % 2 === 1 && len <= 3 && a > 0 && b < NL - 2 && !this.isWater(x0, z0) && !this.isWater(x1, z1);
      for (let k = a; k <= b; k++) {
        if (dir === 'H') this.H[k * NL + line] = ok ? 2 : 0;
        else this.V[line * NL + k] = ok ? 2 : 0;
      }
      if (ok) {
        const w = SIDEW / 2;
        this.bridges.push({
          name: 'Brisbane River crossing', dir,
          minX: Math.min(x0, x1) - w, maxX: Math.max(x0, x1) + w,
          minZ: Math.min(z0, z1) - w, maxZ: Math.max(z0, z1) + w,
          x0, z0, x1, z1,
        });
      }
    };
    for (let j = 0; j < NL; j++) {
      let s = -1;
      for (let i = 0; i <= NL - 1; i++) {
        const wet = i < NL - 1 && this.H[i * NL + j] === WET;
        if (wet && s < 0) s = i;
        if (!wet && s >= 0) { bridgeLine('H', j, s, i - 1); s = -1; }
      }
    }
    for (let i = 0; i < NL; i++) {
      let s = -1;
      for (let j = 0; j <= NL - 1; j++) {
        const wet = j < NL - 1 && this.V[i * NL + j] === WET;
        if (wet && s < 0) s = j;
        if (!wet && s >= 0) { bridgeLine('V', i, s, j - 1); s = -1; }
      }
    }
    // Give the real names to the nearest crossings, closest pairs first.
    const pairs = [];
    for (const b of this.bridges) for (const n of BRIDGE_NAMES) {
      const d = Math.hypot(n[1] - (b.x0 + b.x1) / 2, n[2] - (b.z0 + b.z1) / 2);
      if (d < 170) pairs.push([d, b, n[0]]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const usedN = new Set(), usedB = new Set();
    for (const [, b, n] of pairs) if (!usedN.has(n) && !usedB.has(b)) { b.name = n; usedN.add(n); usedB.add(b); }
    // Queen Street Mall: pedestrian only.
    const mj = blockIdx(-60) + 0;
    for (let i = blockIdx(-120); i < blockIdx(60); i++) if (this.H[i * NL + mj] === 1) this.H[i * NL + mj] = 3;
    this.mall = { minX: -120, maxX: 60, z: lineC(mj) };
  },

  _blocks() {
    const rng = mulberry32(4000);
    this.rng = rng;
    for (let i = 0; i < NB; i++)
      for (let j = 0; j < NB; j++) {
        const cx = lineC(i) + GRID / 2, cz = lineC(j) + GRID / 2;
        const sub = this.suburbAt(cx, cz);
        let wet = 0;
        for (let a = 0; a < 5; a++)
          for (let b = 0; b < 5; b++)
            if (this.isWater(lineC(i) + 8 + a * 11, lineC(j) + 8 + b * 11)) wet++;
        let zone = sub[3];
        if (Math.hypot(cx - MT.x, cz - MT.z) < MT.R + 10) zone = 'mountain';
        else if (zone === 'suburb' && rng() < 0.07) zone = 'park';
        this.blocks.push({ i, j, cx, cz, sub: sub[0], zone, wet, used: false });
      }
    const setZone = (x, z, zone) => { const b = this.blockAt(x, z); if (b) b.zone = zone; };
    // Hand-placed parks.
    [[90, 100], [90, 40], [-170, -150], [-110, -150], [-60, -430], [-120, -430], [500, 30], [-260, 290],
     [440, -20], [-160, 330], [-640, 260]].forEach(([x, z]) => setZone(x, z, 'park'));
    // South Bank parklands strip along the river.
    for (let x = -150; x <= 60; x += 60) for (let z = 250; z <= 310; z += 60) {
      const b = this.blockAt(x, z); if (b && b.zone !== 'park') b.zone = 'southbank';
    }
  },

  // Remove the roads inside a w x h group of blocks so a landmark can sit there.
  reserve(i0, j0, w, h) {
    for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) { const b = this.block(i, j); if (b) b.used = true; }
    for (let i = i0; i < i0 + w; i++) for (let j = j0 + 1; j < j0 + h; j++) this.H[i * NL + j] = 0;
    for (let i = i0 + 1; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) this.V[i * NL + j] = 0;
    return { minX: lineC(i0) + 10, maxX: lineC(i0 + w) - 10, minZ: lineC(j0) + 10, maxZ: lineC(j0 + h) - 10,
      cx: (lineC(i0) + lineC(i0 + w)) / 2, cz: (lineC(j0) + lineC(j0 + h)) / 2 };
  },
};

if (typeof module !== 'undefined') module.exports = { World, SUBURBS, lineC, NL, NB, GRID };
