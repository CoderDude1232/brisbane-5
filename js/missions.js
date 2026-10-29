'use strict';
// Story missions. Each step is a small state machine entry.

function snapNode(x, z) { const n = World.nearestNode(x, z); return n ? { x: lineC(n[0]), z: lineC(n[1]) } : { x, z }; }

const Missions = {
  idx: 0, active: null, step: 0, d: {}, target: null, enemies: [],
  init() {
    const P = World.pois;
    const mall = { x: -140, z: -60 };
    const valley = snapNode(240, -420);
    this.defs = [
      {
        name: "G'day Brisvegas", giver: P.southbank, who: 'Davo', reward: 500,
        steps: [
          { t: 'text', s: "DAVO: Oi! You must be me cousin from Sydney. Welcome to Brisvegas, mate.", d: 4 },
          { t: 'text', s: 'DAVO: Shazza needs a lift to the Gabba for the cricket. Grab some wheels.', d: 4 },
          { t: 'car', s: 'Get a vehicle. Press ~F~ near a car to "borrow" it.' },
          { t: 'goto', s: 'Pick up Shazza at the ~Queen St Mall~.', at: mall, r: 8, car: true },
          { t: 'text', s: "SHAZZA: Took ya long enough! The Gabba, quick, before the first ball!", d: 3.5 },
          { t: 'goto', s: 'Get Shazza to ~The Gabba~.', at: P.gabba, r: 10, car: true, time: 110 },
          { t: 'text', s: "SHAZZA: Ta, love. Here's somethin' for the petrol.", d: 3 },
        ],
      },
      {
        name: 'A Slab for the Boys', giver: P.gabba, who: 'Shazza', reward: 1500,
        steps: [
          { t: 'text', s: "SHAZZA: The boys in Bay 13 are dry as a dead dingo's donger.", d: 4 },
          { t: 'text', s: 'SHAZZA: Nick down to the XXXX Brewery in Milton and grab a slab. Chop chop.', d: 4 },
          { t: 'car', s: 'Get a vehicle.' },
          { t: 'goto', s: 'Drive to the ~XXXX Brewery~ in Milton.', at: P.xxxx, r: 10, car: true },
          { t: 'text', s: 'BREWERY BLOKE: One slab of XXXX Gold. Keep it cold, yeah?', d: 3 },
          { t: 'goto', s: 'Get the slab back to ~The Gabba~ before it gets warm!', at: P.gabba, r: 10, car: true, time: 115 },
          { t: 'text', s: 'SHAZZA: Ice cold. You little ripper!', d: 3 },
        ],
      },
      {
        name: 'Bin Chicken Bandit', giver: snapNode(60, 60), who: 'Uncle Kev', reward: 800,
        steps: [
          { t: 'text', s: 'UNCLE KEV: Strewth! A bloody bin chicken just pinched me sausage sanga!', d: 4 },
          { t: 'text', s: 'UNCLE KEV: Run it down and get me sanga back. On foot, mind - it\'s a protected species!', d: 4 },
          { t: 'chase', s: 'Catch the ~bin chicken~ on foot!', time: 75 },
          { t: 'text', s: "UNCLE KEV: Bewdy! Bit of beak on it, but she'll be right.", d: 3 },
        ],
      },
      {
        name: 'Valley Bikies', giver: snapNode(-60, -300), who: 'Tracy', reward: 3000,
        steps: [
          { t: 'text', s: 'TRACY: The Cane Toads MC have been shaking down my bar in the Valley.', d: 4 },
          { t: 'text', s: "TRACY: Here, take this. Go sort 'em out.", d: 3, give: 'pistol' },
          { t: 'goto', s: 'Head to ~Fortitude Valley~.', at: valley, r: 30 },
          { t: 'kill', s: 'Take out the ~Cane Toads~.', at: valley, n: 6 },
          { t: 'wanted', s: 'The cops are onto you. ~Lose your wanted level~.' },
        ],
      },
      {
        name: 'Story Bridge Sprint', giver: P.kpcliffs, who: 'Jayden', reward: 2500,
        steps: [
          { t: 'text', s: "JAYDEN: Reckon your ride's quick? Story Bridge loop. 100 seconds. Easy.", d: 4 },
          { t: 'car', s: 'Get a vehicle.' },
          { t: 'race', s: 'Hit every ~checkpoint~!', time: 100,
            cps: [[240, -120], [240, -300], [120, -360], [0, -240], [60, -60], [60, 120], [180, 120], [180, 240], [300, 60]] },
          { t: 'text', s: 'JAYDEN: Fair dinkum, that was quick. Here, take my cash.', d: 3 },
        ],
      },
      {
        name: 'Sunset at Coot-tha', giver: snapNode(-420, -60), who: 'Davo', reward: 5000, sunset: true,
        steps: [
          { t: 'text', s: "DAVO: You've done alright, cuz. Let's catch the sunset from Mt Coot-tha.", d: 4 },
          { t: 'car', s: 'Get a vehicle.' },
          { t: 'goto', s: 'Drive up to the ~Mt Coot-tha lookout~.', at: P.lookout, r: 12, car: true, time: 150 },
          { t: 'text', s: "DAVO: Look at that view. Best city in the world, mate. Brisbane's yours.", d: 6 },
        ],
      },
    ];
    // Giver marker + NPC
    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.5, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    G.scene.add(this.marker);
    this.cp = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 8, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.cp.visible = false;
    G.scene.add(this.cp);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
    this.arrow.rotation.x = Math.PI; this.arrow.visible = false;
    G.scene.add(this.arrow);
    this.giverPed = null;
    this.placeGiver();
  },
  placeGiver() {
    if (this.giverPed) { this.giverPed.remove(); this.giverPed = null; }
    const d = this.defs[this.idx];
    if (!d) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.set(d.giver.x, World.groundY(d.giver.x, d.giver.z) + 0.75, d.giver.z);
    const p = new Ped('civ', d.giver.x + 2.5, d.giver.z + 2.5, { state: 'idle', mission: 'giver' });
    p.h = Math.atan2(-2.5, -2.5);
    p.g.rotation.y = p.h;
    this.giverPed = p;
  },
  start() {
    const d = this.defs[this.idx];
    this.active = d; this.step = -1; this.d = {};
    this.marker.visible = false;
    HUD.big(d.name.toUpperCase(), '', '#ffd23a', 2.5);
    if (d.sunset && (G.timeOfDay < 16.5 || G.timeOfDay > 17.3)) G.timeOfDay = 16.6;
    this.next();
  },
  next() {
    this.cleanupStep();
    this.step++;
    const s = this.active.steps[this.step];
    if (!s) { this.pass(); return; }
    this.d = { t: 0 };
    this.target = null;
    if (s.time) this.d.timeLeft = s.time;
    if (s.t === 'text') { HUD.message(s.s, s.d); if (s.give === 'pistol') { Player.ammo.pistol += 60; Player.weapon = 'pistol'; HUD.flashText('PISTOL +60'); } }
    else HUD.objective(s.s);
    if (s.t === 'goto') this.target = { x: s.at.x, z: s.at.z, r: s.r };
    if (s.t === 'race') { this.d.cp = 0; this.target = this.cpPos(s, 0); }
    if (s.t === 'chase') {
      const g = this.active.giver;
      const ib = new Ibis(g.x + 10, g.z + 10);
      ib.thief = true; ib.hx = ib.x; ib.hz = ib.z;
      const sanga = bx(ib.g, 0.4, 0.12, 0.15, '#c87a3a', 0, 0.95, 0.75);
      this.d.ibis = ib;
    }
    if (s.t === 'wanted' && G.wanted === 0) Police.setWanted(2);
  },
  cpPos(s, k) { const c = snapNode(s.cps[k][0], s.cps[k][1]); return { x: c.x, z: c.z, r: 9 }; },
  cleanupStep() { this.cp.visible = false; this.arrow.visible = false; HUD.timer(null); },
  cleanupAll() {
    this.cleanupStep();
    for (const e of this.enemies) if (!e.dead) { e.mission = null; e.state = 'walk'; e.initNav(); }
    this.enemies = [];
    if (this.d.ibis && !this.d.ibis.dead) this.d.ibis.thief = false;
    this.target = null;
  },
  pass() {
    const d = this.active;
    this.cleanupAll();
    Player.money += d.reward;
    HUD.big('MISSION PASSED', fmtMoney(d.reward), '#ffd23a', 4);
    Sound.jingle(true);
    this.active = null;
    this.idx++;
    if (this.idx >= this.defs.length) setTimeout(() => HUD.message("That's every job in town. Brisvegas is yours - go cause some strife.", 7), 4500);
    this.placeGiver();
  },
  fail(reason) {
    if (!this.active) return;
    this.cleanupAll();
    this.active = null;
    setTimeout(() => { HUD.big('MISSION FAILED', reason || '', '#e04040', 3.5); Sound.jingle(false); }, Player.dead ? 4200 : 0);
    this.placeGiver();
  },
  onKill(e) {
    if (this.active && this.d.ibis === e) this.fail('You killed the bin chicken. The sanga is ruined.');
  },
  onEnterCar() {},

  update(dt, t) {
    this.marker.material.opacity = 0.35 + Math.sin(t * 4) * 0.12;
    if (!this.active) {
      const d = this.defs[this.idx];
      if (!d || Player.dead) return;
      const dd = Math.hypot(Player.x - d.giver.x, Player.z - d.giver.z);
      if (dd < 3.2 && (!Player.car || Player.car.speed < 5)) this.start();
      return;
    }
    const s = this.active.steps[this.step];
    if (!s) return;
    this.d.t += dt;
    if (this.d.timeLeft !== undefined) {
      this.d.timeLeft -= dt;
      HUD.timer(this.d.timeLeft);
      if (this.d.timeLeft <= 0) { this.fail("Time's up."); return; }
    }
    const P = Player, px = P.x, pz = P.z;
    const showCp = (tg) => {
      this.cp.visible = true;
      this.cp.scale.set(tg.r, 1, tg.r);
      this.cp.position.set(tg.x, World.groundY(tg.x, tg.z) + 4, tg.z);
      this.cp.material.opacity = 0.25 + Math.sin(t * 5) * 0.08;
    };
    switch (s.t) {
      case 'text': if (this.d.t > s.d) this.next(); break;
      case 'car': if (P.car) this.next(); break;
      case 'goto': {
        showCp(this.target);
        if (s.car && !P.car) HUD.objective('Get back in a ~vehicle~.');
        else HUD.objective(s.s);
        if (Math.hypot(px - s.at.x, pz - s.at.z) < s.r && (!s.car || P.car)) this.next();
        break;
      }
      case 'race': {
        showCp(this.target);
        if (Math.hypot(px - this.target.x, pz - this.target.z) < this.target.r) {
          Sound.pickup();
          this.d.cp++;
          if (this.d.cp >= s.cps.length) { this.next(); break; }
          this.target = this.cpPos(s, this.d.cp);
          HUD.objective(`Checkpoint ${this.d.cp}/${s.cps.length}`);
        }
        break;
      }
      case 'chase': {
        const ib = this.d.ibis;
        if (!ib || ib.removed) { this.fail('The bin chicken got away.'); break; }
        this.target = { x: ib.x, z: ib.z, r: 1 };
        this.arrow.visible = true;
        this.arrow.position.set(ib.x, 2 + Math.sin(t * 5) * 0.2, ib.z);
        if (Math.hypot(px - ib.x, pz - ib.z) > 160) { this.fail('The bin chicken got away.'); break; }
        if (!P.car && Math.hypot(px - ib.x, pz - ib.z) < 1.6) {
          ib.thief = false;
          HUD.flashText('SANGA RECOVERED');
          this.next();
        }
        break;
      }
      case 'kill': {
        if (!this.d.spawned && Math.hypot(px - s.at.x, pz - s.at.z) < 140) {
          this.d.spawned = true;
          for (let k = 0; k < s.n; k++) {
            const a = (k / s.n) * TAU, r = 10 + (k % 2) * 6;
            let x = s.at.x + Math.sin(a) * r, z = s.at.z + Math.cos(a) * r;
            const e = new Ped('bikie', x, z, { state: 'idle', mission: 'enemy' });
            e.h = Math.atan2(s.at.x - x, s.at.z - z);
            this.enemies.push(e);
          }
        }
        if (this.d.spawned) {
          let alive = 0;
          for (const e of this.enemies) {
            if (e.dead) continue;
            alive++;
            if (e.state === 'idle' && Math.hypot(px - e.x, pz - e.z) < 38) e.state = 'attack';
            if (e.state === 'walk' || e.state === 'flee') e.state = 'attack';
          }
          this.target = alive ? { x: s.at.x, z: s.at.z, r: 1 } : null;
          if (!alive) { this.enemies = []; this.next(); }
          else HUD.objective(`Take out the ~Cane Toads~. ${alive} left.`);
        } else this.target = { x: s.at.x, z: s.at.z, r: 1 };
        break;
      }
      case 'wanted': if (G.wanted === 0) this.next(); break;
    }
  },
};
