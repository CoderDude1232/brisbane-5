'use strict';
// Everything is synthesised with WebAudio: engine, guns, sirens and three radio stations.

const STATIONS = [
  { name: 'RADIO OFF' },
  { name: 'BOGAN FM 97.3', tag: 'Pub rock, all arvo, every arvo', bpm: 138, style: 'rock', root: 82.41 },
  { name: 'RADIO BRISVEGAS 104.5', tag: 'Hits from the Sunshine State', bpm: 118, style: 'pop', root: 130.81 },
  { name: 'SUNNY COAST CHILL 88.9', tag: 'Smooth vibes for the Bruce Hwy', bpm: 84, style: 'chill', root: 110.0 },
];

const Sound = {
  ctx: null,
  station: 1,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.eng1.connect(lp); this.eng2.connect(g2); g2.connect(lp); lp.connect(this.engGain); this.engGain.connect(this.master);
    this.eng1.start(); this.eng2.start();

    // Siren
    this.sirGain = ctx.createGain(); this.sirGain.gain.value = 0;
    this.sir = ctx.createOscillator(); this.sir.type = 'square';
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
    this.sir.connect(sf); sf.connect(this.sirGain); this.sirGain.connect(this.master); this.sir.start();

    // Radio bus
    this.radioGain = ctx.createGain(); this.radioGain.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 5000;
    this.radioIn = ctx.createGain(); this.radioIn.gain.value = 0.5;
    this.radioIn.connect(rf); rf.connect(this.radioGain); this.radioGain.connect(this.master);
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 4); }
    this.dist.curve = curve; this.dist.connect(this.radioIn);
    this.step = 0; this.nextT = ctx.currentTime + 0.1;
    setInterval(() => this._sched(), 40);
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },

  _vol(dist) { return dist === undefined ? 1 : Math.pow(clamp(1 - dist / 260, 0, 1), 2); },
  _noise(t, dur, vol, type, freq, q = 1, dest) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  },
  _tone(t, freq, dur, vol, type, dest, endFreq) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  },

  shot(dist, heavy) {
    if (!this.ctx) return; const v = this._vol(dist); if (v < 0.01) return;
    const t = this.ctx.currentTime;
    this._noise(t, heavy ? 0.12 : 0.22, 0.9 * v, 'bandpass', heavy ? 1400 : 900, 0.8);
    this._tone(t, 160, 0.1, 0.6 * v, 'square', null, 50);
  },
  explosion(dist) {
    if (!this.ctx) return; const v = this._vol(dist); if (v < 0.01) return;
    const t = this.ctx.currentTime;
    this._noise(t, 1.6, 1.2 * v, 'lowpass', 500, 0.7);
    this._tone(t, 90, 0.8, 0.9 * v, 'sine', null, 30);
  },
  crash(intensity, dist) {
    if (!this.ctx) return; const v = this._vol(dist) * clamp(intensity, 0.1, 1); if (v < 0.01) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.3, 0.8 * v, 'bandpass', 600, 0.6);
    this._noise(t, 0.15, 0.4 * v, 'highpass', 3000, 0.5);
  },
  punch() { if (!this.ctx) return; this._noise(this.ctx.currentTime, 0.1, 0.5, 'lowpass', 800); },
  horn() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._tone(t, 392, 0.35, 0.18, 'square'); this._tone(t, 494, 0.35, 0.14, 'square');
  },
  pickup() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._tone(t, 880, 0.12, 0.2, 'triangle'); this._tone(t + 0.08, 1320, 0.18, 0.2, 'triangle');
  },
  squawk(dist) {
    if (!this.ctx) return; const v = this._vol(dist); if (v < 0.02) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < 3; k++) this._tone(t + k * 0.09, 1500 + Math.random() * 600, 0.08, 0.15 * v, 'sawtooth', null, 900);
  },
  warble() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [1200, 1500, 1100, 1700, 1300].forEach((f, k) => this._tone(t + k * 0.07, f, 0.1, 0.12, 'sine', null, f * 1.3));
  },
  jingle(good) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const notes = good ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, k) => { this._tone(t + k * 0.16, f, 0.4, 0.22, 'triangle'); this._tone(t + k * 0.16, f / 2, 0.4, 0.12, 'square'); });
  },

  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (s.engine) {
      const sp = Math.abs(s.speed) / s.max;
      const gear = Math.min(4, Math.floor(sp * 5)), inG = sp * 5 - gear;
      const rpm = 0.25 + 0.75 * inG + (s.throttle ? 0.1 : 0);
      const f = 38 + rpm * 70 + gear * 6;
      this.eng1.frequency.setTargetAtTime(f, t, 0.05);
      this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.05 + (s.throttle ? 0.04 : 0), t, 0.1);
    } else this.engGain.gain.setTargetAtTime(0, t, 0.1);
    const yelp = (Math.sin(t * TAU * 1.6) + 1) / 2;
    this.sir.frequency.setTargetAtTime(650 + yelp * 650, t, 0.02);
    this.sirGain.gain.setTargetAtTime(0.05 * s.siren, t, 0.1);
    const want = s.radio && this.station > 0 ? 0.32 : 0;
    this.radioGain.gain.setTargetAtTime(want, t, 0.3);
  },

  // ---- Radio sequencer ----
  _sched() {
    if (!this.ctx) return;
    const st = STATIONS[this.station];
    if (!st || !st.bpm) { this.nextT = this.ctx.currentTime + 0.1; return; }
    const stepDur = 60 / st.bpm / 4;
    while (this.nextT < this.ctx.currentTime + 0.2) {
      if (this.radioGain.gain.value > 0.001) this._play(st, this.step, this.nextT, stepDur);
      this.nextT += stepDur;
      this.step++;
    }
  },
  _kick(t, v = 0.9) { this._tone(t, 150, 0.18, v, 'sine', this.radioIn, 40); },
  _snare(t, v = 0.5) { this._noise(t, 0.16, v, 'bandpass', 1800, 0.7, this.radioIn); this._tone(t, 200, 0.08, v * 0.4, 'triangle', this.radioIn); },
  _hat(t, v = 0.18) { this._noise(t, 0.04, v, 'highpass', 7000, 0.7, this.radioIn); },
  _play(st, step, t, sd) {
    const bar = Math.floor(step / 16) % 4, s = step % 16;
    const R = st.root, semi = (n) => R * Math.pow(2, n / 12);
    if (st.style === 'rock') {
      const prog = [0, 0, 3, 5][bar] + (Math.floor(step / 64) % 2 ? [0, 0, 7, 5][bar] - [0, 0, 3, 5][bar] : 0);
      if (s === 0 || s === 6 || s === 8 || s === 10) this._kick(t);
      if (s === 4 || s === 12) this._snare(t, 0.6);
      if (s % 2 === 0) this._hat(t);
      if (s % 2 === 0) this._tone(t, semi(prog), sd * 1.8, 0.35, 'sawtooth', this.radioIn);
      if (s === 0 || s === 8 || s === 14) {
        [0, 7, 12].forEach((n) => this._tone(t, semi(prog + n + 12), sd * (s === 14 ? 2 : 6), 0.12, 'sawtooth', this.dist));
      }
    } else if (st.style === 'pop') {
      const prog = [0, 7, 9, 5][bar], minor = bar === 2;
      if (s % 4 === 0) this._kick(t, 0.8);
      if (s === 4 || s === 12) this._snare(t, 0.45);
      if (s % 2 === 1) this._hat(t, 0.12);
      if ([0, 3, 6, 8, 11, 14].includes(s)) this._tone(t, semi(prog - 12), sd * 2, 0.4, 'square', this.radioIn);
      const chord = [0, minor ? 3 : 4, 7, 12];
      this._tone(t, semi(prog + 12 + chord[(s + bar) % 4]), sd * 1.5, 0.12, 'triangle', this.radioIn);
      if (s === 0) chord.slice(0, 3).forEach((n) => this._tone(t, semi(prog + n), sd * 14, 0.05, 'sawtooth', this.radioIn));
    } else {
      const prog = [0, 5, 3, 7][bar];
      if (s === 0 || s === 10) this._kick(t, 0.6);
      if (s === 8) this._snare(t, 0.25);
      if (s % 4 === 2) this._hat(t, 0.1);
      if (s === 0) [0, 3, 7, 10, 14].forEach((n) => this._tone(t, semi(prog + n), sd * 15, 0.06, 'sine', this.radioIn));
      if (s === 0 || s === 7) this._tone(t, semi(prog - 12), sd * 5, 0.35, 'triangle', this.radioIn);
      if (Math.random() < 0.18) this._tone(t, semi(prog + 24 + pick([0, 3, 7, 10, 12])), sd * 3, 0.06, 'sine', this.radioIn);
    }
  },
};
