/* 学力詳細：科目 › 分野 › 単元 の能力値。各単元から演習へ直接進める。
 * StatsView.render({ player, K, now, subject, power }) → HTML 文字列 */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;
  const pc = (x) => Math.round(x * 100);
  const STATUS = {
    strong: ['安定', 'strong'], ok: ['標準', 'ok'], weak: ['苦手', 'weak'], fading: ['忘れかけ', 'fading'], new: ['未学習', 'new'], soon: ['問題準備中', 'soon'],
  };
  const stars = (w) => '★'.repeat(w) + '☆'.repeat(3 - w);

  function UnitRow(s, d) {
    const [lbl, cls] = STATUS[d.status];
    if (d.status === 'soon') return `<li class="su su--soon"><span class="su__n">${esc(d.unit)}<small>${stars(d.weight)}</small></span><span class="su__chip ${cls}">${lbl}</span></li>`;
    const learned = d.status !== 'new';
    return `<li class="su">
      <span class="su__n">${esc(d.unit)}<small title="出題頻度">${stars(d.weight)}</small></span>
      <span class="su__chip ${cls}">${lbl}</span>
      <span class="su__m" title="標準問題の正答予測（帯は推定の幅）"><i class="bar">${learned ? `<s style="left:${pc(d.lo)}%;width:${pc(d.hi) - pc(d.lo)}%"></s>` : ''}<b style="width:${learned ? pc(d.p) : 0}%"></b></i><em>${learned ? pc(d.p) + '%' : '—'}</em></span>
      <span class="su__cf cf-${d.conf.level}" title="推定の確かさ">${learned ? d.conf.label : '—'}</span>
      <span class="su__m su__m--r" title="定着度"><i class="bar"><b style="width:${learned ? pc(d.R) : 0}%"></b></i><em>${learned ? pc(d.R) + '%' : '—'}</em></span>
      <span class="su__s">${learned ? d.sec + '秒' : '—'}</span>
      <span class="su__c">${d.n}回</span>
      <button class="su__go" data-action="train" data-subject="${esc(s)}" data-units="${esc(d.unit)}" aria-label="${esc(d.unit)}を演習">演習</button>
    </li>`;
  }

  /* 選択科目（理科・社会のみ）：選んだ科目の単元だけが陣地と出題の対象 */
  function Electives(subject, electives) {
    const e = window.ELECTIVES[subject]; if (!e) return '';
    const cur = electives[subject] || [];
    const rule = e.min === e.max ? `${e.min}科目を選ぶ` : `${e.min}〜${e.max}科目を選ぶ`;
    return `<section class="holo-panel sv-elect"><div class="sv-elect__head"><b>${esc(e.label)}の選択科目</b><span class="muted">${rule}。選んだ科目の単元だけが陣地と出題の対象になります</span></div>
      <div class="sv-elect__opts">${e.options.map((t) => `<button class="sv-chip" data-elective="${esc(t)}" data-elective-subject="${esc(subject)}" aria-pressed="${cur.includes(t)}">${esc(t)}</button>`).join('')}</div></section>`;
  }

  function render({ player, K, now, subject, electives }) {
    const S = player.stats, st = S[subject], fields = KN.fieldStats(K, subject, now);
    const all = fields.flatMap((f) => f.units).filter((u) => u.status !== 'soon');
    const fading = all.filter((u) => u.status === 'fading').map((u) => u.unit);
    const weak = all.filter((u) => u.status === 'weak' || u.status === 'new').sort((a, b) => b.weight - a.weight).map((u) => u.unit);
    return `<div class="screen screen--match"><div class="match-screen phase-stats">
      <header class="m-head"><button class="link" data-action="back-home">← ホーム</button><span class="eyebrow">学力詳細</span></header>
      <h1 class="m-title">知識データ</h1>
      <div class="sv-tabs">${KN.SUBJECTS.map((s) => `<button class="sv-tab" data-stats-subject="${s}" aria-pressed="${s === subject}"><b>${s}</b><span>${window.Battle.power(S[s])}</span></button>`).join('')}</div>
      ${window.Mechs ? window.Mechs.Hero(subject, st, getComputedStyle(document.documentElement).getPropertyValue('--theme').trim() || '#3B9BFF') : ''}
      ${Electives(subject, electives || {})}
      <section class="holo-panel sv-sum">
        <div class="sv-sum__axes">${[['正確さ', st.acc], ['速さ', st.speed], ['応用', st.app]].map(([k, v]) => `<div class="sv-ax"><span>${k}</span><i class="bar"><b style="width:${v}%"></b></i><b>${v}</b></div>`).join('')}</div>
        <div class="sv-sum__kv">
          <div><b>${pc(st.coverage)}<small>%</small></b><span>範囲（頻度で重み付け）</span></div>
          <div><b>${pc(st.retention)}<small>%</small></b><span>平均定着度</span></div>
          <div><b>${st.learned}<small>/${st.units}</small></b><span>学習済み単元</span></div>
          <div><b>${pc(st.conf || 0)}<small>%</small></b><span>推定の確かさ</span></div>
        </div>
        ${fading.length || weak.length ? `<div class="sv-todo">${fading.length ? `<button class="btn btn--sub" data-action="train" data-subject="${esc(subject)}" data-units="${esc(fading.join('|'))}">忘れかけ ${fading.length}単元を復習</button>` : ''}${weak.length ? `<button class="btn btn--sub" data-action="train" data-subject="${esc(subject)}" data-units="${esc(weak.slice(0, 3).join('|'))}">苦手・未学習を攻める</button>` : ''}</div>` : ''}
      </section>
      <div class="sv-legend"><span>正答予測</span><span>確かさ</span><span>定着度</span><span>速さ</span><span>回数</span><small>★ は入試での出題頻度。数値は解答データからの推定値で、薄い帯は推定の幅（解くほど狭くなる）。最近解いた同じ問題の正解はほとんど数えません。時間が経つと定着度が下がります。</small></div>
      ${fields.map((f) => `<section class="holo-panel sv-field">
        <div class="sv-field__head"><h2>${esc(f.field)}</h2>${f.ready ? `<span class="sv-field__acc"><i class="bar"><b style="width:${f.acc}%"></b></i><b>${f.acc}</b></span><span class="muted">範囲 ${pc(f.coverage)}%${f.fading ? ` · <em class="warn">忘れかけ${f.fading}</em>` : ''}</span>` : '<span class="muted">問題準備中</span>'}</div>
        <ul class="sv-units">${f.units.map((d) => UnitRow(subject, d)).join('')}</ul>
      </section>`).join('')}
    </div></div>`;
  }

  window.StatsView = { render };
})();
