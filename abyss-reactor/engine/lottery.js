/*
 * 抽選エンジン（主制御相当）
 *  - 始動入賞時に 16bit 乱数を取得し保留として記憶
 *  - 変動開始時に、その時点の遊技状態の確率で当否判定
 *  - 先読み（事前判定）は同じ乱数値で入賞時状態を参照
 *  - 当選時の振り分け（RUSH 突入）は別乱数
 * 演出側は判定結果を受け取るだけで、確率を変更する手段を持たない。
 */
(function (NB) {
  'use strict';

  class Lottery {
    constructor(spec, rng) {
      this.spec = spec;
      this.rng = rng || new NB.RNG();
      this.override = { normal: null, rush: null }; // 開発者モードでの確率変更（テスト扱い）
    }

    probability(mode) {
      const o = this.override[mode];
      return o != null ? o : this.spec[mode].probability;
    }
    isOverridden(mode) { return this.override[mode] != null; }

    threshold(mode) {
      return Math.round(this.spec.randomRange * this.probability(mode));
    }

    /** 始動入賞時：乱数取得 */
    acquire(source, mode, opts = {}) {
      const hold = {
        id: Lottery._id = (Lottery._id || 0) + 1,
        source,                         // 'heso' | 'denchu'
        value: this.rng.int(this.spec.randomRange),
        allocValue: this.rng.next(),    // 振り分け用
        reachValue: this.rng.next(),    // リーチ抽選用
        acquiredMode: mode,
        forced: opts.forced || null,    // 'win' | 'lose' | 'rush' 等（開発者）
        test: !!opts.forced || this.isOverridden(mode),
      };
      hold.pre = this.judge(hold, mode); // 事前判定（先読み用）
      return hold;
    }

    /** 当否判定。mode はその時点の遊技状態 */
    judge(hold, mode) {
      const f = hold.forced;
      let win = hold.value < this.threshold(mode);
      if (f === 'win' || f === 'rush' || f === 'normalWin') win = true;
      if (f === 'lose' || f === 'reach' || f === 'reachLose') win = false;
      const res = { win, mode };
      if (win) {
        if (mode === 'normal') {
          let toRush = hold.allocValue < this.spec.normal.rushRate;
          if (f === 'rush') toRush = true;
          if (f === 'normalWin') toRush = false;
          res.kind = 'first';
          res.rounds = this.spec.normal.rounds;
          res.toRush = toRush;
        } else {
          res.kind = 'rush';
          res.rounds = this.spec.rush.rounds;
          res.toRush = true;
        }
      } else {
        const rr = this.spec[mode].lossReachRate;
        res.reach = hold.reachValue < rr || f === 'reach' || f === 'reachLose';
      }
      res.test = !!hold.test;
      return res;
    }

    /** 統計検証用：n 回の判定をシミュレート */
    static simulate(spec, n, seed) {
      const L = new Lottery(spec, new NB.RNG(seed));
      let wins = 0, rush = 0;
      for (let i = 0; i < n; i++) {
        const h = L.acquire('heso', 'normal');
        const r = L.judge(h, 'normal');
        if (r.win) { wins++; if (r.toRush) rush++; }
      }
      return { wins, rush, prob: wins / n, rushRate: rush / Math.max(1, wins) };
    }
  }

  NB.Lottery = Lottery;
})(globalThis.NB);
