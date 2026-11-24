/* 戦闘バランスのシミュレーション：総合差ごとの試合勝率と、陣地単位の勝率を測る。
 * 目標：同格 50%／総合差 20 で 65:35／総合差 50 で 85:15、格下でも陣地単位で 2〜3 割。
 * 使い方: node tools/sim_battle.js [sigma]   （sigma を渡すと RULE.sigma を上書きして測る） */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.resolve(__dirname, '..') + '/';
const ctx = { window: {}, console, Math, Date, JSON, document: { querySelectorAll: () => [] } };
ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['data/questions.js', 'data/questions-2.js', 'data/questions-gen.js', 'data/curriculum.js', 'js/knowledge.js', 'js/components.js', 'js/battle.js'])
  vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
const w = ctx.window, KN = w.Knowledge, B = w.Battle;
w.remapBank(w.QUESTION_BANK); KN.setCurriculum(w.curriculumFor(), w.QUESTION_BANK, w.CURRICULUM);
if (process.argv[2]) B.RULE.sigma = +process.argv[2];
const S5 = KN.SUBJECTS, now = Date.now();
let seed = 1;
const mk = (lvl, spread) => { // 平均 lvl の能力、科目ごとに ±spread のばらつき
  const r = KN.rng(seed++ * 7919), st = {};
  S5.forEach((s) => { const v = () => Math.max(20, Math.min(95, lvl + (r() - 0.5) * 2 * spread)); st[s] = { acc: v(), speed: v(), app: v() }; });
  const K = KN.synth(st, seed++ * 104729, now, 0.08), S = KN.subjectStats(K, now);
  return { K, S, focus: S5[Math.floor(r() * 5)], order: S5.slice().sort(() => r() - 0.5) };
};
const buckets = {}; // 総合差（10 刻み）→ [勝ち, 試合, 陣地勝ち, 陣地数]
for (let i = 0; i < 1400; i++) {
  const lvl = 45 + Math.random() * 30, me = mk(lvl, 8), op = mk(lvl + (Math.random() - 0.5) * 12, 8);
  const diff = B.totalPower(me.S) - B.totalPower(op.S), key = Math.round(diff / 10) * 10;
  if (Math.abs(key) > 70) continue;
  const bk = buckets[key] || (buckets[key] = [0, 0, 0, 0]);
  for (let j = 0; j < 20; j++) {
    const res = B.resolveBattle(me, op, (i * 97 + j) * 131, now);
    bk[0] += res.win ? 1 : 0; bk[1]++;
    res.areas.filter((a) => !a.skipped).forEach((a) => { bk[2] += a.win ? 1 : 0; bk[3]++; });
  }
}
console.log(`sigma=${B.RULE.sigma}  総合差 → 試合勝率（陣地勝率）`);
Object.keys(buckets).map(Number).sort((a, b) => a - b).forEach((k) => {
  const [wn, n, aw, an] = buckets[k];
  if (n >= 200) console.log(`${String(k).padStart(4)} : ${(100 * wn / n).toFixed(0).padStart(3)}%  (${(100 * aw / an).toFixed(0)}%)  n=${n}`);
});
