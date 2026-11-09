'use strict';
// Street furniture placed from real OpenStreetMap features: traffic signals (working), lamps,
// bus stops, pedestrian crossings, suburban power lines, mangroves, the Riverwalk and CityCat terminals.

// ---- Working traffic lights ----
const Signals = {
  junctions: [], byNode: new Map(),
  // Two phases per junction: approaches roughly parallel to the junction's main axis, then the rest.
  group(j, tx, tz) { return Math.abs(Math.cos(Math.atan2(tx, tz) - j.axis)) > 0.7 ? 0 : 1; },
  phase(j, t) { const c = (t + j.off) % 44; return c < 19 ? 0 : c < 22 ? 2 : c < 41 ? 1 : 3; }, // 2/3 = all-red
  isGreen(j, grp, t) { return this.phase(j, t) === grp; },
  redAhead(v, ai) {
    const E = World.edges[ai.e];
    const node = ai.dir > 0 ? E.b : E.a;
    const j = this.byNode.get(node);
    if (!j) return false;
    const rem = E.len - ai.s;
    if (rem > 26 || rem < j.r + 1) return false;
    const [, , tx, tz] = World.pointAt(ai.e, ai.dir, E.len);
    return !this.isGreen(j, this.group(j, tx, tz), G.t);
  },
  build(K, pts) {
    for (let i = 0; i < pts.length; i += 2) {
      const n = World.nearestNode(pts[i], pts[i + 1], true);
      if (n === null || this.byNode.has(n)) continue;
      const x = World.nodeX[n], z = World.nodeZ[n];
      if (Math.hypot(x - pts[i], z - pts[i + 1]) > 28) continue;
      const inc = World.adj[n].filter((it) => World.edges[it.e].car);
      if (inc.length < 2) continue;
      const first = World.pointAt(inc[0].e, inc[0].dir, 0);
      const j = { n, x, z, axis: Math.atan2(first[2], first[3]), off: (n * 7.31) % 44, r: Math.max(...inc.map((it) => World.edges[it.e].w)) / 2, heads: [] };
      // one pole per approach, on the kerb to the left of incoming traffic, facing it
      for (const it of inc) {
        const E = World.edges[it.e];
        if (E.oneway && it.dir === 1) continue; // traffic only leaves the junction on this edge
        const [px, pz, tx, tz] = World.pointAt(it.e, it.dir, Math.min(E.len * 0.5, j.r + 2));
        // incoming direction is -t; its left side is (−tz, tx)... kerb at +(tz,−tx) relative to outgoing
        const ox = px - tz * (E.w / 2 + 1.2), oz = pz + tx * (E.w / 2 + 1.2);
        Detail.add(ox, oz, 'fn', ({ PS, P }) => { PS.box(ox, 0, oz, 0.18, 4.6, 0.18, '#3a3d40'); P.box(ox, 3.0, oz, 0.42, 1.3, 0.42, '#1f2224', Math.atan2(tx, tz)); });
        addCol(ox - 0.2, ox + 0.2, oz - 0.2, oz + 0.2, 4.6, 0, 'prop');
        j.heads.push({ x: ox + tx * 0.24, z: oz + tz * 0.24, grp: this.group(j, -tx, -tz) });
      }
      this.junctions.push(j);
      this.byNode.set(n, j);
    }
    // Lamp meshes are pooled and attached to the heads near the camera.
    const geo = new THREE.SphereGeometry(0.13, 8, 6);
    this.mats = { r: new THREE.MeshBasicMaterial({ color: 0xff2a1a }), a: new THREE.MeshBasicMaterial({ color: 0xffb21a }), g: new THREE.MeshBasicMaterial({ color: 0x2aff6a }) };
    this.pool = [];
    for (let k = 0; k < 220; k++) { const m = new THREE.Mesh(geo, this.mats.r); m.visible = false; K.scene.add(m); this.pool.push(m); }
    this.t = 0;
  },
  update(dt, cx, cz) {
    this.t -= dt;
    if (this.t > 0 || !this.pool) return;
    this.t = 0.2;
    let k = 0;
    for (const j of this.junctions) {
      if (Math.abs(j.x - cx) > 170 || Math.abs(j.z - cz) > 170) continue;
      const ph = this.phase(j, G.t);
      for (const h of j.heads) {
        if (k >= this.pool.length) break;
        const m = this.pool[k++];
        const green = ph === h.grp, amber = (ph === 2 && h.grp === 0) || (ph === 3 && h.grp === 1);
        m.material = green ? this.mats.g : amber ? this.mats.a : this.mats.r;
        m.position.set(h.x, green ? 3.15 : amber ? 3.6 : 4.05, h.z);
        m.visible = true;
      }
    }
    for (; k < this.pool.length; k++) this.pool[k].visible = false;
  },
};

function buildProps(K) {
  const { rp } = K;
  // Visuals for small street furniture are streamed in near the camera; colliders stay resident.
  const near = (x, z, draw) => Detail.add(x, z, 'fn', draw);
  const d = World.data;
  const pole = '#5a5f63';
  const nearCar = (x, z, r) => World.nearestEdge(x, z, r, (E) => !E.walk);

  Signals.build(K, d.pois.signals);

  // ---- Street lights: real mapped lamps plus a regular run along main and inner-city roads ----
  const lamp = (x, z, tx, tz) => { // (tx,tz) points from the lamp to the road
    if (pointInBuilding(x, 1, z) || World.isWater(x, z)) return;
    near(x, z, ({ PS, NE }) => {
      PS.box(x, 0, z, 0.2, 7.5, 0.2, pole);
      PS.beam(x, 7.4, z, x + tx * 1.9, 7.4, z + tz * 1.9, 0.12, pole);
      NE.box(x + tx * 1.8, 7.2, z + tz * 1.8, 0.45, 0.14, 0.45, '#fff1c8');
    });
    addCol(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 7.5, 0, 'prop');
  };
  for (let i = 0; i < d.pois.lamp.length; i += 2) {
    const x = d.pois.lamp[i], z = d.pois.lamp[i + 1], n = nearCar(x, z, 25);
    if (!n) continue;
    const [px, pz] = World.pointAt(n.e, 1, n.s), l = Math.hypot(px - x, pz - z) || 1;
    lamp(x, z, (px - x) / l, (pz - z) / l);
  }
  for (const E of World.edges) {
    if (E.walk || E.bridge || E.cls > 7 || E.len < 30) continue;
    const zone = World.zoneAt(E.pts[0][0], E.pts[0][1]);
    if (E.cls >= 5 && zone === 'suburb') continue; // suburbs: lamps hang off the power poles
    for (let s = 15, side = 1; s < E.len - 10; s += 46, side = -side) {
      const [x, z, tx, tz] = World.pointAt(E.i, 1, s);
      const o = E.w / 2 + 2.2;
      lamp(x + tz * o * side, z - tx * o * side, -tz * side, tx * side);
    }
  }

  // ---- Bus stops (real locations) ----
  for (let i = 0; i < d.pois.bus.length; i += 2) {
    const x = d.pois.bus[i], z = d.pois.bus[i + 1], n = nearCar(x, z, 20);
    if (!n || pointInBuilding(x, 1, z) || World.isWater(x, z)) continue;
    const [px, pz, tx, tz] = World.pointAt(n.e, 1, n.s);
    const ry = Math.atan2(tx, tz), side = Math.sign((x - px) * tz - (z - pz) * tx) || 1;
    const E = World.edges[n.e], o = E.w / 2 + 2.6;
    const bx = px + tz * o * side, bz = pz - tx * o * side;
    if (pointInBuilding(bx, 1, bz)) continue;
    const back = [bx + tz * 0.7 * side, bz - tx * 0.7 * side];
    near(bx, bz, ({ PS, NE }) => {
      PS.box(back[0], 0, back[1], 0.08, 2.4, 3.8, '#9fc3d8', ry + Math.PI / 2);
      PS.box(bx, 2.4, bz, 1.9, 0.14, 4.2, '#3d4246', ry);
      PS.box(bx + tz * 0.35 * side, 0, bz - tx * 0.35 * side, 0.5, 0.48, 3.2, '#6d5038', ry);
      PS.box(bx + tx * 2.6, 0, bz + tz * 2.6, 0.1, 2.6, 0.1, '#888');
      NE.box(bx + tx * 2.6, 2.3, bz + tz * 2.6, 0.06, 0.5, 0.5, '#ffd23a');
    });
    addCol(bx - 1, bx + 1, bz - 1, bz + 1, 2.6, 0, 'prop');
  }

  // ---- Zebra crossings (real crossing nodes on roads) ----
  const W = [0.49, 0.1, 0.51, 0.12];
  for (let i = 0; i < d.pois.crossing.length; i += 2) {
    const x = d.pois.crossing[i], z = d.pois.crossing[i + 1], n = nearCar(x, z, 3);
    if (!n) continue;
    const E = World.edges[n.e];
    if (E.cls <= 1 || E.cls >= 8) continue;
    const [px, pz, tx, tz] = World.pointAt(n.e, 1, n.s);
    near(px, pz, ({ RD }) => {
      for (let k = -Math.floor(E.w / 2 / 1.1); k <= Math.floor(E.w / 2 / 1.1); k++) {
        const cx = px + tz * k * 1.1, cz = pz - tx * k * 1.1;
        RD.add(UNIT_BOX, M(cx, 0.08, cz, 0.55, 0.02, 3.2, 0, Math.atan2(tx, tz), 0), '#ffffff', () => W);
      }
    });
  }

  // ---- Power poles and wires along suburban streets (with lamps bolted on) ----
  for (const E of World.edges) {
    if (E.walk || E.cls < 5 || E.cls > 7 || E.len < 25) continue;
    if (World.zoneAt(E.pts[0][0], E.pts[0][1]) === 'cbd') continue;
    let prev = null;
    for (let s = 10; s < E.len - 5; s += 42) {
      const [x0, z0, tx, tz] = World.pointAt(E.i, 1, s);
      const o = E.w / 2 + 2.4, x = x0 + tz * o, z = z0 - tx * o;
      if (pointInBuilding(x, 1, z) || World.isWater(x, z)) { prev = null; continue; }
      const pv = prev, withLamp = (s / 42) % 2 < 1;
      near(x, z, ({ PS, NE }) => {
        PS.box(x, 0, z, 0.32, 9, 0.32, '#6b5844');
        PS.box(x, 8.4, z, 2.6, 0.16, 0.16, '#6b5844', Math.atan2(tz, -tx));
        if (withLamp) { PS.beam(x, 6.6, z, x - tz * 1.8, 6.6, z + tx * 1.8, 0.1, pole); NE.box(x - tz * 1.7, 6.45, z + tx * 1.7, 0.4, 0.12, 0.4, '#fff1c8'); }
        if (pv) for (const off of [-1.1, 1.1]) PS.beam(pv[0] + pv[2] * off, 8.5, pv[1] + pv[3] * off, x + tx * off, 8.5, z + tz * off, 0.04, '#2a2a2a');
      });
      addCol(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 9, 0, 'prop');
      prev = [x, z, tx, tz];
    }
  }

  const { PS } = K;
  // ---- Riverbanks: mangroves in the suburbs, the Riverwalk boardwalk past the CBD and New Farm ----
  for (const w of d.water) {
    if (w.t !== 'river') continue;
    const pts = unflat(w.p);
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1 || a[0] < World.bounds.x0 || a[0] > World.bounds.x1 || a[1] < World.bounds.z0 || a[1] > World.bounds.z1) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      const sub = World.suburbAt(a[0], a[1])[0];
      // which side is land?
      const lx = a[0] + tz * 4, lz = a[1] - tx * 4, landSide = World.isWater(lx, lz) ? -1 : 1;
      if (sub === 'Brisbane CBD' || sub === 'New Farm' || sub === 'Kangaroo Point') {
        if (L > 3 && !World.onBridge(a[0], a[1])) {
          const ox = -tz * 3 * landSide, oz = tx * 3 * landSide;
          PS.add(UNIT_BOX, M((a[0] + b[0]) / 2 + ox, 0.25, (a[1] + b[1]) / 2 + oz, 4, 0.35, L + 0.3, 0, Math.atan2(tx, tz), 0), '#b9b2a2');
          PS.add(UNIT_BOX, M((a[0] + b[0]) / 2 + ox * 1.66, 1.0, (a[1] + b[1]) / 2 + oz * 1.66, 0.08, 0.08, L + 0.3, 0, Math.atan2(tx, tz), 0), '#777');
        }
        continue;
      }
      if (World.zoneAt(a[0], a[1]) === 'southbank' || World.onBridge(a[0], a[1]) || (k % 3)) continue;
      for (let s = 0; s < L; s += 7) {
        const mx = a[0] + tx * s - tz * 2 * landSide * -1, mz = a[1] + tz * s + tx * 2 * landSide * -1;
        if (nearCar(mx, mz, 8)) continue;
        const c = rp(['#2f4f2a', '#38592f', '#2a4626']), mtx = M(mx + rand(-1.5, 1.5), 0.7, mz + rand(-1.5, 1.5), rand(2, 3.2), rand(1, 1.6), rand(2, 3.2), 0, rand(0, 3));
        near(mx, mz, ({ PS }) => PS.add(ICO, mtx, c));
      }
    }
  }
  World.labels.push({ name: 'Brisbane Riverwalk', x: ll(-27.4640, 153.0400)[0], z: ll(-27.4640, 153.0400)[1], r: 60 });

  // ---- CityCat terminals (real ones) ----
  for (const [x, z, name] of d.pois.ferry) {
    // find the water direction
    let best = null;
    for (let a = 0; a < 16; a++) { const ang = (a / 16) * TAU; for (let r = 4; r <= 40; r += 4) { if (World.inRiver(x + Math.cos(ang) * r, z + Math.sin(ang) * r)) { if (!best || r < best[1]) best = [ang, r]; break; } } }
    if (!best) continue;
    const ux = Math.cos(best[0]), uz = Math.sin(best[0]);
    const px = x + ux * (best[1] + 6), pz = z + uz * (best[1] + 6), ry = Math.atan2(ux, uz);
    PS.add(UNIT_BOX, M(px, 0.3, pz, 13, 0.6, 6, 0, ry, 0), '#d8d6d0');
    PS.add(UNIT_BOX, M(px, 3.2, pz, 11, 0.2, 5, 0, ry, 0), '#1f4ea8');
    for (const [a, c] of [[-4.5, -2], [4.5, -2], [-4.5, 2], [4.5, 2]]) { const co = Math.cos(ry), si = Math.sin(ry); PS.box(px + a * co + c * si, 0.6, pz - a * si + c * co, 0.15, 2.6, 0.15, '#ddd'); }
    PS.add(UNIT_BOX, M((x + px) / 2, 0.9, (z + pz) / 2, 2, 0.3, Math.hypot(px - x, pz - z), 0, ry, 0), '#a8a6a0');
    World.labels.push({ name: 'CityCat: ' + name, x: px, z: pz, r: 14 });
  }
}
