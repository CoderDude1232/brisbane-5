'use strict';
// Low-poly people, vehicles, birds and the police chopper. Everything faces +z.

const _matCache = new Map();
function matC(color, emissive) {
  const k = color + '|' + (emissive || '');
  let m = _matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1; }
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

function makePerson(o = {}) {
  const skin = o.skin || pick(SKINS), shirt = o.shirt || pick(SHIRTS), pants = o.pants || pick(PANTS), hair = o.hair || pick(HAIRS);
  const g = new THREE.Group();
  const hip = new THREE.Group(); hip.position.y = 0.95; g.add(hip);
  const torso = bx(hip, 0.55, 0.7, 0.3, shirt, 0, 0.4, 0);
  bx(hip, 0.28, 0.3, 0.28, skin, 0, 0.95, 0);
  if (o.cap) { bx(hip, 0.32, 0.1, 0.34, o.cap, 0, 1.13, 0.02); bx(hip, 0.3, 0.04, 0.14, o.cap, 0, 1.09, 0.2); }
  else bx(hip, 0.3, 0.1, 0.3, hair, 0, 1.13, -0.01);
  if (o.mullet) bx(hip, 0.26, 0.28, 0.08, hair, 0, 0.9, -0.17);
  if (o.beard) bx(hip, 0.26, 0.14, 0.06, hair, 0, 0.85, 0.15);
  if (o.patch) bx(hip, 0.4, 0.3, 0.02, o.patch, 0, 0.45, -0.16);
  const arm = (side) => {
    const p = new THREE.Group(); p.position.set(side * 0.36, 0.72, 0); hip.add(p);
    bx(p, 0.14, 0.62, 0.14, o.sleeves === false ? skin : shirt, 0, -0.3, 0);
    bx(p, 0.12, 0.12, 0.12, skin, 0, -0.66, 0);
    return p;
  };
  const leg = (side) => {
    const p = new THREE.Group(); p.position.set(side * 0.13, 0, 0); hip.add(p);
    if (o.shorts) { bx(p, 0.21, 0.4, 0.23, pants, 0, -0.2, 0); bx(p, 0.16, 0.55, 0.16, skin, 0, -0.67, 0); }
    else bx(p, 0.2, 0.95, 0.22, pants, 0, -0.47, 0);
    bx(p, 0.2, 0.08, 0.3, o.shoes || '#222', 0, -0.92, 0.05);
    return p;
  };
  const lArm = arm(1), rArm = arm(-1), lLeg = leg(1), rLeg = leg(-1);
  const gun = bx(rArm, 0.08, 0.14, 0.34, '#1a1a1a', 0, -0.72, 0.12); gun.visible = false;
  const bat = bx(rArm, 0.1, 0.06, 1.0, '#e2c48e', 0, -0.72, 0.45); bat.visible = false;
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

function makeCar(spec, color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const { L, W, H } = spec;
  color = color || pick(spec.colors || CAR_COLORS);
  const glass = '#1e2a33';
  const lowH = H * 0.45;
  bx(body, W, lowH, L, color, 0, 0.32 + lowH / 2, 0);
  const cabTop = 0.32 + lowH;
  if (spec.kind === 'bus') {
    bx(body, W, H - lowH, L, color, 0, cabTop + (H - lowH) / 2, 0);
    bx(body, W + 0.02, 0.9, L * 0.85, glass, 0, cabTop + 0.75, -0.3);
    bx(body, W * 0.9, 1.0, 0.05, glass, 0, cabTop + 0.7, L / 2 + 0.01);
    bx(body, W + 0.03, 0.25, L, '#2d6fbf', 0, cabTop - 0.05, 0);
  } else if (spec.kind === 'ute') {
    const cl = L * 0.36, cz = L * 0.08;
    bx(body, W * 0.92, H - lowH, cl, glass, 0, cabTop + (H - lowH) / 2, cz);
    bx(body, W * 0.94, 0.08, cl * 0.9, color, 0, cabTop + (H - lowH), cz);
    const tz = -L * 0.27, tl = L * 0.42;
    bx(body, 0.1, 0.4, tl, color, W / 2 - 0.05, cabTop + 0.2, tz);
    bx(body, 0.1, 0.4, tl, color, -W / 2 + 0.05, cabTop + 0.2, tz);
    bx(body, W, 0.4, 0.1, color, 0, cabTop + 0.2, -L / 2 + 0.05);
    if (Math.random() < 0.5) bx(body, W * 0.8, 0.12, 0.12, '#222', 0, cabTop + 0.9, cz - cl / 2 - 0.1);
  } else {
    const cl = spec.kind === 'van' || spec.kind === 'suv' ? L * 0.68 : spec.kind === 'hatch' ? L * 0.55 : L * 0.5;
    const cz = spec.kind === 'van' ? -L * 0.1 : spec.kind === 'hatch' || spec.kind === 'suv' ? -L * 0.08 : -L * 0.04;
    bx(body, W * 0.9, H - lowH, cl, glass, 0, cabTop + (H - lowH) / 2, cz);
    bx(body, W * 0.92, 0.08, cl * 0.92, spec.taxi ? '#f4f4f4' : color, 0, cabTop + (H - lowH), cz);
    if (spec.kind === 'sports') bx(body, W * 0.9, 0.08, 0.35, color, 0, cabTop + 0.25, -L / 2 + 0.2);
  }
  // lights
  bx(body, 0.4, 0.15, 0.05, '#fff7d6', W / 2 - 0.35, 0.32 + lowH * 0.7, L / 2 + 0.01, '#fff7d6');
  bx(body, 0.4, 0.15, 0.05, '#fff7d6', -W / 2 + 0.35, 0.32 + lowH * 0.7, L / 2 + 0.01, '#fff7d6');
  bx(body, 0.4, 0.15, 0.05, '#b00', W / 2 - 0.3, 0.32 + lowH * 0.7, -L / 2 - 0.01, '#600');
  bx(body, 0.4, 0.15, 0.05, '#b00', -W / 2 + 0.3, 0.32 + lowH * 0.7, -L / 2 - 0.01, '#600');
  bx(body, W * 0.96, 0.2, 0.15, '#333', 0, 0.38, L / 2);
  bx(body, W * 0.96, 0.2, 0.15, '#333', 0, 0.38, -L / 2);

  const out = { g, body, wheels: [], steer: [], bar: null, color };
  if (spec.taxi) bx(body, 0.6, 0.22, 0.25, '#ffe14d', 0, cabTop + (H - lowH) + 0.15, -L * 0.04, '#ffcc00');
  if (spec.police) {
    for (let k = 0; k < 10; k++) {
      const c = k % 2 ? '#1c3f8f' : '#f4f4f4';
      const z = -L / 2 + 0.25 + k * (L - 0.5) / 10 + 0.2;
      bx(body, W + 0.02, 0.2, (L - 0.5) / 10, c, 0, 0.32 + lowH * 0.55, z);
      bx(body, W + 0.03, 0.2, (L - 0.5) / 10, k % 2 ? '#f4f4f4' : '#1c3f8f', 0, 0.32 + lowH * 0.3, z);
    }
    const red = bx(body, 0.5, 0.16, 0.3, '#ff2020', 0.3, cabTop + (H - lowH) + 0.12, -L * 0.04, '#ff0000');
    const blue = bx(body, 0.5, 0.16, 0.3, '#2050ff', -0.3, cabTop + (H - lowH) + 0.12, -L * 0.04, '#0030ff');
    red.material = red.material.clone(); blue.material = blue.material.clone();
    out.bar = [red, blue];
  }
  const wr = spec.kind === 'bus' ? 0.5 : 0.36;
  const wg = new THREE.CylinderGeometry(wr, wr, 0.26, 10);
  wg.rotateZ(Math.PI / 2);
  const wm = matC('#1b1b1b');
  const axle = spec.kind === 'bus' ? L / 2 - 1.6 : L / 2 - 0.85;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const piv = new THREE.Group();
    piv.position.set(sx * (W / 2 - 0.12), wr, sz * axle);
    const w = new THREE.Mesh(wg, wm); w.castShadow = true;
    piv.add(w); g.add(piv);
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
