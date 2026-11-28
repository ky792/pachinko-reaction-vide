/*
 * 質感ライブラリ：ヘアライン金属 / クローム / ガンメタ / ボルト / ガラス / 樹脂
 * 光源は左上（-0.6, -0.8）で統一。
 */
(function (NB) {
  'use strict';
  const TAU = Math.PI * 2;
  const Mat = {};

  /** ヘアライン（研磨）テクスチャのパターン */
  Mat.brushed = function (g, w = 256, h = 256, base = '#1d2126', strength = 0.06) {
    const c = NB.makeCanvas(w, h), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const rng = new NB.RNG(99);
    for (let i = 0; i < 1400; i++) {
      const y = rng.next() * h, len = 20 + rng.next() * 160, sx = rng.next() * w;
      x.strokeStyle = rng.next() < 0.5 ? `rgba(255,255,255,${strength * rng.next()})` : `rgba(0,0,0,${strength * 1.6 * rng.next()})`;
      x.lineWidth = rng.next() < 0.8 ? 1 : 2;
      x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + len, y + (rng.next() - 0.5)); x.stroke();
    }
    return g.createPattern(c, 'repeat');
  };

  /** 微細ノイズ（樹脂・塗装面） */
  Mat.grain = function (g, w = 128, h = 128, a = 0.05) {
    const c = NB.makeCanvas(w, h), x = c.getContext('2d'), d = x.createImageData(w, h);
    const rng = new NB.RNG(7);
    for (let i = 0; i < d.data.length; i += 4) { const v = rng.next() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 * a; }
    x.putImageData(d, 0, 0);
    return g.createPattern(c, 'repeat');
  };

  /** クローム（縦方向の映り込みグラデ） */
  Mat.chrome = function (g, x0, y0, x1, y1, tint) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    const t = tint || [255, 255, 255];
    const c = (k) => `rgb(${Math.round(t[0] * k)},${Math.round(t[1] * k)},${Math.round(t[2] * k)})`;
    gr.addColorStop(0, c(0.95)); gr.addColorStop(0.12, c(0.7)); gr.addColorStop(0.32, c(0.25)); gr.addColorStop(0.5, c(0.12));
    gr.addColorStop(0.55, c(0.55)); gr.addColorStop(0.72, c(0.9)); gr.addColorStop(0.86, c(0.4)); gr.addColorStop(1, c(0.8));
    return gr;
  };

  Mat.gunmetal = function (g, x0, y0, x1, y1) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, '#4a525c'); gr.addColorStop(0.25, '#252a30'); gr.addColorStop(0.6, '#15181c'); gr.addColorStop(1, '#30363e');
    return gr;
  };

  /** 面取りパネル：path を塗ってベベルを付ける */
  Mat.bevelPanel = function (g, pathFn, fill, opts = {}) {
    const bw = opts.bevel ?? 3;
    g.save();
    if (opts.shadow !== false) { g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = opts.shadowBlur ?? 18; g.shadowOffsetX = 4; g.shadowOffsetY = 8; }
    pathFn(); g.fillStyle = fill; g.fill(opts.rule || 'nonzero');
    g.restore();
    if (opts.pattern) { g.save(); pathFn(); g.clip(opts.rule || 'nonzero'); g.globalAlpha = opts.patternAlpha ?? 1; g.fillStyle = opts.pattern; g.fillRect(-2000, -2000, 6000, 6000); g.restore(); }
    // ハイライト（左上）とシャドウ（右下）
    g.save(); pathFn(); g.clip(opts.rule || 'nonzero');
    g.lineWidth = bw * 2;
    g.translate(bw * 0.6, bw * 0.8); pathFn(); g.strokeStyle = opts.hi || 'rgba(255,255,255,0.28)'; g.stroke();
    g.translate(-bw * 1.2, -bw * 1.6); pathFn(); g.strokeStyle = opts.lo || 'rgba(0,0,0,0.6)'; g.stroke();
    g.restore();
    if (opts.edge) { g.save(); pathFn(); g.lineWidth = opts.edgeWidth || 1; g.strokeStyle = opts.edge; g.stroke(); g.restore(); }
  };

  /** 六角ボルト */
  Mat.bolt = function (g, x, y, r = 5, rot = 0.3) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(1.2, 1.8, r + 1.5, 0, TAU); g.fill();
    const wg = g.createRadialGradient(-r * 0.4, -r * 0.4, 0, 0, 0, r + 2); wg.addColorStop(0, '#8a939c'); wg.addColorStop(1, '#1a1e22');
    g.fillStyle = wg; g.beginPath(); g.arc(0, 0, r + 1.5, 0, TAU); g.fill();
    g.rotate(rot); g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath();
    const hg = g.createLinearGradient(-r, -r, r, r); hg.addColorStop(0, '#e6ebf0'); hg.addColorStop(0.5, '#6a737c'); hg.addColorStop(1, '#2a2f34');
    g.fillStyle = hg; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.35, 0, TAU); g.fill();
    g.restore();
  };

  /** 刻印テキスト（凹） */
  Mat.engrave = function (g, text, x, y, font, color = 'rgba(200,210,220,0.55)', align = 'center') {
    g.save(); g.font = font; g.textAlign = align; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(text, x - 0.8, y - 1);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillText(text, x + 0.8, y + 1);
    g.fillStyle = color; g.fillText(text, x, y);
    g.restore();
  };

  /** クローム文字（立体） */
  Mat.chromeText = function (g, text, x, y, font, opts = {}) {
    g.save(); g.font = font; g.textAlign = opts.align || 'center'; g.textBaseline = 'middle';
    const m = g.measureText(text), h = opts.size || 40;
    for (let i = opts.depth || 5; i > 0; i--) { g.fillStyle = `rgba(0,0,0,${0.25 + i * 0.05})`; g.fillText(text, x + i * 0.6, y + i); }
    g.fillStyle = Mat.chrome(g, 0, y - h / 2, 0, y + h / 2, opts.tint);
    g.fillText(text, x, y);
    g.lineWidth = opts.stroke || 1.2; g.strokeStyle = opts.edge || 'rgba(255,255,255,0.5)'; g.strokeText(text, x, y);
    if (opts.glow) { g.shadowColor = opts.glow; g.shadowBlur = 18; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.fillStyle = opts.glow; g.fillText(text, x, y); }
    g.restore();
    return m.width;
  };

  /** 発光ライン（LED 導光） */
  Mat.glowLine = function (g, pathFn, color, width, intensity = 1) {
    if (intensity <= 0.01) return;
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalAlpha = 0.18 * intensity; g.lineWidth = width * 5; g.strokeStyle = color; pathFn(); g.stroke();
    g.globalAlpha = 0.45 * intensity; g.lineWidth = width * 2; pathFn(); g.stroke();
    g.globalAlpha = 0.95 * intensity; g.lineWidth = width; pathFn(); g.stroke();
    g.globalAlpha = 0.8 * intensity; g.lineWidth = Math.max(1, width * 0.35); g.strokeStyle = '#ffffff'; pathFn(); g.stroke();
    g.restore();
  };

  Mat.roundRect = function (g, x, y, w, h, r, cont) {
    if (!cont) g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  Mat.chamferRect = function (g, x, y, w, h, c, cont) {
    if (!cont) g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath();
  };


  /** 7セグ表示器（フォント非依存）。右寄せで digits 桁ぶんの消灯セグも描く */
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
  Mat.sevenSeg = function (g, text, xr, yb, h, color, digits = 5, ghost = 'rgba(255,80,40,0.07)') {
    const w = h * 0.52, gap = h * 0.16, t = h * 0.11, sk = h * 0.08;
    text = String(text);
    const n = Math.max(digits, text.length);
    const chars = text.padStart(n, ' ').split('');
    const seg = (x, y, id) => {
      const hh = h / 2;
      const P = { a: [x + t, y, x + w - t, y], d: [x + t, y + h, x + w - t, y + h], g: [x + t, y + hh, x + w - t, y + hh], f: [x, y + t, x, y + hh - t], b: [x + w, y + t, x + w, y + hh - t], e: [x, y + hh + t, x, y + h - t], c: [x + w, y + hh + t, x + w, y + h - t] }[id];
      const [x1, y1, x2, y2] = P;
      const kx1 = sk * (1 - (y1 - y) / h), kx2 = sk * (1 - (y2 - y) / h);
      g.beginPath(); g.moveTo(x1 + kx1, y1); g.lineTo(x2 + kx2, y2); g.stroke();
    };
    g.save(); g.lineCap = 'round'; g.lineWidth = t;
    chars.forEach((ch, i) => {
      const x = xr - (n - i) * (w + gap), y = yb - h;
      g.strokeStyle = ghost; g.shadowBlur = 0;
      for (const id of 'abcdefg') seg(x, y, id);
      const on = SEG[ch]; if (!on) return;
      g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = h * 0.3;
      for (const id of on) seg(x, y, id);
    });
    g.restore();
  };

  NB.Mat = Mat;
})(globalThis.NB);
