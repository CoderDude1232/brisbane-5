'use strict';
// Turns World data into merged, chunked meshes + colliders + the minimap image.

const MAT = {};
const CHUNK = 255;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.6, 1, 1, 5, 1, true);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _col = new THREE.Color();
const _e = new THREE.Euler(), _q = new THREE.Quaternion();

function M(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

class Merger {
  constructor() { this.chunks = new Map(); }
  _chunk(x, z) {
    const k = (Math.floor((x + HALF) / CHUNK) + 10) * 100 + Math.floor((z + HALF) / CHUNK) + 10;
    let c = this.chunks.get(k);
    if (!c) { c = { p: [], n: [], u: [], c: [], i: [] }; this.chunks.set(k, c); }
    return c;
  }
  add(g, m, color, uvFn) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
    _v.setFromMatrixPosition(m);
    const ch = this._chunk(_v.x, _v.z);
    const base = ch.p.length / 3;
    _n3.getNormalMatrix(m);
    _col.set(color);
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k).applyMatrix4(m);
      ch.p.push(_v.x, _v.y, _v.z);
      _s.fromBufferAttribute(nor, k);
      const lnx = _s.x, lny = _s.y, lnz = _s.z;
      _s.applyMatrix3(_n3).normalize();
      ch.n.push(_s.x, _s.y, _s.z);
      let u = uv ? uv.getX(k) : 0, w = uv ? uv.getY(k) : 0;
      if (uvFn) { const r = uvFn(u, w, lnx, lny, lnz); u = r[0]; w = r[1]; }
      ch.u.push(u, w);
      ch.c.push(_col.r, _col.g, _col.b);
    }
    if (idx) for (let k = 0; k < idx.count; k++) ch.i.push(base + idx.getX(k));
    else for (let k = 0; k < pos.count; k++) ch.i.push(base + k);
  }
  // Box standing on y (bottom), centred on x/z. uvS>0 maps window textures in world units.
  box(x, y, z, w, h, d, color, ry = 0, uvS = 0) {
    this.add(UNIT_BOX, M(x, y + h / 2, z, w, h, d, 0, ry, 0), color, uvS
      ? (u, v, nx, ny) => (Math.abs(ny) > 0.5 ? [0.004, 0.004] : Math.abs(nx) > 0.5 ? [u * d / uvS, v * h / uvS] : [u * w / uvS, v * h / uvS])
      : null);
  }
  // Beam between two points.
  beam(x1, y1, z1, x2, y2, z2, t, color) {
    const dir = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
    const len = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), q, new THREE.Vector3(t, len, t));
    this.add(UNIT_BOX, m, color);
  }
  // Flat axis-aligned rectangle facing up. uv = [u0,v0,u1,v1] mapped x->u, z->v unless swap.
  quad(x0, z0, x1, z1, y, color, uv, swap) {
    const ch = this._chunk((x0 + x1) / 2, (z0 + z1) / 2);
    const base = ch.p.length / 3;
    _col.set(color);
    const [u0, v0, u1, v1] = uv || [0.01, 0.01, 0.01, 0.01];
    const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const U = swap ? [[u0, v0], [u0, v1], [u1, v1], [u1, v0]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let k = 0; k < 4; k++) {
      ch.p.push(P[k][0], y, P[k][1]); ch.n.push(0, 1, 0); ch.u.push(U[k][0], U[k][1]); ch.c.push(_col.r, _col.g, _col.b);
    }
    ch.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  build(mat, scene, cast, receive) {
    for (const ch of this.chunks.values()) {
      if (!ch.i.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ch.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(ch.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(ch.c, 3));
      g.setIndex(ch.i);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    }
    this.chunks.clear();
  }
}

function addCol(minX, maxX, minZ, maxZ, maxY, minY = 0, tag) {
  const b = { minX, maxX, minZ, maxZ, minY, maxY, tag };
  World.hash.insert(b);
  return b;
}

function makeTextures() {
  const winDay = (frame, glass1, glass2, cell, wx, wy) => canvasTex(256, 256, (g) => {
    g.fillStyle = frame; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256 / cell; i++)
      for (let j = 0; j < 256 / cell; j++) {
        const gr = g.createLinearGradient(0, j * cell, 0, j * cell + cell);
        gr.addColorStop(0, glass1); gr.addColorStop(1, glass2);
        g.fillStyle = gr;
        g.fillRect(i * cell + (cell - wx) / 2, j * cell + (cell - wy) / 2, wx, wy);
      }
  });
  const winNight = (cell, wx, wy, p) => canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256 / cell; i++)
      for (let j = 0; j < 256 / cell; j++) {
        if (Math.random() > p) continue;
        g.fillStyle = pick(['#ffd68a', '#ffe7b0', '#cfe6ff', '#fff4d6']);
        g.fillRect(i * cell + (cell - wx) / 2, j * cell + (cell - wy) / 2, wx, wy);
      }
  });
  const T = {};
  T.glass = winDay('#c9ccd0', '#4d6a86', '#2a3a4c', 32, 28, 26);
  T.glassN = winNight(32, 28, 26, 0.38);
  T.render = winDay('#efece6', '#3d4852', '#2b333b', 32, 14, 18);
  T.renderN = winNight(32, 14, 18, 0.45);
  T.road = canvasTex(64, 128, (g) => {
    g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, 64, 128);
    for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(${pick(['255,255,255', '0,0,0'])},0.035)`; g.fillRect(Math.random() * 64, Math.random() * 128, 1, 1); }
    g.fillStyle = '#e8e8e0'; g.fillRect(31, 0, 2, 60);
    g.fillStyle = '#d8d8d0'; g.fillRect(3, 0, 1.5, 128); g.fillRect(59.5, 0, 1.5, 128);
  });
  T.water = canvasTex(128, 128, (g) => {
    g.fillStyle = '#8a8466'; g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 220; k++) {
      g.fillStyle = `rgba(${pick(['200,200,170', '90,80,55', '160,170,150'])},${rand(0.1, 0.3)})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, rand(2, 6), rand(10, 30));
    }
  });
  return T;
}

function signTexture(text, bg, fg, font, w = 512, h = 128, stroke) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 8; g.strokeText(text, w / 2, h / 2 + 4); }
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4);
  }, false);
}

function addSign(scene, tex, x, y, z, w, h, ry, emissive) {
  const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? tex : null, emissiveIntensity: 0.0 });
  if (emissive) World.nightMats.push(m);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(x, y, z); p.rotation.y = ry;
  scene.add(p);
  return p;
}

function buildWorld(scene) {
  World.generate();
  World.nightMats = [];
  World.anim = [];
  World.fp = [];
  const T = makeTextures();
  World.tex = T;
  MAT.glass = new THREE.MeshLambertMaterial({ map: T.glass, vertexColors: true, emissive: 0xffffff, emissiveMap: T.glassN, emissiveIntensity: 0 });
  MAT.render = new THREE.MeshLambertMaterial({ map: T.render, vertexColors: true, emissive: 0xffffff, emissiveMap: T.renderN, emissiveIntensity: 0 });
  MAT.plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.ground = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.road = new THREE.MeshLambertMaterial({ map: T.road, vertexColors: true });
  MAT.neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.water = new THREE.MeshPhongMaterial({ map: T.water, color: 0x9a9a7a, specular: 0x555544, shininess: 70, side: THREE.DoubleSide });
  World.nightMats.push(MAT.glass, MAT.render);

  const G = new Merger(), R = new Merger(), P = new Merger(), GR = new Merger(), RD = new Merger(), NE = new Merger();
  const rng = World.rng;
  const rp = (a) => a[Math.floor(rng() * a.length)];
  const rr = (a, b) => a + rng() * (b - a);

  // ---------- Landmark reservations ----------
  const L = World.landmarks;
  L.suncorp = World.reserve(blockIdx(-360), blockIdx(-240), 2, 2);
  L.gabba = World.reserve(blockIdx(180), blockIdx(300), 2, 2);
  const one = (x, z) => { const b = World.blockAt(x, z); b.used = true; return { cx: b.cx, cz: b.cz, minX: b.cx - 20, maxX: b.cx + 20, minZ: b.cz - 20, maxZ: b.cz + 20 }; };
  L.xxxx = one(-450, 30);
  L.cityhall = one(-90, -90);
  L.hospital = one(-90, -570);
  L.police = one(-150, -90);
  L.lookout = { cx: MT.x, cz: MT.z };

  // ---------- Ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), new THREE.MeshLambertMaterial({ color: 0x6a8f4d }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  const lotColor = { cbd: '#8e8c86', mid: '#8f8b82', valley: '#7f7b77', suburb: '#6f9a4b', park: '#5f9842', industrial: '#85837d', southbank: '#6aa04a' };
  for (const b of World.blocks) {
    if (b.zone === 'mountain' || b.wet > 0) continue;
    const x0 = lineC(b.i) + 10, z0 = lineC(b.j) + 10;
    GR.quad(x0, z0, x0 + 40, z0 + 40, 0.0, lotColor[b.zone] || '#7a9a5a');
  }

  // ---------- River ----------
  {
    const pts = World.river, n = pts.length;
    const mk = (hw, y, uvScale) => {
      const pos = [], uv = [], idx = [];
      for (let k = 0; k < n; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
        let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
        const nx = -tz, nz = tx, p = pts[k];
        pos.push(p.x + nx * hw, y, p.z + nz * hw, p.x - nx * hw, y, p.z - nz * hw);
        uv.push(0, p.s / uvScale, 1, p.s / uvScale);
        if (k < n - 1) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      g.attributes.normal.array.fill(0); for (let k = 1; k < g.attributes.normal.array.length; k += 3) g.attributes.normal.array[k] = 1;
      return g;
    };
    const bank = new THREE.Mesh(mk(RIVER_HW + 5, 0.03, 50), new THREE.MeshLambertMaterial({ color: 0x77694f, side: THREE.DoubleSide }));
    bank.receiveShadow = true; scene.add(bank);
    const water = new THREE.Mesh(mk(RIVER_HW + 1, 0.045, 40), MAT.water);
    water.receiveShadow = true; scene.add(water);
    World.anim.push({ update: (dt) => { T.water.offset.y -= dt * 0.025; } });
  }

  // ---------- Roads ----------
  const isNode = (i, j) => World.neighbors(i, j, true).length > 0;
  for (let i = 0; i < NL; i++)
    for (let j = 0; j < NL; j++) {
      if (!isNode(i, j)) continue;
      const x = lineC(i), z = lineC(j);
      GR.quad(x - 10, z - 10, x + 10, z + 10, 0.05, '#a9a7a0');
      RD.quad(x - 7, z - 7, x + 7, z + 7, 0.07, '#ffffff', [0.3, 0.6, 0.31, 0.61]);
    }
  const roadSeg = (x0, z0, x1, z1, type, horiz) => {
    const len = horiz ? x1 - x0 : z1 - z0;
    if (type === 3) {
      if (horiz) GR.quad(x0 + 10, z0 - 10, x1 - 10, z0 + 10, 0.05, '#c2a77c');
      else GR.quad(x0 - 10, z0 + 10, x0 + 10, z1 - 10, 0.05, '#c2a77c');
      return;
    }
    const v = (len - 14) / 16;
    if (horiz) {
      GR.quad(x0 + 10, z0 - 10, x1 - 10, z0 + 10, 0.05, '#a9a7a0');
      RD.quad(x0 + 7, z0 - 7, x1 - 7, z0 + 7, 0.07, '#ffffff', [0, 0, 1, v], true);
    } else {
      GR.quad(x0 - 10, z0 + 10, x0 + 10, z1 - 10, 0.05, '#a9a7a0');
      RD.quad(x0 - 7, z0 + 7, x0 + 7, z1 - 7, 0.07, '#ffffff', [0, 0, 1, v]);
    }
  };
  for (let i = 0; i < NL - 1; i++) for (let j = 0; j < NL; j++) {
    const t = World.H[i * NL + j]; if (t) roadSeg(lineC(i), lineC(j), lineC(i + 1), lineC(j), t, true);
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NL - 1; j++) {
    const t = World.V[i * NL + j]; if (t) roadSeg(lineC(i), lineC(j), lineC(i), lineC(j + 1), t, false);
  }

  // ---------- Bridges ----------
  for (const br of World.bridges) {
    const horiz = br.dir === 'H';
    const len = horiz ? br.x1 - br.x0 : br.z1 - br.z0;
    let w0 = null, w1 = null;
    for (let s = 0; s <= len; s += 2) {
      const x = horiz ? br.x0 + s : br.x0, z = horiz ? br.z0 : br.z0 + s;
      if (World.isWater(x, z) || World.isWater(horiz ? x : x - 10, horiz ? z - 10 : z) || World.isWater(horiz ? x : x + 10, horiz ? z + 10 : z)) {
        if (w0 === null) w0 = s; w1 = s;
      }
    }
    if (w0 === null) continue;
    w0 = Math.max(12, w0 - 6); w1 = Math.min(len - 12, w1 + 6);
    br.w0 = w0; br.w1 = w1;
    const story = br.name === 'Story Bridge';
    const deck = story ? '#59646b' : '#9c9a94';
    const rail = story ? '#3f4b53' : '#c9c7c0';
    const at = (s, off) => (horiz ? [br.x0 + s, br.z0 + off] : [br.x0 + off, br.z0 + s]);
    const [ax, az] = at((w0 + w1) / 2, 0);
    const L2 = w1 - w0;
    if (horiz) P.box(ax, -2.6, az, L2, 2.62, 21, deck);
    else P.box(ax, -2.6, az, 21, 2.62, L2, deck);
    for (const off of [-10.3, 10.3]) {
      const [rx, rz] = at((w0 + w1) / 2, off);
      if (horiz) { P.box(rx, 0, rz, L2, 1.1, 0.4, rail); addCol(rx - L2 / 2, rx + L2 / 2, rz - 0.5, rz + 0.5, 1.4); }
      else { P.box(rx, 0, rz, 0.4, 1.1, L2, rail); addCol(rx - 0.5, rx + 0.5, rz - L2 / 2, rz + L2 / 2, 1.4); }
    }
    for (let s = w0 + 10; s < w1 - 5; s += 22) {
      const [px, pz] = at(s, 0);
      P.box(px, -6, pz, horiz ? 3 : 14, 4, horiz ? 14 : 3, '#8d8a82');
    }
    if (story) buildStoryBridge(P, NE, br, at, w0, w1, horiz);
  }

  // ---------- Blocks ----------
  const glassTints = ['#d6e6f5', '#cfe8e6', '#e4e4e4', '#f0e2c6', '#b9cbdc', '#a9c2c8', '#e8d8c8', '#c4ccd8'];
  const renderTints = ['#f2efe8', '#e6d6b8', '#d9c4a4', '#c97e5e', '#b8b8b0', '#e9e1d0', '#a96a50', '#dcd2c0'];
  const houseWalls = ['#f4f1e8', '#efe6cf', '#f2e9b8', '#cfe0e4', '#d8e4cc', '#f1d9c9', '#e6e6e6', '#d9e8f0'];
  const roofs = ['#a9adb0', '#a9adb0', '#8c3b2e', '#3e5e48', '#4a4f52', '#b4b9bc', '#6d2b2b'];
  const neon = ['#ff2fa8', '#2ff6ff', '#ffe23a', '#9b5cff', '#3aff7a', '#ff6a2f'];
  const fp = (x0, z0, x1, z1, c) => World.fp.push([x0, z0, x1, z1, c]);

  const tower = (x, z, w, d, h, tint, glass) => {
    (glass ? G : R).box(x, 0, z, w, h, d, tint, 0, glass ? 28 : 26);
    addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
    fp(x - w / 2, z - d / 2, x + w / 2, z + d / 2, glass ? '#26303a' : '#2f3330');
    if (h > 30 && rng() < 0.7) P.box(x + rr(-w / 5, w / 5), h, z + rr(-d / 5, d / 5), w * 0.35, rr(1.5, 4), d * 0.35, '#8f9294');
    if (h > 150) { P.box(x, h, z, 1, 22, 1, '#c8c8c8'); NE.box(x, h + 22, z, 1.4, 1.4, 1.4, '#ff2222'); }
  };

  const houseRoof = (cx, cy, cz, hw, hd, rh, color) => {
    const m = new THREE.Matrix4().makeTranslation(cx, cy + rh / 2, cz)
      .multiply(new THREE.Matrix4().makeScale(hw / 0.7071, rh, hd / 0.7071))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
    P.add(CONE4, m, color);
  };

  const queenslander = (x, z, faceZ) => {
    // faceZ = +1 front faces +z, -1 faces -z
    const wall = rp(houseWalls), roof = rp(roofs);
    const W = rr(8.5, 10.5), D = rr(9.5, 11.5);
    P.box(x, 0, z, W - 0.5, 2.1, D - 0.5, '#5b4b3c');
    P.box(x, 2.1, z, W, 3.2, D, wall);
    const vz = z + faceZ * (D / 2 + 1.3);
    P.box(x, 1.95, vz, W, 0.3, 2.6, '#8a6f55');
    P.box(x, 2.25, z + faceZ * (D / 2 + 2.5), W, 0.9, 0.15, '#ffffff');
    P.box(x + W / 2 - 1.5, 0, z + faceZ * (D / 2 + 3.6), 1.4, 1.2, 2.2, '#8a6f55');
    houseRoof(x, 5.3, z + faceZ * 1.2, W / 2 + 0.6, D / 2 + 2.6, 2.6, roof);
    addCol(x - W / 2, x + W / 2, Math.min(z - D / 2, z + faceZ * (D / 2 + 2.6)), Math.max(z + D / 2, z + faceZ * (D / 2 + 2.6)), 8);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
    const by = z - faceZ * (D / 2 + 3.5);
    if (rng() < 0.55) { // Hills Hoist
      const hx = x + rr(-3, 3);
      P.box(hx, 0, by, 0.12, 2.3, 0.12, '#bbbbbb');
      P.box(hx, 2.2, by, 3.4, 0.06, 0.06, '#bbbbbb', 0.4);
      P.box(hx, 2.2, by, 3.4, 0.06, 0.06, '#bbbbbb', 0.4 + Math.PI / 2);
    } else if (rng() < 0.4) { // pool
      GR.quad(x - 3, by - 1.6, x + 3, by + 1.6, 0.03, '#3fbde0');
    }
  };

  const tree = (kind, x, z, s = 1, collide = true) => {
    const y = World.groundY(x, z);
    if (kind === 'palm') {
      P.add(CYL, M(x, y + 3.6 * s, z, 0.3 * s, 7.2 * s, 0.3 * s), '#8a7355');
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + rng();
        P.add(UNIT_BOX, M(x + Math.sin(a) * 1.5 * s, y + 6.9 * s, z + Math.cos(a) * 1.5 * s, 0.9 * s, 0.08, 3.4 * s, 0.45, a, 0), rp(['#4f8a3a', '#5d9a42', '#467a33']));
      }
    } else if (kind === 'jacaranda') {
      P.add(CYL, M(x, y + 2 * s, z, 0.35 * s, 4 * s, 0.35 * s), '#5d4a3a');
      P.add(ICO, M(x, y + 5 * s, z, 3.4 * s, 2.3 * s, 3.4 * s, 0, rng() * 3), rp(['#8f6fd1', '#9a78db', '#7d5fc4']));
    } else if (kind === 'gum') {
      P.add(CYL, M(x, y + 3.5 * s, z, 0.32 * s, 7 * s, 0.32 * s), '#d9d2c3');
      P.add(ICO, M(x + 0.6, y + 7.5 * s, z, 2.6 * s, 2.4 * s, 2.6 * s, 0, rng() * 3), rp(['#6f8a4a', '#7a9152', '#62804a']));
      P.add(ICO, M(x - 0.8, y + 9.3 * s, z + 0.5, 1.8 * s, 1.7 * s, 1.8 * s, 0, rng() * 3), '#71904d');
    } else if (kind === 'fig') {
      P.add(CYL, M(x, y + 2 * s, z, 0.8 * s, 4 * s, 0.8 * s), '#6a5a48');
      P.add(ICO, M(x, y + 5 * s, z, 5 * s, 3 * s, 5 * s, 0, rng() * 3), rp(['#3d6a33', '#46753a']));
    } else {
      P.add(CYL, M(x, y + 1.8 * s, z, 0.3 * s, 3.6 * s, 0.3 * s), '#5d4a3a');
      P.add(ICO, M(x, y + 4 * s, z, 4 * s, 1.5 * s, 4 * s, 0, rng() * 3), rp(['#d2492f', '#c8402a']));
    }
    if (collide) addCol(x - 0.45, x + 0.45, z - 0.45, z + 0.45, y + 6, y - 1);
  };
  World.tree = tree;
  const anyTree = () => rp(['palm', 'jacaranda', 'jacaranda', 'gum', 'fig', 'poinciana']);

  for (const b of World.blocks) {
    if (b.used) continue;
    const x0 = lineC(b.i) + 10, z0 = lineC(b.j) + 10, x1 = x0 + 40, z1 = z0 + 40;
    const dry = (x, z, r = 4) => !World.isWater(x, z) && !World.isWater(x + r, z) && !World.isWater(x - r, z) && !World.isWater(x, z + r) && !World.isWater(x, z - r);
    if (b.zone === 'mountain') {
      for (let k = 0; k < 9; k++) {
        const x = rr(x0 - 8, x1 + 8), z = rr(z0 - 8, z1 + 8);
        if (Math.hypot(x - MT.x, z - MT.z) < 40) continue;
        tree('gum', x, z, rr(0.8, 1.3));
      }
      continue;
    }
    if (b.wet > 0) {
      for (let k = 0; k < 4; k++) { const x = rr(x0, x1), z = rr(z0, z1); if (dry(x, z, 6)) tree(rp(['fig', 'palm', 'jacaranda']), x, z); }
      continue;
    }
    switch (b.zone) {
      case 'cbd': {
        const core = clamp(1 - Math.hypot(b.cx + 40, b.cz - 10) / 230, 0, 1);
        if (rng() < 0.4) {
          const h = rr(30, 55) + core * rr(60, 220);
          R.box(b.cx, 0, b.cz, 38, 7, 38, rp(renderTints), 0, 26);
          addCol(x0 + 1, x1 - 1, z0 + 1, z1 - 1, 7);
          tower(b.cx, b.cz, rr(22, 30), rr(22, 30), h, rp(glassTints), true);
        } else {
          for (const [ox, oz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
            const h = rr(20, 45) + core * rr(20, 150) * rng();
            const glass = rng() < 0.7;
            tower(b.cx + ox, b.cz + oz, rr(14, 18), rr(14, 18), h, rp(glass ? glassTints : renderTints), glass);
          }
        }
        break;
      }
      case 'mid': case 'valley': case 'industrial': {
        if (b.zone === 'industrial') {
          const h = rr(7, 13);
          R.box(b.cx, 0, b.cz, 36, h, 34, rp(['#b8b8b0', '#9aa4ac', '#c9b99a', '#a8aaa0']), 0, 26);
          P.box(b.cx, h, b.cz, 36.4, 0.6, 34.4, rp(['#8a9096', '#a2a6a8']));
          addCol(x0 + 2, x1 - 2, z0 + 3, z1 - 3, h + 1);
          fp(x0 + 2, z0 + 3, x1 - 2, z1 - 3, '#33352f');
          break;
        }
        for (const [ox, oz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
          if (rng() < 0.12) { tree(anyTree(), b.cx + ox, b.cz + oz); continue; }
          const h = rr(8, b.zone === 'valley' ? 24 : 32);
          const w = rr(14, 18), d = rr(14, 18);
          tower(b.cx + ox, b.cz + oz, w, d, h, rp(renderTints), rng() < 0.25);
          if (b.zone === 'valley' && rng() < 0.8) {
            const side = oz < 0 ? -1 : 1;
            NE.box(b.cx + ox, rr(3, Math.min(h - 2, 9)), b.cz + oz + side * (d / 2 + 0.15), w * rr(0.4, 0.8), 1.2, 0.2, rp(neon));
          }
        }
        break;
      }
      case 'suburb': {
        for (const [lx, lz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const x = x0 + 10 + lx * 20 + rr(-1, 1), z = z0 + 10 + lz * 20;
          queenslander(x, z + (lz ? 1 : -1), lz ? 1 : -1);
          if (rng() < 0.6) tree(anyTree(), x0 + lx * 20 + rr(2, 5), z0 + 10 + lz * 20 + rr(-6, 6), rr(0.7, 1));
        }
        break;
      }
      case 'park': case 'southbank': {
        const n = b.zone === 'park' ? 10 : 6;
        for (let k = 0; k < n; k++) tree(b.zone === 'southbank' ? rp(['palm', 'jacaranda', 'fig']) : anyTree(), rr(x0 + 2, x1 - 2), rr(z0 + 2, z1 - 2), rr(0.8, 1.3));
        if (rng() < 0.5) { // BBQ shelter
          const x = b.cx + rr(-8, 8), z = b.cz + rr(-8, 8);
          P.box(x, 0, z, 0.3, 2.6, 0.3, '#777'); P.box(x, 2.6, z, 5, 0.3, 4, '#3e5e48'); P.box(x, 0, z, 1.6, 0.9, 0.8, '#666');
        }
        break;
      }
    }
  }

  // ---------- Queen St Mall dressing ----------
  for (let x = World.mall.minX + 14; x < World.mall.maxX - 10; x += 14) {
    tree(rp(['fig', 'jacaranda']), x, World.mall.z, 0.7);
    P.box(x + 6, 0, World.mall.z + 4, 2.4, 0.5, 0.6, '#6d5038');
  }

  buildLandmarks(scene, P, R, G, NE, GR, tree);

  // ---------- Bake ----------
  GR.build(MAT.ground, scene, false, true);
  RD.build(MAT.road, scene, false, true);
  G.build(MAT.glass, scene, true, true);
  R.build(MAT.render, scene, true, true);
  P.build(MAT.plain, scene, true, true);
  NE.build(MAT.neon, scene, false, false);

  buildMountain(scene);
  buildFerries(scene);
  buildMinimap();
}

function buildStoryBridge(P, NE, br, at, w0, w1, horiz) {
  const steel = '#47555e';
  const mid = (w0 + w1) / 2, half = (w1 - w0) / 2;
  const t1 = mid - half * 0.55, t2 = mid + half * 0.55;
  const a0 = Math.max(4, w0 - 40), a1 = Math.min(horiz ? br.x1 - br.x0 - 4 : br.z1 - br.z0 - 4, w1 + 40);
  const topY = (s) => {
    if (s <= t1) return lerp(4, 30, (s - a0) / (t1 - a0));
    if (s >= t2) return lerp(30, 4, (s - t2) / (a1 - t2));
    const u = (s - t1) / (t2 - t1);
    return 30 - 18 * Math.sin(u * Math.PI);
  };
  for (const off of [-11, 11]) {
    const p = (s, y) => { const [x, z] = at(s, off); return [x, y, z]; };
    let prev = null;
    for (let s = a0; s <= a1 + 0.01; s += 6) {
      const ty = topY(s);
      const top = p(s, ty), bot = p(s, 1.2);
      P.beam(...bot, ...top, 0.45, steel);
      if (prev) {
        P.beam(...prev.top, ...top, 0.8, steel);
        P.beam(...prev.bot, ...bot, 0.8, steel);
        P.beam(...prev.bot, ...top, 0.35, steel);
        NE.box(top[0], top[1] + 0.4, top[2], 0.35, 0.35, 0.35, '#fff3c4');
      }
      prev = { top, bot };
    }
    for (const s of [t1, t2]) {
      const [x, z] = at(s, off);
      P.box(x, -4, z, 2.4, 34, 2.4, steel);
    }
  }
  for (const s of [t1, t2]) {
    const [x, z] = at(s, 0);
    if (horiz) P.box(x, 28, z, 1.2, 1.4, 23, steel); else P.box(x, 28, z, 23, 1.4, 1.2, steel);
    if (horiz) P.box(x, 18, z, 1, 1, 23, steel); else P.box(x, 18, z, 23, 1, 1, steel);
  }
}

function buildLandmarks(scene, P, R, G, NE, GR, tree) {
  const L = World.landmarks;

  // Stadiums
  const stadium = (rect, a, b, seat, roof, gapAng, opts = {}) => {
    const cx = rect.cx, cz = rect.cz, N = 40;
    GR.quad(rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0.01, '#8f8b84');
    // field
    for (let k = -4; k < 4; k++) {
      const x0 = cx + (k / 4) * a, x1 = cx + ((k + 1) / 4) * a;
      GR.quad(x0, cz - b, x1, cz + b, 0.03, k % 2 ? '#3f8f3a' : '#4a9a44');
    }
    if (opts.cricket) GR.quad(cx - 1.6, cz - 10, cx + 1.6, cz + 10, 0.04, '#c9b48a');
    else { GR.quad(cx - 0.2, cz - b, cx + 0.2, cz + b, 0.04, '#ffffff'); }
    for (let k = 0; k < N; k++) {
      const th = (k / N) * TAU;
      if (Math.abs(angDiff(th, gapAng)) < 0.2) continue;
      const ca = Math.cos(th), sa = Math.sin(th);
      const ex = (r) => cx + ca * (a + r), ez = (r) => cz + sa * (b + r);
      const tang = (TAU * (a + b) / 2 + 40) / N + 1.5;
      for (let t = 0; t < 3; t++) {
        const r = 3 + t * 5.5;
        P.box(ex(r), 0, ez(r), tang, 2.5 + t * 4.5, 5.6, t % 2 ? seat : opts.seat2 || seat, Math.PI / 2 - th);
      }
      P.box(ex(19), 0, ez(19), tang + 1, 16, 1.2, '#b9b6ae', Math.PI / 2 - th);
      P.box(ex(12), 16, ez(12), tang + 1, 0.5, 15, roof, Math.PI / 2 - th);
      const x = ex(12), z = ez(12);
      addCol(x - 7, x + 7, z - 7, z + 7, 17);
    }
    World.fp.push([cx - a - 18, cz - b - 18, cx + a + 18, cz + b + 18, '#5a5550']);
    World.fp.push([cx - a, cz - b, cx + a, cz + b, '#3f8f3a']);
  };
  stadium(L.suncorp, 30, 22, '#7a1f3d', '#e8e8e8', Math.PI / 2, { seat2: '#8e2a4c' });
  stadium(L.gabba, 26, 26, '#d9d9d9', '#cfd6dc', -Math.PI / 2, { cricket: true, seat2: '#7b1e34' });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = L.gabba.cx + dx * 46, z = L.gabba.cz + dz * 46;
    P.box(x, 0, z, 1.2, 42, 1.2, '#999');
    NE.box(x, 42, z, 6, 4, 1, '#fffbe8');
    addCol(x - 1, x + 1, z - 1, z + 1, 42);
  }
  addSign(scene, signTexture('THE GABBA', '#7b1e34', '#ffd200', 'bold 80px Arial'), L.gabba.cx, 24, L.gabba.cz - 50, 30, 7, 0, true);
  addSign(scene, signTexture('SUNCORP STADIUM', '#7a1f3d', '#ffffff', 'bold 64px Arial'), L.suncorp.cx, 22, L.suncorp.cz + 44, 34, 7, 0, true);

  // XXXX Brewery
  {
    const { cx, cz } = L.xxxx;
    R.box(cx, 0, cz, 34, 13, 28, '#a0492f', 0, 26);
    P.box(cx + 12, 0, cz - 9, 3, 26, 3, '#7d3424');
    for (let k = 0; k < 3; k++) P.add(CYL, M(cx - 12 + k * 5, 9, cz + 15, 2, 18, 2), '#c9c9c9');
    addCol(cx - 17, cx + 17, cz - 14, cz + 18, 18);
    World.fp.push([cx - 17, cz - 14, cx + 17, cz + 14, '#6a2a1a']);
    const tex = signTexture('XXXX', '#f2c230', '#d6201b', 'bold 120px Impact, Arial Black', 512, 160);
    P.box(cx, 13, cz, 1, 5, 1, '#444');
    addSign(scene, tex, cx, 21, cz, 26, 8, 0, true);
  }

  // City Hall + King George Square
  {
    const { cx, cz } = L.cityhall;
    GR.quad(cx - 20, cz - 20, cx + 20, cz + 20, 0.02, '#c9c1ad');
    R.box(cx, 0, cz - 9, 36, 13, 20, '#dcc79c', 0, 26);
    P.box(cx, 13, cz - 9, 30, 2, 16, '#cdb88c');
    P.box(cx, 0, cz - 9, 6, 46, 6, '#dcc79c');
    P.box(cx, 46, cz - 9, 4, 6, 4, '#cdb88c');
    P.add(CONE4, M(cx, 55, cz - 9, 2.8, 6, 2.8, 0, Math.PI / 4), '#5f6d5a');
    NE.box(cx, 40, cz - 5.9, 3.4, 3.4, 0.2, '#fdf6dc');
    addCol(cx - 18, cx + 18, cz - 19, cz + 1, 46);
    World.fp.push([cx - 18, cz - 19, cx + 18, cz + 1, '#7b6d50']);
    tree('fig', cx - 14, cz + 12, 0.8); tree('fig', cx + 14, cz + 12, 0.8);
  }

  // Royal Brisbane & Women's Hospital
  {
    const { cx, cz } = L.hospital;
    R.box(cx, 0, cz - 4, 34, 32, 24, '#f2f2ee', 0, 26);
    P.box(cx, 20, cz + 8.1, 2, 8, 0.3, '#d61f1f'); P.box(cx, 23, cz + 8.1, 8, 2, 0.3, '#d61f1f');
    addCol(cx - 17, cx + 17, cz - 16, cz + 8, 32);
    World.fp.push([cx - 17, cz - 16, cx + 17, cz + 8, '#d0d0d0']);
    addSign(scene, signTexture('RBWH  HOSPITAL', '#ffffff', '#c01818', 'bold 64px Arial'), cx, 3.5, cz + 8.3, 18, 4.5, 0, true);
    World.pois.hospital = { x: cx, z: cz + 16 };
  }

  // Police HQ, Roma St
  {
    const { cx, cz } = L.police;
    R.box(cx, 0, cz - 4, 32, 26, 26, '#b8c4d0', 0, 26);
    P.box(cx, 6, cz + 9.05, 32, 1.4, 0.3, '#1c3f8f');
    addCol(cx - 16, cx + 16, cz - 17, cz + 9, 26);
    World.fp.push([cx - 16, cz - 17, cx + 16, cz + 9, '#28407a']);
    addSign(scene, signTexture('QUEENSLAND POLICE', '#1c3f8f', '#ffffff', 'bold 54px Arial'), cx, 3.5, cz + 9.3, 18, 4.5, 0, true);
    World.pois.police = { x: cx, z: cz + 16 };
  }

  // South Bank: Wheel, Streets Beach, BRISBANE sign
  {
    const findDry = (x, z) => { while (World.isWater(x, z) || World.isWater(x, z - 12)) z += 4; return z; };
    const wx = -95, wz = findDry(-95, 262) + 4;
    const wheel = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.35, 6, 48), steel);
    wheel.add(ring);
    for (let k = 0; k < 16; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, 15, 0.15), steel);
      s.rotation.z = (k / 16) * TAU; s.position.set(Math.sin(-s.rotation.z) * 7.5, Math.cos(s.rotation.z) * 7.5, 0);
      wheel.add(s);
    }
    wheel.position.set(wx, 17, wz);
    scene.add(wheel);
    const pods = [], podMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3366ff, emissiveIntensity: 0 });
    World.nightMats.push(podMat);
    for (let k = 0; k < 18; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), podMat); scene.add(p); pods.push(p); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.beam(wx + sx * 7, 0, wz + sz * 3, wx, 17, wz, 0.6, '#dddddd');
    addCol(wx - 8, wx + 8, wz - 3.5, wz + 3.5, 4);
    World.fp.push([wx - 15, wz - 1, wx + 15, wz + 1, '#ffffff']);
    World.anim.push({ update: (dt, t) => {
      wheel.rotation.z = t * 0.06;
      pods.forEach((p, k) => { const a = t * 0.06 + (k / pods.length) * TAU; p.position.set(wx + Math.sin(a) * 15, 17 - Math.cos(a) * 15 - 1, wz); });
    } });
    // Streets Beach lagoon
    const bx = -35, bz = findDry(-35, 270) + 22;
    GR.quad(bx - 22, bz - 14, bx + 22, bz + 14, 0.02, '#ead9a6');
    GR.quad(bx - 16, bz - 9, bx + 16, bz + 9, 0.04, '#3fc2df');
    for (let k = 0; k < 8; k++) tree('palm', bx - 20 + k * 5.7, bz + (k % 2 ? 12 : -12), 0.9, false);
    World.fp.push([bx - 16, bz - 9, bx + 16, bz + 9, '#3fc2df']);
    World.pois.southbank = { x: bx, z: bz + 18 };
    // BRISBANE letters
    const sx = 25, sz = findDry(25, 250) + 6;
    const signTex = canvasTex(1024, 160, (g) => {
      g.clearRect(0, 0, 1024, 160);
      g.font = 'bold 140px Arial Black, Arial'; g.textBaseline = 'middle';
      const cols = ['#e83f6f', '#ffbf00', '#2fbfe6', '#7ac943', '#9b5cff', '#ff7a2f', '#e83f6f', '#2fbfe6'];
      let x = 20;
      'BRISBANE'.split('').forEach((c, k) => { g.fillStyle = cols[k]; g.fillText(c, x, 84); x += g.measureText(c).width + 6; });
    }, false);
    const sm = new THREE.MeshLambertMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), sm);
    sign.position.set(sx, 1.7, sz); scene.add(sign);
    addCol(sx - 10, sx + 10, sz - 0.4, sz + 0.4, 3.3);
  }

  // Kangaroo Point Cliffs
  for (let z = -100; z <= -20; z += 5) {
    let x = 150;
    while (World.isWater(x, z) && x < 240) x += 2;
    if (x >= 240) continue;
    const h = 9 + Math.sin(z * 0.3) * 3 + Math.random() * 2;
    P.box(x + 4, 0, z, 8, h, 5.2, pick(['#a8754a', '#9c6a43', '#b58457']));
    addCol(x, x + 8, z - 2.6, z + 2.6, h);
    World.fp.push([x, z - 2.6, x + 8, z + 2.6, '#8a5a35']);
  }
  World.pois.kpcliffs = { x: 215, z: -60 };

  // Mt Coot-tha summit: lookout + TV towers
  {
    const y0 = World.groundY(MT.x, MT.z);
    P.box(MT.x, y0 - 1, MT.z + 10, 16, 6, 10, '#d8d2c4');
    P.box(MT.x, y0 + 5, MT.z + 10, 18, 0.5, 12, '#6b4f3a');
    addCol(MT.x - 8, MT.x + 8, MT.z + 5, MT.z + 15, y0 + 6, y0 - 2);
    for (const [dx, dz, h] of [[-22, -14, 60], [18, -20, 72], [4, -32, 50]]) {
      const x = MT.x + dx, z = MT.z + dz, y = World.groundY(x, z);
      for (let k = 0; k < 8; k++) P.box(x, y + k * (h / 8), z, 2.4 - k * 0.2, h / 8, 2.4 - k * 0.2, k % 2 ? '#ffffff' : '#d42a20');
      NE.box(x, y + h, z, 0.8, 0.8, 0.8, '#ff2020');
      addCol(x - 1.4, x + 1.4, z - 1.4, z + 1.4, y + h, y - 2);
    }
    World.pois.lookout = { x: MT.x, z: MT.z + 22 };
  }
  World.pois.xxxx = { x: L.xxxx.cx, z: L.xxxx.cz + 28 };
  World.pois.gabba = { x: L.gabba.cx, z: L.gabba.cz - 60 };
  World.pois.suncorp = { x: L.suncorp.cx, z: L.suncorp.cz + 58 };
}

function buildMountain(scene) {
  const S = MT.R * 2 + 20;
  const g = new THREE.PlaneGeometry(S, S, 90, 90);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, cols = [];
  const c1 = new THREE.Color('#5f8a45'), c2 = new THREE.Color('#7b7a4f'), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k) + MT.x, z = pos.getZ(k) + MT.z;
    const d = Math.hypot(x - MT.x, z - MT.z);
    pos.setXYZ(k, x, d > MT.R ? -0.5 : World.groundY(x, z) + 0.01, z);
    c.copy(c1).lerp(c2, clamp(World.groundY(x, z) / MT.H, 0, 1) * 0.7 + Math.random() * 0.15);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  scene.add(m);
}

function buildFerries(scene) {
  const hull = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x1f4ea8 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x24313d });
  const pts = World.river;
  const s0 = 120, s1 = World.riverLen - 120;
  World.ferries = [];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.Group();
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 22), hull); h1.position.set(-2.4, 0.4, 0); g.add(h1);
    const h2 = h1.clone(); h2.position.x = 2.4; g.add(h2);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.5, 18), blue); deck.position.y = 1.3; g.add(deck);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.4, 13), hull); cab.position.y = 2.7; g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.9, 12), glass); win.position.y = 3.2; g.add(win);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 4), hull); top.position.set(0, 4.3, -3); g.add(top);
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    World.ferries.push({ g, s: s0 + Math.random() * (s1 - s0), dir: k % 2 ? 1 : -1, speed: 9 });
  }
  World.anim.push({ update: (dt, t) => {
    for (const f of World.ferries) {
      f.s += f.dir * f.speed * dt;
      if (f.s > s1) { f.s = s1; f.dir = -1; }
      if (f.s < s0) { f.s = s0; f.dir = 1; }
      const i = clamp(Math.floor(f.s / 4), 0, pts.length - 2), u = f.s / 4 - i;
      const a = pts[i], b = pts[i + 1];
      const tx = b.x - a.x, tz = b.z - a.z;
      const off = f.dir * 9; // keep left
      const l = Math.hypot(tx, tz);
      f.g.position.set(lerp(a.x, b.x, u) + (tz / l) * off, Math.sin(t * 1.5 + f.s) * 0.08, lerp(a.z, b.z, u) - (tx / l) * off);
      f.g.rotation.y = Math.atan2(tx * f.dir, tz * f.dir);
    }
  } });
}

function buildMinimap() {
  const S = 2 * HALF, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const X = (x) => x + HALF;
  g.fillStyle = '#3b4637'; g.fillRect(0, 0, S, S);
  const lot = { cbd: '#4d4f4b', mid: '#4a4c47', valley: '#4f4652', suburb: '#43513c', park: '#3f6b38', industrial: '#4b4b46', southbank: '#467a3c', mountain: '#4c6a40' };
  for (const b of World.blocks) {
    g.fillStyle = lot[b.zone] || '#43513c';
    g.fillRect(X(lineC(b.i) + 7), X(lineC(b.j) + 7), 46, 46);
  }
  g.fillStyle = '#3f74a0';
  for (let ix = 0; ix < MW; ix++) for (let iz = 0; iz < MW; iz++) if (World.mask[ix * MW + iz]) g.fillRect(ix * MCELL, iz * MCELL, MCELL, MCELL);
  for (const f of World.fp) { g.fillStyle = f[4]; g.fillRect(X(f[0]), X(f[1]), f[2] - f[0], f[3] - f[1]); }
  const seg = (x0, z0, x1, z1, t) => {
    g.fillStyle = t === 3 ? '#c9a46b' : t === 2 ? '#c8c2ad' : '#a6abb0';
    g.fillRect(X(Math.min(x0, x1)) - 7, X(Math.min(z0, z1)) - 7, Math.abs(x1 - x0) + 14, Math.abs(z1 - z0) + 14);
  };
  for (let i = 0; i < NL - 1; i++) for (let j = 0; j < NL; j++) { const t = World.H[i * NL + j]; if (t) seg(lineC(i), lineC(j), lineC(i + 1), lineC(j), t); }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NL - 1; j++) { const t = World.V[i * NL + j]; if (t) seg(lineC(i), lineC(j), lineC(i), lineC(j + 1), t); }
  World.mapCanvas = c;
}
