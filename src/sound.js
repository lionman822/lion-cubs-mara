// 草原声音：全部用 Web Audio 实时合成，不需要音频文件
// 环境声：恩提亚克河的流水声、风吹树叶和草的沙沙声；夜里的虫鸣、蛙叫，不时有猫头鹰；清晨的鸟叫、白天的风、下雨声；事件声：雄狮吼叫、斑鬣狗“呜——噢”、母狮呼唤、幼崽咪呜、抉择提示
// 全部是超低音量，当背景声，不影响玩家工作
(function (root) {
  let ctx = null, master = null, callsBus = null, on = true;
  try { on = localStorage.getItem('lion_sound') !== 'off'; } catch (e) { /* 默认开 */ }
  const beds = {};
  let birdTimer = 0, frogTimer = 0, owlTimer = 0, lastCall = 0, lastMew = 0;
  const MASTER = 0.08; // 背景声道：极低，只当若有若无的背景声
  const CALLS = 0.25; // 动物叫声声道：狮吼、鬣狗、大象、胡狼、鸟叫，比背景声大约 3 倍

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? MASTER : 0;
    master.connect(ctx.destination);
    callsBus = ctx.createGain();
    callsBus.gain.value = on ? CALLS : 0;
    callsBus.connect(ctx.destination);
    // 噪声源（风、雨用）
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3; }
    beds.noise = buf;
    beds.wind = noiseBed('lowpass', 400, 0);
    // 河水：两层带通噪声，滤波频率不断游移，听起来像水流潺潺
    beds.river1 = filteredBed('bandpass', 650, 1.2);
    beds.river2 = filteredBed('bandpass', 1300, 1.5);
    // 树叶沙沙：高频噪声，一阵一阵；草的唰唰声：中高频，跟着风起伏
    beds.leaves = filteredBed('highpass', 3800, 0.7);
    beds.grass = filteredBed('bandpass', 2300, 0.9);
    beds.rain = noiseBed('highpass', 1800, 0);
    beds.crickets = cricketBed();
    return ctx;
  }
  function noiseBed(type, freq, vol) {
    const src = ctx.createBufferSource(); src.buffer = beds.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return g;
  }
  // 虫鸣：高频正弦，被一个快速方波调幅成“唧唧”声，再被慢速振荡调成一阵一阵
  function cricketBed() {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4600;
    const am = ctx.createGain(); am.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(am); am.connect(g); g.connect(master);
    o.start(); lfo.start();
    return g;
  }
  // 可以单独调滤波频率的噪声层
  function filteredBed(type, freq, q) {
    const src = ctx.createBufferSource(); src.buffer = beds.noise; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2; // 几层错开，不会听出同一段噪声
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start(Math.random() * 0.5);
    return { g, f, base: freq };
  }
  let gust = 0, gustTarget = 0;
  const ramp = (param, v, sec) => { param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(v, ctx.currentTime, sec); };

  // 每秒根据时段和天气调整环境声
  function ambient(env, extra) {
    if (!ctx || !on) return;
    const now = ctx.currentTime;
    // 河水：一直在流，水位越高越响、越低沉（洪水时是明显的哗哗声）
    const lvl = (extra && extra.river) || 0;
    const rv = Math.min(0.045, 0.009 + lvl * 0.015);
    ramp(beds.river1.g.gain, rv * (0.85 + Math.random() * 0.3), 0.6);
    ramp(beds.river2.g.gain, rv * 0.6 * (0.7 + Math.random() * 0.6), 0.4);
    beds.river1.f.frequency.setTargetAtTime(beds.river1.base * (0.8 + Math.random() * 0.4) * (1 - Math.min(0.3, lvl * 0.12)), now, 0.5);
    beds.river2.f.frequency.setTargetAtTime(beds.river2.base * (0.75 + Math.random() * 0.5), now, 0.3);
    // 风：白天大、夜里小；时不时来一阵，树叶和草跟着响
    const breeze = env.ph === 'day' ? 1 : env.ph === 'night' ? 0.35 : 0.6;
    if (Math.random() < 0.12) gustTarget = Math.random() * breeze;
    gust += (gustTarget - gust) * 0.25;
    ramp(beds.leaves.g.gain, 0.002 + gust * 0.014, 0.8);
    ramp(beds.grass.g.gain, 0.0015 + gust * 0.011, 1.0);
    beds.grass.f.frequency.setTargetAtTime(beds.grass.base * (0.85 + gust * 0.3), now, 1.2);
    const ph = env.ph, rain = (env.w && env.w.rain) || 0;
    ramp(beds.crickets.gain, ph === 'night' ? 0.008 : ph === 'dusk' ? 0.004 : 0, 3);
    ramp(beds.wind.gain, ph === 'day' ? 0.05 : 0.02, 3);
    ramp(beds.rain.gain, rain > 0.05 ? Math.min(0.12, 0.03 + rain * 0.01) : 0, 2);
    // 清晨鸟叫最多，白天偶尔，夜里没有
    // 清晨、傍晚：马赛马拉的鸟一种接一种地叫；白天只有零星的小鸟
    if ((ph === 'dawn' || ph === 'dusk') && ctx.currentTime > birdTimer && Math.random() < 0.5) {
      const list = BIRDS.filter((b) => b.when.includes(ph));
      const b = list[Math.floor(Math.random() * list.length)];
      b.call();
      if (Sound.onBird) Sound.onBird(b.name);
      birdTimer = ctx.currentTime + 5 + Math.random() * 10;
    } else if (ph === 'day' && Math.random() < 0.05 && ctx.currentTime > birdTimer) { bird(); birdTimer = ctx.currentTime + 3; }
    // 夜里：蛙叫一阵一阵，猫头鹰隔几分钟叫一次
    if ((ph === 'night' || ph === 'dusk') && ctx.currentTime > frogTimer && Math.random() < 0.35) { frogs(); frogTimer = ctx.currentTime + 4 + Math.random() * 8; }
    if (ph === 'night' && ctx.currentTime > owlTimer && Math.random() < 0.02) { owl(); owlTimer = ctx.currentTime + 90 + Math.random() * 150; }
    // 黑背胡狼：清晨和黄昏每隔几分钟叫一阵；附近有猎物残骸时叫得更勤
    const jp = (ph === 'dusk' || ph === 'dawn' ? 0.02 : 0) * (extra && extra.carcass ? 3 : 1); // 胡狼按日行设定，清晨、黄昏叫
    if (ctx.currentTime > jackalTimer && Math.random() < jp) { jackal(); jackalTimer = ctx.currentTime + 120 + Math.random() * 180; }
  }

  function tone({ type = 'sine', f0, f1, dur, vol, at = 0, filter = 0, bus }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(bus === 'calls' ? callsBus : master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // 蛙叫：低沉短促的“咯咯”声，几只此起彼伏
  function frogs() {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const base = 140 + Math.random() * 160, at = Math.random() * 2.5, pulses = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < pulses; i++) tone({ type: 'square', f0: base * 1.15, f1: base, dur: 0.05, vol: 0.02, at: at + i * 0.09, filter: 700 });
    }
  }
  // 猫头鹰：柔和的“呼——呼呼”
  function owl() {
    const f = 330 + Math.random() * 60;
    tone({ f0: f * 1.05, f1: f, dur: 0.45, vol: 0.05, filter: 900 });
    tone({ f0: f, f1: f * 0.94, dur: 0.25, vol: 0.04, at: 0.7, filter: 900 });
    tone({ f0: f, f1: f * 0.92, dur: 0.35, vol: 0.045, at: 1.05, filter: 900 });
  }
  // ---------- 马赛马拉的鸟（按真实叫声的节奏和音高近似合成） ----------
  const seq = (notes) => notes.forEach(([f0, f1, dur, at, vol, type]) => tone({ type: type || 'sine', f0, f1, dur, vol: vol || 0.04, at, filter: 4000, bus: 'calls' }));
  const BIRDS = [
    // 吼海雕：河边最有代表性的清晨声音，“喂——啊，吼吼吼”
    { name: '吼海雕', when: ['dawn'], call: () => seq([[1500, 1100, 0.5, 0, 0.05], [1300, 1250, 0.12, 0.65], [1300, 1250, 0.12, 0.82], [1280, 1230, 0.12, 0.99], [1250, 1200, 0.12, 1.16]]) },
    // 黄颈鹧鸪：粗哑响亮的“咔——哩，咔——哩”
    { name: '黄颈鹧鸪', when: ['dawn'], call: () => { for (let i = 0; i < 3; i++) { tone({ type: 'sawtooth', f0: 900, f1: 1300, dur: 0.18, vol: 0.025, at: i * 0.55, filter: 2200 , bus: 'calls' }); tone({ type: 'sawtooth', f0: 1400, f1: 1000, dur: 0.22, vol: 0.025, at: i * 0.55 + 0.2, filter: 2200 , bus: 'calls' }); } } },
    // 白眉歌鸲（Rüppell's robin-chat）：婉转多变的鸣唱
    { name: '白眉歌鸲', when: ['dawn'], call: () => { let at = 0; for (let i = 0; i < 7; i++) { const f = 1800 + Math.random() * 1600; tone({ f0: f, f1: f * (0.8 + Math.random() * 0.5), dur: 0.12 + Math.random() * 0.1, vol: 0.03, at , bus: 'calls' }); at += 0.16 + Math.random() * 0.08; } } },
    // 非洲戴胜：低沉的“噗噗——噗噗”
    { name: '非洲戴胜', when: ['dawn'], call: () => seq([[520, 480, 0.12, 0, 0.035], [520, 480, 0.12, 0.2, 0.035], [520, 480, 0.12, 0.75, 0.035], [520, 480, 0.12, 0.95, 0.035]]) },
    // 噪鹮：飞去觅食、飞回栖息地时响亮的“哈——哈——哈—嗒”
    { name: '噪鹮', when: ['dawn', 'dusk'], call: () => seq([[700, 600, 0.25, 0, 0.04, 'sawtooth'], [700, 600, 0.25, 0.35, 0.04, 'sawtooth'], [750, 520, 0.4, 0.7, 0.04, 'sawtooth'], [600, 560, 0.15, 1.2, 0.03, 'sawtooth']]) },
    // 环颈斑鸠：三音节咕咕声
    { name: '环颈斑鸠', when: ['dawn', 'dusk'], call: () => { for (let r = 0; r < 2; r++) seq([[560, 540, 0.18, r * 1.1, 0.035], [640, 620, 0.32, r * 1.1 + 0.25, 0.04], [560, 520, 0.22, r * 1.1 + 0.65, 0.035]]); } },
    // 灰冠鹤：傍晚飞回栖息地时低沉的“昂——呜”
    { name: '灰冠鹤', when: ['dusk'], call: () => { for (let i = 0; i < 2; i++) { tone({ type: 'triangle', f0: 420, f1: 520, dur: 0.3, vol: 0.05, at: i * 1.2, filter: 1200 , bus: 'calls' }); tone({ type: 'triangle', f0: 380, f1: 300, dur: 0.45, vol: 0.045, at: i * 1.2 + 0.35, filter: 1200 , bus: 'calls' }); } } },
    // 灰蕉鹃：鼻音很重、拖长的“呱——诶”
    { name: '灰蕉鹃', when: ['dusk'], call: () => { tone({ type: 'sawtooth', f0: 700, f1: 500, dur: 0.7, vol: 0.03, filter: 1500 , bus: 'calls' }); tone({ type: 'sawtooth', f0: 650, f1: 480, dur: 0.6, vol: 0.025, at: 1.0, filter: 1500 , bus: 'calls' }); } },
    // 方尾夜鹰：天黑时连续不断的“嘟——”颤音
    { name: '方尾夜鹰', when: ['dusk'], call: () => { const t0 = 0; for (let i = 0; i < 40; i++) tone({ f0: 1700, f1: 1650, dur: 0.04, vol: 0.02, at: t0 + i * 0.06 , bus: 'calls' }); } },
  ];
  function bird() {
    const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone({ f0: base * (1 + Math.random() * 0.3), f1: base * (0.7 + Math.random() * 0.6), dur: 0.08 + Math.random() * 0.08, vol: 0.03, at: i * 0.13 , bus: 'calls' });
  }
  // 雄狮吼叫：一声长吼，接一串越来越弱的低沉喘吼
  function roar(far) {
    const v = far ? 0.12 : 0.25;
    tone({ type: 'sawtooth', f0: 140, f1: 80, dur: 2.2, vol: v, filter: 380 , bus: 'calls' });
    for (let i = 0; i < 6; i++) tone({ type: 'sawtooth', f0: 110 - i * 4, f1: 70, dur: 0.55, vol: v * (0.8 - i * 0.12), at: 2.3 + i * 0.75, filter: 320 , bus: 'calls' });
  }
  // 斑鬣狗：上扬的“呜——噢”，重复两三声
  function whoop() {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) tone({ f0: 320, f1: 900, dur: 1.1, vol: 0.08, at: i * 1.6, filter: 1600 , bus: 'calls' });
  }
  // 大象：发现狮子时一声尖利的号叫，接一阵低沉的隆隆声
  function trumpet() {
    tone({ type: 'sawtooth', f0: 520, f1: 900, dur: 0.35, vol: 0.12, filter: 2600, bus: 'calls' });
    tone({ type: 'sawtooth', f0: 900, f1: 640, dur: 0.9, vol: 0.14, at: 0.3, filter: 2600, bus: 'calls' });
    tone({ type: 'square', f0: 610, f1: 560, dur: 0.6, vol: 0.05, at: 0.4, filter: 1800, bus: 'calls' });
    tone({ type: 'sawtooth', f0: 42, f1: 36, dur: 2.2, vol: 0.18, at: 1.3, filter: 160, bus: 'calls' }); // 次声般的隆隆声
  }
  // 黑背胡狼：高亢拖长的“呀——”，接几声短促的“噫噫”
  function jackal() {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const at = k * (1.6 + Math.random() * 0.6), f = 900 + Math.random() * 250;
      tone({ type: 'triangle', f0: f * 0.8, f1: f * 1.25, dur: 0.9, vol: 0.06, at, filter: 3000, bus: 'calls' });
      for (let i = 0; i < 3; i++) tone({ type: 'triangle', f0: f * 1.3, f1: f * 1.1, dur: 0.12, vol: 0.045, at: at + 0.95 + i * 0.17, filter: 3000, bus: 'calls' });
    }
  }
  let jackalTimer = 0;
  // 母狮对幼崽的轻声呼唤：短促低沉的“呜嗯”
  function contact() {
    if (ctx.currentTime - lastCall < 90) return;
    lastCall = ctx.currentTime;
    tone({ type: 'triangle', f0: 190, f1: 140, dur: 0.6, vol: 0.06, filter: 500 });
    tone({ type: 'triangle', f0: 180, f1: 130, dur: 0.5, vol: 0.05, at: 0.75, filter: 500 });
  }
  function mew() {
    if (ctx.currentTime - lastMew < 60) return;
    lastMew = ctx.currentTime;
    tone({ f0: 750, f1: 1050, dur: 0.18, vol: 0.04 });
    tone({ f0: 1000, f1: 700, dur: 0.25, vol: 0.035, at: 0.2 });
  }
  function chime() {
    tone({ f0: 660, f1: 660, dur: 0.5, vol: 0.08 });
    tone({ f0: 880, f1: 880, dur: 0.7, vol: 0.07, at: 0.25 });
  }

  const play = (fn, ...a) => { if (ctx && on && ctx.state === 'running') fn(...a); };
  const Sound = {
    get on() { return on; },
    toggle() {
      on = !on;
      try { localStorage.setItem('lion_sound', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (on) { ensure(); if (ctx && ctx.state !== 'running') ctx.resume(); }
      if (master) ramp(master.gain, on ? MASTER : 0, 0.2);
      if (callsBus) ramp(callsBus.gain, on ? CALLS : 0, 0.2);
      return on;
    },
    // 浏览器要求用户点过页面才能出声
    unlock() { if (!on) return; ensure(); if (ctx && ctx.state !== 'running') ctx.resume(); },
    ambient: (env, extra) => ambient(env, extra),
    roar: (far) => play(roar, far),
    whoop: () => play(whoop),
    trumpet: () => play(trumpet),
    jackal: () => play(jackal),
    contact: () => play(contact),
    mew: () => play(mew),
    chime: () => play(chime),
    onBird: null, // 有鸟叫时回调（显示鸟名）
  };
  root.LionSound = Sound;
})(window);
