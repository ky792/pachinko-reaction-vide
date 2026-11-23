/* ランクマッチ（非同期PvP）
 *  自動戦闘：相手の防衛データ（単元ごとの知識データ＋主戦場＋陣地の並び）と、自分の知識データで戦う。
 *    5科目の陣地を相手の防衛順に取り合い、先に3つ取ったほうが勝ち。
 *    各陣地は「単元Aの正確さ → 単元Bの速さ → 科目の応用」の3回の押し合い。単元は両者共通で抽選。
 *  直接対決：自動戦闘で落とした陣地に納得できなければ、その科目の同じ5問を両者が解いて決め直す。
 *    勝てば陣地を奪還し、結果がひっくり返ることもある。1試合につき1回。
 *  ナビのタイプは強さに影響しない（提案の視点が違うだけ）。
 * ctx = { D, player, type, char, opponents, bank, rankLabel, now(), myK(), opK(o), opStats(o), applyBattle(r), overturn(r),
 *         recordAnswer(q, ans), train(subject, units), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;

  /* ================= ルール（純関数） ================= */
  const SUBJECTS = KN.SUBJECTS;
  const AXL = { speed: '速さ', acc: '正確さ', app: '応用' };
  const RULE = { focus: 1.10, variance: 0.36, push: 1.6, toWin: 3, duelQ: 5, duelSec: 30 };

  const power = (st) => st.speed + st.acc + st.app;
  const totalPower = (S) => SUBJECTS.reduce((s, k) => s + power(S[k]), 0);
  const pick = (S, cmp) => SUBJECTS.reduce((a, b) => (cmp(power(S[b]), power(S[a])) ? b : a));
  const strongest = (S) => pick(S, (x, y) => x > y);
  const weakest = (S) => pick(S, (x, y) => x < y);

  function resolveArea(me, op, subject, idx, r, now) {
    const units = KN.units()[subject] || [];
    const u1 = units[Math.floor(r() * units.length)];
    let u2 = units[Math.floor(r() * units.length)];
    if (units.length > 1) while (u2 === u1) u2 = units[Math.floor(r() * units.length)];
    const fm = me.focus === subject ? RULE.focus : 1, fo = op.focus === subject ? RULE.focus : 1;
    const vr = () => 1 + (r() - 0.5) * RULE.variance;
    const raw = [
      { axis: 'acc', unit: u1, a: KN.unitValue(me.K, subject, u1, 'acc', now), b: KN.unitValue(op.K, subject, u1, 'acc', now) },
      { axis: 'speed', unit: u2, a: KN.unitValue(me.K, subject, u2, 'speed', now), b: KN.unitValue(op.K, subject, u2, 'speed', now) },
      { axis: 'app', unit: null, a: me.S[subject].app, b: op.S[subject].app },
    ];
    let gauge = 0;
    const ex = raw.map((e) => {
      const a = e.a * fm * vr(), b = e.b * fo * vr(), d = (a - b) * RULE.push;
      gauge = Math.max(-100, Math.min(100, gauge + d));
      return { axis: e.axis, unit: e.unit, a: Math.round(a), b: Math.round(b), d: Math.round(d), gauge: Math.round(gauge) };
    });
    const notesMe = me.focus === subject ? ['主戦場 +10%'] : [], notesOp = op.focus === subject ? ['主戦場 +10%'] : [];
    return { subject, idx, ex, gauge: Math.round(gauge), win: gauge > 0 || (gauge === 0 && ex[0].a >= ex[0].b), notesMe, notesOp };
  }

  function resolveBattle(me, op, seed, now) {
    const r = KN.rng(seed), areas = []; let myW = 0, opW = 0;
    op.order.forEach((subject, idx) => {
      if (myW >= RULE.toWin || opW >= RULE.toWin) { areas.push({ subject, idx, skipped: true }); return; }
      const a = resolveArea(me, op, subject, idx, r, now);
      a.win ? myW++ : opW++; areas.push(a);
    });
    return { areas, myW, opW, win: myW >= RULE.toWin, seed };
  }
  function winRate(me, op, now, n = 300) {
    let w = 0; for (let i = 1; i <= n; i++) if (resolveBattle(me, op, i * 7919, now).win) w++;
    return Math.round((w / n) * 100);
  }
  function tally(res) {
    res.myW = res.areas.filter((a) => !a.skipped && a.win).length;
    res.opW = res.areas.filter((a) => !a.skipped && !a.win).length;
    res.win = res.myW >= RULE.toWin;
  }
  function analyze(res) {
    const lost = res.areas.filter((a) => !a.skipped && !a.win).map((a) => {
      const w = a.ex.reduce((x, y) => (y.d < x.d ? y : x));
      return { subject: a.subject, unit: w.unit, axis: w.axis, a: w.a, b: w.b, units: a.ex.filter((e) => e.unit).map((e) => e.unit) };
    });
    const won = res.areas.filter((a) => !a.skipped && a.win).sort((x, y) => y.gauge - x.gauge)[0];
    return { lost, mvp: won ? won.subject : null, weak: lost[0] || null };
  }

  /* ナビの提案：同じ情報を性格ごとの視点で読むだけ */
  const ADVICE = {
    logic: (me, op, now) => op.order.reduce((best, s) => (winRate(Object.assign({}, me, { focus: s }), op, now, 150) > winRate(Object.assign({}, me, { focus: best }), op, now, 150) ? s : best)),
    halo: (me) => weakest(me.S),
    ignite: (me, op) => op.order[0],
    vex: (me, op) => strongest(op.S),
    echo: (me, op) => op.order.reduce((best, s) => (Math.abs(power(me.S[s]) - power(op.S[s])) < Math.abs(power(me.S[best]) - power(op.S[best])) ? s : best)),
  };

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
    const lbl = { me: a && a.duel ? '奪還' : '確保', op: a && a.duel ? '防衛された' : '敵陣', none: '—', active: '交戦中', pending: `第${k + 1}陣` }[st];
    return `<div class="a-tile ${st} ${a && a.duel ? 'duel' : ''}"><span class="a-tile__s">${esc(s)}</span><small>${lbl}</small>${s === b.focus ? '<i class="focus">★</i>' : ''}${s === b.op.focus ? '<i class="ofocus">◆</i>' : ''}</div>`;
  }).join('')}</div>`;

  function PickView(b, ctx) {
    const p = ctx.player, t = p.tickets, can = t.now > 0, mine = totalPower(p.stats);
    return `<div class="match-screen phase-pick">
      <header class="m-head"><button class="link" data-action="exit">← ホーム</button><span class="eyebrow">RANK MATCH · ASYNC PvP</span></header>
      <h1 class="m-title">挑戦する相手を選ぶ</h1>
      <p class="a-lede">相手の<b>防衛データ</b>と、あなたの<b>知識データ</b>（単元ごとの実力・定着度）で自動戦闘します。結果に納得できない陣地は<b>直接対決</b>で決め直せます。</p>
      <div class="a-tickets"><span>挑戦権</span>${Array.from({ length: t.max }, (_, k) => `<i class="${k < t.now ? 'on' : ''}"></i>`).join('')}<b>${t.now}/${t.max}</b><small>演習1セットで1回復</small></div>
      ${can ? '' : `<div class="a-empty">挑戦権がありません。演習すると1回復します。<button class="btn btn--sub" data-action="train">演習する</button></div>`}
      <div class="a-cands">${b.cands.map((o) => {
        const n = navOf(ctx.D, o.nav), S = ctx.opStats(o), pw = totalPower(S), diff = pw - mine;
        return `<button class="a-cand" data-op="${o.id}" ${can ? '' : 'disabled'} style="--oc:${n.type.color}">
          ${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--cand' })}
          <span class="a-cand__main"><b>${esc(o.name)}</b><small>${esc(o.rank)} · ${o.rp.toLocaleString('ja-JP')} RP · NAV ${esc(n.char.name)}</small>
            <span class="a-mini">${SUBJECTS.map((s) => `<i style="--v:${Math.round(power(S[s]) / 3)}%" title="${s}"><em>${s.slice(0, 1)}</em></i>`).join('')}</span></span>
          <span class="a-cand__side"><b>${pw}</b><small class="${diff > 0 ? 'hi' : diff < 0 ? 'lo' : ''}">${diff > 0 ? '格上 +' + diff : diff < 0 ? '格下 ' + diff : '互角'}</small><small>勝 +${o.reward.win} / 負 ${o.reward.lose}</small></span>
        </button>`;
      }).join('')}</div>
      <button class="link a-refresh" data-action="refresh">相手を入れ替える</button>
      ${NavLine(ctx, ctx.char.catch, 'default')}
    </div>`;
  }

  function PlanView(b, ctx) {
    const o = b.op, n = navOf(ctx.D, o.nav), mt = ctx.type, now = ctx.now();
    const me = b.me(), op = b.opSide();
    const rates = {}; o.order.forEach((s) => { rates[s] = winRate(Object.assign({}, me, { focus: s }), op, now, 200); });
    const rate = rates[b.focus];
    const sug = ADVICE[mt.id](me, op, now);
    const line = fmt(ctx.char.battleLines.start, { rate: rates[sug], focus: sug });
    return `<div class="match-screen phase-plan" style="--oc:${b.oc}">
      <header class="m-head"><button class="link" data-action="back">← 相手を選び直す</button><span class="eyebrow">作戦</span></header>
      <div class="a-vs">
        <div class="a-vs__side me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face portrait--vs' })}<b>${esc(ctx.player.name)}</b><small>${esc(ctx.rankLabel)} · 学力 ${totalPower(me.S)}</small></div>
        <div class="a-rate"><span>勝率予測</span><b>${rate}<small>%</small></b></div>
        <div class="a-vs__side op">${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--vs portrait--op' })}<b>${esc(o.name)}</b><small>${esc(o.rank)} · 学力 ${totalPower(op.S)}</small></div>
      </div>
      <section class="m-panel">
        <h2 class="panel__title">主戦場を選ぶ（相手の防衛順）</h2>
        <div class="a-compare">${o.order.map((s, k) => {
          const a = power(me.S[s]), c = power(op.S[s]);
          return `<button class="a-row ${s === b.focus ? 'is-focus' : ''}" data-focus="${s}" aria-pressed="${s === b.focus}">
            <span class="no">${k + 1}</span><span class="s">${esc(s)}${s === o.focus ? '<i class="ofocus">◆</i>' : ''}</span>
            <span class="v me">${a}</span><span class="duel"><i class="l" style="width:${(a / (a + c)) * 100}%"></i></span><span class="v op">${c}</span>
            <span class="wr ${s === sug ? 'sug' : ''}">${rates[s]}%</span>
          </button>`;
        }).join('')}</div>
        <p class="muted">右端は<b>その科目を主戦場（★ 全能力 +10%）にしたときの勝率</b>。◆は相手の主戦場。押し合う単元は戦闘ごとに抽選。</p>
      </section>
      <section class="a-advice">
        <div class="a-advice__head"><span class="eyebrow">${esc(ctx.char.name)}の提案</span><b>${UI.Emblem(mt.emblem)}${esc(mt.advice.name)}</b><small>${esc(mt.advice.desc)}</small></div>
        ${b.focus === sug ? '<span class="a-advice__on">採用中</span>' : `<button class="btn btn--sub" data-focus="${esc(sug)}">${esc(sug)}を主戦場にする</button>`}
      </section>
      ${NavLine(ctx, line, 'serious')}
      <p class="a-fair">ナビのタイプは対戦の強さに影響しません。勝敗を決めるのは知識データと主戦場の選択だけです。</p>
      <button class="btn btn--main" data-action="fight">挑戦権を1つ使って開戦</button>
    </div>`;
  }

  const exLabel = (e) => `<span class="ax"><small>${esc(e.unit || '科目全体')}</small>${AXL[e.axis]}</span>`;

  function BattleView(b, ctx) {
    const res = b.res, n = navOf(ctx.D, b.op.nav);
    const area = res.areas[b.ai], shown = area && area.ex ? area.ex.slice(0, b.ei) : [];
    const g = shown.length ? shown[shown.length - 1].gauge : 0;
    const done = res.areas.slice(0, b.ai + (b.areaDone ? 1 : 0)).filter((a) => !a.skipped);
    return `<div class="match-screen phase-battle" style="--oc:${b.oc}">
      <div class="a-score">
        <div class="me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face' })}<span>${esc(ctx.player.name)}</span><b>${done.filter((a) => a.win).length}</b></div>
        <span class="dash">陣地</span>
        <div class="op"><b>${done.filter((a) => !a.win).length}</b><span>${esc(b.op.name)}</span>${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--op' })}</div>
      </div>
      ${Tiles(b, res, b.areaDone ? b.ai + 1 : b.ai)}
      <section class="a-arena ${b.areaDone ? (area.win ? 'won' : 'lost') : ''}">
        <div class="a-arena__head"><span class="eyebrow">第${b.ai + 1}陣</span><h2>${esc(area.subject)}</h2>${b.areaDone ? `<span class="a-capture">${area.win ? '陣地確保' : '陣地を奪われた'}</span>` : ''}</div>
        <div class="a-tug" aria-label="陣地ゲージ"><i class="mine" style="width:${50 + g / 2}%"></i><span class="mark" style="left:${50 + g / 2}%"></span><em class="c"></em></div>
        <div class="a-notes">${area.notesMe.map((x) => `<span class="me">${esc(x)}</span>`).join('')}${area.notesOp.map((x) => `<span class="op">相手：${esc(x)}</span>`).join('')}</div>
        <ol class="a-ex">${area.ex.map((e, k) => {
          if (k >= shown.length) return `<li class="wait">${exLabel(e)}<span class="dots">· · ·</span></li>`;
          return `<li class="${e.d >= 0 ? 'up' : 'down'}">${exLabel(e)}<b class="a">${e.a}</b><span class="vs">vs</span><b class="b">${e.b}</b><span class="d">${e.d >= 0 ? '押し込み +' + e.d : '押し返され ' + e.d}</span></li>`;
        }).join('')}</ol>
      </section>
      ${NavLine(ctx, b.line, b.expr)}
      <div class="a-controls"><button class="btn btn--sub" data-action="speed">${b.fast ? '通常速度' : '2倍速'}</button><button class="btn btn--sub" data-action="skip">結果まで飛ばす</button></div>
    </div>`;
  }

  function ResultView(b, ctx) {
    const res = b.res, an = analyze(res), r = b.ranks, rpd = b.rpNow;
    const ev = res.win ? 'win' : 'lose';
    const weak = an.weak ? `${an.weak.unit || an.weak.subject}の${AXL[an.weak.axis]}` : '';
    const line = b.duelMsg || fmt(ctx.char.battleLines[ev], { weak });
    const promoted = r.after.label !== r.before.label;
    return `<div class="match-screen phase-result ${res.win ? 'is-win' : 'is-lose'}" style="--oc:${b.oc}">
      <header class="r-head"><span class="eyebrow">RANK MATCH RESULT · VS ${esc(b.op.name)}</span><strong>${res.win ? 'WIN' : 'LOSE'}</strong><span class="r-score">${res.myW} <small>陣地</small> ${res.opW}${b.flipped ? ' <small class="flip">直接対決で逆転</small>' : ''}</span></header>
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
        ${an.lost.length ? `<ul class="a-why">${an.lost.map((l) => `<li>
            <span><b>${esc(l.subject)}</b>：${l.unit ? `<b class="u">${esc(l.unit)}</b>の` : ''}${AXL[l.axis]}で押し負け <em>${l.a} vs ${l.b}</em></span>
            <span class="a-why__btns">
              ${b.duelUsed ? '' : `<button class="btn btn--duel" data-duel="${esc(l.subject)}">直接対決</button>`}
              <button class="btn btn--sub" data-action="train" data-subject="${esc(l.subject)}" data-units="${esc(l.units.join('|'))}">演習</button>
            </span></li>`).join('')}</ul>
          ${b.duelUsed ? '' : `<p class="muted a-duelnote">自動戦闘の結果に納得できない陣地は、<b>直接対決</b>（同じ${RULE.duelQ}問を両者が解く）で決め直せます。1試合1回。</p>`}`
        : '<p class="muted">落とした陣地はありません。完全勝利です。</p>'}
      </section>
      <div class="r-actions">
        <button class="btn btn--sub" data-action="exit">ホームへ</button>
        <button class="btn btn--main" data-action="again" ${ctx.player.tickets.now > 0 ? '' : 'disabled'}>${ctx.player.tickets.now > 0 ? '別の相手に挑戦' : '挑戦権なし'}</button>
      </div>
    </div>`;
  }

  /* ---------- 直接対決 ---------- */
  function DuelIntro(b, ctx) {
    const d = b.duel, n = navOf(ctx.D, b.op.nav);
    return `<div class="match-screen phase-duel" style="--oc:${b.oc}">
      <header class="m-head"><button class="link" data-action="duel-cancel">← リザルトへ</button><span class="eyebrow">DIRECT MATCH</span></header>
      <h1 class="m-title">直接対決：${esc(d.subject)}</h1>
      <div class="a-vs">
        <div class="a-vs__side me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face portrait--vs' })}<b>${esc(ctx.player.name)}</b></div>
        <div class="a-rate"><span>問題数</span><b>${d.qs.length}<small>問</small></b></div>
        <div class="a-vs__side op">${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--vs portrait--op' })}<b>${esc(b.op.name)}</b></div>
      </div>
      <section class="m-panel m-rules"><h2 class="panel__title">ルール</h2><ul>
        <li>両者が<b>同じ${d.qs.length}問</b>を解く（自動戦闘で押し合った単元から優先して出題）</li>
        <li>正解数が多いほうの勝ち。同数なら<b>合計時間</b>が短いほう。1問${RULE.duelSec}秒</li>
        <li>勝てば<b>${esc(d.subject)}の陣地を奪還</b>。結果がひっくり返ることもある</li>
        <li>解いた結果はあなたの知識データにも反映される</li>
      </ul><p class="muted">本番では、相手もあとで同じ問題を解いて決着します（試作では相手の知識データから回答を予測）。</p></section>
      ${NavLine(ctx, ctx.char.lines.match, 'serious')}
      <button class="btn btn--main" data-action="duel-start">直接対決を始める</button>
    </div>`;
  }

  function DuelQ(b, ctx) {
    const d = b.duel, q = d.qs[d.i], a = d.me[d.i], rev = !!a;
    return `<div class="match-screen phase-${rev ? 'reveal' : 'question'}" style="--oc:${b.oc}">
      <div class="m-board">
        <div class="m-side me"><small>直接対決 · ${esc(d.subject)}</small><b>${d.me.filter((x) => x.correct).length}<small>正解</small></b></div>
        <div class="m-round"><span>Q${d.i + 1}<small>/${d.qs.length}</small></span></div>
        <div class="m-side op"><small>${esc(b.op.name)}</small><b>？</b></div>
      </div>
      <div class="m-timer"><i class="js-bar" style="width:${rev ? 0 : 100}%"></i><span class="js-sec">${rev ? '' : RULE.duelSec}</span></div>
      <section class="m-q"><div class="m-q__meta"><span>${esc(q.subject)}</span><span>${esc(q.unit)}</span><span class="diff">${'★'.repeat(q.difficulty)}${'☆'.repeat(3 - q.difficulty)}</span></div><p class="m-q__text">${esc(q.q)}</p></section>
      <div class="m-choices">${q.choices.map((c, k) => {
        let st = ''; if (rev) st = k === q.answer ? 'ok' : k === a.choice ? 'ng' : 'dim';
        return `<button class="m-choice ${st}" data-choice="${k}" ${rev ? 'disabled' : ''}><span class="key">${'ABCD'[k]}</span><span class="txt">${esc(c)}</span>${rev && k === q.answer ? '<span class="mark">正解</span>' : ''}</button>`;
      }).join('')}</div>
      ${rev ? `<section class="m-reveal"><div class="m-reveal__row"><span class="res ${a.correct ? 'ok' : 'ng'}">${a.correct ? '正解' : a.time == null ? '時間切れ' : '不正解'}</span><span class="t">${a.time != null ? a.time.toFixed(1) + '秒' : ''}</span><span class="opp">相手の回答は最後に公開</span></div>
        <p class="m-reveal__exp"><b>解説</b>${esc(q.explain)}</p>
        <button class="btn btn--main js-next" data-action="duel-next">${d.i + 1 >= d.qs.length ? '判定へ' : '次の問題'}<kbd>Enter</kbd></button></section>` : ''}
    </div>`;
  }

  function DuelResult(b, ctx) {
    const d = b.duel, sum = (arr) => arr.reduce((s, x) => s + (x.time == null ? RULE.duelSec : x.time), 0);
    const mc = d.me.filter((x) => x.correct).length, oc = d.op.filter((x) => x.correct).length;
    return `<div class="match-screen phase-result ${d.win ? 'is-win' : 'is-lose'}" style="--oc:${b.oc}">
      <header class="r-head"><span class="eyebrow">DIRECT MATCH · ${esc(d.subject)}</span><strong class="d-word">${d.win ? '陣地奪還' : '防衛された'}</strong><span class="r-score">${mc} <small>正解</small> ${oc}</span></header>
      <section class="r-review holo-panel">
        <div class="d-row d-head"><span>問題</span><span class="me">あなた</span><span class="op">${esc(b.op.name)}</span></div>
        ${d.qs.map((q, k) => `<div class="d-row"><span class="qq"><small>${esc(q.unit)}</small>${esc(q.q)}</span><span class="me ${d.me[k].correct ? 'ok' : 'ng'}">${d.me[k].correct ? '○' : '×'} <small>${d.me[k].time != null ? d.me[k].time.toFixed(1) + 's' : '—'}</small></span><span class="op ${d.op[k].correct ? 'ok' : 'ng'}">${d.op[k].correct ? '○' : '×'} <small>${d.op[k].time.toFixed(1)}s</small></span></div>`).join('')}
        <div class="d-row d-total"><span>合計</span><span class="me">${mc}問 <small>${sum(d.me).toFixed(1)}s</small></span><span class="op">${oc}問 <small>${sum(d.op).toFixed(1)}s</small></span></div>
      </section>
      ${b.flipped ? '<p class="d-flip">陣地の奪還で試合結果が逆転しました</p>' : ''}
      ${NavLine(ctx, d.win ? fmt(ctx.char.battleLines.areaWin, { subject: d.subject }) : fmt(ctx.char.battleLines.areaLose, { subject: d.subject }), d.win ? 'smile' : 'special')}
      <button class="btn btn--main" data-action="duel-done">リザルトに戻る</button>
    </div>`;
  }

  /* ================= 進行 ================= */
  let b = null, ctx = null, root = null, timer = null, tick = null;
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stop = () => { clearTimeout(timer); timer = null; clearInterval(tick); tick = null; };

  function draw() {
    const v = { pick: PickView, plan: PlanView, battle: BattleView, result: ResultView, duel: DuelIntro, duelq: DuelQ, duelres: DuelResult }[b.phase];
    root.innerHTML = `<div class="screen screen--match">${v(b, ctx)}</div>`;
    if (b.phase === 'result' && !b.animated) { b.animated = true; animateResult(); }
    const nx = root.querySelector('.js-next'); if (nx) nx.focus({ preventScroll: true });
  }

  function candidates() {
    const rp = ctx.player.rank.rp, pool = ctx.opponents.slice().sort(() => Math.random() - 0.5);
    const out = [];
    [pool.filter((o) => o.rp < rp - 50), pool.filter((o) => Math.abs(o.rp - rp) <= 120), pool.filter((o) => o.rp > rp + 50)].forEach((g) => { const o = g.find((x) => !out.includes(x)); if (o) out.push(o); });
    pool.forEach((o) => { if (out.length < 3 && !out.includes(o)) out.push(o); });
    return out.sort((x, y) => x.rp - y.rp);
  }

  function choose(id) {
    const o = ctx.opponents.find((x) => x.id === id), n = navOf(ctx.D, o.nav);
    b.op = o; b.oc = n.type.id === ctx.type.id ? '#D9DFEF' : n.type.color; b.focus = ctx.player.focus; b.phase = 'plan';
    const opK = ctx.opK(o), opS = ctx.opStats(o);
    b.me = () => ({ K: ctx.myK(), S: ctx.player.stats, focus: b.focus });
    b.opSide = () => ({ K: opK, S: opS, focus: o.focus, order: o.order });
    draw();
  }

  function fight() {
    if (ctx.player.tickets.now <= 0) return;
    b.res = resolveBattle(b.me(), b.opSide(), Math.floor(Math.random() * 1e9), ctx.now());
    b.rpNow = b.res.win ? b.op.reward.win : b.op.reward.lose;
    b.ranks = ctx.applyBattle({ win: b.res.win, rp: b.rpNow, focus: b.focus });
    b.phase = 'battle'; b.ai = 0; b.ei = 0; b.areaDone = false; b.line = ctx.char.catch; b.expr = 'serious';
    draw(); schedule();
  }
  function schedule() { clearTimeout(timer); const base = reduce() ? 250 : b.fast ? 380 : 800; timer = setTimeout(step, b.areaDone ? base * 1.6 : base); }
  function step() {
    const area = b.res.areas[b.ai];
    if (b.areaDone) {
      b.ai++; b.ei = 0; b.areaDone = false;
      if (b.ai >= b.res.areas.length || b.res.areas[b.ai].skipped) { finish(); return; }
      draw(); schedule(); return;
    }
    if (b.ei < 3) { b.ei++; draw(); schedule(); return; }
    b.areaDone = true;
    b.line = fmt(ctx.char.battleLines[area.win ? 'areaWin' : 'areaLose'], { subject: area.subject });
    b.expr = area.win ? 'smile' : 'special';
    draw(); schedule();
  }
  function finish() { stop(); b.phase = 'result'; draw(); }

  function animateResult() {
    const rp = root.querySelector('.js-rp'), g = root.querySelector('.js-gauge'); if (!rp) return;
    if (reduce()) { rp.textContent = (+rp.dataset.to).toLocaleString('ja-JP'); g.style.width = g.dataset.to + '%'; return; }
    const from = +rp.dataset.from, to = +rp.dataset.to, t0 = performance.now();
    setTimeout(() => { g.style.width = g.dataset.to + '%'; }, 300);
    const f = (now) => { const p = Math.min(1, (now - t0 - 300) / 900); if (p >= 0) rp.textContent = Math.round(from + (to - from) * p).toLocaleString('ja-JP'); if (p < 1 && b && b.phase === 'result') requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  /* 直接対決 */
  function duelOpen(subject) {
    const area = b.res.areas.find((a) => a.subject === subject && !a.skipped);
    const focusUnits = area ? area.ex.filter((e) => e.unit).map((e) => e.unit) : [];
    const qs = KN.pickQuestions(ctx.myK(), ctx.bank, subject, RULE.duelQ, ctx.now(), focusUnits).map((q) => {
      const order = q.choices.map((_, i) => i).sort(() => Math.random() - 0.5);
      return Object.assign({}, q, { choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) });
    });
    b.duel = { subject, qs, i: 0, me: [], op: [] };
    b.phase = 'duel'; draw();
  }
  function duelAsk() {
    const d = b.duel; d.t0 = performance.now(); b.phase = 'duelq'; draw();
    clearInterval(tick);
    tick = setInterval(() => {
      const left = Math.max(0, RULE.duelSec - (performance.now() - d.t0) / 1000);
      const bar = root.querySelector('.js-bar'), sec = root.querySelector('.js-sec');
      if (bar) { bar.style.width = (left / RULE.duelSec) * 100 + '%'; bar.classList.toggle('low', left < 8); }
      if (sec) sec.textContent = Math.ceil(left);
      if (left <= 0) duelAnswer(null);
    }, 100);
  }
  function duelAnswer(choice) {
    const d = b.duel; if (b.phase !== 'duelq' || d.me[d.i]) return;
    clearInterval(tick);
    const q = d.qs[d.i], time = choice == null ? null : Math.min(RULE.duelSec, +((performance.now() - d.t0) / 1000).toFixed(1));
    const ans = { choice, correct: choice === q.answer, time };
    d.me[d.i] = ans;
    ctx.recordAnswer(q, ans);
    draw();
  }
  function duelNext() {
    const d = b.duel; if (!d.me[d.i]) return;
    if (d.i + 1 < d.qs.length) { d.i++; duelAsk(); return; }
    const r = KN.rng(KN.hash(b.op.id + d.subject + b.res.seed));
    d.op = d.qs.map((q) => KN.simulateAnswer(b.opSide().K, q, ctx.player.qr, r));
    const mc = d.me.filter((x) => x.correct).length, oc = d.op.filter((x) => x.correct).length;
    const sum = (arr) => arr.reduce((s, x) => s + (x.time == null ? RULE.duelSec : x.time), 0);
    d.win = mc > oc || (mc === oc && sum(d.me) < sum(d.op));
    b.duelUsed = true;
    if (d.win) overturn(d.subject);
    b.phase = 'duelres'; draw();
  }
  function overturn(subject) {
    const res = b.res, wasWin = res.win;
    const area = res.areas.find((a) => a.subject === subject && !a.skipped);
    area.win = true; area.duel = true;
    tally(res);
    // 決着がつかなくなったら、未戦闘の陣地を自動戦闘で続ける
    const r = KN.rng(res.seed + 99);
    res.areas.forEach((a, i) => {
      if (!a.skipped || res.myW >= RULE.toWin || res.opW >= RULE.toWin) return;
      res.areas[i] = resolveArea(b.me(), b.opSide(), a.subject, i, r, ctx.now());
      tally(res);
    });
    if (!wasWin && res.win) {
      b.flipped = true;
      b.ranks = ctx.overturn({ from: b.op.reward.lose, to: b.op.reward.win });
      b.rpNow = b.op.reward.win; b.animated = false;
      b.duelMsg = fmt(ctx.char.battleLines.win, {});
    }
  }

  function onClick(e) {
    const t = e.target.closest('button'); if (!t || !b) return;
    if (t.dataset.op) { choose(t.dataset.op); return; }
    if (t.dataset.focus) { b.focus = t.dataset.focus; draw(); return; }
    if (t.dataset.duel) { duelOpen(t.dataset.duel); return; }
    if (t.dataset.choice != null) { duelAnswer(+t.dataset.choice); return; }
    switch (t.dataset.action) {
      case 'refresh': b.cands = candidates(); draw(); break;
      case 'back': b.phase = 'pick'; draw(); break;
      case 'fight': fight(); break;
      case 'speed': b.fast = !b.fast; draw(); schedule(); break;
      case 'skip': finish(); break;
      case 'again': b = { phase: 'pick', cands: candidates(), fast: b.fast }; draw(); break;
      case 'duel-cancel': b.phase = 'result'; draw(); break;
      case 'duel-start': duelAsk(); break;
      case 'duel-next': duelNext(); break;
      case 'duel-done': b.phase = 'result'; draw(); break;
      case 'train': { const s = t.dataset.subject, u = t.dataset.units ? t.dataset.units.split('|') : []; unmount(); ctx.train(s, u); break; }
      case 'exit': unmount(); ctx.exit(); break;
    }
  }
  function onKey(e) {
    if (!b || b.phase !== 'duelq') return;
    const d = b.duel;
    if (!d.me[d.i]) { const k = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()]; if (k != null) { e.preventDefault(); duelAnswer(k); } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); duelNext(); }
  }

  function mount(r, c) {
    unmount(); root = r; ctx = c;
    b = { phase: 'pick', cands: candidates(), fast: false };
    root.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    draw();
  }
  function unmount() { stop(); if (root) root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); b = null; root = null; }

  window.Battle = { mount, unmount, resolveBattle, winRate, analyze, totalPower, power, SUBJECTS, AXL };
})();
