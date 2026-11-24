/* 科目ロボット（試作の仮絵・SVG）。1 科目に 1 体、5 体で 1 部隊。
 * 見た目の成長は「実際の学力」だけで決まる（お金では変えられない）：
 *   装甲  … 範囲（その科目の単元をどれだけ学んだか）。40% / 75% で装甲が増える
 *   コア  … 定着度。高いほど強く光る。60% 未満は機体がくすんでちらつく（忘れかけ）
 *   戦闘力 … 科目の学力（正確さ＋速さ＋応用）
 * 色は所属チームの色（自分＝ナビのタイプ色、相手＝相手のタイプ色）。
 * Mechs.svg(subject, { color, cov, ret }) → SVG 文字列（右向き）。Mechs.card(...) は名前と戦闘力つき。 */
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const INFO = {
    国語: { name: 'ハクビ', en: 'HAKUBI', role: '筆刀の侍機', accent: '#F2EDE0' },
    数学: { name: 'ジオメトラ', en: 'GEOMETRA', role: '幾何演算機', accent: '#9FF0FF' },
    英語: { name: 'ヘラルド', en: 'HERALD', role: '伝令の騎士機', accent: '#FFE08A' },
    理科: { name: 'アトム', en: 'ATOM', role: '試薬砲の実験機', accent: '#B6FF8A' },
    社会: { name: 'ストラテゴ', en: 'STRATEGO', role: '天球儀の賢者機', accent: '#FFB27A' },
  };

  /* 色：M=本体（チーム色）、D=暗部、K=フレーム、A=科目のアクセント、C=コア */
  const P = (pts, f, extra = '') => `<polygon points="${pts}" fill="${f}" ${extra}/>`;
  const legs = (y0 = 92) => `
    ${P(`44,${y0} 56,${y0} 54,${y0 + 26} 58,${y0 + 46} 40,${y0 + 46} 44,${y0 + 26}`, 'var(--D)')}
    ${P(`64,${y0} 76,${y0} 80,${y0 + 26} 82,${y0 + 46} 64,${y0 + 46} 66,${y0 + 26}`, 'var(--D)')}
    ${P(`41,${y0 + 22} 57,${y0 + 22} 55,${y0 + 32} 43,${y0 + 32}`, 'var(--M)')}${P(`64,${y0 + 22} 80,${y0 + 22} 81,${y0 + 32} 66,${y0 + 32}`, 'var(--M)')}
    ${P(`36,${y0 + 46} 60,${y0 + 46} 62,${y0 + 52} 34,${y0 + 52}`, 'var(--K)')}${P(`62,${y0 + 46} 86,${y0 + 46} 88,${y0 + 52} 60,${y0 + 52}`, 'var(--K)')}`;
  const core = (x, y, r = 6) => `<g class="mech__core"><circle cx="${x}" cy="${y}" r="${r + 5}" fill="var(--C)" opacity=".25"/><circle cx="${x}" cy="${y}" r="${r}" fill="var(--C)"/><circle cx="${x - r / 3}" cy="${y - r / 3}" r="${r / 3}" fill="#fff" opacity=".8"/></g>`;

  const BODY = {
    /* 国語：筆刀を構えた侍。兜の鍬形、肩の大袖、草摺 */
    国語: (lv) => `
      ${legs()}
      ${lv >= 1 ? `${P('40,86 52,86 50,104 38,102', 'var(--M)')}${P('68,86 80,86 82,102 70,104', 'var(--M)')}${P('52,86 68,86 66,100 54,100', 'var(--D)')}` : ''}
      ${P('42,52 78,52 82,70 74,90 46,90 38,70', 'var(--M)')}${P('50,56 70,56 72,70 60,80 48,70', 'var(--D)')}
      ${P('30,52 42,50 44,72 32,76', 'var(--K)')}${P('78,50 92,54 90,76 76,72', 'var(--K)')}
      ${lv >= 2 ? `${P('22,46 44,44 46,62 26,70', 'var(--M)')}${P('76,44 98,46 96,70 74,62', 'var(--M)')}${P('24,50 42,48 43,52 25,55', 'var(--A)')}` : ''}
      ${P('86,74 94,72 96,80 88,82', 'var(--K)')}
      <g class="mech__weapon">${P('90,78 96,76 118,18 114,16', 'var(--A)')}${P('112,14 120,12 118,22', 'var(--D)')}${P('86,80 100,74 101,78 87,84', 'var(--K)')}</g>
      ${P('50,30 70,30 74,46 66,54 54,54 46,46', 'var(--M)')}${P('52,40 68,40 66,46 54,46', 'var(--C)', 'class="mech__eye"')}
      ${P('60,30 44,10 50,10 60,24', 'var(--A)')}${P('60,30 76,10 70,10 60,24', 'var(--A)')}${P('56,26 64,26 62,32 58,32', 'var(--A)')}
      ${core(60, 66)}`,
    /* 数学：三角と六角でできた演算機。単眼、コンパス槍、周回する立方体 */
    数学: (lv) => `
      ${legs()}
      ${P('34,50 86,50 60,94', 'var(--M)')}${P('46,56 74,56 60,82', 'var(--D)')}
      ${P('22,48 38,48 34,66', 'var(--A)')}${P('82,48 98,48 86,66', 'var(--A)')}
      ${P('30,62 38,62 36,84 28,84', 'var(--K)')}${P('84,62 92,62 94,82 86,84', 'var(--K)')}
      <g class="mech__weapon">${P('92,82 96,82 116,26 112,24', 'var(--A)')}${P('96,82 100,80 116,40 113,38', 'var(--K)')}<circle cx="114" cy="24" r="4" fill="var(--C)"/></g>
      ${P('60,14 76,32 60,50 44,32', 'var(--M)')}${P('60,22 68,32 60,42 52,32', 'var(--D)')}<circle class="mech__eye" cx="60" cy="32" r="5" fill="var(--C)"/>
      ${lv >= 1 ? `${P('40,90 52,90 50,98 42,98', 'var(--M)')}${P('68,90 80,90 78,98 70,98', 'var(--M)')}${P('56,8 64,8 60,2', 'var(--A)')}` : ''}
      ${lv >= 2 ? `<g class="mech__orbit"><rect x="10" y="30" width="9" height="9" fill="var(--A)" transform="rotate(20 14 34)"/><rect x="100" y="90" width="8" height="8" fill="var(--A)" transform="rotate(-15 104 94)"/><rect x="18" y="104" width="7" height="7" fill="var(--M)" transform="rotate(35 21 107)"/></g>` : ''}
      ${core(60, 64, 5)}`,
    /* 英語：羽飾りの騎士。大盾（A の紋章）とペン型の槍、背中のアンテナ翼 */
    英語: (lv) => `
      ${lv >= 2 ? `${P('46,52 20,22 26,20 52,48', 'var(--A)')}${P('74,52 96,16 102,20 78,50', 'var(--A)')}` : ''}
      ${legs()}
      ${P('42,50 78,50 80,86 70,94 50,94 40,86', 'var(--M)')}${P('50,58 70,58 68,80 52,80', 'var(--D)')}
      ${P('32,50 44,48 46,66 34,68', 'var(--K)')}${P('76,48 90,50 88,68 76,66', 'var(--K)')}
      <g class="mech__weapon">${P('88,72 94,70 118,30 115,28', 'var(--K)')}${P('113,26 120,22 118,32', 'var(--A)')}</g>
      ${P('14,56 40,52 42,86 28,100 14,86', 'var(--M)')}${P('18,60 37,57 38,84 28,94 18,84', 'var(--D)')}
      <text x="28" y="84" font-family="Georgia,serif" font-weight="700" font-size="22" fill="var(--A)" text-anchor="middle">A</text>
      ${lv >= 1 ? `${P('38,88 82,88 84,98 36,98', 'var(--K)')}${P('16,52 40,48 41,54 17,58', 'var(--A)')}` : ''}
      ${P('48,28 72,28 76,44 68,52 52,52 44,44', 'var(--M)')}${P('50,38 70,38 68,42 52,42', 'var(--C)', 'class="mech__eye"')}
      ${P('60,28 58,8 64,4 66,10 62,28', 'var(--A)')}
      ${core(60, 70)}`,
    /* 理科：球体の重機。胸の反応炉と電子の軌道、テスラ腕 */
    理科: (lv) => `
      ${legs(96)}
      <ellipse cx="60" cy="70" rx="30" ry="28" fill="var(--M)"/><ellipse cx="60" cy="72" rx="22" ry="20" fill="var(--D)"/>
      ${P('24,58 34,56 34,90 22,92', 'var(--K)')}${P('86,56 96,58 98,92 86,90', 'var(--K)')}
      <g class="mech__weapon"><rect x="96" y="70" width="10" height="20" fill="var(--K)"/><circle cx="101" cy="66" r="7" fill="var(--A)"/><path d="M101 58 l6 -10 l-4 0 l6 -10" stroke="var(--C)" stroke-width="2" fill="none" class="mech__bolt"/></g>
      ${P('14,84 24,80 26,96 16,98', 'var(--A)')}
      ${lv >= 1 ? `<path d="M30 54 Q60 34 90 54" fill="none" stroke="var(--K)" stroke-width="6"/>${P('42,94 78,94 74,102 46,102', 'var(--M)')}` : ''}
      <ellipse cx="60" cy="38" rx="16" ry="13" fill="var(--M)"/><path d="M46 38 A14 12 0 0 1 74 38 Z" fill="var(--A)" opacity=".55"/><rect class="mech__eye" x="52" y="38" width="16" height="4" fill="var(--C)"/>
      ${lv >= 2 ? `<g class="mech__orbit"><ellipse cx="60" cy="72" rx="36" ry="10" fill="none" stroke="var(--A)" stroke-width="1.6" transform="rotate(-20 60 72)"/><ellipse cx="60" cy="72" rx="36" ry="10" fill="none" stroke="var(--A)" stroke-width="1.6" transform="rotate(25 60 72)"/></g>` : ''}
      ${core(60, 72, 9)}`,
    /* 社会：無限軌道の重砲撃機。肩の主砲、地図のバイザー、旗 */
    社会: (lv) => `
      ${P('28,112 92,112 98,124 92,136 28,136 22,124', 'var(--K)')}<g class="mech__tread">${[30, 42, 54, 66, 78, 90].map((x) => `<circle cx="${x}" cy="124" r="5" fill="var(--D)"/>`).join('')}</g>
      ${P('36,92 84,92 88,112 32,112', 'var(--D)')}
      ${P('30,52 90,52 94,90 26,90', 'var(--M)')}${P('40,58 80,58 82,84 38,84', 'var(--D)')}
      <g class="mech__weapon">${P('70,40 112,34 114,44 72,50', 'var(--K)')}${P('110,32 120,31 120,47 112,46', 'var(--A)')}${P('62,38 78,36 80,54 64,56', 'var(--M)')}</g>
      ${P('18,56 30,54 32,82 20,84', 'var(--K)')}
      ${lv >= 1 ? `${P('22,90 98,90 96,98 24,98', 'var(--M)')}${P('26,48 46,46 46,54 26,56', 'var(--A)')}` : ''}
      ${lv >= 2 ? `<path d="M30 52 L30 18" stroke="var(--K)" stroke-width="2"/>${P('30,18 48,22 30,30', 'var(--A)', 'class="mech__flag"')}` : ''}
      ${P('44,30 70,30 74,48 40,48', 'var(--M)')}<rect class="mech__eye" x="46" y="36" width="24" height="7" fill="var(--C)"/>
      <path d="M50 36v7M56 36v7M62 36v7M46 39.5h24" stroke="var(--D)" stroke-width=".8"/>
      ${core(60, 72, 7)}`,
  };

  const level = (cov) => (cov >= 0.75 ? 2 : cov >= 0.4 ? 1 : 0);
  const KEY = { 国語: 'ja', 数学: 'ma', 英語: 'en', 理科: 'sc', 社会: 'so' };
  /* 本番絵：assets/mechs/{key}_lv{1-3}.webp（本体）＋ _m.webp（チーム色を乗せる範囲）。無いレベルは近いレベルで代用 */
  function artOf(subject, lv) {
    const A = window.MECH_ART || {}, k = KEY[subject];
    for (const n of [lv + 1, 2, 3, 1]) if (A[`${k}_lv${n}`]) return Object.assign({ src: `assets/mechs/${k}_lv${n}.webp`, mask: `assets/mechs/${k}_lv${n}_m.webp` }, A[`${k}_lv${n}`]);
    return null;
  }

  function svg(subject, o = {}) {
    const c = o.color || '#3B9BFF', info = INFO[subject], lv = level(o.cov || 0), ret = o.ret == null ? 1 : o.ret;
    const st = `--M:${c};--D:color-mix(in oklab,${c} 35%,#0A1020);--K:color-mix(in oklab,${c} 18%,#1B2440);--A:${info.accent};--C:color-mix(in oklab,${c} 40%,#fff);--glow:${(0.35 + ret * 0.65).toFixed(2)}`;
    const art = o.svgOnly ? null : artOf(subject, lv);
    if (art) {
      return `<span class="mech mech--art ${ret < 0.6 ? 'mech--fading' : ''} mech--lv${lv}" style="${st}" role="img" aria-label="${esc(info.name)}（${esc(subject)}）">
        <span class="mech__shadow"></span>
        <span class="mech__body" style="height:${((art.h / art.ref) * 100).toFixed(1)}%;aspect-ratio:${art.w}/${art.h}">
          <img src="${art.src}" alt="" draggable="false"><span class="mech__team" style="-webkit-mask-image:url('${art.mask}');mask-image:url('${art.mask}')"></span>
        </span></span>`;
    }
    return `<svg class="mech ${ret < 0.6 ? 'mech--fading' : ''} mech--lv${lv}" viewBox="0 0 120 140" style="${st}" role="img" aria-label="${esc(info.name)}（${esc(subject)}）">
      <ellipse cx="60" cy="137" rx="34" ry="4" fill="#000" opacity=".45"/>
      <g class="mech__body">${BODY[subject](lv)}</g>
    </svg>`;
  }

  /* 名前・戦闘力・成長の状態つきカード */
  function card(subject, st, color, extra = '') {
    const info = INFO[subject], lv = level(st.coverage || 0);
    const fade = (st.retention == null ? 1 : st.retention) < 0.5; // 科目平均の定着が半分を切ったら要復習
    return `<div class="mcard mcard--lv${lv} ${fade ? 'is-fading' : ''} ${extra}" style="--mc:${color}">
      <span class="mcard__badge">Lv${lv + 1}</span>${fade ? '<span class="mcard__warn">要復習</span>' : ''}
      <div class="mcard__art">${svg(subject, { color, cov: st.coverage, ret: st.retention })}</div>
      <b class="mcard__pw">${st.acc + st.speed + st.app}</b>
      <span class="mcard__name">${esc(info.name)}<small>${esc(subject)}</small></span>
      <span class="mcard__lv" title="装甲（範囲で成長）">${'◆'.repeat(lv + 1)}${'◇'.repeat(2 - lv)}</span>
    </div>`;
  }

  /* ホームの部隊パネル：5 体と合計戦闘力。タップでその科目の知識データへ */
  function Squad(stats, color, focus) {
    const S = Object.keys(INFO), total = S.reduce((a, s) => a + stats[s].acc + stats[s].speed + stats[s].app, 0);
    return `<section class="squad holo-panel" aria-label="部隊">
      <div class="squad__head"><span class="eyebrow">MY SQUAD · 部隊の戦闘力</span><b>${total}</b></div>
      <div class="squad__row">${S.map((s) => `<button data-action="stats" data-subject="${s}" aria-label="${s}機 ${esc(INFO[s].name)}の詳細">${card(s, stats[s], color, s === focus ? 'is-focus' : '')}</button>`).join('')}</div>
      <p class="squad__note">戦闘力は科目の学力そのもの。範囲を広げると装甲が増え、定着するほどコアが光る。忘れかけるとくすむ。</p>
    </section>`;
  }
  /* 知識データ画面の見出し：その科目の機体と成長の内訳 */
  function Hero(subject, st, color) {
    const info = INFO[subject], lv = level(st.coverage || 0), pc = (x) => Math.round((x || 0) * 100) + '%';
    const next = lv === 0 ? `範囲 40% で装甲が増える（いま ${pc(st.coverage)}）` : lv === 1 ? `範囲 75% で最終装甲（いま ${pc(st.coverage)}）` : '最終装甲';
    return `<section class="holo-panel mx-hero" style="--mc:${color}">
      <div class="mcard__art">${svg(subject, { color, cov: st.coverage, ret: st.retention })}</div>
      <div><h2>${esc(info.name)}<small>${esc(info.en)} · ${esc(info.role)}</small></h2>
        <ul><li>戦闘力 <b>${st.acc + st.speed + st.app}</b>（正確さ ${st.acc} ＋ 速さ ${st.speed} ＋ 応用 ${st.app}）</li>
          <li>装甲 <b>${'◆'.repeat(lv + 1)}${'◇'.repeat(2 - lv)}</b> ${next}</li>
          <li>コア <b>${pc(st.retention)}</b> ${st.retention < 0.6 ? '忘れかけでくすんでいる。復習で光が戻る' : '定着度が高いほど強く光る'}</li></ul></div>
    </section>`;
  }

  /* ---------- 科目ごとの攻撃エフェクト（絵は使わず CSS と SVG だけ）----------
   攻撃側 → 相手へ。相手側から撃つときは全体を左右反転し、文字だけ反転を戻す。
   時間：0〜0.15s 溜め／0.15〜0.33s 攻撃が飛ぶ／0.33s 命中（被弾・ダメージ表示もここに合わせる） */
  const TECH = { 国語: '墨染一閃', 数学: '黄金比ブラスト', 英語: 'ロゴス・ランス', 理科: '臨界反応砲', 社会: '星図流星群' };
  const n = (k, f) => Array.from({ length: k }, (_, i) => f(i)).join('');
  const FX = {
    国語: () => `<svg class="ax-ink" viewBox="0 0 100 100" preserveAspectRatio="none"><path class="ax-ink__glow" d="M6 88 Q48 52 94 6" pathLength="100"/><path class="ax-ink__line" d="M6 88 Q48 52 94 6" pathLength="100"/><path class="ax-ink__line ax-ink__line--2" d="M14 96 Q56 58 98 22" pathLength="100"/></svg>
      ${n(8, (i) => `<i class="ax-splat" style="--a:${i * 45 + 20}deg;--r:${30 + (i % 3) * 14}px"></i>`)}
      <span class="ax-word ax-txt" style="--x:70%;--y:18%">墨</span><span class="ax-word ax-txt" style="--x:84%;--y:42%;--dl:.06s">筆</span>`,
    数学: () => `<span class="ax-circle"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><polygon points="50,8 86,71 14,71"/><polygon points="50,92 14,29 86,29"/></svg></span><span class="ax-laser"></span>
      ${n(7, (i) => `<i class="ax-shard" style="--a:${i * 51 + 10}deg;--r:${34 + (i % 3) * 12}px"></i>`)}
      <span class="ax-word ax-txt" style="--x:30%;--y:18%">φ = 1.618</span>`,
    英語: () => `<span class="ax-speed"></span>
      ${n(7, (i) => `<span class="ax-letter ax-txt" style="--i:${i};--y:${38 + ((i * 17) % 24)}%">${'LOGOS!?'[i]}</span>`)}
      <span class="ax-star"></span>`,
    理科: () => `<span class="ax-beam"></span>${n(6, (i) => `<i class="ax-bubble" style="--i:${i};--y:${44 + ((i * 13) % 14)}%"></i>`)}
      ${n(6, (i) => `<i class="ax-hex" style="--a:${i * 60 + 15}deg;--r:${36 + (i % 2) * 18}px"></i>`)}<span class="ax-boom"></span>`,
    社会: () => `<svg class="ax-stars" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="8,30 22,12 38,20 52,6 68,16 86,8" pathLength="100"/></svg>
      ${n(6, (i) => `<i class="ax-dot" style="--x:${[8, 22, 38, 52, 68, 86][i]}%;--y:${[30, 12, 20, 6, 16, 8][i] * 0.9}%"></i>`)}
      ${n(4, (i) => `<i class="ax-meteor" style="--i:${i};--x:${58 + i * 8}%"></i>`)}<span class="ax-ring"></span>`,
  };
  function attackFx(subject, fromMe, crit) {
    return `<div class="ax ax--${KEY[subject]} ${fromMe ? 'from-me' : 'from-op'} ${crit ? 'is-crit' : ''}" aria-hidden="true">${FX[subject]()}</div>
      ${crit ? `<div class="ax-tech ${fromMe ? 'from-me' : 'from-op'}"><small>${fromMe ? 'CRITICAL' : 'ENEMY CRITICAL'}</small><b>${TECH[subject]}</b></div>` : ''}`;
  }

  window.Mechs = { INFO, KEY, svg, card, level, Squad, Hero, artOf, attackFx, TECH };
})();
