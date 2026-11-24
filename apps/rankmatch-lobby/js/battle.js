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
  /* 押し合い：数値の差＋ゆらぎ（正規分布 σ）で勝ち負け。3 回のうち先に 2 回取ったほうが陣地を取る。
     σ は「同格 50%／総合差 20 で 65:35／総合差 50 で 85:15、格下でも陣地単位で 2〜3 割」になるようシミュレーションで調整（tools/sim_battle.js） */
  const RULE = { gate: 1.02, momentum: 1.03, focus: 1.15, focusUnit: 1.15, boost: 1.10, counter: 1.06, sigma: 4, toWin: 3, exWin: 2, minSolved: 5, uses: 2, duelQ: 5, duelSec: 30 };
  /* 戦術：三すくみ（確実 → 速攻 → 応用 → 確実 の順に強い）。相性で勝つと全押し合い +6% */
  const TAC = {
    sure: { name: '確実にいく', desc: '正確さ+12%・速さ−8%', acc: 1.12, speed: 0.92, app: 1 },
    rush: { name: '速攻', desc: '速さ+12%・正確さ−8%', acc: 0.92, speed: 1.12, app: 1 },
    apply: { name: '応用に賭ける', desc: '応用+15%・正確さと速さ−5%', acc: 0.95, speed: 0.95, app: 1.15 },
  };
  const BEATS = { sure: 'rush', rush: 'apply', apply: 'sure' };
  const styleOf = (op) => ['sure', 'rush', 'apply'][KN.hash(op.id || 'x') % 3]; // 相手の戦術の傾向（防衛データの一部として見える）
  function opTactic(op, r) { const st = styleOf(op); return r() < 0.6 ? st : ['sure', 'rush', 'apply'][Math.floor(r() * 3)]; }

  const power = (st) => st.speed + st.acc + st.app;
  const totalPower = (S) => SUBJECTS.reduce((s, k) => s + power(S[k]), 0);
  const pick = (S, cmp) => SUBJECTS.reduce((a, b) => (cmp(power(S[b]), power(S[a])) ? b : a));
  const strongest = (S) => pick(S, (x, y) => x > y);
  const weakest = (S) => pick(S, (x, y) => x < y);
  const solved = (K, s, u) => { const x = K.units[KN.key(s, u)]; return (x && x.n) || 0; };
  const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  /* 押し合う単元：両者が 5 問以上解いた単元から、出題頻度で重み付けして抽選（未学習の単元で即落ちしない） */
  function drawUnits(me, op, subject, r, n = 2, ban) {
    const pool = (KN.units()[subject] || []).filter((u) => u !== ban);
    const both = pool.filter((u) => solved(me.K, subject, u) >= RULE.minSolved && solved(op.K, subject, u) >= RULE.minSolved);
    const cand = both.length >= n ? both : pool, out = [];
    while (out.length < n && out.length < cand.length) {
      const left = cand.filter((u) => !out.includes(u)), tot = left.reduce((x, u) => x + KN.meta(subject, u).weight, 0);
      let v = r() * tot; const u = left.find((x) => (v -= KN.meta(subject, x).weight) <= 0) || left[left.length - 1];
      out.push(u);
    }
    while (out.length < n) out.push(out[0]);
    return out;
  }

  /* mom: 直前の陣地を取った側（1＝攻め側、-1＝守り側、0＝なし） */
  function resolveArea(me, op, subject, idx, r, now, mom = 0, opt = {}) {
    const [u1, u2] = opt.units || drawUnits(me, op, subject, r);
    // 主戦場：通常は +15%。集中防衛（conc）は「読み」：相手の主戦場を当てたら相手の +15% を打ち消して自分が +15%、外したら自分の主戦場の +15% も無い
    const read = (x, y) => x.conc && x.focus === subject && y.focus === subject; // x が y の主戦場を読み当てた
    const fOf = (x, y) => (x.conc ? (read(x, y) ? RULE.focus : 1) : read(y, x) ? 1 : x.focus === subject ? RULE.focus : 1);
    const nOf = (x, y) => (x.conc ? (read(x, y) ? ['集中防衛 読み勝ち +15%'] : x.focus === subject ? ['集中防衛 読み外れ'] : []) : read(y, x) ? ['主戦場を読まれた ±0'] : x.focus === subject ? ['主戦場 +15%'] : []);
    let fm = fOf(me, op), fo = fOf(op, me);
    const notesMe = nOf(me, op), notesOp = nOf(op, me);
    const act = me.active || op.active, gate = op.order && op.order.find((x) => !act || act.includes(x)); // 城門＝対象の陣地のうち最初の 1 つ
    if (gate === subject) { fo *= RULE.gate; notesOp.push('城門 +2%'); }
    const tm = TAC[opt.tacMe], to = TAC[opt.tacOp];
    if (tm) notesMe.push(tm.name); if (to) notesOp.push(to.name);
    if (opt.tacMe && opt.tacOp && BEATS[opt.tacMe] === opt.tacOp) { fm *= RULE.counter; notesMe.push('戦術の相性 +6%'); }
    if (opt.tacMe && opt.tacOp && BEATS[opt.tacOp] === opt.tacMe) { fo *= RULE.counter; notesOp.push('戦術の相性 +6%'); }
    if (mom > 0) { fm *= RULE.momentum; notesMe.push('勢い +3%'); }
    if (mom < 0) { fo *= RULE.momentum; notesOp.push('勢い +3%'); }
    const raw = [
      { axis: 'acc', unit: u1, a: KN.unitValue(me.K, subject, u1, 'acc', now), b: KN.unitValue(op.K, subject, u1, 'acc', now) },
      { axis: 'speed', unit: u2, a: KN.unitValue(me.K, subject, u2, 'speed', now), b: KN.unitValue(op.K, subject, u2, 'speed', now) },
      { axis: 'app', unit: null, a: me.S[subject].app, b: op.S[subject].app },
    ];
    let w = 0, l = 0; const ex = [];
    for (const e of raw) {
      if (w >= RULE.exWin || l >= RULE.exWin) break;
      let km = fm * (tm ? tm[e.axis] : 1), ko = fo * (to ? to[e.axis] : 1);
      if (opt.focusUnit && e.unit && opt.focusUnit === subject + '/' + e.unit) km *= RULE.focusUnit; // 重点単元
      if (opt.boost === e.axis) km *= RULE.boost; // 介入：底上げ
      const a = e.a * km, b = e.b * ko, d = a - b + gauss(r) * RULE.sigma, win = d > 0;
      win ? w++ : l++;
      ex.push({ axis: e.axis, unit: e.unit, field: e.unit ? KN.meta(subject, e.unit).field : null, a: Math.round(a), b: Math.round(b), d: Math.round(d) || (win ? 1 : -1), win, gauge: (w - l) * 50, lamps: [w, l], km, raw: e.a });
    }
    return { subject, idx, ex, gauge: (w - l) * 50, win: w >= RULE.exWin, wins: [w, l], notesMe, notesOp, units: [u1, u2], tacMe: opt.tacMe, tacOp: opt.tacOp };
  }

  const needWin = (n) => Math.floor(n / 2) + 1; // 対象の陣地の過半数（5→3、3→2）
  function resolveBattle(me, op, seed, now) {
    const r = KN.rng(seed), areas = []; let myW = 0, opW = 0, mom = 0;
    const act = me.active || op.active, order = (me.order || op.order).filter((s) => !act || act.includes(s)), need = needWin(order.length);
    order.forEach((subject, idx) => {
      if (myW >= need || opW >= need) { areas.push({ subject, idx, skipped: true }); return; }
      const a = resolveArea(me, op, subject, idx, r, now, mom, { focusUnit: me.focusUnit });
      a.win ? myW++ : opW++; mom = a.win ? 1 : -1; areas.push(a);
    });
    return { areas, myW, opW, win: myW >= need, seed, need };
  }
  function winRate(me, op, now, n = 300) {
    let w = 0; for (let i = 1; i <= n; i++) if (resolveBattle(me, op, i * 7919, now).win) w++;
    return Math.round((w / n) * 100);
  }
  function tally(res) {
    res.myW = res.areas.filter((a) => !a.skipped && a.win).length;
    res.opW = res.areas.filter((a) => !a.skipped && !a.win).length;
    res.win = res.myW >= (res.need || RULE.toWin);
  }
  function analyze(res) {
    const lost = res.areas.filter((a) => !a.skipped && !a.win && a.ex && a.ex.length).map((a) => {
      const w = a.ex.reduce((x, y) => (y.d < x.d ? y : x));
      return { subject: a.subject, unit: w.unit, axis: w.axis, a: w.a, b: w.b, e: w, units: a.ex.filter((e) => e.unit).map((e) => e.unit) };
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

  /* 陣地の状態（科目で引く。攻め順は攻め側が決め、地図の並びは防衛側の順） */
  function stateOf(b, subject) {
    if (b.active && !b.active.includes(subject)) return 'none'; // 受験型の対象外
    const a = b.res && b.res.areas.find((x) => x.subject === subject);
    if (!a) return b.phase === 'battle' && b.stage === 'decide' && b.dec && b.dec.subject === subject ? 'active' : 'pending';
    if (a.skipped) return 'none';
    if (b.phase === 'battle' && b.res.areas[b.ai] === a && !b.areaDone) return 'active';
    return a.win ? 'me' : 'op';
  }
  const tileState = (b, res, upto, k) => stateOf(b, (b.order || b.op.order)[k]);
  const Map3D = (hint, inner = '', cls = '') => `<div class="a-3d ${cls}"><span class="a-3d__hint">${hint || 'ドラッグで回転'}</span>${inner}</div>`;
  /* バトル中に3Dの上へ重ねる演出（再描画のたびに新しい要素になるので、CSSアニメが毎回再生される） */
  function FxLayer(b, ctx, g) {
    const f = b.fx; let h = `<div class="fx-tug"><i style="width:${50 + g / 2}%"></i><span style="left:${50 + g / 2}%"></span></div>`;
    if (!f) return h;
    if (f.kind === 'start') h += `<div class="fx fx-start"><b>BATTLE START</b><span><em class="me">${esc(ctx.player.name)}</em> VS <em class="op">${esc(b.op.name)}</em></span></div>`;
    if (f.kind === 'area') h += `<div class="fx fx-area"><small>第${f.idx + 1}陣</small><b>${esc(f.subject)}</b></div>`;
    if (f.kind === 'ex') { const e = f.e; h += `<div class="fx fx-ex ${e.d >= 0 ? 'up' : 'down'}"><span class="fx-ex__ax">${e.unit ? esc(e.field) + ' › ' + esc(e.unit) : '科目全体'} · ${AXL[e.axis]}</span><span class="fx-ex__vs"><b class="a">${e.a}</b><i>VS</i><b class="b">${e.b}</b></span><span class="fx-ex__d">${e.d >= 0 ? '押し込み +' + e.d : '押し返され ' + e.d}${Math.abs(e.d) >= 25 ? '<em>CRITICAL</em>' : ''}</span><span class="fx-ex__why">${esc(explain(e, f.subject, b, ctx))}</span></div>`; }
    if (f.kind === 'cap') h += `<div class="fx fx-cap ${f.win ? 'me' : 'op'}"><b>${f.win ? '陣地確保' : '陥落'}</b><small>${esc(f.subject)}</small></div>`;
    return h;
  };
  const Tiles = (b, res, upto) => `<div class="a-tiles">${(b.order || b.op.order).map((s, k) => {
    const a = res && res.areas.find((x) => x.subject === s);
    const st = stateOf(b, s);
    const lbl = { me: a && a.duel ? '奪還' : a && a.duelAtk ? '直接対決' : '確保', op: a && a.duel ? '防衛された' : '敵陣', none: '—', active: '交戦中', pending: `第${k + 1}陣` }[st];
    const ico = st === 'me' ? '⚑ ' : st === 'op' ? '✕ ' : '';
    return `<div class="a-tile ${st} ${a && a.duel ? 'duel' : ''}" style="--sc:${(window.SUBJECT_COLOR || {})[s] || '#9aa'}"><span class="a-tile__s">${esc(s)}</span><small>${ico}${lbl}</small>${s === b.focus ? '<i class="focus">★</i>' : ''}${b.phase === 'result' && s === b.op.focus ? '<i class="ofocus">◆</i>' : ''}</div>`;
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
    const me = b.me(), op = b.opSide(), h = b.hint;
    const rates = {}; b.order.forEach((s) => { rates[s] = winRate(Object.assign({}, me, { focus: s }), op, now, 160); });
    const rate = rates[b.focus];
    const sug = ADVICE[mt.id](me, op, now);
    const line = fmt(ctx.char.battleLines.start, { rate: rates[sug], focus: sug });
    const unitOpts = SUBJECTS.map((s) => `<optgroup label="${s}">${(KN.units()[s] || []).map((u) => `<option value="${esc(s + '/' + u)}" ${b.focusUnit === s + '/' + u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</optgroup>`).join('');
    return `<div class="match-screen phase-plan" style="--oc:${b.oc}">
      <header class="m-head"><button class="link" data-action="back">← 相手を選び直す</button><span class="eyebrow">作戦</span></header>
      <div class="a-vs">
        <div class="a-vs__side me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face portrait--vs' })}<b>${esc(ctx.player.name)}</b><small>${esc(ctx.rankLabel)} · 学力 ${totalPower(me.S)}</small></div>
        <div class="a-rate"><span>勝率予測</span><b>${rate}<small>%</small></b></div>
        <div class="a-vs__side op">${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--vs portrait--op' })}<b>${esc(o.name)}</b><small>${esc(o.rank)} · 学力 ${totalPower(op.S)}</small></div>
      </div>
      ${Map3D('相手の陣地 · ドラッグで回転')}
      <section class="m-panel a-hints">
        <h2 class="panel__title">偵察で分かったこと<small class="panel__note">防衛の順番と主戦場は一部だけ</small></h2>
        <ul>
          <li><b>城門</b>（防衛側 +2%）：<em style="--sc:${SC(h.gate)}">${esc(h.gate)}</em></li>
          <li><b>相手の主戦場</b>：<em>${h.focus.map(esc).join(' か ')}</em></li>
          <li><b>戦術の傾向</b>：「${esc(TAC[h.style].name)}」を好む</li>
          ${h.hidden ? '<li><b>得意・苦手な単元</b>：<span class="muted">見えません（あなたが単元を非公開にしているため。お互いさま）</span></li>' : ''}
          ${h.strong ? `<li><b>得意そう</b>：${esc(h.strong.s)}・${esc(h.strong.u)}　<b>苦手そう</b>：${esc(h.weak.s)}・${esc(h.weak.u)}</li>` : ''}
        </ul>
      </section>
      <section class="m-panel">
        <h2 class="panel__title">攻める順番と主戦場<small class="panel__note">▲▼で順番、科目をタップで主戦場（全能力 +15%）</small></h2>
        <div class="a-compare">${b.order.map((s, k) => {
          const a = power(me.S[s]), c = power(op.S[s]);
          return `<div class="a-row-wrap"><button class="a-row ${s === b.focus ? 'is-focus' : ''}" data-focus="${s}" aria-pressed="${s === b.focus}">
            <span class="no">${k + 1}</span><span class="s" style="--sc:${SC(s)}">${window.Mechs ? `<span class="mx-ico">${window.Mechs.svg(s, { color: mt.color, cov: me.S[s].coverage, ret: me.S[s].retention })}</span>` : ''}${esc(s)}${s === b.focus ? '<i>★</i>' : ''}</span>
            <span class="v me">${a}</span><span class="duel"><i class="l" style="width:${(a / (a + c)) * 100}%"></i></span><span class="v op">${c}</span>
            <span class="wr ${s === sug ? 'sug' : ''}">${rates[s]}%</span>
          </button><span class="a-mv"><button data-mv="${k}:-1" aria-label="${s}を前へ" ${k === 0 ? 'disabled' : ''}>▲</button><button data-mv="${k}:1" aria-label="${s}を後へ" ${k === b.order.length - 1 ? 'disabled' : ''}>▼</button></span></div>`;
        }).join('')}</div>
        <p class="muted">右端はその科目を主戦場にしたときの勝率。${b.order.length < 5 ? `受験型「${esc(ctx.examLabel ? ctx.examLabel() : '')}」なので対象は ${b.order.length} 陣地。` : ''}先に${needWin(b.order.length)}つ取った方の勝ちなので、取りやすい科目を前に置くと勢い（+3%）が乗る。</p>
      </section>
      <section class="m-panel">
        <h2 class="panel__title">重点単元<small class="panel__note">その単元の押し合いが +15%</small></h2>
        <select class="a-fu" data-fu aria-label="重点単元"><option value="">指定しない</option>${unitOpts}</select>
        <p class="muted">${b.focusUnit ? `代わりに、相手にも「${esc(b.focusUnit.split('/')[0])}」を重点にしていることが伝わります（本番では相手の画面にヒントが出る）。` : '指定すると、その単元が引かれたときに強くなる。代わりに相手にも科目のヒントが伝わる。'}</p>
      </section>
      <section class="a-advice">
        <div class="a-advice__head"><span class="eyebrow">${esc(ctx.char.name)}の提案</span><b>${UI.Emblem(mt.emblem)}${esc(mt.advice.name)}</b><small>${esc(mt.advice.desc)}</small></div>
        ${b.focus === sug ? '<span class="a-advice__on">採用中</span>' : `<button class="btn btn--sub" data-focus="${esc(sug)}">${esc(sug)}を主戦場にする</button>`}
      </section>
      ${NavLine(ctx, line, 'serious')}
      <p class="a-fair">ナビのタイプは対戦の強さに影響しません。勝敗を決めるのは知識データと作戦だけです。各陣地の前に、戦術・単元のバン・介入を選べます。</p>
      <button class="btn btn--main" data-action="fight">挑戦権を1つ使って開戦</button>
    </div>`;
  }

  const exLabel = (e) => `<span class="exl"><small>${e.unit ? esc(e.field) + ' › ' + esc(e.unit) : '科目全体'}</small>${AXL[e.axis]}</span>`;
  /* 押し合いの解説：なぜ押した／押されたかを、両者の単元データから説明する */
  const pc = (x) => Math.round(x * 100) + '%';
  /* 勉強→勝利の因果：前回の対戦時からの正答予測の伸び（gain）と、負けた押し合いを覆すのに要る伸び（need） */
  function gainOf(b, ctx, subject, unit) {
    const prev = b.prevP && b.prevP[KN.key(subject, unit)]; if (prev == null) return 0;
    const u = ctx.myK().units[KN.key(subject, unit)]; return u && u.n ? KN.prob(u.r, KN.STD) - prev : 0;
  }
  function needOf(b, ctx, subject, e) {
    if (e.win || !e.unit) return '';
    const u = ctx.myK().units[KN.key(subject, e.unit)], now = ctx.now(); if (!u || !u.n) return 'まず解いて未学習をなくすと互角に近づく';
    const R = KN.retention(u, now), p = KN.prob(u.r, KN.STD), km = e.km || 1;
    if (e.axis === 'acc') { const need = e.b / (100 * (0.5 + 0.5 * R) * km) - p; return need > 0.5 ? '' : `あと正答予測 +${Math.max(1, Math.round(need * 100))}% で互角`; }
    const r2 = 1.5 - e.b / (100 * (0.6 + 0.4 * p) * km), sec = (u.ratio - r2) * KN.REF[2];
    return sec > 0 && sec < 15 ? `あと約 ${sec.toFixed(1)} 秒速く解ければ互角` : '';
  }
  function explain(e, subject, b, ctx) {
    if (e.axis === 'app') return `★2以上の問題での実力 ${e.d >= 0 ? 'で上回った' : 'で下回った'}`;
    const gain = e.unit ? gainOf(b, ctx, subject, e.unit) : 0;
    if (e.win && gain >= 0.05) return `前回の対戦より正答予測 +${Math.round(gain * 100)}%。勉強した分で押し勝った`;
    const now = ctx.now(), A = KN.unitDetail(b.me().K, subject, e.unit, now), B = KN.unitDetail(b.opSide().K, subject, e.unit, now);
    const win = e.d >= 0, flip = (x) => ((win ? x < 0 : x > 0) ? '（揺らぎで逆転）' : '');
    if (A.status === 'new' && B.status === 'new') return '両者とも未学習。運の勝負';
    if (A.status === 'new') return 'あなたはこの単元が未学習。弱点を突かれた';
    if (B.status === 'new') return '相手はこの単元が未学習。弱点を突いた';
    if (e.axis === 'speed') return `解答の速さ ${A.sec}秒 vs ${B.sec}秒${flip(B.sec - A.sec)}`;
    const dp = A.p - B.p, dR = A.R - B.R;
    if (Math.abs(dR) > 0.25 && Math.abs(dR) > Math.abs(dp)) return `定着度の差 ${pc(A.R)} vs ${pc(B.R)}${flip(dR)}`;
    const rough = A.conf.level === 'low' || B.conf.level === 'low' ? '（推定はまだ荒い）' : '';
    if (Math.abs(dp) > 0.06) return `正答予測 ${pc(A.p)} vs ${pc(B.p)}${flip(dp)}${rough}`;
    return `ほぼ互角（正答予測 ${pc(A.p)} vs ${pc(B.p)}）`;
  }

  /* ナビの指揮通信（タイプごとの口調）。{subject} 陣地の科目、{mech} 機体名 */
  const COMM = {
    logic: { start: '全5機、起動完了。勝率の高い順に指示を出す。', enter: '{subject}陣地、{mech}を投入。主導権は最初の一手で決まる。', critMe: '会心の一撃だ。計算以上の出力が出ている。', critOp: '被弾が大きい。{mech}、体勢を立て直せ。' },
    halo: { start: 'みんな、準備できたよ。焦らず一つずつ取りにいこう。', enter: '{subject}は{mech}にお願い。いつもの練習どおりで大丈夫。', critMe: 'すごい！今の一撃、積み重ねてきた力だよ。', critOp: '大丈夫、まだ立てる。{mech}、落ち着いて！' },
    ignite: { start: 'いくよ！全機フルスロットル！', enter: '{subject}、{mech}突撃！ぶちかませ！', critMe: 'よっしゃあ！今の最高！', critOp: 'くっ…まだまだ！{mech}、踏ん張れ！' },
    vex: { start: 'さあ、狩りの時間だ。弱いところから崩していく。', enter: '{subject}か。{mech}、遠慮はいらない。叩き潰せ。', critMe: 'いい手応えだ。相手の顔が見たいね。', critOp: 'へえ、やるじゃないか。{mech}、本気を出せ。' },
    echo: { start: '戦場の流れが見えます。静かに、確かに進みましょう。', enter: '{subject}の陣へ。{mech}、相手の癖を見極めて。', critMe: '見事な一撃。積み重ねた知が形になりました。', critOp: '深い一撃を受けました。{mech}、呼吸を整えて。' },
  };
  function commSay(b, ctx, key, subject, expr) {
    const L = COMM[ctx.type.id] || COMM.logic, mech = window.Mechs && subject ? window.Mechs.INFO[subject].name : '';
    b.comm = { text: fmt(L[key], { subject: subject || '', mech }), expr: expr || 'serious', key };
  }
  /* 通信ウィンドウ（ホログラム）：再描画のたびに出現アニメが再生される */
  const Comm = (b, ctx) => (b.comm ? `<div class="mx-comm k-${b.comm.key}" aria-live="polite">
    <div class="mx-comm__face">${UI.Portrait({ char: ctx.char, expr: b.comm.expr, cls: 'portrait--face' })}</div>
    <div class="mx-comm__body"><span class="mx-comm__head">NAV COMM · ${esc(ctx.char.name)}<i></i></span><p>${esc(b.comm.text)}</p></div>
  </div>` : '');

  /* 押し合いのパネル：単元名と両者の数値をバーの対決で見せ、3 つのランプで「先に 2 つで陣地」までの残りを見せる。
     要点モードでも、ランプはその陣地の押し合いすべての結果を出す */
  const SC = (s) => (window.SUBJECT_COLOR && window.SUBJECT_COLOR[s]) || '#9aa';
  function Lamps(area, upto) {
    const ex = area.ex || [], n = upto == null ? ex.length : upto;
    return `<span class="mx-lamps" aria-label="押し合い ${ex.slice(0, n).filter((e) => e.win).length}勝${ex.slice(0, n).filter((e) => !e.win).length}敗（先に2勝で陣地）">${[0, 1, 2].map((i) => {
      const e = ex[i], st = !e || i >= n ? 'off' : e.win ? 'me' : 'op';
      return `<i class="${st}">${st === 'me' ? '⚑' : st === 'op' ? '✕' : ''}</i>`;
    }).join('')}<small>先に2勝で陣地</small></span>`;
  }
  function ExPanel(b, ctx, area, e) {
    const digest = !b.full, upto = b.areaDone || digest ? null : (area.ex || []).indexOf(e) + 1;
    if (!e) return `<div class="mx-ex"><div class="mx-ex__head"><b style="--sc:${SC(area.subject)}">${esc(area.subject)}</b>${Lamps(area, 0)}</div></div>`;
    const max = Math.max(100, e.a, e.b), unit = e.unit ? `${esc(e.field)} › ${esc(e.unit)}` : '科目全体';
    return `<div class="mx-ex ${e.win ? 'win' : 'lose'}">
      <div class="mx-ex__head"><b style="--sc:${SC(area.subject)}">${esc(area.subject)}</b>${Lamps(area, upto)}</div>
      <div class="mx-ex__what"><span class="mx-ax">${AXL[e.axis]}</span><span class="u">${unit}</span></div>
      <div class="mx-ex__bars"><span class="v me">${e.a}</span><i class="me" style="--w:${(e.a / max) * 100}%"></i><i class="op" style="--w:${(e.b / max) * 100}%"></i><span class="v op">${e.b}</span></div>
      <div class="mx-ex__why">${e.win ? '⚑ 押し勝ち' : '✕ 押し負け'}：${esc(explain(e, area.subject, b, ctx))}</div>
    </div>`;
  }

  /* 激突ステージ：その陣地の科目ロボットどうしが押し合う。押し合い 1 回 = 攻撃 1 回 */
  const MOVE = { acc: '精密打撃', speed: '高速連撃', app: '応用バースト' };
  function Clash(b, ctx, area, shown, g) {
    if (!window.Mechs) return '';
    const s = area.subject, A = ctx.player.stats[s], B = b.opSide().S[s], M = window.Mechs, e = shown[shown.length - 1];
    let pm = 'idle', po = 'idle', mid = `<small>第${b.ai + 1}陣</small><strong>${esc(s)}</strong>`, fx = '';
    if (b.areaDone) { pm = area.win ? 'win' : 'down'; po = area.win ? 'down' : 'win'; mid += `<span class="mx-move ${area.win ? 'me' : 'op'}">${area.win ? '撃破！陣地確保' : '撃破された'}</span>`; }
    else if (!e) { pm = po = 'enter'; mid += '<span class="mx-move">出撃</span>'; }
    else {
      const meAtk = e.d >= 0; pm = meAtk ? 'atk' : 'hit'; po = meAtk ? 'hit' : 'atk';
      mid += `<span class="mx-move ${meAtk ? 'me' : 'op'}">${MOVE[e.axis]}${e.unit ? ' · ' + esc(e.unit) : ''}</span>`; // クリティカルは攻撃エフェクト側の技名カットインで見せる
      fx = `${M.attackFx(s, meAtk, Math.abs(e.d) >= 25)}<span class="mx-spark ${meAtk ? 'on-op' : 'on-me'}"></span><span class="mx-dmg ${meAtk ? 'on-op' : 'on-me'}">${Math.abs(e.d)}</span>`;
    }
    const side = (who, st, color, pose, name) => `<div class="mx-side ${who} p-${pose}"><div class="mx-unit">${M.svg(s, { color, cov: st.coverage, ret: st.retention })}</div>
      <span class="mx-tag">${esc(M.INFO[s].name)}<b>${power(st)}</b></span><small class="muted">${esc(name)}</small></div>`;
    const crit = !b.areaDone && e && Math.abs(e.d) >= 25;
    return `<section class="mx-clash ${crit ? 'is-crit' : ''}" aria-label="${esc(s)}の陣地での戦闘">
      ${ExPanel(b, ctx, area, e)}
      ${side('me', A, ctx.type.color, pm, ctx.player.name)}<div class="mx-mid">${mid}</div>${side('op', B, b.oc, po, b.op.name)}${fx}
      ${Comm(b, ctx)}
    </section>`;
  }

  /* ロボット戦のカットイン：陣地にズームしたあと全面に入り、3 回の攻防→撃破を見せて抜ける。
     入る（is-in）は最初の攻防の描画だけ、抜ける（is-out）は決着の描画だけ。間の描画（is-on）は動かない */
  /* 決め技シーン（約 3.5 秒）：陣地の決着で、勝った側の機体が技を決める。
     0.0 顔アップと技名 → 0.7 溜め → 1.25 突進 → 1.65 インパクトフレーム → 1.8 技が炸裂・相手が吹き飛ぶ → 2.7 スタンプ。
     相手が勝ったときは左右を反転して、相手側から撃ってくる。本番の動画が届いたらここで再生する */
  /* 決め技でナビが叫ぶ一言（タイプ別）。{tech} は技名 */
  const SHOUT = { logic: '{tech}、照準完了。撃て。', halo: 'お願い、{tech}！', ignite: 'いっけえ！{tech}！', vex: '沈め。{tech}。', echo: '解き放て——{tech}。' };
  function Finisher(b, ctx, area) {
    const M = window.Mechs, s = area.subject, meWin = area.win;
    const nav = meWin ? { char: ctx.char, type: ctx.type } : navOf(ctx.D, b.op.nav);
    const g = Math.abs(area.gauge || 0), hpW = Math.min(100, 55 + g / 2), hpL = Math.max(14, 45 - g / 2);
    const bar = (who, v, drain) => `<div class="fin__hpbar ${who}"><span>${who === 'me' ? esc(ctx.player.name) : esc(b.op.name)}</span><i><b style="width:${v}%" class="${drain ? 'drain' : ''}"></b></i></div>`;
    const W = meWin ? { st: ctx.player.stats[s], c: ctx.type.color } : { st: b.opSide().S[s], c: b.oc };
    const L = meWin ? { st: b.opSide().S[s], c: b.oc } : { st: ctx.player.stats[s], c: ctx.type.color };
    const unit = (x) => M.svg(s, { color: x.c, cov: x.st.coverage, ret: x.st.retention });
    const key = M.KEY[s], A = window.MECH_ANIM && window.MECH_ANIM[key];
    /* 決め技アニメ（AI 動画から作ったスプライト）があれば、それを流す。コマを横に並べた帯を 1 コマずつずらして再生 */
    const anim = A ? `<div class="fin__anim" style="--n:${A.n};width:min(94cqw,calc(80cqh * ${(A.w / A.h).toFixed(3)}));aspect-ratio:${A.w}/${A.h}">
        <div class="fin__strip" style="width:${A.n * 100}%;animation-timing-function:steps(${A.n},jump-none)"><img src="assets/mechs/anim/${key}.webp" alt=""><span style="-webkit-mask-image:url('assets/mechs/anim/${key}_m.webp');mask-image:url('assets/mechs/anim/${key}_m.webp')"></span></div></div>` : '';
    return `<div class="fin ${meWin ? 'me-win' : 'op-win'} ${A ? 'has-anim' : ''}" style="--wc:${W.c};--lc:${L.c}">
      <div class="fin__stage">
        <span class="fin__bg"></span><span class="fin__scroll"></span><span class="fin__lines"></span>
        <div class="fin__close">${unit(W)}</div>
        <div class="fin__aura"></div>${Array.from({ length: 10 }, (_, i) => `<i class="fin__p" style="--a:${i * 36}deg"></i>`).join('')}
        <div class="fin__tgt">${unit(L)}</div>
        <div class="fin__atk">${unit(W)}</div><div class="fin__trail">${unit(W)}</div>${anim}
        <div class="fin__fx">${M.attackFx(s, true, false)}</div>
        <span class="fin__boom"></span>
      </div>
      <div class="fin__hp">${bar('me', meWin ? hpW : hpL, !meWin)}${bar('op', meWin ? hpL : hpW, meWin)}</div>
      <div class="fin__pilot ${meWin ? 'me' : 'op'}" style="--pc:${nav.type.color}"><div class="fin__pface">${UI.Portrait({ char: nav.char, expr: 'serious', cls: 'portrait--face' })}</div>
        <p><small>${esc(nav.char.name)}</small>「${esc(fmt(SHOUT[nav.type.id] || SHOUT.logic, { tech: M.TECH[s] }))}」</p></div>
      <div class="fin__name fin-txt"><small>${meWin ? '決め技' : '敵の決め技'}</small><b>${esc(M.TECH[s])}</b></div>
      <div class="fin__comm">${Comm(b, ctx)}</div>
    </div>`;
  }

  function CutIn(b, ctx, area, shown, g) {
    if (!window.Mechs || (!shown.length && !b.areaDone)) return '';
    const st = b.areaDone ? 'is-out' : shown.length === 1 ? 'is-in' : 'is-on';
    const stamp = b.areaDone ? `<div class="mx-stamp ${area.win ? 'me' : 'op'}"><b>${area.win ? '陣地確保' : '陥落'}</b><small>${esc(area.subject)}</small></div>` : '';
    const hasAnim = b.areaDone && window.MECH_ANIM && window.Mechs && window.MECH_ANIM[window.Mechs.KEY[area.subject]];
    return `<div class="mx-cut ${st} ${hasAnim ? 'has-anim' : ''} ${b.areaDone && !b.finArea ? 'quick' : ''}" style="--sp:${b.fast ? 0.5 : 1}" role="dialog" aria-label="${esc(area.subject)}の陣地でロボット戦">
      <div class="mx-cut__lines" aria-hidden="true"></div>
      <div class="mx-cut__band">
        <div class="mx-cut__head"><span class="me">${esc(ctx.player.name)}</span><b>第${b.ai + 1}陣 ${esc(area.subject)}</b><span class="op">${esc(b.op.name)}</span></div>
        ${b.areaDone && b.finArea ? Finisher(b, ctx, area) : Clash(b, ctx, area, shown, g)}
        ${stamp}
        <div class="mx-cut__ctl"><button class="btn btn--sub" data-action="mode">${b.full ? '全演出' : '要点'}</button><button class="btn btn--sub" data-action="speed">${b.fast ? '通常速度' : '2倍速'}</button><button class="btn btn--sub" data-action="skip">結果まで飛ばす</button><button class="btn btn--sub" data-action="detail" aria-pressed="${!!b.detail}">詳細</button></div>
      </div>
    </div>`;
  }

  /* 陣地の前の作戦パネル：戦術・単元のバン・介入（引き直し／底上げ）・直接対決 */
  function DecidePanel(b, ctx) {
    const d = b.dec, me = b.me(), op = b.opSide(), now = ctx.now(), sug = suggestTac();
    const uv = (K, u) => Math.round(KN.prob((K.units[KN.key(d.subject, u)] || {}).r || KN.STD - 150, KN.STD) * 100);
    const solvedMe = (u) => solved(me.K, d.subject, u);
    return `<section class="a-decide" style="--sc:${SC(d.subject)}" aria-label="第${b.live.k + 1}陣の作戦">
      <div class="a-decide__head"><span class="eyebrow">第${b.live.k + 1}陣 · 作戦</span><h2>${esc(d.subject)}</h2><span class="muted">陣地 ${b.res.myW}-${b.res.opW}（先に3つ）</span></div>
      <h3>戦術<small>相手は「${esc(TAC[b.hint.style].name)}」を好む。確実→速攻→応用→確実 の順に強い</small></h3>
      <div class="a-tacs">${Object.keys(TAC).map((k) => `<button data-tac="${k}" aria-pressed="${d.tac === k}"><b>${TAC[k].name}</b><small>${TAC[k].desc}</small>${k === sug ? '<em>ナビの提案</em>' : ''}</button>`).join('')}</div>
      <h3>押し合う単元<small>3つから1つ外せる（外さなければ1つは抽選で外れる）</small></h3>
      <div class="a-cands-u">${d.cands.map((u) => `<button data-ban="${esc(u)}" aria-pressed="${d.ban === u}"><b>${esc(u)}</b><small>あなた ${solvedMe(u) ? uv(me.K, u) + '%' : '未学習'} · 相手 ${uv(op.K, u)}%</small>${d.ban === u ? '<em>✕ 外す</em>' : ''}</button>`).join('')}</div>
      <h3>介入<small>この試合で残り ${b.live.uses} 回</small></h3>
      <div class="a-inter">
        <button data-action="redraw" ${b.live.uses > 0 ? '' : 'disabled'}>単元を引き直す</button>
        ${['acc', 'speed', 'app'].map((ax) => `<button data-boost="${ax}" aria-pressed="${d.boost === ax}" ${b.live.uses > 0 || d.boost === ax ? '' : 'disabled'}>${AXL[ax]}を底上げ +10%</button>`).join('')}
      </div>
      <div class="a-decide__go">
        <button class="btn btn--sub" data-action="duel-attack">直接対決で取りにいく</button>
        <button class="btn btn--main" data-action="go">出撃</button>
      </div>
      <label class="a-auto"><input type="checkbox" data-auto ${b.auto ? 'checked' : ''}> 残りの陣地はナビにおまかせ</label>
    </section>`;
  }

  function BattleView(b, ctx) {
    const res = b.res, n = navOf(ctx.D, b.op.nav);
    const playing = b.stage === 'play' && b.ai >= 0, area = playing ? res.areas[b.ai] : null;
    const exn = area && area.ex ? area.ex.length : 0, all = area && area.ex ? area.ex.slice(0, Math.max(0, b.ei)) : [];
    const digest = !b.full;
    // 要点モード：カットインは決め手の押し合い 1 回だけ。ログ（下の一覧）には全部出す
    const keyEx = area && exn ? [area.ex[area.key]] : [];
    const shown = !area ? [] : digest ? (b.ei >= exn && exn ? keyEx : []) : all;
    const log = !area ? [] : digest ? (b.ei >= exn ? area.ex : []) : all;
    const g = !area ? 0 : digest ? (b.ei >= exn ? area.gauge : 0) : shown.length ? shown[shown.length - 1].gauge : 0;
    const done = res.areas.filter((a, i) => !a.skipped && (i < b.ai || (i === b.ai && b.areaDone)));
    return `<div class="match-screen phase-battle" style="--oc:${b.oc}">
      <div class="a-score">
        <div class="me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face' })}<span>${esc(ctx.player.name)}</span><b>${done.filter((a) => a.win).length}</b></div>
        <span class="dash">陣地</span>
        <div class="op"><b>${done.filter((a) => !a.win).length}</b><span>${esc(b.op.name)}</span>${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--op' })}</div>
      </div>
      ${Map3D(' ', FxLayer(b, ctx, g) + (!shown.length && !b.areaDone ? Comm(b, ctx) : ''), b.shake ? 'shake' : '')}
      ${Tiles(b, res)}
      ${b.stage === 'decide' ? DecidePanel(b, ctx) : ''}
      ${area ? CutIn(b, ctx, area, shown, g) : ''}
      ${area ? `<section class="a-arena ${b.areaDone ? (area.win ? 'won' : 'lost') : ''}">
        <div class="a-arena__head"><span class="eyebrow">第${b.ai + 1}陣</span><h2>${esc(area.subject)}</h2>${b.areaDone ? `<span class="a-capture">${area.win ? '⚑ 陣地確保' : '✕ 陣地を奪われた'}</span>` : ''}</div>
        ${Lamps(area, log.length)}
        <div class="a-notes">${area.notesMe.map((x) => `<span class="me">${esc(x)}</span>`).join('')}${area.notesOp.map((x) => `<span class="op">相手：${esc(x)}</span>`).join('')}</div>
        <ol class="a-ex">${(area.ex || []).map((e, k) => {
          if (k >= log.length) return `<li class="wait">${exLabel(e)}<span class="dots">· · ·</span></li>`;
          return `<li class="${e.win ? 'up' : 'down'}">${exLabel(e)}<b class="a">${e.a}</b><span class="vs">vs</span><b class="b">${e.b}</b><span class="d">${e.win ? '⚑ 押し勝ち' : '✕ 押し負け'}</span><span class="why">${esc(explain(e, area.subject, b, ctx))}</span></li>`;
        }).join('')}${area.duelAtk ? `<li class="${area.win ? 'up' : 'down'}">直接対決で決着</li>` : ''}</ol>
      </section>` : ''}
      <div class="a-controls"><button class="btn btn--sub" data-action="mode" aria-pressed="${!!b.full}">${b.full ? '全演出' : '要点モード'}</button><button class="btn btn--sub" data-action="speed">${b.fast ? '通常速度' : '2倍速'}</button><button class="btn btn--sub" data-action="skip">結果まで飛ばす</button><button class="btn btn--sub" data-action="detail" aria-pressed="${!!b.detail}">詳細</button><button class="btn btn--sub a-sfx" data-action="sfx" aria-pressed="${window.SFX && !window.SFX.muted()}" aria-label="効果音">${window.SFX && window.SFX.muted() ? '🔇' : '🔊'}</button></div>
    </div>`;
  }

  /* 戦闘中の詳細：画面を塞がない横スライド。戦闘は止めずに、これまでの陣地の押し合いと補正を全部読める */
  function Detail(b, ctx) {
    const rows = b.res.areas.filter((a) => !a.skipped);
    return `<aside class="slide" aria-label="戦闘の詳細"><div class="slide__head"><span class="eyebrow">戦闘の詳細 · 戦闘は続いています</span><button class="slide__x" data-action="detail" aria-label="閉じる">×</button></div>
      <p class="muted">${esc(ctx.player.name)} ${b.res.myW} − ${b.res.opW} ${esc(b.op.name)}（先に${b.res.need}つ）</p>
      <ul class="rp-list">${rows.length ? rows.map((a) => `<li class="rp-area ${a.win ? 'ok' : 'ng'}" style="--sc:${SC(a.subject)}"><div class="rp-area__h"><b>${esc(a.subject)}</b><span>${a.win ? '確保' : '陥落'}</span></div>
        <small class="muted">${a.notesMe.map(esc).join('・') || '補正なし'}${a.notesOp.length ? ` ／ 相手：${a.notesOp.map(esc).join('・')}` : ''}</small>
        <ul>${(a.ex || []).map((e) => `<li class="${e.win ? 'up' : 'down'}"><span>${e.unit ? esc(e.unit) : '科目全体'} · ${AXL[e.axis]}</span><b>${e.a} vs ${e.b}</b><em>${esc(explain(e, a.subject, b, ctx))}</em></li>`).join('')}${a.duelAtk ? '<li>直接対決で決着</li>' : ''}</ul></li>`).join('') : '<li class="muted">まだ陣地の結果はありません</li>'}</ul>
    </aside>`;
  }

  /* 戦況ダイジェスト：各陣地がどう決まったか（飛ばしたときも、ここで全部追える） */
  function Digest(b, ctx) {
    const rows = b.res.areas.filter((a) => !a.skipped && a.ex);
    return `<section class="r-digest holo-panel ${b.skipped ? 'is-first' : ''}" aria-label="戦況ダイジェスト">
      <div class="missions__head"><span class="eyebrow">戦況ダイジェスト</span><span class="muted">${b.skipped ? '飛ばした戦闘の内容' : '各陣地の決め手'}</span></div>
      <ol>${b.res.areas.filter((a) => !a.skipped).map((a) => { const e = a.ex && (a.ex[a.key] || a.ex[0]); if (!e) return `<li class="${a.win ? 'me' : 'op'}"><b class="s" style="--sc:${SC(a.subject)}">${esc(a.subject)}</b><span class="r">${a.win ? '⚑ 確保' : '✕ 陥落'}</span><span></span><small>直接対決で決着</small></li>`; return `<li class="${a.win ? 'me' : 'op'}">
        <b class="s" style="--sc:${SC(a.subject)}">${esc(a.subject)}</b><span class="r">${a.win ? '⚑ 確保' : '✕ 陥落'}${a.duel ? '（直接対決で奪還）' : ''}</span>${Lamps(a)}
        <small>${AXL[e.axis]}${e.unit ? '・' + esc(e.unit) : ''} ${e.a} vs ${e.b} — ${esc(explain(e, a.subject, b, ctx))}</small></li>`; }).join('')}</ol>
    </section>`;
  }

  function ResultView(b, ctx) {
    const res = b.res, an = analyze(res), r = b.ranks, rpd = b.rpNow;
    const ev = res.win ? 'win' : 'lose';
    const weak = an.weak ? `${an.weak.unit || an.weak.subject}の${AXL[an.weak.axis]}` : '';
    const line = b.duelMsg || fmt(ctx.char.battleLines[ev], { weak });
    const promoted = r.after.label !== r.before.label;
    return `<div class="match-screen phase-result ${res.win ? 'is-win' : 'is-lose'}" style="--oc:${b.oc}">
      <header class="r-head"><span class="eyebrow">RANK MATCH RESULT · VS ${esc(b.op.name)}</span><strong>${res.win ? 'WIN' : 'LOSE'}</strong><span class="r-score">${res.myW} <small>陣地</small> ${res.opW}${b.flipped ? ' <small class="flip">直接対決で逆転</small>' : ''}</span></header>
      ${Digest(b, ctx)}
      ${Map3D()}
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
        ${(() => { const gs = []; b.res.areas.forEach((a) => (a.ex || []).forEach((e) => { const g = e.unit && e.win ? gainOf(b, ctx, a.subject, e.unit) : 0; if (g >= 0.05) gs.push({ a, e, g }); }));
          return gs.length ? `<div class="r-gain"><b>今日の勉強が変えた押し合い</b><ul>${gs.map((x) => `<li><span style="--sc:${SC(x.a.subject)}">${esc(x.a.subject)}</span>${esc(x.e.unit)}の${AXL[x.e.axis]}：正答予測 <em>+${Math.round(x.g * 100)}%</em> で押し勝ち</li>`).join('')}</ul></div>` : ''; })()}
        ${an.lost.length ? `<ul class="a-why">${an.lost.map((l) => `<li>
            <span><b>${esc(l.subject)}</b>${needOf(b, ctx, l.subject, l.e) ? `<em class="a-need">${esc(needOf(b, ctx, l.subject, l.e))}</em>` : ''}：${l.unit ? `<b class="u">${esc(KN.meta(l.subject, l.unit).field)} › ${esc(l.unit)}</b>の` : ''}${AXL[l.axis]}で押し負け <em>${l.a} vs ${l.b}</em>
              ${l.unit ? (() => { const A = KN.unitDetail(b.me().K, l.subject, l.unit, ctx.now()), B = KN.unitDetail(b.opSide().K, l.subject, l.unit, ctx.now()); const f = (d) => (d.status === 'new' ? '未学習' : `正答予測${pc(d.p)}・定着${pc(d.R)}・${d.sec}秒`); return `<small class="a-why__cmp"><span class="me">あなた ${f(A)}</span><span class="op">相手 ${f(B)}</span></small>`; })() : ''}</span>
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
      <header class="m-head"><button class="link" data-action="duel-cancel">${d.attack ? '← 作戦に戻る' : '← リザルトへ'}</button><span class="eyebrow">DIRECT MATCH</span></header>
      <h1 class="m-title">直接対決：${esc(d.subject)}</h1>
      <div class="a-vs">
        <div class="a-vs__side me">${UI.Portrait({ char: ctx.char, cls: 'portrait--face portrait--vs' })}<b>${esc(ctx.player.name)}</b></div>
        <div class="a-rate"><span>問題数</span><b>${d.qs.length}<small>問</small></b></div>
        <div class="a-vs__side op">${UI.Portrait({ char: n.char, cls: 'portrait--face portrait--vs portrait--op' })}<b>${esc(b.op.name)}</b></div>
      </div>
      <section class="m-panel m-rules"><h2 class="panel__title">ルール</h2><ul>
        <li>両者が<b>同じ${d.qs.length}問</b>を解く（自動戦闘で押し合った単元から優先して出題）</li>
        <li>正解 1 点。<b>勝負問</b>は正解 3 点・不正解 −1 点。点の多いほうの勝ち、同点なら<b>合計時間</b>が短いほう。1問${RULE.duelSec}秒</li>
        <li>${d.attack ? `勝てば<b>${esc(d.subject)}の陣地を確保</b>、負ければ陥落` : `勝てば<b>${esc(d.subject)}の陣地を奪還</b>。結果がひっくり返ることもある`}</li>
        <li>解いた結果はあなたの知識データにも反映される</li>
      </ul><p class="muted">本番では、相手もあとで同じ問題を解いて決着します（試作では相手の知識データから回答を予測）。</p></section>
      <section class="m-panel"><h2 class="panel__title">勝負問を選ぶ<small class="panel__note">何問目で勝負をかけるか（問題は始まるまで見えない）</small></h2>
        <div class="d-bets">${d.qs.map((q, k) => `<button data-bet="${k}" aria-pressed="${d.bet === k}">Q${k + 1}<small>${'★'.repeat(q.difficulty)}</small></button>`).join('')}</div></section>
      ${NavLine(ctx, ctx.char.lines.match, 'serious')}
      <button class="btn btn--main" data-action="duel-start" ${d.bet == null ? 'disabled' : ''}>${d.bet == null ? '勝負問を選んでください' : '直接対決を始める'}</button>
    </div>`;
  }

  function DuelQ(b, ctx) {
    const d = b.duel, q = d.qs[d.i], a = d.me[d.i], rev = !!a;
    return `<div class="match-screen phase-${rev ? 'reveal' : 'question'}" style="--oc:${b.oc}">
      <div class="m-board">
        <div class="m-side me"><small>直接対決 · ${esc(d.subject)}</small><b>${d.me.filter((x) => x.correct).length}<small>正解</small></b></div>
        <div class="m-round"><span>Q${d.i + 1}<small>/${d.qs.length}</small></span>${d.i === d.bet ? '<em class="d-betmark">勝負問</em>' : ''}</div>
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
      <header class="r-head"><span class="eyebrow">DIRECT MATCH · ${esc(d.subject)}</span><strong class="d-word">${d.win ? (d.attack ? '陣地確保' : '陣地奪還') : d.attack ? '陥落' : '防衛された'}</strong><span class="r-score">${d.mp} <small>点</small> ${d.opp}</span></header>
      <section class="r-review holo-panel">
        <div class="d-row d-head"><span>問題</span><span class="me">あなた</span><span class="op">${esc(b.op.name)}</span></div>
        ${d.qs.map((q, k) => `<div class="d-row ${k === d.bet ? 'is-bet' : ''}"><span class="qq"><small>${k === d.bet ? '勝負問 · ' : ''}${esc(q.unit)}</small>${esc(q.q)}</span><span class="me ${d.me[k].correct ? 'ok' : 'ng'}">${d.me[k].correct ? '○' : '×'} <small>${d.me[k].time != null ? d.me[k].time.toFixed(1) + 's' : '—'}</small></span><span class="op ${d.op[k].correct ? 'ok' : 'ng'}">${d.op[k].correct ? '○' : '×'} <small>${d.op[k].time.toFixed(1)}s</small></span></div>`).join('')}
        <div class="d-row d-total"><span>合計</span><span class="me">${mc}問 <small>${sum(d.me).toFixed(1)}s</small></span><span class="op">${oc}問 <small>${sum(d.op).toFixed(1)}s</small></span></div>
      </section>
      ${b.flipped ? '<p class="d-flip">陣地の奪還で試合結果が逆転しました</p>' : ''}
      ${NavLine(ctx, d.win ? fmt(ctx.char.battleLines.areaWin, { subject: d.subject }) : fmt(ctx.char.battleLines.areaLose, { subject: d.subject }), d.win ? 'smile' : 'special')}
      <button class="btn btn--main" data-action="duel-done">${d.attack ? '戦闘に戻る' : 'リザルトに戻る'}</button>
    </div>`;
  }

  /* ================= 進行 ================= */
  let b = null, ctx = null, root = null, timer = null, tick = null, t3 = null;
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stop = () => { clearTimeout(timer); timer = null; clearInterval(tick); tick = null; };

  function draw() {
    const v = { pick: PickView, plan: PlanView, battle: BattleView, result: ResultView, duel: DuelIntro, duelq: DuelQ, duelres: DuelResult }[b.phase];
    const sy = root.querySelector('.slide'), top = sy ? sy.scrollTop : 0;
    root.innerHTML = `<div class="screen screen--match">${v(b, ctx)}</div>${b.detail && b.phase === 'battle' ? Detail(b, ctx) : ''}`;
    const sl = root.querySelector('.slide'); if (sl) sl.scrollTop = top;
    attach3d();
    if (b.phase === 'result' && !b.animated) { b.animated = true; animateResult(); }
    const nx = root.querySelector('.js-next'); if (nx) nx.focus({ preventScroll: true });
  }

  /* 3Dマップ：キャンバスは1つを使い回し、再描画のたびに新しい置き場所へ移す */
  function attach3d() {
    const host = root.querySelector('.a-3d'); if (!host || !b.op) return;
    const colors = { me: ctx.type.color, op: b.oc }, look = Object.assign({ flag: b.op.name }, b.op.look || {});
    const key = window.Terrain ? window.Terrain.keyOf(b.op.order, colors, look) : '';
    if (!t3 || t3.key !== key) { if (t3) t3.destroy(); t3 = window.Terrain ? window.Terrain.create(b.op.order, colors, look) : null; }
    if (!t3) { host.hidden = true; return; }
    host.appendChild(t3.canvas); t3.resize();
    t3.setState(b.op.order.map((sub) => (b.phase === 'plan' ? 'pending' : stateOf(b, sub))), { me: b.focus });
  }
  const drop3d = () => { if (t3) { t3.destroy(); t3 = null; } };
  const onResize = () => { if (t3) t3.resize(); };

  function candidates() {
    const rp = ctx.player.rank.rp, pool = ctx.opponents.slice().sort(() => Math.random() - 0.5);
    const out = [];
    [pool.filter((o) => o.rp < rp - 50), pool.filter((o) => Math.abs(o.rp - rp) <= 120), pool.filter((o) => o.rp > rp + 50)].forEach((g) => { const o = g.find((x) => !out.includes(x)); if (o) out.push(o); });
    pool.forEach((o) => { if (out.length < 3 && !out.includes(o)) out.push(o); });
    return out.sort((x, y) => x.rp - y.rp);
  }

  /* 開戦前に見えるヒント：防衛順と主戦場は断片だけ */
  function hintsOf(o, K, S) {
    const r = KN.rng(KN.hash(o.id + 'hint')), other = SUBJECTS.filter((x) => x !== o.focus && (!b.active || b.active.includes(x)));
    const fc = [o.focus, other[Math.floor(r() * other.length)]].sort();
    const us = []; SUBJECTS.forEach((s) => (KN.units()[s] || []).forEach((u) => { const x = K.units[KN.key(s, u)]; if (x && x.n >= RULE.minSolved) us.push({ s, u, p: KN.prob(x.r, KN.STD) }); }));
    us.sort((a, b) => b.p - a.p);
    return { gate: o.order.find((x) => !b.active || b.active.includes(x)), focus: fc, style: styleOf(o), strong: us[0], weak: us[us.length - 1] };
  }

  function choose(id) {
    const o = ctx.opponents.find((x) => x.id === id), n = navOf(ctx.D, o.nav);
    b.op = o; b.oc = n.type.id === ctx.type.id ? '#D9DFEF' : n.type.color; b.focus = ctx.player.focus; b.phase = 'plan';
    const opK = ctx.opK(o), opS = ctx.opStats(o);
    b.focusUnit = null;
    b.active = (ctx.examSet && ctx.examSet()) || SUBJECTS;
    b.order = SUBJECTS.filter((s) => b.active.includes(s)).sort((x, y) => (power(ctx.player.stats[y]) - power(opS[y])) - (power(ctx.player.stats[x]) - power(opS[x]))); // 初期値：有利な科目から
    b.hint = hintsOf(o, opK, opS);
    if (ctx.privacy && !ctx.privacy().units) { b.hint.strong = null; b.hint.weak = null; b.hint.hidden = true; } // 自分が非公開なら相手のも見えない
    if (!b.active.includes(b.focus)) b.focus = b.order[0];
    b.me = () => ({ K: ctx.myK(), S: ctx.player.stats, focus: b.focus, order: b.order, focusUnit: b.focusUnit, active: b.active });
    b.opSide = () => ({ K: opK, S: opS, focus: o.focus, order: o.order, active: b.active });
    draw();
  }

  /* 開戦：挑戦権を使い、陣地を 1 つずつ「作戦（戦術・バン・介入）→ 戦闘」で進める。RP は試合が決まった瞬間に反映 */
  function fight() {
    if (ctx.player.tickets.now <= 0) return;
    ctx.useTicket();
    const seed = Math.floor(Math.random() * 1e9);
    b.res = { areas: [], myW: 0, opW: 0, win: false, seed, need: needWin(b.order.length) };
    b.prevP = ctx.player.lastP || null; // 「前回の対戦より伸びた」を出すための基準
    b.live = { r: KN.rng(seed), mom: 0, k: 0, uses: RULE.uses };
    // 決め技のフル演出の対象：前の試合から装甲の段階が上がった科目（昇格は決着の瞬間に判定）
    const P = ctx.player, lv = {}; SUBJECTS.forEach((s) => { lv[s] = window.Mechs ? window.Mechs.level(P.stats[s].coverage || 0) : 0; });
    b.lvUp = SUBJECTS.filter((s) => P.lastLv && lv[s] > (P.lastLv[s] || 0)); P.lastLv = lv;
    b.finSet = new Set();
    if (b.full == null) b.full = false; // 標準は要点モード
    b.phase = 'battle'; b.stage = 'start'; b.ai = -1; b.ei = -1; b.areaDone = false; b.line = ctx.char.catch; b.expr = 'serious';
    b.fx = { kind: 'start' }; commSay(b, ctx, 'start', null, 'serious');
    show();
    if (t3) { t3.intro(); t3.focus(null); }
    clearTimeout(timer); timer = setTimeout(nextArea, reduce() ? 300 : (b.fast ? 0.5 : 1) * (b.full ? 1900 : 900));
  }
  const decided = () => b.res.myW >= b.res.need || b.res.opW >= b.res.need;
  const ti = (subject) => b.op.order.indexOf(subject); // 地図上の位置
  /* 次の陣地：作戦パネルを出す（おまかせなら自動で決めて出撃） */
  function nextArea() {
    clearTimeout(timer);
    if (decided() || b.live.k >= b.order.length) { endMatch(); return; }
    const subject = b.order[b.live.k];
    b.dec = { subject, cands: drawUnits(b.me(), b.opSide(), subject, b.live.r, 3), ban: null, tac: null, boost: null };
    b.dec.tac = suggestTac(); b.stage = 'decide'; b.comm = null;
    if (t3) t3.focus(ti(subject));
    if (b.auto) { autoDecide(); go(); return; }
    show();
  }
  /* ナビの提案：相手の傾向に相性で勝つ戦術。バンは自分が最も不利な単元 */
  function suggestTac() { const st = b.hint.style; return Object.keys(BEATS).find((k) => BEATS[k] === st); }
  function autoDecide() {
    const d = b.dec, me = b.me(), op = b.opSide(), now = ctx.now();
    d.tac = suggestTac();
    const gap = (u) => KN.unitValue(me.K, d.subject, u, 'acc', now) - KN.unitValue(op.K, d.subject, u, 'acc', now);
    d.ban = d.cands.slice().sort((x, y) => gap(x) - gap(y))[0];
  }
  /* 出撃：作戦を反映して陣地を解決し、戦闘の演出へ */
  function go() {
    const d = b.dec, me = b.me(), op = b.opSide();
    if (d.boost) b.live.uses--;
    let units = d.cands.filter((u) => u !== d.ban);
    if (units.length > 2) units.splice(Math.floor(b.live.r() * units.length), 1); // バンしなければ 1 つは抽選で外れる
    const area = resolveArea(me, op, d.subject, b.live.k, b.live.r, ctx.now(), b.live.mom, { units: units.slice(0, 2), tacMe: d.tac, tacOp: opTactic(b.op, b.live.r), focusUnit: b.focusUnit, boost: d.boost });
    pushArea(area);
    b.stage = 'play'; b.ei = -1; b.areaDone = false;
    step();
  }
  function pushArea(area) {
    let k = 0; (area.ex || []).forEach((e, i) => { if ((area.win ? e.d : -e.d) > (area.win ? area.ex[k].d : -area.ex[k].d)) k = i; }); area.key = k;
    b.res.areas.push(area); b.ai = b.res.areas.length - 1;
    area.win ? b.res.myW++ : b.res.opW++; b.live.mom = area.win ? 1 : -1; b.live.k++;
    b.res.win = b.res.myW >= b.res.need;
    if (decided() && !b.ranks) settle();
    b.finArea = b.full || b.finSet.has(b.ai) || (!area.duel && area.win && b.lvUp.includes(area.subject));
  }
  /* 試合が決まった瞬間に RP を反映（ランク昇格したら、決着の陣地は決め技のフル演出） */
  function settle() {
    const K = ctx.myK(), snap = {}; Object.keys(K.units).forEach((k) => { const u = K.units[k]; if (u && u.n) snap[k] = +KN.prob(u.r, KN.STD).toFixed(3); });
    ctx.player.lastP = snap; // 次の対戦の基準（applyBattle で保存される）
    b.rpNow = b.res.win ? b.op.reward.win : b.op.reward.lose;
    b.ranks = ctx.applyBattle({ win: b.res.win, rp: b.rpNow, focus: b.focus, opName: b.op.name });
    if (b.res.win && b.ranks.after.label !== b.ranks.before.label) b.finSet.add(b.res.areas.length - 1);
  }
  function endMatch() {
    b.order.forEach((s) => { if (!b.res.areas.find((a) => a.subject === s)) b.res.areas.push({ subject: s, idx: b.res.areas.length, skipped: true }); });
    if (!b.ranks) settle();
    finish();
  }
  /* 飛ばす：残りの陣地はおまかせで一気に解決 */
  function skipAll() {
    stop(); b.skipped = true;
    while (!decided() && b.live && b.live.k < b.order.length) {
      const subject = b.order[b.live.k];
      if (!b.dec || b.dec.subject !== subject || b.stage !== 'decide') b.dec = { subject, cands: drawUnits(b.me(), b.opSide(), subject, b.live.r, 3), ban: null, tac: null, boost: null };
      autoDecide();
      const d = b.dec, units = d.cands.filter((u) => u !== d.ban).slice(0, 2);
      pushArea(resolveArea(b.me(), b.opSide(), subject, b.live.k, b.live.r, ctx.now(), b.live.mom, { units, tacMe: d.tac, tacOp: opTactic(b.op, b.live.r), focusUnit: b.focusUnit }));
      b.stage = 'play';
    }
    endMatch();
  }
  /* 1回分の描画。演出（fx・揺れ）はその描画でだけ再生する */
  function show() { draw(); b.fx = null; b.shake = false; }
  function schedule(mult = 1) { clearTimeout(timer); const base = reduce() ? 300 : b.fast ? 520 : 1150; timer = setTimeout(step, base * mult); }
  function step() {
    const area = b.res.areas[b.ai];
    if (b.areaDone) { b.areaDone = false; nextArea(); return; }
    if (b.ei < 0) { // 陣地に入る：カメラを寄せる
      b.ei = 0; b.fx = { kind: 'area', idx: b.ai, subject: area.subject }; commSay(b, ctx, 'enter', area.subject, 'serious');
      if (t3) t3.focus(ti(area.subject));
      show(); schedule(b.full ? 1.3 : 0.4); return; // マップで陣地にズームしてからカットイン
    }
    if (!b.full && b.ei < area.ex.length) { // 要点モード：決め手の押し合いだけ見せる（全部の結果はまとめて反映）
      const e = area.ex[area.key]; b.ei = area.ex.length;
      b.fx = null; b.shake = Math.abs(e.d) >= 25 && !reduce();
      if (Math.abs(e.d) >= 25) commSay(b, ctx, e.d > 0 ? 'critMe' : 'critOp', area.subject, e.d > 0 ? 'smile' : 'special'); else b.comm = null;
      if (t3) t3.clash(ti(area.subject), e);
      show(); sfx(e.win ? 'exWin' : 'exLose', 420 + 330); schedule(0.85); return;
    }
    if (b.ei < area.ex.length) { // 押し合い
      const e = area.ex[b.ei]; b.ei++;
      b.fx = { kind: 'ex', e, subject: area.subject }; b.shake = Math.abs(e.d) >= 25 && !reduce();
      if (Math.abs(e.d) >= 25) commSay(b, ctx, e.d > 0 ? 'critMe' : 'critOp', area.subject, e.d > 0 ? 'smile' : 'special'); else b.comm = null;
      if (t3) t3.clash(ti(area.subject), e);
      show(); sfx(e.win ? 'exWin' : 'exLose', (b.ei === 1 ? 420 : 0) + 330); schedule(); return;
    }
    b.areaDone = true;
    b.line = fmt(ctx.char.battleLines[area.win ? 'areaWin' : 'areaLose'], { subject: area.subject });
    b.expr = area.win ? 'smile' : 'special';
    b.fx = { kind: 'cap', win: area.win, subject: area.subject };
    b.comm = { text: b.line, expr: b.expr, key: area.win ? 'win' : 'lose' }; // 決着のセリフもカットインの通信で（ナビのウィンドウは常に 1 つ）
    if (t3) t3.capture(ti(area.subject), area.win ? 'me' : 'op');
    show(); sfx('stamp', b.finArea ? 2700 : 120, area.win);
    const anim = window.MECH_ANIM && window.Mechs && window.MECH_ANIM[window.Mechs.KEY[area.subject]];
    // 決め技シーン（3.5 秒）→スタンプ→抜けてマップへ。要点モードは撃破とスタンプだけで短く抜ける（2倍速なら半分）
    schedule(b.finArea ? (anim ? 4.7 : 4.1) : 0.92);
  }
  /* 効果音（2倍速なら待ち時間も半分） */
  const sfx = (name, ms, ...args) => { if (window.SFX && !reduce()) window.SFX.later(ms * (b && b.fast ? 0.5 : 1), name, ...args); };
  function finish() { stop(); if (t3) t3.focus(null); b.phase = 'result'; draw(); window.scrollTo(0, 0); }
  function navCut(title, line, expr) {
    if (reduce()) return;
    document.querySelectorAll('.cutin').forEach((x) => x.remove());
    const el = document.createElement('div'); el.className = 'cutin cutin--battle';
    el.innerHTML = `${UI.Portrait({ char: ctx.char, expr, cls: 'portrait--cut' })}<div class="cutin__txt"><span class="cutin__comm">NAV COMM · ${esc(ctx.char.name)}</span><strong>${esc(title)}</strong><small>${esc(line)}</small></div>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 1700);
  }

  function animateResult() {
    const rp = root.querySelector('.js-rp'), g = root.querySelector('.js-gauge'); if (!rp) return;
    if (reduce()) { rp.textContent = (+rp.dataset.to).toLocaleString('ja-JP'); g.style.width = g.dataset.to + '%'; return; }
    const from = +rp.dataset.from, to = +rp.dataset.to, t0 = performance.now();
    setTimeout(() => { g.style.width = g.dataset.to + '%'; }, 300);
    const f = (now) => { const p = Math.min(1, (now - t0 - 300) / 900); if (p >= 0) rp.textContent = Math.round(from + (to - from) * p).toLocaleString('ja-JP'); if (p < 1 && b && b.phase === 'result') requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  /* 直接対決 */
  function duelOpen(subject, attack) {
    const area = b.res.areas.find((a) => a.subject === subject && !a.skipped);
    const focusUnits = attack ? b.dec.cands.slice() : area ? area.ex.filter((e) => e.unit).map((e) => e.unit) : [];
    const qs = KN.pickQuestions(ctx.myK(), ctx.bank, subject, RULE.duelQ, ctx.now(), focusUnits, null, ctx.player.qr).map((q) => {
      const order = q.choices.map((_, i) => i).sort(() => Math.random() - 0.5);
      return Object.assign({}, q, { choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) });
    });
    b.duel = { subject, qs, i: 0, me: [], op: [], attack: !!attack, bet: null };
    b.phase = 'duel'; draw(); sfx('duelStart', 0);
  }
  function duelAsk() {
    const d = b.duel; d.t0 = performance.now(); b.phase = 'duelq'; draw();
    requestAnimationFrame(() => requestAnimationFrame(() => { d.t0 = performance.now(); })); // 表示が終わってから計測（練習と同じ基準）
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
    // 点数：正解 1 点。勝負問は正解 3 点・不正解 −1 点。同点なら合計時間が短いほう
    const pts = (arr) => arr.reduce((s, x, k) => s + (k === d.bet ? (x.correct ? 3 : -1) : x.correct ? 1 : 0), 0);
    const sum = (arr) => arr.reduce((s, x) => s + (x.time == null ? RULE.duelSec : x.time), 0);
    d.mp = pts(d.me); d.opp = pts(d.op);
    d.win = d.mp > d.opp || (d.mp === d.opp && sum(d.me) < sum(d.op));
    if (!d.attack) { b.duelUsed = true; if (d.win) { overturn(d.subject); if (ctx.achieve) ctx.achieve('duel'); } }
    else if (d.win && ctx.achieve) ctx.achieve('duel');
    b.phase = 'duelres'; draw(); sfx('duelEnd', 150, b.duel.win);
  }
  /* 攻めの直接対決が終わったら、その陣地の結果として戦闘に戻る */
  function duelBack() {
    const d = b.duel;
    pushArea({ subject: d.subject, idx: b.live.k, ex: [], duelAtk: true, win: d.win, gauge: d.win ? 100 : -100, wins: [d.win ? 2 : 0, d.win ? 0 : 2], notesMe: ['直接対決'], notesOp: [] });
    b.phase = 'battle'; b.stage = 'play'; b.ei = 0; b.areaDone = true; b.finArea = false;
    b.line = fmt(ctx.char.battleLines[d.win ? 'areaWin' : 'areaLose'], { subject: d.subject }); b.expr = d.win ? 'smile' : 'special';
    b.comm = { text: b.line, expr: b.expr, key: d.win ? 'win' : 'lose' };
    if (t3) t3.capture(ti(d.subject), d.win ? 'me' : 'op');
    show(); sfx('stamp', 120, d.win); schedule(0.92);
  }
  function overturn(subject) {
    const res = b.res, wasWin = res.win;
    const area = res.areas.find((a) => a.subject === subject && !a.skipped);
    area.win = true; area.duel = true;
    tally(res);
    // 決着がつかなくなったら、未戦闘の陣地を自動戦闘で続ける
    const r = KN.rng(res.seed + 99);
    res.areas.forEach((a, i) => {
      if (!a.skipped || res.myW >= (res.need || RULE.toWin) || res.opW >= (res.need || RULE.toWin)) return;
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
    if (t.dataset.mv) { const [k, dir] = t.dataset.mv.split(':').map(Number), j = k + dir; if (j >= 0 && j < b.order.length) { [b.order[k], b.order[j]] = [b.order[j], b.order[k]]; draw(); } return; }
    if (t.dataset.tac && b.dec) { b.dec.tac = t.dataset.tac; show(); return; }
    if (t.dataset.ban && b.dec) { b.dec.ban = b.dec.ban === t.dataset.ban ? null : t.dataset.ban; show(); return; }
    if (t.dataset.boost && b.dec) { b.dec.boost = b.dec.boost === t.dataset.boost ? null : b.live.uses > 0 ? t.dataset.boost : null; show(); return; }
    if (t.dataset.bet != null && b.duel) { b.duel.bet = +t.dataset.bet; draw(); return; }
    switch (t.dataset.action) {
      case 'refresh': b.cands = candidates(); draw(); break;
      case 'back': b.phase = 'pick'; draw(); break;
      case 'fight': fight(); break;
      case 'mode': b.full = !b.full; if (b.phase === 'battle') show(); else draw(); break;
      case 'speed': b.fast = !b.fast; draw(); break;
      case 'skip': if (b.phase === 'battle') skipAll(); break;
      case 'detail': b.detail = !b.detail; draw(); break;
      case 'go': if (b.stage === 'decide') go(); break;
      case 'redraw': if (b.stage === 'decide' && b.live.uses > 0) { b.live.uses--; b.dec.cands = drawUnits(b.me(), b.opSide(), b.dec.subject, b.live.r, 3, null); b.dec.ban = null; show(); } break;
      case 'duel-attack': if (b.stage === 'decide') duelOpen(b.dec.subject, true); break;
      case 'sfx': if (window.SFX) window.SFX.toggle(); draw(); break;
      case 'again': drop3d(); b = { phase: 'pick', cands: candidates(), fast: b.fast, full: b.full }; draw(); break;
      case 'duel-cancel': if (b.duel && b.duel.attack) { b.phase = 'battle'; draw(); } else { b.phase = 'result'; draw(); } break;
      case 'duel-start': duelAsk(); break;
      case 'duel-next': duelNext(); break;
      case 'duel-done': if (b.duel && b.duel.attack) duelBack(); else { b.phase = 'result'; draw(); } break;
      case 'train': { const s = t.dataset.subject, u = t.dataset.units ? t.dataset.units.split('|') : []; unmount(); ctx.train(s, u); break; }
      case 'exit': unmount(); ctx.exit(); break;
    }
  }
  /* 作戦画面の入力（重点単元・おまかせ） */
  function onChange(e) {
    if (!b) return;
    if (e.target.matches('[data-fu]')) { b.focusUnit = e.target.value || null; draw(); }
    if (e.target.matches('[data-auto]')) { b.auto = e.target.checked; if (b.auto && b.stage === 'decide') { autoDecide(); go(); } }
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
    root.addEventListener('click', onClick); root.addEventListener('change', onChange); document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    draw();
  }
  function unmount() { stop(); drop3d(); document.querySelectorAll('.cutin').forEach((x) => x.remove()); window.removeEventListener('resize', onResize); if (root) { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); } document.removeEventListener('keydown', onKey); b = null; root = null; }

  window.Battle = { RULE, TAC, BEATS, drawUnits, resolveArea, mount, unmount, resolveBattle, winRate, analyze, totalPower, power, SUBJECTS, AXL };
})();
