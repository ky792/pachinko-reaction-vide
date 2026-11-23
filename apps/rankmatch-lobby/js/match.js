/* ランクマッチ：ルール（純関数）＋ 画面 ＋ 進行。
 * app.js から Match.mount(root, ctx) で起動する。キャラ・問題・プレイヤーは ctx 経由で受け取る。
 * ctx = { D, bank, player, type, char, applyResult(result) → {before, after}, exit() } */
(function () {
  const UI = window.UI, esc = UI.esc;

  /* ================= ルール ================= */
  const RULES = { questions: 10, seconds: 15, base: 100, speedPerSec: 4, comboAt: 3, comboBonus: 20 };
  const SUBJECTS = ['数学', '英語', '理科', '社会', 'ミックス'];
  const OPPONENTS = [
    { name: 'ユウキ', rank: 'A−', acc: 0.72, speed: [3, 9] },
    { name: 'ミナト', rank: 'B+', acc: 0.66, speed: [4, 10] },
    { name: 'シオン', rank: 'B+', acc: 0.63, speed: [3, 11] },
    { name: 'コハル', rank: 'A−', acc: 0.70, speed: [4, 9] },
    { name: 'レン', rank: 'B', acc: 0.58, speed: [5, 12] },
  ];
  const rand = (a, b) => a + Math.random() * (b - a);
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function buildQuestions(bank, subject) {
    const pool = subject === 'ミックス' ? bank : bank.filter((q) => q.subject === subject);
    return shuffle(pool).slice(0, RULES.questions).map((q) => {
      const order = shuffle(q.choices.map((_, i) => i));
      return Object.assign({}, q, { choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) });
    });
  }
  function points(correct, time, streak) {
    if (!correct) return 0;
    return RULES.base + Math.round(Math.max(0, RULES.seconds - time) * RULES.speedPerSec) + (streak >= RULES.comboAt ? RULES.comboBonus : 0);
  }
  function simulateOpponent(opp, q) {
    const acc = opp.acc - (q.difficulty - 2) * 0.08;
    if (Math.random() < 0.06) return { correct: false, time: null }; // 時間切れ
    return { correct: Math.random() < acc, time: +rand(opp.speed[0], opp.speed[1]).toFixed(1) };
  }
  function summarize(m) {
    const ans = m.me.answers, correct = ans.filter((a) => a.correct).length;
    const timed = ans.filter((a) => a.time != null);
    const avg = timed.length ? timed.reduce((s, a) => s + a.time, 0) / timed.length : 0;
    const win = m.me.score > m.op.score || (m.me.score === m.op.score && correct >= m.op.correct);
    const diff = m.me.score - m.op.score;
    const rp = win ? Math.min(40, Math.max(18, 18 + Math.round(diff / 60) + (correct >= 8 ? 5 : 0)))
                   : -Math.min(22, Math.max(12, 12 + Math.round(-diff / 80)));
    const exp = 60 + correct * 15 + (win ? 60 : 0);
    const misses = {};
    ans.forEach((a, i) => { if (!a.correct) { const u = m.qs[i].unit; misses[u] = (misses[u] || 0) + 1; } });
    const weak = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];
    return {
      win, rp, exp, correct, total: ans.length, avg: +avg.toFixed(1), maxStreak: m.me.maxStreak,
      score: m.me.score, oppScore: m.op.score, subject: m.subject,
      weakUnit: weak ? weak[0] : null, weakSubject: weak ? m.qs.find((q) => q.unit === weak[0]).subject : null,
      seconds: Math.round(ans.reduce((s, a) => s + (a.time == null ? RULES.seconds : a.time), 0)),
    };
  }

  /* ================= 表示部品 ================= */
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  const exprFor = (char, ev) => (char.matchExpr && char.matchExpr[ev]) || ({ correct: 'smile', streak: 'smile', win: 'smile', wrong: 'special', timeout: 'special', lose: 'serious', ready: 'serious' }[ev]);
  const exprLabel = (D, char, e) => (char.expressionLabels && char.expressionLabels[e]) || D.expressions[e] || '';

  const NavLine = (ctx, line, expr) => `<div class="m-nav" aria-live="polite">
    ${UI.Portrait({ char: ctx.char, expr, cls: 'portrait--face portrait--mnav' })}
    <div class="m-nav__bubble"><b>${esc(ctx.char.name)}<em>${esc(exprLabel(ctx.D, ctx.char, expr))}</em></b><p>${esc(line)}</p></div>
  </div>`;

  const Board = (m, ctx) => `<div class="m-board">
    <div class="m-side me"><small>${esc(ctx.player.name)} · ${esc(ctx.rankLabel)}</small><b class="js-me">${m.me.score}</b></div>
    <div class="m-round"><span>Q${Math.min(m.i + 1, m.qs.length)}<small>/${m.qs.length}</small></span></div>
    <div class="m-side op"><small>${esc(m.opp.name)} · ${esc(m.opp.rank)}</small><b class="js-op">${m.op.score}</b></div>
  </div>
  <div class="m-dots" aria-hidden="true">${m.qs.map((_, k) => {
    const a = m.me.answers[k];
    return `<i class="${a ? (a.correct ? 'ok' : 'ng') : k === m.i ? 'now' : ''}"></i>`;
  }).join('')}</div>`;

  function QuestionView(m, ctx) {
    const q = m.qs[m.i], a = m.me.answers[m.i], o = m.op.answers[m.i];
    const revealed = !!a;
    return `<div class="match-screen phase-${revealed ? 'reveal' : 'question'}">
      ${Board(m, ctx)}
      <div class="m-timer"><i class="js-bar" style="width:${revealed ? 0 : 100}%"></i><span class="js-sec">${revealed ? '' : RULES.seconds}</span></div>
      <section class="m-q">
        <div class="m-q__meta"><span>${esc(q.subject)}</span><span>${esc(q.unit)}</span><span class="diff">${'★'.repeat(q.difficulty)}${'☆'.repeat(3 - q.difficulty)}</span></div>
        <p class="m-q__text">${esc(q.q)}</p>
      </section>
      <div class="m-choices" role="group" aria-label="選択肢">
        ${q.choices.map((c, k) => {
          let st = '';
          if (revealed) st = k === q.answer ? 'ok' : k === a.choice ? 'ng' : 'dim';
          return `<button class="m-choice ${st}" data-choice="${k}" ${revealed ? 'disabled' : ''}><span class="key">${'ABCD'[k]}</span><span class="txt">${esc(c)}</span>${revealed && k === q.answer ? '<span class="mark">正解</span>' : ''}</button>`;
        }).join('')}
      </div>
      ${revealed ? `<section class="m-reveal">
        <div class="m-reveal__row">
          <span class="res ${a.correct ? 'ok' : 'ng'}">${a.correct ? `正解 +${a.points}` : a.time == null ? '時間切れ' : '不正解'}</span>
          <span class="t">${a.time != null ? a.time.toFixed(1) + '秒' : ''}</span>
          <span class="opp">${esc(m.opp.name)}：${o.correct ? `正解 +${o.points}` : o.time == null ? '時間切れ' : '不正解'}${o.time != null ? ' · ' + o.time.toFixed(1) + '秒' : ''}</span>
        </div>
        <p class="m-reveal__exp"><b>解説</b>${esc(q.explain)}</p>
        <button class="btn btn--main js-next" data-action="next">${m.i + 1 >= m.qs.length ? '結果を見る' : '次の問題'}<kbd>Enter</kbd></button>
      </section>` : ''}
      ${NavLine(ctx, m.navLine, m.navExpr)}
    </div>`;
  }

  const LobbyView = (m, ctx) => `<div class="match-screen phase-lobby">
    <header class="m-head"><button class="link" data-action="exit">← ホーム</button><span class="eyebrow">RANK MATCH</span></header>
    <h1 class="m-title">ランクマッチ</h1>
    <section class="m-panel">
      <h2 class="panel__title">出場科目</h2>
      <div class="m-subjects">${SUBJECTS.map((s) => `<button class="m-subject" data-subject="${s}" aria-pressed="${s === m.subject}">${s}</button>`).join('')}</div>
    </section>
    <section class="m-panel m-rules">
      <h2 class="panel__title">ルール</h2>
      <ul>
        <li><b>${RULES.questions}問</b>の早押し4択。1問<b>${RULES.seconds}秒</b></li>
        <li>正解 <b>${RULES.base}点</b>＋残り1秒ごとに<b>${RULES.speedPerSec}点</b></li>
        <li>${RULES.comboAt}問連続正解から<b>コンボ +${RULES.comboBonus}</b></li>
        <li>勝つとRPアップ、負けるとダウン。毎問すぐ解説が出ます</li>
      </ul>
      <p class="muted">想定対戦相手：${esc(ctx.rankLabel)} 前後 ・ キー操作：1〜4 / Enter</p>
    </section>
    ${NavLine(ctx, ctx.char.lines.match, 'serious')}
    <button class="btn btn--main" data-action="search">マッチング開始</button>
  </div>`;

  const SearchView = (m, ctx) => `<div class="match-screen phase-search">
    <div class="m-radar ${m.opp ? 'found' : ''}" aria-hidden="true"><i></i><i></i><i></i></div>
    ${m.opp ? `<div class="m-vs">
        <div class="m-vs__me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face portrait--vs' })}<b>${esc(ctx.player.name)}</b><small>${esc(ctx.rankLabel)} · ${esc(m.subject)}</small></div>
        <span class="m-vs__x">VS</span>
        <div class="m-vs__op"><span class="m-vs__anon">${esc(m.opp.name.slice(0, 1))}</span><b>${esc(m.opp.name)}</b><small>${esc(m.opp.rank)}</small></div>
      </div>
      <div class="m-count js-count">${m.count || ''}</div>`
    : `<p class="m-searching">対戦相手を検索中<span>…</span></p><p class="muted">${esc(m.subject)} ・ ${esc(ctx.rankLabel)} 帯</p>`}
    ${NavLine(ctx, ctx.char.lines.match, 'serious')}
  </div>`;

  function ResultView(m, ctx) {
    const r = m.result, b = m.ranks.before, af = m.ranks.after;
    const ev = r.win ? 'win' : 'lose', ex = exprFor(ctx.char, ev);
    const promoted = af.label !== b.label;
    return `<div class="match-screen phase-result ${r.win ? 'is-win' : 'is-lose'}">
      <header class="r-head">
        <span class="eyebrow">RANK MATCH RESULT · ${esc(r.subject)}</span>
        <strong>${r.win ? 'WIN' : 'LOSE'}</strong>
        <span class="r-score">${r.score} <small>vs</small> ${r.oppScore}</span>
      </header>
      <section class="r-rank holo-panel">
        <div class="rank__badge"><b>${esc(af.label)}</b><small>RANK</small></div>
        <div class="rank__body">
          <div class="r-rp"><b class="js-rp" data-from="${b.rp}" data-to="${af.rp}">${b.rp.toLocaleString('ja-JP')}</b> RP <span class="delta ${r.rp >= 0 ? 'up' : 'down'}">${r.rp >= 0 ? '+' : ''}${r.rp}</span></div>
          <div class="bar"><i class="js-gauge" style="width:${b.pct}%" data-to="${af.pct}"></i></div>
          <span class="rank__meta">${promoted ? `<b class="promo">${esc(af.label)} に昇格！</b>` : af.next ? `${esc(af.next)} 昇格まで <b>${(af.nextAt - af.rp).toLocaleString('ja-JP')}</b> RP` : '最高ランク'} · EXP +${r.exp}</span>
        </div>
      </section>
      <div class="r-stats">
        <div><b>${r.correct}<small>/${r.total}</small></b><span>正答</span></div>
        <div><b>${r.avg}<small>秒</small></b><span>平均解答</span></div>
        <div><b>${r.maxStreak}</b><span>最大コンボ</span></div>
      </div>
      ${NavLine(ctx, fmt(ctx.char.matchLines[ev], { unit: r.weakUnit || '' }), ex)}
      <section class="r-review holo-panel">
        <div class="missions__head"><span class="eyebrow">REVIEW</span>${r.weakUnit ? `<span class="muted">苦手判定：<b class="warn">${esc(r.weakUnit)}</b></span>` : '<span class="muted">全問正解！</span>'}</div>
        <ol>${m.qs.map((q, k) => { const a = m.me.answers[k]; return `<li class="${a.correct ? 'ok' : 'ng'}"><span class="mk">${a.correct ? '○' : '×'}</span><span class="u">${esc(q.unit)}</span><span class="qq">${esc(q.q)}</span><span class="t">${a.time != null ? a.time.toFixed(1) + 's' : '—'}</span></li>`; }).join('')}</ol>
      </section>
      <div class="r-actions">
        <button class="btn btn--sub" data-action="exit">ホームへ</button>
        <button class="btn btn--main" data-action="again">もう一戦</button>
      </div>
    </div>`;
  }

  /* ================= 進行 ================= */
  let m = null, ctx = null, root = null, tick = null, timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const clearAll = () => { clearInterval(tick); tick = null; timers.forEach(clearTimeout); timers = []; };
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw() {
    const v = { lobby: LobbyView, search: SearchView, question: QuestionView, result: ResultView }[m.phase];
    root.innerHTML = `<div class="screen screen--match">${v(m, ctx)}</div>`;
    if (m.phase === 'result') animateResult();
    const nx = root.querySelector('.js-next'); if (nx) nx.focus({ preventScroll: true });
  }

  function newMatch(subject) {
    m = { phase: 'lobby', subject: subject || (m && m.subject) || ctx.defaultSubject || '数学', opp: null, qs: [], i: 0,
      me: { score: 0, streak: 0, maxStreak: 0, answers: [] }, op: { score: 0, streak: 0, correct: 0, answers: [] },
      navLine: '', navExpr: 'serious' };
  }

  function search() {
    m.phase = 'search'; m.opp = null; draw();
    later(() => {
      m.opp = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
      m.qs = buildQuestions(ctx.bank, m.subject);
      m.count = 3; draw();
      const step = () => { m.count--; const el = root.querySelector('.js-count'); if (m.count > 0) { if (el) el.textContent = m.count; later(step, 700); } else start(); };
      later(step, reduce() ? 300 : 900);
    }, reduce() ? 300 : 1400);
  }

  function start() { m.phase = 'question'; m.i = 0; ask(); }

  function ask() {
    m.navLine = m.i === 0 ? ctx.char.lines.match : m.navLine;
    m.t0 = performance.now();
    draw();
    clearInterval(tick);
    tick = setInterval(() => {
      const el = (performance.now() - m.t0) / 1000, left = Math.max(0, RULES.seconds - el);
      const bar = root.querySelector('.js-bar'), sec = root.querySelector('.js-sec');
      if (bar) { bar.style.width = (left / RULES.seconds) * 100 + '%'; bar.classList.toggle('low', left < 5); }
      if (sec) sec.textContent = Math.ceil(left);
      if (left <= 0) answer(null);
    }, 100);
  }

  function answer(choice) {
    if (m.phase !== 'question' || m.me.answers[m.i]) return;
    clearInterval(tick);
    const q = m.qs[m.i];
    const time = choice == null ? null : Math.min(RULES.seconds, +((performance.now() - m.t0) / 1000).toFixed(1));
    const correct = choice === q.answer;
    m.me.streak = correct ? m.me.streak + 1 : 0;
    m.me.maxStreak = Math.max(m.me.maxStreak, m.me.streak);
    const pts = points(correct, time, m.me.streak);
    m.me.score += pts;
    m.me.answers[m.i] = { choice, correct, time, points: pts };

    const o = simulateOpponent(m.opp, q);
    m.op.streak = o.correct ? m.op.streak + 1 : 0;
    o.points = points(o.correct, o.time, m.op.streak);
    m.op.score += o.points; if (o.correct) m.op.correct++;
    m.op.answers[m.i] = o;

    const ev = choice == null ? 'timeout' : !correct ? 'wrong' : m.me.streak >= RULES.comboAt ? 'streak' : 'correct';
    m.navExpr = exprFor(ctx.char, ev);
    m.navLine = fmt(ctx.char.matchLines[ev], { t: time != null ? time.toFixed(1) : '', n: m.me.streak, unit: q.unit });
    draw();
    if (ev === 'streak') cutIn(`COMBO ×${m.me.streak}`, m.navLine);
  }

  function next() {
    if (m.phase !== 'question' || !m.me.answers[m.i]) return;
    if (m.i + 1 < m.qs.length) { m.i++; ask(); return; }
    m.result = summarize(m);
    m.ranks = ctx.applyResult(m.result);
    m.phase = 'result'; draw();
  }

  function cutIn(title, line) {
    if (reduce()) return;
    const el = document.createElement('div');
    el.className = 'cutin';
    el.innerHTML = `${UI.Portrait({ char: ctx.char, expr: 'smile', cls: 'portrait--cut' })}<div class="cutin__txt"><strong>${esc(title)}</strong><small>${esc(line)}</small></div>`;
    document.body.appendChild(el);
    later(() => el.remove(), 1700);
  }

  function animateResult() {
    if (reduce()) { const rp = root.querySelector('.js-rp'); if (rp) rp.textContent = (+rp.dataset.to).toLocaleString('ja-JP'); const g = root.querySelector('.js-gauge'); if (g) g.style.width = g.dataset.to + '%'; return; }
    const rp = root.querySelector('.js-rp'), g = root.querySelector('.js-gauge');
    const from = +rp.dataset.from, to = +rp.dataset.to, t0 = performance.now();
    later(() => { g.style.width = g.dataset.to + '%'; }, 300);
    const step = (now) => { const p = Math.min(1, (now - t0 - 300) / 900); if (p >= 0) rp.textContent = Math.round(from + (to - from) * p).toLocaleString('ja-JP'); if (p < 1 && m && m.phase === 'result') requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !m) return;
    if (b.dataset.subject) { m.subject = b.dataset.subject; draw(); return; }
    if (b.dataset.choice != null) { answer(+b.dataset.choice); return; }
    switch (b.dataset.action) {
      case 'search': search(); break;
      case 'next': next(); break;
      case 'again': clearAll(); newMatch(m.subject); search(); break;
      case 'exit': unmount(); ctx.exit(); break;
    }
  }
  function onKey(e) {
    if (!m || !root || !root.querySelector('.screen--match')) return;
    if (m.phase === 'question' && !m.me.answers[m.i]) {
      const k = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()];
      if (k != null) { e.preventDefault(); answer(k); }
    } else if (m.phase === 'question' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
  }

  function mount(r, c) {
    unmount(); root = r; ctx = c; newMatch(c.defaultSubject);
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    draw();
  }
  function unmount() {
    clearAll();
    document.querySelectorAll('.cutin').forEach((el) => el.remove());
    if (root) root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    m = null; root = null;
  }

  window.Match = { mount, unmount, RULES, buildQuestions, points, summarize };
})();
