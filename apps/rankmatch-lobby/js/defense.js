/* 防衛編成：自分の防衛データ（陣地の並び順と防衛時の主戦場）を組む。
 *  - 第1陣は「城門」（守り側 全能力 +2%）、陣地を取った側は次の陣地で「勢い」+3%。並び順で守りの強さが変わる
 *  - 防衛率の予測：今の対戦相手たちが、それぞれの主戦場で攻めてきたときに守り切れる割合（シミュレーション）
 *  - 学力は変わらない。変えられるのは並べ方と主戦場だけ（ナビのタイプは関係ない）
 * ctx = { D, player, type, char, now(), myK(), opponents, opK(o), opStats(o), look(), save(), toast(), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;
  let ctx = null, root = null, st = null, t3 = null;
  const ROLE = ['城門', '第2陣', '中陣', '第4陣', '本丸'];

  /* c を渡せば画面を開いていなくても計算できる（ホームの表示用） */
  function rates(order, focus, c = ctx) {
    const sn = c.player.defense.snap, act = c.examSet ? c.examSet() : null;
    const now = sn ? sn.at : c.now(), me = { K: sn ? sn.K : c.myK(), S: sn ? sn.S : c.player.stats, focus, order, conc: !!c.player.defense.conc };
    const per = c.opponents.map((o) => ({ o, def: 100 - window.Battle.winRate({ K: c.opK(o), S: c.opStats(o), focus: o.focus, active: act }, me, now, 160) }));
    return { avg: Math.round(per.reduce((x, p) => x + p.def, 0) / per.length), per };
  }
  /* いちばん守れる並びを探す（120通りを軽めに試す） */
  function bestOrder(focus) {
    const perm = (a) => (a.length ? a.flatMap((x, i) => perm(a.filter((_, j) => j !== i)).map((r) => [x, ...r])) : [[]]);
    const sn = ctx.player.defense.snap, now = sn ? sn.at : ctx.now(), K = sn ? sn.K : ctx.myK(), S = sn ? sn.S : ctx.player.stats, conc = !!ctx.player.defense.conc;
    const atk = ctx.opponents.map((o) => ({ K: ctx.opK(o), S: ctx.opStats(o), focus: o.focus, active: ctx.examSet() }));
    let best = null;
    perm(KN.SUBJECTS).forEach((order) => {
      let d = 0; atk.forEach((a) => { d += 100 - window.Battle.winRate(a, { K, S, focus, order, conc }, now, 40); });
      if (!best || d > best.d) best = { d, order };
    });
    return best.order;
  }

  const RU = window.Battle.RULE;
  /* 対戦相手たちが主戦場にしがちな科目（集中防衛の読みの材料） */
  const tend = () => { const c = {}; ctx.opponents.forEach((o) => { if (!ctx.examSet || ctx.examSet().includes(o.focus)) c[o.focus] = (c[o.focus] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  /* 登録中の防衛データ：登録した時点の学力で守る。演習で伸びた分は「更新」で反映 */
  function SnapPanel(p) {
    const sn = p.defense.snap, cur = window.Battle.totalPower(p.stats);
    if (!sn) return '';
    const d = cur - sn.total, days = Math.floor((ctx.now() - sn.at) / KN.DAY);
    return `<section class="holo-panel df-snap"><div><span class="eyebrow">登録中の防衛データ</span><b>学力 ${sn.total}</b><small>${days > 0 ? days + '日前' : '今日'}に登録</small></div>
      ${d ? `<p>${d > 0 ? `いまの学力は <b class="up">+${d}</b>。更新すると防衛に反映される` : `いまの学力は <b class="down">${d}</b>（忘れかけ）。登録中のデータで守っている`}</p>` : '<p class="muted">いまの学力と同じ</p>'}
      <button class="btn ${d > 0 ? 'btn--main' : 'btn--sub'}" data-action="df-snap">いまの学力で登録し直す</button></section>`;
  }
  function view() {
    const p = ctx.player, D = p.defense, S = p.stats, R = rates(D.order, D.focus), base = st.base, ex = ctx.examSet();
    const delta = base == null ? 0 : R.avg - base;
    return `<div class="screen screen--match"><div class="match-screen phase-defense">
      <header class="m-head"><button class="link" data-action="df-exit">← ホーム</button><span class="eyebrow">DEFENSE</span></header>
      <h1 class="m-title">防衛編成</h1>
      <p class="a-lede">あなたに挑む相手は、この順番で陣地を攻めてきます。<b>第1陣は城門</b>（守り +${Math.round((RU.gate - 1) * 100)}%）、陣地を取った側は次の陣地で<b>勢い</b> +${Math.round((RU.momentum - 1) * 100)}%。学力は変わらないので、並べ方と主戦場で守りを固めます。</p>
      ${SnapPanel(p)}
      <div class="a-3d df-3d"><span class="a-3d__hint">攻められる順に左から</span></div>
      <section class="df-rate holo-panel">
        <div><span class="eyebrow">防衛率の予測</span><b>${R.avg}<small>%</small></b>${base != null && delta ? `<em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</em>` : ''}</div>
        <ul>${R.per.map(({ o, def }) => `<li><span>${esc(o.name)} <small>${esc(o.rank)}</small></span><i class="bar"><b style="width:${def}%"></b></i><em>${def}%</em></li>`).join('')}</ul>
      </section>
      <section class="m-panel">
        <h2 class="panel__title">陣地の並び（攻められる順）</h2>
        <ol class="df-list">${D.order.map((s, k) => { const off = !ex.includes(s), g = s === ex.find((x) => D.order.indexOf(x) >= 0 && D.order.indexOf(x) === Math.min(...ex.map((y) => D.order.indexOf(y)))); return `<li class="${s === D.focus ? 'is-focus' : ''} ${off ? 'is-off' : ''}">
          <span class="df-role ${g ? 'gate' : ''}">${off ? '対象外' : g ? '城門' : ROLE[k]}${g ? `<small>+${Math.round((RU.gate - 1) * 100)}%</small>` : ''}</span>
          <span class="df-s">${esc(s)}</span>
          <span class="df-pw"><i class="bar"><b style="width:${Math.round(window.Battle.power(S[s]) / 3)}%"></b></i><em>${window.Battle.power(S[s])}</em></span>
          <span class="df-btns">
            <button data-up="${k}" ${k === 0 ? 'disabled' : ''} aria-label="${esc(s)}を前へ">▲</button>
            <button data-down="${k}" ${k === 4 ? 'disabled' : ''} aria-label="${esc(s)}を後ろへ">▼</button>
            <button class="df-star" data-focus="${esc(s)}" ${off ? 'disabled' : ''} aria-pressed="${s === D.focus}" aria-label="${esc(s)}を主戦場にする">★</button>
          </span></li>`; }).join('')}</ol>
        <p class="muted">★＝防衛時の主戦場（全能力 +15%）。${ex.length < 5 ? `受験型の対象は ${ex.map(esc).join('・')} の ${ex.length} 陣地（ほかは対象外）。` : ''}攻める側は対象の陣地の過半数を取れば勝ち。</p>
      </section>
      <section class="m-panel df-conc">
        <h2 class="panel__title">集中防衛<small class="panel__note">相手の主戦場を読む</small></h2>
        <label class="set-row"><input type="checkbox" data-conc ${D.conc ? 'checked' : ''}><span><b>★（${esc(D.focus)}）で相手の主戦場を待ち構える</b><small>読みが当たれば相手の主戦場 +15% を打ち消して、自分が +15%。外れたら自分の主戦場 +15% も無くなる</small></span></label>
        <p class="muted">いまの対戦相手が主戦場にしがちな科目：${tend().map(([s, n]) => `${esc(s)} ${n}人`).join('・')}</p>
      </section>
      <div class="df-actions">
        <button class="btn btn--sub" data-action="df-best">${esc(ctx.char.name)}に最適な並びを聞く</button>
        <button class="btn btn--sub" data-action="df-reset">科目順に戻す</button>
      </div>
      ${st.line ? `<div class="m-nav">${UI.Portrait({ char: ctx.char, expr: 'smile', cls: 'portrait--face portrait--mnav' })}<div class="m-nav__bubble"><b>${esc(ctx.char.name)}</b><p>${esc(st.line)}</p></div></div>` : ''}
    </div></div>`;
  }

  function draw() {
    const y = window.scrollY; root.innerHTML = view(); attach(); window.scrollTo(0, y);
  }
  function attach() {
    const host = root.querySelector('.df-3d'); if (!host || !window.Terrain) { if (host) host.hidden = true; return; }
    const order = ctx.player.defense.order, colors = { me: ctx.type.color, op: ctx.type.color }, look = ctx.look();
    const key = window.Terrain.keyOf(order, colors, look);
    if (!t3 || t3.key !== key) { if (t3) t3.destroy(); t3 = window.Terrain.create(order, colors, look); }
    if (!t3) { host.hidden = true; return; }
    host.appendChild(t3.canvas); t3.resize();
    const ex = ctx.examSet(); t3.setState(order.map((s) => (ex.includes(s) ? 'own' : 'none')), { me: ctx.player.defense.focus });
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !st) return;
    const D = ctx.player.defense, d = b.dataset, mark = () => { if (st.base == null) st.base = rates(D.order, D.focus).avg; };
    if (d.up != null) { mark(); const k = +d.up; [D.order[k - 1], D.order[k]] = [D.order[k], D.order[k - 1]]; st.line = ''; ctx.save(); draw(); return; }
    if (d.down != null) { mark(); const k = +d.down; [D.order[k + 1], D.order[k]] = [D.order[k], D.order[k + 1]]; st.line = ''; ctx.save(); draw(); return; }
    if (d.focus) { mark(); D.focus = d.focus; st.line = ''; ctx.save(); draw(); return; }
    switch (d.action) {
      case 'df-best': {
        mark(); const o = bestOrder(D.focus); D.order = o; ctx.save();
        st.line = `城門は${o[0]}、本丸は${o[4]}。この並びがいちばん守れるはずだよ。`;
        draw(); break;
      }
      case 'df-snap': mark(); ctx.snapDefense(); st.line = '登録したよ。ここからはこの学力で守る。'; draw(); break;
      case 'df-reset': mark(); D.order = KN.SUBJECTS.slice(); st.line = ''; ctx.save(); draw(); break;
      case 'df-exit': unmount(); ctx.exit(); break;
    }
  }
  const onResize = () => { if (t3) t3.resize(); };
  function onChange(e) { if (e.target.dataset.conc == null || !st) return; if (st.base == null) st.base = rates(ctx.player.defense.order, ctx.player.defense.focus).avg; ctx.player.defense.conc = e.target.checked; ctx.save(); draw(); }
  function mount(r, c) { unmount(); root = r; ctx = c; st = { base: null, line: '' }; root.addEventListener('click', onClick); root.addEventListener('change', onChange); window.addEventListener('resize', onResize); draw(); }
  function unmount() { if (t3) { t3.destroy(); t3 = null; } if (root) { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); } window.removeEventListener('resize', onResize); st = null; root = null; }

  window.Defense = { mount, unmount, rates };
})();
