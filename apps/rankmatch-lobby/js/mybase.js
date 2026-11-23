/* マイ陣地：見た目だけのカスタマイズとアイテムの購入。対戦の強さには一切影響しない。
 *  - 建物（科目ごと）・台座・装飾（2つまで）・旗の文字を選ぶ。3Dプレビューに即反映
 *  - 入手：クリスタル（有償通貨）で直接購入、または学習の実績で無料開放。ガチャはない
 *  - 陣地の持ち主の色は変えられない（対戦での判別性を守るため）
 * ctx = { player, type, char, catalog, save(), toast(msg), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;
  const TABS = [['skin', '建物'], ['base', '台座'], ['deco', '装飾'], ['flag', '旗']];
  const RAR = { epic: 'EPIC', rare: 'RARE' };

  let ctx = null, root = null, st = null, t3 = null;

  const P = () => ctx.player;
  const item = (id) => ctx.catalog.items.find((x) => x.id === id);
  const owned = (id) => P().cos.owned.includes(id);
  function unlocked(it) {
    if (!it.unlock) return false;
    const p = P(), u = it.unlock;
    const cur = u.type === 'streak' ? p.today.streakDays : u.type === 'train' ? p.achv.train : p.achv.duel;
    return cur >= u.value;
  }
  function progress(it) {
    const p = P(), u = it.unlock;
    const cur = u.type === 'streak' ? p.today.streakDays : u.type === 'train' ? p.achv.train : p.achv.duel;
    return `${Math.min(cur, u.value)}/${u.value}`;
  }
  /* 3D 用の見た目データ（対戦では相手の防衛データとして同じ形式を使う） */
  function lookOf(p) {
    const e = p.cos.equip;
    return { skins: Object.assign({}, e.skins), base: e.base, decos: e.decos.slice(), flag: e.flag || p.name };
  }
  const isEquipped = (it) => { const e = P().cos.equip; return it.kind === 'skin' ? e.skins[it.subject] === it.id : it.kind === 'base' ? e.base === it.id : e.decos.includes(it.id); };

  function ItemCard(it) {
    const have = owned(it.id) || unlocked(it), eq = isEquipped(it);
    let action;
    if (have) action = eq ? (it.kind === 'deco' ? `<button class="btn btn--sub" data-unequip="${it.id}">外す</button>` : '<span class="mb-eq">装備中</span>') : `<button class="btn btn--sub" data-equip="${it.id}">装備する</button>`;
    else action = `<button class="btn btn--main mb-buy" data-buy="${it.id}"><i class="dot gem"></i>${it.price}</button>`;
    return `<li class="mb-item ${eq ? 'is-eq' : ''} ${have ? '' : 'is-locked'}">
      <div class="mb-item__main"><b>${esc(it.name)}${it.rarity ? `<em class="rar ${it.rarity}">${RAR[it.rarity]}</em>` : ''}</b>${it.desc ? `<small>${esc(it.desc)}</small>` : ''}
        ${!have && it.unlock ? `<small class="mb-unlock">または実績で無料：${esc(it.unlock.label)}（${progress(it)}）</small>` : ''}
        ${owned(it.id) || !it.unlock || !unlocked(it) ? '' : '<small class="mb-unlock ok">実績で開放済み</small>'}</div>
      <div class="mb-item__act">${action}</div>
    </li>`;
  }

  function view() {
    const p = P(), cat = ctx.catalog;
    const list = cat.items.filter((it) => it.kind === st.tab && (st.tab !== 'skin' || it.subject === st.subject));
    return `<div class="screen screen--match"><div class="match-screen phase-base">
      <header class="m-head"><button class="link" data-action="mb-exit">← ホーム</button><span class="eyebrow">MY TERRITORY</span></header>
      <div class="mb-top"><h1 class="m-title">マイ陣地</h1><button class="mb-wallet" data-action="mb-shop"><i class="dot gem"></i><b>${p.crystals.toLocaleString('ja-JP')}</b><span>＋購入</span></button></div>
      <p class="a-lede">あなたの陣地は、対戦であなたに挑む相手の画面にこの見た目で表示されます。<b>強さには一切影響しません</b>。陣地の色は相棒ナビの色で固定です。</p>
      <div class="a-3d mb-3d"><span class="a-3d__hint">ドラッグで回転</span></div>
      <div class="mb-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === st.tab}">${l}</button>`).join('')}</div>
      ${st.tab === 'skin' ? `<div class="mb-subjects">${KN.SUBJECTS.map((s) => `<button data-subj="${s}" aria-pressed="${s === st.subject}">${s}</button>`).join('')}</div>` : ''}
      ${st.tab === 'flag' ? `<section class="m-panel mb-flag">
          <label for="flag-text" class="panel__title">旗に入れる文字（4文字まで）</label>
          <div class="mb-flag__row"><input id="flag-text" maxlength="4" value="${esc(p.cos.equip.flag || p.name)}" autocomplete="off"><button class="btn btn--main" data-action="mb-flag">反映</button></div>
          <p class="muted">装飾の「旗」を装備すると、陣地に旗が立ちます。不適切な文字は本番では自動で確認します。</p>
        </section>` : `<ul class="mb-list">${list.map(ItemCard).join('')}</ul>`}
      ${st.tab === 'deco' ? '<p class="muted">装飾は2つまで同時に付けられます。</p>' : ''}
      ${st.sheet ? Sheet() : ''}
    </div></div>`;
  }

  function Sheet() {
    const p = P(), cat = ctx.catalog;
    if (st.sheet.type === 'buy') {
      const it = item(st.sheet.id), short = p.crystals < it.price;
      return `<div class="mb-sheet" role="dialog" aria-modal="true" aria-labelledby="mb-sheet-t"><div class="mb-sheet__box">
        <h2 id="mb-sheet-t">${esc(it.name)}を購入</h2>
        <p>${esc(it.desc || '')}</p>
        <div class="mb-price"><span>価格</span><b><i class="dot gem"></i>${it.price}</b><span>所持</span><b><i class="dot gem"></i>${p.crystals}</b></div>
        <p class="mb-note">見た目だけのアイテムです。対戦の強さは変わりません。</p>
        ${short ? `<p class="mb-short">クリスタルが ${it.price - p.crystals} 足りません。</p>` : ''}
        <div class="r-actions"><button class="btn btn--sub" data-action="mb-close">やめる</button>${short ? '<button class="btn btn--main" data-action="mb-shop">クリスタルを購入</button>' : `<button class="btn btn--main" data-action="mb-confirm">購入して装備</button>`}</div>
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
    root.innerHTML = view();
    attach3d();
    window.scrollTo(0, y);
  }
  function attach3d() {
    const host = root.querySelector('.mb-3d'); if (!host) return;
    const look = lookOf(P()), colors = { me: ctx.type.color, op: ctx.type.color };
    const key = window.Terrain3D ? window.Terrain3D.keyOf(KN.SUBJECTS, colors, look) : '';
    if (!t3 || t3.key !== key) { if (t3) t3.destroy(); t3 = window.Terrain3D ? window.Terrain3D.create(KN.SUBJECTS, colors, look) : null; }
    if (!t3) { host.hidden = true; return; }
    host.appendChild(t3.canvas); t3.resize();
    t3.setState(KN.SUBJECTS.map(() => 'own'), null);
    t3.focus(st.tab === 'skin' ? KN.SUBJECTS.indexOf(st.subject) : null);
  }

  function equip(it) {
    const e = P().cos.equip;
    if (it.kind === 'skin') e.skins[it.subject] = it.id;
    else if (it.kind === 'base') e.base = it.id;
    else if (!e.decos.includes(it.id)) { e.decos.push(it.id); if (e.decos.length > 2) e.decos.shift(); }
    ctx.save();
  }

  function onClick(ev) {
    const b = ev.target.closest('button'); if (!b || !st) return;
    const d = b.dataset;
    if (d.tab) { st.tab = d.tab; draw(); return; }
    if (d.subj) { st.subject = d.subj; draw(); return; }
    if (d.equip) { equip(item(d.equip)); draw(); return; }
    if (d.unequip) { const e = P().cos.equip; e.decos = e.decos.filter((x) => x !== d.unequip); ctx.save(); draw(); return; }
    if (d.buy) { st.sheet = { type: 'buy', id: d.buy }; draw(); return; }
    if (d.pack) {
      const k = ctx.catalog.packs.find((x) => x.id === d.pack);
      P().crystals += k.crystals; ctx.save(); ctx.toast(`${k.crystals}クリスタルを追加しました（試作・決済なし）`);
      st.sheet = st.after ? { type: 'buy', id: st.after } : null; st.after = null; draw(); return;
    }
    switch (d.action) {
      case 'mb-shop': st.after = st.sheet && st.sheet.type === 'buy' ? st.sheet.id : null; st.sheet = { type: 'shop' }; draw(); break;
      case 'mb-close': st.sheet = null; st.after = null; draw(); break;
      case 'mb-confirm': {
        const it = item(st.sheet.id);
        if (P().crystals >= it.price) { P().crystals -= it.price; P().cos.owned.push(it.id); equip(it); ctx.toast(`${it.name}を購入して装備しました`); }
        st.sheet = null; draw(); break;
      }
      case 'mb-flag': { const v = (root.querySelector('#flag-text').value || '').trim().slice(0, 4); P().cos.equip.flag = v; if (!P().cos.equip.decos.includes('deco_flag')) equip(item('deco_flag')); ctx.save(); ctx.toast('旗を更新しました'); draw(); break; }
      case 'mb-exit': unmount(); ctx.exit(); break;
    }
  }
  const onResize = () => { if (t3) t3.resize(); };

  function mount(r, c) {
    unmount(); root = r; ctx = c;
    st = { tab: 'skin', subject: KN.SUBJECTS[0], sheet: c.openShop ? { type: 'shop' } : null };
    root.addEventListener('click', onClick); window.addEventListener('resize', onResize);
    draw();
  }
  function unmount() { if (t3) { t3.destroy(); t3 = null; } if (root) root.removeEventListener('click', onClick); window.removeEventListener('resize', onResize); st = null; root = null; }

  window.MyBase = { mount, unmount, lookOf };
})();
