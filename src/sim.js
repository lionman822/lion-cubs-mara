// 生态模拟引擎：按真实时间每 10 分钟推进一步，离线期间自动补算
(function (root) {
  const D = root.LionData;
  const GEO = root.LionGeo;
  const ECO = () => root.LionEco;
  const siteXY = (i) => ({ x: GEO.sites[i][0], y: GEO.sites[i][1] });
  const preyLabel = (k) => (D.PREY[k] ? D.PREY[k].name : root.LionEco ? root.LionEco.preyName(k) : k);
  const STEP = 10 * 60 * 1000;
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  const TOTAL_DAYS = 56; // 8 周：母狮通常在幼崽 6–8 周时带它们回狮群
  const STEPS_PER_DAY = DAY / STEP;
  const PRESENT = { nurse: 1, rest: 1, groom: 1, guard: 1 };
  const FOOD_MAX = 24; // 一顿最多吃 24 公斤 = 3 天的量
  const DAILY_KG = 8; // 维持自己和哺乳每天至少 8 公斤
  const HUNT_PHASE = { search: '搜寻猎物', stalk: '潜伏接近', chase: '追逐', steal: '去抢', join: '去狮群分食' };
  const ACT_NAME = {
    nurse: '哺乳', rest: '树荫下休息', groom: '为幼崽理毛', guard: '守在巢穴边',
    hunt: '外出捕猎', drink: '去河边喝水', move: '转移巢穴', feed: '进食猎物', return: '返回巢穴',
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

  // 内罗毕时间（UTC+3，无夏令时）
  function nairobiHour(ts) {
    return ((((ts + 3 * HOUR) % DAY) + DAY) % DAY) / HOUR;
  }
  function dateKey(ts) {
    return new Date(ts + 3 * HOUR).toISOString().slice(0, 10);
  }
  function moon(ts) {
    const syn = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14);
    let p = ((ts - ref) / DAY / syn) % 1;
    if (p < 0) p += 1;
    return { phase: p, illum: (1 - Math.cos(2 * Math.PI * p)) / 2 };
  }
  function moonName(p) {
    if (p < 0.03 || p > 0.97) return '新月';
    if (p < 0.22) return '蛾眉月';
    if (p < 0.28) return '上弦月';
    if (p < 0.47) return '盈凸月';
    if (p < 0.53) return '满月';
    if (p < 0.72) return '亏凸月';
    if (p < 0.78) return '下弦月';
    return '残月';
  }
  function phaseOf(h, w) {
    const sr = (w && w.rise) || 6.35, ss = (w && w.set) || 18.5;
    if (h < sr - 0.75 || h >= ss + 0.75) return 'night';
    if (h < sr + 1.25) return 'dawn';
    if (h >= ss - 1.25) return 'dusk';
    return 'day';
  }
  const PHASE_NAME = { night: '夜晚', dawn: '清晨', dusk: '黄昏', day: '白天' };

  function fill(text, s, extra) {
    const alive = s.cubs.filter((c) => c.alive);
    const C = extra && extra.C ? extra.C : alive.length ? pick(alive).name : s.cubs[0].name;
    return text
      .replace(/\{A\}/g, s.cubs[0].name)
      .replace(/\{B\}/g, s.cubs[1] ? s.cubs[1].name : s.cubs[0].name)
      .replace(/\{C\}/g, C)
      .replace(/\{site\}/g, D.SITES[s.den.site].name)
      .replace(/\{(\w+)\}/g, (m, k) => (extra && extra[k] != null ? extra[k] : m));
  }

  // 结局故事要用的关键事件：日记只保留最近 500 条，这里单独长期保存
  const STORY_RE = /第一次|河水漫进|流浪雄狮|扑倒了|被刺伤|冲刺，扑倒|你替 Naramat 做了决定/;
  function log(s, t, kind, text, tip) {
    if (kind === 'milestone' || kind === 'death' || kind === 'danger' || STORY_RE.test(text)) {
      s.story = s.story || [];
      s.story.push({ t, kind, text });
      if (s.story.length > 300) s.story.splice(0, s.story.length - 300);
    }
    s.log.push({ t, kind, text, tip: tip || null });
    if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
    s.rev++;
  }
  function say(s, t, who, text) {
    s.dialog.push({ t, who, text });
    if (s.dialog.length > 1500) s.dialog.splice(0, s.dialog.length - 1500);
    s.rev++;
  }
  function sayLine(s, t, key, extra) {
    const line = fill(pick(D.DIALOG[key]), s, extra);
    if (key === 'cub') say(s, t, 'cub', line);
    else say(s, t, 'mother', line);
  }

  // 日常母子对话：按母狮当前行为、时段、天气和幼崽日龄挑选，频率符合狮子作息
  // 母狮在巢时和幼崽的交流频率（每 10 分钟一步的概率）。用户要求提高到原来的 10 倍，上限 95%
  const TALK_RATE = { nurse: 0.95, groom: 0.95, guard: 0.9, rest: 0.4 };
  function talk(s, t, env) {
    const alive = s.cubs.filter((c) => c.alive);
    if (!alive.length) return;
    const type = s.act.type;
    const age = env.age;
    const C = pick(alive).name;
    if (!PRESENT[type]) {
      if (type === 'move') return; // 嘴里叼着幼崽，出不了声
      // 母狮不在：幼崽本能地保持安静；饿极了才会叫，叫声会散出气味
      const hungry = alive.some((c) => c.satiety < 25);
      if (hungry && age >= 5 && Math.random() < 0.12) {
        const line = fill(D.HUNGRY_CALL, s, { C });
        const last = s.dialog[s.dialog.length - 1];
        if (!last || last.text !== line) say(s, t, 'cub', line);
        s.den.scent = clamp(s.den.scent + 1.5);
      } else if (Math.random() < 0.025) {
        const opts = D.ALONE.filter(([a0, a1]) => age >= a0 && age <= a1);
        const line = opts.length ? fill(pick(opts)[2], s, { C }) : null;
        const last = s.dialog[s.dialog.length - 1];
        if (line && (!last || last.text !== line)) say(s, t, 'cub', line);
      }
      return;
    }
    const scared = t - s.lastThreat < HOUR;
    let p = scared ? 0.6 : TALK_RATE[type] || 0.5;
    if (Math.random() >= p) return;
    let when = type;
    if (scared) when = 'hush';
    else if (env.w.rain > 0.5 && Math.random() < 0.5) when = 'rain';
    else if (env.ph === 'night' && Math.random() < 0.35) when = 'night';
    else if (env.ph === 'dawn' && Math.random() < 0.35) when = 'dawn';
    else if (env.ph === 'dusk' && Math.random() < 0.35) when = 'dusk';
    s.recentTalk = s.recentTalk || [];
    let opts = D.TALK.filter(([w, a0, a1, m]) => w === when && age >= a0 && age <= a1 && (alive.length > 1 || !/\{[AB]\}/.test(m)));
    // 尽量不重复：先挑最近没说过的；都说过了，就挑最早说过的那句
    if (!opts.length) return;
    const fresh = opts.filter((o) => !s.recentTalk.includes(o[3]));
    if (fresh.length) opts = fresh;
    else { const idx = (o) => s.recentTalk.indexOf(o[3]); const oldest = Math.min(...opts.map(idx)); opts = opts.filter((o) => idx(o) === oldest); }
    const [, , , m, c] = pick(opts);
    const was = s.recentTalk.indexOf(m);
    if (was >= 0) s.recentTalk.splice(was, 1); // 说过的挪到最后，保证轮换
    s.recentTalk.push(m);
    if (s.recentTalk.length > 40) s.recentTalk.shift();
    say(s, t, 'mother', fill(m, s, { C }));
    if (c && Math.random() < 0.6) say(s, t, 'cub', fill(c, s, { C }));
  }

  // ---------- 河水与洪水 ----------
  // 水位（米，高出平常水位）随降雨上涨、随时间回落。每个巢穴有自己的“被淹水位”：越贴近河岸越低
  const floodLine = (site) => 0.4 + (1 - D.SITES[site].river) * 1.2;
  function highSite(s) {
    let best = s.den.site;
    for (let i = 0; i < D.SITES.length; i++) if (i !== s.den.site && floodLine(i) > floodLine(best)) best = i;
    return best;
  }
  function riverStep(s, t, env) {
    const R = (s.river = s.river || { level: 0, flooded: false, warned: false, peak: 0 });
    const mm = (env.w.rain || 0) / 6; // 每 10 分钟的降雨量
    R.level = Math.max(0, Math.min(2.5, R.level + mm * 0.028 - 0.005)); // 一场 40 毫米的暴雨约涨 1.1 米，每天回落约 0.7 米
    R.peak = Math.max(R.peak, R.level);
    const line = floodLine(s.den.site);
    const present = !!PRESENT[s.act.type];
    // 预警：水快涨到巢穴了，母狮在场就提前转移到高处
    if (R.level > line - 0.25 && !R.warned) {
      R.warned = true;
      log(s, t, 'event', `连日降雨，恩提亚克河的水位涨了约 ${R.level.toFixed(1)} 米，浑浊的河水离${D.SITES[s.den.site].name}越来越近。`);
      if (present) s.flagMove = true;
    }
    if (R.level < line - 0.4) { R.warned = false; R.flooded = false; }
    if (R.level <= line || R.flooded || s.act.type === 'move') return;
    // 洪水漫进巢穴
    R.flooded = true;
    const alive = s.cubs.filter((c) => c.alive);
    if (present) {
      log(s, t, 'danger', `河水漫进了${D.SITES[s.den.site].name}！Naramat 叼起幼崽，冒着雨往高处跑。`);
      say(s, t, 'mother', fill('（猛地站起，叼住{C}的后颈）水来了！快，往高处走！', s));
      for (const c of alive) if (Math.random() < 0.05) harmCub(s, t, c, 'flood');
      const to = highSite(s);
      startAct(s, t, 'move', rnd(40, 70), { from: s.den.site, to });
    } else {
      const over = R.level - line;
      const pr = s.pendingReturn || { sp: 'flood', dead: [], hurt: [] };
      let any = false;
      for (const c of alive) {
        const p = Math.min(0.8, 0.3 + over * 1.5) * (env.age < 21 ? 1 : 0.6); // 大一点的幼崽能爬到高处
        if (Math.random() < p) { any = true; (harmCub(s, t, c, 'flood') === 'dead' ? pr.dead : pr.hurt).push(c.name); }
      }
      log(s, t, 'danger', any ? `Naramat 不在时，河水漫进了巢穴。` : `Naramat 不在时，河水漫进了巢穴。幼崽爬到了一截倒伏的树干上，躲过一劫。`);
      pr.sp = 'flood';
      s.pendingReturn = pr;
    }
    s.flagMove = true;
  }

  // 狮群母狮走近巢穴：幼崽不到 6 周时，Naramat 一律把她们挡回去；6 周以后有时让她们看一眼
  // ---------- 知识问答 · 巡护员士气 ----------
  // 每 2 小时（内罗毕时间的偶数整点）出一道题，开放到下一题出现；答对士气 +15
  // 士气 0–100，每小时约降 1 点；士气越高，巡护车发现牛群越远、跑得越快、劝离越快
  const QUIZ_EVERY = 2 * HOUR;
  const morale = (s) => (s.morale == null ? 60 : s.morale);
  function quizStep(s, t, ctx) {
    const QZ = root.LionQuiz;
    if (!QZ) return;
    const slot = Math.floor((t + 3 * HOUR) / QUIZ_EVERY);
    s.quiz = s.quiz || { slot: -1, asked: [], right: 0, total: 0 };
    if (s.quiz.slot === slot) return;
    // 新的一题；上一题没答就作废
    s.quiz.slot = slot;
    let pool = QZ.Q.map((_, i) => i).filter((i) => !s.quiz.asked.includes(i));
    if (!pool.length) { s.quiz.asked = []; pool = QZ.Q.map((_, i) => i); } // 题库出完一轮，重新开始
    const id = pool[Math.floor(Math.random() * pool.length)];
    s.quiz.asked.push(id);
    // 每次出题把 4 个选项随机打乱，正确答案不会总在同一个位置
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    s.quiz.cur = { id, t, deadline: (slot + 1) * QUIZ_EVERY - 3 * HOUR, answered: null, order };
    s.rev++;
    if (ctx && ctx.emit) ctx.emit({ type: 'notify', title: '巡护站问答', body: QZ.Q[id].q });
  }
  function answerQuiz(s, t, choice) {
    const QZ = root.LionQuiz, c = s.quiz && s.quiz.cur;
    if (!c || c.answered != null || t > c.deadline) return null;
    const item = QZ.Q[c.id], ok = choice === item.a;
    c.answered = choice;
    s.quiz.total++;
    if (ok) { s.quiz.right++; s.morale = Math.min(100, morale(s) + 15); }
    s.quiz.streak = ok ? (s.quiz.streak || 0) + 1 : 0;
    if (ok) { s.quiz.rightIds = s.quiz.rightIds || []; if (!s.quiz.rightIds.includes(c.id)) s.quiz.rightIds.push(c.id); } // 答对过的不同题目
    log(s, t, 'event', ok ? `你答对了巡护站的问答，巡护员士气 +15（现在 ${Math.round(s.morale)}）。` : '这道问答没答对，巡护员听你讲了正确答案。', `${item.e}（出自 ${QZ.BOOK} ${item.ref}）`);
    s.rev++;
    return ok;
  }

  // ---------- 抉择时刻 ----------
  // 关键时刻游戏停下来问玩家；30 分钟内不选，就按 Naramat 的本能（默认选项）来
  const DECIDE_WAIT = 30 * 60000;
  const DECISIONS = {
    hyena: {
      title: '斑鬣狗在附近', icon: '🐾',
      text: (s, d) => `${d.n} 只斑鬣狗就在 ${d.dist} 米外，巢穴的气味已经很重了（${Math.round(s.den.scent)}）。`,
      options: [
        { key: 'move', label: '马上转移幼崽', hint: '换个干净的地方，但叼着幼崽穿过开阔地时可能被看见' },
        { key: 'hide', label: '原地藏好，一动不动', hint: '幼崽被发现的几率降低，但气味还在' },
      ],
      instinct: 'hide',
    },
    hunger: {
      title: '饿了，天快黑了', icon: '🌇',
      text: (s) => `Naramat 体内只剩约 ${Math.round(s.mother.food)} 公斤肉，奶水开始少了。太阳快落山了。`,
      options: [
        { key: 'now', label: '现在就出发', hint: '黄昏成功率约 20%，但能早点回来喂奶' },
        { key: 'wait', label: '等天全黑再去', hint: '夜里成功率约 30%，幼崽要多饿一会儿' },
      ],
      instinct: 'wait',
    },
    pride: {
      title: '狮群在分食', icon: '🦁',
      text: (s, d) => `远处传来狮群分食的声音，约 ${d.dist} 米外有一只${d.prey}。Naramat 体内只剩约 ${Math.round(s.mother.food)} 公斤肉。`,
      options: [
        { key: 'go', label: '去狮群分一口', hint: '能吃到 14–24 公斤，但幼崽要独自待上好几个小时' },
        { key: 'stay', label: '守着幼崽', hint: '幼崽更安全，但要继续饿着、自己去捕猎' },
      ],
      instinct: 'stay',
    },
    flood: {
      title: '河水在涨', icon: '🌊',
      text: (s, d) => `恩提亚克河水位已经涨了 ${d.level} 米，离巢穴被淹只差一点。`,
      options: [
        { key: 'move', label: '现在就搬到高处', hint: '安全，但要冒雨叼着幼崽转移' },
        { key: 'wait', label: '再等等看', hint: '雨可能会停；也可能半夜河水漫进来' },
      ],
      instinct: 'move',
    },
    herd: {
      title: '牧人赶着牛过来了', icon: '🐄',
      text: (s, d) => `非法放牧的牛群和牧人正在 ${d.dist} 米外，朝巢穴的方向走来。`,
      options: [
        { key: 'move', label: '赶在他们到之前转移', hint: '远离人，但白天转移容易被看见' },
        { key: 'freeze', label: '伏在灌丛里不动', hint: '牧人多半会走过去，但万一被发现……' },
      ],
      instinct: 'freeze',
    },
  };
  // 同一种抉择的冷却时间，避免天天问同样的问题
  const DECIDE_CD = { hunger: 72, hyena: 36, herd: 36, pride: 48, flood: 24 };
  const canAsk = (s, t, kind) => !(s.lastKind && s.lastKind[kind] && t - s.lastKind[kind] < DECIDE_CD[kind] * HOUR);
  function offerDecision(s, t, kind, data, ctx) {
    s.lastKind = s.lastKind || {};
    s.lastKind[kind] = t;
    s.decision = { kind, data, t, deadline: t + DECIDE_WAIT };
    s.lastDecision = t;
    s.rev++;
    if (ctx && ctx.emit) ctx.emit({ type: 'notify', title: `抉择 · ${DECISIONS[kind].title}`, body: DECISIONS[kind].text(s, data) + ' 打开游戏帮 Naramat 做决定。' });
  }
  function decisionStep(s, t, env, ctx) {
    if (s.decision) {
      if (t >= s.decision.deadline) resolveDecision(s, t, null);
      return;
    }
    if (s.lastDecision && t - s.lastDecision < 10 * HOUR) return; // 大约每天一两次
    if (!PRESENT[s.act.type]) return; // 只有她在幼崽身边时才需要做决定
    const den = s.denXY, E = s.eco;
    const near = (sp) => { let b = null; for (const g of E.groups) if (g.sp === sp) { const d = Math.hypot(g.x - den.x, g.y - den.y); if (!b || d < b.d) b = { g, d }; } return b; };
    const hy = near('hyena');
    if (hy && hy.d < 700 && s.den.scent > 45 && env.ph !== 'day' && canAsk(s, t, 'hyena')) return offerDecision(s, t, 'hyena', { n: hy.g.n, dist: Math.round(hy.d / 10) * 10 }, ctx);
    const R = s.river;
    if (R && R.level > floodLine(s.den.site) - 0.3 && R.level < floodLine(s.den.site) && canAsk(s, t, 'flood')) return offerDecision(s, t, 'flood', { level: R.level.toFixed(1) }, ctx);
    const herd = ECO().cattleHerd(s);
    if (herd && canAsk(s, t, 'herd')) { const d = Math.hypot(herd.x - den.x, herd.y - den.y); if (d < 800 && d > 300) return offerDecision(s, t, 'herd', { dist: Math.round(d / 10) * 10 }, ctx); }
    const pk = E.carcasses.find((c) => c.owner === 'pride' && c.kg > 30);
    if (pk && s.mother.food < DAILY_KG && canAsk(s, t, 'pride')) { const d = Math.hypot(pk.x - den.x, pk.y - den.y); if (d < 2500) return offerDecision(s, t, 'pride', { dist: Math.round(d / 10) * 10, prey: preyLabel(pk.prey), cid: pk.id }, ctx); }
    if (env.ph === 'dusk' && s.mother.food < DAILY_KG * 1.25 && t - s.lastHunt > 4 * HOUR && canAsk(s, t, 'hunger')) return offerDecision(s, t, 'hunger', {}, ctx);
  }
  function resolveDecision(s, t, key) {
    const d = s.decision;
    if (!d) return false;
    const D2 = DECISIONS[d.kind];
    const by = key ? 'player' : 'instinct';
    key = key || D2.instinct;
    const opt = D2.options.find((o) => o.key === key);
    s.decision = null;
    s.decisions = s.decisions || [];
    s.decisions.push({ t, kind: d.kind, key, by });
    log(s, t, 'event', `${by === 'player' ? '你替 Naramat 做了决定' : '你没来得及回应，Naramat 凭本能做了决定'}：${D2.title}——${opt.label}。`);
    const m = s.mother;
    const moveNow = (to) => {
      let site = to != null ? to : s.den.site;
      while (site === s.den.site) site = Math.floor(Math.random() * D.SITES.length);
      startAct(s, t, 'move', rnd(50, 90), { from: s.den.site, to: site });
      sayLine(s, t, 'moveDen', { to: D.SITES[site].name });
    };
    if (d.kind === 'hyena') {
      if (key === 'move') {
        moveNow();
        // 开阔地上叼着幼崽，可能被看见
        if (Math.random() < 0.15) { const c = pick(s.cubs.filter((c) => c.alive)); if (c) { c.health = Math.max(20, c.health - 25); log(s, t, 'danger', `转移途中，一只斑鬣狗追了上来。Naramat 回身扑过去，${c.name}在混乱中摔伤了。`); } }
      } else { s.hideUntil = t + 4 * HOUR; if (by === 'player') s.hideWatch = { until: t + 4 * HOUR, ok: true }; say(s, t, 'mother', fill(D.DIALOG.hush[0], s)); }
    } else if (d.kind === 'flood') {
      if (key === 'move') { moveNow(highSite(s)); if (by === 'player' && root.LionMedals) root.LionMedals.award(s, 'floodSaved', t); }
      else log(s, t, 'event', 'Naramat 守在巢穴边，盯着越涨越高的河水。');
    } else if (d.kind === 'herd') {
      if (key === 'move') moveNow();
      else { s.hideUntil = t + 3 * HOUR; s.herdCD = t + 8 * HOUR; say(s, t, 'mother', fill('（贴着地面，喉咙里压着低吼）别出声……是人。', s)); if (Math.random() < 0.15) { log(s, t, 'danger', '牧人发现了灌丛里的动静，扔了几块石头，吆喝着走开了。Naramat 等他们一走，就带着幼崽搬了家。'); s.flagMove = true; } }
    } else if (d.kind === 'pride') {
      if (key === 'go') {
        const c = s.eco.carcasses.find((c) => c.id === d.data.cid && c.owner === 'pride');
        startAct(s, t, 'hunt', rnd(180, 300)); s.stats.outings++;
        sayLine(s, t, 'joinPride');
        if (c) Object.assign(s.act, { phase: 'join', carcassId: c.id, prey: c.prey, from: [m.x, m.y] });
      } else { s.joinCD = t + 12 * HOUR; sayLine(s, t, 'nurse'); }
    } else if (d.kind === 'hunger') {
      if (key === 'now') {
        startAct(s, t, 'hunt', rnd(120, 240), { phase: 'search', phaseEnd: t + rnd(20, 45) * 60000 });
        s.stats.outings++; sayLine(s, t, 'leaveHunt');
      } else s.waitDarkUntil = t + 2 * HOUR;
    }
    s.rev++;
    return true;
  }

  function prideVisit(s, t, env) {
    const g = s.eco.groups.find((o) => o.sp === 'pride');
    if (!g || (s.prideCD && t < s.prideCD)) return;
    if (Math.hypot(g.x - s.denXY.x, g.y - s.denXY.y) > 250) return;
    s.prideCD = t + 12 * HOUR;
    const P = pick(D.PRIDE_NAMES);
    const away = () => { const d = Math.max(1, Math.hypot(g.x - s.denXY.x, g.y - s.denXY.y)); g.flee = t + HOUR; g.tx = g.x + (g.x - s.denXY.x) / d * 700; g.ty = g.y + (g.y - s.denXY.y) / d * 700; };
    if (!PRESENT[s.act.type]) {
      log(s, t, 'event', `狮群里的 ${P} 在巢穴附近嗅了嗅，没有进去。幼崽缩在灌丛深处，一声不吭。`);
      away();
      return;
    }
    if (env.age >= 42 && Math.random() < 0.5) {
      say(s, t, 'mother', fill(pick(D.DIALOG.prideAllow), s, { P }));
      log(s, t, 'event', s.prideMet ? `${P} 又来看幼崽了。Naramat 这次只是盯着她，没有赶她走。` : `Naramat 第一次让狮群里的姐妹靠近：${P} 低头闻了闻幼崽，幼崽缩着脖子，好奇地看着这个陌生的大家伙。`);
      s.prideMet = true;
    } else {
      say(s, t, 'mother', fill(pick(D.DIALOG.prideBlock), s, { P }));
      log(s, t, 'event', `狮群里的 ${P} 走近了巢穴。Naramat 冲出灌丛，低吼着把她挡了回去。`);
    }
    away();
  }

  // ---------- 非法放牧带来的人兽冲突 ----------
  function people(s, t, env) {
    for (const herd of ECO().cattleHerds(s)) peopleOne(s, t, env, herd);
  }
  function peopleOne(s, t, env, herd) {
    const m = s.mother, den = s.denXY;
    const dDen = Math.hypot(herd.x - den.x, herd.y - den.y);
    // 牧人赶着牛群经过巢穴附近
    if (dDen < 300 && !(s.herdCD && t < s.herdCD)) {
      s.herdCD = t + 8 * HOUR;
      if (PRESENT[s.act.type]) {
        log(s, t, 'event', `牧人赶着牛群从巢穴旁边经过，吆喝声和牛铃声越来越近。Naramat 伏低身子，等他们走远后决定换个地方。`);
        say(s, t, 'mother', fill('（贴着地面，喉咙里压着低吼）别出声……是人。', s));
      } else {
        log(s, t, 'event', `牧人赶着牛群从巢穴旁边经过。幼崽缩在灌丛深处一动不动，没有被发现。`);
      }
      s.flagMove = true;
    }
    // 饿极了的母狮在夜里扑倒一头牛
    const hunting = s.act.type === 'hunt' && s.act.phase === 'search';
    const dMom = Math.hypot(herd.x - m.x, herd.y - m.y);
    if (hunting && dMom < 1000 && m.food < DAILY_KG && env.ph !== 'day' && !herd.raided && Math.random() < 0.2) {
      herd.raided = true;
      const c = ECO().addCarcass(s.eco, t, herd.x, herd.y, 'cattle', 'lion', 150, false);
      startFeed(s, t, env, c, 'cattle', false);
      s.stats.livestock = (s.stats.livestock || 0) + 1;
      log(s, t, 'danger', `饿极了的 Naramat 摸进牛群，扑倒了一头牛。牛群炸了窝，牧人的喊声响成一片。`);
      // 牧人的报复：只会把她弄伤，不会致死
      if (Math.random() < 0.6) {
        m.health = Math.max(20, m.health - rnd(30, 45));
        m.stamina = clamp(m.stamina - 30);
        s.stats.conflicts = (s.stats.conflicts || 0) + 1;
        s.act.end = t + 20 * 60000; // 被赶走，没吃几口
        log(s, t, 'danger', `牧人举着长矛和火把追了上来，Naramat 被刺伤了后腿，丢下猎物逃进了夜色。`, '报复性猎杀是东非狮子数量下降的主要原因之一。防狮围栏、牲畜补偿和社区巡护，能大大减少这种冲突。');
      }
      herd.until = t + 30 * 60000; // 牧人连夜把牛群赶走
    }
  }

  function newGame({ now, mode, cubs }) {
    const s = {
      v: 1, mode, birth: now, lastTick: now, rev: 0,
      mother: { name: 'Naramat', food: 16, stamina: 80, health: 100, x: 0, y: 0, px: 0, py: 0 },
      cubs: cubs.map((c) => ({ name: c.name, sex: c.sex, health: 100, satiety: 80, alive: true, diedAt: null, cause: null })),
      den: { site: 0, scent: 5, since: now },
      act: { type: 'nurse', start: now, end: now + 90 * 60000 },
      lastHunt: now - 20 * HOUR, lastDrink: now - 6 * HOUR, lastThreat: 0,
      flagMove: false, pendingReturn: null,
      stats: { outings: 0, attempts: 0, kills: 0, threats: 0, repelled: 0, moves: 0, prey: {} },
      enc: { hyena: 0, leopard: 0, baboon: 0, elephant: 0, buffalo: 0, hippo: 0, nomad: 0 },
      huntLog: [], log: [], dialog: [], milestones: {}, ended: null,
      checkin: { last: null, days: 0 },
    };
    s.denXY = siteXY(0);
    s.eco = ECO().init(now);
    checkMilestones(s, now);
    sayLine(s, now, 'nurse');
    return s;
  }

  function checkMilestones(s, t) {
    const age = (t - s.birth) / DAY;
    for (const m of D.MILESTONES) {
      if (age >= m.day && !s.milestones[m.day]) {
        s.milestones[m.day] = true;
        log(s, t, 'milestone', fill(m.text, s), m.tip);
      }
    }
  }

  function envAt(s, t, wx) {
    const h = nairobiHour(t);
    const w = wx(t);
    return { h, w, ph: phaseOf(h, w), mn: moon(t), age: (t - s.birth) / DAY, checked: s.checkin.last === dateKey(t), checks: s.checkin.day === dateKey(t) ? s.checkin.today || 0 : s.checkin.last === dateKey(t) ? 1 : 0 };
  }

  // 单次扑击的成功率：夜里平均约 30%，晨昏约 20%，白天约 8%（含冲刺距离过远的失败）
  // 保护区规定：游客车辆只能在 6:00–19:00 游猎，夜里不许进
  const touristHours = (h) => h >= 6 && h < 19;
  function huntChance(s, env, prey) {
    let p = 0.22;
    if (prey && D.PREY[prey]) p *= D.PREY[prey].mod || 1;
    // 夜里狮子占尽优势：平均成功率约 30%（含冲刺距离过远的失败）
    const f = { night: 1.83, dawn: 1.15, dusk: 1.15, day: 0.55 }[env.ph];
    p *= f;
    if (env.ph === 'night') {
      if (env.mn.illum < 0.25) p *= 1.2;
      else if (env.mn.illum > 0.75) p *= 0.8;
    }
    if (env.w.rain > 0.2) p *= 1.15;
    if (touristHours(env.h) && !env.checked) p *= 0.85; // 游客车辆只在 6:00–19:00 进保护区
    if (s.mother.stamina < 40) p *= 0.75;
    if (s.mother.health < 60) p *= 0.7;
    return Math.min(0.5, p);
  }
  function huntFactors(s, env) {
    const out = [];
    out.push([PHASE_NAME[env.ph], { night: '+', dawn: '+', dusk: '+', day: '−−' }[env.ph]]);
    if (env.ph === 'night') {
      if (env.mn.illum < 0.25) out.push(['暗夜（' + moonName(env.mn.phase) + '）', '+']);
      else if (env.mn.illum > 0.75) out.push(['月光明亮（' + moonName(env.mn.phase) + '）', '−']);
    }
    if (env.w.rain > 0.2) out.push(['下雨掩护', '+']);
    if (touristHours(env.h)) out.push(env.checked ? ['今日已签到·游客干扰降低', '='] : ['游客车辆干扰', '−']);
    if (s.mother.stamina < 40) out.push(['体力不足', '−']);
    if (s.mother.health < 60) out.push(['伤病', '−']);
    return out;
  }

  function preyPick(t, env) {
    const d = new Date(t + 3 * HOUR);
    const migrationGone = d.getUTCMonth() >= 10 && !(d.getUTCMonth() === 10 && d.getUTCDate() < 15);
    const list = Object.entries(D.PREY).map(([k, p]) => {
      let w = p.w;
      if (k === 'wildebeest' && migrationGone) w *= 0.3;
      if (env.checked && k !== 'buffalo') w *= 1.05;
      return [k, w];
    });
    let r = Math.random() * list.reduce((a, b) => a + b[1], 0);
    for (const [k, w] of list) if ((r -= w) <= 0) return k;
    return 'gazelle';
  }

  function startAct(s, t, type, mins, data) {
    s.act = Object.assign({ type, start: t, end: t + mins * 60000 }, data || {});
  }

  function decide(s, t, env) {
    const m = s.mother;
    const sinceHunt = (t - s.lastHunt) / HOUR;
    if ((s.flagMove || s.den.scent >= 70) && (env.ph !== 'day' || s.den.scent >= 88 || s.flagMove)) {
      let to = s.den.site;
      if (s.river && s.river.level > 0.3) to = highSite(s);
      while (to === s.den.site) to = Math.floor(Math.random() * D.SITES.length);
      startAct(s, t, 'move', rnd(60, 120), { from: s.den.site, to });
      sayLine(s, t, 'moveDen', { to: D.SITES[to].name });
      return;
    }
    // 体内的肉不到一天的量才出猎；吃饱一顿（24 公斤）大约 2–3 天不用捕猎
    if (m.food < DAILY_KG * 1.25 && sinceHunt > 4 && env.ph !== 'day' && env.ph !== 'dusk' && m.stamina > 35 && !(s.waitDarkUntil && t < s.waitDarkUntil && env.ph !== 'night')) {
      // 一次出猎 2–4 小时：狮子一天只活动约 3 小时
      startAct(s, t, 'hunt', rnd(120, 240), { phase: 'search', phaseEnd: t + rnd(20, 45) * 60000 });
      s.stats.outings++;
      sayLine(s, t, 'leaveHunt');
      log(s, t, 'hunt', 'Naramat 把幼崽藏好，独自离开灌丛去捕猎。');
      return;
    }
    // 白天出猎几乎没有胜算：只有体内的肉快吃光（不到半公斤）时，才冒险白天出去
    if (m.food < 0.5 && sinceHunt > 3 && m.stamina > 25) {
      startAct(s, t, 'hunt', rnd(100, 200), { phase: 'search', phaseEnd: t + rnd(20, 45) * 60000, desperate: true });
      s.stats.outings++;
      sayLine(s, t, 'leaveHunt');
      log(s, t, 'hunt', 'Naramat 饿得厉害，顾不上白天的炎热和游客车辆，冒险外出捕猎。');
      return;
    }
    if ((env.ph === 'dawn' || env.ph === 'dusk') && t - s.lastDrink > 14 * HOUR) {
      startAct(s, t, 'drink', rnd(10, 20)); // 去河边喝几分钟水
      sayLine(s, t, 'leaveDrink');
      return;
    }
    if (env.ph === 'day' && env.h >= 10 && env.h < 16) {
      startAct(s, t, 'rest', rnd(60, 150));
      return;
    }
    const type = pick(['nurse', 'nurse', 'groom', 'guard']);
    startAct(s, t, type, rnd(45, 120));
  }

  function endAct(s, t, env) {
    const a = s.act;
    if (a.type === 'hunt' || a.type === 'feed') {
      s.lastHunt = t;
      const m = s.mother;
      const d = Math.hypot(m.x - s.denXY.x, m.y - s.denXY.y);
      const result = { kill: a.kill || null, stolen: a.stolen || null };
      if (d > 60) {
        startAct(s, t, 'return', Math.max(10, Math.ceil(d / RETURN_SPEED) * 10), { result });
        return;
      }
      arrive(s, t, result);
    } else if (a.type === 'return') {
      arrive(s, t, a.result || {});
    } else if (a.type === 'drink') {
      s.lastDrink = t;
      onReturn(s, t);
    } else if (a.type === 'move') {
      let next = a.to;
      if (next == null) { next = s.den.site; while (next === s.den.site) next = Math.floor(Math.random() * D.SITES.length); }
      s.den = { site: next, scent: 4, since: t };
      s.flagMove = false;
      s.stats.moves++;
      log(s, t, 'event', `Naramat 把幼崽一只一只叼到了新的藏身处：${D.SITES[next].name}。`);
    }
    decide(s, t, env);
  }

  const RETURN_SPEED = 500; // 母狮走路：每 10 分钟约 500 米
  function arrive(s, t, r) {
    if (r.kill) {
      sayLine(s, t, 'returnSuccess', { prey: preyLabel(r.kill) });
      log(s, t, 'hunt', `Naramat 回到巢穴，体内储备约 ${Math.round(s.mother.food)} 公斤肉，够 ${(s.mother.food / DAILY_KG).toFixed(1)} 天。`);
    } else {
      sayLine(s, t, 'returnFail');
      log(s, t, 'hunt', 'Naramat 空手而归。');
    }
    onReturn(s, t);
  }

  function onReturn(s, t) {
    const pr = s.pendingReturn;
    if (!pr) return;
    s.pendingReturn = null;
    const sp = hazard(pr.sp).name;
    if (pr.dead.length) {
      for (const name of pr.dead) say(s, t, 'mother', fill(D.DIALOG.grief[0], s, { X: name }));
      log(s, t, 'death', `Naramat 回来后发现巢穴被${sp}闯入过，${pr.dead.join('、')}不见了。她在附近找了很久。`);
    } else if (pr.hurt.length) {
      say(s, t, 'mother', `（闻到${sp}的气味，急忙舔舐${pr.hurt.join('、')}的伤口）妈妈回来了……不怕，不怕。`);
    } else {
      say(s, t, 'mother', `（嗅到灌丛外${sp}的气味，全身绷紧）有东西来过。我们得走了。`);
    }
    s.flagMove = true;
  }

  // 捕猎分阶段：搜寻（走向雷达上真实的猎物群）→ 潜伏接近（可能被发现而放弃）→ 追逐扑击 → 成功则进食
  // 另有“去抢”：赶走猎豹或不到 5 只的斑鬣狗，夺下它们的猎物
  const groupById = (s, id) => s.eco.groups.find((g) => g.id === id);
  function moveMom(m, x, y, speed) {
    const dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const k = Math.min(speed, d) / d;
    m.x += dx * k; m.y += dy * k;
    return speed >= d;
  }
  function huntStep(s, t, env) {
    const a = s.act, m = s.mother;
    // 夜里出去的，天亮了还没得手就回家，不在白天硬拼（饿极了的除外）
    if (env.ph === 'day' && !a.desperate && (a.phase === 'search' || a.phase === 'stalk')) { a.end = t; return; }
    if (!a.phase) a.phase = 'search';
    if (a.phase === 'join') {
      const c = s.eco.carcasses.find((c) => c.id === a.carcassId);
      if (!c || c.owner !== 'pride' || c.kg < 5) { a.phase = 'search'; a.targetId = null; log(s, t, 'hunt', 'Naramat 赶到时，狮群已经把猎物吃得差不多了。'); return; }
      if (!moveMom(m, c.x, c.y, 600)) return;
      const who = pick(D.PRIDE_NAMES);
      const eat = startFeed(s, t, env, c, c.prey, false, rnd(14, 24));
      s.stats.joins = (s.stats.joins || 0) + 1;
      log(s, t, 'hunt', `Naramat 走进狮群，和 ${who} 她们挤在一起分食一只${ECO().preyName(c.prey)}，抢到约 ${Math.round(eat)} 公斤。`);
      return;
    }
    if (a.phase === 'steal') {
      const c = s.eco.carcasses.find((c) => c.id === a.carcassId);
      if (!c || c.owner === 'lion' || c.kg < 3) { a.phase = 'search'; a.targetId = null; return; }
      if (!moveMom(m, c.x, c.y, 600)) return;
      const hy = s.eco.groups.find((g) => g.sp === 'hyena' && g.hunt && g.hunt.cid === c.id);
      if (hy && hy.n >= 5) {
        log(s, t, 'hunt', `${hy.n} 只斑鬣狗守着猎物，Naramat 一只狮子抢不过，只好离开。`);
        a.phase = 'search'; a.targetId = null;
        return;
      }
      const owner = ECO().lionTakes(s, t, c);
      const who = owner === 'cheetah' ? '猎豹' : owner === 'leopard' ? '还没把猎物拖上树的花豹' : owner === 'hyena' ? `${hy ? hy.n : '几'} 只斑鬣狗` : null;
      log(s, t, 'hunt', who ? `Naramat 冲上去赶走了${who}，抢下它们的${ECO().preyName(c.prey)}。` : `Naramat 循着秃鹫找到一具${ECO().preyName(c.prey)}残骸。`);
      startFeed(s, t, env, c, c.prey, true);
      s.stats.steals = (s.stats.steals || 0) + 1;
      return;
    }
    let tg = a.targetId ? groupById(s, a.targetId) : null;
    if (a.phase === 'search') {
      if (!tg) {
        tg = ECO().lionTarget(s, t, { x: m.x, y: m.y });
        a.targetId = tg ? tg.id : null; a.prey = tg ? tg.sp : null;
      }
      if (!tg) return;
      a.prey = tg.sp;
      const d = Math.hypot(tg.x - m.x, tg.y - m.y);
      if (d <= STALK_AT) {
        a.phase = 'stalk'; a.stalkStart = t; a.from = [m.x, m.y]; a.phaseEnd = t + rnd(10, 25) * 60000;
      } else moveMom(m, tg.x - (tg.x - m.x) / d * (STALK_AT - 5), tg.y - (tg.y - m.y) / d * (STALK_AT - 5), 450);
      return;
    }
    if (!tg) { a.phase = 'search'; a.targetId = null; return; }
    a.prey = tg.sp;
    const d = Math.hypot(tg.x - m.x, tg.y - m.y);
    if (a.phase === 'stalk') {
      // 压低身子慢慢逼近，目标是摸到 30 米以内
      const left = Math.max(1, Math.round((a.phaseEnd - t) / STEP));
      if (d > CHARGE_AT) moveMom(m, tg.x - (tg.x - m.x) / d * CHARGE_AT, tg.y - (tg.y - m.y) / d * CHARGE_AT, Math.max(5, (d - CHARGE_AT) / left));
      if (t < a.phaseEnd) return;
      const r = Math.random();
      if (r < ((D.PREY[a.prey] && D.PREY[a.prey].alert) || 0.3)) { // 机敏的猎物（如黑面狷羚）更早发现她
        // 还没摸近就被发现，猎物跑了
        s.huntLog.push({ t, prey: a.prey, ok: false, abort: true });
        if (s.huntLog.length > 200) s.huntLog.shift();
        tg.flee = t + 20 * 60000; tg.tx = tg.x + (tg.x - m.x) / d * 300; tg.ty = tg.y + (tg.y - m.y) / d * 300;
        a.phase = 'search'; a.targetId = null;
        return;
      }
      // 15% 的时候在 35–80 米处被发现，她仍然冲了出去；其余摸到了 30 米以内
      a.chargeDist = r < 0.45 ? Math.round(rnd(35, 80)) : Math.round(rnd(10, CHARGE_AT));
      const dd = Math.max(1, Math.hypot(tg.x - m.x, tg.y - m.y));
      m.x = tg.x - (tg.x - m.x) / dd * a.chargeDist; m.y = tg.y - (tg.y - m.y) / dd * a.chargeDist;
      a.phase = 'chase'; a.from = [m.x, m.y]; a.phaseEnd = t + STEP;
      tg.flee = t + 20 * 60000; tg.tx = tg.x + (tg.x - m.x) / dd * 150; tg.ty = tg.y + (tg.y - m.y) / dd * 150;
      return;
    }
    if (a.phase === 'chase') {
      moveMom(m, tg.x - (tg.x - m.x) / Math.max(d, 1) * 3, tg.y - (tg.y - m.y) / Math.max(d, 1) * 3, 1200);
      if (t < a.phaseEnd) return;
      attempt(s, t, env, a.prey, tg, a.chargeDist);
      if (s.act.type === 'hunt') { a.phase = 'search'; a.targetId = null; }
    }
  }

  function startFeed(s, t, env, c, prey, stolen, maxEat) {
    const m = s.mother;
    const eat = Math.min(c.kg, FOOD_MAX - m.food, maxEat || Infinity);
    m.food += eat; c.kg -= eat;
    m.x = c.x; m.y = c.y;
    s.stats.kg = (s.stats.kg || 0) + eat;
    s.act.kill = prey; s.act.eaten = eat; s.act.stolen = !!stolen;
    s.act.type = 'feed'; s.act.killAt = t; s.act.carcassId = c.id;
    s.act.end = t + ((eat / 12) * 60 + rnd(20, 40)) * 60000; // 一小时约能吃 12 公斤
    return eat;
  }

  // 冲刺距离：30 米以内正常；超过 30 米成功率迅速下降，60 米以上为 0
  const STALK_AT = 100, CHARGE_AT = 30;
  const distFactor = (d) => (d == null || d <= CHARGE_AT ? 1 : Math.max(0, (60 - d) / 30));
  function attempt(s, t, env, prey, tg, chargeDist) {
    const p = huntChance(s, env, prey) * distFactor(chargeDist);
    s.stats.attempts++;
    const ok = Math.random() < p;
    const P = D.PREY[prey];
    const entry = { t, prey, ok, p: Math.round(p * 100), d: chargeDist, ph: env.ph };
    s.huntLog.push(entry);
    if (s.huntLog.length > 200) s.huntLog.shift();
    if (ok) {
      const m = s.mother;
      const c = ECO().addCarcass(s.eco, t, tg ? tg.x : m.x, tg ? tg.y : m.y, prey, 'lion', P.meat, false);
      m.stamina = clamp(m.stamina - 10);
      const eat = startFeed(s, t, env, c, prey, false);
      entry.kg = Math.round(eat);
      s.stats.kills++;
      s.stats.prey[prey] = (s.stats.prey[prey] || 0) + 1;
      if (tg && tg.sp === 'giraffe') tg.calf = 0;
      if (s.eco) ECO().sight(s, t, 'lionKill', { x: c.x, y: c.y, night: env.h >= 20 || env.h < 5, moon: env.mn.illum, rain: env.w.rain || 0 });
      log(s, t, 'hunt', `捕猎成功！Naramat 在${PHASE_NAME[env.ph]}从 ${chargeDist || 20} 米外冲刺，扑倒了一只${P.name}（本次成功率 ${Math.round(p * 100)}%），吃下约 ${Math.round(eat)} 公斤肉，够 ${(m.food / DAILY_KG).toFixed(1)} 天。`);
      return { ok, prey };
    }
    s.mother.stamina = clamp(s.mother.stamina - 6);
    if (chargeDist > CHARGE_AT) log(s, t, 'hunt', `Naramat 在 ${chargeDist} 米外就被${P.name}发现了，她还是冲了出去——距离太远，${chargeDist >= 60 ? '根本追不上' : '没能追上'}。`);
    if (Math.random() < P.risk) {
      s.mother.health = clamp(s.mother.health - 25);
      s.mother.stamina = clamp(s.mother.stamina - 15);
      log(s, t, 'danger', `Naramat 扑击${P.name}时被踢中，受了伤。`);
    }
    return { ok, prey };
  }

  // 母狮的位置（捕猎、返回时在 huntStep / 返回逻辑里移动）
  function placeMother(s, t) {
    const m = s.mother, a = s.act, den = s.denXY;
    if (PRESENT[a.type]) { m.x = den.x; m.y = den.y; return; }
    if (a.type === 'drink') {
      const n = ECO().geo.nearestOn(ECO().geo.riverLines, den.x, den.y);
      const p = Math.sin(Math.min(1, (t - a.start) / (a.end - a.start)) * Math.PI);
      m.x = den.x + (n[1] - den.x) * p; m.y = den.y + (n[2] - den.y) * p;
    } else if (a.type === 'move' && a.to != null) {
      const A = siteXY(a.from != null ? a.from : s.den.site), B = siteXY(a.to);
      const n = Math.max(1, s.cubs.filter((c) => c.alive).length);
      const seg = Math.min(0.999, (t - a.start) / (a.end - a.start)) * (2 * n - 1);
      const f = seg - Math.floor(seg);
      const fwd = Math.floor(seg) % 2 === 0;
      m.x = fwd ? A.x + (B.x - A.x) * f : B.x + (A.x - B.x) * f;
      m.y = fwd ? A.y + (B.y - A.y) * f : B.y + (A.y - B.y) * f;
    } else if (a.type === 'return') {
      moveMom(m, den.x, den.y, RETURN_SPEED);
    }
  }

  // 机会主义：离开林地的狒狒、绿猴靠近，或附近有猎豹、小群鬣狗的猎物可抢
  function opportunity(s, t, env) {
    const m = s.mother, a = s.act;
    const atDen = PRESENT[a.type];
    const searching = a.type === 'hunt' && a.phase === 'search';
    if (!(atDen || searching || a.type === 'return')) return;
    if (m.food > (atDen ? DAILY_KG : 12)) return;
    const op = ECO().lionOpportunity(s, t, env);
    if (!op) return;
    // 藏崽期间她主要靠自己；饿到不足半天的量时，才会离开幼崽去狮群分一口
    if (op.type === 'join' && m.food < DAILY_KG && !(s.joinCD && t < s.joinCD) && Math.random() < 0.45) {
      const c = op.carcass;
      if (a.type !== 'hunt') { startAct(s, t, 'hunt', rnd(180, 300)); s.stats.outings++; sayLine(s, t, 'joinPride'); }
      Object.assign(s.act, { phase: 'join', carcassId: c.id, prey: c.prey, from: [m.x, m.y] });
      log(s, t, 'hunt', `远处传来狮群分食的声音。Naramat 饿了，决定离开幼崽，去狮群那里分一口${ECO().preyName(c.prey)}。`);
      return;
    }
    if (op.type === 'primate' && Math.random() < 0.35) {
      const g = op.group;
      const name = ECO().preyName(g.sp);
      if (a.type !== 'hunt') { startAct(s, t, 'hunt', rnd(60, 120)); s.stats.outings++; }
      Object.assign(s.act, { phase: 'search', targetId: g.id, prey: g.sp });
      log(s, t, 'hunt', `${name}群离开林地太远，靠近了 Naramat。她压低身子，盯上了其中一只。`);
    } else if (op.type === 'steal' && Math.random() < 0.3) {
      const c = op.carcass;
      if (a.type !== 'hunt') { startAct(s, t, 'hunt', rnd(60, 120)); s.stats.outings++; }
      Object.assign(s.act, { phase: 'steal', carcassId: c.id, prey: c.prey, from: [m.x, m.y], phaseEnd: t + 30 * 60000 });
      const who = c.owner === 'cheetah' ? '猎豹' : c.owner === 'leopard' ? '花豹' : c.owner === 'hyena' ? '斑鬣狗' : '秃鹫';
      log(s, t, 'hunt', `Naramat 看到远处的${who}${c.owner ? '正在吃' : '围着'}一只${ECO().preyName(c.prey)}，朝那边走去。`);
    }
  }

  const THREAT_RATE = {
    // 雄狮联盟在 2 公里内巡视时，鬣狗不太敢靠近
    hyena: (s, env) => (0.08 + (s.den.scent / 100) * 0.3) * { night: 2.2, dawn: 1.2, dusk: 1.4, day: 0.2 }[env.ph] * (s.eco && ECO().coalitionNear(s) ? 0.6 : 1),
    nomad: (s, env) => (s.eco && ECO().hasNomad(s) ? 1.0 : 0) * { night: 1.5, dawn: 1, dusk: 1.2, day: 0.5 }[env.ph],
    // 吃饱了的花豹（两天内捕到过猎物）很少来打幼崽的主意
    leopard: (s, env) => 0.07 * { night: 2.5, dusk: 1.5, dawn: 1, day: 0.1 }[env.ph] * (s.eco && ECO().leopardFed(s, s.lastTick) ? 0.3 : 1),
    baboon: (s, env) => 0.12 * { day: 2.2, dawn: 0.8, dusk: 0.5, night: 0 }[env.ph],
    elephant: () => 0.07,
    buffalo: (s, env) => 0.07 * { night: 1.3, dawn: 1.3, dusk: 1.3, day: 0.6 }[env.ph],
    hippo: (s, env) => 0.25 * D.SITES[s.den.site].river * { night: 2.6, dusk: 0.5, dawn: 0.5, day: 0 }[env.ph],
  };
  function threatRisk(s, env) {
    const out = {};
    for (const k in THREAT_RATE) {
      const d = s.eco ? ECO().distToDen(s, k) : 1000;
      out[k] = THREAT_RATE[k](s, env) * Math.max(0.2, Math.min(1.7, 1.7 - d / 1000));
    }
    return out;
  }

  const hazard = (sp) => (sp === 'flood' ? D.FLOOD : D.SPECIES[sp]);
  function harmCub(s, t, cub, sp) {
    const name = hazard(sp).name;
    if (s.mode === 'guard' || Math.random() > hazard(sp).lethal) {
      cub.health = Math.max(s.mode === 'guard' ? 8 : 0, cub.health - 45);
      if (cub.health > 0) {
        log(s, t, 'danger', `${cub.name}被${name}伤到了，伤得不轻。`);
        return 'hurt';
      }
    }
    killCub(s, t, cub, name);
    return 'dead';
  }
  function killCub(s, t, cub, cause) {
    cub.alive = false;
    cub.health = 0;
    cub.diedAt = t;
    cub.cause = cause;
    log(s, t, 'death', `${cub.name}没能活下来（${cause}）。`, '野外幼狮第一年的死亡率很高，这是草原残酷而真实的一面。');
  }

  function encounter(s, t, sp, env, ctx) {
    const S = D.SPECIES[sp];
    s.enc[sp]++;
    s.stats.threats++;
    if (s.eco) ECO().summon(s, t, sp);
    s.lastThreat = t;
    const present = !!PRESENT[s.act.type];
    const site = D.SITES[s.den.site];
    const wander = env.age >= 21 && env.age <= 80 ? 1.25 : 1;
    let detect = S.detect * (1 - site.cover * 0.55) * wander;
    if (S.smell) detect *= 0.5 + s.den.scent / 100;
    if (s.hideUntil && t < s.hideUntil) detect *= 0.6; // 玩家选了“原地藏好”：幼崽一动不动
    const alive = s.cubs.filter((c) => c.alive);
    let outcome = 'pass';
    const fx = { type: 'threat', sp, present, outcome, t };

    if (Math.random() >= detect) {
      log(s, t, 'threat', `${S.name}在${site.name}附近经过，没有发现幼崽。`);
      if (present) say(s, t, 'mother', fill(D.DIALOG.hush[0], s));
    } else if (present) {
      say(s, t, 'mother', fill(D.DIALOG.confront[sp], s));
      let inj = S.guard.motherInj, harm = S.guard.cubHarm;
      if (s.mother.health < 60 || s.mother.stamina < 30) harm *= 1.5;
      if (Math.random() < inj) {
        s.mother.health = clamp(s.mother.health - rnd(15, 30));
        log(s, t, 'danger', `Naramat 在与${S.name}的冲突中受了伤。`);
      }
      if (alive.length && Math.random() < harm) {
        outcome = harmCub(s, t, pick(alive), sp) === 'dead' ? 'dead' : 'hurt';
      } else {
        outcome = 'repel';
        s.stats.repelled++;
        log(s, t, 'threat', `${S.name}发现了巢穴，Naramat 挺身而出，把它赶走了。`);
      }
      if (sp !== 'baboon') s.flagMove = true;
    } else {
      const pr = s.pendingReturn || { sp, dead: [], hurt: [] };
      if (alive.length && Math.random() < S.unguarded) {
        const victims = [pick(alive)];
        const other = alive.find((c) => c !== victims[0]);
        if (other && Math.random() < 0.25) victims.push(other);
        for (const c of victims) {
          const r = harmCub(s, t, c, sp);
          (r === 'dead' ? pr.dead : pr.hurt).push(c.name);
          outcome = r === 'dead' ? 'dead' : outcome === 'dead' ? 'dead' : 'hurt';
        }
        log(s, t, 'danger', `Naramat 不在时，${S.name}闯进了${site.name}。`);
      } else {
        outcome = 'hid';
        log(s, t, 'threat', `Naramat 不在时，${S.name}在巢穴边逗留了很久。幼崽一动不动地趴着，躲过了这一劫。`);
      }
      pr.sp = sp;
      s.pendingReturn = pr;
    }
    fx.outcome = outcome;
    if (sp === 'hyena' && s.hideWatch && t < s.hideWatch.until && (outcome === 'dead' || outcome === 'hurt' || outcome === 'repel')) s.hideWatch.ok = false; // 斑鬣狗还是找到了巢穴
    for (let i = s.log.length - 1; i >= 0 && s.log[i].t === t; i--) s.log[i].sp = sp;
    if (ctx.emit) {
      ctx.emit(fx);
      if (outcome === 'dead' || outcome === 'hurt' || outcome === 'repel')
        ctx.emit({ type: 'notify', title: `⚠️ ${S.name}靠近巢穴`, body: s.log[s.log.length - 1].text });
    }
  }

  function finish(s, t, ctx) {
    const alive = s.cubs.filter((c) => c.alive);
    s.ended = { t, alive: alive.map((c) => c.name), win: alive.length > 0 };
    if (alive.length) {
      log(s, t, 'milestone', `八周过去了。Naramat 带着${alive.map((c) => c.name).join('和')}穿过草原，回到了狮群。${D.PRIDE_NAMES[0]} 和 ${D.PRIDE_NAMES[1]} 迎上来，和 Naramat 互相蹭头；Satala 低头嗅了嗅幼崽，Saruni 和 Saitoti 远远地看着。幼崽们挤在妈妈腿边，第一次见到这么多狮子。一个新的生命阶段开始了。`,
        '回到狮群后，幼崽会和其他同龄幼崽一起被“合群”抚养，母狮们甚至会互相哺乳对方的幼崽。');
      say(s, t, 'mother', '（昂起头，发出一连串长长的狮吼）我们回来了。');
    } else {
      log(s, t, 'death', 'Naramat 独自回到了狮群。这一胎没有幼崽活下来——这在野外很常见，母狮通常会在数月后再次繁殖。');
    }
    if (ctx.emit) ctx.emit({ type: 'notify', title: '狮子养成记', body: s.log[s.log.length - 1].text });
  }

  function step(s, t, ctx) {
    if (s.ended) return;
    const env = envAt(s, t, ctx.wx);
    checkMilestones(s, t);
    if (env.age >= TOTAL_DAYS) return finish(s, t, ctx);

    const m = s.mother;
    const present = !!PRESENT[s.act.type];
    m.food = Math.max(0, m.food - (DAILY_KG / STEPS_PER_DAY) * (s.act.type === 'hunt' ? 1.4 : 1));
    m.stamina = clamp(m.stamina + (present ? 0.8 : s.act.type === 'hunt' ? -0.5 : -0.1));
    if (m.food < 0.3) m.health = clamp(m.health - 0.15);
    else m.health = clamp(m.health + 0.08);

    const milk = m.food > DAILY_KG / 2 ? 2.4 : m.food > 0.5 ? 1.4 : 0.5;
    for (const c of s.cubs) {
      if (!c.alive) continue;
      c.satiety = clamp(c.satiety - (env.age > 45 ? 0.85 : 0.75) + (present ? milk : 0));
      if (c.satiety < 12) c.health = clamp(c.health - 0.2, s.mode === 'guard' ? 5 : 0);
      else c.health = clamp(c.health + 0.12);
      if (c.health <= 0) killCub(s, t, c, '饥饿');
    }

    s.den.scent = clamp(s.den.scent + 0.06 - (env.w.rain > 0 ? env.w.rain * 0.25 : 0));
    riverStep(s, t, env);

    s.denXY = siteXY(s.den.site);
    m.px = m.x; m.py = m.y;
    if (s.act.type === 'return') {
      placeMother(s, t);
      if (Math.hypot(m.x - s.denXY.x, m.y - s.denXY.y) < 5 || t >= s.act.end) { m.x = s.denXY.x; m.y = s.denXY.y; endAct(s, t, env); }
    } else if (t >= s.act.end && !(s.act.type === 'hunt' && (s.act.phase === 'chase' || s.act.phase === 'steal' || s.act.phase === 'join'))) endAct(s, t, env);
    else if (s.act.type === 'hunt') huntStep(s, t, env);
    if (s.act.type !== 'hunt' && s.act.type !== 'feed' && s.act.type !== 'return') placeMother(s, t);
    if (s.eco) { ECO().step(s, t, env); opportunity(s, t, env); prideVisit(s, t, env); people(s, t, env); }
    decisionStep(s, t, env, ctx);
    s.morale = Math.max(0, morale(s) - 1 / 6); // 士气每 10 分钟一步约降 1/6，即每小时约 −1
    quizStep(s, t, ctx);

    if (t - s.lastThreat > 2 * HOUR && s.act.type !== 'move') {
      const risk = threatRisk(s, env);
      for (const sp in risk) {
        if (Math.random() < risk[sp] / STEPS_PER_DAY) { encounter(s, t, sp, env, ctx); break; }
      }
    }

    talk(s, t, env);
    if (Math.random() < 1 / STEPS_PER_DAY) log(s, t, 'knowledge', pick(D.TIPS));

    if (!s.cubs.some((c) => c.alive) && !s.ended) finish(s, t, ctx);
  }

  // 补算到 now；返回步数
  function advance(s, now, ctx) {
    let n = 0;
    while (!s.ended && s.lastTick + STEP <= now) {
      s.lastTick += STEP;
      step(s, s.lastTick, ctx);
      n++;
    }
    return n;
  }

  // 签到：每天两次，分别支持日班（6:00–18:00）和夜班（18:00–次日 6:00）巡护。
  // 签到后，这一班的巡护车出发，一直巡逻到换班（不用步行巡护，免得惊扰野生动物）
  const CHECKIN_MAX = 2;
  function shiftOf(t) {
    const h = nairobiHour(t);
    const day = h >= 6 && h < 18;
    // 夜班跨过午夜：凌晨 0–6 点算前一天的夜班
    const base = h < 6 ? t - 6 * HOUR : t;
    const end = (() => { const d0 = Date.parse(dateKey(base) + 'T00:00:00+03:00'); return d0 + (day ? 18 : 30) * HOUR; })();
    return { shift: day ? 'day' : 'night', key: dateKey(base) + (day ? '-day' : '-night'), end, name: day ? '日班' : '夜班' };
  }
  function checkinState(s, now) {
    const c = s.checkin, sh = shiftOf(now);
    const k = dateKey(now);
    const today = c.day === k ? c.today || 0 : 0;
    const done = (c.shifts || []).includes(sh.key);
    return { today, shift: sh, done, can: !done, wait: done ? Math.max(0, sh.end - now) : 0 };
  }
  function checkin(s, now) {
    const st = checkinState(s, now);
    if (!st.can) return false;
    const c = s.checkin, k = dateKey(now), sh = st.shift;
    if (c.last !== k) { c.days++; c.streak = c.last === dateKey(now - DAY) ? (c.streak || 0) + 1 : 1; } // 连续签到天数
    if (sh.shift === 'night') c.nightTotal = (c.nightTotal || 0) + 1;
    c.last = k;
    c.today = c.day === k ? (c.today || 0) + 1 : 1; c.day = k;
    c.lastAt = now; c.total = (c.total || 0) + 1;
    c.shifts = (c.shifts || []).concat(sh.key).slice(-10);
    const v = s.eco ? ECO().dispatchPatrol(s, now, 'vehicle', sh.end - now, true) : null;
    if (v) v.shift = sh.shift;
    const until = sh.shift === 'day' ? ' 18:00' : '明早 6:00';
    log(s, now, 'event', `你签到支持了${sh.name}巡护：巡护员开着巡护车出发，在北边边界和领地里巡逻到${until}。今天的非法放牧 −${Math.round((1 - Math.pow(0.8, c.today)) * 100)}%${sh.shift === 'day' ? '，白天的游客车辆干扰也少了' : ''}。`);
    return true;
  }

  root.LionSim = {
    quizStep, answerQuiz, morale, DECISIONS, resolveDecision, touristHours, floodLine, preyLabel, STEP, HOUR, DAY, TOTAL_DAYS, PRESENT, ACT_NAME, PHASE_NAME, FOOD_MAX, DAILY_KG, HUNT_PHASE,
    newGame, advance, step, checkin, checkinState, shiftOf, CHECKIN_MAX, envAt, huntChance, huntFactors, threatRisk,
    nairobiHour, dateKey, moon, moonName, phaseOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
