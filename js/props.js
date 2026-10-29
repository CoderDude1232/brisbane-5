'use strict';
// Street furniture and riverbank detail: lights, signals, crossings, bus stops, power poles,
// bins, mangroves, the Riverwalk and CityCat terminals.

function buildProps(K) {
  const { P, PS, GR, NE, rng, rp } = K;
  const zoneAt = (x, z) => { const b = World.blockAt(x, z); return b ? b.zone : 'suburb'; };
  const URBAN = new Set(['cbd', 'mid', 'valley', 'southbank', 'industrial', 'park']);
  const BUSY = new Set(['cbd', 'mid', 'valley']);
  const pole = '#5a5f63';

  // Street light: pole on the footpath with an arm reaching over the road (dx,dz points at the road).
  const streetLight = (x, z, dx, dz, h = 7.5) => {
    PS.box(x, 0, z, 0.2, h, 0.2, pole);
    PS.box(x + dx * 0.9, h - 0.15, z + dz * 0.9, dx ? 1.9 : 0.12, 0.12, dz ? 1.9 : 0.12, pole);
    NE.box(x + dx * 1.75, h - 0.35, z + dz * 1.75, dx ? 0.7 : 0.35, 0.14, dz ? 0.7 : 0.35, '#fff1c8');
    addCol(x - 0.2, x + 0.2, z - 0.2, z + 0.2, h, 0, 'prop');
  };

  // ---- Per road segment ----
  const edges = [];
  for (let i = 0; i < NL - 1; i++) for (let j = 0; j < NL; j++) { const t = World.H[i * NL + j]; if (t === 1 || t === 2) edges.push({ x0: lineC(i), z0: lineC(j), x1: lineC(i + 1), z1: lineC(j), h: true, t, id: i * 31 + j * 7 }); }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NL - 1; j++) { const t = World.V[i * NL + j]; if (t === 1 || t === 2) edges.push({ x0: lineC(i), z0: lineC(j), x1: lineC(i), z1: lineC(j + 1), h: false, t, id: i * 17 + j * 29 }); }
  for (const e of edges) {
    const len = e.h ? e.x1 - e.x0 : e.z1 - e.z0;
    const at = (s, off) => (e.h ? [e.x0 + s, e.z0 + off] : [e.x0 + off, e.z0 + s]);
    if (e.t === 2) { // bridge lamps along the railings
      for (let s = 18; s < len - 12; s += 24) for (const side of [-1, 1]) {
        const [x, z] = at(s + (side > 0 ? 12 : 0), side * 10.6);
        if (!World.isWater(x, z)) continue;
        PS.box(x, 0, z, 0.2, 7, 0.2, pole);
        NE.box(x - (e.h ? 0 : side * 0.6), 6.9, z - (e.h ? side * 0.6 : 0), e.h ? 0.35 : 0.9, 0.14, e.h ? 0.9 : 0.35, '#fff1c8');
      }
      continue;
    }
    for (const side of [-1, 1]) {
      const [mx, mz] = at(len / 2, side * 18);
      const zone = zoneAt(mx, mz);
      if (zone === 'mountain' || zone === 'suburb') continue;
      if (World.isWater(mx, mz)) continue;
      const s = len * (side < 0 ? 0.3 : 0.7);
      const [x, z] = at(s, side * 9.4);
      if (!World.isWater(x, z) && !pointInBuilding(x, 1, z)) streetLight(x, z, e.h ? 0 : -side, e.h ? -side : 0);
      // Bus stop on some urban streets
      if (URBAN.has(zone) && (e.id + (side > 0 ? 3 : 0)) % 5 === 0) {
        const [bx, bz] = at(len * 0.5, side * 8.9);
        if (World.isWater(bx, bz) || pointInBuilding(bx, 1, bz)) continue;
        const L = 3.8, alongX = e.h;
        PS.box(bx + (alongX ? 0 : side * 0.6), 0, bz + (alongX ? side * 0.6 : 0), alongX ? L : 0.08, 2.4, alongX ? 0.08 : L, '#9fc3d8');
        PS.box(bx, 2.4, bz, alongX ? L + 0.4 : 1.8, 0.15, alongX ? 1.8 : L + 0.4, '#3d4246');
        PS.box(bx + (alongX ? 0 : side * 0.3), 0, bz + (alongX ? side * 0.3 : 0), alongX ? L - 0.6 : 0.5, 0.5, alongX ? 0.5 : L - 0.6, '#6d5038');
        const [sx, sz] = at(len * 0.5 + 2.6, side * 7.6);
        PS.box(sx, 0, sz, 0.1, 2.6, 0.1, '#888'); NE.box(sx, 2.3, sz, 0.5, 0.5, 0.06, '#ffd23a');
        addCol(bx - (alongX ? L / 2 : 0.4), bx + (alongX ? L / 2 : 0.4), bz - (alongX ? 0.4 : L / 2), bz + (alongX ? 0.4 : L / 2), 2.6, 0, 'prop');
      }
    }
  }

  // ---- Power poles + wires along suburban streets (with the street light bolted on) ----
  const poleLine = (pts, dirx, dirz) => {
    let prev = null;
    for (const p of pts) {
      if (!p) { prev = null; continue; }
      const [x, z] = p;
      PS.box(x, 0, z, 0.32, 9, 0.32, '#6b5844');
      PS.box(x, 8.4, z, dirz ? 2.6 : 0.16, 0.16, dirz ? 0.16 : 2.6, '#6b5844');
      addCol(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 9, 0, 'prop');
      if (rng() < 0.5) { PS.box(x + dirx * 0.9, 6.6, z + dirz * 0.9, dirx ? 1.8 : 0.1, 0.1, dirx ? 0.1 : 1.8, pole); NE.box(x + dirx * 1.7, 6.45, z + dirz * 1.7, dirx ? 0.6 : 0.3, 0.12, dirx ? 0.3 : 0.6, '#fff1c8'); }
      if (prev) for (const o of [-1.1, 1.1]) {
        const ox = dirz ? o : 0, oz = dirx ? o : 0;
        PS.beam(prev[0] + ox, 8.5, prev[1] + oz, x + ox, 8.5, z + oz, 0.05, '#2a2a2a');
      }
      prev = p;
    }
  };
  for (let j = 0; j < NL; j++) { // along horizontal streets, south footpath
    const pts = [];
    for (let i = 0; i < NL - 1; i++) {
      const ok = World.H[i * NL + j] === 1 && zoneAt(lineC(i) + 30, lineC(j) + 18) === 'suburb';
      for (const s of [15, 45]) { const x = lineC(i) + s, z = lineC(j) + 9.5; pts.push(ok && !World.isWater(x, z) ? [x, z] : null); }
    }
    poleLine(pts, 0, -1);
  }
  for (let i = 0; i < NL; i++) { // along vertical streets, east footpath
    const pts = [];
    for (let j = 0; j < NL - 1; j++) {
      const ok = World.V[i * NL + j] === 1 && zoneAt(lineC(i) + 18, lineC(j) + 30) === 'suburb';
      for (const s of [15, 45]) { const x = lineC(i) + 9.5, z = lineC(j) + s; pts.push(ok && !World.isWater(x, z) ? [x, z] : null); }
    }
    poleLine(pts, -1, 0);
  }

  // ---- Intersections: signals, zebra crossings, bins ----
  for (let i = 0; i < NL; i++) for (let j = 0; j < NL; j++) {
    const nb = World.neighbors(i, j);
    if (nb.length < 3) continue;
    const x = lineC(i), z = lineC(j);
    const zones = [zoneAt(x + 18, z + 18), zoneAt(x - 18, z - 18), zoneAt(x + 18, z - 18), zoneAt(x - 18, z + 18)];
    const busy = zones.filter((zz) => BUSY.has(zz)).length >= 2;
    if (!busy) continue;
    for (const [cx, cz, ph] of [[1, 1, 0], [-1, -1, 0], [1, -1, 1], [-1, 1, 1]]) {
      const px = x + cx * 9.4, pz = z + cz * 9.4;
      if (World.isWater(px, pz) || pointInBuilding(px, 1, pz)) continue;
      PS.box(px, 0, pz, 0.18, 4.4, 0.18, '#3a3d40');
      PS.box(px, 2.9, pz, 0.45, 1.4, 0.45, '#1f2224');
      NE.box(px - cz * 0.24, ph ? 3.9 : 3.15, pz + cx * 0.24, 0.25, 0.25, 0.25, ph ? '#ff2a2a' : '#2aff5a');
      addCol(px - 0.25, px + 0.25, pz - 0.25, pz + 0.25, 4.4, 0, 'prop');
      if (rng() < 0.35) { // public bin (and a bin chicken magnet)
        const bx = px - cx * 2.2, bz = pz;
        PS.cyl(bx, 0, bz, 0.35, 1.0, '#2f6b3a', 8); PS.cyl(bx, 1.0, bz, 0.4, 0.12, '#e3c21b', 8);
      }
    }
    for (const [ni, nj] of nb) { // zebra crossing on each approach
      const dx = ni - i, dz = nj - j;
      for (let k = -3; k <= 3; k++) {
        const W = [0.49, 0.1, 0.51, 0.12];
        if (dx) K.RD.quad(x + dx * 7.6 - (dx < 0 ? 2.2 : 0), z + k * 1.9 - 0.5, x + dx * 7.6 + (dx > 0 ? 2.2 : 0), z + k * 1.9 + 0.5, 0.1, '#ffffff', W);
        else K.RD.quad(x + k * 1.9 - 0.5, z + dz * 7.6 - (dz < 0 ? 2.2 : 0), x + k * 1.9 + 0.5, z + dz * 7.6 + (dz > 0 ? 2.2 : 0), 0.1, '#ffffff', W);
      }
    }
  }

  // ---- Riverbanks: mangroves, the Riverwalk and CityCat terminals ----
  const pts = World.river, n = pts.length;
  const nearRoad = (x, z) => { const dx = Math.abs(x - Math.round((x - ORIGIN) / GRID) * GRID - ORIGIN), dz = Math.abs(z - Math.round((z - ORIGIN) / GRID) * GRID - ORIGIN); return dx < 12 || dz < 12; };
  const walkZones = new Set(['cbd']);
  for (let k = 2; k < n - 2; k += 2) {
    const a = pts[k - 2], b = pts[k + 2], p = pts[k];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    for (const side of [-1, 1]) {
      const lx = p.x + nx * side * (RIVER_HW + 6), lz = p.z + nz * side * (RIVER_HW + 6);
      if (World.isWater(lx, lz)) continue;
      const zone = zoneAt(lx, lz);
      const sub = World.suburbAt(lx, lz)[0];
      if (walkZones.has(zone) || sub === 'New Farm' || sub === 'Kangaroo Point') {
        // Riverwalk boardwalk floating just off the bank
        const wx = p.x + nx * side * (RIVER_HW - 1.5), wz = p.z + nz * side * (RIVER_HW - 1.5);
        if (World.onBridge(wx, wz)) continue;
        PS.add(UNIT_BOX, M(wx, 0.25, wz, 4, 0.35, 8.4, 0, Math.atan2(tx, tz), 0), '#b9b2a2');
        const rx = wx - nx * side * 2, rz = wz - nz * side * 2;
        PS.add(UNIT_BOX, M(rx, 1.0, rz, 0.08, 0.08, 8.4, 0, Math.atan2(tx, tz), 0), '#777');
        if (k % 8 === 0) { PS.box(rx, 0.4, rz, 0.1, 0.7, 0.1, '#777'); NE.box(rx, 1.15, rz, 0.15, 0.15, 0.15, '#fff1c8'); }
        continue;
      }
      if (zone === 'southbank' || zone === 'cbd' || nearRoad(lx, lz) || k % 4) continue;
      for (let c = 0; c < 2; c++) {
        const mx = p.x + nx * side * (RIVER_HW + rand(0, 3)), mz = p.z + nz * side * (RIVER_HW + rand(0, 3));
        if (World.onBridge(mx, mz)) continue;
        PS.add(ICO, M(mx + rand(-2, 2), 0.7, mz + rand(-2, 2), rand(2, 3.2), rand(1, 1.6), rand(2, 3.2), 0, rand(0, 3)), rp(['#2f4f2a', '#38592f', '#2a4626']));
      }
    }
  }
  World.labels.push({ name: 'Brisbane Riverwalk', x: 470, z: -150, r: 40 });

  const terminals = [['Eagle St Pier', 150, -40], ['North Quay', -250, 200], ['South Bank', 30, 238], ['New Farm Park', 520, 60],
    ['Bulimba', 590, -40], ['Hawthorne', 560, 140], ['Regatta', -650, 95], ['UQ St Lucia', -760, 90], ['Mowbray Park', 430, 90], ['Teneriffe', 640, -380]];
  for (const [name, tx, tz] of terminals) {
    let best = null, bd = 1e9;
    for (const p of pts) { const d = (p.x - tx) ** 2 + (p.z - tz) ** 2; if (d < bd) { bd = d; best = p; } }
    if (!best) continue;
    const ux = (tx - best.x), uz = (tz - best.z), ul = Math.hypot(ux, uz) || 1;
    const px = best.x + (ux / ul) * (RIVER_HW - 6), pz = best.z + (uz / ul) * (RIVER_HW - 6);
    const ry = Math.atan2(ux, uz);
    PS.add(UNIT_BOX, M(px, 0.3, pz, 12, 0.6, 6, 0, ry, 0), '#d8d6d0');
    PS.add(UNIT_BOX, M(px, 3.2, pz, 10, 0.2, 5, 0, ry, 0), '#1f4ea8');
    for (const [a, c] of [[-4.5, -2], [4.5, -2], [-4.5, 2], [4.5, 2]]) {
      const cos = Math.cos(ry), sin = Math.sin(ry);
      PS.box(px + a * cos + c * sin, 0.6, pz - a * sin + c * cos, 0.15, 2.6, 0.15, '#ddd');
    }
    PS.add(UNIT_BOX, M(px + (ux / ul) * 6, 0.9, pz + (uz / ul) * 6, 2, 0.3, 7, 0, ry, 0), '#a8a6a0');
    World.labels.push({ name: 'CityCat: ' + name, x: px, z: pz, r: 14 });
  }
}
