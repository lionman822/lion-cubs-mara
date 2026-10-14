// 用法：node tools/calibrate.js [局数]  —— 无界面跑完整局，检查数值平衡
require('../src/data.js');
require('../src/geo.js');
require('../src/eco.js');
require('../src/sim.js');
const S = globalThis.LionSim;
const N = +process.argv[2] || 1000;
// 随机天气：10月的 Narok 午后常有阵雨
// 10 月偶有午后阵雨；11–12 月短雨季，阵雨更多，偶尔暴雨（按 3 小时一段）
const rainCache = new Map();
const wx = (t) => {
  const h = S.nairobiHour(t), m = new Date(t + 3 * 3600e3).getUTCMonth();
  const k = Math.floor(t / (3 * 3600e3));
  if (!rainCache.has(k)) { const p = { 9: 0.03, 10: 0.07, 11: 0.06, 0: 0.02 }[m] || 0.03; rainCache.set(k, Math.random() < p ? (Math.random() < 0.2 ? 8 + Math.random() * 12 : 1 + Math.random() * 6) : 0); }
  return { rain: h > 14 && h < 20 ? rainCache.get(k) : 0, temp: 22, rise: 6.35, set: 18.5 };
};
const byPh = {}; let lpT = 0, lpK = 0, lpN = 0, lpNK = 0;
const decK = {}; let joins = 0, nomadEnc = 0, prideVisits = 0, herds = 0, cows = 0, retal = 0, dogBites = 0;
let att = 0, kills = 0, scav = 0, kg = 0, alive = 0, cubs = 0, threats = 0, moves = 0, any = 0, starve = 0, minSat = 0, guardAlive = 0;
const causes = {};
for (let i = 0; i < N; i++) {
  const t0 = Date.UTC(2026, 9, 12, 3);
  const mode = i % 2 ? 'guard' : 'real';
  rainCache.clear();
  const s = S.newGame({ now: t0, mode, cubs: [{ name: 'A', sex: 'f' }, { name: 'B', sex: 'm' }] });
  S.advance(s, t0 + (S.TOTAL_DAYS + 1) * S.DAY, { wx });
  for (const h of s.huntLog) if (!h.abort && h.ph) { const b = (byPh[h.ph] = byPh[h.ph] || [0, 0]); b[0]++; if (h.ok) b[1]++; }
  for (const g of s.eco.groups) if (g.sp === 'leopard' && g.stats) { lpT += g.stats.tries; lpK += g.stats.kills; lpN += g.stats.night; lpNK += g.stats.nightKills; }
  herds += s.stats.herds || 0; cows += s.stats.livestock || 0; retal += s.stats.conflicts || 0; dogBites += s.log.filter((e) => e.text.includes('被咬伤了')).length;
  for (const d of s.decisions || []) decK[d.kind] = (decK[d.kind] || 0) + 1;
  joins += s.stats.joins || 0; nomadEnc += s.enc.nomad || 0; prideVisits += s.log.filter((e) => e.text.includes('走近了巢穴') || e.text.includes('靠近：')).length;
  att += s.stats.attempts; kills += s.stats.kills; scav += s.stats.steals || 0; kg += s.stats.kg || 0; threats += s.stats.threats; moves += s.stats.moves;
  const a = s.cubs.filter(c => c.alive).length;
  if (mode === 'real') { alive += a; cubs += 2; if (a) any++; for (const c of s.cubs) if (!c.alive) causes[c.cause] = (causes[c.cause] || 0) + 1; }
  else guardAlive += a;
}
const R = N / 2;
console.log(`单次扑击成功率: ${(kills / att * 100).toFixed(1)}%  每局扑击 ${(att / N).toFixed(1)} 次, 猎杀 ${(kills / N).toFixed(1)} 次`);
console.log(`每局抢食/腐肉 ${(scav / N).toFixed(1)} 次，共进食 ${(kg / N).toFixed(0)} 公斤（需 ${8 * S.TOTAL_DAYS} 公斤）`);
console.log('母狮分时段成功率', Object.fromEntries(Object.entries(byPh).map(([k, [a, b]]) => [k, (b / a * 100).toFixed(1) + '%（' + a + '次）'])));
console.log(`花豹成功率 ${(lpK / lpT * 100).toFixed(1)}%，夜里 ${(lpNK / lpN * 100).toFixed(1)}%`);
console.log(`每局去狮群分食 ${(joins / N).toFixed(1)} 次，流浪雄狮到巢边 ${(nomadEnc / N).toFixed(2)} 次，狮群母狮来巢边 ${(prideVisits / N).toFixed(2)} 次`);
console.log(`每局非法放牧 ${(herds / N).toFixed(1)} 次，母狮杀牛 ${(cows / N).toFixed(2)} 次，遭报复受伤 ${(retal / N).toFixed(2)} 次，幼崽被狗咬伤 ${(dogBites / N).toFixed(2)} 次`);
console.log('每局抉择（全按本能）', Object.fromEntries(Object.entries(decK).map(([k, v]) => [k, (v / N).toFixed(1)])), '合计', (Object.values(decK).reduce((a, b) => a + b, 0) / N).toFixed(1));
console.log(`每局威胁事件 ${(threats / N).toFixed(1)}, 转移巢穴 ${(moves / N).toFixed(1)} 次`);
console.log(`纪实模式: 幼崽存活率 ${(alive / cubs * 100).toFixed(1)}%, 至少一只存活 ${(any / R * 100).toFixed(1)}%  死因`, causes);
console.log(`守护模式: 平均存活 ${(guardAlive / R).toFixed(2)} / 2`);
