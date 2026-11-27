/* ==========================================================
 * 魔王城の断面図・給料袋・辞表・魔王軍の旗
 * 断面図の部屋：0 金庫室 / 1 作業場 / 2 兵舎 / 3 経理室 / 4 大浴場 / 5 玉座の間
 * 城Lv n で部屋 0..n が開放される（Lv1 = 金庫室＋作業場）
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, TAU = U.TAU;
  const OUT = '#0a0610';
  const lg = (...a) => MK.Art.lg(...a);
  const ell = (...a) => MK.Art.ell(...a);
  const fs = (...a) => MK.Art.fillStroke(...a);

  const RW = 520, RH = 70, FLOORS = 6; // 城ローカル座標：幅520・1部屋の高さ70
  const ROOMS = [
    { name: '金庫室', job: 'slime' },
    { name: '作業場', job: 'goblin' },
    { name: '兵舎', job: 'skeleton' },
    { name: '経理室', job: 'imp' },
    { name: '大浴場', job: 'dragon' },
    { name: '玉座の間', job: null },
  ];

  // 部屋の矩形（城ローカル）
  function roomRect(i) { return { x0: -RW / 2 + 22, x1: RW / 2 - 22, y0: -(i + 1) * RH, y1: -i * RH }; }
  // 城ローカル → 画面
  function toScreen(geo, lx, ly) { return [geo.x + lx * geo.s, geo.y + ly * geo.s]; }

  function stoneBlocks(ctx, x0, y0, w, h, alpha = 0.3) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`; ctx.lineWidth = 1;
    for (let yy = y0, r = 0; yy < y0 + h; yy += 12, r++) {
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke();
      for (let xx = x0 + (r % 2) * 11; xx < x0 + w; xx += 22) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 12); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---- 部屋ごとの小道具（所帯じみた生活感） ----
  const Props = {
    0(ctx, r, t, o) { // 金庫室：金貨の山
      const n = U.clamp(o.vault || 0, 0, 400);
      const h = Math.min(40, 4 + Math.sqrt(n) * 3.2);
      const cx = r.x0 + 120;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(MK.FX.glow('rgba(255,190,60,0.6)', 64), cx - 90, r.y1 - h - 50, 180, h + 70); ctx.restore();
      ctx.beginPath(); ctx.moveTo(cx - 70, r.y1); ctx.quadraticCurveTo(cx, r.y1 - h * 2, cx + 70, r.y1); ctx.closePath();
      fs(ctx, lg(ctx, 0, r.y1 - h, 0, r.y1, ['#fff3a0', '#e0a020', '#8a5000']), 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 6; i++) { ell(ctx, cx - 40 + i * 15, r.y1 - h * 0.5 - (i % 2) * 6, 4, 2); ctx.fill(); }
      // 金庫
      const sx = r.x1 - 90;
      ctx.beginPath(); ctx.rect(sx, r.y1 - 46, 56, 46); fs(ctx, lg(ctx, sx, 0, sx + 56, 0, ['#3a3a48', '#6a6a80', '#2a2a36']), 2.5);
      ctx.beginPath(); ctx.arc(sx + 28, r.y1 - 23, 9, 0, TAU); fs(ctx, '#c9a23a', 2);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 28, r.y1 - 23); ctx.lineTo(sx + 28 + Math.cos(t) * 7, r.y1 - 23 + Math.sin(t) * 7); ctx.stroke();
      label(ctx, '金庫', sx + 28, r.y1 - 54, 11);
    },
    1(ctx, r, t) { // 作業場：金床・木材・安全第一
      const ax = r.x0 + 150;
      ctx.beginPath(); ctx.moveTo(ax - 24, r.y1 - 22); ctx.lineTo(ax + 28, r.y1 - 22); ctx.lineTo(ax + 18, r.y1 - 14); ctx.lineTo(ax + 8, r.y1 - 14); ctx.lineTo(ax + 10, r.y1); ctx.lineTo(ax - 10, r.y1); ctx.lineTo(ax - 8, r.y1 - 14); ctx.lineTo(ax - 18, r.y1 - 14); ctx.closePath();
      fs(ctx, '#3a3a46', 2);
      ctx.fillStyle = '#8a5a2a'; for (let i = 0; i < 4; i++) { ctx.fillRect(r.x1 - 110, r.y1 - 6 - i * 6, 70, 5); }
      ctx.strokeStyle = OUT; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) ctx.strokeRect(r.x1 - 110, r.y1 - 6 - i * 6, 70, 5);
      // 安全第一の看板
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(r.x0 + 30, r.y0 + 12, 54, 18); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(r.x0 + 30, r.y0 + 12, 54, 18);
      ctx.fillStyle = '#2a0a0a'; ctx.font = 'bold 11px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('安全第一', r.x0 + 57, r.y0 + 22);
    },
    2(ctx, r, t) { // 兵舎：二段ベッドと洗濯物
      const bx = r.x0 + 26;
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(bx, r.y0 + 14, 6, RH - 14); ctx.fillRect(bx + 70, r.y0 + 14, 6, RH - 14);
      [r.y0 + 30, r.y1 - 12].forEach((y) => { ctx.fillStyle = '#7a4a2a'; ctx.fillRect(bx, y, 76, 6); ctx.fillStyle = '#c8c0d8'; ctx.fillRect(bx + 6, y - 6, 64, 6); });
      // 洗濯ロープ
      const lx0 = r.x0 + 200, lx1 = r.x1 - 40, ly = r.y0 + 16;
      ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.quadraticCurveTo((lx0 + lx1) / 2, ly + 10, lx1, ly); ctx.stroke();
      const cl = ['#e8e8f0', '#d23b3b', '#3a6ad8', '#f0e0a0', '#e8e8f0'];
      for (let i = 0; i < 5; i++) {
        const x = lx0 + 20 + i * ((lx1 - lx0 - 40) / 4), y = ly + 6 - Math.abs(i - 2) * 1.5, sw = Math.sin(t * 2 + i) * 2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sw * 0.03);
        ctx.fillStyle = cl[i];
        if (i % 2) { ctx.fillRect(-8, 0, 16, 18); ctx.fillRect(-12, 0, 24, 6); } // シャツ
        else { ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(5, 14); ctx.lineTo(10, 18); ctx.lineTo(-2, 18); ctx.lineTo(-5, 14); ctx.fill(); } // 靴下
        ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
    },
    3(ctx, r, t) { // 経理室：机・帳簿・そろばん・書類の山
      const dx = r.x0 + 170;
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(dx, r.y1 - 26, 120, 8); ctx.fillRect(dx + 6, r.y1 - 18, 6, 18); ctx.fillRect(dx + 108, r.y1 - 18, 6, 18);
      ctx.fillStyle = '#f0e6c8'; for (let i = 0; i < 5; i++) ctx.fillRect(dx + 76 + (i % 2), r.y1 - 32 - i * 5, 30, 4);
      ctx.fillStyle = '#6a1020'; ctx.fillRect(dx + 14, r.y1 - 32, 34, 6);
      // そろばん
      ctx.fillStyle = '#3a2210'; ctx.fillRect(dx + 50, r.y1 - 34, 24, 8);
      ctx.fillStyle = '#e0c080'; for (let i = 0; i < 5; i++) { ell(ctx, dx + 53 + i * 4.5 + (Math.sin(t * 6 + i) > 0.6 ? 1.5 : 0), r.y1 - 30, 1.6, 2.4); ctx.fill(); }
      // 書類の山
      ctx.fillStyle = '#e8e0c8'; for (let i = 0; i < 8; i++) ctx.fillRect(r.x1 - 70 + (i % 3), r.y1 - 6 - i * 5, 40, 4);
      ctx.fillStyle = '#c01020'; ctx.font = 'bold 10px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.fillText('経費', r.x1 - 50, r.y1 - 50);
    },
    4(ctx, r, t) { // 大浴場：湯船と湯気
      const tx = r.x0 + 200;
      ctx.beginPath(); ctx.moveTo(tx, r.y1 - 30); ctx.lineTo(tx + 150, r.y1 - 30); ctx.lineTo(tx + 140, r.y1); ctx.lineTo(tx + 10, r.y1); ctx.closePath();
      fs(ctx, lg(ctx, 0, r.y1 - 30, 0, r.y1, ['#8a6a4a', '#4a3020']), 2.5);
      ctx.fillStyle = 'rgba(120,200,255,0.75)'; ctx.fillRect(tx + 6, r.y1 - 28, 138, 6);
      ctx.save(); ctx.globalAlpha = 0.35;
      for (let i = 0; i < 4; i++) { const sx = tx + 20 + i * 36, sy = r.y1 - 36 - ((t * 20 + i * 9) % 26); ctx.drawImage(MK.FX.softDot('rgba(255,255,255,0.8)', 64), sx - 14, sy - 14, 28, 28); }
      ctx.restore();
      // 釜
      ctx.fillStyle = '#2a2a30'; ctx.fillRect(tx + 150, r.y1 - 20, 26, 20);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(255,120,30,0.8)', 64), tx + 146, r.y1 - 30, 34, 34); ctx.restore();
      label(ctx, 'ゆ', tx + 75, r.y0 + 18, 14, '#ff9ab0');
    },
    5(ctx, r, t) { // 玉座の間
      const cx = 0;
      ctx.fillStyle = '#7a0a1a'; ctx.fillRect(cx - 40, r.y1 - 4, 80, 4);
      ctx.beginPath(); ctx.moveTo(cx - 22, r.y1); ctx.lineTo(cx - 22, r.y0 + 18); ctx.lineTo(cx - 12, r.y0 + 8); ctx.lineTo(cx, r.y0 + 14); ctx.lineTo(cx + 12, r.y0 + 8); ctx.lineTo(cx + 22, r.y0 + 18); ctx.lineTo(cx + 22, r.y1); ctx.closePath();
      fs(ctx, lg(ctx, 0, r.y0, 0, r.y1, ['#ffd34a', '#8a5000']), 2.5);
      ctx.fillStyle = '#5a0a1a'; ctx.fillRect(cx - 14, r.y0 + 24, 28, 36);
      [-160, 160].forEach((bx) => { ctx.fillStyle = '#b01226'; ctx.fillRect(bx - 12, r.y0 + 6, 24, 44); ctx.fillStyle = '#ffd34a'; ell(ctx, bx, r.y0 + 24, 5, 4); ctx.fill(); });
    },
  };

  function label(ctx, text, x, y, size = 12, color = '#ffe7c0') {
    ctx.save(); ctx.font = `bold ${size}px "Shippori Mincho B1", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#0a0206'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  }

  /**
   * 断面図を描く
   * opt.lit: 明かりのついた階数（小数でフェード。未指定なら開放済みの部屋すべて）
   * opt.vault: 金庫の金貨（山の大きさ）
   * opt.flash: 部屋番号→0..1 の光（増築直後の演出）
   */
  function section(ctx, geo, lv, t, opt = {}) {
    const built = U.clamp(lv, 1, 5) + 1;
    const lit = opt.lit == null ? built : opt.lit;
    const floors = opt.floors || FLOORS;
    ctx.save();
    ctx.translate(geo.x, geo.y); ctx.scale(geo.s, geo.s);
    // 背面オーラ
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t * 2);
    ctx.drawImage(MK.FX.glow(lv >= 5 ? 'rgba(220,40,80,0.6)' : 'rgba(140,60,255,0.45)', 128), -420, -560, 840, 620);
    ctx.restore();
    // 崖
    ctx.beginPath(); ctx.moveTo(-330, 70); ctx.lineTo(-300, 6); ctx.lineTo(300, 6); ctx.lineTo(340, 70); ctx.closePath();
    fs(ctx, lg(ctx, 0, 0, 0, 70, ['#2a2436', '#0c0a12']), 3);
    for (let i = 0; i < floors; i++) {
      const r = roomRect(i);
      const isBuilt = i < built;
      const L = U.clamp(lit - i, 0, 1);
      // 外壁（断面の縁）
      ctx.beginPath(); ctx.rect(-RW / 2, r.y0, RW, RH);
      fs(ctx, isBuilt ? lg(ctx, -RW / 2, 0, RW / 2, 0, ['#2c2a3e', '#4b4864', '#2c2a3e']) : 'rgba(20,18,30,0.55)', 3);
      if (isBuilt) stoneBlocks(ctx, -RW / 2, r.y0, RW, RH, 0.35);
      // 室内
      ctx.beginPath(); ctx.rect(r.x0, r.y0 + 6, r.x1 - r.x0, RH - 6);
      if (isBuilt) {
        const dark = lg(ctx, 0, r.y0, 0, r.y1, ['#14101e', '#0a0812']);
        ctx.fillStyle = dark; ctx.fill();
        if (L > 0) {
          ctx.save(); ctx.globalAlpha = L;
          ctx.fillStyle = lg(ctx, 0, r.y0, 0, r.y1, i === 0 ? ['#5a4020', '#2a1a0c'] : i === 4 ? ['#3a4a5a', '#1a2028'] : ['#5a3a2e', '#24160e']);
          ctx.fill();
          stoneBlocks(ctx, r.x0, r.y0 + 6, r.x1 - r.x0, RH - 6, 0.18);
          // ランプ
          const lx = (r.x0 + r.x1) / 2 + (i % 2 ? 120 : -120);
          ctx.globalCompositeOperation = 'lighter';
          const fl = 0.8 + 0.2 * Math.sin(t * 9 + i * 2);
          ctx.globalAlpha = L * fl * 0.8;
          ctx.drawImage(MK.FX.glow('rgba(255,160,60,0.7)', 128), lx - 90, r.y0 - 20, 180, 120);
          ctx.restore();
          ctx.save(); ctx.globalAlpha = L;
          if (Props[i]) Props[i](ctx, r, t, opt);
          ctx.restore();
        }
        // 床
        ctx.fillStyle = '#1a1210'; ctx.fillRect(r.x0, r.y1 - 3, r.x1 - r.x0, 3);
        // 外窓（左右の外壁）
        [-RW / 2 + 11, RW / 2 - 11].forEach((wx) => {
          ctx.fillStyle = L > 0.5 ? `rgba(255,${180 + 40 * Math.sin(t * 5 + i) | 0},80,${0.6 + 0.4 * L})` : '#0a0810';
          ctx.fillRect(wx - 4, r.y0 + 22, 8, 16);
        });
        label(ctx, ROOMS[i].name, r.x0 + 34, r.y0 + 14, 11, L > 0.5 ? '#ffe7c0' : '#6a6080');
        // 増築直後の光
        const f = opt.flash && opt.flash[i];
        if (f) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; ctx.fillStyle = 'rgba(255,230,160,0.8)'; ctx.fillRect(r.x0, r.y0 + 6, r.x1 - r.x0, RH - 6); ctx.restore(); }
      } else {
        // 工事中（未開放）
        ctx.fillStyle = 'rgba(8,6,14,0.7)'; ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.rect(-RW / 2, r.y0, RW, RH); ctx.clip();
        ctx.strokeStyle = 'rgba(140,100,60,0.55)'; ctx.lineWidth = 4;
        for (let k = -RW / 2; k < RW / 2; k += 60) { ctx.beginPath(); ctx.moveTo(k, r.y1); ctx.lineTo(k + 60, r.y0); ctx.stroke(); }
        ctx.restore();
        ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(200,170,120,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(-RW / 2 + 2, r.y0 + 2, RW - 4, RH - 4); ctx.setLineDash([]);
        if (i === built) {
          ctx.fillStyle = '#ffd34a'; ctx.fillRect(-46, r.y0 + 24, 92, 22); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-46, r.y0 + 24, 92, 22);
          ctx.fillStyle = '#2a0a0a'; ctx.font = 'bold 13px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('工事中', 0, r.y0 + 35);
        }
      }
    }
    // 屋根
    const ry = -floors * RH;
    ctx.beginPath(); ctx.moveTo(-RW / 2 - 16, ry); ctx.lineTo(0, ry - 70); ctx.lineTo(RW / 2 + 16, ry); ctx.closePath();
    fs(ctx, lg(ctx, -RW / 2, 0, RW / 2, 0, ['#1a0a22', '#4a2058', '#6a3a7a', '#24102e']), 3);
    ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, ry - 70); ctx.lineTo(0, ry - 96); ctx.stroke();
    const wv = Math.sin(t * 5) * 4;
    ctx.beginPath(); ctx.moveTo(0, ry - 96); ctx.quadraticCurveTo(18, ry - 98 + wv, 34, ry - 90 + wv); ctx.lineTo(0, ry - 82); ctx.closePath(); fs(ctx, '#b01226', 1.5);
    if (lv >= 5) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(255,60,90,0.7)', 64), -40, ry - 120, 80, 60); ctx.restore(); }
    ctx.restore();
  }

  // ---- 給料袋 ----
  function payBag(ctx, x, y, s, fill, t, opt = {}) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const wob = opt.shake ? Math.sin(t * 40) * 2 : 0;
    ctx.translate(wob, 0);
    if (opt.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = opt.glow; ctx.drawImage(MK.FX.glow('rgba(255,210,80,0.9)', 128), -110, -170, 220, 220); ctx.restore(); }
    // 袋の形
    const bag = () => { ctx.beginPath(); ctx.moveTo(-26, -100); ctx.quadraticCurveTo(-74, -60, -66, -18); ctx.quadraticCurveTo(-60, 4, 0, 4); ctx.quadraticCurveTo(60, 4, 66, -18); ctx.quadraticCurveTo(74, -60, 26, -100); ctx.closePath(); };
    bag(); fs(ctx, lg(ctx, -66, 0, 66, 0, ['#8a6a3a', '#d8b878', '#9a7a4a']), 3.5);
    // 中身（金貨の水位）
    ctx.save(); bag(); ctx.clip();
    const lvY = 4 - 104 * U.clamp(fill, 0, 1);
    ctx.fillStyle = lg(ctx, 0, lvY, 0, 4, ['#fff3a0', '#e0a020', '#8a5000']);
    ctx.fillRect(-80, lvY, 160, 120);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 6; i++) { ell(ctx, -50 + i * 20, lvY + 4 + (i % 2) * 3, 6, 2.5); ctx.fill(); }
    ctx.restore();
    bag(); ctx.lineWidth = 3.5; ctx.strokeStyle = OUT; ctx.stroke();
    // 口ひも
    ctx.beginPath(); ctx.moveTo(-30, -100); ctx.quadraticCurveTo(0, -92, 30, -100); ctx.lineTo(22, -116); ctx.quadraticCurveTo(0, -108, -22, -116); ctx.closePath();
    fs(ctx, '#7a5a2a', 3);
    ctx.strokeStyle = '#c01020'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-28, -101); ctx.quadraticCurveTo(0, -93, 28, -101); ctx.stroke();
    // 札
    ctx.save(); ctx.rotate(-0.08);
    ctx.fillStyle = '#f3ead0'; ctx.fillRect(-30, -62, 60, 36); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-30, -62, 60, 36);
    ctx.fillStyle = '#7a0a10'; ctx.font = 'bold 16px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('給料袋', 0, -44);
    ctx.restore();
    ctx.restore();
  }

  // ---- 辞表 ----
  function letter(ctx, x, y, s, rot = 0, opt = {}) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-14, -22, 28, 44);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-14, -22, 28, 44);
    ctx.fillStyle = '#1a0a0a'; ctx.font = 'bold 13px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ['辞', '表'].forEach((c, i) => ctx.fillText(c, 0, -8 + i * 16));
    if (opt.stamp) { ctx.strokeStyle = '#d01020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8, 14, 6, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  // ---- 魔王軍の旗 ----
  function flag(ctx, x, y, s, t, pop = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * pop, s * pop);
    ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -38); ctx.stroke();
    const wv = Math.sin(t * 6 + x) * 3;
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.quadraticCurveTo(14, -40 + wv, 28, -34 + wv); ctx.lineTo(28, -20 + wv); ctx.quadraticCurveTo(14, -24 + wv, 0, -22); ctx.closePath();
    fs(ctx, lg(ctx, 0, -38, 0, -20, ['#e0203a', '#7a0010']), 2);
    ctx.fillStyle = '#f0e6d0'; ell(ctx, 13, -30 + wv * 0.6, 4, 4); ctx.fill();
    ctx.fillStyle = '#1a0a0a'; ell(ctx, 11.5, -30.5 + wv * 0.6, 1, 1); ctx.fill(); ell(ctx, 14.5, -30.5 + wv * 0.6, 1, 1); ctx.fill();
    ctx.restore();
  }

  // 開放済みの階＋工事中1階だけを、画面いっぱいに収める配置
  function fitGeo(lv, box) {
    const floors = Math.min(FLOORS, U.clamp(lv, 1, 5) + 2);
    const h = floors * RH + 100;
    const s = Math.min(box.maxS || 1.3, box.h / h);
    return { x: box.x, y: box.bottom, s, floors };
  }
  MK.Castle = { fitGeo, RW, RH, FLOORS, ROOMS, roomRect, toScreen, section, payBag, letter, flag, label };
})(window.MK);
