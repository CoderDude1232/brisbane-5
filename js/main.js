'use strict';
// Boot, input, camera, day/night, population spawning and the main loop.

const G = {
  vehicles: [], peds: [], birds: [], wanted: 0, state: 'title', t: 0,
  cam: { yaw: 0, pitch: 0.28, mouseT: 0, dist: 6 },
  shake: 0, dmgFlash: 0, timeOfDay: 15.5, night: 0, heli: null, magpie: null, copsSeeing: false,
};

const Input = {
  keys: {}, down: {}, fire: false, aim: false, dx: 0, dy: 0, locked: false, joy: { x: 0, y: 0 },
  key(c) { return !!this.keys[c]; },
  pressed(c) { return !!this.down[c]; },
  endFrame() { this.down = {}; this.dx = 0; this.dy = 0; },
  init(canvas) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys[e.code]) this.down[e.code] = true;
      this.keys[e.code] = true;
      onKey(e.code);
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.fire = false; this.aim = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (G.state === 'play' && !this.locked && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (err) { /* sandboxed */ } }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aim = true;
      this.drag = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; if (e.button === 2) this.aim = false; this.drag = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (this.locked || (this.drag && G.state === 'play')) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    addEventListener('wheel', (e) => { if (G.state === 'play') Player.cycleWeapon(e.deltaY > 0 ? 1 : -1); });
    this.initTouch();
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && G.state === 'play' && G.wasLocked) pause(true);
      G.wasLocked = this.locked;
    });
  },
};

Input.initTouch = function () {
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!touch) return;
  document.body.classList.add('touch');
  const joy = $('joy'), knob = $('knob');
  let jid = null;
  const setJoy = (e) => {
    const r = joy.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this.joy.x = x; this.joy.y = y;
    knob.style.transform = `translate(${x * 45}px, ${y * 45}px)`;
  };
  joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(jid); setJoy(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) setJoy(e); });
  const endJoy = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.x = 0; this.joy.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  const look = $('look'); let lid = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', (e) => { lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
  look.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; this.dx += (e.clientX - lx) * 1.6; this.dy += (e.clientY - ly) * 1.6; lx = e.clientX; ly = e.clientY; });
  const endLook = (e) => { if (e.pointerId === lid) lid = null; };
  look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);
  const hold = (id, on, off) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); el.setPointerCapture(e.pointerId); on(); });
    const up = () => { el.classList.remove('on'); if (off) off(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  hold('tFire', () => { this.fire = true; }, () => { this.fire = false; });
  hold('tJump', () => { this.keys.Space = true; this.down.Space = true; }, () => { this.keys.Space = false; });
  hold('tSprint', () => { this.keys.ShiftLeft = true; }, () => { this.keys.ShiftLeft = false; });
  hold('tCar', () => onKey('KeyF'));
  hold('tWeap', () => { if (G.state === 'play') Player.cycleWeapon(1); });
  hold('tRadio', () => onKey('KeyQ'));
  hold('tMap', () => onKey('KeyM'));
  $('bigmap').addEventListener('pointerdown', () => onKey('KeyM'));
};

function onKey(code) {
  if (G.state === 'title') return;
  if (code === 'KeyM') { if (G.state === 'map') { G.state = 'play'; $('bigmap').style.display = 'none'; } else if (G.state === 'play') { G.state = 'map'; $('bigmap').style.display = 'block'; HUD.drawBigMap(); } return; }
  if (code === 'KeyP' || (code === 'Escape' && G.state === 'paused')) { pause(G.state === 'play'); return; }
  if (G.state !== 'play') return;
  if (code === 'KeyF' || code === 'Enter') Player.enterExit();
  if (code === 'KeyH') Sound.horn();
  if (code === 'KeyQ' || code === 'KeyR') { Sound.station = (Sound.station + 1) % STATIONS.length; HUD.radioName(STATIONS[Sound.station]); }
  if (code === 'Digit1') Player.selectWeapon('fist');
  if (code === 'Digit2') Player.selectWeapon('bat');
  if (code === 'Digit3') Player.selectWeapon('pistol');
  if (code === 'Digit4') Player.selectWeapon('smg');
  if (code === 'KeyE' && Player.car && Player.car.spec.police) Player.car.siren = !Player.car.siren;
}

function pause(on) {
  if (on && G.state === 'play') { G.state = 'paused'; $('pause').style.display = 'flex'; if (document.exitPointerLock) document.exitPointerLock(); }
  else if (!on && G.state === 'paused') { G.state = 'play'; $('pause').style.display = 'none'; }
}

// ---------- Camera ----------
function updateCamera(dt) {
  const c = G.cam, P = Player;
  const turnKeys = (Input.key('ArrowLeft') ? 1 : 0) - (Input.key('ArrowRight') ? 1 : 0);
  c.yaw -= Input.dx * 0.0026 - turnKeys * dt * 2.2;
  c.pitch = clamp(c.pitch + Input.dy * 0.002, -0.2, 1.25);
  if (Input.dx || Input.dy || turnKeys) c.mouseT = 0; else c.mouseT += dt;
  let tx, ty, tz, dist;
  const aiming = !P.car && Input.aim && !P.dead;
  if (P.car) {
    const v = P.car;
    tx = v.x; ty = v.y + v.spec.H + 0.6; tz = v.z;
    dist = 6 + v.spec.L * 0.8 + Math.min(v.speed * 0.08, 4);
    if (c.mouseT > 1.0 && v.speed > 2) {
      const behind = (v.fwd < -1 ? v.h : v.h + Math.PI);
      c.yaw += angDiff(c.yaw, behind) * Math.min(1, dt * 2.5);
      c.pitch = lerp(c.pitch, 0.2, Math.min(1, dt * 1.5));
    }
  } else {
    tx = P.x; ty = P.y + 1.55; tz = P.z;
    dist = aiming ? 2.8 : 5.2;
  }
  c.dist = lerp(c.dist, dist, 1 - Math.exp(-dt * 5));
  const sh = aiming || (!P.car && !WEAPONS[P.weapon].melee) ? 0.65 : 0;
  const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  tx += rx * sh; tz += rz * sh;
  const ox = Math.sin(c.yaw) * Math.cos(c.pitch), oy = Math.sin(c.pitch), oz = Math.cos(c.yaw) * Math.cos(c.pitch);
  let d = c.dist;
  for (let k = 1; k <= 14; k++) {
    const s = (k / 14) * c.dist;
    const x = tx + ox * s, y = ty + oy * s, z = tz + oz * s;
    if (pointInBuilding(x, y, z) || y < World.groundY(x, z) + 0.3) { d = Math.max(0.8, s - c.dist / 14); break; }
  }
  const cam = G.camera;
  cam.position.set(tx + ox * d, Math.max(ty + oy * d, World.groundY(tx + ox * d, tz + oz * d) + 0.4), tz + oz * d);
  if (G.shake > 0) {
    cam.position.x += rand(-1, 1) * G.shake * 0.4; cam.position.y += rand(-1, 1) * G.shake * 0.4;
    G.shake = Math.max(0, G.shake - dt * 2);
  }
  cam.lookAt(tx, ty + (P.car ? 0 : 0.1), tz);
  const fov = P.car ? 62 + Math.min(P.car.speed * 0.25, 14) : aiming ? 50 : 62;
  if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix(); }
}

// ---------- Population ----------
const Spawner = {
  t: 0, magT: 25, frustum: new THREE.Frustum(), pm: new THREE.Matrix4(),
  visible(x, y, z) { return this.frustum.containsPoint(new THREE.Vector3(x, y, z)); },
  // A random road edge in a ring around the player.
  randomEdge(minR, maxR, filter) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * TAU, r = rand(minR, maxR);
      const n = World.nearestEdge(Player.x + Math.sin(a) * r, Player.z + Math.cos(a) * r, 60, filter);
      if (n) return n;
    }
    return null;
  },
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    this.pm.multiplyMatrices(G.camera.projectionMatrix, G.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const px = Player.x, pz = Player.z;
    let traffic = 0, parked = 0;
    for (const v of G.vehicles.slice()) {
      const d = Math.hypot(v.x - px, v.z - pz);
      const keep = v.driver === 'player' || v === Player.lastCar;
      if (v.ai && v.ai.mode === 'traffic') {
        traffic++;
        if (!keep && (d > 420 || (d > 160 && (v.ai.lost || v.dead) && !this.visible(v.x, 1, v.z)))) v.remove();
      } else {
        if (!v.driver) parked++;
        const chasing = v.ai && v.ai.mode === 'police' && G.wanted > 0;
        if (!keep && !chasing && d > 360 && !this.visible(v.x, 1, v.z)) v.remove();
        else if (!keep && v.dead && v.wreckT < 0 && !this.visible(v.x, 1, v.z)) v.remove();
      }
    }
    if (traffic < (G.mobile ? 22 : 38)) {
      const n = this.randomEdge(110, 340, (E) => E.car && E.len > 20);
      if (n) {
        const E = World.edges[n.e], dir = E.oneway ? 1 : Math.random() < 0.5 ? 1 : -1;
        const s = dir > 0 ? n.s : E.len - n.s;
        const [x, z, tx, tz] = lanePoint(n.e, dir, s);
        const d = Math.hypot(x - px, z - pz);
        const clear = G.vehicles.every((v) => Math.hypot(v.x - x, v.z - z) > 12);
        if (clear && d > 100 && !(d < 240 && this.visible(x, 1, z)) && !World.inRiver(x, z)) {
          const police = Math.random() < 0.05;
          const type = police ? 'police' : pick(E.cls <= 1 ? TRAFFIC_MIX.filter((t) => t !== 'bus') : TRAFFIC_MIX);
          const v = new Vehicle(type, x, z, Math.atan2(tx, tz), { driver: police ? 'cop' : 'civ', ai: { mode: 'traffic', e: n.e, dir, s } });
          v.vx = tx * v.cruise * 0.7; v.vz = tz * v.cruise * 0.7;
        }
      }
    }
    if (parked < 12) { // kerbside parking on local streets
      const n = this.randomEdge(60, 240, (E) => E.car && E.cls >= 4 && E.cls <= 7 && E.len > 25);
      if (n) {
        const E = World.edges[n.e], [x0, z0, tx, tz] = World.pointAt(n.e, 1, n.s), o = E.w / 2 - 1.1;
        const x = x0 + tz * o, z = z0 - tx * o;
        const clear = G.vehicles.every((v) => Math.hypot(v.x - x, v.z - z) > 8);
        if (clear && !this.visible(x, 1, z) && !pointInBuilding(x, 1, z) && !World.isWater(x, z)) new Vehicle(pick(TRAFFIC_MIX.filter((t) => t !== 'bus')), x, z, Math.atan2(tx, tz));
      }
    }
    // Pedestrians on footpaths
    let civs = 0;
    for (const p of G.peds.slice()) {
      if (p.mission) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (p.kind === 'civ' || (p.kind === 'cop' && G.wanted === 0)) civs++;
      if (d > 260 && !this.visible(p.x, 1, p.z)) p.remove();
    }
    const busy = World.zoneAt(px, pz) === 'cbd' || World.zoneAt(px, pz) === 'valley' || World.zoneAt(px, pz) === 'southbank';
    const want = (G.mobile ? 30 : 55) * (busy ? 1.3 : 0.8);
    for (let k = 0; k < 3 && civs < want; k++) {
      const n = this.randomEdge(40, 220, (E) => World.walkable(E));
      if (!n) continue;
      const E = World.edges[n.e], side = Math.random() < 0.5 ? 1 : -1;
      const [x0, z0, tx, tz] = World.pointAt(n.e, 1, n.s), o = E.walk ? 0 : (E.w / 2 + 1.6) * side;
      const x = x0 + tz * o, z = z0 - tx * o;
      if (World.inRiver(x, z) || pointInBuilding(x, 1, z) || (Math.hypot(x - px, z - pz) < 80 && this.visible(x, 1, z))) continue;
      const p = new Ped(Math.random() < 0.05 ? 'cop' : 'civ', x, z, { nav: { e: n.e, dir: Math.random() < 0.5 ? 1 : -1, side } });
      civs++;
    }
    // Bin chickens in parks and plazas
    let ibis = 0;
    for (const b of G.birds.slice()) { if (Math.hypot(b.x - px, b.z - pz) > 220 && !b.thief) b.remove(); else ibis++; }
    if (ibis < 8) {
      const a = Math.random() * TAU, r = rand(40, 170);
      const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
      const ok = World.areas.some((ar) => (ar.t === 'park' || ar.t === 'plaza' || ar.t === 'grass') && x > ar.box[0] && x < ar.box[2] && z > ar.box[1] && z < ar.box[3] && pip(x, z, ar.pts));
      if (ok && !pointInBuilding(x, 1, z) && !World.isWater(x, z) && !this.visible(x, 0.5, z)) new Ibis(x, z);
    }
    // Magpie season in the leafy suburbs
    const zone = World.zoneAt(px, pz);
    if (!Player.car && !Player.dead && (zone === 'suburb' || zone === 'mid') && G.night < 0.5) {
      this.magT -= 0.2;
      if (this.magT <= 0 && !G.magpie) {
        G.magpie = new Magpie();
        this.magT = rand(35, 80);
        if (!this.warned) { this.warned = true; HUD.message("It's spring in Brisbane. ~Magpie season~. Mind your head!", 4); }
      }
    }
  },
};

// A spot on the footpath next to the nearest road.
function kerbSpot(x, z) {
  const n = World.nearestEdge(x, z, 120, (E) => !E.walk && E.cls <= 13);
  if (!n) return { x, z };
  const E = World.edges[n.e], [px, pz, tx, tz] = World.pointAt(n.e, 1, n.s);
  const side = Math.sign((x - px) * tz - (z - pz) * tx) || 1, o = (E.w / 2 + 1.8) * side;
  return { x: px + tz * o, z: pz - tx * o };
}
function roadSpot(x, z) {
  const n = World.nearestEdge(x, z, 150, (E) => E.car);
  if (!n) return { x, z };
  const [px, pz] = World.pointAt(n.e, 1, n.s);
  return { x: px, z: pz };
}

function definePois() {
  const P = World.pois;
  const at = (lat, lon, road) => { const [x, z] = ll(lat, lon); return road ? roadSpot(x, z) : kerbSpot(x, z); };
  P.hospital = at(-27.4483, 153.0283);
  const hq = Decor.one('Queensland Police Headquarters');
  P.police = hq ? kerbSpot(...polyCenter(hq.pts)) : at(-27.4655, 153.0180);
  P.southbank = at(-27.4772, 153.0225);
  P.gabba = at(-27.48455, 153.0378, true);
  P.xxxx = at(-27.4672, 153.0052, true);
  P.kpcliffs = at(-27.4772, 153.0342);
  P.lookout = at(-27.4790, 153.0339, true);
  P.mall = at(-27.4697, 153.0230, true);
  P.valley = at(-27.4568, 153.0349, true);
  P.springhill = at(-27.4622, 153.0218);
  P.gardens = at(-27.4745, 153.0293);
  P.eagle = at(-27.4683, 153.0300);
  P.milton = at(-27.4697, 153.0040);
}

function placePickups() {
  const add = (t, lat, lon, o = {}) => { const [x0, z0] = ll(lat, lon); const { x, z } = kerbSpot(x0, z0); Pickups.add(t, x, z, Object.assign({ respawn: 90 }, o)); };
  const P = World.pois;
  Pickups.add('health', P.hospital.x, P.hospital.z, { respawn: 60 });
  Pickups.add('armor', P.police.x, P.police.z, { respawn: 90 });
  add('health', -27.4790, 153.0230); add('health', -27.4860, 153.0360); add('health', -27.4820, 153.0090);
  add('health', -27.4690, 153.0490); add('health', -27.4590, 153.0010); add('health', -27.4560, 153.0350);
  add('armor', -27.4570, 153.0340); add('armor', -27.4470, 153.0440);
  add('pistol', -27.4840, 153.0110, { amount: 48 }); add('pistol', -27.4610, 153.0230, { amount: 48 }); add('pistol', -27.4780, 153.0370, { amount: 48 });
  add('smg', -27.4460, 153.0450, { amount: 150 }); add('smg', -27.4440, 153.0360, { amount: 150 });
  Pickups.add('bat', P.gabba.x + 3, P.gabba.z + 3, { respawn: 60 });
  Pickups.add('bat', P.southbank.x + 4, P.southbank.z + 2, { respawn: 60 });
  for (const [lat, lon] of [[-27.4700, 153.0260], [-27.4640, 153.0200], [-27.4590, 153.0330], [-27.4800, 153.0170], [-27.4900, 153.0300], [-27.4650, 153.0460], [-27.4520, 153.0080], [-27.4750, 153.0050], [-27.4880, 153.0450], [-27.4560, 153.0440], [-27.4930, 153.0150], [-27.4470, 153.0280]])
    add('cash', lat, lon, { amount: randi(80, 400), respawn: 150 });
}

// ---------- Game flow ----------
G.endScreen = function (title, sub, cb) {
  G.state = 'dead';
  G.slowmo = 1;
  setTimeout(() => HUD.big(title, sub, title === 'WASTED' ? '#e04040' : '#5aa0ff', 3.2), 600);
  setTimeout(() => { cb(); G.state = 'play'; G.slowmo = 0; }, 4200);
};

function startGame() {
  Sound.init(); Sound.resume();
  $('title').style.display = 'none';
  $('hud').style.display = 'block';
  document.body.classList.add('playing');
  G.state = 'play';
  const c = G.renderer.domElement;
  if (!G.mobile) try { if (c.requestPointerLock) c.requestPointerLock(); } catch (e) { /* sandboxed iframe: drag to look */ }
  HUD.radioName(STATIONS[Sound.station]);
  HUD.message(G.mobile ? 'Welcome to ~Brisvegas~. Walk into the yellow ~M~ marker to start a job.' : 'Welcome to ~Brisvegas~. Find the yellow ~M~ on your map to start a job. Press ~P~ for controls.', 6);
}

function update(dt) {
  G.t += dt;
  const t = G.t;
  if (G.state === 'play' || G.state === 'dead') {
    const sdt = G.state === 'dead' ? dt * 0.35 : dt;
    Player.update(sdt, t);
    if (Player.car) Player.lastCar = Player.car;
    for (const v of G.vehicles.slice()) v.update(sdt, t);
    collideVehicles();
    for (const p of G.peds.slice()) p.update(sdt, t);
    for (const b of G.birds.slice()) b.update(sdt, t);
    if (G.magpie) { G.magpie.update(sdt, t); if (G.magpie.removed) G.magpie = null; }
    if (G.heli) G.heli.update(sdt, t);
    Police.update(sdt);
    Missions.update(sdt, t);
    Pickups.update(sdt, t);
    Spawner.update(sdt);
    for (const a of World.anim) a.update(sdt, t);
    FX.update(sdt);
    Render.update(sdt);
    Detail.update(sdt, G.camera.position.x, G.camera.position.z);
    Signals.update(sdt, G.camera.position.x, G.camera.position.z);
    for (const c of G.clouds) { c.position.x += sdt * 4; if (c.position.x > Player.x + 3000) c.position.x -= 6000; }
  }
  if (G.state !== 'map' && G.state !== 'title') updateCamera(dt);
  if (G.state !== 'title') HUD.update(dt, t);
  let sirenLevel = 0;
  for (const v of G.vehicles) if (v.siren) sirenLevel = Math.max(sirenLevel, clamp(1 - Math.hypot(v.x - Player.x, v.z - Player.z) / 160, 0, 1));
  if (G.heli && !G.heli.dead) sirenLevel = Math.max(sirenLevel, 0.15);
  const pc = Player.car;
  Sound.update(dt, {
    engine: !!pc && G.state === 'play', speed: pc ? pc.fwd : 0, max: pc ? pc.spec.max : 1, throttle: pc && pc.input.throttle > 0,
    siren: G.state === 'play' ? sirenLevel : 0, radio: !!pc && G.state === 'play' && !(pc.spec.police && pc.siren),
  });
  Input.endFrame();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  Render.frame();
  requestAnimationFrame(loop);
}

function boot() {
  Render.init();
  const t0 = performance.now();
  $('loading').textContent = 'Loading Brisbane map data...';
  fetch('data/brisbane.json')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((data) => {
      $('loading').textContent = 'Building Brisbane...';
      return new Promise((res) => setTimeout(() => res(data), 30));
    })
    .then((data) => {
      World.load(data);
      buildWorld(G.scene);
      definePois();
      FX.init(G.scene);
      const s = World.pois.southbank, ne = World.nearestEdge(s.x, s.z, 120, (E) => !E.walk);
      let sp = { x: s.x + 8, z: s.z + 8 };
      if (ne) { const E = World.edges[ne.e], [px, pz, tx, tz] = World.pointAt(ne.e, 1, Math.min(E.len, ne.s + 16)), o = E.w / 2 + 1.8; sp = { x: px + tz * o, z: pz - tx * o }; }
      Player.init(sp.x, sp.z);
      G.cam.yaw = 0;
      placePickups();
      Missions.init();
      HUD.init();
      Input.init(G.renderer.domElement);
      G.camera.position.set(Player.x, 3, Player.z + 6);
      G.camera.lookAt(Player.x, 1, Player.z);
      G.camera.updateMatrixWorld();
      for (let k = 0; k < 60; k++) { Spawner.t = 0; Spawner.update(0.2); }
      Render.update(0);
      Detail.update(0, Player.x, Player.z, true);
      updateCamera(0.016);
      console.log('World built in', Math.round(performance.now() - t0), 'ms');
      $('loading').style.display = 'none';
      $('start').style.display = 'inline-block';
      if (G.mobile) $('start').textContent = 'TAP TO PLAY';
      $('start').onclick = startGame;
      $('pause').onclick = () => { pause(false); try { G.renderer.domElement.requestPointerLock(); } catch (e) { /* ignore */ } };
      requestAnimationFrame(loop);
    })
    .catch((e) => { console.error(e); $('loading').textContent = "Couldn't load the Brisbane map data (" + e.message + '). Serve this folder over http and reload.'; });
}

window.addEventListener('load', () => setTimeout(boot, 30));
