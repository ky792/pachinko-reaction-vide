/*
 * NAGIBAKU LAB pachinko engine — core utilities
 * 名前空間 / イベントバス / 乱数 / 補間関数
 * ブラウザ・Node 両対応（file:// でも動くよう ES Modules を使わない）
 */
(function (root) {
  'use strict';
  const NB = (root.NB = root.NB || {});
  NB.machines = NB.machines || {};

  /** 機種パック登録。machines/<id>/*.js から呼ばれる */
  NB.registerMachine = function (id, part, data) {
    const m = (NB.machines[id] = NB.machines[id] || { id });
    m[part] = data;
    return m;
  };

  // ---------------------------------------------------------------- event bus
  class Bus {
    constructor() { this.map = new Map(); }
    on(type, fn) {
      if (!this.map.has(type)) this.map.set(type, new Set());
      this.map.get(type).add(fn);
      return () => this.map.get(type).delete(fn);
    }
    emit(type, payload) {
      const s = this.map.get(type);
      if (s) for (const fn of s) {
        try { fn(payload); } catch (e) { console.error('[bus]', type, e); }
      }
      const any = this.map.get('*');
      if (any) for (const fn of any) fn(type, payload);
    }
  }
  NB.Bus = Bus;

  // ---------------------------------------------------------------- RNG
  /** xoshiro128** : 抽選用。seed 指定で再現可能 */
  class RNG {
    constructor(seed) { this.seed(seed); }
    seed(seed) {
      if (seed === undefined || seed === null) {
        seed = [];
        if (root.crypto && root.crypto.getRandomValues) {
          const a = new Uint32Array(4); root.crypto.getRandomValues(a); seed = Array.from(a);
        } else {
          for (let i = 0; i < 4; i++) seed.push((Math.random() * 4294967296) >>> 0);
        }
      } else if (typeof seed === 'number') {
        let z = seed >>> 0; const out = [];
        for (let i = 0; i < 4; i++) { // splitmix32
          z = (z + 0x9e3779b9) >>> 0; let t = z;
          t = Math.imul(t ^ (t >>> 16), 0x85ebca6b); t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
          out.push((t ^ (t >>> 16)) >>> 0);
        }
        seed = out;
      }
      this.s = Uint32Array.from(seed);
      if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1;
    }
    nextU32() {
      const s = this.s;
      const r = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
      const t = s[1] << 9;
      s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
      return r;
    }
    next() { return this.nextU32() / 4294967296; }
    int(n) { return Math.floor(this.next() * n); }
    range(a, b) { return a + (b - a) * this.next(); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[this.int(arr.length)]; }
    /** {key: weight} から重み付き抽選 */
    weighted(table) {
      let total = 0; for (const k in table) total += Math.max(0, table[k]);
      let r = this.next() * total;
      for (const k in table) { r -= Math.max(0, table[k]); if (r < 0) return k; }
      return Object.keys(table)[0];
    }
  }
  function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
  NB.RNG = RNG;

  // ---------------------------------------------------------------- math
  const M = (NB.math = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    inv: (a, b, v) => (b === a ? 0 : (v - a) / (b - a)),
    seg: (t, a, b) => M.clamp((t - a) / (b - a), 0, 1), // 区間正規化
    smooth: (t) => t * t * (3 - 2 * t),
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInCubic: (t) => t * t * t,
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeOutBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutElastic: (t) => {
      if (t <= 0 || t >= 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    },
    pulse: (t, f) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * f),
    TAU: Math.PI * 2,
  });

  /** 疑似ノイズ（決定的な揺れ用） */
  NB.noise1 = function (x) {
    const i = Math.floor(x), f = x - i;
    const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    return M.lerp(h(i), h(i + 1), M.smooth(f)) * 2 - 1;
  };

  /** 汎用 Canvas 生成（Node では null） */
  NB.makeCanvas = function (w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c;
  };

  NB.deepMerge = function deepMerge(target, src) {
    for (const k in src) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        deepMerge(target[k], v);
      } else target[k] = v;
    }
    return target;
  };

  NB.clone = (o) => JSON.parse(JSON.stringify(o));
})(typeof window !== 'undefined' ? window : globalThis);
