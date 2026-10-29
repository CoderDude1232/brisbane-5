'use strict';
// Arcade car physics shared by the player, traffic and police. Australians drive on the left.

const LANE = 3.5;

class Vehicle {
  constructor(type, x, z, h, o = {}) {
    this.type = type;
    this.spec = VEHICLES[type];
    this.model = makeCar(this.spec, o.color);
    this.g = this.model.g;
    this.g.rotation.order = 'YXZ';
    G.scene.add(this.g);
    this.x = x; this.z = z; this.h = h;
    this.y = World.groundY(x, z);
    this.vx = 0; this.vz = 0; this.jy = 0; this.jvy = 0;
    this.pitch = 0; this.roll = 0;
    this.health = this.spec.hp;
    this.dead = false; this.sinking = false; this.removed = false;
    this.driver = o.driver || null; // 'player' | 'civ' | 'cop' | null
    this.ai = o.ai || null;
    this.input = { throttle: 0, steer: 0, hand: false };
    this.steerVis = 0;
    this.siren = false;
    this.cruise = rand(11, 15) * (this.spec.kind === 'bus' ? 0.8 : 1);
    this.r = this.spec.W * 0.58;
    const n = Math.max(2, Math.ceil(this.spec.L / (this.r * 1.6)));
    this.offs = [];
    for (let k = 0; k < n; k++) this.offs.push(lerp(-(this.spec.L / 2 - this.r), this.spec.L / 2 - this.r, k / (n - 1)));
    this.mass = this.spec.hp;
    this.smokeT = 0; this.wreckT = 0;
    this.lastHitBy = null;
    G.vehicles.push(this);
  }
  get fwd() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  circles() {
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    return this.offs.map((o) => [this.x + fx * o, this.z + fz * o]);
  }
  remove() {
    if (this.removed) return;
    this.removed = true;
    G.scene.remove(this.g);
    const i = G.vehicles.indexOf(this);
    if (i >= 0) G.vehicles.splice(i, 1);
  }
  damage(amount, by) {
    if (this.dead) return;
    this.health -= amount;
    if (by) this.lastHitBy = by;
    if (by === 'player' && this.ai && this.ai.mode === 'traffic') this.ai.panic = 8;
    if (this.health <= 0) this.explode();
  }
  explode() {
    if (this.dead) return;
    this.dead = true; this.health = 0;
    FX.explosion(this.x, this.y, this.z);
    Sound.explosion(Math.hypot(this.x - Player.x, this.z - Player.z));
    G.shake = Math.max(G.shake, clamp(1.2 - Math.hypot(this.x - Player.x, this.z - Player.z) / 60, 0, 1.2));
    this.g.traverse((o) => { if (o.isMesh) o.material = matC('#1c1c1c'); });
    this.jvy = 7;
    this.wreckT = 45;
    const by = this.lastHitBy;
    if (this.spec.police && by === 'player') Police.crime(2);
    if (this.driver === 'player') Player.die('Your ride went up in flames');
    else if (this.driver === 'civ' || this.driver === 'cop') { const p = new Ped(this.driver, this.x + 2, this.z, {}); p.die(by); }
    this.driver = null; this.ai = null; this.siren = false;
    for (const v of G.vehicles) {
      if (v === this) continue;
      const d = Math.hypot(v.x - this.x, v.z - this.z);
      if (d < 9) { v.damage(700 * (1 - d / 9), by); const k = (9 - d) * 1.5 / Math.max(d, 0.5); v.vx += (v.x - this.x) * k; v.vz += (v.z - this.z) * k; }
    }
    for (const p of G.peds) {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < 8 && !p.dead) p.die(by, (p.x - this.x) / d * 10, (p.z - this.z) / d * 10);
    }
    if (!Player.car && !Player.dead) {
      const d = Math.hypot(Player.x - this.x, Player.z - this.z);
      if (d < 8) Player.hurt(80 * (1 - d / 8), 'Blown up');
    }
    if (G.heli && Math.hypot(G.heli.x - this.x, G.heli.z - this.z) < 9 && G.heli.y - this.y < 9) G.heli.damage(400, by);
  }

  update(dt, t) {
    if (this.removed) return;
    if (this.driver === 'player') { /* input written by Player */ }
    else if (this.ai && !this.dead && !this.sinking) {
      if (this.ai.mode === 'traffic') this.thinkTraffic(dt);
      else if (this.ai.mode === 'police') this.thinkPolice(dt);
      else this.input = { throttle: 0, steer: 0, hand: true };
    } else this.input = { throttle: 0, steer: 0, hand: true };
    if (this.dead || this.sinking) this.input = { throttle: 0, steer: 0, hand: true };
    this.physics(dt);
    this.visual(dt, t);
  }

  physics(dt) {
    const s = this.spec, inp = this.input;
    let fx = Math.sin(this.h), fz = Math.cos(this.h);
    let vf = this.vx * fx + this.vz * fz;
    const sp = Math.abs(vf);
    this.steerVis = lerp(this.steerVis, inp.steer, 1 - Math.exp(-8 * dt));
    const speedF = clamp(sp / 5, 0, 1) * (1 - 0.5 * clamp(sp / s.max, 0, 1));
    let turn = this.steerVis * s.turn * speedF * (vf < -0.1 ? -1 : 1);
    if (inp.hand) turn *= 1.4;
    this.h += turn * dt;
    fx = Math.sin(this.h); fz = Math.cos(this.h);
    const rx = -fz, rz = fx;
    vf = this.vx * fx + this.vz * fz;
    let vs = this.vx * rx + this.vz * rz;
    const thr = inp.throttle;
    if (thr > 0) {
      if (vf < -0.5) vf += 32 * dt * thr;
      else vf = Math.min(s.max, vf + s.acc * thr * dt * (1 - 0.8 * clamp(vf / s.max, 0, 1)));
    } else if (thr < 0) {
      if (vf > 0.5) vf -= 32 * dt * -thr;
      else vf = Math.max(-s.max * 0.3, vf - s.acc * 0.6 * -thr * dt);
    } else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.5 * dt);
    if (inp.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
    vf -= 13 * Math.sin(this.pitch) * dt;
    const grip = inp.hand ? 1.0 : this.driver === 'player' ? 5.5 : 12;
    vs *= Math.exp(-grip * dt);
    this.slip = Math.abs(vs);
    this.vx = fx * vf + rx * vs;
    this.vz = fz * vf + rz * vs;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.x = clamp(this.x, -HALF + 5, HALF - 5);
    this.z = clamp(this.z, -HALF + 5, HALF - 5);

    // Buildings
    let nx = 0, nz = 0, hit = false;
    for (const o of this.offs) {
      const p = { x: this.x + fx * o, z: this.z + fz * o };
      const ox = p.x, oz = p.z;
      const res = collideCircle(p, this.r, this.y);
      if (res) { this.x += p.x - ox; this.z += p.z - oz; nx += res.nx; nz += res.nz; hit = true; }
    }
    if (hit) {
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const imp = -(this.vx * nx + this.vz * nz);
      if (imp > 0) {
        this.vx += nx * imp * 1.25; this.vz += nz * imp * 1.25;
        this.vx *= 0.9; this.vz *= 0.9;
        if (imp > 6) {
          this.damage((imp - 6) * 14, this.driver === 'player' ? 'player' : null);
          Sound.crash(imp / 25, Math.hypot(this.x - Player.x, this.z - Player.z));
          FX.sparks(this.x + fx * this.spec.L / 2, this.y + 0.6, this.z + fz * this.spec.L / 2, 8);
          if (this.driver === 'player') G.shake = Math.max(G.shake, imp / 40);
        }
      }
    }

    // Ground / water
    const gy = World.groundY(this.x, this.z);
    const L = this.spec.L / 2, W = this.spec.W / 2;
    const hf = World.groundY(this.x + fx * L, this.z + fz * L), hb = World.groundY(this.x - fx * L, this.z - fz * L);
    const hr = World.groundY(this.x + rx * W, this.z + rz * W), hl = World.groundY(this.x - rx * W, this.z - rz * W);
    this.pitch = lerp(this.pitch, Math.atan2(hf - hb, L * 2), 0.3);
    this.roll = lerp(this.roll, Math.atan2(hl - hr, W * 2), 0.3);
    this.y = gy;
    if (!this.sinking && World.inRiver(this.x, this.z)) {
      this.sinking = true;
      FX.sparks(this.x, 0.2, this.z, 12, '#c8c8a8');
      Sound.crash(0.7, Math.hypot(this.x - Player.x, this.z - Player.z));
      if (this.driver === 'player') Player.exitCar(true);
      this.driver = null; this.ai = null; this.siren = false;
    }
    if (this.sinking) {
      this.sinkY = (this.sinkY || 0) - dt * 0.9;
      this.vx *= Math.exp(-1.5 * dt); this.vz *= Math.exp(-1.5 * dt);
      if (this.sinkY < -5) this.remove();
    }
    if (this.jvy || this.jy > 0) {
      this.jvy -= 20 * dt; this.jy += this.jvy * dt;
      if (this.jy <= 0) { this.jy = 0; this.jvy = 0; }
    }

    // Damage effects
    if (!this.dead && this.health < this.spec.hp * 0.35) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.08;
        const ex = this.x + fx * (L - 0.6), ez = this.z + fz * (L - 0.6);
        FX.smoke(ex, this.y + 1.2, ez, this.health < this.spec.hp * 0.15);
        if (this.health < this.spec.hp * 0.15) FX.fire(ex, this.y + 1, ez);
      }
      if (this.health < this.spec.hp * 0.15) this.damage(this.spec.hp * 0.05 * dt);
    }
    if (this.dead) {
      this.wreckT -= dt;
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 0.25; FX.smoke(this.x, this.y + 1, this.z, true); if (this.wreckT > 35) FX.fire(this.x, this.y + 0.8, this.z); }
    }
  }

  visual(dt, t) {
    const g = this.g;
    g.position.set(this.x, this.y + this.jy + (this.sinkY || 0), this.z);
    g.rotation.set(-this.pitch, this.h, this.roll + (this.sinking ? 0.15 : 0));
    const vf = this.fwd;
    for (const w of this.model.wheels) w.rotation.x += (vf * dt) / this.model.wheelR;
    for (const s of this.model.steer) s.rotation.y = this.steerVis * 0.5;
    if (this.model.bar) {
      const on = this.siren;
      const ph = Math.floor(t * 6) % 2;
      this.model.bar[0].material.emissiveIntensity = on ? (ph ? 2 : 0.05) : 0.2;
      this.model.bar[1].material.emissiveIntensity = on ? (ph ? 0.05 : 2) : 0.2;
    }
  }

  // ---- AI ----
  laneTarget(i0, j0, i1, j1, entering) {
    const dx = Math.sign(i1 - i0), dz = Math.sign(j1 - j0);
    const node = entering ? [i0, j0] : [i1, j1];
    const s = entering ? 9 : -9;
    return [lineC(node[0]) + dx * s + dz * LANE, lineC(node[1]) + dz * s - dx * LANE];
  }
  chooseNext(a, b) {
    const opts = World.neighbors(b[0], b[1]).filter((n) => n[0] !== a[0] || n[1] !== a[1]);
    if (!opts.length) return a;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const straight = opts.find((n) => n[0] - b[0] === dx && n[1] - b[1] === dz);
    if (straight && Math.random() < 0.55) return straight;
    return pick(opts);
  }
  obstacleAhead(look, ignoreCars) {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    const test = (x, z, w) => {
      const ox = x - this.x, oz = z - this.z;
      const al = ox * fx + oz * fz;
      if (al <= 0 || al > look + this.spec.L / 2) return false;
      return Math.abs(ox * rx + oz * rz) < this.spec.W / 2 + w;
    };
    if (!ignoreCars) for (const v of G.vehicles) {
      if (v === this || Math.abs(v.x - this.x) > look + 8 || Math.abs(v.z - this.z) > look + 8) continue;
      if (test(v.x, v.z, v.spec.W / 2 + 0.6)) return v;
    }
    if (!Player.dead && !Player.car && test(Player.x, Player.z, 0.9)) return 'player';
    for (const p of G.peds) {
      if (p.dead || Math.abs(p.x - this.x) > look + 4 || Math.abs(p.z - this.z) > look + 4) continue;
      if (test(p.x, p.z, 0.7)) return p;
    }
    return null;
  }
  drive(tx, tz, want, dt) {
    const desired = Math.atan2(tx - this.x, tz - this.z);
    const diff = angDiff(this.h, desired);
    const vf = this.fwd;
    let steer = clamp(diff * 2.4, -1, 1);
    if (Math.abs(diff) > 0.7) want = Math.min(want, 7);
    const err = want - vf;
    this.input.throttle = err > 0 ? clamp(err / 3, 0, 1) : err < -1.5 ? -1 : 0;
    this.input.steer = steer;
    this.input.hand = want === 0 && vf < 1;
  }
  thinkTraffic(dt) {
    const ai = this.ai;
    if (!ai.c) ai.c = this.chooseNext(ai.a, ai.b);
    let tx, tz, turning = false;
    if (ai.stage === 0) [tx, tz] = this.laneTarget(ai.a[0], ai.a[1], ai.b[0], ai.b[1], false);
    else [tx, tz] = this.laneTarget(ai.b[0], ai.b[1], ai.c[0], ai.c[1], true);
    const dx = ai.b[0] - ai.a[0], dz = ai.b[1] - ai.a[1];
    turning = ai.c[0] - ai.b[0] !== dx || ai.c[1] - ai.b[1] !== dz;
    const d = Math.hypot(tx - this.x, tz - this.z);
    if (d < 3.5) {
      if (ai.stage === 0) ai.stage = 1;
      else { ai.a = ai.b; ai.b = ai.c; ai.c = this.chooseNext(ai.a, ai.b); ai.stage = 0; }
    }
    ai.lost = d > 90;
    let want = this.cruise;
    if (turning && (ai.stage === 1 || d < 16)) want = 6.5;
    ai.panic = Math.max(0, (ai.panic || 0) - dt);
    if (ai.panic > 0) want = this.spec.max * 0.7;
    ai.bumpT = Math.max(0, (ai.bumpT || 0) - dt);
    if (ai.bumpT > 0) want = 0;
    ai.pushT = Math.max(0, (ai.pushT || 0) - dt);
    const ob = ai.panic > 0 ? null : this.obstacleAhead(6 + Math.abs(this.fwd) * 0.9, ai.pushT > 0);
    if (ob) {
      want = 0;
      ai.blockT = (ai.blockT || 0) + dt;
      if (ob === 'player' || ob === Player.car) {
        if (ai.blockT > 1.5 && !ai.honked) { ai.honked = true; if (Math.hypot(this.x - Player.x, this.z - Player.z) < 40) Sound.horn(); }
      } else if (ai.blockT > 3.5) { ai.pushT = 1.6; ai.blockT = 0; }
    } else { ai.blockT = 0; ai.honked = false; }
    this.drive(tx, tz, want, dt);
  }
  thinkPolice(dt) {
    const ai = this.ai;
    const P = Player, pc = P.car;
    const px = pc ? pc.x : P.x, pz = pc ? pc.z : P.z;
    const pvx = pc ? pc.vx : P.vx, pvz = pc ? pc.vz : P.vz;
    const d = Math.hypot(px - this.x, pz - this.z);
    let tx = px + pvx * 0.6, tz = pz + pvz * 0.6;
    let want = this.spec.max * (G.wanted >= 3 ? 0.95 : 0.8);
    ai.repath = (ai.repath || 0) - dt;
    if (d > 55) {
      if (ai.repath <= 0) { ai.path = World.path(World.nearestNode(this.x, this.z), World.nearestNode(px, pz)); ai.pi = 0; ai.repath = 1.2; }
      if (ai.path && ai.path.length) {
        while (ai.pi < ai.path.length - 1 && Math.hypot(lineC(ai.path[ai.pi][0]) - this.x, lineC(ai.path[ai.pi][1]) - this.z) < 14) ai.pi++;
        const n = ai.path[ai.pi];
        tx = lineC(n[0]); tz = lineC(n[1]);
        const turnAhead = Math.abs(angDiff(this.h, Math.atan2(tx - this.x, tz - this.z)));
        if (Math.hypot(tx - this.x, tz - this.z) < 25 && turnAhead > 0.6) want = 12;
      }
    } else if (!pc) want = d < 15 ? 0 : clamp(d * 0.7, 6, want);
    if (!pc && d < 22 && ai.crew > 0 && Math.abs(this.fwd) < 4 && !P.dead) {
      for (let k = 0; k < ai.crew; k++) {
        const side = k ? 1 : -1;
        const cop = new Ped('cop', this.x - Math.cos(this.h) * side * 2.2, this.z + Math.sin(this.h) * side * 2.2, {});
        cop.state = 'attack';
      }
      ai.crew = 0;
      this.driver = null;
      ai.mode = 'parked';
      return;
    }
    this.drive(tx, tz, want, dt);
    // Get unstuck
    if (want > 3 && Math.abs(this.fwd) < 1.5) ai.stuckT = (ai.stuckT || 0) + dt; else ai.stuckT = 0;
    if (ai.stuckT > 1.2) { ai.revT = 1.1; ai.stuckT = 0; ai.revSteer = -Math.sign(this.input.steer || 1); }
    if (ai.revT > 0) { ai.revT -= dt; this.input.throttle = -1; this.input.steer = ai.revSteer; this.input.hand = false; }
    // Shoot from the car
    ai.shootT = (ai.shootT || rand(1, 2)) - dt;
    if (G.wanted >= 3 && d < 45 && ai.shootT <= 0) {
      ai.shootT = rand(1.2, 2.2);
      Police.shootAtPlayer(this.x, this.y + 1.3, this.z, d, pc ? 0.35 : 0.3);
    }
  }
}

// Put a car back into normal traffic from wherever it is.
function toTraffic(v) {
  const a = World.nearestNode(v.x, v.z);
  const nb = a && World.neighbors(a[0], a[1]);
  if (!nb || !nb.length) { v.ai = { mode: 'parked' }; return; }
  let b = nb[0], best = -2;
  for (const n of nb) {
    const d = Math.sin(v.h) * Math.sign(n[0] - a[0]) + Math.cos(v.h) * Math.sign(n[1] - a[1]);
    if (d > best) { best = d; b = n; }
  }
  v.ai = { mode: 'traffic', a: [a[0] * 2 - b[0], a[1] * 2 - b[1]], b: a, stage: 1 };
  v.ai.c = b;
}

function collideCircle(p, r, y) {
  const boxes = World.hash.query(p.x - r, p.z - r, p.x + r, p.z + r, collideCircle._tmp);
  let hit = false, nx = 0, nz = 0;
  for (const b of boxes) {
    if (y !== undefined && (y + 0.3 > b.maxY || y + 1.5 < b.minY)) continue;
    const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    let ux, uz, pen;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); ux = dx / d; uz = dz / d; pen = r - d; }
    else {
      const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z, m = Math.min(l, rr, t, bt);
      if (m === l) { ux = -1; uz = 0; pen = l + r; } else if (m === rr) { ux = 1; uz = 0; pen = rr + r; }
      else if (m === t) { ux = 0; uz = -1; pen = t + r; } else { ux = 0; uz = 1; pen = bt + r; }
    }
    p.x += ux * pen; p.z += uz * pen; nx += ux; nz += uz; hit = true;
  }
  if (!hit) return null;
  const l = Math.hypot(nx, nz) || 1;
  return { nx: nx / l, nz: nz / l };
}
collideCircle._tmp = [];

function pointInBuilding(x, y, z) {
  const boxes = World.hash.query(x, z, x, z, pointInBuilding._tmp);
  for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.maxY && y > b.minY) return true;
  return false;
}
pointInBuilding._tmp = [];

function raycastWorld(ox, oy, oz, dx, dy, dz, maxT) {
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const boxes = World.hash.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), raycastWorld._tmp);
  let best = maxT;
  for (const b of boxes) { const t = rayBox(ox, oy, oz, dx, dy, dz, b, best); if (t >= 0 && t < best) best = t; }
  if (dy < -1e-4) { const tg = (World.groundY(ox, oz) - oy) / dy; if (tg > 0 && tg < best) best = tg; }
  return best;
}
raycastWorld._tmp = [];

function collideVehicles() {
  const vs = G.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    if (a.sinking) continue;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      if (b.sinking) continue;
      const reach = (a.spec.L + b.spec.L) / 2 + 0.5;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
      const ca = a.circles(), cb = b.circles();
      for (const p of ca) for (const q of cb) {
        let dx = q[0] - p[0], dz = q[1] - p[1];
        const d = Math.hypot(dx, dz), R = a.r + b.r;
        if (d >= R || d < 1e-4) continue;
        dx /= d; dz /= d;
        const pen = R - d, ma = a.mass, mb = b.mass, tot = ma + mb;
        a.x -= dx * pen * (mb / tot); a.z -= dz * pen * (mb / tot);
        b.x += dx * pen * (ma / tot); b.z += dz * pen * (ma / tot);
        const rv = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz;
        if (rv < 0) {
          const jimp = (-(1.25) * rv) / (1 / ma + 1 / mb);
          a.vx -= (jimp / ma) * dx; a.vz -= (jimp / ma) * dz;
          b.vx += (jimp / mb) * dx; b.vz += (jimp / mb) * dz;
          const hard = -rv;
          const pl = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
          if (hard > 4) {
            const dmg = (hard - 4) * 16;
            a.damage(dmg, pl ? 'player' : null); b.damage(dmg, pl ? 'player' : null);
            Sound.crash(hard / 25, Math.hypot(p[0] - Player.x, p[1] - Player.z));
            FX.sparks((p[0] + q[0]) / 2, a.y + 0.7, (p[1] + q[1]) / 2, 6);
            if (pl) {
              G.shake = Math.max(G.shake, hard / 40);
              const other = pl === a ? b : a;
              if (other.ai && other.ai.mode === 'traffic') other.ai.bumpT = 2.5;
              if (other.spec.police) Police.crime(0.4);
            }
          }
        }
      }
    }
  }
}
