/*
 * 役物制御：中央可動役物「深淵コア」
 *  pos  : 0 = 格納（枠上部ハウジング）／1 = 液晶中央へ降下
 *  open : 外周プレート（8枚）の展開量
 *  glow : コア発光量 / spin : 内輪回転速度 / shake : 振動
 * 演出タイムラインからは preset 名で呼び出す。
 */
(function (NB) {
  'use strict';
  const E = NB.math;

  class Gimmick {
    constructor(opts = {}) {
      this.s = { pos: 0, open: 0, glow: 0.15, spin: 0.3, shake: 0, hue: 190, rainbow: 0 };
      this.tweens = [];
      this.angle = 0; this.t = 0;
      this.onSound = opts.onSound || (() => {});
    }
    to(props, dur, ease = 'easeInOutCubic', delay = 0) {
      for (const k in props) {
        this.tweens = this.tweens.filter((tw) => tw.k !== k || tw.t0 + tw.delay > this.t + delay);
        this.tweens.push({ k, from: null, to: props[k], t0: this.t, delay, dur: Math.max(0.001, dur), ease });
      }
      return this;
    }
    set(props) { Object.assign(this.s, props); this.tweens = this.tweens.filter((t) => !(t.k in props)); }
    update(dt) {
      this.t += dt;
      this.angle += this.s.spin * dt;
      this.s.shake *= Math.pow(0.02, dt);
      const keep = [];
      for (const tw of this.tweens) {
        const lt = this.t - tw.t0 - tw.delay;
        if (lt < 0) { keep.push(tw); continue; }
        if (tw.from === null) tw.from = this.s[tw.k];
        const p = Math.min(1, lt / tw.dur);
        this.s[tw.k] = E.lerp(tw.from, tw.to, (E[tw.ease] || E.smooth)(p));
        if (p < 1) keep.push(tw);
      }
      this.tweens = keep;
    }
    /** 演出プリセット */
    preset(name) {
      switch (name) {
        case 'reset': this.tweens = []; this.to({ pos: 0, open: 0, glow: 0.15, spin: 0.3, rainbow: 0 }, 0.8); this.s.hue = 190; break;
        case 'tease': // ガセ（少しだけ動いて戻る）
          this.onSound('gimmick_small'); this.to({ pos: 0.12 }, 0.12, 'easeOutCubic'); this.to({ pos: 0 }, 0.3, 'easeInOutCubic', 0.16); this.s.shake = 3; break;
        case 'shake': this.onSound('gimmick_small'); this.s.shake = 6; this.to({ glow: 0.6 }, 0.1); this.to({ glow: 0.2 }, 0.5, 'smooth', 0.2); break;
        case 'drop': // 落下（フル降下）
          this.onSound('gimmick'); this.to({ pos: 1 }, 0.55, 'easeOutBack'); this.to({ glow: 0.7, spin: 2 }, 0.6); this.s.shake = 8; break;
        case 'open': this.onSound('gimmick'); this.to({ open: 1 }, 0.5, 'easeOutBack'); this.to({ glow: 1, spin: 5 }, 0.5); this.s.shake = 10; break;
        case 'full': this.preset('drop'); this.to({ open: 1 }, 0.5, 'easeOutBack', 0.45); this.to({ glow: 1, spin: 6 }, 0.6, 'smooth', 0.45); break;
        case 'win': this.set({ hue: 45 }); this.preset('full'); this.to({ rainbow: 1 }, 0.6, 'smooth', 0.4); break;
        case 'overdrive': this.set({ hue: 0 }); this.to({ pos: 1 }, 1.1, 'easeInOutCubic'); this.to({ open: 1 }, 0.35, 'easeOutBack', 1.2); this.to({ glow: 1, spin: 9, rainbow: 1 }, 0.4, 'smooth', 1.2); this.onSound('gimmick'); break;
        case 'stow': this.to({ open: 0 }, 0.4); this.to({ pos: 0, glow: 0.15, spin: 0.3, rainbow: 0 }, 0.7, 'easeInOutCubic', 0.3); break;
        default: break;
      }
    }
    get active() { return this.s.pos > 0.02 || this.s.open > 0.02; }
  }

  NB.Gimmick = Gimmick;
})(globalThis.NB);
