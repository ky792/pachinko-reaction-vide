/*
 * 遊技状態管理（ゲームコントローラ）
 *  通常 / 大当たり（オープニング→ラウンド→エンディング）/ RUSH(ST) / RUSH 終了
 *  特図1（ヘソ）・特図2（電チュー）保留、普図、賞球、統計、セーブを管理する。
 *  描画は持たず、lcd / mr / gm / audio を通して出力する。
 */
(function (NB) {
  'use strict';

  class Game {
    constructor(machine, deps) {
      this.machine = machine;
      this.spec = machine.spec;
      this.bus = new NB.Bus();
      this.lottery = new NB.Lottery(this.spec, new NB.RNG());
      this.physics = new NB.Physics(machine.layout, { onEvent: (t, e) => this.onPhysics(t, e) });
      this.timeline = new NB.Timeline();
      this.gm = new NB.Gimmick({ onSound: (id) => this.audio.play(id) });
      this.audio = deps.audio; this.lcd = deps.lcd; this.mr = deps.mr;
      this.director = new NB.Director(this);
      this.time = 0;
      this.timers = [];
      this.reset(true);
      this.settings = { autoPlay: false, autoButton: false, autoRight: true, speed: 1, leftPower: 0.26, rightPower: 0.9 };
      this.handle = { power: 0.26, active: false };
      this.button = { lit: false, color: '#ff3040', pressT: 0 };
      this.launchAcc = 0;
    }

    reset(initial) {
      this.mode = 'normal';
      this.phase = 'idle';          // idle | spin | confirm | bighit | seq
      this.holds1 = []; this.holds2 = [];
      this.current = null;
      this.st = null; this.chain = 0; this.rushGain = 0;
      this.balls = this.spec.launch.startBalls;
      this.bh = null;
      this.stage = 'lab'; this.zoneHoldId = null;
      this.futsu = { holds: 0, spinning: false, t: 0, openQueue: 0, openT: 0, gapT: 0 };
      this.stats = Game.emptyStats();
      this.testStats = Game.emptyStats();
      this.log = [];
      this.timers = [];
      if (!initial) {
        this.physics.clear(); this.timeline.stop(); this.physics.gates.attacker = false; this.physics.gates.denchu = false;
        this.gm.preset('reset'); this.lcd.clearFx(); this.lcd.setBG('lab', 0.3); this.lcd.reels.setLayout('main', 0.3);
        this.lcd.hud.st = null; this.lcd.hud.round = null; this.lcd.hud.payout = null; this.lcd.hud.chain = 0; this.lcd.hud.hideHolds = false;
        this.audio.playBGM('normal_lab'); this.mr.setLED('idle', [60, 220, 255]);
      }
    }

    static emptyStats() {
      return { spins: 0, spinsSinceHit: 0, firstHits: 0, rushEntries: 0, hits: 0, maxChain: 0, launched: 0, payout: 0, lent: 0, hesoIn: 0, history: [{ s: 0, d: 0 }], hitLog: [], spinsByMode: { normal: 0, rush: 0 }, startTime: Date.now(), playSec: 0 };
    }

    after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }

    // ================================================================= 入力
    pressButton() {
      this.button.pressT = 1;
      this.audio.unlock();
      if (this.timeline.press()) return true;
      return false;
    }
    setButton(on, color) { this.button.lit = on; if (color) this.button.color = color; }

    // ================================================================= 物理イベント
    onPhysics(type, e) {
      if (type === 'remove') {
        const r = e.reason;
        if (r === 'heso') this.onStart('heso');
        else if (r === 'denchu') this.onStart('denchu');
        else if (r === 'general') this.pay(this.spec.pockets.general);
        else if (r === 'attacker') this.onAttacker();
        else if (r === 'foul') this.balls += 1;
      } else if (type === 'through') this.onThrough();
      else if (type === 'stageCenter') this.mr.led.flash = Math.max(this.mr.led.flash, 0.05);
    }

    pay(n, test) {
      this.balls += n;
      (test ? this.testStats : this.stats).payout += n;
    }

    onStart(src) {
      const isHeso = src === 'heso';
      this.pay(isHeso ? this.spec.pockets.heso : this.spec.pockets.denchu);
      if (isHeso) { this.stats.hesoIn++; this.audio.play('heso_in'); } else this.audio.play('denchu');
      const q = isHeso ? this.holds1 : this.holds2;
      const max = isHeso ? this.spec.normal.holdMax : this.spec.rush.holdMax;
      if (q.length >= max) return; // オーバーフロー
      this.addHold(src);
    }

    /** 保留追加。opts.forced は開発者用（統計除外） */
    addHold(src, opts = {}) {
      const q = src === 'heso' ? this.holds1 : this.holds2;
      const hold = this.lottery.acquire(src, this.mode, { forced: opts.forced });
      if (opts.cls) hold.forcedCls = opts.cls;
      if (opts.color) hold.forcedColor = opts.color;
      this.director.onHoldAcquired(hold, this.mode);
      hold.slide = 30; hold.pop = 0.6;
      q.push(hold);
      this.audio.play('hold_in');
      if (hold.color !== 'normal' && !hold.changeAt) this.audio.play('hold_change', { level: ['normal', 'blue', 'green', 'red', 'gold', 'rainbow'].indexOf(hold.color) });
      // 先読み：ゾーン・予告
      if (this.mode === 'normal' && src === 'heso') {
        if (hold.zone && (this.phase !== 'idle' || q.length > 1) && !this.zoneHoldId) this.zoneHoldId = hold.id;
        if (hold.yokoku && this.phase === 'spin') { this.lcd.fx('yokoku', 1.6, {}); this.audio.play('yokoku'); }
      }
      this.syncHUD();
      return hold;
    }

    onThrough() {
      const F = this.futsu;
      if (F.holds < this.spec.futsuzu.holdMax) F.holds++;
    }

    onAttacker() {
      const bh = this.bh;
      const test = bh && bh.test;
      this.pay(this.spec.attacker.payout, test);
      this.audio.play('attacker_in');
      if (bh && bh.sub === 'open') {
        bh.count++; bh.payout += this.spec.attacker.payout;
        if (bh.res.kind === 'rush') this.rushGain += this.spec.attacker.payout;
      }
    }

    updateFutsu(dt) {
      const F = this.futsu, cfg = this.mode === 'rush' ? this.spec.futsuzu.rush : this.spec.futsuzu.normal;
      if (F.openQueue > 0 || F.openT > 0) {
        if (F.openT > 0) { F.openT -= dt; this.physics.gates.denchu = true; if (F.openT <= 0) { this.physics.gates.denchu = false; F.gapT = cfg.gapSec || 0.3; } }
        else if (F.gapT > 0) F.gapT -= dt;
        else if (F.openQueue > 0) { F.openQueue--; F.openT = cfg.openSec; }
        return;
      }
      this.physics.gates.denchu = false;
      if (F.spinning) {
        F.t -= dt;
        if (F.t <= 0) { F.spinning = false; if (F.win) F.openQueue = cfg.openCount; }
      } else if (F.holds > 0) {
        F.holds--; F.spinning = true; F.t = cfg.spinSec; F.win = this.lottery.rng.next() < cfg.probability;
      }
    }

    // ================================================================= 変動
    tryStartSpin() {
      if (this.phase !== 'idle' || this.timeline.running) return;
      let hold = null;
      if (this.holds2.length) hold = this.holds2.shift();
      else if (this.holds1.length) hold = this.holds1.shift();
      if (!hold) return;
      this.startSpin(hold);
    }

    startSpin(hold) {
      const mode = this.mode;
      const res = this.lottery.judge(hold, mode);
      const statsObj = res.test ? this.testStats : this.stats;
      statsObj.spins++; statsObj.spinsSinceHit++; statsObj.spinsByMode[mode]++;
      if (!res.test && statsObj.spins % 10 === 0) this.pushHistory();
      if (mode === 'rush') { this.st = Math.max(0, this.st - 1); }
      this.phase = 'spin';
      this.current = { hold, res };
      this.lcd.hud.active = hold;
      // 保留変化（next 指定）／ゾーン
      for (const h of this.holds1) if (h.changeAt === 'next' && this.director.rng.chance(0.6)) { this.director.holdChange(h, false); break; }
      if (mode === 'normal') {
        if (this.zoneHoldId && this.stage !== 'alert') {
          this.prevStage = this.stage; this.stage = 'alert'; this.lcd.setBG('alert', 0.3);
          this.lcd.fx('zone', 2.2, {}); this.audio.play('zone_in'); this.audio.playBGM('normal_alert'); this.mr.setLED('warn', [255, 50, 40], 0.8);
        } else if (!this.zoneHoldId && this.stage === 'alert') {
          this.stage = this.prevStage || 'lab'; this.lcd.setBG(this.stage, 0.6); this.audio.playBGM(this.director.stageBGM()); this.mr.setLED('idle', this.director.stageLED());
        }
        // ステージ移行
        const ss = this.machine.performance.stageSpins;
        if (this.stage !== 'alert' && this.stats.spins > 0 && this.stats.spins % ss === 0 && !res.test) {
          const stages = this.machine.performance.stages;
          this.stage = stages[(stages.indexOf(this.stage) + 1) % stages.length];
          this.lcd.setBG(this.stage, 1.2); this.audio.playBGM(this.director.stageBGM());
        }
      }
      const holdCount = (mode === 'rush' ? this.holds2.length : this.holds1.length);
      const sc = mode === 'rush' ? this.director.buildRush(hold, res, holdCount, this.st) : this.director.buildNormal(hold, res, holdCount);
      this.current.plan = sc.meta.plan;
      this.lastScenarioName = sc.meta.name;
      this.logEntry({ type: 'spin', mode, win: res.win, reach: !!res.reach, perf: sc.meta.name, test: res.test, st: this.st, value: hold.value });
      this.syncHUD();
      this.timeline.play(sc, () => this.onSpinEnd());
    }

    onSpinEnd() {
      const { hold, res, plan } = this.current;
      this.phase = 'confirm';
      this.lcd.hud.active = null;
      if (this.zoneHoldId === hold.id) this.zoneHoldId = null;
      const confirmSec = res.win ? 0.2 : 0.5;
      this.after(confirmSec, () => {
        if (res.win) { this.startBigHit(res, plan); return; }
        if (this.mode === 'rush' && this.st <= 0) { this.endRush(); return; }
        // 非当選・通常継続
        if (this.mode === 'normal' && plan && plan.cls !== 'noReach') {
          this.audio.playBGM(this.stage === 'alert' ? 'normal_alert' : this.director.stageBGM());
          this.mr.setLED(this.stage === 'alert' ? 'warn' : 'idle', this.director.stageLED());
          this.lcd.setBG(this.stage, 0.6); this.lcd.reels.setLayout('main', 0.5); this.lcd.dark = 0;
        }
        if (this.mode === 'rush' && plan && plan.cls !== 'noReach') { this.lcd.setBG('rush', 0.4, { last: this.st <= 3 }); this.audio.playBGM(this.st <= 3 ? 'rush_last' : 'rush'); this.mr.setLED('rush', [255, 60, 80]); this.lcd.reels.setLayout('main', 0.3); }
        if (this.mode === 'rush' && this.st <= 3 && this.st > 0) { this.lcd.setBG('rush', 0.3, { last: true }); }
        this.phase = 'idle';
      });
    }

    // ================================================================= 大当たり
    startBigHit(res, plan) {
      const test = !!res.test;
      const S = test ? this.testStats : this.stats;
      S.hits++;
      if (res.kind === 'first') { S.firstHits++; if (res.toRush) S.rushEntries++; }
      const chainNow = res.kind === 'rush' ? this.chain + 1 : 1;
      S.hitLog.push({ spins: S.spinsSinceHit, kind: res.kind, toRush: !!res.toRush, chain: chainNow, at: Date.now() });
      if (S.hitLog.length > 300) S.hitLog.shift();
      S.spinsSinceHit = 0;
      this.logEntry({ type: 'hit', kind: res.kind, toRush: res.toRush, test });
      this.phase = 'bighit';
      this.bh = { res, plan, round: 0, total: res.rounds, count: 0, payout: 0, sub: 'opening', test, rushKnown: !!(plan && plan.rushKnown) };
      this.lcd.hud.st = null;
      this.syncHUD();
      this.timeline.play(this.director.buildBigHitOpening(res, chainNow), () => this.nextRound());
    }

    nextRound() {
      const bh = this.bh;
      bh.round++;
      if (bh.round > bh.total) { this.endBigHit(); return; }
      bh.sub = 'intro'; bh.count = 0;
      const rush = bh.res.kind === 'rush' || bh.res.toRush;
      this.director.roundStart(bh.round, bh.total, rush);
      this.lcd.hud.round = { n: bh.round, total: bh.total }; this.lcd.hud.payout = bh.payout;
      this.after(0.9, () => { bh.sub = 'open'; bh.openT = 0; this.physics.gates.attacker = true; });
    }

    updateBigHit(dt) {
      const bh = this.bh; if (!bh) return;
      if (bh.sub !== 'ending') this.lcd.hud.payout = bh.payout;
      if (bh.sub === 'open') {
        bh.openT += dt;
        if (bh.count >= this.spec.attacker.count || bh.openT > this.spec.attacker.maxOpenSec) {
          bh.sub = 'interval'; this.physics.gates.attacker = false;
          this.after(this.spec.attacker.roundIntervalSec, () => this.nextRound());
        }
      }
    }

    endBigHit() {
      const bh = this.bh;
      bh.sub = 'ending';
      this.lcd.hud.round = null;
      const S = bh.test ? this.testStats : this.stats;
      if (bh.res.kind === 'first') {
        this.timeline.play(this.director.buildJudge(bh.res, bh.rushKnown), () => {
          this.lcd.hud.payout = null;
          if (bh.res.toRush) {
            this.chain = 1; this.rushGain = bh.payout;
            S.maxChain = Math.max(S.maxChain, 1);
            this.timeline.play(this.director.buildRushIntro(this.spec.rush.stSpins), () => this.enterRush());
          } else {
            this.bh = null; this.toNormal();
          }
        });
      } else {
        this.chain++; S.maxChain = Math.max(S.maxChain, this.chain);
        this.lcd.hud.payout = null;
        this.timeline.play(this.director.buildStReset(this.spec.rush.stSpins, this.chain), () => this.enterRush());
      }
    }

    enterRush() {
      this.bh = null;
      this.mode = 'rush'; this.st = this.spec.rush.stSpins;
      this.phase = 'idle';
      this.lcd.hud.chain = this.chain; this.lcd.hud.payout = null; this.lcd.hud.round = null;
      this.lcd.setBG('rush', 0.3, {}); this.lcd.reels.setLayout('main', 0.4); this.lcd.dark = 0;
      this.audio.playBGM('rush');
      this.syncHUD();
      this.save();
    }

    endRush() {
      this.phase = 'seq';
      const chain = this.chain, gain = this.rushGain;
      this.logEntry({ type: 'rushEnd', chain, gain });
      this.timeline.play(this.director.buildRushEnd(chain, gain), () => { this.toNormal(); });
    }

    toNormal() {
      this.mode = 'normal'; this.st = null; this.chain = 0; this.rushGain = 0; this.bh = null;
      this.lcd.hud.payout = null; this.lcd.hud.round = null;
      this.phase = 'idle';
      this.stage = 'lab';
      this.lcd.setBG('lab', 1.0); this.lcd.reels.setLayout('main', 0.6); this.lcd.dark = 0; this.lcd.hud.chain = 0; this.lcd.hud.hideHolds = false;
      this.audio.playBGM('normal_lab', { fadeIn: 1.5 });
      this.mr.setLED('idle', [60, 220, 255]);
      this.gm.preset('reset');
      this.syncHUD();
      this.save();
    }

    get rightShoot() { return this.mode === 'rush' || this.phase === 'bighit'; }

    syncHUD() {
      const h = this.lcd.hud;
      h.holds = this.mode === 'rush' || this.holds2.length ? this.holds2 : this.holds1;
      h.mode = this.mode;
      h.st = this.mode === 'rush' && this.phase !== 'bighit' ? this.st : null;
      h.rightShoot = this.rightShoot;
    }

    pushHistory() {
      const S = this.stats;
      S.history.push({ s: S.spins, d: S.payout - S.launched });
      if (S.history.length > 2000) { S.history = S.history.filter((_, i) => i % 2 === 0); }
    }
    logEntry(e) { e.time = Date.now(); this.log.push(e); if (this.log.length > 500) this.log.shift(); this.bus.emit('log', e); }

    // ================================================================= メインループ
    update(dt) {
      const sp = this.settings.speed;
      const gdt = dt * sp;
      this.time += gdt;
      this.stats.playSec += dt;
      // タイマー
      if (this.timers.length) {
        const due = this.timers.filter((t) => t.t <= this.time);
        if (due.length) { this.timers = this.timers.filter((t) => t.t > this.time); for (const t of due) t.fn(); }
      }
      // 発射
      const S = this.settings;
      if (S.autoPlay) { this.handle.active = true; if (S.autoRight) this.handle.power = this.rightShoot ? S.rightPower : S.leftPower; }
      if (this.handle.active) {
        this.launchAcc += dt;
        const iv = this.machine.layout.launch.interval;
        while (this.launchAcc >= iv) {
          this.launchAcc -= iv;
          if (this.balls <= 0) { this.balls += this.spec.launch.lendUnit; this.stats.lent += this.spec.launch.lendUnit; }
          this.balls--; this.stats.launched++;
          this.physics.launch(this.handle.power);
        }
      } else this.launchAcc = 0;
      this.physics.update(dt);
      this.updateFutsu(dt);
      this.timeline.speed = sp;
      this.timeline.update(dt);
      if (this.phase === 'bighit') this.updateBigHit(dt);
      this.tryStartSpin();
      this.gm.update(gdt);
      this.lcd.update(gdt);
      // 保留スライド
      for (const h of this.lcd.hud.holds) if (h.slide) h.slide *= 0.85;
      this.button.pressT = Math.max(0, this.button.pressT - dt * 6);
      // オートボタン
      if (S.autoButton) {
        const w = this.timeline.activeWindow();
        if (w) { if (w.autoAt == null) w.autoAt = this.timeline.time + 0.4 + Math.random() * 0.9; else if (this.timeline.time >= w.autoAt) this.pressButton(); }
      }
      this.syncHUD();
    }

    lamps() {
      return { t1Spin: this.phase === 'spin' && this.current && this.current.hold.source === 'heso', t2Spin: this.phase === 'spin' && this.current && this.current.hold.source === 'denchu', t1Hold: this.holds1.length, t2Hold: this.holds2.length, fSpin: this.futsu.spinning };
    }

    // ================================================================= セーブ
    serialize() {
      const h = (q) => q.map((x) => ({ source: x.source, value: x.value, allocValue: x.allocValue, reachValue: x.reachValue, acquiredMode: x.acquiredMode, test: x.test, forced: x.forced, pre: x.pre, preCls: x.preCls, color: x.color, finalColor: x.finalColor, changeAt: x.changeAt, id: x.id }));
      const bh = this.bh ? { res: this.bh.res, round: Math.max(0, this.bh.round - 1), total: this.bh.total, payout: this.bh.payout, test: this.bh.test, rushKnown: this.bh.rushKnown } : null;
      let pending = null;
      if (this.phase === 'spin' || this.phase === 'confirm') pending = { hold: h([this.current.hold])[0] }; // 変動中は保留に戻して再変動
      return { v: 1, machine: this.machine.id, balls: this.balls, mode: this.mode, st: this.st, chain: this.chain, rushGain: this.rushGain, holds1: h(this.holds1), holds2: h(this.holds2), pending, bh, stats: this.stats, testStats: this.testStats, savedAt: Date.now() };
    }
    save() { try { localStorage.setItem('nb-save-' + this.machine.id, JSON.stringify(this.serialize())); } catch (e) {} }
    load() {
      let d; try { d = JSON.parse(localStorage.getItem('nb-save-' + this.machine.id) || 'null'); } catch (e) { d = null; }
      if (!d || d.v !== 1) return false;
      this.balls = d.balls; this.mode = d.mode; this.st = d.st; this.chain = d.chain; this.rushGain = d.rushGain;
      this.stats = Object.assign(Game.emptyStats(), d.stats); this.testStats = Object.assign(Game.emptyStats(), d.testStats);
      this.holds1 = d.holds1; this.holds2 = d.holds2;
      if (d.pending) {
        const p = d.pending.hold; (p.source === 'heso' ? this.holds1 : this.holds2).unshift(p);
        if (this.mode === 'rush') this.st = Math.min(this.spec.rush.stSpins, this.st + 1);
        // 変動中で中断した 1 回分は統計を戻す
        const S = p.test ? this.testStats : this.stats; S.spins = Math.max(0, S.spins - 1); S.spinsSinceHit = Math.max(0, S.spinsSinceHit - 1);
      }
      if (this.mode === 'rush') { this.lcd.setBG('rush', 0); this.audio.playBGM('rush'); this.mr.setLED('rush', [255, 60, 80]); this.lcd.hud.chain = this.chain; }
      if (d.bh) {
        this.phase = 'bighit';
        this.bh = Object.assign({ count: 0, sub: 'interval', plan: null }, d.bh);
        this.after(0.5, () => this.nextRound());
      }
      this.syncHUD();
      return true;
    }
  }

  NB.Game = Game;
})(globalThis.NB);
