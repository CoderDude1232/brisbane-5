'use strict';
// Wanted level, police dispatch and the PolAir chopper.

const STAR_HEAT = [0, 1, 3, 6, 10, 16];

const Police = {
  heat: 0, seenT: 0, spawnT: 0, arrestT: 0,
  crime(n) {
    if (Player.dead || G.state !== 'play') return;
    const before = G.wanted;
    this.heat = Math.min(24, this.heat + n);
    this.seenT = 0;
    let w = 0;
    for (let s = 1; s <= 5; s++) if (this.heat >= STAR_HEAT[s]) w = s;
    G.wanted = Math.max(G.wanted, w);
    if (G.wanted > before) HUD.starsPulse();
  },
  // Only counts if police are around (or already chasing).
  witness(n) {
    if (G.wanted > 0) { this.crime(n * 0.5); return; }
    for (const v of G.vehicles) if (v.spec.police && v.driver && Math.hypot(v.x - Player.x, v.z - Player.z) < 70) { this.crime(Math.max(n, 1)); return; }
    for (const p of G.peds) if (p.kind === 'cop' && !p.dead && Math.hypot(p.x - Player.x, p.z - Player.z) < 60) { this.crime(Math.max(n, 1)); return; }
  },
  setWanted(n) { this.heat = STAR_HEAT[n]; G.wanted = n; this.seenT = 0; HUD.starsPulse(); },
  clear() {
    this.heat = 0; G.wanted = 0; this.arrestT = 0;
    for (const v of G.vehicles.slice()) if (v.spec.police && v.driver !== 'player') {
      if (Math.hypot(v.x - Player.x, v.z - Player.z) > 60) v.remove();
      else { v.siren = false; if (v.driver) toTraffic(v); }
    }
    for (const p of G.peds.slice()) if (p.kind === 'cop' && !p.dead) { if (Math.hypot(p.x - Player.x, p.z - Player.z) > 60) p.remove(); else { p.state = 'walk'; p.initNav(); } }
    if (G.heli) G.heli.leave = true;
  },
  shootAtPlayer(x, y, z, d, acc) {
    if (Player.dead) return;
    const pc = Player.car;
    const tx = pc ? pc.x : Player.x, ty = pc ? pc.y + 1 : Player.y + 1.2, tz = pc ? pc.z : Player.z;
    const moving = Math.hypot(Player.vx, Player.vz);
    const chance = acc * clamp(1.1 - d / 45, 0.15, 1) * (moving > 8 ? 0.5 : moving > 3 ? 0.8 : 1);
    const hit = Math.random() < chance;
    const ox = hit ? 0 : rand(-2, 2), oy = hit ? 0 : rand(-0.5, 1.5), oz = hit ? 0 : rand(-2, 2);
    FX.tracer(x, y, z, tx + ox, ty + oy, tz + oz);
    FX.flash(x, y, z);
    Sound.shot(Math.hypot(x - Player.x, z - Player.z));
    if (hit) {
      if (pc) { pc.damage(rand(25, 45)); if (Math.random() < 0.3) Player.hurt(rand(3, 7), 'Shot'); }
      else Player.hurt(rand(6, 11), 'Shot by ' + (acc > 0.35 ? 'the cops' : 'bikies'));
    }
  },

  spawnCar() {
    const px = Player.x, pz = Player.z;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * TAU, r = rand(140, 220);
      const n = World.nearestEdge(px + Math.sin(a) * r, pz + Math.cos(a) * r, 80, (E) => E.car);
      if (!n) continue;
      const [x, z] = World.pointAt(n.e, 1, n.s);
      if (Math.hypot(x - px, z - pz) < 100 || World.inRiver(x, z)) continue;
      const v = new Vehicle('police', x, z, Math.atan2(px - x, pz - z), { driver: 'cop', ai: { mode: 'police', crew: 2 } });
      v.siren = true;
      return v;
    }
  },

  update(dt) {
    const P = Player;
    if (G.wanted === 0 || P.dead) { this.arrestT = 0; if (G.heli && P.dead) G.heli.leave = true; return; }
    const px = P.x, pz = P.z;
    let seen = false, copCars = 0;
    for (const v of G.vehicles) {
      if (!v.spec.police || !v.ai || v.dead) continue;
      if (v.ai.mode === 'traffic' && Math.hypot(v.x - px, v.z - pz) < 160) { v.ai = { mode: 'police', crew: 2 }; v.siren = true; }
      if (v.ai.mode === 'police') copCars++;
      if (v.ai.mode === 'parked' && v.ai.crew === 0) continue;
      if (Math.hypot(v.x - px, v.z - pz) < 90) seen = true;
      if (Math.hypot(v.x - px, v.z - pz) > 420) v.remove();
    }
    for (const p of G.peds) {
      if (p.kind !== 'cop' || p.dead) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < 70) seen = true;
      if (d > 320) p.remove();
    }
    if (G.heli && !G.heli.dead && !G.heli.leave && Math.hypot(G.heli.x - px, G.heli.z - pz) < 140) seen = true;
    if (seen) this.seenT = 0; else this.seenT += dt;
    G.copsSeeing = seen;
    if (this.seenT > 7 + G.wanted * 3) {
      this.clear();
      HUD.message('You lost the cops. Good on ya.', 3);
      return;
    }
    this.spawnT -= dt;
    const maxCars = [0, 1, 2, 4, 5, 7][G.wanted];
    if (copCars < maxCars && this.spawnT <= 0) { this.spawnCar(); this.spawnT = 4 - G.wanted * 0.5; }
    if (G.wanted >= 3 && !G.heli) G.heli = new Heli();
    // Arrest at one star
    if (!P.car && G.wanted <= 1) {
      this.arrestT = Math.max(0, this.arrestT - dt);
      if (this.arrestT > 2.5) P.busted();
    } else this.arrestT = 0;
  },
};

class Heli {
  constructor() {
    const m = makeHeli();
    this.g = m.g; this.rotor = m.rotor; this.tail = m.tail;
    G.scene.add(this.g);
    const a = Math.random() * TAU;
    this.x = Player.x + Math.sin(a) * 250; this.z = Player.z + Math.cos(a) * 250; this.y = 60;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.health = 650; this.dead = false; this.leave = false;
    this.ang = a; this.shootT = 3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -20;
    this.cone = cone;
    this.g.add(cone);
  }
  damage(n, by) {
    if (this.dead) return;
    this.health -= n;
    FX.sparks(this.x, this.y, this.z, 4);
    if (this.health <= 0) {
      this.dead = true; this.vy = 0;
      FX.explosion(this.x, this.y, this.z);
      Sound.explosion(Math.hypot(this.x - Player.x, this.z - Player.z));
      if (by === 'player') Police.crime(3);
    }
  }
  update(dt, t) {
    this.rotor.rotation.y += dt * 30;
    this.tail.rotation.x += dt * 40;
    this.cone.visible = G.night > 0.4 && !this.dead && !this.leave;
    if (this.dead) {
      this.vy -= 15 * dt; this.y += this.vy * dt;
      this.g.rotation.y += dt * 4;
      if (Math.random() < 0.5) FX.smoke(this.x, this.y, this.z, true);
      const gy = World.groundY(this.x, this.z);
      if (this.y < gy + 1) {
        FX.explosion(this.x, gy, this.z);
        Sound.explosion(Math.hypot(this.x - Player.x, this.z - Player.z));
        for (const p of G.peds) if (!p.dead && Math.hypot(p.x - this.x, p.z - this.z) < 9) p.die(null, 0, 0, 5);
        if (!Player.dead && Math.hypot(Player.x - this.x, Player.z - this.z) < 9) Player.hurt(70, 'Squashed by a chopper');
        this.remove();
      }
      this.g.position.set(this.x, this.y, this.z);
      return;
    }
    let tx, tz, ty;
    if (this.leave || G.wanted < 3) {
      tx = this.x + Math.sin(this.ang) * 100; tz = this.z + Math.cos(this.ang) * 100; ty = 90;
      if (Math.hypot(this.x - Player.x, this.z - Player.z) > 400) { this.remove(); return; }
    } else {
      this.ang += dt * 0.25;
      tx = Player.x + Math.sin(this.ang) * 32; tz = Player.z + Math.cos(this.ang) * 32;
      ty = World.groundY(Player.x, Player.z) + 34;
    }
    const k = 1 - Math.exp(-0.8 * dt);
    this.vx = lerp(this.vx, clamp(tx - this.x, -40, 40), k);
    this.vz = lerp(this.vz, clamp(tz - this.z, -40, 40), k);
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.y = lerp(this.y, ty, k);
    const face = Math.atan2(Player.x - this.x, Player.z - this.z);
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(clamp(Math.hypot(this.vx, this.vz) * 0.01, 0, 0.3), face, 0);
    const dx = Player.x - this.x, dz = Player.z - this.z, dy = Player.y - this.y;
    this.cone.lookAt(Player.x, Player.y, Player.z);
    this.cone.rotateX(-Math.PI / 2);
    this.cone.position.set(0, 0, 0);
    this.cone.translateY(-20);
    this.shootT -= dt;
    if (G.wanted >= 4 && this.shootT <= 0 && !this.leave) {
      this.shootT = rand(1.5, 2.5);
      Police.shootAtPlayer(this.x, this.y - 1, this.z, Math.hypot(dx, dy, dz) * 0.6, 0.35);
    }
  }
  remove() { G.scene.remove(this.g); if (G.heli === this) G.heli = null; }
}
