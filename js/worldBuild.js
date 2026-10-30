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
  // Foliage: n crossed vertical cards plus a top card, with rounded normals so the clump shades like a ball.
  cards(x, y, z, rx, ry, color, n = 3, uvRect = [0, 0, 0.5, 1]) {
    const ch = this._chunk(x, z);
    _col.set(color);
    const [u0, v0, u1, v1] = uvRect;
    const quad = (pts) => {
      const base = ch.p.length / 3;
      const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      pts.forEach((q, k) => {
        ch.p.push(q[0], q[1], q[2]);
        let nx = q[0] - x, ny = (q[1] - y) + ry * 0.6, nz = q[2] - z; const l = Math.hypot(nx, ny, nz) || 1;
        ch.n.push(nx / l, ny / l, nz / l); ch.u.push(uvs[k][0], uvs[k][1]);
        const sh = 0.75 + 0.25 * ((q[1] - y + ry) / (2 * ry));
        ch.c.push(_col.r * sh, _col.g * sh, _col.b * sh);
      });
      ch.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const a0 = Math.random() * Math.PI;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI, cx = Math.cos(a) * rx, cz = Math.sin(a) * rx;
      quad([[x - cx, y - ry, z - cz], [x + cx, y - ry, z + cz], [x + cx, y + ry, z + cz], [x - cx, y + ry, z - cz]]);
    }
    const t = y + ry * 0.35, c = Math.cos(a0) * rx * 0.6, s2 = Math.sin(a0) * rx * 0.6;
    quad([[x - c + s2, t, z - s2 - c], [x + c + s2, t, z + s2 - c], [x + c - s2, t, z + s2 + c], [x - c - s2, t, z - s2 + c]]);
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
    const [u0, v0, u1, v1] = uv || [x0 / 10, z0 / 10, x1 / 10, z1 / 10];
    const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const U = swap ? [[u0, v0], [u0, v1], [u1, v1], [u1, v0]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let k = 0; k < 4; k++) {
      ch.p.push(P[k][0], y, P[k][1]); ch.n.push(0, 1, 0); ch.u.push(U[k][0], U[k][1]); ch.c.push(_col.r, _col.g, _col.b);
    }
    ch.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // Extruded footprint (pts = [[x,z]...], any winding). Walls get world-space window UVs.
  // opts: { cap: true, bottom: false }
  prism(pts, y, h, color, uvS = 0, opts = {}) {
    pts = ccw(pts);
    const n = pts.length;
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    const ch = this._chunk(cx, cz);
    _col.set(color);
    const push = (x, yy, z, nx, ny, nz, u, v) => { ch.p.push(x, yy, z); ch.n.push(nx, ny, nz); ch.u.push(u, v); ch.c.push(_col.r, _col.g, _col.b); };
    let per = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const nx = dz / len, nz = -dx / len;
      const base = ch.p.length / 3;
      const u0 = uvS ? per / uvS : 0.004, u1 = uvS ? (per + len) / uvS : 0.004;
      const v0 = uvS ? y / uvS : 0.004, v1 = uvS ? (y + h) / uvS : 0.004;
      push(a[0], y, a[1], nx, 0, nz, u0, v0); push(b[0], y, b[1], nx, 0, nz, u1, v0);
      push(b[0], y + h, b[1], nx, 0, nz, u1, v1); push(a[0], y + h, a[1], nx, 0, nz, u0, v1);
      ch.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      per += len;
    }
    const tri = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
    if (opts.cap !== false) {
      const base = ch.p.length / 3;
      for (const p of pts) push(p[0], y + h, p[1], 0, 1, 0, 0.004, 0.004);
      for (const t of tri) { const [i0, i1, i2] = triUp(pts, t); ch.i.push(base + i0, base + i1, base + i2); }
    }
    if (opts.bottom) {
      const base = ch.p.length / 3;
      for (const p of pts) push(p[0], y, p[1], 0, -1, 0, 0.004, 0.004);
      for (const t of tri) { const [i0, i1, i2] = triUp(pts, t); ch.i.push(base + i0, base + i2, base + i1); }
    }
  }
  // Tapered round limb between two points (tree branches, posts at angles).
  limb(x1, y1, z1, x2, y2, z2, r, color) {
    const dir = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
    const len = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), q, new THREE.Vector3(r, len, r)), color);
  }
  build(mat, scene, cast, receive, depthMat) {
    const out = [];
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
      if (depthMat) mesh.customDepthMaterial = depthMat;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      out.push(mesh);
    }
    this.chunks.clear();
    return out;
  }
}

// ---- Footprint helpers ----
function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// Orientation used by prism(): walls' outward normal is (dz, -dx).
function ccw(pts) { return polyArea(pts) > 0 ? pts : pts.slice().reverse(); }
function offsetPoly(pts, d) {
  pts = ccw(pts);
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    let ax = c[0] - p[0], az = c[1] - p[1], la = Math.hypot(ax, az) || 1; ax /= la; az /= la;
    let bx = q[0] - c[0], bz = q[1] - c[1], lb = Math.hypot(bx, bz) || 1; bx /= lb; bz /= lb;
    const n1x = az, n1z = -ax, n2x = bz, n2z = -bx;
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = d / Math.max(0.35, mx * n1x + mz * n1z);
    out.push([c[0] + mx * k, c[1] + mz * k]);
  }
  return out;
}
function footprint(type, x, z, w, d) {
  const hw = w / 2, hd = d / 2, m = Math.min(hw, hd);
  const rect = [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];
  switch (type) {
    case 'chamfer': case 'oct': {
      const c = m * (type === 'oct' ? 0.58 : 0.32);
      return [[x - hw + c, z - hd], [x + hw - c, z - hd], [x + hw, z - hd + c], [x + hw, z + hd - c], [x + hw - c, z + hd], [x - hw + c, z + hd], [x - hw, z + hd - c], [x - hw, z - hd + c]];
    }
    case 'round': {
      const r = m * 0.45, out = [];
      for (const [cx, cz, a0] of [[x + hw - r, z - hd + r, -Math.PI / 2], [x + hw - r, z + hd - r, 0], [x - hw + r, z + hd - r, Math.PI / 2], [x - hw + r, z - hd + r, Math.PI]])
        for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      return out;
    }
    case 'ellipse': { const out = []; for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; out.push([x + Math.cos(a) * hw, z + Math.sin(a) * hd]); } return out; }
    case 'L': return [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z], [x, z], [x, z + hd], [x - hw, z + hd]];
    case 'wave': { // rect with a bowed facade on two sides
      const out = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; out.push([x - hw + t * w, z - hd - Math.sin(t * Math.PI) * m * 0.35]); }
      for (let k = 0; k <= 8; k++) { const t = k / 8; out.push([x + hw - t * w, z + hd + Math.sin(t * Math.PI) * m * 0.35]); }
      return out;
    }
    default: return rect;
  }
}
// Order a cap triangle so its normal points up (+y).
function triUp(pts, t) {
  const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
  const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  return ny > 0 ? t : [t[0], t[2], t[1]];
}
function polyBox(pts) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } return [a, b, c, d]; }

function addCol(minX, maxX, minZ, maxZ, maxY, minY = 0, tag) {
  const b = { minX, maxX, minZ, maxZ, minY, maxY, tag };
  if (tag !== 'prop' && maxY - minY >= 3 && minY < 1 && World.ao) World.ao.push([minX, minZ, maxX, maxZ, World.groundY((minX + maxX) / 2, (minZ + maxZ) / 2)]);
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
  World.ao = [];
  const FC = Tex.facade('curtain'), FO = Tex.facade('office');
  T.road = Tex.road(); T.detail = Tex.ground(); T.waterN = Tex.waterNormal(); T.leaf = Tex.foliage();
  T.waterN.repeat.set(5, 1.6);
  World.tex = T;
  MAT.glass = mkMat({ map: FC.map, roughnessMap: FC.rm, metalnessMap: FC.rm, normalMap: FC.normal, roughness: 1, metalness: 1, envMapIntensity: 1.0, vertexColors: true, emissive: 0xffffff, emissiveMap: FC.night, emissiveIntensity: 0 });
  MAT.render = mkMat({ map: FO.map, roughnessMap: FO.rm, metalnessMap: FO.rm, normalMap: FO.normal, roughness: 1, metalness: 1, vertexColors: true, emissive: 0xffffff, emissiveMap: FO.night, emissiveIntensity: 0 });
  MAT.plain = mkMat({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
  MAT.ground = mkMat({ vertexColors: true, map: T.detail, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
  MAT.road = mkMat({ map: T.road, vertexColors: true, roughness: 0.82, metalness: 0 });
  MAT.neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.water = mkMat({ color: 0x55665a, roughness: 0.06, metalness: 0.15, normalMap: T.waterN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.4, side: THREE.DoubleSide });
  MAT.leaf = mkMat({ map: T.leaf, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  MAT.leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.leaf, alphaTest: 0.5 });
  MAT.ao = new THREE.MeshBasicMaterial({ map: Tex.contactShadow(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
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
  const gtex = T.detail.clone(); gtex.needsUpdate = true; gtex.repeat.set(280, 280);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), mkMat({ color: 0x6a8f4d, map: gtex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 }));
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
    const bank = new THREE.Mesh(mk(RIVER_HW + 5, 0.03, 50), mkMat({ color: 0x6d6250, roughness: 1, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }));
    bank.receiveShadow = true; scene.add(bank);
    const water = new THREE.Mesh(mk(RIVER_HW + 1, 0.045, 40), MAT.water);
    water.receiveShadow = true; scene.add(water);
    World.anim.push({ update: (dt) => { T.waterN.offset.y -= dt * 0.03; T.waterN.offset.x += dt * 0.004; } });
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

  const stoneTints = ['#d8d2c4', '#c9c1b0', '#e4e0d8', '#bdb6a8', '#a8a49c'];
  // Tower: real footprint (chamfered / rounded / L / curved), podium with lobby glazing,
  // one of several shaft treatments, and a crown. Close-up detail is streamed by Detail.
  const tower = (x, z, w, d, h, tint, glass, sx = 0, sz = 0, street = true) => {
    const M_ = glass ? G : R, uv = glass ? 28 : 26;
    const tall = h > 45;
    const fpType = tall ? rp(['rect', 'chamfer', 'chamfer', 'round', 'oct', 'rect', 'ellipse', 'wave']) : rp(['rect', 'rect', 'chamfer', 'L', 'round']);
    let pts = footprint(fpType, x, z, w, d);
    let y0 = 0, podium = null, ph = 0;
    const slab = rp(['#e8e8e6', '#d2d6da', '#c9c1b0', '#9aa0a6']);
    if (tall && street) {
      ph = rr(7, 11);
      podium = footprint(rng() < 0.5 ? 'rect' : 'chamfer', x, z, Math.min(w + 6, 38), Math.min(d + 6, 38));
      G.prism(offsetPoly(podium, -0.6), 0, ph - 0.6, rp(['#d8e6ee', '#e6eef2', '#cfe0ea']), 28);
      R.prism(podium, ph - 0.6, 3.2, rp(stoneTints), 26);
      y0 = ph + 2.6;
    }
    const style = h < 22 ? 'office' : rp(tall ? ['glass', 'balcony', 'fins', 'crown', 'setback', 'balcony'] : ['office', 'balcony', 'fins', 'office']);
    let top = h;
    if (style === 'balcony') {
      G.prism(pts, y0, h - y0, rp(['#9fb4c4', '#b8c8d4', '#a9c2c8']), 28);
      const sl = offsetPoly(pts, 1.8);
      const slabC = rp(['#f4f4f0', '#e8e4da', '#dfe6ea']);
      for (let y = y0 + 3.2; y < h - 1; y += 3.2) P.prism(sl, y, 0.24, slabC, 0, { bottom: true });
      P.prism(offsetPoly(pts, 0.6), h, 1.4, slabC, 0);
      top = h + 1.4;
    } else if (style === 'setback') {
      const h1 = y0 + (h - y0) * 0.6, h2 = y0 + (h - y0) * 0.85;
      M_.prism(pts, y0, h1 - y0, tint, uv);
      const p2 = offsetPoly(pts, -Math.min(w, d) * 0.12), p3 = offsetPoly(pts, -Math.min(w, d) * 0.24);
      P.prism(offsetPoly(pts, 0.3), h1, 0.8, slab);
      M_.prism(p2, h1 + 0.8, h2 - h1 - 0.8, tint, uv);
      P.prism(offsetPoly(p2, 0.3), h2, 0.8, slab);
      M_.prism(p3, h2 + 0.8, h - h2 - 0.8, tint, uv);
      pts = p3;
    } else {
      M_.prism(pts, y0, h - y0, tint, uv);
    }
    if (style === 'crown' || (tall && rng() < 0.35)) { // lit crown frame
      const ch2 = Math.min(18, h * 0.1), cr = offsetPoly(pts, -0.3);
      for (const q of cr) P.box(q[0], top, q[1], 0.8, ch2, 0.8, '#e2e2de');
      P.prism(offsetPoly(pts, 0.05), top + ch2 - 1, 1, '#e2e2de', 0, { cap: false, bottom: true });
      NE.prism(offsetPoly(pts, 0.1), top + ch2 - 1.6, 0.25, '#bfe6ff', 0, { cap: false });
      if (h > 150) { P.box(x, top + ch2, z, 0.8, 22, 0.8, '#d0d0d0'); NE.box(x, top + ch2 + 22, z, 1, 1, 1, '#ff2222'); }
      top += ch2;
    } else if (style !== 'balcony') {
      P.prism(offsetPoly(pts, 0.15), h, 1.1, '#cfcfca', 0, { cap: false }); // parapet
    }
    if (street && !podium) streetFrontPoly(pts, sx, sz, rng() < 0.75);
    roofKit(x, z, w * 0.6, d * 0.6, h);
    const [bx0, bz0, bx1, bz1] = polyBox(podium || pts);
    addCol(bx0, bx1, bz0, bz1, h);
    fp(bx0, bz0, bx1, bz1, glass ? '#26303a' : '#2f3330');
    Detail.add(x, z, 'tower', { pts, y0: podium ? y0 : 4, h, style, slab, podium, ph });
  };
  World.towerFn = tower;
  // Ground-floor shopfront following any footprint, with an awning over the footpath.
  const streetFrontPoly = (pts, sx, sz, awning) => {
    G.prism(offsetPoly(pts, 0.06), 0, 3.6, rp(['#d8e6ee', '#e6eef2', '#f2e6d0', '#cfe0ea']), 28, { cap: false });
    P.prism(offsetPoly(pts, 0.1), 3.6, 0.4, rp(['#3a3d40', '#7a1f3d', '#2e5d4b', '#e8e6e0']), 0, { cap: false, bottom: true });
    if (!awning) return;
    const [x0, z0, x1, z1] = polyBox(pts), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (sx) P.box(sx > 0 ? x1 + 1.5 : x0 - 1.5, 3.8, cz, 3, 0.25, z1 - z0, '#e8e6e0');
    if (sz) P.box(cx, 3.8, sz > 0 ? z1 + 1.5 : z0 - 1.5, x1 - x0, 0.25, 3, '#e8e6e0');
  };

  // Old two-storey shop-top terrace with a parapet, the Valley / West End / Paddington main-street look.
  const shopTop = (x, z, w, d, sx, sz) => {
    const c = rp(['#c97e5e', '#e6d6b8', '#d9c4a4', '#b5654a', '#e9e1d0', '#9db4a6', '#e7c9a0']);
    R.box(x, 0, z, w, 8, d, c, 0, 26);
    P.box(x, 8, z, w + 0.2, 1.4, d + 0.2, c);
    streetFront(x, z, w, d, sx, sz, true);
    addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 9.4);
    fp(x - w / 2, z - d / 2, x + w / 2, z + d / 2, '#3a3330');
    Detail.add(x, z, 'shop', { x, z, w, d, sx, sz, c });
  };

  const houseRoof = (cx, cy, cz, hw, hd, rh, color, gable) => {
    if (gable) { P.shape(GABLE, cx, cy, cz, hw * 2, rh, hd * 2, color); return; }
    const m = new THREE.Matrix4().makeTranslation(cx, cy + rh / 2, cz)
      .multiply(new THREE.Matrix4().makeScale(hw / 0.7071, rh, hd / 0.7071))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
    P.add(CONE4, m, color);
  };
  const yardParams = (lotX0, lotX1) => ({ lot0: lotX0, lot1: lotX1, fence: rp(['#f4f4f0', '#f4f4f0', '#3e4a40', '#5a5f63']), hoist: rng() < 0.55 });

  // Queenslander: house high on stumps, wrap verandah under its own skillion roof, tin roof.
  const queenslander = (x, z, faceZ, lotX0, lotX1) => {
    const wall = rp(houseWalls), roof = rp(roofs), trim = rp(['#ffffff', '#ffffff', '#2e5d4b', '#7a1f3d', '#3a5f8a']);
    const W = rr(8.5, 10.5), D = rr(9.5, 11.5), gable = rng() < 0.4;
    P.box(x, 0, z, W - 0.6, 2.1, D - 0.6, '#5b4b3c');
    P.box(x, 2.1, z, W, 3.2, D, wall);
    P.box(x, 1.95, z + faceZ * (D / 2 + 1.3), W, 0.3, 2.6, '#8a6f55');
    houseRoof(x, 5.3, z, W / 2 + 0.5, D / 2 + 0.5, gable ? 3.2 : 2.8, roof, gable);
    // separate verandah roof (skillion), striped like the classic bullnose
    const vr = M(x, 4.75, z + faceZ * (D / 2 + 1.45), W + 0.6, 0.55, 3.0, 0, faceZ > 0 ? Math.PI : 0, 0);
    P.add(WEDGE, vr, rng() < 0.3 ? '#2e5d4b' : roof);
    P.box(x + W / 2 - 1.5, 0, z + faceZ * (D / 2 + 3.6), 1.4, 0.15, 2.2, '#8a6f55');
    if (rng() < 0.35) P.cyl(x - W / 2 - 1.1, 0, z - faceZ * 2, 0.9, 2.2, '#b8bcbd', 14);
    addCol(x - W / 2, x + W / 2, Math.min(z - D / 2, z + faceZ * (D / 2 + 2.6)), Math.max(z + D / 2, z + faceZ * (D / 2 + 2.6)), 8);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
    Detail.add(x, z, 'qld', Object.assign({ x, z, f: faceZ, W, D, trim, roof, wall, gable, seed: Math.floor(rng() * 1e9) }, yardParams(lotX0, lotX1)));
  };
  const lowset = (x, z, faceZ, lotX0, lotX1) => { // post-war brick with a terracotta tile roof
    const W = rr(9, 11), D = rr(9, 10.5);
    P.box(x, 0, z, W, 3, D, rp(['#a0553a', '#b26a4a', '#8e4a33', '#c9b8a0', '#e8e0d0']));
    houseRoof(x, 3, z, W / 2 + 0.6, D / 2 + 0.6, 2.2, rp(['#b5562f', '#9a4a2c', '#5a5f63']), rng() < 0.4);
    P.box(x + W / 2 + 1.5, 0, z, 3, 2.6, 5.5, '#d8d6d0');
    PS.box(x + W / 2 + 1.5, 2.6, z, 3.4, 0.15, 6, '#9aa0a4');
    addCol(x - W / 2, x + W / 2 + 3, z - D / 2, z + D / 2, 6);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
    Detail.add(x, z, 'lowset', Object.assign({ x, z, f: faceZ, W, D, seed: Math.floor(rng() * 1e9) }, yardParams(lotX0, lotX1)));
  };
  const modernHome = (x, z, faceZ, lotX0, lotX1) => { // boxy new build with a pool
    const W = rr(10, 12), D = rr(9, 11);
    P.box(x, 0, z, W, 3.2, D, rp(['#f2f2ef', '#e9e6df', '#d8d8d4']));
    P.box(x + rr(-1, 1), 3.2, z - faceZ * 1, W * 0.7, 3, D * 0.75, rp(['#3d4347', '#f2f2ef', '#6b5a48']));
    G.box(x, 0.4, z + faceZ * (D / 2 + 0.05), W * 0.6, 2.4, 0.1, '#7f97a8', 0, 28);
    P.box(x, 6.2, z - faceZ * 1, W * 0.75, 0.3, D * 0.8, '#dededa');
    GR.quad(x - 3, z - faceZ * 7.5 - 1.5, x + 3, z - faceZ * 7.5 + 1.5, 0.03, '#3fbde0');
    addCol(x - W / 2, x + W / 2, z - D / 2, z + D / 2, 7);
    fp(x - W / 2, z - D / 2, x + W / 2, z + D / 2, '#4b5246');
    Detail.add(x, z, 'modern', Object.assign({ x, z, f: faceZ, W, D, seed: Math.floor(rng() * 1e9) }, yardParams(lotX0, lotX1)));
  };

  const LF = new Merger(); // foliage cards
  const PLANE_H = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const crown = (x, y, z, rx, ry, color, n = 3) => {
    P.add(ICO, M(x, y, z, rx * 0.45, ry * 0.5, rx * 0.45, 0, rng() * 3), shade(color, 0.7));
    LF.cards(x, y, z, rx, ry, color, n);
  };
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); c.multiplyScalar(k); return '#' + c.getHexString(); };
  // Trunk splitting into limbs, each ending in a foliage cluster, plus a central top cluster.
  const branchy = (x, y, z, s, trunkH, spread, nLimb, r, bark, leaves, crx, cry) => {
    const th = trunkH * s;
    P.limb(x, y, z, x, y + th, z, r * s, bark);
    const a0 = rng() * TAU;
    for (let k = 0; k < nLimb; k++) {
      const a = a0 + (k / nLimb) * TAU + rr(-0.3, 0.3), reach = spread * s * rr(0.55, 0.9);
      const ex = x + Math.cos(a) * reach, ez = z + Math.sin(a) * reach, ey = y + th + rr(1, 2.6) * s;
      P.limb(x, y + th * rr(0.75, 1), z, ex, ey, ez, r * s * 0.5, bark);
      crown(ex, ey + cry * s * 0.3, ez, crx * s * rr(0.8, 1.15), cry * s * rr(0.9, 1.2), rp(leaves), 4);
    }
    crown(x, y + th + 2.4 * s, z, crx * s * 1.2, cry * s, rp(leaves), 4);
  };
  const tree = (kind, x, z, s = 1, collide = true) => {
    const y = World.groundY(x, z);
    if (kind === 'palm') {
      const lean = rr(-0.12, 0.12), h = 7.2 * s;
      P.add(CYL, M(x, y + h / 2, z, 0.28 * s, h, 0.28 * s, lean, 0, lean), '#9a8466');
      const tx = x + Math.sin(lean) * h * 0.5, tz = z - Math.sin(lean) * h * 0.5;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + rng() * 0.5, tilt = rr(0.25, 0.75);
        LF.add(PLANE_H, M(tx + Math.sin(a) * 1.7 * s, y + h - 0.1 - tilt * 0.8, tz + Math.cos(a) * 1.7 * s, 1.9 * s, 1, 3.8 * s, tilt, a, 0), rp(['#6f9a4a', '#7fa955', '#5f8a42']), (u, v) => [0.5 + u * 0.5, v]);
      }
      P.add(ICO, M(tx, y + h, tz, 0.5 * s, 0.5 * s, 0.5 * s), '#6b5a3a');
    } else if (kind === 'bottle') {
      P.add(ICO, M(x, y + 1.6 * s, z, 1.1 * s, 1.8 * s, 1.1 * s), '#8a7a62');
      branchy(x, y, z, s, 2.6, 3.4, 4, 0.18, '#8a7a62', ['#6f9a52'], 1.5, 1.0);
    } else {
      const spec = {
        jacaranda: [3.2, 5.6, 5, 0.32, '#5d4a3a', ['#a07ee0', '#9a78db', '#8b6ad0', '#b190ea'], 2.2, 1.4],
        gum: [4.5, 8.5, 4, 0.3, '#e2dccd', ['#7f9a5a', '#8aa062', '#72904f'], 1.9, 1.5],
        fig: [2.6, 5.2, 6, 0.75, '#6a5a48', ['#4f7d3f', '#568a45', '#46733a'], 2.9, 1.7],
        poinciana: [2.4, 4.4, 5, 0.3, '#5d4a3a', ['#e05a3a', '#d84a30', '#ea6a40'], 2.6, 1.0],
      }[kind] || [3, 5, 4, 0.3, '#5d4a3a', ['#6f9a52'], 2, 1.3];
      branchy(x, y, z, s, ...spec);
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
          const l0 = x0 + lx * 20 + 0.3, l1 = x0 + lx * 20 + 19.7;
          if (r < 0.62) queenslander(x, z, faceZ, l0, l1);
          else if (r < 0.85) lowset(x - 1.5, z, faceZ, l0, l1);
          else modernHome(x, z, faceZ, l0, l1);
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
  LF.build(MAT.leaf, scene, true, true, MAT.leafDepth);
  const AO = new Merger();
  for (const [x0, z0, x1, z1, y] of World.ao) {
    const m = clamp(Math.min(x1 - x0, z1 - z0) * 0.35, 1.2, 4);
    AO.quad(x0 - m, z0 - m, x1 + m, z1 + m, y + 0.12, '#ffffff', [0, 0, 1, 1]);
  }
  AO.build(MAT.ao, scene, false, false);
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
