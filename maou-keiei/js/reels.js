/* ==========================================================
 * リール：回転・停止制御（最大4コマスベリ）・描画
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, CFG = MK.CFG;
  const N = 21;
  const CELL_W = 150, CELL_H = 82, GAP = 18, VIS = 3;
  const W = CELL_W * 3 + GAP * 2, H = CELL_H * VIS;
  const SPEED = 26; // コマ/秒

  const symCache = {};
  function symCanvas(id) {
    if (symCache[id]) return symCache[id];
    const c = document.createElement('canvas');
    c.width = CELL_W * 2; c.height = CELL_H * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    MK.Art.symbol(g, id, CELL_W, CELL_H);
    symCache[id] = c;
    return c;
  }

  const TRIPLE = { REPLAY: 'replay', COIN: 'coin', SLIME: 'slime', SKULL: 'skull3', CHEST: 'chest3', BAR: 'bar', SEVEN: 'seven' };
  function evaluate(tr) {
    const [a, b, c] = tr;
    if (a === b && b === c) return TRIPLE[a];
    if (a === 'SKULL') return 'skull';
    if (a === 'CHEST' && b === 'CHEST' && c === 'COIN') return 'chance';
    return 'none';
  }
  const uniq = CFG.STRIPS.map((s) => [...new Set(s)]);
  function feasible(known, target) {
    const opts = known.map((k, i) => (k ? [k] : uniq[i]));
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) if (evaluate([a, b, c]) === target) return true;
    return false;
  }

  const reels = [0, 1, 2].map((i) => ({
    i, pos: U.randi(0, N - 1), state: 'stop', // stop | spin | stopping | reverse
    target: 0, from: 0, t0: 0, dur: 0, light: 1, lightColor: null, blink: 0,
  }));

  let canvas, ctx, win = null, winT = 0;
  const R = {
    W, H, evaluate,
    init(cv) {
      canvas = cv;
      canvas.width = W * 2; canvas.height = H * 2;
      ctx = canvas.getContext('2d');
      // フォント読み込み後に図柄を作り直す
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Object.keys(symCache).forEach((k) => delete symCache[k]); });
    },
    get reels() { return reels; },
    strip(i) { return CFG.STRIPS[i]; },
    sym(i, idx) { return CFG.STRIPS[i][U.mod(idx, N)]; },
    center(i) { return R.sym(i, Math.round(reels[i].pos)); },
    centers() { return [0, 1, 2].map((i) => R.center(i)); },
    anySpinning() { return reels.some((r) => r.state !== 'stop'); },
    isSpinning(i) { return reels[i].state === 'spin'; },
    start() {
      win = null;
      const now = U.now();
      reels.forEach((r, k) => { r.state = 'spin'; r.spinStart = now + k * 0.04; r.pos = Math.round(r.pos); });
    },
    // 停止位置の決定（target：狙う出目, known：停止済みの中段図柄）
    decide(i, target) {
      const r = reels[i];
      const base = Math.floor(r.pos);
      const known = [0, 1, 2].map((k) => (reels[k].state === 'stop' && k !== i ? R.center(k) : null));
      const tryRange = (a, b) => {
        for (let s = a; s <= b; s++) {
          const c = base - s;
          const kn = known.slice(); kn[i] = R.sym(i, c);
          if (feasible(kn, target)) return c;
        }
        return null;
      };
      let c = tryRange(0, CFG.MAX_SLIP);
      if (c == null) c = tryRange(CFG.MAX_SLIP + 1, N + CFG.MAX_SLIP);
      if (c == null) c = base;
      return c;
    },
    stop(i, target) {
      const r = reels[i];
      if (r.state !== 'spin') return Promise.resolve();
      const c = R.decide(i, target);
      r.state = 'stopping';
      r.from = r.pos; r.target = c; r.t0 = U.now();
      r.dur = Math.max(0.04, (r.from - c) / SPEED);
      r.slip = Math.floor(r.from) - c;
      return new Promise((res) => { r.done = res; });
    },
    // フリーズ演出：リール逆回転
    reverse(sec = 3) {
      reels.forEach((r) => { r.state = 'reverse'; r.revUntil = U.now() + sec; });
      return MK.wait(sec * 1000);
    },
    setLight(i, v, color) { reels[i].light = v; reels[i].lightColor = color || null; },
    setAllLight(v, color) { reels.forEach((r) => { r.light = v; r.lightColor = color || null; }); },
    showWin(outcome) { win = outcome; winT = U.now(); },
    update(dt) {
      const now = U.now();
      for (const r of reels) {
        if (r.state === 'spin') {
          if (now >= r.spinStart) {
            const acc = U.clamp((now - r.spinStart) / 0.25, 0, 1);
            r.pos -= SPEED * dt * acc;
          }
        } else if (r.state === 'stopping') {
          const p = U.clamp((now - r.t0) / r.dur, 0, 1);
          r.pos = U.lerp(r.from, r.target, p);
          if (p >= 1) {
            r.pos = r.target; r.state = 'stop'; r.bounce = now;
            if (r.done) { const d = r.done; r.done = null; d(); }
          }
        } else if (r.state === 'reverse') {
          r.pos += dt * 1.6;
          if (now >= r.revUntil) { r.state = 'stop'; r.pos = Math.round(r.pos); }
        }
        r.pos = U.mod(r.pos, N * 1000);
      }
    },
    draw() {
      if (!ctx) return;
      const now = U.now();
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, W, H);
      reels.forEach((r, i) => {
        const x = i * (CELL_W + GAP);
        // リール紙
        ctx.save();
        ctx.beginPath(); ctx.rect(x, 0, CELL_W, H); ctx.clip();
        const paper = ctx.createLinearGradient(0, 0, 0, H);
        paper.addColorStop(0, '#d8d0c0'); paper.addColorStop(0.5, '#fffaf0'); paper.addColorStop(1, '#d8d0c0');
        ctx.fillStyle = paper; ctx.fillRect(x, 0, CELL_W, H);
        const spinning = r.state === 'spin' || r.state === 'reverse' || (r.state === 'stopping' && r.dur > 0.05);
        let bounce = 0;
        if (r.state === 'stop' && r.bounce && now - r.bounce < 0.12) bounce = Math.sin(((now - r.bounce) / 0.12) * Math.PI) * 4;
        const base = Math.floor(r.pos), frac = r.pos - base;
        for (let k = -2; k <= 2; k++) {
          const id = R.sym(i, base + k);
          const y = H / 2 + (k - frac) * CELL_H - CELL_H / 2 + bounce;
          const img = symCanvas(id);
          let sc = 1;
          const isWin = win && win !== 'none' && r.state === 'stop' && k === 0 && frac < 0.01;
          if (isWin) sc = 1 + 0.06 * Math.abs(Math.sin((now - winT) * 8));
          if (spinning && r.state !== 'reverse') {
            ctx.globalAlpha = 0.35;
            ctx.drawImage(img, x, y - 14, CELL_W, CELL_H);
            ctx.drawImage(img, x, y + 14, CELL_W, CELL_H);
            ctx.globalAlpha = 0.55;
            ctx.drawImage(img, x, y, CELL_W, CELL_H);
            ctx.globalAlpha = 1;
          } else {
            ctx.drawImage(img, x + (CELL_W - CELL_W * sc) / 2, y + (CELL_H - CELL_H * sc) / 2, CELL_W * sc, CELL_H * sc);
          }
          if (isWin) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.25 * Math.sin((now - winT) * 10);
            ctx.drawImage(MK.FX.glow('rgba(255,220,120,0.8)', 64), x - 10, y - 10, CELL_W + 20, CELL_H + 20);
            ctx.restore();
          }
        }
        // 円筒の陰影
        const sh = ctx.createLinearGradient(0, 0, 0, H);
        sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(0.18, 'rgba(0,0,0,0)'); sh.addColorStop(0.82, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = sh; ctx.fillRect(x, 0, CELL_W, H);
        // バックライト
        if (r.light < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - r.light) * 0.85})`; ctx.fillRect(x, 0, CELL_W, H); }
        if (r.lightColor) {
          ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = r.lightColor; ctx.fillRect(x, 0, CELL_W, H);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      });
      // 有効ライン
      ctx.fillStyle = win && win !== 'none' ? `rgba(255,60,60,${0.5 + 0.5 * Math.sin(now * 12)})` : 'rgba(200,30,40,0.35)';
      ctx.fillRect(0, H / 2 - 1, W, 2);
    },
  };
  MK.Reels = R;
})(window.MK);
