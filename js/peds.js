'use strict';
// Pedestrians (civilians, cops, bikies) walking the sidewalk graph, plus Brisbane's wildlife.

const PED_LOOKS = {
  cop: { shirt: '#8fb4d8', pants: '#1f2a44', cap: '#1f2a44', shoes: '#111' },
  bikie: { shirt: '#151515', pants: '#2c3e66', beard: true, patch: '#c0392b', sleeves: false, hair: '#2b1d12' },
};

class Ped {
  constructor(kind, x, z, o = {}) {
    this.kind = kind;
    const look = Object.assign({}, PED_LOOKS[kind] || {});
    if (kind === 'civ' && Math.random() < 0.35) { look.shorts = true; look.sleeves = Math.random() < 0.5; }
    this.model = makePerson(look);
    this.g = this.model.g;
    G.scene.add(this.g);
    this.x = x; this.z = z; this.y = World.groundY(x, z);
    this.h = Math.random() * TAU;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.health = kind === 'cop' ? 60 : kind === 'bikie' ? 70 : 40;
    this.dead = false; this.removed = false;
    this.state = 'walk';
    this.walkSpeed = rand(1.2, 1.7);
    this.phase = Math.random() * 10;
    this.armed = kind === 'cop' || kind === 'bikie';
    this.model.gun.visible = this.armed;
    this.shootT = rand(0.8, 1.6);
    this.mission = o.mission || null;
    G.peds.push(this);
    if (o.state) this.state = o.state;
    if (o.nav) { const E = World.edges[o.nav.e]; this.nav = { e: o.nav.e, dir: o.nav.dir, side: o.nav.dir > 0 ? o.nav.side : -o.nav.side, s: projectOnEdge(o.nav.e, o.nav.dir, x, z) }; this.walkOff = E.walk ? 0 : (E.w / 2 + 1.6); }
    else if (this.state === 'walk') this.initNav();
  }
  // Walk the footpath beside a road (or along a mapped path), choosing a new street at each corner.
  initNav() {
    const n = World.nearestEdge(this.x, this.z, 40, (E) => World.walkable(E));
    if (!n) { this.nav = null; this.state = 'idle'; return; }
    const E = World.edges[n.e], [px, pz, tx, tz] = World.pointAt(n.e, 1, n.s);
    const side = Math.sign((this.x - px) * tz - (this.z - pz) * tx) || 1, dir = Math.random() < 0.5 ? 1 : -1;
    this.nav = { e: n.e, dir, side: dir > 0 ? side : -side, s: dir > 0 ? n.s : E.len - n.s };
    this.walkOff = E.walk ? 0 : E.w / 2 + 1.6;
  }
  navPoint(e, dir, s, side) {
    const E = World.edges[e], [x, z, tx, tz] = World.pointAt(e, dir, s), o = (E.walk ? 0 : E.w / 2 + 1.6) * side;
    return [x + tz * o, z - tx * o];
  }
  nextNav() {
    const nv = this.nav, E = World.edges[nv.e];
    const node = nv.dir > 0 ? E.b : E.a;
    let opts = World.walkNeighbors(node).filter((it) => it.e !== nv.e);
    if (!opts.length) opts = [{ e: nv.e, dir: -nv.dir }];
    const it = pick(opts);
    this.nav = { e: it.e, dir: it.dir, side: nv.side, s: 0 };
  }
  remove() {
    if (this.removed) return;
    this.removed = true;
    G.scene.remove(this.g);
    const i = G.peds.indexOf(this);
    if (i >= 0) G.peds.splice(i, 1);
  }
  flee(fromX, fromZ, t = 7) {
    if (this.dead || this.state === 'attack') return;
    this.state = 'flee'; this.fleeT = t; this.fromX = fromX; this.fromZ = fromZ;
  }
  damage(amount, by, dir) {
    if (this.dead) return;
    this.health -= amount;
    FX.blood(this.x, this.z, this.y);
    if (this.health <= 0) { this.die(by, dir ? dir[0] * 3 : 0, dir ? dir[2] * 3 : 0); return; }
    if (this.kind === 'civ') this.flee(Player.x, Player.z, 8);
    else if (by === 'player') this.state = 'attack';
  }
  die(by, kx = 0, kz = 0, ky = 0) {
    if (this.dead) return;
    this.dead = true; this.health = 0;
    this.deadT = 0;
    this.model.gun.visible = false;
    if (kx || kz || ky) { this.state = 'ragdoll'; this.vx = kx; this.vz = kz; this.vy = ky || 3; this.spin = rand(4, 9) * (Math.random() < 0.5 ? -1 : 1); }
    else this.settle();
    if (by === 'player') {
      if (this.kind === 'civ') Police.crime(1);
      else if (this.kind === 'cop') Police.crime(2.5);
      if (Math.random() < (this.kind === 'civ' ? 0.45 : 0.7)) {
        const t = this.armed && Math.random() < 0.6 ? 'pistol' : 'cash';
        Pickups.add(t, this.x + 0.5, this.z + 0.3, { temp: true, amount: t === 'cash' ? randi(10, this.kind === 'bikie' ? 300 : 90) : 12 });
      }
    }
    if (typeof Missions !== 'undefined') Missions.onKill(this);
  }
  settle() {
    this.state = 'dead';
    this.g.rotation.set(-Math.PI / 2, this.h, 0);
    this.y = World.groundY(this.x, this.z) + 0.15;
    FX.blood(this.x, this.z, World.groundY(this.x, this.z));
  }
  hitByCar(v) {
    const sp = v.speed;
    const by = v.driver === 'player' ? 'player' : null;
    if (sp > 7) this.die(by, v.vx * 0.7, v.vz * 0.7, 3 + sp * 0.18);
    else { this.damage(sp * 4, by); if (!this.dead) { this.vx = v.vx; this.vz = v.vz; } }
    if (sp > 7) Sound.crash(0.3, Math.hypot(this.x - Player.x, this.z - Player.z));
  }

  update(dt, t) {
    if (this.removed) return;
    if (this.state === 'ragdoll') {
      this.vy -= 20 * dt;
      this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
      const p = { x: this.x, z: this.z };
      if (collideCircle(p, 0.35, this.y)) { this.x = p.x; this.z = p.z; this.vx *= -0.3; this.vz *= -0.3; }
      this.g.rotation.x += this.spin * dt;
      this.g.position.set(this.x, this.y, this.z);
      if (this.y <= World.groundY(this.x, this.z)) this.settle();
      return;
    }
    if (this.dead) {
      this.deadT += dt;
      if (this.deadT > 30) this.remove();
      this.g.position.set(this.x, World.inRiver(this.x, this.z) ? -0.5 : this.y, this.z);
      return;
    }
    let mx = 0, mz = 0, speed = 0, aim = false;
    const pdx = (Player.car ? Player.car.x : Player.x) - this.x, pdz = (Player.car ? Player.car.z : Player.z) - this.z;
    const pd = Math.hypot(pdx, pdz);
    switch (this.state) {
      case 'walk': {
        if (!this.nav) this.initNav();
        if (!this.nav) break;
        const nv = this.nav, E = World.edges[nv.e];
        if (nv.s >= E.len - 0.5) { this.nextNav(); break; }
        const [tx, tz] = this.navPoint(nv.e, nv.dir, Math.min(E.len, nv.s + 2.2), nv.side);
        const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
        if (d > 25) { this.initNav(); break; }
        if (d > 0.05) { mx = dx / d; mz = dz / d; speed = this.walkSpeed; }
        if (d < 2.6) nv.s += this.walkSpeed * dt;
        if (this.kind === 'cop' && G.wanted > 0 && pd < 50 && !Player.dead) this.state = 'attack';
        break;
      }
      case 'flee': {
        this.fleeT -= dt;
        const dx = this.x - this.fromX, dz = this.z - this.fromZ, d = Math.hypot(dx, dz) || 1;
        mx = dx / d; mz = dz / d; speed = 5.2;
        if (this.fleeT <= 0) { this.state = 'walk'; this.initNav(); }
        break;
      }
      case 'attack': {
        if (Player.dead || (this.kind === 'cop' && G.wanted === 0)) { this.state = 'walk'; this.initNav(); break; }
        if (this.kind === 'bikie' && pd > 90) break;
        this.h = Math.atan2(pdx, pdz);
        const arrest = this.kind === 'cop' && G.wanted <= 1 && !Player.car;
        const range = arrest ? 1.4 : this.kind === 'cop' ? 15 : 13;
        if (pd > range) { mx = pdx / pd; mz = pdz / pd; speed = arrest ? 5.5 : 4.6; }
        else if (arrest) Police.arrestT += dt * 2;
        aim = !arrest;
        if (!arrest && pd < 45) {
          this.shootT -= dt;
          if (this.shootT <= 0) {
            this.shootT = this.kind === 'bikie' ? rand(0.7, 1.3) : rand(0.9, 1.7);
            const fx = Math.sin(this.h), fz = Math.cos(this.h);
            Police.shootAtPlayer(this.x + fx * 0.6 - fz * 0.35, this.y + 1.35, this.z + fz * 0.6 + fx * 0.35, pd, this.kind === 'bikie' ? 0.32 : 0.38);
          }
        }
        break;
      }
      case 'idle': break;
    }
    if (speed > 0) {
      this.vx = lerp(this.vx, mx * speed, 1 - Math.exp(-8 * dt));
      this.vz = lerp(this.vz, mz * speed, 1 - Math.exp(-8 * dt));
      if (this.state !== 'attack' || pd > 2) this.h += angDiff(this.h, Math.atan2(mx, mz)) * Math.min(1, dt * 10);
    } else { this.vx *= Math.exp(-10 * dt); this.vz *= Math.exp(-10 * dt); }
    this.x += this.vx * dt; this.z += this.vz * dt;
    const p = { x: this.x, z: this.z };
    if (collideCircle(p, 0.35, this.y)) { this.x = p.x; this.z = p.z; if (this.state === 'walk' && Math.random() < 0.02) this.initNav(); }
    // Getting hit by cars
    for (const v of G.vehicles) {
      if (Math.abs(v.x - this.x) > 8 || Math.abs(v.z - this.z) > 8 || v.sinking) continue;
      for (const c of v.circles()) {
        const dx = this.x - c[0], dz = this.z - c[1], d = Math.hypot(dx, dz);
        if (d < v.r + 0.35) {
          if (v.speed > 4 && !v.dead) { this.hitByCar(v); return; }
          const k = (v.r + 0.35 - d) / (d || 1); this.x += dx * k; this.z += dz * k;
        }
      }
      if (v.driver === 'player' && v.speed > 12 && this.kind === 'civ' && this.state === 'walk' && Math.hypot(v.x - this.x, v.z - this.z) < 14) this.flee(v.x, v.z, 3);
    }
    if (World.inRiver(this.x, this.z)) { this.y = -0.9; } else this.y = World.groundY(this.x, this.z);
    const sp = Math.hypot(this.vx, this.vz);
    this.phase += sp * dt * 2.6;
    animatePerson(this.model, this.phase, Math.min(sp / 4, 1) * 0.8, aim);
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.y = this.h;
  }
}

// ---- Wildlife ----
class Ibis {
  constructor(x, z) {
    const m = makeIbis();
    this.g = m.g; this.neck = m.neck;
    G.scene.add(this.g);
    this.x = x; this.z = z; this.hx = x; this.hz = z;
    this.h = Math.random() * TAU; this.t = Math.random() * 5;
    this.state = 'peck'; this.dead = false; this.removed = false;
    this.health = 10; this.speed = 0;
    G.birds.push(this);
  }
  remove() { this.removed = true; G.scene.remove(this.g); const i = G.birds.indexOf(this); if (i >= 0) G.birds.splice(i, 1); }
  damage(n, by) {
    if (this.dead) return;
    this.health -= n;
    Sound.squawk(Math.hypot(this.x - Player.x, this.z - Player.z));
    if (this.health <= 0) {
      this.dead = true; this.deadT = 0;
      this.g.rotation.z = Math.PI / 2; this.g.position.y = 0.25;
      FX.sparks(this.x, 0.6, this.z, 10, '#ffffff');
      if (typeof Missions !== 'undefined') Missions.onKill(this);
    }
  }
  update(dt, t) {
    if (this.dead) { this.deadT += dt; if (this.deadT > 20) this.remove(); return; }
    this.t -= dt;
    const px = Player.car ? Player.car.x : Player.x, pz = Player.car ? Player.car.z : Player.z;
    const pd = Math.hypot(px - this.x, pz - this.z);
    const scare = this.thief ? 9 : Player.car ? 9 : 4;
    let want = 0;
    if (pd < scare && !Player.dead) {
      this.h = Math.atan2(this.x - px, this.z - pz) + Math.sin(t * 3 + this.hx) * 0.6;
      want = this.thief ? 6.4 : 4.5;
      if (this.t < 0) { Sound.squawk(pd); this.t = rand(1, 2); }
    } else if (this.state === 'walk') {
      want = 1;
      if (this.t < 0) { this.state = 'peck'; this.t = rand(1, 4); }
    } else if (this.t < 0) {
      this.state = 'walk'; this.t = rand(1, 3);
      const back = Math.hypot(this.x - this.hx, this.z - this.hz) > 12;
      this.h = back ? Math.atan2(this.hx - this.x, this.hz - this.z) : Math.random() * TAU;
    }
    this.speed = lerp(this.speed, want, 1 - Math.exp(-6 * dt));
    this.x += Math.sin(this.h) * this.speed * dt;
    this.z += Math.cos(this.h) * this.speed * dt;
    const p = { x: this.x, z: this.z };
    if (collideCircle(p, 0.3, 0)) { this.x = p.x; this.z = p.z; this.h += 1.5; }
    if (World.inRiver(this.x, this.z)) { this.h += Math.PI; this.x += Math.sin(this.h) * 0.5; this.z += Math.cos(this.h) * 0.5; }
    for (const v of G.vehicles) if (v.speed > 4 && Math.hypot(v.x - this.x, v.z - this.z) < v.r + 0.5) this.damage(99, v.driver === 'player' ? 'player' : null);
    this.neck.rotation.x = this.state === 'peck' && this.speed < 0.5 ? 0.9 + Math.sin(t * 8 + this.hx) * 0.3 : Math.sin(t * 10) * 0.1;
    this.g.position.set(this.x, World.groundY(this.x, this.z) + Math.abs(Math.sin(t * 14)) * 0.05 * this.speed, this.z);
    this.g.rotation.y = this.h;
  }
}

class Magpie {
  constructor() {
    const m = makeMagpie();
    this.g = m.g; this.wl = m.wl; this.wr = m.wr;
    G.scene.add(this.g);
    const a = Math.random() * TAU;
    this.x = Player.x + Math.sin(a) * 45; this.z = Player.z + Math.cos(a) * 45; this.y = 18;
    this.state = 'swoop'; this.passes = 0; this.t = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.removed = false;
  }
  remove() { this.removed = true; G.scene.remove(this.g); }
  update(dt, t) {
    this.t += dt;
    let tx, ty, tz, sp = 17;
    if (Player.car || Player.dead || this.passes >= 3) this.state = 'leave';
    if (this.state === 'swoop') { tx = Player.x; ty = Player.y + 1.9; tz = Player.z; }
    else if (this.state === 'climb') {
      tx = this.x + this.vx; ty = 14; tz = this.z + this.vz;
      if (this.t > 1.8) { this.state = 'swoop'; this.t = 0; }
    } else { tx = this.x + this.vx * 3; ty = 60; tz = this.z + this.vz * 3; if (this.y > 50) { this.remove(); return; } }
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz) || 1;
    this.vx = lerp(this.vx, (dx / d) * sp, 1 - Math.exp(-3 * dt));
    this.vy = lerp(this.vy, (dy / d) * sp, 1 - Math.exp(-3 * dt));
    this.vz = lerp(this.vz, (dz / d) * sp, 1 - Math.exp(-3 * dt));
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (this.state === 'swoop' && d < 1.3) {
      this.passes++; this.state = 'climb'; this.t = 0;
      Player.hurt(randi(2, 5), 'Swooped by a magpie');
      HUD.flashText('SWOOPED!');
      Sound.warble();
    }
    const flap = Math.sin(t * 30) * 0.7;
    this.wl.rotation.z = flap; this.wr.rotation.z = -flap;
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.y = Math.atan2(this.vx, this.vz);
  }
}
