/* ==========================================================
 * v2 アート：追加の魔物・魔王（モンスター体）・魂札
 * 画像素材が届いたら MK.ASSET_MANIFEST の 'monster.<id>' で差し替え可能
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, TAU = U.TAU, A = MK.Art;
  const OUT = '#0a0610';
  const lg = A.lg, rg = A.rg, ell = A.ell, fs = A.fillStroke;
  const eye = (ctx, x, y, r, px = 0) => {
    ctx.fillStyle = '#fff'; ell(ctx, x, y, r, r * 1.2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = '#120412'; ell(ctx, x + px, y + 1, r * 0.5, r * 0.7); ctx.fill();
    ctx.fillStyle = '#fff'; ell(ctx, x + px + r * 0.2, y - r * 0.3, r * 0.18, r * 0.18); ctx.fill();
  };

  const New = {
    bombslime(ctx, p, t) {
      const sq = 1 + 0.06 * p.breath;
      ctx.scale(sq, 2 - sq);
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.bezierCurveTo(-42, -28, -20, -62, 0, -64); ctx.bezierCurveTo(20, -62, 42, -28, 34, 0); ctx.quadraticCurveTo(0, 7, -34, 0);
      fs(ctx, rg(ctx, -12, -42, 2, 0, -30, 70, ['#ffe0b0', '#ff8a3a', '#c03a10', '#4a1000']), 3);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ell(ctx, -15, -45, 9, 5, -0.6); ctx.fill();
      // 導火線
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(4, -62); ctx.quadraticCurveTo(14, -78, 8, -86); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(255,200,60,0.9)', 64), -4 + Math.sin(t * 20) * 2, -98, 24, 24); ctx.restore();
      eye(ctx, -9, -32, 7, 2); eye(ctx, 13, -32, 7, 2);
      ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, -46); ctx.lineTo(-4, -40); ctx.moveTo(20, -46); ctx.lineTo(8, -40); ctx.stroke();
      ctx.beginPath(); ctx.arc(2, -16, 6, 0, Math.PI); ctx.fillStyle = '#3a0a00'; ctx.fill();
    },
    engineer(ctx, p, t, lv) {
      A.Monsters.goblin(ctx, p, t, lv);
      ctx.save(); ctx.translate(0, -62 + p.breath * 1.2);
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-20, -8); ctx.lineTo(22, -8); ctx.stroke();
      [[-5, -8], [11, -8]].forEach(([x, y]) => { ell(ctx, x, y, 7, 7); fs(ctx, rg(ctx, x - 2, y - 2, 1, x, y, 8, ['#e0fbff', '#5ab8d8', '#1a4a6a']), 2.5); ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 2; ell(ctx, x, y, 7, 7); ctx.stroke(); });
      ctx.restore();
    },
    bellcat(ctx, p, t) {
      const tail = Math.sin(t * 3) * 6;
      ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(-44, -20, -36 + tail, -48); ctx.stroke();
      ctx.strokeStyle = '#2a2232'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(-44, -20, -36 + tail, -48); ctx.stroke();
      ell(ctx, 0, -20, 24, 20); fs(ctx, rg(ctx, -6, -30, 2, 0, -20, 30, ['#4a4058', '#221c2a', '#0e0a12']), 3);
      ctx.save(); ctx.translate(4, -50 + p.breath);
      [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(d * 8, -14); ctx.lineTo(d * 18, -32); ctx.lineTo(d * 20, -8); ctx.closePath(); fs(ctx, '#221c2a', 2.5); ctx.fillStyle = '#c86a8a'; ctx.beginPath(); ctx.moveTo(d * 11, -14); ctx.lineTo(d * 17, -26); ctx.lineTo(d * 17, -12); ctx.fill(); });
      ell(ctx, 0, 0, 22, 19); fs(ctx, rg(ctx, -6, -6, 2, 0, 0, 26, ['#4a4058', '#221c2a', '#0e0a12']), 3);
      [-8, 9].forEach((x) => { ctx.fillStyle = '#ffd23b'; ell(ctx, x, -2, 5.5, 6); ctx.fill(); ctx.fillStyle = '#120412'; ell(ctx, x + 1, -2, 1.6, 5); ctx.fill(); });
      ctx.fillStyle = '#ff9ab0'; ell(ctx, 1, 6, 2.5, 1.8); ctx.fill();
      ctx.strokeStyle = '#8a7a90'; ctx.lineWidth = 1; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(d * 10, 8); ctx.lineTo(d * 26, 5); ctx.moveTo(d * 10, 10); ctx.lineTo(d * 25, 12); ctx.stroke(); });
      ctx.restore();
      // 首輪と鈴
      ctx.fillStyle = '#c01020'; ctx.fillRect(-14, -34, 30, 5);
      const ring = Math.sin(t * 12) * (p.lunge || p.swing ? 0.5 : 0.1);
      ctx.save(); ctx.translate(1, -26); ctx.rotate(ring);
      ell(ctx, 0, 4, 6, 6); fs(ctx, rg(ctx, -2, 2, 1, 0, 4, 7, ['#fff6c0', '#e0b030', '#7a5000']), 2); ctx.fillStyle = OUT; ctx.fillRect(-0.8, 5, 1.6, 4);
      ctx.restore();
    },
    dice(ctx, p, t) {
      const lw = Math.sin(p.walk) * 0.4;
      [[-14, lw], [14, -lw]].forEach(([x, a]) => { ctx.save(); ctx.translate(x, -14); ctx.rotate(a); ctx.beginPath(); ctx.roundRect(-7, 0, 14, 16, 3); fs(ctx, '#6a6a78', 2.5); ctx.restore(); });
      ctx.save(); ctx.translate(0, -48 + p.breath * 1.5);
      // 側面
      ctx.beginPath(); ctx.moveTo(22, -30); ctx.lineTo(34, -40); ctx.lineTo(34, 14); ctx.lineTo(22, 26); ctx.closePath(); fs(ctx, '#b8b4c4', 3);
      ctx.beginPath(); ctx.moveTo(-26, -30); ctx.lineTo(-14, -40); ctx.lineTo(34, -40); ctx.lineTo(22, -30); ctx.closePath(); fs(ctx, '#f4f2fa', 3);
      ctx.beginPath(); ctx.roundRect(-26, -30, 48, 56, 6); fs(ctx, lg(ctx, -26, 0, 22, 0, ['#ffffff', '#dedae8']), 3);
      // 目と口
      ctx.fillStyle = '#c01020'; ell(ctx, -12, -12, 5, 5); ctx.fill(); ell(ctx, 8, -12, 5, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ell(ctx, -11, -13, 1.5, 1.5); ctx.fill(); ell(ctx, 9, -13, 1.5, 1.5); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-18, -22); ctx.lineTo(-6, -18); ctx.moveTo(14, -22); ctx.lineTo(2, -18); ctx.stroke();
      ctx.fillStyle = '#1a0a0a'; ctx.beginPath(); ctx.roundRect(-10, 4, 16, 8, 2); ctx.fill();
      ctx.fillStyle = '#1a0a0a'; [[28, -28], [28, 0]].forEach(([x, y]) => { ell(ctx, x, y, 2.5, 3.5); ctx.fill(); });
      ctx.fillStyle = '#c01020'; [[2, -36], [16, -36], [9, -34]].forEach(([x, y]) => { ell(ctx, x, y, 2.5, 1.4); ctx.fill(); });
      ctx.restore();
      ctx.save(); ctx.translate(26, -48); ctx.rotate(0.3 + p.swing * 0.9);
      ctx.beginPath(); ctx.roundRect(0, -6, 22, 12, 5); fs(ctx, '#6a6a78', 2.5); ctx.restore();
    },
    mandrake(ctx, p, t) {
      ctx.save(); ctx.translate(0, p.dy || 0);
      [[-6, -0.5], [6, 0.5], [0, 0]].forEach(([x, a]) => { ctx.save(); ctx.translate(x, -62); ctx.rotate(a + Math.sin(t * 3 + x) * 0.15); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-12, -16, 0, -30); ctx.quadraticCurveTo(12, -16, 0, 0); fs(ctx, lg(ctx, 0, -30, 0, 0, ['#9ae86a', '#2a7a2a']), 2.5); ctx.restore(); });
      ctx.beginPath(); ctx.moveTo(0, -64); ctx.bezierCurveTo(28, -60, 30, -20, 12, -6); ctx.lineTo(16, 0); ctx.lineTo(4, -4); ctx.lineTo(-4, -4); ctx.lineTo(-16, 0); ctx.lineTo(-12, -6); ctx.bezierCurveTo(-30, -20, -28, -60, 0, -64);
      fs(ctx, rg(ctx, -6, -44, 2, 0, -34, 36, ['#fff0d0', '#e0b880', '#8a5a2a']), 3);
      const scream = p.lunge || p.swing ? 1 : 0.35 + 0.15 * Math.sin(t * 4);
      ctx.fillStyle = OUT; ell(ctx, -8, -40, 3.5, 4.5); ctx.fill(); ell(ctx, 8, -40, 3.5, 4.5); ctx.fill();
      ctx.beginPath(); ell(ctx, 0, -24, 7, 9 * scream); ctx.fillStyle = '#3a0a10'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.strokeStyle = 'rgba(120,70,30,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-8, -12); ctx.moveTo(12, -50); ctx.lineTo(16, -46); ctx.stroke();
      ctx.restore();
    },
    mushroom(ctx, p, t) {
      ctx.beginPath(); ctx.roundRect(-14, -40, 28, 40, 10); fs(ctx, lg(ctx, -14, 0, 14, 0, ['#e8dccc', '#fff8ee', '#cbbca8']), 3);
      eye(ctx, -6, -24, 4.5, 1); eye(ctx, 8, -24, 4.5, 1);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, -12, 4, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.save(); ctx.translate(0, -40 + p.breath);
      ctx.beginPath(); ctx.moveTo(-40, 4); ctx.bezierCurveTo(-40, -36, 40, -36, 40, 4); ctx.quadraticCurveTo(0, 12, -40, 4);
      fs(ctx, rg(ctx, -10, -20, 2, 0, -10, 46, ['#ff9a8a', '#d02a2a', '#6a0a10']), 3);
      ctx.fillStyle = '#fff4ea'; [[-22, -6, 6], [0, -20, 7], [20, -8, 5], [-8, -2, 4], [28, 0, 3]].forEach(([x, y, r]) => { ell(ctx, x, y, r, r * 0.8); ctx.fill(); });
      ctx.restore();
      ctx.save(); ctx.translate(16, -26); ctx.rotate(0.2 + p.swing * 0.5);
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -16); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(190,110,255,0.9)', 64), -12, -30, 24, 24); ctx.restore();
      ell(ctx, 0, -18, 4, 4); fs(ctx, '#e0c0ff', 1.5);
      ctx.restore();
    },
  };

  // ---- 魔物の描画（既存のアートと追加分を振り分け） ----
  const BASE = { slime: 'slime', goblin: 'goblin', bone: 'skeleton', imp: 'imp', dragon: 'dragon' };
  function unit(ctx, type, x, y, s, t, opt = {}) {
    const m = Object.assign({ x, y, s, face: opt.face || 1, anim: opt.anim || 'idle', at: opt.at, lv: opt.lv || 1, seed: opt.seed || 0 }, opt.m || {});
    if (BASE[type]) { m.type = BASE[type]; A.monster(ctx, m, t); return; }
    if (type === 'knight') { m.type = 'warrior'; A.hero(ctx, m, t); return; }
    if (!New[type]) return;
    const asset = MK.Assets.img('monster.' + type);
    A.shadow(ctx, x, y + 2, 28 * s);
    ctx.save(); ctx.translate(x, y);
    if (asset) { ctx.scale(m.face, 1); const h = 120 * s; ctx.drawImage(asset, -h / 2, -h, h, h); ctx.restore(); return; }
    const at = m.at == null ? t : m.at;
    const p = { breath: Math.sin(t * 3 + (m.seed || 0)), walk: 0, swing: 0, lunge: 0, hurt: 0, dy: 0 };
    if (m.anim === 'attack') { const k = U.clamp(at / 0.5, 0, 1); p.lunge = Math.sin(k * Math.PI); p.swing = p.lunge; ctx.translate(p.lunge * 30 * s * m.face, 0); }
    if (m.anim === 'cheer') ctx.translate(0, -Math.abs(Math.sin(at * 7)) * 14 * s);
    if (m.anim === 'walk') { p.walk = at * 10; ctx.translate(0, -Math.abs(Math.sin(at * 10)) * 4 * s); }
    ctx.scale(s * m.face, s);
    New[type](ctx, p, t, m.lv);
    ctx.restore();
  }

  // ---- 魔王（モンスター体・3形態） ----
  // form 0=失墜（しょぼくれた塊） 1=再建期（本を読む） 2=復権（大きく、角が伸びる）
  function maou(ctx, x, y, s, t, form = 0, mood = '') {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const br = Math.sin(t * 2) * (form ? 2 : 1);
    const big = [1, 1.12, 1.3][form];
    ctx.scale(big, big);
    if (form >= 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(170,60,255,0.45)', 128), -150, -230, 300, 260); ctx.restore(); }
    A.shadow(ctx, 0, 2, 70, 0.4);
    // マント
    ctx.beginPath(); ctx.moveTo(-74, 0); ctx.quadraticCurveTo(-90, -60, -50, -96); ctx.lineTo(50, -96); ctx.quadraticCurveTo(90, -60, 74, 0); ctx.closePath();
    fs(ctx, lg(ctx, 0, -96, 0, 0, ['#8a1428', '#4a0614']), 3);
    // 体（紫の塊）
    ctx.beginPath(); ctx.moveTo(-60, 0); ctx.bezierCurveTo(-70, -60, -40, -118 + br, 0, -120 + br); ctx.bezierCurveTo(40, -118 + br, 70, -60, 60, 0); ctx.quadraticCurveTo(0, 8, -60, 0);
    fs(ctx, rg(ctx, -20, -86, 4, 0, -60, 110, ['#c8a8f0', '#7a52b8', '#3a1e6a', '#1a0a30']), 3.5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, -28, -86 + br, 12, 7, -0.6); ctx.fill();
    // 毛皮の襟
    ctx.fillStyle = '#f4ece0';
    for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + i * 0.0875); ell(ctx, Math.cos(a) * -58, -30 - Math.sin(a) * 26 + 20, 12, 9); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -12, 58, 16, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // 角
    const hl = [1, 1.15, 1.45][form];
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(d * 26, -110 + br);
      ctx.bezierCurveTo(d * 70, -120 * hl, d * 78, -150 * hl, d * 54, -170 * hl);
      ctx.bezierCurveTo(d * 64, -140 * hl, d * 52, -118, d * 38, -100 + br); ctx.closePath();
      fs(ctx, lg(ctx, d * 30, -100, d * 60, -170 * hl, ['#3a0a10', '#a01a2a', '#e0566a']), 3);
    });
    // 王冠（失墜時は傾いている）
    ctx.save(); ctx.translate(form ? 0 : 8, -120 + br); ctx.rotate(form ? 0 : 0.25);
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-26, -20); ctx.lineTo(-12, -10); ctx.lineTo(0, -26); ctx.lineTo(12, -10); ctx.lineTo(26, -20); ctx.lineTo(22, 0); ctx.closePath();
    fs(ctx, lg(ctx, 0, -26, 0, 0, ['#ffe9a0', '#d9a020', '#7a4a08']), 2.5);
    ctx.fillStyle = '#4060ff'; ell(ctx, 0, -8, 3.5, 3.5); ctx.fill();
    ctx.restore();
    // 顔
    const ey = -72 + br;
    ctx.strokeStyle = OUT; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    if (form === 0 && mood !== 'happy' && mood !== 'shock') {
      // しょぼくれた閉じ目
      ctx.beginPath(); ctx.arc(-18, ey, 8, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(18, ey, 8, 0.2, Math.PI - 0.2); ctx.stroke();
    } else if (mood === 'shock') {
      eye(ctx, -18, ey, 9, 0); eye(ctx, 18, ey, 9, 0);
    } else {
      [-1, 1].forEach((d) => {
        ctx.fillStyle = form >= 2 ? '#ff3a2a' : '#ffd23b';
        ctx.beginPath(); ctx.moveTo(d * 8, ey - 2); ctx.quadraticCurveTo(d * 18, ey - 10, d * 30, ey - 4); ctx.quadraticCurveTo(d * 18, ey + 8, d * 8, ey - 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = OUT; ell(ctx, d * 18, ey - 1, 2, 4); ctx.fill();
      });
      if (form >= 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(255,40,30,0.8)', 64), -44, ey - 22, 88, 40); ctx.restore(); }
    }
    // 口と牙
    ctx.lineWidth = 3;
    if (mood === 'happy' || form >= 2) { ctx.beginPath(); ctx.moveTo(-14, ey + 22); ctx.quadraticCurveTo(0, ey + 36, 14, ey + 22); ctx.closePath(); ctx.fillStyle = '#2a0610'; ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-10, ey + 26); ctx.quadraticCurveTo(0, ey + 20, 10, ey + 26); ctx.stroke(); }
    ctx.fillStyle = '#fff'; [-6, 6].forEach((x) => { ctx.beginPath(); ctx.moveTo(x - 3, ey + 22); ctx.lineTo(x, ey + 30); ctx.lineTo(x + 3, ey + 22); ctx.fill(); });
    if (form === 0 && !mood) { ctx.fillStyle = 'rgba(150,200,255,0.8)'; ctx.beginPath(); ctx.moveTo(44, -96); ctx.quadraticCurveTo(52, -84, 44, -80); ctx.quadraticCurveTo(36, -84, 44, -96); ctx.fill(); }
    // 再建期：本
    if (form === 1) {
      ctx.save(); ctx.translate(0, -24); ctx.rotate(-0.06);
      ctx.beginPath(); ctx.moveTo(-34, -14); ctx.lineTo(0, -8); ctx.lineTo(34, -14); ctx.lineTo(34, 14); ctx.lineTo(0, 20); ctx.lineTo(-34, 14); ctx.closePath();
      fs(ctx, '#f3e6c0', 2.5); ctx.fillStyle = '#7a1020'; ctx.fillRect(-1.5, -8, 3, 28);
      ctx.strokeStyle = 'rgba(80,40,20,0.6)'; ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-28, -4 + i * 6); ctx.lineTo(-6, 0 + i * 6); ctx.moveTo(6, 0 + i * 6); ctx.lineTo(28, -4 + i * 6); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- 魂札（リール1コマ） ----
  const tileCache = {};
  function tileArt(type, w, h) {
    const key = type + w + 'x' + h;
    if (tileCache[key]) return tileCache[key];
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d'); g.scale(2, 2);
    const D = MK.D.TILES[type];
    const tr = MK.D.TRIBES[D.tribe] || MK.D.TRIBES.none;
    const bgc = g.createLinearGradient(0, 0, 0, h);
    bgc.addColorStop(0, '#f6eedc'); bgc.addColorStop(1, '#d6c6a4');
    g.fillStyle = bgc; g.fillRect(0, 0, w, h);
    if (D.tribe !== 'none') { g.fillStyle = tr.color; g.fillRect(0, 0, 10, h); }
    g.strokeStyle = 'rgba(60,40,20,0.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    const cx = w / 2;
    if (type === 'stone') {
      g.save(); g.translate(cx, h * 0.62);
      g.beginPath(); g.moveTo(-22, 8); g.lineTo(-26, -4); g.lineTo(-12, -16); g.lineTo(10, -18); g.lineTo(26, -6); g.lineTo(22, 8); g.closePath();
      fs(g, lg(g, 0, -18, 0, 8, ['#8a8494', '#4a4652']), 2.5);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(-6, -14); g.lineTo(0, -2); g.lineTo(8, -8); g.stroke();
      g.restore();
      g.font = 'bold 13px "Shippori Mincho B1", serif'; g.fillStyle = 'rgba(60,40,30,0.7)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('はずれ', 6, 4);
    } else if (type === 'coin') {
      A.coin(g, cx, h / 2, h * 0.3);
      g.font = 'bold 13px "Shippori Mincho B1", serif'; g.fillStyle = 'rgba(80,50,0,0.85)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('金貨', 6, 4);
    } else if (type === 'shard') {
      g.save(); g.translate(cx, h / 2);
      
      g.beginPath(); g.moveTo(0, -24); g.lineTo(13, -4); g.lineTo(6, 22); g.lineTo(-8, 18); g.lineTo(-13, -6); g.closePath();
      fs(g, lg(g, -13, 0, 13, 0, ['#1a5ab8', '#8ae0ff', '#2a7ad8']), 2.5);
      g.restore();
      g.font = 'bold 13px "Shippori Mincho B1", serif'; g.fillStyle = 'rgba(10,50,90,0.85)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('クリスタル', 6, 4);
    } else {
      const sc = type === 'dragon' ? 0.4 : type === 'knight' ? 0.66 : 0.74;
      unit(g, type, cx, h - 3, sc, 0.8, { seed: 1 });
      g.font = 'bold 12px "Shippori Mincho B1", serif'; g.fillStyle = 'rgba(60,30,10,0.8)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(D.name, 6, 4);
    }
    tileCache[key] = c;
    return c;
  }
  function clearTileCache() { Object.keys(tileCache).forEach((k) => delete tileCache[k]); }

  MK.Art2 = { unit, maou, tileArt, clearTileCache, New };
})(window.MK);
