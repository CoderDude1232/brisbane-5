'use strict';
// Turns World data into merged, chunked meshes + colliders + the minimap image.

const MAT = {};
const CHUNK = 400;
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
  // Flat polygon facing up (triangulated), world-space UVs (10 m tiles) unless uvFn given.
  poly(pts, y, color, uvc) {
    pts = ccw(pts);
    if (pts.length < 3) return;
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
    const ch = this._chunk(cx, cz);
    _col.set(color);
    const base = ch.p.length / 3;
    for (const p of pts) { ch.p.push(p[0], y, p[1]); ch.n.push(0, 1, 0); if (uvc) ch.u.push(uvc[0], uvc[1]); else ch.u.push(p[0] / 10, p[1] / 10); ch.c.push(_col.r, _col.g, _col.b); }
    const tri = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tri) { const [i0, i1, i2] = triUp(pts, t); ch.i.push(base + i0, base + i1, base + i2); }
  }
  // Flat strip of width w following a polyline (roads, paths, rails). u across 0..1, v along (len / vScale).
  ribbon(pts, w, y, color, vScale = 16, uv) {
    if (pts.length < 2) return;
    const n = pts.length, L = [], R = [], V = [0];
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let tx = 0, tz = 0;
      if (k > 0) { const dx = p[0] - a[0], dz = p[1] - a[1], l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
      if (k < n - 1) { const dx = b[0] - p[0], dz = b[1] - p[1], l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let miter = 1;
      if (k > 0 && k < n - 1) { const dx = p[0] - a[0], dz = p[1] - a[1], l = Math.hypot(dx, dz) || 1; miter = 1 / Math.max(0.5, (dx / l) * tx + (dz / l) * tz); }
      const nx = tz * (w / 2) * miter, nz = -tx * (w / 2) * miter;
      L.push([p[0] + nx, p[1] + nz]); R.push([p[0] - nx, p[1] - nz]);
      if (k > 0) V.push(V[k - 1] + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]));
    }
    const ch = this._chunk(pts[n >> 1][0], pts[n >> 1][1]);
    _col.set(color);
    const base = ch.p.length / 3;
    for (let k = 0; k < n; k++) {
      for (const [q, u] of [[L[k], 0], [R[k], 1]]) {
        ch.p.push(q[0], y, q[1]); ch.n.push(0, 1, 0);
        if (uv) ch.u.push(uv[0], uv[1]); else ch.u.push(u, V[k] / vScale);
        ch.c.push(_col.r, _col.g, _col.b);
      }
      if (k < n - 1) { const q = base + k * 2; ch.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
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

// Building footprint collider (extruded polygon).
function addPolyCol(pts, minY, maxY) {
  const [x0, z0, x1, z1] = polyBox(pts);
  const b = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY, maxY, pts };
  World.hash.insert(b);
  return b;
}
// Minimum-area oriented rectangle: {cx, cz, w, d, ang} with w along local x, ang = rotation.y.
function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v); }
    const ar = (x1 - x0) * (z1 - z0);
    if (!best || ar < best.ar) {
      const mu = (x0 + x1) / 2, mv = (z0 + z1) / 2;
      best = { ar, cx: mu * c - mv * s, cz: mu * s + mv * c, w: x1 - x0, d: z1 - z0, ang: -ang };
    }
  }
  return best;
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

