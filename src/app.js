// 界面与主循环
(function () {
  const Sim = LionSim, D = LionData, Wx = LionWeather;
  const SAVE = 'lion_save_v1';
  const desk = window.desk || null;
  if (!desk) document.body.classList.add('browser');
  // 在浏览器里预览时，整个界面按 1200×840 等比缩放到窗口大小，不挤压布局
  function fitToWindow() {
    if (desk) return;
    const k = Math.min(innerWidth / 1200, innerHeight / 840, 1);
    const el = document.getElementById('app');
    el.style.cssText = `position:absolute;left:0;top:0;width:1200px;height:840px;transform:scale(${k});transform-origin:0 0;`;
    const mc = document.getElementById('modalCard');
    if (mc) mc.style.transform = k < 1 ? `scale(${k})` : ''; // 弹窗也一起缩放
  }
  window.addEventListener('resize', fitToWindow);
  fitToWindow();

  let S = null;
  let offset = 0; // 开发用快进偏移（毫秒）
  let lastRev = -1, lastTab = '', lastDlg = 0, lastStatus = 0;
  const now = () => Date.now() + offset;
  const $ = (id) => document.getElementById(id);

  const live = {
    wx: (t) => Wx.at(t),
    emit(fx) {
      if (fx.type === 'notify') notify(fx.title, fx.body);
    },
  };
  const quiet = { wx: (t) => Wx.at(t) };

  // 游戏开始后时间按真实时间流逝；这里只是默默记住进度，关掉窗口再打开能接着算
  function save() {
    if (!S) return;
    S.devOffset = offset;
    try { localStorage.setItem(SAVE, JSON.stringify(S, (k, v) => (k.startsWith('__') ? undefined : v))); } catch (e) { /* 存储不可用时仅本次有效 */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; }
  }
  function notify(title, body) {
    try {
      if (desk && desk.notify) desk.notify(title, body);
      else if (window.Notification && Notification.permission !== 'denied') new Notification(title, { body });
    } catch (e) { /* ignore */ }
  }

  // ---------- 时间格式 ----------
  const pad = (n) => String(n).padStart(2, '0');
  function hhmm(t, sec) {
    const d = new Date(t + 3 * 3600000);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + (sec ? ':' + pad(d.getUTCSeconds()) : '');
  }
  function stamp(t) { return `第${Math.floor((t - S.birth) / Sim.DAY) + 1}天 ${hhmm(t)}`; }
  function dur(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60);
    if (h < 48) return h + ' 小时' + (m % 60 ? ' ' + (m % 60) + ' 分' : '');
    return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小时';
  }
  const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // 当前行为的完整名称：捕猎时带上阶段和目标猎物
  function actLabel(a) {
    if (a.type === 'hunt' && a.phase) {
      const ph = Sim.HUNT_PHASE[a.phase];
      return '外出捕猎 · ' + (a.phase === 'search' ? ph : ph + (a.prey ? Sim.preyLabel(a.prey) : ''));
    }
    if (a.type === 'feed' && a.kill) return '进食' + Sim.preyLabel(a.kill);
    return Sim.ACT_NAME[a.type];
  }

  // ---------- 渲染 ----------
  function bar(label, v, cls) {
    v = Math.round(v);
    const low = cls !== 'bad' && v < 25 ? ' low' : '';
    return `<div class="row"><span>${label}</span><div class="bar ${cls || ''}${low}"><i style="width:${v}%"></i></div><span>${v}</span></div>`;
  }

  function cubStatus(c, env) {
    if (!c.alive) return `已故 · ${c.cause}`;
    const present = Sim.PRESENT[S.act.type];
    if (c.health < 50) return '受伤，蜷在窝里舔伤口';
    if (c.satiety < 20) return '饿得直叫';
    if (S.act.type === 'move') return '被妈妈叼着转移';
    if (!present) return env.age < 21 ? '独自缩在灌丛深处' : '一动不动地趴着等妈妈';
    if (S.act.type === 'nurse') return '正在吃奶';
    if (env.age < 21) return '挨着妈妈睡觉';
    return ['和兄弟姐妹扑咬玩耍', '追妈妈的尾巴', '在灌丛边探头张望'][Math.floor(now() / 600000) % 3];
  }

  function renderDen(env) {
    const m = S.mother;
    const site = D.SITES[S.den.site];
    let h = '<div class="cards">';
    h += `<div class="card"><h4>Naramat <small>母狮 · 4岁</small></h4><div class="st">${actLabel(S.act)}</div>
      <div class="row"><span>肉量</span><div class="bar ${m.food < Sim.DAILY_KG / 2 ? 'low' : ''}"><i style="width:${(m.food / Sim.FOOD_MAX) * 100}%"></i></div><span>${m.food.toFixed(0)}kg</span></div>
      <div class="sub" style="margin:-1px 0 3px 40px">够 ${(m.food / Sim.DAILY_KG).toFixed(1)} 天 · 每天至少 ${Sim.DAILY_KG} 公斤</div>${bar('体力', m.stamina)}${bar('健康', m.health, 'hp')}</div>`;
    for (const c of S.cubs) {
      h += `<div class="card ${c.alive ? '' : 'dead'}"><h4>${esc(c.name)} <small>${c.sex === 'f' ? '♀ 雌' : '♂ 雄'} · ${Math.floor(env.age)}天</small></h4>
        <div class="st">${cubStatus(c, env)}</div>${bar('饱食', c.alive ? c.satiety : 0)}${bar('健康', c.health, 'hp')}</div>`;
    }
    h += `<div class="card"><h4>巢穴 <small>已转移 ${S.stats.moves} 次</small></h4><div class="st">${site.name}</div>
      ${bar('隐蔽', site.cover * 100, 'hp')}${bar('气味', S.den.scent, 'bad')}${bar('近河', site.river * 100)}
      ${waterRow()}
      <div class="sub" style="margin-top:4px">已驻留 ${dur(now() - S.den.since)}${S.den.scent > 60 ? '，气味渐重' : ''}</div></div>`;
    h += '</div>';
    const recent = S.log.filter((e) => e.kind !== 'knowledge' && e.kind !== 'eco').slice(-3).reverse();
    h += '<h5 style="margin-top:12px">最近动态</h5><div class="diary">' + recent.map((e) =>
      `<div class="entry ${e.kind}"><span class="t">${stamp(e.t)}</span><span class="x">${esc(e.text)}</span></div>`).join('') + '</div>';
    $('pane-den').innerHTML = h;
  }

  function renderHunt(env) {
    const st = S.stats;
    const rate = st.attempts ? (st.kills / st.attempts) * 100 : 0;
    const p = Sim.huntChance(S, env);
    const factors = Sim.huntFactors(S, env).map(([n, d]) => `<span class="chip ${d.includes('+') ? 'up' : d.includes('−') ? 'down' : ''}">${n} ${d}</span>`).join('');
    const prey = Object.entries(st.prey).map(([k, n]) => `${Sim.preyLabel(k)} ×${n}`).join('、') || '还没有';
    const hl = S.huntLog.slice(-14).reverse().map((a) =>
      `<div class="${a.ok ? 'ok' : 'no'}">${stamp(a.t)} · ${a.abort ? '潜伏' + Sim.preyLabel(a.prey) + ' · 被发现，放弃' : '追逐' + Sim.preyLabel(a.prey) + ' · ' + (a.ok ? '成功，吃下 ' + a.kg + ' 公斤' : '失败') + '（' + (a.d ? '冲刺 ' + a.d + ' 米 · ' : '') + a.p + '%）'}</div>`).join('') || '<div class="no">Naramat 还没有出猎。</div>';
    const since = dur(now() - S.lastHunt);
    $('pane-hunt').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><b>${st.outings}</b><span>外出捕猎</span></div>
        <div class="stat"><b>${st.attempts}</b><span>扑击次数</span></div>
        <div class="stat"><b>${st.kills}</b><span>成功猎杀</span></div>
        <div class="stat"><b>${rate.toFixed(1)}%</b><span>实际成功率</span></div>
      </div>
      <div class="grid2">
        <div>
          <h5>此刻出猎，单次扑击成功率</h5>
          <div class="big">${Math.round(p * 100)}%</div>
          <div class="chips">${factors}</div>
          <div class="sub">夜里是狮子的时间：夜间冲刺的成功率约 30%，晨昏约 20%，白天炎热、游客车辆多，只有 8% 左右。冲刺距离超过 30 米成功率迅速下降，60 米以上几乎不可能得手。</div>
          <h5 style="margin-top:10px">猎获记录</h5><div class="sub">${prey}</div>
          <h5 style="margin-top:10px">食量</h5>
          <div class="sub">体内储备 ${S.mother.food.toFixed(1)} 公斤，够 ${(S.mother.food / Sim.DAILY_KG).toFixed(1)} 天。母狮维持自己和哺乳每天至少要 ${Sim.DAILY_KG} 公斤肉；一顿最多吃 ${Sim.FOOD_MAX} 公斤（3 天的量），吃饱后两三天都不用捕猎。不到一天的量时，她就会在夜里出猎。</div>
          <div class="sub" style="margin-top:4px">距上次捕猎：${since} · 累计进食 ${Math.round(st.kg || 0)} 公斤${st.scavenge ? ' · 腐肉/抢食 ' + st.scavenge + ' 次' : ''}</div>
        </div>
        <div><h5>最近的扑击</h5><div class="mini-list">${hl}</div></div>
      </div>`;
  }

  // 河水水位：相对当前巢穴被淹水位的比例
  function water() {
    const L = (S.river && S.river.level) || 0;
    const line = Sim.floodLine(S.den.site);
    return { L, line, ratio: L / line };
  }
  function waterRow() {
    const w = water();
    return `<div class="row"><span>水位</span><div class="bar ${w.ratio > 0.75 ? 'bad' : ''}"><i style="width:${Math.min(100, w.ratio * 100)}%"></i></div><span>+${w.L.toFixed(1)}m</span></div>`;
  }
  function renderThreat(env) {
    const risk = Sim.threatRisk(S, env);
    let h = '<div class="threats">';
    const w = water(), F = D.FLOOD;
    const fl = w.ratio < 0.5 ? 0 : w.ratio < 0.85 ? 1 : 2;
    h += `<div class="threat-card"><div class="ic">${F.icon}</div>
      <h4>${F.name} <span class="lvl l${fl}">${['低', '中', '高'][fl]}</span></h4>
      <div class="sub">恩提亚克河水位 +${w.L.toFixed(1)} 米 · 巢穴被淹水位约 +${w.line.toFixed(1)} 米</div>
      <p>${F.desc}</p></div>`;
    {
      const G = D.GRAZING, herds = S.eco ? S.eco.groups.filter((g) => g.sp === 'cattle' && !g.leaving) : [];
      const herd = herds.sort((a, b) => Math.hypot(a.x - S.denXY.x, a.y - S.denXY.y) - Math.hypot(b.x - S.denXY.x, b.y - S.denXY.y))[0];
      const dd = herd ? Math.hypot(herd.x - S.denXY.x, herd.y - S.denXY.y) : null;
      const lv = !herd ? 0 : dd < 800 ? 2 : 1;
      const st = S.stats;
      h += `<div class="threat-card"><div class="ic">${G.icon}</div>
        <h4>${G.name} <span class="lvl l${lv}">${['低', '中', '高'][lv]}</span></h4>
        <div class="sub">${herd ? `北边有 ${herds.length} 群牛（共约 ${herds.reduce((a, g) => a + g.n, 0)} 头），最近的距巢 ${(dd / 1000).toFixed(1)} 公里` : '眼下没有牛群进来'} · 巡护拦下 ${st.evicted || 0} 次 · 母狮杀牛 ${st.livestock || 0} 次，遭报复 ${st.conflicts || 0} 次</div>
        <p>${G.desc}</p></div>`;
    }
    for (const k of Object.keys(D.SPECIES)) {
      const sp = D.SPECIES[k];
      const r = risk[k];
      const lvl = r < 0.08 ? 0 : r < 0.25 ? 1 : 2;
      h += `<div class="threat-card"><div class="ic">${sp.icon}</div>
        <h4>${sp.name} <span class="lvl l${lvl}">${['低', '中', '高'][lvl]}</span></h4>
        <div class="sub">${sp.en} · 已遭遇 ${S.enc[k]} 次</div>
        <p>${sp.desc}</p></div>`;
    }
    h += '</div>';
    $('pane-threat').innerHTML = h;
  }

  function renderTalk() {
    $('talkList').innerHTML = S.dialog.slice(-80).reverse().map((d) => {
      const isCub = d.who === 'cub';
      let text = d.text, who = 'Naramat';
      if (isCub) { const i = text.indexOf('：'); who = text.slice(0, i); text = text.slice(i + 1); }
      return `<div class="msg ${isCub ? 'cub' : ''}"><span class="t">${stamp(d.t)}</span><span class="who">${esc(who)}</span><span>${esc(text)}</span></div>`;
    }).join('');
  }

  function renderDiary() {
    $('diaryList').innerHTML = S.log.slice(-150).reverse().map((e) =>
      `<div class="entry ${e.kind}"><span class="t">${stamp(e.t)}</span><span class="x">${e.kind === 'knowledge' ? '📖 ' : ''}${esc(e.text)}${e.tip ? `<span class="tip">📖 ${esc(e.tip)}</span>` : ''}</span></div>`).join('');
  }

  let radarR = 2000, radarInfo = null;
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m'; }
  function renderRadarSide() {
    if (!radarInfo) return;
    const { ent, den } = radarInfo;
    const ST = LionRadar.STYLE;
    const near = (pts, from) => pts.reduce((b, p) => { const d = Math.hypot(p[0] - from[0], p[1] - from[1]); return d < b[0] ? [d, p] : b; }, [1e9, null]);
    const momD = Math.hypot(radarInfo.mom[0] - den[0], radarInfo.mom[1] - den[1]);
    const alive = S.cubs.filter((c) => c.alive).length;
    const wv = water();
    let h = `<div class="lg ${wv.ratio > 0.75 ? 'alert' : ''}" style="grid-column:span 2"><i style="background:#3d86a3;border-radius:2px"></i><b>恩提亚克河水位 +${wv.L.toFixed(1)} 米</b><span>${wv.ratio > 1 ? '⚠ 已漫进巢穴' : wv.ratio > 0.75 ? '⚠ 快涨到巢穴了' : '巢穴约 +' + wv.line.toFixed(1) + ' 米会被淹'}</span></div>`;
    h += `<div class="lg"><i class="big" style="background:${ST.mom.color}"></i><b>Naramat</b><span>${actLabel(S.act)}${momD < 40 ? '' : ' · 离巢 ' + fmtDist(momD) + ' ' + LionRadar.bearing(radarInfo.mom[0] - den[0], radarInfo.mom[1] - den[1])}</span></div>`;
    h += `<div class="lg"><i class="small" style="background:${ST.cub.color}"></i><b>幼崽 ×${alive}</b><span>${S.act.type === 'move' ? '转移中' : Sim.PRESENT[S.act.type] ? '和妈妈在一起' : '独自藏在巢里'}</span></div>`;
    for (const k of ['cattle', 'vehicle', 'pride', 'coalition', 'nomad', 'hyena', 'leopard', 'cheetah', 'jackal', 'baboon', 'vervet', 'elephant', 'buffalo', 'hippo', 'giraffe', 'wildebeest', 'zebra', 'gazelle', 'impala', 'topi', 'warthog', 'car']) {
      const pts = ent[k] || [];
      if (!pts.length && (k === 'nomad' || k === 'cattle' || k === 'vehicle')) continue; // 流浪雄狮、非法放牧只在闯进来时出现
      if (!pts.length) { if (k === 'car') h += `<div class="lg"><i class="sq" style="background:${ST.car.color}"></i><b>游客车辆</b><span>夜间禁止游猎（6:00–19:00 开放）</span></div>`; continue; }
      const [d, p] = near(pts, den);
      const alert = LionRadar.THREATS.includes(k) && d < 300;
      const extra = k === 'giraffe' && (ent.giraffeCalf || []).length ? `（${ent.giraffeCalf.length} 只幼崽）` : '';
      h += `<div class="lg ${alert ? 'alert' : ''}"><i class="${k === 'car' || k === 'cattle' || k === 'vehicle' ? 'sq' : ''}" style="background:${ST[k].color}${ST[k].ring ? ';box-shadow:0 0 0 1.2px ' + ST[k].ring : ''}"></i><b>${ST[k].name} ×${pts.length}${extra}</b><span>${alert ? '⚠ ' : ''}距巢 ${fmtDist(d)} ${LionRadar.bearing(p[0] - den[0], p[1] - den[1])}</span></div>`;
    }
    $('radarLegend').innerHTML = h;
  }
  // 雷达：窗口在前台时约 20 帧/秒，你在用别的程序时降到 5 帧/秒；
  // 窗口隐藏、最小化或收起成小条时完全不画，省电
  let lastFrame = 0;
  function radarLoop(ts) {
    requestAnimationFrame(radarLoop);
    if (!S || !S.__env) return;
    if ((desk && document.hidden) || document.body.classList.contains('mini')) return;
    if (ts - lastFrame < (!desk || document.hasFocus() ? 50 : 200)) return;
    lastFrame = ts;
    const big = document.getElementById('radarBig');
    radarInfo = LionRadar.draw($('radar'), S, now(), S.__env, radarR) || radarInfo;
    if (big) radarInfo = LionRadar.draw(big, S, now(), S.__env, radarR) || radarInfo;
  }
  document.querySelectorAll('.radar-tools [data-r]').forEach((b) => b.onclick = () => {
    radarR = +b.dataset.r;
    document.querySelectorAll('.radar-tools [data-r]').forEach((x) => x.classList.toggle('on', x === b));
  });
  // 放大雷达：右上角 ✕、Esc、点空白处都能关闭
  function closeRadarBig() {
    if (!document.getElementById('radarBig')) return;
    $('modalCard').classList.remove('radar-big'); closeModal(); $('modalCard').innerHTML = '';
  }
  $('btnRadarBig').onclick = () => {
    modal('<button class="radar-close" id="btnRadarClose" title="关闭（Esc）">✕</button><canvas id="radarBig"></canvas>');
    $('modalCard').classList.add('radar-big');
    $('btnRadarClose').onclick = closeRadarBig;
  };
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeRadarBig(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRadarBig(); });

  // ---------- 声音 ----------
  // 记住上一次处理到的那一条，日志被截断也不会漏或重复
  let sndLogLast, sndDlgLast, sndDec = null, sndQuiz = null, sndInit = false;
  const newSince = (arr, last) => { const out = []; for (let i = arr.length - 1; i >= 0 && arr[i] !== last; i--) out.unshift(arr[i]); return out; };
  function sounds(env) {
    const Snd = window.LionSound;
    if (!Snd) return;
    const carcassNear = S.eco && S.eco.carcasses.some((c) => Math.hypot(c.x - S.denXY.x, c.y - S.denXY.y) < 2000);
    Snd.ambient(env, { river: (S.river && S.river.level) || 0, carcass: carcassNear });
    // 大象发现狮子：由模拟里的“可目击事件”触发号叫
    const sp = S.sightPending || [];
    for (const p of sp) if (p.type === 'trumpet' && !p.heard && now() - p.t < 60000) { p.heard = true; Snd.trumpet(); }
    if (!sndInit) { sndInit = true; sndLogLast = S.log[S.log.length - 1]; sndDlgLast = S.dialog[S.dialog.length - 1]; sndDec = S.decision && S.decision.t; return; }
    const logs = newSince(S.log, sndLogLast);
    if (logs.length < 50) for (const e of logs) {
      if (/吼声/.test(e.text)) Snd.roar(/公里外/.test(e.text));
      else if (e.sp === 'hyena' && (e.kind === 'threat' || e.kind === 'danger')) Snd.whoop();
      else if (e.sp === 'elephant' && (e.kind === 'threat' || e.kind === 'danger')) Snd.trumpet();
    }
    sndLogLast = S.log[S.log.length - 1];
    const dl = newSince(S.dialog, sndDlgLast);
    if (dl.length < 50) for (const d of dl.slice(-2)) (d.who === 'cub' ? Snd.mew() : Snd.contact());
    sndDlgLast = S.dialog[S.dialog.length - 1];
    const dt = S.decision && S.decision.t;
    if (dt && dt !== sndDec) Snd.chime();
    sndDec = dt;
    const qs = S.quiz && S.quiz.slot;
    if (sndQuiz != null && qs !== sndQuiz) Snd.chime();
    sndQuiz = qs;
  }
  $('btnSound').onclick = () => { const on = window.LionSound && LionSound.toggle(); $('btnSound').textContent = on ? '🔊' : '🔇'; };
  if (window.LionSound) $('btnSound').textContent = LionSound.on ? '🔊' : '🔇';
  // 听到鸟叫时，在雷达上方淡淡地显示是哪种鸟
  if (window.LionSound) LionSound.onBird = (name) => {
    const el = $('birdCap');
    el.textContent = '🐦 ' + name; el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 4500);
  };
  document.addEventListener('pointerdown', () => window.LionSound && LionSound.unlock(), { capture: true });

  // ---------- 勋章 ----------
  const isVisible = () => (desk ? !document.hidden : true) && !document.body.classList.contains('mini');
  function medalTick(t) {
    const MD = window.LionMedals;
    if (!MD || !S) return;
    MD.tick(S, t, { visible: isVisible(), radarGroups: (sp, R) => (S.eco ? S.eco.groups.filter((g) => g.sp === sp && !g.leaving && Math.hypot(g.x, g.y) < R) : []) });
    while (S.medalQueue && S.medalQueue.length) {
      const id = S.medalQueue.shift(), d = MD.byId[id], tier = MD.TIER[d.tier];
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = `<div class="ic" style="border-color:${tier.color}">${d.icon}</div><div><b>获得${tier.name}勋章 · ${esc(d.name)}</b><span>${esc(d.desc)}</span></div>`;
      $('medalToast').appendChild(el);
      setTimeout(() => el.remove(), 6200);
      if (window.LionSound) LionSound.chime();
      notify(`获得勋章 · ${d.name}`, d.desc);
      save(); lastRev = -1;
    }
  }
  function renderMedals() {
    const MD = window.LionMedals;
    if (!MD) return;
    const got = S.medals || {};
    const n = Object.keys(got).length;
    let h = `<div class="medal-sum">已获得 <b>${n}</b> / ${MD.DEFS.length} 枚勋章 · 目击类勋章要在事件发生时开着游戏，或收到通知后 15 分钟内赶来</div>`;
    for (const cat of MD.CATS) {
      const list = MD.DEFS.filter((d) => d.cat === cat.id);
      h += `<div class="medal-cat"><h5>${cat.icon} ${cat.name}</h5><div class="medal-grid">`;
      for (const d of list) {
        const g = got[d.id], tier = MD.TIER[d.tier];
        const secret = d.hidden && !g;
        h += `<div class="medal ${g ? 'got' : ''}" title="${secret ? '隐藏勋章' : esc(d.desc)}"><div class="ic" style="${g ? `border-color:${tier.color}` : ''}">${secret ? '？' : d.icon}</div>
          <b>${secret ? '？？？' : esc(d.name)}</b><small>${secret ? '隐藏勋章' : esc(d.desc)}${g ? `<br>${stamp(g.t)}` : ''}</small></div>`;
      }
      h += '</div></div>';
    }
    $('pane-medals').innerHTML = h;
  }

  // ---------- 巡护站问答 ----------
  let quizShown = null;
  function renderQuiz(t) {
    const m = Math.round(Sim.morale(S));
    const mel = $('morale');
    mel.innerHTML = `士气 <i><b style="width:${m}%"></b></i> ${m}`;
    mel.classList.toggle('low', m < 35);
    const el = $('quiz');
    const c = S.quiz && S.quiz.cur;
    const QZ = window.LionQuiz;
    const hidden = !c || !QZ || t > c.deadline || (c.answered != null && S.quiz.hideId === c.id);
    if (hidden) { if (quizShown) { el.style.display = 'none'; el.innerHTML = ''; quizShown = null; } return; }
    const key = c.id + ':' + c.t + ':' + c.answered + ':' + (c.order || []).join('');
    if (quizShown === key) { const l = el.querySelector('#quizLeft'); if (l) l.textContent = `${Math.max(1, Math.ceil((c.deadline - t) / 60000))} 分钟后换下一题`; return; }
    quizShown = key;
    const item = QZ.Q[c.id];
    const done = c.answered != null;
    const order = c.order || [0, 1, 2, 3]; // 选项显示顺序（已打乱）；按钮上记录的是原题里的下标
    el.innerHTML = `<h4>📖 巡护站问答 · 单选（4 选 1） <small id="quizLeft"></small></h4>
      <p class="q">${esc(item.q)}</p>
      <div class="opts">${order.map((i, k) => `<button data-i="${i}" ${done ? 'disabled' : ''} class="${done && i === item.a ? 'right' : done && i === c.answered ? 'wrong' : ''}">${'ABCD'[k]}. ${esc(item.o[i])}</button>`).join('')}</div>
      ${done ? `<div class="ex">${c.answered === item.a ? '✅ 答对了！巡护员士气 +15。' : `❌ 正确答案是 ${'ABCD'[order.indexOf(item.a)]}。`}${esc(item.e)}<small>出自 ${QZ.BOOK} · ${esc(item.ref)}</small></div>
      <div class="foot"><button class="link" id="quizHide">收起</button></div>` : `<div class="ex" style="color:var(--muted)">答对可提高巡护员士气和工作效率。</div>`}`;
    el.querySelectorAll('button[data-i]').forEach((b) => b.onclick = () => {
      if (Sim.answerQuiz(S, now(), +b.dataset.i) != null) { save(); lastRev = -1; render(); }
    });
    const hb = el.querySelector('#quizHide');
    if (hb) hb.onclick = () => { S.quiz.hideId = c.id; save(); render(); };
    el.style.display = '';
    renderQuiz(t);
  }

  // 抉择卡片：30 分钟内选择，否则按本能
  let decShown = null;
  function renderDecision(t) {
    const el = $('decision');
    const d = S.decision;
    if (!d) { if (decShown) { el.style.display = 'none'; el.innerHTML = ''; decShown = null; } return; }
    const D2 = Sim.DECISIONS[d.kind];
    const left = Math.max(0, d.deadline - t);
    const key = d.t + d.kind;
    if (decShown !== key) {
      decShown = key;
      el.innerHTML = `<h4>${D2.icon} 抉择 · ${D2.title} <small id="decLeft"></small></h4><p>${esc(D2.text(S, d.data))}</p>
        <div class="opts">${D2.options.map((o) => `<button data-k="${o.key}" class="${o.key === D2.instinct ? 'instinct' : ''}"><b>${o.label}</b><span>${o.hint}</span></button>`).join('')}</div>`;
      el.querySelectorAll('button[data-k]').forEach((b) => b.onclick = () => {
        if (Sim.resolveDecision(S, now(), b.dataset.k)) { save(); lastRev = -1; render(); }
      });
      el.style.display = '';
    }
    const m = Math.ceil(left / 60000);
    $('decLeft').textContent = `${m} 分钟内不选，就按她的本能`;
  }

  const DAYMARKS = [[0, '出生'], [5, '睁眼'], [14, '长乳牙'], [21, '学步'], [30, '玩耍'], [42, '跟随'], [49, '靠近狮群'], [56, '回归狮群']];
  function renderDaybar(age) {
    let cur = 0;
    DAYMARKS.forEach(([d], i) => { if (age >= d) cur = i; });
    $('daybar').innerHTML = DAYMARKS.map(([d, n], i) =>
      `<span class="daychip ${i < cur ? 'done' : i === cur ? 'now' : ''}">${d}天 · ${n}</span>`).join('');
  }

  function render() {
    const t = now();
    $('clock').textContent = '内罗毕 ' + hhmm(t, true); // 只显示内罗毕时间（EAT，UTC+3），不管玩家在哪个时区
    // 只有调试快进过的局才会有偏移；正常游戏始终是真实时间
    $('ffTag').style.display = offset > 0 ? '' : 'none';
    if (offset > 0) $('ffTag').textContent = `测试快进 +${Math.round(offset / 3600000)} 小时`;
    const cw = Wx.current();
    const mn = Sim.moon(t);
    $('moon').textContent = MOONS[Math.round(mn.phase * 8) % 8] + ' ' + Sim.moonName(mn.phase);
    if (cw) $('wx').textContent = `巢穴 ${Math.round(cw.temp)}°C ${D.WMO[cw.code] || ''} · 湿度${cw.humidity}%`;
    if (!S) return;

    const env = Sim.envAt(S, t, (x) => Wx.at(x));
    S.__now = t; S.__env = env;
    const day = Math.min(Sim.TOTAL_DAYS, Math.floor(env.age) + 1);
    $('dayNum').textContent = day;
    $('modeTag').textContent = S.mode === 'guard' ? '守护模式' : '纪实模式';
    const a = S.act;
    const pct = Math.max(0, Math.min(1, (t - a.start) / (a.end - a.start)));
    $('actName').textContent = S.ended ? '已回归狮群' : actLabel(a);
    $('actPct').textContent = Math.round(pct * 100) + '%';
    $('actLeft').textContent = S.ended ? '' : '约 ' + dur(a.end - t) + ' 后结束';
    $('actBar').style.width = (pct * 100).toFixed(1) + '%';
    const cs = Sim.checkinState(S, t);
    const hm = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? Math.floor(m / 60) + ':' + pad(m % 60) : m + '分'; };
    $('btnCheckin').disabled = !cs.can;
    $('btnCheckin').textContent = cs.can ? `签到 · 支持${cs.shift.name}巡护` : `${cs.shift.name}已签 · ${hm(cs.wait)}后签${cs.shift.shift === 'day' ? '夜班' : '日班'}`;
    $('btnCheckin').title = '每天签到两次：白天（6:00–18:00）支持日班巡护，晚上（18:00–6:00）支持夜班巡护。牧人多在夜里和清晨赶牛进来，夜班巡护最关键。';
    renderDaybar(env.age);
    renderRadarSide();
    renderDecision(t);
    medalTick(t);
    if (!S.ended) Sim.quizStep(S, t, live); // 到了新的 2 小时就出新题（不必等下一个 10 分钟步）
    renderQuiz(t);
    sounds(env);
    // 昼夜指示
    {
      const ph = env.ph, w = env.w || {};
      const fmt = (x) => pad(Math.floor(x)) + ':' + pad(Math.round((x % 1) * 60) % 60);
      const sr = w.rise || 6.35, ss = w.set || 18.5;
      const mn = Sim.moon(t);
      const txt = ph === 'day' ? `☀ 白天 · ${fmt(ss)} 日落`
        : ph === 'dusk' ? `🌇 黄昏 · ${fmt(ss)} 日落`
        : ph === 'dawn' ? `🌅 清晨 · ${fmt(sr)} 日出`
        : `${MOONS[Math.round(mn.phase * 8) % 8]} 夜晚 · ${fmt(sr)} 日出`;
      const cls = ph === 'day' ? 'day' : ph === 'night' ? 'night' : 'twilight';
      const el = $('dayPhase');
      el.textContent = txt; el.className = 'daychip-phase ' + cls;
      document.querySelector('.radar-sec').classList.toggle('night', cls === 'night');
      document.querySelector('.radar-sec').classList.toggle('twilight', cls === 'twilight');
    }

    const tab = document.querySelector('.tabs .on').dataset.tab;
    const changed = S.rev !== lastRev || tab !== lastTab;
    if (tab === 'den') renderDen(env);
    if (tab === 'hunt' && (changed || t % 10000 < 1000)) renderHunt(env);
    if (tab === 'threat' && (changed || t % 10000 < 1000)) renderThreat(env);
    if (tab === 'talk' && changed) renderTalk();
    if (tab === 'diary' && changed) renderDiary();
    if (tab === 'medals' && changed) renderMedals();
    lastRev = S.rev; lastTab = tab;

    // 字幕：最新一句对话
    if (S.dialog.length !== lastDlg) {
      lastDlg = S.dialog.length;
      const d = S.dialog[S.dialog.length - 1];
      if (d) $('subtitle').innerHTML = `<small>${stamp(d.t)} · 最新对话</small>${esc(d.who === 'cub' ? d.text : 'Naramat：' + d.text)}`;
    }

    const alive = S.cubs.filter((c) => c.alive).length;
    $('miniText').textContent = `第${day}天 · Naramat ${actLabel(a)} ${Math.round(pct * 100)}% · 幼崽 ${alive}/${S.cubs.length} · ${cw ? Math.round(cw.temp) + '°C ' + (D.WMO[cw.code] || '') : ''}`;

    if (S.ended && !S.endShown) { S.endShown = true; save(); showEnding(); }
    if (desk && desk.status && t - lastStatus > 30000) {
      lastStatus = t;
      const w = (S.river && S.river.level) || 0;
      desk.status({
        title: S.ended ? '' : `${day}/${Sim.TOTAL_DAYS}`,
        line: `第 ${day} 天 · Naramat ${actLabel(a)} · 幼崽 ${alive}/${S.cubs.length}`,
        tooltip: `狮子养成记\nNaramat ${actLabel(a)}（肉量 ${Math.round(S.mother.food)} 公斤）\n幼崽 ${alive}/${S.cubs.length} · 河水 +${w.toFixed(1)} 米${cw ? ' · ' + Math.round(cw.temp) + '°C ' + (D.WMO[cw.code] || '') : ''}`,
      });
    }
  }

  // ---------- 弹窗 ----------
  function modal(html) { $('modalCard').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); }

  function showSetup() {
    let mode = 'real';
    modal(`<h2>狮子养成记 · 隐藏期</h2>
      <p>肯尼亚，马赛马拉。4岁的母狮 <b>Naramat</b> 第一次当妈妈。她离开狮群，在恩提亚克河边的浓密灌丛里生下了两只幼崽。</p>
      <p>接下来的 <b>8 周（真实时间）</b>，她要独自把它们藏好、喂饱，还要一次次离开它们去捕猎——夜里冲刺的成功率约 30%，白天低得多。花豹、斑鬣狗、大象、非洲水牛、河马、狒狒，还有雨季暴涨的河水，都可能在她不在时找上门来。</p>
      <p class="muted">你不能命令 Naramat，只能观察、记录和签到守护。游戏使用内罗毕真实时间和巢穴所在地（-1.3756446°, 35.1500665°，Narok 郡马赛马拉）的实时天气；关掉窗口后，草原上的时间仍在流逝。</p>
      <div class="form-row">幼崽一 <input id="n1" value="Nashipai" maxlength="12"> <select id="s1"><option value="f">♀ 雌</option><option value="m">♂ 雄</option></select></div>
      <div class="form-row">幼崽二 <input id="n2" value="Lemayian" maxlength="12"> <select id="s2"><option value="m">♂ 雄</option><option value="f">♀ 雌</option></select></div>
      <div class="modes">
        <div class="mode on" data-m="real"><b>纪实模式</b>按真实野外死亡率推演。幼崽可能真的死去，无法挽回。</div>
        <div class="mode" data-m="guard"><b>守护模式</b>幼崽会挨饿、受伤，但不会死亡。适合想安心陪伴的玩家。</div>
      </div>
      <button class="btn-main" id="btnStart">开始守护</button>`);
    document.querySelectorAll('.mode').forEach((el) => el.onclick = () => {
      document.querySelectorAll('.mode').forEach((x) => x.classList.remove('on'));
      el.classList.add('on'); mode = el.dataset.m;
    });
    $('btnStart').onclick = () => {
      const cubs = [
        { name: $('n1').value.trim() || 'Nashipai', sex: $('s1').value },
        { name: $('n2').value.trim() || 'Lemayian', sex: $('s2').value },
      ];
      S = Sim.newGame({ now: now(), mode, cubs });
      save(); closeModal(); lastRev = -1; render();
    };
  }

  function showOffline(from, to) {
    const items = S.log.filter((e) => e.t > from && e.kind !== 'knowledge' && e.kind !== 'eco');
    const hunts = S.huntLog.filter((h) => h.t > from);
    const kills = hunts.filter((h) => h.ok).length;
    const list = items.slice(-40).map((e) => `<div class="entry ${e.kind}"><span class="t">${stamp(e.t)}</span><span class="x">${esc(e.text)}</span></div>`).join('')
      || '<div class="muted">一切平静。</div>';
    modal(`<h2>离线日记</h2>
      <p>你离开的 <b>${dur(to - from)}</b> 里，Naramat 扑击了 ${hunts.length} 次，成功 ${kills} 次。</p>
      <div class="offline-list diary">${list}</div>
      <button class="btn-main" id="btnOk">回到草原</button>`);
    $('btnOk').onclick = closeModal;
  }

  // ---------- 结局与故事卡片 ----------
  function storyLines() {
    const src = (S.story && S.story.length ? S.story : S.log).filter((e) => e.kind !== 'knowledge');
    const day = (t) => Math.floor((t - S.birth) / Sim.DAY) + 1;
    const pickFirst = (re) => src.find((e) => re.test(e.text));
    const chosen = [];
    const add = (e) => { if (e && !chosen.includes(e)) chosen.push(e); };
    add(src.find((e) => e.kind === 'milestone' && /睁开/.test(e.text)));
    add(pickFirst(/冲刺，扑倒/));
    src.filter((e) => e.kind === 'death' && !/八周过去|独自回到/.test(e.text)).forEach(add);
    add(pickFirst(/河水漫进/));
    add(pickFirst(/流浪雄狮闯进了领地|流浪雄狮.*(咬|伤|不见)/));
    add(pickFirst(/第一次让狮群/));
    src.filter((e) => e.kind === 'danger' && /幼崽|被.*伤/.test(e.text)).slice(0, 2).forEach(add);
    add(src.find((e) => e.kind === 'milestone' && /跟着 Naramat/.test(e.text)));
    return chosen.sort((a, b) => a.t - b.t).slice(0, 7).map((e) => ({ day: day(e.t), text: e.text }));
  }
  function endingSummary() {
    const st = S.stats;
    const mine = (S.decisions || []).filter((d) => d.by === 'player').length;
    const medals = Object.keys(S.medals || {}).length;
    return [
      `Naramat 外出捕猎 ${st.outings} 次，冲刺 ${st.attempts} 次，捕获 ${st.kills} 次；转移巢穴 ${st.moves} 次；击退危险 ${st.repelled} 次。`,
      `你签到守护 ${S.checkin.days} 天（${S.checkin.total || S.checkin.days} 次），替 Naramat 做了 ${mine} 次决定；巡护车拦下非法放牧 ${st.evicted || 0} 次；获得勋章 ${medals} 枚。`,
    ];
  }
  function showEnding() {
    const e = S.ended;
    const reunion = (S.story || S.log).filter((x) => x.kind === 'milestone' || x.kind === 'death').slice(-1)[0];
    const lines = storyLines();
    modal(`<h2>${e.win ? '回归狮群' : '独自归来'}</h2>
      <p>${esc(reunion ? reunion.text : '')}</p>
      ${S.cubs.map((c) => `<p><b>${esc(c.name)}</b>（${c.sex === 'f' ? '♀' : '♂'}）：${c.alive ? '平安长大，回到了狮群' : '没能活下来（' + c.cause + '）'}</p>`).join('')}
      <h5 style="margin-top:12px">这八周</h5>
      <ul class="recap-list">${lines.map((l) => `<li>第 ${l.day} 天 · ${esc(l.text)}</li>`).join('')}</ul>
      <p class="muted">${endingSummary().join('<br>')}</p>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:14px">
        <button class="btn-main" id="btnCard">保存故事卡片</button>
        <button class="pill" id="btnAgain">新的一胎</button>
      </div>`);
    $('btnCard').onclick = saveStoryCard;
    $('btnAgain').onclick = () => { localStorage.removeItem(SAVE); S = null; offset = 0; showSetup(); };
  }
  // 画一张 1080×1440 的竖版故事卡片，存成 PNG
  function wrapText(g, text, maxW) {
    const out = []; let line = '';
    for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    if (line) out.push(line);
    return out;
  }
  function saveStoryCard() {
    const W = 1080, H = 1440, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1f3029'); bg.addColorStop(1, '#121b17');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 落日与草原剪影
    const sun = g.createRadialGradient(W * 0.7, 300, 10, W * 0.7, 300, 260);
    sun.addColorStop(0, 'rgba(255,190,110,0.9)'); sun.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, 560);
    g.fillStyle = '#0e1612';
    g.beginPath(); g.moveTo(0, 470);
    for (let x = 0; x <= W; x += 30) g.lineTo(x, 455 + Math.sin(x / 90) * 10);
    g.lineTo(W, 560); g.lineTo(0, 560); g.fill();
    // 金合欢剪影
    g.fillRect(180, 360, 8, 110); g.beginPath(); g.ellipse(184, 352, 110, 22, 0, 0, Math.PI * 2); g.fill();
    // 马赛串珠饰带
    const beads = ['#b8322a', '#efe8d8', '#2f5d9a', '#efe8d8', '#d98a2b', '#1b1b1b', '#3d7a4a', '#efe8d8'];
    for (let x = 0, i = 0; x < W; x += 18, i++) { g.fillStyle = beads[i % beads.length]; g.fillRect(x, 560, 18, 10); }
    g.strokeStyle = '#8c7344'; g.lineWidth = 4; g.strokeRect(24, 24, W - 48, H - 48);
    const serif = '"Songti SC", "STSong", "Noto Serif SC", serif';
    g.textAlign = 'left';
    g.fillStyle = '#d2ad6a'; g.font = `bold 64px ${serif}`; g.fillText('狮子养成记', 72, 140);
    g.fillStyle = '#ece2c8'; g.font = `34px ${serif}`; g.fillText(S.ended && S.ended.win ? '八周后，回归狮群' : '八周后，独自归来', 72, 196);
    g.fillStyle = '#a39a82'; g.font = `24px ${serif}`;
    g.fillText(`马赛马拉 · 恩提亚克河 · ${Sim.dateKey(S.birth)} — ${Sim.dateKey(S.ended ? S.ended.t : now())}`, 72, 240);
    let y = 650;
    g.font = `bold 44px ${serif}`;
    S.cubs.forEach((cb, i) => {
      g.fillStyle = cb.alive ? '#f3dcb4' : '#8d8572';
      g.fillText(`${cb.name} ${cb.sex === 'f' ? '♀' : '♂'}`, 72 + i * 480, y);
      g.font = `26px ${serif}`; g.fillStyle = cb.alive ? '#b5dc9c' : '#e8a08e';
      g.fillText(cb.alive ? '平安长大' : `没能活下来（${cb.cause}）`, 72 + i * 480, y + 44);
      g.font = `bold 44px ${serif}`;
    });
    y += 120;
    g.fillStyle = '#d2ad6a'; g.font = `bold 30px ${serif}`; g.fillText('这八周', 72, y); y += 20;
    g.font = `26px ${serif}`;
    for (const l of storyLines().slice(0, 6)) {
      const rows = wrapText(g, `第 ${l.day} 天　${l.text}`, W - 160);
      for (const r of rows.slice(0, 2)) { y += 40; g.fillStyle = '#ece2c8'; g.fillText(r, 72, y); }
      y += 12;
      if (y > H - 260) break;
    }
    g.font = `24px ${serif}`; g.fillStyle = '#a39a82';
    let yy = H - 190;
    for (const l of endingSummary()) for (const r of wrapText(g, l, W - 160)) { g.fillText(r, 72, yy); yy += 34; }
    g.fillStyle = '#8c7344'; g.font = `22px ${serif}`;
    g.fillText('母狮 Naramat 的孩子们 · 巢穴 -1.3756°, 35.1501°', 72, H - 64);
    const a = document.createElement('a');
    a.download = `狮子养成记-${S.cubs.map((x) => x.name).join('-')}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  }


  // ---------- 交互 ----------
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('on'));
    document.querySelectorAll('.pane').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $('pane-' + b.dataset.tab).classList.add('on');
    render();
  });
  $('btnCheckin').onclick = () => { if (S && Sim.checkin(S, now())) { save(); lastRev = -1; render(); } };
  $('btnReset').onclick = () => {
    if (confirm('确定要放弃当前这一胎、重新开始吗？')) { localStorage.removeItem(SAVE); S = null; offset = 0; showSetup(); }
  };
  $('btnMini').onclick = () => { document.body.classList.add('mini'); desk && desk.mini(true); };
  $('btnExpand').onclick = () => { document.body.classList.remove('mini'); desk && desk.mini(false); };
  $('btnClose').onclick = () => { save(); desk ? desk.close() : window.close(); };
  $('btnPin').onclick = async () => {
    if (!desk) return;
    const on = await desk.pin();
    $('btnPin').classList.toggle('on', on);
  };
  if (desk) desk.isPinned().then((on) => $('btnPin').classList.toggle('on', on));
  else $('btnPin').style.display = 'none';

  // 开发用：快进（Cmd/Ctrl+Shift+F 快进 6 小时）
  window.__state = () => S;
  window.__ff = (hours) => {
    if (!S) return;
    offset += hours * 3600000;
    Sim.advance(S, now(), quiet);
    save(); lastRev = -1; render();
  };
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') window.__ff(6);
  });
  window.addEventListener('beforeunload', save);

  // ---------- 每日回顾 ----------
  // 汇总内罗毕时间某一天（dayKey）草原上发生的事
  function recapData(dayKey) {
    const t0 = Date.parse(dayKey + 'T00:00:00+03:00'), t1 = t0 + Sim.DAY;
    const inDay = (x) => x.t >= t0 && x.t < t1;
    const hunts = S.huntLog.filter(inDay);
    const charges = hunts.filter((h) => !h.abort);
    const kills = charges.filter((h) => h.ok);
    const logs = S.log.filter(inDay);
    const threats = logs.filter((e) => e.kind === 'threat' || e.kind === 'danger');
    const moves = logs.filter((e) => e.text.includes('叼到了新的藏身处'));
    const milestones = logs.filter((e) => e.kind === 'milestone');
    const deaths = logs.filter((e) => e.kind === 'death');
    const eco = logs.filter((e) => e.kind === 'eco');
    const decisions = (S.decisions || []).filter(inDay);
    const checks = logs.filter((e) => e.text.startsWith('你今天第')).length;
    const lines = S.dialog.filter((d) => inDay(d) && d.who === 'mother');
    let rain = 0; for (let h = 0; h < 24; h++) rain += (Wx.at(t0 + h * 3600000).rain || 0);
    return { dayKey, t0, charges, kills, kg: kills.reduce((a, h) => a + (h.kg || 0), 0), threats, moves, milestones, deaths, eco, decisions, checks, lines, rain };
  }
  function showRecap(dayKey) {
    const r = recapData(dayKey);
    // 出生那天算第 1 天（按内罗毕日历日）
    const dayNo = Math.round((r.t0 - Date.parse(Sim.dateKey(S.birth) + 'T00:00:00+03:00')) / Sim.DAY) + 1;
    if (r.t0 + Sim.DAY <= S.birth) { modal('<h2>昨日回顾</h2><p>游戏才刚开始，还没有完整的一天。</p><div style="text-align:center"><button class="btn-main" id="rOk">好</button></div>'); $('rOk').onclick = closeModal; return; }
    const hl = [];
    r.milestones.forEach((e) => hl.push('🌱 ' + e.text));
    r.deaths.forEach((e) => hl.push('🕯 ' + e.text));
    r.kills.forEach((h) => hl.push(`🍖 Naramat 捕到一只${Sim.preyLabel(h.prey)}，吃下约 ${h.kg} 公斤。`));
    r.threats.filter((e) => e.kind === 'danger').slice(0, 3).forEach((e) => hl.push('⚠️ ' + e.text));
    r.decisions.forEach((d) => { const D2 = Sim.DECISIONS[d.kind]; const o = D2.options.find((x) => x.key === d.key); hl.push(`🧭 ${d.by === 'player' ? '你选择了' : 'Naramat 凭本能选择了'}「${o.label}」（${D2.title}）`); });
    if (r.moves.length) hl.push(`🏠 转移巢穴 ${r.moves.length} 次。`);
    const ecoPick = r.eco.filter((e) => /捕到|放倒|抢|吼声|拦下|闯进/.test(e.text)).slice(-3);
    ecoPick.forEach((e) => hl.push('🌍 ' + e.text));
    if (!hl.length) hl.push('平静的一天：哺乳、理毛、在树荫下睡觉。');
    const q = r.lines.length ? r.lines[Math.floor(Math.random() * r.lines.length)].text : null;
    const alive = S.cubs.filter((c) => c.alive);
    modal(`<h2>第 ${dayNo} 天回顾 <small class="muted" style="font-size:13px">${dayKey}</small></h2>
      <div class="recap-stats">
        <div><b>${r.charges.length}</b><span>冲刺</span></div>
        <div><b>${r.kills.length}</b><span>捕获（${r.kg} 公斤）</span></div>
        <div><b>${r.threats.length}</b><span>危险靠近</span></div>
        <div><b>${r.checks}</b><span>你的签到</span></div>
      </div>
      <ul class="recap-list">${hl.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${q ? `<div class="recap-quote">Naramat：${esc(q)}</div>` : ''}
      <p class="muted">现在：幼崽 ${alive.map((c) => `${esc(c.name)}（健康 ${Math.round(c.health)}）`).join('、') || '无'} · Naramat 体内约 ${Math.round(S.mother.food)} 公斤肉${r.rain > 1 ? ` · 昨天下了约 ${Math.round(r.rain)} 毫米雨` : ''}</p>
      <div style="text-align:center;margin-top:10px"><button class="btn-main" id="rOk">回到草原</button></div>`);
    $('rOk').onclick = closeModal;
  }
  const yesterdayKey = () => Sim.dateKey(now() - Sim.DAY);
  $('btnRecap').onclick = () => { if (S) showRecap(yesterdayKey()); };

  // ---------- 启动 ----------
  async function boot() {
    await Promise.race([Wx.refresh(), new Promise((r) => setTimeout(r, 4000))]);
    S = load();
    if (S && S.mother.food == null) S.mother.food = ((S.mother.satiety || 50) / 100) * Sim.FOOD_MAX; // 旧存档：饱食度 → 公斤
    if (S && S.fund) delete S.fund; // 取消了捐款
    if (S && S.eco) { // 画面上最多 2 辆巡护车：多余的立刻撤回
      const vs = S.eco.groups.filter((g) => g.sp === 'vehicle' && !g.leaving);
      S.eco.groups = S.eco.groups.filter((g) => !(g.sp === 'vehicle' && vs.indexOf(g) >= 2));
    }
    if (S && S.eco && !S.eco.groups.some((g) => g.sp === 'topi')) { // 旧存档：补上一群黑面狷羚
      const fresh = LionEco.init(now());
      fresh.groups.filter((g) => g.sp === 'topi').forEach((g) => { g.id = S.eco.nextId++; S.eco.groups.push(g); });
    }
    if (S && S.eco && !S.eco.groups.some((g) => g.sp === 'jackal')) { // 旧存档：补上三对黑背胡狼
      const fresh = LionEco.init(now());
      fresh.groups.filter((g) => g.sp === 'jackal').forEach((g) => { g.id = S.eco.nextId++; S.eco.groups.push(g); });
    }
    if (S && S.eco && !S.eco.groups.some((g) => g.sp === 'pride')) S.eco = LionEco.init(now()); // 旧存档：换用新的动物群（含狮群）
    if (S && S.eco) S.eco.groups.forEach((g) => { if (g.sp === 'baboon') g.n = 30; }); // 狒狒群固定 30 只
    if (S && !S.eco) { // 旧存档：补上生态系统和母狮位置
      S.eco = LionEco.init(now());
      const site = LionGeo.sites[S.den.site] || [0, 0];
      S.mother.x = S.mother.px = site[0]; S.mother.y = S.mother.py = site[1];
    }
    if (S) {
      offset = S.devOffset || 0;
      const from = S.lastTick;
      Sim.advance(S, now(), quiet);
      save();
      // 每天第一次打开：先看昨天的回顾；否则离开超过半小时就看离线日记
      const yk = yesterdayKey();
      if (!S.ended && S.recapSeen !== yk && S.birth < Date.parse(yk + 'T00:00:00+03:00') + Sim.DAY) { S.recapSeen = yk; save(); showRecap(yk); }
      else if (now() - from > 30 * 60000 && !S.ended) showOffline(from, now());
    } else {
      showSetup();
    }
    render();
    setInterval(() => {
      if (S && !S.ended && Sim.advance(S, now(), live)) save();
      render();
    }, 1000);
    setInterval(() => Wx.refresh(), 30 * 60000);
    radarLoop();
  }
  boot();
})();
