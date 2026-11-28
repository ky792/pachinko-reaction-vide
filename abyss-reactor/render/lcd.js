/*
 * 液晶レンダラー（960x540）
 *  背景シーン / カメラ / 図柄 / 保留 / エフェクト / パーティクル / HUD を合成。
 *  背景は assets/backgrounds の動画があればそれを再生し、無ければプロシージャル描画。
 */
(function (NB) {
  'use strict';
  const TAU = Math.PI * 2, E = NB.math, Mat = NB.Mat;
  const W = 960, H = 540;
  const JP = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  const EN = '"Orbitron", "Rajdhani", "Arial Black", sans-serif';

  // ------------------------------------------------------------------ 文字スタイル
  const TEXT = {
    chrome: (g, y0, y1) => Mat.chrome(g, 0, y0, 0, y1),
    gold: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.3, '#ffd24a'); gr.addColorStop(0.5, '#8a5200'); gr.addColorStop(0.55, '#c88a10'); gr.addColorStop(1, '#fff2a8'); return gr; },
    red: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffe0e0'); gr.addColorStop(0.35, '#ff3a3a'); gr.addColorStop(0.55, '#7a0008'); gr.addColorStop(1, '#ff6a50'); return gr; },
    cyan: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#6ae8ff'); gr.addColorStop(0.55, '#0a4a6a'); gr.addColorStop(1, '#8af0ff'); return gr; },
    blue: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#e0f0ff'); gr.addColorStop(0.4, '#3a8aff'); gr.addColorStop(0.6, '#0a2a7a'); gr.addColorStop(1, '#7ab0ff'); return gr; },
    green: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#eaffea'); gr.addColorStop(0.4, '#3aff6a'); gr.addColorStop(0.6, '#0a5a1a'); gr.addColorStop(1, '#8aff9a'); return gr; },
    white: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c8d2dc'); gr.addColorStop(1, '#ffffff'); return gr; },
    rainbow: (g, y0, y1, t) => { const gr = g.createLinearGradient(-300, y0, 300, y1); for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${(i * 60 + t * 240) % 360},100%,62%)`); return gr; },
  };
  const GLOW = { chrome: '#9adfff', gold: '#ffb020', red: '#ff2020', cyan: '#30d8ff', blue: '#3080ff', green: '#30ff60', white: '#ffffff', rainbow: '#ffffff' };

  function bigText(g, text, x, y, size, style = 'chrome', opts = {}) {
    g.save();
    g.font = `${opts.weight || 900} ${size}px ${opts.font || JP}`;
    g.textAlign = opts.align || 'center'; g.textBaseline = 'middle';
    if (opts.skew) g.transform(1, 0, opts.skew, 1, 0, 0);
    if (opts.track) g.letterSpacing = opts.track + 'px';
    const glow = opts.glow ?? 1;
    // 外側の太縁
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.92)'; g.lineWidth = size * 0.22; g.strokeText(text, x, y + size * 0.04);
    g.strokeStyle = opts.edge || '#1a1e24'; g.lineWidth = size * 0.14; g.strokeText(text, x, y);
    g.strokeStyle = TEXT.chrome(g, y - size / 2, y + size / 2); g.lineWidth = size * 0.07; g.strokeText(text, x, y);
    if (glow > 0) { g.shadowColor = GLOW[style]; g.shadowBlur = size * 0.4 * glow; }
    g.fillStyle = TEXT[style](g, y - size / 2, y + size / 2, opts.t || 0);
    g.fillText(text, x, y);
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillText(text, x - 1, y - size * 0.03);
    g.restore();
  }

  // ------------------------------------------------------------------ 背景シーン
  const BG = {};
  const persp = (g, vx, vy, t, col, speed) => {
    // 床・天井のパース線
    g.strokeStyle = col; g.lineWidth = 1;
    for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(vx, vy); g.lineTo(vx + i * 120, H + 40); g.stroke(); g.beginPath(); g.moveTo(vx, vy); g.lineTo(vx + i * 120, -40); g.stroke(); }
    for (let k = 0; k < 14; k++) {
      const z = ((k + (t * speed) % 1) / 14); const s = Math.pow(z, 2.2);
      const yb = vy + (H + 40 - vy) * s, yt = vy - (vy + 40) * s;
      g.globalAlpha = s; g.beginPath(); g.moveTo(0, yb); g.lineTo(W, yb); g.moveTo(0, yt); g.lineTo(W, yt); g.stroke();
    }
    g.globalAlpha = 1;
  };

  BG.lab = (g, t, s) => {
    const vx = 480 + Math.sin(t * 0.13) * 30, vy = 250;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1218'); bg.addColorStop(0.45, '#162430'); bg.addColorStop(0.55, '#0c141a'); bg.addColorStop(1, '#05080b');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    persp(g, vx, vy, t, 'rgba(120,200,230,0.10)', 0.08);
    // 天井照明パネル（奥から手前へ）
    for (let k = 0; k < 8; k++) {
      const z = (k + (t * 0.08 * 8) % 1) / 8, s2 = Math.pow(z, 2.4);
      const w = 30 + 600 * s2, y = vy - (vy + 40) * s2 * 0.92;
      g.fillStyle = `rgba(190,235,255,${0.08 + 0.5 * s2})`; g.fillRect(vx - w / 2, y - 2 - 10 * s2, w, 3 + 12 * s2);
    }
    // 側壁モニター
    for (let k = 0; k < 6; k++) {
      const z = (k + (t * 0.08 * 6) % 1) / 6, s2 = Math.pow(z, 2.2);
      for (const side of [-1, 1]) {
        const x = vx + side * (60 + 520 * s2), w = 18 + 140 * s2, h = 12 + 90 * s2, y = vy - h / 2 + 20 * s2;
        g.fillStyle = `rgba(10,30,40,${0.4 + 0.5 * s2})`; g.fillRect(x - w / 2, y, w, h);
        g.fillStyle = `rgba(60,200,240,${0.15 + 0.35 * s2 * (0.6 + 0.4 * Math.sin(t * 3 + k))})`;
        for (let l = 0; l < 4; l++) g.fillRect(x - w / 2 + w * 0.1, y + h * (0.2 + l * 0.18), w * (0.3 + 0.5 * NB.noise1(k * 9 + l + t * 0.5) ** 2), Math.max(1, h * 0.06));
      }
    }
    // 霧
    const fg = g.createRadialGradient(vx, vy, 10, vx, vy, 420); fg.addColorStop(0, 'rgba(120,200,230,0.22)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fg; g.fillRect(0, 0, W, H);
  };

  BG.core = (g, t, s) => {
    const bg = g.createRadialGradient(480, 270, 20, 480, 270, 620); bg.addColorStop(0, '#0d3a4a'); bg.addColorStop(0.4, '#061a24'); bg.addColorStop(1, '#010406');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save(); g.translate(480, 270);
    for (let i = 0; i < 9; i++) {
      const r = 60 + i * 55 + ((t * 18) % 55);
      g.save(); g.rotate(t * (i % 2 ? 0.08 : -0.06) * (1 + i * 0.1));
      g.strokeStyle = `rgba(80,200,230,${0.05 + 0.12 * (1 - i / 9)})`; g.lineWidth = 6 + i * 2;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(0, 0, r, (k * TAU) / 6, (k * TAU) / 6 + 0.7); g.stroke(); }
      g.strokeStyle = `rgba(160,240,255,${0.12 * (1 - i / 9)})`; g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, r + 6, 0, TAU); g.stroke();
      g.restore();
    }
    // 遠くのコア
    const cr = 40 + 6 * Math.sin(t * 2);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, cr * 3); cg.addColorStop(0, 'rgba(220,255,255,0.9)'); cg.addColorStop(0.2, 'rgba(80,220,255,0.6)'); cg.addColorStop(1, 'rgba(0,60,90,0)');
    g.fillStyle = cg; g.beginPath(); g.arc(0, 0, cr * 3, 0, TAU); g.fill();
    g.restore();
    // パイプ
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 410, W, 20); g.fillRect(0, 100, W, 12);
    g.fillStyle = 'rgba(100,200,230,0.1)'; g.fillRect(0, 410, W, 2); g.fillRect(0, 100, W, 1);
  };

  BG.alert = (g, t, s) => {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a0406'); bg.addColorStop(0.5, '#2a080a'); bg.addColorStop(1, '#080102');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    persp(g, 480, 260, t, 'rgba(255,80,60,0.08)', 0.12);
    // 回転灯の光束
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [bx, ph] of [[150, 0], [810, Math.PI]]) {
      const a = t * 3 + ph;
      const gr = g.createRadialGradient(bx, 60, 0, bx, 60, 700); gr.addColorStop(0, 'rgba(255,60,40,0.35)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx, 60); g.arc(bx, 60, 700, a - 0.25, a + 0.25); g.closePath(); g.fill();
      g.fillStyle = `rgba(255,${80 + 80 * Math.max(0, Math.cos(a))},60,0.9)`; g.beginPath(); g.arc(bx, 60, 10, 0, TAU); g.fill();
    }
    g.restore();
    // 隔壁ドアのハザード帯
    for (const side of [0, 1]) {
      const x = side ? W - 70 : 0;
      g.fillStyle = '#120405'; g.fillRect(x, 0, 70, H);
      g.save(); g.beginPath(); g.rect(x + 8, 0, 54, H); g.clip();
      for (let y = -60 + ((t * 30) % 40); y < H + 40; y += 40) { g.fillStyle = 'rgba(255,160,20,0.35)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70, y + 40); g.lineTo(x + 70, y + 60); g.lineTo(x, y + 20); g.fill(); }
      g.restore();
    }
    g.save(); g.globalAlpha = 0.07 + 0.05 * Math.sin(t * 5); bigText(g, 'WARNING', 480, 440, 90, 'red', { font: EN, glow: 0 }); g.restore();
  };

  BG.rush = (g, t, s) => {
    const last = s && s.last;
    const bg = g.createRadialGradient(480, 270, 10, 480, 270, 600);
    bg.addColorStop(0, last ? '#3a0a0a' : '#0a2a3a'); bg.addColorStop(0.5, last ? '#140204' : '#040e18'); bg.addColorStop(1, '#000');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save(); g.translate(480, 270);
    // 高速トンネルリング
    for (let k = 0; k < 18; k++) {
      const z = (k + (t * 2.4) % 1) / 18, s2 = Math.pow(z, 3);
      const r = 20 + 900 * s2;
      g.strokeStyle = k % 3 === 0 ? (last ? `rgba(255,80,60,${s2})` : `rgba(255,60,80,${s2 * 0.9})`) : `rgba(80,220,255,${s2 * 0.8})`;
      g.lineWidth = 1 + 10 * s2;
      g.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (i * TAU) / 6 + k * 0.1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.62); }
      g.stroke();
    }
    // 光のストリーク
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const a = (i * 2.399) % TAU, z = ((i * 0.137 + t * 1.6) % 1), r0 = 30 + 700 * z * z, r1 = r0 + 40 + 200 * z * z;
      g.strokeStyle = i % 4 ? `rgba(160,240,255,${z})` : `rgba(255,120,120,${z})`; g.lineWidth = 1 + 2 * z;
      g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.62); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.62); g.stroke();
    }
    g.restore();
  };

  BG.sp_connect = (g, t, s) => {
    const prog = (s && s.prog) || 0;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#020a12'); bg.addColorStop(1, '#03141c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // グリッド床
    g.save(); g.strokeStyle = 'rgba(40,220,255,0.18)'; g.lineWidth = 1;
    const vy = 200;
    for (let i = -16; i <= 16; i++) { g.beginPath(); g.moveTo(480, vy); g.lineTo(480 + i * 90, H); g.stroke(); }
    for (let k = 0; k < 16; k++) { const z = (k + (t * 0.6) % 1) / 16, y = vy + (H - vy) * z * z; g.globalAlpha = z; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.restore();
    // ケーブル（中央ソケットへ収束）
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const sx = (i / 13) * W, sy = i % 2 ? H + 20 : -20;
      g.strokeStyle = `rgba(40,200,255,0.25)`; g.lineWidth = 3;
      g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx, 270, 480 + (sx - 480) * 0.3, 270, 480, 260); g.stroke();
      // データパケット
      const u = (t * 0.8 + i * 0.13) % 1;
      const bx = (1 - u) ** 3 * sx + 3 * (1 - u) ** 2 * u * sx + 3 * (1 - u) * u * u * (480 + (sx - 480) * 0.3) + u ** 3 * 480;
      const by = (1 - u) ** 3 * sy + 3 * (1 - u) ** 2 * u * 270 + 3 * (1 - u) * u * u * 270 + u ** 3 * 260;
      g.fillStyle = '#bff6ff'; g.beginPath(); g.arc(bx, by, 3, 0, TAU); g.fill();
    }
    g.restore();
    // ソケット
    g.save(); g.translate(480, 260);
    const rr = 70 + prog * 30;
    g.fillStyle = '#05080a'; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
    g.lineWidth = 6; g.strokeStyle = Mat.chrome(g, 0, -rr, 0, rr); g.stroke();
    g.rotate(t * 0.8); g.strokeStyle = `rgba(80,230,255,${0.4 + 0.6 * prog})`; g.lineWidth = 4;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(0, 0, rr - 14, (k * TAU) / 6, (k * TAU) / 6 + 0.6); g.stroke(); }
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, rr - 20); cg.addColorStop(0, `rgba(200,250,255,${0.2 + 0.8 * prog})`); cg.addColorStop(1, 'rgba(0,80,120,0)');
    g.fillStyle = cg; g.beginPath(); g.arc(0, 0, rr - 20, 0, TAU); g.fill();
    g.restore();
  };

  BG.sp_control = (g, t, s) => {
    const p = (s && s.pressure) || 0.5, alarm = (s && s.alarm) || 0;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#120708'); bg.addColorStop(0.6, '#1e0c0c'); bg.addColorStop(1, '#060203');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 制御棒（上から挿入）
    for (let i = 0; i < 7; i++) {
      const x = 140 + i * 113, ins = (s && s.rods != null ? s.rods : 0.3) * (0.8 + 0.2 * Math.sin(i * 1.7));
      const y1 = 40 + ins * 300;
      g.fillStyle = Mat.chrome(g, x - 14, 0, x + 14, 0); g.fillRect(x - 12, -10, 24, y1);
      g.fillStyle = 'rgba(0,0,0,0.6)'; for (let y = 0; y < y1; y += 26) g.fillRect(x - 12, y, 24, 3);
      g.fillStyle = `rgba(255,60,40,${0.4 + 0.4 * Math.sin(t * 8 + i)})`; g.fillRect(x - 12, y1 - 8, 24, 8);
    }
    // 巨大圧力計
    g.save(); g.translate(480, 400);
    g.fillStyle = '#0a0607'; g.beginPath(); g.arc(0, 0, 170, Math.PI, TAU); g.closePath(); g.fill();
    g.lineWidth = 6; g.strokeStyle = Mat.chrome(g, 0, -170, 0, 0); g.beginPath(); g.arc(0, 0, 170, Math.PI, TAU); g.stroke();
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI; const red = i > 14;
      g.strokeStyle = red ? '#ff3a2a' : '#cfd8e0'; g.lineWidth = i % 5 ? 2 : 4;
      g.beginPath(); g.moveTo(Math.cos(a) * 150, Math.sin(a) * 150); g.lineTo(Math.cos(a) * (i % 5 ? 136 : 124), Math.sin(a) * (i % 5 ? 136 : 124)); g.stroke();
    }
    g.fillStyle = 'rgba(255,40,30,0.25)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 150, Math.PI * 1.7, TAU); g.closePath(); g.fill();
    const na = Math.PI + E.clamp(p + Math.sin(t * 23) * 0.012 * (1 + alarm * 3), 0, 1) * Math.PI;
    g.strokeStyle = '#ffeedd'; g.lineWidth = 5; g.shadowColor = '#ff4030'; g.shadowBlur = 12;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(na) * 140, Math.sin(na) * 140); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = Mat.chrome(g, 0, -14, 0, 14); g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
    g.restore();
    bigText(g, 'PRESSURE', 480, 492, 18, 'white', { font: EN, glow: 0 });
    // 警報ストロボ
    if (alarm > 0) { g.fillStyle = `rgba(255,0,0,${alarm * (Math.floor(t * 8) % 2 ? 0.22 : 0.04)})`; g.fillRect(0, 0, W, H); }
  };

  BG.sp_awaken = (g, t, s) => {
    const depth = (s && s.depth) || 0, core = (s && s.core) || 0;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // 縦坑（下へ降下）
    g.save(); g.translate(480, 270);
    const sp = 0.6 + depth * 2.5;
    for (let k = 0; k < 20; k++) {
      const z = (k + (t * sp) % 1) / 20, s2 = Math.pow(z, 2.6);
      const r = 10 + 760 * s2;
      g.strokeStyle = `rgba(${120 + 100 * core},${60 + 80 * (1 - core)},${200 - 120 * core},${s2 * 0.8})`; g.lineWidth = 2 + 14 * s2;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      if (k % 2) { g.strokeStyle = `rgba(255,255,255,${s2 * 0.3})`; g.lineWidth = 1; for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8 + k; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); } }
    }
    // 巨大コア
    if (core > 0) {
      const R = 30 + core * 210;
      const cg = g.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
      cg.addColorStop(0, '#fff'); cg.addColorStop(0.2, '#ff9a5a'); cg.addColorStop(0.6, '#a01020'); cg.addColorStop(1, '#200006');
      g.fillStyle = cg; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      // 亀裂から漏れる光
      g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip(); g.globalCompositeOperation = 'lighter';
      const rng = new NB.RNG(42);
      for (let i = 0; i < 16; i++) {
        let x = rng.range(-R, R) * 0.6, y = rng.range(-R, R) * 0.6; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += rng.range(-1, 1) * R * 0.25; y += rng.range(-1, 1) * R * 0.25; g.lineTo(x, y); }
        g.strokeStyle = `rgba(255,${200 + 55 * Math.sin(t * 5 + i)},120,${0.4 + 0.5 * core})`; g.lineWidth = 2 + 3 * core; g.stroke();
      }
      g.restore();
      g.globalCompositeOperation = 'lighter';
      const hg = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.8); hg.addColorStop(0, `rgba(255,80,40,${0.4 * core})`); hg.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(0, 0, R * 1.8, 0, TAU); g.fill();
    }
    g.restore();
  };

  BG.black = (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); };

  BG.bighit = (g, t, s) => {
    const rush = s && s.rush;
    const bg = g.createRadialGradient(480, 270, 20, 480, 270, 600);
    bg.addColorStop(0, rush ? '#fff4c0' : '#fff0b0'); bg.addColorStop(0.3, rush ? '#ff7a2a' : '#d89a20'); bg.addColorStop(1, '#2a0800');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save(); g.translate(480, 270); g.rotate(t * 0.3); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) { g.rotate(TAU / 24); g.fillStyle = i % 2 ? 'rgba(255,255,220,0.12)' : 'rgba(255,200,80,0.08)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -800); g.lineTo(60, -800); g.closePath(); g.fill(); }
    g.restore();
  };

  BG.round = (g, t, s) => {
    const rush = s && s.rush;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, rush ? '#1a0408' : '#06121c'); bg.addColorStop(1, '#000');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // エネルギー柱
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const x = 40 + i * 80 + Math.sin(t * 0.7 + i) * 10, h = 200 + 140 * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.8));
      const gr = g.createLinearGradient(0, H, 0, H - h); gr.addColorStop(0, rush ? 'rgba(255,60,80,0.4)' : 'rgba(60,200,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - 18, H - h, 36, h);
    }
    g.restore();
    BG.core(g, t * 1.5, s); g.fillStyle = rush ? 'rgba(80,0,10,0.45)' : 'rgba(0,10,20,0.45)'; g.fillRect(0, 0, W, H);
  };

  BG.judge = (g, t, s) => {
    const ch = (s && s.charge) || 0;
    BG.sp_awaken(g, t, { depth: 0.2 + ch, core: 0.15 + ch * 0.5 });
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, W, H);
  };

  BG.result = (g, t, s) => {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a0e14'); bg.addColorStop(1, '#000');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    persp(g, 480, 220, t, 'rgba(255,200,120,0.07)', 0.05);
  };

  BG.title = (g, t, s) => {
    BG.core(g, t * 0.5, s);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
  };

  // ------------------------------------------------------------------ エフェクト
  const FX = {};
  FX.flash = (g, p, o) => { g.fillStyle = `rgba(${o.color || '255,255,255'},${(1 - p) ** 2 * (o.a ?? 1)})`; g.fillRect(0, 0, W, H); };
  FX.fade = (g, p, o) => { g.fillStyle = `rgba(${o.color || '0,0,0'},${o.out ? 1 - p : p})`; g.fillRect(0, 0, W, H); };
  FX.blackout = (g, p, o) => { g.fillStyle = '#000'; g.globalAlpha = Math.min(1, p * (o.speed || 20)); g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
  FX.shock = (g, p, o) => {
    const x = o.x ?? 480, y = o.y ?? 270, R = (o.r || 700) * E.easeOutCubic(p);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = o.color || 'rgba(160,240,255,1)'; g.globalAlpha = (1 - p) * 0.9; g.lineWidth = 30 * (1 - p) + 2;
    g.beginPath(); g.ellipse(x, y, R, R * (o.flat || 0.62), 0, 0, TAU); g.stroke();
    g.lineWidth = 4; g.globalAlpha = (1 - p); g.strokeStyle = '#fff'; g.beginPath(); g.ellipse(x, y, R * 0.92, R * 0.92 * (o.flat || 0.62), 0, 0, TAU); g.stroke();
    g.restore();
  };
  FX.lines = (g, p, o, t) => { // 集中線
    g.save(); g.translate(480, 270); g.globalAlpha = (o.a ?? 0.6) * Math.min(1, p * 6) * Math.min(1, (1 - p) * 4);
    const rng = new NB.RNG(Math.floor(t * 30));
    g.fillStyle = o.color || '#fff';
    for (let i = 0; i < 70; i++) { const a = rng.next() * TAU, r0 = 180 + rng.next() * 160, w = 0.004 + rng.next() * 0.012; g.beginPath(); g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0); g.lineTo(Math.cos(a) * 900, Math.sin(a) * 900); g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0); g.fill(); }
    g.restore();
  };
  FX.glitch = (g, p, o, t, src) => {
    if (!src) return; const rng = new NB.RNG(Math.floor(t * 40));
    for (let i = 0; i < 8; i++) { const y = rng.int(H), h = 4 + rng.int(30), dx = (rng.next() - 0.5) * 60 * (1 - p); g.drawImage(src, 0, y, W, h, dx, y, W, h); }
    g.fillStyle = `rgba(255,0,60,${0.08 * (1 - p)})`; g.fillRect(0, 0, W, H);
  };
  FX.vignette = (g, p, o) => {
    const k = (o.a ?? 0.7) * Math.min(1, p * 5) * Math.min(1, (1 - p) * 5);
    const gr = g.createRadialGradient(480, 270, 200, 480, 270, 600); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(${o.color || '160,0,0'},${k})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  };
  FX.text = (g, p, o, t) => {
    const inn = E.easeOutBack(Math.min(1, p * (o.inSpeed || 6))), out = p > 0.85 ? (1 - p) / 0.15 : 1;
    g.save(); g.globalAlpha = out; g.translate(o.x ?? 480, o.y ?? 270); g.scale(o.noScale ? 1 : 0.6 + 0.4 * inn, o.noScale ? 1 : 0.6 + 0.4 * inn);
    bigText(g, o.text, 0, 0, o.size || 80, o.style || 'chrome', { font: o.font, t, skew: o.skew, track: o.track });
    if (o.sub) bigText(g, o.sub, 0, (o.size || 80) * 0.75, (o.size || 80) * 0.32, o.subStyle || 'white', { font: o.subFont || EN, glow: 0.5, t });
    g.restore();
  };
  FX.reach = (g, p, o, t) => { // 「リーチ」スラム
    const inn = Math.min(1, p * 5), sc = 2.6 - 1.6 * E.easeOutCubic(inn);
    const out = p > 0.8 ? (1 - p) / 0.2 : 1;
    g.save(); g.globalAlpha = out * inn; g.translate(480, 268); g.scale(sc, sc); g.rotate(-0.06);
    bigText(g, 'リーチ', 0, 0, 120, o.style || 'red', { t, skew: -0.15 });
    g.restore();
    if (p < 0.25) FX.flash(g, p * 4, { a: 0.5, color: o.style === 'gold' ? '255,210,80' : '255,60,60' });
  };
  FX.telop = (g, p, o, t) => { // テロップ（色でチャンスアップ）
    const style = o.style || 'white';
    const col = { white: '200,210,220', blue: '60,140,255', green: '60,255,110', red: '255,50,50', gold: '255,190,40', rainbow: '255,255,255' }[style];
    const inn = E.easeOutCubic(Math.min(1, p * 5)), out = p > 0.88 ? (1 - p) / 0.12 : 1;
    const y = o.y || 448;
    g.save(); g.globalAlpha = out;
    const w = 760 * inn;
    const gr = g.createLinearGradient(480 - w / 2, 0, 480 + w / 2, 0);
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.15, `rgba(${col},0.55)`); gr.addColorStop(0.5, `rgba(0,0,0,0.85)`); gr.addColorStop(0.85, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`);
    if (style === 'rainbow') { for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsla(${(i * 60 + t * 200) % 360},100%,55%,0.7)`); }
    g.fillStyle = gr; g.fillRect(480 - w / 2, y - 34, w, 68);
    g.fillStyle = `rgba(${col},0.9)`; g.fillRect(480 - w / 2, y - 36, w, 2); g.fillRect(480 - w / 2, y + 34, w, 2);
    bigText(g, o.text, 480, y, o.size || 40, style === 'white' ? 'chrome' : style, { t });
    g.restore();
  };
  FX.title = (g, p, o, t, src, assets) => { // SPリーチタイトル
    const inn = E.easeOutExpo(Math.min(1, p * 3)), out = p > 0.82 ? 1 - (p - 0.82) / 0.18 : 1;
    g.save(); g.globalAlpha = out;
    const img = assets && assets.get(o.asset);
    const slab = 1 - inn;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 190 - 80 * inn, W, 160 * inn);
    g.fillStyle = o.color || '#30d8ff'; g.fillRect(0, 190 - 80 * inn, W, 3); g.fillRect(0, 190 + 80 * inn - 3, W, 3);
    g.translate(slab * -600, 0);
    if (img) g.drawImage(img, 130, 90, 700, 200);
    else {
      bigText(g, o.text, 480, 178, o.size || 84, o.style || 'chrome', { t, track: 6 });
      bigText(g, o.sub || '', 480, 240, 22, 'white', { font: EN, glow: 0.3, track: 10 });
    }
    g.restore();
  };
  FX.cutin = (g, p, o, t) => { // 斜めカットイン
    const style = o.style || 'red';
    const col = { blue: '#2a7aff', green: '#2aff6a', red: '#ff2a3a', gold: '#ffc020', rainbow: '#ffffff' }[style] || '#ff2a3a';
    const inn = E.easeOutExpo(Math.min(1, p * 4)), out = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
    g.save(); g.globalAlpha = out;
    g.translate(480, 270); g.rotate(-0.18);
    const w = 1300 * inn;
    g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(-w / 2, -80, w, 160);
    g.fillStyle = style === 'rainbow' ? `hsl(${(t * 300) % 360},100%,60%)` : col; g.fillRect(-w / 2, -86, w, 8); g.fillRect(-w / 2, 78, w, 8);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const x = ((i * 97 + t * 1800) % 1400) - 700; g.fillStyle = `rgba(255,255,255,${0.06 + (i % 3) * 0.04})`; g.fillRect(x, -70 + (i * 13) % 140, 120, 2); }
    g.globalCompositeOperation = 'source-over';
    bigText(g, o.text, 0, 0, o.size || 92, style, { t, skew: -0.2 });
    g.restore();
  };
  FX.button = (g, p, o, t) => { // ボタン煽り
    const big = o.big, inn = E.easeOutBack(Math.min(1, p * 8));
    g.save(); g.translate(480, o.y || 300); g.scale(inn, inn);
    const R = big ? 120 : 82, k = 0.5 + 0.5 * Math.sin(t * 18);
    g.globalCompositeOperation = 'lighter';
    const hg = g.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 2.2); hg.addColorStop(0, `rgba(255,40,40,${0.3 + 0.3 * k})`); hg.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, R * 2.2, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    // ボタン型（ドーム）
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(0, R * 0.25, R * 1.12, R * 0.6, 0, 0, TAU); g.fill();
    g.fillStyle = Mat.chrome(g, 0, -R * 0.2, 0, R * 0.8); g.beginPath(); g.ellipse(0, R * 0.2, R * 1.05, R * 0.52, 0, 0, TAU); g.fill();
    const dg = g.createRadialGradient(-R * 0.3, -R * 0.5, 4, 0, -R * 0.1, R); dg.addColorStop(0, '#fff'); dg.addColorStop(0.25, o.color || '#ff3040'); dg.addColorStop(1, '#300006');
    g.fillStyle = dg; g.beginPath(); g.ellipse(0, -R * 0.05, R * 0.88, R * 0.62, 0, Math.PI, TAU); g.ellipse(0, -R * 0.05, R * 0.88, R * 0.28, 0, 0, Math.PI); g.fill();
    g.restore();
    bigText(g, o.text || 'PUSH!', 480, (o.y || 300) + (big ? 150 : 110), big ? 64 : 48, o.style || 'red', { font: EN, t });
    // 残り時間ゲージ
    if (o.gauge !== false) { const w = 360; g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(480 - w / 2, 500, w, 10); g.fillStyle = '#ff4030'; g.fillRect(480 - w / 2, 500, w * (1 - p), 10); }
  };
  FX.gauge = (g, p, o, t) => {
    const v = o.get ? o.get() : p, w = 520, x = 480 - w / 2, y = o.y || 470;
    g.save(); g.fillStyle = 'rgba(0,0,0,0.75)'; Mat.roundRect(g, x - 6, y - 22, w + 12, 44, 6); g.fill();
    g.strokeStyle = o.color || '#30d8ff'; g.lineWidth = 2; g.stroke();
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, o.color || '#30d8ff'); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr; g.fillRect(x, y - 10, w * E.clamp(v, 0, 1), 20);
    for (let i = 1; i < 10; i++) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + (w * i) / 10, y - 10, 2, 20); }
    bigText(g, `${o.label || 'SYNC'} ${Math.floor(E.clamp(v, 0, 1) * 100)}%`, 480, y - 40, 26, 'cyan', { font: EN, glow: 0.6 });
    g.restore();
  };
  FX.giji = (g, p, o, t) => {
    const n = o.n || 2, inn = Math.min(1, p * 6), sc = 2 - E.easeOutBack(inn);
    const out = p > 0.75 ? (1 - p) / 0.25 : 1;
    g.save(); g.globalAlpha = out; g.translate(480, 262); g.scale(sc, sc);
    bigText(g, 'CONNECT', 0, -54, 34, 'cyan', { font: EN, track: 8 });
    bigText(g, '×' + n, 0, 20, 130, n >= 4 ? 'rainbow' : n === 3 ? 'red' : 'cyan', { font: EN, t });
    g.restore();
  };
  FX.zone = (g, p, o, t) => {
    const out = p > 0.8 ? (1 - p) / 0.2 : 1, inn = Math.min(1, p * 4);
    g.save(); g.globalAlpha = out;
    g.fillStyle = `rgba(120,0,0,${0.5 * inn})`; g.fillRect(0, 210, W, 120);
    for (let x = -80 + ((t * 200) % 80); x < W; x += 80) { g.fillStyle = 'rgba(255,170,20,0.4)'; g.beginPath(); g.moveTo(x, 210); g.lineTo(x + 40, 210); g.lineTo(x, 226); g.lineTo(x - 40, 226); g.fill(); g.beginPath(); g.moveTo(x, 314); g.lineTo(x + 40, 314); g.lineTo(x, 330); g.lineTo(x - 40, 330); g.fill(); }
    bigText(g, o.text || '警戒区域 突入', 480, 270, 70, 'red', { t });
    g.restore();
  };
  FX.yokoku = (g, p, o, t) => {
    const k = Math.min(1, p * 8) * (p > 0.7 ? (1 - p) / 0.3 : 1);
    g.save(); g.globalAlpha = k;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 30, W, 50);
    bigText(g, o.text || '!! ANOMALY DETECTED !!', 480 + (Math.random() - 0.5) * 6 * (1 - p), 55, 30, o.style || 'red', { font: EN, track: 4, t });
    g.restore();
  };
  FX.iris = (g, p, o) => { // シャッター遷移（閉→開）
    const c = p < 0.5 ? E.easeInCubic(p * 2) : 1 - E.easeOutCubic((p - 0.5) * 2);
    g.save(); g.fillStyle = '#000';
    const h = 270 * c; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h);
    g.fillStyle = o.color || '#30d8ff'; if (c > 0.02) { g.fillRect(0, h - 3, W, 3); g.fillRect(0, H - h, W, 3); }
    g.restore();
  };
  FX.confirm = (g, p, o, t, src, assets) => { // 大当たり確定ロゴ
    const inn = E.easeOutBack(Math.min(1, p * 3));
    g.save(); g.translate(480, 230); g.scale(inn, inn);
    g.globalCompositeOperation = 'lighter';
    const hg = g.createRadialGradient(0, 0, 40, 0, 0, 500); hg.addColorStop(0, 'rgba(255,240,180,0.6)'); hg.addColorStop(1, 'rgba(255,160,0,0)');
    g.fillStyle = hg; g.fillRect(-500, -300, 1000, 600);
    g.globalCompositeOperation = 'source-over';
    const img = assets && assets.get('logo_title');
    if (o.rush) bigText(g, 'ABYSS BREAK', 0, -20, 96, 'rainbow', { font: EN, t, track: 4 });
    else if (img) g.drawImage(img, -320, -110, 640, 220);
    else bigText(g, 'ABYSS RELEASE', 0, -20, 92, 'gold', { font: EN, t, track: 4 });
    bigText(g, o.sub || '大当たり', 0, 70, 64, o.rush ? 'red' : 'gold', { t });
    g.restore();
  };
  FX.rushLogo = (g, p, o, t, src, assets) => {
    const inn = E.easeOutExpo(Math.min(1, p * 2.5)), out = p > 0.85 ? (1 - p) / 0.15 : 1;
    g.save(); g.globalAlpha = out; g.translate(480, 250); g.scale(0.4 + 0.6 * inn, 0.4 + 0.6 * inn);
    const img = assets && assets.get('logo_rush');
    if (img) g.drawImage(img, -320, -120, 640, 240);
    else { bigText(g, '深淵RUSH', 0, -10, 128, 'red', { t, skew: -0.12 }); bigText(g, 'ABYSS RUSH  ·  ST 31', 0, 80, 30, 'cyan', { font: EN, track: 10 }); }
    g.restore();
  };
  FX.overdrive = (g, p, o, t, src, assets) => {
    const inn = E.easeOutExpo(Math.min(1, p * 2));
    g.save(); g.translate(480, 260 + Math.sin(t * 60) * 3 * (1 - p)); g.scale(0.3 + 0.7 * inn, 0.3 + 0.7 * inn);
    const img = assets && assets.get('logo_overdrive');
    if (img) g.drawImage(img, -380, -110, 760, 220);
    else { bigText(g, 'ABYSS', 0, -56, 120, 'rainbow', { font: EN, t, track: 14 }); bigText(g, 'OVERDRIVE', 0, 56, 96, 'rainbow', { font: EN, t, track: 10 }); }
    g.restore();
  };
  FX.letterbox = (g, p, o) => { const h = (o.h || 60) * Math.min(1, p * 6) * (o.hold ? 1 : Math.min(1, (1 - p) * 6)); g.fillStyle = '#000'; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h); };
  FX.result = (g, p, o, t) => { // RUSH リザルト
    const inn = E.easeOutCubic(Math.min(1, p * 3));
    g.save(); g.globalAlpha = inn;
    g.fillStyle = 'rgba(0,0,0,0.6)'; Mat.roundRect(g, 160, 70, 640, 400, 14); g.fill();
    g.strokeStyle = 'rgba(255,200,120,0.6)'; g.lineWidth = 2; g.stroke();
    bigText(g, o.title || '深淵RUSH 終了', 480, 120, 54, 'chrome', { t });
    bigText(g, 'TOTAL CHAIN', 330, 220, 24, 'white', { font: EN, glow: 0 });
    bigText(g, `${o.chain}連`, 610, 220, 70, 'gold', { t });
    bigText(g, 'TOTAL BALLS', 330, 320, 24, 'white', { font: EN, glow: 0 });
    const v = Math.floor((o.balls || 0) * Math.min(1, p * 1.6));
    bigText(g, `${v.toLocaleString()}玉`, 610, 320, 64, 'gold', { t });
    if (p > 0.6) bigText(g, '左打ちに戻してください', 480, 420, 30, 'cyan', { glow: 0.4 });
    g.restore();
  };

  // ------------------------------------------------------------------ パーティクル
  class Particles {
    constructor(n = 600) { this.p = []; for (let i = 0; i < n; i++) this.p.push({ alive: false }); }
    emit(o) {
      const cnt = o.n || 20;
      for (let i = 0, k = 0; i < this.p.length && k < cnt; i++) {
        const q = this.p[i]; if (q.alive) continue; k++;
        const a = (o.angle ?? Math.random() * TAU) + (Math.random() - 0.5) * (o.spread ?? TAU);
        const sp = (o.speed || 300) * (0.3 + Math.random() * 0.9);
        Object.assign(q, { alive: true, x: o.x ?? 480, y: o.y ?? 270, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: (o.life || 1) * (0.5 + Math.random() * 0.8), size: (o.size || 3) * (0.5 + Math.random()), color: o.color || '180,240,255', type: o.type || 'spark', g: o.gravity ?? 0, drag: o.drag ?? 1.5 });
      }
    }
    update(dt) {
      for (const q of this.p) {
        if (!q.alive) continue;
        q.life += dt; if (q.life > q.max) { q.alive = false; continue; }
        q.vy += q.g * dt; const d = Math.exp(-q.drag * dt); q.vx *= d; q.vy *= d;
        q.x += q.vx * dt; q.y += q.vy * dt;
      }
    }
    draw(g) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const q of this.p) {
        if (!q.alive) continue;
        const k = 1 - q.life / q.max;
        if (q.type === 'spark') { g.strokeStyle = `rgba(${q.color},${k})`; g.lineWidth = q.size * 0.6; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); g.stroke(); }
        else { const r = q.size * (1 + (1 - k) * 2); const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 3); gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(0.3, `rgba(${q.color},${k * 0.6})`); gr.addColorStop(1, `rgba(${q.color},0)`); g.fillStyle = gr; g.fillRect(q.x - r * 3, q.y - r * 3, r * 6, r * 6); }
      }
      g.restore();
    }
  }

  // ------------------------------------------------------------------ LCD 本体
  class LCD {
    constructor(assets) {
      this.assets = assets;
      this.canvas = NB.makeCanvas(W, H); this.g = this.canvas.getContext('2d');
      this.buf = NB.makeCanvas(W, H); // glitch 用
      this.reels = new NB.ReelSet(assets);
      this.particles = new Particles();
      this.bg = 'lab'; this.bgPrev = null; this.bgFade = 1; this.bgParams = {};
      this.fxList = [];
      this.cam = { zoom: 1, x: 0, y: 0, rot: 0, shake: 0 };
      this.camTween = null;
      this.t = 0;
      this.hud = { holds: [], active: null, mode: 'normal', st: null, round: null, payout: null, rightShoot: false, chain: 0, label: '' };
      this.dark = 0;      // 背景減光
      this.freeze = 0;    // フリーズ（描画更新停止）
    }
    setBG(name, fade = 0.5, params) {
      if (name === this.bg) { if (params) Object.assign(this.bgParams, params); return; }
      this.bgPrev = this.bg; this.bg = name; this.bgFade = fade > 0 ? 0 : 1; this.bgFadeDur = fade;
      this.bgParams = params || {};
      const v = this.assets.get('bg_' + name); if (v && v.play) { v.currentTime = 0; v.play().catch(() => {}); }
    }
    fx(name, dur, opts = {}) { const f = { name, t0: this.t, dur, o: opts }; this.fxList.push(f); return f; }
    clearFx(filter) { this.fxList = filter ? this.fxList.filter((f) => !filter(f)) : []; }
    camTo(c, dur, ease = 'easeInOutCubic') { this.camTween = { from: { ...this.cam }, to: c, t: 0, dur, ease }; }
    shake(a) { this.cam.shake = Math.max(this.cam.shake, a); }
    burst(o) { this.particles.emit(o); }

    update(dt) {
      if (this.freeze > 0) { this.freeze -= dt; return; }
      this.t += dt;
      this.reels.update(dt);
      this.particles.update(dt);
      if (this.bgFade < 1) this.bgFade = Math.min(1, this.bgFade + dt / Math.max(0.01, this.bgFadeDur));
      if (this.camTween) {
        const c = this.camTween; c.t += dt; const u = (E[c.ease] || E.smooth)(Math.min(1, c.t / c.dur));
        for (const k in c.to) this.cam[k] = E.lerp(c.from[k], c.to[k], u);
        if (c.t >= c.dur) this.camTween = null;
      }
      this.cam.shake *= Math.pow(0.02, dt);
      this.fxList = this.fxList.filter((f) => this.t - f.t0 < f.dur || f.dur < 0);
    }

    drawBG(g, name, t, params) {
      const v = this.assets.get('bg_' + name);
      if (v && v.readyState >= 2) { g.drawImage(v, 0, 0, W, H); return; }
      (BG[name] || BG.black)(g, t, params || this.bgParams);
    }

    render() {
      if (this.freeze > 0) return this.canvas; // フリーズ中は前フレームを保持
      const g = this.g, t = this.t, c = this.cam;
      g.save();
      // カメラ
      const sx = (Math.random() - 0.5) * c.shake, sy = (Math.random() - 0.5) * c.shake;
      g.translate(W / 2 + c.x + sx, H / 2 + c.y + sy); g.rotate(c.rot); g.scale(c.zoom, c.zoom); g.translate(-W / 2, -H / 2);
      if (this.bgFade < 1 && this.bgPrev) { this.drawBG(g, this.bgPrev, t, this.bgParams); g.globalAlpha = this.bgFade; }
      this.drawBG(g, this.bg, t, this.bgParams);
      g.globalAlpha = 1;
      if (this.dark > 0.01) { g.fillStyle = `rgba(0,0,0,${this.dark})`; g.fillRect(-50, -50, W + 100, H + 100); }
      g.restore();
      // 背景より手前・図柄より奥の FX
      this.drawFx(g, 'back');
      this.reels.draw(g);
      this.particles.draw(g);
      this.drawFx(g, 'mid');
      this.drawHUD(g);
      this.drawFx(g, 'front');
      // glitch 用バッファ
      return this.canvas;
    }

    drawFx(g, layer) {
      for (const f of this.fxList) {
        const L = f.o.layer || (f.name === 'flash' || f.name === 'blackout' || f.name === 'fade' || f.name === 'iris' || f.name === 'glitch' ? 'front' : f.name === 'lines' || f.name === 'vignette' ? 'back' : 'mid');
        if (L !== layer) continue;
        const p = f.dur > 0 ? E.clamp((this.t - f.t0) / f.dur, 0, 1) : 0;
        const fn = FX[f.name] || (f.o.draw ? f.o.draw : null);
        if (!fn) continue;
        g.save();
        if (f.name === 'glitch') { this.buf.getContext('2d').drawImage(this.canvas, 0, 0); fn(g, p, f.o, this.t, this.buf, this.assets); }
        else fn(g, p, f.o, this.t, null, this.assets);
        g.restore();
      }
    }

    drawHUD(g) {
      const h = this.hud, t = this.t;
      if (h.hidden) return;
      // ---- 保留（エネルギーカプセル）
      if (!h.hideHolds) {
        const baseX = 330, y = 500;
        // 当該（消化中）
        g.save();
        g.fillStyle = 'rgba(0,0,0,0.5)'; Mat.roundRect(g, baseX - 92, y - 30, 380, 60, 30); g.fill();
        g.strokeStyle = 'rgba(120,220,255,0.25)'; g.lineWidth = 1; g.stroke();
        // 当該ソケット
        g.strokeStyle = 'rgba(200,240,255,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(baseX - 58, y, 24, 0, TAU); g.stroke();
        if (h.active) this.drawHold(g, h.active, baseX - 58, y, 58, t);
        for (let i = 0; i < 4; i++) {
          const x = baseX + i * 62, it = h.holds[i];
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
          if (it) this.drawHold(g, it, x + (it.slide || 0), y, 50, t);
        }
        g.restore();
      }
      // ---- ST 残り回数
      if (h.st != null) {
        g.save();
        const last = h.st <= 3;
        g.fillStyle = 'rgba(0,0,0,0.6)'; Mat.chamferRect(g, 760, 14, 186, 78, 10); g.fill();
        g.strokeStyle = last ? '#ff3a3a' : '#30d8ff'; g.lineWidth = 2; g.stroke();
        bigText(g, '残り', 800, 54, 22, 'white', { glow: 0 });
        bigText(g, String(h.st), 880, 52, 52, last ? 'red' : 'cyan', { font: EN, t });
        bigText(g, 'ABYSS RUSH', 853, 84, 12, 'white', { font: EN, glow: 0, track: 3 });
        if (h.chain) { g.fillStyle = 'rgba(0,0,0,0.6)'; Mat.chamferRect(g, 14, 14, 150, 56, 8); g.fill(); bigText(g, `${h.chain}連`, 89, 44, 36, 'gold', { t }); }
        g.restore();
      }
      // ---- ラウンド
      if (h.round) {
        g.save();
        g.fillStyle = 'rgba(0,0,0,0.55)'; Mat.chamferRect(g, 20, 16, 300, 64, 10); g.fill();
        g.strokeStyle = h.mode === 'rush' ? '#ff4040' : '#ffc040'; g.lineWidth = 2; g.stroke();
        bigText(g, `ROUND ${h.round.n}/${h.round.total}`, 170, 48, 34, 'gold', { font: EN, t });
        g.restore();
      }
      if (h.payout != null) {
        g.save(); g.fillStyle = 'rgba(0,0,0,0.55)'; Mat.chamferRect(g, 640, 16, 300, 64, 10); g.fill();
        bigText(g, `${Math.floor(h.payout).toLocaleString()} 玉`, 790, 48, 38, 'gold', { t });
        g.restore();
      }
      // ---- 右打ち指示
      if (h.rightShoot) {
        const k = Math.floor(t * 3) % 2;
        g.save(); g.translate(860, 270);
        g.fillStyle = k ? 'rgba(255,40,40,0.9)' : 'rgba(120,0,0,0.9)';
        g.beginPath(); g.moveTo(-40, -30); g.lineTo(10, -30); g.lineTo(10, -54); g.lineTo(60, 0); g.lineTo(10, 54); g.lineTo(10, 30); g.lineTo(-40, 30); g.closePath(); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        bigText(g, '右打ち', 0, 76, 26, 'white', { glow: 0.5 });
        g.restore();
      }
      if (h.label) bigText(g, h.label, 480, 24, 18, 'white', { glow: 0 });
    }

    drawHold(g, it, x, y, size, t) {
      const kind = it.color || 'normal';
      const img = this.assets.image('hold_' + kind);
      if (!img) return;
      g.save(); g.translate(x, y);
      const bob = Math.sin(t * 2 + (it.id || 0)) * 2;
      g.translate(0, bob);
      if (it.pop) { const k = it.pop; g.scale(1 + k * 0.5, 1 + k * 0.5); it.pop *= 0.9; if (it.pop < 0.01) it.pop = 0; }
      if (kind === 'rainbow') g.rotate(Math.sin(t * 3) * 0.15);
      g.drawImage(img, -size / 2, -size / 2, size, size);
      if (kind === 'rainbow' || kind === 'gold') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3 + 0.3 * Math.sin(t * 8); g.drawImage(img, -size / 2, -size / 2, size, size); }
      g.restore();
    }
  }

  LCD.W = W; LCD.H = H; LCD.BG = BG; LCD.FX = FX;
  NB.LCD = LCD;
  NB.bigText = bigText;
})(globalThis.NB);
