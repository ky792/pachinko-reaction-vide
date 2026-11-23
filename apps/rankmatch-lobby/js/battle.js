/* ランクマッチ（非同期PvP・自動戦闘）
 * 相手は「防衛データ」（学力ステータス・ナビ・主戦場・陣地の並び）。リアルタイムの対人操作はない。
 * 5科目の陣地を順に取り合い、先に3つ取ったほうが勝ち。各陣地は 速さ→正確さ→応用 の3回の押し合いで決まる。
 * ctx = { D, player, type, char, opponents, rankLabel, applyBattle(result) → {before, after}, train(subject), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc;

  /* ================= ルール（純関数） ================= */
  const SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
  const AXES = ['speed', 'acc', 'app'];
  const AXL = { speed: '速さ', acc: '正確さ', app: '応用' };
  const RULE = { focus: 1.10, variance: 0.36, push: 1.6, toWin: 3 };

  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const power = (st) => st.speed + st.acc + st.app;
  const totalPower = (stats) => SUBJECTS.reduce((s, k) => s + power(stats[k]), 0);
  const pick = (stats, cmp) => SUBJECTS.reduce((a, b) => (cmp(power(stats[b]), power(stats[a])) ? b : a));
  const strongest = (stats) => pick(stats, (x, y) => x > y);
  const weakest = (stats) => pick(stats, (x, y) => x < y);

  /* 陣地ごとの補正。notes は画面に出す「発動した効果」 */
  function modifiers(side, enemy, subject, idx, lost) {
    const m = { speed: 1, acc: 1, app: 1 }, notes = [];
    const all = (k, label) => { AXES.forEach((a) => (m[a] *= k)); notes.push(label); };
    if (subject === side.focus) all(RULE.focus, '主戦場 +10%');
    switch (side.navType) {
      case 'logic': if (subject === weakest(side.stats)) all(1.12, '最適配分 +12%'); break;
      case 'halo': if (lost >= 1) all(1.06, '立て直し +6%'); break;
      case 'ignite': if (idx < 2) { m.speed *= 1.3; notes.push('先手必勝 速さ+30%'); } break;
      case 'echo': m.app *= 1.12; notes.push('多角思考 応用+12%'); break;
    }
    if (enemy.navType === 'vex' && subject === strongest(side.stats)) all(0.88, '狙い撃ち −12%');
    return { m, notes };
  }

  function resolveBattle(me, op, seed) {
    const r = mulberry32(seed);
    const areas = []; let myW = 0, opW = 0;
    op.order.forEach((subject, idx) => {
      if (myW >= RULE.toWin || opW >= RULE.toWin) { areas.push({ subject, skipped: true }); return; }
      const mm = modifiers(me, op, subject, idx, opW), om = modifiers(op, me, subject, idx, myW);
      let gauge = 0; const ex = [];
      AXES.forEach((axis) => {
        const a = me.stats[subject][axis] * mm.m[axis] * (1 + (r() - 0.5) * RULE.variance);
        const b = op.stats[subject][axis] * om.m[axis] * (1 + (r() - 0.5) * RULE.variance);
        const d = (a - b) * RULE.push;
        gauge = Math.max(-100, Math.min(100, gauge + d));
        ex.push({ axis, a: Math.round(a), b: Math.round(b), d: Math.round(d), gauge: Math.round(gauge) });
      });
      const win = gauge > 0 || (gauge === 0 && ex[1].a >= ex[1].b);
      win ? myW++ : opW++;
      areas.push({ subject, idx, ex, gauge: Math.round(gauge), win, notesMe: mm.notes, notesOp: om.notes });
    });
    return { areas, myW, opW, win: myW >= RULE.toWin };
  }

  function winRate(me, op, n = 400) {
    let w = 0; for (let i = 1; i <= n; i++) if (resolveBattle(me, op, i * 7919).win) w++;
    return Math.round((w / n) * 100);
  }

  /* 敗因：落とした陣地で最も押し負けた能力 */
  function analyze(res) {
    const lost = res.areas.filter((a) => !a.skipped && !a.win).map((a) => {
      const worst = a.ex.reduce((x, y) => (y.d < x.d ? y : x));
      return { subject: a.subject, axis: worst.axis, a: worst.a, b: worst.b };
    });
    const won = res.areas.filter((a) => !a.skipped && a.win).sort((x, y) => y.gauge - x.gauge)[0];
    return { lost, mvp: won ? won.subject : null, weak: lost[0] || null };
  }

  /* ================= 表示部品 ================= */
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  const navOf = (D, nav) => { const t = D.types.find((x) => x.id === nav.type); return { type: t, char: t.characters[nav.gender] }; };
  const exprLabel = (D, char, e) => (char.expressionLabels && char.expressionLabels[e]) || D.expressions[e] || '';

  const NavLine = (ctx, line, expr = 'default') => `<div class="m-nav" aria-live="polite">
    ${UI.Portrait({ char: ctx.char, expr, cls: 'portrait--face portrait--mnav' })}
    <div class="m-nav__bubble"><b>${esc(ctx.char.name)}<em>${esc(exprLabel(ctx.D, ctx.char, expr))}</em></b><p>${esc(line)}</p></div>
  </div>`;

  const Tiles = (b, res, upto) => `<div class="a-tiles">${b.op.order.map((s, k) => {
    const a = res && res.areas[k];
    let st = 'pending';
    if (a && k < upto) st = a.skipped ? 'none' : a.win ? 'me' : 'op';
    if (k === upto && b.phase === 'battle') st = 'active';
    return `<div class="a-tile ${st}"><span class="a-tile__s">${esc(s)}</span><small>${st === 'me' ? '確保' : st === 'op' ? '敵陣' : st === 'none' ? '—' : st === 'active' ? '交戦中' : `第${k + 1}陣`}</small>${s === b.focus ? '<i class="focus" title="あなたの主戦場">★</i>' : ''}${s === b.op.focus ? '<i class="ofocus" title="相手の主戦場">◆</i>' : ''}</div>`;
  }).join('')}</div>`;

  function PickView(b, ctx) {
    const p = ctx.player, t = p.tickets, can = t.now > 0;
    return `<div class="match-screen phase-pick">
      <header class="m-head"><button class="link" data-action="exit">← ホーム</button><span class="eyebrow">RANK MATCH · ASYNC PvP</span></header>
      <h1 class="m-title">挑戦する相手を選ぶ</h1>
      <p class="a-lede">相手が残した<b>防衛データ</b>と、あなたの<b>学力ステータス</b>で自動戦闘します。5科目の陣地を先に3つ取ったほうが勝ち。</p>
      <div class="a-tickets"><span>挑戦権</span>${Array.from({ length: t.max }, (_, k) => `<i class="${k < t.now ? 'on' : ''}"></i>`).join('')}<b>${t.now}/${t.max}</b><small>演習1セットで1回復</small></div>
      ${can ? '' : `<div class="a-empty">挑戦権がありません。演習で学力を上げると、挑戦権も1回復します。<button class="btn btn--sub" data-action="train">演習する</button></div>`}
      <div class="a-cands">${b.cands.map((o) => {
        const n = navOf(ctx.D, o.nav), pw = totalPower(o.stats), mine = totalPower(p.stats);
        const diff = pw - mine;
        return `<button class="a-cand" data-op="${o.id}" ${can ? '' : 'disabled'} style="--oc:${n.type.color}">
          ${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--cand' })}
          <span class="a-cand__main"><b>${esc(o.name)}</b><small>${esc(o.rank)} · ${o.rp.toLocaleString('ja-JP')} RP · NAV ${esc(n.char.name)}（${n.type.name}）</small>
            <span class="a-mini">${SUBJECTS.map((s) => `<i style="--v:${Math.round(power(o.stats[s]) / 3)}%" title="${s}"><em>${s.slice(0, 1)}</em></i>`).join('')}</span></span>
          <span class="a-cand__side"><b>${pw.toLocaleString('ja-JP')}</b><small class="${diff > 0 ? 'hi' : diff < 0 ? 'lo' : ''}">${diff > 0 ? '格上 +' + diff : diff < 0 ? '格下 ' + diff : '互角'}</small><small>勝 +${o.reward.win} / 負 ${o.reward.lose}</small></span>
        </button>`;
      }).join('')}</div>
      <button class="link a-refresh" data-action="refresh">相手を入れ替える</button>
      ${NavLine(ctx, ctx.char.lines.match, 'default')}
    </div>`;
  }

  function PlanView(b, ctx) {
    const o = b.op, n = navOf(ctx.D, o.nav), mt = ctx.type;
    const me = { stats: ctx.player.stats, navType: mt.id, focus: b.focus };
    const rate = winRate(me, { stats: o.stats, navType: o.nav.type, focus: o.focus, order: o.order });
    const line = fmt(ctx.char.battleLines.start, { rate, focus: b.focus });
    return `<div class="match-screen phase-plan" style="--oc:${b.oc}">
      <header class="m-head"><button class="link" data-action="back">← 相手を選び直す</button><span class="eyebrow">作戦</span></header>
      <div class="a-vs">
        <div class="a-vs__side me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face portrait--vs' })}<b>${esc(ctx.player.name)}</b><small>${esc(ctx.rankLabel)} · 学力 ${totalPower(ctx.player.stats).toLocaleString('ja-JP')}</small></div>
        <div class="a-rate"><span>勝率予測</span><b>${rate}<small>%</small></b></div>
        <div class="a-vs__side op">${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--vs portrait--op' })}<b>${esc(o.name)}</b><small>${esc(o.rank)} · 学力 ${totalPower(o.stats).toLocaleString('ja-JP')}</small></div>
      </div>
      <section class="m-panel">
        <h2 class="panel__title">陣地と戦力（相手の防衛順）</h2>
        <div class="a-compare">${o.order.map((s, k) => {
          const a = power(ctx.player.stats[s]), c = power(o.stats[s]);
          return `<button class="a-row ${s === b.focus ? 'is-focus' : ''}" data-focus="${s}" aria-pressed="${s === b.focus}">
            <span class="no">${k + 1}</span><span class="s">${esc(s)}${s === o.focus ? '<i class="ofocus">◆</i>' : ''}</span>
            <span class="v me">${a}</span>
            <span class="duel"><i class="l" style="width:${(a / (a + c)) * 100}%"></i></span>
            <span class="v op">${c}</span>
            <span class="adv ${a > c ? 'up' : a < c ? 'down' : ''}">${a > c ? '優勢' : a < c ? '劣勢' : '互角'}</span>
          </button>`;
        }).join('')}</div>
        <p class="muted">タップで<b>主戦場（★ 全能力 +10%）</b>を選択。◆は相手の主戦場。</p>
      </section>
      <section class="a-tactics">
        <div class="a-tac me"><span class="eyebrow">あなたのナビ戦術</span><b>${UI.Emblem(mt.emblem)}${esc(mt.tactic.name)}</b><small>${esc(mt.tactic.desc)}</small></div>
        <div class="a-tac op"><span class="eyebrow">相手のナビ戦術</span><b>${UI.Emblem(n.type.emblem)}${esc(n.type.tactic.name)}</b><small>${esc(n.type.tactic.desc)}</small></div>
      </section>
      ${NavLine(ctx, line, 'serious')}
      <button class="btn btn--main" data-action="fight">挑戦権を1つ使って開戦</button>
    </div>`;
  }

  function BattleView(b, ctx) {
    const res = b.res, n = navOf(ctx.D, b.op.nav);
    const area = res.areas[b.ai], shown = area && area.ex ? area.ex.slice(0, b.ei) : [];
    const g = shown.length ? shown[shown.length - 1].gauge : 0;
    const myW = res.areas.slice(0, b.ai).filter((a) => a.win).length + (b.areaDone && area.win ? 1 : 0);
    const opW = res.areas.slice(0, b.ai).filter((a) => !a.skipped && !a.win).length + (b.areaDone && !area.win ? 1 : 0);
    return `<div class="match-screen phase-battle" style="--oc:${b.oc}">
      <div class="a-score">
        <div class="me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face' })}<span>${esc(ctx.player.name)}</span><b>${myW}</b></div>
        <span class="dash">陣地</span>
        <div class="op"><b>${opW}</b><span>${esc(b.op.name)}</span>${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--op' })}</div>
      </div>
      ${Tiles(b, res, b.areaDone ? b.ai + 1 : b.ai)}
      <section class="a-arena ${b.areaDone ? (area.win ? 'won' : 'lost') : ''}">
        <div class="a-arena__head"><span class="eyebrow">第${b.ai + 1}陣</span><h2>${esc(area.subject)}</h2>${b.areaDone ? `<span class="a-capture">${area.win ? '陣地確保' : '陣地を奪われた'}</span>` : ''}</div>
        <div class="a-tug" aria-label="陣地ゲージ"><i class="mine" style="width:${50 + g / 2}%"></i><span class="mark" style="left:${50 + g / 2}%"></span><em class="c"></em></div>
        <div class="a-notes">${area.notesMe.map((x) => `<span class="me">${esc(x)}</span>`).join('')}${area.notesOp.map((x) => `<span class="op">相手：${esc(x)}</span>`).join('')}</div>
        <ol class="a-ex">${AXES.map((ax, k) => {
          const e = shown[k];
          if (!e) return `<li class="wait"><span class="ax">${AXL[ax]}</span><span class="dots">· · ·</span></li>`;
          return `<li class="${e.d >= 0 ? 'up' : 'down'}"><span class="ax">${AXL[ax]}</span><b class="a">${e.a}</b><span class="vs">vs</span><b class="b">${e.b}</b><span class="d">${e.d >= 0 ? '押し込み +' + e.d : '押し返され ' + e.d}</span></li>`;
        }).join('')}</ol>
      </section>
      ${NavLine(ctx, b.line, b.expr)}
      <div class="a-controls"><button class="btn btn--sub" data-action="speed">${b.fast ? '通常速度' : '2倍速'}</button><button class="btn btn--sub" data-action="skip">結果まで飛ばす</button></div>
    </div>`;
  }

  function ResultView(b, ctx) {
    const res = b.res, an = b.analysis, r = b.ranks, rpd = res.win ? b.op.reward.win : b.op.reward.lose;
    const ev = res.win ? 'win' : 'lose';
    const weak = an.weak ? `${an.weak.subject}の${AXL[an.weak.axis]}` : '';
    const line = fmt(ctx.char.battleLines[ev], { weak });
    const promoted = r.after.label !== r.before.label;
    return `<div class="match-screen phase-result ${res.win ? 'is-win' : 'is-lose'}" style="--oc:${b.oc}">
      <header class="r-head"><span class="eyebrow">RANK MATCH RESULT · VS ${esc(b.op.name)}</span><strong>${res.win ? 'WIN' : 'LOSE'}</strong><span class="r-score">${res.myW} <small>陣地</small> ${res.opW}</span></header>
      ${Tiles(b, res, 5)}
      <section class="r-rank holo-panel">
        <div class="rank__badge"><b>${esc(r.after.label)}</b><small>RANK</small></div>
        <div class="rank__body">
          <div class="r-rp"><b class="js-rp" data-from="${r.before.rp}" data-to="${r.after.rp}">${r.before.rp.toLocaleString('ja-JP')}</b> RP <span class="delta ${rpd >= 0 ? 'up' : 'down'}">${rpd >= 0 ? '+' : ''}${rpd}</span></div>
          <div class="bar"><i class="js-gauge" style="width:${r.before.pct}%" data-to="${r.after.pct}"></i></div>
          <span class="rank__meta">${promoted ? `<b class="promo">${esc(r.after.label)} に昇格！</b>` : r.after.next ? `${esc(r.after.next)} 昇格まで <b>${(r.after.nextAt - r.after.rp).toLocaleString('ja-JP')}</b> RP` : '最高ランク'} · 挑戦権 残り${ctx.player.tickets.now}</span>
        </div>
      </section>
      ${NavLine(ctx, line, res.win ? 'smile' : 'serious')}
      <section class="r-review holo-panel">
        <div class="missions__head"><span class="eyebrow">戦況分析</span>${an.mvp ? `<span class="muted">MVP陣地：<b>${esc(an.mvp)}</b></span>` : ''}</div>
        ${an.lost.length ? `<ul class="a-why">${an.lost.map((l) => `<li><span><b>${esc(l.subject)}</b>：${AXL[l.axis]}で押し負け <em>${l.a} vs ${l.b}</em></span><button class="btn btn--sub" data-action="train" data-subject="${esc(l.subject)}">${esc(l.subject)}を演習</button></li>`).join('')}</ul>` : '<p class="muted">落とした陣地はありません。完全勝利です。</p>'}
      </section>
      <div class="r-actions">
        <button class="btn btn--sub" data-action="exit">ホームへ</button>
        <button class="btn btn--main" data-action="again" ${ctx.player.tickets.now > 0 ? '' : 'disabled'}>${ctx.player.tickets.now > 0 ? '別の相手に挑戦' : '挑戦権なし'}</button>
      </div>
    </div>`;
  }

  /* ================= 進行 ================= */
  let b = null, ctx = null, root = null, timer = null;
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stop = () => { clearTimeout(timer); timer = null; };

  function draw() {
    const v = { pick: PickView, plan: PlanView, battle: BattleView, result: ResultView }[b.phase];
    root.innerHTML = `<div class="screen screen--match">${v(b, ctx)}</div>`;
    if (b.phase === 'result') animateResult();
  }

  function candidates() {
    const rp = ctx.player.rank.rp;
    const pool = ctx.opponents.slice().sort(() => Math.random() - 0.5);
    const lower = pool.filter((o) => o.rp < rp - 50), near = pool.filter((o) => Math.abs(o.rp - rp) <= 120), upper = pool.filter((o) => o.rp > rp + 50);
    const out = []; [lower, near, upper].forEach((g) => { const o = g.find((x) => !out.includes(x)); if (o) out.push(o); });
    pool.forEach((o) => { if (out.length < 3 && !out.includes(o)) out.push(o); });
    return out.sort((x, y) => x.rp - y.rp);
  }

  function choose(id) {
    const o = ctx.opponents.find((x) => x.id === id);
    const n = navOf(ctx.D, o.nav);
    b.op = o; b.oc = n.type.id === ctx.type.id ? '#D9DFEF' : n.type.color;
    b.focus = ctx.player.focus; b.phase = 'plan'; draw();
  }

  function fight() {
    if (ctx.player.tickets.now <= 0) return;
    const me = { stats: ctx.player.stats, navType: ctx.type.id, focus: b.focus };
    const op = { stats: b.op.stats, navType: b.op.nav.type, focus: b.op.focus, order: b.op.order };
    b.res = resolveBattle(me, op, Math.floor(Math.random() * 1e9));
    b.analysis = analyze(b.res);
    b.ranks = ctx.applyBattle({ win: b.res.win, rp: b.res.win ? b.op.reward.win : b.op.reward.lose, focus: b.focus, opName: b.op.name });
    b.phase = 'battle'; b.ai = 0; b.ei = 0; b.areaDone = false;
    b.line = ctx.char.catch; b.expr = 'serious';
    draw(); schedule();
  }

  function schedule() {
    stop();
    const base = reduce() ? 250 : b.fast ? 380 : 800;
    timer = setTimeout(step, b.areaDone ? base * 1.6 : base);
  }

  function step() {
    const area = b.res.areas[b.ai];
    if (b.areaDone) {
      b.ai++; b.ei = 0; b.areaDone = false;
      if (b.ai >= b.res.areas.length || b.res.areas[b.ai].skipped) { finish(); return; }
      draw(); schedule(); return;
    }
    if (b.ei < 3) { b.ei++; draw(); schedule(); return; }
    b.areaDone = true;
    const ev = area.win ? 'areaWin' : 'areaLose';
    b.line = fmt(ctx.char.battleLines[ev], { subject: area.subject });
    b.expr = area.win ? 'smile' : 'special';
    draw(); schedule();
  }

  function finish() { stop(); b.phase = 'result'; draw(); }

  function animateResult() {
    const rp = root.querySelector('.js-rp'), g = root.querySelector('.js-gauge'); if (!rp) return;
    if (reduce()) { rp.textContent = (+rp.dataset.to).toLocaleString('ja-JP'); g.style.width = g.dataset.to + '%'; return; }
    const from = +rp.dataset.from, to = +rp.dataset.to, t0 = performance.now();
    setTimeout(() => { g.style.width = g.dataset.to + '%'; }, 300);
    const tick = (now) => { const p = Math.min(1, (now - t0 - 300) / 900); if (p >= 0) rp.textContent = Math.round(from + (to - from) * p).toLocaleString('ja-JP'); if (p < 1 && b && b.phase === 'result') requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  function onClick(e) {
    const t = e.target.closest('button'); if (!t || !b) return;
    if (t.dataset.op) { choose(t.dataset.op); return; }
    if (t.dataset.focus) { b.focus = t.dataset.focus; draw(); return; }
    switch (t.dataset.action) {
      case 'refresh': b.cands = candidates(); draw(); break;
      case 'back': b.phase = 'pick'; draw(); break;
      case 'fight': fight(); break;
      case 'speed': b.fast = !b.fast; draw(); schedule(); break;
      case 'skip': finish(); break;
      case 'again': b = { phase: 'pick', cands: candidates(), fast: b.fast }; draw(); break;
      case 'train': { const s = t.dataset.subject; unmount(); ctx.train(s); break; }
      case 'exit': unmount(); ctx.exit(); break;
    }
  }

  function mount(r, c) {
    unmount(); root = r; ctx = c;
    b = { phase: 'pick', cands: candidates(), fast: false };
    root.addEventListener('click', onClick);
    draw();
  }
  function unmount() { stop(); if (root) root.removeEventListener('click', onClick); b = null; root = null; }

  window.Battle = { mount, unmount, resolveBattle, winRate, analyze, totalPower, power, SUBJECTS, AXL };
})();
