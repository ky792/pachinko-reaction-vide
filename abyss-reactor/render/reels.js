/*
 * 図柄リール（液晶内 3 列）
 *  - 加速 → 高速（モーションブラー素材）→ 減速 → オーバーシュート → 戻り（重量感）
 *  - レイアウト：main（中央大）/ corner（左上小）/ hidden、補間付き
 */
(function (NB) {
  'use strict';
  const E = NB.math;
  const STRIP = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const LAYOUTS = {
    main: { xs: [205, 480, 755], y: 250, size: 200, spacing: 210, alpha: 1, rows: 1 },
    reach: { xs: [160, 480, 800], y: 250, size: 220, spacing: 230, alpha: 1, rows: 1 },
    corner: { xs: [38, 84, 130], y: 40, size: 46, spacing: 50, alpha: 1, rows: 0 },
    hidden: { xs: [38, 84, 130], y: 40, size: 46, spacing: 50, alpha: 0, rows: 0 },
  };

  class Reel {
    constructor(i) { this.i = i; this.offset = Math.floor(Math.random() * 9); this.speed = 0; this.state = 'stop'; this.stopAnim = null; this.accel = 0; this.bounceT = 1; this.vmax = 22; this.squash = 0; }
    get symbol() { return STRIP[((Math.round(this.offset) % 9) + 9) % 9]; }
    start(vmax, delay = 0) { this.state = 'accel'; this.delay = delay; this.vmax = vmax; this.stopAnim = null; this.speed = Math.min(this.speed, -2); }
    slow(v) { this.state = 'slow'; this.vmax = v; }
    /** 停止。kind: 'normal' | 'heavy' | 'reach'(じわ止め) */
    stop(sym, kind = 'normal', onStop) {
      const v0 = Math.max(this.speed, 1.5);
      const minLead = kind === 'reach' ? 1.2 : Math.max(1.1, v0 * 0.09);
      let P = Math.ceil(this.offset + minLead);
      while (STRIP[((P % 9) + 9) % 9] !== sym) P++;
      const ov = kind === 'reach' ? 0.06 : kind === 'heavy' ? 0.22 : 0.14;
      const dist = P + ov - this.offset;
      let d = (3 * dist) / v0;
      d = E.clamp(d, kind === 'reach' ? 0.9 : 0.12, kind === 'reach' ? 2.4 : 0.5);
      this.stopAnim = { s0: this.offset, P, ov, d, t: 0, phase: 0, kind, onStop };
      this.state = 'stopping';
    }
    update(dt) {
      if (this.state === 'accel') {
        if (this.delay > 0) { this.delay -= dt; this.offset -= 1.5 * dt; return; }
        this.speed = Math.min(this.vmax, this.speed + 90 * dt);
        this.offset += this.speed * dt;
        if (this.speed >= this.vmax) this.state = 'spin';
      } else if (this.state === 'spin') {
        this.speed = this.vmax; this.offset += this.speed * dt;
      } else if (this.state === 'slow') {
        this.speed += (this.vmax - this.speed) * Math.min(1, dt * 3); this.offset += this.speed * dt;
      } else if (this.state === 'stopping') {
        const a = this.stopAnim; a.t += dt;
        if (a.phase === 0) {
          const u = Math.min(1, a.t / a.d);
          this.offset = a.s0 + (a.P + a.ov - a.s0) * E.easeOutCubic(u);
          this.speed = ((a.P + a.ov - a.s0) * 3 * Math.pow(1 - u, 2)) / a.d;
          if (u >= 1) { a.phase = 1; a.t = 0; this.squash = a.kind === 'heavy' ? 1 : 0.6; a.onStop && a.onStop(this); }
        } else {
          const u = Math.min(1, a.t / 0.16);
          this.offset = a.P + a.ov * (1 - E.easeOutCubic(u)) + Math.sin(u * Math.PI) * -a.ov * 0.25;
          this.speed = 0;
          if (u >= 1) { this.offset = a.P; this.state = 'stop'; }
        }
      }
      this.squash *= Math.pow(0.002, dt);
    }
  }

  class ReelSet {
    constructor(assets) {
      this.assets = assets;
      this.reels = [0, 1, 2].map((i) => new Reel(i));
      this.layout = { ...LAYOUTS.main }; this.from = null; this.to = LAYOUTS.main; this.lt = 1; this.ldur = 0.4;
      this.highlight = 0; this.win = 0; this.dim = 0; this.reachPulse = 0; this.reachSym = null;
      this.t = 0;
    }
    setLayout(name, dur = 0.45) { this.from = { ...this.layout, xs: [...this.layout.xs] }; this.to = LAYOUTS[name]; this.lt = 0; this.ldur = dur; this.layoutName = name; }
    startAll(vmax = 22, stagger = 0.06) { this.reels.forEach((r, i) => r.start(vmax, i * stagger)); this.win = 0; this.reachSym = null; this.reachPulse = 0; }
    stop(i, sym, kind, cb) { this.reels[i].stop(sym, kind, cb); }
    get spinning() { return this.reels.some((r) => r.state !== 'stop'); }
    update(dt) {
      this.t += dt;
      for (const r of this.reels) r.update(dt);
      if (this.lt < 1) {
        this.lt = Math.min(1, this.lt + dt / this.ldur);
        const u = E.easeInOutCubic(this.lt), f = this.from, t = this.to;
        this.layout = { xs: f.xs.map((x, i) => E.lerp(x, t.xs[i], u)), y: E.lerp(f.y, t.y, u), size: E.lerp(f.size, t.size, u), spacing: E.lerp(f.spacing, t.spacing, u), alpha: E.lerp(f.alpha, t.alpha, u), rows: u > 0.5 ? t.rows : f.rows };
      }
      this.reachPulse *= Math.pow(0.1, dt);
    }

    draw(g, opts = {}) {
      const Lo = this.layout; if (Lo.alpha <= 0.01) return;
      g.save(); g.globalAlpha = Lo.alpha;
      const big = Lo.size > 120;
      // 図柄の背後の暗幕（可読性）
      if (big && opts.backdrop !== false) {
        const bg = g.createLinearGradient(0, Lo.y - Lo.size * 0.7, 0, Lo.y + Lo.size * 0.7);
        bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.5, `rgba(0,4,8,${0.35 + this.dim * 0.4})`); bg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bg; g.fillRect(0, Lo.y - Lo.size * 0.8, 960, Lo.size * 1.6);
      }
      if (!big) { g.fillStyle = 'rgba(0,0,0,0.55)'; NB.Mat.roundRect(g, Lo.xs[0] - 28, Lo.y - 30, Lo.xs[2] - Lo.xs[0] + 56, 60, 8); g.fill(); g.strokeStyle = 'rgba(120,220,255,0.4)'; g.lineWidth = 1; g.stroke(); }
      for (const r of this.reels) {
        const x = Lo.xs[r.i];
        g.save();
        if (big) { g.beginPath(); g.rect(x - Lo.spacing / 2, Lo.y - Lo.spacing * 0.98, Lo.spacing, Lo.spacing * 1.96); g.clip(); }
        else { g.beginPath(); g.rect(x - 24, Lo.y - 26, 48, 52); g.clip(); }
        const base = Math.floor(r.offset), frac = r.offset - base;
        const blur = r.speed > 9;
        const rows = big ? Lo.rows + 1 : 1;
        for (let k = -rows; k <= rows; k++) {
          const p = base - k; const sym = STRIP[((p % 9) + 9) % 9];
          const y = Lo.y + (k + frac) * Lo.spacing;
          const dist = Math.abs(y - Lo.y) / Lo.spacing;
          let s = Lo.size * (1 - Math.min(0.25, dist * 0.18));
          if (k === 0 && r.squash > 0.01 && frac < 0.3) s *= 1 + r.squash * 0.06;
          const img = this.assets.image((blur ? 'symbol_blur_' : 'symbol_') + sym);
          if (!img) continue;
          g.save();
          g.globalAlpha = Lo.alpha * (big ? Math.max(0, 1 - dist * 1.05) : 1);
          const h = blur ? s * (img.height / img.width) : s;
          const isReach = this.reachSym === sym && r.state === 'stop' && r.i !== 1 && k === 0;
          if ((this.win > 0 && k === 0) || isReach) {
            g.globalCompositeOperation = 'source-over';
            const k2 = this.win > 0 ? this.win : this.reachPulse;
            if (k2 > 0.02) { g.shadowColor = this.win > 0 ? '#ffd040' : '#ff4040'; g.shadowBlur = 30 * k2; }
          }
          let sc = 1;
          if (this.win > 0 && k === 0) sc = 1 + 0.08 * Math.sin(this.t * 10) * this.win;
          g.translate(x, y); g.scale(sc, sc);
          g.drawImage(img, -s / 2, -h / 2, s, h);
          g.restore();
        }
        g.restore();
      }
      g.restore();
    }
  }

  NB.ReelSet = ReelSet;
  NB.ReelSet.STRIP = STRIP;
})(globalThis.NB);
