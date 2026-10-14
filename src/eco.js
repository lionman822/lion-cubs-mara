// 生态系统：巢穴周边各种动物群的位置与行为（领地、避让、捕食、抢夺猎物）
// 每 10 分钟随主模拟推进一步，状态存进存档；雷达在两步之间插值显示
(function (root) {
  const G = root.LionGeo;
  const HOUR = 3600 * 1000;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- 地形 ----------
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
  const riverLines = G.rivers.map((r) => r.pts);
  const waterLines = riverLines.concat(G.streams);
  // 离水距离网格（100 米一格），用来判断林地 / 灌丛 / 草原
  const GR = 3600, GS = 100, GN = (GR * 2) / GS + 1;
  const dwGrid = new Float32Array(GN * GN);
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) dwGrid[i * GN + j] = nearestOn(waterLines, -GR + j * GS, -GR + i * GS)[0];
  function distWater(x, y) {
    const j = Math.round((x + GR) / GS), i = Math.round((y + GR) / GS);
    if (i < 0 || j < 0 || i >= GN || j >= GN) return 2000;
    return dwGrid[i * GN + j];
  }
  function habitatOf(x, y) { const d = distWater(x, y); return d < 150 ? 'wood' : d < 450 ? 'bush' : 'grass'; }
  const HAB_OK = {
    wood: (h) => h === 'wood', bush: (h) => h === 'bush', grass: (h) => h === 'grass',
    edge: (h) => h === 'bush' || h === 'wood', open: (h) => h === 'grass' || h === 'bush', any: () => true,
  };

  // 沿主河道取样（河马、林地动物的家）
  const riverPts = [];
  G.rivers.forEach((r) => {
    const P = r.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) || 1;
      const n = Math.max(1, Math.floor(L / 60));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        riverPts.push({ x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, y: P[i][1] + (P[i + 1][1] - P[i][1]) * t, nx: -(P[i + 1][1] - P[i][1]) / L, ny: (P[i + 1][0] - P[i][0]) / L, main: r.name === 'Ntiakitiak River' });
      }
    }
  });
  function pointAt(minD, maxD, hab, avoid) {
    for (let k = 0; k < 400; k++) {
      const a = Math.random() * Math.PI * 2, d = rnd(minD, maxD);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!HAB_OK[hab](habitatOf(x, y))) continue;
      if (avoid && avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 600)) continue;
      return { x, y };
    }
    return { x: minD, y: 0 };
  }
  function riverPointAt(minD, maxD) {
    const c = riverPts.filter((p) => p.main && Math.hypot(p.x, p.y) > minD && Math.hypot(p.x, p.y) < maxD);
    return c.length ? pick(c) : riverPts[0];
  }
  function woodPointAt(minD, maxD, avoid) {
    for (let k = 0; k < 200; k++) {
      const p = riverPointAt(minD, maxD);
      const side = Math.random() < 0.5 ? 1 : -1;
      const q = { x: p.x + p.nx * 70 * side, y: p.y + p.ny * 70 * side };
      if (!avoid || !avoid.some((a) => Math.hypot(a.x - q.x, a.y - q.y) < 600)) return q;
    }
    return { x: minD, y: 0 };
  }

  // ---------- 物种 ----------
  // hab：活动生境；active：活跃时段；speed：每 10 分钟最多移动的米数；range：领地/家域半径
  const SPEC = {
    baboon: { name: '狒狒群', hab: 'wood', active: 'day', speed: 220, range: 450, territorial: true },
    vervet: { name: '绿猴群', hab: 'wood', active: 'day', speed: 200, range: 350, territorial: true },
    leopard: { name: '花豹', hab: 'wood', active: 'any', speed: 350, range: 900, predator: true }, // 主要夜里伏击，白天也会伺机出手
    cheetah: { name: '猎豹', hab: 'grass', active: 'day', speed: 400, range: 1600, predator: true },
    // 黑背胡狼：日行、领地型、成对活动，以食腐为主，偶尔捕汤氏瞪羚幼崽
    jackal: { name: '黑背胡狼', hab: 'open', active: 'day', speed: 300, range: 450, predator: true, territorial: true },
    hyena: { name: '斑鬣狗', hab: 'open', active: 'night', speed: 600, range: 1600, predator: true },
    elephant: { name: '非洲象', hab: 'any', active: 'any', speed: 250, range: 1600, big: 320 },
    buffalo: { name: '非洲水牛', hab: 'open', active: 'any', speed: 180, range: 1300, big: 260 },
    hippo: { name: '河马', hab: 'river', active: 'night', speed: 160, range: 300, big: 200 },
    wildebeest: { name: '角马', hab: 'grass', active: 'any', speed: 200, range: 1200, prey: true },
    zebra: { name: '斑马', hab: 'grass', active: 'any', speed: 200, range: 1100, prey: true },
    gazelle: { name: '汤氏瞪羚', hab: 'grass', active: 'any', speed: 150, range: 1000, prey: true },
    impala: { name: '黑斑羚', hab: 'edge', active: 'any', speed: 160, range: 700, prey: true },
    topi: { name: '黑面狷羚', hab: 'grass', active: 'any', speed: 200, range: 1100, prey: true }, // 转角牛羚，喜欢开阔草原，很机敏
    warthog: { name: '疣猪', hab: 'open', active: 'day', speed: 120, range: 600, prey: true },
    giraffe: { name: '长颈鹿', hab: 'edge', active: 'any', speed: 180, range: 1500, prey: true },
    // 狮群：母狮合作捕猎；雄狮联盟巡视领地；流浪雄狮偶尔闯入
    pride: { name: '狮群母狮', hab: 'open', active: 'any', speed: 350, range: 1500, predator: true, lion: true },
    coalition: { name: 'Satala 联盟', hab: 'open', active: 'any', speed: 400, range: 2400, lion: true },
    nomad: { name: '流浪雄狮', hab: 'open', active: 'any', speed: 400, range: 900, lion: true },
    cattle: { name: '牛群', hab: 'open', active: 'any', speed: 250, range: 600, human: true }, // 非法放牧，牧人赶着
    ranger: { name: '巡护队', hab: 'any', active: 'any', speed: 300, range: 0, human: true, patrol: true },
    vehicle: { name: '巡护车', hab: 'any', active: 'any', speed: 1500, range: 0, human: true, patrol: true },
  };

  function mk(id, sp, n, home, extra) {
    return Object.assign({ id, sp, n, x: home.x, y: home.y, px: home.x, py: home.y, hx: home.x, hy: home.y, tx: home.x, ty: home.y, retarget: 0, state: 'roam', until: 0, hunt: null, lastKill: 0, injured: 0, flee: 0 }, extra || {});
  }

  function init(t0) {
    t0 = t0 || Date.now();
    const homes = [];
    const wood = (a, b) => { const p = woodPointAt(a, b, homes); homes.push(p); return p; };
    const groups = [];
    let id = 1;
    // 狒狒、绿猴通常几十只一群
    groups.push(mk(id++, 'baboon', 30, wood(500, 900)));
    groups.push(mk(id++, 'vervet', rint(20, 40), wood(450, 900)));
    groups.push(mk(id++, 'leopard', 1, wood(800, 1400)));
    groups.push(mk(id++, 'cheetah', 2, pointAt(1300, 2300, 'grass')));
    // 三对黑背胡狼，各占一块草原领地，彼此相隔至少 900 米
    const jHomes = [];
    for (let i = 0; i < 3; i++) {
      let p = null;
      for (let k = 0; k < 60 && !p; k++) { const q = pointAt(500, 2400, 'grass'); if (jHomes.every((h) => Math.hypot(h.x - q.x, h.y - q.y) > 900)) p = q; }
      p = p || pointAt(500, 2400, 'grass');
      jHomes.push(p);
      groups.push(mk(id++, 'jackal', 2, p));
    }
    groups.push(mk(id++, 'hyena', rint(3, 8), pointAt(1000, 1900, 'open'), { plan: null, nightKey: '' }));
    groups.push(mk(id++, 'elephant', rint(4, 7), pointAt(1200, 2300, 'any')));
    groups.push(mk(id++, 'buffalo', rint(7, 12), pointAt(1100, 2200, 'open')));
    for (let i = 0; i < 4; i++) { const p = riverPointAt(250, 1700); groups.push(mk(id++, 'hippo', 1, { x: p.x, y: p.y }, { nx: p.nx, ny: p.ny })); }
    groups.push(mk(id++, 'wildebeest', rint(12, 16), pointAt(1300, 2700, 'grass'), { migratory: true }));
    groups.push(mk(id++, 'wildebeest', rint(10, 14), pointAt(1300, 2700, 'grass'), { migratory: true }));
    groups.push(mk(id++, 'zebra', rint(7, 9), pointAt(900, 2200, 'grass')));
    groups.push(mk(id++, 'gazelle', rint(6, 8), pointAt(1000, 2500, 'grass')));
    groups.push(mk(id++, 'impala', rint(8, 12), pointAt(400, 1300, 'edge')));
    groups.push(mk(id++, 'topi', rint(8, 12), pointAt(900, 2300, 'grass'))); // 数量和黑斑羚差不多
    groups.push(mk(id++, 'warthog', rint(3, 5), pointAt(500, 1400, 'open')));
    // 两群长颈鹿，有时带着刚出生的幼崽
    for (let i = 0; i < 2; i++) groups.push(mk(id++, 'giraffe', rint(4, 9), pointAt(600, 2200, 'edge'), { calf: Math.random() < 0.5 ? t0 + rnd(5, 25) * 24 * HOUR : 0 }));
    const ph = pointAt(2300, 3000, 'open');
    groups.push(mk(id++, 'pride', 4, ph, { home0: { x: ph.x, y: ph.y } }));
    const ch = { x: ph.x + rnd(-400, 400), y: ph.y + rnd(-400, 400) };
    groups.push(mk(id++, 'coalition', 3, ch, { home0: ch }));
    return { groups, carcasses: [], nextId: id, lastNight: '', lastRoar: 0, grazeAng: 0 };
  }

  // ---------- 时段 ----------
  function isActive(sp, ph) {
    const a = SPEC[sp].active;
    if (a === 'any') return true;
    if (a === 'day') return ph === 'day' || ph === 'dawn' || ph === 'dusk';
    if (a === 'night') return ph === 'night' || ph === 'dawn' || ph === 'dusk';
    return true;
  }
  function migrationGone(t) {
    const d = new Date(t + 3 * HOUR);
    return d.getUTCMonth() >= 10 && !(d.getUTCMonth() === 10 && d.getUTCDate() < 15);
  }

  function moveToward(g, tx, ty, speed) {
    const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const s = Math.min(speed, d);
    g.x += (dx / d) * s; g.y += (dy / d) * s;
    // 不出雷达外太远
    const r = Math.hypot(g.x, g.y);
    if (r > 3300) { g.x *= 3300 / r; g.y *= 3300 / r; }
    return s >= d - 1;
  }
  function newTarget(g, t) {
    const S = SPEC[g.sp];
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * S.range;
      const x = g.hx + Math.cos(a) * d, y = g.hy + Math.sin(a) * d;
      if (S.hab === 'river' || HAB_OK[S.hab](habitatOf(x, y))) { g.tx = x; g.ty = y; break; }
    }
    g.retarget = t + rnd(2, 6) * HOUR;
  }

  const byId = (E, id) => E.groups.find((g) => g.id === id);
  const near = (E, g, sps, R) => E.groups.filter((o) => o !== g && sps.includes(o.sp) && dist(o, g) < R).sort((a, b) => dist(a, g) - dist(b, g));

  // 生态事件写进日记（kind = 'eco'）。用 esp 记物种，避免和巢穴威胁事件混淆
  // 可以“亲眼看见”的事件：放进待目击列表，15 分钟内玩家开着游戏就算看见（见 medals.js）
  function sight(s, t, type, data) {
    s.sightPending = s.sightPending || [];
    s.sightPending.push(Object.assign({ type, t }, data || {}));
    if (s.sightPending.length > 30) s.sightPending.shift();
  }
  function event(s, t, text, extra) {
    s.log.push({ t, kind: 'eco', text, tip: null, esp: extra && extra.sp });
    if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
    s.rev++;
  }

  function addCarcass(E, t, x, y, prey, owner, kg, tree) {
    const c = { id: E.nextId++, x, y, prey, owner, kg, t, tree: !!tree, ownerUntil: 0 };
    E.carcasses.push(c);
    return c;
  }

  // ---------- 每一步 ----------
  function step(s, t, env, ctx) {
    const E = s.eco;
    const ph = env.ph;
    const mom = s.mother;
    for (const g of E.groups) { g.px = g.x; g.py = g.y; }

    // 斑鬣狗：每晚重新分群（3–8 只），一半的夜晚自己捕猎，一半找腐肉
    const nightKey = new Date(t + 3 * HOUR - 12 * HOUR).toISOString().slice(0, 10);
    if (E.lastNight !== nightKey && ph === 'dusk') {
      E.lastNight = nightKey;
      for (const g of E.groups) if (g.sp === 'hyena') { g.n = rint(3, 8); g.plan = Math.random() < 0.5 ? 'hunt' : 'scavenge'; g.hunt = null; }
    }
    // 偶尔有河马或水牛受伤（打斗、陷入泥潭），成为鬣狗的目标
    for (const g of E.groups) {
      if ((g.sp === 'hippo' || g.sp === 'buffalo') && !g.injured && Math.random() < 0.00015) {
        g.injured = t + rnd(2, 4) * 24 * HOUR;
        event(s, t, `一头${SPEC[g.sp].name}在打斗中受了伤，行动变得迟缓。`, { sp: g.sp });
      }
      if (g.injured && t > g.injured) g.injured = 0;
    }

    for (const g of E.groups) {
      if (g.sp !== 'giraffe') continue;
      if (g.calf && t > g.calf) g.calf = 0; // 长大了，母狮抓不动了
      if (!g.calf && Math.random() < 0.0004) { g.calf = t + rnd(20, 30) * 24 * HOUR; event(s, t, '一群长颈鹿里出生了一只幼崽，站起来还摇摇晃晃。', { sp: 'giraffe' }); }
    }
    lions(s, E, t, env);
    // 大象发现狮子：象群走到 Naramat 或狮群 400 米内就号叫（同一群 30 分钟内不重复）
    const lionPos = [s.mother].concat(E.groups.filter((g) => g.sp === 'pride' || g.sp === 'coalition'));
    for (const el of E.groups.filter((g) => g.sp === 'elephant')) {
      if (el.trumpetAt && t - el.trumpetAt < 30 * 60000) continue;
      if (lionPos.some((l) => l && Math.hypot(l.x - el.x, l.y - el.y) < 400)) { el.trumpetAt = t; sight(s, t, 'trumpet', { x: el.x, y: el.y }); }
    }
    grazing(s, E, t, env);
    patrolCleanup(E);
    for (const g of E.groups) behave(s, E, g, t, env);

    // 腐肉：主人吃完或离开后变成无主腐肉，一天后消失
    for (const c of E.carcasses) {
      if (c.owner === 'leopard' && !c.tree && c.hoistAt && t >= c.hoistAt) { c.tree = true; event(s, t, `花豹把${preyName(c.prey)}拖上了树，谁也抢不走了。`, { sp: 'leopard' }); sight(s, t, 'leopardTree', { x: c.x, y: c.y }); }
      if (c.owner && c.owner !== 'lion' && t > c.ownerUntil) { c.owner = null; }
      if (c.owner === 'lion' && !(s.act.type === 'feed' && s.act.carcassId === c.id)) c.owner = null;
      if (!c.owner) c.kg -= 1.5;
      // 主人在吃：猎豹一顿约 10 公斤，花豹慢慢吃，鬣狗群吃得最快
      if (c.owner === 'cheetah') c.kg -= 1.5;
      if (c.owner === 'leopard') c.kg -= 0.4;
      if (c.owner === 'jackal') c.kg -= 0.5;
      if (c.owner === 'pride') c.kg -= 4; // 母狮和雄狮一起吃
      if (c.owner === 'hyena') { const h = E.groups.find((g) => g.sp === 'hyena' && g.hunt && g.hunt.cid === c.id); c.kg -= h ? h.n * 0.8 : 1; }
    }
    E.carcasses = E.carcasses.filter((c) => c.kg > 1 && t - c.t < (c.tree ? 48 : 24) * HOUR);
  }

  function behave(s, E, g, t, env) {
    const S = SPEC[g.sp];
    const ph = env.ph;
    const den = s.denXY;

    // 被主模拟“召唤”到巢穴边（威胁事件）
    if (g.state === 'den') {
      if (t < g.until) { moveToward(g, den.x + g.ox, den.y + g.oy, S.speed * 2); return; }
      g.state = 'roam'; g.retarget = 0;
    }
    // 迁徙季结束，角马群离开
    if (g.migratory && migrationGone(t)) { moveToward(g, g.hx * 3, g.hy * 3, S.speed); return; }

    // 狮子一天只活动约 3 小时：天黑后和黎明前各一段，其余时间躺着休息
    // 流浪雄狮进来约 6 小时后，联盟才闻到气味、听到吼声，醒来去赶
    const intruder = g.sp === 'coalition' && E.groups.find((o) => o.sp === 'nomad' && !o.leaving && t - (o.arrive || 0) > 6 * HOUR);
    if (S.lion && !intruder && !lionAwake(g, t, env)) {
      const feeding = g.hunt && g.hunt.phase === 'feed';
      const busy = g.hunt && (g.hunt.phase === 'stalk' || g.hunt.phase === 'chase');
      if (!busy && !feeding) { if (g.hunt) g.hunt = null; return; } // 原地休息
    }

    // 正在逃跑
    if (g.flee > t) { moveToward(g, g.tx, g.ty, S.speed * 2); return; }

    // 捕食者主动避让健康的成年大象、河马、水牛；猎豹还躲着狮子和鬣狗；绿猴躲着狒狒
    const avoidList = [];
    if (S.predator) {
      for (const o of E.groups) {
        if (!S.lion && SPEC[o.sp].lion && g.sp !== 'cheetah' && g.sp !== 'jackal' && dist(o, g) < 300) { avoidList.push(o); continue; } // 鬣狗、花豹躲开狮子；胡狼敢在狮子附近等着捡剩
        if (!SPEC[o.sp].big || o.injured) continue;
        if (S.lion && o.sp !== 'elephant') continue; // 狮群不怕水牛、河马，只让着大象
        if (o.sp === 'hippo' && env.ph !== 'night') continue; // 白天河马泡在水里，不必躲
        if (dist(o, g) < SPEC[o.sp].big) avoidList.push(o);
      }
      if (g.sp === 'cheetah') {
        for (const o of E.groups) if ((o.sp === 'hyena' || SPEC[o.sp].lion) && dist(o, g) < 350) avoidList.push(o);
        if (Math.hypot(s.mother.x - g.x, s.mother.y - g.y) < 350) avoidList.push({ x: s.mother.x, y: s.mother.y });
      }
    }
    if (g.sp === 'vervet') for (const o of E.groups) if (o.sp === 'baboon' && dist(o, g) < 320) avoidList.push(o);
    // 有牧人赶着的牛群：食草动物 500 米内就走开，捕食者和狮群也躲着人
    if (!S.human) {
      const avoidR = S.prey ? 500 : S.predator || S.lion ? 400 : 0;
      if (avoidR) for (const o of E.groups) if (o.sp === 'cattle' && !o.leaving && dist(o, g) < avoidR) { avoidList.unshift(o); break; }
    }
    if (avoidList.length) {
      const o = avoidList[0];
      const d = Math.max(1, dist(o, g));
      g.tx = g.x + ((g.x - o.x) / d) * 450; g.ty = g.y + ((g.y - o.y) / d) * 450;
      g.flee = t + 20 * 60000;
      if (g.hunt && g.hunt.phase !== 'feed') g.hunt = null;
      if (!g.avoidNote || t - g.avoidNote > 12 * HOUR) {
        g.avoidNote = t;
        if (((S.predator && !S.lion) || g.sp === 'vervet') && o.sp !== 'cattle') event(s, t, `${S.name}主动避开了${o.sp ? SPEC[o.sp].name : 'Naramat'}。`, { sp: g.sp });
      }
      moveToward(g, g.tx, g.ty, S.speed * 1.5);
      return;
    }

    // 巡护车：沿北边边界来回巡逻，发现牛群就赶过去劝离
    if (S.patrol) {
      if (g.busyUntil && t < g.busyUntil) return; // 正在和牧人交涉
      const mor = (s.morale == null ? 60 : s.morale) / 100;
      const eff = 0.7 + 0.6 * mor; // 工作效率：士气 0 → 70%，50 → 100%，100 → 130%
      const herd = E.groups.filter((o) => o.sp === 'cattle' && !o.leaving).sort((a, b) => dist(a, g) - dist(b, g))[0];
      const seeR = (g.sp === 'vehicle' ? 2500 : 1500) * eff;
      if (herd && dist(herd, g) < seeR) {
        if (moveToward(g, herd.x, herd.y, S.speed * eff) || dist(herd, g) < 150) {
          herd.leaving = true; herd.until = t; herd.tx = herd.x; herd.ty = 3600;
          g.busyUntil = t + (30 / eff) * 60000; // 和牧人交涉、看着牛群离开：士气高时更快
          s.stats.evicted = (s.stats.evicted || 0) + 1;
          event(s, t, `巡护车拦下了非法放牧的牛群，把 ${herd.n} 头牛和牧人一起劝离出保护区。`, { sp: 'vehicle' });
        }
        return;
      }
      if (g.temp && t > g.until) { g.leaving = true; }
      if (g.leaving) { moveToward(g, g.x, 3600, S.speed); return; }
      // 巡逻线：北边 1.8–2.6 公里一带东西来回，偶尔深入领地
      if (t > g.retarget || Math.hypot(g.tx - g.x, g.ty - g.y) < 50) {
        g.tx = rnd(-2400, 2400); g.ty = Math.random() < 0.75 ? rnd(1800, 2700) : rnd(400, 1800);
        g.retarget = t + rnd(1, 3) * HOUR;
      }
      moveToward(g, g.tx, g.ty, S.speed * 0.5 * eff);
      return;
    }
    // 牛群：进来、吃草、到点被赶回去
    if (g.sp === 'cattle') {
      if (g.leaving) { moveToward(g, g.tx, g.ty, S.speed); return; }
      if (t > g.retarget || Math.hypot(g.tx - g.x, g.ty - g.y) < 40) { newTarget(g, t); g.retarget = t + rnd(0.7, 1.5) * HOUR; }
      moveToward(g, g.tx, g.ty, S.speed * 0.4);
      return;
    }
    // 雄狮联盟：狮群有猎物就过去分（雄狮优先进食），否则巡视领地
    if (g.sp === 'coalition') {
      // 听到陌生雄狮的吼声，不管在不在休息，立刻赶过去
      if (intruder) { moveToward(g, intruder.x, intruder.y, S.speed * 1.5); return; }
      const c = E.carcasses.find((c) => c.owner === 'pride' && c.kg > 20);
      if (c) { moveToward(g, c.x, c.y, S.speed); return; }
    }
    // 流浪雄狮：从领地边缘往里闯，到点就离开
    if (g.sp === 'nomad') {
      if (g.leaving) { moveToward(g, g.tx, g.ty, S.speed * 1.5); return; }
      if (t > g.retarget || Math.hypot(g.tx - g.x, g.ty - g.y) < 40) { const p = pointAt(400, 1300, 'open'); g.tx = p.x; g.ty = p.y; g.retarget = t + rnd(2, 5) * HOUR; }
      moveToward(g, g.tx, g.ty, S.speed * 0.6);
      return;
    }
    // 黑背胡狼：先找腐肉——别人还在吃就在 30–50 米外等，没人了再上去捡
    if (g.sp === 'jackal' && isActive('jackal', env.ph) && jackalScavenge(s, E, g, t)) return;
    // 捕食者捕猎
    if (S.predator && predatorHunt(s, E, g, t, env)) return;

    // 河马：白天泡在河里，夜里上岸吃草
    if (g.sp === 'hippo') {
      const out = ph === 'night' ? rnd(120, 280) : 0;
      if (t > g.retarget || g.state !== ph) {
        g.state = ph; g.retarget = t + rnd(1, 3) * HOUR;
        const side = Math.random() < 0.5 ? 1 : -1;
        g.tx = g.hx + g.nx * out * side + rnd(-60, 60); g.ty = g.hy + g.ny * out * side + rnd(-60, 60);
      }
      moveToward(g, g.tx, g.ty, S.speed);
      return;
    }

    if (!isActive(g.sp, ph)) {
      // 夜里狒狒、绿猴回到睡觉的树上；白天花豹在林子里休息
      if (S.territorial || g.sp === 'leopard') moveToward(g, g.hx, g.hy, S.speed);
      return;
    }

    // 狒狒、绿猴偶尔离开林地远足；看到母狮在开阔地会靠近围观、挑衅
    if (S.territorial && g.sp !== 'jackal') {
      if (g.state === 'excursion') {
        if (t > g.until) { g.state = 'roam'; g.retarget = 0; }
        else {
          const m = s.mother;
          const md = Math.hypot(m.x - g.x, m.y - g.y);
          if (md < 900 && habitatOf(m.x, m.y) !== 'wood') { g.tx = m.x + (g.x - m.x) / Math.max(md, 1) * 150; g.ty = m.y + (g.y - m.y) / Math.max(md, 1) * 150; }
          moveToward(g, g.tx, g.ty, S.speed);
          return;
        }
      } else if (Math.random() < 0.006) {
        const p = pointAt(Math.hypot(g.hx, g.hy) - 300, Math.hypot(g.hx, g.hy) + 600, 'grass');
        g.state = 'excursion'; g.until = t + rnd(1, 3) * HOUR; g.tx = p.x; g.ty = p.y;
        event(s, t, `${S.name}离开河边林地，到开阔地上觅食。`, { sp: g.sp });
      }
    }

    if (t > g.retarget || Math.hypot(g.tx - g.x, g.ty - g.y) < 30) newTarget(g, t);
    moveToward(g, g.tx, g.ty, S.speed * (g.sp === 'elephant' || S.prey ? 0.5 : 0.7));
  }

  // 每头（群）狮子每天两段活动时间：日落后 0.5–3 小时开始一段，凌晨 2–5 点开始一段，各 1–2 小时
  function lionAwake(g, t, env) {
    const day = Math.floor((t + 3 * HOUR - 12 * HOUR) / (24 * HOUR)); // 以中午为界的“一夜”
    if (g.boutDay !== day) {
      g.boutDay = day;
      const ss = (env.w && env.w.set) || 18.5;
      const a1 = ss + rnd(0.5, 3), a2 = 24 + rnd(2, 5);
      g.bouts = [[a1, a1 + rnd(1, 2)], [a2, a2 + rnd(0.8, 1.6)]];
    }
    const h = env.h < 12 ? env.h + 24 : env.h; // 把凌晨算到“今夜”里
    return g.bouts.some(([a, b]) => h >= a && h < b);
  }

  // 胡狼捡腐肉：1.5 公里内有残骸就过去；主人（狮子、鬣狗等）还在就在旁边等，无主了才吃
  function jackalScavenge(s, E, g, t) {
    if (g.hunt && g.hunt.phase === 'feed') return false;
    const cs = E.carcasses.filter((c) => !c.tree && c.kg > 1 && Math.hypot(c.x - g.x, c.y - g.y) < 1500 && Math.hypot(c.x - g.hx, c.y - g.hy) < 2000);
    if (!cs.length) return false;
    const c = cs.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
    const busy = c.owner && c.owner !== 'jackal';
    const keep = busy ? 40 : 0; // 别人在吃：保持约 40 米
    const d = Math.max(1, Math.hypot(c.x - g.x, c.y - g.y));
    moveToward(g, c.x - (c.x - g.x) / d * keep, c.y - (c.y - g.y) / d * keep, SPEC.jackal.speed);
    if (!busy && d < 30) {
      c.kg -= 0.6; g.lastKill = t;
      if (!g.scavNote || t - g.scavNote > 12 * HOUR) { g.scavNote = t; event(s, t, `一对黑背胡狼在${preyName(c.prey)}的残骸边捡食。`, { sp: 'jackal' }); }
    }
    return true;
  }

  // ---------- 狮群 ----------
  function lions(s, E, t, env) {
    const den = s.denXY;
    const pride = E.groups.find((g) => g.sp === 'pride');
    const coal = E.groups.find((g) => g.sp === 'coalition');
    // 第 5 周起，狮群的活动范围慢慢往巢穴这边移（为回归狮群做铺垫）
    const f = Math.max(0, Math.min(0.65, (env.age - 35) / 21));
    for (const g of [pride, coal]) {
      if (!g || !g.home0) continue;
      g.hx = g.home0.x + (den.x - g.home0.x) * f * (g === coal ? 0.6 : 1);
      g.hy = g.home0.y + (den.y - g.home0.y) * f * (g === coal ? 0.6 : 1);
    }
    // 夜里雄狮吼叫宣示领地（每晚最多一次）
    if (coal && env.ph === 'night' && t - E.lastRoar > 20 * HOUR && Math.random() < 0.05) {
      E.lastRoar = t;
      const d = Math.hypot(coal.x - den.x, coal.y - den.y);
      event(s, t, `夜里传来 Satala 联盟的吼声，${d < 1500 ? '就在附近' : '从 ' + (d / 1000).toFixed(1) + ' 公里外'}，整片草原都安静了下来。`, { sp: 'coalition' });
    }
    // 流浪雄狮：联盟离巢穴远时，偶尔闯进领地，待一两天
    let nomad = E.groups.find((g) => g.sp === 'nomad');
    const coalFar = !coal || Math.hypot(coal.x - den.x, coal.y - den.y) > 2000;
    if (!nomad && coalFar && Math.random() < 0.0004) {
      const a = Math.random() * Math.PI * 2;
      nomad = mk(E.nextId++, 'nomad', Math.random() < 0.6 ? 2 : 3, { x: Math.cos(a) * 3200, y: Math.sin(a) * 3200 });
      nomad.until = t + rnd(24, 48) * HOUR;
      nomad.arrive = t;
      E.groups.push(nomad);
      event(s, t, `${nomad.n} 只陌生的流浪雄狮闯进了领地，一路嗅着地上的气味。`, { sp: 'nomad' });
    }
    if (nomad && !nomad.leaving) {
      const chased = coal && dist(coal, nomad) < 1500;
      if (chased || t > nomad.until) {
        nomad.leaving = true;
        const r = Math.max(1, Math.hypot(nomad.x, nomad.y));
        nomad.tx = (nomad.x / r) * 3600; nomad.ty = (nomad.y / r) * 3600;
        if (chased) {
          coal.tx = nomad.x; coal.ty = nomad.y; coal.retarget = t + HOUR;
          event(s, t, `Satala、Saruni 和 Saitoti 咆哮着冲过去，把流浪雄狮赶出了领地。`, { sp: 'coalition' });
          sight(s, t, 'nomadChased', { x: nomad.x, y: nomad.y });
        } else event(s, t, '流浪雄狮离开了领地。', { sp: 'nomad' });
      }
    }
    if (nomad && nomad.leaving && Math.hypot(nomad.x, nomad.y) > 3250) E.groups = E.groups.filter((g) => g !== nomad);
  }
  // ---------- 非法放牧 ----------
  // 平均每天约 0.4 次，夜里和清晨最多；当天签到过就少 20%
  // 每晚随机 1–2 群牛在北边非法放牧，各自独立进来、各自被赶走
  const MAX_HERDS = 2;
  function grazing(s, E, t, env) {
    E.grazeAng = 0; // 牛群总是从北边的社区地界进来
    const herds = E.groups.filter((g) => g.sp === 'cattle');
    // 每次签到 −20%（叠乘）；有巡护车值班时，牧人不太敢进来（−30%）
    const onDuty = E.groups.some((g) => g.sp === 'vehicle' && !g.leaving);
    const mor0 = (s.morale == null ? 60 : s.morale) / 100;
    const deter = onDuty ? 1 - (0.15 + 0.3 * mor0) : 1; // 士气越高，牧人越不敢进来（士气 50 时 −30%）
    // 每天黄昏决定今晚有几群牛进来（1 或 2 群），在天黑到凌晨之间陆续进来
    const nightKey = new Date(t + 3 * HOUR - 12 * HOUR).toISOString().slice(0, 10);
    if (E.grazeNight !== nightKey && env.ph === 'dusk') {
      E.grazeNight = nightKey;
      const k = Math.random() < 0.5 ? 1 : 2;
      E.grazePlan = Array.from({ length: k }, () => t + rnd(0.5, 10) * HOUR).sort((a, b) => a - b);
    }
    const p = Math.pow(0.8, env.checks || 0) * deter; // 签到、巡护车值班会让牧人放弃
    while (E.grazePlan && E.grazePlan.length && t >= E.grazePlan[0]) {
      E.grazePlan.shift();
      if (herds.filter((g) => !g.leaving).length < MAX_HERDS && Math.random() < p) spawnCattle(s, t);
    }
    // 旧存档里多出来的牛群（以前最多 4 群）：多的往北赶走
    herds.filter((g) => !g.leaving).slice(MAX_HERDS).forEach((g) => { g.leaving = true; g.tx = g.x; g.ty = 3600; });
    for (const herd of herds) {
      if (!herd.leaving && t > herd.until) {
        herd.leaving = true;
        herd.tx = herd.x; herd.ty = 3600;
        event(s, t, `牧人把约 ${herd.n} 头牛往北赶回了保护区外。`, { sp: 'cattle' });
      }
    }
    E.groups = E.groups.filter((g) => !(g.sp === 'cattle' && g.leaving && Math.hypot(g.x, g.y) > 3250)); // 走到边界就离开地图
  }
  function spawnCattle(s, t) {
    const E = s.eco;
    if (E.groups.filter((g) => g.sp === 'cattle' && !g.leaving).length >= MAX_HERDS) return null;
    // 从北边地图边缘随机一处出现，往南走进来吃草
    const a = rnd(-0.7, 0.7);
    let home = null;
    for (let k = 0; k < 80 && !home; k++) { const p = pointAt(700, 2000, 'grass'); if (p.y > 300 && Math.abs(Math.atan2(p.x, p.y) - a) < 0.8) home = p; }
    home = home || { x: 0, y: 1200 };
    const herd = mk(E.nextId++, 'cattle', rint(15, 50), { x: Math.sin(a) * 3200, y: Math.cos(a) * 3200 }, { herders: rint(2, 3), until: t + rnd(3, 10) * HOUR });
    herd.hx = home.x; herd.hy = home.y; herd.tx = home.x; herd.ty = home.y; herd.retarget = t + 3 * HOUR;
    E.groups.push(herd);
    s.stats.herds = (s.stats.herds || 0) + 1;
    event(s, t, `约 ${herd.n} 头牛被 ${herd.herders} 个牧人从北边赶进了保护区，非法放牧。`, { sp: 'cattle' });
    return herd;
  }
  // 派出巡护：temp=true 是签到派出的临时巡逻（到点撤回），否则是捐助的常驻力量
  // 画面上最多 2 辆巡护车：满了就让一辆正在外面的临时巡护车多巡一段时间
  const MAX_VEHICLES = 2;
  function dispatchPatrol(s, t, kind, dur, temp) {
    const E = s.eco;
    const active = E.groups.filter((g) => g.sp === 'vehicle' && !g.leaving);
    if (active.length >= MAX_VEHICLES) {
      const tmp = active.filter((g) => g.temp).sort((a, b) => a.until - b.until)[0];
      if (tmp) { if (temp) tmp.until = Math.max(tmp.until, t) + dur; else { tmp.temp = false; } tmp.extended = true; return tmp; }
      return null;
    }
    // 从北边边界内的巡护站出发
    const g = mk(E.nextId++, kind, 1, { x: rnd(-600, 600), y: 2750 }, { temp, until: t + dur, extended: false });
    g.tx = rnd(-2000, 2000); g.ty = rnd(1900, 2500);
    E.groups.push(g);
    return g;
  }
  function patrolCleanup(E) {
    // 不再有步行巡护（会惊走野生动物）：旧存档里的巡护队直接撤掉
    // 回站的巡护车走到地图边缘就离开（地图边缘在 3.3 公里，以前要求“往北过 3.2 公里”，偏在两侧的车会一直卡在边上）
    E.groups = E.groups.filter((g) => g.sp !== 'ranger' && !(SPEC[g.sp] && SPEC[g.sp].patrol && g.leaving && Math.hypot(g.x, g.y) > 3200));
    // 取消了捐款：不是签到派出的常驻车一律撤回
    E.groups.forEach((g) => { if (g.sp === 'vehicle' && !g.temp && !g.leaving) g.leaving = true; });
    // 旧存档可能有很多辆车：只留 2 辆
    const vs = E.groups.filter((g) => g.sp === 'vehicle' && !g.leaving);
    if (vs.length > MAX_VEHICLES) vs.slice(MAX_VEHICLES).forEach((g) => { g.leaving = true; });
  }
  const cattleHerds = (s) => s.eco.groups.filter((g) => g.sp === 'cattle' && !g.leaving);
  const cattleHerd = (s) => cattleHerds(s).sort((a, b) => Math.hypot(a.x - s.denXY.x, a.y - s.denXY.y) - Math.hypot(b.x - s.denXY.x, b.y - s.denXY.y))[0];

  const coalitionNear = (s) => { const c = s.eco.groups.find((g) => g.sp === 'coalition'); return c && Math.hypot(c.x - s.denXY.x, c.y - s.denXY.y) < 2000; };
  const hasNomad = (s) => s.eco.groups.some((g) => g.sp === 'nomad' && !g.leaving);

  // ---------- 捕食者 ----------
  const HUNT_PREY = {
    leopard: ['baboon', 'vervet', 'warthog', 'impala', 'topi'],
    cheetah: ['gazelle', 'impala'],
    hyena: ['wildebeest', 'zebra', 'gazelle', 'impala', 'topi'], // 书中鬣狗食物约 9% 是转角牛羚、狷羚和黑斑羚
    pride: ['wildebeest', 'zebra', 'buffalo', 'warthog', 'impala'],
    jackal: ['gazelle'], // 只抓汤氏瞪羚的幼崽
  };
  const SUCCESS = { leopard: 0.3, cheetah: 0.45, hyena: 0.35, pride: 0.3, jackal: 0.25 };
  // 各捕食者的捕猎方式（米）：多近开始潜行、多近开始冲刺、追多远
  // 花豹贴近伏击；猎豹 70 米内冲刺、追 300 米；斑鬣狗耐力追逐，可以追一两公里
  const HUNT_STYLE = {
    leopard: { stalk: 80, charge: 15, chase: 60 },
    cheetah: { stalk: 300, charge: 70, chase: 300 },
    hyena: { stalk: 200, charge: 120, chase: 1200 },
    pride: { stalk: 100, charge: 30, chase: 150 }, // 几只母狮分头包抄
    jackal: { stalk: 150, charge: 40, chase: 200 }, // 成对配合，冲进瞪羚群找藏着的幼崽
  };
  const MEAT = { topi: 110, wildebeest: 160, zebra: 200, gazelle: 15, impala: 35, warthog: 45, baboon: 18, vervet: 4, hippo: 900, buffalo: 400, giraffe: 50 };

  function predatorHunt(s, E, g, t, env) {
    const S = SPEC[g.sp];
    if (!isActive(g.sp, env.ph)) { g.hunt = null; return false; }
    // 正在进食
    if (g.hunt && g.hunt.phase === 'feed') {
      const c = E.carcasses.find((c) => c.id === g.hunt.cid);
      if (!c || c.owner !== g.sp || t > g.hunt.until) {
        g.hunt = null;
        if (g.sp === 'hyena') g.plan = 'done'; // 吃饱了，这一夜不再出猎
        return false;
      }
      moveToward(g, c.x, c.y, S.speed);
      return true;
    }
    const hungry = t - g.lastKill > (g.sp === 'leopard' ? 40 : g.sp === 'cheetah' ? 26 : g.sp === 'pride' ? 30 : g.sp === 'jackal' ? 30 : 20) * HOUR;

    // 斑鬣狗找腐肉：抢猎豹的、捡无主的
    if (g.sp === 'hyena' && g.plan === 'scavenge') {
      const cs = E.carcasses.filter((c) => !c.tree && !c.hyena && c.owner !== 'hyena' && c.owner !== 'lion' && c.owner !== 'pride' && c.kg > 5 && Math.hypot(c.x - g.x, c.y - g.y) < 2500);
      if (cs.length) {
        const c = cs.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
        if (moveToward(g, c.x, c.y, S.speed)) {
          const owner = c.owner;
          c.owner = 'hyena'; c.ownerUntil = t + 3 * HOUR; c.hyena = true;
          g.hunt = { phase: 'feed', cid: c.id, until: t + 3 * HOUR };
          g.lastKill = t;
          if (owner === 'cheetah') {
            const ch = E.groups.find((o) => o.sp === 'cheetah');
            if (ch) { ch.hunt = null; ch.flee = t + 30 * 60000; ch.tx = ch.x + (ch.x - g.x); ch.ty = ch.y + (ch.y - g.y); }
            event(s, t, `${g.n} 只斑鬣狗赶走了猎豹，抢走了它的${preyName(c.prey)}。`, { sp: 'hyena' });
            sight(s, t, 'hyenaRob', { x: c.x, y: c.y });
          } else if (owner === 'leopard') {
            const lp = E.groups.find((o) => o.sp === 'leopard');
            if (lp) { lp.hunt = null; lp.flee = t + 30 * 60000; lp.tx = lp.hx; lp.ty = lp.hy; }
            event(s, t, `花豹还没来得及把${preyName(c.prey)}拖上树，${g.n} 只斑鬣狗就围了上来，把它抢走了。`, { sp: 'hyena' });
          } else event(s, t, `${g.n} 只斑鬣狗找到一具${preyName(c.prey)}残骸，围上去分食。`, { sp: 'hyena' });
        }
        return true;
      }
    }
    if (g.sp === 'hyena' ? g.plan !== 'hunt' : !hungry) return false;

    // 选目标 → 接近（不画箭头）→ 潜行（虚线）→ 冲刺追击（实线）
    if (!g.hunt) {
      let cands = near(E, g, HUNT_PREY[g.sp], g.sp === 'hyena' ? 2600 : 1600).filter((o) => !(o.migratory && migrationGone(t)));
      // 斑鬣狗优先集群围猎受伤的河马、水牛
      if (g.sp === 'hyena') {
        const hurt = E.groups.filter((o) => (o.sp === 'hippo' || o.sp === 'buffalo') && o.injured && dist(o, g) < 3000);
        if (hurt.length) cands = hurt.concat(cands);
      }
      if (!cands.length) return false;
      g.hunt = { tid: cands[0].id, phase: 'approach', until: t + 3 * HOUR };
    }
    const tg = byId(E, g.hunt.tid);
    if (!tg) { g.hunt = null; return false; }
    const HS = HUNT_STYLE[g.sp];
    const d = dist(tg, g);
    if (g.hunt.phase === 'approach') {
      if (t > g.hunt.until) { g.hunt = null; return false; }
      if (d <= HS.stalk) { g.hunt.phase = 'stalk'; g.hunt.from = [g.x, g.y]; g.hunt.until = t + rnd(10, 30) * 60000; }
      else moveToward(g, tg.x - (tg.x - g.x) / d * HS.stalk * 0.9, tg.y - (tg.y - g.y) / d * HS.stalk * 0.9, S.speed);
      return true;
    }
    if (g.hunt.phase === 'stalk') {
      const left = Math.max(1, Math.round((g.hunt.until - t) / (10 * 60000)));
      if (d > HS.charge) moveToward(g, tg.x - (tg.x - g.x) / d * HS.charge, tg.y - (tg.y - g.y) / d * HS.charge, Math.max(10, (d - HS.charge) / left));
      if (t < g.hunt.until) return true;
      if (Math.random() < (tg.sp === 'topi' ? 0.4 : 0.25)) { // 被发现，猎物逃走（黑面狷羚更机敏）
        tg.flee = t + 20 * 60000; tg.tx = tg.x + (tg.x - g.x) / Math.max(d, 1) * 300; tg.ty = tg.y + (tg.y - g.y) / Math.max(d, 1) * 300;
        g.hunt = null; return true;
      }
      g.hunt.phase = 'chase'; g.hunt.from = [g.x, g.y]; g.hunt.until = t + 10 * 60000;
      tg.flee = t + 20 * 60000; tg.tx = tg.x + (tg.x - g.x) / Math.max(d, 1) * HS.chase; tg.ty = tg.y + (tg.y - g.y) / Math.max(d, 1) * HS.chase;
      return true;
    }
    if (g.hunt.phase === 'chase') {
      moveToward(g, tg.x, tg.y, Math.max(S.speed * 1.5, HS.chase));
      if (t < g.hunt.until) return true;
      let p = SUCCESS[g.sp];
      // 花豹靠夜色伏击：夜里约 50%，晨昏低一些，平均约 30%
      if (g.sp === 'leopard') p = { night: 0.5, dawn: 0.3, dusk: 0.3, day: 0.18 }[env.ph];
      if (g.sp === 'pride') p = { night: 0.4, dawn: 0.3, dusk: 0.3, day: 0.15 }[env.ph] * (tg.sp === 'buffalo' ? 0.6 : 1);
      if (g.sp === 'hyena' && tg.injured) p = 0.45;
      if (g.sp === 'hyena' && g.n < 5 && (tg.sp === 'zebra' || tg.sp === 'wildebeest')) p *= 0.7;
      const ok = Math.random() < p;
      g.stats = g.stats || { tries: 0, kills: 0, night: 0, nightKills: 0 };
      g.stats.tries++; if (ok) g.stats.kills++;
      if (env.ph === 'night') { g.stats.night++; if (ok) g.stats.nightKills++; }
      if (ok) {
        const prey = tg.sp;
        const c = addCarcass(E, t, tg.x, tg.y, prey, g.sp, g.sp === 'jackal' ? 3 : MEAT[prey] || 30, false);
        if (g.sp === 'jackal') c.fawn = true;
        if (g.sp === 'hyena') c.hyena = true;
        // 花豹先在地上，过一会儿才拖上树；拖上树之前可能被母狮或鬣狗抢走
        if (g.sp === 'leopard') c.hoistAt = t + rnd(20, 60) * 60000;
        c.ownerUntil = t + (g.sp === 'leopard' ? 30 : g.sp === 'cheetah' ? 2 : g.sp === 'pride' ? 10 : g.sp === 'jackal' ? 1 : 4) * HOUR;
        g.hunt = { phase: 'feed', cid: c.id, until: c.ownerUntil };
        g.lastKill = t;
        if (tg.injured) tg.injured = 0;
        const txt = {
          leopard: `花豹在林地里伏击了一只${preyName(prey)}，正准备把它拖上树。`,
          cheetah: `猎豹从 ${HS.charge} 米外冲刺，捕到一只${preyName(prey)}。`,
          hyena: `${g.n} 只斑鬣狗集群长距离追逐，放倒了一${prey === 'hippo' || prey === 'buffalo' ? '头受伤的' : '只'}${preyName(prey)}。`,
          pride: `狮群的母狮们分头包抄，合力放倒了一${prey === 'buffalo' ? '头' : '只'}${preyName(prey)}。`,
          jackal: '一对黑背胡狼冲进瞪羚群，叼走了一只藏在草里的汤氏瞪羚幼崽。',
        }[g.sp];
        event(s, t, txt, { sp: g.sp, kill: true });
        if (g.sp === 'jackal') sight(s, t, 'jackalFawn', { x: c.x, y: c.y });
      } else {
        g.hunt = null;
        g.lastTry = t;
      }
      return true;
    }
    return false;
  }

  function preyName(sp) {
    return (SPEC[sp] && SPEC[sp].name.replace('群', '')) || sp;
  }

  // ---------- 与母狮的互动 ----------
  // 返回母狮此刻可以利用的机会：离开林地靠近她的灵长类，或者可以抢的猎物
  function lionOpportunity(s, t, env) {
    const E = s.eco;
    const m = s.mother;
    const M = { x: m.x, y: m.y };
    for (const g of E.groups) {
      if ((g.sp === 'baboon' || g.sp === 'vervet') && g.state === 'excursion' && habitatOf(g.x, g.y) !== 'wood' && dist(g, M) < 350) {
        return { type: 'primate', group: g };
      }
    }
    for (const c of E.carcasses) {
      if (c.owner === 'pride' && c.kg > 15 && Math.hypot(c.x - M.x, c.y - M.y) < 2000) return { type: 'join', carcass: c };
    }
    for (const c of E.carcasses) {
      if (c.tree || c.owner === 'lion' || c.owner === 'pride' || c.kg < 5) continue;
      const d = Math.hypot(c.x - M.x, c.y - M.y);
      if (d > 900) continue;
      if (c.owner === 'hyena') {
        const h = E.groups.find((g) => g.sp === 'hyena' && g.hunt && g.hunt.cid === c.id);
        if (h && h.n >= 5) continue; // 5 只以上的鬣狗群，单独的母狮抢不过
      }
      return { type: 'steal', carcass: c };
    }
    return null;
  }

  // 母狮抢到猎物：原主人离开
  function lionTakes(s, t, c) {
    const E = s.eco;
    const owner = c.owner;
    c.owner = 'lion';
    for (const g of E.groups) {
      if (g.hunt && g.hunt.cid === c.id) {
        g.hunt = null; g.flee = t + 40 * 60000;
        g.tx = g.x + (g.x - c.x) * 4 + rnd(-100, 100); g.ty = g.y + (g.y - c.y) * 4 + rnd(-100, 100);
      }
    }
    return owner;
  }

  // 威胁事件发生时，把这种动物带到巢穴边
  function summon(s, t, sp) {
    const E = s.eco;
    const g = E.groups.find((o) => o.sp === sp);
    if (!g) return;
    const den = s.denXY;
    g.state = 'den'; g.until = t + 40 * 60000;
    g.ox = rnd(-60, 60); g.oy = rnd(-60, 60);
    if (Math.hypot(g.x - den.x, g.y - den.y) > 1500) { g.x = den.x + (g.x - den.x) * 0.3; g.y = den.y + (g.y - den.y) * 0.3; }
  }

  // 花豹两天内吃过东西：对幼崽的威胁减小
  function leopardFed(s, t) { return s.eco.groups.some((g) => g.sp === 'leopard' && t - g.lastKill < 48 * HOUR); }

  // 某种动物离巢穴的距离（用于调节威胁概率）
  function distToDen(s, sp) {
    const den = s.denXY;
    let best = 1e9;
    for (const g of s.eco.groups) if (g.sp === sp) best = Math.min(best, Math.hypot(g.x - den.x, g.y - den.y));
    return best;
  }

  // 母狮捕猎的候选目标
  // 一只母狮抓不了大象、河马、水牛和成年长颈鹿；长颈鹿只能抓刚出生不久的幼崽
  const LION_PREY_W = { wildebeest: 35, zebra: 22, gazelle: 16, impala: 12, topi: 10, warthog: 12, giraffe: 6 };
  function lionTarget(s, t, from) {
    const E = s.eco;
    const c = E.groups.filter((g) => LION_PREY_W[g.sp] && (g.sp !== 'giraffe' || g.calf) && !(g.migratory && migrationGone(t)) && Math.hypot(g.x - from.x, g.y - from.y) < 2200);
    if (!c.length) return null;
    const w = c.map((g) => LION_PREY_W[g.sp] * Math.sqrt(g.n) / (1 + Math.hypot(g.x - from.x, g.y - from.y) / 500) * (g.injured ? 3 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < c.length; i++) if ((r -= w[i]) <= 0) return c[i];
    return c[0];
  }

  root.LionEco = {
    sight, SPEC, MEAT, init, leopardFed, coalitionNear, hasNomad, spawnCattle, cattleHerd, cattleHerds, dispatchPatrol, step, lionOpportunity, lionTakes, summon, distToDen, lionTarget, addCarcass, habitatOf, distWater, migrationGone, preyName,
    geo: { nearestOn, riverLines, waterLines },
  };
})(typeof window !== 'undefined' ? window : globalThis);
