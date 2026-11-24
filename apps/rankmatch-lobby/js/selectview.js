/* ナビ選択画面（ソシャゲ型）：全面ステージに立ち絵、下に 10 人のロスター、詳細は引き出し、契約は確認→演出。
 * SelectView.render(ctx) → HTML 文字列。立ち絵タップ（話す）は DOM だけ差し替える（talk）。 */
(function () {
  const UI = window.UI, esc = UI.esc;
  const EXPRS = ['default', 'smile', 'special'];

  const artOf = (c, expr) => (c.visual && c.visual.expr && c.visual.expr[expr]) || (c.visual && c.visual.src) || '';
  const lineOf = (c, i) => { const L = [c.catch, c.lines.morning, c.lines.day, c.lines.night, c.lines.match]; return L[i % L.length]; };

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

  /* ロスター：10 人を顔アイコンで。タイプ色の枠＋エンブレム */
  function Roster(D, typeId, gender) {
    return `<nav class="gs-roster" aria-label="ナビゲーター一覧">${D.types.map((t) => ['m', 'f'].map((g) => {
      const c = t.characters[g], on = t.id === typeId && g === gender, f = (c.visual && c.visual.focus) || [50, 20];
      return `<button class="gs-face" data-pick="${t.id}:${g}" style="--c:${t.color};--fx:${f[0]}%;--fy:${f[1]}%" aria-pressed="${on}" aria-label="${esc(c.name)}（${t.name}）">
        <span class="gs-face__img" style="background-image:url('${esc(artOf(c, 'default'))}')"></span>
        <span class="gs-face__emb">${UI.Emblem(t.emblem)}</span><span class="gs-face__name">${esc(c.name)}</span></button>`;
    }).join('')).join('')}</nav>`;
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

  function render({ D, t, c, gender, confirmed, sel }) {
    const expr = EXPRS[sel.expr % EXPRS.length];
    return `<div class="screen screen--gs" style="--c:${t.color}">
      <div class="gs-bg" aria-hidden="true">
        <span class="gs-bg__burst"></span><span class="gs-bg__ring"></span><span class="gs-bg__ring gs-bg__ring--2"></span>
        <span class="gs-bg__word">${t.name}</span><span class="gs-bg__stripe"></span>
        ${Array.from({ length: 14 }, (_, i) => `<i class="gs-spark" style="--i:${i}"></i>`).join('')}
      </div>
      <header class="gs-top">
        <div><span class="eyebrow">NAVIGATOR CONTRACT</span><h1>専属ナビゲーターを選ぶ</h1></div>
        ${confirmed ? '<button class="gs-chip" data-action="back-home">ホームへ戻る</button>' : '<span class="gs-chip gs-chip--ghost">10 人から 1 人</span>'}
      </header>

      <div class="gs-stage" data-key="${c.id}">
        <button class="gs-art" data-action="sel-talk" aria-label="${esc(c.name)}に話しかける">
          <img class="gs-art__img" src="${esc(artOf(c, expr))}" alt="${esc(c.name)}">
        </button>
        <p class="gs-bubble" aria-live="polite">${esc(lineOf(c, sel.line))}</p>

        <div class="gs-plate">
          <span class="gs-plate__type">${UI.Emblem(t.emblem)}${t.name}<small>${t.kana}</small></span>
          <h2 class="gs-plate__name">${esc(c.name)}</h2>
          <span class="gs-plate__sub">${esc(c.romaji || '')}<b>${esc(c.title)}</b></span>
          <p class="gs-plate__tag">${esc(t.tagline)}</p>
        </div>

        <aside class="gs-side">
          ${Radar(D.axes, t.stats)}
          <div class="chips">${t.traits.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
          <p class="gs-side__bio">${esc(c.bio)}</p>
          <p class="gs-advice"><b>${esc(t.advice.name)}</b>${esc(t.advice.desc)}</p>
          <p class="gs-note">対戦の強さはナビで変わりません</p>
        </aside>
      </div>

      <div class="gs-dock">
        ${Roster(D, t.id, gender)}
        <div class="gs-cta">
          <button class="gs-more" data-action="sel-detail">${UI.Emblem(t.emblem)}詳しく見る</button>
          <button class="gs-go" data-action="sel-confirm"><span>${esc(c.name)}と契約する</span><i aria-hidden="true"></i></button>
        </div>
      </div>
      ${sel.detail ? Detail(D, t, c) : ''}
      ${sel.confirming ? Confirm(t, c) : ''}
    </div>`;
  }

  /* 立ち絵タップ：表情とセリフだけ差し替え（入場アニメは再生しない） */
  function talk(root, c, sel) {
    sel.expr++; sel.line++;
    const img = root.querySelector('.gs-art__img'), b = root.querySelector('.gs-bubble');
    if (img) img.src = artOf(c, EXPRS[sel.expr % EXPRS.length]);
    if (b) { b.textContent = lineOf(c, sel.line); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    const art = root.querySelector('.gs-art'); if (art) { art.classList.remove('bounce'); void art.offsetWidth; art.classList.add('bounce'); }
  }

  /* 詳細シート・確認モーダルの開閉（画面全体を描き直さず、入場アニメを繰り返さない） */
  function overlay(root, kind, open, D, t, c) {
    const scr = root.querySelector('.screen--gs'); if (!scr) return;
    const sel = kind === 'detail' ? '.gs-sheet' : '.gs-modal', cur = scr.querySelector(sel);
    if (cur) cur.remove();
    if (open) { scr.insertAdjacentHTML('beforeend', kind === 'detail' ? Detail(D, t, c) : Confirm(t, c)); const f = scr.querySelector(sel + ' button'); if (f) f.focus({ preventScroll: true }); }
  }

  window.SelectView = { render, talk, overlay, artOf };
})();
