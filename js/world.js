'use strict';
// Real inner Brisbane, built from OpenStreetMap data (data/brisbane.json, made by tools/osm2game.py).
// Map data (c) OpenStreetMap contributors, ODbL 1.0.
// Frame: metres, x = east, z = south, origin at Brisbane City Hall.

const LAT0 = -27.4689, LON0 = 153.0235;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KZ = 110574;
function ll(lat, lon) { return [(lon - LON0) * KX, -(lat - LAT0) * KZ]; }
let HALF = 3300; // reset from the data bounds in World.load
const MCELL = 2; // water-mask resolution (m)

const CAR_MAX_CLASS = 12; // classes 0..12 carry traffic (no service lanes / busways)
const ROAD_W = { footway: 2.4, path: 2.0, cycleway: 2.6, steps: 2.2, pedestrian: 6 };

const SUBURBS = [
  ['Brisbane CBD', -27.4698, 153.0251, 'cbd'], ['Spring Hill', -27.4613, 153.0237, 'mid'],
  ['Fortitude Valley', -27.4568, 153.0347, 'valley'], ['New Farm', -27.4672, 153.0479, 'suburb'],
  ['Teneriffe', -27.4560, 153.0470, 'mid'], ['Newstead', -27.4466, 153.0446, 'mid'],
  ['Bowen Hills', -27.4440, 153.0380, 'mid'], ['Herston', -27.4460, 153.0230, 'mid'],
  ['Kelvin Grove', -27.4500, 153.0130, 'mid'], ['Red Hill', -27.4540, 153.0020, 'suburb'],
  ['Paddington', -27.4600, 153.0000, 'suburb'], ['Petrie Terrace', -27.4620, 153.0130, 'mid'],
  ['Milton', -27.4700, 153.0030, 'mid'], ['South Brisbane', -27.4800, 153.0170, 'mid'],
  ['South Bank', -27.4760, 153.0230, 'southbank'], ['West End', -27.4830, 153.0090, 'suburb'],
  ['Highgate Hill', -27.4890, 153.0160, 'suburb'], ['Kangaroo Point', -27.4770, 153.0360, 'mid'],
  ['Woolloongabba', -27.4880, 153.0360, 'mid'], ['East Brisbane', -27.4830, 153.0480, 'suburb'],
  ['Dutton Park', -27.4950, 153.0270, 'suburb'], ['Auchenflower', -27.4760, 152.9960, 'suburb'],
  ['St Lucia', -27.4960, 153.0000, 'suburb'],
].map(([n, lat, lon, t]) => { const [x, z] = ll(lat, lon); return [n, x, z, t]; });

// ---- Polygon helpers (also used by the builders) ----
function pip(x, z, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c;
  }
  return c;
}
function unflat(a, s = 10) { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i] / s, a[i + 1] / s]); return o; }

const World = {
  hash: new SpatialHash(32),
  landmarks: {}, pois: {}, labels: [], bridges: [],
  bounds: { x0: -2800, z0: -3200, x1: 2600, z1: 3100 },

  load(d) {
    this.data = d;
    const [x0, z0, x1, z1] = d.bounds;
    this.bounds = { x0, z0, x1, z1 };
    HALF = Math.ceil(Math.max(-x0, x1, -z0, z1)) + 50;
    this.names = d.names;
    this.classes = d.classes;
    this._roads(d);
    this._water(d);
    this.river = d.riverline.map((l) => unflat(l));
  },

  // ---------- Roads ----------
  _roads(d) {
    const n = d.nodes.length / 2;
    this.nodeX = new Float32Array(n); this.nodeZ = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.nodeX[i] = d.nodes[2 * i] / 10; this.nodeZ[i] = d.nodes[2 * i + 1] / 10; }
    this.adj = Array.from({ length: n }, () => []);
    this.edges = [];
    this.edgeHash = new SpatialHash(40);
    this.nodeHash = new SpatialHash(60);
    this.bridgeHash = new SpatialHash(40);
    for (const r of d.edges) {
      const [a, b, cls, nm, oneway, lanes, bridge, mid, bnm] = r;
      const cname = d.classes[cls];
      const pts = [[this.nodeX[a], this.nodeZ[a]], ...unflat(mid), [this.nodeX[b], this.nodeZ[b]]];
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const walk = cls > 14;
      const w = walk ? ROAD_W[cname] || 2.2 : Math.max(4, lanes * 3.3 + (oneway ? 0.4 : 0.8));
      const e = {
        i: this.edges.length, a, b, cls, cname, name: nm >= 0 ? d.names[nm] : null, oneway: !!oneway, lanes, bridge: !!bridge,
        bname: bnm !== undefined && bnm >= 0 ? d.names[bnm] : null, pts, cum, len: cum[cum.length - 1], w, walk, car: !walk && cls <= CAR_MAX_CLASS,
      };
      this.edges.push(e);
      this.adj[a].push({ e: e.i, to: b, dir: 1 });
      this.adj[b].push({ e: e.i, to: a, dir: -1 });
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k - 1], q = pts[k];
        const seg = { e: e.i, k, minX: Math.min(p[0], q[0]) - w / 2, maxX: Math.max(p[0], q[0]) + w / 2, minZ: Math.min(p[1], q[1]) - w / 2, maxZ: Math.max(p[1], q[1]) + w / 2 };
        this.edgeHash.insert(seg);
        if (e.bridge && !walk) this.bridgeHash.insert(seg);
      }
    }
    for (let i = 0; i < n; i++) if (this.adj[i].length) this.nodeHash.insert({ i, minX: this.nodeX[i], maxX: this.nodeX[i], minZ: this.nodeZ[i], maxZ: this.nodeZ[i] });
  },
  // Can a car leave its node along adjacency item `it`?
  canDrive(it) { const e = this.edges[it.e]; return e.car && (!e.oneway || it.dir === 1); },
  carNeighbors(node) { return this.adj[node].filter((it) => this.canDrive(it)); },
  walkable(E) { return E.walk || (E.cls >= 2 && E.cls <= 13 && E.cls !== 8 && E.cls !== 9); },
  walkNeighbors(node) { return this.adj[node].filter((it) => this.walkable(this.edges[it.e])); },
  // Position and unit tangent at distance s along edge e, travelling in direction dir.
  pointAt(e, dir, s) {
    const E = this.edges[e];
    if (dir < 0) s = E.len - s;
    s = clamp(s, 0, E.len);
    const c = E.cum;
    let k = 1;
    while (k < c.length - 1 && c[k] < s) k++;
    const p = E.pts[k - 1], q = E.pts[k], L = c[k] - c[k - 1] || 1, u = (s - c[k - 1]) / L;
    let tx = (q[0] - p[0]) / L, tz = (q[1] - p[1]) / L;
    if (dir < 0) { tx = -tx; tz = -tz; }
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, tx, tz];
  },
  _segDist(x, z, p, q) {
    const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1;
    const u = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / L2, 0, 1);
    return [Math.hypot(x - (p[0] + dx * u), z - (p[1] + dz * u)), u];
  },
  // Nearest edge (optionally filtered) within r metres: {e, s, d}
  nearestEdge(x, z, r = 60, filter) {
    const segs = this.edgeHash.query(x - r, z - r, x + r, z + r, World._tmpE);
    let best = null;
    for (const sg of segs) {
      const E = this.edges[sg.e];
      if (filter && !filter(E)) continue;
      const [d, u] = this._segDist(x, z, E.pts[sg.k - 1], E.pts[sg.k]);
      if (d < r && (!best || d < best.d)) best = { e: sg.e, s: E.cum[sg.k - 1] + u * (E.cum[sg.k] - E.cum[sg.k - 1]), d };
    }
    return best;
  },
  nearestNode(x, z, car = true) {
    for (let r = 60; r <= 960; r *= 2) {
      const ns = this.nodeHash.query(x - r, z - r, x + r, z + r, World._tmpN);
      let best = -1, bd = 1e18;
      for (const o of ns) {
        if (car && !this.adj[o.i].some((it) => this.edges[it.e].car)) continue;
        const d = (this.nodeX[o.i] - x) ** 2 + (this.nodeZ[o.i] - z) ** 2;
        if (d < bd) { bd = d; best = o.i; }
      }
      if (best >= 0) return best;
    }
    return null;
  },
  nodePos(n) { return [this.nodeX[n], this.nodeZ[n]]; },
  // A* over the road network (police ignore one-way rules). Returns node list excluding the start.
  path(a, b, maxIter = 5000) {
    if (a === null || b === null) return null;
    if (a === b) return [];
    const open = new Map(), g = new Map([[a, 0]]), prev = new Map(), closed = new Set();
    const h = (n) => Math.hypot(this.nodeX[n] - this.nodeX[b], this.nodeZ[n] - this.nodeZ[b]);
    open.set(a, h(a));
    for (let it = 0; it < maxIter && open.size; it++) {
      let cur = -1, cf = Infinity;
      for (const [n, f] of open) if (f < cf) { cf = f; cur = n; }
      open.delete(cur);
      if (cur === b) {
        const out = [];
        for (let c = b; c !== a; c = prev.get(c)) out.push(c);
        return out.reverse();
      }
      closed.add(cur);
      for (const ad of this.adj[cur]) {
        const E = this.edges[ad.e];
        if (!E.car && E.cls !== 13) continue;
        if (closed.has(ad.to)) continue;
        const ng = g.get(cur) + E.len * (E.cls <= 4 ? 0.8 : 1);
        if (ng < (g.get(ad.to) ?? Infinity)) { g.set(ad.to, ng); prev.set(ad.to, cur); open.set(ad.to, ng + h(ad.to)); }
      }
    }
    return null;
  },

  // ---------- Water ----------
  _water(d) {
    const { x0, z0, x1, z1 } = this.bounds;
    const W = Math.ceil((x1 - x0) / MCELL), H = Math.ceil((z1 - z0) / MCELL);
    this.MW = W; this.MH = H;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const draw = (p, col) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i < p.length; i += 2) { const X = (p[i] / 10 - x0) / MCELL, Z = (p[i + 1] / 10 - z0) / MCELL; i ? g.lineTo(X, Z) : g.moveTo(X, Z); }
      g.closePath(); g.fill();
    };
    for (const w of d.water) if (w.t === 'river') draw(w.p, '#fff');
    for (const w of d.water) if (w.t === 'island') draw(w.p, '#000');
    for (const w of d.water) if (w.t === 'pond' || w.t === 'pool') draw(w.p, '#fff');
    const px = g.getImageData(0, 0, W, H).data;
    this.mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) this.mask[i] = px[i * 4] > 127 ? 1 : 0;
  },
  isWater(x, z) {
    const ix = Math.floor((x - this.bounds.x0) / MCELL), iz = Math.floor((z - this.bounds.z0) / MCELL);
    if (ix < 0 || iz < 0 || ix >= this.MW || iz >= this.MH) return false;
    return this.mask[iz * this.MW + ix] === 1;
  },
  onBridge(x, z) {
    const segs = this.bridgeHash.query(x, z, x, z, World._tmpB);
    for (const sg of segs) {
      const E = this.edges[sg.e];
      if (this._segDist(x, z, E.pts[sg.k - 1], E.pts[sg.k])[0] < E.w / 2 + 2.5) return { name: E.bname || E.name || 'Bridge', e: E };
    }
    return null;
  },
  inRiver(x, z) { return this.isWater(x, z) && !this.onBridge(x, z); },
  groundY() { return 0; },
  clampX(x) { return clamp(x, this.bounds.x0 + 5, this.bounds.x1 - 5); },
  clampZ(z) { return clamp(z, this.bounds.z0 + 5, this.bounds.z1 - 5); },

  // ---------- Names ----------
  streetAt(x, z) {
    const n = this.nearestEdge(x, z, 14, (E) => !!E.name && !E.walk);
    if (!n) return null;
    return n.d < this.edges[n.e].w / 2 + 4 ? this.edges[n.e].name : null;
  },
  suburbAt(x, z) {
    let best = SUBURBS[0], bd = 1e18;
    for (const s of SUBURBS) { const d = (s[1] - x) ** 2 + (s[2] - z) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  },
  zoneAt(x, z) { return this.suburbAt(x, z)[3]; },
};
World._tmpE = []; World._tmpN = []; World._tmpB = [];
