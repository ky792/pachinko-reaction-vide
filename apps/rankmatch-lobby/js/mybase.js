/* マイ陣地：見た目だけのカスタマイズとアイテムの購入。対戦の強さには一切影響しない。
 *  - 建物（科目ごと）・素材・台座・庭（3つまで）・エフェクト・周回物・旗（柄と文字）
 *  - 未所持のアイテムはタップで「試着」して3Dで確認してから購入できる
 *  - 入手：クリスタルで直接購入（ガチャなし）／学習の実績で無料開放／シリーズまとめ買い（20%引き）
 *  - 陣地の持ち主の色は変えられない（対戦での判別性を守るため）
 * ctx = { player, type, char, catalog, save(), toast(msg), openShop, exit() } */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;
  const SINGLE = ['material', 'base', 'fx', 'orbit', 'flag'];
  let ctx = null, root = null, st = null, t3 = null;

  const P = () => ctx.player, C = () => ctx.catalog;
  const item = (id) => C().items.find((x) => x.id === id);
  const counter = (type) => { const p = P(); return type === 'streak' ? p.today.streakDays : type === 'solved' ? p.achv.solved || 0 : p.achv[type] || 0; };
  const unlocked = (it) => !!it.unlock && counter(it.unlock.type) >= it.unlock.value;
  const have = (it) => P().cos.owned.includes(it.id) || unlocked(it);
  /* 科目ごとに変えられる種類（建物は科目固定、旗は全陣地共通） */
  const PER = ['material', 'base', 'garden', 'fx', 'orbit'];
  const slot = (e, s) => e.per[s];
  const isEq = (it, e = P().cos.equip) => it.kind === 'skin' ? e.skins[it.subject] === it.id : it.kind === 'flag' ? e.flag === it.id : it.kind === 'garden' ? slot(e, st.subject).garden.includes(it.id) : slot(e, st.subject)[it.kind] === it.id;

  /* s: 科目名、または '*'（全科目） */
  function applyTo(e, it, s) {
    if (it.kind === 'skin') { e.skins[it.subject] = it.id; return; }
    if (it.kind === 'flag') { e.flag = it.id; return; }
    (s === '*' ? KN.SUBJECTS : [s]).forEach((sub) => {
      const o = slot(e, sub);
      if (it.kind === 'garden') { if (!o.garden.includes(it.id)) { o.garden.push(it.id); if (o.garden.length > C().gardenMax) o.garden.shift(); } }
      else o[it.kind] = it.id;
    });
  }
  /* 試着・購入の対象は「ID@科目」で持つ。科目の小物は自分の科目、シリーズは全科目 */
  const entry = (it, s) => `${it.id}@${it.kind === 'skin' ? it.subject : s}`;
  const parse = (en) => { const [id, s] = en.split('@'); return { it: item(id), s }; };
  /* 描画用の見た目（試着中のアイテムを重ねる）。対戦では相手の防衛データとして同じ形式を使う */
  function lookOf(p, preview) {
    const e = JSON.parse(JSON.stringify(p.cos.equip));
    (preview || []).forEach((en) => { const { it, s } = parse(en); if (it) applyTo(e, it, s); });
    return { skins: e.skins, per: e.per, flag: e.flag, flagText: e.flagText || p.name };
  }

  const KIND_ICON = {
    skin: 'M12 3l7 4v10l-7 4-7-4V7z', base: 'M3 15l9-5 9 5-9 5zM3 15v2l9 5 9-5v-2', garden: 'M12 21v-6M7 15c0-4 2-9 5-12 3 3 5 8 5 12z',
    orbit: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M3 12c0-3 4-5 9-5s9 2 9 5-4 5-9 5-9-2-9-5', flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  };
  function Swatch(it) {
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    if (it.kind === 'material' && it.p) return `<span class="sw sw--mat"><i style="background:${hex(it.p.body)}"></i><i style="background:${hex(it.p.page)}"></i></span>`;
    if (it.kind === 'fx' && it.p) return `<span class="sw sw--fx">${it.p.glyphs ? it.p.glyphs.slice(0, 3).map((g) => `<b>${esc(g)}</b>`).join('') : it.p.colors.slice(0, 4).map((c) => `<i style="background:${hex(c)}"></i>`).join('')}</span>`;
    if (it.kind === 'flag' && it.p) return `<span class="sw sw--flag" style="background:${it.p.bg};border-color:${it.p.alt}"><i style="background:${it.p.alt}"></i></span>`;
    return `<span class="sw"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${KIND_ICON[it.kind] || KIND_ICON.skin}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span>`;
  }

  function Card(it) {
    const h = have(it), eq = isEq(it), pv = st.preview.includes(entry(it, st.subject));
    const tag = eq ? '<span class="mb-c__st eq">装備中</span>' : h ? '<span class="mb-c__st own">所持</span>' : it.unlock ? `<span class="mb-c__st lock">実績 ${Math.min(counter(it.unlock.type), it.unlock.value)}/${it.unlock.value}</span>` : `<span class="mb-c__st price"><i class="dot gem"></i>${it.price}</span>`;
    return `<li><button class="mb-c ${eq ? 'is-eq' : ''} ${pv ? 'is-pv' : ''} r-${it.rarity}" data-item="${it.id}">
      ${Swatch(it)}<span class="mb-c__n">${esc(it.name)}</span><span class="mb-c__r">${C().rarity[it.rarity]}${it.subject && it.kind === 'garden' ? ` · ${esc(it.subject)}の小物` : it.set ? ` · ${esc(it.set)}` : ''}</span>${tag}
    </button></li>`;
  }

  function SetCard(s) {
    const its = s.items.map(item), left = its.filter((i) => !have(i)), sum = left.reduce((x, i) => x + i.price, 0), price = Math.round(sum * (1 - s.off));
    return `<li class="mb-set">
      <div class="mb-set__head"><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></div>
      <div class="mb-set__items">${its.map((i) => `<span class="${have(i) ? 'own' : ''}">${esc(i.name)}</span>`).join('')}</div>
      <div class="mb-set__foot"><span class="muted">${its.length - left.length}/${its.length} 所持</span>
        <button class="btn btn--sub" data-tryset="${esc(s.name)}">まとめて試着</button>
        ${left.length ? `<button class="btn btn--main" data-buyset="${esc(s.name)}"><s>${sum}</s><i class="dot gem"></i>${price}</button>` : '<span class="mb-eq">コンプリート</span>'}</div>
    </li>`;
  }

  function view() {
    const p = P(), cat = C(), kind = st.tab;
    let list = cat.items.filter((it) => it.kind === kind && (kind !== 'skin' || it.subject === st.subject));
    if (kind === 'garden') { const rank = (it) => (it.subject === st.subject ? 0 : it.subject ? 2 : 1); list = list.slice().sort((a, b) => rank(a) - rank(b)); }
    if (st.filter === 'own') list = list.filter(have); if (st.filter === 'new') list = list.filter((i) => !have(i));
    const pvItems = [...new Set(st.preview.map((en) => parse(en).it))].filter((i) => i && !have(i)), pvCost = pvItems.reduce((x, i) => x + i.price, 0);
    const total = cat.items.length, ownedN = cat.items.filter(have).length;
    return `<div class="screen screen--match"><div class="match-screen phase-base ${pvItems.length ? 'has-pv' : ''}">
      <header class="m-head"><button class="link" data-action="mb-exit">← ホーム</button><span class="eyebrow">MY TERRITORY · ${ownedN}/${total}</span></header>
      <div class="mb-top"><h1 class="m-title">マイ陣地</h1><button class="mb-wallet" data-action="mb-shop"><i class="dot gem"></i><b>${p.crystals.toLocaleString('ja-JP')}</b><span>＋購入</span></button></div>
      <p class="a-lede">あなたに挑む相手の画面に、この見た目で表示されます。<b>強さには一切影響しません</b>。陣地の色は相棒ナビの色で固定です。</p>
      <div class="a-3d mb-3d"><span class="a-3d__hint">ドラッグで回転</span></div>
      <div class="mb-tabs" role="tablist">${cat.kinds.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === kind}">${l}</button>`).join('')}</div>
      ${kind !== 'flag' && kind !== 'set' ? `<div class="mb-subjects">${KN.SUBJECTS.map((s) => `<button data-subj="${s}" aria-pressed="${s === st.subject}">${s}</button>`).join('')}</div>
        ${PER.includes(kind) ? `<div class="mb-scope"><span><b>${esc(st.subject)}</b>の陣地を編集中</span><button class="link" data-action="mb-allsub">この${esc(cat.kinds.find((k) => k[0] === kind)[1])}を全科目に適用</button></div>` : ''}` : ''}
      ${kind === 'set' ? `<ul class="mb-sets">${cat.sets.map(SetCard).join('')}</ul>` : `
        <div class="mb-filter">${[['all', 'すべて'], ['new', '未所持'], ['own', '所持']].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${k === st.filter}">${l}</button>`).join('')}
          <span class="muted">${kind === 'garden' ? `庭は${cat.gardenMax}つまで配置` : '未所持はタップで試着'}</span></div>
        ${kind === 'flag' ? `<div class="mb-flag__row"><label class="sr" for="flag-text">旗の文字</label><input id="flag-text" maxlength="4" placeholder="旗の文字（4文字まで）" value="${esc(p.cos.equip.flagText || p.name)}" autocomplete="off"><button class="btn btn--main" data-action="mb-flag">反映</button></div>` : ''}
        <ul class="mb-grid">${list.map(Card).join('') || '<li class="muted">該当するアイテムはありません</li>'}</ul>`}
      ${pvItems.length ? `<div class="mb-pv"><div class="mb-pv__t"><span class="eyebrow">試着中</span><b>${pvItems.map((i) => esc(i.name)).join('・')}</b></div>
        <button class="btn btn--sub" data-action="mb-pv-clear">戻す</button><button class="btn btn--main" data-action="mb-pv-buy"><i class="dot gem"></i>${st.pvSet ? Math.round(pvCost * 0.8) : pvCost} で購入</button></div>` : ''}
      ${st.sheet ? Sheet() : ''}
    </div></div>`;
  }

  function Sheet() {
    const p = P(), cat = C();
    if (st.sheet.type === 'buy') {
      const its = [...new Set(st.sheet.ids.map((en) => parse(en).it))].filter((i) => i && !have(i)), sum = its.reduce((x, i) => x + i.price, 0), price = st.sheet.off ? Math.round(sum * (1 - st.sheet.off)) : sum, short = p.crystals < price;
      return `<div class="mb-sheet" role="dialog" aria-modal="true" aria-labelledby="mb-sheet-t"><div class="mb-sheet__box">
        <h2 id="mb-sheet-t">${its.length === 1 ? esc(its[0].name) + 'を購入' : `${its.length}点をまとめて購入`}</h2>
        ${its.length > 1 ? `<p>${its.map((i) => esc(i.name)).join('・')}</p>` : `<p>${esc(its[0].desc || '')}</p>`}
        <div class="mb-price"><span>価格</span><b><i class="dot gem"></i>${price}${st.sheet.off ? ` <s>${sum}</s>` : ''}</b><span>所持</span><b><i class="dot gem"></i>${p.crystals}</b></div>
        <p class="mb-note">見た目だけのアイテムです。対戦の強さは変わりません。</p>
        ${short ? `<p class="mb-short">クリスタルが ${price - p.crystals} 足りません。</p>` : ''}
        <div class="r-actions"><button class="btn btn--sub" data-action="mb-close">やめる</button>${short ? '<button class="btn btn--main" data-action="mb-shop">クリスタルを購入</button>' : '<button class="btn btn--main" data-action="mb-confirm">購入して装備</button>'}</div>
      </div></div>`;
    }
    return `<div class="mb-sheet" role="dialog" aria-modal="true" aria-labelledby="mb-sheet-t"><div class="mb-sheet__box">
      <h2 id="mb-sheet-t">クリスタルを購入</h2>
      <p class="mb-proto">試作のため、実際の決済は行われません。</p>
      <ul class="mb-packs">${cat.packs.map((k) => `<li><button data-pack="${k.id}"><span class="g"><i class="dot gem"></i><b>${k.crystals.toLocaleString('ja-JP')}</b>${k.bonus ? `<em>おまけ${k.bonus}</em>` : ''}</span><span class="y">¥${k.yen.toLocaleString('ja-JP')}</span></button></li>`).join('')}</ul>
      <div class="mb-limits"><b>未成年の方へ</b>購入には保護者の同意が必要です。月の上限：${cat.limits.map((l) => `${l.label} ${l.yen.toLocaleString('ja-JP')}円`).join('／')}</div>
      <p class="muted">クリスタルで買えるのは見た目のアイテムだけです。ランダムで当たる仕組み（ガチャ）はありません。</p>
      <div class="r-actions"><button class="btn btn--sub" data-action="mb-close">閉じる</button></div>
    </div></div>`;
  }

  function draw() {
    const y = window.scrollY;
    root.innerHTML = view(); attach3d(); window.scrollTo(0, y);
  }
  function attach3d() {
    const host = root.querySelector('.mb-3d'); if (!host || !window.Terrain) { if (host) host.hidden = true; return; }
    const look = lookOf(P(), st.preview), colors = { me: ctx.type.color, op: ctx.type.color }, key = window.Terrain.keyOf(KN.SUBJECTS, colors, look);
    if (!t3 || t3.key !== key) { if (t3) t3.destroy(); t3 = window.Terrain.create(KN.SUBJECTS, colors, look); }
    if (!t3) { host.hidden = true; return; }
    host.appendChild(t3.canvas); t3.resize();
    t3.setState(KN.SUBJECTS.map(() => 'own'), null);
    const fo = st.focusSubject; t3.focus(fo ? KN.SUBJECTS.indexOf(fo) : null);
  }

  /* シリーズは全科目に。科目の小物はそれぞれ自分の科目に置く */
  const setEntries = (s) => s.items.map((id) => { const it = item(id); return entry(it, it.subject || '*'); });
  function buyNow(entries, off) {
    const its = [...new Set(entries.map((en) => parse(en).it))].filter((i) => i && !have(i)), sum = its.reduce((x, i) => x + i.price, 0), price = off ? Math.round(sum * (1 - off)) : sum;
    if (P().crystals < price) return false;
    P().crystals -= price;
    its.forEach((i) => P().cos.owned.push(i.id));
    entries.forEach((en) => { const { it, s } = parse(en); if (it && have(it)) applyTo(P().cos.equip, it, s); });
    ctx.save(); ctx.toast(its.length === 1 ? `${its[0].name}を購入して装備しました` : `${its.length}点を購入して装備しました`);
    return true;
  }

  function onClick(ev) {
    const b = ev.target.closest('button'); if (!b || !st) return;
    const d = b.dataset;
    if (d.tab) { st.tab = d.tab; st.filter = 'all'; st.focusSubject = d.tab === 'flag' || d.tab === 'set' ? null : st.subject; draw(); return; }
    if (d.subj) { st.subject = d.subj; st.focusSubject = d.subj; draw(); return; }
    if (d.filter) { st.filter = d.filter; draw(); return; }
    if (d.item) {
      const it = item(d.item), e = P().cos.equip, en = entry(it, st.subject), sub = it.kind === 'skin' ? it.subject : st.subject;
      st.focusSubject = it.kind === 'flag' ? null : sub; st.pvSet = null;
      if (have(it)) {
        const o = slot(e, st.subject);
        if (it.kind === 'garden' && o.garden.includes(it.id)) o.garden = o.garden.filter((x) => x !== it.id); else applyTo(e, it, st.subject);
        st.preview = st.preview.filter((x) => x !== en); ctx.save();
      } else {
        const same = (x) => { const q = parse(x); return q.it.kind === it.kind && it.kind !== 'garden' && (q.s === sub || q.s === '*'); };
        st.preview = st.preview.includes(en) ? st.preview.filter((x) => x !== en) : st.preview.filter((x) => !same(x)).concat(en);
      }
      draw(); return;
    }
    if (d.tryset) { const s = C().sets.find((x) => x.name === d.tryset); st.preview = setEntries(s); st.pvSet = s.name; st.focusSubject = null; draw(); return; }
    if (d.buyset) { const s = C().sets.find((x) => x.name === d.buyset); st.sheet = { type: 'buy', ids: setEntries(s), off: s.off }; draw(); return; }
    if (d.pack) {
      const k = C().packs.find((x) => x.id === d.pack);
      P().crystals += k.crystals; ctx.save(); ctx.toast(`${k.crystals}クリスタルを追加しました（試作・決済なし）`);
      st.sheet = st.after || null; st.after = null; draw(); return;
    }
    switch (d.action) {
      case 'mb-shop': st.after = st.sheet && st.sheet.type === 'buy' ? st.sheet : null; st.sheet = { type: 'shop' }; draw(); break;
      case 'mb-close': st.sheet = null; st.after = null; draw(); break;
      case 'mb-pv-clear': st.preview = []; st.pvSet = null; draw(); break;
      case 'mb-pv-buy': { const s = st.pvSet && C().sets.find((x) => x.name === st.pvSet); st.sheet = { type: 'buy', ids: st.preview.slice(), off: s ? s.off : 0 }; draw(); break; }
      case 'mb-confirm': if (buyNow(st.sheet.ids, st.sheet.off)) { st.preview = []; st.pvSet = null; } st.sheet = null; draw(); break;
      case 'mb-allsub': {
        const e = P().cos.equip, src = slot(e, st.subject)[st.tab];
        KN.SUBJECTS.forEach((sub) => { slot(e, sub)[st.tab] = Array.isArray(src) ? src.slice() : src; });
        ctx.save(); ctx.toast(`${st.subject}と同じ設定を全科目に適用しました`); st.focusSubject = null; draw(); break;
      }
      case 'mb-flag': { const v = (root.querySelector('#flag-text').value || '').trim().slice(0, 4); const e = P().cos.equip; e.flagText = v; if (e.flag === 'flag_none') e.flag = 'flag_plain'; ctx.save(); ctx.toast('旗を更新しました'); draw(); break; }
      case 'mb-exit': unmount(); ctx.exit(); break;
    }
  }
  const onResize = () => { if (t3) t3.resize(); };
  function mount(r, c) {
    unmount(); root = r; ctx = c;
    st = { tab: 'skin', subject: KN.SUBJECTS[0], focusSubject: KN.SUBJECTS[0], filter: 'all', preview: [], pvSet: null, sheet: c.openShop ? { type: 'shop' } : null };
    root.addEventListener('click', onClick); window.addEventListener('resize', onResize);
    draw();
  }
  function unmount() { if (t3) { t3.destroy(); t3 = null; } if (root) root.removeEventListener('click', onClick); window.removeEventListener('resize', onResize); st = null; root = null; }

  window.MyBase = { mount, unmount, lookOf };
})();
