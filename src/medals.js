// 勋章体系
// 目击类勋章：事件发生时游戏窗口开着，或 15 分钟内赶来（点通知打开）才算“亲眼看见”
(function (root) {
  const HOUR = 3600 * 1000, WINDOW = 15 * 60000;
  const CATS = [
    { id: 'sight', name: '目击', icon: '🔭' },
    { id: 'guard', name: '守护', icon: '🛡️' },
    { id: 'know', name: '学识', icon: '📖' },
    { id: 'decide', name: '抉择', icon: '🧭' },
    { id: 'grow', name: '成长', icon: '🌱' },
    { id: 'hidden', name: '隐藏', icon: '✨' },
  ];
  // tier：1 铜 2 银 3 金
  const DEFS = [
    { id: 'kill1', cat: 'sight', tier: 1, icon: '🍖', name: '目击捕猎', desc: '亲眼看到 Naramat 捕猎成功 1 次', note: '单独捕猎的母狮，夜里每次冲刺也只有约三成把握。' },
    { id: 'kill5', cat: 'sight', tier: 2, icon: '🍖', name: '狩猎见证者', desc: '亲眼看到 Naramat 捕猎成功 5 次' },
    { id: 'kill10', cat: 'sight', tier: 3, icon: '🍖', name: '草原记录员', desc: '亲眼看到 Naramat 捕猎成功 10 次' },
    { id: 'nightKill', cat: 'sight', tier: 2, icon: '🌙', name: '暗夜猎手', desc: '在夜里 20:00–05:00 看到 Naramat 捕猎成功', note: '狮子主要在夜间捕猎，黑暗让潜近更容易成功。' },
    { id: 'leopardTree', cat: 'sight', tier: 2, icon: '🐆', name: '树上的猎物', desc: '看到花豹把猎物拖上树', note: '花豹把猎物楔进树杈，防止被鬣狗和胡狼抢走。' },
    { id: 'hyenaRob', cat: 'sight', tier: 2, icon: '🐾', name: '劫掠', desc: '看到斑鬣狗抢走猎豹的猎物', note: '猎豹体型轻，常把猎物让给鬣狗和狮子。' },
    { id: 'jackalFawn', cat: 'sight', tier: 1, icon: '🦊', name: '胡狼的收获', desc: '看到黑背胡狼捕到汤氏瞪羚幼崽', note: '胡狼以食腐为主，但也会成对搜寻藏在草里的瞪羚幼崽。' },
    { id: 'trumpet', cat: 'sight', tier: 1, icon: '🐘', name: '巨兽之怒', desc: '听到大象发现狮子时的号叫', note: '大象对狮子有强烈敌意，会号叫、驱赶，甚至踩踏幼狮。' },
    { id: 'nightWatch', cat: 'guard', tier: 2, icon: '🔦', name: '守夜人', desc: '签到支持夜班巡护 10 次', reward: 5 },
    { id: 'streak7', cat: 'guard', tier: 1, icon: '📅', name: '连续守护 7 天', desc: '连续 7 天每天至少签到 1 次', reward: 5 },
    { id: 'streak14', cat: 'guard', tier: 2, icon: '📅', name: '连续守护 14 天', desc: '连续 14 天每天至少签到 1 次', reward: 5 },
    { id: 'streak28', cat: 'guard', tier: 3, icon: '📅', name: '连续守护 28 天', desc: '连续 28 天每天至少签到 1 次', reward: 5 },
    { id: 'north10', cat: 'guard', tier: 1, icon: '🚙', name: '北境无恙', desc: '巡护车拦下非法放牧 10 次', reward: 5 },
    { id: 'north30', cat: 'guard', tier: 2, icon: '🚙', name: '北境卫士', desc: '巡护车拦下非法放牧 30 次', reward: 5 },
    { id: 'north50', cat: 'guard', tier: 3, icon: '🚙', name: '北境长城', desc: '巡护车拦下非法放牧 50 次', reward: 5 },
    { id: 'trust', cat: 'guard', tier: 2, icon: '🤝', name: '巡护员的信任', desc: '巡护士气一整天保持在 80 以上', reward: 5 },
    { id: 'quiz10', cat: 'know', tier: 1, icon: '📖', name: '狮子学徒', desc: '巡护站问答答对 10 道不同的题' },
    { id: 'quiz30', cat: 'know', tier: 2, icon: '📖', name: '狮子学者', desc: '巡护站问答答对 30 道不同的题' },
    { id: 'quiz50', cat: 'know', tier: 3, icon: '📖', name: '夏勒的读者', desc: '题库里全部 50 道题都答对过' },
    { id: 'quizStreak', cat: 'know', tier: 2, icon: '🎯', name: '势如破竹', desc: '连续答对 5 题' },
    { id: 'wiseHide', cat: 'decide', tier: 2, icon: '🌿', name: '明智的隐藏', desc: '你选择「原地藏好」，斑鬣狗没能找到幼崽' },
    { id: 'floodSaved', cat: 'decide', tier: 2, icon: '🌊', name: '洪水中的抉择', desc: '河水涨到巢穴之前，你选择立刻转移到高处' },
    { id: 'eyes', cat: 'grow', tier: 1, icon: '👁️', name: '睁开眼睛', desc: '幼崽睁开了眼睛（第 5 天）' },
    { id: 'steps', cat: 'grow', tier: 1, icon: '🐾', name: '第一步', desc: '幼崽学会走路（第 21 天）' },
    { id: 'meetPride', cat: 'grow', tier: 2, icon: '🦁', name: '初见狮群', desc: 'Naramat 第一次让狮群的姐妹靠近幼崽' },
    { id: 'reunion', cat: 'grow', tier: 2, icon: '🏠', name: '回归狮群', desc: '第 56 天，带着幼崽回到狮群' },
    { id: 'bothHome', cat: 'grow', tier: 3, icon: '👑', name: '一个都不少', desc: '两只幼崽都活过了 8 周' },
    { id: 'moonKill', cat: 'hidden', tier: 3, hidden: true, icon: '🌕', name: '满月狩猎', desc: '在满月之夜看到 Naramat 捕猎成功', note: '明亮的月光下猎物看得见狮子，满月夜捕猎更难成功。' },
    { id: 'stormKill', cat: 'hidden', tier: 3, hidden: true, icon: '⛈️', name: '风暴中的猎手', desc: '在大雨中看到 Naramat 捕猎成功', note: '雨声和雨幕掩护了潜近的狮子。' },
    { id: 'fullCast', cat: 'hidden', tier: 3, hidden: true, icon: '🎭', name: '众生相', desc: '一天之内，你看着全部 6 种威胁动物都来到巢穴 500 米内' },
    { id: 'lionGather', cat: 'hidden', tier: 2, hidden: true, icon: '👪', name: '群狮聚首', desc: 'Naramat、狮群母狮和 Satala 联盟同时出现在雷达上' },
    { id: 'rareGuests', cat: 'hidden', tier: 3, hidden: true, icon: '🦒', name: '稀客', desc: '看到长颈鹿幼崽，也看到流浪雄狮被赶走' },
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  const TIER = { 1: { name: '铜', color: '#cd8a4a' }, 2: { name: '银', color: '#c8d0d8' }, 3: { name: '金', color: '#f2c94c' } };
  const SIGHT_NAME = { lionKill: 'Naramat 捕猎成功', leopardTree: '花豹把猎物拖上树', hyenaRob: '斑鬣狗抢猎豹的猎物', jackalFawn: '黑背胡狼捕到瞪羚幼崽', trumpet: '大象发现狮子在号叫', nomadChased: '雄狮联盟赶走流浪雄狮' };

  const st = (s) => (s.medals = s.medals || {});
  const mc = (s) => (s.mc = s.mc || { kills: 0, nightCheck: 0, quizStreak: 0, cast: {}, castDay: '', rare: {} });

  function award(s, id, t) {
    const M = st(s);
    if (M[id] || !byId[id]) return false;
    M[id] = { t };
    const d = byId[id];
    if (d.reward) s.morale = Math.min(100, (s.morale == null ? 60 : s.morale) + d.reward);
    s.medalQueue = (s.medalQueue || []).concat(id);
    if (root.LionSim && s.log) {
      s.log.push({ t, kind: 'milestone', text: `获得勋章「${d.name}」：${d.desc}。${d.reward ? `巡护士气 +${d.reward}。` : ''}`, tip: d.note || null });
      s.rev++;
    }
    return true;
  }

  // 亲眼看见了一件事
  function witness(s, p, t) {
    const c = mc(s);
    if (p.type === 'lionKill') {
      c.kills++;
      award(s, 'kill1', t);
      if (c.kills >= 5) award(s, 'kill5', t);
      if (c.kills >= 10) award(s, 'kill10', t);
      if (p.night) award(s, 'nightKill', t);
      if (p.night && p.moon > 0.9) award(s, 'moonKill', t);
      if (p.rain > 3) award(s, 'stormKill', t);
    } else if (byId[p.type]) award(s, p.type, t);
    if (p.type === 'nomadChased') { c.rare.nomad = true; if (c.rare.calf) award(s, 'rareGuests', t); }
  }

  // 每秒调用：处理待目击事件、检查各种进度
  // view：{ visible, radarGroups(sp, R) → 雷达 R 米内该物种的群 }
  function tick(s, t, view) {
    if (!s || s.ended == null && !s.birth) return;
    const c = mc(s);
    // 目击：窗口开着就算看见；超过 15 分钟没看到就算错过
    s.sightPending = s.sightPending || [];
    const keep = [];
    for (const p of s.sightPending) {
      if (p.done) { if (t - p.t <= WINDOW) keep.push(p); continue; } // 已看见的也在雷达上标满 15 分钟
      if (view.visible && t - p.t <= WINDOW) { p.done = true; witness(s, p, t); keep.push(p); continue; }
      if (t - p.t > WINDOW) {
        if (p.type === 'lionKill' || p.type === 'leopardTree' || p.type === 'hyenaRob') {
          s.log.push({ t: p.t, kind: 'event', text: `你错过了：${SIGHT_NAME[p.type]}。下次开着游戏窗口，或收到通知后 15 分钟内赶来，就能亲眼看到。` });
          s.rev++;
        }
        continue;
      }
      keep.push(p);
    }
    s.sightPending = keep;
    // 雷达上看到的东西（只在窗口开着时算）
    if (view.visible && view.radarGroups) {
      const day = new Date(t + 3 * HOUR).toISOString().slice(0, 10);
      if (c.castDay !== day) { c.castDay = day; c.cast = {}; }
      for (const sp of ['hyena', 'leopard', 'baboon', 'elephant', 'buffalo', 'hippo']) if (view.radarGroups(sp, 500).length) c.cast[sp] = true; // 要来到巢穴 500 米内
      if (Object.keys(c.cast).length >= 6) award(s, 'fullCast', t);
      if (view.radarGroups('pride', 3000).length && view.radarGroups('coalition', 3000).length) award(s, 'lionGather', t);
      if (view.radarGroups('giraffe', 3000).some((g) => g.calf)) { c.rare.calf = true; if (c.rare.nomad) award(s, 'rareGuests', t); }
    }
    // 守护
    const ch = s.checkin || {};
    if ((ch.nightTotal || 0) >= 10) award(s, 'nightWatch', t);
    const streak = ch.streak || 0;
    if (streak >= 7) award(s, 'streak7', t);
    if (streak >= 14) award(s, 'streak14', t);
    if (streak >= 28) award(s, 'streak28', t);
    const ev = (s.stats && s.stats.evicted) || 0;
    if (ev >= 10) award(s, 'north10', t);
    if (ev >= 30) award(s, 'north30', t);
    if (ev >= 50) award(s, 'north50', t);
    // 士气一整天 ≥ 80：按内罗毕日历日，整天都在游戏里才算
    const dk = new Date(t + 3 * HOUR).toISOString().slice(0, 10);
    const m = s.morale == null ? 60 : s.morale;
    if (!c.mDay || c.mDay.key !== dk) {
      if (c.mDay && c.mDay.full && c.mDay.min >= 80) award(s, 'trust', t);
      const d0 = Date.parse(dk + 'T00:00:00+03:00');
      c.mDay = { key: dk, min: m, full: s.birth <= d0 };
    } else c.mDay.min = Math.min(c.mDay.min, m);
    // 学识
    const q = s.quiz || {};
    const uniq = (q.rightIds || []).length; // 按答对过的“不同题目”计数，重复出的题不重复算
    if (uniq >= 10) award(s, 'quiz10', t);
    if (uniq >= 30) award(s, 'quiz30', t);
    if (root.LionQuiz && uniq >= root.LionQuiz.Q.length) award(s, 'quiz50', t);
    if ((q.streak || 0) >= 5) award(s, 'quizStreak', t);
    // 抉择：「原地藏好」之后 4 小时里斑鬣狗没找到幼崽
    if (s.hideWatch && t > s.hideWatch.until) { if (s.hideWatch.ok) award(s, 'wiseHide', t); s.hideWatch = null; }
    // 成长
    const age = (t - s.birth) / (24 * HOUR);
    if (age >= 5) award(s, 'eyes', t);
    if (age >= 21) award(s, 'steps', t);
    if (s.prideMet) award(s, 'meetPride', t);
    if (s.ended && s.ended.win) award(s, 'reunion', t);
    if (s.ended && s.cubs.every((cb) => cb.alive)) award(s, 'bothHome', t);
  }

  root.LionMedals = { CATS, DEFS, TIER, byId, SIGHT_NAME, WINDOW, award, tick };
})(typeof window !== 'undefined' ? window : globalThis);
