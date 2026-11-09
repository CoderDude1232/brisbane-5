'use strict';
// Builds the real city from World.data (OpenStreetMap): ground cover, river, roads, every building,
// trees, then hands over to Decor (landmarks) and buildProps (street furniture).

function validColor(c) {
  if (!c) return null;
  const s = new Option().style;
  s.color = c;
  return s.color ? c : null;
}

const OCTA = new THREE.OctahedronGeometry(1, 0);
// Lumpy, leafy crown volumes: noise-displaced spheres, darker underneath and inside.
const BLOBS = (() => {
  const out = [];
  for (let v = 0; v < 6; v++) {
    const g = new THREE.SphereGeometry(1, 8, 5), p = g.attributes.position, sh = [];
    const f1 = 1.7 + v * 0.3, ph = v * 1.9;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(x * f1 * 2.1 + ph) * Math.cos(z * f1 * 1.7 - ph) + 0.1 * Math.sin(y * 4.3 + x * 3.1 + ph);
      p.setXYZ(i, x * n, y * n * (y < 0 ? 0.75 : 1), z * n);
      sh.push(0.5 + 0.5 * clamp((y + 1) / 2, 0, 1) * (0.75 + 0.25 * n));
    }
    g.computeVertexNormals();
    g.userData.shade = sh;
    out.push(g);
  }
  return out;
})();
const FROND = (() => { // a drooping palm frond: tapering strip with a mid-rib fold
  const pos = [], idx = [], n = 7;
  for (let k = 0; k <= n; k++) {
    const t = k / n, z = t * 1, y = -t * t * 0.55, w = 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
    pos.push(-w, y - w * 0.15, z, 0, y + 0.03, z, w, y - w * 0.15, z);
    if (k < n) { const q = k * 3; idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3, q + 1, q + 2, q + 4, q + 2, q + 5, q + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
})();

// Cut d0 metres off the start and d1 off the end of a polyline.
function trimLine(pts, d0, d1) {
  let L = 0; const cum = [0];
  for (let k = 1; k < pts.length; k++) { L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); cum.push(L); }
  if (L - d0 - d1 < 1) return null;
  const at = (s) => { let k = 1; while (k < cum.length - 1 && cum[k] < s) k++; const u = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1); return [lerp(pts[k - 1][0], pts[k][0], u), lerp(pts[k - 1][1], pts[k][1], u)]; };
  const out = [at(d0)];
  for (let k = 1; k < pts.length - 1; k++) if (cum[k] > d0 && cum[k] < L - d1) out.push(pts[k]);
  out.push(at(L - d1));
  return out;
}

function buildWorld(scene) {
  const d = World.data;
  World.nightMats = []; World.anim = []; World.fp = []; World.ao = []; World.labels = []; World.blds = [];
  const T = makeTextures();
  World.tex = T;
  const FC = Tex.facade('curtain'), FO = Tex.facade('office');
  T.road = Tex.road(); T.detail = Tex.ground(); T.waterN = Tex.waterNormal(); T.leaf = Tex.foliage();
  T.waterN.repeat.set(0.9, 0.9);
  MAT.glass = mkMat({ map: FC.map, roughnessMap: FC.rm, metalnessMap: FC.rm, normalMap: FC.normal, roughness: 1, metalness: 1, envMapIntensity: 1.0, vertexColors: true, emissive: 0xffffff, emissiveMap: FC.night, emissiveIntensity: 0 });
  MAT.render = mkMat({ map: FO.map, roughnessMap: FO.rm, metalnessMap: FO.rm, normalMap: FO.normal, roughness: 1, metalness: 1, vertexColors: true, emissive: 0xffffff, emissiveMap: FO.night, emissiveIntensity: 0 });
  MAT.plain = mkMat({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
  MAT.ground = mkMat({ vertexColors: true, map: T.detail, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
  MAT.groundTop = mkMat({ vertexColors: true, map: T.detail, roughness: 0.95, metalness: 0 });
  MAT.road = mkMat({ map: T.road, vertexColors: true, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  MAT.neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.water = mkMat({ color: 0x4a5844, roughness: 0.14, metalness: 0.05, normalMap: T.waterN, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.65 });
  MAT.foliage = mkMat({ vertexColors: true, normalMap: Tex.leafNormal(), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  MAT.foliage.normalMap.repeat.set(3, 2);
  MAT.leaf = mkMat({ map: T.leaf, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  MAT.leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.leaf, alphaTest: 0.5 });
  const aoTex = Tex.canvas(64, 4); { const g = aoTex.getContext('2d'), gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 4); }
  MAT.ao = new THREE.MeshBasicMaterial({ map: Tex.tex(aoTex, false, false), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -10 });
  World.nightMats.push(MAT.glass, MAT.render);

  const KB = new Merger(), GL = new Merger(), R = new Merger(), P = new Merger(), PS = new Merger(), GR = new Merger(), GT = new Merger(), RD = new Merger(), NE = new Merger(), LF = new Merger(), AO = new Merger(), WT = new Merger();
  const rng = mulberry32(2026);
  const rp = (a) => a[Math.floor(rng() * a.length)];
  const rr = (a, b) => a + rng() * (b - a);
  const { x0: BX0, z0: BZ0, x1: BX1, z1: BZ1 } = World.bounds;

  // ---------- Ground ----------
  const gtex = T.detail.clone(); gtex.needsUpdate = true; gtex.repeat.set(700, 700);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), mkMat({ color: 0x6f8c55, map: gtex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((BX0 + BX1) / 2, -0.02, (BZ0 + BZ1) / 2); ground.receiveShadow = true;
  scene.add(ground);
  const AREA_COL = { park: '#64a046', grass: '#73a852', wood: '#4c7a3c', pitch: '#4f9e44', play: '#c9a87a', stadium: '#8a8a82', parking: '#5f6163', plaza: '#c8bda6', school: '#8f9a84', rail: '#7a7266', sand: '#e2d2a0', rock: '#9a8a78' };
  const TOP = new Set(['pitch', 'play', 'sand', 'plaza', 'parking']);
  World.areas = [];
  for (const a of d.areas) {
    const pts = unflat(a.p);
    (TOP.has(a.t) ? GT : GR).poly(pts, TOP.has(a.t) ? 0.012 : 0.0, AREA_COL[a.t] || '#6a9a50');
    World.areas.push({ t: a.t, pts, box: polyBox(pts) });
    if (a.t === 'pitch') { // simple pitch markings
      const o = obb(pts);
      if (o.w > 20 && o.d > 12) {
        const c = Math.cos(o.ang), s = Math.sin(o.ang), at = (u, v) => [o.cx + u * c + v * s, o.cz - u * s + v * c];
        const ring = [at(-o.w / 2 + 2, -o.d / 2 + 2), at(o.w / 2 - 2, -o.d / 2 + 2), at(o.w / 2 - 2, o.d / 2 - 2), at(-o.w / 2 + 2, o.d / 2 - 2), at(-o.w / 2 + 2, -o.d / 2 + 2)];
        GT.ribbon(ring, 0.15, 0.02, '#f4f4f0', 16, [0.01, 0.01]);
        GT.ribbon([at(0, -o.d / 2 + 2), at(0, o.d / 2 - 2)], 0.15, 0.02, '#f4f4f0', 16, [0.01, 0.01]);
      }
    }
  }

  // ---------- Water ----------
  for (const w of d.water) {
    const pts = unflat(w.p);
    if (w.t === 'river' || w.t === 'pond') WT.poly(pts, 0.045, '#ffffff');
    else if (w.t === 'pool') GT.poly(pts, 0.03, '#3fbde0');
  }
  World.anim.push({ update: (dt) => { T.waterN.offset.y -= dt * 0.03; T.waterN.offset.x += dt * 0.005; } });

  // ---------- Roads ----------
  const deck = '#9c9a94';
  for (const E of World.edges) {
    const pts = E.pts;
    if (E.walk) {
      GR.ribbon(pts, E.w, E.cname === 'pedestrian' ? 0.048 : 0.035, E.cname === 'pedestrian' ? '#c2a77c' : E.cname === 'cycleway' ? '#b49a8a' : '#cbc5b4', 16, [0.01, 0.01]);
      continue;
    }
    const motor = E.cls <= 1 || (E.cls >= 8 && E.cls <= 12);
    if (!motor && !E.bridge) GR.ribbon(pts, E.w + 6, 0.05, '#aaa8a1', 16, [0.01, 0.01]);
    RD.ribbon(pts, E.w, 0.07, E.cls === 14 ? '#a8705c' : '#ffffff', 16);
    if (!motor && !E.bridge && E.len > 6) { // kerbs, trimmed back from junctions
      const trim = (node) => (World.adj[node].filter((it) => !World.edges[it.e].walk).length >= 2 ? E.w / 2 + 3 : 0);
      const kp = trimLine(pts, trim(E.a), trim(E.b));
      if (kp) for (const sd of [1, -1]) KB.kerb(kp, sd * E.w / 2, 0.3, 0.16, '#c9c6bd');
    }
    if (E.bridge) {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 0.5) continue;
        const ry = Math.atan2(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const wet = World.isWater(mx, mz);
        P.add(UNIT_BOX, M(mx, -0.75, mz, E.w + 3, 1.6, L + 0.4, 0, ry, 0), deck);
        const nx = Math.cos(ry), nz = -Math.sin(ry);
        for (const s of [-1, 1]) {
          const ox = nx * s * (E.w / 2 + 1.3), oz = nz * s * (E.w / 2 + 1.3);
          P.add(UNIT_BOX, M(mx + ox, 0.55, mz + oz, 0.3, 1.1, L + 0.2, 0, ry, 0), '#c9c7c0');
          if (wet) addPolyCol([[a[0] + ox - nx * 0.25, a[1] + oz - nz * 0.25], [b[0] + ox - nx * 0.25, b[1] + oz - nz * 0.25], [b[0] + ox + nx * 0.25, b[1] + oz + nz * 0.25], [a[0] + ox + nx * 0.25, a[1] + oz + nz * 0.25]], 0, 1.4);
        }
        if (wet && L > 8) for (let t = 0.5; t < L; t += 30) { const u = t / L; P.add(UNIT_BOX, M(a[0] + (b[0] - a[0]) * u, -6, a[1] + (b[1] - a[1]) * u, E.w + 2, 10, 2.5, 0, ry, 0), '#8d8a82'); }
      }
    }
  }
  // Junction patches hide overlapping lane markings
  for (let n = 0; n < World.adj.length; n++) {
    const inc = World.adj[n].filter((it) => !World.edges[it.e].walk);
    if (inc.length < 3) continue;
    const r = Math.max(...inc.map((it) => World.edges[it.e].w)) / 2 + 0.6;
    const x = World.nodeX[n], z = World.nodeZ[n], disc = [];
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; disc.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    RD.poly(disc, 0.075, '#ffffff', [0.3, 0.6]);
  }
  for (const r of d.rail) {
    const pts = unflat(r.p);
    GR.ribbon(pts, 3.4, 0.04, '#6e665c', 16, [0.01, 0.01]);
    for (const off of [-0.72, 0.72]) {
      const shifted = pts.map((p, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] + (dz / l) * off, p[1] - (dx / l) * off]; });
      PS.ribbon(shifted, 0.12, 0.16, '#8f9296', 16, [0.01, 0.01]);
    }
  }

  // ---------- Trees ----------
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); c.multiplyScalar(k); return '#' + c.getHexString(); };
  const FOL = new Merger();
  const blob = (x, y, z, sx, sy, sz, color) => FOL.add(BLOBS[Math.floor(rng() * BLOBS.length)], M(x, y, z, sx, sy, sz, 0, rng() * TAU, 0), color);
  const crown = (x, y, z, rx, ry, color, n = 3) => {
    blob(x, y, z, rx * 0.8, ry * 0.85, rx * 0.8, color);
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, d = rx * rr(0.35, 0.6);
      blob(x + Math.cos(a) * d, y + rr(-0.2, 0.45) * ry, z + Math.sin(a) * d, rx * rr(0.45, 0.65), ry * rr(0.55, 0.8), rx * rr(0.45, 0.65), shade(color, rr(0.85, 1.1)));
    }
  };
  const SPECIES = {
    jacaranda: [3.2, 5.6, 3, 0.32, '#5d4a3a', ['#a07ee0', '#9a78db', '#8b6ad0', '#b190ea'], 2.2, 1.4],
    gum: [4.5, 8.5, 2, 0.3, '#e2dccd', ['#7f9a5a', '#8aa062', '#72904f'], 1.9, 1.5],
    fig: [2.6, 5.2, 3, 0.75, '#6a5a48', ['#4f7d3f', '#568a45', '#46733a'], 2.9, 1.7],
    poinciana: [2.4, 4.4, 3, 0.3, '#5d4a3a', ['#e05a3a', '#d84a30', '#ea6a40'], 2.6, 1.0],
    bottle: [1.8, 2.6, 3, 0.5, '#8a7a62', ['#6f9a52'], 1.5, 1.0],
  };
  const tree = (kind, x, z, s = 1, collide = true) => {
    const y = 0;
    if (kind === 'palm') {
      const lean = rr(-0.12, 0.12), h = 7.2 * s;
      P.add(CYL, M(x, y + h / 2, z, 0.28 * s, h, 0.28 * s, lean, 0, lean), '#9a8466');
      const tx = x + Math.sin(lean) * h * 0.5, tz = z - Math.sin(lean) * h * 0.5;
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU + rng() * 0.4, tilt = rr(-0.35, 0.25), L = rr(3.2, 4.2) * s;
        FOL.add(FROND, M(tx, y + h + 0.1, tz, L * 0.9, L, L, tilt, a, 0), rp(['#5f8a3e', '#6f9a4a', '#557f38']));
      }
      FOL.add(BLOBS[0], M(tx, y + h, tz, 0.55 * s, 0.6 * s, 0.55 * s), '#7a6a44');
    } else {
      const [trunkH, spread, nLimb, r, bark, leaves, crx, cry] = SPECIES[kind] || SPECIES.gum;
      const th = trunkH * s;
      P.limb(x, y, z, x, y + th, z, r * s, bark);
      const a0 = rng() * TAU;
      for (let k = 0; k < nLimb; k++) {
        const a = a0 + (k / nLimb) * TAU + rr(-0.3, 0.3), reach = spread * s * rr(0.5, 0.8);
        const ex = x + Math.cos(a) * reach, ez = z + Math.sin(a) * reach, ey = y + th + rr(1, 2.4) * s;
        P.limb(x, y + th * 0.85, z, ex, ey, ez, r * s * 0.5, bark);
        blob(ex, ey + cry * s * 0.3, ez, crx * s * rr(0.75, 1.0), cry * s * rr(0.8, 1.05), crx * s * rr(0.75, 1.0), rp(leaves));
      }
      crown(x, y + th + 2.2 * s, z, crx * s * 1.25, cry * s * 1.05, rp(leaves), 2);
    }
    if (collide) addCol(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 6, -1, 'prop');
  };
  World.tree = tree;
  const PLANE_H = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const treeFor = (x, z) => {
    const zone = World.zoneAt(x, z);
    if (zone === 'cbd') return rp(['fig', 'fig', 'palm', 'jacaranda', 'bottle']);
    if (zone === 'southbank') return rp(['palm', 'palm', 'fig', 'jacaranda']);
    return rp(['jacaranda', 'jacaranda', 'gum', 'gum', 'fig', 'poinciana', 'palm']);
  };
  for (let i = 0; i < d.trees.length; i += 2) tree(treeFor(d.trees[i], d.trees[i + 1]), d.trees[i], d.trees[i + 1], rr(0.8, 1.15));
  const freeSpot = (x, z, clear) => !World.isWater(x, z) && !pointInBuilding(x, 1, z) && !World.nearestEdge(x, z, clear, (E) => !E.walk || E.cname === 'pedestrian');
  const treeBudget = G.mobile ? 0.35 : 0.7;
  for (const a of World.areas) {
    if (!['park', 'grass', 'wood'].includes(a.t)) continue;
    const [x0, z0, x1, z1] = a.box, area = Math.abs(polyArea(a.pts));
    const n = Math.min(a.t === 'wood' ? 70 : 40, Math.floor((area / (a.t === 'wood' ? 140 : 420)) * treeBudget));
    for (let k = 0, placed = 0; k < n * 3 && placed < n; k++) {
      const x = rr(x0, x1), z = rr(z0, z1);
      if (!pip(x, z, a.pts) || !freeSpot(x, z, 6)) continue;
      tree(a.t === 'wood' ? rp(['gum', 'gum', 'fig']) : treeFor(x, z), x, z, rr(0.8, 1.3));
      placed++;
    }
  }

  // ---------- Buildings ----------
  const glassTints = ['#d6e6f5', '#cfe8e6', '#e4e4e4', '#f0e2c6', '#b9cbdc', '#a9c2c8', '#c4ccd8', '#9fb4c4', '#d0d8e0'];
  const renderTints = ['#f2efe8', '#e6d6b8', '#d9c4a4', '#c97e5e', '#b8b8b0', '#e9e1d0', '#a96a50', '#dcd2c0', '#cfd8d2', '#e8dccb'];
  const houseWalls = ['#f4f1e8', '#efe6cf', '#f2e9b8', '#cfe0e4', '#d8e4cc', '#f1d9c9', '#e6e6e6', '#d9e8f0', '#f6efe0', '#e3eadb'];
  const roofs = ['#a9adb0', '#a9adb0', '#8c3b2e', '#3e5e48', '#4a4f52', '#b4b9bc', '#6d2b2b', '#c4c8ca'];
  const civicTints = ['#dcc79c', '#d8d2c4', '#c9b48a', '#e4ded2', '#b07a5a'];
  const pitched = (o, y, rh, color, shape) => {
    if (shape === 'gabled') {
      const along = o.w >= o.d;
      P.add(GABLE, M(o.cx, y + rh / 2, o.cz, along ? o.d + 0.8 : o.w + 0.8, rh, along ? o.w + 0.8 : o.d + 0.8, 0, o.ang + (along ? Math.PI / 2 : 0), 0), color);
    } else if (shape === 'skillion') {
      P.add(WEDGE, M(o.cx, y + rh / 2, o.cz, o.w + 0.6, rh, o.d + 0.6, 0, o.ang, 0), color);
    } else if (shape === 'dome' || shape === 'onion') {
      const r = Math.min(o.w, o.d) / 2;
      P.add(DOME, M(o.cx, y, o.cz, r, rh || r * 0.8, r), color);
    } else { // hipped / pyramidal
      const m = new THREE.Matrix4().makeTranslation(o.cx, y + rh / 2, o.cz)
        .multiply(new THREE.Matrix4().makeRotationY(o.ang))
        .multiply(new THREE.Matrix4().makeScale((o.w / 2 + 0.45) / 0.7071, rh, (o.d / 2 + 0.45) / 0.7071))
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4));
      P.add(CONE4, m, color);
    }
  };
  const aoRing = (pts) => {
    const outer = offsetPoly(pts, 2.2), inner = ccw(pts);
    if (outer.length !== inner.length) return;
    for (let i = 0; i < inner.length; i++) {
      const j = (i + 1) % inner.length;
      const ch = AO._chunk(inner[i][0], inner[i][1]), base = ch.p.length / 3;
      for (const [q, u] of [[inner[i], 0], [inner[j], 0], [outer[j], 1], [outer[i], 1]]) { ch.p.push(q[0], 0.11, q[1]); ch.n.push(0, 1, 0); ch.u.push(u, 0.5); ch.c.push(1, 1, 1); }
      ch.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  };
  const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
  const roadDir = (x, z) => { const n = World.nearestEdge(x, z, 45, (E) => E.car || E.cls === 13); if (!n) return null; const [px, pz] = World.pointAt(n.e, 1, n.s); return [px - x, pz - z]; };

  const OV = Decor.overrides();
  for (const b of d.buildings) {
    const pts = ccw(unflat(b.p));
    if (pts.length < 3) continue;
    const mh = b.mh || 0, h = Math.max(b.h, mh + 2.5);
    const rec = { pts, h, mh, name: b.n, kind: b.k, part: !!b.part };
    World.blds.push(rec);
    addPolyCol(pts, mh, h);
    if (b.hide) continue;
    const [bx0, bz0, bx1, bz1] = polyBox(pts);
    World.fp.push([pts, b.k === 'tower' ? '#262d36' : b.k === 'house' ? '#4b5246' : '#353a36']);
    if (mh < 0.5 && b.k !== 'small' && b.k !== 'house') {
      aoRing(pts);
      if (b.k !== 'apart' || World.zoneAt(bx0, bz0) !== 'suburb') GR.poly(offsetPoly(pts, 5), 0.003, b.k === 'ind' ? '#8f8d88' : '#a9a69e');
    }
    const ov = (b.n && OV[b.n]) || null;
    const hsh = hash(bx0, bz0);
    const bcol = validColor(b.bc), rcol = validColor(b.rc) || rp(roofs);
    if (b.k === 'house' && !ov) {
      buildHouse(pts, h, hsh, bcol, rcol);
      continue;
    }
    if (b.k === 'small') {
      P.prism(pts, mh, h - mh, bcol || rp(['#c8c4bc', '#9aa0a4', '#b8b2a6', '#e8e6e0']), 0);
      if (!b.rs || b.rs === 'flat') P.prism(offsetPoly(pts, 0.15), h, 0.12, rcol, 0);
      continue;
    }
    // Facade treatment
    let glass = b.k === 'tower' ? hsh < 0.7 : b.k === 'comm' && h > 22 ? hsh < 0.45 : b.bm === 'glass';
    let tint = bcol || (glass ? glassTints[Math.floor(hsh * glassTints.length)] : (b.k === 'civic' ? civicTints : renderTints)[Math.floor(hsh * 10) % (b.k === 'civic' ? 5 : 10)]);
    if (b.bm === 'brick') tint = bcol || '#a0583c';
    if (b.bm === 'sandstone' || b.bm === 'stone') tint = bcol || '#d9c08a';
    let style = h > 30 ? (b.k === 'apart' ? 'balcony' : 'glass') : 'office';
    if (ov) { if (ov.tint) tint = ov.tint; if (ov.glass !== undefined) glass = ov.glass; if (ov.style) style = ov.style; }
    const M_ = glass ? GL : R, uvS = glass ? 28 : 26;
    const o = obb(pts);
    const roofShape = b.rs && b.rs !== 'flat' && (h < 40 || b.rs === 'dome') ? b.rs : null;
    const rh = roofShape ? b.rh || Math.min(6, Math.min(o.w, o.d) * 0.35) : 0;
    const wallTop = h - rh;
    if (style === 'balcony' && pts.length <= 16 && wallTop - mh > 12) {
      GL.prism(pts, mh, wallTop - mh, ov && ov.tint ? tint : rp(['#9fb4c4', '#b8c8d4', '#a9c2c8']), 28);
      const sl = offsetPoly(pts, 1.2), slab = (ov && ov.slab) || rp(['#f4f4f0', '#e8e4da', '#dfe6ea']);
      for (let y = mh + 3.2; y < wallTop - 1; y += 3.2) P.prism(sl, y, 0.22, slab, 0, { bottom: true });
    } else {
      M_.prism(pts, mh, wallTop - mh, tint, uvS);
    }
    if (mh < 0.5 && (b.k === 'comm' || b.k === 'tower' || b.k === 'apart') && wallTop > 6 && World.zoneAt(o.cx, o.cz) !== 'suburb') {
      GL.prism(offsetPoly(pts, 0.06), 0, 3.6, rp(['#d8e6ee', '#e6eef2', '#f2e6d0', '#cfe0ea']), 28, { cap: false });
      P.prism(offsetPoly(pts, 0.1), 3.6, 0.4, rp(['#3a3d40', '#7a1f3d', '#2e5d4b', '#e8e6e0']), 0, { cap: false, bottom: true });
    }
    if (roofShape) pitched(o, wallTop, rh, rcol, roofShape);
    else if (wallTop > 8) {
      P.prism(offsetPoly(pts, 0.15), wallTop, 1.0, '#cfcfca', 0, { cap: false });
      if (wallTop > 20 && o.w > 8 && o.d > 8) {
        P.add(UNIT_BOX, M(o.cx, wallTop + 1.6, o.cz, o.w * 0.35, 3.2, o.d * 0.35, 0, o.ang, 0), '#8f9294');
        if (wallTop > 100) NE.box(o.cx, wallTop + 3.4, o.cz, 0.8, 0.8, 0.8, '#ff2222');
      }
    }
    if (wallTop - mh > 3.5) Detail.add(o.cx, o.cz, 'tower', { pts, y0: mh < 0.5 && wallTop > 8 && World.zoneAt(o.cx, o.cz) !== 'suburb' ? 4 : mh, h: wallTop, style, glass, tint, uvS, slab: rp(['#e8e8e6', '#d2d6da', '#c9c1b0', '#b8bcc0']) });
    if (b.n && (h > 60 || ov)) World.labels.push({ name: b.n, x: o.cx, z: o.cz, r: Math.max(18, Math.max(o.w, o.d) * 0.7) });
  }

  // Detached house on its real footprint: Queenslander on stumps, post-war brick or a new build.
  function buildHouse(pts, h, hsh, bcol, rcol) {
    const o = obb(pts);
    const dir = roadDir(o.cx, o.cz);
    // local +z faces the street
    let ang = o.ang, W = o.w, D = o.d;
    if (dir) {
      const fx = Math.sin(o.ang), fz = Math.cos(o.ang), sx = Math.cos(o.ang), sz = -Math.sin(o.ang);
      const dz = dir[0] * fx + dir[1] * fz, dxl = dir[0] * sx + dir[1] * sz;
      if (Math.abs(dxl) > Math.abs(dz)) { ang += dxl > 0 ? Math.PI / 2 : -Math.PI / 2; W = o.d; D = o.w; }
      else if (dz < 0) ang += Math.PI;
    }
    const type = hsh < 0.58 ? 'qld' : hsh < 0.85 ? 'lowset' : 'modern';
    const wall = bcol || houseWalls[Math.floor(hsh * 997) % houseWalls.length];
    if (type === 'qld') {
      P.prism(offsetPoly(pts, -0.45), 0, 2.1, '#5b4b3c', 0, { cap: false });
      P.prism(pts, 2.1, 3.2, wall, 0);
      pitched({ cx: o.cx, cz: o.cz, w: o.w, d: o.d, ang: o.ang }, 5.3, Math.min(3, Math.min(o.w, o.d) * 0.32), rcol, hsh < 0.25 ? 'gabled' : 'hipped');
    } else if (type === 'lowset') {
      P.prism(pts, 0, 3, bcol || ['#a0553a', '#b26a4a', '#8e4a33', '#c9b8a0', '#e8e0d0'][Math.floor(hsh * 991) % 5], 0);
      pitched(o, 3, Math.min(2.4, Math.min(o.w, o.d) * 0.28), validColor(rcol) && hsh > 0.7 ? rcol : ['#b5562f', '#9a4a2c', '#5a5f63'][Math.floor(hsh * 113) % 3], 'hipped');
    } else {
      P.prism(pts, 0, Math.min(h, 6.5), bcol || ['#f2f2ef', '#e9e6df', '#d8d8d4'][Math.floor(hsh * 37) % 3], 0);
      P.prism(offsetPoly(pts, 0.25), Math.min(h, 6.5), 0.3, '#dededa', 0, { bottom: true });
    }
    Detail.add(o.cx, o.cz, type === 'qld' ? 'qld' : type, { x: o.cx, z: o.cz, ang, W: Math.max(4, W), D: Math.max(4, D), trim: hsh < 0.3 ? '#2e5d4b' : '#ffffff', roof: rcol, wall, gable: hsh < 0.25, seed: Math.floor(hsh * 1e9), hoist: hsh > 0.4 });
    if (hsh > 0.7 && !G.mobile) { // a backyard tree
      const bx = o.cx - Math.sin(ang) * (D / 2 + 5), bz = o.cz - Math.cos(ang) * (D / 2 + 5);
      if (!pointInBuilding(bx, 1, bz) && !World.isWater(bx, bz)) tree(rp(['jacaranda', 'gum', 'poinciana', 'palm', 'fig']), bx, bz, rr(0.7, 1));
    }
  }

  const K = { scene, G: GL, R, P, PS, GR, GT, RD, NE, LF, rng, rp, rr, tree, pitched };
  World.K = K;
  Decor.build(K);
  buildProps(K);

  // ---------- Bake ----------
  GR.build(MAT.ground, scene, false, true);
  GT.build(MAT.groundTop, scene, false, true);
  WT.build(MAT.water, scene, false, true);
  RD.build(MAT.road, scene, false, true);
  MAT.kerb = MAT.plain.clone(); MAT.kerb.side = THREE.DoubleSide;
  KB.build(MAT.kerb, scene, false, true);
  GL.build(MAT.glass, scene, true, true);
  R.build(MAT.render, scene, true, true);
  P.build(MAT.plain, scene, true, true);
  PS.build(MAT.plain, scene, false, true);
  LF.build(MAT.leaf, scene, true, true, MAT.leafDepth);
  FOL.build(MAT.foliage, scene, true, true);
  AO.build(MAT.ao, scene, false, false);
  NE.build(MAT.neon, scene, false, false);

  buildFerries(scene);
  buildMinimap();
}

// ---------- CityCats on the real river line ----------
function buildFerries(scene) {
  const line = World.river.slice().sort((a, b) => b.length - a.length)[0];
  if (!line) return;
  const pts = [], step = 4;
  let s = 0;
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < L; t += step) pts.push({ x: a[0] + (b[0] - a[0]) * (t / L), z: a[1] + (b[1] - a[1]) * (t / L), s: s + t });
    s += L;
  }
  World.riverPath = pts;
  const hull = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }), blue = new THREE.MeshLambertMaterial({ color: 0x1f4ea8 }), glass = new THREE.MeshLambertMaterial({ color: 0x24313d });
  World.ferries = [];
  const s0 = 50, s1 = pts.length * step - 50;
  for (let k = 0; k < 7; k++) {
    const g = new THREE.Group();
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 24), hull); h1.position.set(-2.6, 0.4, 0); g.add(h1);
    const h2 = h1.clone(); h2.position.x = 2.6; g.add(h2);
    const dk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 20), blue); dk.position.y = 1.3; g.add(dk);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 14), hull); cab.position.y = 2.7; g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.9, 13), glass); win.position.y = 3.2; g.add(win);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 4), hull); top.position.set(0, 4.3, -3); g.add(top);
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    World.ferries.push({ g, s: s0 + Math.random() * (s1 - s0), dir: k % 2 ? 1 : -1, speed: 10 });
  }
  World.anim.push({ update: (dt, t) => {
    for (const f of World.ferries) {
      f.s += f.dir * f.speed * dt;
      if (f.s > s1) { f.s = s1; f.dir = -1; }
      if (f.s < s0) { f.s = s0; f.dir = 1; }
      const i = clamp(Math.floor(f.s / step), 0, pts.length - 2), u = f.s / step - i;
      const a = pts[i], b = pts[i + 1], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      const off = f.dir * 18;
      f.g.position.set(lerp(a.x, b.x, u) + (tz / l) * off, Math.sin(t * 1.5 + f.s) * 0.08, lerp(a.z, b.z, u) - (tx / l) * off);
      f.g.rotation.y = Math.atan2(tx * f.dir, tz * f.dir);
    }
  } });
}

// ---------- Minimap image ----------
function buildMinimap() {
  const { x0, z0, x1, z1 } = World.bounds, S = G.mobile ? 0.35 : 0.5;
  const c = document.createElement('canvas');
  c.width = Math.ceil((x1 - x0) * S); c.height = Math.ceil((z1 - z0) * S);
  const g = c.getContext('2d');
  World.mapScale = S; World.mapCanvas = c;
  const X = (x) => (x - x0) * S, Z = (z) => (z - z0) * S;
  const path = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.closePath(); };
  g.fillStyle = '#3b4637'; g.fillRect(0, 0, c.width, c.height);
  const AC = { park: '#3f6b38', grass: '#44703b', wood: '#355a30', pitch: '#4a7a40', play: '#6b5f48', stadium: '#555', parking: '#4a4c4e', plaza: '#6d675a', school: '#4c5248', rail: '#4d4840', sand: '#8a7f5c', rock: '#5f574d' };
  for (const a of World.areas) { g.fillStyle = AC[a.t] || '#43513c'; path(a.pts); g.fill(); }
  g.fillStyle = '#3f74a0';
  for (const w of World.data.water) { if (w.t === 'island') continue; path(unflat(w.p)); g.fill(); }
  for (const [pts, col] of World.fp) { g.fillStyle = col; path(pts); g.fill(); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const draw = (filter, col, wf) => {
    g.strokeStyle = col;
    for (const E of World.edges) {
      if (!filter(E)) continue;
      g.lineWidth = Math.max(1, wf(E) * S);
      g.beginPath(); E.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.stroke();
    }
  };
  draw((E) => E.walk, '#8a8676', (E) => E.w);
  draw((E) => !E.walk && E.cls > 1, '#b4b9be', (E) => E.w + 2);
  draw((E) => !E.walk && E.cls <= 1, '#d9c27a', (E) => E.w + 2);
}
