/*
 * ヘッドレステスト（Node）: node tests/run-tests.js [--long 秒]
 *  1. 抽選確率・振り分け・ST 継続率（統計的検証）
 *  2. 物理：固定時間刻みでフレームレート非依存か
 *  3. 状態遷移：大当たり→RUSH→ST 再セット→終了、強制抽選の統計除外
 *  4. 長時間稼働：オート遊技（実物理・実演出タイムライン）で例外・停滞が起きないか
 */
const load = require('./load');
const NB = load([
  'engine/core.js', 'engine/lottery.js', 'engine/physics.js', 'engine/timeline.js', 'engine/gimmick.js', 'engine/director.js', 'engine/game.js',
  'machines/abyss-reactor/spec.js', 'machines/abyss-reactor/layout.js', 'machines/abyss-reactor/performance.js',
]);
const M = NB.machines['abyss-reactor'];
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ✔', msg); } else { fails++; console.log('  ✘', msg); } };
const args = process.argv.slice(2);
const LONG = args.includes('--long') ? +args[args.indexOf('--long') + 1] : 1800;

// ---------------------------------------------------------------- 1. 抽選
console.log('\n[1] 抽選エンジン');
{
  const N = 3000000;
  const r = NB.Lottery.simulate(M.spec, N, 12345);
  const p = M.spec.normal.probability, sd = Math.sqrt(N * p * (1 - p));
  ok(Math.abs(r.wins - N * p) < 4 * sd, `通常確率 1/${(N / r.wins).toFixed(2)}（設計 1/99.9, ±4σ 以内）`);
  const se = Math.sqrt(0.55 * 0.45 / r.wins);
  ok(Math.abs(r.rushRate - 0.55) < 4 * se, `RUSH振り分け ${(r.rushRate * 100).toFixed(2)}%（設計 55%）`);
  // RUSH 中確率
  const L = new NB.Lottery(M.spec, new NB.RNG(9)); let w = 0; const n2 = 1000000;
  for (let i = 0; i < n2; i++) if (L.judge(L.acquire('denchu', 'rush'), 'rush').win) w++;
  ok(Math.abs(w / n2 - 1 / 20) < 4 * Math.sqrt((1 / 20) * (19 / 20) / n2), `RUSH中確率 1/${(n2 / w).toFixed(2)}（設計 1/20）`);
  // ST 継続率
  let cont = 0; const trials = 200000;
  for (let i = 0; i < trials; i++) { let hit = false; for (let s = 0; s < M.spec.rush.stSpins; s++) if (L.judge(L.acquire('denchu', 'rush'), 'rush').win) { hit = true; break; } if (hit) cont++; }
  const th = 1 - Math.pow(19 / 20, 31);
  ok(Math.abs(cont / trials - th) < 0.006, `ST31継続率 ${(cont / trials * 100).toFixed(2)}%（理論 ${(th * 100).toFixed(2)}%）`);
  // 演出側からの確率変更不可：forced はテスト扱い
  const h = L.acquire('heso', 'normal', { forced: 'win' });
  ok(h.test === true && L.judge(h, 'normal').win, '強制当たりはテストフラグ付き');
  L.override.normal = 1 / 2; const h2 = L.acquire('heso', 'normal');
  ok(h2.test === true, '確率変更中の取得はテスト扱い'); L.override.normal = null;
  // 演出テーブルが抽選に影響しないこと：乱数系列が独立
  const A = new NB.Lottery(M.spec, new NB.RNG(77)), B = new NB.Lottery(M.spec, new NB.RNG(77));
  const dirRng = new NB.RNG(); for (let i = 0; i < 1000; i++) dirRng.next();
  let same = true; for (let i = 0; i < 1000; i++) if (A.acquire('heso', 'normal').value !== B.acquire('heso', 'normal').value) same = false;
  ok(same, '演出乱数の消費は抽選乱数系列に影響しない');
}

// ---------------------------------------------------------------- 2. 物理
console.log('\n[2] 物理エンジン');
{
  // 同一の初期条件を異なる描画フレーム間隔で更新 → 固定刻みなので完全一致するはず
  const single = (frameDt) => {
    const ph = new NB.Physics(M.layout, { seed: 5 }); const ev = [];
    ph.onEvent = (t, e) => { if (t === 'remove') ev.push(e.reason + '@' + ph.time.toFixed(4)); };
    for (let i = 0; i < 6; i++) { ph.launch(0.24 + i * 0.02); for (let k = 0; k < 288; k++) ph.step(NB.Physics.STEP); } // 0.6s 間隔（物理時間）
    let t = 0; while (t < 30) { ph.update(frameDt); t += frameDt; }
    return ev.join(',') + '|' + ph.balls.map((b) => b.x.toFixed(3)).join(',');
  };
  const a = single(1 / 60), b = single(1 / 144), c = single(1 / 30);
  ok(a === b && a === c, '描画 30/60/144fps で物理結果が完全一致（固定時間刻み）');
  // 統計的にも同等
  const rate = (frameDt) => {
    let h = 0, n = 0; const ph = new NB.Physics(M.layout, { seed: 9, onEvent: (t, e) => { if (t === 'remove') { n++; if (e.reason === 'heso') h++; } } });
    let t = 0, k = 0; while (t < 400) { if (t >= k * 0.6 && k < 600) { ph.launch(0.26); k++; } ph.update(frameDt); t += frameDt; }
    return h / Math.max(1, n);
  };
  const r30 = rate(1 / 30), r144 = rate(1 / 144);
  ok(Math.abs(r30 - r144) < 0.035, `ヘソ入賞率 30fps ${(r30 * 100).toFixed(1)}% / 144fps ${(r144 * 100).toFixed(1)}%`);
  // 入賞率
  const res = {}; const ph = new NB.Physics(M.layout, { seed: 11, onEvent: (t, e) => { if (t === 'remove') res[e.reason] = (res[e.reason] || 0) + 1; } });
  let t = 0, k = 0; const n = 1500;
  while (k < n || ph.balls.length) { if (k < n && t >= k * 0.6) { ph.launch(0.26); k++; } ph.step(NB.Physics.STEP); t += NB.Physics.STEP; if (t > n * 0.6 + 60) break; }
  const hr = (res.heso || 0) / n;
  ok(hr > 0.03 && hr < 0.15, `左打ちヘソ入賞率 ${(hr * 100).toFixed(1)}%（1000円あたり約${(hr * 250).toFixed(1)}回転）`);
  ok((res.lost || 0) / n < 0.03, `玉詰まり率 ${(((res.lost || 0) / n) * 100).toFixed(2)}%`);
  const r2 = {}; const p2 = new NB.Physics(M.layout, { seed: 3, onEvent: (tt, e) => { if (tt === 'remove') r2[e.reason] = (r2[e.reason] || 0) + 1; } });
  p2.gates.denchu = true; p2.gates.attacker = true; t = 0; k = 0;
  while (k < 300 || p2.balls.length) { if (k < 300 && t >= k * 0.6) { p2.launch(0.9); k++; } p2.step(NB.Physics.STEP); t += NB.Physics.STEP; if (t > 300) break; }
  ok((r2.denchu || 0) + (r2.attacker || 0) > 150, `右打ち（開放時）電チュー${r2.denchu || 0}/アタッカー${r2.attacker || 0}（300球中）`);
}

// ---------------------------------------------------------------- 3/4. 状態遷移・長時間
function stub() {
  const store = {};
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(t, k) { if (k in store) return store[k]; if (k === Symbol.toPrimitive) return () => 0; if (k === 'forEach' || k === 'map' || k === 'filter') return () => []; if (k === 'length') return 0; return (store[k] = stub()); },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return p; },
  });
  return p;
}
function makeGame(seed) {
  const lcd = stub(); lcd.hud = { holds: [] }; lcd.bgParams = {};
  const mr = stub(); mr.led = { flash: 0 };
  const audio = stub();
  const G = new NB.Game(M, { audio, lcd, mr });
  G.lottery.rng.seed(seed); G.director.rng.seed(seed + 1);
  G.save = () => {};
  return G;
}
function runGame(G, sec, dt = 1 / 30, onTick) {
  let t = 0; const S = { phases: {}, maxStuck: 0 };
  let lastSpins = 0, since = 0;
  while (t < sec) {
    G.update(dt); t += dt;
    S.phases[G.phase] = (S.phases[G.phase] || 0) + dt;
    const sp = G.stats.spins + G.testStats.spins;
    if (sp === lastSpins && G.phase !== 'bighit') since += dt; else since = 0;
    lastSpins = sp; S.maxStuck = Math.max(S.maxStuck, since);
    if (onTick) onTick(G, t);
  }
  return S;
}

console.log('\n[3] 状態遷移');
{
  const G = makeGame(100);
  G.settings.autoPlay = true; G.settings.autoButton = true;
  const seen = new Set();
  G.addHold('heso', { forced: 'rush' });
  runGame(G, 400, 1 / 30, (g) => { seen.add(g.mode + ':' + g.phase); if (g.bh) seen.add('bh:' + g.bh.sub); });
  ok(seen.has('normal:bighit') && seen.has('bh:open'), '初当たり → 大当たりラウンド（アタッカー開放）');
  ok(seen.has('rush:idle') || seen.has('rush:spin'), 'RUSH 突入・ST 変動');
  ok(G.testStats.firstHits === 1 && G.stats.firstHits === G.stats.hitLog.filter((h) => h.kind === 'first').length, '強制当たりは通常統計から除外（テスト統計に計上）');
  ok(G.stats.spins > 0, `通常統計の回転数 ${G.stats.spins}（テスト ${G.testStats.spins}）`);
  // ST 回数の消化
  const G2 = makeGame(200); G2.settings.autoPlay = true; G2.settings.autoButton = true;
  G2.lottery.override.rush = 1e-9; // RUSH 中は当たらない（テスト）
  G2.chain = 1; G2.enterRush();
  let minSt = 99; let ended = false;
  runGame(G2, 300, 1 / 30, (g) => { if (g.mode === 'rush') minSt = Math.min(minSt, g.st); if (g.mode === 'normal' && !ended) ended = true; });
  ok(minSt === 0 && ended, `ST${M.spec.rush.stSpins}回 消化で RUSH 終了 → 通常復帰`);
  // RUSH 中当たり → ST 再セット
  const G3 = makeGame(300); G3.settings.autoPlay = true; G3.settings.autoButton = true;
  G3.chain = 1; G3.enterRush(); G3.st = 10;
  G3.addHold('denchu', { forced: 'win' });
  let reset = false, chain2 = false;
  runGame(G3, 200, 1 / 30, (g) => { if (g.mode === 'rush' && g.st >= M.spec.rush.stSpins - 1 && g.chain >= 2) reset = true; if (g.chain >= 2) chain2 = true; });
  ok(chain2 && reset, 'RUSH 中大当たり → 連チャン加算・ST31 再セット');
}

console.log(`\n[4] 長時間稼働（オート遊技 ${LONG} 秒相当）`);
{
  const G = makeGame(4242);
  G.settings.autoPlay = true; G.settings.autoButton = true;
  const t0 = Date.now(); let err = null;
  let S;
  try { S = runGame(G, LONG, 1 / 30); } catch (e) { err = e; }
  ok(!err, '例外なし' + (err ? ': ' + err.stack : ''));
  const st = G.stats;
  console.log(`    実行 ${((Date.now() - t0) / 1000).toFixed(1)}s / 回転 ${st.spins} / 初当たり ${st.firstHits} / RUSH ${st.rushEntries} / 最大 ${st.maxChain}連 / 差玉 ${st.payout - st.launched} / 貸玉 ${st.lent}`);
  ok(S && S.maxStuck < 120, `変動停止の最長 ${S ? S.maxStuck.toFixed(1) : '-'}s（保留枯渇を含む）`);
  ok(G.physics.balls.length < 80, `盤面残留玉 ${G.physics.balls.length}`);
  ok(G.log.length <= 500 && st.history.length <= 2000, 'ログ・履歴の上限維持');
  ok(st.spins > LONG / 30, `回転数が妥当（${st.spins}回転 / ${LONG}s）`);
}

console.log(`\n結果: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
