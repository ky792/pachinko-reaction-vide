/* 演習：解いた結果で知識データ（単元ごとの実力・定着度・速さ）を更新する。
 *  時間無制限。調べて解くのも学習として扱う（検知も禁止もしない）。
 *  出題は「忘れかけ・未学習・対戦で押し負けた単元」を優先。
 * ctx = { D, bank, player, type, char, subject, focusUnits, now(), myK(), recordAnswer(q, ans) → 単元の変化,
 *         applyTraining(summary), arena(), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;
  const SET = 10;
  const AXL = { speed: '速さ', acc: '正確さ', app: '応用' };

  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  const exprFor = (char, ev) => (char.matchExpr && char.matchExpr[ev]) || ({ correct: 'smile', streak: 'smile', wrong: 'special' }[ev]);
  const exprLabel = (D, char, e) => (char.expressionLabels && char.expressionLabels[e]) || D.expressions[e] || '';
  const pct = (x) => Math.round(x * 100);
  const NavLine = (ctx, line, expr = 'default') => `<div class="m-nav" aria-live="polite">
    ${UI.Portrait({ char: ctx.char, expr, cls: 'portrait--face portrait--mnav' })}
    <div class="m-nav__bubble"><b>${esc(ctx.char.name)}<em>${esc(exprLabel(ctx.D, ctx.char, expr))}</em></b><p>${esc(line)}</p></div>
  </div>`;

  function LobbyView(t, ctx) {
    const st = ctx.player.stats;
    return `<div class="match-screen phase-lobby">
    <header class="m-head"><button class="link" data-action="exit">← ホーム</button><span class="eyebrow">TRAINING</span></header>
    <h1 class="m-title">演習</h1>
    <p class="a-lede">解いた結果が<b>知識データ</b>になり、そのまま対戦の戦力になります。時間制限はありません。1セット終えると挑戦権が1回復します。</p>
    <section class="m-panel">
      <h2 class="panel__title">科目を選ぶ</h2>
      <div class="t-subjects">${KN.SUBJECTS.map((s) => `<button class="t-subject" data-subject="${s}" aria-pressed="${s === t.subject}"><b>${s}</b><span>${window.Battle.power(st[s])}</span><small>範囲${pct(st[s].coverage)}%${st[s].fading ? ` · 忘${st[s].fading}` : ''}</small></button>`).join('')}</div>
    </section>
    <section class="m-panel m-rules">
      <h2 class="panel__title">知識データの決まり方</h2>
      <ul>
        <li><b>正確さ</b>：単元ごとの実力。自分より難しい問題に正解すると大きく上がり、簡単な問題を落とすと下がる</li>
        <li><b>定着</b>：時間が経つと下がり、解き直すと戻る。間隔をあけて正解するほど長持ちする</li>
        <li><b>速さ</b>：正解までの時間</li>
        <li><b>範囲</b>：手を付けた単元の割合。未学習の単元は対戦で弱点になる</li>
      </ul>
      ${t.focusUnits.length ? `<p class="t-focus">優先して出題：${t.focusUnits.map((u) => `<b>${esc(u)}</b>`).join('・')}</p>` : '<p class="muted">忘れかけ・未学習の単元から優先して出題します。</p>'}
    </section>
    ${NavLine(ctx, ctx.char.lines.day, 'default')}
    <button class="btn btn--main" data-action="start">${esc(t.subject)}の演習を始める</button>
  </div>`;
  }

  function QuestionView(t, ctx) {
    const q = t.qs[t.i], a = t.answers[t.i], rev = !!a;
    const u = ctx.myK().units[KN.key(q.subject, q.unit)];
    const state = !u || !u.n ? '未学習' : `定着 ${pct(KN.retention(u, ctx.now()))}%`;
    return `<div class="match-screen phase-${rev ? 'reveal' : 'question'}">
      <div class="m-board">
        <div class="m-side me"><small>${esc(t.subject)} · 演習</small><b>${t.answers.filter((x) => x.correct).length}<small>正解</small></b></div>
        <div class="m-round"><span>Q${t.i + 1}<small>/${t.qs.length}</small></span></div>
        <div class="m-side op"><small>経過</small><b class="js-el">0</b></div>
      </div>
      <div class="m-dots" aria-hidden="true">${t.qs.map((_, k) => { const x = t.answers[k]; return `<i class="${x ? (x.correct ? 'ok' : 'ng') : k === t.i ? 'now' : ''}"></i>`; }).join('')}</div>
      <section class="m-q">
        <div class="m-q__meta"><span>${esc(q.subject)}</span><span>${esc(q.unit)}</span><span class="diff">${'★'.repeat(q.difficulty)}${'☆'.repeat(3 - q.difficulty)}</span><span class="st">${state}</span></div>
        <p class="m-q__text">${esc(q.q)}</p>
      </section>
      <div class="m-choices" role="group" aria-label="選択肢">${q.choices.map((c, k) => {
        let st = ''; if (rev) st = k === q.answer ? 'ok' : k === a.choice ? 'ng' : 'dim';
        return `<button class="m-choice ${st}" data-choice="${k}" ${rev ? 'disabled' : ''}><span class="key">${'ABCD'[k]}</span><span class="txt">${esc(c)}</span>${rev && k === q.answer ? '<span class="mark">正解</span>' : ''}</button>`;
      }).join('')}</div>
      ${rev ? `<section class="m-reveal">
        <div class="m-reveal__row"><span class="res ${a.correct ? 'ok' : 'ng'}">${a.correct ? '正解' : '不正解'}</span><span class="t">${a.time.toFixed(1)}秒</span>
          <span class="opp">${esc(q.unit)}：正答予測 ${a.delta.before.p == null ? '—' : pct(a.delta.before.p) + '%'} → <b class="${a.delta.before.p == null || a.delta.after.p >= a.delta.before.p ? 'up' : 'down'}">${pct(a.delta.after.p)}%</b></span></div>
        <p class="m-reveal__exp"><b>解説</b>${esc(q.explain)}</p>
        <button class="btn btn--main js-next" data-action="next">${t.i + 1 >= t.qs.length ? '結果を見る' : '次の問題'}<kbd>Enter</kbd></button>
      </section>` : ''}
      ${NavLine(ctx, t.navLine, t.navExpr)}
    </div>`;
  }

  function ResultView(t, ctx) {
    const s = t.subject, b = t.before[s], a = ctx.player.stats[s];
    const sum = ['speed', 'acc', 'app'].reduce((x, k) => x + (a[k] - b[k]), 0);
    const correct = t.answers.filter((x) => x.correct).length;
    const units = {}; t.answers.forEach((x) => { const u = units[x.delta.unit] || (units[x.delta.unit] = { before: x.delta.before, after: x.delta.after, ok: 0, n: 0, memo: 0 }); u.after = x.delta.after; if (x.delta.recent && x.correct) u.memo++; u.n++; if (x.correct) u.ok++; });
    const line = sum > 0 ? fmt(ctx.char.battleLines.train, { subject: s, gain: sum }) : ctx.char.lines.night;
    return `<div class="match-screen phase-result is-win">
      <header class="r-head"><span class="eyebrow">TRAINING RESULT · ${esc(s)}</span><strong class="t-up">学力 ${sum >= 0 ? '+' : ''}${sum}</strong><span class="r-score">${correct}/${t.answers.length} 正解 · 範囲 ${pct(b.coverage)}% → ${pct(a.coverage)}%</span></header>
      <section class="holo-panel t-growth">
        <div class="missions__head"><span class="eyebrow">${esc(s)} の学力ステータス</span><span class="muted">${window.Battle.power(b)} → <b>${window.Battle.power(a)}</b></span></div>
        ${['acc', 'speed', 'app'].map((k) => { const d = a[k] - b[k]; return `<div class="t-axis"><span>${AXL[k]}</span><div class="bar"><i style="width:${Math.min(a[k], b[k])}%"></i><em class="${d < 0 ? 'neg' : ''}" style="left:${Math.min(a[k], b[k])}%;width:${Math.abs(d)}%"></em></div><b>${a[k]}</b><small class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d >= 0 ? '+' : ''}${d}</small></div>`; }).join('')}
      </section>
      <section class="holo-panel r-review">
        <div class="missions__head"><span class="eyebrow">単元ごとの変化</span><span class="muted">正答予測 / 定着</span></div>
        <ul class="t-units">${Object.entries(units).map(([u, x]) => `<li><span class="u">${esc(u)}</span><span class="r">${x.ok}/${x.n}${x.memo ? `<small title="最近解いた問題の正解は、実力の推定にほとんど数えません">（覚え${x.memo}）</small>` : ''}</span><span class="p">${x.before.p == null ? '<em>新規</em>' : pct(x.before.p) + '%'} → <b>${pct(x.after.p)}%</b>${x.after.conf ? `<small class="cf-${x.after.conf.level}"> 確かさ:${x.after.conf.label}</small>` : ''}</span><span class="R">${pct(x.before.R)}% → <b>${pct(x.after.R)}%</b></span></li>`).join('')}</ul>
      </section>
      ${NavLine(ctx, line, 'smile')}
      <div class="r-actions">
        <button class="btn btn--sub" data-action="again">もう1セット</button>
        <button class="btn btn--main" data-action="arena">ランクマッチへ</button>
      </div>
      <button class="link a-refresh" data-action="exit">ホームへ戻る</button>
    </div>`;
  }

  /* ---------- 進行 ---------- */
  let t = null, ctx = null, root = null, tick = null;
  const stopTick = () => { clearInterval(tick); tick = null; };
  function draw() {
    const v = { lobby: LobbyView, question: QuestionView, result: ResultView }[t.phase];
    root.innerHTML = `<div class="screen screen--match">${v(t, ctx)}</div>`;
    const nx = root.querySelector('.js-next'); if (nx) nx.focus({ preventScroll: true });
  }
  function fresh(subject, units) { t = { phase: 'lobby', subject: KN.SUBJECTS.includes(subject) ? subject : '数学', focusUnits: units || [], qs: [], i: 0, answers: [], streak: 0, navLine: '', navExpr: 'default' }; }
  function start() {
    t.before = JSON.parse(JSON.stringify(ctx.player.stats));
    t.qs = KN.pickQuestions(ctx.myK(), ctx.bank, t.subject, SET, ctx.now(), t.focusUnits, null, ctx.player.qr).map((q) => {
      const order = q.choices.map((_, i) => i).sort(() => Math.random() - 0.5);
      return Object.assign({}, q, { choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) });
    });
    t.i = 0; t.answers = []; t.streak = 0; t.phase = 'question'; t.navLine = ctx.char.lines.day; t.navExpr = 'default'; ask();
  }
  function ask() {
    // 解答時間は「問題が画面に表示されてから選択肢をタップするまで」。描画が終わった次のフレームから測る
    t.t0 = Infinity; draw(); stopTick();
    requestAnimationFrame(() => requestAnimationFrame(() => { t.t0 = performance.now(); }));
    tick = setInterval(() => { const el = root.querySelector('.js-el'); if (el && isFinite(t.t0)) el.textContent = Math.floor((performance.now() - t.t0) / 1000) + 's'; }, 250);
  }
  function answer(choice) {
    if (t.phase !== 'question' || t.answers[t.i]) return;
    stopTick();
    if (!isFinite(t.t0)) return; // 表示が終わる前のタップは数えない
    const q = t.qs[t.i], time = +((performance.now() - t.t0) / 1000).toFixed(1), correct = choice === q.answer;
    const delta = ctx.recordAnswer(q, { correct, time });
    if (window.SFX) window.SFX.play(correct ? 'correct' : 'wrong');
    t.streak = correct ? t.streak + 1 : 0;
    t.answers[t.i] = { choice, correct, time, delta };
    const ev = !correct ? 'wrong' : t.streak >= 3 ? 'streak' : 'correct';
    t.navExpr = exprFor(ctx.char, ev);
    t.navLine = fmt(ctx.char.matchLines[ev], { t: time.toFixed(1), n: t.streak, unit: q.unit });
    draw();
  }
  function next() {
    if (t.phase !== 'question' || !t.answers[t.i]) return;
    if (t.i + 1 < t.qs.length) { t.i++; ask(); return; }
    const correct = t.answers.filter((x) => x.correct).length;
    let streak = 0, max = 0; t.answers.forEach((x) => { streak = x.correct ? streak + 1 : 0; max = Math.max(max, streak); });
    const miss = {}; t.answers.forEach((x, i) => { if (!x.correct) miss[t.qs[i].unit] = (miss[t.qs[i].unit] || 0) + 1; });
    const weak = Object.entries(miss).sort((a, b) => b[1] - a[1])[0];
    ctx.applyTraining({ subject: t.subject, correct, total: t.answers.length, maxStreak: max, weakUnit: weak ? weak[0] : null, seconds: Math.round(t.answers.reduce((s, x) => s + x.time, 0)) });
    t.phase = 'result'; draw();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !t) return;
    if (b.dataset.subject) { t.subject = b.dataset.subject; t.focusUnits = []; draw(); return; }
    if (b.dataset.choice != null) { answer(+b.dataset.choice); return; }
    switch (b.dataset.action) {
      case 'start': case 'again': start(); break;
      case 'next': next(); break;
      case 'arena': unmount(); ctx.arena(); break;
      case 'exit': unmount(); ctx.exit(); break;
    }
  }
  function onKey(e) {
    if (!t || !root || t.phase !== 'question') return;
    if (!t.answers[t.i]) { const k = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()]; if (k != null) { e.preventDefault(); answer(k); } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
  }
  function mount(r, c) { unmount(); root = r; ctx = c; fresh(c.subject, c.focusUnits); root.addEventListener('click', onClick); document.addEventListener('keydown', onKey); draw(); }
  function unmount() { stopTick(); if (root) root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); t = null; root = null; }

  window.Training = { mount, unmount };
})();
