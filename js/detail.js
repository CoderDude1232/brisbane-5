'use strict';
// Close-up architectural detail, streamed in around the camera. Far away you see the base massing
// (always resident); within ~250 m each building gets its posts, balustrades, window frames,
// fins, slab edges and so on. Built a few cells per frame so there are no hitches.

const Detail = {
  CS: 90, LOAD: 260, UNLOAD: 330,
  items: new Map(), built: new Map(), queue: [], t: 0,
  key(x, z) { return Math.floor((x + HALF) / this.CS) * 1000 + Math.floor((z + HALF) / this.CS); },
  add(x, z, kind, p) {
    const k = this.key(x, z);
    let a = this.items.get(k);
    if (!a) { a = []; this.items.set(k, a); }
    a.push({ kind, p });
  },
  center(k) { return [(Math.floor(k / 1000) + 0.5) * this.CS - HALF, ((k % 1000) + 0.5) * this.CS - HALF]; },
  update(dt, x, z, force) {
    if (G.mobile && this.LOAD > 200) { this.LOAD = 170; this.UNLOAD = 230; }
    this.t -= dt;
    if (this.t > 0 && !force) return;
    this.t = 0.25;
    for (const [k, meshes] of this.built) {
      const [cx, cz] = this.center(k);
      if (Math.hypot(cx - x, cz - z) > this.UNLOAD) {
        for (const m of meshes) { G.scene.remove(m); m.geometry.dispose(); }
        this.built.delete(k);
      }
    }
    const want = [];
    for (const k of this.items.keys()) {
      if (this.built.has(k)) continue;
      const [cx, cz] = this.center(k), d = Math.hypot(cx - x, cz - z);
      if (d < this.LOAD) want.push([d, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    const n = force ? want.length : Math.min(3, want.length);
    for (let i = 0; i < n; i++) this.build(want[i][1]);
  },
  build(k) {
    const K = { P: new Merger(), PS: new Merger(), G: new Merger(), NE: new Merger(), RD: new Merger() };
    for (const it of this.items.get(k)) DETAIL_BUILDERS[it.kind](K, it.p);
    const meshes = [
      ...K.P.build(MAT.plain, G.scene, true, true),
      ...K.PS.build(MAT.plain, G.scene, false, true),
      ...K.G.build(MAT.glass, G.scene, false, true),
      ...K.NE.build(MAT.neon, G.scene, false, false),
      ...K.RD.build(MAT.road, G.scene, false, true),
    ];
    this.built.set(k, meshes);
  },
};

// Local frame for a house: local +z faces the street, rotated by ang about Y.
function houseFrame(x, z, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}

const DETAIL_BUILDERS = {
  fn(K, draw) { draw(K); },
  // ---- Queenslander: stumps, lattice, verandah posts + balustrade, windows, door, stairs, finial ----
  qld(K, p) {
    const { P, PS, G: Gl } = K;
    const { x, z, ang, W, D, trim, roof, wall, gable } = p;
    const r = mulberry32(p.seed);
    const at = houseFrame(x, z, ang);
    const box = (M_, lx, y, lz, w, h, d, c) => { const [wx, wz] = at(lx, lz); M_.box(wx, y, wz, w, h, d, c, ang); };
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) box(PS, i * (W / 2 - 0.4), 0, j * (D / 2 - 0.4), 0.22, 2.1, 0.22, '#7a6a58');
    for (let k = -4; k <= 4; k++) box(PS, k * (W / 9), 0.2, D / 2 - 0.42, 0.06, 1.6, 0.04, '#e8e4da');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(PS, sx * (W / 2 + 0.03), 2.1, sz * (D / 2 + 0.03), 0.16, 3.2, 0.16, trim);
    const wb = shadeHex(wall, 0.84);
    for (let y = 2.5; y < 5.2; y += 0.42) { box(PS, 0, y, -D / 2 - 0.02, W, 0.04, 0.03, wb); box(PS, -W / 2 - 0.02, y, 0, 0.03, 0.04, D, wb); box(PS, W / 2 + 0.02, y, 0, 0.03, 0.04, D, wb); }
    const win = (lx, lz, side) => {
      const along = side === 0 ? [1.3, 0.1] : [0.1, 1.3];
      const out = side === 0 ? [0, 0.06 * Math.sign(lz)] : [0.06 * Math.sign(lx), 0];
      box(PS, lx + out[0], 2.7, lz + out[1], along[0] + 0.2, 1.7, along[1] + 0.2, trim);
      box(Gl, lx + out[0] * 2, 2.85, lz + out[1] * 2, along[0], 1.4, along[1], '#9fb4c4');
      box(PS, lx + out[0] * 2.5, 3.5, lz + out[1] * 2.5, along[0] + 0.25, 0.04, along[1] + 0.04, trim);
      box(P, lx + out[0] * 9, 4.55, lz + out[1] * 9, side === 0 ? 1.8 : 0.7, 0.08, side === 0 ? 0.7 : 1.8, roof);
    };
    // Verandah across the street front, set into the footprint
    const vz = D / 2 - 1.3;
    if (W > 6) {
      for (const lx of [-W / 2 + 1.8, W / 2 - 1.8]) win(lx, vz - 1.3, 0);
      box(PS, 0, 2.1, vz - 1.2, 1.1, 2.3, 0.1, rp2(r, ['#7a1f3d', '#2e5d4b', '#3a5f8a', '#6b4f3a']));
      for (let k = 0; k < 5; k++) {
        const lx = -W / 2 + 0.15 + (k / 4) * (W - 0.3);
        box(PS, lx, 2.1, D / 2 - 0.1, 0.16, 2.9, 0.16, trim);
        box(PS, lx + 0.3, 4.6, D / 2 - 0.1, 0.5, 0.06, 0.06, trim); box(PS, lx - 0.3, 4.6, D / 2 - 0.1, 0.5, 0.06, 0.06, trim);
      }
      box(PS, 0, 3.05, D / 2 - 0.1, W, 0.08, 0.12, trim); box(PS, 0, 2.25, D / 2 - 0.1, W, 0.06, 0.1, trim);
      for (let lx = -W / 2 + 0.3; lx < W / 2 - 0.2; lx += 0.32) if (Math.abs(lx - (W / 2 - 1.5)) > 0.8) box(PS, lx, 2.25, D / 2 - 0.1, 0.05, 0.8, 0.05, trim);
      box(PS, 0, 4.5, D / 2 - 0.1, W, 0.25, 0.06, trim);
      const sx0 = W / 2 - 1.5;
      for (let k = 0; k < 7; k++) box(P, sx0, 2.1 - (k + 1) * 0.3, D / 2 + 0.2 + k * 0.3, 1.3, 0.08, 0.32, '#9a7f62');
      for (const sd of [-0.7, 0.7]) { const [ax, az] = at(sx0 + sd, D / 2 - 0.1); const [bx2, bz] = at(sx0 + sd, D / 2 + 2.2); P.beam(ax, 3.0, az, bx2, 0.9, bz, 0.06, trim); }
    }
    for (const lz of [-D / 4, D / 6]) { win(-W / 2 - 0.02, lz, 1); win(W / 2 + 0.02, lz, 1); }
    win(0, -D / 2 - 0.02, 0);
    if (gable) box(PS, 0, 5.8, D / 2 + 0.25, 1.2, 0.8, 0.05, trim);
    else { const [fx, fz] = at(0, 0); PS.cyl(fx, 7.6, fz, 0.06, 0.8, trim, 6); }
    box(PS, W / 2 + 0.1, 0, -D / 2 + 0.2, 0.1, 5.3, 0.1, '#c8cccf');
    yardDetail(K, p, r);
  },

  lowset(K, p) {
    const { PS, G: Gl } = K;
    const { x, z, ang, W, D } = p;
    const r = mulberry32(p.seed);
    const at = houseFrame(x, z, ang);
    const box = (M_, lx, y, lz, w, h, d, c) => { const [wx, wz] = at(lx, lz); M_.box(wx, y, wz, w, h, d, c, ang); };
    for (const lx of [-W / 4, W / 4]) { box(PS, lx, 0.9, D / 2 + 0.05, 1.8, 1.4, 0.1, '#f2f0ea'); box(Gl, lx, 1.0, D / 2 + 0.08, 1.6, 1.2, 0.06, '#9fb4c4'); }
    box(PS, 0, 0, D / 2 + 0.06, 1.0, 2.2, 0.08, rp2(r, ['#6b4f3a', '#f2f0ea', '#2e5d4b']));
    box(PS, 0, 2.3, D / 2 + 0.9, 2.4, 0.12, 1.8, '#b5562f');
    for (const s of [-1, 1]) box(PS, s * 1.1, 0, D / 2 + 1.7, 0.1, 2.3, 0.1, '#f2f0ea');
    for (const lz of [-D / 4, D / 4]) for (const sx of [-1, 1]) { box(PS, sx * (W / 2 + 0.05), 0.9, lz, 0.1, 1.4, 1.6, '#f2f0ea'); box(Gl, sx * (W / 2 + 0.08), 1.0, lz, 0.06, 1.2, 1.4, '#9fb4c4'); }
    yardDetail(K, p, r);
  },

  modern(K, p) {
    const { PS, G: Gl } = K;
    const r = mulberry32(p.seed);
    const at = houseFrame(p.x, p.z, p.ang);
    const box = (M_, lx, y, lz, w, h, d, c) => { const [wx, wz] = at(lx, lz); M_.box(wx, y, wz, w, h, d, c, p.ang); };
    box(Gl, 0, 0.4, p.D / 2 + 0.08, p.W * 0.6, 2.4, 0.1, '#7f97a8');
    box(PS, 0, 3.1, p.D / 2 + 1.2, p.W * 0.6, 0.15, 2.4, '#2a2a2a');
    for (let k = -3; k <= 3; k++) box(PS, k * (p.W / 7), 3.3, p.D / 2 + 0.1, 0.12, 2.8, 0.25, '#6b5a48');
    yardDetail(K, p, r);
  },

  // ---- Towers: slab edges, mullion fins, balustrades, podium columns, entry canopy ----
  tower(K, p) {
    const { P, PS, G: Gl, NE } = K;
    const { pts, y0, h, style, slab, podium, ph } = p;
    if (style === 'balcony') {
      const ring = offsetPoly(pts, 1.75);
      for (let y = y0 + 3.2; y < h - 1; y += 3.2) {
        Gl.prism(ring, y + 0.22, 1.0, '#cfe0ea', 0, { cap: false });
        P.prism(offsetPoly(pts, 1.82), y + 1.2, 0.07, '#d8dadc', 0, { cap: false });
      }
    } else {
      const band = offsetPoly(pts, 0.25);
      const step = style === 'office' ? 3.25 : 7;
      for (let y = y0 + step; y < h - 1; y += step) P.prism(band, y, 0.35, slab, 0, { cap: false, bottom: false });
      const fin = offsetPoly(pts, 0.35);
      for (let i = 0; i < pts.length; i++) {
        const a = fin[i], b = fin[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nF = Math.floor(len / 3.5);
        if (pts.length <= 8) PS.box(a[0], y0, a[1], 0.5, h - y0, 0.5, slab);
        if (style !== 'fins' || nF < 1) continue;
        const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
        for (let k = 1; k < nF; k++) { const t = k / nF; PS.box(lerp(a[0], b[0], t), y0, lerp(a[1], b[1], t), 0.9, h - y0, 0.18, slab, ry); }
      }
    }
    if (podium) {
      const cr = offsetPoly(podium, 1.2);
      for (let i = 0; i < cr.length; i++) {
        const a = cr[i], b = cr[(i + 1) % cr.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 2; s < len - 1; s += 5) { const t = s / len; PS.cyl(lerp(a[0], b[0], t), 0, lerp(a[1], b[1], t), 0.3, ph, '#e2e0da', 10); }
      }
      P.prism(offsetPoly(podium, 1.6), ph - 0.6, 0.6, '#e8e6e0', 0, { bottom: true });
      NE.prism(offsetPoly(podium, 1.0), ph - 0.75, 0.12, '#fff3d6', 0, { cap: false });
    }
  },

  // ---- Main-street shop-tops: verandah posts with cast-iron lace, pilasters, parapet detail ----
  shop(K, p) {
    const { PS } = K;
    const { x, z, w, d, sx, sz, c } = p;
    const lace = '#2f3436';
    const run = (alongX) => {
      const ox = alongX ? 0 : sx * (w / 2 + 2.9), oz = alongX ? sz * (d / 2 + 2.9) : 0, L = alongX ? w : d;
      for (let t = -L / 2 + 0.5; t <= L / 2 - 0.5; t += L / 4) {
        const px = x + ox + (alongX ? t : 0), pz = z + oz + (alongX ? 0 : t);
        PS.box(px, 0, pz, 0.14, 3.8, 0.14, lace);
        PS.box(px, 3.35, pz, alongX ? 1.4 : 0.06, 0.4, alongX ? 0.06 : 1.4, lace);
      }
      PS.box(x + ox, 3.35, z + oz, alongX ? w : 0.05, 0.3, alongX ? 0.05 : d, lace);
    };
    if (sz) run(true);
    if (sx) run(false);
    for (let k = -2; k <= 2; k++) {
      if (sz) PS.box(x + k * (w / 5), 4, z + sz * (d / 2 + 0.08), 0.5, 4.2, 0.16, shadeHex(c, 1.12));
      if (sx) PS.box(x + sx * (w / 2 + 0.08), 4, z + k * (d / 5), 0.16, 4.2, 0.5, shadeHex(c, 1.12));
    }
    PS.box(x, 9.4, z, w + 0.5, 0.35, d + 0.5, shadeHex(c, 0.9));
    if (sz) PS.box(x, 9.75, z + sz * (d / 2), w * 0.3, 1.1, 0.2, shadeHex(c, 1.1));
  },
};

function yardDetail(K, p, r) {
  const { PS, P } = K;
  const at = houseFrame(p.x, p.z, p.ang);
  // letterbox and wheelie bin out the front
  const [lx, lz] = at(-1.6, p.D / 2 + 3.2);
  if (!pointInBuilding(lx, 1, lz)) {
    PS.box(lx, 0, lz, 0.1, 1.1, 0.1, '#777');
    PS.box(lx, 1.1, lz, 0.45, 0.35, 0.4, rp2(r, ['#c23', '#eee', '#335', '#c90']), p.ang);
    if (r() < 0.45) { const [bx2, bz] = at(1.6, p.D / 2 + 3.4); PS.box(bx2, 0, bz, 0.6, 1.0, 0.7, '#2f6b3a', p.ang); PS.box(bx2, 1.0, bz, 0.66, 0.08, 0.76, rp2(r, ['#c8302a', '#e3c21b']), p.ang); }
  }
  // Hills Hoist in the backyard (only if there's room)
  const [hx, hz] = at((r() - 0.5) * 3, -p.D / 2 - 4.5);
  if (p.hoist && !pointInBuilding(hx, 1, hz) && !World.isWater(hx, hz)) {
    PS.box(hx, 0, hz, 0.1, 2.3, 0.1, '#bbbbbb');
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; P.beam(hx, 2.25, hz, hx + Math.cos(a) * 1.9, 2.0, hz + Math.sin(a) * 1.9, 0.05, '#bbbbbb'); }
    for (const rr2 of [0.8, 1.4, 1.9]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, b = a + Math.PI / 2; PS.beam(hx + Math.cos(a) * rr2, 2.1, hz + Math.sin(a) * rr2, hx + Math.cos(b) * rr2, 2.1, hz + Math.sin(b) * rr2, 0.02, '#999'); }
    if (r() < 0.6) PS.box(hx + 0.8, 1.3, hz, 0.6, 0.8, 0.02, rp2(r, ['#d23', '#3a7bff', '#fff', '#e3c21b']));
  }
}

function rp2(r, a) { return a[Math.floor(r() * a.length)]; }
function shadeHex(hex, k) {
  const c = new THREE.Color(hex); c.convertLinearToSRGB();
  c.r = clamp(c.r * k, 0, 1); c.g = clamp(c.g * k, 0, 1); c.b = clamp(c.b * k, 0, 1);
  return '#' + c.getHexString();
}
