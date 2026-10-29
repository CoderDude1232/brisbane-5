'use strict';
// Particles, tracers, explosions, blood, and floating pickups.

const FX = {
  parts: [],
  pool: { smoke: [], fire: [], spark: [], blood: [] },
  init(scene) {
    this.scene = scene;
    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.disc = new THREE.CircleGeometry(1, 10); this.disc.rotateX(-Math.PI / 2);
    this.mats = {
      smoke: new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.6, depthWrite: false }),
      fire: new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.9, depthWrite: false }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffe08a }),
      blood: new THREE.MeshBasicMaterial({ color: 0x6a0a0a, transparent: true, opacity: 0.85, depthWrite: false }),
    };
    this.light = new THREE.PointLight(0xff9a40, 0, 60, 2);
    scene.add(this.light);
    this.lightT = 0;
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.9 });
    this.tracers = [];
  },
  _get(kind) {
    let m = this.pool[kind].pop();
    if (!m) {
      m = new THREE.Mesh(kind === 'blood' ? this.disc : this.geo, this.mats[kind].clone());
      this.scene.add(m);
    }
    m.visible = true;
    return m;
  },
  spawn(kind, x, y, z, o = {}) {
    if (this.parts.length > 400) return;
    const m = this._get(kind);
    m.position.set(x, y, z);
    const size = o.size || 1;
    m.scale.setScalar(size);
    m.material.opacity = this.mats[kind].opacity;
    if (o.color) m.material.color.set(o.color); else m.material.color.copy(this.mats[kind].color);
    this.parts.push({ m, kind, life: o.life || 1, max: o.life || 1, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, grow: o.grow || 0, size, grav: o.grav || 0 });
  },
  smoke(x, y, z, dark) {
    this.spawn('smoke', x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), { size: rand(0.4, 0.8), vy: rand(1.5, 3), vx: rand(-0.4, 0.4), vz: rand(-0.4, 0.4), grow: 1.2, life: rand(1.2, 2.2), color: dark ? '#222' : '#777' });
  },
  fire(x, y, z) {
    this.spawn('fire', x + rand(-0.5, 0.5), y, z + rand(-0.5, 0.5), { size: rand(0.4, 0.9), vy: rand(2, 4), grow: -0.3, life: rand(0.4, 0.8), color: pick(['#ff8a1f', '#ffb52e', '#ff5a1a']) });
  },
  sparks(x, y, z, n = 6, color) {
    for (let k = 0; k < n; k++) this.spawn('spark', x, y, z, { size: 0.06, vx: rand(-5, 5), vy: rand(1, 6), vz: rand(-5, 5), grav: 18, life: rand(0.2, 0.45), color });
  },
  blood(x, z, y = 0) {
    this.spawn('blood', x, y + 0.09 + Math.random() * 0.01, z, { size: rand(0.5, 0.9), grow: 0.25, life: 25 });
    for (let k = 0; k < 5; k++) this.spawn('spark', x, y + 1.1, z, { size: 0.08, vx: rand(-2, 2), vy: rand(0, 3), vz: rand(-2, 2), grav: 15, life: 0.4, color: '#8a0d0d' });
  },
  explosion(x, y, z) {
    this.spawn('fire', x, y + 1, z, { size: 2, grow: 6, life: 0.5, color: '#ffd27a' });
    for (let k = 0; k < 18; k++) this.spawn('fire', x, y + 1, z, { size: rand(0.8, 1.6), vx: rand(-7, 7), vy: rand(2, 9), vz: rand(-7, 7), grow: 0.5, life: rand(0.5, 1.0) });
    for (let k = 0; k < 14; k++) this.spawn('smoke', x, y + 1.5, z, { size: rand(1, 2), vx: rand(-3, 3), vy: rand(2, 5), vz: rand(-3, 3), grow: 1.5, life: rand(2, 3.5), color: '#2a2a2a' });
    this.sparks(x, y + 1, z, 20);
    this.light.position.set(x, y + 3, z);
    this.light.intensity = 6; this.lightT = 0.6;
  },
  flash(x, y, z) {
    this.spawn('fire', x, y, z, { size: 0.25, life: 0.05, color: '#fff3b0' });
  },
  tracer(x1, y1, z1, x2, y2, z2) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
    const l = new THREE.Line(g, this.tracerMat);
    this.scene.add(l);
    this.tracers.push({ l, life: 0.06 });
  },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false; this.pool[p.kind].push(p.m);
        this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.kind === 'spark' && p.m.position.y < 0.05) { p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      p.size = Math.max(0.01, p.size + p.grow * dt);
      p.m.scale.setScalar(p.size);
      const f = p.life / p.max;
      if (p.kind === 'smoke') p.m.material.opacity = 0.55 * f;
      else if (p.kind === 'fire') p.m.material.opacity = Math.min(1, f * 1.5);
      else if (p.kind === 'blood') p.m.material.opacity = Math.min(0.85, f * 4);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.l); t.l.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT * 10); }
  },
};

// Spinning floating pickups.
const PICKUP_DEFS = {
  health: { color: '#2ecc40', label: '+' },
  armor: { color: '#3a7bff', label: 'A' },
  cash: { color: '#7bd148', label: '$' },
  pistol: { color: '#d8d8d8', label: 'P' },
  smg: { color: '#d8d8d8', label: 'S' },
  bat: { color: '#e2c48e', label: 'B' },
};
const Pickups = {
  list: [],
  add(type, x, z, o = {}) {
    const def = PICKUP_DEFS[type];
    const g = new THREE.Group();
    let m;
    if (type === 'health') {
      m = new THREE.Group();
      m.add(new THREE.Mesh(boxGeo(0.9, 0.3, 0.3), matC(def.color, '#0a4a10')));
      m.add(new THREE.Mesh(boxGeo(0.3, 0.9, 0.3), matC(def.color, '#0a4a10')));
    } else if (type === 'armor') {
      m = new THREE.Mesh(boxGeo(0.8, 0.9, 0.25), matC(def.color, '#0a2a6a'));
    } else if (type === 'cash') {
      m = new THREE.Mesh(boxGeo(0.7, 0.35, 0.12), matC('#7bd148', '#1f4a0a'));
    } else if (type === 'bat') {
      m = new THREE.Mesh(boxGeo(0.15, 1.1, 0.12), matC(def.color, '#4a3a1a'));
    } else {
      m = new THREE.Group();
      m.add(new THREE.Mesh(boxGeo(0.15, 0.25, type === 'smg' ? 0.8 : 0.5), matC('#222', '#111')));
      m.add(new THREE.Mesh(boxGeo(0.12, 0.35, 0.15), matC('#222', '#111'))).position.set(0, -0.2, -0.1);
    }
    g.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 20), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.85;
    g.add(ring);
    const y = World.groundY(x, z);
    g.position.set(x, y + 1, z);
    G.scene.add(g);
    const p = { type, x, z, y, g, m, amount: o.amount, respawn: o.respawn || 0, timer: 0, active: true, temp: !!o.temp, life: o.temp ? 30 : 0 };
    this.list.push(p);
    return p;
  },
  update(dt, t) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) { p.active = true; p.g.visible = true; }
        continue;
      }
      p.m.rotation.y = t * 2;
      p.g.position.y = p.y + 1 + Math.sin(t * 3 + p.x) * 0.15;
      if (p.temp) { p.life -= dt; if (p.life <= 0) { G.scene.remove(p.g); this.list.splice(i, 1); continue; } }
      if (Player.dead || Player.car) continue;
      if ((Player.x - p.x) ** 2 + (Player.z - p.z) ** 2 < 2.2) {
        if (!Player.collect(p)) continue;
        Sound.pickup();
        if (p.respawn) { p.active = false; p.timer = p.respawn; p.g.visible = false; }
        else { G.scene.remove(p.g); this.list.splice(i, 1); }
      }
    }
  },
};
