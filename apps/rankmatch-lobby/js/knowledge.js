/* 知識モデル：学力ステータスを「貯めたポイント」ではなく「今の実力の推定値」として扱う。
 *
 *  単元ごとに持つ値
 *    r      実力レーティング（Elo 方式。問題の難易度レーティングと比べて正答確率を出す）
 *    S      記憶の安定度（日）。定着度 R = exp(−経過日数 / S)。正解で伸び、誤答で縮む
 *    ratio  正解までの時間 ÷ 基準時間（難易度別）。小さいほど速い
 *    n      解いた回数（0 = 未学習）
 *  科目ごとに持つ値
 *    app    応用レーティング（★2以上の問題だけで更新）
 *
 *  そこから出す科目ステータス（0〜100）
 *    正確さ = 単元平均の「標準問題の正答確率 × 定着度補正」（未学習の単元は低く数える）
 *    速さ   = 学習済み単元の速さ（調べながら解くと下がる。正確さとは独立）
 *    応用   = 応用レーティングの正答確率 × 定着度補正
 *    範囲   = 学習済み単元の割合
 *
 *  調べながら解くのは自由（学習アプリなので、それで定着するならよい）。
 *  知っている問題を繰り返しても、正解して当然なのでレーティングはほとんど動かない。 */
(function () {
  const DAY = 86400000;
  const SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
  const STD = 1300, APP = 1500;
  const QR0 = { 1: 1100, 2: 1300, 3: 1500 };   // 問題の初期難易度レーティング
  const REF = { 1: 6, 2: 9, 3: 12 };            // 基準解答時間（秒）
  const GUESS = 0.25;                           // 4択の当てずっぽう

  const prob = (r, q) => 1 / (1 + Math.pow(10, (q - r) / 400));
  const logit = (p) => { p = Math.min(0.97, Math.max(0.03, p)); return 400 * Math.log10(p / (1 - p)); };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  let UNITS = {};
  function setBank(bank) {
    UNITS = {};
    bank.forEach((q) => { (UNITS[q.subject] = UNITS[q.subject] || []); if (!UNITS[q.subject].includes(q.unit)) UNITS[q.subject].push(q.unit); });
    return UNITS;
  }
  const key = (s, u) => s + '/' + u;
  const retention = (u, now) => (!u || !u.n ? 0 : Math.exp(-Math.max(0, now - u.last) / DAY / u.S));
  const qRating = (qr, q) => (qr && qr[q.id] != null ? qr[q.id] : QR0[q.difficulty]);

  /* 単元の強さ（対戦の押し合いに使う） */
  function unitValue(K, s, unit, axis, now) {
    const u = K.units[key(s, unit)];
    if (!u || !u.n) return axis === 'acc' ? 15 : 20;
    const R = retention(u, now), p = prob(u.r, STD);
    if (axis === 'acc') return 100 * p * (0.5 + 0.5 * R);
    return 100 * clamp01(1.5 - u.ratio) * (0.6 + 0.4 * p);
  }

  function subjectStats(K, now) {
    const out = {};
    SUBJECTS.forEach((s) => {
      const list = UNITS[s] || [];
      let acc = 0, sp = 0, spN = 0, rSum = 0, done = 0, fading = 0;
      list.forEach((unit) => {
        const u = K.units[key(s, unit)];
        if (!u || !u.n) { acc += 0.15; return; }
        const R = retention(u, now);
        done++; rSum += R; if (R < 0.6) fading++;
        acc += prob(u.r, STD) * (0.5 + 0.5 * R);
        sp += clamp01(1.5 - u.ratio) * (0.6 + 0.4 * prob(u.r, STD)); spN++;
      });
      const meanR = done ? rSum / done : 0;
      out[s] = {
        acc: Math.round((100 * acc) / Math.max(1, list.length)),
        speed: Math.round(spN ? (100 * sp) / spN : 20),
        app: Math.round(100 * prob(K.app[s] != null ? K.app[s] : APP - 200, APP) * (0.5 + 0.5 * meanR)),
        coverage: list.length ? done / list.length : 0,
        retention: meanR, fading, units: list.length, learned: done,
      };
    });
    return out;
  }

  /* 1問解いたときの更新。before/after は画面表示用 */
  function update(K, q, ans, now, qr) {
    const k = key(q.subject, q.unit);
    const u = K.units[k] && K.units[k].n ? K.units[k] : { n: 0, r: STD - 150, S: 1, ratio: 1.3, last: now };
    const before = { p: u.n ? prob(u.r, STD) : null, R: retention(u, now), n: u.n };
    const qrat = qRating(qr, q), s = ans.correct ? 1 : 0;
    const expect = GUESS + (1 - GUESS) * prob(u.r, qrat);
    const kf = Math.max(16, 56 / (1 + u.n * 0.15));
    u.r += kf * (s - expect);
    if (qr) qr[q.id] = qrat - 10 * (s - expect);
    const gap = u.n ? Math.max(0, now - u.last) / DAY : 0;
    u.S = ans.correct ? (u.n ? Math.min(60, u.S * (1.25 + 0.75 * Math.min(1, gap / u.S))) : 1.5) : Math.max(1, u.S * 0.6);
    if (ans.correct && ans.time != null) u.ratio = u.ratio * 0.65 + (ans.time / REF[q.difficulty]) * 0.35;
    u.last = now; u.n++;
    K.units[k] = u;
    if (q.difficulty >= 2) { const ra = K.app[q.subject] != null ? K.app[q.subject] : APP - 200; K.app[q.subject] = ra + 24 * (s - (GUESS + (1 - GUESS) * prob(ra, qrat))); }
    return { unit: q.unit, subject: q.subject, before, after: { p: prob(u.r, STD), R: 1, n: u.n } };
  }

  /* 出題：忘れかけ・未学習・指定単元を優先 */
  function pickQuestions(K, bank, subject, n, now, focusUnits, seed) {
    const r = rng(seed || Date.now());
    const fu = focusUnits || [];
    return bank.filter((q) => q.subject === subject).map((q) => {
      const u = K.units[key(q.subject, q.unit)];
      const pri = (u && u.n ? 1 - retention(u, now) : 0.8) + (fu.includes(q.unit) ? 2 : 0) + r() * 0.35;
      return { q, pri };
    }).sort((a, b) => b.pri - a.pri).slice(0, n).map((x) => x.q);
  }

  /* 相手の回答を学力データから予測（試作用。本番は相手が後で同じ問題を解く） */
  function simulateAnswer(K, q, qr, r) {
    const u = K.units[key(q.subject, q.unit)];
    const R = retention(u, Date.now());
    const rr = u && u.n ? u.r - (1 - R) * 150 : 1150;
    const correct = r() < GUESS + (1 - GUESS) * prob(rr, qRating(qr, q));
    const time = +(REF[q.difficulty] * (u && u.n ? u.ratio : 1.3) * (0.7 + r() * 0.6)).toFixed(1);
    return { correct, time };
  }

  /* 試作用：ステータスの目安から単元データを作る（初期データ・相手の防衛データ） */
  function synth(stats, seed, now, skip = 0.22) {
    const r = rng(seed), K = { units: {}, app: {} };
    SUBJECTS.forEach((s) => {
      const st = stats[s];
      (UNITS[s] || []).forEach((unit) => {
        if (r() < skip) { K.units[key(s, unit)] = { n: 0 }; return; }
        K.units[key(s, unit)] = { r: STD + logit(st.acc / 100) + (r() - 0.5) * 180, n: 3 + Math.floor(r() * 8), last: now - r() * 6 * DAY, S: 3 + r() * 10, ratio: Math.max(0.4, 1.5 - st.speed / 100 + (r() - 0.5) * 0.3) };
      });
      K.app[s] = APP + logit(st.app / 100);
    });
    return K;
  }

  window.Knowledge = { DAY, SUBJECTS, setBank, units: () => UNITS, retention, prob, STD, unitValue, subjectStats, update, pickQuestions, simulateAnswer, synth, hash, rng, key };
})();
