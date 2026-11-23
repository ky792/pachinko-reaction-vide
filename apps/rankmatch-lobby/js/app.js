/* 状態管理・ルーティング・イベント。表示はすべて UI.* に委ねる。 */
(function () {
  const D = window.NAV_DATA, UI = window.UI;
  const root = document.getElementById('app');
  const KEY = 'rankmatch-lobby:v1', PKEY = 'rankmatch-lobby:player:v3';

  /* プレイヤー：mock を初期値に、対戦結果を localStorage に積み上げる（試作用） */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let P = (() => { try { const s = JSON.parse(localStorage.getItem(PKEY) || 'null'); return s && s.K ? s : clone(window.MOCK_PLAYER); } catch (e) { return clone(window.MOCK_PLAYER); } })();
  const savePlayer = () => { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) {} };

  /* 知識データ：単元ごとの実力・定着度。学力ステータスはここから毎回計算する */
  const KN = window.Knowledge;
  KN.setBank(window.QUESTION_BANK);
  const now = () => Date.now() + (P.dayShift || 0) * KN.DAY;
  function initKnowledge() {
    if (!P.K) { P.K = KN.synth(P.stats, 7, now()); P.qr = {}; P.dayShift = 0; }
    if (!P.cos) P.cos = clone(window.COSMETICS.defaults);
    migrateCos();
    if (!P.achv) P.achv = { train: 0, duel: 0 };
    refreshStats();
  }
  /* 旧形式（decos）の装備を新形式へ移行し、無料アイテムを所持に加える */
  function migrateCos() {
    const D0 = window.COSMETICS.defaults, e = P.cos.equip, MAP = { deco_flag: 'flag_plain', deco_lantern: 'orb_lantern', deco_petals: 'fx_sakura', deco_halo: 'orb_halo' };
    P.cos.owned = [...new Set(P.cos.owned.map((id) => MAP[id] || id).concat(D0.owned))];
    if (e.decos) {
      e.flag = e.decos.includes('deco_flag') ? 'flag_plain' : 'flag_none';
      e.fx = e.decos.includes('deco_petals') ? 'fx_sakura' : 'fx_none';
      e.orbit = e.decos.includes('deco_halo') ? 'orb_halo' : e.decos.includes('deco_lantern') ? 'orb_lantern' : 'orb_none';
      if (typeof e.flag === 'string' && P.cos.equip.flagText == null) e.flagText = '';
      delete e.decos;
    }
    Object.keys(D0.equip).forEach((k) => { if (e[k] == null) e[k] = clone(D0.equip[k]); });
    /* 科目ごとの見た目（素材・台座・庭・エフェクト・周回物）。旧データは共通の設定を全科目にコピー */
    if (!e.per) { e.per = {}; KN.SUBJECTS.forEach((sub) => { e.per[sub] = { material: e.material, base: e.base, garden: (e.garden || []).slice(), fx: e.fx, orbit: e.orbit }; }); }
  }
  const refreshStats = () => { P.stats = KN.subjectStats(P.K, now()); };
  initKnowledge();
  const opCache = {};
  const opK = (o) => opCache[o.id] || (opCache[o.id] = KN.synth(o.stats, KN.hash(o.id), Date.now(), 0.15));
  const opStats = (o) => KN.subjectStats(opK(o), Date.now());
  function recordAnswer(q, ans) { P.achv.solved = (P.achv.solved || 0) + 1; const d = KN.update(P.K, q, ans, now(), P.qr); refreshStats(); savePlayer(); return d; }

  /* ランク帯：RP からラベル・次ランク・ゲージ位置を求める */
  const TIERS = [['C', 0], ['B−', 700], ['B', 1000], ['B+', 1300], ['A−', 1600], ['A', 1900], ['A+', 2200], ['S', 2500]];
  function rankView(rp) {
    let i = 0; while (i + 1 < TIERS.length && rp >= TIERS[i + 1][1]) i++;
    const floor = TIERS[i][1], nx = TIERS[i + 1];
    return { label: TIERS[i][0], rp, floor, next: nx ? nx[0] : null, nextAt: nx ? nx[1] : rp, pct: nx ? Math.round(((rp - floor) / (nx[1] - floor)) * 100) : 100 };
  }
  const rankCardData = () => { const v = rankView(P.rank.rp); return Object.assign({}, P.rank, { label: v.label, nextTier: v.next || '—', nextAt: v.nextAt, floor: v.floor }); };

  const addStudy = (seconds, solved, correct) => {
    const T = P.today; T.solved += solved; T.correct += correct; T.minutes += Math.max(1, Math.ceil(seconds / 60));
    P.missions.forEach((ms) => { if (ms.id === 'm3') ms.progress = Math.min(ms.total, T.minutes); });
  };
  const addExp = (n) => { const L = P.level; L.exp += n; while (L.exp >= L.next) { L.exp -= L.next; L.lv++; L.next = Math.round((L.next * 1.08) / 10) * 10; } };

  /* 対戦（自動戦闘）の結果：RP・挑戦権・ミッション */
  function applyBattle(r) {
    const before = rankView(P.rank.rp);
    P.tickets.now = Math.max(0, P.tickets.now - 1);
    P.rank.rp = Math.max(0, P.rank.rp + r.rp);
    P.rank.winStreak = r.win ? P.rank.winStreak + 1 : 0;
    P.rank.nationalPos = Math.max(1, P.rank.nationalPos + (r.win ? -60 : 30));
    P.focus = r.focus;
    addExp(r.win ? 120 : 50);
    P.missions.forEach((ms) => { if (ms.id === 'm1') ms.progress = Math.min(ms.total, ms.progress + 1); });
    savePlayer();
    return { before, after: rankView(P.rank.rp) };
  }

  /* 直接対決で試合が逆転したとき：負けのRPを取り消して勝ちのRPを付ける */
  function overturn(r) {
    const start = P.rank.rp - r.from;
    P.rank.rp = Math.max(0, P.rank.rp - r.from + r.to);
    P.rank.winStreak += 1;
    savePlayer();
    return { before: rankView(start), after: rankView(P.rank.rp) };
  }

  /* 演習の結果（知識データは1問ごとに recordAnswer で更新済み）：挑戦権・EXP・学習量・ミッション */
  function applyTraining(g) {
    P.achv.train += 1;
    P.tickets.now = Math.min(P.tickets.max, P.tickets.now + 1);
    addExp(g.correct * 15 + 60);
    addStudy(g.seconds, g.total, g.correct);
    P.missions.forEach((ms) => { if (ms.id === 'm2' && g.subject === '数学') ms.progress = Math.max(ms.progress, Math.min(ms.total, g.maxStreak)); });
    if (g.weakUnit) Object.assign(P.recommend, { subject: g.subject, unit: g.weakUnit, accuracy: Math.round((g.correct / g.total) * 100) });
    savePlayer();
  }

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const saved = load();
  const state = {
    typeId: D.types.some((t) => t.id === saved.typeId) ? saved.typeId : D.types[0].id,
    gender: saved.gender === 'f' ? 'f' : 'm',
    confirmed: !!saved.confirmed,
    lineIdx: 0,
    expr: 'default',
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ typeId: state.typeId, gender: state.gender, confirmed: state.confirmed })); } catch (e) {} };

  const type = () => D.types.find((t) => t.id === state.typeId);
  const char = () => type().characters[state.gender];

  /* テーマ：data の color だけを正として CSS 変数に流す */
  function applyTheme(t) {
    const s = document.documentElement.style;
    s.setProperty('--theme', t.color);
    document.documentElement.dataset.type = t.id; // デバッグ・解析用。CSSはこれに依存しない
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.color;
  }

  const timeSlot = () => { const h = new Date().getHours(); return h < 11 ? 'morning' : h < 18 ? 'day' : 'night'; };
  const lineOrder = () => [timeSlot(), 'catch', ...['morning', 'day', 'night'].filter((k) => k !== timeSlot())];
  const currentLine = () => { const k = lineOrder()[state.lineIdx % lineOrder().length]; return k === 'catch' ? char().catch : char().lines[k]; };

  /* ---------- 画面 ---------- */
  function renderSelect() {
    const t = type(), c = char();
    root.innerHTML = `<div class="screen screen--select">
      <header class="sel-head">
        <div><span class="eyebrow">NAVIGATOR CONTRACT</span><h1>専属ナビゲーターを選ぶ</h1></div>
        ${state.confirmed ? '<button class="link" data-action="back-home">ホームへ戻る</button>' : '<span class="step">STEP 1/1</span>'}
      </header>
      ${UI.TypeTabs(D.types, t.id)}
      <div class="sel-grid">
        <div class="stage">
          <div class="stage__ring" aria-hidden="true"></div>
          <div class="stage__type" aria-hidden="true">${t.name}</div>
          ${UI.Portrait({ char: c, expr: 'default', cls: 'portrait--stage' })}
          <div class="stage__pad" aria-hidden="true"></div>
          <div class="stage__tagline">${UI.esc(t.tagline)}</div>
          ${UI.GenderToggle(t, state.gender)}
        </div>
        ${UI.NavigatorProfile(D, t, c)}
      </div>
      <div class="confirm-bar">
        <button class="btn btn--main" data-action="confirm">${UI.Emblem(t.emblem)}${UI.esc(c.name)}と契約する</button>
      </div>
    </div>`;
  }

  function renderHome() {
    const t = type(), c = char();
    root.innerHTML = `<div class="screen screen--home">
      ${UI.TopBar(P, t, c)}
      <div class="lobby">
        <div class="lobby__nav">
          <button class="navstage" data-action="talk" aria-label="${UI.esc(c.name)}に話しかける">
            <span class="navstage__grid" aria-hidden="true"></span>
            ${UI.Portrait({ char: c, expr: state.expr, cls: 'portrait--home' })}
            <span class="navstage__plate">${UI.Emblem(t.emblem)}<b>${UI.esc(c.name)}</b><small>${t.name} · ${UI.esc(c.title)}</small></span>
          </button>
          ${UI.Dialogue(D, c, currentLine(), state.expr)}
        </div>
        <div class="lobby__main">
          ${UI.RankCard(rankCardData(), P.season)}
          ${UI.ArenaCTA(P, window.Battle.totalPower(P.stats))}
          ${UI.StatsCard(P.stats, P.focus, window.Battle.power)}
          <div class="tiles">${UI.LevelCard(P.level)}${UI.TodayCard(P.today)}</div>
          ${UI.RecommendCard(P.recommend, t, c)}
        </div>
        <div class="lobby__side">${UI.DefenseLog(P.defenseLog, P.focus)}${UI.MissionList(P.missions)}<div class="demo"><button class="reset" data-action="advance">試作：3日進める（忘却の確認）</button><button class="reset" data-action="reset">試作データをリセット</button></div></div>
      </div>
      ${UI.BottomNav()}
    </div>`;
  }

  function render() {
    applyTheme(type());
    refreshStats();
    const route = location.hash.replace('#', '') || (state.confirmed ? 'home' : 'select');
    const base = { D, player: P, type: type(), char: char(), rankLabel: rankView(P.rank.rp).label, exit: () => go('home') };
    window.Battle.unmount(); window.Training.unmount(); window.MyBase.unmount();
    if ((route === 'arena' || route === 'match') && state.confirmed) {
      window.Battle.mount(root, Object.assign(base, { opponents: window.OPPONENTS, bank: window.QUESTION_BANK, now, myK: () => P.K, opK, opStats, applyBattle, overturn, recordAnswer,
        achieve: (k) => { P.achv[k] = (P.achv[k] || 0) + 1; savePlayer(); },
        train: (s, u) => { state.trainSubject = s; state.trainUnits = u || []; go('train'); } }));
      return;
    }
    if (route === 'train' && state.confirmed) {
      window.Training.mount(root, Object.assign(base, { bank: window.QUESTION_BANK, subject: state.trainSubject || P.recommend.subject, focusUnits: state.trainUnits || [],
        now, myK: () => P.K, recordAnswer, applyTraining, arena: () => go('arena') }));
      state.trainUnits = [];
      return;
    }
    if (route === 'base' && state.confirmed) {
      window.MyBase.mount(root, { player: P, type: type(), char: char(), catalog: window.COSMETICS, save: savePlayer, toast, openShop: state.openShop, exit: () => go('home') });
      state.openShop = false;
      return;
    }
    if (route === 'stats' && state.confirmed) {
      const subj = state.statsSubject || P.recommend.subject;
      root.innerHTML = window.StatsView.render({ player: P, K: P.K, now: now(), subject: subj });
      return;
    }
    if (route === 'home' && state.confirmed) renderHome(); else renderSelect();
  }

  function go(route) { if (location.hash !== '#' + route) location.hash = route; else render(); window.scrollTo(0, 0); }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function confirmFx() {
    const t = type(), c = char();
    const fx = document.createElement('div');
    fx.className = 'contract';
    fx.innerHTML = `<div class="contract__inner">${UI.Portrait({ char: c, expr: 'smile', cls: 'portrait--fx' })}<span class="eyebrow">CONTRACT COMPLETE</span><b>${UI.esc(c.name)}</b><p>「${UI.esc(c.catch)}」</p></div>`;
    document.body.appendChild(fx);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { fx.classList.add('out'); state.expr = 'smile'; go('home'); setTimeout(() => fx.remove(), 400); }, reduce ? 600 : 1500);
  }

  /* 吹き出しだけ差し替え（全再描画しない） */
  function setDialogue(line, expr) {
    state.expr = expr;
    const d = root.querySelector('.dialogue'); if (!d) return;
    d.outerHTML = UI.Dialogue(D, char(), line, expr);
    const p = root.querySelector('.portrait--home'); if (p) p.outerHTML = UI.Portrait({ char: char(), expr, cls: 'portrait--home' });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.type) { state.typeId = b.dataset.type; render(); return; }
    if (b.dataset.gender) { state.gender = b.dataset.gender; render(); return; }
    if (b.dataset.statsSubject) { state.statsSubject = b.dataset.statsSubject; render(); window.scrollTo(0, 0); return; }
    switch (b.dataset.action) {
      case 'confirm': state.confirmed = true; state.lineIdx = 0; persist(); confirmFx(); break;
      case 'change-nav': go('select'); break;
      case 'back-home': go('home'); break;
      case 'talk': state.lineIdx++; setDialogue(currentLine(), state.lineIdx % 2 ? 'smile' : 'default'); break;
      case 'match': go('arena'); break;
      case 'train': state.trainSubject = b.dataset.subject || P.recommend.subject; state.trainUnits = b.dataset.units ? b.dataset.units.split('|') : []; go('train'); break;
      case 'base': go('base'); break;
      case 'shop': state.openShop = true; go('base'); break;
      case 'stats': state.statsSubject = b.dataset.subject || state.statsSubject; go('stats'); break;
      case 'advance': P.dayShift = (P.dayShift || 0) + 3; refreshStats(); savePlayer(); render(); toast('3日経過：復習していない単元の定着が下がりました'); break;
      case 'reset': P = clone(window.MOCK_PLAYER); initKnowledge(); savePlayer(); state.expr = 'default'; render(); toast('試作データを初期状態に戻しました'); break;
      case 'study': state.trainSubject = P.recommend.subject; go('train'); break;
      case 'claim': b.replaceWith(Object.assign(document.createElement('span'), { className: 'mission__reward got', textContent: '受取済' })); toast('報酬を受け取りました'); break;
    }
  });
  root.addEventListener('pointerover', (e) => { if (e.target.closest('[data-action="match"]') && state.expr !== 'serious') setDialogue(char().lines.match, 'serious'); });
  root.addEventListener('focusin', (e) => { if (e.target.closest('[data-action="match"]') && state.expr !== 'serious') setDialogue(char().lines.match, 'serious'); });

  window.addEventListener('hashchange', render);
  render();
})();
