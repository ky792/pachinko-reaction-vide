/*
 * 演出タイムライン
 *  シナリオ = { duration, events: [{t, fn, name}], windows: [{t0, t1, onPress, onTimeout}] }
 *  - events は時刻順に一度だけ発火
 *  - windows はボタン受付区間。押下で onPress → 区間終端へジャンプ（skipTo 指定時）
 *  - speed で再生速度変更（開発者モード）
 */
(function (NB) {
  'use strict';

  class TimelineBuilder {
    constructor() { this.events = []; this.windows = []; this.cursor = 0; this.duration = 0; this.marks = {}; }
    at(t, fn, name) { this.events.push({ t, fn, name }); this.duration = Math.max(this.duration, t); return this; }
    /** 現在カーソルからの相対 */
    after(dt, fn, name) { return this.at(this.cursor + dt, fn, name); }
    advance(dt) { this.cursor += dt; this.duration = Math.max(this.duration, this.cursor); return this; }
    mark(name) { this.marks[name] = this.cursor; return this; }
    window(t0, t1, onPress, onTimeout, opts = {}) { this.windows.push(Object.assign({ t0, t1, onPress, onTimeout, pressed: false, done: false }, opts)); this.duration = Math.max(this.duration, t1); return this; }
    end(t) { this.duration = Math.max(this.duration, t == null ? this.cursor : t); return this; }
    build(meta) { this.events.sort((a, b) => a.t - b.t); return { duration: this.duration, events: this.events, windows: this.windows, meta: meta || {} }; }
  }

  class Timeline {
    constructor() { this.sc = null; this.time = 0; this.idx = 0; this.speed = 1; this.onEnd = null; this.paused = false; }
    play(sc, onEnd) { this.sc = sc; this.time = 0; this.idx = 0; this.onEnd = onEnd; this.fire(); }
    get running() { return !!this.sc; }
    stop() { this.sc = null; }
    update(dt) {
      if (!this.sc || this.paused) return;
      this.time += dt * this.speed;
      this.fire();
      for (const w of this.sc.windows) {
        if (!w.done && this.time >= w.t1) { w.done = true; if (!w.pressed && w.onTimeout) w.onTimeout(); }
      }
      if (this.sc && this.time >= this.sc.duration && this.idx >= this.sc.events.length) {
        const cb = this.onEnd; const sc = this.sc; this.sc = null; cb && cb(sc);
      }
    }
    fire() {
      const sc = this.sc; if (!sc) return;
      while (this.idx < sc.events.length && sc.events[this.idx].t <= this.time) {
        const e = sc.events[this.idx++];
        try { e.fn(); } catch (err) { console.error('[timeline]', e.name, err); }
        if (this.sc !== sc) return;
      }
    }
    /** ボタン受付中か */
    activeWindow() {
      if (!this.sc) return null;
      for (const w of this.sc.windows) if (!w.done && !w.pressed && this.time >= w.t0 && this.time < w.t1) return w;
      return null;
    }
    press() {
      const w = this.activeWindow(); if (!w) return false;
      w.pressed = true; w.done = true;
      if (w.onPress) w.onPress();
      if (w.skipTo != null) { this.time = Math.max(this.time, w.skipTo); this.fire(); }
      return true;
    }
  }

  NB.TimelineBuilder = TimelineBuilder;
  NB.Timeline = Timeline;
})(globalThis.NB);
