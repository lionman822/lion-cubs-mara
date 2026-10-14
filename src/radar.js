// 动态雷达：以巢穴坐标为中心，真实河道 + 推算植被带，显示母狮、幼崽和周边野生动物
(function (root) {
  const G = root.LionGeo;
  const HOUR = 3600 * 1000;

  const STYLE = {
    mom: { name: 'Naramat', color: '#8b5a2b', r: 6 },
    cub: { name: '幼崽', color: '#a8733f', r: 3.6 },
    pride: { name: '狮群母狮', color: '#d9924e', r: 4, ring: '#6b3d17' },
    coalition: { name: 'Satala 联盟', color: '#5a3418', r: 5.2, ring: '#d2ad6a', label: '#e8c88a' },
    nomad: { name: '流浪雄狮', color: '#8a1f1f', r: 5, ring: '#ff8a6a', label: '#ff9f86' },
    hyena: { name: '斑鬣狗', color: '#f2d04b', r: 3.2 },
    leopard: { name: '花豹', color: '#ff8c3a', r: 3.4 },
    baboon: { name: '狒狒', color: '#b392f0', r: 2.2 },
    vervet: { name: '绿猴', color: '#7fdbca', r: 2 },
    cheetah: { name: '猎豹', color: '#ffd6a5', r: 3.2 },
    jackal: { name: '黑背胡狼', color: '#c8743a', r: 2.6, ring: '#2a2420', label: '#e0a070' },
    elephant: { name: '非洲象', color: '#dfe6ec', r: 4.2 },
    buffalo: { name: '非洲水牛', color: '#ef5b52', r: 3.6 },
    hippo: { name: '河马', color: '#0a0a0a', r: 3.8, ring: '#c8c8c8', label: '#d6d6d6' }, // 黑点加浅灰描边，在深色雷达上才看得见
    wildebeest: { name: '角马', color: '#5aa9ff', r: 2.2 },
    zebra: { name: '斑马', color: '#ffffff', r: 2.4 },
    gazelle: { name: '汤氏瞪羚', color: '#86e08a', r: 2 },
    impala: { name: '黑斑羚', color: '#c8e06e', r: 2.2 },
    topi: { name: '黑面狷羚', color: '#a2708f', r: 2.4 },
    warthog: { name: '疣猪', color: '#9aa0a6', r: 2.6 },
    giraffe: { name: '长颈鹿', color: '#ffb703', r: 3.2 },
    car: { name: '游客车辆', color: '#3fd6dc', r: 2.8 },
    cattle: { name: '非法放牧牛群', color: '#e2cfa8', r: 2.2, label: '#f0dcb5' },
    herder: { name: '牧人', color: '#d62828', r: 3 },
    ranger: { name: '巡护队', color: '#5fd37a', r: 3, label: '#9eeeb0' },
    vehicle: { name: '巡护车', color: '#2fb84f', r: 3.5, label: '#9eeeb0' },
  };
  // 捕猎目标的颜色（与上面的动物群一致，补上其余猎物）
  const OWNER = { jackal: { name: '黑背胡狼', color: '#c8743a' }, pride: { name: '狮群', color: '#d9924e' }, lion: { name: 'Naramat', color: '#ff6a50' }, cheetah: { name: '猎豹', color: '#ffd6a5' }, leopard: { name: '花豹', color: '#ff8c3a' }, hyena: { name: '斑鬣狗', color: '#f2d04b' } };
  const THREATS = ['nomad', 'hyena', 'leopard', 'baboon', 'elephant', 'buffalo', 'hippo'];

  // ---------- 几何 ----------
  const waters = G.rivers.map((r) => r.pts).concat(G.streams);
  function segDist(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy || 1;
    let t = ((px - a[0]) * dx + (py - a[1]) * dy) / L;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + dx * t, y = a[1] + dy * t;
    return [Math.hypot(px - x, py - y), x, y];
  }
  function nearestOn(lines, px, py) {
    let best = [1e9, 0, 0];
    for (const P of lines) for (let i = 0; i < P.length - 1; i++) {
      const d = segDist(px, py, P[i], P[i + 1]);
      if (d[0] < best[0]) best = d;
    }
    return best;
  }
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const wob = (t, seed) => (Math.sin(t + seed * 3.1) + Math.sin(t * 1.73 + seed * 1.7) * 0.6 + Math.sin(t * 0.47 + seed * 5.3) * 0.8) / 2.4;

  // 沿河取样点（每 40 米），用于画植被带和放河马
  const riverSamples = [];
  G.rivers.forEach((r, ri) => {
    const P = r.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      const n = Math.max(1, Math.floor(L / 40));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        riverSamples.push({ x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, y: P[i][1] + (P[i + 1][1] - P[i][1]) * t, main: r.name === 'Ntiakitiak River', river: true, nx: -(P[i + 1][1] - P[i][1]) / L, ny: (P[i + 1][0] - P[i][0]) / L });
      }
    }
  });
  const streamSamples = [];
  G.streams.forEach((P) => {
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      const n = Math.max(1, Math.floor(L / 40));
      for (let k = 0; k < n; k++) { const t = k / n; streamSamples.push({ x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, y: P[i][1] + (P[i + 1][1] - P[i][1]) * t }); }
    }
  });

  // 草原取样点（离水 > 650 米）
  const grass = [];
  for (let gx = -3000; gx <= 3000; gx += 250) for (let gy = -3000; gy <= 3000; gy += 250) {
    const d = Math.hypot(gx, gy);
    if (d > 3100) continue;
    if (nearestOn(waters, gx, gy)[0] > 650) grass.push([gx, gy, d]);
  }
  const grassFar = grass.filter((p) => p[2] > 1100 && p[2] < 2900);
  const pickGrass = (seed, list) => { const L = list || grass; return L.length ? L[Math.floor(hash(seed) * L.length)] : [1500, 1500]; };

  const siteXY = (i) => G.sites[i] || [0, 0];
  const siteRiver = G.sites.map(([x, y]) => { const n = nearestOn(G.rivers.map((r) => r.pts), x, y); return [n[1], n[2]]; });

  const tracks = G.tracks.slice().sort((a, b) => b.length - a.length).filter((P) => P.some((p) => Math.hypot(p[0], p[1]) < 2800)).slice(0, 6);

  // ---------- 从生态模拟读取位置（两步之间插值） ----------
  const SPREAD = { topi: 90, jackal: 18, ranger: 18, vehicle: 0, cattle: 110, pride: 45, coalition: 30, nomad: 25, giraffe: 60, baboon: 110, vervet: 85, leopard: 0, cheetah: 25, hyena: 45, elephant: 70, buffalo: 80, hippo: 0, wildebeest: 200, zebra: 120, gazelle: 100, impala: 80, warthog: 35 };
  const frac = (S, now) => Math.max(0, Math.min(1, (now - S.lastTick) / LionSim.STEP));
  const lerpP = (o, f) => [(o.px != null ? o.px : o.x) + (o.x - (o.px != null ? o.px : o.x)) * f, (o.py != null ? o.py : o.y) + (o.y - (o.py != null ? o.py : o.y)) * f];
  // 群居动物的个体分布：分成几个大小不一的小簇，偶尔有落单的；
  // 整群随时间慢慢聚拢又散开，逃跑时挤成一团，灵长类夜里在睡觉的树上抱团
  function members(g, c, now, env) {
    const sp = SPREAD[g.sp] || 40;
    if (sp === 0) return Array.from({ length: g.n }, () => c.slice());
    const th = now / HOUR;
    let coh = 0.65 + 0.4 * wob(th / 2.5, g.id); // 约 0.25（挤在一起）到 1.05（散开）
    if (g.flee && g.flee > now) coh = 0.35;
    if ((g.sp === 'baboon' || g.sp === 'vervet') && env.ph === 'night') coh = 0.25;
    if (g.hunt && g.hunt.phase === 'feed') coh = 0.3; // 围着猎物吃
    const nc = g.n >= 20 ? 3 : g.n >= 7 ? 2 : 1;
    const centers = [];
    for (let k = 0; k < nc; k++) {
      const a = hash(g.id * 7 + k) * Math.PI * 2 + wob(th / 4, g.id + k) * 0.8;
      const d = k === 0 ? 0 : sp * (0.8 + 0.7 * hash(g.id * 11 + k)) * Math.max(coh, 0.4);
      centers.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    const out = [];
    for (let i = 0; i < g.n; i++) {
      // 不均匀地分到各小簇：第一簇最大
      const u = hash(g.id * 13 + i);
      const k = nc === 1 ? 0 : u < 0.55 ? 0 : u < 0.85 || nc === 2 ? 1 : 2;
      const straggler = g.n >= 5 && hash(g.id * 19 + i) < 0.06;
      const a = hash(g.id * 31 + i) * Math.PI * 2 + wob(th / 1.5, g.id + i) * 0.7;
      // 中间密、边上稀：半径取随机数的 1.6 次方
      const r = straggler ? sp * (1 + 0.6 * hash(g.id * 23 + i)) * Math.max(coh, 0.6) : sp * 0.5 * Math.pow(hash(g.id * 17 + i), 1.6) * coh;
      out.push([c[0] + centers[k][0] + Math.cos(a) * r, c[1] + centers[k][1] + Math.sin(a) * r]);
    }
    return out;
  }

  // 最近的威胁事件（用于在巢穴边画红色脉冲）
  function recentThreats(S, now) {
    const res = {};
    for (let i = S.log.length - 1; i >= 0; i--) {
      const e = S.log[i];
      if (now - e.t > 2 * HOUR) break;
      if (e.sp && !res[e.sp]) res[e.sp] = { age: now - e.t };
    }
    return res;
  }

  function momAndCubs(S, now) {
    const a = S.act;
    const f = frac(S, now);
    const den = siteXY(S.den.site);
    const m = S.mother;
    const mom = m.x != null ? lerpP(m, f) : den.slice();
    const alive = S.cubs.filter((c) => c.alive);
    let cubs = alive.map((c, i) => [den[0] + (i ? 9 : -9), den[1] - 6]);
    let target = null, kill = null;
    if (a.type === 'move' && a.to != null) {
      const A = siteXY(a.from != null ? a.from : S.den.site), B = siteXY(a.to);
      const n = Math.max(1, alive.length);
      const p = Math.max(0, Math.min(0.999, (now - a.start) / (a.end - a.start)));
      const k = Math.floor(p * (2 * n - 1));
      const carry = k % 2 === 0 ? k / 2 : -1;
      const done = Math.floor((k + 1) / 2);
      cubs = alive.map((c, i) => (i < done ? [B[0] + (i ? 9 : -9), B[1] - 6] : i === carry ? [mom[0] + 4, mom[1] + 4] : [A[0] + (i ? 9 : -9), A[1] - 6]));
    }
    const E = S.eco;
    if (E && a.type === 'hunt') {
      if ((a.phase === 'stalk' || a.phase === 'chase') && a.targetId) {
        const tg = E.groups.find((g) => g.id === a.targetId);
        if (tg) target = { pos: lerpP(tg, f), from: a.from || mom, prey: tg.sp, mode: a.phase };
      } else if ((a.phase === 'steal' || a.phase === 'join') && a.carcassId) {
        const c = E.carcasses.find((c) => c.id === a.carcassId);
        if (c) target = { pos: [c.x, c.y], from: a.from || mom, prey: c.prey, mode: a.phase, owner: c.owner };
      }
    }
    if (E && a.type === 'feed' && a.carcassId) {
      const c = E.carcasses.find((c) => c.id === a.carcassId);
      kill = c ? [c.x, c.y] : mom;
    }
    return { mom, cubs, kill, den, target };
  }

  // ---------- 底图缓存 ----------
  const cache = {};
  function terrain(size, R, dpr) {
    const key = size + '|' + R + '|' + dpr;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const k = (size / 2 - 4) / R, cx = size / 2, cy = size / 2;
    const X = (x) => cx + x * k, Y = (y) => cy - y * k;
    g.save();
    g.beginPath(); g.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#34452a'; g.fillRect(0, 0, size, size); // 草原
    // 散落灌木丛
    for (let i = 0; i < 260; i++) {
      const x = (hash(i * 2.1) - 0.5) * 7000, y = (hash(i * 3.7) - 0.5) * 7000;
      g.fillStyle = 'rgba(32,52,30,0.55)';
      g.beginPath(); g.arc(X(x), Y(y), Math.max(0.8, (25 + hash(i) * 60) * k), 0, Math.PI * 2); g.fill();
    }
    const blobs = (list, rBase, rVar, col, seed) => {
      g.fillStyle = col;
      list.forEach((s, i) => { const r = (rBase + rVar * (0.5 + 0.5 * Math.sin(i * 0.13 + seed) * Math.cos(i * 0.051 + seed * 2))) * k; g.beginPath(); g.arc(X(s.x), Y(s.y), Math.max(0.6, r), 0, Math.PI * 2); g.fill(); });
    };
    blobs(riverSamples, 260, 220, '#26391f', 1); // 灌丛带
    blobs(streamSamples, 110, 80, '#26391f', 2);
    blobs(riverSamples, 90, 80, '#1b2c18', 3); // 河岸林地
    blobs(streamSamples, 35, 25, '#1b2c18', 4);
    g.fillStyle = 'rgba(27,44,24,0.9)';
    G.wood.forEach((P) => { g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.closePath(); g.fill(); });
    // 车辙路
    g.strokeStyle = 'rgba(190,170,120,0.28)'; g.lineWidth = 0.8; g.setLineDash([3, 3]);
    G.tracks.forEach((P) => { g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); });
    g.setLineDash([]);
    // 河流
    g.lineCap = 'round'; g.lineJoin = 'round';
    G.streams.forEach((P) => { g.strokeStyle = '#2f6478'; g.lineWidth = Math.max(0.8, 6 * k); g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); });
    G.rivers.forEach((r) => { g.strokeStyle = '#3d86a3'; g.lineWidth = Math.max(1.6, 16 * k); g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); });
    // 河名
    g.font = '10px "Songti SC", serif'; g.fillStyle = 'rgba(160,210,230,0.75)';
    const named = {};
    G.rivers.forEach((r) => {
      if (named[r.name]) return;
      const p = r.pts.find((q) => Math.hypot(q[0], q[1]) > R * 0.35 && Math.hypot(q[0], q[1]) < R * 0.8);
      if (p) { named[r.name] = 1; g.fillText({ 'Ntiakitiak River': '恩提亚克河', 'Talek river': '塔莱克河', 'Olare Orok': '奥拉雷奥罗克河' }[r.name] || r.name, X(p[0]) + 4, Y(p[1]) - 4); }
    });
    // 暗化 + 网格
    const vg = g.createRadialGradient(cx, cy, size * 0.2, cx, cy, size / 2);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, size, size);
    g.restore();
    // 距离环
    const step = R <= 1000 ? 250 : R <= 2000 ? 500 : 1000;
    g.strokeStyle = 'rgba(120,230,160,0.22)'; g.lineWidth = 1;
    g.font = '10px -apple-system, sans-serif'; g.fillStyle = 'rgba(160,240,190,0.6)';
    for (let d = step; d <= R + 1; d += step) {
      g.beginPath(); g.arc(cx, cy, d * k, 0, Math.PI * 2); g.stroke();
      g.textAlign = 'left'; g.fillText(d >= 1000 ? d / 1000 + ' km' : d + ' m', cx + 4, cy + d * k - 4);
    }
    g.beginPath(); g.moveTo(cx, 4); g.lineTo(cx, size - 4); g.moveTo(4, cy); g.lineTo(size - 4, cy); g.stroke();
    g.strokeStyle = '#8c7344'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d2ad6a'; g.font = 'bold 11px -apple-system, sans-serif'; g.textAlign = 'center';
    g.fillText('N', cx, 15);
    g.font = '8px -apple-system, sans-serif'; g.fillStyle = 'rgba(200,200,180,0.5)'; g.textAlign = 'right';
    g.fillText('© OpenStreetMap', size - 6, size - 4);
    cache[key] = c;
    return c;
  }

  // 天光：night 0（白天）–1（深夜），warm 0–1（日出日落前后最强）
  function daylight(env) {
    const h = env.h, sr = (env.w && env.w.rise) || 6.35, ss = (env.w && env.w.set) || 18.5;
    let l;
    if (h < sr - 0.6 || h > ss + 0.6) l = 0;
    else if (h < sr + 0.6) l = (h - (sr - 0.6)) / 1.2;
    else if (h > ss - 0.6) l = (ss + 0.6 - h) / 1.2;
    else l = 1;
    const warm = Math.max(0, 1 - Math.min(Math.abs(h - sr), Math.abs(h - ss)) / 1.1);
    return { night: 1 - l, warm };
  }

  // ---------- 绘制 ----------
  function draw(canvas, S, now, env, R) {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.floor(canvas.clientWidth);
    if (!size) return null;
    if (canvas.width !== size * dpr) { canvas.width = canvas.height = size * dpr; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.drawImage(terrain(size, R, dpr), 0, 0, size, size);
    // 昼夜：按巢穴的真实日出日落给地图调色（夜里深蓝、晨昏暖橙、白天不变）；圆点画在上面，始终清楚
    const lt = daylight(env);
    if (lt.night > 0.01 || lt.warm > 0.01) {
      g.save();
      g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2); g.clip();
      if (lt.night > 0.01) { g.fillStyle = `rgba(6,12,34,${0.55 * lt.night})`; g.fillRect(0, 0, size, size); }
      if (lt.warm > 0.01) { g.fillStyle = `rgba(255,140,60,${0.16 * lt.warm})`; g.fillRect(0, 0, size, size); }
      g.restore();
    }
    const k = (size / 2 - 4) / R, cx = size / 2, cy = size / 2;
    const X = (x) => cx + x * k, Y = (y) => cy - y * k;

    const inRange = (p) => Math.hypot(p[0], p[1]) <= R * 1.02;
    const blip = () => 1; // 不做扫描，所有圆点始终全亮
    const dot = (p, st, opts = {}) => {
      if (!inRange(p)) return;
      const b = opts.full ? 1 : blip(p);
      const x = X(p[0]), y = Y(p[1]);
      g.globalAlpha = b;
      g.fillStyle = st.color;
      g.beginPath(); g.arc(x, y, st.r, 0, Math.PI * 2); g.fill();
      const ring = opts.ring || st.ring;
      if (ring) { g.strokeStyle = ring; g.lineWidth = 1.2; g.stroke(); }
      g.globalAlpha = 1;
    };
    const label = (p, text, col, dy = 4) => {
      if (!inRange(p)) return;
      g.font = '11px "Songti SC", serif'; g.textAlign = 'left';
      g.lineWidth = 3; g.strokeStyle = 'rgba(10,16,12,0.85)'; g.strokeText(text, X(p[0]) + 8, Y(p[1]) + dy);
      g.fillStyle = col; g.fillText(text, X(p[0]) + 8, Y(p[1]) + dy);
    };

    // 涨水：河道随水位变宽（水位 0.15 米以上才画）
    const lvl = (S.river && S.river.level) || 0;
    if (lvl > 0.15) {
      g.save();
      g.beginPath(); g.arc(cx, cy, size / 2 - 3, 0, Math.PI * 2); g.clip();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = `rgba(110,170,200,${Math.min(0.55, 0.2 + lvl * 0.2)})`;
      g.lineWidth = Math.max(2, (16 + lvl * 90) * k);
      G.rivers.forEach((r) => { g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); });
      g.restore();
    }
    // 候选巢穴
    G.sites.forEach((s, i) => {
      if (i === S.den.site) return;
      g.strokeStyle = 'rgba(210,173,106,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.arc(X(s[0]), Y(s[1]), 3, 0, Math.PI * 2); g.stroke();
    });
    const den = siteXY(S.den.site);
    g.strokeStyle = '#d2ad6a'; g.lineWidth = 1.4; g.setLineDash([2, 2]);
    g.beginPath(); g.arc(X(den[0]), Y(den[1]), 11, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);

    // 野生动物（来自生态模拟）
    const E = S.eco || { groups: [], carcasses: [] };
    const f = frac(S, now);
    const recent = recentThreats(S, now);
    const ent = {};
    const ids = {}; // 每个点属于哪一群，用来记住“是否显示数量”的状态
    const extras = [];
    const arrow = (from, to, col, solid, width) => {
      const x0 = X(from[0]), y0 = Y(from[1]), x1 = X(to[0]), y1 = Y(to[1]);
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 10) return;
      const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      const ex = x1 - ux * 6, ey = y1 - uy * 6;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = width;
      g.setLineDash(solid ? [] : [4, 3]);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
      g.setLineDash([]);
      const hw = width + 2.5;
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - ux * (hw * 2) - uy * hw, ey - uy * (hw * 2) + ux * hw); g.lineTo(ex - ux * (hw * 2) + uy * hw, ey - uy * (hw * 2) - ux * hw); g.closePath(); g.fill();
    };
    const centers = {};
    for (const gr of E.groups) {
      const c = lerpP(gr, f);
      centers[gr.id] = c;
      let pts = members(gr, c, now, env);
      pts = separate(pts, (STYLE[gr.sp].r * 2 + 1) / k); // 允许挨着，但不重叠
      (ent[gr.sp] = ent[gr.sp] || []).push(...pts);
      ids[gr.sp] = (ids[gr.sp] || []).concat(pts.map(() => gr.id));
      if (gr.sp === 'ranger' || gr.sp === 'vehicle') {
        // 巡护：绿色三角是巡护员，绿色方块（白边）是巡护车
        if (gr.sp === 'vehicle' && inRange(c)) extras.push({ p: c, text: '巡护车·' + (gr.shift === 'night' ? '夜班' : '日班'), col: STYLE.vehicle.label });
        g.fillStyle = STYLE[gr.sp].color; g.strokeStyle = '#eafff0'; g.lineWidth = 1.2;
        pts.forEach((p) => {
          if (!inRange(p)) return;
          const x = X(p[0]), y = Y(p[1]);
          g.beginPath();
          if (gr.sp === 'vehicle') g.rect(x - 4, y - 3, 8, 6); else { g.moveTo(x, y - 5); g.lineTo(x + 4.5, y + 3.5); g.lineTo(x - 4.5, y + 3.5); g.closePath(); }
          g.fill(); g.stroke();
        });
        continue;
      }
      if (gr.sp === 'cattle') {
        // 人和牲畜用方块、三角，和野生动物的圆点区分开
        g.fillStyle = STYLE.cattle.color;
        pts.forEach((p) => { if (inRange(p)) g.fillRect(X(p[0]) - 2, Y(p[1]) - 2, 4, 4); });
        const hs = [];
        for (let i = 0; i < (gr.herders || 2); i++) {
          const a = hash(gr.id * 5) * Math.PI * 2 + i * (Math.PI * 2 / (gr.herders || 2)) + wob(now / HOUR, gr.id + i) * 0.4, rr = SPREAD.cattle * (0.9 + 0.3 * hash(gr.id * 9 + i)); // 牧人围在牛群四周
          hs.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
        }
        g.fillStyle = STYLE.herder.color; g.strokeStyle = '#ffd6d6'; g.lineWidth = 1;
        hs.forEach((p) => { if (!inRange(p)) return; const x = X(p[0]), y = Y(p[1]); g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4.5, y + 3.5); g.lineTo(x - 4.5, y + 3.5); g.closePath(); g.fill(); g.stroke(); });
        ent.herder = (ent.herder || []).concat(hs);
        continue;
      }
      pts.forEach((p) => dot(p, STYLE[gr.sp]));
      if (gr.sp === 'giraffe' && gr.calf) {
        const cp = [c[0] + 4 / k, c[1] - 4 / k];
        dot(cp, { color: STYLE.giraffe.color, r: 1.8 }, { ring: '#fff3c4' });
        (ent.giraffeCalf = ent.giraffeCalf || []).push(cp);
        extras.push({ p: cp, text: '长颈鹿幼崽', col: '#ffd166' });
      }
      if (gr.injured) {
        g.strokeStyle = 'rgba(255,90,70,0.9)'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(X(c[0]), Y(c[1]), STYLE[gr.sp].r + 4, 0, Math.PI * 2); g.stroke();
        extras.push({ p: c, text: '受伤的' + STYLE[gr.sp].name, col: '#ffb4a6' });
      }
      const rc = recent[gr.sp];
      if (rc && rc.age < 40 * 60000 && LionRadar.THREATS.includes(gr.sp)) {
        const pulse = (performance.now() % 1200) / 1200;
        g.strokeStyle = `rgba(255,90,70,${1 - pulse})`; g.lineWidth = 1.5;
        g.beginPath(); g.arc(X(pts[0][0]), Y(pts[0][1]), 6 + pulse * 14, 0, Math.PI * 2); g.stroke();
      }
    }
    // 雷达范围外的狮子：在边缘钉一个指向它们的小箭头，写上距离（标签交给统一的避让排版）
    const EDGE = { pride: '狮群', coalition: 'Satala 联盟', nomad: '流浪雄狮', cattle: '非法放牧牛群', ranger: '巡护队', vehicle: '巡护车' };
    const edgeLabels = [];
    const usedAng = [];
    for (const gr of E.groups) {
      if (!EDGE[gr.sp] || gr.leaving) continue; // 正在离开的（回站、被赶走）不再标在边上
      const c = centers[gr.id];
      if (Math.hypot(c[0], c[1]) <= R * 0.97) continue;
      let ang = Math.atan2(c[0], c[1]); // 从正北顺时针
      // 方向几乎一样的，错开 8°，箭头不叠在一起
      while (usedAng.some((a) => Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) < 0.14)) ang += 0.14;
      usedAng.push(ang);
      const rr = size / 2 - 12;
      const mx = cx + Math.sin(ang) * rr, my = cy - Math.cos(ang) * rr;
      const ux = Math.sin(ang), uy = -Math.cos(ang);
      const st = STYLE[gr.sp];
      g.fillStyle = st.color; g.strokeStyle = st.ring || '#f3dcb4'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(mx + ux * 8, my + uy * 8);
      g.lineTo(mx - ux * 4 - uy * 6, my - uy * 4 + ux * 6);
      g.lineTo(mx - ux * 4 + uy * 6, my - uy * 4 - ux * 6);
      g.closePath(); g.fill(); g.stroke();
      const dk = Math.hypot(c[0] - den[0], c[1] - den[1]) / 1000;
      edgeLabels.push({ x: mx - ux * 4, y: my - uy * 4, text: `${EDGE[gr.sp]} ${dk.toFixed(1)} km`, col: st.label || st.color });
    }

    // 其他捕食者的捕猎：潜伏虚线、追逐实线（细箭头，捕食者自己的颜色）
    for (const gr of E.groups) {
      if (!gr.hunt || (gr.hunt.phase !== 'stalk' && gr.hunt.phase !== 'chase')) continue;
      const tg = E.groups.find((o) => o.id === gr.hunt.tid);
      if (!tg) continue;
      arrow(gr.hunt.from || centers[gr.id], centers[tg.id], STYLE[gr.sp].color, gr.hunt.phase === 'chase', gr.hunt.phase === 'chase' ? 1.6 : 1.1);
    }
    // 猎物残骸：颜色表示谁在吃
    for (const c of E.carcasses) {
      if (!inRange([c.x, c.y])) continue;
      const o = OWNER[c.owner] || { name: '腐肉', color: '#b8b0a0' };
      const x = X(c.x), y = Y(c.y);
      g.strokeStyle = o.color; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke();
      const pn = LionSim.preyLabel(c.prey);
      extras.push({ p: [c.x, c.y], text: c.owner ? `${o.name}·${pn}${c.owner === 'leopard' ? (c.tree ? '（树上）' : '（地上）') : ''}` : `腐肉·${pn}`, col: o.color });
    }

    // 正在发生的可目击事件：15 分钟内在雷达上闪烁标出，玩家可以赶来看
    if (window.LionMedals) for (const p of S.sightPending || []) {
      if (now - p.t > LionMedals.WINDOW || p.x == null || !inRange([p.x, p.y])) continue;
      const pulse = (performance.now() % 1500) / 1500;
      g.strokeStyle = `rgba(255,236,170,${0.9 - pulse * 0.8})`; g.lineWidth = 2;
      g.beginPath(); g.arc(X(p.x), Y(p.y), 8 + pulse * 18, 0, Math.PI * 2); g.stroke();
      extras.unshift({ p: [p.x, p.y], text: `● 正在发生：${LionMedals.SIGHT_NAME[p.type] || ''}`, col: '#fff1b8' });
    }

    // 游客车辆（白天，在车辙路上）
    const h = env.h;
    ent.car = [];
    if (LionSim.touristHours(h)) { // 游客车辆只在 6:00–19:00 游猎
      const n = env.checked ? 2 : 4;
      for (let i = 0; i < n && i < tracks.length; i++) {
        const P = tracks[i];
        const u = ((now / HOUR) * (0.35 + hash(i) * 0.3) + hash(i + 9)) % 2;
        const ff = (u < 1 ? u : 2 - u) * (P.length - 1);
        const j = Math.min(P.length - 2, Math.floor(ff)), t = ff - j;
        const p = [P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t];
        ent.car.push(p);
        if (inRange(p)) { g.globalAlpha = blip(p); g.fillStyle = STYLE.car.color; g.fillRect(X(p[0]) - 2.5, Y(p[1]) - 2.5, 5, 5); g.globalAlpha = 1; }
      }
    }

    // 母狮与幼崽（始终高亮）
    const mc = momAndCubs(S, now);
    // 母狮固定不动，只把幼崽推开，保证每只都看得见
    if (mc.cubs.length) mc.cubs = separate([mc.mom].concat(mc.cubs), (STYLE.mom.r + STYLE.cub.r + 3) / k, true).slice(1);
    if (Math.hypot(mc.mom[0] - den[0], mc.mom[1] - den[1]) > 40) {
      g.strokeStyle = 'rgba(200,140,80,0.5)'; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(den[0]), Y(den[1])); g.lineTo(X(mc.mom[0]), Y(mc.mom[1])); g.stroke(); g.setLineDash([]);
    }
    mc.cubs.forEach((p) => dot(p, STYLE.cub, { full: true, ring: '#f3dcb4' }));
    // 母狮的捕猎目标：潜伏、去抢时虚线箭头，追逐时实线箭头。箭头从这一阶段的起点画到猎物
    if (mc.target && inRange(mc.target.pos)) {
      const tp = mc.target.pos;
      const chase = mc.target.mode === 'chase';
      arrow(mc.target.from, tp, chase ? '#ffb070' : 'rgba(255,214,150,0.95)', chase, chase ? 2.2 : 1.6);
      const pn = LionSim.preyLabel(mc.target.prey);
      if (mc.target.mode === 'join') {
        extras.unshift({ p: tp, text: `去狮群分食${pn}`, col: '#ffd29a' });
      } else if (mc.target.mode === 'steal') {
        const o = OWNER[mc.target.owner];
        extras.unshift({ p: tp, text: `去抢${o ? o.name + '的' : ''}${pn}`, col: '#ffd29a' });
      } else {
        g.strokeStyle = '#ffd29a'; g.lineWidth = 1.4;
        g.beginPath(); g.arc(X(tp[0]), Y(tp[1]), 7, 0, Math.PI * 2); g.stroke();
        extras.unshift({ p: tp, text: pn + (chase ? '（追逐中）' : '（潜伏中）'), col: '#ffd29a' });
      }
    }
    // 捕猎成功：母狮圆点持续闪烁，直到回到巢穴
    const won = S.act.type === 'feed' || (S.act.type === 'return' && S.act.result && S.act.result.kill);
    const blinkOn = !won || Math.floor(performance.now() / 350) % 2 === 0;
    if (won) {
      const pulse = (performance.now() % 1400) / 1400;
      g.strokeStyle = `rgba(255,200,120,${1 - pulse})`; g.lineWidth = 1.6;
      g.beginPath(); g.arc(X(mc.mom[0]), Y(mc.mom[1]), STYLE.mom.r + 2 + pulse * 12, 0, Math.PI * 2); g.stroke();
    }
    if (blinkOn) dot(mc.mom, STYLE.mom, { full: true, ring: '#f3dcb4' });
    else dot(mc.mom, { color: '#f3dcb4', r: STYLE.mom.r }, { full: true });
    ent.mom = [mc.mom];
    ent.cub = mc.cubs;
    labelGroups(g, ent, X, Y, inRange, size, recent, extras, ids, edgeLabels);
    if (mc.target && (mc.target.mode === 'stalk' || mc.target.mode === 'chase')) drawInset(g, size, mc, ent, S); // 特写只给近距离的潜行、冲刺
    return { ent, den, mom: mc.mom, kill: mc.kill };
  }

  // 给每群动物标注名字：同种、屏幕上相距较近（约雷达直径 6.5%）的点合为一群；标签互相避让
  const countShown = {}; // 群 id → 当前是否显示数量（带回差，避免闪烁）
  function labelGroups(g, ent, X, Y, inRange, size, recent, extras, ids, edgeLabels) {
    const placed = [];
    const hit = (r) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    g.font = '11px "Songti SC", serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const put = (cx, cy, rad, text, col) => {
      const w = g.measureText(text).width + 4, h = 13;
      const off = rad + 4;
      const tries = [[off, -h / 2], [-off - w, -h / 2], [-w / 2, -off - h], [-w / 2, off], [off, -h - 2], [off, 2], [-off - w, -h - 2], [-off - w, 2]];
      let rect = null;
      for (const [dx, dy] of tries) {
        const r = { x: cx + dx, y: cy + dy, w, h };
        if (r.x < 2 || r.x + w > size - 2 || r.y < 2 || r.y + h > size - 2) continue;
        if (!hit(r)) { rect = r; break; }
      }
      if (!rect) rect = { x: Math.max(2, Math.min(size - w - 2, cx + off)), y: cy - h / 2, w, h };
      placed.push(rect);
      g.lineWidth = 3; g.strokeStyle = 'rgba(8,14,10,0.9)';
      g.strokeText(text, rect.x + 2, rect.y + h / 2);
      g.fillStyle = col; g.fillText(text, rect.x + 2, rect.y + h / 2);
    };
    // 先放母狮、幼崽，再放捕猎目标、残骸等提示，最后放各种动物
    const order = ['mom', 'cub', 'ranger', 'cattle', 'herder', 'nomad', 'coalition', 'pride', 'hyena', 'leopard', 'cheetah', 'jackal', 'baboon', 'vervet', 'elephant', 'buffalo', 'hippo', 'giraffe', 'car', 'warthog', 'impala', 'topi', 'wildebeest', 'zebra', 'gazelle'];
    const groups = (sp) => {
      const all = ent[sp] || [], gid = (ids && ids[sp]) || [];
      const clusters = [];
      all.forEach((wp, i) => {
        if (!inRange(wp)) return;
        const p = [X(wp[0]), Y(wp[1])];
        const c = clusters.find((c) => Math.hypot(c.x - p[0], c.y - p[1]) < Math.max(22, size * 0.065));
        if (c) { c.pts.push(p); c.n++; c.x = (c.x * (c.n - 1) + p[0]) / c.n; c.y = (c.y * (c.n - 1) + p[1]) / c.n; if (gid[i] != null) c.key = Math.min(c.key, gid[i]); }
        else clusters.push({ x: p[0], y: p[1], n: 1, pts: [p], key: gid[i] != null ? gid[i] : Infinity });
      });
      for (const c of clusters) c.r = Math.max(0, ...c.pts.map((p) => Math.hypot(p[0] - c.x, p[1] - c.y)));
      return clusters;
    };
    // 聚成一团（点挨着点、数不清）时，在名字后面标上数量。
    // 两道门槛：挤得够紧才显示，散得够开才隐藏，中间保持原状，免得来回闪
  // 狒狒群人数多、散开也数不清，始终标数量
    const ALWAYS_COUNT = { baboon: true, cheetah: true, jackal: true, cattle: true, herder: true };
    const tight = (sp, c) => {
      if (ALWAYS_COUNT[sp] && c.n >= 2) return true;
      if (c.n < 3 || sp === 'mom' || sp === 'cub' || sp === 'car') return false;
      const base = (STYLE[sp].r * 2 + 1) * Math.sqrt(c.n);
      const key = sp + ':' + c.key;
      const was = !!countShown[key];
      const now = was ? c.r <= base * 1.0 : c.r <= base * 0.7;
      countShown[key] = now;
      return now;
    };
    const species = (sp) => {
      for (const c of groups(sp)) {
        const alert = recent && recent[sp] && recent[sp].age < 40 * 60000 && LionRadar.THREATS.includes(sp);
        const col = sp === 'mom' || sp === 'cub' ? '#f3dcb4' : alert ? '#ffb4a6' : STYLE[sp].label || STYLE[sp].color;
        const name = sp === 'mom' ? 'Naramat' : STYLE[sp].name;
        put(c.x, c.y, c.r + STYLE[sp].r, tight(sp, c) ? `${name} ×${c.n}` : name, col);
      }
    };
    species('mom'); species('cub');
    for (const e of edgeLabels || []) put(e.x, e.y, 8, e.text, e.col); // 边缘的狮子标签优先占位
    for (const e of extras || []) if (inRange(e.p)) put(X(e.p[0]), Y(e.p[1]), 6, e.text, e.col);
    for (const sp of order.slice(2)) species(sp);
    g.textBaseline = 'alphabetic';
  }

  // 把屏幕上重叠的点推开到至少 minD（米）的距离；pinFirst 时第一个点不动
  function separate(pts, minD, pinFirst) {
    const P = pts.map((p) => [p[0], p[1]]);
    for (let it = 0; it < 12; it++) {
      let moved = false;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        let dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
        let d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 1e-6) { const a = (i * 7 + j * 13) % 360 * Math.PI / 180; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
        const push = (minD - d) / d;
        if (pinFirst && i === 0) { P[j][0] += dx * push; P[j][1] += dy * push; }
        else { P[i][0] -= dx * push / 2; P[i][1] -= dy * push / 2; P[j][0] += dx * push / 2; P[j][1] += dy * push / 2; }
        moved = true;
      }
      if (!moved) break;
    }
    return P;
  }

  // 狩猎特写：母狮在 100 米内潜行、30 米内冲刺，主雷达上太小，在右下角放大显示
  function drawInset(g, size, mc, ent, S) {
    const r = Math.round(size * 0.17);
    const cx = size - r - 6, cy = size - r - 6;
    const ctr = mc.mom;
    const tp = mc.target.pos;
    const dT = Math.hypot(tp[0] - ctr[0], tp[1] - ctr[1]);
    const Rm = Math.max(130, Math.min(600, dT * 1.25));
    const k2 = (r - 6) / Rm;
    const X2 = (x) => cx + (x - ctr[0]) * k2, Y2 = (y) => cy - (y - ctr[1]) * k2;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,18,13,0.94)'; g.fill();
    g.strokeStyle = '#d2ad6a'; g.lineWidth = 1.6; g.stroke();
    g.clip();
    // 30 米、100 米参考圈
    g.font = '9px -apple-system, sans-serif'; g.textAlign = 'left';
    for (const [d, col] of [[30, 'rgba(255,176,112,0.55)'], [100, 'rgba(255,214,150,0.4)']]) {
      if (d > Rm) continue;
      g.strokeStyle = col; g.setLineDash([2, 3]); g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, d * k2, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]); g.fillStyle = col; g.fillText(d + ' m', cx + 2, cy - d * k2 - 2);
    }
    // 附近的动物
    for (const sp in ent) {
      if (!STYLE[sp] || sp === 'mom' || sp === 'cub') continue;
      for (const p of ent[sp]) {
        if (Math.hypot(p[0] - ctr[0], p[1] - ctr[1]) > Rm) continue;
        g.fillStyle = STYLE[sp].color;
        g.beginPath(); g.arc(X2(p[0]), Y2(p[1]), Math.max(2, STYLE[sp].r * 0.9), 0, Math.PI * 2); g.fill();
      }
    }
    // 箭头：潜行 / 去抢虚线，冲刺实线
    const fp = mc.target.from || ctr;
    const chase = mc.target.mode === 'chase';
    const x0 = X2(fp[0]), y0 = Y2(fp[1]), x1 = X2(tp[0]), y1 = Y2(tp[1]);
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L > 8) {
      const ux = (x1 - x0) / L, uy = (y1 - y0) / L, ex = x1 - ux * 7, ey = y1 - uy * 7;
      g.strokeStyle = g.fillStyle = chase ? '#ffb070' : 'rgba(255,214,150,0.95)';
      g.lineWidth = chase ? 2.4 : 1.8; g.setLineDash(chase ? [] : [5, 3]);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - ux * 9 - uy * 5, ey - uy * 9 + ux * 5); g.lineTo(ex - ux * 9 + uy * 5, ey - uy * 9 - ux * 5); g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffd29a'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(x1, y1, 6, 0, Math.PI * 2); g.stroke();
    g.fillStyle = STYLE.mom.color; g.strokeStyle = '#f3dcb4'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
    // 标题与距离（写在放大圈内部底部，不和雷达上的标签打架）
    const phase = { stalk: '潜行', chase: '冲刺', steal: '去抢', join: '去狮群分食' }[mc.target.mode] || '';
    g.save();
    g.beginPath(); g.arc(cx, cy, r - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(8,14,10,0.85)'; g.fillRect(cx - r, cy + r * 0.5, r * 2, r);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '10px "Songti SC", serif'; g.fillStyle = '#a39a82';
    g.fillText('狩猎特写', cx, cy + r * 0.62);
    g.font = '11px "Songti SC", serif'; g.fillStyle = '#ffd29a';
    g.fillText(`${phase}${LionSim.preyLabel(mc.target.prey)} · 相距 ${Math.round(dT)} 米`, cx, cy + r * 0.78);
    g.restore();
    g.textAlign = 'left';
  }

  function bearing(dx, dy) {
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    return dirs[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 / 45) % 8];
  }

  root.LionRadar = { daylight, draw, STYLE, THREATS, bearing };
})(window);
