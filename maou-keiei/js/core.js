/* ==========================================================
 * 魔王経営記（仮） - core
 * 名前空間・ユーティリティ・イベントバス
 * 本機は架空の試作機です。実際の遊技機・金銭・換金とは一切関係ありません。
 * ========================================================== */
window.MK = window.MK || {};
(function (MK) {
  'use strict';

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    mod: (n, m) => ((n % m) + m) % m,
    TAU: Math.PI * 2,
    // 区間 [a,b] 内の進行度 0..1
    seg: (t, a, b) => U.clamp((t - a) / (b - a), 0, 1),
    // 疑似乱数（シード付き）: 背景などの毎フレーム同じ配置用
    srand(seed) {
      let s = seed >>> 0 || 1;
      return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return (s >>> 0) / 4294967296;
      };
    },
    fmt: (n) => Math.floor(n).toLocaleString('ja-JP'),
    now: () => performance.now() / 1000,
  };

  U.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) => {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };

  // シンプルなイベントバス
  const handlers = {};
  MK.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return fn; },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev, data) { (handlers[ev] || []).slice().forEach((f) => f(data)); },
  };

  // スキップ可能な待機（演出スキップ・倍速再生用）
  MK.timeScale = 1;
  MK.wait = (ms) => new Promise((r) => setTimeout(r, ms / MK.timeScale));

  MK.U = U;
})(window.MK);
