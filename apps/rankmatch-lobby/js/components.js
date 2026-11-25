/* UIコンポーネント。すべて「データを受け取ってHTML文字列を返す」純関数。
 * キャラ固有の文言・色・画像パスはここに書かない（data/ から受け取る）。 */
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => Math.max(0, Math.min(100, Math.round((a / b) * 100)));
  const num = (n) => n.toLocaleString('ja-JP');

  /* ---------- エンブレム（色に頼らずタイプを識別する形） ---------- */
  const EMBLEMS = {
    hex: '<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v10M7.5 12h9" stroke="currentColor" stroke-width="2"/>',
    ring: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
    star: '<path d="M12 2l3 7 7 .8-5.2 4.7L18.4 22 12 18l-6.4 4 1.6-7.5L2 9.8 9 9z" fill="currentColor"/>',
    cross: '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
  };
  const Emblem = (kind, cls = '') => `<svg class="emblem ${cls}" viewBox="0 0 24 24" aria-hidden="true">${EMBLEMS[kind] || EMBLEMS.hex}</svg>`;

  /* ---------- 立ち絵が無いときのホログラム・シルエット ---------- */
  const HAIR_BACK = {
    long: 'M58 95C55 48 145 48 142 95L152 214C130 202 70 202 48 214Z',
    longWavy: 'M58 95C52 42 148 42 142 95C150 140 162 172 154 228C136 212 120 222 100 212C80 222 64 212 46 228C38 172 50 140 58 95Z',
    longTied: 'M92 128C84 170 94 205 100 222C106 205 116 170 108 128Z',
    bob: 'M60 100C55 50 145 50 140 100L145 142C130 150 70 150 55 142Z',
    twin: 'M68 78C28 98 26 172 42 214C54 182 58 140 74 100ZM132 78C172 98 174 172 158 214C146 182 142 140 126 100Z',
    sideTail: 'M60 100C55 50 145 50 140 100L142 132C130 138 70 138 58 132ZM136 82C174 108 172 172 152 210C150 172 146 132 128 100Z',
    ponytail: 'M118 66C168 54 180 132 162 182C156 142 146 104 124 86Z',
  };
  const BANGS = 'M62 104C56 46 144 46 138 104C130 88 120 92 112 80C104 94 92 90 86 82C80 94 70 94 62 104Z';
  const HAIR_FRONT = {
    short: 'M64 100C58 48 142 48 136 100C125 80 75 80 64 100Z',
    messy: 'M63 102C55 46 145 46 137 102L128 86L118 98L108 82L96 96L86 82L76 98Z',
    spiky: 'M62 100L54 58L74 70L76 38L92 58L102 30L111 56L128 38L127 66L148 56L138 100C125 82 75 82 62 100Z',
    swept: 'M60 110C50 46 142 36 141 96C122 68 90 72 60 110Z',
    ponytail: 'M63 102C56 48 144 48 137 102C128 84 112 84 100 76C88 84 72 86 63 102Z',
    longTied: 'M62 104C56 46 144 46 138 104C128 80 108 70 100 60C92 70 72 80 62 104Z',
    bob: BANGS, long: BANGS, longWavy: BANGS, twin: BANGS, sideTail: BANGS,
  };
  const ACC = {
    glasses: '<g fill="none" stroke="var(--holo-hi)" stroke-width="2.4"><rect x="70" y="95" width="24" height="14" rx="3"/><rect x="106" y="95" width="24" height="14" rx="3"/><path d="M94 101h12"/></g>',
    visor: '<rect x="64" y="93" width="72" height="15" rx="7" fill="var(--holo-hi)" opacity=".55"/><path d="M70 100h60" stroke="var(--holo-hi)" stroke-width="1.5"/>',
    headset: '<g fill="none" stroke="var(--holo-hi)" stroke-width="3"><path d="M60 104C58 44 142 44 140 104"/><path d="M140 112C142 132 128 140 114 140"/></g><rect x="54" y="98" width="10" height="20" rx="4" fill="var(--holo-hi)"/><rect x="136" y="98" width="10" height="20" rx="4" fill="var(--holo-hi)"/>',
    flower: '<g fill="var(--holo-hi)"><circle cx="134" cy="68" r="6"/><circle cx="144" cy="72" r="6"/><circle cx="140" cy="82" r="6"/><circle cx="128" cy="80" r="6"/></g><circle cx="136" cy="75" r="4" fill="var(--theme)"/>',
    goggles: '<rect x="62" y="62" width="76" height="16" rx="8" fill="var(--holo-hi)" opacity=".8"/><circle cx="84" cy="70" r="6" fill="var(--theme)"/><circle cx="116" cy="70" r="6" fill="var(--theme)"/>',
    band: '<path d="M62 80C80 68 120 68 138 80" fill="none" stroke="var(--holo-hi)" stroke-width="6" stroke-linecap="round"/><path d="M138 80l14-6-4 14z" fill="var(--holo-hi)"/>',
    earring: '<path d="M135 118l5 8-5 8-5-8z" fill="var(--holo-hi)"/>',
    horns: '<path d="M76 62L66 36L86 54ZM124 62L134 36L114 54Z" fill="var(--holo-hi)"/>',
    monocle: '<circle cx="117" cy="102" r="10" fill="none" stroke="var(--holo-hi)" stroke-width="2.4"/><path d="M127 104C134 120 132 140 126 160" fill="none" stroke="var(--holo-hi)" stroke-width="1.2"/>',
    halo: '<ellipse cx="100" cy="38" rx="36" ry="8" fill="none" stroke="var(--holo-hi)" stroke-width="3"/><circle cx="100" cy="30" r="3" fill="var(--holo-hi)"/>',
  };
  function Silhouette(sil) {
    const hair = sil.hair || 'short';
    return `<svg class="sil" viewBox="0 0 200 280" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      ${HAIR_BACK[hair] ? `<path d="${HAIR_BACK[hair]}" fill="var(--holo-hair)"/>` : ''}
      <path d="M18 280C24 206 60 176 100 172C140 176 176 206 182 280Z" fill="var(--holo-body)"/>
      <path d="M100 172l-22 30 22 34 22-34z" fill="var(--holo-hair)" opacity=".5"/>
      <rect x="88" y="128" width="24" height="46" rx="8" fill="var(--holo-body)"/>
      <ellipse cx="100" cy="100" rx="35" ry="41" fill="var(--holo-skin)"/>
      <rect x="78" y="103" width="14" height="4" rx="2" fill="var(--holo-hi)"/><rect x="108" y="103" width="14" height="4" rx="2" fill="var(--holo-hi)"/>
      <path d="${HAIR_FRONT[hair] || HAIR_FRONT.short}" fill="var(--holo-hair)"/>
      ${ACC[sil.accessory] || ''}
    </svg>`;
  }

  /* 立ち絵：portrait（単独立ち絵）→ visual（キービジュアル切り出し）→ シルエット の順で表示。
   * どれを使うかは data 側だけで決まり、コンポーネントは画像パスを知らない。 */
  function Portrait({ char, expr = 'default', cls = '' }) {
    const stand = char.portrait && (char.portrait[expr] || char.portrait.default);
    const v = char.visual;
    let media = '', kind = 'holo';
    if (stand) {
      kind = 'stand';
      const fb = stand !== char.portrait.default ? char.portrait.default || '' : '';
      media = `<img class="portrait__img" src="${esc(stand)}" data-fallback="${esc(fb)}" alt="${esc(char.name)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}else{this.closest('.portrait').dataset.kind='holo';this.remove()}">`;
    } else if (v && v.src) {
      kind = 'kv';
      const vsrc = (v.expr && v.expr[expr]) || v.src; // 表情差分があればその絵
      media = `<img class="portrait__kv" src="${esc(vsrc)}" alt="${esc(char.name)}" style="--ar:${v.w / v.h};--fx:${v.focus[0]};--fy:${v.focus[1]};--zb:${v.zoom || 1}" onerror="this.closest('.portrait').dataset.kind='holo';this.remove()">`;
    }
    return `<figure class="portrait ${cls}" data-kind="${kind}" data-char="${esc(char.id)}" data-expr="${esc(expr)}">
      <div class="portrait__holo">${Silhouette(char.silhouette || {})}</div>${media}
    </figure>`;
  }
  const exprLabel = (data, char, expr) => (char.expressionLabels && char.expressionLabels[expr]) || data.expressions[expr] || '';

  /* ---------- 選択画面 ---------- */
  const TypeTabs = (types, activeId) => `<div class="typetabs" role="tablist" aria-label="ナビゲータータイプ">
    ${types.map((t) => `<button role="tab" class="typetab" data-type="${t.id}" style="--c:${t.color}" aria-selected="${t.id === activeId}">
      ${Emblem(t.emblem)}<span class="typetab__name">${t.name}</span><span class="typetab__sub">${esc(t.characters.m.name)}・${esc(t.characters.f.name)}</span>
    </button>`).join('')}
  </div>`;

  const GenderToggle = (type, g) => `<div class="gender" role="group" aria-label="性別">
    ${['m', 'f'].map((k) => `<button class="gender__btn" data-gender="${k}" aria-pressed="${k === g}">${Portrait({ char: type.characters[k], cls: 'portrait--face' })}<span class="gender__txt"><b>${esc(type.characters[k].name)}</b><small>${k === 'm' ? '男性' : '女性'}</small></span></button>`).join('')}
  </div>`;

  const StatBars = (axes, stats) => `<div class="stats">${axes.map((a, i) => `<div class="stat"><span>${a}</span><i class="stat__bar">${Array.from({ length: 5 }, (_, k) => `<b class="${k < stats[i] ? 'on' : ''}"></b>`).join('')}</i><em>${stats[i]}</em></div>`).join('')}</div>`;

  const NavigatorProfile = (data, type, char) => `<div class="profile">
    <header class="profile__head">
      <span class="tag">${Emblem(type.emblem)}${type.name}<small>${type.kana}</small></span>
      <h2 class="profile__name">${esc(char.name)}<span class="profile__romaji">${esc(char.romaji || '')}</span><small>${esc(char.title)}</small></h2>
      <p class="profile__catch">「${esc(char.catch)}」</p>
    </header>
    <p class="profile__bio">${esc(char.bio)}</p>
    <section class="panel">
      <h3 class="panel__title">性格<small class="panel__note">対戦の強さには影響しません</small></h3>
      <div class="chips">${type.traits.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      ${StatBars(data.axes, type.stats)}
    </section>
    <section class="panel">
      <h3 class="panel__title">向いている学習スタイル</h3>
      <ul class="styles">${type.studyStyle.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="fit"><b>こんな人に</b>${esc(type.fitFor)}</p>
    </section>
  </div>`;

  /* ---------- ホーム ---------- */
  const TopBar = (p, type, char) => `<header class="topbar">
    <button class="me" data-action="change-nav" aria-label="ナビを変更">
      <span class="me__avatar">${Portrait({ char, cls: 'portrait--face' })}<span class="me__emb">${Emblem(type.emblem)}</span></span>
      <span class="me__text"><b>${esc(p.name)}</b><small>${esc(p.id)} · NAV ${esc(char.name)}</small></span>
    </button>
    <div class="wallet"><button class="sfx-btn" data-action="sfx" aria-label="効果音 ${window.SFX && window.SFX.muted() ? 'オフ' : 'オン'}">${window.SFX && window.SFX.muted() ? '🔇' : '🔊'}</button><span><i class="dot coin"></i>${num(p.coins)}</span><button data-action="shop" aria-label="クリスタルを購入"><i class="dot gem"></i>${num(p.crystals)}<b>＋</b></button></div>
  </header>`;

  const RankCard = (r, season) => `<section class="rank holo-panel" aria-label="現在ランク">
    <div class="rank__badge"><b>${esc(r.label)}</b><small>RANK</small></div>
    <div class="rank__body">
      <span class="eyebrow">${esc(season.name)} · W${season.week} · 残り${season.daysLeft}日</span>
      <div class="rank__rp"><b>${num(r.rp)}</b> RP</div>
      <div class="bar"><i style="width:${pct(r.rp - r.floor, r.nextAt - r.floor)}%"></i></div>
      <span class="rank__meta">${esc(r.nextTier)} 昇格まで <b>${num(r.nextAt - r.rp)}</b> RP · 全国 ${num(r.nationalPos)}位 · ${r.winStreak}連勝中</span>
    </div>
  </section>`;

  const LevelCard = (l) => `<section class="tile holo-panel" aria-label="経験値">
    <span class="eyebrow">PLAYER LV</span>
    <div class="lv"><b>${l.lv}</b><span>${num(l.exp)} / ${num(l.next)} EXP</span></div>
    <div class="bar bar--seg"><i style="width:${pct(l.exp, l.next)}%"></i></div>
    <span class="tile__foot">次のLvまで ${num(l.next - l.exp)} EXP</span>
  </section>`;

  function TodayCard(t) {
    const p = pct(t.minutes, t.goalMinutes), C = 2 * Math.PI * 34;
    return `<section class="tile holo-panel today" aria-label="今日の学習量">
      <span class="eyebrow">TODAY</span>
      <div class="today__row">
        <svg class="ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" class="ring__bg"/><circle cx="40" cy="40" r="34" class="ring__fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p / 100)}"/></svg>
        <div class="today__num"><b>${t.minutes}</b><span>/ ${t.goalMinutes}分</span></div>
      </div>
      <div class="today__meta"><span><b>${t.solved}</b>問</span><span>正答<b>${pct(t.correct, t.solved)}</b>%</span><span><b>${t.streakDays}</b>日連続</span></div>
    </section>`;
  }

  const RecommendCard = (rec, type, char) => `<section class="recommend holo-panel" aria-label="次のおすすめ学習">
    <div class="recommend__head"><span class="eyebrow">NEXT · おすすめ学習</span><span class="pill">+${rec.rewardExp} EXP</span></div>
    <h3>${esc(rec.subject)}｜${esc(rec.unit)}</h3>
    <div class="recommend__meta"><span>正答率 <b class="warn">${esc(rec.accuracy)}</b></span><span>${rec.questions}問</span><span>約${rec.minutes}分</span></div>
    <p class="recommend__why"><b>${esc(char.name)}</b>${esc(rec.why || type.recommendPitch)}</p>
    <button class="btn btn--sub" data-action="study">この単元を始める</button>
  </section>`;

  const ArenaCTA = (p, power) => {
    const t = p.tickets, can = t.now > 0, dl = p.defenseLog || [];
    return `<button class="match ${can ? '' : 'is-empty'}" data-action="match">
    <span class="match__glow" aria-hidden="true"></span>
    <span class="match__label">RANK MATCH · 非同期PvP</span>
    <span class="match__title">${can ? 'ランクマッチに挑戦' : '挑戦権を回復しよう'}</span>
    <span class="match__meta"><span class="tix">${Array.from({ length: t.max }, (_, k) => `<i class="${k < t.now ? 'on' : ''}"></i>`).join('')}</span>挑戦権 ${t.now}/${t.max} · 学力 ${num(power)} · 防衛 ${dl.filter((d) => d.win).length}勝${dl.filter((d) => !d.win).length}敗</span>
  </button>`;
  };

  /* 学力ステータス：5科目のレーダー＋科目別の戦力。科目タップで演習へ */
  function StatsCard(stats, focus, power) {
    const S = Object.keys(stats), cx = 70, cy = 70, R = 54, MAX = 300;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / S.length; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const poly = (f) => S.map((s, i) => pt(i, f(s)).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<section class="stats-card holo-panel" aria-label="学力ステータス">
      <div class="missions__head"><span class="eyebrow">知識データ ＝ 対戦の戦力</span><span class="muted">防衛の主戦場 ★${esc(focus)}</span></div>
      <div class="stats-card__body">
        <svg class="radar" viewBox="0 0 140 140" aria-hidden="true">
          ${[1, 0.66, 0.33].map((k) => `<polygon points="${poly(() => R * k)}" class="radar__grid"/>`).join('')}
          ${S.map((s, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar__grid"/>`; }).join('')}
          <polygon points="${poly((s) => (R * power(stats[s])) / MAX)}" class="radar__val"/>
          ${S.map((s, i) => { const [x, y] = pt(i, R + 10); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" class="radar__lbl">${s.slice(0, 1)}</text>`; }).join('')}
        </svg>
        <ul class="stats-list">${S.map((s) => `<li><button data-action="stats" data-subject="${esc(s)}"><span class="s">${esc(s)}${s === focus ? '<i>★</i>' : ''}<small>範囲${Math.round((stats[s].coverage || 0) * 100)}%${stats[s].fading ? `<em>忘${stats[s].fading}</em>` : ''}</small></span><b>${power(stats[s])}</b><span class="ax"><i style="--v:${stats[s].speed}%"></i><i style="--v:${stats[s].acc}%"></i><i style="--v:${stats[s].app}%"></i></span></button></li>`).join('')}</ul>
      </div>
      <p class="stats-card__foot"><span class="k"><i></i>速さ</span><span class="k"><i></i>正確さ</span><span class="k"><i></i>応用</span><span>科目をタップで単元ごとの詳細</span></p>
    </section>`;
  }

  const DefenseLog = (log, def, rate, cap) => `<section class="missions holo-panel defense" aria-label="防衛">
    <div class="missions__head"><span class="eyebrow">防衛編成</span><span class="muted">防衛率の予測 <b>${rate}%</b></span></div>
    <button class="df-sum" data-action="defense">${def.order.map((s, k) => `<span class="${s === def.focus ? 'f' : ''}">${k === 0 ? '<small>城門</small>' : ''}${esc(s)}${s === def.focus ? '★' : ''}</span>`).join('<i>›</i>')}<em>編集</em></button>
    <div class="missions__head" style="margin-top:10px"><span class="eyebrow">防衛記録</span><span class="muted">あなたに挑んだ人 · タップでリプレイ</span></div>
    ${cap ? `<p class="def-cap">防衛で失うRPは1日 ${cap.max} まで（今日 ${cap.lost}/${cap.max}）。防衛戦は4時間に1回、留守中の分はホームを開いたときにまとめて反映（最大3回）</p>` : ''}
    <ul>${log.map((d, i) => `<li class="def ${d.win ? 'ok' : 'ng'}" data-action="replay" data-i="${i}" role="button" tabindex="0" aria-label="${esc(d.name)}との防衛のリプレイ"><span class="def__r">${d.win ? '防衛' : '突破'}</span><span class="def__n"><b>${esc(d.name)}</b><small>${esc(d.rank)} · ${esc(d.ago)}${d.lost && d.lost.length ? ` · 落とした：${d.lost.map(esc).join('・')}` : ''}</small></span><span class="def__s">${esc(d.score)}</span><span class="def__rp">${d.rp > 0 ? '+' : ''}${d.rp}</span><span class="def__go" aria-hidden="true">›</span></li>`).join('')}</ul>
  </section>`;

  const MissionList = (ms) => `<section class="missions holo-panel" aria-label="ミッション">
    <div class="missions__head"><span class="eyebrow">MISSIONS</span><span class="muted">${ms.filter((m) => m.done || m.progress >= m.total).length}/${ms.length} 達成</span></div>
    <ul>${ms.map((m) => {
      const done = m.done || m.progress >= m.total;
      return `<li class="mission ${done ? 'is-done' : ''}">
        <span class="mission__kind">${m.kind}</span>
        <div class="mission__body"><b>${esc(m.title)}</b><div class="bar bar--thin"><i style="width:${pct(m.progress, m.total)}%"></i></div></div>
        <div class="mission__side"><span class="mission__count">${m.progress}/${m.total}${m.unit || ''}</span>${done ? '<button class="claim" data-action="claim" data-id="' + m.id + '">受取</button>' : `<span class="mission__reward">${esc(m.reward)}</span>`}</div>
      </li>`;
    }).join('')}</ul>
  </section>`;

  /* ナビのセリフの差し込み：{weak} などを、いまのプレイヤーの実データ（window.NAV_VARS、app が描画のたびに更新）で埋める */
  const line = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => { const v = window.NAV_VARS && window.NAV_VARS[k]; return v != null ? v : m; });
  const Dialogue = (data, char, line, expr) => `<div class="dialogue" aria-live="polite">
    <span class="dialogue__name">${esc(char.name)}<em>${esc(exprLabel(data, char, expr))}</em></span>
    <p>${esc(line)}</p><i class="dialogue__next" aria-hidden="true">▼</i>
  </div>`;

  const BottomNav = () => `<nav class="bnav" aria-label="メニュー">
    ${[['ホーム', 'M3 11l9-8 9 8v10h-6v-6H9v6H3z', true], ['学習', 'M4 5h7v14H4zM13 5h7v14h-7z'], ['対戦', 'M5 3l7 7-2 2-7-7zM19 3l-7 7 2 2 7-7zM3 21l6-6M21 21l-6-6'], ['マイ陣地', 'M12 2l9 5v10l-9 5-9-5V7zM12 7v10M7.5 9.5l9 5M16.5 9.5l-9 5'], ['ナビ', 'M12 3a5 5 0 110 10 5 5 0 010-10zM4 21c1-4 4-6 8-6s7 2 8 6']]
      .map(([l, d, on]) => `<button class="bnav__item" ${on ? 'aria-current="page"' : ''} ${l === 'ナビ' ? 'data-action="change-nav"' : l === 'マイ陣地' ? 'data-action="base"' : l === '対戦' ? 'data-action="match"' : l === '学習' ? 'data-action="train"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>${l}</button>`).join('')}
  </nav>`;

  window.UI = { line, esc, Emblem, Portrait, TypeTabs, GenderToggle, NavigatorProfile, TopBar, RankCard, LevelCard, TodayCard, RecommendCard, ArenaCTA, StatsCard, DefenseLog, MissionList, Dialogue, BottomNav };
})();
