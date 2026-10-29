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

// ---------- Rendering setup ----------
function initRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  G.mobile = matchMedia('(pointer: coarse)').matches;
  r.setPixelRatio(Math.min(devicePixelRatio, G.mobile ? 1 : 1.5));
  r.setSize(innerWidth, innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(r.domElement);
  G.renderer = r;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, G.mobile ? 700 : 1600);
  G.scene.fog = G.mobile ? new THREE.Fog(0x9cc8f0, 140, 520) : new THREE.Fog(0x9cc8f0, 220, 800);
  G.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6a3a, 0.55);
  G.scene.add(G.hemi);
  G.sun = new THREE.DirectionalLight(0xfff1d6, 1.0);
  G.sun.castShadow = true;
  G.sun.shadow.mapSize.set(G.mobile ? 1024 : 2048, G.mobile ? 1024 : 2048);
  const sc = G.sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 600;
  G.sun.shadow.bias = -0.0006;
  G.scene.add(G.sun); G.scene.add(G.sun.target);
  G.amb = new THREE.AmbientLight(0xffffff, 0.15);
  G.scene.add(G.amb);
  // Clouds
  G.clouds = [];
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let k = 0; k < 28; k++) {
    const c = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cm);
      p.scale.set(rand(18, 34), rand(7, 12), rand(14, 24));
      p.position.set(rand(-30, 30), rand(-3, 3), rand(-15, 15));
      c.add(p);
    }
    c.position.set(rand(-1200, 1200), rand(180, 260), rand(-1200, 1200));
    G.scene.add(c); G.clouds.push(c);
  }
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  G.sunDisc = sunDisc; G.scene.add(sunDisc);
  addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
  });
}

const SKY = [
  [0, '#070b1f'], [4.8, '#0d1430'], [5.8, '#e89a6a'], [7, '#9cc8f0'], [12, '#86bdf2'], [16.3, '#9cc8f0'],
  [17.6, '#f39256'], [18.4, '#a8517a'], [19.3, '#1a1a40'], [24, '#070b1f'],
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function skyAt(h) {
  for (let k = 0; k < SKY.length - 1; k++) {
    if (h >= SKY[k][0] && h <= SKY[k + 1][0]) {
      const u = (h - SKY[k][0]) / (SKY[k + 1][0] - SKY[k][0]);
      return _c1.set(SKY[k][1]).lerp(_c2.set(SKY[k + 1][1]), u);
    }
  }
  return _c1.set(SKY[0][1]);
}

function updateDayNight(dt) {
  G.timeOfDay = (G.timeOfDay + dt / 40) % 24;
  const h = G.timeOfDay;
  const elev = Math.sin(((h - 6) / 12) * Math.PI);
  const day = clamp(elev * 3 + 0.3, 0, 1);
  G.night = 1 - clamp(elev * 4 + 0.6, 0, 1);
  const sky = skyAt(h);
  G.scene.background = sky.clone();
  G.scene.fog.color.copy(sky);
  const az = ((h - 6) / 12) * Math.PI;
  const px = Player.x, pz = Player.z;
  const sx = Math.cos(az), sy = Math.max(Math.sin(az), 0.15), sz = 0.35;
  G.sun.position.set(px + sx * 250, sy * 250, pz + sz * 250);
  G.sun.target.position.set(px, 0, pz);
  G.sun.intensity = 0.15 + day * 0.95;
  G.sun.color.set(elev < 0.25 ? '#ffb27a' : '#fff1d6');
  if (elev < 0) { G.sun.color.set('#8aa0d8'); G.sun.intensity = 0.18; G.sun.position.set(px - sx * 250, 200, pz - 150); }
  G.hemi.intensity = 0.25 + day * 0.4;
  G.amb.intensity = 0.12 + (1 - day) * 0.08;
  const sd = G.camera.far * 0.8;
  G.sunDisc.position.set(G.camera.position.x + Math.cos(az) * sd, Math.sin(az) * sd - 60, G.camera.position.z + sz * sd);
  G.sunDisc.visible = elev > -0.05;
  for (const m of World.nightMats) m.emissiveIntensity = G.night * 0.85;
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
  randomEdge(minR, maxR) {
    const a = Math.random() * TAU, r = rand(minR, maxR);
    const n = World.nearestNode(Player.x + Math.sin(a) * r, Player.z + Math.cos(a) * r);
    if (!n) return null;
    const nb = World.neighbors(n[0], n[1]);
    if (!nb.length) return null;
    return [n, pick(nb)];
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
        if (!keep && (d > 460 || (d > 200 && (v.ai.lost || v.dead) && !this.visible(v.x, 1, v.z)))) v.remove();
      } else {
        if (!v.driver) parked++;
        const chasing = v.ai && v.ai.mode === 'police' && G.wanted > 0;
        if (!keep && !chasing && d > 380 && !this.visible(v.x, 1, v.z)) v.remove();
        else if (!keep && v.dead && v.wreckT < 0 && !this.visible(v.x, 1, v.z)) v.remove();
      }
    }
    if (traffic < (G.mobile ? 24 : 36)) {
      const e = this.randomEdge(130, 380);
      if (e) {
        const [a, b] = e;
        const ax = lineC(a[0]), az = lineC(a[1]), bx2 = lineC(b[0]), bz = lineC(b[1]);
        const dx = Math.sign(bx2 - ax), dz = Math.sign(bz - az);
        const u = rand(0.3, 0.7);
        const x = lerp(ax, bx2, u) + dz * LANE, z = lerp(az, bz, u) - dx * LANE;
        const d = Math.hypot(x - px, z - pz);
        const clear = G.vehicles.every((v) => Math.hypot(v.x - x, v.z - z) > 10);
        if (clear && d > 120 && !(d < 260 && this.visible(x, 1, z)) && !World.inRiver(x, z)) {
          const police = Math.random() < 0.05;
          const type = police ? 'police' : pick(TRAFFIC_MIX);
          const v = new Vehicle(type, x, z, Math.atan2(dx, dz), { driver: police ? 'cop' : 'civ', ai: { mode: 'traffic', a, b, stage: 0 } });
          v.vx = Math.sin(v.h) * v.cruise * 0.8; v.vz = Math.cos(v.h) * v.cruise * 0.8;
        }
      }
    }
    if (parked < 10) {
      const e = this.randomEdge(70, 260);
      if (e) {
        const [a, b] = e;
        const ax = lineC(a[0]), az = lineC(a[1]), bx2 = lineC(b[0]), bz = lineC(b[1]);
        const dx = Math.sign(bx2 - ax), dz = Math.sign(bz - az);
        const u = rand(0.3, 0.7);
        const x = lerp(ax, bx2, u) + dz * 5.6, z = lerp(az, bz, u) - dx * 5.6;
        const clear = G.vehicles.every((v) => Math.hypot(v.x - x, v.z - z) > 8);
        if (clear && World.edge(a[0], a[1], b[0], b[1]) === 1 && !this.visible(x, 1, z)) new Vehicle(pick(TRAFFIC_MIX.filter((t) => t !== 'bus')), x, z, Math.atan2(dx, dz));
      }
    }
    // Pedestrians
    let civs = 0;
    for (const p of G.peds.slice()) {
      if (p.mission) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (p.kind === 'civ' || (p.kind === 'cop' && G.wanted === 0)) civs++;
      if (d > 270 && !this.visible(p.x, 1, p.z)) p.remove();
    }
    const want = G.mobile ? 32 : 55;
    for (let k = 0; k < 3 && civs < want; k++) {
      const a = Math.random() * TAU, r = rand(50, 230);
      const n = World.nearestNode(px + Math.sin(a) * r, pz + Math.cos(a) * r);
      if (!n) continue;
      const x = lineC(n[0]) + pick([-9.5, 9.5]), z = lineC(n[1]) + pick([-9.5, 9.5]);
      if (World.inRiver(x, z) || (Math.hypot(x - px, z - pz) < 90 && this.visible(x, 1, z))) continue;
      new Ped(Math.random() < 0.06 ? 'cop' : 'civ', x, z);
      civs++;
    }
    // Bin chickens
    let ibis = 0;
    for (const b of G.birds.slice()) { if (Math.hypot(b.x - px, b.z - pz) > 220 && !b.thief) b.remove(); else ibis++; }
    if (ibis < 7) {
      const a = Math.random() * TAU, r = rand(40, 180);
      const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
      const blk = World.blockAt(x, z);
      if (blk && !blk.wet && ['park', 'cbd', 'southbank', 'mid'].includes(blk.zone) && !pointInBuilding(x, 1, z) && !World.isWater(x, z) && !this.visible(x, 0.5, z)) {
        new Ibis(x, z);
      }
    }
    // Magpie season
    const blk = World.blockAt(px, pz);
    if (!Player.car && !Player.dead && blk && ['suburb', 'park'].includes(blk.zone) && G.night < 0.5) {
      this.magT -= 0.2;
      if (this.magT <= 0 && !G.magpie) {
        G.magpie = new Magpie();
        this.magT = rand(35, 80);
        if (!this.warned) { this.warned = true; HUD.message("It's spring in Brisbane. ~Magpie season~. Mind your head!", 4); }
      }
    }
  },
};

function placePickups() {
  const corner = (x, z) => { const n = World.nearestNode(x, z); return n ? [lineC(n[0]) + 9.5, lineC(n[1]) + 9.5] : [x, z]; };
  const P = World.pois;
  const add = (t, x, z, o = {}) => { const [a, b] = corner(x, z); Pickups.add(t, a, b, Object.assign({ respawn: 90 }, o)); };
  add('health', P.hospital.x, P.hospital.z); add('health', -60, 360); add('health', 300, 240); add('health', -280, 380);
  add('health', 480, -60); add('health', -420, -300); add('health', -660, -40); add('health', 120, -640);
  add('armor', P.police.x, P.police.z); add('armor', 240, -460); add('armor', 650, -520);
  add('pistol', -300, 420, { amount: 48 }); add('pistol', -160, -360, { amount: 48 }); add('pistol', 400, -100, { amount: 48 });
  add('smg', 420, -560, { amount: 150 }); add('smg', 140, -620, { amount: 150 });
  add('bat', P.gabba.x + 20, P.gabba.z);
  Pickups.add('bat', P.southbank.x + 4, P.southbank.z + 2, { respawn: 60 });
  const cash = [[0, 0], [-200, -200], [300, -300], [-500, 200], [600, 400], [-800, 500], [200, 800], [700, -700], [-400, -700], [900, 100], [-900, -100], [100, 500]];
  for (const [x, z] of cash) add('cash', x, z, { amount: randi(80, 400), respawn: 150 });
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
    updateDayNight(sdt);
    for (const c of G.clouds) { c.position.x += sdt * 4; if (c.position.x > Player.x + 1300) c.position.x -= 2600; }
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
  G.renderer.render(G.scene, G.camera);
  requestAnimationFrame(loop);
}

function boot() {
  initRenderer();
  const t0 = performance.now();
  buildWorld(G.scene);
  FX.init(G.scene);
  const s = World.pois.southbank;
  Player.init(s.x - 4, s.z + 8);
  G.cam.yaw = 0;
  placePickups();
  Missions.init();
  HUD.init();
  Input.init(G.renderer.domElement);
  // Pre-populate so the city isn't empty on the first frame.
  G.camera.position.set(Player.x, 3, Player.z + 6);
  G.camera.lookAt(Player.x, 1, Player.z);
  G.camera.updateMatrixWorld();
  for (let k = 0; k < 60; k++) { Spawner.t = 0; Spawner.update(0.2); }
  updateDayNight(0);
  updateCamera(0.016);
  console.log('World built in', Math.round(performance.now() - t0), 'ms;', G.renderer.info.memory);
  $('loading').style.display = 'none';
  $('start').style.display = 'inline-block';
  if (G.mobile) $('start').textContent = 'TAP TO PLAY';
  $('start').onclick = startGame;
  $('pause').onclick = () => { pause(false); try { G.renderer.domElement.requestPointerLock(); } catch (e) { /* ignore */ } };
  requestAnimationFrame(loop);
}

window.addEventListener('load', () => setTimeout(boot, 30));
