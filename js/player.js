'use strict';
// The player: a bloke in a maroon singlet and thongs.

const WEAPONS = {
  fist: { name: 'Fists', melee: true, dmg: 14, rate: 0.45, range: 1.9 },
  bat: { name: 'Cricket Bat', melee: true, dmg: 45, rate: 0.6, range: 2.5 },
  pistol: { name: 'Pistol', dmg: 34, rate: 0.28, spread: 0.01, range: 140 },
  smg: { name: 'Micro SMG', dmg: 17, rate: 0.085, spread: 0.028, range: 100, heavy: true },
};
const WEAPON_ORDER = ['fist', 'bat', 'pistol', 'smg'];

const Player = {
  init(x, z) {
    this.model = makePerson({ skin: '#f1c7a5', shirt: '#7a1f3d', sleeves: false, pants: '#1f2a44', shorts: true, hair: '#d9b45a', mullet: true, shoes: '#2a7fbf' });
    this.g = this.model.g;
    G.scene.add(this.g);
    this.money = 250;
    this.ammo = { pistol: 0, smg: 0 };
    this.hasBat = false;
    this.spawn(x, z);
  },
  spawn(x, z) {
    this.x = x; this.z = z; this.y = World.groundY(x, z);
    this.vx = 0; this.vz = 0; this.vy = 0; this.h = Math.PI;
    this.health = 100; this.armor = 0;
    this.dead = false; this.car = null; this.swimming = false; this.knockT = 0;
    this.weapon = 'fist'; this.fireT = 0; this.swingT = 0; this.phase = 0;
    this.g.visible = true;
  },
  owns(w) { return w === 'fist' || (w === 'bat' && this.hasBat) || ((w === 'pistol' || w === 'smg') && this.ammo[w] > 0); },
  cycleWeapon(dir) {
    let i = WEAPON_ORDER.indexOf(this.weapon);
    for (let k = 0; k < 4; k++) { i = (i + dir + 4) % 4; if (this.owns(WEAPON_ORDER[i])) { this.weapon = WEAPON_ORDER[i]; return; } }
  },
  selectWeapon(w) { if (this.owns(w)) this.weapon = w; },
  collect(p) {
    switch (p.type) {
      case 'health': if (this.health >= 100) return false; this.health = 100; HUD.flashText('+ HEALTH'); break;
      case 'armor': if (this.armor >= 100) return false; this.armor = 100; HUD.flashText('+ ARMOUR'); break;
      case 'cash': { const a = p.amount || randi(50, 200); this.money += a; HUD.flashText('+' + fmtMoney(a)); break; }
      case 'pistol': this.ammo.pistol += p.amount || 36; if (this.weapon === 'fist' || this.weapon === 'bat') this.weapon = 'pistol'; HUD.flashText('PISTOL +' + (p.amount || 36)); break;
      case 'smg': this.ammo.smg += p.amount || 120; this.weapon = 'smg'; HUD.flashText('MICRO SMG +' + (p.amount || 120)); break;
      case 'bat': this.hasBat = true; if (this.weapon === 'fist') this.weapon = 'bat'; HUD.flashText('CRICKET BAT'); break;
    }
    return true;
  },
  hurt(n, reason) {
    if (this.dead || G.state !== 'play') return;
    const a = Math.min(this.armor, n * 0.7);
    this.armor -= a;
    this.health -= n - a;
    G.dmgFlash = Math.min(0.6, G.dmgFlash + n / 30);
    if (this.health <= 0) this.die(reason);
  },
  die(reason) {
    if (this.dead) return;
    this.dead = true; this.health = 0;
    if (this.car) this.exitCar(true);
    this.g.rotation.x = -Math.PI / 2;
    G.endScreen('WASTED', reason || '', () => {
      const h = World.pois.hospital;
      const fee = Math.min(this.money, 500);
      this.money -= fee;
      this.g.rotation.x = 0;
      this.spawn(h.x, h.z);
      Police.clear();
      HUD.message(`Royal Brisbane Hospital. Medical bill: ${fmtMoney(fee)}. Medicare doesn't cover stupidity.`, 5);
    });
    Missions.fail('You died.');
  },
  busted() {
    if (this.dead) return;
    this.dead = true;
    G.endScreen('BUSTED', 'Nicked by the QPS', () => {
      const p = World.pois.police;
      const fee = Math.min(this.money, 300);
      this.money -= fee;
      this.ammo = { pistol: 0, smg: 0 };
      this.spawn(p.x, p.z);
      Police.clear();
      HUD.message(`Released from Roma St. Fine: ${fmtMoney(fee)}. Weapons confiscated.`, 5);
    });
    Missions.fail('You got busted.');
  },

  enterExit() {
    if (this.dead) return;
    if (this.car) { if (this.car.speed < 12) this.exitCar(false); return; }
    let best = null, bd = 4.2;
    for (const v of G.vehicles) {
      if (v.dead || v.sinking || v.speed > 9) continue;
      for (const c of v.circles()) {
        const d = Math.hypot(c[0] - this.x, c[1] - this.z) - v.r;
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (!best) return;
    const v = best;
    const side = -1; // driver sits on the right
    const ex = v.x + Math.cos(v.h) * side * (v.spec.W / 2 + 0.8), ez = v.z - Math.sin(v.h) * side * (v.spec.W / 2 + 0.8);
    if (v.driver === 'civ' || v.driver === 'cop') {
      const p = new Ped(v.driver, ex, ez, {});
      if (v.driver === 'civ') { p.flee(this.x, this.z, 10); Police.witness(0.6); }
      else { p.state = 'attack'; Police.crime(1.5); }
      Sound.punch();
    }
    if (v.spec.police) Police.crime(1);
    v.ai = null; v.driver = 'player'; v.siren = false;
    this.car = v;
    this.g.visible = false;
    HUD.vehicleName(v.spec.name);
    Missions.onEnterCar(v);
  },
  exitCar(splash) {
    const v = this.car;
    if (!v) return;
    const W = v.spec.W / 2 + 0.9;
    let x = v.x - Math.cos(v.h) * W, z = v.z + Math.sin(v.h) * W;
    if (pointInBuilding(x, 1, z)) { x = v.x + Math.cos(v.h) * W; z = v.z - Math.sin(v.h) * W; }
    this.x = x; this.z = z; this.y = World.groundY(x, z);
    this.vx = v.vx * 0.3; this.vz = v.vz * 0.3; this.vy = splash ? 2 : 0;
    this.h = v.h;
    v.driver = null; v.input = { throttle: 0, steer: 0, hand: true };
    this.car = null;
    this.g.visible = true;
  },

  update(dt, t) {
    if (this.dead) { this.fireT = 0; return; }
    this.fireT -= dt; this.swingT -= dt;
    const I = Input;
    if (this.car) {
      const v = this.car;
      this.x = v.x; this.z = v.z; this.y = v.y; this.vx = v.vx; this.vz = v.vz;
      v.input.throttle = clamp((I.key('KeyW') || I.key('ArrowUp') ? 1 : 0) - (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - I.joy.y * 1.4, -1, 1);
      v.input.steer = clamp((I.key('KeyA') ? 1 : 0) - (I.key('KeyD') ? 1 : 0) - I.joy.x * 1.3, -1, 1);
      v.input.hand = I.key('Space');
      if (I.fire && !WEAPONS[this.weapon].melee && this.fireT <= 0) this.fire();
      return;
    }
    const cam = G.cam;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let ix = (I.key('KeyD') ? 1 : 0) - (I.key('KeyA') ? 1 : 0) + I.joy.x;
    let iy = (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0) - (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - I.joy.y;
    let mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.swimming = World.inRiver(this.x, this.z);
    const sprint = I.key('ShiftLeft') || I.key('ShiftRight');
    let sp = this.swimming ? 2.4 : sprint ? 7.6 : 4.2;
    if (this.knockT > 0) { this.knockT -= dt; sp = 0; }
    const gun = !WEAPONS[this.weapon].melee;
    const aiming = (I.aim || (I.fire && gun)) && !this.swimming;
    if (aiming) sp = Math.min(sp, 3);
    const ground = this.swimming ? -0.95 : World.groundY(this.x, this.z);
    const onGround = this.y <= ground + 0.05;
    const k = 1 - Math.exp(-(onGround ? 12 : 2) * dt);
    if (this.knockT <= 0) {
      this.vx = lerp(this.vx, mx * sp, k);
      this.vz = lerp(this.vz, mz * sp, k);
    }
    if (aiming) this.h = Math.atan2(fx, fz);
    else if (ml > 0) this.h += angDiff(this.h, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
    if (I.pressed('Space') && onGround && !this.swimming) this.vy = 6.5;
    this.vy -= 20 * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    if (this.y < ground) { this.y = ground; this.vy = 0; }
    this.x = World.clampX(this.x); this.z = World.clampZ(this.z);
    const p = { x: this.x, z: this.z };
    if (collideCircle(p, 0.4, this.y)) { this.x = p.x; this.z = p.z; }
    for (const q of G.peds) {
      if (q.dead) continue;
      const dx = this.x - q.x, dz = this.z - q.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-4) { this.x += (dx / d) * (0.75 - d) * 0.5; this.z += (dz / d) * (0.75 - d) * 0.5; }
    }
    for (const v of G.vehicles) {
      if (Math.abs(v.x - this.x) > 8 || Math.abs(v.z - this.z) > 8 || v.sinking) continue;
      for (const c of v.circles()) {
        const dx = this.x - c[0], dz = this.z - c[1], d = Math.hypot(dx, dz);
        if (d < v.r + 0.4 && d > 1e-4) {
          const closing = -(v.vx * dx + v.vz * dz) / d;
          if (v.speed > 6 && closing > 3 && this.knockT <= 0) {
            this.hurt(v.speed * 2.2, 'Hit by a ' + v.spec.name);
            this.vx = v.vx * 0.8 + (dx / d) * 4; this.vz = v.vz * 0.8 + (dz / d) * 4; this.vy = 5; this.knockT = 1.2;
            Sound.crash(0.4, 0);
          }
          this.x += (dx / d) * (v.r + 0.4 - d); this.z += (dz / d) * (v.r + 0.4 - d);
        }
      }
    }
    if (I.fire && this.fireT <= 0 && !this.swimming) this.fire();

    // Visuals
    const s = Math.hypot(this.vx, this.vz);
    this.phase += s * dt * 2.6;
    animatePerson(this.model, this.phase, this.knockT > 0 ? 0 : Math.min(s / 4, 1) * 0.85, aiming && gun);
    if (this.swingT > 0) { this.model.rArm.rotation.x = -2.2 + (0.3 - this.swingT) * 6; this.model.rArm.rotation.z = 0.4; }
    if (this.swimming) { this.model.lArm.rotation.x = -2.5 + Math.sin(t * 6) * 0.8; this.model.rArm.rotation.x = -2.5 - Math.sin(t * 6) * 0.8; }
    this.model.gun.visible = gun && !this.swimming;
    this.model.bat.visible = this.weapon === 'bat' && !this.swimming;
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(this.knockT > 0.6 ? -1.2 : 0, this.h, 0);
  },

  fire() {
    const w = WEAPONS[this.weapon];
    this.fireT = w.rate;
    if (w.melee) {
      this.swingT = 0.3;
      Sound.punch();
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      const inFront = (x, z, r) => {
        const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
        return d < w.range + r && (dx * fx + dz * fz) / (d || 1) > 0.4;
      };
      for (const p of G.peds) if (!p.dead && inFront(p.x, p.z, 0.3)) {
        p.damage(w.dmg, 'player', [fx, 0, fz]);
        if (!p.dead && p.kind === 'civ' && Math.random() < 0.3) p.state = 'flee';
        if (p.kind === 'cop') Police.crime(1); else Police.witness(0.25);
      }
      for (const b of G.birds) if (!b.dead && inFront(b.x, b.z, 0.3)) b.damage(w.dmg, 'player');
      for (const v of G.vehicles) if (inFront(v.x, v.z, v.spec.L / 2)) { v.damage(w.dmg * 0.5, 'player'); }
      return;
    }
    if (this.ammo[this.weapon] <= 0) { this.cycleWeapon(-1); return; }
    this.ammo[this.weapon]--;
    const cam = G.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.x += rand(-w.spread, w.spread); dir.y += rand(-w.spread, w.spread); dir.z += rand(-w.spread, w.spread);
    dir.normalize();
    const o = cam.position;
    const minT = o.distanceTo(new THREE.Vector3(this.x, this.y + 1.5, this.z)) + 0.5;
    let best = raycastWorld(o.x, o.y, o.z, dir.x, dir.y, dir.z, w.range);
    let target = null;
    for (const p of G.peds) {
      if (p.dead || Math.abs(p.x - this.x) > w.range || Math.abs(p.z - this.z) > w.range) continue;
      const tt = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, p.x, p.y + 1.15, p.z, 0.6);
      if (tt > minT && tt < best) { best = tt; target = p; }
    }
    for (const b of G.birds) {
      if (b.dead) continue;
      const tt = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, b.x, 0.6, b.z, 0.5);
      if (tt > minT && tt < best) { best = tt; target = b; }
    }
    for (const v of G.vehicles) {
      if (v === this.car || Math.abs(v.x - this.x) > w.range || Math.abs(v.z - this.z) > w.range) continue;
      for (const c of v.circles()) {
        const tt = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, c[0], v.y + 0.9, c[1], v.r + 0.15);
        if (tt > minT && tt < best) { best = tt; target = v; }
      }
    }
    if (G.heli && !G.heli.dead) {
      const tt = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, G.heli.x, G.heli.y, G.heli.z, 3);
      if (tt > minT && tt < best) { best = tt; target = G.heli; }
    }
    const hx = o.x + dir.x * best, hy = o.y + dir.y * best, hz = o.z + dir.z * best;
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const mx = this.car ? this.car.x : this.x + fx * 0.7 - fz * 0.35, my = this.car ? this.car.y + 1.6 : this.y + 1.35, mz = this.car ? this.car.z : this.z + fz * 0.7 + fx * 0.35;
    FX.tracer(mx, my, mz, hx, hy, hz);
    FX.flash(mx, my, mz);
    Sound.shot(0, w.heavy);
    if (target) {
      if (target instanceof Vehicle) { target.damage(w.dmg * 1.3, 'player'); FX.sparks(hx, hy, hz, 4); }
      else target.damage(w.dmg * (target instanceof Ped && hy > target.y + 1.6 ? 2 : 1), 'player', [dir.x, dir.y, dir.z]);
    } else if (best < w.range) FX.sparks(hx, hy, hz, 3, '#cccccc');
    Police.witness(0.25);
    for (const p of G.peds) if (p.kind === 'civ' && !p.dead && Math.abs(p.x - this.x) < 40 && Math.abs(p.z - this.z) < 40) p.flee(this.x, this.z, 8);
    for (const v of G.vehicles) if (v.ai && v.ai.mode === 'traffic' && Math.abs(v.x - this.x) < 30 && Math.abs(v.z - this.z) < 30) v.ai.panic = 6;
  },
};
