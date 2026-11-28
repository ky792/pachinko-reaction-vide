/*
 * 仮素材ジェネレーター（プロシージャル）
 * 外部 PNG が未配置の場合に、図柄・保留・玉などを Canvas で生成して AssetManager に登録する。
 * 最終素材は docs/ASSET_LIST.md の仕様で制作し assets/ に置けば自動で差し替わる。
 */
(function (NB) {
  'use strict';
  const TAU = Math.PI * 2;

  // 図柄グリフ（オリジナル：面取りした工業系ステンシル字形, 100x150 グリッド）
  const GLYPH = {
    1: 'M30 34 L56 12 L56 138 M28 138 L84 138',
    2: 'M18 42 L18 28 L34 12 L70 12 L86 28 L86 58 L20 120 L20 138 L88 138',
    3: 'M16 24 L28 12 L72 12 L86 26 L86 58 L70 72 L42 72 M70 72 L86 86 L86 124 L72 138 L28 138 L16 126',
    4: 'M70 138 L70 12 L14 100 L14 106 L92 106',
    5: 'M84 12 L24 12 L20 68 L34 62 L70 62 L86 78 L86 122 L70 138 L30 138 L16 126',
    6: 'M80 18 L66 12 L36 12 L18 30 L18 120 L34 138 L70 138 L86 122 L86 88 L70 72 L34 72 L18 88',
    7: 'M12 14 L90 14 L90 28 L46 138 M32 78 L78 78',
    8: 'M34 72 L20 58 L20 26 L34 12 L68 12 L82 26 L82 58 L68 72 Z M34 72 L68 72 L86 90 L86 122 L70 138 L32 138 L16 122 L16 90 Z',
    9: 'M22 132 L34 138 L66 138 L84 120 L84 30 L66 12 L32 12 L16 28 L16 62 L32 78 L68 78 L84 62',
  };
  // 図柄ごとのエネルギー色
  const SYMCOL = {
    1: ['#38e8ff', '#0a6c8a'], 2: ['#5fffd2', '#0b6e5c'], 3: ['#5aa8ff', '#163f8f'], 4: ['#b58cff', '#4a2a8c'],
    5: ['#8dff6a', '#2c7a1c'], 6: ['#ffae4a', '#8a4a0a'], 7: ['#ff2a3a', '#7a0010'], 8: ['#ff6ad8', '#7a1460'], 9: ['#e6f6ff', '#5a7488'],
  };

  const Sprites = {
    GLYPH, SYMCOL,

    makeAll(assets) {
      for (let n = 1; n <= 9; n++) {
        const c = this.symbol(n, 220);
        assets.setFallback('symbol_' + n, c);
        assets.setFallback('symbol_blur_' + n, this.blurV(c, 26));
      }
      for (const k of ['normal', 'blue', 'green', 'red', 'gold', 'rainbow']) assets.setFallback('hold_' + k, this.hold(k, 96));
      assets.setFallback('ball', this.ball(32));
      assets.setFallback('ball_ghost', this.ball(32, true));
    },

    /** 立体図柄（金属フレーム＋押し出しグリフ＋発光ライン） */
    symbol(n, size) {
      const c = NB.makeCanvas(size, size), g = c.getContext('2d');
      const [acc, deep] = SYMCOL[n];
      const cx = size / 2, cy = size / 2;
      const is7 = n === 7;
      // --- 背面プレート：機関モジュール（八角リング）
      g.save(); g.translate(cx, cy);
      const R = size * 0.44;
      const oct = (r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * TAU) / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
      g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
      oct(R);
      const pg = g.createLinearGradient(0, -R, 0, R);
      pg.addColorStop(0, '#3a4048'); pg.addColorStop(0.45, '#15181c'); pg.addColorStop(0.55, '#0b0d10'); pg.addColorStop(1, '#2a2f36');
      g.fillStyle = pg; g.fill();
      g.shadowColor = 'transparent';
      g.lineWidth = 3; const eg = g.createLinearGradient(-R, -R, R, R);
      eg.addColorStop(0, '#e8eef4'); eg.addColorStop(0.3, '#5a626c'); eg.addColorStop(0.6, '#c8d0d8'); eg.addColorStop(1, '#30363d');
      g.strokeStyle = eg; g.stroke();
      oct(R - 9); g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.stroke();
      // 内側の発光リング
      g.beginPath(); g.arc(0, 0, R * 0.78, 0, TAU);
      g.strokeStyle = deep; g.lineWidth = 6; g.globalAlpha = 0.9; g.stroke();
      g.strokeStyle = acc; g.lineWidth = 1.5; g.shadowColor = acc; g.shadowBlur = 10; g.stroke();
      g.globalAlpha = 1; g.shadowBlur = 0;
      // リベット
      for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; const x = Math.cos(a) * (R - 5), y = Math.sin(a) * (R - 5); const rg = g.createRadialGradient(x - 1, y - 1, 0, x, y, 3); rg.addColorStop(0, '#fff'); rg.addColorStop(1, '#333'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
      if (is7) { // 7 専用：赤熱コア＋金の放射フィン
        const cg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.8); cg.addColorStop(0, 'rgba(255,90,40,0.85)'); cg.addColorStop(0.5, 'rgba(160,0,20,0.6)'); cg.addColorStop(1, 'rgba(40,0,0,0)');
        g.fillStyle = cg; g.beginPath(); g.arc(0, 0, R * 0.8, 0, TAU); g.fill();
        for (let i = 0; i < 12; i++) {
          g.save(); g.rotate((i * TAU) / 12);
          const fg = g.createLinearGradient(0, -R - 6, 0, -R + 16); fg.addColorStop(0, '#fff3b0'); fg.addColorStop(0.5, '#d49a1c'); fg.addColorStop(1, '#5a3a00');
          g.fillStyle = fg; g.beginPath(); g.moveTo(-5, -R + 10); g.lineTo(0, -R - 8); g.lineTo(5, -R + 10); g.closePath(); g.fill();
          g.restore();
        }
      }
      g.restore();
      // --- グリフ
      const p = new Path2D(GLYPH[n]);
      const gs = size * (is7 ? 0.0052 : 0.0046);
      g.save();
      g.translate(cx - 50 * gs * 100 / 100, cy - 75 * gs);
      g.scale(gs, gs);
      g.lineJoin = 'bevel'; g.lineCap = 'square';
      const W = is7 ? 24 : 21;
      // 影
      g.save(); g.translate(5, 7); g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = W + 10; g.filter = 'blur(3px)'; g.stroke(p); g.restore();
      // 外枠（ガンメタ）
      g.strokeStyle = '#07090b'; g.lineWidth = W + 9; g.stroke(p);
      const og = g.createLinearGradient(0, 0, 100, 150); og.addColorStop(0, '#9aa3ad'); og.addColorStop(0.5, '#2b3036'); og.addColorStop(1, '#6e7782');
      g.strokeStyle = og; g.lineWidth = W + 5; g.stroke(p);
      // 本体（クローム / 7 は金）
      const bg = g.createLinearGradient(0, 0, 0, 150);
      if (is7) { bg.addColorStop(0, '#fffbe0'); bg.addColorStop(0.2, '#ffd65a'); bg.addColorStop(0.48, '#8a5200'); bg.addColorStop(0.52, '#3a1e00'); bg.addColorStop(0.7, '#e9a92a'); bg.addColorStop(1, '#fff0a0'); }
      else { bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.22, '#c9d2dc'); bg.addColorStop(0.47, '#4a5560'); bg.addColorStop(0.53, '#1c2228'); bg.addColorStop(0.75, '#9fb0c0'); bg.addColorStop(1, '#eef4fa'); }
      g.strokeStyle = bg; g.lineWidth = W; g.stroke(p);
      // 発光コア線
      g.shadowColor = acc; g.shadowBlur = 16;
      g.strokeStyle = is7 ? '#ff3020' : acc; g.lineWidth = W * 0.26; g.stroke(p);
      g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = W * 0.08; g.stroke(p);
      // ハイライト
      g.save(); g.translate(-1.5, -2); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = W * 0.18; g.globalCompositeOperation = 'screen'; g.stroke(p); g.restore();
      g.restore();
      return c;
    },

    blurV(src, amount) {
      const c = NB.makeCanvas(src.width, src.height + amount * 2), g = c.getContext('2d');
      const steps = 9;
      for (let i = 0; i < steps; i++) { g.globalAlpha = 0.22; g.drawImage(src, 0, amount + (i / (steps - 1) - 0.5) * amount * 2); }
      return c;
    },

    /** エネルギーカプセル保留 */
    hold(kind, size) {
      const c = NB.makeCanvas(size, size), g = c.getContext('2d');
      const col = { normal: ['#cfd8e0', '#5a6670'], blue: ['#38a8ff', '#0a3a80'], green: ['#44ff88', '#0a6a2a'], red: ['#ff3040', '#6a0010'], gold: ['#ffd84a', '#6a4800'], rainbow: ['#ffffff', '#4a2a8a'] }[kind];
      const s = size / 96;
      g.translate(size / 2, size / 2); g.scale(s, s);
      const big = { normal: 0.82, blue: 0.88, green: 0.9, red: 0.96, gold: 1.0, rainbow: 1.04 }[kind];
      g.scale(big, big);
      // 外部グロー
      const gg = g.createRadialGradient(0, 0, 4, 0, 0, 46); gg.addColorStop(0, col[0] + 'aa'); gg.addColorStop(1, col[0] + '00');
      g.fillStyle = gg; g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.fill();
      if (kind === 'rainbow') { // 結晶型
        const pts = [[0, -40], [18, -16], [16, 22], [0, 40], [-16, 22], [-18, -16]];
        for (let i = 0; i < 6; i++) {
          const a = pts[i], b = pts[(i + 1) % 6];
          g.beginPath(); g.moveTo(0, 0); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath();
          g.fillStyle = `hsl(${i * 60},100%,${55 + (i % 2) * 15}%)`; g.fill();
        }
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(0, -40); g.lineTo(8, -10); g.lineTo(0, 0); g.lineTo(-6, -14); g.closePath(); g.fill();
        return c;
      }
      // カプセル本体（ガラス管）
      const w = 22, h = 30;
      const capsule = () => { g.beginPath(); g.moveTo(-w, -h + w); g.arc(0, -h + w, w, Math.PI, 0); g.lineTo(w, h - w); g.arc(0, h - w, w, 0, Math.PI); g.closePath(); };
      // 内部エネルギー液
      g.save(); capsule(); g.clip();
      const lg = g.createLinearGradient(-w, 0, w, 0); lg.addColorStop(0, col[1]); lg.addColorStop(0.5, col[0]); lg.addColorStop(1, col[1]);
      g.fillStyle = '#05070a'; g.fillRect(-w, -h, w * 2, h * 2);
      g.fillStyle = lg; g.globalAlpha = 0.85; g.fillRect(-w, -h * 0.55, w * 2, h * 1.6); g.globalAlpha = 1;
      const core = g.createRadialGradient(0, 4, 0, 0, 4, 18); core.addColorStop(0, '#ffffff'); core.addColorStop(0.35, col[0]); core.addColorStop(1, col[0] + '00');
      g.fillStyle = core; g.beginPath(); g.arc(0, 4, 18, 0, TAU); g.fill();
      if (kind === 'green') { g.strokeStyle = '#d0ffe0'; g.lineWidth = 1.6; g.beginPath(); for (let y = -24; y <= 24; y += 1) g.lineTo(Math.sin(y * 0.5) * 12, y); g.stroke(); }
      if (kind === 'red') { g.strokeStyle = '#fff0f0'; g.lineWidth = 1.8; g.shadowColor = '#ff0000'; g.shadowBlur = 6; g.beginPath(); g.moveTo(-4, -24); g.lineTo(5, -8); g.lineTo(-6, 2); g.lineTo(6, 14); g.lineTo(-2, 26); g.stroke(); g.shadowBlur = 0; }
      if (kind === 'gold') { for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,220,0.9)'; g.beginPath(); g.arc(-10 + i * 5, 18 - i * 9, 1.6, 0, TAU); g.fill(); } }
      g.restore();
      // ガラス反射
      g.save(); capsule(); g.clip();
      const rg = g.createLinearGradient(-w, 0, w, 0); rg.addColorStop(0, 'rgba(255,255,255,0.0)'); rg.addColorStop(0.18, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.05)'); rg.addColorStop(0.85, 'rgba(255,255,255,0.0)'); rg.addColorStop(0.95, 'rgba(255,255,255,0.25)');
      g.fillStyle = rg; g.fillRect(-w, -h, w * 2, h * 2); g.restore();
      capsule(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(220,240,255,0.6)'; g.stroke();
      // 金属キャップ
      const cap = (y, flip) => {
        const capG = g.createLinearGradient(-w, 0, w, 0);
        if (kind === 'gold') { capG.addColorStop(0, '#5a3a00'); capG.addColorStop(0.35, '#ffe9a0'); capG.addColorStop(0.6, '#b07a10'); capG.addColorStop(1, '#3a2400'); }
        else { capG.addColorStop(0, '#30363c'); capG.addColorStop(0.35, '#e8eef4'); capG.addColorStop(0.6, '#7a848e'); capG.addColorStop(1, '#22272c'); }
        g.fillStyle = capG;
        g.beginPath(); g.rect(-w - 3, y - (flip ? 0 : 9), w * 2 + 6, 9); g.fill();
        g.fillRect(-w + 6, y + (flip ? 9 : -14), w * 2 - 12, 5);
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-w - 3, y + (flip ? 4 : -5), w * 2 + 6, 1.2);
      };
      cap(-h + 4, false); cap(h - 4, true);
      if (kind === 'red' || kind === 'gold') { // 側面フィン
        g.fillStyle = kind === 'gold' ? '#d8a020' : '#8a1018';
        for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * (w + 2), -10); g.lineTo(sx * (w + 11), 0); g.lineTo(sx * (w + 2), 10); g.closePath(); g.fill(); }
      }
      if (kind === 'gold') { g.strokeStyle = 'rgba(255,220,120,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 38, 12, -0.3, 0, TAU); g.stroke(); }
      return c;
    },

    /** 金属玉（反射・環境映り込み） */
    ball(size, ghost) {
      const c = NB.makeCanvas(size, size), g = c.getContext('2d'), r = size / 2 - 1, cx = size / 2, cy = size / 2;
      const base = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      base.addColorStop(0, '#ffffff'); base.addColorStop(0.18, '#e4e9ee'); base.addColorStop(0.5, '#8a939c'); base.addColorStop(0.82, '#2c3238'); base.addColorStop(1, '#60686f');
      g.fillStyle = base; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      // 地平線の映り込み（下半分に暗帯）
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
      const hz = g.createLinearGradient(0, cy, 0, cy + r); hz.addColorStop(0, 'rgba(10,14,18,0.0)'); hz.addColorStop(0.15, 'rgba(10,14,18,0.55)'); hz.addColorStop(0.6, 'rgba(70,200,230,0.25)'); hz.addColorStop(1, 'rgba(200,220,235,0.5)');
      g.fillStyle = hz; g.fillRect(0, cy, size, r);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, TAU); g.fill();
      if (ghost) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(120,220,255,0.25)'; g.fillRect(0, 0, size, size); }
      return c;
    },
  };

  NB.Sprites = Sprites;
})(globalThis.NB);
