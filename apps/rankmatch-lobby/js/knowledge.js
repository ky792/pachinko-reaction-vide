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
 *    速さ   = 学習済み単元の正解までの時間（正確さとは独立）
 *    応用   = 応用レーティングの正答確率 × 定着度補正
 *    範囲   = 学習済み単元の割合
 *
 *  調べて解くのも学習として扱う（対策はしない）。それで定着するなら学習アプリとしては問題ない。
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

  /* カリキュラム（科目 › 分野 › 単元）。問題がある単元だけが計算対象（ready）。 */
  let UNITS = {}, FIELDS = {}, META = {};
  /* curr は選択科目を反映したカリキュラム、all は全体（選択外の科目の単元を「その他」に入れないため） */
  function setCurriculum(curr, bank, all) {
    UNITS = {}; FIELDS = {}; META = {};
    const has = new Set(bank.map((q) => q.subject + '/' + q.unit));
    SUBJECTS.forEach((s) => {
      const fields = (curr[s] || []).map((f) => ({ field: f.field, track: f.track, units: f.units.map((u) => ({ name: u.name, weight: u.weight || 1, ready: has.has(s + '/' + u.name) })) }));
      const known = new Set(((all || curr)[s] || []).flatMap((f) => f.units.map((u) => u.name)));
      const extra = [...new Set(bank.filter((q) => q.subject === s && !known.has(q.unit)).map((q) => q.unit))];
      if (extra.length) fields.push({ field: 'その他', units: extra.map((name) => ({ name, weight: 1, ready: true })) });
      FIELDS[s] = fields;
      UNITS[s] = [];
      fields.forEach((f) => f.units.forEach((u) => { META[s + '/' + u.name] = { field: f.field, weight: u.weight, ready: u.ready }; if (u.ready) UNITS[s].push(u.name); }));
    });
    return UNITS;
  }
  const setBank = (bank) => setCurriculum(window.curriculumFor ? window.curriculumFor() : window.CURRICULUM || {}, bank, window.CURRICULUM);
  const inScope = (q) => (UNITS[q.subject] || []).includes(q.unit); // 選んだ科目の単元か
  const meta = (s, u) => META[s + '/' + u] || { field: 'その他', weight: 1, ready: true };
  /* 出題頻度で重み付けした単元の抽選（対戦で押し合う単元） */
  function weightedUnit(s, r, exclude) {
    const list = (UNITS[s] || []).filter((u) => u !== exclude);
    const tot = list.reduce((x, u) => x + meta(s, u).weight, 0);
    let v = r() * tot;
    for (const u of list) { v -= meta(s, u).weight; if (v <= 0) return u; }
    return list[list.length - 1];
  }
  const key = (s, u) => s + '/' + u;
  /* 定着度 = 習熟 m（反復で少しずつ積み上がる 0〜1）× 忘却 exp(−経過日数 / 安定度 S)。
     m は 1 日あたり +35% まで、その日に誤答した単元は 70% まで。100% には日をまたいだ反復が要る */
  const mastery = (u) => (u.m != null ? u.m : u.n ? Math.min(0.8, Math.max(0.1, u.n * 0.1)) : 0); // m の無い旧データは解いた回数から推定
  const retention = (u, now) => (!u || !u.n ? 0 : mastery(u) * Math.exp(-Math.max(0, now - u.last) / DAY / u.S));
  const M_DAY = 0.35, M_WRONG = 0.7;
  const dayOf = (t) => Math.floor((t + 9 * 3600000) / DAY); // 日本時間の日付
  /* 推定の確かさ：sd は実力レーティングの不確かさ（大きいほど荒い）。解くほど小さくなる */
  const SD0 = 350, SDMIN = 100;
  const sdOf = (u) => (!u || !u.n ? SD0 : u.sd != null ? u.sd : Math.max(SDMIN, SD0 * Math.pow(0.85, u.n)));
  function confOf(u) {
    const sd = sdOf(u), level = sd > 240 ? 'low' : sd > 150 ? 'mid' : 'high';
    return { sd, level, label: { low: '荒い', mid: 'ふつう', high: '確か' }[level], v: 1 - (sd - SDMIN) / (SD0 - SDMIN) };
  }
  const RECENT = 3 * DAY; // この期間内の同じ問題の正解は「答えを覚えている」可能性が高いので、ほとんど数えない
  const qRating = (qr, q) => (qr && qr[q.id] != null ? qr[q.id] : QR0[q.difficulty]);

  /* 単元の強さ（対戦の押し合いに使う） */
  function unitValue(K, s, unit, axis, now) {
    const u = K.units[key(s, unit)];
    if (!u || !u.n) return axis === 'acc' ? 15 : 20;
    const R = retention(u, now), p = prob(u.r, STD);
    if (axis === 'acc') return 100 * p * (0.5 + 0.5 * R);
    return 100 * clamp01(1.5 - u.ratio) * (0.6 + 0.4 * p);
  }

  /* 単元ひとつの詳細（学力詳細画面・バトル解説用） */
  function unitDetail(K, s, unit, now) {
    const m = meta(s, unit), u = K.units[key(s, unit)];
    if (!m.ready) return Object.assign({ unit, status: 'soon', n: 0 }, m);
    if (!u || !u.n) return Object.assign({ unit, status: 'new', n: 0, p: null, R: 0, sec: null, conf: confOf(null) }, m);
    const R = retention(u, now), p = prob(u.r, STD);
    const status = R < 0.6 ? 'fading' : p < 0.55 ? 'weak' : p >= 0.8 && R >= 0.8 ? 'strong' : 'ok';
    const c = confOf(u), lo = prob(u.r - c.sd, STD), hi = prob(u.r + c.sd, STD);
    return Object.assign({ unit, status, n: u.n, p, lo, hi, conf: c, R, sec: +(u.ratio * REF[2]).toFixed(1), S: u.S }, m);
  }

  /* 科目ステータス：出題頻度で重み付け */
  function aggregate(K, s, names, now) {
    let acc = 0, w = 0, sp = 0, spW = 0, rSum = 0, done = 0, fading = 0, cov = 0, cf = 0;
    names.forEach((unit) => {
      const wt = meta(s, unit).weight, u = K.units[key(s, unit)];
      w += wt; cf += confOf(u).v * wt;
      if (!u || !u.n) { acc += 0.15 * wt; return; }
      const R = retention(u, now), p = prob(u.r, STD);
      done++; cov += wt; rSum += R; if (R < 0.6) fading++;
      acc += p * (0.5 + 0.5 * R) * wt;
      sp += clamp01(1.5 - u.ratio) * (0.6 + 0.4 * p) * wt; spW += wt;
    });
    return { conf: w ? cf / w : 0, acc: w ? (100 * acc) / w : 0, speed: spW ? (100 * sp) / spW : 20, coverage: w ? cov / w : 0, meanR: done ? rSum / done : 0, fading, learned: done, units: names.length };
  }
  function subjectStats(K, now) {
    const out = {};
    SUBJECTS.forEach((s) => {
      const g = aggregate(K, s, UNITS[s] || [], now);
      out[s] = {
        acc: Math.round(g.acc), speed: Math.round(g.speed),
        app: Math.round(100 * prob(K.app[s] != null ? K.app[s] : APP - 200, APP) * (0.5 + 0.5 * g.meanR)),
        conf: g.conf, coverage: g.coverage, retention: g.meanR, fading: g.fading, units: g.units, learned: g.learned,
      };
    });
    return out;
  }
  function fieldStats(K, s, now) {
    return (FIELDS[s] || []).map((f) => {
      const ready = f.units.filter((u) => u.ready).map((u) => u.name);
      const g = aggregate(K, s, ready, now);
      return { field: f.field, acc: Math.round(g.acc), speed: Math.round(g.speed), coverage: g.coverage, fading: g.fading, ready: ready.length, units: f.units.map((u) => unitDetail(K, s, u.name, now)) };
    });
  }

  /* 1問解いたときの更新。before/after は画面表示用 */
  function update(K, q, ans, now, qr) {
    const k = key(q.subject, q.unit);
    K.subj = K.subj || {};
    const sr = K.subj[q.subject] != null ? K.subj[q.subject] : STD; // 科目全体の実力（新しい単元の出発点に使う）
    const u = K.units[k] && K.units[k].n ? K.units[k] : { n: 0, r: sr, sd: SD0 * 0.85, S: 1, ratio: 1.3, last: now };
    const before = { p: u.n ? prob(u.r, STD) : null, R: retention(u, now), n: u.n };
    const qrat = qRating(qr, q), s = ans.correct ? 1 : 0;
    const expect = GUESS + (1 - GUESS) * prob(u.r, qrat);
    K.seen = K.seen || {};
    const recent = K.seen[q.id] != null && now - K.seen[q.id] < RECENT; // 最近解いた同じ問題
    const sd = sdOf(u);
    let kf = Math.max(16, sd * 0.45); // 不確かなうちは大きく動かし、確かになるほど小さく
    if (recent && ans.correct) kf *= 0.25; // 覚えた答えでの正解はほとんど数えない
    u.r += kf * (s - expect);
    if (!(recent && ans.correct)) K.subj[q.subject] = sr + 18 * (s - (GUESS + (1 - GUESS) * prob(sr, qrat)));
    // 解いた数が少ない単元は、科目全体の実力に少し寄せる（極端な推定を防ぐ）
    if (u.n < 6) u.r += (K.subj[q.subject] - u.r) * 0.12;
    u.sd = Math.max(SDMIN, sd * (recent ? 0.98 : 0.9));
    K.seen[q.id] = now;
    if (qr && !recent) qr[q.id] = qrat - 4 * (s - expect); // 問題の難しさは全員の解答で少しずつ調整（本番はサーバーで集計）
    const gap = u.n ? Math.max(0, now - u.last) / DAY : 0;
    u.S = ans.correct ? (u.n ? Math.min(60, u.S * (1.25 + 0.75 * Math.min(1, gap / u.S))) : 1.5) : Math.max(1, u.S * 0.6);
    if (ans.correct && ans.time != null) u.ratio = u.ratio * 0.65 + (ans.time / REF[q.difficulty]) * 0.35;
    // 習熟：その日の始まりの値から +35% まで。誤答した日は 70% 止まり。同じ問題の覚えた答えでの正解はほとんど伸びない
    const m0 = mastery(u), d = dayOf(now);
    if (u.md !== d) { u.md = d; u.ms = m0 * Math.exp(-Math.max(0, now - (u.last || now)) / DAY / (u.S || 1)); u.mw = 0; }
    if (!ans.correct) u.mw = 1;
    const cap = Math.min(u.ms + M_DAY, u.mw ? Math.max(u.ms, M_WRONG) : 1);
    const gain = ans.correct ? (recent ? 0.02 : 0.12 * (1 + Math.min(1, gap / Math.max(1, u.S)))) : -0.08;
    u.m = Math.max(0, Math.min(cap, Math.max(m0 * (u.n ? Math.exp(-Math.max(0, now - u.last) / DAY / u.S) : 0), u.ms) + gain));
    u.c = (u.c || 0) + (ans.correct ? 1 : 0); // 実際の正解数（表示用）
    u.last = now; u.n++;
    K.units[k] = u;
    if (q.difficulty >= 2) { const ra = K.app[q.subject] != null ? K.app[q.subject] : APP - 200; K.app[q.subject] = ra + 24 * (s - (GUESS + (1 - GUESS) * prob(ra, qrat))); }
    return { unit: q.unit, subject: q.subject, before, recent, after: { p: prob(u.r, STD), R: retention(u, now), n: u.n, conf: confOf(u) } };
  }

  /* 出題：実力に合った難しさ・推定が荒い単元・忘れかけ・未学習・指定単元を優先。最近解いた問題は避け、1単元に偏らない */
  function pickQuestions(K, bank, subject, n, now, focusUnits, seed, qr) {
    const r = rng(seed || Date.now()), fu = focusUnits || [], seen = K.seen || {};
    const scored = bank.filter((q) => q.subject === subject && inScope(q)).map((q) => {
      const u = K.units[key(q.subject, q.unit)], learned = u && u.n;
      const pc = GUESS + (1 - GUESS) * prob(learned ? u.r : STD - 150, qRating(qr, q));
      const info = pc * (1 - pc) * 4;                 // 正答確率が五分五分に近いほど情報が多い（0〜1）
      const unsure = sdOf(u) / SD0;                   // 推定が荒い単元ほど優先
      const age = seen[q.id] == null ? Infinity : now - seen[q.id];
      const repeat = age < DAY ? -2 : age < RECENT ? -0.8 : 0;
      const pri = (learned ? 1 - retention(u, now) : 0.6) * 0.8 + info * 0.9 + unsure * 0.6 + meta(q.subject, q.unit).weight * 0.12
        + (fu.includes(q.unit) ? 2 : 0) + repeat + r() * 0.3;
      return { q, pri };
    }).sort((a, b) => b.pri - a.pri);
    const out = [], per = {}, cap = Math.max(2, Math.ceil(n / 3));
    scored.forEach(({ q }) => { if (out.length < n && (per[q.unit] || 0) < cap) { out.push(q); per[q.unit] = (per[q.unit] || 0) + 1; } });
    scored.forEach(({ q }) => { if (out.length < n && !out.includes(q)) out.push(q); });
    return out;
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
        const n = 3 + Math.floor(r() * 8);
        K.units[key(s, unit)] = { r: STD + logit(st.acc / 100) + (r() - 0.5) * 180, n, c: Math.round(n * (0.4 + r() * 0.5)), m: 0.7 + r() * 0.3, last: now - Math.pow(r(), 2) * 7 * DAY, S: 5 + r() * 12, ratio: Math.max(0.4, 1.5 - st.speed / 100 + (r() - 0.5) * 0.3) };
      });
      K.app[s] = APP + logit(st.app / 100);
    });
    return K;
  }

  window.Knowledge = { mastery, dayOf, confOf, sdOf, DAY, SUBJECTS, setBank, setCurriculum, inScope, units: () => UNITS, fields: () => FIELDS, meta, weightedUnit, unitDetail, fieldStats, REF, retention, prob, STD, unitValue, subjectStats, update, pickQuestions, simulateAnswer, synth, hash, rng, key };
})();
