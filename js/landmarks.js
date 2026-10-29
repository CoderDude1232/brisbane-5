'use strict';
// Real Brisbane buildings, placed roughly where they stand in real life on our simplified grid.

const SAND = '#d9c08a', SAND2 = '#c9ab76', COPPER = '#6fa58f', SLATE = '#6f7a80', WHITE = '#f2f1ec', CONC = '#c8c2b4';

const Landmarks = {
  sites: {},

  reserve(K) {
    const s = this.sites;
    const c = (key, x, z) => { s[key] = World.claimOne(x, z); };
    // CBD
    c('skytower', -30, 90); c('oneWilliam', -210, 90); c('infinity', -150, -210); c('soleil', 30, -150);
    c('aurora', 30, -90); c('riparian', 90, -30); c('waterfront', 90, -150); c('q480', 90, -210);
    c('qwA', -150, 150); c('qwB', -90, 150); c('treasury', -150, -30); c('customs', 90, -90);
    c('brisSquare', -150, -90); c('anzac', -30, -150); c('central', -30, -210); c('stStephens', 30, -30);
    c('parliament', -30, 150); c('roma', -210, -210); c('police', -210, -150);
    // Inner suburbs
    c('windmill', -150, -270); c('storyHotel', 270, -150); c('chinatown', 210, -390); c('hsw', 210, -270);
    c('powerhouse', 510, -30); c('wool1', 510, -450); c('wool2', 570, -450); c('gasometer', 450, -510);
    c('rna', 150, -570); c('planetarium', -510, -390); c('convention', -30, 390);
    // South Bank strip (river side)
    for (const [k, x] of [['sb1', -150], ['sb2', -90], ['sb3', -30], ['sb4', 30], ['sb5', 90]]) c(k, x, 270);
    c('sb6', 90, 330);
    const near = (key, x, z) => {
      const bi = blockIdx(x), bj = blockIdx(z);
      for (let r = 0; r < 4; r++) for (let i = bi - r; i <= bi + r; i++) for (let j = bj - r; j <= bj + r; j++) {
        const b = World.block(i, j);
        if (b && !b.used && b.wet === 0 && b.zone !== 'mountain') { s[key] = World.claimOne(b.cx, b.cz); return; }
      }
    };
    near('uq', -690, 330); near('brekky', 690, -500); near('eatSt', 870, -300); near('indro', -930, 270);
    near('regatta', -630, 0); near('lonepine', -930, 450);
    World.labels = [];
    for (const [x, z] of [[30, 90], [-30, 30]]) { const b = World.blockAt(x, z); if (b && !b.used) b.zone = 'park'; }
    for (const [x, z] of [[30, 330], [-30, 330], [-90, 330]]) { const b = World.blockAt(x, z); if (b && !b.used) b.zone = 'southbank'; }
  },

  label(name, x, z, r = 32) { World.labels.push({ name, x, z, r }); },

  build(K) {
    const { G, R, P, PS, GR, NE, scene, rr, rp, tree } = K;
    const S = this.sites, L = this.label.bind(this);
    const plaza = (b, c = '#bdb6a6') => GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, c);
    const solid = (x, z, w, d, h, c = '#2a3038', minY = 0) => { addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, minY); World.fp.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, c]); };
    const colonnade = (x0, z0, x1, z1, y, h, n, r = 0.4, c = SAND) => { for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); PS.cyl(lerp(x0, x1, t), y, lerp(z0, z1, t), r, h, c, 8); } };
    const pyramid = (x, y, z, w, h, d, c) => P.add(CONE4, new THREE.Matrix4().makeTranslation(x, y + h / 2, z).multiply(new THREE.Matrix4().makeScale(w / 1.4142, h, d / 1.4142)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4)), c);
    const ringBeams = (x, y, z, r, n, t, c) => { for (let k = 0; k < n; k++) { const a = (k / n) * TAU, b = ((k + 1) / n) * TAU; P.beam(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r, t, c); } };
    const sign = (text, x, y, z, w, h, ry, bg, fg, font) => addSign(scene, signTexture(text, bg, fg, font || 'bold 64px Arial'), x, y, z, w, h, ry, true);
    const verandah = (x, z, w, d, y, c) => { // iron-lace verandah wrapping a building
      PS.box(x, y, z, w + 3, 0.25, d + 3, '#8a6f55');
      for (const s of [-1, 1]) {
        PS.box(x, y + 0.25, z + s * (d / 2 + 1.4), w + 3, 0.9, 0.1, c);
        PS.box(x + s * (w / 2 + 1.4), y + 0.25, z, 0.1, 0.9, d + 3, c);
        for (let k = 0; k <= 6; k++) { PS.box(x - w / 2 - 1.4 + (k / 6) * (w + 2.8), y, z + s * (d / 2 + 1.4), 0.15, 3.4, 0.15, c); PS.box(x + s * (w / 2 + 1.4), y, z - d / 2 - 1.4 + (k / 6) * (d + 2.8), 0.15, 3.4, 0.15, c); }
      }
    };

    // ===== CBD skyline =====
    { // Brisbane Skytower, 222 Margaret St — the tallest, with a rooftop sky pool
      const b = S.skytower; plaza(b);
      R.box(b.cx, 0, b.cz, 38, 14, 38, '#b8b4ac', 0, 26);
      G.box(b.cx, 14, b.cz, 26, 252, 20, '#8ea6bb', 0, 28);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) PS.box(b.cx + dx * 13.2, 14, b.cz + dz * 10.2, 1.4, 252, 1.4, '#eeeeec');
      for (let y = 44; y < 260; y += 36) P.box(b.cx, y, b.cz, 27, 0.8, 21, '#eeeeec');
      G.box(b.cx, 266, b.cz, 22, 8, 16, '#8ea6bb', 0, 28);
      P.box(b.cx, 274, b.cz, 23, 0.6, 17, WHITE); GR.quad(b.cx - 8, b.cz - 5, b.cx + 8, b.cz + 5, 274.7, '#3fc2df');
      NE.box(b.cx, 275, b.cz - 8.4, 22, 0.4, 0.4, '#bfe6ff'); NE.box(b.cx - 11, 278, b.cz, 0.8, 0.8, 0.8, '#ff2222');
      solid(b.cx, b.cz, 26, 20, 274); L('Brisbane Skytower', b.cx, b.cz);
    }
    { // 1 William Street — government tower with a sloping crown
      const b = S.oneWilliam; plaza(b);
      R.box(b.cx, 0, b.cz, 38, 10, 36, '#d8d4cc', 0, 26);
      PS.box(b.cx, 10, b.cz + 19, 38, 0.6, 6, WHITE);
      G.box(b.cx, 10, b.cz, 30, 214, 26, '#c9dceb', 0, 28);
      for (let y = 30; y < 224; y += 4.2) PS.box(b.cx, y, b.cz + 13.3, 30.4, 0.25, 0.8, '#e8ecef');
      G.shape(WEDGE, b.cx, 224, b.cz, 30, 36, 26, '#c9dceb', 0);
      NE.box(b.cx, 259, b.cz + 12, 0.8, 0.8, 0.8, '#ff2222');
      solid(b.cx, b.cz, 30, 26, 260); L('1 William Street', b.cx, b.cz);
    }
    { // Infinity Tower — glowing crown
      const b = S.infinity; plaza(b);
      R.box(b.cx, 0, b.cz, 36, 9, 36, '#c9c3b8', 0, 26);
      G.box(b.cx, 9, b.cz, 22, 222, 22, '#b0c4d4', 0, 28);
      G.box(b.cx, 231, b.cz, 16, 10, 16, '#b0c4d4', 0, 28);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) NE.box(b.cx + dx * 8.2, 231, b.cz + dz * 8.2, dx ? 0.3 : 12, 10, dz ? 0.3 : 12, '#62c8ff');
      PS.box(b.cx, 241, b.cz, 1, 18, 1, '#ddd'); NE.box(b.cx, 259, b.cz, 1, 1, 1, '#ff2222');
      solid(b.cx, b.cz, 22, 22, 241); L('Infinity Tower', b.cx, b.cz);
    }
    { // Soleil — slim residential with an open crown
      const b = S.soleil; plaza(b);
      G.box(b.cx, 0, b.cz, 19, 228, 19, '#a9c2d4', 0, 28);
      for (let y = 6.4; y < 226; y += 3.2) P.box(b.cx, y, b.cz, 21, 0.25, 21, WHITE);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(b.cx + dx * 9.5, 228, b.cz + dz * 9.5, 1, 14, 1, WHITE);
      ringBeams(b.cx, 241, b.cz, 13.4, 4, 0.8, WHITE);
      NE.box(b.cx, 238, b.cz, 18, 0.3, 18, '#fff2c8');
      solid(b.cx, b.cz, 19, 19, 242); L('Soleil', b.cx, b.cz);
    }
    { // Aurora — rounded residential tower with a lit lantern top
      const b = S.aurora; plaza(b);
      R.box(b.cx, 0, b.cz, 36, 10, 36, '#cfc8bb', 0, 26);
      G.cyl(b.cx, 10, b.cz, 13, 190, '#aac4d6', 24, 28);
      for (let y = 13.2; y < 200; y += 3.2) P.cyl(b.cx, y, b.cz, 13.8, 0.25, WHITE, 24);
      NE.cyl(b.cx, 200, b.cz, 10, 4, '#bfe6ff', 16);
      PS.cyl(b.cx, 204, b.cz, 0.5, 28, '#ddd', 6); NE.box(b.cx, 232, b.cz, 1, 1, 1, '#ff2222');
      solid(b.cx, b.cz, 26, 26, 206); L('Aurora Tower', b.cx, b.cz);
    }
    { // Riparian Plaza — split, angled top on the river at Eagle St
      const b = S.riparian; plaza(b, '#a9a49a');
      G.box(b.cx, 0, b.cz, 26, 176, 30, '#9cc0d8', 0, 28);
      G.shape(WEDGE, b.cx - 6.5, 176, b.cz, 13, 26, 30, '#9cc0d8', Math.PI / 2);
      G.shape(WEDGE, b.cx + 6.5, 176, b.cz, 13, 14, 30, '#9cc0d8', -Math.PI / 2);
      for (let y = 20; y < 176; y += 32) P.box(b.cx, y, b.cz, 26.6, 0.6, 30.6, WHITE);
      solid(b.cx, b.cz, 26, 30, 202); L('Riparian Plaza', b.cx, b.cz);
    }
    { // Waterfront Place — dark red granite with a stepped top
      const b = S.waterfront; plaza(b, '#a9a49a');
      R.box(b.cx, 0, b.cz, 32, 140, 30, '#7a524a', 0, 26);
      R.box(b.cx, 140, b.cz, 24, 12, 22, '#7a524a', 0, 26); R.box(b.cx, 152, b.cz, 16, 8, 14, '#7a524a', 0, 26);
      pyramid(b.cx, 160, b.cz, 16, 6, 14, '#5f413b');
      solid(b.cx, b.cz, 32, 30, 166); L('Waterfront Place', b.cx, b.cz);
    }
    { // 480 Queen St — diagrid exoskeleton
      const b = S.q480; plaza(b);
      G.box(b.cx, 0, b.cz, 30, 152, 26, '#d0dde6', 0, 28);
      const st = '#e9e9e6';
      for (let y = 0; y < 150; y += 25) for (let k = 0; k < 3; k++) {
        const x0 = b.cx - 15 + k * 10;
        P.beam(x0, y, b.cz + 13.4, x0 + 10, y + 25, b.cz + 13.4, 0.6, st); P.beam(x0 + 10, y, b.cz + 13.4, x0, y + 25, b.cz + 13.4, 0.6, st);
        P.beam(x0, y, b.cz - 13.4, x0 + 10, y + 25, b.cz - 13.4, 0.6, st); P.beam(x0 + 10, y, b.cz - 13.4, x0, y + 25, b.cz - 13.4, 0.6, st);
      }
      solid(b.cx, b.cz, 30, 26, 152); L('480 Queen St', b.cx, b.cz);
    }
    { // Queen's Wharf: three towers and the Sky Deck strung across the top
      const a = S.qwA, b = S.qwB; plaza(a, '#c9c1ad'); plaza(b, '#c9c1ad');
      R.box(a.cx, 0, a.cz, 36, 12, 30, '#d7c49a', 0, 26); R.box(b.cx, 0, b.cz, 36, 12, 30, '#d7c49a', 0, 26);
      G.box(a.cx - 6, 12, a.cz - 4, 18, 92, 18, '#e8d6a8', 0, 28);
      G.box(b.cx - 8, 12, b.cz - 4, 18, 100, 18, '#d6e6f5', 0, 28);
      G.box(b.cx + 10, 12, b.cz + 6, 14, 84, 14, '#cfe0ea', 0, 28);
      const x0 = a.cx - 18, x1 = b.cx + 18, dz = a.cz - 4;
      P.box((x0 + x1) / 2, 96, dz, x1 - x0, 4, 12, WHITE);
      G.box((x0 + x1) / 2, 100, dz, x1 - x0, 2.4, 11.6, '#9fc3d8', 0, 28);
      NE.box((x0 + x1) / 2, 95.8, dz, x1 - x0 - 2, 0.2, 10, '#ffd88a');
      NE.box((x0 + x1) / 2, 102.4, dz + 5.9, x1 - x0, 0.25, 0.25, '#ffe9b0');
      solid(a.cx - 6, a.cz - 4, 18, 18, 104); solid(b.cx - 8, b.cz - 4, 18, 18, 112); solid(b.cx + 10, b.cz + 6, 14, 14, 96);
      addCol(a.cx - 18, a.cx + 18, a.cz - 15, a.cz + 15, 12); addCol(b.cx - 18, b.cx + 18, b.cz - 15, b.cz + 15, 12);
      addCol(x0, x1, dz - 6, dz + 6, 102.4, 95.5);
      L("Queen's Wharf", (a.cx + b.cx) / 2, a.cz, 45);
      // Neville Bonner pedestrian bridge to South Bank
      const bx = (a.cx + b.cx) / 2;
      let z1 = a.cz + 20; while (!World.isWater(bx, z1) && z1 < a.cz + 60) z1 += 2;
      let z2 = z1; while (World.isWater(bx, z2) && z2 < z1 + 120) z2 += 2;
      P.box(bx, 5.5, (z1 + z2) / 2, 6, 0.8, z2 - z1 + 10, WHITE);
      P.beam(bx, 0, z1 + 10, bx, 40, z1 + 18, 1.4, WHITE);
      for (let k = 0; k < 6; k++) { P.beam(bx, 38 - k * 4, z1 + 17.6, bx - 3, 6.3, z1 - 4 + k * 3, 0.12, '#cfcfcf'); P.beam(bx, 38 - k * 4, z1 + 17.6, bx + 3, 6.3, z1 + 26 + k * 7, 0.12, '#cfcfcf'); }
      L('Neville Bonner Bridge', bx, (z1 + z2) / 2, 20);
    }
    { // Treasury Building — sandstone Italian Renaissance with double colonnades
      const b = S.treasury; plaza(b, '#cdbf9e');
      R.box(b.cx, 0, b.cz, 34, 19, 34, SAND, 0, 26);
      for (const y of [0.4, 9.6]) for (const s of [-1, 1]) {
        colonnade(b.cx - 17, b.cz + s * 18, b.cx + 17, b.cz + s * 18, y, 8.6, 10, 0.45);
        colonnade(b.cx + s * 18, b.cz - 17, b.cx + s * 18, b.cz + 17, y, 8.6, 10, 0.45);
      }
      P.box(b.cx, 9, b.cz, 37, 0.7, 37, SAND2); P.box(b.cx, 18.6, b.cz, 37.6, 1.2, 37.6, SAND2);
      P.box(b.cx, 19.8, b.cz, 32, 2, 32, '#8f969a');
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { P.box(b.cx + dx * 15, 19.8, b.cz + dz * 15, 5, 4, 5, SAND); P.add(DOME, M(b.cx + dx * 15, 23.8, b.cz + dz * 15, 2.4, 2.4, 2.4), COPPER); }
      solid(b.cx, b.cz, 36, 36, 24, '#7b6d50'); L('Treasury Building', b.cx, b.cz);
    }
    { // Customs House — copper dome facing the river
      const b = S.customs; plaza(b, '#9a9a8c');
      R.box(b.cx - 2, 0, b.cz, 28, 12, 24, SAND, 0, 26);
      colonnade(b.cx + 12.6, b.cz - 9, b.cx + 12.6, b.cz + 9, 0, 11, 7, 0.55);
      P.box(b.cx + 12.6, 11, b.cz, 2.4, 1, 20, SAND2); pyramid(b.cx + 12.6, 12, b.cz, 2.4, 3, 20, SAND2);
      P.box(b.cx - 2, 12, b.cz, 29, 0.8, 25, SAND2);
      P.cyl(b.cx - 2, 12.8, b.cz, 6.4, 4, SAND, 20);
      P.add(DOME, M(b.cx - 2, 16.8, b.cz, 6.6, 6, 6.6), COPPER);
      P.cyl(b.cx - 2, 22.6, b.cz, 1.3, 3, SAND, 10); P.add(DOME, M(b.cx - 2, 25.6, b.cz, 1.4, 1.6, 1.4), COPPER);
      solid(b.cx, b.cz, 32, 24, 26, '#6fa58f'); L('Customs House', b.cx, b.cz);
    }
    { // Brisbane Square — tower studded with coloured boxes
      const b = S.brisSquare; plaza(b);
      R.box(b.cx, 0, b.cz, 36, 12, 34, '#e4e2dc', 0, 26);
      G.box(b.cx, 12, b.cz, 28, 148, 26, '#e1e6ea', 0, 28);
      const cols = ['#d6332b', '#f1c40f', '#3a9e4a', '#2a6fc9', '#ef7d22', '#8a3fb8'];
      for (let k = 0; k < 22; k++) {
        const side = k % 4, y = rr(14, 150), sz = rr(4, 7), c = rp(cols), o = rr(-8, 8);
        if (side === 0) P.box(b.cx + o, y, b.cz + 13 + sz / 2 - 0.5, sz, sz, sz, c);
        else if (side === 1) P.box(b.cx + o, y, b.cz - 13 - sz / 2 + 0.5, sz, sz, sz, c);
        else if (side === 2) P.box(b.cx + 14 + sz / 2 - 0.5, y, b.cz + o, sz, sz, sz, c);
        else P.box(b.cx - 14 - sz / 2 + 0.5, y, b.cz + o, sz, sz, sz, c);
      }
      solid(b.cx, b.cz, 30, 28, 160); L('Brisbane Square', b.cx, b.cz);
    }
    { // Anzac Square + Shrine of Remembrance, with its bottle trees
      const b = S.anzac;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#5f9842');
      GR.quad(b.cx - 1.5, b.cz - 20, b.cx + 1.5, b.cz + 20, 0.02, '#d8cdb0'); GR.quad(b.cx - 20, b.cz - 1.5, b.cx + 20, b.cz + 1.5, 0.02, '#d8cdb0');
      P.box(b.cx, 0, b.cz, 14, 1, 14, SAND2); P.box(b.cx, 1, b.cz, 11, 1, 11, SAND); P.box(b.cx, 2, b.cz, 9, 1.5, 9, SAND2);
      for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; PS.cyl(b.cx + Math.cos(a) * 4, 3.5, b.cz + Math.sin(a) * 4, 0.32, 5, SAND, 8); }
      P.cyl(b.cx, 8.5, b.cz, 4.7, 1.1, SAND2, 18);
      NE.box(b.cx, 3.5, b.cz, 0.6, 0.9, 0.6, '#ff9a2a');
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12], [-15, 0], [15, 0]]) tree('bottle', b.cx + dx, b.cz + dz, 1.1);
      addCol(b.cx - 7, b.cx + 7, b.cz - 7, b.cz + 7, 9.6); World.fp.push([b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, '#3f6b38']);
      L('Anzac Square', b.cx, b.cz);
    }
    { // Central Station
      const b = S.central; plaza(b, '#a8a296');
      R.box(b.cx, 0, b.cz + 10, 36, 11, 14, SAND, 0, 26);
      P.box(b.cx, 0, b.cz + 13, 6, 24, 6, SAND); pyramid(b.cx, 24, b.cz + 13, 6.4, 5, 6.4, SLATE);
      NE.box(b.cx, 19, b.cz + 16.05, 3, 3, 0.1, '#fdf6dc');
      for (const z of [-3, -12]) { P.box(b.cx, 4.5, b.cz + z, 38, 0.3, 6, '#9aa2a8'); colonnade(b.cx - 17, b.cz + z, b.cx + 17, b.cz + z, 0, 4.5, 6, 0.15, '#666'); }
      solid(b.cx, b.cz + 10, 36, 14, 24, '#7b6d50'); L('Central Station', b.cx, b.cz);
    }
    { // St Stephen's Cathedral — white gothic with twin spires
      const b = S.stStephens; plaza(b, '#b9b7a8');
      const W2 = '#ecebe5', zc = b.cz - 2;
      P.box(b.cx, 0, zc, 12, 16, 30, W2);
      P.shape(GABLE, b.cx, 16, zc, 12.6, 6, 30.6, SLATE);
      P.box(b.cx, 0, zc - 4, 26, 13, 8, W2); P.shape(GABLE, b.cx, 13, zc - 4, 8.6, 5, 26.6, SLATE, Math.PI / 2);
      for (const dx of [-5.5, 5.5]) { P.box(b.cx + dx, 0, zc + 14, 3.6, 24, 3.6, W2); pyramid(b.cx + dx, 24, zc + 14, 3.8, 11, 3.8, SLATE); }
      NE.cyl(b.cx, 10, zc + 15.1, 2, 0.1, '#b48cff', 12);
      solid(b.cx, zc, 26, 32, 22, '#d8d6cc'); L("St Stephen's Cathedral", b.cx, b.cz);
    }
    { // Parliament House + Annexe, beside the City Botanic Gardens
      const b = S.parliament; plaza(b, '#c9c1ad');
      R.box(b.cx, 0, b.cz - 6, 36, 13, 16, SAND, 0, 26);
      colonnade(b.cx - 17, b.cz + 2.6, b.cx + 17, b.cz + 2.6, 0, 12, 12, 0.35);
      P.box(b.cx, 12.4, b.cz - 3, 38, 0.6, 22, SAND2);
      P.shape(WEDGE, b.cx, 13, b.cz - 6, 34, 4, 15, '#8f969a', Math.PI);
      for (const dx of [-15, 15]) { P.box(b.cx + dx, 0, b.cz - 6, 9, 15, 15, SAND); pyramid(b.cx + dx, 15, b.cz - 6, 9.4, 8, 15.4, '#7d878c'); }
      G.box(b.cx + 4, 0, b.cz - 15, 16, 70, 8, '#e8e6e0', 0, 28);
      for (let y = 6; y < 70; y += 3.2) PS.box(b.cx + 4, y, b.cz - 15, 17, 0.3, 9, WHITE);
      solid(b.cx, b.cz - 6, 38, 18, 23, '#7b6d50'); solid(b.cx + 4, b.cz - 15, 16, 8, 70);
      L('Parliament House', b.cx, b.cz);
      L('City Botanic Gardens', b.cx + 60, b.cz - 60);
    }
    { // Roma Street Station
      const b = S.roma; plaza(b, '#a8a296');
      R.box(b.cx - 10, 0, b.cz + 12, 18, 9, 10, SAND, 0, 26); pyramid(b.cx - 10, 9, b.cz + 12, 18.4, 3, 10.4, SLATE);
      for (const z of [-14, -4, 6]) { P.box(b.cx + 5, 0, b.cz + z, 26, 1, 4, '#9a968c'); P.box(b.cx + 5, 4.6, b.cz + z, 28, 0.35, 6, '#7f8a92'); colonnade(b.cx - 7, b.cz + z, b.cx + 17, b.cz + z, 1, 3.6, 5, 0.15, '#555'); }
      solid(b.cx - 10, b.cz + 12, 18, 10, 12, '#7b6d50'); L('Roma Street Station', b.cx, b.cz);
    }
    { // Police HQ, Roma St
      const b = S.police; plaza(b);
      R.box(b.cx, 0, b.cz - 4, 32, 26, 26, '#b8c4d0', 0, 26);
      P.box(b.cx, 6, b.cz + 9.05, 32, 1.4, 0.3, '#1c3f8f');
      solid(b.cx, b.cz - 4, 32, 26, 26, '#28407a');
      sign('QUEENSLAND POLICE', b.cx, 3.5, b.cz + 9.3, 18, 4.5, 0, '#1c3f8f', '#ffffff', 'bold 54px Arial');
      World.pois.police = { x: b.cx, z: b.cz + 16 };
      L('Police HQ', b.cx, b.cz);
    }

    // ===== Inner suburbs =====
    { // The Old Windmill, Wickham Park — Brisbane's oldest building
      const b = S.windmill;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#5f9842');
      P.cyl(b.cx, 0, b.cz, 3.8, 15, '#d8c8a0', 14, 0, 2.7);
      P.add(DOME, M(b.cx, 15, b.cz, 2.9, 2.2, 2.9), '#6b5a48');
      for (let k = 0; k < 4; k++) P.add(UNIT_BOX, M(b.cx, 13, b.cz + 3.4, 1.2, 12, 0.15, 0, 0, (k / 4) * Math.PI + 0.3), '#7a6a58');
      for (let k = 0; k < 6; k++) tree('fig', b.cx + rr(-17, 17), b.cz + rr(-17, 17), 0.8);
      addCol(b.cx - 3.8, b.cx + 3.8, b.cz - 3.8, b.cz + 3.8, 17); World.fp.push([b.cx - 4, b.cz - 4, b.cx + 4, b.cz + 4, '#a89870']);
      L('The Old Windmill', b.cx, b.cz);
    }
    { // Story Bridge Hotel, Kangaroo Point
      const b = S.storyHotel; plaza(b, '#8f8b82');
      P.box(b.cx, 0, b.cz, 22, 8, 14, '#f0e6cc');
      verandah(b.cx, b.cz, 22, 14, 4, '#2e5d4b');
      P.shape(GABLE, b.cx, 8, b.cz, 23, 3.5, 15, '#2e5d4b');
      sign('STORY BRIDGE HOTEL', b.cx, 9.5, b.cz + 8.6, 14, 2.6, 0, '#2e5d4b', '#ffe9b0', 'bold 48px Georgia, serif');
      solid(b.cx, b.cz, 25, 17, 11, '#6a5a40'); L('Story Bridge Hotel', b.cx, b.cz);
    }
    { // Howard Smith Wharves under the Story Bridge
      const b = S.hsw; let n = 0;
      for (let x = b.cx - 14; x <= b.cx + 14; x += 14) for (let z = b.cz - 14; z <= b.cz + 14; z += 14) {
        if (World.isWater(x - 6, z - 5) || World.isWater(x + 6, z + 5) || World.isWater(x + 6, z - 5) || World.isWater(x - 6, z + 5)) continue;
        GR.quad(x - 7, z - 6, x + 7, z + 6, 0.012, '#b59b74');
        P.box(x, 0, z, 11, 4, 8, rp(['#a0553a', '#8a6f55', '#d8d2c4']));
        P.shape(GABLE, x, 4, z, 12, 2.4, 9, '#6b5a48', Math.PI / 2);
        NE.box(x, 3.2, z + 4.1, 9, 0.2, 0.1, '#ffd88a');
        solid(x, z, 11, 8, 6.4, '#8a6f55'); n++;
      }
      if (n) L('Howard Smith Wharves', b.cx, b.cz);
    }
    { // Chinatown Mall, Fortitude Valley
      const b = S.chinatown;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#b2694f');
      for (const [ox, oz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) K.shopTop(b.cx + ox, b.cz + oz, 14, 14, Math.sign(ox), Math.sign(oz));
      for (const s of [-1, 1]) {
        const gx = b.cx + s * 19, red = '#b8231c';
        for (const dz of [-3.5, 3.5]) { P.box(gx, 0, b.cz + dz, 0.9, 6.5, 0.9, red); addCol(gx - 0.5, gx + 0.5, b.cz + dz - 0.5, b.cz + dz + 0.5, 6.5); }
        P.box(gx, 5.3, b.cz, 1, 0.8, 9, red);
        P.shape(GABLE, gx, 6.5, b.cz, 3, 1.6, 11, '#2e7d4f');
        NE.box(gx, 4.3, b.cz, 1.1, 0.8, 3.4, '#ffd23a');
      }
      for (let x = b.cx - 16; x <= b.cx + 16; x += 4) for (const z of [-2.5, 2.5]) NE.cyl(x, 5.2, b.cz + z, 0.35, 0.6, '#ff3a2a', 8);
      L('Chinatown Mall', b.cx, b.cz);
    }
    { // Brisbane Powerhouse, New Farm
      const b = S.powerhouse; plaza(b, '#8f8b82');
      R.box(b.cx - 4, 0, b.cz, 30, 18, 24, '#8a4030', 0, 26);
      R.box(b.cx + 12, 0, b.cz, 12, 26, 14, '#7c3a2c', 0, 26);
      P.shape(GABLE, b.cx - 4, 18, b.cz, 30.6, 4, 24.6, '#6b6f72', Math.PI / 2);
      for (let k = 0; k < 5; k++) P.box(b.cx - 16 + k * 6, rr(1, 6), b.cz + 12.1, rr(3, 5), rr(2, 4), 0.1, rp(['#ff4fa0', '#3ad1ff', '#ffe23a', '#7cff6a']));
      solid(b.cx, b.cz, 38, 24, 26, '#5a2a20'); L('Brisbane Powerhouse', b.cx, b.cz);
    }
    for (const key of ['wool1', 'wool2']) { // Teneriffe woolstores
      const b = S[key]; plaza(b, '#8f8b82');
      R.box(b.cx, 0, b.cz, 36, 18, 34, '#9a4a32', 0, 26);
      P.box(b.cx, 18, b.cz, 36.6, 1.6, 34.6, '#8a4030');
      for (let k = -1; k <= 1; k++) P.box(b.cx + k * 11, 0, b.cz + 17.1, 4, 5, 0.1, '#3b3f42');
      sign(key === 'wool1' ? 'WINCHCOMBE CARSON WOOLSTORE' : 'GOLDSBROUGH MORT & CO', b.cx, 14.5, b.cz + 17.2, 28, 3, 0, '#9a4a32', '#f4ecd8', 'bold 40px Georgia, serif');
      solid(b.cx, b.cz, 36, 34, 20, '#6a2a1a');
    }
    L('Teneriffe Woolstores', S.wool1.cx + 30, S.wool1.cz);
    { // Newstead gasometer frame
      const b = S.gasometer;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#6aa04a');
      const n = 16, r = 15, st = '#5a6870';
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU, x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r; P.box(x, 0, z, 0.9, 24, 0.9, st); addCol(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 24); }
      for (const y of [8, 16, 24]) ringBeams(b.cx, y, b.cz, r, n, 0.6, st);
      for (let k = 0; k < n; k += 2) { const a = (k / n) * TAU, c = ((k + 1) / n) * TAU; P.beam(b.cx + Math.cos(a) * r, 0, b.cz + Math.sin(a) * r, b.cx + Math.cos(c) * r, 8, b.cz + Math.sin(c) * r, 0.3, st); }
      World.fp.push([b.cx - 15, b.cz - 15, b.cx + 15, b.cz + 15, '#4a5a50']);
      L('Newstead Gasworks', b.cx, b.cz);
    }
    { // RNA Showgrounds — the Ekka
      const b = S.rna;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#8f8b82');
      GR.quad(b.cx - 15, b.cz - 6, b.cx + 15, b.cz + 14, 0.02, '#b8956a');
      R.box(b.cx, 0, b.cz - 14, 34, 9, 8, '#e8e4da', 0, 26); P.box(b.cx, 9, b.cz - 12, 36, 0.4, 12, '#7a1f3d');
      for (let k = 0; k < 5; k++) { const x = b.cx - 16 + k * 8; PS.cyl(x, 0, b.cz + 18, 1.6, 2, rp(['#d23', '#fff', '#e3c21b', '#2a6fc9']), 8); P.add(CONE4, M(x, 3, b.cz + 18, 2.2, 2, 2.2), rp(['#d23', '#fff', '#e3c21b'])); }
      solid(b.cx, b.cz - 14, 34, 8, 10, '#5a5550'); L('RNA Showgrounds (the Ekka)', b.cx, b.cz);
    }
    { // Mt Coot-tha Botanic Gardens: planetarium + tropical dome
      const b = S.planetarium;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#5f9842');
      P.cyl(b.cx - 8, 0, b.cz - 6, 8, 4, WHITE, 18); P.add(DOME, M(b.cx - 8, 4, b.cz - 6, 7.6, 6, 7.6), '#e6e6e2');
      P.add(new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2), M(b.cx + 9, 0, b.cz + 6, 9, 8, 9), '#bfd8de');
      GR.quad(b.cx - 2, b.cz + 10, b.cx + 6, b.cz + 18, 0.03, '#3a8fb0');
      addCol(b.cx - 16, b.cx, b.cz - 14, b.cz + 2, 10); addCol(b.cx + 1, b.cx + 17, b.cz - 2, b.cz + 14, 8);
      L('Mt Coot-tha Botanic Gardens', b.cx, b.cz);
    }
    { // Brisbane Convention & Exhibition Centre — the wavy roof
      const b = S.convention; plaza(b, '#a8a296');
      R.box(b.cx, 0, b.cz, 38, 10, 32, '#d8d4cc', 0, 26);
      for (let k = 0; k < 6; k++) P.shape(WEDGE, b.cx - 15.8 + k * 6.33, 10, b.cz, 6.33, 3.5, 32.6, WHITE, k % 2 ? Math.PI / 2 : -Math.PI / 2);
      solid(b.cx, b.cz, 38, 32, 13.5, '#cfcfca'); L('Convention Centre', b.cx, b.cz);
    }
    { // UQ St Lucia — the Great Court and Forgan Smith tower
      const b = S.uq;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#5f9842');
      for (const s of [-1, 1]) {
        R.box(b.cx, 0, b.cz + s * 16, 38, 10, 6, SAND, 0, 26); pyramid(b.cx, 10, b.cz + s * 16, 38.4, 2.4, 6.4, '#8c3b2e');
        R.box(b.cx + s * 16, 0, b.cz, 6, 10, 26, SAND, 0, 26); pyramid(b.cx + s * 16, 10, b.cz, 6.4, 2.4, 26.4, '#8c3b2e');
        addCol(b.cx - 19, b.cx + 19, b.cz + s * 16 - 3, b.cz + s * 16 + 3, 12); addCol(b.cx + s * 16 - 3, b.cx + s * 16 + 3, b.cz - 13, b.cz + 13, 12);
      }
      P.box(b.cx, 0, b.cz - 16, 7, 30, 7, SAND); pyramid(b.cx, 30, b.cz - 16, 7.4, 6, 7.4, '#8c3b2e');
      NE.box(b.cx, 25, b.cz - 12.45, 3, 3, 0.1, '#fdf6dc');
      for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) tree('jacaranda', b.cx + dx, b.cz + dz, 1.1);
      World.fp.push([b.cx - 19, b.cz - 19, b.cx + 19, b.cz + 19, '#a89870']);
      L('UQ St Lucia', b.cx, b.cz);
    }
    { // Regatta Hotel, Toowong
      const b = S.regatta; plaza(b, '#8f8b82');
      P.box(b.cx, 0, b.cz, 18, 11, 12, '#f6f2e6');
      verandah(b.cx, b.cz, 18, 12, 0.4, '#f6f2e6'); verandah(b.cx, b.cz, 18, 12, 4, '#f6f2e6'); verandah(b.cx, b.cz, 18, 12, 7.6, '#f6f2e6');
      P.shape(GABLE, b.cx, 11, b.cz, 19, 3, 13, '#4a4f52', Math.PI / 2);
      sign('REGATTA HOTEL', b.cx, 12.6, b.cz + 7.6, 10, 2, 0, '#7a1f3d', '#ffffff', 'bold 56px Georgia, serif');
      solid(b.cx, b.cz, 21, 15, 14, '#6a5a40'); L('Regatta Hotel', b.cx, b.cz);
    }
    { // Breakfast Creek Hotel
      const b = S.brekky; plaza(b, '#8f8b82');
      P.box(b.cx, 0, b.cz, 22, 11, 16, '#ead2b0');
      for (let k = -3; k <= 3; k++) for (const y of [2, 6.5]) PS.box(b.cx + k * 2.8, y, b.cz + 8.05, 1.4, 2.6, 0.1, '#3a2a20');
      P.box(b.cx + 9, 0, b.cz + 6, 5, 15, 5, '#ead2b0'); P.add(DOME, M(b.cx + 9, 15, b.cz + 6, 2.6, 3, 2.6), '#b5562f');
      P.box(b.cx, 11, b.cz, 23, 1.2, 17, '#d8b890');
      sign('BREAKFAST CREEK HOTEL', b.cx - 2, 9.6, b.cz + 8.2, 14, 1.8, 0, '#ead2b0', '#7a1f3d', 'bold 44px Georgia, serif');
      solid(b.cx, b.cz, 22, 16, 15, '#8a6a4a'); L('Breakfast Creek Hotel', b.cx, b.cz);
    }
    { // Eat Street Northshore — shipping-container markets
      const b = S.eatSt;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#7d7a72');
      const cols = ['#c8302a', '#2a6fc9', '#e3c21b', '#2e7d4f', '#ef7d22', '#7a1f3d', '#e8e8e8'];
      for (let x = -15; x <= 15; x += 7.5) for (const z of [-12, 0, 12]) {
        const st = rng01() < 0.4 ? 2 : 1;
        for (let k = 0; k < st; k++) P.box(b.cx + x, k * 2.6, b.cz + z, 6.1, 2.6, 2.44, rp(cols));
        addCol(b.cx + x - 3, b.cx + x + 3, b.cz + z - 1.3, b.cz + z + 1.3, st * 2.6);
      }
      for (let x = -18; x <= 18; x += 3) NE.box(b.cx + x, 6, b.cz - 6, 0.25, 0.25, 0.25, '#ffe9a0'), NE.box(b.cx + x, 6, b.cz + 6, 0.25, 0.25, 0.25, '#ffe9a0');
      L('Eat Street Northshore', b.cx, b.cz);
    }
    { // Indooroopilly Shopping Centre
      const b = S.indro; plaza(b, '#5a5c5e');
      R.box(b.cx, 0, b.cz - 6, 36, 9, 26, '#d8d2c4', 0, 26);
      for (let x = -16; x <= 16; x += 4) GR.quad(b.cx + x - 0.1, b.cz + 10, b.cx + x + 0.1, b.cz + 18, 0.02, '#ffffff');
      sign('INDRO', b.cx, 7, b.cz + 7.1, 8, 2.2, 0, '#2a6fc9', '#ffffff', 'bold 90px Arial');
      solid(b.cx, b.cz - 6, 36, 26, 9, '#5a5550'); L('Indooroopilly Shopping Centre', b.cx, b.cz);
    }
    { // Lone Pine Koala Sanctuary
      const b = S.lonepine;
      GR.quad(b.cx - 20, b.cz - 20, b.cx + 20, b.cz + 20, 0.012, '#5f8f42');
      for (let k = 0; k < 12; k++) tree('gum', b.cx + rr(-17, 17), b.cz + rr(-17, 17), rr(0.9, 1.3));
      P.box(b.cx, 0, b.cz + 14, 12, 4, 6, '#8a6f55'); P.shape(GABLE, b.cx, 4, b.cz + 14, 13, 2, 7, '#3e5e48', Math.PI / 2);
      sign('LONE PINE KOALA SANCTUARY', b.cx, 6.5, b.cz + 17.2, 14, 1.8, 0, '#3e5e48', '#ffe9b0', 'bold 40px Georgia, serif');
      L('Lone Pine Koala Sanctuary', b.cx, b.cz);
    }

    // ===== South Bank =====
    const fitZ = (x, z, hw, hd) => { while ((World.isWater(x - hw, z - hd) || World.isWater(x + hw, z - hd) || World.isWater(x, z - hd)) && z < 360) z += 2; return z; };
    { // GOMA — long white galleries under a thin floating roof
      const x = -160, z = fitZ(x, 262, 17, 8);
      R.box(x, 0, z, 34, 8, 16, '#f0efe9', 0, 26);
      G.box(x, 0.2, z - 8.05, 30, 6, 0.1, '#7f97a8', 0, 28);
      PS.box(x, 9.5, z, 40, 0.6, 22, WHITE);
      for (const [dx, dz] of [[-18, -10], [18, -10], [-18, 10], [18, 10]]) PS.box(x + dx, 0, z + dz, 0.4, 9.5, 0.4, '#ddd');
      solid(x, z, 34, 16, 10, '#d8d8d4'); L('GOMA', x, z);
    }
    { // State Library of Queensland
      const x = -112, z = fitZ(x, 262, 12, 8);
      G.box(x, 0, z, 24, 12, 16, '#5a7486', 0, 28);
      for (let k = -11; k <= 11; k += 1.4) PS.box(x + k, 0.5, z - 8.4, 0.25, 11, 0.6, '#8a5a3a');
      P.box(x, 12, z, 26, 0.8, 18, WHITE);
      solid(x, z, 24, 16, 13); L('State Library', x, z);
    }
    { // Queensland Museum
      const x = -66, z = fitZ(x, 262, 12, 9);
      R.box(x, 0, z, 24, 10, 18, CONC, 0, 26); R.box(x + 3, 10, z + 2, 18, 6, 14, CONC, 0, 26);
      solid(x, z, 24, 18, 16, '#9a968c'); L('Queensland Museum', x, z);
    }
    { // QPAC with its fly tower
      const x = -22, z = fitZ(x, 262, 15, 10);
      R.box(x, 0, z, 30, 10, 20, CONC, 0, 26); R.box(x + 6, 10, z + 3, 12, 14, 12, CONC, 0, 26);
      PS.box(x, 4, z - 10.6, 30, 0.4, 2.4, WHITE);
      sign('QPAC', x - 6, 7, z - 10.2, 8, 2.2, 0, '#2b2b2b', '#ffffff', 'bold 90px Arial');
      solid(x, z, 30, 20, 24, '#9a968c'); L('QPAC', x, z);
    }
    { // Wheel of Brisbane
      const wx = 35, wz = fitZ(35, 262, 8, 4) + 2;
      const wheel = new THREE.Group();
      const steel = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(15, 0.35, 6, 48), steel));
      for (let k = 0; k < 16; k++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, 15, 0.15), steel);
        s.rotation.z = (k / 16) * TAU; s.position.set(Math.sin(-s.rotation.z) * 7.5, Math.cos(s.rotation.z) * 7.5, 0);
        wheel.add(s);
      }
      wheel.position.set(wx, 17, wz);
      scene.add(wheel);
      const pods = [], podMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3366ff, emissiveIntensity: 0 });
      World.nightMats.push(podMat);
      for (let k = 0; k < 18; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), podMat); scene.add(p); pods.push(p); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.beam(wx + sx * 7, 0, wz + sz * 3, wx, 17, wz, 0.6, '#dddddd');
      addCol(wx - 8, wx + 8, wz - 3.5, wz + 3.5, 4);
      World.fp.push([wx - 15, wz - 1, wx + 15, wz + 1, '#ffffff']);
      World.anim.push({ update: (dt, t) => {
        wheel.rotation.z = t * 0.06;
        pods.forEach((p, k) => { const a = t * 0.06 + (k / pods.length) * TAU; p.position.set(wx + Math.sin(a) * 15, 17 - Math.cos(a) * 15 - 1, wz); });
      } });
      L('Wheel of Brisbane', wx, wz);
      // BRISBANE letters
      const sx = 8, sz = fitZ(sx, 252, 10, 1) + 6;
      const signTex = canvasTex(1024, 160, (g) => {
        g.clearRect(0, 0, 1024, 160);
        g.font = 'bold 140px Arial Black, Arial'; g.textBaseline = 'middle';
        const cols = ['#e83f6f', '#ffbf00', '#2fbfe6', '#7ac943', '#9b5cff', '#ff7a2f', '#e83f6f', '#2fbfe6'];
        let xx = 20;
        'BRISBANE'.split('').forEach((c, k) => { g.fillStyle = cols[k]; g.fillText(c, xx, 84); xx += g.measureText(c).width + 6; });
      }, false);
      const sm = new THREE.MeshLambertMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), sm);
      sgn.position.set(sx, 1.7, sz); scene.add(sgn);
      addCol(sx - 10, sx + 10, sz - 0.4, sz + 0.4, 3.3);
    }
    { // Streets Beach lagoon
      const bx = 88, bz = fitZ(88, 262, 22, 14) + 4;
      GR.quad(bx - 22, bz - 14, bx + 22, bz + 14, 0.02, '#ead9a6');
      GR.quad(bx - 16, bz - 9, bx + 16, bz + 9, 0.04, '#3fc2df');
      for (let k = 0; k < 8; k++) tree('palm', bx - 20 + k * 5.7, bz + (k % 2 ? 12 : -12), 0.9, false);
      for (let k = 0; k < 4; k++) { PS.cyl(bx - 12 + k * 8, 0, bz + 12, 0.08, 2.2, '#888', 6); PS.cyl(bx - 12 + k * 8, 2.2, bz + 12, 1.4, 0.12, rp(['#e83f6f', '#ffbf00', '#2fbfe6']), 8); }
      World.fp.push([bx - 16, bz - 9, bx + 16, bz + 9, '#3fc2df']);
      World.pois.southbank = { x: bx - 30, z: bz + 4 };
      L('Streets Beach', bx, bz);
    }
    { // Nepal Peace Pagoda
      const b = S.sb6, x = b.cx - 8, z = b.cz + 6, wood = '#6b3f22';
      P.box(x, 0, z, 7, 0.8, 7, '#bcb39f'); P.box(x, 0.8, z, 5, 3.4, 5, wood);
      pyramid(x, 4.2, z, 9, 1.8, 9, '#5a3a22'); P.box(x, 6, z, 3.4, 2, 3.4, wood);
      pyramid(x, 8, z, 6.4, 1.6, 6.4, '#5a3a22'); P.cyl(x, 9.6, z, 0.3, 2.4, '#d8b04a', 6);
      solid(x, z, 7, 7, 10, '#6b3f22'); L('Nepal Peace Pagoda', x, z);
      for (let k = 0; k < 5; k++) tree(rp(['palm', 'fig', 'jacaranda']), b.cx + rr(-18, 18), b.cz + rr(-18, 18));
    }
    { // The Arbour — bougainvillea-covered steel ribbons along the promenade
      const z = 347, mag = '#7d2f5a';
      for (let x = -78; x <= 48; x += 3) {
        if (Math.abs(x - Math.round(x / GRID) * GRID - 0) < 12) continue;
        const zz = z + Math.sin(x * 0.05) * 3;
        PS.box(x, 0, zz - 1.8, 0.14, 3.4, 0.14, mag); PS.box(x, 0, zz + 1.8, 0.14, 3.4, 0.14, mag);
        P.beam(x, 3.4, zz - 1.8, x, 4.4, zz, 0.16, mag); P.beam(x, 4.4, zz, x, 3.4, zz + 1.8, 0.16, mag);
        if ((x / 3) % 2 === 0) P.add(ICO, M(x, 4.4, zz + rr(-1, 1), 1.3, 0.7, 1.6, 0, rr(0, 3)), rp(['#e0408a', '#d2307a', '#f05aa0']));
        GR.quad(x - 1.6, zz - 1.6, x + 1.6, zz + 1.6, 0.02, '#c9c3b2');
      }
      L('The Arbour', -20, z);
    }
    for (const k of ['sb1', 'sb2', 'sb3', 'sb4', 'sb5']) { // riverside lawns between the buildings
      const b = S[k];
      for (let n = 0; n < 4; n++) { const x = b.cx + rr(-18, 18), z = b.cz + rr(0, 18); if (!World.isWater(x, z - 4) && !pointInBuilding(x, 1, z)) tree(rp(['palm', 'fig', 'jacaranda']), x, z, 0.9); }
    }

    // ===== Bridge dressing =====
    for (const br of World.bridges) {
      if (br.w0 === undefined) continue;
      const horiz = br.dir === 'H';
      const at = (s, off) => (horiz ? [br.x0 + s, br.z0 + off] : [br.x0 + off, br.z0 + s]);
      const mid = (br.w0 + br.w1) / 2;
      if (br.name === 'Kurilpa Bridge') { // tensegrity masts at crazy angles
        for (let k = 0; k < 7; k++) {
          const s = lerp(br.w0 + 6, br.w1 - 6, k / 6), side = k % 2 ? 1 : -1;
          const [x0, z0] = at(s, side * 10.5), [x1, z1] = at(s + rr(-8, 8), side * rr(13, 19)), h1 = rr(14, 24);
          P.beam(x0, -1, z0, x1, h1, z1, 0.35, '#eeeeee');
          const [x2, z2] = at(s + 10, side * 10.5);
          P.beam(x1, h1 - 2, z1, x2, 1, z2, 0.06, '#bbbbbb');
        }
        const [cx, cz] = at(mid, 0);
        PS.box(cx, 6, cz, horiz ? br.w1 - br.w0 : 22, 0.2, horiz ? 22 : br.w1 - br.w0, '#dcdcdc');
      }
      if (br.name === 'Kangaroo Point Bridge') { // single leaning pylon, cable-stayed
        const [px, pz] = at(mid, 12);
        P.beam(px, 0, pz, px, 46, pz, 1.6, WHITE);
        for (let k = 1; k <= 6; k++) for (const d of [-1, 1]) { const [cx, cz] = at(mid + d * k * ((br.w1 - br.w0) / 13), 9.5); P.beam(px, 44 - k * 2.5, pz, cx, 1.2, cz, 0.1, '#cccccc'); }
      }
      if (br.name === 'William Jolly Bridge' || br.name === 'Victoria Bridge' || br.name === 'Go Between Bridge') { // art-deco pylons at each end
        for (const s of [br.w0, br.w1]) for (const off of [-11, 11]) { const [x, z] = at(s, off); P.box(x, 0, z, 2.4, 9, 2.4, '#d8d2c0'); P.box(x, 9, z, 3, 1, 3, '#cfc6b0'); NE.box(x, 10, z, 1, 1, 1, '#fff1c8'); }
      }
      if (br.name === 'Captain Cook Bridge' || br.name === 'Gateway Bridge') { // tall concrete piers
        for (let s = br.w0 + 8; s < br.w1 - 4; s += 16) { const [x, z] = at(s, 0); P.box(x, -6, z, horiz ? 4 : 18, 6, horiz ? 18 : 4, '#b0aca2'); }
      }
    }
    const LM = World.landmarks;
    L('Suncorp Stadium', LM.suncorp.cx, LM.suncorp.cz, 60); L('The Gabba', LM.gabba.cx, LM.gabba.cz, 60);
    L('XXXX Brewery', LM.xxxx.cx, LM.xxxx.cz); L('City Hall', LM.cityhall.cx, LM.cityhall.cz);
    L('Royal Brisbane Hospital', LM.hospital.cx, LM.hospital.cz); L('Kangaroo Point Cliffs', 200, -60, 40);
    L('Mt Coot-tha Lookout', MT.x, MT.z, 50); L('Queen St Mall', -30, World.mall.z, 25); L('Roma Street Parkland', -120, -150, 40);
  },
};

// Deterministic-ish helper so landmark dressing doesn't change between loads.
const _lmRng = mulberry32(777);
function rng01() { return _lmRng(); }
