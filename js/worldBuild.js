'use strict';
// Turns World data into merged, chunked meshes + colliders + the minimap image.

const MAT = {};
const CHUNK = 170;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.6, 1, 1, 5, 1, true);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
// Unit box with its top edge pulled down on the -z side (sloped roof / slanted crown).
const WEDGE = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) < 0) p.setY(i, -0.5);
  g.computeVertexNormals();
  return g;
})();
// Unit triangular prism: ridge along z at the top centre (gable roof).
const GABLE = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, 0);
  g.computeVertexNormals();
  return g;
})();
const DOME = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const _cyls = {};
const CYLN = (n) => _cyls[n] || (_cyls[n] = new THREE.CylinderGeometry(1, 1, 1, n, 1, false));
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
  // Solid cylinder standing on y. uvS>0 maps window textures around it.
  cyl(x, y, z, r, h, color, n = 16, uvS = 0, rTop) {
    const g = rTop === undefined ? CYLN(n) : new THREE.CylinderGeometry(rTop / r, 1, 1, n, 1, false);
    this.add(g, M(x, y + h / 2, z, r, h, r), color, uvS
      ? (u, v, nx, ny) => (Math.abs(ny) > 0.5 ? [0.004, 0.004] : [u * TAU * r / uvS, v * h / uvS])
      : null);
  }
  // Any unit geometry scaled to w,h,d standing on y.
  shape(g, x, y, z, w, h, d, color, ry = 0) { this.add(g, M(x, y + h / 2, z, w, h, d, 0, ry, 0), color); }
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
  T.glassN = winNight(32, 28, 26, 0.3);
  T.render = winDay('#efece6', '#3d4852', '#2b333b', 32, 14, 18);
  T.renderN = winNight(32, 14, 18, 0.45);
  T.road = canvasTex(64, 128, (g) => {
    g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, 64, 128);
    for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(${pick(['255,255,255', '0,0,0'])},0.035)`; g.fillRect(Math.random() * 64, Math.random() * 128, 1, 1); }
    g.fillStyle = '#e8e8e0'; g.fillRect(31, 0, 2, 60);
    g.fillStyle = '#d8d8d0'; g.fillRect(3, 0, 1.5, 128); g.fillRect(59.5, 0, 1.5, 128);
  });
  T.water = canvasTex(128, 128, (g) => {
    g.fillStyle = '#4f6872'; g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 220; k++) {
      g.fillStyle = `rgba(${pick(['190,210,220', '120,105,70', '150,180,195'])},${rand(0.06, 0.18)})`;
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
  MAT.ground = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
  MAT.road = new THREE.MeshLambertMaterial({ map: T.road, vertexColors: true });
  MAT.neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.water = new THREE.MeshPhongMaterial({ map: T.water, color: 0xd0dce0, specular: 0x9aaab4, shininess: 90, side: THREE.DoubleSide });
  World.nightMats.push(MAT.glass, MAT.render);

  const G = new Merger(), R = new Merger(), P = new Merger(), GR = new Merger(), RD = new Merger(), NE = new Merger();
  const rng = World.rng;
  const rp = (a) => a[Math.floor(rng() * a.length)];
  const rr = (a, b) => a + rng() * (b - a);

  // ---------- Landmark reservations ----------
  const L = World.landmarks;
  L.suncorp = World.reserve(blockIdx(-360), blockIdx(-240), 2, 2);
  L.gabba = World.reserve(blockIdx(180), blockIdx(300), 2, 2);
  const one = World.claimOne = (x, z) => { const b = World.blockAt(x, z); b.used = true; return { cx: b.cx, cz: b.cz, minX: b.cx - 20, maxX: b.cx + 20, minZ: b.cz - 20, maxZ: b.cz + 20 }; };
  L.xxxx = one(-450, 30);
  L.cityhall = one(-90, -90);
  L.hospital = one(-90, -570);
  L.lookout = { cx: MT.x, cz: MT.z };

  // ---------- Ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), new THREE.MeshLambertMaterial({ color: 0x6a8f4d, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 }));
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
        if (k < n - 1) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      g.attributes.normal.array.fill(0); for (let k = 1; k < g.attributes.normal.array.length; k += 3) g.attributes.normal.array[k] = 1;
      return g;
    };
    const bank = new THREE.Mesh(mk(RIVER_HW + 5, 0.03, 50), new THREE.MeshLambertMaterial({ color: 0x77694f, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }));
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
  const glassTints = ['#d6e6f5', '#cfe8e6', '#e4e4e4', '#f0e2c6', '#b9cbdc', '#a9c2c8', '#e8d8c8', '#c4ccd8', '#9fb4c4', '#d0d8e0'];
  const renderTints = ['#f2efe8', '#e6d6b8', '#d9c4a4', '#c97e5e', '#b8b8b0', '#e9e1d0', '#a96a50', '#dcd2c0', '#cfd8d2', '#e8dccb'];
  const houseWalls = ['#f4f1e8', '#efe6cf', '#f2e9b8', '#cfe0e4', '#d8e4cc', '#f1d9c9', '#e6e6e6', '#d9e8f0', '#f6efe0', '#e3eadb'];
  const roofs = ['#a9adb0', '#a9adb0', '#8c3b2e', '#3e5e48', '#4a4f52', '#b4b9bc', '#6d2b2b', '#c4c8ca'];
  const neon = ['#ff2fa8', '#2ff6ff', '#ffe23a', '#9b5cff', '#3aff7a', '#ff6a2f'];
  const fp = (x0, z0, x1, z1, c) => World.fp.push([x0, z0, x1, z1, c]);
  const PS = new Merger(); // small props, no shadows

  // Street-level dressing shared by towers and mid-rise: shopfront glass, awning over the footpath.
  const streetFront = (x, z, w, d, sx, sz, awning) => {
    G.box(x, 0, z, w + 0.12, 3.6, d + 0.12, rp(['#d8e6ee', '#e6eef2', '#f2e6d0', '#cfe0ea']), 0, 28);
    P.box(x, 3.6, z, w + 0.2, 0.4, d + 0.2, rp(['#3a3d40', '#7a1f3d', '#2e5d4b', '#e8e6e0']));
    if (!awning) return;
    if (sx) P.box(x + sx * (w / 2 + 1.5), 3.8, z, 3, 0.25, d, '#e8e6e0');
    if (sz) P.box(x, 3.8, z + sz * (d / 2 + 1.5), w, 0.25, 3, '#e8e6e0');
  };
  const roofKit = (x, z, w, d, h) => {
    if (rng() < 0.8) P.box(x + rr(-w / 5, w / 5), h, z + rr(-d / 5, d / 5), w * rr(0.25, 0.4), rr(2, 4), d * rr(0.25, 0.4), '#8f9294');
    if (rng() < 0.5) PS.cyl(x - w / 3, h, z + d / 3, 1.2, 2.2, '#b9bcbe', 8);
    if (h > 60 && rng() < 0.4) PS.box(x + w / 3, h, z - d / 3, 0.3, 8, 0.3, '#cccccc');
    if (h > 100) NE.box(x, h + 0.6, z, 0.8, 0.8, 0.8, '#ff2222');
  };

  // Tower with a few Brisbane-flavoured silhouettes.
  const tower = (x, z, w, d, h, tint, glass, sx = 0, sz = 0, street = true) => {
    const M_ = glass ? G : R, uv = glass ? 28 : 26;
    const style = h < 22 ? 'plain' : rp(h > 70 ? ['tiered', 'balcony', 'fins', 'crown', 'cyl', 'slant', 'balcony'] : ['plain', 'balcony', 'fins', 'plain']);
    let top = h;
    switch (style) {
      case 'tiered': {
        const h1 = h * 0.62, h2 = h * 0.24, h3 = h - h1 - h2;
        M_.box(x, 0, z, w, h1, d, tint, 0, uv);
        M_.box(x, h1, z, w * 0.82, h2, d * 0.82, tint, 0, uv);
        M_.box(x, h1 + h2, z, w * 0.6, h3, d * 0.6, tint, 0, uv);
        P.box(x, h1, z, w + 0.4, 0.6, d + 0.4, '#d8d8d4'); P.box(x, h1 + h2, z, w * 0.82 + 0.4, 0.6, d * 0.82 + 0.4, '#d8d8d4');
        break;
      }
      case 'balcony': {
        G.box(x, 0, z, w * 0.9, h, d * 0.9, rp(['#9fb4c4', '#b8c8d4', '#a9c2c8']), 0, 28);
        const slab = rp(['#f4f4f0', '#e8e4da', '#dfe6ea']);
        for (let y = 6.4; y < h - 1; y += 3.2) P.box(x, y, z, w + 1.2, 0.28, d + 1.2, slab);
        P.box(x, h, z, w + 1.2, 1.2, d + 1.2, slab);
        if (rng() < 0.5) PS.box(x, h + 1.2, z, w * 0.8, 3, 0.3, '#f4f4f0'); // roof blade
        top = h + 1.2;
        break;
      }
      case 'fins': {
        M_.box(x, 0, z, w, h, d, tint, 0, uv);
        const fin = rp(['#e8e8e8', '#9aa0a6', '#c8b89a']);
        const nx = Math.max(2, Math.round(w / 4)), nz = Math.max(2, Math.round(d / 4));
        for (let k = 0; k <= nx; k++) { const fx = x - w / 2 + (k / nx) * w; PS.box(fx, 4, z - d / 2 - 0.3, 0.35, h - 4, 0.6, fin); PS.box(fx, 4, z + d / 2 + 0.3, 0.35, h - 4, 0.6, fin); }
        for (let k = 1; k < nz; k++) { const fz = z - d / 2 + (k / nz) * d; PS.box(x - w / 2 - 0.3, 4, fz, 0.6, h - 4, 0.35, fin); PS.box(x + w / 2 + 0.3, 4, fz, 0.6, h - 4, 0.35, fin); }
        break;
      }
      case 'crown': {
        M_.box(x, 0, z, w, h, d, tint, 0, uv);
        const c = '#e2e2de', ch = Math.min(18, h * 0.12);
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(x + cx * (w / 2 - 0.5), h, z + cz * (d / 2 - 0.5), 1, ch, 1, c);
        P.box(x, h + ch - 1, z - d / 2 + 0.5, w, 1, 1, c); P.box(x, h + ch - 1, z + d / 2 - 0.5, w, 1, 1, c);
        P.box(x - w / 2 + 0.5, h + ch - 1, z, 1, 1, d, c); P.box(x + w / 2 - 0.5, h + ch - 1, z, 1, 1, d, c);
        NE.box(x, h + ch - 1.6, z - d / 2 + 0.5, w * 0.9, 0.3, 0.3, '#bfe6ff'); NE.box(x, h + ch - 1.6, z + d / 2 - 0.5, w * 0.9, 0.3, 0.3, '#bfe6ff');
        if (h > 150) { P.box(x, h + ch, z, 0.8, 25, 0.8, '#d0d0d0'); top = h + ch + 25; }
        break;
      }
      case 'cyl': {
        const r = Math.min(w, d) / 2;
        P.box(x, 0, z, w, 7, d, rp(renderTints));
        G.cyl(x, 7, z, r, h - 7, tint, 20, 28);
        P.cyl(x, h, z, r + 0.4, 1, '#d8d8d4', 20);
        break;
      }
      case 'slant': {
        const sh = Math.min(24, h * 0.15);
        M_.box(x, 0, z, w, h - sh, d, tint, 0, uv);
        G.shape(WEDGE, x, h - sh, z, w, sh, d, tint, rp([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
        break;
      }
      default: {
        M_.box(x, 0, z, w, h, d, tint, 0, uv);
        P.box(x, h, z, w + 0.3, 0.8, d + 0.3, '#cfcfca');
      }
    }
    if (street) streetFront(x, z, w, d, sx, sz, rng() < 0.75);
    roofKit(x, z, w * 0.7, d * 0.7, top);
    addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
    fp(x - w / 2, z - d / 2, x + w / 2, z + d / 2, glass ? '#26303a' : '#2f3330');
  };
  World.towerFn = tower;

  // Old two-storey shop-top terrace with a parapet, the Valley / West End / Paddington main-street look.
  const shopTop = (x, z, w, d, sx, sz) => {
    const c = rp(['#c97e5e', '#e6d6b8', '#d9c4a4', '#b5654a', '#e9e1d0', '#9db4a6', '#e7c9a0']);
    R.box(x, 0, z, w, 8, d, c, 0, 26);
    P.box(x, 8, z, w + 0.2, 1.4, d + 0.2, c);
    streetFront(x, z, w, d, sx, sz, true);
    if (sx) for (let k = -1; k <= 1; k += 2) PS.box(x + sx * (w / 2 + 2.9), 0, z + k * (d / 2 - 1), 0.15, 3.8, 0.15, '#3a3a3a');
    if (sz) for (let k = -1; k <= 1; k += 2) PS.box(x + k * (w / 2 - 1), 0, z + sz * (d / 2 + 2.9), 0.15, 3.8, 0.15, '#3a3a3a');
    addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 9.4);
    fp(x - w / 2, z - d / 2, x + w / 2, z + d / 2, '#3a3330');
  };

  const houseRoof = (cx, cy, cz, hw, hd, rh, color, gable) => {
    if (gable) { P.shape(GABLE, cx, cy, cz, hw * 2, rh, hd * 2, color); return; }
    const m = new THREE.Matrix4().makeTranslation(cx, cy + rh / 2, cz)
      .multiply(new THREE.Matrix4().makeScale(hw / 0.7071, rh, hd / 0.7071))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
    P.add(CONE4, m, color);
  };

  // Yard dressing shared by every house type.
  const yard = (x, z, faceZ, lotX0, lotX1) => {
    const frontZ = z + faceZ * 9.2;
    const fence = rp(['#f4f4f0', '#f4f4f0', '#3e4a40', '#5a5f63', '#8a6f55']);
    PS.box((lotX0 + x - 1.8) / 2, 0, frontZ, x - 1.8 - lotX0, 1.1, 0.12, fence);
    PS.box((x + 1.8 + lotX1) / 2, 0, frontZ, lotX1 - x - 1.8, 1.1, 0.12, fence);
    PS.box(x - 2.4, 0, frontZ + faceZ * 0.2, 0.1, 1.1, 0.1, '#777'); PS.box(x - 2.4, 1.1, frontZ + faceZ * 0.2, 0.5, 0.4, 0.4, rp(['#d23', '#eee', '#335', '#c90']));
    if (rng() < 0.4) { // wheelie bin out for collection
      const bx2 = x + 2.6;
      PS.box(bx2, 0, frontZ + faceZ * 0.8, 0.6, 1.0, 0.7, '#2f6b3a'); PS.box(bx2, 1.0, frontZ + faceZ * 0.8, 0.66, 0.08, 0.76, rp(['#c8302a', '#e3c21b']));
    }
  };

  const queenslander = (x, z, faceZ, lotX0, lotX1) => {
    const wall = rp(houseWalls), roof = rp(roofs), trim = rp(['#ffffff', '#ffffff', '#2e5d4b', '#7a1f3d', '#3a5f8a']);
    const W = rr(8.5, 10.5), D = rr(9.5, 11.5);
    P.box(x, 0, z, W - 0.5, 2.1, D - 0.5, '#5b4b3c');
    P.box(x, 2.1, z, W, 3.2, D, wall);
    const vz = z + faceZ * (D / 2 + 1.3);
    P.box(x, 1.95, vz, W, 0.3, 2.6, '#8a6f55');
    PS.box(x, 2.25, z + faceZ * (D / 2 + 2.5), W, 0.9, 0.15, trim);
    for (const px of [-W / 2 + 0.2, -W / 6, W / 6, W / 2 - 0.2]) PS.box(x + px, 2.1, z + faceZ * (D / 2 + 2.5), 0.15, 3.2, 0.15, trim);
    P.box(x + W / 2 - 1.5, 0, z + faceZ * (D / 2 + 3.6), 1.4, 1.2, 2.2, '#8a6f55');
    houseRoof(x, 5.3, z + faceZ * 1.2, W / 2 + 0.6, D / 2 + 2.6, 2.6, roof, rng() < 0.35);
    if (rng() < 0.35) PS.cyl(x - W / 2 - 1.1, 0, z - faceZ * 2, 0.9, 2.2, '#b8bcbd', 10); // rainwater tank
    if (rng() < 0.3) P.box(x, 5.3, z - faceZ * 2, 0.6, 3.4, 0.6, '#8a4a3a'); // chimney / vent
    addCol(x - W / 2, x + W / 2, Math.min(z - D / 2, z + faceZ * (D / 2 + 2.6)), Math.max(z + D / 2, z + faceZ * (D / 2 + 2.6)), 8);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
    return D;
  };
  const lowset = (x, z, faceZ) => { // post-war brick with a terracotta tile roof
    const W = rr(9, 11), D = rr(9, 10.5);
    P.box(x, 0, z, W, 3, D, rp(['#a0553a', '#b26a4a', '#8e4a33', '#c9b8a0', '#e8e0d0']));
    houseRoof(x, 3, z, W / 2 + 0.6, D / 2 + 0.6, 2.2, rp(['#b5562f', '#9a4a2c', '#5a5f63']), rng() < 0.4);
    P.box(x + W / 2 + 1.5, 0, z, 3, 2.6, 5.5, '#d8d6d0');
    PS.box(x + W / 2 + 1.5, 2.6, z, 3.4, 0.15, 6, '#9aa0a4');
    addCol(x - W / 2, x + W / 2 + 3, z - D / 2, z + D / 2, 6);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
  };
  const modernHome = (x, z, faceZ) => { // boxy new build with a pool
    const W = rr(10, 12), D = rr(9, 11);
    P.box(x, 0, z, W, 3.2, D, rp(['#f2f2ef', '#e9e6df', '#d8d8d4']));
    P.box(x + rr(-1, 1), 3.2, z - faceZ * 1, W * 0.7, 3, D * 0.75, rp(['#3d4347', '#f2f2ef', '#6b5a48']));
    G.box(x, 0.4, z + faceZ * (D / 2 + 0.05), W * 0.6, 2.4, 0.1, '#7f97a8', 0, 28);
    P.box(x, 6.2, z - faceZ * 1, W * 0.75, 0.3, D * 0.8, '#dededa');
    GR.quad(x - 3, z - faceZ * 7.5 - 1.5, x + 3, z - faceZ * 7.5 + 1.5, 0.03, '#3fbde0');
    addCol(x - W / 2, x + W / 2, z - D / 2, z + D / 2, 7);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
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
      P.add(ICO, M(x + 1.2 * s, y + 4.6 * s, z - 0.8 * s, 2.2 * s, 1.6 * s, 2.2 * s, 0, rng() * 3), rp(['#8f6fd1', '#a585e0']));
    } else if (kind === 'gum') {
      P.add(CYL, M(x, y + 3.5 * s, z, 0.32 * s, 7 * s, 0.32 * s), '#d9d2c3');
      P.add(ICO, M(x + 0.6, y + 7.5 * s, z, 2.6 * s, 2.4 * s, 2.6 * s, 0, rng() * 3), rp(['#6f8a4a', '#7a9152', '#62804a']));
      P.add(ICO, M(x - 0.8, y + 9.3 * s, z + 0.5, 1.8 * s, 1.7 * s, 1.8 * s, 0, rng() * 3), '#71904d');
    } else if (kind === 'fig') {
      P.add(CYL, M(x, y + 2 * s, z, 0.8 * s, 4 * s, 0.8 * s), '#6a5a48');
      P.add(ICO, M(x, y + 5 * s, z, 5 * s, 3 * s, 5 * s, 0, rng() * 3), rp(['#3d6a33', '#46753a']));
      P.add(ICO, M(x - 2 * s, y + 4.4 * s, z + 1.5 * s, 3 * s, 2 * s, 3 * s, 0, rng() * 3), '#3a6430');
    } else if (kind === 'bottle') {
      P.add(ICO, M(x, y + 1.6 * s, z, 1.1 * s, 1.8 * s, 1.1 * s), '#8a7a62');
      P.add(ICO, M(x, y + 4 * s, z, 2.4 * s, 1.6 * s, 2.4 * s, 0, rng() * 3), '#5f8a45');
    } else {
      P.add(CYL, M(x, y + 1.8 * s, z, 0.3 * s, 3.6 * s, 0.3 * s), '#5d4a3a');
      P.add(ICO, M(x, y + 4 * s, z, 4 * s, 1.5 * s, 4 * s, 0, rng() * 3), rp(['#d2492f', '#c8402a']));
    }
    if (collide) addCol(x - 0.45, x + 0.45, z - 0.45, z + 0.45, y + 6, y - 1, 'prop');
  };
  World.tree = tree;
  const anyTree = () => rp(['palm', 'jacaranda', 'jacaranda', 'gum', 'fig', 'poinciana', 'bottle']);
  const K = { scene, G, R, P, PS, GR, RD, NE, rng, rp, rr, tree, fp, tower, shopTop, glassTints, renderTints, neon, anyTree };
  World.K = K;
  Landmarks.reserve(K);

  const QUADS = [[-10, -10], [10, -10], [-10, 10], [10, 10]];
  const dryRect = (x, z, hw, hd) => !World.isWater(x - hw, z - hd) && !World.isWater(x + hw, z - hd) && !World.isWater(x - hw, z + hd) && !World.isWater(x + hw, z + hd) && !World.isWater(x, z);
  for (const b of World.blocks) {
    if (b.used) continue;
    const x0 = lineC(b.i) + 10, z0 = lineC(b.j) + 10, x1 = x0 + 40, z1 = z0 + 40;
    const dry = (x, z, r = 4) => !World.isWater(x, z) && !World.isWater(x + r, z) && !World.isWater(x - r, z) && !World.isWater(x, z + r) && !World.isWater(x, z - r);
    if (b.zone === 'mountain') {
      for (let k = 0; k < 11; k++) {
        const x = rr(x0 - 8, x1 + 8), z = rr(z0 - 8, z1 + 8);
        if (Math.hypot(x - MT.x, z - MT.z) < 40) continue;
        tree('gum', x, z, rr(0.8, 1.3));
      }
      continue;
    }
    if (b.wet > 0) {
      // Riverfront: build on whichever quarters are dry land, plant the rest.
      const urban = b.zone === 'cbd' || b.zone === 'mid' || b.zone === 'valley';
      for (const [ox, oz] of QUADS) {
        const x = b.cx + ox, z = b.cz + oz;
        if (urban && dryRect(x, z, 10, 10)) {
          GR.quad(x - 10, z - 10, x + 10, z + 10, 0.0, b.zone === 'cbd' ? '#8e8c86' : '#8f8b82');
          const h = b.zone === 'cbd' ? rr(40, 140) : rr(12, 45);
          tower(x, z, rr(14, 17), rr(14, 17), h, rp(rng() < 0.6 ? glassTints : renderTints), rng() < 0.6, Math.sign(ox), Math.sign(oz));
        } else if (dry(x, z, 6)) tree(rp(['fig', 'palm', 'jacaranda', 'poinciana']), x + rr(-4, 4), z + rr(-4, 4));
      }
      continue;
    }
    switch (b.zone) {
      case 'cbd': {
        const core = clamp(1 - Math.hypot(b.cx + 40, b.cz - 10) / 230, 0, 1);
        if (rng() < 0.4) {
          const h = rr(30, 55) + core * rr(60, 200);
          R.box(b.cx, 0, b.cz, 38, 8, 38, rp(renderTints), 0, 26);
          streetFront(b.cx, b.cz, 38, 38, 1, 1, true); streetFront(b.cx, b.cz, 38, 38, -1, -1, true);
          addCol(x0 + 1, x1 - 1, z0 + 1, z1 - 1, 8);
          tower(b.cx, b.cz, rr(22, 28), rr(22, 28), h, rp(glassTints), true, 0, 0, false);
        } else {
          for (const [ox, oz] of QUADS) {
            const h = rr(20, 45) + core * rr(20, 140) * rng();
            const glass = rng() < 0.7;
            tower(b.cx + ox, b.cz + oz, rr(15, 18), rr(15, 18), h, rp(glass ? glassTints : renderTints), glass, Math.sign(ox), Math.sign(oz));
          }
        }
        break;
      }
      case 'industrial': {
        // Newstead / Bowen Hills: sawtooth-roof warehouses and a yard.
        const h = rr(7, 11), c = rp(['#b8b8b0', '#9aa4ac', '#c9b99a', '#a8aaa0', '#8f9a8a']);
        R.box(b.cx, 0, b.cz - 4, 36, h, 28, c, 0, 26);
        for (let k = 0; k < 5; k++) P.shape(WEDGE, b.cx - 14.4 + k * 7.2, h, b.cz - 4, 7.2, 2.4, 28, rp(['#8a9096', '#a2a6a8']), Math.PI / 2);
        for (let k = -1; k <= 1; k++) P.box(b.cx + k * 10, 0, b.cz + 10.06, 5, 4.5, 0.1, '#6b7075');
        if (rng() < 0.5) { P.box(b.cx + 10, 0, b.cz + 15, 2.4, 2.6, 6, rp(['#e8e8e8', '#c8302a', '#2a5ba8'])); }
        addCol(x0 + 2, x1 - 2, b.cz - 18, b.cz + 10, h + 2);
        fp(x0 + 2, b.cz - 18, x1 - 2, b.cz + 10, '#33352f');
        break;
      }
      case 'mid': case 'valley': {
        for (const [ox, oz] of QUADS) {
          const x = b.cx + ox, z = b.cz + oz, sx = Math.sign(ox), sz = Math.sign(oz);
          const r = rng();
          if (r < 0.1) { tree(anyTree(), x, z); continue; }
          if (r < 0.45) shopTop(x, z, rr(15, 18), rr(15, 18), sx, sz);
          else tower(x, z, rr(14, 18), rr(14, 18), rr(10, b.zone === 'valley' ? 34 : 42), rp(renderTints), rng() < 0.25, sx, sz);
          if (b.zone === 'valley' && rng() < 0.85) {
            NE.box(x, rr(4.5, 7), z + sz * 8.7, rr(6, 12), 1.2, 0.2, rp(neon));
            if (rng() < 0.5) NE.box(x + sx * 8.7, rr(4.5, 8), z, 0.2, 2.4, 0.9, rp(neon));
          }
        }
        break;
      }
      case 'suburb': {
        for (const [lx, lz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const x = x0 + 10 + lx * 20 + rr(-1, 1), z = z0 + 10 + lz * 20 + (lz ? 1 : -1);
          const faceZ = lz ? 1 : -1, r = rng();
          if (r < 0.62) queenslander(x, z, faceZ);
          else if (r < 0.85) lowset(x - 1.5, z, faceZ);
          else modernHome(x, z, faceZ);
          yard(x, z - (lz ? 1 : -1), faceZ, x0 + lx * 20 + 0.3, x0 + lx * 20 + 19.7);
          if (rng() < 0.6) tree(anyTree(), x0 + lx * 20 + rr(2, 5), z0 + 10 + lz * 20 + rr(-6, 6), rr(0.7, 1));
        }
        break;
      }
      case 'park': case 'southbank': {
        const n = b.zone === 'park' ? 10 : 6;
        for (let k = 0; k < n; k++) tree(b.zone === 'southbank' ? rp(['palm', 'jacaranda', 'fig']) : anyTree(), rr(x0 + 2, x1 - 2), rr(z0 + 2, z1 - 2), rr(0.8, 1.3));
        // Footpaths through the park
        GR.quad(b.cx - 1.5, z0, b.cx + 1.5, z1, 0.02, '#c9c3b2'); GR.quad(x0, b.cz - 1.5, x1, b.cz + 1.5, 0.02, '#c9c3b2');
        if (rng() < 0.6) { // BBQ shelter, a Brisbane park staple
          const x = b.cx + rr(6, 12) * pick([-1, 1]), z = b.cz + rr(6, 12) * pick([-1, 1]);
          for (const [a, c] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) PS.box(x + a, 0, z + c, 0.2, 2.6, 0.2, '#777');
          P.shape(GABLE, x, 2.6, z, 5.4, 1.2, 4.4, '#3e5e48', Math.PI / 2);
          PS.box(x, 0, z, 1.6, 0.9, 0.8, '#666'); PS.box(x, 0, z + 1.2, 2.6, 0.75, 0.9, '#8a6f55');
        }
        if (b.zone === 'park' && rng() < 0.4) { // playground
          const x = b.cx + rr(-12, 12), z = b.cz + rr(-12, 12);
          GR.quad(x - 4, z - 4, x + 4, z + 4, 0.025, '#d9b98a');
          PS.box(x, 0, z, 2, 2.2, 2, '#e3c21b'); PS.box(x + 1.6, 0, z, 0.8, 1.6, 3, '#d23'); PS.box(x - 2.5, 0, z + 2, 0.1, 2.4, 0.1, '#3a7bff');
        }
        break;
      }
    }
  }

  // ---------- Queen St Mall dressing ----------
  for (let x = World.mall.minX + 14; x < World.mall.maxX - 10; x += 14) {
    tree(rp(['fig', 'jacaranda']), x, World.mall.z, 0.7);
    PS.box(x + 6, 0, World.mall.z + 4, 2.4, 0.5, 0.6, '#6d5038');
    PS.cyl(x + 7, 0, World.mall.z - 5, 0.1, 2.4, '#555', 6); PS.cyl(x + 7, 2.4, World.mall.z - 5, 1.8, 0.15, rp(['#c8302a', '#2a5ba8', '#f4f4f0']), 8);
  }

  buildLandmarks(scene, P, R, G, NE, GR, tree);
  Landmarks.build(K);
  buildProps(K);

  // ---------- Bake ----------
  GR.build(MAT.ground, scene, false, true);
  RD.build(MAT.road, scene, false, true);
  G.build(MAT.glass, scene, true, true);
  R.build(MAT.render, scene, true, true);
  P.build(MAT.plain, scene, true, true);
  PS.build(MAT.plain, scene, false, true);
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
    if (s <= t1) return lerp(6, 48, (s - a0) / (t1 - a0));
    if (s >= t2) return lerp(48, 6, (s - t2) / (a1 - t2));
    const u = (s - t1) / (t2 - t1);
    return 48 - 24 * Math.sin(u * Math.PI);
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
      P.box(x, -4, z, 2.8, 53, 2.8, steel);
    }
  }
  for (const s of [t1, t2]) {
    const [x, z] = at(s, 0);
    for (const y of [46, 34, 22]) { if (horiz) P.box(x, y, z, 1.2, 1.4, 23, steel); else P.box(x, y, z, 23, 1.4, 1.2, steel); }
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
    NE.box(cx, 40, cz - 5.9, 3.4, 3.4, 0.2, '#fdf6dc'); NE.box(cx, 40, cz - 12.1, 3.4, 3.4, 0.2, '#fdf6dc');
    NE.box(cx - 3.1, 40, cz - 9, 0.2, 3.4, 3.4, '#fdf6dc'); NE.box(cx + 3.1, 40, cz - 9, 0.2, 3.4, 3.4, '#fdf6dc');
    for (let k = 0; k < 12; k++) P.cyl(cx - 13 + k * (26 / 11), 0.8, cz + 1.8, 0.45, 10, '#dcc79c', 8);
    P.box(cx, 0, cz + 1.8, 28, 0.8, 3, '#cdb88c'); P.box(cx, 10.8, cz + 1.8, 28, 1.4, 3, '#cdb88c');
    P.add(CONE4, new THREE.Matrix4().makeTranslation(cx, 13, cz + 1.8).multiply(new THREE.Matrix4().makeScale(10, 2.4, 2.4)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4)), '#cdb88c');
    P.cyl(cx, 13, cz - 9, 4, 3, '#cdb88c', 12); P.add(DOME, M(cx, 15.5, cz - 9, 7, 5, 7), '#5f6d5a');
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
  const r = mulberry32(99);
  g.fillStyle = '#3b4637'; g.fillRect(0, 0, S, S);
  const lot = { cbd: '#4d4f4b', mid: '#4a4c47', valley: '#4f4652', suburb: '#43513c', park: '#3f6b38', industrial: '#4b4b46', southbank: '#467a3c', mountain: '#4c6a40' };
  for (const b of World.blocks) {
    g.fillStyle = lot[b.zone] || '#43513c';
    g.fillRect(X(lineC(b.i) + 7), X(lineC(b.j) + 7), 46, 46);
    if (b.zone === 'park' || b.zone === 'mountain' || b.zone === 'southbank' || b.zone === 'suburb') { // tree canopy speckle
      g.fillStyle = b.zone === 'suburb' ? 'rgba(40,70,35,0.55)' : 'rgba(35,75,30,0.8)';
      for (let k = 0; k < (b.zone === 'suburb' ? 8 : 26); k++) { g.beginPath(); g.arc(X(lineC(b.i) + 10 + r() * 40), X(lineC(b.j) + 10 + r() * 40), 1.5 + r() * 2.5, 0, TAU); g.fill(); }
    }
  }
  // River with a darker bank edge
  g.fillStyle = '#2f5a80';
  for (let ix = 0; ix < MW; ix++) for (let iz = 0; iz < MW; iz++) if (World.mask[ix * MW + iz]) g.fillRect(ix * MCELL - 1, iz * MCELL - 1, MCELL + 2, MCELL + 2);
  g.fillStyle = '#3f74a0';
  for (let ix = 0; ix < MW; ix++) for (let iz = 0; iz < MW; iz++) if (World.mask[ix * MW + iz]) g.fillRect(ix * MCELL, iz * MCELL, MCELL, MCELL);
  for (const f of World.fp) { g.fillStyle = f[4]; g.fillRect(X(f[0]), X(f[1]), f[2] - f[0], f[3] - f[1]); }
  const segs = [];
  for (let i = 0; i < NL - 1; i++) for (let j = 0; j < NL; j++) { const t = World.H[i * NL + j]; if (t) segs.push([lineC(i), lineC(j), lineC(i + 1), lineC(j), t]); }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NL - 1; j++) { const t = World.V[i * NL + j]; if (t) segs.push([lineC(i), lineC(j), lineC(i), lineC(j + 1), t]); }
  const rect = (x0, z0, x1, z1, w) => g.fillRect(X(Math.min(x0, x1)) - w, X(Math.min(z0, z1)) - w, Math.abs(x1 - x0) + w * 2, Math.abs(z1 - z0) + w * 2);
  g.fillStyle = '#7d817a'; for (const q of segs) if (q[4] !== 2) rect(q[0], q[1], q[2], q[3], 10);
  for (const q of segs) { g.fillStyle = q[4] === 3 ? '#c9a46b' : q[4] === 2 ? '#d2ccb6' : '#b4b9be'; rect(q[0], q[1], q[2], q[3], 7); }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const q of segs) if (q[4] !== 3) {
    const L = Math.hypot(q[2] - q[0], q[3] - q[1]);
    for (let s = 10; s < L - 10; s += 8) { const t = s / L; g.fillRect(X(lerp(q[0], q[2], t)) - 1, X(lerp(q[1], q[3], t)) - 1, q[1] === q[3] ? 4 : 1, q[1] === q[3] ? 1 : 4); }
  }
  World.mapCanvas = c;
}
