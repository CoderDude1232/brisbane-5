'use strict';
// Hand-modelled landmark detail layered on top of the real OpenStreetMap buildings.
// Buildings are matched by their OSM name; looks are based on reference photos.

const SAND = '#d9c08a', SAND2 = '#c9ab76', COPPER = '#6fa58f', SLATE = '#6f7a80', WHITE = '#f2f1ec';

const Decor = {
  // Facade overrides applied while the building is extruded.
  overrides() {
    return {
      'Brisbane Skytower': { tint: '#5d7c9c', glass: true, style: 'glass' },
      'Meriton Infinity Tower': { tint: '#f2f2ee', style: 'balcony', slab: '#f4f4f2' },
      'Soleil Building': { tint: '#c2d6e6', style: 'balcony', slab: '#f4f4f0' },
      'Aurora Tower': { tint: '#9fbcd2', glass: true, style: 'balcony', slab: '#eef2f4' },
      'Riparian Plaza': { tint: '#ece8e0', glass: false, style: 'office' },
      'One One One Eagle St': { tint: '#6e98c2', glass: true, style: 'glass' },
      'Waterfront Place': { tint: '#7a524a', glass: false, style: 'office' },
      'One William Street': { tint: '#b4cede', glass: true }, 'One William Street (1WS)': { tint: '#b4cede', glass: true },
      'Brisbane Square': { tint: '#4a525c', glass: true },
      'Central Plaza 1': { tint: '#5d7f86', glass: true }, '300 George': { tint: '#a9c6d8', glass: true },
      'The One Residences': { tint: '#c8d6e0', style: 'balcony', slab: '#ffffff' },
      'Customs House': { tint: SAND, glass: false }, 'Brisbane City Hall': { tint: '#dcc79c', glass: false },
      'Brisbane City Hall Clock Tower': { tint: '#dcc79c', glass: false }, 'Treasury Building': { tint: SAND, glass: false },
      'Cathedral of Saint Stephen': { tint: '#ecebe5', glass: false }, 'Parliament House': { tint: SAND, glass: false },
      'Gallery of Modern Art': { tint: '#f0efe9', glass: false }, 'Queensland Museum': { tint: '#c8c2b4', glass: false },
      'State Library of Queensland': { tint: '#5a7486', glass: true }, 'Queensland Performing Arts Centre': { tint: '#c8c2b4', glass: false },
      'Queensland Art Gallery': { tint: '#c8c2b4', glass: false }, 'Story Bridge Hotel': { tint: '#f0e6cc', glass: false },
      'Breakfast Creek Hotel': { tint: '#ead2b0', glass: false }, 'The Old Windmill': { tint: '#d8c8a0', glass: false },
      'Queensland Police Headquarters': { tint: '#b8c4d0', glass: false }, 'Nepalese Pagoda': { tint: '#6b3f22', glass: false },
      'Brisbane Convention and Exhibition Centre': { tint: '#d8d4cc', glass: false },
    };
  },

  find(name) { return World.blds.filter((b) => b.name === name); },
  one(name) { const a = this.find(name); return a.length ? a.reduce((p, q) => (q.h > p.h ? q : p)) : null; },
  label(name, x, z, r = 30) { World.labels.push({ name, x, z, r }); },

  build(K) {
    const { P, PS, NE, GL = K.G, scene, rr, rp, tree } = K;
    const ring = (b, y, out, th, c, bottom = true) => P.prism(offsetPoly(b.pts, out), y, th, c, 0, { cap: false, bottom });
    const L = (n, b, r) => { const o = obb(b.pts); this.label(n, o.cx, o.cz, r || Math.max(25, Math.max(o.w, o.d) * 0.8)); return o; };
    const sign = (text, x, y, z, w, h, ry, bg, fg, font) => addSign(scene, signTexture(text, bg, fg, font || 'bold 64px Arial'), x, y, z, w, h, ry, true);
    const colonnade = (o, y, h, side, n, r = 0.4, c = SAND) => { // columns along one OBB side (0..3)
      const c0 = Math.cos(o.ang), s0 = Math.sin(o.ang), at = (u, v) => [o.cx + u * c0 + v * s0, o.cz - u * s0 + v * c0];
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0.5 : k / (n - 1);
        const [x, z] = side < 2 ? at(lerp(-o.w / 2, o.w / 2, t), (side ? 1 : -1) * (o.d / 2 + 0.9)) : at((side === 3 ? 1 : -1) * (o.w / 2 + 0.9), lerp(-o.d / 2, o.d / 2, t));
        PS.cyl(x, y, z, r, h, c, 8);
      }
    };

    // ---- Skyline towers ----
    let b;
    if ((b = this.one('Brisbane Skytower'))) { // white bands every few floors and the darker sky-deck band
      for (let y = 30; y < b.h - 4; y += 21) ring(b, y, 0.12, 0.5, '#f4f4f4');
      ring(b, b.h * 0.66, 0.18, 4, '#2a3542');
      ring(b, b.h * 0.34, 0.18, 3, '#2a3542');
      P.prism(offsetPoly(b.pts, -1.5), b.h, 2.5, '#d8dadc', 0);
      L('Brisbane Skytower', b);
    }
    if ((b = this.one('Riparian Plaza'))) { // scalloped crown + mast
      const o = L('Riparian Plaza', b);
      for (let y = b.h - 34; y < b.h; y += 3.3) ring(b, y, 1.6, 0.35, '#f6f4ee');
      P.box(o.cx, b.h, o.cz, 0.9, 32, 0.9, '#e8e8e8'); NE.box(o.cx, b.h + 32, o.cz, 1, 1, 1, '#ff2222');
    }
    if ((b = this.one('One One One Eagle St'))) { // diagrid crown
      const o = L('111 Eagle St', b), c0 = Math.cos(o.ang), s0 = Math.sin(o.ang);
      for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) {
        const u0 = -o.w / 2 + (k / 6) * o.w, u1 = u0 + o.w / 6, v = sd * o.d / 2;
        const p0 = [o.cx + u0 * c0 + v * s0, o.cz - u0 * s0 + v * c0], p1 = [o.cx + u1 * c0 + v * s0, o.cz - u1 * s0 + v * c0];
        P.beam(p0[0], b.h - 2, p0[1], p1[0], b.h + 9, p1[1], 0.5, WHITE); P.beam(p1[0], b.h - 2, p1[1], p0[0], b.h + 9, p0[1], 0.5, WHITE);
      }
    }
    if ((b = this.one('Aurora Tower'))) { const o = L('Aurora Tower', b); NE.prism(offsetPoly(b.pts, -0.4), b.h, 3, '#bfe6ff', 0, { cap: false }); PS.cyl(o.cx, b.h, o.cz, 0.5, 30, '#ddd', 6); NE.box(o.cx, b.h + 30, o.cz, 1, 1, 1, '#ff2222'); }
    if ((b = this.one('Meriton Infinity Tower'))) { const o = L('Infinity Tower', b); NE.prism(offsetPoly(b.pts, 0.2), b.h - 6, 6, '#62c8ff', 0, { cap: false }); P.box(o.cx, b.h, o.cz, 1, 14, 1, '#ddd'); }
    if ((b = this.one('Soleil Building'))) { const o = L('Soleil', b); for (const q of offsetPoly(b.pts, -0.4).filter((_, i) => i % 3 === 0)) P.box(q[0], b.h, q[1], 0.8, 12, 0.8, WHITE); P.prism(offsetPoly(b.pts, -0.3), b.h + 11, 1, WHITE, 0, { cap: false, bottom: true }); NE.prism(offsetPoly(b.pts, -0.2), b.h + 9, 0.3, '#fff2c8', 0, { cap: false }); }
    if ((b = this.one('Waterfront Place'))) { const o = L('Waterfront Place', b); P.prism(offsetPoly(b.pts, -3), b.h, 10, '#7a524a', 0); P.prism(offsetPoly(b.pts, -6), b.h + 10, 6, '#6a463f', 0); }
    if ((b = this.one('Brisbane Square'))) { // dark banded tower over a podium of coloured boxes
      const o = L('Brisbane Square', b);
      for (let y = b.h * 0.55; y < b.h; y += 9) ring(b, y, 0.15, 0.4, '#e0e0e0');
      const cols = ['#d6332b', '#f1c40f', '#3a9e4a', '#2a6fc9', '#ef7d22'], c0 = Math.cos(o.ang), s0 = Math.sin(o.ang);
      for (let k = 0; k < 10; k++) {
        const u = rr(-o.w / 2, o.w / 2), v = (k % 2 ? 1 : -1) * (o.d / 2 + 2.5), sz = rr(4, 7);
        P.box(o.cx + u * c0 + v * s0, rr(0, 10), o.cz - u * s0 + v * c0, sz, sz, sz, rp(cols), o.ang);
      }
    }
    for (const n of ['One William Street', 'One William Street (1WS)']) if ((b = this.one(n))) { L('1 William Street', b); break; }
    if ((b = this.one('Central Plaza 1'))) L('Central Plaza One', b);
    if ((b = this.one('The One Residences'))) L('The One', b);

    // ---- Heritage ----
    if ((b = this.one('Customs House'))) { // copper dome on a sandstone drum, colonnade to the river
      const o = L('Customs House', b), r = Math.min(o.w, o.d) * 0.24;
      P.cyl(o.cx, b.h, o.cz, r * 1.02, r * 0.7, SAND, 20);
      P.add(DOME, M(o.cx, b.h + r * 0.7, o.cz, r, r * 0.95, r), COPPER);
      P.cyl(o.cx, b.h + r * 1.6, o.cz, r * 0.2, r * 0.5, SAND, 10); P.add(DOME, M(o.cx, b.h + r * 2.1, o.cz, r * 0.22, r * 0.25, r * 0.22), COPPER);
      colonnade(o, 0, b.h - 1, 2, 7, 0.5);
    }
    if ((b = this.one('Brisbane City Hall'))) {
      const o = L('Brisbane City Hall', b, 45);
      colonnade(o, 0.8, Math.min(12, b.h - 2), 1, 14, 0.5, '#dcc79c');
      P.prism(offsetPoly(b.pts, 0.4), b.h - 1.5, 1.5, '#cdb88c', 0, { cap: false, bottom: true });
    }
    if ((b = this.one('Brisbane City Hall Clock Tower'))) { // clock faces and the cupola
      const o = obb(b.pts), y = b.h * 0.8, hw = o.w / 2 + 0.05, hd = o.d / 2 + 0.05, c0 = Math.cos(o.ang), s0 = Math.sin(o.ang);
      for (const [u, v, ry] of [[0, hd, 0], [0, -hd, 0], [hw, 0, Math.PI / 2], [-hw, 0, Math.PI / 2]]) NE.box(o.cx + u * c0 + v * s0, y, o.cz - u * s0 + v * c0, 3.4, 3.4, 0.2, '#fdf6dc', o.ang + ry);
      P.cyl(o.cx, b.h, o.cz, Math.min(o.w, o.d) * 0.4, 4, '#dcc79c', 12);
      P.add(DOME, M(o.cx, b.h + 4, o.cz, Math.min(o.w, o.d) * 0.42, 5, Math.min(o.w, o.d) * 0.42), '#5f6d5a');
    } else if ((b = this.one('Brisbane City Hall'))) {
      const o = obb(b.pts);
      P.box(o.cx, 0, o.cz, 7, 64, 7, '#dcc79c', o.ang); P.add(DOME, M(o.cx, 64, o.cz, 3.6, 5, 3.6), '#5f6d5a');
    }
    if ((b = this.one('Treasury Building'))) { // double colonnades all round
      const o = L('Treasury Building', b);
      for (const y of [0.4, b.h * 0.5]) for (let s = 0; s < 4; s++) colonnade(o, y, b.h * 0.48 - 0.4, s, s < 2 ? Math.round(o.w / 3.6) : Math.round(o.d / 3.6), 0.45);
      ring(b, b.h * 0.5 - 0.4, 1.2, 0.7, SAND2); ring(b, b.h - 1.2, 1.2, 1.2, SAND2);
    }
    if ((b = this.one('Cathedral of Saint Stephen'))) { // nave roof and twin spires on the street end
      const o = L("St Stephen's Cathedral", b), along = o.w >= o.d, len = Math.max(o.w, o.d), wid = Math.min(o.w, o.d);
      P.add(GABLE, M(o.cx, b.h + 3, o.cz, wid + 0.6, 6, len + 0.6, 0, o.ang + (along ? Math.PI / 2 : 0), 0), SLATE);
      const ax = along ? Math.cos(o.ang) : Math.sin(o.ang), az = along ? -Math.sin(o.ang) : Math.cos(o.ang);
      const ex = o.cx + ax * len * 0.45, ez = o.cz + az * len * 0.45, px = -az, pz = ax;
      for (const sd of [-1, 1]) {
        const x = ex + px * sd * wid * 0.32, z = ez + pz * sd * wid * 0.32;
        P.box(x, 0, z, 3.6, b.h + 10, 3.6, '#ecebe5', o.ang);
        P.add(CONE4, M(x, b.h + 10 + 5.5, z, 2.6, 11, 2.6, 0, o.ang + Math.PI / 4, 0), SLATE);
      }
    }
    if ((b = this.one('Parliament House'))) { // French Second Empire roofs at the pavilions
      const o = L('Parliament House', b);
      K.pitched(o, b.h, 6, '#7d878c', 'hipped');
      colonnade(o, 0, b.h - 1, 1, Math.round(o.w / 3), 0.35);
    }
    if ((b = this.one('The Old Windmill'))) {
      const o = L('The Old Windmill', b);
      P.add(DOME, M(o.cx, b.h, o.cz, Math.min(o.w, o.d) * 0.45, 2.2, Math.min(o.w, o.d) * 0.45), '#6b5a48');
      for (let k = 0; k < 4; k++) P.add(UNIT_BOX, M(o.cx, b.h - 2, o.cz + Math.min(o.w, o.d) * 0.55, 1.2, 12, 0.15, 0, 0, (k / 4) * Math.PI + 0.3), '#7a6a58');
    }
    for (const n of ['Story Bridge Hotel', 'Breakfast Creek Hotel']) if ((b = this.one(n))) { // iron-lace verandahs
      const o = L(n, b);
      for (let s = 0; s < 4; s++) colonnade(o, 0, Math.min(b.h - 1, 7), s, 7, 0.08, '#2e5d4b');
      ring(b, 3.4, 1.2, 0.25, '#8a6f55'); ring(b, 7, 1.3, 0.2, '#2e5d4b');
    }
    if ((b = this.one('Nepalese Pagoda'))) { const o = L('Nepal Peace Pagoda', b); K.pitched(o, b.h, 2, '#5a3a22', 'hipped'); P.prism(offsetPoly(b.pts, -1.2), b.h + 1.6, 2, '#6b3f22', 0); K.pitched({ ...o, w: o.w * 0.7, d: o.d * 0.7 }, b.h + 3.6, 1.6, '#5a3a22', 'hipped'); P.cyl(o.cx, b.h + 5, o.cz, 0.3, 2.4, '#d8b04a', 6); }
    if ((b = this.one('Gallery of Modern Art'))) { const o = L('GOMA', b); P.prism(offsetPoly(b.pts, 4), b.h + 1, 0.6, WHITE, 0, { bottom: true }); }
    for (const [n, lab] of [['Queensland Museum', 'Queensland Museum'], ['State Library of Queensland', 'State Library'], ['Queensland Performing Arts Centre', 'QPAC'], ['Queensland Art Gallery', 'Queensland Art Gallery'], ['Brisbane Convention and Exhibition Centre', 'Convention Centre'], ['Queensland Police Headquarters', 'Police HQ'], ['Parliamentary Annexe', 'Parliamentary Annexe']]) if ((b = this.one(n))) L(lab, b);

    // ---- Bridges (by road / path name) ----
    const byName = (n) => World.edges.filter((E) => E.name === n || E.bname === n);
    const chain = (edges) => { // stitch edges into one polyline (longest run)
      if (!edges.length) return null;
      let pts = edges[0].pts.slice();
      const rest = edges.slice(1);
      for (let guard = 0; guard < 50 && rest.length; guard++) {
        const i = rest.findIndex((E) => [E.pts[0], E.pts[E.pts.length - 1]].some((q) => Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) < 1 || Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) < 1));
        if (i < 0) break;
        const E = rest.splice(i, 1)[0], e0 = E.pts[0], last = pts[pts.length - 1];
        if (Math.hypot(e0[0] - last[0], e0[1] - last[1]) < 1) pts = pts.concat(E.pts.slice(1));
        else if (Math.hypot(E.pts[E.pts.length - 1][0] - last[0], E.pts[E.pts.length - 1][1] - last[1]) < 1) pts = pts.concat(E.pts.slice(0, -1).reverse());
        else if (Math.hypot(E.pts[E.pts.length - 1][0] - pts[0][0], E.pts[E.pts.length - 1][1] - pts[0][1]) < 1) pts = E.pts.slice(0, -1).concat(pts);
        else pts = E.pts.slice(1).reverse().concat(pts);
      }
      return pts;
    };
    const along = (pts) => { const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); const len = cum[cum.length - 1];
      return { len, at: (s, off) => { s = clamp(s, 0, len); let k = 1; while (k < cum.length - 1 && cum[k] < s) k++; const p = pts[k - 1], q = pts[k], l = cum[k] - cum[k - 1] || 1, u = (s - cum[k - 1]) / l, tx = (q[0] - p[0]) / l, tz = (q[1] - p[1]) / l; return [p[0] + (q[0] - p[0]) * u + tz * off, p[1] + (q[1] - p[1]) * u - tx * off]; } }; };
    // Story Bridge: steel cantilever truss over the real deck
    const sb = byName('Story Bridge').filter((E) => !E.walk && E.bridge);
    const sbp = chain(sb.length ? sb : byName('Bradfield Highway').filter((E) => E.bridge));
    if (sbp) {
      const A = along(sbp), steel = '#47555e';
      let w0 = 0, w1 = A.len;
      for (let s = 0; s < A.len; s += 2) { const [x, z] = A.at(s, 0); if (World.isWater(x, z)) { w0 = s; break; } }
      for (let s = A.len; s > 0; s -= 2) { const [x, z] = A.at(s, 0); if (World.isWater(x, z)) { w1 = s; break; } }
      const mid = (w0 + w1) / 2, half = (w1 - w0) / 2, t1 = mid - half * 0.62, t2 = mid + half * 0.62;
      const a0 = Math.max(0, w0 - 70), a1 = Math.min(A.len, w1 + 70), hw = Math.max(...sb.map((E) => E.w), 14) / 2 + 2.5;
      const topY = (s) => s <= t1 ? lerp(8, 74, (s - a0) / (t1 - a0)) : s >= t2 ? lerp(74, 8, (s - t2) / (a1 - t2)) : 74 - 40 * Math.sin(((s - t1) / (t2 - t1)) * Math.PI);
      for (const off of [-hw, hw]) {
        let prev = null;
        for (let s = a0; s <= a1 + 0.01; s += 7) {
          const [x, z] = A.at(s, off), ty = topY(s), top = [x, ty, z], bot = [x, 1.2, z];
          P.beam(...bot, ...top, 0.55, steel);
          if (prev) { P.beam(...prev.top, ...top, 1.0, steel); P.beam(...prev.bot, ...bot, 1.0, steel); P.beam(...prev.bot, ...top, 0.4, steel); NE.box(x, ty + 0.6, z, 0.4, 0.4, 0.4, '#fff3c4'); }
          prev = { top, bot };
        }
        for (const s of [t1, t2]) { const [x, z] = A.at(s, off); P.box(x, -6, z, 3.4, 80, 3.4, steel); }
      }
      for (const s of [t1, t2]) for (const y of [70, 52, 34]) { const [ax, az] = A.at(s, -hw), [bx2, bz] = A.at(s, hw); P.beam(ax, y, az, bx2, y, bz, 1.2, steel); }
      const [lx, lz] = A.at(mid, 0); this.label('Story Bridge', lx, lz, 90);
    }
    // Kurilpa Bridge: tensegrity masts
    const ku = chain(byName('Kurilpa Bridge'));
    if (ku) {
      const A = along(ku);
      for (let k = 0; k < 9; k++) {
        const s = lerp(A.len * 0.1, A.len * 0.9, k / 8), sd = k % 2 ? 1 : -1;
        const [x0, z0] = A.at(s, sd * 4), [x1, z1] = A.at(s + rr(-12, 12), sd * rr(9, 16)), h1 = rr(18, 30);
        P.beam(x0, 0, z0, x1, h1, z1, 0.45, '#eeeeee');
        const [x2, z2] = A.at(s + 14, sd * 3); P.beam(x1, h1 - 3, z1, x2, 3, z2, 0.07, '#bbbbbb');
      }
      const [x, z] = A.at(A.len / 2, 0); this.label('Kurilpa Bridge', x, z, 60);
    }
    // Goodwill Bridge: a slender steel arch
    const gw = chain(byName('Goodwill Bridge'));
    if (gw) {
      const A = along(gw), n = 24;
      for (let k = 0; k < n; k++) { const s0 = A.len * (0.25 + 0.5 * k / n), s1 = A.len * (0.25 + 0.5 * (k + 1) / n); const [x0, z0] = A.at(s0, 0), [x1, z1] = A.at(s1, 0); P.beam(x0, 18 * Math.sin(Math.PI * k / n), z0, x1, 18 * Math.sin(Math.PI * (k + 1) / n), z1, 0.7, '#d8d8d8'); }
      const [x, z] = A.at(A.len / 2, 0); this.label('Goodwill Bridge', x, z, 50);
    }
    // Neville Bonner Bridge: single leaning pylon
    const nb = chain(byName('Neville Bonner Bridge'));
    if (nb) { const A = along(nb); const [px, pz] = A.at(A.len * 0.3, 6); P.beam(px, 0, pz, px, 45, pz, 1.6, WHITE); for (let k = 1; k <= 6; k++) for (const sd of [-1, 1]) { const [cx, cz] = A.at(A.len * 0.3 + sd * k * 9, 0); P.beam(px, 44 - k * 2, pz, cx, 6, cz, 0.1, '#ccc'); } const [x, z] = A.at(A.len / 2, 0); this.label('Neville Bonner Bridge', x, z, 50); }
    for (const n of ['Victoria Bridge', 'Captain Cook Bridge', 'Go Between Bridge', 'William Jolly Bridge', 'Kangaroo Point Bridge', 'Merivale Bridge']) {
      const e = byName(n)[0];
      if (e) { const m = e.pts[e.pts.length >> 1]; this.label(n, m[0], m[1], 50); }
    }

    // ---- South Bank: the Wheel, the BRISBANE sign ----
    {
      const [wx, wz] = ll(-27.47547, 153.02085);
      const wheel = new THREE.Group(), steel = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(28, 0.5, 6, 64), steel));
      for (let k = 0; k < 20; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 28, 0.2), steel); s.rotation.z = (k / 20) * TAU; s.position.set(Math.sin(-s.rotation.z) * 14, Math.cos(s.rotation.z) * 14, 0); wheel.add(s); }
      wheel.position.set(wx, 31, wz); wheel.rotation.y = 0.6; scene.add(wheel);
      const podMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3366ff, emissiveIntensity: 0 });
      World.nightMats.push(podMat);
      const pods = [];
      for (let k = 0; k < 42; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 2), podMat); scene.add(p); pods.push(p); }
      const ux = Math.cos(0.6), uz = -Math.sin(0.6);
      const nxw = Math.sin(0.6), nzw = Math.cos(0.6);
      for (const sd of [-1, 1]) for (const sz of [-1, 1]) P.beam(wx + ux * sd * 12 + nxw * sz * 4, 0, wz + uz * sd * 12 + nzw * sz * 4, wx, 31, wz, 0.9, '#dddddd');
      addCol(wx - 6, wx + 6, wz - 6, wz + 6, 6);
      World.anim.push({ update: (dt, t) => {
        wheel.rotation.z = t * 0.05;
        pods.forEach((p, k) => { const a = t * 0.05 + (k / pods.length) * TAU, h = Math.sin(a) * 28; p.position.set(wx + ux * h, 31 - Math.cos(a) * 28 - 1.4, wz + uz * h); p.rotation.y = 0.6; });
      } });
      this.label('Wheel of Brisbane', wx, wz, 35);
      const [sx, sz] = ll(-27.47575, 153.02125);
      const tex = canvasTex(1024, 160, (g) => { g.clearRect(0, 0, 1024, 160); g.font = 'bold 140px Arial Black, Arial'; g.textBaseline = 'middle'; const cols = ['#e83f6f', '#ffbf00', '#2fbfe6', '#7ac943', '#9b5cff', '#ff7a2f', '#e83f6f', '#2fbfe6']; let xx = 20; 'BRISBANE'.split('').forEach((c, k) => { g.fillStyle = cols[k]; g.fillText(c, xx, 84); xx += g.measureText(c).width + 6; }); }, false);
      tex.encoding = THREE.sRGBEncoding;
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
      sgn.position.set(sx, 1.7, sz); sgn.rotation.y = 0.6; scene.add(sgn);
      const [bx, bz] = ll(-27.4777, 153.0236); this.label('Streets Beach', bx, bz, 40);
    }

    // ---- XXXX Brewery sign (Milton) ----
    {
      const [x, z] = ll(-27.46695, 153.00475);
      const host = World.blds.filter((q) => !q.part && pip(x, z, q.pts)).sort((a, c) => c.h - a.h)[0];
      const hgt = host ? host.h : 12;
      P.box(x, hgt, z, 1, 6, 1, '#444');
      sign('XXXX', x, hgt + 9, z, 26, 8, 0.3, '#f2c230', '#d6201b', 'bold 120px Impact, Arial Black');
      this.label('XXXX Brewery', x, z, 50);
    }

    // ---- Stadiums: tint the stands, add the Gabba's light towers ----
    for (const [name, lat, lon, seat, lights] of [['Suncorp Stadium', -27.46475, 153.00955, '#7a1f3d', false], ['The Gabba', -27.48585, 153.03815, '#d9d9d9', true]]) {
      const [x, z] = ll(lat, lon);
      const area = World.areas.filter((a) => (a.t === 'stadium' || a.t === 'pitch') && pip(x, z, a.pts)).sort((a, c) => Math.abs(polyArea(c.pts)) - Math.abs(polyArea(a.pts)))[0];
      this.label(name, x, z, 110);
      if (!area) continue;
      const o = obb(area.pts);
      if (lights) for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const c0 = Math.cos(o.ang), s0 = Math.sin(o.ang), px = o.cx + (u * o.w / 2) * c0 + (v * o.d / 2) * s0, pz = o.cz - (u * o.w / 2) * s0 + (v * o.d / 2) * c0;
        P.box(px, 0, pz, 1.6, 64, 1.6, '#9a9a9a'); NE.box(px, 64, pz, 9, 6, 1.4, '#fffbe8'); addCol(px - 1, px + 1, pz - 1, pz + 1, 64);
      }
      for (const q of World.blds) { if (!q.part && q.h > 8 && pip(...polyCenter(q.pts), area.pts)) { P.prism(offsetPoly(q.pts, 0.05), q.h - 1, 1.2, seat, 0, { cap: false }); } }
    }

    // ---- Kangaroo Point Cliffs (real cliff lines) ----
    for (const c of World.data.cliffs) {
      const pts = unflat(c);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b2 = pts[k], L2 = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
        for (let s = 0; s < L2; s += 5) {
          const x = a[0] + (b2[0] - a[0]) * (s / L2), z = a[1] + (b2[1] - a[1]) * (s / L2), h = 12 + Math.sin(x * 0.3 + z * 0.2) * 4 + rand(0, 3);
          P.box(x, 0, z, 6, h, 5.5, rp(['#a8754a', '#9c6a43', '#b58457']), Math.atan2(b2[0] - a[0], b2[1] - a[1]));
          addCol(x - 2.8, x + 2.8, z - 2.8, z + 2.8, h);
        }
      }
    }
    { const [x, z] = ll(-27.4772, 153.0335); this.label('Kangaroo Point Cliffs', x, z, 70); }

    // ---- Suburb and precinct names for the big map ----
    for (const [n, lat, lon] of [['Howard Smith Wharves', -27.4637, 153.0363], ['Queen St Mall', -27.4699, 153.0255], ['King George Square', -27.4686, 153.0237], ['Anzac Square', -27.4664, 153.0263], ['City Botanic Gardens', -27.4752, 153.0300], ['Roma Street Parkland', -27.4630, 153.0185], ['Chinatown', -27.4575, 153.0335], ['Brunswick St Mall', -27.4572, 153.0355], ['New Farm Park', -27.4699, 153.0520], ['Victoria Park', -27.4560, 153.0190], ['Musgrave Park', -27.4800, 153.0130], ["Queen's Wharf", -27.4724, 153.0222], ['Eagle St Pier', -27.4685, 153.0305]]) {
      const [x, z] = ll(lat, lon); this.label(n, x, z, 45);
    }
  },
};

function polyCenter(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
