// 像素风草原场景：480×120 内部分辨率，CSS 放大显示
(function (root) {
  // 世界坐标宽 480，视口只显示 VX 以右的 CW 像素，让动物显得更大
  const W = 480, H = 120, CW = 400, VX = 80, GROUND = 72, DEN_X = 336, DEN_Y = 99;
  let cv, ctx, land, lc, tagLayer, getState;
  let last = 0, tick = 0;
  const mom = { x: 320, dir: 1, pose: 'lie', walking: false, carry: false, lungeUntil: 0, lungeX: 0, headY: 86 };
  let threat = null;
  let flashUntil = 0;
  const drops = [];
  const birds = [];
  const stars = Array.from({ length: 60 }, (_, i) => [(i * 97 + 13) % CW, (i * 53 + 7) % 60, (i * 31) % 7]);

  // ---------- 基础绘制 ----------
  function r(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function disc(c, cx, cy, rad, col) {
    c.fillStyle = col;
    for (let y = -rad; y <= rad; y++) {
      const w = Math.round(Math.sqrt(rad * rad - y * y));
      c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
    }
  }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

  // 以 (x,y) 为脚底左端，朝右绘制；flip 时水平翻转
  function sprite(c, x, y, flip, fn) {
    c.save();
    c.translate(Math.round(x), Math.round(y));
    if (flip) c.scale(-1, 1);
    fn(c);
    c.restore();
  }
  const eyes = [];
  function eye(c, x, y) {
    const m = c.getTransform();
    eyes.push([(m.a * x + m.e) / 1, (m.d * y + m.f) / 1]);
  }

  // ---------- 动物精灵 ----------
  const L = { fur: '#c9995a', light: '#e6c992', dark: '#8a6436', tuft: '#3b2a1a', nose: '#7a4a3a', eye: '#2a1a10' };
  function legs(c, xs, top, h, w, col, f, walking) {
    xs.forEach((lx, i) => {
      const off = walking ? ((f + i * 2) % 4 < 2 ? 1 : -1) : 0;
      r(c, lx + off, top + (walking && (f + i) % 4 === 0 ? -1 : 0), w, h, col);
    });
  }
  function lioness(c, pose, f, walking, carry) {
    if (pose === 'lie') {
      r(c, -9, -3, 9, 2, L.fur); r(c, -11, -3, 3, 2, L.tuft);
      r(c, 0, -8, 24, 8, L.fur); r(c, 1, -9, 20, 1, L.fur); r(c, 2, -2, 20, 2, L.light);
      r(c, 22, -14, 9, 8, L.fur); r(c, 29, -11, 4, 4, L.light); r(c, 32, -11, 1, 1, L.nose);
      r(c, 22, -16, 2, 2, L.fur); r(c, 26, -16, 2, 2, L.fur); r(c, 22, -16, 1, 1, L.dark);
      r(c, 27, -13, 1, 1, L.eye); eye(c, 27, -13);
      r(c, 24, -2, 9, 2, L.fur); r(c, 31, -2, 2, 2, L.light);
      const breath = Math.sin(tick / 12) > 0 ? 1 : 0;
      r(c, 4, -9 - breath, 14, 1, L.fur);
      return;
    }
    if (pose === 'sit') {
      r(c, -6, -3, 7, 2, L.fur); r(c, -8, -3, 3, 2, L.tuft);
      r(c, 0, -11, 13, 11, L.fur); r(c, 10, -19, 9, 17, L.fur); r(c, 12, -9, 6, 7, L.light);
      r(c, 12, -2, 3, 2, L.fur); r(c, 16, -2, 3, 2, L.fur);
      r(c, 13, -27, 9, 8, L.fur); r(c, 20, -24, 4, 4, L.light); r(c, 23, -24, 1, 1, L.nose);
      r(c, 13, -29, 2, 2, L.fur); r(c, 17, -29, 2, 2, L.fur); r(c, 19, -25, 1, 1, L.eye); eye(c, 19, -25);
      return;
    }
    const bob = walking && f % 2 ? -1 : 0;
    const sw = Math.sin(tick / 6) > 0 ? 0 : 1;
    r(c, -7, -13 + sw, 3, 1, L.fur); r(c, -9, -12 + sw, 2, 3, L.fur); r(c, -10, -10 + sw, 3, 3, L.tuft);
    legs(c, [2, 6, 17, 21], -6, 6, 3, L.fur, f, walking);
    r(c, 0, -15 + bob, 22, 9, L.fur); r(c, 1, -16 + bob, 18, 1, L.fur); r(c, 2, -7 + bob, 18, 2, L.light);
    r(c, 18, -17 + bob, 6, 10, L.fur);
    r(c, 22, -20 + bob, 9, 8, L.fur); r(c, 29, -16 + bob, 4, 4, L.light); r(c, 32, -16 + bob, 1, 1, L.nose);
    r(c, 22, -22 + bob, 2, 2, L.fur); r(c, 26, -22 + bob, 2, 2, L.fur); r(c, 22, -22 + bob, 1, 1, L.dark);
    r(c, 27, -18 + bob, 1, 1, L.eye); eye(c, 27, -18 + bob);
    if (carry) cub(c, 28, -9 + bob, 'hang', f);
  }
  function cub(c, x, y, pose, f) {
    const fur = '#c8a878', spot = '#8f7452', light = '#e2cca2';
    c.save(); c.translate(x, y);
    if (pose === 'hang') {
      r(c, 0, 0, 5, 7, fur); r(c, 1, 2, 1, 1, spot); r(c, 3, 4, 1, 1, spot); r(c, -1, 6, 2, 2, fur); r(c, 4, 6, 2, 2, fur);
    } else if (pose === 'lie') {
      r(c, 0, -4, 9, 4, fur); r(c, 2, -4, 1, 1, spot); r(c, 5, -3, 1, 1, spot);
      r(c, 8, -6, 5, 5, fur); r(c, 11, -4, 2, 2, light); r(c, 8, -7, 1, 1, fur); r(c, 11, -7, 1, 1, fur);
      r(c, 10, -5, 1, 1, '#33241a'); r(c, -2, -2, 2, 1, fur);
    } else {
      const hop = f % 4 === 0 ? -1 : 0;
      r(c, -2, -5 + hop, 2, 1, fur);
      r(c, 1 + (f % 2), -2, 2, 2, fur); r(c, 6 - (f % 2), -2, 2, 2, fur);
      r(c, 0, -7 + hop, 9, 5, fur); r(c, 2, -6 + hop, 1, 1, spot); r(c, 5, -5 + hop, 1, 1, spot); r(c, 1, -3 + hop, 7, 1, light);
      r(c, 8, -10 + hop, 5, 5, fur); r(c, 11, -8 + hop, 2, 2, light); r(c, 8, -11 + hop, 1, 1, fur); r(c, 11, -11 + hop, 1, 1, fur);
      r(c, 10, -9 + hop, 1, 1, '#33241a');
    }
    c.restore();
  }

  const ANIMALS = {
    hyena(c, f, walking) {
      const fur = '#a39070', sp = '#4a3a2a', dk = '#3a2c20';
      r(c, -3, -10, 3, 2, dk);
      legs(c, [2, 6], -5, 5, 2, fur, f, walking); legs(c, [15, 19], -7, 7, 2, fur, f + 1, walking);
      r(c, 0, -11, 8, 6, fur); r(c, 8, -13, 8, 8, fur); r(c, 16, -15, 6, 9, fur); r(c, 8, -14, 12, 1, '#5a4630');
      [[3, -9], [10, -10], [13, -8], [18, -11], [6, -7]].forEach(([a, b]) => r(c, a, b, 1, 1, sp));
      r(c, 21, -15, 7, 6, fur); r(c, 27, -13, 3, 3, dk); r(c, 22, -17, 2, 2, fur); r(c, 25, -17, 2, 2, fur);
      r(c, 25, -14, 1, 1, '#120c08'); eye(c, 25, -14);
    },
    leopard(c, f, walking) {
      const fur = '#d6a845', ro = '#4a3418', lt = '#efd9a0';
      r(c, -12, -10, 12, 2, fur); r(c, -14, -13, 2, 4, fur); r(c, -14, -14, 2, 1, ro);
      legs(c, [2, 6, 18, 21], -4, 4, 2, fur, f, walking);
      r(c, 0, -11, 24, 7, fur); r(c, 2, -5, 20, 1, lt);
      for (let i = 0; i < 9; i++) r(c, 2 + ((i * 7) % 20), -10 + ((i * 3) % 5), 1, 1, ro);
      r(c, 23, -13, 7, 6, fur); r(c, 28, -10, 2, 2, lt); r(c, 24, -15, 2, 2, fur); r(c, 27, -15, 2, 2, fur);
      r(c, 27, -12, 1, 1, '#120c08'); eye(c, 27, -12);
    },
    baboon(c, f, walking) {
      const fur = '#7d7556', mane = '#8d855f', face = '#3a2e2a';
      r(c, -2, -14, 2, 4, fur); r(c, -5, -16, 4, 2, fur); r(c, -6, -14, 2, 5, fur);
      legs(c, [1, 5, 12, 15], -5, 5, 2, fur, f, walking);
      r(c, 0, -12, 16, 7, fur); r(c, 11, -16, 7, 7, mane);
      r(c, 15, -14, 6, 6, mane); r(c, 20, -12, 5, 3, face); r(c, 18, -13, 1, 1, '#d8c060'); eye(c, 18, -13);
    },
    elephant(c, f, walking) {
      const g = '#8c8a86', dk = '#6e6c68';
      r(c, -2, -30, 2, 10, dk);
      legs(c, [3, 12, 26, 34], -14, 14, 6, dk, f, walking);
      r(c, 0, -36, 40, 22, g); r(c, 4, -38, 30, 2, g);
      r(c, 36, -40, 14, 18, g); r(c, 32, -38, 10, 16, dk);
      r(c, 48, -26, 4, 16, g); r(c, 49, -10, 4, 3, g);
      r(c, 45, -24, 7, 2, '#eee8d8'); r(c, 44, -34, 1, 1, '#1a1a1a'); eye(c, 44, -34);
    },
    buffalo(c, f, walking) {
      const b = '#3a3330', hn = '#7a7068';
      r(c, -2, -18, 2, 9, b); r(c, -3, -10, 3, 2, '#221c1a');
      legs(c, [2, 7, 21, 26], -7, 7, 3, b, f, walking);
      r(c, 0, -20, 30, 13, b); r(c, 18, -23, 10, 4, b);
      r(c, 28, -17, 9, 9, b); r(c, 26, -21, 12, 3, hn); r(c, 24, -24, 2, 4, hn); r(c, 37, -24, 2, 4, hn);
      r(c, 33, -15, 1, 1, '#d0c0a0'); eye(c, 33, -15);
    },
    hippo(c, f, walking) {
      const h = '#86707a', bl = '#c79a9a';
      legs(c, [3, 10, 26, 31], -3, 3, 4, h, f, walking);
      r(c, 1, -16, 34, 13, h); r(c, 0, -14, 36, 9, h); r(c, 3, -5, 30, 2, bl);
      r(c, 34, -17, 12, 10, h); r(c, 42, -14, 6, 8, bl); r(c, 36, -19, 2, 2, h); r(c, 41, -19, 2, 2, h);
      r(c, 39, -17, 2, 1, '#1a1012'); eye(c, 39, -17);
    },
  };
  const SIZE = { hyena: 30, leopard: 30, baboon: 25, elephant: 52, buffalo: 39, hippo: 48 };

  // ---------- 景物 ----------
  function acacia(c, x, y, s, cols) {
    r(c, x, y - 18 * s, 2 * s, 18 * s, cols.trunk);
    r(c, x - 4 * s, y - 20 * s, 2 * s, 6 * s, cols.trunk); r(c, x + 3 * s, y - 21 * s, 2 * s, 7 * s, cols.trunk);
    r(c, x - 16 * s, y - 25 * s, 34 * s, 4 * s, cols.leaf); r(c, x - 12 * s, y - 27 * s, 26 * s, 3 * s, cols.leaf2);
    r(c, x - 18 * s, y - 22 * s, 8 * s, 2 * s, cols.leaf); r(c, x + 10 * s, y - 22 * s, 10 * s, 2 * s, cols.leaf);
  }
  function bush(c, back) {
    const d1 = '#26401f', d2 = '#33532a', d3 = '#456b37', d4 = '#5c8446';
    if (back) {
      [[290, 92, 14], [312, 86, 18], [338, 84, 20], [364, 88, 17], [386, 94, 12], [300, 98, 10]].forEach(([x, y, s]) => disc(c, x, y, s, d1));
      [[316, 82, 12], [342, 79, 13], [366, 84, 10]].forEach(([x, y, s]) => disc(c, x, y, s, d2));
      [[322, 76, 6], [346, 72, 7], [370, 80, 5]].forEach(([x, y, s]) => disc(c, x, y, s, d3));
      disc(c, DEN_X + 6, DEN_Y - 2, 8, '#1c2d15');
      for (let i = 0; i < 30; i++) r(c, 285 + ((i * 37) % 105), 72 + ((i * 17) % 22), 1, 1, d4);
    } else {
      [[284, 106, 8], [376, 107, 8], [392, 103, 7]].forEach(([x, y, s]) => disc(c, x, y, s, d2));
      [[286, 102, 4], [378, 104, 4]].forEach(([x, y, s]) => disc(c, x, y, s, d3));
    }
  }
  function frontLeaves(c) {
    [[328, 100, 7], [346, 101, 7]].forEach(([x, y, s]) => disc(c, x, y, s, '#2b4823'));
    for (let i = 0; i < 12; i++) r(c, 323 + i * 2, 94 + ((i * 5) % 6), 1, 2, '#4b7339');
  }

  function drawLand(c, st, env) {
    c.clearRect(0, 0, W, H);
    // 远山（奥洛洛洛悬崖）
    c.fillStyle = '#6f7d78';
    c.beginPath(); c.moveTo(0, 60);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, 52 + Math.sin(x / 37) * 4 + Math.sin(x / 13) * 1.5 + (x > 260 ? (x - 260) / 30 : 0));
    c.lineTo(W, GROUND); c.lineTo(0, GROUND); c.fill();
    r(c, 0, 63, W, 9, '#8d9a7a');
    // 远处迁徙的角马群（10–11月）
    const mo = new Date(Date.now() + 3 * 3600000).getUTCMonth();
    if (env.ph !== 'night' && (mo === 9 || mo === 10)) {
      for (let i = 0; i < 26; i++) {
        const x = (i * 23 + tick * 0.05 + (i % 3) * 4) % 280;
        r(c, x, 66 + (i % 3), 2, 1, '#3b3530');
        r(c, x + (i % 2), 67 + (i % 3), 1, 1, '#3b3530');
      }
    }
    // 草地
    r(c, 0, GROUND, W, H - GROUND, '#b9a463');
    r(c, 0, GROUND, W, 3, '#a8955a');
    for (let i = 0; i < 160; i++) {
      const x = (i * 41) % W, y = GROUND + 4 + ((i * 29) % 44);
      const sway = Math.sin(tick / 10 + i) > 0.6 ? 1 : 0;
      r(c, x + sway, y, 1, 3, i % 3 ? '#9c8a4c' : '#d1bd7c');
    }
    // 恩提亚克河
    c.fillStyle = '#5d7b7c';
    c.beginPath(); c.moveTo(420, H); c.lineTo(404, 96); c.lineTo(414, 84); c.lineTo(440, 76); c.lineTo(W, 74); c.lineTo(W, H); c.fill();
    for (let i = 0; i < 14; i++) {
      const x = 420 + ((i * 19 + tick * 0.3) % 58), y = 80 + ((i * 11) % 36);
      if (x > 404 + (H - y) * 0.1) r(c, x, y, 4, 1, '#8fb0aa');
    }
    for (let i = 0; i < 12; i++) r(c, 398 + i * 3 + (i % 2), 80 + ((i * 7) % 14), 1, 7, '#6c7f3a');
    // 金合欢树
    const cols = { trunk: '#4a3a28', leaf: '#4f6a3a', leaf2: '#5f7d45' };
    acacia(c, 130, GROUND + 7, 1.2, cols); acacia(c, 215, GROUND + 2, 0.6, cols); acacia(c, 255, GROUND, 0.4, cols);
    bush(c, true);
  }

  // ---------- 主循环 ----------
  function targetFor(st) {
    const t = st.act.type;
    if (t === 'hunt' || t === 'feed') return 30;
    if (t === 'drink') return 432;
    return 298;
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - last < 66) return;
    last = ts; tick++;
    const st = getState();
    if (!st || !st.__env) return;
    const now = st.__now;
    const env = st.__env;
    eyes.length = 0;

    // 母狮位置与姿态
    let tx = targetFor(st);
    let carry = false;
    if (st.act.type === 'move') {
      const cyc = (tick % 260) / 260;
      tx = cyc < 0.5 ? 40 : 298;
      carry = cyc < 0.5;
    }
    if (mom.lungeUntil > ts) tx = mom.lungeX;
    const dx = tx - mom.x;
    const speed = mom.lungeUntil > ts ? 3 : 1.1;
    mom.walking = Math.abs(dx) > 1.5;
    if (mom.walking) { mom.x += Math.sign(dx) * Math.min(speed, Math.abs(dx)); mom.dir = Math.sign(dx); }
    else mom.dir = 1;
    mom.carry = carry && mom.walking;
    let pose = 'stand';
    if (!mom.walking) {
      const at = st.act.type;
      pose = at === 'nurse' || at === 'rest' ? 'lie' : at === 'groom' || at === 'guard' ? 'sit' : 'stand';
    }

    const present = !!LionSim.PRESENT[st.act.type];

    // 幼崽
    const alive = st.cubs.filter((c) => c.alive);
    let shown = alive.length;
    if (st.act.type === 'move') shown = Math.max(0, alive.length - Math.floor(((now - st.act.start) / (st.act.end - st.act.start)) * (alive.length + 1)));
    const age = env.age;
    const hidden = !present || st.act.type === 'move';
    const cubPos = [];
    for (let i = 0; i < shown; i++) {
      if (hidden) cubPos.push([DEN_X - 2 + i * 11, DEN_Y + 1, 'lie', tick]);
      else if (age < 21) cubPos.push([pose === 'lie' ? 303 + i * 11 : 296 + i * 13, 109, 'lie', tick]);
      else {
        const wob = Math.round(Math.sin(tick / 25 + i * 2) * 10);
        cubPos.push([338 + i * 14 + wob, 110, 'stand', Math.floor(tick / 3) + i]);
      }
    }
    const threatMoving = threat ? updateThreat(ts) : false;

    // 雨
    const wxNow = env.w;
    const rainy = wxNow.rain > 0.05 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(wxNow.code);
    if (rainy) {
      const n = Math.min(160, 30 + wxNow.rain * 40);
      while (drops.length < n) drops.push([Math.random() * CW, Math.random() * H]);
      drops.length = Math.min(drops.length, n);
    } else drops.length = 0;
    const lt = light(env.h, wxNow);

    if (artMode()) {
      drawArt(env, lt, pose, hidden, cubPos, threatMoving);
    } else {
      drawLand(lc, st, env);
      if (hidden) { cubPos.forEach(([x, y, p, f]) => cub(lc, x, y, p, f)); frontLeaves(lc); }
      bush(lc, false);
      sprite(lc, mom.x + (mom.dir < 0 ? 32 : 0), 107, mom.dir < 0, (c) => lioness(c, pose, Math.floor(tick / 2), mom.walking, mom.carry));
      if (!hidden) cubPos.forEach(([x, y, p, f]) => cub(lc, x, y, p, f));
      if (threat) {
        const w = SIZE[threat.sp];
        sprite(lc, threat.x + (threat.dir < 0 ? w : 0), 109, threat.dir < 0, (c) => ANIMALS[threat.sp](c, Math.floor(tick / 2), threatMoving));
      }
      mom.headY = mom.walking ? 82 : 86;
      if (threat) threat.headY = threat.sp === 'elephant' ? 60 : 86;

      ctx.clearRect(0, 0, CW, H);
      drawSky(ctx, env, now);
      ctx.filter = `brightness(${0.32 + 0.68 * lt.l}) saturate(${0.5 + 0.5 * lt.l}) sepia(${lt.warm * 0.35})`;
      ctx.drawImage(land, VX, 0, CW, H, 0, 0, CW, H);
      ctx.filter = 'none';
      if (lt.l < 0.45) eyes.forEach(([x, y]) => r(ctx, x - VX, y, 1, 1, '#f2f5b0'));
    }
    const K = cv.width / CW;
    drops.forEach((d) => {
      d[0] -= 0.6; d[1] += 4;
      if (d[1] > H) { d[1] = -4; d[0] = Math.random() * (CW + 20); }
      ctx.fillStyle = 'rgba(200,215,230,0.55)';
      ctx.fillRect(d[0] * K, d[1] * K, Math.max(1, K * 0.5), 3 * K);
    });
    if (wxNow.code >= 95 && Math.random() < 0.01) flashUntil = ts + 90;
    if (flashUntil > ts) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, cv.width, cv.height); }
    if (threat && threat.flash && threat.flash > ts) { ctx.fillStyle = 'rgba(190,30,20,0.18)'; ctx.fillRect(0, 0, cv.width, cv.height); }

    updateTags(st);
  }

  function light(h, w) {
    const sr = w.rise || 6.35, ss = w.set || 18.5;
    let l;
    if (h < sr - 0.6 || h > ss + 0.6) l = 0;
    else if (h < sr + 0.6) l = (h - (sr - 0.6)) / 1.2;
    else if (h > ss - 0.6) l = (ss + 0.6 - h) / 1.2;
    else l = 1;
    const cloud = (w.cloud || 0) / 100;
    l *= 1 - cloud * 0.25;
    const warm = Math.max(0, 1 - Math.min(Math.abs(h - sr), Math.abs(h - ss)) / 1.2);
    return { l, warm };
  }

  function drawSky(c, env, now) {
    const lt = light(env.h, env.w);
    const g = c.createLinearGradient(0, 0, 0, GROUND);
    const top = mix('#0a1020', '#6fa6cf', lt.l), bot = mix('#1b2638', '#d6e3dc', lt.l);
    g.addColorStop(0, top);
    g.addColorStop(1, lt.warm > 0.05 ? mix(hex2(bot), '#f2a25e', lt.warm * 0.8) : bot);
    c.fillStyle = g; c.fillRect(0, 0, CW, GROUND);
    if (lt.l < 0.5) {
      const a = 1 - lt.l * 2;
      stars.forEach(([x, y, k]) => { if ((tick + k * 7) % 40 > 3) { c.fillStyle = `rgba(240,240,220,${a * (0.4 + (k % 3) * 0.2)})`; c.fillRect(x, y, 1, 1); } });
    }
    const sr = env.w.rise || 6.35, ss = env.w.set || 18.5;
    if (env.h > sr - 0.5 && env.h < ss + 0.5) {
      const p = (env.h - sr) / (ss - sr);
      disc(c, 16 + p * 368, 58 - Math.sin(Math.PI * Math.max(0, Math.min(1, p))) * 48, 5, lt.warm > 0.3 ? '#ffb46a' : '#fff4c8');
    } else {
      const mn = env.mn;
      const hh = env.h < 12 ? env.h + 24 : env.h;
      const p = (hh - 18.5) / 12;
      const mx = 24 + p * 352, my = 50 - Math.sin(Math.PI * Math.max(0, Math.min(1, p))) * 38;
      disc(c, mx, my, 5, '#e9e6cf');
      const off = (mn.phase < 0.5 ? 1 : -1) * Math.round(Math.cos(mn.phase * 2 * Math.PI) * 10);
      if (mn.illum < 0.97) disc(c, mx + (mn.phase < 0.5 ? -1 : 1) * Math.abs(off) * (mn.illum < 0.5 ? 0.5 : 1), my, 5, top);
    }
    const cl = (env.w.cloud || 0) / 100;
    const nc = Math.round(cl * 7);
    for (let i = 0; i < nc; i++) {
      const x = ((i * 83 + tick * 0.08 * (1 + (i % 3))) % (CW + 60)) - 40, y = 8 + ((i * 13) % 30);
      const col = mix('#3a4150', '#f1f1ee', lt.l * (1 - cl * 0.4));
      disc(c, x, y, 5, col); disc(c, x + 7, y - 2, 6, col); disc(c, x + 15, y, 5, col); r(c, x - 3, y + 1, 23, 4, col);
    }
  }
  function hex2(rgb) { const m = rgb.match(/\d+/g).map(Number); return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join(''); }

  // ---------- 威胁动画 ----------
  function playThreat(fx) {
    const fromRight = fx.sp === 'hippo'; // 只有河马从河里上岸，其余都从草原一侧过来
    threat = {
      sp: fx.sp, outcome: fx.outcome, present: fx.present,
      x: fromRight ? W + 10 : VX - SIZE[fx.sp] - 10, dir: fromRight ? -1 : 1,
      stage: 'enter', until: 0, flash: 0,
      stopX: fromRight ? 380 : 262,
    };
  }
  function updateThreat(ts) {
    const T = threat;
    const w = SIZE[T.sp];
    let moving = true;
    if (T.stage === 'enter') {
      if (T.outcome === 'pass') { T.stage = 'leave'; }
      else {
        T.x += T.dir * 0.9;
        if ((T.dir > 0 && T.x >= T.stopX - w) || (T.dir < 0 && T.x <= T.stopX)) {
          T.stage = 'pause'; T.until = ts + (T.outcome === 'hid' ? 5000 : 2200);
          if (T.outcome === 'repel' || (T.present && T.outcome !== 'pass')) { mom.lungeUntil = ts + 1800; mom.lungeX = T.dir > 0 ? T.x + w - 4 : T.x - 30; }
          if (T.outcome === 'hurt' || T.outcome === 'dead') T.flash = ts + 1200;
        }
      }
    } else if (T.stage === 'pause') {
      moving = false;
      if (ts > T.until) { T.stage = 'leave'; if (T.outcome !== 'pass') T.dir *= -1; }
    }
    if (T.stage === 'leave') {
      T.x += T.dir * (T.outcome === 'repel' ? 2.4 : 1);
      if (T.x > W + 60 || T.x < VX - 70) { threat = null; return false; }
    }
    return moving;
  }


  // ---------- 美术素材模式 ----------
  const ART_K = 5; // 美术模式画布 = 400×120 的 5 倍
  let artOn = false;
  function artMode() {
    const want = !!(root.LionArt && LionArt.ready);
    if (want !== artOn) {
      artOn = want;
      cv.width = CW * (want ? ART_K : 1); cv.height = H * (want ? ART_K : 1);
      cv.classList.toggle('art', want);
    }
    return want;
  }
  // 以底边中心 (cx, by) 为锚点画一张精灵图；返回头顶的世界坐标 y
  function artSprite(name, cx, by, flip, o) {
    const im = LionArt.get(name);
    const K = ART_K;
    const h = (o.h || LionArt.SPRITES[name].h) * K;
    const w = (im.width / im.height) * h;
    ctx.save();
    ctx.translate((cx - VX) * K, (by + (o.dy || 0)) * K);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(flip ? -1 : 1, o.sy || 1);
    if (o.filter) ctx.filter = o.filter;
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
    return by - h / K;
  }
  function drawArt(env, lt, pose, hidden, cubPos, threatMoving) {
    const K = ART_K;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const bg = (n, a) => { if (LionArt.has(n) && a > 0.01) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(LionArt.get(n), 0, 0, cv.width, cv.height); } };
    const night = LionArt.has('bg_night');
    if (night) bg('bg_night', 1);
    bg('bg_day', night ? lt.l : 1);
    if (LionArt.has('bg_dusk')) bg('bg_dusk', lt.warm * 0.95);
    ctx.globalAlpha = 1;
    if (!night && lt.l < 1) { ctx.fillStyle = `rgba(8,14,32,${(1 - lt.l) * 0.7})`; ctx.fillRect(0, 0, cv.width, cv.height); }

    const tint = `brightness(${0.42 + 0.58 * lt.l}) saturate(${0.6 + 0.4 * lt.l})` + (lt.warm > 0.05 ? ` sepia(${lt.warm * 0.25})` : '');
    const cubDraw = ([x, y, p], i) => {
      const n = p === 'stand' && LionArt.has('cub_stand') ? 'cub_stand' : 'cub_lie';
      if (!LionArt.has(n)) return;
      const bob = p === 'stand' ? -Math.abs(Math.sin(tick / 3 + i)) * 0.8 : 0;
      const flip = p === 'stand' && Math.cos(tick / 25 + i * 2) < 0;
      artSprite(n, x + 6, y, flip, { dy: bob, filter: tint + (hidden ? ' brightness(0.75)' : ''), sy: p === 'lie' ? 1 + Math.sin(tick / 10 + i) * 0.02 : 1 });
    };
    if (hidden) {
      cubPos.forEach(cubDraw);
      if (LionArt.has('fg_bush')) { ctx.filter = tint; ctx.drawImage(LionArt.get('fg_bush'), 0, 0, cv.width, cv.height); ctx.filter = 'none'; }
    }

    // 母狮
    const momCx = mom.x + 16;
    let name = pose === 'lie' ? 'lioness_lie' : pose === 'sit' ? 'lioness_sit' : 'lioness_walk';
    if (mom.walking && LionArt.has('lioness_walk2') && Math.floor(tick / 4) % 2) name = 'lioness_walk2';
    if (!LionArt.has(name)) name = ['lioness_lie', 'lioness_sit', 'lioness_walk'].find((n) => LionArt.has(n));
    if (name && mom.x > VX - 60) {
      const o = { filter: tint };
      if (mom.walking) { o.dy = -Math.abs(Math.sin(tick / 2.2)) * 0.9; o.rot = Math.sin(tick / 2.2) * 0.02; }
      if (pose === 'lie' && !mom.walking) o.sy = 1 + Math.sin(tick / 12) * 0.012;
      mom.headY = artSprite(name, momCx, 107, mom.dir < 0, o);
    } else mom.headY = 86;
    if (!hidden) cubPos.forEach(cubDraw);

    // 威胁动物
    if (threat && LionArt.has(threat.sp)) {
      const o = { filter: tint };
      if (threatMoving) { o.dy = -Math.abs(Math.sin(tick / 2.5)) * 0.8; o.rot = Math.sin(tick / 2.5) * 0.015; }
      threat.headY = artSprite(threat.sp, threat.x + SIZE[threat.sp] / 2, 109, threat.dir < 0, o);
    } else if (threat) {
      // 缺这张图时退回像素精灵，放大到美术画布
      lc.clearRect(0, 0, W, H);
      const w = SIZE[threat.sp];
      sprite(lc, threat.x + (threat.dir < 0 ? w : 0), 109, threat.dir < 0, (c) => ANIMALS[threat.sp](c, Math.floor(tick / 2), threatMoving));
      ctx.imageSmoothingEnabled = false; ctx.filter = tint;
      ctx.drawImage(land, VX, 0, CW, H, 0, 0, cv.width, cv.height);
      ctx.filter = 'none'; ctx.imageSmoothingEnabled = true;
      threat.headY = threat.sp === 'elephant' ? 60 : 86;
    }
    if (lt.l < 0.3) {
      // 夜里的眼睛反光
      ctx.fillStyle = 'rgba(240,245,170,0.9)';
      if (threat && threat.headY) ctx.fillRect((threat.x + (threat.dir > 0 ? SIZE[threat.sp] * 0.85 : SIZE[threat.sp] * 0.15) - VX) * K, (threat.headY + 3) * K, 4, 3);
    }
  }

  // ---------- HTML 标签 ----------
  function updateTags(st) {
    if (!tagLayer) return;
    const scale = cv.clientWidth / CW;
    const mt = tagLayer.querySelector('.tag-mom');
    if (mom.x > VX - 20 && mom.x < W) {
      mt.style.display = '';
      mt.style.left = (mom.x - VX + 14) * scale + 'px';
      mt.style.top = (mom.headY - 3) * (cv.clientHeight / H) + 'px';
      mt.textContent = 'Naramat · ' + LionSim.ACT_NAME[st.act.type];
    } else mt.style.display = 'none';
    const tt = tagLayer.querySelector('.tag-threat');
    if (threat) {
      const S = LionData.SPECIES[threat.sp];
      tt.style.display = '';
      tt.style.left = (threat.x - VX + SIZE[threat.sp] / 2) * scale + 'px';
      tt.style.top = (threat.headY - 3) * (cv.clientHeight / H) + 'px';
      tt.textContent = S.icon + ' ' + S.name;
    } else tt.style.display = 'none';
  }

  function init(canvas, tags, stateGetter) {
    cv = canvas; ctx = cv.getContext('2d');
    cv.width = CW; cv.height = H;
    land = document.createElement('canvas'); land.width = W; land.height = H;
    lc = land.getContext('2d');
    tagLayer = tags; getState = stateGetter;
    if (root.LionArt) LionArt.load();
    requestAnimationFrame(frame);
  }

  root.LionScene = { init, playThreat };
})(window);
