/*
 * 演出選択エンジン＋シナリオ構築
 *  - 抽選結果を受け取り、演出テーブル（machines/<id>/performance.js）から演出を選ぶ
 *  - 選んだ演出を TimelineBuilder 上の映像シーケンスとして組み立てる
 *  - 演出用乱数は抽選用乱数と完全に分離（演出が当否に影響しない）
 */
(function (NB) {
  'use strict';
  const STRIP = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const wrap = (n) => ((n - 1 + 900) % 9) + 1;

  class Director {
    constructor(game) {
      this.G = game;
      this.perf = game.machine.performance;
      this.spec = game.machine.spec;
      this.rng = new NB.RNG(); // 演出専用乱数
    }

    // =============================================================== 演出選択
    /** 入賞時：事前判定から演出クラスと保留色を決める（先読み） */
    onHoldAcquired(hold, mode) {
      const P = this.perf.normal, r = this.rng;
      const pre = hold.pre;
      if (mode === 'normal' && hold.source === 'heso') {
        let cls;
        if (hold.forcedCls) cls = hold.forcedCls;
        else if (pre.win) cls = r.weighted(P.win);
        else if (pre.reach) cls = r.weighted(P.loseReach);
        else cls = 'noReach';
        hold.preCls = cls;
        const key = pre.win ? 'win' : cls;
        let color = hold.forcedColor || r.weighted(P.hold[key] || P.hold.noReach);
        if (color === 'rainbow' && !pre.win) color = 'gold';
        hold.finalColor = color;
        const order = ['normal', 'blue', 'green', 'red', 'gold', 'rainbow'];
        const fi = order.indexOf(color);
        if (fi > 0 && r.chance(P.holdChangeRate) && !hold.forcedColor) {
          hold.color = order[r.int(fi)]; // 低い色で出して後で変化
          hold.changeAt = r.chance(0.65) ? 'consume' : 'next';
        } else { hold.color = color; hold.changeAt = null; }
        // 先読みゾーン／予告
        const zk = pre.win ? 'win' : cls;
        hold.zone = r.chance(P.zone[zk] || 0);
        hold.yokoku = r.chance(P.yokoku[zk] || 0);
      } else {
        hold.preCls = null; hold.color = 'normal'; hold.finalColor = 'normal';
      }
      return hold;
    }

    planNormal(hold, res) {
      const P = this.perf.normal, r = this.rng;
      let cls;
      const preMatch = hold.pre && hold.pre.win === res.win && !!hold.pre.reach === !!res.reach && hold.preCls;
      if (hold.forcedCls) cls = hold.forcedCls;
      else if (preMatch) cls = hold.preCls;
      else if (res.win) cls = r.weighted(P.win);
      else if (res.reach) cls = r.weighted(P.loseReach);
      else cls = 'noReach';
      if (!res.win && !res.reach) cls = 'noReach';
      if (!res.win && res.reach && cls === 'noReach') cls = 'normal';
      const wl = res.win ? 'win' : 'lose';
      const gijiTab = res.win ? P.giji.win : P.giji[cls];
      let giji = +r.weighted(Object.fromEntries(gijiTab.map((w, i) => [i, w])));
      if (cls === 'noReach' && giji > 1) giji = 1;
      const plan = {
        cls, giji, win: res.win,
        telop: r.weighted(P.telop[wl]), cutin: r.weighted(P.cutin[wl]), button: r.weighted(P.button[wl]),
        gimmick: r.weighted(P.gimmick[wl]), reachText: r.weighted(P.reachText[wl]),
      };
      if (cls === 'overdrive') { plan.button = 'big'; plan.gimmick = 'none'; }
      // 図柄
      if (res.win) {
        let s = 1 + r.int(9);
        if (res.kind === 'first') {
          if (res.toRush && r.chance(P.sevenOnRush)) s = 7;
          else while (s === 7) s = 1 + r.int(9);
        }
        plan.sym = { L: s, R: s, C: s };
        plan.rushKnown = s === 7;
      } else if (cls !== 'noReach') {
        const s = 1 + r.int(9);
        plan.sym = { L: s, R: s, C: wrap(s + (r.chance(0.6) ? 1 : -1)) };
      } else {
        const L = 1 + r.int(9); let R = 1 + r.int(9); while (R === L) R = 1 + r.int(9);
        plan.sym = { L, R, C: 1 + r.int(9) };
      }
      return plan;
    }

    planRush(hold, res, st) {
      const P = this.perf.rush, r = this.rng;
      let cls = 'noReach';
      if (hold.forcedCls && ['sudden', 'short', 'sp_rush'].includes(hold.forcedCls)) cls = hold.forcedCls;
      else if (res.win) cls = r.weighted(P.win);
      else if (res.reach) cls = r.weighted(P.loseReach);
      const plan = { cls, win: res.win, last: st != null && st <= P.lastSpins, button: res.win ? (r.chance(0.6) ? 'big' : 'normal') : (r.chance(0.12) ? 'big' : 'normal') };
      if (res.win) { const s = 1 + r.int(9); plan.sym = { L: s, R: s, C: s }; }
      else if (cls !== 'noReach') { const s = 1 + r.int(9); plan.sym = { L: s, R: s, C: wrap(s + 1) }; }
      else { const L = 1 + r.int(9); let R = 1 + r.int(9); while (R === L) R = 1 + r.int(9); plan.sym = { L, R, C: 1 + r.int(9) }; }
      return plan;
    }

    // =============================================================== 共通ショートカット
    get lcd() { return this.G.lcd; }
    get R() { return this.G.lcd.reels; }
    sfx(id, o) { this.G.audio.play(id, o); }
    bgm(id, o) { this.G.audio.playBGM(id, o); }
    led(mode, color, i) { this.G.mr.setLED(mode, color, i); }
    fx(name, dur, o) { return this.lcd.fx(name, dur, o); }
    stageBGM() { const st = this.G.stage; return st === 'core' ? 'normal_core' : st === 'alert' ? 'normal_alert' : 'normal_lab'; }
    stageLED() { const st = this.G.stage; return st === 'alert' ? [255, 50, 40] : st === 'core' ? [40, 200, 255] : [60, 220, 255]; }

    // =============================================================== 通常時の変動
    buildNormal(hold, res, holdCount) {
      const plan = this.planNormal(hold, res);
      const tb = new NB.TimelineBuilder();
      const R = this.R, lcd = this.lcd, G = this.G, S = plan.sym;
      let t = 0;
      tb.at(0, () => {
        R.setLayout('main', 0.3); R.startAll(22); lcd.dark = 0; this.sfx('reel_start');
        if (hold.changeAt === 'consume') this.holdChange(hold, true);
        if (G.stage !== 'alert') lcd.setBG(G.stage, 0.6);
      });
      if (hold.changeAt === 'consume') t += 1.2;
      // 予告（先読みとは別の当該予告）
      if (plan.win ? this.rng.chance(0.3) : (plan.cls !== 'noReach' && this.rng.chance(0.08))) {
        tb.at(t + 0.4, () => { this.fx('yokoku', 1.4, { text: '>> REACTOR SIGNAL <<', style: 'cyan' }); this.sfx('yokoku'); this.G.gm.preset('shake'); });
      }
      // 疑似連
      for (let i = 0; i < plan.giji; i++) {
        const ts = t + 1.7;
        tb.at(ts - 0.25, () => { R.reels.forEach((r) => r.slow(3)); });
        tb.at(ts, () => {
          this.sfx('giji', { level: i + 1 }); this.fx('giji', 1.2, { n: i + 2 }); this.fx('flash', 0.3, { color: '120,230,255', a: 0.7 });
          lcd.shake(10); this.G.mr.flash(0.3, '80,220,255'); this.G.gm.preset(i >= 1 ? 'tease' : 'shake');
          lcd.burst({ n: 40, speed: 500, color: '120,230,255', type: 'spark' });
        });
        tb.at(ts + 0.45, () => { R.startAll(24, 0.03); this.sfx('reel_start'); });
        t = ts + 0.6;
      }
      const isReach = plan.cls !== 'noReach';
      if (!isReach) {
        const total = this.spec.variation.normal.noReach[Math.min(4, holdCount)];
        const T1 = Math.max(t + 1.4, total - 1.25);
        tb.at(T1, () => R.stop(0, S.L, 'normal', () => this.sfx('reel_stop')));
        tb.at(T1 + 0.5, () => R.stop(2, S.R, 'normal', () => this.sfx('reel_stop')));
        tb.at(T1 + 1.0, () => R.stop(1, S.C, 'heavy', () => { this.sfx('reel_stop_heavy'); lcd.shake(3); }));
        tb.end(T1 + 1.45);
        return tb.build({ plan, name: 'リーチなし' });
      }
      // ---- リーチ
      const tl = t + 2.0, tr = tl + 0.75;
      tb.at(tl, () => R.stop(0, S.L, 'normal', () => this.sfx('reel_stop')));
      tb.at(tr - 0.25, () => { R.reels[2].slow(10); });
      tb.at(tr, () => R.stop(2, S.R, 'heavy', () => {
        this.sfx('reel_stop_heavy'); this.sfx('tenpai'); lcd.shake(6);
        R.reachSym = S.L; R.reachPulse = 1;
      }));
      if (plan.cls === 'overdrive') { const te = this.overdrive(tb, tr + 0.3, plan, hold); tb.end(te); return tb.build({ plan, name: 'ABYSS OVERDRIVE' }); }
      tb.at(tr + 0.15, () => {
        this.fx('reach', 1.5, { style: plan.reachText }); this.led('reach', plan.reachText === 'gold' ? [255, 200, 60] : [255, 60, 60]);
        this.bgm('reach'); R.reels[1].slow(5); R.setLayout('reach', 0.8); lcd.dark = 0.25;
        lcd.camTo({ zoom: 1.06 }, 2.5);
        lcd.burst({ n: 60, speed: 600, color: plan.reachText === 'gold' ? '255,210,80' : '255,80,80' });
      });
      if (plan.cls === 'normal') {
        const te = tr + 5.2;
        tb.at(tr + 2.2, () => R.reels[1].slow(3));
        tb.at(tr + 3.6, () => R.reels[1].slow(1.6));
        tb.at(te - 1.2, () => R.stop(1, S.C, 'reach', () => (plan.win ? this.winReveal(false) : this.loseReveal(false))));
        tb.at(te + 0.1, () => lcd.camTo({ zoom: 1 }, 0.5));
        tb.end(te + (plan.win ? 3.0 : 1.4));
        return tb.build({ plan, name: 'ノーマルリーチ' });
      }
      // ---- 発展
      const td = tr + 2.6;
      tb.at(td - 0.6, () => { if (this.rng.chance(plan.win ? 0.5 : 0.2)) this.G.gm.preset('tease'); });
      let te;
      if (plan.cls === 'sp_connect') te = this.spConnect(tb, td, plan);
      else if (plan.cls === 'sp_control') te = this.spControl(tb, td, plan);
      else te = this.spAwaken(tb, td, plan);
      tb.end(te);
      return tb.build({ plan, name: this.perf.names[plan.cls] });
    }

    holdChange(hold, atConsume) {
      const lv = ['normal', 'blue', 'green', 'red', 'gold', 'rainbow'].indexOf(hold.finalColor);
      hold.color = hold.finalColor; hold.pop = 1; hold.changeAt = null;
      this.sfx('hold_change', { level: lv });
      if (lv >= 3) { this.fx('flash', 0.35, { color: lv >= 4 ? '255,220,80' : '255,60,60', a: 0.45 }); this.G.mr.flash(0.25, lv >= 4 ? '255,200,60' : '255,40,40'); }
      this.lcd.burst({ x: atConsume ? 272 : 400, y: 500, n: 30, speed: 260, color: { blue: '80,160,255', green: '80,255,120', red: '255,60,60', gold: '255,210,80', rainbow: '255,255,255' }[hold.finalColor] || '255,255,255', type: 'mote', life: 0.8 });
    }

    // ---- 発展演出（共通）
    develop(tb, t, bgName, bgm, ledColor, titleText, titleSub, titleStyle, asset) {
      const lcd = this.lcd, R = this.R;
      tb.at(t, () => { this.sfx('develop'); this.fx('iris', 1.3, { color: `rgb(${ledColor.join(',')})` }); this.fx('lines', 1.0, {}); lcd.camTo({ zoom: 1.3 }, 0.65, 'easeInCubic'); });
      tb.at(t + 0.65, () => {
        lcd.setBG(bgName, 0, {}); this.bgm(bgm); R.setLayout('corner', 0.01); lcd.dark = 0; lcd.camTo({ zoom: 1 }, 0.01);
        lcd.cam.zoom = 1.25; lcd.camTo({ zoom: 1 }, 1.6, 'easeOutCubic');
        this.led('sp', ledColor); lcd.shake(14); this.G.mr.shakeIt(3);
      });
      tb.at(t + 0.8, () => this.fx('title', 2.8, { text: titleText, sub: titleSub, style: titleStyle, color: `rgb(${ledColor.join(',')})`, asset }));
      return t + 3.6;
    }

    /** SP 共通の最終煽り。戻り値：終了時刻 */
    finale(tb, t, plan, o = {}) {
      const lcd = this.lcd, R = this.R, S = plan.sym, G = this.G;
      tb.at(t, () => {
        this.fx('flash', 0.25, { a: 0.6 }); R.setLayout('reach', 0.5); lcd.dark = 0.5; R.reels[1].start(18); R.reels[1].slow(2.4);
        this.fx('letterbox', 6.5, { h: 50 }); this.sfx('whoosh'); lcd.camTo({ zoom: 1.08 }, 3);
      });
      const tb0 = t + 1.1, tb1 = tb0 + 3.2;
      const big = plan.button === 'big';
      let pressed = false;
      tb.at(tb0, () => {
        G.setButton(true, big ? '#ff2a2a' : '#30a0ff');
        this.fx('button', 3.2, { big, text: o.buttonText || 'PUSH!', color: big ? '#ff2a3a' : '#3aa0ff', style: big ? 'red' : 'cyan', y: 250 });
        this.sfx('button_prompt'); this.led(big ? 'strobe' : 'reach', big ? [255, 40, 40] : [60, 160, 255]);
        if (big) { this.sfx('gekiatsu'); G.mr.flash(0.4, '255,40,40'); }
      });
      tb.window(tb0, tb1, () => { pressed = true; this.buttonHit(big); }, () => { G.setButton(false); this.buttonHit(big, true); }, { skipTo: tb1 });
      const tr = tb1 + 0.35;
      // ボタン後の役物
      tb.at(tb1 + 0.05, () => {
        lcd.clearFx((f) => f.name === 'button');
        if (plan.gimmick === 'full') { this.G.gm.preset('full'); this.fx('flash', 0.4, { a: 0.8 }); this.led('rainbow'); this.sfx('gekiatsu'); }
        else if (plan.gimmick === 'tease') this.G.gm.preset('tease');
      });
      tb.at(tr, () => R.stop(1, S.C, plan.win ? 'heavy' : 'normal', () => (plan.win ? this.winReveal(false) : this.loseReveal(true, o.loseText))));
      tb.at(tr + 0.4, () => lcd.camTo({ zoom: 1 }, 0.6));
      return tr + (plan.win ? 3.2 : 2.2);
    }

    buttonHit(big, auto) {
      const lcd = this.lcd;
      this.G.setButton(false);
      this.sfx('button_press'); this.fx('flash', 0.35, { a: big ? 1 : 0.7 }); this.fx('shock', 0.6, { color: big ? 'rgba(255,80,80,1)' : 'rgba(120,220,255,1)' });
      lcd.shake(big ? 24 : 14); this.G.mr.shakeIt(big ? 6 : 3); this.G.mr.flash(big ? 0.6 : 0.3);
      lcd.burst({ n: 80, speed: 900, color: big ? '255,90,80' : '140,230,255' });
    }

    winReveal(rush) {
      const lcd = this.lcd, R = this.R, G = this.G;
      this.sfx('win'); G.audio.stopBGM(0.1);
      lcd.freeze = 0.12;
      this.fx('flash', 0.7, { color: '255,230,150' }); this.fx('shock', 0.9, { color: 'rgba(255,210,90,1)' }); this.fx('lines', 1.4, { color: '#ffe8a0' });
      R.win = 1; R.setLayout('main', 0.4); lcd.dark = 0.2;
      G.gm.preset('win'); this.led('win'); G.mr.flash(0.9, '255,220,120'); G.mr.shakeIt(8); lcd.shake(18);
      lcd.burst({ n: 160, speed: 1100, color: '255,220,120', type: 'spark', life: 1.4 });
      lcd.burst({ n: 60, speed: 400, color: '255,200,80', type: 'mote', life: 2 });
    }
    loseReveal(sp, text) {
      const lcd = this.lcd, G = this.G;
      if (sp) { this.sfx('lose'); this.fx('glitch', 0.5, {}); if (text) this.fx('text', 1.6, { text, size: 60, style: 'white', y: 420 }); }
      lcd.reels.reachSym = null;
      this.led('idle', this.stageLED()); G.gm.preset('reset');
      lcd.dark = 0.15;
    }

    // =============================================================== SP リーチ
    spConnect(tb, t0, plan) {
      const lcd = this.lcd;
      let t = this.develop(tb, t0, 'sp_connect', 'sp_connect', [40, 210, 255], '機関接続リーチ', 'REACTOR LINK SEQUENCE', 'cyan', 'title_sp_connect');
      const prog = { v: 0 };
      tb.at(t, () => { this.fx('gauge', 9.5, { get: () => prog.v, label: 'SYNC', color: '#30d8ff', y: 470 }); });
      // 同期率の上昇（タイムライン上で段階的に）
      for (let i = 0; i <= 40; i++) tb.at(t + i * 0.22, () => { prog.v = Math.min(0.86, (i / 40) * 0.86); lcd.bgParams.prog = prog.v; if (i % 8 === 0) this.sfx('count'); });
      tb.at(t + 2.0, () => { this.fx('telop', 2.8, { text: '深淵機関へ接続せよ', style: plan.telop }); this.sfx('chance', { level: ['white', 'blue', 'green', 'red', 'gold', 'rainbow'].indexOf(plan.telop) }); });
      if (plan.cutin !== 'none') tb.at(t + 5.4, () => { this.fx('cutin', 1.6, { text: '接続開始', style: plan.cutin }); this.sfx('cutin'); lcd.shake(10); });
      tb.at(t + 8.4, () => { this.fx('glitch', 0.6, {}); this.sfx('freeze'); lcd.shake(8); });
      t += 9.6;
      return this.finale(tb, t, plan, { buttonText: 'CONNECT', loseText: 'CONNECTION LOST' });
    }

    spControl(tb, t0, plan) {
      const lcd = this.lcd;
      let t = this.develop(tb, t0, 'sp_control', 'sp_control', [255, 70, 40], '暴走制御リーチ', 'RUNAWAY CONTROL', 'red', 'title_sp_control');
      for (let i = 0; i <= 60; i++) tb.at(t + i * 0.2, () => { lcd.bgParams.pressure = 0.35 + (i / 60) * 0.62; lcd.bgParams.alarm = i > 30 ? (i - 30) / 30 : 0; });
      const stages = ['制御棒 第一段階', '制御棒 第二段階', '制御棒 最終段階'];
      stages.forEach((s, i) => {
        tb.at(t + 1.0 + i * 3.4, () => {
          lcd.bgParams.rods = 0.25 + i * 0.25; this.sfx('lever'); lcd.shake(10 + i * 4); this.G.mr.shakeIt(2 + i);
          this.fx('text', 1.8, { text: s, size: 52, style: i === 2 ? 'red' : 'white', y: 120 });
          lcd.burst({ x: 480, y: 80, n: 30, speed: 400, color: '255,120,60', gravity: 600 });
        });
      });
      tb.at(t + 4.6, () => { this.fx('telop', 2.8, { text: '暴走を食い止めろ', style: plan.telop }); this.sfx('chance', { level: ['white', 'blue', 'green', 'red', 'gold', 'rainbow'].indexOf(plan.telop) }); });
      if (plan.cutin !== 'none') tb.at(t + 8.2, () => { this.fx('cutin', 1.6, { text: '臨界突破', style: plan.cutin }); this.sfx('cutin'); lcd.shake(14); });
      tb.at(t + 10.6, () => { this.fx('vignette', 2.0, { a: 0.8 }); this.sfx('zone_in'); this.G.gm.preset('shake'); });
      t += 11.8;
      return this.finale(tb, t, plan, { buttonText: '制御棒を挿入せよ', loseText: '制御失敗' });
    }

    spAwaken(tb, t0, plan) {
      const lcd = this.lcd, G = this.G;
      // 発展前の暗転
      tb.at(t0 - 0.2, () => { this.fx('fade', 0.4, {}); });
      let t = this.develop(tb, t0 + 0.2, 'sp_awaken', 'sp_awaken', [255, 60, 120], '深淵覚醒リーチ', 'ABYSS AWAKENING', 'rainbow', 'title_sp_awaken');
      const depths = ['DEPTH 1,000m', 'DEPTH 5,000m', 'DEPTH ∞'];
      for (let i = 0; i <= 50; i++) tb.at(t + i * 0.2, () => { lcd.bgParams.depth = i / 50; });
      depths.forEach((d, i) => tb.at(t + 0.6 + i * 2.6, () => { this.fx('text', 1.8, { text: d, size: 44, style: i === 2 ? 'red' : 'chrome', font: '"Orbitron", sans-serif', y: 110 }); this.sfx('whoosh'); lcd.shake(6); }));
      tb.at(t + 3.0, () => { this.fx('telop', 2.8, { text: '最深部へ到達せよ', style: plan.telop }); this.sfx('chance', { level: ['white', 'blue', 'green', 'red', 'gold', 'rainbow'].indexOf(plan.telop) }); });
      // 巨大コア出現
      tb.at(t + 7.8, () => { this.sfx('blackout'); this.fx('flash', 0.4, { a: 0.6, color: '255,120,80' }); G.gm.preset('shake'); });
      for (let i = 0; i <= 30; i++) tb.at(t + 7.8 + i * 0.1, () => { lcd.bgParams.core = i / 30; });
      if (plan.cutin !== 'none') tb.at(t + 9.0, () => { this.fx('cutin', 1.6, { text: '覚醒開始', style: plan.cutin }); this.sfx('cutin'); lcd.shake(16); });
      tb.at(t + 10.8, () => { this.fx('text', 1.8, { text: 'コア 起動シーケンス', size: 46, style: 'red', y: 110 }); this.sfx('charge'); });
      t += 12.6;
      return this.finale(tb, t, plan, { buttonText: '覚醒せよ', loseText: '覚醒失敗' });
    }

    /** 最上位演出 ABYSS OVERDRIVE：暗転 → 無音 → 役物展開 → 筐体発光 */
    overdrive(tb, t, plan) {
      const lcd = this.lcd, G = this.G, A = G.audio;
      tb.at(t + 0.5, () => { this.sfx('freeze'); lcd.freeze = 0.55; G.mr.flash(0.2); });
      tb.at(t + 0.6, () => { A.silence(2.2, 0.01); A.stopBGM(0.01); this.led('off'); });
      tb.at(t + 1.05, () => { this.fx('blackout', 4.0, { speed: 40 }); this.R.setLayout('hidden', 0.01); });
      tb.at(t + 3.0, () => { A.unsilence(); this.sfx('heartbeat'); G.mr.shakeIt(2); });
      tb.at(t + 3.8, () => { this.sfx('heartbeat'); G.mr.shakeIt(3); });
      tb.at(t + 4.4, () => { G.gm.preset('overdrive'); this.led('chase', [255, 30, 30]); });
      tb.at(t + 5.65, () => {
        lcd.clearFx((f) => f.name === 'blackout');
        lcd.setBG('sp_awaken', 0, { depth: 1, core: 1 });
        this.sfx('overdrive'); this.led('rainbow'); G.mr.flash(1, '255,255,255'); G.mr.shakeIt(12); lcd.shake(30);
        this.fx('flash', 1.0, {}); this.fx('shock', 1.2, { r: 900 }); this.fx('shock', 1.6, { r: 700, color: 'rgba(255,80,200,1)' });
        this.fx('overdrive', 3.4, {}); this.fx('lines', 3.2, {});
        lcd.burst({ n: 240, speed: 1400, color: '255,255,255', type: 'spark', life: 1.6 });
      });
      tb.at(t + 6.4, () => this.bgm('sp_awaken', { fadeIn: 0.1 }));
      tb.at(t + 9.2, () => { this.fx('text', 2.2, { text: '深淵最深部 到達', size: 60, style: 'rainbow', y: 120 }); this.R.setLayout('corner', 0.3); });
      const te = this.finale(tb, t + 11.4, plan, { buttonText: 'OVERDRIVE', loseText: '機関停止' });
      if (!plan.win) tb.at(te - 1.5, () => G.gm.preset('stow'));
      return te;
    }

    // =============================================================== RUSH 中の変動
    buildRush(hold, res, holdCount, st) {
      const plan = this.planRush(hold, res, st);
      const tb = new NB.TimelineBuilder();
      const R = this.R, lcd = this.lcd, S = plan.sym, G = this.G;
      tb.at(0, () => { R.setLayout('main', 0.2); R.startAll(32, 0.03); lcd.dark = 0; this.sfx('reel_start'); });
      if (plan.last) {
        tb.at(0, () => { lcd.setBG('rush', 0.3, { last: true }); this.bgm('rush_last'); this.led('warn', [255, 40, 30]); this.fx('text', 1.6, { text: `LAST ${st}`, size: 90, style: 'red', font: '"Orbitron", sans-serif', y: 150 }); this.fx('vignette', 3, { a: 0.6 }); });
      }
      if (plan.cls === 'sudden') {
        tb.at(0.55, () => { this.sfx('freeze'); lcd.freeze = 0.3; G.mr.flash(0.3); });
        tb.at(0.9, () => { R.reels.forEach((r, i) => r.stop([S.L, S.C, S.R][i], 'heavy')); });
        tb.at(1.1, () => { this.fx('confirm', 2.4, { rush: true, sub: '突発 BREAK' }); this.winReveal(true); });
        tb.end(3.6);
        return tb.build({ plan, name: '突発当たり' });
      }
      if (plan.cls === 'noReach') {
        const total = this.spec.variation.rush.noReach[Math.min(4, holdCount)] + (plan.last ? 1.4 : 0);
        const T1 = Math.max(0.7, total - 0.75);
        tb.at(T1, () => R.stop(0, S.L, 'normal', () => this.sfx('reel_stop')));
        tb.at(T1 + 0.22, () => R.stop(2, S.R, 'normal', () => this.sfx('reel_stop')));
        tb.at(T1 + 0.44, () => R.stop(1, S.C, 'heavy', () => this.sfx('reel_stop_heavy')));
        tb.end(T1 + 0.8);
        return tb.build({ plan, name: 'ハズレ' });
      }
      // リーチ
      const tl = 0.8, tr = 1.15;
      tb.at(tl, () => R.stop(0, S.L, 'normal', () => this.sfx('reel_stop')));
      tb.at(tr, () => R.stop(2, S.R, 'heavy', () => { this.sfx('reel_stop_heavy'); this.sfx('tenpai'); R.reachSym = S.L; R.reachPulse = 1; }));
      tb.at(tr + 0.1, () => { this.fx('reach', 1.2, { style: 'red' }); this.led('reach', [255, 60, 60]); R.reels[1].slow(4); R.setLayout('reach', 0.5); });
      if (plan.cls === 'short') {
        tb.at(tr + 1.0, () => { this.fx('cutin', 1.3, { text: '迎撃', style: plan.win ? 'gold' : 'red' }); this.sfx('cutin'); lcd.shake(10); });
        tb.at(tr + 2.4, () => R.reels[1].slow(1.8));
        tb.at(tr + 3.2, () => R.stop(1, S.C, 'reach', () => (plan.win ? this.winReveal(true) : this.loseReveal(false))));
        tb.end(tr + (plan.win ? 6.0 : 4.2));
        return tb.build({ plan, name: 'RUSHリーチ' });
      }
      // 深淵迎撃リーチ
      const td = tr + 1.4;
      tb.at(td, () => { this.sfx('develop'); this.fx('iris', 1.0, { color: '#ff3040' }); });
      tb.at(td + 0.5, () => { lcd.setBG('sp_awaken', 0, { depth: 0.8, core: 0.3 }); this.bgm('rush_sp'); R.setLayout('corner', 0.01); this.led('sp', [255, 40, 80]); });
      tb.at(td + 0.6, () => this.fx('title', 2.2, { text: '深淵迎撃リーチ', sub: 'ABYSS INTERCEPT', style: 'red', color: '#ff3040' }));
      const prog = { v: 0 };
      tb.at(td + 2.8, () => this.fx('gauge', 4.0, { get: () => prog.v, label: 'ENERGY', color: '#ff4060' }));
      for (let i = 0; i <= 20; i++) tb.at(td + 2.8 + i * 0.18, () => { prog.v = (i / 20) * 0.9; lcd.bgParams.core = 0.3 + prog.v * 0.6; });
      tb.at(td + 4.2, () => { this.fx('cutin', 1.4, { text: '全エネルギー解放', style: plan.win ? 'gold' : 'red', size: 72 }); this.sfx('cutin'); });
      const te = this.finale(tb, td + 6.6, plan, { buttonText: '撃て', loseText: '迎撃失敗' });
      tb.end(te);
      return tb.build({ plan, name: '深淵迎撃リーチ' });
    }

    // =============================================================== 大当たり関連シーケンス
    buildBigHitOpening(res, chain) {
      const tb = new NB.TimelineBuilder(), lcd = this.lcd, G = this.G;
      const rush = res.kind === 'rush';
      tb.at(0, () => {
        this.bgm('fanfare', { restart: true, fadeIn: 0.02 }); lcd.setBG('bighit', 0.2, { rush }); this.R.setLayout('corner', 0.5); this.R.win = 0;
        this.fx('confirm', 4.2, { rush, sub: rush ? `${chain}連 継続` : '大当たり' }); this.led('win');
        lcd.burst({ n: 200, speed: 1200, color: '255,220,140', type: 'spark', life: 1.6 });
        lcd.hud.hideHolds = true;
      });
      tb.at(1.0, () => lcd.burst({ n: 80, speed: 600, color: '255,240,200', type: 'mote', life: 2.5 }));
      tb.at(1.5, () => G.gm.preset('stow'));
      tb.at(3.6, () => { this.fx('text', 1.8, { text: '右打ちしてください', size: 46, style: 'red', y: 450 }); });
      tb.end(4.6);
      return tb.build({ name: 'opening' });
    }
    roundStart(n, total, rush) {
      this.lcd.setBG('round', 0.4, { rush }); this.bgm('round');
      this.sfx('round_start'); this.fx('text', 1.0, { text: `ROUND ${n}`, size: 96, style: rush ? 'red' : 'gold', font: '"Orbitron", sans-serif', y: 250 });
      this.led('rush', rush ? [255, 60, 60] : [255, 190, 60]);
    }

    buildJudge(res, rushKnown) {
      const tb = new NB.TimelineBuilder(), lcd = this.lcd, G = this.G;
      if (rushKnown) {
        tb.at(0, () => { this.fx('text', 2.4, { text: '深淵RUSH 確定', size: 84, style: 'rainbow', y: 250 }); this.sfx('rush_in'); this.led('rainbow'); G.mr.flash(0.8); lcd.burst({ n: 200, speed: 1200, color: '255,120,120' }); });
        tb.end(2.8);
        return tb.build({ name: 'judge-known' });
      }
      const ch = { v: 0 };
      tb.at(0, () => { lcd.setBG('judge', 0.6, { charge: 0 }); this.bgm('sp_awaken'); this.fx('title', 2.4, { text: '深淵RUSH 突入ジャッジ', sub: 'RUSH JUDGEMENT', style: 'red', color: '#ff3040', size: 64 }); this.led('sp', [255, 50, 60]); lcd.hud.round = null; lcd.hud.payout = null; });
      tb.at(2.4, () => { this.fx('gauge', 3.6, { get: () => ch.v, label: 'CORE CHARGE', color: '#ff5060' }); this.sfx('charge'); });
      for (let i = 0; i <= 20; i++) tb.at(2.4 + i * 0.16, () => { ch.v = (i / 20) * 0.92; lcd.bgParams.charge = ch.v; });
      const big = res.toRush ? this.rng.chance(0.6) : this.rng.chance(0.2);
      tb.at(5.8, () => { G.setButton(true, big ? '#ff2a2a' : '#30a0ff'); this.fx('button', 2.8, { big, text: '起動せよ', color: big ? '#ff2a3a' : '#3aa0ff', style: big ? 'red' : 'cyan', y: 250 }); this.sfx('button_prompt'); });
      tb.window(5.8, 8.6, () => this.buttonHit(big), () => { G.setButton(false); this.buttonHit(big, true); }, { skipTo: 8.6 });
      tb.at(8.7, () => {
        lcd.clearFx((f) => f.name === 'button' || f.name === 'gauge');
        if (res.toRush) {
          this.sfx('rush_in'); this.fx('flash', 1.0, {}); this.fx('shock', 1.2, { r: 900, color: 'rgba(255,60,80,1)' });
          this.fx('text', 2.8, { text: '深淵RUSH 突入', size: 96, style: 'red', y: 260 }); this.led('rainbow'); G.gm.preset('full'); G.mr.flash(1); G.mr.shakeIt(10);
          lcd.burst({ n: 260, speed: 1400, color: '255,90,110', type: 'spark', life: 1.6 });
        } else {
          this.sfx('lose'); this.fx('glitch', 0.8, {}); lcd.setBG('black', 1.2); G.audio.stopBGM(1.2);
          this.fx('text', 3.0, { text: 'ENERGY LOST', size: 72, style: 'white', font: '"Orbitron", sans-serif', y: 230, sub: '通常モードへ移行' });
          this.led('idle', [60, 220, 255]);
        }
      });
      tb.end(11.8);
      return tb.build({ name: 'judge' });
    }

    buildRushIntro(stSpins) {
      const tb = new NB.TimelineBuilder(), lcd = this.lcd, G = this.G;
      tb.at(0, () => { lcd.setBG('rush', 0.2, {}); this.bgm('rush', { restart: true }); this.fx('rushLogo', 3.8, {}); this.fx('flash', 0.5, {}); this.led('rush', [255, 60, 80]); G.gm.preset('stow'); lcd.hud.hideHolds = false; });
      tb.at(2.6, () => this.fx('text', 1.8, { text: `ST ${stSpins}回`, size: 60, style: 'cyan', font: '"Orbitron", sans-serif', y: 430 }));
      tb.end(4.2);
      return tb.build({ name: 'rushIntro' });
    }
    buildStReset(stSpins, chain) {
      const tb = new NB.TimelineBuilder(), lcd = this.lcd;
      tb.at(0, () => { lcd.setBG('rush', 0.4, {}); this.bgm('rush', { restart: true }); this.sfx('st_reset'); this.fx('text', 2.4, { text: `ST ${stSpins}回 再セット`, size: 70, style: 'cyan', y: 230, sub: `${chain}連 継続中` }); this.led('rush', [255, 60, 80]); lcd.hud.hideHolds = false; this.G.gm.preset('stow'); });
      tb.end(2.6);
      return tb.build({ name: 'stReset' });
    }
    buildRushEnd(chain, balls) {
      const tb = new NB.TimelineBuilder(), lcd = this.lcd;
      tb.at(0, () => { this.G.audio.stopBGM(0.6); this.sfx('rush_end'); lcd.setBG('result', 1.0); this.R.setLayout('hidden', 0.4); this.led('idle', [255, 190, 120], 0.6); });
      tb.at(1.2, () => { this.bgm('result'); this.fx('result', 6.0, { chain, balls }); });
      tb.end(7.4);
      return tb.build({ name: 'rushEnd' });
    }
  }

  NB.Director = Director;
})(globalThis.NB);
