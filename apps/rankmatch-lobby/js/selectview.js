/* ナビ選択画面（2 段階・ホログラム演出）
 *   STEP 1 タイプを選ぶ：5 タイプをホログラムのエンブレムで並べる
 *   STEP 2 ナビを選ぶ：そのタイプの 2 人をホログラム投影し、タップした方が実体化する
 * SelectView.render(ctx) → HTML 文字列。キャラのタップ・会話・詳細・確認は DOM だけ差し替える（入場演出を繰り返さない）。 */
(function () {
  const UI = window.UI, esc = UI.esc;
  const EXPRS = ['default', 'smile', 'special'];
  const HOLO = '#6FD3FF'; // タイプ未選択時のホログラム色

  const artOf = (c, expr) => (c.visual && c.visual.expr && c.visual.expr[expr]) || (c.visual && c.visual.src) || '';
  const lineOf = (c, i) => { const L = [c.catch, c.lines.morning, c.lines.day, c.lines.night, c.lines.match]; return UI.line(L[i % L.length]); };

  /* 性格の五角形レーダー（強さには関係しない） */
  function Radar(axes, stats) {
    const cx = 60, cy = 60, R = 42, n = axes.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const poly = (r) => axes.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
    const val = stats.map((s, i) => pt(i, (R * s) / 5).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<svg class="gs-radar" viewBox="0 0 120 120" aria-label="性格：${axes.map((a, i) => `${a}${stats[i]}`).join('、')}">
      ${[1, 0.66, 0.33].map((k) => `<polygon points="${poly(R * k)}" class="gs-radar__grid"/>`).join('')}
      <polygon points="${val}" class="gs-radar__val"/>
      ${axes.map((a, i) => { const [x, y] = pt(i, R + 11); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${a}</text>`; }).join('')}
    </svg>`;
  }

  const Bg = (word) => `<div class="gs-bg" aria-hidden="true">
    <span class="gs-bg__burst"></span><span class="gs-bg__ring"></span><span class="gs-bg__ring gs-bg__ring--2"></span>
    ${word ? `<span class="gs-bg__word">${word}</span>` : ''}<span class="gs-bg__grid"></span>
    ${Array.from({ length: 14 }, (_, i) => `<i class="gs-spark" style="--i:${i}"></i>`).join('')}
  </div>`;

  /* ---------- STEP 1：タイプ選択 ---------- */
  function TypeCard(t, i) {
    const ghost = ['m', 'f'].map((g) => { const c = t.characters[g], f = c.visual.focus; return `<span class="tc__ghost tc__ghost--${g}" style="background-image:url('${esc(artOf(c, 'default'))}');--fx:${f[0]}%;--fy:${f[1]}%"></span>`; }).join('');
    return `<button class="tc" data-seltype="${t.id}" style="--c:${t.color};--d:${i * 0.08}s" aria-label="${t.name}（${esc(t.characters.m.name)}・${esc(t.characters.f.name)}）">
      ${ghost}
      <span class="tc__core" aria-hidden="true"><span class="tc__beam"></span><span class="tc__pad"></span><span class="tc__emb">${UI.Emblem(t.emblem)}</span></span>
      <span class="tc__txt">
        <b class="tc__name">${t.name}</b><small class="tc__kana">${t.kana}</small>
        <span class="tc__tag">${esc(t.tagline)}</span>
        <span class="tc__navs">${esc(t.characters.m.name)} <i>/</i> ${esc(t.characters.f.name)}</span>
      </span>
      <span class="tc__go" aria-hidden="true">▶</span>
    </button>`;
  }
  /* 契約中のナビ：閲覧しているだけでは変わらないことを明示 */
  const Current = (cur) => (cur ? `<p class="gs-current">いまの契約：<b>${esc(cur.name)}</b>　見ているだけでは変わりません（「契約する」→ 確認で切り替え）</p>` : '');
  function renderTypes({ D, confirmed, current }) {
    return `<div class="screen screen--gs gs--types" style="--c:${HOLO}">
      ${Bg('')}
      <header class="gs-top">
        <div><span class="eyebrow">NAVIGATOR CONTRACT · STEP 1/2</span><h1>タイプを選ぶ</h1><p class="gs-lead">学び方の相性で選ぼう。どのタイプでも対戦の強さは同じ。</p></div>
        ${confirmed ? '<button class="gs-chip" data-action="back-home">ホームへ戻る</button>' : ''}
      </header>${Current(current)}
      <div class="tc-list">${D.types.map(TypeCard).join('')}</div>
    </div>`;
  }

  /* ---------- STEP 2：ナビ選択（ホログラム投影） ---------- */
  function Proj(c, g, sel, i) {
    const real = sel.picked === g, dim = sel.picked && !real;
    const src = artOf(c, real ? EXPRS[sel.expr % EXPRS.length] : 'default');
    return `<button class="proj ${real ? 'is-real' : ''} ${dim ? 'is-dim' : ''}" data-selchar="${g}" style="--d:${0.15 + i * 0.25}s" aria-pressed="${real}" aria-label="${esc(c.name)}を選ぶ">
      <span class="proj__beam" aria-hidden="true"></span>
      <span class="holo" style="--img:url('${esc(src)}')">
        <img class="holo__img" src="${esc(src)}" alt="">
        <span class="holo__tint" aria-hidden="true"></span><span class="holo__scan" aria-hidden="true"></span>
      </span>
      <span class="proj__pad" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="proj__plate"><b>${esc(c.name)}</b><small>${esc(c.title)}</small></span>
    </button>`;
  }
  function Picked(t, c, sel) {
    if (!c) return `<p class="gs-hint">投影されたナビをタップして選ぼう</p>`;
    return `<div class="gs-pick">
      <p class="gs-bubble">${esc(lineOf(c, sel.line))}</p>
      <div class="gs-cta">
        <button class="gs-more" data-action="sel-detail">${UI.Emblem(t.emblem)}詳しく見る</button>
        <button class="gs-go" data-action="sel-confirm"><span>${esc(c.name)}と契約する</span><i aria-hidden="true"></i></button>
      </div>
    </div>`;
  }
  function renderChars({ t, sel, current }) {
    const c = sel.picked ? t.characters[sel.picked] : null;
    return `<div class="screen screen--gs gs--chars" style="--c:${t.color}">
      ${Bg(t.name)}
      <header class="gs-top">
        <div><span class="eyebrow">NAVIGATOR CONTRACT · STEP 2/2</span><h1>ナビを選ぶ</h1></div>
        <button class="gs-chip" data-action="sel-back">← タイプ選択</button>
      </header>${Current(current)}
      <div class="gs-typebar"><span class="gs-typebar__tag">${UI.Emblem(t.emblem)}${t.name}<small>${t.kana}</small></span><span class="gs-typebar__line">${esc(t.tagline)}</span></div>
      <div class="proj-stage">${['m', 'f'].map((g, i) => Proj(t.characters[g], g, sel, i)).join('')}</div>
      <div class="gs-dock">${Picked(t, c, sel)}</div>
    </div>`;
  }

  function render(ctx) { return ctx.sel.step === 'char' ? renderChars(ctx) : renderTypes(ctx); }

  /* キャラのタップ：選択（実体化）／選択中なら話す。DOM だけ差し替える */
  function pick(root, t, sel, g) {
    if (sel.picked === g) { sel.expr++; sel.line++; } else { sel.picked = g; sel.expr = 0; sel.line = 0; }
    const c = t.characters[g];
    root.querySelectorAll('.proj').forEach((p) => {
      const me = p.dataset.selchar === g;
      p.classList.toggle('is-real', me); p.classList.toggle('is-dim', !me); p.setAttribute('aria-pressed', me);
      if (me) {
        const src = artOf(c, EXPRS[sel.expr % EXPRS.length]), h = p.querySelector('.holo');
        h.style.setProperty('--img', `url('${src}')`); h.querySelector('.holo__img').src = src;
        p.classList.remove('talk'); void p.offsetWidth; p.classList.add('talk');
      }
    });
    const dock = root.querySelector('.gs-dock'); if (dock) dock.innerHTML = Picked(t, c, sel);
  }

  function Detail(D, t, c) {
    return `<div class="gs-sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}のプロフィール">
      <div class="gs-sheet__bg" data-action="sel-detail"></div>
      <section class="gs-sheet__body">
        <header class="gs-sheet__head"><span class="tag">${UI.Emblem(t.emblem)}${t.name}<small>${t.kana}</small></span><button class="gs-x" data-action="sel-detail" aria-label="閉じる">×</button></header>
        <h2>${esc(c.name)}<small>${esc(c.romaji || '')} · ${esc(c.title)}</small></h2>
        <p class="gs-sheet__bio">${esc(c.bio)}</p>
        <div class="gs-sheet__cols">
          <div><h3>性格</h3><div class="chips">${t.traits.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>${Radar(D.axes, t.stats)}<p class="gs-note">性格は会話と助言の内容だけを変えます。対戦の強さには影響しません。</p></div>
          <div><h3>向いている学習スタイル</h3><ul class="styles">${t.studyStyle.map((s) => `<li>${esc(s)}</li>`).join('')}</ul><p class="fit"><b>こんな人に</b>${esc(t.fitFor)}</p>
            <h3>対戦での助言</h3><p class="gs-advice"><b>${esc(t.advice.name)}</b>${esc(t.advice.desc)}</p></div>
        </div>
      </section>
    </div>`;
  }
  function Confirm(t, c) {
    return `<div class="gs-modal" role="dialog" aria-modal="true" aria-label="契約の確認">
      <div class="gs-modal__card">
        <div class="gs-modal__art"><img src="${esc(artOf(c, 'special'))}" alt=""></div>
        <span class="eyebrow">CONTRACT</span>
        <p><b>${esc(c.name)}</b>と契約しますか？</p>
        <small>あとからホームでいつでも変更できます</small>
        <div class="gs-modal__btns"><button class="btn btn--sub" data-action="sel-cancel">もう少し見る</button><button class="btn btn--main" data-action="confirm">${UI.Emblem(t.emblem)}契約する</button></div>
      </div>
    </div>`;
  }
  /* 詳細シート・確認モーダルの開閉（画面全体を描き直さない） */
  function overlay(root, kind, open, D, t, c) {
    const scr = root.querySelector('.screen--gs'); if (!scr) return;
    const s = kind === 'detail' ? '.gs-sheet' : '.gs-modal', cur = scr.querySelector(s);
    if (cur) cur.remove();
    if (open) { scr.insertAdjacentHTML('beforeend', kind === 'detail' ? Detail(D, t, c) : Confirm(t, c)); const f = scr.querySelector(s + ' button'); if (f) f.focus({ preventScroll: true }); }
  }

  window.SelectView = { render, pick, overlay, artOf };
})();
