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
  window.remapBank(window.QUESTION_BANK);
  /* 選択科目（理科・社会）。選んだ科目の単元だけが陣地・出題の対象になる */
  const EL = window.ELECTIVES;
  function fixElectives() {
    P.electives = P.electives || {};
    Object.keys(EL).forEach((s) => {
      const ok = (P.electives[s] || []).filter((t) => EL[s].options.includes(t));
      P.electives[s] = ok.length >= EL[s].min && ok.length <= EL[s].max ? ok : EL[s].def.slice();
    });
  }
  const applyCurriculum = () => KN.setCurriculum(window.curriculumFor(P.electives), window.QUESTION_BANK, window.CURRICULUM);
  fixElectives();
  applyCurriculum();
  const now = () => Date.now() + (P.dayShift || 0) * KN.DAY;
  function initKnowledge() {
    if (!P.K) { P.K = KN.synth(P.stats, 7, now()); P.qr = {}; P.dayShift = 0; }
    migrateUnits();
    if (!P.cos) P.cos = clone(window.COSMETICS.defaults);
    migrateCos();
    if (!P.achv) P.achv = { train: 0, duel: 0 };
    if (!P.defense) P.defense = { order: KN.SUBJECTS.slice(), focus: P.focus || KN.SUBJECTS[0] };
    refreshStats();
  }
  /* 旧カリキュラムの単元の学習記録を新しい単元へ移す（統合先に記録があれば、解いた回数が多い方を残す） */
  function migrateUnits() {
    const M = window.UNIT_REMAP, U = P.K.units;
    Object.keys(M).forEach((k) => {
      if (!U[k]) return;
      const to = M[k] && k.split('/')[0] + '/' + M[k];
      if (to && (!U[to] || (U[to].n || 0) < (U[k].n || 0))) U[to] = U[k];
      delete U[k];
    });
  }
  function setElective(s, track) {
    const cur = P.electives[s], e = EL[s];
    let next = cur.includes(track) ? cur.filter((t) => t !== track) : cur.concat(track);
    if (next.length > e.max) next = next.slice(next.length - e.max); // 上限を超えたら古い選択を外す
    if (next.length < e.min) return false;
    P.electives[s] = next;
    applyCurriculum();
    Object.keys(opCache).forEach((k) => delete opCache[k]);
    refreshStats(); savePlayer();
    return true;
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

  /* 非同期PvP：誰かがあなたの防衛データに挑んだ結果。
     対戦中やプレイ中に割り込ませず、ホームを開いたときに「前回から経過した時間」ぶんだけまとめて反映する（試作は 4 時間に 1 件・1 回に最大 3 件）。
     防衛負けで失う RP は 1 日 20 まで */
  const DEF_EVERY = 4 * 3600000, DEF_LOSS_CAP = 20;
  function defenseTick() {
    const t = now(); if (!P.defClock) { P.defClock = t; return 0; }
    let k = Math.min(3, Math.floor((t - P.defClock) / DEF_EVERY)); if (k <= 0) return 0;
    P.defClock += k * DEF_EVERY;
    const day = KN.dayOf(t); if (!P.defDay || P.defDay.d !== day) P.defDay = { d: day, lost: 0 };
    let added = 0;
    for (; k > 0; k--) {
      const os = window.OPPONENTS, o = os[Math.floor(Math.random() * os.length)];
      const atk = { K: opK(o), S: opStats(o), focus: KN.SUBJECTS[Math.floor(Math.random() * 5)] };
      const def = { K: P.K, S: P.stats, focus: P.defense.focus, order: P.defense.order };
      const res = window.Battle.resolveBattle(atk, def, Math.floor(Math.random() * 1e9), t);
      const win = !res.win; let rp = win ? 5 : -6;
      if (rp < 0) { rp = -Math.min(-rp, Math.max(0, DEF_LOSS_CAP - P.defDay.lost)); P.defDay.lost -= rp; }
      P.rank.rp = Math.max(0, P.rank.rp + rp);
      P.defenseLog.unshift({ name: o.name, rank: o.rank, win, score: `${res.opW}-${res.myW}`, rp, at: t - k * 60000, lost: res.areas.filter((a) => !a.skipped && a.win).map((a) => a.subject) });
      added++;
    }
    P.defenseLog = P.defenseLog.slice(0, 6); savePlayer();
    return added;
  }
  const agoOf = (d) => { if (d.at == null) return d.ago || ''; const m = Math.max(0, Math.round((now() - d.at) / 60000)); return m < 60 ? `${m}分前` : m < 1440 ? `${Math.round(m / 60)}時間前` : `${Math.round(m / 1440)}日前`; };

  /* 直接対決で試合が逆転したとき：負けのRPを取り消して勝ちのRPを付ける */
  function overturn(r) {
    const start = P.rank.rp - r.from;
    P.rank.rp = Math.max(0, P.rank.rp - r.from + r.to);
    P.rank.winStreak += 1;
    savePlayer();
    return { before: rankView(start), after: rankView(P.rank.rp) };
  }

  /* おすすめ学習：知識データから毎回計算する。忘れかけ（定着60%未満）→ 正答予測が最も低い学習済み単元 → 頻度の高い未学習単元 の順 */
  function recommend() {
    const t = now(), cands = [];
    KN.SUBJECTS.forEach((s) => (KN.units()[s] || []).forEach((unit) => {
      const u = P.K.units[KN.key(s, unit)], w = KN.meta(s, unit).weight;
      if (u && u.n) cands.push({ s, unit, w, n: u.n, c: u.c, p: KN.prob(u.r, KN.STD), R: KN.retention(u, t) });
      else cands.push({ s, unit, w, n: 0 });
    }));
    const learned = cands.filter((x) => x.n), fading = learned.filter((x) => x.R < 0.6).sort((a, b) => a.R - b.R || b.w - a.w);
    const low = learned.slice().sort((a, b) => a.p - b.p || b.w - a.w), fresh = cands.filter((x) => !x.n).sort((a, b) => b.w - a.w);
    const pick = fading[0] ? { x: fading[0], why: `定着度が${Math.round(fading[0].R * 100)}%まで下がっている単元です。今の復習がいちばん効きます。` }
      : low[0] ? { x: low[0], why: `学習済みの単元の中で、正答予測が最も低い単元です（${Math.round(low[0].p * 100)}%）。` }
      : { x: fresh[0], why: '入試での出題頻度が高い、まだ解いていない単元です。' };
    const x = pick.x, acc = x.n ? (x.c != null ? `${Math.round((x.c / x.n) * 100)}%（${x.c}/${x.n}問）` : '—') : '未学習';
    return Object.assign({}, P.recommend, { subject: x.s, unit: x.unit, accuracy: acc, why: pick.why, questions: 10 });
  }

  /* 演習の結果（知識データは1問ごとに recordAnswer で更新済み）：挑戦権・EXP・学習量・ミッション */
  function applyTraining(g) {
    P.achv.train += 1;
    P.tickets.now = Math.min(P.tickets.max, P.tickets.now + 1);
    addExp(g.correct * 15 + 60);
    addStudy(g.seconds, g.total, g.correct);
    P.missions.forEach((ms) => { if (ms.id === 'm2' && g.subject === '数学') ms.progress = Math.max(ms.progress, Math.min(ms.total, g.maxStreak)); });
    savePlayer();
  }

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const saved = load();
  let typeTimer = 0; // セリフの 1 文字ずつ表示
  const state = {
    typeId: D.types.some((t) => t.id === saved.typeId) ? saved.typeId : D.types[0].id,
    gender: saved.gender === 'f' ? 'f' : 'm',
    confirmed: !!saved.confirmed,
    lineIdx: 0,
    expr: 'default',
    sel: { step: 'type', picked: null, expr: 0, line: 0, detail: false, confirming: false }, // 選択画面：段階（type→char）・選んだナビ・表情・セリフ・詳細・確認
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
    root.innerHTML = window.SelectView.render({ D, t: type(), confirmed: state.confirmed, sel: state.sel });
  }

  function renderHome() {
    const t = type(), c = char();
    root.innerHTML = `<div class="screen screen--home">
      ${UI.TopBar(P, t, c)}
      <div class="lobby">
        <div class="lobby__nav">
          <button class="navstage hn" data-action="talk" aria-label="${UI.esc(c.name)}に話しかける">
            <span class="hn__bg" aria-hidden="true"><span class="hn__rays"></span><span class="hn__ring"></span><span class="navstage__grid"></span>${Array.from({ length: 8 }, (_, i) => `<i class="gs-spark" style="--i:${i * 1.6}"></i>`).join('')}</span>
            <span class="hn__beam" aria-hidden="true"></span>
            <span class="hn__holo" style="--img:url('${window.SelectView.artOf(c, state.expr)}')"><img class="hn__img" src="${window.SelectView.artOf(c, state.expr)}" alt="${UI.esc(c.name)}"><span class="hn__scan" aria-hidden="true"></span></span>
            <span class="hn__pad" aria-hidden="true"><i></i><i></i></span>
            <span class="hn__hud" aria-hidden="true"><b>NAV LINK</b><small>ONLINE</small><span class="hn__sig"><i></i><i></i><i></i><i></i></span></span>
            <span class="navstage__plate hn__plate"><span class="hn__tag">${UI.Emblem(t.emblem)}${t.name}</span><b>${UI.esc(c.name)}</b><small>${UI.esc(c.title)}</small></span>
            <span class="hn__tap" aria-hidden="true">TAP で話す</span>
          </button>
          ${UI.Dialogue(D, c, currentLine(), state.expr)}
        </div>
        <div class="lobby__main">
          ${UI.RankCard(rankCardData(), P.season)}
          ${UI.ArenaCTA(P, window.Battle.totalPower(P.stats))}
          ${window.Mechs ? window.Mechs.Squad(P.stats, t.color, P.defense.focus) : ''}
          ${UI.StatsCard(P.stats, P.defense.focus, window.Battle.power)}
          <div class="tiles">${UI.LevelCard(P.level)}${UI.TodayCard(P.today)}</div>
          ${UI.RecommendCard(recommend(), t, c)}
        </div>
        <div class="lobby__side">${UI.DefenseLog(P.defenseLog.map((d) => Object.assign({}, d, { ago: agoOf(d) })), P.defense, window.Defense.rates(P.defense.order, P.defense.focus, { now, myK: () => P.K, player: P, opponents: window.OPPONENTS, opK, opStats }).avg)}${UI.MissionList(P.missions)}<div class="demo"><button class="reset" data-action="advance">試作：3日進める（忘却の確認）</button><button class="reset" data-action="reset">試作データをリセット</button></div></div>
      </div>
      ${UI.BottomNav()}
    </div>`;
  }

  function render() {
    applyTheme(type());
    refreshStats();
    const route = location.hash.replace('#', '') || (state.confirmed ? 'home' : 'select');
    const base = { D, player: P, type: type(), char: char(), rankLabel: rankView(P.rank.rp).label, exit: () => go('home') };
    window.Battle.unmount(); window.Training.unmount(); window.MyBase.unmount(); window.Defense.unmount();
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
    if (route === 'defense' && state.confirmed) {
      window.Defense.mount(root, { D, player: P, type: type(), char: char(), now, myK: () => P.K, opponents: window.OPPONENTS, opK, opStats,
        look: () => window.MyBase.lookOf(P), save: savePlayer, toast, exit: () => go('home') });
      return;
    }
    if (route === 'base' && state.confirmed) {
      window.MyBase.mount(root, { player: P, type: type(), char: char(), catalog: window.COSMETICS, save: savePlayer, toast, openShop: state.openShop, exit: () => go('home') });
      state.openShop = false;
      return;
    }
    if (route === 'stats' && state.confirmed) {
      const subj = state.statsSubject || P.recommend.subject;
      root.innerHTML = window.StatsView.render({ player: P, K: P.K, now: now(), subject: subj, electives: P.electives });
      return;
    }
    if (route === 'home' && state.confirmed) { if (defenseTick()) refreshStats(); renderHome(); typeLine(); } else renderSelect();
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
    fx.innerHTML = `<span class="contract__rays"></span><span class="contract__flash"></span><div class="contract__inner">${UI.Portrait({ char: c, expr: 'smile', cls: 'portrait--fx' })}<span class="contract__stamp">CONTRACT COMPLETE</span><b>${UI.esc(c.name)}</b><p>「${UI.esc(c.catch)}」</p></div>`;
    document.body.appendChild(fx);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { fx.classList.add('out'); setTimeout(() => fx.remove(), 400); }, reduce ? 600 : 2100);
  }

  /* 吹き出しだけ差し替え（全再描画しない） */
  function setDialogue(line, expr) {
    state.expr = expr;
    const d = root.querySelector('.dialogue'); if (!d) return;
    d.outerHTML = UI.Dialogue(D, char(), line, expr);
    typeLine();
    const h = root.querySelector('.hn__holo'); // 表情を差し替えて、一瞬ホログラムに戻ってから実体化
    if (h) { const src = window.SelectView.artOf(char(), expr); h.style.setProperty('--img', `url('${src}')`); h.querySelector('.hn__img').src = src; h.classList.remove('flip'); void h.offsetWidth; h.classList.add('flip'); }
  }
  /* セリフを 1 文字ずつ表示（動きを減らす設定なら一度に） */
  function typeLine() {
    const p = root.querySelector('.dialogue p'); if (!p) return;
    clearInterval(typeTimer);
    const text = p.textContent; if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    p.setAttribute('aria-label', text); let i = 0; p.textContent = '';
    typeTimer = setInterval(() => { p.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typeTimer); }, 28);
  }

  /* Esc で選択画面の詳細・確認を閉じる */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !root.querySelector('.screen--gs')) return;
    if (state.sel.confirming) { state.sel.confirming = false; window.SelectView.overlay(root, 'confirm', false); }
    else if (state.sel.detail) { state.sel.detail = false; window.SelectView.overlay(root, 'detail', false); }
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.seltype) { state.typeId = b.dataset.seltype; state.sel = { step: 'char', picked: null, expr: 0, line: 0, detail: false, confirming: false }; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.selchar) { state.gender = b.dataset.selchar; window.SelectView.pick(root, type(), state.sel, b.dataset.selchar); return; }
    if (b.dataset.type) { state.typeId = b.dataset.type; render(); return; }
    if (b.dataset.gender) { state.gender = b.dataset.gender; render(); return; }
    if (b.dataset.statsSubject) { state.statsSubject = b.dataset.statsSubject; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.elective) { setElective(b.dataset.electiveSubject, b.dataset.elective); render(); return; }
    switch (b.dataset.action) {
      case 'sel-back': state.sel = { step: 'type', picked: null, expr: 0, line: 0, detail: false, confirming: false }; render(); window.scrollTo(0, 0); break;
      case 'sel-detail': state.sel.detail = !state.sel.detail; window.SelectView.overlay(root, 'detail', state.sel.detail, D, type(), char()); break;
      case 'sel-confirm': state.sel.confirming = true; window.SelectView.overlay(root, 'confirm', true, D, type(), char()); break;
      case 'sel-cancel': state.sel.confirming = false; window.SelectView.overlay(root, 'confirm', false); break;
      case 'confirm': state.sel.confirming = false; state.confirmed = true; state.lineIdx = 0; state.expr = 'smile'; persist(); confirmFx(); go('home'); break;
      case 'change-nav': state.sel = { step: 'type', picked: null, expr: 0, line: 0, detail: false, confirming: false }; go('select'); break;
      case 'back-home': go('home'); break;
      case 'talk': state.lineIdx++; setDialogue(currentLine(), state.lineIdx % 2 ? 'smile' : 'default'); break;
      case 'match': go('arena'); break;
      case 'train': state.trainSubject = b.dataset.subject || P.recommend.subject; state.trainUnits = b.dataset.units ? b.dataset.units.split('|') : []; go('train'); break;
      case 'base': go('base'); break;
      case 'defense': go('defense'); break;
      case 'shop': state.openShop = true; go('base'); break;
      case 'stats': state.statsSubject = b.dataset.subject || state.statsSubject; go('stats'); break;
      case 'advance': P.dayShift = (P.dayShift || 0) + 3; refreshStats(); savePlayer(); render(); toast('3日経過：復習していない単元の定着が下がりました'); break;
      case 'reset': P = clone(window.MOCK_PLAYER); initKnowledge(); savePlayer(); state.expr = 'default'; render(); toast('試作データを初期状態に戻しました'); break;
      case 'study': { const r = recommend(); state.trainSubject = r.subject; state.trainUnits = [r.unit]; go('train'); break; }
      case 'claim': b.replaceWith(Object.assign(document.createElement('span'), { className: 'mission__reward got', textContent: '受取済' })); toast('報酬を受け取りました'); break;
    }
  });
  root.addEventListener('pointerover', (e) => { if (e.target.closest('[data-action="match"]') && state.expr !== 'serious') setDialogue(char().lines.match, 'serious'); });
  root.addEventListener('focusin', (e) => { if (e.target.closest('[data-action="match"]') && state.expr !== 'serious') setDialogue(char().lines.match, 'serious'); });

  window.addEventListener('hashchange', render);
  render();
})();
