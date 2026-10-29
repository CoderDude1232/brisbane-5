'use strict';
// DOM HUD + minimap + pause map.

const $ = (id) => document.getElementById(id);
const fmtText = (s) => s.replace(/~([^~]+)~/g, '<b>$1</b>');

const HUD = {
  init() {
    this.mm = $('minimap'); this.mmx = this.mm.getContext('2d');
    this.big_ = $('big'); this.msg = $('msg'); this.obj = $('obj');
    this.areaEl = $('area'); this.vehEl = $('veh'); this.radioEl = $('radio');
    this.flashEl = $('flash'); this.timerEl = $('timer');
    this.msgT = 0; this.flashT = 0; this.areaT = 0; this.vehT = 0; this.radioT = 0; this.bigT = 0;
    this.lastArea = '';
    this.routeT = 0; this.route = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.mm.width = 220 * dpr; this.mm.height = 220 * dpr;
    this.dpr = dpr;
  },
  message(s, dur = 4) { this.msg.innerHTML = fmtText(s); this.msg.style.opacity = 1; this.msgT = dur; },
  objective(s) { const h = fmtText(s); if (this.obj.innerHTML !== h) this.obj.innerHTML = h; this.obj.style.opacity = 1; },
  flashText(s) { this.flashEl.textContent = s; this.flashEl.style.opacity = 1; this.flashT = 1.6; },
  vehicleName(n) { this.vehEl.textContent = n; this.vehEl.style.opacity = 1; this.vehT = 3; },
  radioName(st) {
    this.radioEl.innerHTML = st.name + (st.tag ? `<small>${st.tag}</small>` : '');
    this.radioEl.style.opacity = 1; this.radioT = 3;
  },
  big(title, sub, color, dur) {
    this.big_.innerHTML = `<div style="color:${color}">${title}</div>` + (sub ? `<small>${sub}</small>` : '');
    this.big_.style.opacity = 1; this.bigT = dur;
  },
  timer(sec) {
    if (sec === null) { this.timerEl.style.display = 'none'; return; }
    this.timerEl.style.display = 'block';
    const s = Math.max(0, Math.ceil(sec));
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('low', s <= 15);
  },
  starsPulse() { const e = $('stars'); e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); },

  update(dt, t) {
    const P = Player;
    $('money').textContent = fmtMoney(P.money);
    const w = WEAPONS[P.weapon];
    $('weapon').innerHTML = w.name + (w.melee ? '' : ` <span>${P.ammo[P.weapon]}</span>`);
    let st = '';
    const flashing = G.wanted > 0 && !G.copsSeeing && Math.floor(t * 3) % 2;
    for (let k = 1; k <= 5; k++) st += `<i class="${k <= G.wanted ? (flashing ? 'on dim' : 'on') : ''}">★</i>`;
    $('stars').innerHTML = st;
    const hrs = Math.floor(G.timeOfDay) % 24, mins = Math.floor((G.timeOfDay % 1) * 60);
    $('clock').textContent = `${((hrs + 11) % 12) + 1}:${String(mins).padStart(2, '0')} ${hrs < 12 ? 'AM' : 'PM'}`;
    $('hp').style.width = clamp(P.health, 0, 100) + '%';
    $('hp').classList.toggle('low', P.health < 30);
    $('ar').style.width = clamp(P.armor, 0, 100) + '%';
    $('crosshair').style.display = !P.dead && !w.melee && G.state === 'play' ? 'block' : 'none';
    $('dmg').style.opacity = G.dmgFlash + (P.health < 25 && !P.dead ? 0.25 + Math.sin(t * 6) * 0.1 : 0);
    G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.2);

    const fade = (el, key) => { if (this[key] > 0) { this[key] -= dt; if (this[key] <= 0) el.style.opacity = 0; } };
    fade(this.msg, 'msgT'); fade(this.flashEl, 'flashT'); fade(this.areaEl, 'areaT'); fade(this.vehEl, 'vehT'); fade(this.radioEl, 'radioT'); fade(this.big_, 'bigT');
    if (!Missions.active) this.obj.style.opacity = 0;

    const sub = World.suburbAt(P.x, P.z)[0];
    const br = World.onBridge(P.x, P.z);
    let lm = null;
    for (const l of World.labels) if (Math.abs(l.x - P.x) < l.r && Math.abs(l.z - P.z) < l.r && Math.hypot(l.x - P.x, l.z - P.z) < l.r) { lm = l.name; break; }
    const area = br && World.isWater(P.x, P.z) ? br.name : lm || sub;
    if (area !== this.lastArea) { this.lastArea = area; this.areaEl.textContent = area; this.areaEl.style.opacity = 1; this.areaT = 3.5; }
    const stName = World.streetAt(P.x, P.z);
    const line = [stName, lm || (br && World.isWater(P.x, P.z)) ? sub : null].filter(Boolean).join('  |  ') || sub;
    if (line !== this.lastStreet) { this.lastStreet = line; $('street').textContent = line; }
    this.drawMinimap(t, dt);
  },

  blips(t) {
    const out = [];
    const tg = Missions.target;
    if (tg) out.push({ x: tg.x, z: tg.z, c: '#ffd23a', s: 6, edge: true, route: true });
    if (!Missions.active && Missions.defs[Missions.idx]) { const g = Missions.defs[Missions.idx].giver; out.push({ x: g.x, z: g.z, c: '#ffd23a', s: 7, label: 'M', edge: true }); }
    for (const e of Missions.enemies) if (!e.dead) out.push({ x: e.x, z: e.z, c: '#e03030', s: 3.5 });
    const fl = Math.floor(t * 4) % 2;
    for (const v of G.vehicles) if (v.spec.police && v.siren) out.push({ x: v.x, z: v.z, c: fl ? '#e03030' : '#3060ff', s: 4, edge: true });
    for (const p of G.peds) if (p.kind === 'cop' && !p.dead && p.state === 'attack') out.push({ x: p.x, z: p.z, c: fl ? '#e03030' : '#3060ff', s: 3 });
    if (G.heli && !G.heli.dead) out.push({ x: G.heli.x, z: G.heli.z, c: fl ? '#e03030' : '#3060ff', s: 5, edge: true });
    for (const p of Pickups.list) if (p.active && !p.temp) out.push({ x: p.x, z: p.z, c: PICKUP_DEFS[p.type].color, s: 2.5 });
    return out;
  },

  drawMinimap(t, dt) {
    const g = this.mmx, dpr = this.dpr, S = 220 * dpr, R = S / 2;
    const P = Player, yaw = G.cam.yaw;
    const sp = P.car ? P.car.speed : 0;
    this.zoom = lerp(this.zoom || 1.1, (sp > 20 ? 0.7 : 1.1) * dpr * 0.85, 1 - Math.exp(-dt * 2));
    const Z = this.zoom;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.clip();
    g.fillStyle = '#26301f'; g.fillRect(0, 0, S, S);
    g.translate(R, R + R * 0.2);
    g.rotate(yaw);
    g.scale(Z, Z);
    g.translate(-P.x, -P.z);
    const span = (R * 1.6) / Z;
    g.imageSmoothingEnabled = false;
    const sx = clamp(P.x - span + HALF, 0, 2 * HALF), sz = clamp(P.z - span + HALF, 0, 2 * HALF);
    const sw = Math.min(span * 2, 2 * HALF - sx), sh = Math.min(span * 2, 2 * HALF - sz);
    if (sw > 0 && sh > 0) g.drawImage(World.mapCanvas, sx, sz, sw, sh, sx - HALF, sz - HALF, sw, sh);
    // GPS route
    this.routeT -= dt;
    const tg = Missions.target;
    if (tg && this.routeT <= 0) {
      this.routeT = 0.5;
      const path = World.path(World.nearestNode(P.x, P.z), World.nearestNode(tg.x, tg.z));
      this.route = path ? [[P.x, P.z]].concat(path.map((n) => [lineC(n[0]), lineC(n[1])]), [[tg.x, tg.z]]) : null;
    }
    if (tg && this.route) {
      g.strokeStyle = '#b452ff'; g.lineWidth = 6 / Z * dpr; g.lineJoin = 'round';
      g.beginPath(); this.route.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    }
    g.restore();
    // Blips in screen space
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const toScreen = (x, z) => { const dx = (x - P.x) * Z, dz = (z - P.z) * Z; return [dx * cy - dz * sy, dx * sy + dz * cy + R * 0.2]; };
    g.save(); g.translate(R, R);
    for (const b of this.blips(t)) {
      let [x, y] = toScreen(b.x, b.z);
      const l = Math.hypot(x, y);
      if (l > R - 10) { if (!b.edge) continue; x *= (R - 10) / l; y *= (R - 10) / l; }
      g.fillStyle = b.c; g.strokeStyle = '#000'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(x, y, b.s * dpr, 0, TAU); g.fill(); g.stroke();
      if (b.label) { g.fillStyle = '#000'; g.font = `bold ${9 * dpr}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.label, x, y + 0.5); }
    }
    // Landmark names, kept upright
    g.font = `600 ${9.5 * dpr}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of World.labels) {
      if (l.name.startsWith('CityCat')) continue;
      const [x, y] = toScreen(l.x, l.z);
      if (Math.hypot(x, y) > R - 22) continue;
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillText(l.name, x + dpr, y + dpr);
      g.fillStyle = '#ffe9a6'; g.fillText(l.name, x, y);
    }
    // Player arrow
    const h = P.car ? P.car.h : P.h;
    g.translate(0, R * 0.2);
    g.rotate(yaw - h + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(0, -8 * dpr); g.lineTo(6 * dpr, 7 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-6 * dpr, 7 * dpr); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // North marker
    const [nx, ny] = (() => { const a = yaw; return [-Math.sin(-a) * (R - 12), -Math.cos(-a) * (R - 12)]; })();
    g.fillStyle = '#fff'; g.font = `bold ${11 * dpr}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', R + nx, R + ny);
    // Wanted ring
    if (G.wanted > 0) {
      g.strokeStyle = Math.floor(t * 4) % 2 ? 'rgba(224,48,48,0.9)' : 'rgba(48,96,255,0.9)';
      g.lineWidth = 4 * dpr; g.beginPath(); g.arc(R, R, R - 3, 0, TAU); g.stroke();
    }
  },

  drawBigMap() {
    const c = $('bigmap'), g = c.getContext('2d');
    const W = (c.width = innerWidth), H = (c.height = innerHeight);
    g.fillStyle = 'rgba(10,14,12,0.94)'; g.fillRect(0, 0, W, H);
    const S = Math.min(W, H) * 0.92, ox = (W - S) / 2, oy = (H - S) / 2, k = S / (2 * HALF);
    g.drawImage(World.mapCanvas, ox, oy, S, S);
    g.strokeStyle = '#ccc'; g.strokeRect(ox, oy, S, S);
    const at = (x, z) => [ox + (x + HALF) * k, oy + (z + HALF) * k];
    g.font = 'bold 12px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
    const labels = [['CBD', -50, -20], ['SOUTH BANK', -60, 320], ['FORTITUDE VALLEY', 210, -400], ['KANGAROO POINT', 255, -60], ['NEW FARM', 470, -90],
      ['WEST END', -280, 380], ['WOOLLOONGABBA', 260, 220], ['MILTON', -440, 0], ['PADDINGTON', -420, -300], ['MT COOT-THA', MT.x, MT.z], ['TOOWONG', -720, -60],
      ['SPRING HILL', -110, -330], ['NEWSTEAD', 420, -560], ['HERSTON', -120, -640], ['BULIMBA', 820, -60], ['ST LUCIA', -700, 360], ['EAST BRISBANE', 480, 280]];
    for (const [n, x, z] of labels) { const [a, b] = at(x, z); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(n, a + 1, b + 1); g.fillStyle = '#f2f2f2'; g.fillText(n, a, b); }
    g.font = '600 10px "Barlow Condensed", sans-serif';
    for (const l of World.labels) {
      if (l.name.startsWith('CityCat')) continue;
      const [a, b] = at(l.x, l.z);
      g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(a, b, 2.2, 0, TAU); g.fill();
      if (S > 700) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(l.name, a + 1, b - 4); g.fillStyle = '#ffe9a6'; g.fillText(l.name, a, b - 5); }
    }
    const t = G.t;
    for (const b of this.blips(t)) {
      const [x, y] = at(b.x, b.z);
      g.fillStyle = b.c; g.strokeStyle = '#000'; g.beginPath(); g.arc(x, y, b.s + 1, 0, TAU); g.fill(); g.stroke();
      if (b.label) { g.fillStyle = '#000'; g.font = 'bold 10px sans-serif'; g.fillText(b.label, x, y + 4); }
    }
    const [px, py] = at(Player.x, Player.z);
    g.save(); g.translate(px, py); g.rotate(-(Player.car ? Player.car.h : Player.h) + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#ffd23a'; g.font = 'bold 22px "Anton", Impact, sans-serif'; g.textAlign = 'left';
    g.fillText('BRISVEGAS', ox + 14, oy + 32);
    g.font = '13px "Barlow Condensed", sans-serif'; g.fillStyle = '#ddd';
    g.fillText('M: close map  ·  yellow M = mission  ·  purple = GPS route', ox + 14, oy + 52);
  },
};
