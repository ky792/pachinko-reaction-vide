/*
 * 開発者モード（D キーで表示切替。配信モードでは常に非表示）
 * 強制抽選・演出個別再生で発生した結果は「テスト」扱いとなり、通常統計から除外される。
 */
(function (NB) {
  'use strict';

  class DevTools {
    constructor(app) {
      this.app = app; this.G = app.game;
      this.el = document.getElementById('dev');
      this.visible = false;
      this.nailEdit = null;
      this.build();
      setInterval(() => this.visible && this.refresh(), 500);
    }
    toggle(v) { this.visible = v ?? !this.visible; this.el.classList.toggle('show', this.visible); if (!this.visible) this.setNailEdit(false); this.refresh(); }

    btn(label, fn, cls = '') { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = () => { this.app.audio.unlock(); fn(); this.refresh(); }; return b; }
    section(title) { const s = document.createElement('section'); const h = document.createElement('h3'); h.textContent = title; s.appendChild(h); this.body.appendChild(s); return s; }
    row(sec, ...els) { const r = document.createElement('div'); r.className = 'row'; els.forEach((e) => r.appendChild(e)); sec.appendChild(r); return r; }
    slider(label, min, max, step, get, set) {
      const w = document.createElement('label'); w.className = 'sl';
      const t = document.createElement('span'); const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
      const v = document.createElement('b'); v.textContent = (+get()).toFixed(step < 1 ? 2 : 0);
      t.textContent = label; i.oninput = () => { set(+i.value); v.textContent = (+i.value).toFixed(step < 1 ? 2 : 0); };
      w.append(t, i, v); return w;
    }

    build() {
      const G = this.G, app = this.app;
      this.el.innerHTML = '<header><b>DEV MODE</b><span>NBL-001 ABYSS REACTOR</span><button id="devx">×</button></header><div class="body"></div>';
      this.el.querySelector('#devx').onclick = () => this.toggle(false);
      this.body = this.el.querySelector('.body');

      let s = this.section('強制抽選（テスト扱い・統計除外）');
      this.row(s,
        this.btn('大当たり→RUSH', () => G.addHold(G.mode === 'rush' ? 'denchu' : 'heso', { forced: 'rush' }), 'hot'),
        this.btn('大当たり→通常', () => G.addHold('heso', { forced: 'normalWin' })),
        this.btn('ハズレ(リーチ)', () => G.addHold(G.mode === 'rush' ? 'denchu' : 'heso', { forced: 'reachLose' })),
        this.btn('ハズレ', () => G.addHold(G.mode === 'rush' ? 'denchu' : 'heso', { forced: 'lose' })));
      this.row(s,
        this.btn('RUSH 強制突入', () => { if (G.phase === 'idle') { G.chain = 1; G.rushGain = 0; G.timeline.play(G.director.buildRushIntro(G.spec.rush.stSpins), () => G.enterRush()); G.phase = 'seq'; } }),
        this.btn('RUSH 終了', () => { if (G.mode === 'rush' && G.phase === 'idle') { G.st = 0; G.endRush(); } }),
        this.btn('ST 残り3', () => { if (G.mode === 'rush') G.st = 3; }));

      s = this.section('SPリーチ・演出 個別再生');
      const perf = [['normal', 'ノーマル'], ['sp_connect', '機関接続'], ['sp_control', '暴走制御'], ['sp_awaken', '深淵覚醒'], ['overdrive', 'OVERDRIVE']];
      for (const [cls, name] of perf) this.row(s, Object.assign(document.createElement('span'), { textContent: name, className: 'lab' }),
        this.btn('当たり', () => { this.ensureNormal(); G.addHold('heso', { forced: 'win', cls }); }, cls === 'overdrive' ? 'hot' : ''),
        this.btn('ハズレ', () => { this.ensureNormal(); G.addHold('heso', { forced: 'reachLose', cls }); }));
      const rp = [['sudden', '突発'], ['short', 'RUSHリーチ'], ['sp_rush', '深淵迎撃']];
      for (const [cls, name] of rp) this.row(s, Object.assign(document.createElement('span'), { textContent: 'RUSH:' + name, className: 'lab' }),
        this.btn('当たり', () => G.mode === 'rush' && G.addHold('denchu', { forced: 'win', cls })),
        this.btn('ハズレ', () => G.mode === 'rush' && cls !== 'sudden' && G.addHold('denchu', { forced: 'reachLose', cls })));
      this.row(s, this.btn('役物: 落下', () => G.gm.preset('full')), this.btn('役物: ガセ', () => G.gm.preset('tease')), this.btn('役物: 格納', () => G.gm.preset('stow')), this.btn('役物: OVERDRIVE', () => G.gm.preset('overdrive')));

      s = this.section('保留');
      const colors = ['normal', 'blue', 'green', 'red', 'gold', 'rainbow'];
      this.row(s, ...colors.map((c) => this.btn(c, () => { this.ensureNormal(); G.addHold('heso', { forced: c === 'rainbow' ? 'win' : 'lose', color: c }); })));
      this.row(s, this.btn('変化テスト(→赤)', () => { const h = G.holds1[G.holds1.length - 1]; if (h) { h.finalColor = 'red'; G.director.holdChange(h); } }),
        this.btn('変化テスト(→金)', () => { const h = G.holds1[G.holds1.length - 1]; if (h) { h.finalColor = 'gold'; G.director.holdChange(h); } }),
        this.btn('保留を4個に', () => { while (G.holds1.length < 4) G.addHold('heso', { forced: 'lose' }); }),
        this.btn('保留クリア', () => { G.holds1.length = 0; G.holds2.length = 0; }));

      s = this.section('スペック・確率（変更中はテスト扱い）');
      const pin = (mode) => { const i = document.createElement('input'); i.type = 'number'; i.step = '0.1'; i.placeholder = (1 / G.spec[mode].probability).toFixed(1); i.className = 'num'; return i; };
      const pn = pin('normal'), pr = pin('rush');
      this.row(s, Object.assign(document.createElement('span'), { textContent: '通常 1/', className: 'lab' }), pn, Object.assign(document.createElement('span'), { textContent: 'RUSH 1/', className: 'lab' }), pr,
        this.btn('適用', () => { G.lottery.override.normal = pn.value ? 1 / +pn.value : null; G.lottery.override.rush = pr.value ? 1 / +pr.value : null; }),
        this.btn('戻す', () => { G.lottery.override.normal = G.lottery.override.rush = null; pn.value = pr.value = ''; }));
      const stIn = document.createElement('input'); stIn.type = 'number'; stIn.className = 'num'; stIn.value = G.spec.rush.stSpins;
      this.row(s, Object.assign(document.createElement('span'), { textContent: 'ST回数', className: 'lab' }), stIn, this.btn('適用', () => { G.spec.rush.stSpins = Math.max(1, +stIn.value | 0); if (G.mode === 'rush') G.st = Math.min(G.st, G.spec.rush.stSpins); }));

      s = this.section('釘調整・物理');
      const L = G.machine.layout;
      const hesoNails = () => L.nails.filter((n) => n.g === 'heso');
      const gap0 = Math.abs(hesoNails()[1].x - hesoNails()[0].x);
      s.appendChild(this.slider('命釘（ヘソ）間隔', 14, 24, 0.2, () => Math.abs(hesoNails()[1].x - hesoNails()[0].x), (v) => { const [a, b] = hesoNails(); const c = (a.x + b.x) / 2; a.x = c - v / 2; b.x = c + v / 2; this.applyNails(); }));
      s.appendChild(this.slider('ワープ入賞率', 0, 1, 0.02, () => L.warp.chance, (v) => (L.warp.chance = v)));
      s.appendChild(this.slider('ステージ前こぼれ率', 0, 3, 0.05, () => L.stage.frontFallRate, (v) => (L.stage.frontFallRate = v)));
      s.appendChild(this.slider('釘の反発', 0.2, 0.9, 0.01, () => L.restitution.nail, (v) => (L.restitution.nail = v)));
      s.appendChild(this.slider('左打ち強さ', 0, 0.6, 0.01, () => G.settings.leftPower, (v) => { G.settings.leftPower = v; if (!G.rightShoot) G.handle.power = v; }));
      s.appendChild(this.slider('右打ち強さ', 0.5, 1, 0.01, () => G.settings.rightPower, (v) => (G.settings.rightPower = v)));
      this.nailBtn = this.btn('釘ドラッグ編集: OFF', () => this.setNailEdit(!this.nailEdit));
      this.row(s, this.nailBtn, this.btn('釘データ書き出し', () => this.exportNails()), this.btn('釘を初期化', () => { localStorage.removeItem('nb-nails-' + G.machine.id); location.reload(); }));
      this.simOut = document.createElement('pre'); this.simOut.className = 'log';
      this.row(s, this.btn('1000球 試射シミュ（左打ち）', () => this.simulate(false)), this.btn('500球 試射（右打ち/開放）', () => this.simulate(true)));
      s.appendChild(this.simOut);
      this._gap0 = gap0;

      s = this.section('演出速度・音量');
      s.appendChild(this.slider('演出再生速度', 0.25, 4, 0.05, () => G.settings.speed, (v) => (G.settings.speed = v)));
      for (const k of ['master', 'bgm', 'se', 'jingle']) s.appendChild(this.slider('音量 ' + k, 0, 1, 0.01, () => app.audio.volumes[k], (v) => app.audio.setVolume(k, v)));

      s = this.section('統計（通常 / テスト）');
      this.statsEl = document.createElement('pre'); this.statsEl.className = 'log'; s.appendChild(this.statsEl);
      s = this.section('演出信頼度（テーブルから算出）');
      this.relEl = document.createElement('pre'); this.relEl.className = 'log'; s.appendChild(this.relEl); this.relEl.textContent = this.reliability();
      s = this.section('抽選ログ');
      this.logEl = document.createElement('pre'); this.logEl.className = 'log tall'; s.appendChild(this.logEl);

      s = this.section('素材の表示確認');
      this.assetEl = document.createElement('div'); this.assetEl.className = 'assets'; s.appendChild(this.assetEl);
      this.row(s, this.btn('素材状況を更新', () => this.renderAssets()));

      s = this.section('リセット・セーブ');
      this.row(s, this.btn('状態リセット', () => G.reset(false)), this.btn('統計リセット', () => { G.stats = NB.Game.emptyStats(); G.testStats = NB.Game.emptyStats(); }),
        this.btn('セーブ', () => G.save()), this.btn('セーブ削除', () => localStorage.removeItem('nb-save-' + G.machine.id)));
    }

    ensureNormal() { /* RUSH 中でも特図1保留として積む（消化は特図2優先） */ }

    applyNails() { this.G.physics.rebuild(); this.app.mr.rebuildBoard(); this.saveNails(); }
    saveNails() { try { localStorage.setItem('nb-nails-' + this.G.machine.id, JSON.stringify(this.G.machine.layout.nails)); } catch (e) {} }
    exportNails() {
      const txt = JSON.stringify(this.G.machine.layout.nails.map((n) => [n.x, n.y, n.g]));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'nails.json'; a.click();
    }
    setNailEdit(on) {
      this.nailEdit = on ? { sel: null } : null;
      if (this.nailBtn) this.nailBtn.textContent = '釘ドラッグ編集: ' + (on ? 'ON' : 'OFF');
      this.app.nailEdit = this.nailEdit;
    }

    simulate(right) {
      const G = this.G, L = G.machine.layout;
      const res = {}; let warp = 0, center = 0;
      const ph = new NB.Physics(L, { seed: Date.now() & 0xffff, onEvent: (t, e) => { if (t === 'remove') res[e.reason] = (res[e.reason] || 0) + 1; if (t === 'warp') warp++; if (t === 'stageCenter') center++; } });
      ph.gates.denchu = right; ph.gates.attacker = right;
      const n = right ? 500 : 1000, iv = L.launch.interval, pw = right ? G.settings.rightPower : G.settings.leftPower;
      let t = 0, k = 0; const t0 = performance.now();
      while ((k < n || ph.balls.length) && t < n * iv + 30) { if (k < n && t >= k * iv) { ph.launch(pw); k++; } ph.step(NB.Physics.STEP); t += NB.Physics.STEP; }
      const per = (x) => (((x || 0) / n) * 100).toFixed(1) + '%';
      this.simOut.textContent = `強さ ${pw.toFixed(2)} / ${n}球  (${(performance.now() - t0).toFixed(0)}ms)\nヘソ ${res.heso || 0} (${per(res.heso)})  → 1000円(250球)あたり ${(((res.heso || 0) / n) * 250).toFixed(1)}回転\nワープ ${warp}  ステージ中央 ${center}\n一般入賞 ${res.general || 0}  電チュー ${res.denchu || 0}  アタッカー ${res.attacker || 0}\nアウト ${res.out || 0}  ファール ${res.foul || 0}  詰まり ${res.lost || 0}`;
    }

    reliability() {
      const sp = this.G.spec, P = this.G.machine.performance.normal, names = this.G.machine.performance.names;
      const p = sp.normal.probability, rr = sp.normal.lossReachRate;
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      const sw = sum(P.win), sl = sum(P.loseReach);
      const out = ['演出                 信頼度    出現率(1/x)'];
      for (const k of Object.keys(P.win)) {
        const pw = p * (P.win[k] / sw), pl = (1 - p) * rr * ((P.loseReach[k] || 0) / sl);
        out.push(`${(names[k] || k).padEnd(14, '　')} ${((pw / (pw + pl)) * 100).toFixed(1).padStart(5)}%   1/${(1 / (pw + pl)).toFixed(0)}`);
      }
      const T = P.hold;
      out.push('', '保留色         信頼度');
      for (const c of ['blue', 'green', 'red', 'gold', 'rainbow']) {
        const sw2 = sum(T.win); let pw = p * ((T.win[c] || 0) / sw2), pl = 0;
        const lw = { noReach: (1 - p) * (1 - rr) };
        for (const k of Object.keys(P.loseReach)) lw[k] = (1 - p) * rr * (P.loseReach[k] / sl);
        for (const k in lw) { const tt = T[k] || T.noReach; pl += lw[k] * ((tt[c] || 0) / sum(tt)); }
        out.push(`${c.padEnd(10)}   ${((pw / (pw + pl)) * 100).toFixed(1).padStart(5)}%`);
      }
      out.push('', `RUSH継続率（理論） ${((1 - Math.pow(1 - sp.rush.probability, sp.rush.stSpins)) * 100).toFixed(1)}%`);
      return out.join('\n');
    }

    renderAssets() {
      const A = this.app.assets; this.assetEl.innerHTML = '';
      for (const it of A.items.values()) {
        const d = document.createElement('div'); d.className = 'asset ' + it.status;
        const img = A.image(it.id);
        if (img && img.width && it.type !== 'video') { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); const s = Math.min(64 / img.width, 64 / img.height); g.drawImage(img, (64 - img.width * s) / 2, (64 - img.height * s) / 2, img.width * s, img.height * s); d.appendChild(c); }
        const t = document.createElement('span'); t.textContent = `${it.id}\n${it.status === 'loaded' ? '外部素材' : (img ? '仮素材' : '未配置(プロシージャル)')}`; d.appendChild(t);
        this.assetEl.appendChild(d);
      }
    }

    refresh() {
      if (!this.visible) return;
      const G = this.G, S = G.stats, T = G.testStats;
      const f = (s) => `回転 ${s.spins}  当たり ${s.hits}  初当たり ${s.firstHits}  RUSH ${s.rushEntries}  最大 ${s.maxChain}連\n発射 ${s.launched}  払出 ${s.payout}  差玉 ${s.payout - s.launched}  ヘソ入賞 ${s.hesoIn}  貸玉 ${s.lent}`;
      this.statsEl.textContent = `[通常]\n${f(S)}\n初当たり実測 1/${S.firstHits ? (S.spinsByMode.normal / S.firstHits).toFixed(1) : '-'}\n\n[テスト]\n${f(T)}\n\n状態: ${G.mode} / ${G.phase}  ST:${G.st ?? '-'}  連:${G.chain}  保留 ${G.holds1.length}/${G.holds2.length}\n確率: 通常 1/${(1 / G.lottery.probability('normal')).toFixed(1)} RUSH 1/${(1 / G.lottery.probability('rush')).toFixed(1)}${G.lottery.isOverridden('normal') || G.lottery.isOverridden('rush') ? '  ※変更中(テスト)' : ''}\n演出: ${G.lastScenarioName || '-'}`;
      this.logEl.textContent = G.log.slice(-40).reverse().map((e) => {
        const tm = new Date(e.time).toLocaleTimeString();
        if (e.type === 'spin') return `${tm} ${e.test ? '[T]' : '   '} ${e.mode === 'rush' ? 'ST' + String(e.st).padStart(2) : '通常'} 乱数${String(e.value).padStart(5)} ${e.win ? '★当たり' : e.reach ? 'リーチ' : 'ハズレ'}  ${e.perf}`;
        if (e.type === 'hit') return `${tm} ${e.test ? '[T]' : '   '} ===== 大当たり ${e.kind === 'rush' ? 'RUSH中' : e.toRush ? '→RUSH' : '→通常'} =====`;
        if (e.type === 'rushEnd') return `${tm}     ----- RUSH終了 ${e.chain}連 ${e.gain}玉 -----`;
        return tm + ' ' + JSON.stringify(e);
      }).join('\n');
    }
  }

  NB.DevTools = DevTools;
})(globalThis.NB);
