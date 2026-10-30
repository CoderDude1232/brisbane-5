'use strict';
// Low-poly people, vehicles, birds and the police chopper. Everything faces +z.

const _matCache = new Map();
function matC(color, emissive) {
  const k = color + '|' + (emissive || '');
  let m = _matCache.get(k);
  if (!m) {
    m = mkMat({ color, roughness: 0.7, metalness: 0.05 });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1.6; }
    _matCache.set(k, m);
  }
  return m;
}
const _boxCache = new Map();
function boxGeo(w, h, d) {
  const k = w + ',' + h + ',' + d;
  let g = _boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _boxCache.set(k, g); }
  return g;
}
function bx(parent, w, h, d, color, x, y, z, emissive) {
  const m = new THREE.Mesh(boxGeo(w, h, d), matC(color, emissive));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const SKINS = ['#f1c7a5', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a24', '#f6d5bd'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ecf0f1', '#34495e', '#e67e22', '#1abc9c', '#7a1f3d', '#ff6fa8', '#222'];
const PANTS = ['#2c3e66', '#3b3b3b', '#c2b280', '#1f2a44', '#6b4f3a', '#4a6a8a', '#e8e8e8'];
const HAIRS = ['#2b1d12', '#5a3a1e', '#d9b45a', '#111', '#8a8a8a', '#a0522d'];

// Rounded limbs: tapered cylinders and spheres (cached geometry per size).
const _cyCache = new Map();
function cy(parent, rt, rb, h, color, x, y, z, sz = 1) {
  const k = rt + ',' + rb + ',' + h;
  let geo = _cyCache.get(k);
  if (!geo) { geo = new THREE.CylinderGeometry(rt, rb, h, 10); _cyCache.set(k, geo); }
  const m = new THREE.Mesh(geo, matC(color));
  m.position.set(x, y, z); m.scale.z = sz; m.castShadow = true;
  parent.add(m);
  return m;
}
const _sph = new THREE.SphereGeometry(1, 12, 8);
function sp(parent, r, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(_sph, matC(color));
  m.position.set(x, y, z); m.scale.set(r * sx, r * sy, r * sz); m.castShadow = true;
  parent.add(m);
  return m;
}

function makePerson(o = {}) {
  const skin = o.skin || pick(SKINS), shirt = o.shirt || pick(SHIRTS), pants = o.pants || pick(PANTS), hair = o.hair || pick(HAIRS);
  const g = new THREE.Group();
  const hip = new THREE.Group(); hip.position.y = 0.95; g.add(hip);
  const torso = cy(hip, 0.25, 0.2, 0.62, shirt, 0, 0.38, 0, 0.62);
  sp(hip, 0.25, shirt, 0, 0.66, 0, 1, 0.35, 0.62); // shoulders
  sp(hip, 0.2, pants, 0, 0.06, 0, 1, 0.45, 0.65); // hips
  cy(hip, 0.06, 0.07, 0.1, skin, 0, 0.75, 0);
  sp(hip, 0.135, skin, 0, 0.92, 0.01, 0.95, 1.1, 1);
  sp(hip, 0.03, skin, 0, 0.9, 0.14);
  if (o.cap) { sp(hip, 0.145, o.cap, 0, 0.98, 0, 1, 0.6, 1); bx(hip, 0.24, 0.03, 0.14, o.cap, 0, 0.98, 0.17); }
  else sp(hip, 0.145, hair, 0, 0.97, -0.015, 1, 0.75, 1);
  if (o.mullet) bx(hip, 0.22, 0.24, 0.06, hair, 0, 0.84, -0.13);
  if (o.beard) sp(hip, 0.11, hair, 0, 0.84, 0.06, 1, 0.7, 0.9);
  if (o.patch) bx(hip, 0.32, 0.26, 0.02, o.patch, 0, 0.42, -0.13);
  const arm = (side) => {
    const p = new THREE.Group(); p.position.set(side * 0.31, 0.66, 0); hip.add(p);
    const sleeve = o.sleeves === false ? skin : shirt;
    cy(p, 0.075, 0.065, 0.32, sleeve, 0, -0.16, 0);
    cy(p, 0.06, 0.05, 0.3, skin, 0, -0.45, 0);
    sp(p, 0.06, skin, 0, -0.63, 0.01);
    return p;
  };
  const leg = (side) => {
    const p = new THREE.Group(); p.position.set(side * 0.11, 0, 0); hip.add(p);
    if (o.shorts) { cy(p, 0.1, 0.09, 0.38, pants, 0, -0.19, 0); cy(p, 0.07, 0.055, 0.5, skin, 0, -0.62, 0); }
    else { cy(p, 0.1, 0.085, 0.48, pants, 0, -0.24, 0); cy(p, 0.08, 0.065, 0.44, pants, 0, -0.68, 0); }
    const shoe = bx(p, 0.13, 0.08, 0.27, o.shoes || '#222', 0, -0.91, 0.05);
    return p;
  };
  const lArm = arm(1), rArm = arm(-1), lLeg = leg(1), rLeg = leg(-1);
  const gun = bx(rArm, 0.06, 0.12, 0.3, '#1a1a1a', 0, -0.66, 0.1); gun.visible = false;
  const bat = bx(rArm, 0.1, 0.06, 1.0, '#e2c48e', 0, -0.66, 0.45); bat.visible = false;
  return { g, hip, torso, lArm, rArm, lLeg, rLeg, gun, bat };
}

function animatePerson(p, phase, amp, aim) {
  const s = Math.sin(phase) * amp;
  p.lLeg.rotation.x = s; p.rLeg.rotation.x = -s;
  p.lArm.rotation.x = -s * 0.8;
  p.rArm.rotation.x = aim ? -Math.PI / 2 : s * 0.8;
  p.lArm.rotation.z = 0; p.rArm.rotation.z = 0;
}

const CAR_COLORS = ['#e8e8e8', '#111', '#b8261f', '#1f4ea8', '#c0c3c6', '#2e7d4f', '#f0c419', '#7a1f3d', '#ff7a1a', '#5a6470', '#6fb7e8', '#f5f5f0'];
const VEHICLES = {
  ute: { name: "Holdin' Commodork Ute", L: 4.9, W: 1.9, H: 1.4, max: 47, acc: 17, turn: 1.9, kind: 'ute', hp: 900 },
  hilux: { name: 'Toyoda HiLax', L: 5.1, W: 1.9, H: 1.75, max: 40, acc: 14, turn: 1.7, kind: 'ute', hp: 1100 },
  sedan: { name: 'Fjord Falcoon XR8', L: 4.8, W: 1.85, H: 1.4, max: 50, acc: 19, turn: 1.9, kind: 'sedan', hp: 850 },
  hatch: { name: 'Toyoda Corollo', L: 4.2, W: 1.75, H: 1.45, max: 41, acc: 15, turn: 2.2, kind: 'hatch', hp: 700 },
  suv: { name: 'Toyoda Prahdo', L: 4.9, W: 1.95, H: 1.85, max: 42, acc: 14, turn: 1.7, kind: 'suv', hp: 1100 },
  van: { name: 'Toyoda HighAce', L: 5.0, W: 1.9, H: 2.1, max: 36, acc: 11, turn: 1.6, kind: 'van', hp: 1000 },
  sports: { name: "Holdin' Monarro GTS", L: 4.7, W: 1.9, H: 1.25, max: 60, acc: 27, turn: 2.1, kind: 'sports', hp: 750 },
  taxi: { name: 'Black & White Cab', L: 4.8, W: 1.85, H: 1.45, max: 45, acc: 16, turn: 1.9, kind: 'sedan', hp: 900, colors: ['#151515'], taxi: true },
  bus: { name: 'TransBlink Bus', L: 11.5, W: 2.5, H: 3.1, max: 25, acc: 6, turn: 1.0, kind: 'bus', hp: 2500, colors: ['#f2c21b'] },
  police: { name: 'QPS Interceptor', L: 4.9, W: 1.9, H: 1.42, max: 56, acc: 23, turn: 2.0, kind: 'sedan', hp: 1300, colors: ['#f4f4f4'], police: true },
};
const TRAFFIC_MIX = ['ute', 'ute', 'hilux', 'hilux', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'van', 'sports', 'taxi', 'taxi', 'bus'];

// Car bodies are extruded side profiles (with bevelled edges) so they read as real cars, not boxes.
const _carGeo = new Map(), _paint = new Map();
function paintMat(color) {
  let m = _paint.get(color);
  if (!m) { m = mkMat({ color, metalness: 0.6, roughness: 0.26, envMapIntensity: 1.3 }); _paint.set(color, m); }
  return m;
}
const GLASS_MAT = () => paintMat('#141b22');
function extrudeProfile(pts, width, bev) {
  const sh = new THREE.Shape();
  pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
  sh.closePath();
  const depth = Math.max(0.05, width - bev * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}
function carProfiles(spec) {
  const { L, W, H, kind } = spec, l = L / 2 - 0.12;
  const yb = kind === 'bus' ? 1.2 : kind === 'suv' || kind === 'van' ? 0.32 + H * 0.5 : 0.32 + H * (kind === 'sports' ? 0.42 : 0.47);
  const bot = 0.3;
  let body, glass, tray = null;
  switch (kind) {
    case 'bus':
      body = [[-l, bot], [-l, H], [l, H], [l, bot]];
      glass = null;
      break;
    case 'ute':
      body = [[-l, bot], [-l, yb], [l - 0.4, yb - 0.04], [l - 0.05, yb - 0.22], [l, bot + 0.2], [l, bot]];
      glass = [[-L * 0.1, yb - 0.02], [-L * 0.09, H], [L * 0.08, H], [L * 0.26, yb - 0.02]];
      tray = [-l + 0.1, -L * 0.11];
      break;
    case 'hatch':
      body = [[-l, bot], [-l, yb], [l - 0.45, yb - 0.04], [l - 0.05, yb - 0.25], [l, bot + 0.2], [l, bot]];
      glass = [[-l + 0.05, yb - 0.02], [-l + 0.3, H], [L * 0.06, H], [L * 0.26, yb - 0.02]];
      break;
    case 'suv': case 'van':
      body = [[-l, bot], [-l, yb], [l - 0.3, yb - 0.02], [l - 0.05, yb - 0.25], [l, bot + 0.2], [l, bot]];
      glass = [[-l + 0.05, yb - 0.02], [-l + 0.12, H], [L * (kind === 'van' ? 0.32 : 0.14), H], [L * (kind === 'van' ? 0.44 : 0.3), yb - 0.02]];
      break;
    case 'sports':
      body = [[-l, bot + 0.05], [-l, yb], [-l + 0.6, yb + 0.02], [l - 0.6, yb - 0.08], [l, bot + 0.18], [l, bot]];
      glass = [[-L * 0.24, yb], [-L * 0.06, H], [L * 0.06, H], [L * 0.28, yb - 0.04]];
      break;
    default: // sedan
      body = [[-l, bot], [-l, yb - 0.1], [-l + 0.35, yb], [l - 0.5, yb - 0.04], [l - 0.05, yb - 0.24], [l, bot + 0.2], [l, bot]];
      glass = [[-L * 0.31, yb - 0.02], [-L * 0.15, H], [L * 0.08, H], [L * 0.27, yb - 0.02]];
  }
  return { body, glass, tray, yb };
}

function makeCar(spec, color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const { L, W, H } = spec;
  color = color || pick(spec.colors || CAR_COLORS);
  const key = spec.name;
  let geo = _carGeo.get(key);
  if (!geo) {
    const pr = carProfiles(spec);
    geo = {
      body: extrudeProfile(pr.body, W, spec.kind === 'bus' ? 0.12 : 0.1),
      glass: pr.glass ? extrudeProfile(pr.glass, W * 0.86, 0.06) : null,
      roof: pr.glass ? new THREE.BoxGeometry(W * 0.84, 0.07, (pr.glass[2][0] - pr.glass[1][0]) + 0.1) : null,
      roofZ: pr.glass ? (pr.glass[2][0] + pr.glass[1][0]) / 2 : 0,
      tray: pr.tray, yb: pr.yb,
    };
    _carGeo.set(key, geo);
  }
  const paint = paintMat(color);
  const bm = new THREE.Mesh(geo.body, paint); bm.castShadow = true; body.add(bm);
  if (geo.glass) {
    const gm = new THREE.Mesh(geo.glass, GLASS_MAT()); gm.castShadow = true; body.add(gm);
    const roof = new THREE.Mesh(geo.roof, spec.taxi ? paintMat('#f4f4f4') : paint);
    roof.position.set(0, H + 0.03, geo.roofZ); body.add(roof);
  }
  const yb = geo.yb;
  if (spec.kind === 'bus') {
    bx(body, W + 0.04, 1.0, L * 0.86, '#141b22', 0, yb + 0.75, -0.25).material = GLASS_MAT();
    bx(body, W * 0.88, 1.3, 0.06, '#141b22', 0, yb + 0.6, L / 2 - 0.08).material = GLASS_MAT();
    bx(body, W + 0.05, 0.22, L - 0.4, '#2d6fbf', 0, yb - 0.1, 0);
  }
  if (geo.tray) { // ute tray sides
    const [t0, t1] = geo.tray, tl = t1 - t0, tz = (t0 + t1) / 2;
    bx(body, 0.08, 0.38, tl, color, W / 2 - 0.06, yb + 0.17, tz).material = paint;
    bx(body, 0.08, 0.38, tl, color, -W / 2 + 0.06, yb + 0.17, tz).material = paint;
    bx(body, W - 0.1, 0.38, 0.08, color, 0, yb + 0.17, t0 + 0.04).material = paint;
    bx(body, W - 0.2, 0.05, tl, '#2a2a2a', 0, yb - 0.02, tz);
    if (Math.random() < 0.5) bx(body, W * 0.85, 0.08, 0.08, '#222', 0, H + 0.12, -L * 0.1);
  }
  // lights, grille, bumpers, mirrors
  const ly = 0.32 + (yb - 0.32) * 0.72;
  for (const sx of [1, -1]) {
    bx(body, 0.42, 0.13, 0.06, '#fff7d6', sx * (W / 2 - 0.36), ly, L / 2 - 0.02, '#fff2c8');
    bx(body, 0.42, 0.13, 0.06, '#b00', sx * (W / 2 - 0.32), ly, -L / 2 + 0.02, '#ff2010');
    if (spec.kind !== 'bus') bx(body, 0.1, 0.1, 0.16, color, sx * (W / 2 + 0.05), yb + 0.1, L * 0.24).material = paint;
  }
  bx(body, W * 0.42, 0.14, 0.05, '#1a1a1a', 0, ly - 0.05, L / 2 + 0.01);
  // Queensland plates (white with maroon), side skirts, exhaust
  for (const [zz, s2] of [[L / 2 + 0.07, 1], [-L / 2 - 0.07, -1]]) { bx(body, 0.52, 0.14, 0.02, '#f4f4f0', 0, 0.5, zz); bx(body, 0.4, 0.05, 0.025, '#7a1f3d', 0, 0.5, zz + s2 * 0.005); }
  bx(body, 0.05, 0.12, L * 0.62, '#1c1c1c', W / 2 + 0.02, 0.34, 0); bx(body, 0.05, 0.12, L * 0.62, '#1c1c1c', -W / 2 - 0.02, 0.34, 0);
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), paintMat('#9a9a9a')); ex.rotation.x = Math.PI / 2; ex.position.set(-W * 0.3, 0.28, -L / 2 - 0.05); body.add(ex);
  if (spec.kind !== 'bus') { // door shut-lines and handles
    const doors = spec.kind === 'ute' || spec.kind === 'sports' ? [L * 0.24, -L * 0.04] : [L * 0.24, L * 0.0, -L * 0.24];
    for (const sx of [1, -1]) {
      for (const dz of doors) bx(body, 0.02, yb - 0.45, 0.025, '#151515', sx * (W / 2 + 0.035), 0.45 + (yb - 0.45) / 2, dz);
      for (let k = 0; k < doors.length - 1; k++) bx(body, 0.04, 0.04, 0.16, '#cfcfcf', sx * (W / 2 + 0.04), yb - 0.18, doors[k] - 0.2);
      if (geo.glass) bx(body, 0.02, H - yb - 0.05, 0.08, '#111', sx * (W * 0.43 + 0.012), yb + (H - yb) / 2, (geo.roofZ + doors[1]) / 2);
    }
  }
  bx(body, W * 0.98, 0.16, 0.12, '#222', 0, 0.36, L / 2 - 0.02);
  bx(body, W * 0.98, 0.16, 0.12, '#222', 0, 0.36, -L / 2 + 0.02);

  const out = { g, body, wheels: [], steer: [], bar: null, color };
  if (spec.taxi) bx(body, 0.6, 0.22, 0.25, '#ffe14d', 0, H + 0.18, geo.roofZ, '#ffcc00');
  if (spec.police) {
    for (let k = 0; k < 10; k++) {
      const z = -L / 2 + 0.35 + k * (L - 0.7) / 10 + (L - 0.7) / 20;
      bx(body, W + 0.03, 0.17, (L - 0.7) / 10, k % 2 ? '#1c3f8f' : '#f4f4f4', 0, ly - 0.02, z);
      bx(body, W + 0.035, 0.17, (L - 0.7) / 10, k % 2 ? '#f4f4f4' : '#1c3f8f', 0, ly - 0.19, z);
    }
    const red = bx(body, 0.5, 0.14, 0.28, '#ff2020', 0.3, H + 0.14, geo.roofZ, '#ff0000');
    const blue = bx(body, 0.5, 0.14, 0.28, '#2050ff', -0.3, H + 0.14, geo.roofZ, '#0030ff');
    red.material = red.material.clone(); blue.material = blue.material.clone();
    out.bar = [red, blue];
  }
  const wr = spec.kind === 'bus' ? 0.5 : spec.kind === 'suv' ? 0.4 : 0.36;
  const wg = new THREE.CylinderGeometry(wr, wr, 0.26, 16); wg.rotateZ(Math.PI / 2);
  const rg = new THREE.CylinderGeometry(wr * 0.6, wr * 0.6, 0.27, 12); rg.rotateZ(Math.PI / 2);
  const tm = matC('#161616'), rm = paintMat('#b8bcc0');
  if (!makeCar.wellMat) makeCar.wellMat = mkMat({ color: 0x121212, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const archGeo = new THREE.CylinderGeometry(wr + 0.1, wr + 0.1, W + 0.06, 14, 1, true, 0, Math.PI); archGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.03, wr * 1.1, 0.07);
  const axle = spec.kind === 'bus' ? L / 2 - 1.6 : L / 2 - 0.82;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const piv = new THREE.Group();
    piv.position.set(sx * (W / 2 - 0.14), wr, sz * axle);
    const w = new THREE.Mesh(wg, tm); w.castShadow = true;
    w.add(new THREE.Mesh(rg, rm));
    for (let k = 0; k < 5; k++) { const sp2 = new THREE.Mesh(spokeGeo, rm); sp2.position.x = sx * 0.14; sp2.rotation.x = (k / 5) * Math.PI; w.add(sp2); }
    piv.add(w); g.add(piv);
    const arch = new THREE.Mesh(archGeo, makeCar.wellMat); arch.position.set(0, wr, sz * axle); arch.scale.x = 0.5; arch.position.x = sx * W / 4; g.add(arch);
    out.wheels.push(w);
    if (sz > 0) out.steer.push(piv);
  }
  out.wheelR = wr;
  return out;
}

function makeIbis() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), matC('#f2f0ea'));
  body.scale.set(0.8, 0.75, 1.25); body.position.y = 0.62; body.castShadow = true; g.add(body);
  bx(g, 0.16, 0.18, 0.2, '#e8e6e0', 0, 0.55, -0.32);
  const neck = new THREE.Group(); neck.position.set(0, 0.72, 0.25); g.add(neck);
  bx(neck, 0.08, 0.3, 0.08, '#1c1c1c', 0, 0.12, 0.05);
  bx(neck, 0.11, 0.11, 0.14, '#1c1c1c', 0, 0.28, 0.1);
  const beak = bx(neck, 0.035, 0.035, 0.38, '#111', 0, 0.22, 0.32); beak.rotation.x = 0.55;
  bx(g, 0.035, 0.42, 0.035, '#222', 0.08, 0.22, 0);
  bx(g, 0.035, 0.42, 0.035, '#222', -0.08, 0.22, 0);
  return { g, neck };
}

function makeMagpie() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), matC('#141414'));
  body.scale.set(0.8, 0.7, 1.4); g.add(body);
  bx(g, 0.18, 0.08, 0.2, '#f4f4f4', 0, 0.12, -0.05);
  bx(g, 0.12, 0.12, 0.14, '#141414', 0, 0.06, 0.28);
  bx(g, 0.04, 0.04, 0.12, '#cfcfcf', 0, 0.04, 0.4);
  const wl = bx(g, 0.5, 0.03, 0.22, '#141414', 0.3, 0.05, 0);
  const wr = bx(g, 0.5, 0.03, 0.22, '#141414', -0.3, 0.05, 0);
  bx(wl, 0.2, 0.031, 0.1, '#f4f4f4', 0.05, 0, 0);
  bx(wr, 0.2, 0.031, 0.1, '#f4f4f4', -0.05, 0, 0);
  return { g, wl, wr };
}

function makeHeli() {
  const g = new THREE.Group();
  bx(g, 2.2, 2.0, 4.2, '#f4f4f4', 0, 0, 0);
  bx(g, 2.22, 0.5, 4.22, '#1c3f8f', 0, -0.3, 0);
  bx(g, 1.9, 1.2, 1.2, '#1e2a33', 0, 0.2, 2.2);
  bx(g, 0.4, 0.5, 5, '#f4f4f4', 0, 0.4, -4.4);
  bx(g, 0.15, 1.4, 0.8, '#1c3f8f', 0, 1.0, -6.8);
  bx(g, 0.12, 0.12, 3.6, '#333', 0.9, -1.4, 0);
  bx(g, 0.12, 0.12, 3.6, '#333', -0.9, -1.4, 0);
  const rotor = new THREE.Group(); rotor.position.y = 1.3; g.add(rotor);
  bx(rotor, 11, 0.06, 0.4, '#222', 0, 0, 0);
  bx(rotor, 0.4, 0.06, 11, '#222', 0, 0, 0);
  const tail = new THREE.Group(); tail.position.set(0.25, 0.9, -6.8); g.add(tail);
  bx(tail, 0.05, 2, 0.2, '#222', 0, 0, 0);
  const light = bx(g, 0.4, 0.4, 0.4, '#fff', 0, -1.1, 1.6, '#ffffff');
  return { g, rotor, tail, light };
}
