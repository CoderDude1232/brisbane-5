'use strict';
// Procedural PBR textures: facades (albedo + roughness/metalness + normal + night lights),
// asphalt, ground detail, water ripples, foliage cards and contact-shadow decals.

const Tex = {
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  tex(c, srgb = true, repeat = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  },
  // Height canvas (grey) -> tangent-space normal map canvas.
  normalFrom(hc, strength) {
    const w = hc.width, h = hc.height;
    const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const out = this.canvas(w, h), og = out.getContext('2d'), od = og.createImageData(w, h);
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      od.data[i] = (-dx / l * 0.5 + 0.5) * 255; od.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; od.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; od.data[i + 3] = 255;
    }
    og.putImageData(od, 0, 0);
    return out;
  },
  noise(g, w, h, n, colors, a0, a1, s0, s1) {
    for (let k = 0; k < n; k++) { g.fillStyle = colors[k % colors.length]; g.globalAlpha = rand(a0, a1); const s = rand(s0, s1); g.fillRect(Math.random() * w, Math.random() * h, s, s); }
    g.globalAlpha = 1;
  },

  // kind: 'curtain' (glass curtain wall) or 'office' (punched windows in a solid wall)
  facade(kind) {
    const N = 512, C = 64, cells = N / C;
    const A = this.canvas(N, N), R = this.canvas(N, N), Hc = this.canvas(N, N), E = this.canvas(N, N);
    const a = A.getContext('2d'), r = R.getContext('2d'), hh = Hc.getContext('2d'), e = E.getContext('2d');
    const paint = (x, y, w, h, m) => {
      a.fillStyle = m.a; a.fillRect(x, y, w, h);
      r.fillStyle = `rgb(0,${Math.round(m.r * 255)},${Math.round(m.m * 255)})`; r.fillRect(x, y, w, h);
      const v = Math.round(m.h * 255); hh.fillStyle = `rgb(${v},${v},${v})`; hh.fillRect(x, y, w, h);
      e.fillStyle = m.e || '#000'; e.fillRect(x, y, w, h);
    };
    const lit = () => {
      if (Math.random() > (kind === 'curtain' ? 0.32 : 0.42)) return '#000';
      return pick(['#ffcf7a', '#ffe0a0', '#fff1d0', '#cfe4ff', '#ffd9a0', '#e8f0ff']);
    };
    if (kind === 'curtain') {
      paint(0, 0, N, N, { a: '#c3c8cc', r: 0.35, m: 0.9, h: 1 });
      for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
        const x = i * C, y = j * C;
        paint(x, y + C - 11, C, 11, { a: '#353c44', r: 0.3, m: 0.6, h: 0.75 }); // spandrel at the floor line
        const shade = rand(-12, 12), blinds = Math.random() < 0.18;
        const gl = blinds ? { a: '#8f9498', r: 0.4, m: 0.3, h: 0.45 } : { a: `rgb(${70 + shade},${80 + shade},${90 + shade})`, r: rand(0.04, 0.12), m: 0.85, h: 0.45 };
        gl.e = lit();
        paint(x + 3, y + 2, C - 6, C - 14, gl);
        paint(x + 3, y + 30, C - 6, 2, { a: '#9aa0a5', r: 0.35, m: 0.9, h: 0.8 }); // transom
        if (gl.e !== '#000') { e.globalAlpha = rand(0.3, 0.7); e.fillStyle = '#000'; e.fillRect(x + 3, y + 2, C - 6, rand(4, 20)); e.globalAlpha = 1; }
      }
    } else {
      paint(0, 0, N, N, { a: '#ece8e0', r: 0.88, m: 0, h: 1 });
      this.noise(a, N, N, 3000, ['#000', '#fff'], 0.02, 0.06, 1, 3);
      for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
        const x = i * C, y = j * C;
        paint(x, y + C - 3, C, 3, { a: '#d6d1c7', r: 0.9, m: 0, h: 0.92 }); // floor line
        paint(x + 10, y + 12, C - 20, 38, { a: '#3a3f44', r: 0.4, m: 0.6, h: 0.7 }); // frame
        const blinds = Math.random() < 0.25;
        paint(x + 13, y + 15, C - 26, 32, blinds ? { a: '#b8b4aa', r: 0.6, m: 0.1, h: 0.55, e: lit() } : { a: '#55616c', r: 0.06, m: 0.95, h: 0.55, e: lit() });
        paint(x + 31, y + 15, 2, 32, { a: '#3a3f44', r: 0.4, m: 0.6, h: 0.7 });
        paint(x + 8, y + 50, C - 16, 4, { a: '#f4f2ec', r: 0.8, m: 0, h: 1 }); // sill
      }
    }
    const nrm = this.normalFrom(Hc, kind === 'curtain' ? 2.5 : 4);
    return { map: this.tex(A), rm: this.tex(R, false), normal: this.tex(nrm, false), night: this.tex(E) };
  },

  road() {
    const W = 256, H = 512, c = this.canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#3c3e41'; g.fillRect(0, 0, W, H);
    this.noise(g, W, H, 9000, ['#000', '#fff', '#555'], 0.03, 0.09, 1, 2.5);
    for (const lx of [0.25, 0.75]) { // oil drip down the lane centre, lighter tyre wear either side
      const gr = g.createLinearGradient(lx * W - 30, 0, lx * W + 30, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.03)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(255,255,255,0.03)');
      g.fillStyle = gr; g.fillRect(lx * W - 30, 0, 60, H);
    }
    g.strokeStyle = 'rgba(20,20,20,0.5)'; g.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) { g.beginPath(); let x = rand(20, W - 20), y = rand(0, H); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += rand(-8, 8); y += rand(4, 14); g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = '#ecebe4'; g.fillRect(124, 0, 8, 236);
    g.fillStyle = '#dcdbd2'; g.fillRect(12, 0, 6, H); g.fillRect(238, 0, 6, H);
    return this.tex(c);
  },

  ground() {
    const S = 512, c = this.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 220; k++) { const s = rand(20, 90); g.globalAlpha = rand(0.03, 0.08); g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.beginPath(); g.arc(Math.random() * S, Math.random() * S, s, 0, TAU); g.fill(); }
    this.noise(g, S, S, 16000, ['#000', '#fff', '#888'], 0.04, 0.12, 1, 2);
    g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
    for (let k = 0; k < 1500; k++) { const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(3, 6)); g.stroke(); }
    g.globalAlpha = 1;
    return this.tex(c);
  },

  waterNormal() {
    const S = 256, hc = this.canvas(S, S), g = hc.getContext('2d'), d = g.createImageData(S, S);
    const waves = []; for (let k = 0; k < 9; k++) waves.push([randi(1, 6), randi(-6, 6), rand(0, TAU), rand(0.3, 1)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0; for (const [kx, ky, p, a] of waves) v += Math.sin(((kx * x + ky * y) / S) * TAU + p) * a;
      const c = 128 + v * 22, i = (y * S + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = c; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return this.tex(this.normalFrom(hc, 3), false);
  },

  // Left half: broadleaf canopy clump. Right half: palm frond.
  foliage() {
    const c = this.canvas(512, 256), g = c.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    for (let k = 0; k < 1700; k++) {
      const ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 118;
      const x = 128 + Math.cos(ang) * rr, y = 128 + Math.sin(ang) * rr * 0.9;
      const l = Math.round(rand(150, 255));
      g.fillStyle = `rgb(${l - 10},${l},${l - 20})`;
      g.save(); g.translate(x, y); g.rotate(Math.random() * TAU); g.beginPath(); g.ellipse(0, 0, rand(5, 9), rand(2.5, 4.5), 0, 0, TAU); g.fill(); g.restore();
    }
    g.save(); g.translate(384, 20);
    g.strokeStyle = '#d8d0b8'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, 110, 0, 230); g.stroke();
    for (let s = 6; s < 225; s += 5) {
      const len = 70 * Math.sin((s / 230) * Math.PI) + 10, cx = 10 * Math.sin((s / 230) * Math.PI);
      const l = Math.round(rand(170, 240)); g.strokeStyle = `rgb(${l - 15},${l},${l - 30})`; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, s); g.lineTo(cx - len, s + 18); g.stroke();
      g.beginPath(); g.moveTo(cx, s); g.lineTo(cx + len, s + 18); g.stroke();
    }
    g.restore();
    const t = this.tex(c, true, false);
    return t;
  },

  contactShadow() {
    const S = 128, c = this.canvas(S, S), g = c.getContext('2d'), d = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = Math.min(x, S - 1 - x) / (S * 0.16), v = Math.min(y, S - 1 - y) / (S * 0.16);
      const a = smoothstep(clamp(Math.min(u, v), 0, 1));
      const i = (y * S + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; d.data[i + 3] = a * 255;
    }
    g.putImageData(d, 0, 0);
    return this.tex(c, false, false);
  },
};

// Material factory: physically based on capable devices, cheap Lambert on phones.
const STD_ONLY = ['roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'normalMap', 'normalScale', 'envMapIntensity'];
function mkMat(p) {
  if (G.hq) return new THREE.MeshStandardMaterial(p);
  const q = {};
  for (const k in p) if (!STD_ONLY.includes(k)) q[k] = p[k];
  return new THREE.MeshLambertMaterial(q);
}
