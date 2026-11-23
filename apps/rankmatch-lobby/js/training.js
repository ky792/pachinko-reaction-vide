/* 演習：問題を解いて学力ステータス（速さ・正確さ・応用）を育てる。対戦（Battle）の戦力の源。
 * ctx = { D, bank, player, type, char, subject, applyTraining(result) → {before, after}, arena(), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc;
  const RULES = { questions: 10, seconds: 15 };
  const SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
  const AXL = { speed: '速さ', acc: '正確さ', app: '応用' };

  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function buildQuestions(bank, subject) {
    return shuffle(bank.filter((q) => q.subject === subject)).slice(0, RULES.questions).map((q) => {
      const order = shuffle(q.choices.map((_, i) => i));
      return Object.assign({}, q, { choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) });
    });
  }
  /* 成長量：正答数→正確さ、正解の平均秒数→速さ、標準以上の正解数→応用 */
  function growth(t) {
    const ans = t.answers, ok = ans.filter((a) => a.correct);
    const avg = ok.length ? ok.reduce((s, a) => s + a.time, 0) / ok.length : 99;
    const hard = ok.filter((a) => a.q.difficulty >= 2).length;
    const acc = ok.length >= 8 ? 4 : ok.length >= 6 ? 3 : ok.length >= 4 ? 2 : 1;
    const speed = !ok.length ? 0 : avg < 5 ? 3 : avg < 8 ? 2 : 1;
    const app = Math.min(3, Math.floor(hard / 2));
    const misses = {}; ans.forEach((a) => { if (!a.correct) misses[a.q.unit] = (misses[a.q.unit] || 0) + 1; });
    const weak = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];
    return { subject: t.subject, gain: { speed, acc, app }, correct: ok.length, total: ans.length, maxStreak: t.maxStreak,
      avg: +(ok.length ? avg : 0).toFixed(1), weakUnit: weak ? weak[0] : null,
      seconds: Math.round(ans.reduce((s, a) => s + (a.time == null ? RULES.seconds : a.time), 0)) };
  }

  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  const exprFor = (char, ev) => (char.matchExpr && char.matchExpr[ev]) || ({ correct: 'smile', streak: 'smile', wrong: 'special', timeout: 'special' }[ev]);
  const exprLabel = (D, char, e) => (char.expressionLabels && char.expressionLabels[e]) || D.expressions[e] || '';
  const NavLine = (ctx, line, expr = 'default') => `<div class="m-nav" aria-live="polite">
    ${UI.Portrait({ char: ctx.char, expr, cls: 'portrait--face portrait--mnav' })}
    <div class="m-nav__bubble"><b>${esc(ctx.char.name)}<em>${esc(exprLabel(ctx.D, ctx.char, expr))}</em></b><p>${esc(line)}</p></div>
  </div>`;

  const LobbyView = (t, ctx) => {
    const st = ctx.player.stats;
    return `<div class="match-screen phase-lobby">
    <header class="m-head"><button class="link" data-action="exit">← ホーム</button><span class="eyebrow">TRAINING</span></header>
    <h1 class="m-title">演習</h1>
    <p class="a-lede">解いた結果がそのまま<b>学力ステータス</b>になり、ランクマッチの戦力になります。1セット終えると<b>挑戦権が1回復</b>します。</p>
    <section class="m-panel">
      <h2 class="panel__title">科目を選ぶ</h2>
      <div class="t-subjects">${SUBJECTS.map((s) => `<button class="t-subject" data-subject="${s}" aria-pressed="${s === t.subject}"><b>${s}</b><span>${window.Battle.power(st[s])}</span><small>速${st[s].speed} 正${st[s].acc} 応${st[s].app}</small></button>`).join('')}</div>
    </section>
    <section class="m-panel m-rules">
      <h2 class="panel__title">伸びる能力</h2>
      <ul>
        <li><b>正確さ</b>：正解数が多いほど伸びる</li>
        <li><b>速さ</b>：正解までの平均時間が短いほど伸びる</li>
        <li><b>応用</b>：★2以上の問題に正解すると伸びる</li>
      </ul>
      <p class="muted">${RULES.questions}問・1問${RULES.seconds}秒 ・ キー操作：1〜4 / Enter</p>
    </section>
    ${NavLine(ctx, ctx.char.lines.day, 'default')}
    <button class="btn btn--main" data-action="start">${esc(t.subject)}の演習を始める</button>
  </div>`;
  };

  function QuestionView(t, ctx) {
    const q = t.qs[t.i], a = t.answers[t.i], revealed = !!a;
    return `<div class="match-screen phase-${revealed ? 'reveal' : 'question'}">
      <div class="m-board">
        <div class="m-side me"><small>${esc(t.subject)} · 演習</small><b>${t.answers.filter((x) => x.correct).length}<small>正解</small></b></div>
        <div class="m-round"><span>Q${t.i + 1}<small>/${t.qs.length}</small></span></div>
        <div class="m-side op"><small>コンボ</small><b>${t.streak}</b></div>
      </div>
      <div class="m-dots" aria-hidden="true">${t.qs.map((_, k) => { const x = t.answers[k]; return `<i class="${x ? (x.correct ? 'ok' : 'ng') : k === t.i ? 'now' : ''}"></i>`; }).join('')}</div>
      <div class="m-timer"><i class="js-bar" style="width:${revealed ? 0 : 100}%"></i><span class="js-sec">${revealed ? '' : RULES.seconds}</span></div>
      <section class="m-q">
        <div class="m-q__meta"><span>${esc(q.subject)}</span><span>${esc(q.unit)}</span><span class="diff">${'★'.repeat(q.difficulty)}${'☆'.repeat(3 - q.difficulty)}</span></div>
        <p class="m-q__text">${esc(q.q)}</p>
      </section>
      <div class="m-choices" role="group" aria-label="選択肢">${q.choices.map((c, k) => {
        let st = ''; if (revealed) st = k === q.answer ? 'ok' : k === a.choice ? 'ng' : 'dim';
        return `<button class="m-choice ${st}" data-choice="${k}" ${revealed ? 'disabled' : ''}><span class="key">${'ABCD'[k]}</span><span class="txt">${esc(c)}</span>${revealed && k === q.answer ? '<span class="mark">正解</span>' : ''}</button>`;
      }).join('')}</div>
      ${revealed ? `<section class="m-reveal">
        <div class="m-reveal__row"><span class="res ${a.correct ? 'ok' : 'ng'}">${a.correct ? '正解' : a.time == null ? '時間切れ' : '不正解'}</span><span class="t">${a.time != null ? a.time.toFixed(1) + '秒' : ''}</span></div>
        <p class="m-reveal__exp"><b>解説</b>${esc(q.explain)}</p>
        <button class="btn btn--main js-next" data-action="next">${t.i + 1 >= t.qs.length ? '結果を見る' : '次の問題'}<kbd>Enter</kbd></button>
      </section>` : ''}
      ${NavLine(ctx, t.navLine, t.navExpr)}
    </div>`;
  }

  function ResultView(t, ctx) {
    const g = t.result, s = t.stats, sum = g.gain.speed + g.gain.acc + g.gain.app;
    const line = fmt(ctx.char.battleLines.train, { subject: g.subject, gain: sum });
    return `<div class="match-screen phase-result is-win">
      <header class="r-head"><span class="eyebrow">TRAINING RESULT · ${esc(g.subject)}</span><strong class="t-up">学力 +${sum}</strong><span class="r-score">${g.correct}/${g.total} 正解 · 平均 ${g.avg}秒 · 最大コンボ ${g.maxStreak}</span></header>
      <section class="holo-panel t-growth">
        <div class="missions__head"><span class="eyebrow">${esc(g.subject)} の学力ステータス</span><span class="muted">${window.Battle.power(s.before)} → <b>${window.Battle.power(s.after)}</b></span></div>
        ${['speed', 'acc', 'app'].map((k) => `<div class="t-axis"><span>${AXL[k]}</span><div class="bar"><i style="width:${s.after[k]}%"></i><em style="left:${s.before[k]}%;width:${s.after[k] - s.before[k]}%"></em></div><b>${s.after[k]}</b><small class="${g.gain[k] ? 'up' : ''}">+${g.gain[k]}</small></div>`).join('')}
      </section>
      <div class="r-stats">
        <div><b>+1</b><span>挑戦権（${ctx.player.tickets.now}/${ctx.player.tickets.max}）</span></div>
        <div><b>${g.correct * 15 + 60}</b><span>EXP</span></div>
        <div><b>${g.weakUnit ? '要復習' : '完璧'}</b><span>${g.weakUnit ? esc(g.weakUnit) : '全問正解'}</span></div>
      </div>
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
  function fresh(subject) { t = { phase: 'lobby', subject: SUBJECTS.includes(subject) ? subject : '数学', qs: [], i: 0, answers: [], streak: 0, maxStreak: 0, navLine: '', navExpr: 'default' }; }
  function start() { t.qs = buildQuestions(ctx.bank, t.subject); t.i = 0; t.answers = []; t.streak = 0; t.maxStreak = 0; t.phase = 'question'; t.navLine = ctx.char.lines.day; ask(); }
  function ask() {
    t.t0 = performance.now(); draw(); stopTick();
    tick = setInterval(() => {
      const left = Math.max(0, RULES.seconds - (performance.now() - t.t0) / 1000);
      const bar = root.querySelector('.js-bar'), sec = root.querySelector('.js-sec');
      if (bar) { bar.style.width = (left / RULES.seconds) * 100 + '%'; bar.classList.toggle('low', left < 5); }
      if (sec) sec.textContent = Math.ceil(left);
      if (left <= 0) answer(null);
    }, 100);
  }
  function answer(choice) {
    if (t.phase !== 'question' || t.answers[t.i]) return;
    stopTick();
    const q = t.qs[t.i], time = choice == null ? null : Math.min(RULES.seconds, +((performance.now() - t.t0) / 1000).toFixed(1));
    const correct = choice === q.answer;
    t.streak = correct ? t.streak + 1 : 0; t.maxStreak = Math.max(t.maxStreak, t.streak);
    t.answers[t.i] = { choice, correct, time, q };
    const ev = choice == null ? 'timeout' : !correct ? 'wrong' : t.streak >= 3 ? 'streak' : 'correct';
    t.navExpr = exprFor(ctx.char, ev);
    t.navLine = fmt(ctx.char.matchLines[ev], { t: time != null ? time.toFixed(1) : '', n: t.streak, unit: q.unit });
    draw();
  }
  function next() {
    if (t.phase !== 'question' || !t.answers[t.i]) return;
    if (t.i + 1 < t.qs.length) { t.i++; ask(); return; }
    t.result = growth(t); t.stats = ctx.applyTraining(t.result); t.phase = 'result'; draw();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !t) return;
    if (b.dataset.subject) { t.subject = b.dataset.subject; draw(); return; }
    if (b.dataset.choice != null) { answer(+b.dataset.choice); return; }
    switch (b.dataset.action) {
      case 'start': start(); break;
      case 'next': next(); break;
      case 'again': start(); break;
      case 'arena': unmount(); ctx.arena(); break;
      case 'exit': unmount(); ctx.exit(); break;
    }
  }
  function onKey(e) {
    if (!t || !root || t.phase !== 'question') return;
    if (!t.answers[t.i]) { const k = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()]; if (k != null) { e.preventDefault(); answer(k); } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
  }
  function mount(r, c) { unmount(); root = r; ctx = c; fresh(c.subject); root.addEventListener('click', onClick); document.addEventListener('keydown', onKey); draw(); }
  function unmount() { stopTick(); if (root) root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); t = null; root = null; }

  window.Training = { mount, unmount, growth, buildQuestions, RULES };
})();
