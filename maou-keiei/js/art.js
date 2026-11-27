/* ==========================================================
 * プログラム描画アート
 * 画像素材が manifest に登録されていれば自動でそちらを優先します。
 * 座標規約：キャラクターは (x, y) = 足元中央、s = 倍率（基準身長 ≒ 90px）
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U;
  const TAU = U.TAU;
  const OUT = '#0a0610';

  function lg(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(Array.isArray(c) ? c[0] : i / (stops.length - 1), Array.isArray(c) ? c[1] : c));
    return g;
  }
  function rg(ctx, x, y, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
    stops.forEach((c, i) => g.addColorStop(Array.isArray(c) ? c[0] : i / (stops.length - 1), Array.isArray(c) ? c[1] : c));
    return g;
  }
  function fillStroke(ctx, fill, lw = 3, stroke = OUT) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
  }
  function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); }
  function shadow(ctx, x, y, w, a = 0.45) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ell(ctx, x, y, w, w * 0.22); ctx.fill();
    ctx.restore();
  }
  function glowEye(ctx, x, y, r, color = '#ff2a2a') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(MK.FX.glow(color, 64), x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.restore();
    ctx.fillStyle = '#fff6d0';
    ell(ctx, x, y, r * 0.55, r * 0.55); ctx.fill();
  }

  // ---------- アニメ計算 ----------
  function animPose(m, t) {
    const at = m.at == null ? t : m.at;
    const pose = { dx: 0, dy: 0, sx: 1, sy: 1, swing: 0, lunge: 0, hurt: 0, walk: 0, breath: Math.sin(t * 3 + (m.seed || 0)) };
    if (m.anim === 'walk') { pose.walk = at * 10; pose.dy = -Math.abs(Math.sin(at * 10)) * 4; }
    if (m.anim === 'attack') {
      const p = U.clamp(at / 0.5, 0, 1);
      pose.lunge = Math.sin(p * Math.PI);
      pose.swing = p < 0.35 ? -U.ease.outQuad(p / 0.35) : -1 + U.ease.outBack((p - 0.35) / 0.65) * 2.2;
      pose.dx = pose.lunge * 40;
    }
    if (m.anim === 'hurt') {
      const p = U.clamp(at / 0.45, 0, 1);
      pose.hurt = 1 - p;
      pose.dx = -Math.sin(p * Math.PI) * 18;
    }
    if (m.anim === 'cheer') { pose.dy = -Math.abs(Math.sin(at * 7)) * 16; pose.swing = -1.4; }
    if (m.anim === 'down') { pose.down = 1; }
    return pose;
  }

  // ---------- 魔物 ----------
  const Monsters = {
    slime(ctx, p, t, lv) {
      const sq = 1 + 0.06 * p.breath + (p.walk ? Math.sin(p.walk) * 0.08 : 0);
      ctx.scale(sq, 2 - sq);
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.bezierCurveTo(-42, -28, -20, -62, 0, -64);
      ctx.bezierCurveTo(20, -62, 42, -28, 34, 0);
      ctx.quadraticCurveTo(0, 7, -34, 0);
      const hue = lv >= 7 ? ['#ffe9b8', '#ffc23f', '#b06a00', '#3d2100'] : ['#c6ffe9', '#3fd6a0', '#118866', '#04342a'];
      fillStroke(ctx, rg(ctx, -12, -42, 2, 0, -30, 70, hue), 3);
      // 角
      [-1, 1].forEach((d) => {
        ctx.beginPath(); ctx.moveTo(d * 9, -60); ctx.quadraticCurveTo(d * 18, -78, d * 22, -74); ctx.quadraticCurveTo(d * 20, -64, d * 16, -57); ctx.closePath();
        fillStroke(ctx, lg(ctx, 0, -78, 0, -56, ['#e7d6ff', '#5a2a8a']), 2);
      });
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ell(ctx, -15, -45, 9, 5, -0.6); ctx.fill();
      ell(ctx, -5, -54, 3, 2, -0.6); ctx.fill();
      // 目
      [-11, 11].forEach((ex) => {
        ctx.fillStyle = '#fff'; ell(ctx, ex + 3, -30, 7.5, 9.5); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.fillStyle = '#120412'; ell(ctx, ex + 6, -28 + (p.hurt ? -2 : 0), 3.6, 5.5); ctx.fill();
        ctx.fillStyle = '#fff'; ell(ctx, ex + 7, -31, 1.4, 1.4); ctx.fill();
      });
      ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-18, -44); ctx.lineTo(-5, -38); ctx.moveTo(22, -44); ctx.lineTo(10, -38); ctx.stroke();
      // 口
      ctx.beginPath(); ctx.moveTo(-4, -15); ctx.quadraticCurveTo(5, p.lunge ? -6 : -10, 14, -15); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(8, -13.5); ctx.lineTo(10, -8); ctx.lineTo(12, -14); ctx.fill();
    },

    goblin(ctx, p, t, lv) {
      const lw = Math.sin(p.walk) * 0.5;
      // 足
      ctx.strokeStyle = OUT; ctx.lineCap = 'round';
      [[-7, lw], [7, -lw]].forEach(([lx, a]) => {
        ctx.save(); ctx.translate(lx, -22); ctx.rotate(a);
        ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.stroke();
        ctx.lineWidth = 7; ctx.strokeStyle = '#4b3a2a'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 19); ctx.stroke();
        ctx.fillStyle = '#2a1d12'; ell(ctx, 4, 21, 8, 4); ctx.fill();
        ctx.restore(); ctx.strokeStyle = OUT;
      });
      // 奥の腕
      ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-10, -42); ctx.lineTo(-18, -26); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#5f8f3a'; ctx.beginPath(); ctx.moveTo(-10, -42); ctx.lineTo(-18, -26); ctx.stroke();
      // 胴
      ctx.beginPath(); ctx.moveTo(-15, -46); ctx.lineTo(15, -46); ctx.lineTo(19, -18); ctx.lineTo(-19, -18); ctx.closePath();
      fillStroke(ctx, lg(ctx, -19, 0, 19, 0, ['#4a2418', '#8b4a2b', '#3a1a10']), 3);
      ctx.fillStyle = '#1d120a'; ctx.fillRect(-18, -27, 36, 5);
      ctx.fillStyle = '#d9a640'; ctx.fillRect(-3, -28, 6, 7);
      // 頭
      ctx.save(); ctx.translate(0, -62 + p.breath * 1.2);
      [-1, 1].forEach((d) => {
        ctx.beginPath(); ctx.moveTo(d * 14, -6); ctx.lineTo(d * 40, -16 + Math.sin(t * 6 + d) * 2); ctx.lineTo(d * 16, 6); ctx.closePath();
        fillStroke(ctx, lg(ctx, 0, -10, d * 40, 0, ['#8fc760', '#4c7a2e']), 2.5);
      });
      ell(ctx, 0, 0, 21, 19);
      fillStroke(ctx, rg(ctx, -6, -8, 2, 0, 0, 26, ['#b8ec82', '#6fa947', '#335a20']), 3);
      // 目
      [-8, 9].forEach((ex) => {
        glowEye(ctx, ex + 3, -3, 4.2, lv >= 5 ? '#ff3b3b' : '#ffd23b');
        ctx.fillStyle = '#000'; ctx.fillRect(ex + 2.4, -6, 1.6, 6);
      });
      ctx.strokeStyle = OUT; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, -11); ctx.lineTo(-2, -7); ctx.moveTo(17, -11); ctx.lineTo(6, -7); ctx.stroke();
      ctx.fillStyle = '#5d8f39'; ell(ctx, 6, 3, 5, 4); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 9); ctx.quadraticCurveTo(4, 16, 15, 8); ctx.closePath();
      fillStroke(ctx, '#2a0a0a', 2);
      ctx.fillStyle = '#fff'; [-4, 2, 8].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 9.5); ctx.lineTo(x + 2, 13); ctx.lineTo(x + 4, 9.5); ctx.fill(); });
      ctx.restore();
      // 棍棒腕
      ctx.save(); ctx.translate(12, -42); ctx.rotate(-0.5 + p.swing * 1.2);
      ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 16); ctx.stroke();
      ctx.strokeStyle = '#6fa947'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 16); ctx.stroke();
      ctx.translate(6, 16); ctx.rotate(-1.2);
      ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-6, -34); ctx.quadraticCurveTo(0, -44, 7, -34); ctx.lineTo(4, 4); ctx.closePath();
      fillStroke(ctx, lg(ctx, -6, 0, 7, 0, ['#5a3a1c', '#9b6a3a', '#4a2a10']), 2.5);
      ctx.fillStyle = '#cfd3db'; [[-6, -26], [6, -30], [-4, -36], [5, -20]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x < 0 ? -5 : 5), y - 2); ctx.lineTo(x, y + 4); ctx.fill(); });
      ctx.restore();
    },

    skeleton(ctx, p, t, lv) {
      const bone = '#ece4cf', lw = Math.sin(p.walk) * 0.45;
      ctx.lineCap = 'round';
      const boneLine = (x0, y0, x1, y1, w = 6) => {
        ctx.strokeStyle = OUT; ctx.lineWidth = w + 4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = bone; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      };
      // 盾（奥）
      ctx.save(); ctx.translate(-16, -44); ctx.rotate(-0.2 + p.breath * 0.03);
      ell(ctx, 0, 0, 17, 20); fillStroke(ctx, lg(ctx, -17, 0, 17, 0, ['#3b2a1a', '#7a5432', '#3b2a1a']), 3);
      ell(ctx, 0, 0, 13, 16); ctx.lineWidth = 3; ctx.strokeStyle = '#8f96a8'; ctx.stroke();
      ctx.fillStyle = '#d23b3b'; ell(ctx, 0, 0, 4, 4); ctx.fill();
      ctx.restore();
      // 足
      [[-6, lw], [6, -lw]].forEach(([lx, a]) => {
        ctx.save(); ctx.translate(lx, -28); ctx.rotate(a);
        boneLine(0, 0, 0, 13, 5); boneLine(0, 13, 1, 26, 4.5);
        ctx.fillStyle = bone; ell(ctx, 4, 27, 6, 3); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.restore();
      });
      // 骨盤・背骨・肋骨
      ell(ctx, 0, -30, 12, 6); fillStroke(ctx, bone, 3);
      boneLine(0, -30, 0, -62, 5);
      for (let i = 0; i < 3; i++) {
        const y = -56 + i * 7, w = 15 - i * 2;
        ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, y, w, 4, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
        ctx.strokeStyle = bone; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, y, w, 4, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      }
      // 頭蓋骨
      ctx.save(); ctx.translate(2, -78 + p.breath * 1.5);
      ctx.beginPath(); ctx.arc(0, 0, 15, Math.PI * 0.85, Math.PI * 0.15); ctx.lineTo(9, 13); ctx.lineTo(-7, 13); ctx.closePath();
      fillStroke(ctx, rg(ctx, -4, -6, 1, 0, 0, 20, ['#fffaf0', bone, '#a89c80']), 3);
      ctx.fillStyle = '#120a0a';
      ell(ctx, -3, 1, 4.5, 5); ctx.fill(); ell(ctx, 8, 1, 4.5, 5); ctx.fill();
      glowEye(ctx, -2, 2, 2.2, lv >= 5 ? '#8a5bff' : '#ff3030'); glowEye(ctx, 9, 2, 2.2, lv >= 5 ? '#8a5bff' : '#ff3030');
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      for (let i = -5; i <= 7; i += 3) { ctx.beginPath(); ctx.moveTo(i, 9 + (p.lunge ? 3 : 0)); ctx.lineTo(i, 13 + (p.lunge ? 3 : 0)); ctx.stroke(); }
      // 兜（Lv3以上）
      if (lv >= 3) {
        ctx.beginPath(); ctx.arc(0, -2, 17, Math.PI, 0); ctx.lineTo(17, -4); ctx.lineTo(-17, -4); ctx.closePath();
        fillStroke(ctx, lg(ctx, 0, -20, 0, -2, ['#b9c0d2', '#4a5064']), 2.5);
        ctx.fillStyle = '#c2182a'; ctx.beginPath(); ctx.moveTo(-2, -19); ctx.quadraticCurveTo(-16, -34, -26, -24); ctx.quadraticCurveTo(-12, -24, -2, -15); ctx.fill();
      }
      ctx.restore();
      // 剣腕
      ctx.save(); ctx.translate(10, -58); ctx.rotate(-0.3 + p.swing * 1.1);
      boneLine(0, 0, 8, 14, 4.5); boneLine(8, 14, 16, 22, 4);
      ctx.translate(16, 22); ctx.rotate(-1.0);
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-3, -46); ctx.lineTo(0, -52); ctx.lineTo(3, -46); ctx.lineTo(3, 0); ctx.closePath();
      fillStroke(ctx, lg(ctx, -3, 0, 3, 0, ['#9aa4ba', '#ffffff', '#6b7488']), 2);
      ctx.fillStyle = '#c9a23a'; ctx.fillRect(-9, -2, 18, 4); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(-9, -2, 18, 4);
      ctx.restore();
    },

    imp(ctx, p, t, lv) {
      const flap = Math.sin(t * 9 + (p.walk || 0)) * 0.5;
      const hover = Math.sin(t * 3) * 5;
      ctx.translate(0, -22 + hover);
      // 翼
      [-1, 1].forEach((d) => {
        ctx.save(); ctx.translate(d * 6, -46); ctx.rotate(d * (0.25 + flap * 0.6));
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(d * 30, -40, d * 58, -26);
        ctx.quadraticCurveTo(d * 50, -14, d * 54, -4);
        ctx.quadraticCurveTo(d * 40, -8, d * 38, 6);
        ctx.quadraticCurveTo(d * 26, 0, d * 20, 14);
        ctx.quadraticCurveTo(d * 12, 6, 0, 8); ctx.closePath();
        fillStroke(ctx, lg(ctx, 0, -30, d * 58, 10, ['#3a1d52', '#6b3a8f', '#1a0a2a']), 2.5);
        ctx.strokeStyle = 'rgba(200,150,255,0.35)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d * 54, -4); ctx.moveTo(0, 0); ctx.lineTo(d * 38, 6); ctx.stroke();
        ctx.restore();
      });
      // 尾
      ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.lineCap = 'round';
      const tw = Math.sin(t * 4) * 8;
      ctx.beginPath(); ctx.moveTo(-6, -22); ctx.quadraticCurveTo(-30, -6 + tw, -38, -26); ctx.stroke();
      ctx.strokeStyle = '#5a3a7a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-6, -22); ctx.quadraticCurveTo(-30, -6 + tw, -38, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-38, -26); ctx.lineTo(-46, -26); ctx.lineTo(-38, -36); ctx.lineTo(-32, -28); ctx.closePath(); fillStroke(ctx, '#5a3a7a', 2);
      // 足
      [-7, 7].forEach((lx) => { ctx.beginPath(); ctx.moveTo(lx - 4, -24); ctx.lineTo(lx, -8); ctx.lineTo(lx + 4, -24); fillStroke(ctx, '#4a2f66', 2.5); });
      // 胴
      ell(ctx, 0, -36, 16, 18); fillStroke(ctx, rg(ctx, -5, -42, 2, 0, -36, 24, ['#a98bc9', '#5d3d80', '#24123a']), 3);
      ctx.fillStyle = 'rgba(255,220,180,0.25)'; ell(ctx, 3, -32, 8, 10); ctx.fill();
      // 頭
      ctx.save(); ctx.translate(2, -62);
      [-1, 1].forEach((d) => {
        ctx.beginPath(); ctx.moveTo(d * 8, -10); ctx.quadraticCurveTo(d * 20, -22, d * 14, -34); ctx.quadraticCurveTo(d * 12, -20, d * 3, -12); ctx.closePath();
        fillStroke(ctx, lg(ctx, 0, -34, 0, -10, ['#fff3d6', '#8a6a3a']), 2);
        ctx.beginPath(); ctx.moveTo(d * 14, -2); ctx.lineTo(d * 26, -8); ctx.lineTo(d * 14, 4); ctx.closePath(); fillStroke(ctx, '#6b4a8f', 2);
      });
      ell(ctx, 0, 0, 15, 13); fillStroke(ctx, rg(ctx, -4, -5, 1, 0, 0, 18, ['#b99ad8', '#6b4a8f', '#2a1640']), 3);
      glowEye(ctx, -4, -2, 3.5, '#ffe03b'); glowEye(ctx, 8, -2, 3.5, '#ffe03b');
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-7, 6); ctx.quadraticCurveTo(3, 12, 12, 5); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-3, 7.5); ctx.lineTo(-1, 11); ctx.lineTo(1, 8.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(7, 8); ctx.lineTo(9, 11); ctx.lineTo(10, 7); ctx.fill();
      ctx.restore();
      // 爪腕
      ctx.save(); ctx.translate(12, -42); ctx.rotate(0.3 + p.swing * 0.9);
      ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 12); ctx.stroke();
      ctx.strokeStyle = '#7a5a9f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 12); ctx.stroke();
      ctx.fillStyle = '#f0e6ff'; [0, 1, 2].forEach((k) => { ctx.beginPath(); ctx.moveTo(14, 10 + k * 2); ctx.lineTo(24, 8 + k * 5); ctx.lineTo(14, 14 + k * 2); ctx.fill(); });
      ctx.restore();
    },

    dragon(ctx, p, t, lv) {
      const flap = Math.sin(t * 3) * 0.25;
      ctx.scale(1.25, 1.25);
      // 尾
      ctx.beginPath(); ctx.moveTo(-30, -30);
      ctx.quadraticCurveTo(-80, -20 + Math.sin(t * 2) * 8, -96, -52);
      ctx.quadraticCurveTo(-74, -34, -28, -16); ctx.closePath();
      fillStroke(ctx, lg(ctx, -96, -50, -28, -20, ['#3a0a0a', '#8a1a1a']), 3);
      // 奥の翼
      const wing = (d, a, col) => {
        ctx.save(); ctx.translate(-4, -60); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(-30, -70); ctx.quadraticCurveTo(-46, -60, -70, -62);
        ctx.quadraticCurveTo(-60, -40, -72, -22); ctx.quadraticCurveTo(-52, -26, -48, -6);
        ctx.quadraticCurveTo(-30, -12, -20, 8); ctx.closePath();
        fillStroke(ctx, col, 3);
        ctx.strokeStyle = 'rgba(255,140,90,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-30, -70); ctx.lineTo(-48, -6); ctx.moveTo(-30, -70); ctx.lineTo(-72, -22); ctx.stroke();
        ctx.restore();
      };
      wing(-1, -0.2 - flap, lg(ctx, -70, -70, 0, 0, ['#2a0606', '#5a1010']));
      // 脚
      [-14, 16].forEach((lx, i) => {
        ctx.beginPath(); ctx.moveTo(lx - 9, -26); ctx.quadraticCurveTo(lx - 12, -6, lx - 6, 0); ctx.lineTo(lx + 10, 0); ctx.quadraticCurveTo(lx + 8, -14, lx + 10, -26); ctx.closePath();
        fillStroke(ctx, i ? '#7a1616' : '#5a0e0e', 3);
        ctx.fillStyle = '#f3e6c8'; [0, 5, 10].forEach((k) => { ctx.beginPath(); ctx.moveTo(lx - 6 + k, 0); ctx.lineTo(lx - 3 + k, 4); ctx.lineTo(lx + k, 0); ctx.fill(); });
      });
      // 胴
      ell(ctx, 0, -40, 38, 26); fillStroke(ctx, rg(ctx, 6, -54, 3, 0, -40, 46, ['#e0503a', '#9a1c1c', '#3a0606']), 3);
      ctx.save(); ell(ctx, 0, -40, 38, 26); ctx.clip();
      ctx.fillStyle = '#e8b35a';
      for (let i = 0; i < 5; i++) { ell(ctx, 18 + i * 1, -42 + i * 7, 14, 4); ctx.fill(); }
      ctx.restore();
      // 首と頭
      const lunge = p.lunge;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(18, -56); ctx.quadraticCurveTo(36 + lunge * 10, -90, 44 + lunge * 18, -96 + lunge * 16); ctx.lineTo(58 + lunge * 18, -86 + lunge * 16); ctx.quadraticCurveTo(46, -64, 34, -40); ctx.closePath();
      fillStroke(ctx, lg(ctx, 20, -90, 50, -40, ['#b52a22', '#6a1010']), 3);
      ctx.translate(52 + lunge * 18, -96 + lunge * 16 + p.breath * 1.5);
      const jaw = lunge * 0.5;
      // 角
      [[-6, -10, -26, -26], [2, -12, -10, -34]].forEach(([x0, y0, x1, y1]) => {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1 + 4, y1 + 8, x1, y1); ctx.quadraticCurveTo(x1 + 12, y1 + 12, x0 + 8, y0 + 2); ctx.closePath();
        fillStroke(ctx, lg(ctx, x1, y1, x0, y0, ['#fff3d6', '#9a7a4a']), 2);
      });
      // 下顎
      ctx.save(); ctx.rotate(jaw);
      ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(34, 4); ctx.lineTo(30, 12); ctx.lineTo(-6, 12); ctx.closePath(); fillStroke(ctx, '#8a1a1a', 2.5);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-12, -8); ctx.quadraticCurveTo(10, -16, 36, -4); ctx.lineTo(38, 4); ctx.lineTo(-10, 6); ctx.closePath();
      fillStroke(ctx, rg(ctx, 4, -10, 2, 6, -4, 34, ['#e45a40', '#a01e1e', '#4a0808']), 3);
      if (jaw > 0.05) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(MK.FX.glow('rgba(255,140,40,0.9)', 64), 20, -14, 40, 40);
        ctx.restore();
      }
      ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 7, 4); ctx.lineTo(13 + i * 7, 9); ctx.lineTo(16 + i * 7, 4); ctx.fill(); }
      glowEye(ctx, 12, -7, 3.6, '#ffd03a');
      ctx.fillStyle = '#000'; ctx.fillRect(11.5, -10, 1.4, 6);
      ctx.restore();
      wing(1, 0.15 + flap, lg(ctx, -70, -70, 0, 0, ['#5a1010', '#b02a20', '#4a0a0a']));
    },
  };

  // ---------- 勇者パーティー ----------
  function humanLegs(ctx, p, pants, boots) {
    const lw = Math.sin(p.walk) * 0.5;
    [[-6, lw], [6, -lw]].forEach(([lx, a]) => {
      ctx.save(); ctx.translate(lx, -26); ctx.rotate(a);
      ctx.beginPath(); ctx.roundRect(-5, 0, 10, 20, 3); fillStroke(ctx, pants, 2.5);
      ctx.beginPath(); ctx.roundRect(-6, 14, 14, 12, 3); fillStroke(ctx, boots, 2.5);
      ctx.restore();
    });
  }
  function face(ctx, x, y, r, skin, mood) {
    ell(ctx, x, y, r, r * 1.02);
    fillStroke(ctx, rg(ctx, x - r * 0.3, y - r * 0.3, 1, x, y, r * 1.2, ['#fff1e0', skin, '#a86a4a']), 3);
    ctx.fillStyle = '#1a1020';
    ell(ctx, x + r * 0.2, y + 1, 2.2, mood === 'hurt' ? 0.8 : 3.2); ctx.fill();
    ell(ctx, x + r * 0.62, y + 1, 2, mood === 'hurt' ? 0.8 : 3); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + r * 0.05, y - 5); ctx.lineTo(x + r * 0.4, y - 3.5); ctx.moveTo(x + r * 0.5, y - 3.5); ctx.lineTo(x + r * 0.8, y - 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + r * 0.3, y + r * 0.55); ctx.lineTo(x + r * 0.65, y + r * 0.5); ctx.stroke();
  }
  const Heroes = {
    hero(ctx, p, t) {
      // マント
      const wave = Math.sin(t * 5) * 6;
      ctx.beginPath(); ctx.moveTo(-10, -62); ctx.quadraticCurveTo(-30 - wave, -30, -26 - wave, -8); ctx.lineTo(-4, -14); ctx.lineTo(8, -60); ctx.closePath();
      fillStroke(ctx, lg(ctx, -30, -60, 0, -8, ['#1b3fa8', '#0b1a52']), 3);
      humanLegs(ctx, p, '#2a3a6a', '#5a3a1a');
      // 胴（鎧）
      ctx.beginPath(); ctx.roundRect(-14, -64, 28, 40, 7);
      fillStroke(ctx, lg(ctx, -14, 0, 14, 0, ['#7c8aa8', '#f4f7ff', '#8b96b0', '#4a5470']), 3);
      ctx.fillStyle = '#d4a531'; ctx.fillRect(-14, -30, 28, 5);
      ctx.fillStyle = '#2e6bff'; ell(ctx, 0, -50, 5, 6); ctx.fill();
      // 頭
      ctx.save(); ctx.translate(0, -80 + p.breath);
      ctx.beginPath(); ctx.moveTo(-18, 2);
      [[-22, -14], [-12, -10], [-14, -26], [-2, -14], [2, -30], [8, -14], [18, -24], [16, -8], [24, -4], [16, 2]].forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.closePath(); fillStroke(ctx, lg(ctx, 0, -30, 0, 2, ['#fff6b0', '#f0b52a', '#a86a10']), 3);
      face(ctx, 2, 2, 15, '#f2c39a', p.hurt > 0.3 ? 'hurt' : '');
      ctx.fillStyle = '#c21d2a'; ctx.fillRect(-13, -9, 30, 4);
      ctx.restore();
      // 剣
      ctx.save(); ctx.translate(12, -50); ctx.rotate(-0.6 + p.swing * 1.3);
      ctx.fillStyle = '#f2c39a'; ell(ctx, 0, 0, 5, 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-3, -58); ctx.lineTo(0, -66); ctx.lineTo(3, -58); ctx.lineTo(3, -2); ctx.closePath();
      fillStroke(ctx, lg(ctx, -3, 0, 3, 0, ['#b8d8ff', '#ffffff', '#7aa6e8']), 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
      ctx.drawImage(MK.FX.glow('rgba(120,190,255,0.8)', 64), -14, -70, 28, 72); ctx.restore();
      ctx.fillStyle = '#d4a531'; ctx.fillRect(-10, -4, 20, 5); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(-10, -4, 20, 5);
      ctx.restore();
    },
    warrior(ctx, p, t) {
      ctx.scale(1.1, 1.1);
      humanLegs(ctx, p, '#5a3a22', '#2a1a0e');
      ctx.beginPath(); ctx.roundRect(-18, -64, 36, 42, 9);
      fillStroke(ctx, lg(ctx, -18, 0, 18, 0, ['#5a3a22', '#a0703f', '#4a2a12']), 3);
      [-1, 1].forEach((d) => { ell(ctx, d * 17, -60, 10, 8); fillStroke(ctx, lg(ctx, 0, -68, 0, -52, ['#e6eaf2', '#6a7086']), 2.5); });
      ctx.save(); ctx.translate(0, -80 + p.breath);
      face(ctx, 2, 2, 15, '#e6a77a', p.hurt > 0.3 ? 'hurt' : '');
      ctx.fillStyle = '#7a3a12'; ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(6, 26, 18, 8); ctx.quadraticCurveTo(6, 14, -8, 8); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -2, 17, Math.PI, 0); ctx.lineTo(19, 0); ctx.lineTo(-15, 0); ctx.closePath();
      fillStroke(ctx, lg(ctx, 0, -20, 0, 0, ['#e6eaf2', '#7a8096']), 2.5);
      [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(2 + d * 13, -10); ctx.quadraticCurveTo(2 + d * 28, -18, 2 + d * 26, -34); ctx.quadraticCurveTo(2 + d * 20, -20, 2 + d * 8, -16); ctx.closePath(); fillStroke(ctx, '#f6edd5', 2); });
      ctx.restore();
      ctx.save(); ctx.translate(14, -48); ctx.rotate(-0.4 + p.swing * 1.2);
      ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -54); ctx.stroke();
      ctx.strokeStyle = '#6a4220'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -54); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -54); ctx.quadraticCurveTo(26, -60, 24, -34); ctx.quadraticCurveTo(14, -40, 0, -38); ctx.closePath();
      fillStroke(ctx, lg(ctx, 0, -60, 24, -34, ['#ffffff', '#8a92a8']), 2.5);
      ctx.restore();
    },
    mage(ctx, p, t) {
      ctx.beginPath(); ctx.moveTo(-10, -66); ctx.lineTo(10, -66); ctx.lineTo(22, 0); ctx.lineTo(-22, 0); ctx.closePath();
      fillStroke(ctx, lg(ctx, -22, 0, 22, 0, ['#5a0a1a', '#b0203a', '#4a0614']), 3);
      ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-21, -4); ctx.lineTo(21, -4); ctx.stroke();
      ctx.save(); ctx.translate(0, -78 + p.breath);
      face(ctx, 2, 2, 14, '#f4cfa8', p.hurt > 0.3 ? 'hurt' : '');
      ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.quadraticCurveTo(-18, 14, -10, 22); ctx.lineTo(-8, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(28, -6); ctx.lineTo(10, -12); ctx.quadraticCurveTo(8, -34, -18 + Math.sin(t * 3) * 3, -46); ctx.quadraticCurveTo(-4, -30, -8, -12); ctx.closePath();
      fillStroke(ctx, lg(ctx, 0, -46, 0, -6, ['#7a1028', '#3a0612']), 3);
      ctx.fillStyle = '#e8c35a'; ctx.fillRect(-8, -12, 18, 4);
      ctx.restore();
      ctx.save(); ctx.translate(14, -44); ctx.rotate(0.1 + p.swing * 0.5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(0, -40); ctx.stroke();
      ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(0, -40); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(MK.FX.glow('rgba(80,170,255,0.9)', 64), -18, -62, 36, 36); ctx.restore();
      ell(ctx, 0, -44, 6, 6); fillStroke(ctx, '#bfe8ff', 2);
      ctx.restore();
    },
    priest(ctx, p, t) {
      ctx.beginPath(); ctx.moveTo(-11, -64); ctx.lineTo(11, -64); ctx.lineTo(20, 0); ctx.lineTo(-20, 0); ctx.closePath();
      fillStroke(ctx, lg(ctx, -20, 0, 20, 0, ['#a8a6b8', '#ffffff', '#9a98ac']), 3);
      ctx.fillStyle = '#d9b347'; ctx.fillRect(-3, -64, 6, 64);
      ctx.save(); ctx.translate(0, -76 + p.breath);
      face(ctx, 2, 2, 14, '#f6d4b0', p.hurt > 0.3 ? 'hurt' : '');
      ctx.fillStyle = '#9a5a2a'; ctx.beginPath(); ctx.arc(2, -2, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-6, -28); ctx.lineTo(2, -34); ctx.lineTo(10, -28); ctx.lineTo(16, -8); ctx.closePath();
      fillStroke(ctx, lg(ctx, 0, -34, 0, -8, ['#ffffff', '#c9c6d8']), 2.5);
      ctx.fillStyle = '#d9b347'; ctx.fillRect(1, -30, 3, 18); ctx.fillRect(-3, -24, 11, 3);
      ctx.restore();
      ctx.save(); ctx.translate(-14, -40); ctx.rotate(-0.1 - p.swing * 0.3);
      ctx.strokeStyle = '#d9b347'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, 38); ctx.lineTo(0, -40); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -48, 9, 0, TAU); ctx.stroke();
      ctx.restore();
    },
  };

  // ---------- 共通キャラ描画 ----------
  function drawChar(ctx, kind, table, m, t, imgKey) {
    const p = animPose(m, t);
    const s = m.s || 1;
    const face = m.face || 1;
    shadow(ctx, m.x, m.y + 2, 30 * s * (kind === 'dragon' ? 2 : 1), m.anim === 'down' ? 0.2 : 0.45);
    ctx.save();
    ctx.translate(m.x + p.dx * face * s, m.y + p.dy * s);
    if (m.alpha != null) ctx.globalAlpha = m.alpha;
    if (p.down) { ctx.rotate(face * -1.35); ctx.translate(0, 10 * s); }
    const asset = MK.Assets.img(imgKey);
    if (asset) {
      const h = 120 * s * (kind === 'dragon' ? 1.7 : 1);
      ctx.scale(face, 1);
      ctx.drawImage(asset, -h / 2, -h, h, h);
    } else {
      ctx.scale(s * face, s);
      table[kind](ctx, p, t, m.lv || 1);
    }
    ctx.restore();
    // 被ダメージ時の白フラッシュ（簡易）
    if (p.hurt > 0.5) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (p.hurt - 0.5) * 1.4;
      ctx.drawImage(MK.FX.glow('rgba(255,255,255,0.8)', 64), m.x - 40 * s, m.y - 100 * s, 80 * s, 100 * s);
      ctx.restore();
    }
  }

  // ---------- 魔王バストアップ ----------
  function maou(ctx, x, y, s, t, mood = 'grin') {
    const asset = MK.Assets.img('maou.' + mood);
    if (asset) { const h = 460 * s; ctx.drawImage(asset, x - h / 2, y - h, h, h); return; }
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    const br = Math.sin(t * 2.2) * 3;
    // オーラ
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(MK.FX.glow('rgba(160,40,255,0.5)', 128), -260, -520, 520, 520);
    ctx.restore();
    // マント襟
    ctx.beginPath();
    ctx.moveTo(-200, 0); ctx.lineTo(-190, -220); ctx.lineTo(-150, -330); ctx.lineTo(-120, -250);
    ctx.lineTo(-80, -300); ctx.lineTo(0, -230); ctx.lineTo(80, -300); ctx.lineTo(120, -250); ctx.lineTo(150, -330); ctx.lineTo(190, -220); ctx.lineTo(200, 0); ctx.closePath();
    fillStroke(ctx, lg(ctx, 0, -330, 0, 0, ['#5a0a1a', '#2a0410', '#0a0006']), 5);
    ctx.beginPath(); ctx.moveTo(-150, -310); ctx.lineTo(-120, -240); ctx.lineTo(-70, -150); ctx.lineTo(-170, -200); ctx.closePath(); fillStroke(ctx, lg(ctx, -150, -300, -100, -150, ['#c21a3a', '#5a0818']), 3);
    ctx.beginPath(); ctx.moveTo(150, -310); ctx.lineTo(120, -240); ctx.lineTo(70, -150); ctx.lineTo(170, -200); ctx.closePath(); fillStroke(ctx, lg(ctx, 150, -300, 100, -150, ['#c21a3a', '#5a0818']), 3);
    // 胴鎧
    ctx.beginPath(); ctx.moveTo(-170, 0); ctx.quadraticCurveTo(-150, -120, -70, -150); ctx.lineTo(70, -150); ctx.quadraticCurveTo(150, -120, 170, 0); ctx.closePath();
    fillStroke(ctx, lg(ctx, -170, 0, 170, 0, ['#14101e', '#3a3450', '#6a6290', '#2a2438', '#0c0a14']), 5);
    ctx.strokeStyle = 'rgba(190,140,255,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -140); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = '#c21a3a'; ctx.save(); ctx.translate(0, -80); ctx.rotate(Math.PI / 4); ctx.fillRect(-16, -16, 32, 32); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(255,40,60,0.8)', 64), -30, -110, 60, 60); ctx.restore();
    // 肩当て
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(d * 60, -150); ctx.quadraticCurveTo(d * 140, -190, d * 190, -120); ctx.lineTo(d * 210, -150); ctx.lineTo(d * 186, -90); ctx.quadraticCurveTo(d * 130, -110, d * 70, -100); ctx.closePath();
      fillStroke(ctx, lg(ctx, d * 60, -180, d * 200, -90, ['#4a4466', '#1a1626']), 4);
      ctx.beginPath(); ctx.moveTo(d * 120, -170); ctx.lineTo(d * 150, -230); ctx.lineTo(d * 150, -165); ctx.closePath(); fillStroke(ctx, '#2a2438', 3);
    });
    // 首・顔
    ctx.save(); ctx.translate(0, br);
    ctx.beginPath(); ctx.moveTo(-36, -150); ctx.lineTo(36, -150); ctx.lineTo(30, -200); ctx.lineTo(-30, -200); ctx.closePath(); fillStroke(ctx, '#3a4460', 4);
    // 耳
    [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(d * 58, -250); ctx.lineTo(d * 100, -290); ctx.lineTo(d * 62, -222); ctx.closePath(); fillStroke(ctx, '#5a6a8a', 3); });
    ctx.beginPath(); ctx.moveTo(-62, -300); ctx.quadraticCurveTo(-66, -200, 0, -176); ctx.quadraticCurveTo(66, -200, 62, -300); ctx.quadraticCurveTo(0, -330, -62, -300); ctx.closePath();
    fillStroke(ctx, rg(ctx, -20, -280, 5, 0, -250, 100, ['#9aa8c8', '#5a6888', '#232a40']), 4);
    // 角
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(d * 40, -300);
      ctx.bezierCurveTo(d * 110, -330, d * 150, -390, d * 120, -470);
      ctx.bezierCurveTo(d * 170, -400, d * 140, -320, d * 62, -270); ctx.closePath();
      fillStroke(ctx, lg(ctx, d * 40, -280, d * 130, -470, ['#4a3a24', '#d8c8a0', '#fff6dc']), 4);
      ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 3;
      for (let i = 1; i < 5; i++) { const k = i / 5; ctx.beginPath(); ctx.moveTo(d * (50 + 70 * k), -295 - 120 * k); ctx.lineTo(d * (70 + 70 * k), -285 - 100 * k); ctx.stroke(); }
    });
    // 王冠
    ctx.beginPath(); ctx.moveTo(-40, -306); ctx.lineTo(-30, -340); ctx.lineTo(-14, -318); ctx.lineTo(0, -352); ctx.lineTo(14, -318); ctx.lineTo(30, -340); ctx.lineTo(40, -306); ctx.closePath();
    fillStroke(ctx, lg(ctx, 0, -352, 0, -306, ['#fff1a0', '#d9a020', '#6a4008']), 3);
    ctx.fillStyle = '#ff2040'; ell(ctx, 0, -320, 5, 6); ctx.fill();
    // 眉・目
    const eyeY = -258;
    ctx.fillStyle = '#0a0612';
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(d * 14, eyeY - 8); ctx.lineTo(d * 52, eyeY - 26 - (mood === 'angry' ? 8 : 0)); ctx.lineTo(d * 50, eyeY - 14); ctx.lineTo(d * 16, eyeY + 2); ctx.closePath(); ctx.fill();
      const ex = d * 30;
      if (mood === 'shock') {
        ctx.fillStyle = '#fff'; ell(ctx, ex, eyeY + 4, 12, 14); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#c00'; ell(ctx, ex, eyeY + 4, 3, 3); ctx.fill(); ctx.fillStyle = '#0a0612';
      } else {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(MK.FX.glow('rgba(255,30,30,0.9)', 64), ex - 34, eyeY - 30, 68, 60); ctx.restore();
        ctx.beginPath(); ctx.moveTo(ex - d * 16, eyeY - 2); ctx.quadraticCurveTo(ex, eyeY - 8, ex + d * 16, eyeY + 2); ctx.quadraticCurveTo(ex, eyeY + 10, ex - d * 16, eyeY - 2); ctx.closePath();
        ctx.fillStyle = '#ff3a2a'; ctx.fill(); ctx.fillStyle = '#fff3b0'; ell(ctx, ex, eyeY + 1, 3, 4); ctx.fill(); ctx.fillStyle = '#0a0612';
      }
    });
    // 口
    const mouthOpen = mood === 'laugh' ? 26 + Math.abs(Math.sin(t * 14)) * 8 : mood === 'shock' ? 18 : mood === 'angry' ? 14 : 8;
    ctx.beginPath(); ctx.moveTo(-34, -214); ctx.quadraticCurveTo(0, -206 + (mood === 'shock' ? -10 : 6), 34, -214);
    ctx.quadraticCurveTo(0, -210 + mouthOpen + 10, -34, -214); ctx.closePath();
    fillStroke(ctx, '#2a0008', 3);
    ctx.fillStyle = '#fff';
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 9 - 4, -212); ctx.lineTo(i * 9, -203); ctx.lineTo(i * 9 + 4, -212); ctx.fill(); }
    [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(d * 22, -212); ctx.lineTo(d * 18, -196); ctx.lineTo(d * 14, -211); ctx.fill(); });
    if (mood === 'shock') {
      ctx.fillStyle = 'rgba(160,220,255,0.9)';
      [[70, -290], [-80, -270]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.moveTo(sx, sy - 18); ctx.quadraticCurveTo(sx + 10, sy, sx, sy + 6); ctx.quadraticCurveTo(sx - 10, sy, sx, sy - 18); ctx.fill(); });
    }
    ctx.restore();
    // 手（帳簿 / 金貨）
    if (mood === 'grin' || mood === 'laugh') {
      ctx.save(); ctx.translate(120, -60); ctx.rotate(-0.25);
      ctx.beginPath(); ctx.roundRect(-60, -80, 120, 90, 6); fillStroke(ctx, lg(ctx, 0, -80, 0, 10, ['#7a1020', '#3a0610']), 4);
      ctx.fillStyle = '#f3e6c0'; ctx.fillRect(-52, -72, 104, 74);
      ctx.fillStyle = '#3a0610'; ctx.font = 'bold 22px "Shippori Mincho B1", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('魔王城 収支', 0, -56);
      ctx.strokeStyle = '#3a0610'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-44, -36 + i * 13); ctx.lineTo(44, -36 + i * 13); ctx.stroke(); }
      ctx.fillStyle = '#c01020'; ctx.font = 'bold 18px "Dela Gothic One", sans-serif'; ctx.fillText('黒字!!', 18, -10);
      ctx.restore();
      ctx.beginPath(); ell(ctx, 70, -40, 30, 26); fillStroke(ctx, '#5a6888', 4);
    } else {
      ctx.beginPath(); ell(ctx, 120, -40, 44, 38); fillStroke(ctx, rg(ctx, 110, -55, 2, 120, -40, 50, ['#9aa8c8', '#3a4460']), 4);
      ctx.strokeStyle = OUT; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(90 + i * 18, -70); ctx.lineTo(96 + i * 18, -40); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- 魔王城 ----------
  function stoneGrad(ctx, x, w) {
    return lg(ctx, x - w / 2, 0, x + w / 2, 0, ['#14121e', '#2c2a3e', '#4b4864', '#24223a', '#0d0c16']);
  }
  function windowLit(ctx, x, y, w, h, t, seed) {
    const f = 0.75 + 0.25 * Math.sin(t * 7 + seed * 3.1) * Math.sin(t * 3.3 + seed);
    ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x - w / 2, y - h / 4); ctx.quadraticCurveTo(x, y - h / 2 - 3, x + w / 2, y - h / 4); ctx.lineTo(x + w / 2, y + h / 2); ctx.closePath();
    ctx.fillStyle = `rgba(255,${160 + f * 50 | 0},60,${f})`; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * f;
    ctx.drawImage(MK.FX.glow('rgba(255,150,40,0.8)', 64), x - w * 2.5, y - h * 1.6, w * 5, h * 3.2); ctx.restore();
  }
  function tower(ctx, x, base, w, h, t, opt = {}) {
    const top = base - h;
    ctx.beginPath(); ctx.rect(x - w / 2, top, w, h);
    fillStroke(ctx, stoneGrad(ctx, x, w), 3);
    // 石積み
    ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, top, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let yy = top + 12, r = 0; yy < base; yy += 12, r++) {
      ctx.beginPath(); ctx.moveTo(x - w / 2, yy); ctx.lineTo(x + w / 2, yy); ctx.stroke();
      for (let xx = x - w / 2 + (r % 2) * 10; xx < x + w / 2; xx += 20) { ctx.beginPath(); ctx.moveTo(xx, yy - 12); ctx.lineTo(xx, yy); ctx.stroke(); }
    }
    ctx.restore();
    // 窓
    const nwin = opt.windows == null ? Math.max(1, Math.floor(h / 60)) : opt.windows;
    for (let i = 0; i < nwin; i++) windowLit(ctx, x, top + 30 + i * 52, Math.min(12, w * 0.2), 18, t, x * 0.1 + i);
    // 屋根
    if (opt.roof === 'cone') {
      const rh = opt.roofH || w * 1.4;
      ctx.beginPath(); ctx.moveTo(x - w / 2 - 8, top + 2); ctx.lineTo(x, top - rh); ctx.lineTo(x + w / 2 + 8, top + 2); ctx.closePath();
      fillStroke(ctx, lg(ctx, x - w / 2, 0, x + w / 2, 0, ['#1a0a22', '#4a2058', '#6a3a7a', '#24102e']), 3);
      ctx.strokeStyle = '#0a0610'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, top - rh); ctx.lineTo(x, top - rh - 16); ctx.stroke();
      if (opt.flag) {
        const wv = Math.sin(t * 6 + x) * 4;
        ctx.beginPath(); ctx.moveTo(x, top - rh - 16); ctx.quadraticCurveTo(x + 14, top - rh - 18 + wv, x + 26, top - rh - 12 + wv); ctx.lineTo(x, top - rh - 6); ctx.closePath();
        fillStroke(ctx, '#b01226', 1.5);
      }
    } else if (opt.roof === 'ruin') {
      ctx.beginPath(); ctx.moveTo(x - w / 2, top); ctx.lineTo(x - w / 2 + 8, top - 14); ctx.lineTo(x - 6, top - 4); ctx.lineTo(x + 4, top - 22); ctx.lineTo(x + w / 2 - 6, top - 6); ctx.lineTo(x + w / 2, top); ctx.closePath();
      fillStroke(ctx, stoneGrad(ctx, x, w), 3);
    } else {
      // 胸壁
      for (let xx = x - w / 2; xx < x + w / 2 - 2; xx += 14) { ctx.beginPath(); ctx.rect(xx, top - 10, 9, 10); fillStroke(ctx, '#2c2a3e', 2); }
    }
  }
  function castle(ctx, x, y, s, lv, t) {
    lv = U.clamp(lv | 0, 1, 5);
    const asset = MK.Assets.img('castle.' + lv);
    if (asset) { ctx.drawImage(asset, x - 320 * s, y - 480 * s, 640 * s, 480 * s); return; }
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    // 背後のオーラ
    if (lv >= 4) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 2);
      ctx.drawImage(MK.FX.glow(lv >= 5 ? 'rgba(200,40,80,0.6)' : 'rgba(140,60,255,0.5)', 128), -380, -560, 760, 640);
      ctx.restore();
    }
    // 崖
    ctx.beginPath(); ctx.moveTo(-300, 60); ctx.lineTo(-260, 10); ctx.lineTo(-200, 0); ctx.lineTo(200, 0); ctx.lineTo(270, 14); ctx.lineTo(310, 60); ctx.closePath();
    fillStroke(ctx, lg(ctx, 0, 0, 0, 60, ['#2a2436', '#0c0a12']), 3);
    if (lv === 1) {
      tower(ctx, 0, 0, 74, 160, t, { roof: 'ruin', windows: 1 });
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(44, 0); ctx.lineTo(44, -120); ctx.moveTo(76, 0); ctx.lineTo(76, -100); ctx.moveTo(40, -40); ctx.lineTo(80, -40); ctx.moveTo(40, -80); ctx.lineTo(80, -80); ctx.moveTo(44, -40); ctx.lineTo(76, -80); ctx.stroke();
      ctx.fillStyle = '#2a2436'; ctx.fillRect(-90, -16, 40, 16); ctx.fillRect(-60, -30, 20, 14);
    } else {
      if (lv >= 5) { tower(ctx, -235, 0, 54, 190, t, { roof: 'cone', flag: true }); tower(ctx, 235, 0, 54, 190, t, { roof: 'cone', flag: true }); }
      if (lv >= 3) { tower(ctx, -160, 0, 62, 230, t, { roof: 'cone', flag: true }); tower(ctx, 160, 0, 62, 230, t, { roof: 'cone', flag: true }); }
      if (lv >= 4) { tower(ctx, -86, -60, 50, 210, t, { roof: 'cone', roofH: 60 }); tower(ctx, 86, -60, 50, 210, t, { roof: 'cone', roofH: 60 }); }
      // 城壁
      ctx.beginPath(); ctx.rect(-170, -70, 340, 70); fillStroke(ctx, stoneGrad(ctx, 0, 340), 3);
      for (let xx = -170; xx < 168; xx += 16) { ctx.beginPath(); ctx.rect(xx, -80, 10, 10); fillStroke(ctx, '#2c2a3e', 2); }
      // 本丸
      const keepH = lv >= 4 ? 230 : 180;
      tower(ctx, 0, -60, 130, keepH, t, { windows: 3 });
      if (lv >= 4) tower(ctx, 0, -60 - keepH, 60, 90, t, { roof: 'cone', roofH: 110, flag: true, windows: 1 });
      // 門
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-30, -40); ctx.quadraticCurveTo(0, -66, 30, -40); ctx.lineTo(30, 0); ctx.closePath();
      fillStroke(ctx, '#0a0608', 3);
      ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(MK.FX.glow('rgba(255,80,30,0.7)', 64), -40, -60, 80, 80); ctx.restore();
      ctx.strokeStyle = '#3a3040'; ctx.lineWidth = 3; for (let i = -20; i <= 20; i += 10) { ctx.beginPath(); ctx.moveTo(i, -50); ctx.lineTo(i, 0); ctx.stroke(); }
      if (lv >= 3) {
        [-1, 1].forEach((d) => {
          const wv = Math.sin(t * 4 + d) * 3;
          ctx.beginPath(); ctx.moveTo(d * 45, -150); ctx.lineTo(d * 45 + d * 0 + 22 * d, -150); ctx.lineTo(d * 67 + wv, -90); ctx.lineTo(d * 56, -100); ctx.lineTo(d * 45 + wv, -90); ctx.closePath();
          fillStroke(ctx, lg(ctx, 0, -150, 0, -90, ['#c0142a', '#5a0610']), 2);
          ctx.fillStyle = '#ffd34a'; ell(ctx, d * 56, -130, 4, 3); ctx.fill();
        });
      }
      if (lv >= 5) {
        // ドクロ門
        ctx.save(); ctx.translate(0, -88);
        ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI, 0); ctx.lineTo(24, 20); ctx.lineTo(-24, 20); ctx.closePath();
        fillStroke(ctx, rg(ctx, -8, -12, 2, 0, 0, 40, ['#e8e0cc', '#8a826e', '#3a3428']), 3);
        glowEye(ctx, -12, -2, 6, '#ff2040'); glowEye(ctx, 12, -2, 6, '#ff2040');
        ctx.restore();
        // 溶岩の光
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3);
        ctx.fillStyle = lg(ctx, 0, 0, 0, 40, ['rgba(255,90,20,0.7)', 'rgba(255,40,0,0)']);
        ctx.fillRect(-300, 0, 600, 40); ctx.restore();
      }
      if (lv >= 4) {
        // 浮遊する魔晶
        const cy = -60 - keepH - 230 + Math.sin(t * 2) * 8;
        ctx.save(); ctx.translate(0, cy); ctx.rotate(Math.sin(t) * 0.1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(MK.FX.glow('rgba(180,90,255,0.9)', 64), -50, -50, 100, 100); ctx.restore();
        ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(14, 0); ctx.lineTo(0, 30); ctx.lineTo(-14, 0); ctx.closePath();
        fillStroke(ctx, lg(ctx, -14, 0, 14, 0, ['#5a2aa8', '#e0c0ff', '#7a3ac8']), 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------- 背景 ----------
  const bgCache = {};
  function background(ctx, W, H, kind, t) {
    const asset = MK.Assets.img('bg.' + kind);
    if (asset) { ctx.drawImage(asset, 0, 0, W, H); return; }
    if (!bgCache[kind]) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const pal = {
        normal: ['#06030f', '#1c0f33', '#3a1640', '#5a1a2a'],
        cz: ['#0a0000', '#3a0408', '#7a0e12', '#c23214'],
        at: ['#08021a', '#2a0a5a', '#5a1a8a', '#c0427a'],
        upper: ['#000000', '#2a0010', '#6a0a1a', '#ff7a1a'],
        judge: ['#050008', '#1a0420', '#4a0a2a', '#a01a1a'],
      }[kind] || ['#000', '#111', '#222', '#333'];
      g.fillStyle = lg(g, 0, 0, 0, H, pal); g.fillRect(0, 0, W, H);
      const r = U.srand(kind.length * 99 + 7);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.7})`; g.fillRect(r() * W, r() * H * 0.6, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1); }
      // 月
      const mx = kind === 'cz' || kind === 'upper' ? W * 0.82 : W * 0.78, my = H * 0.2;
      const mcol = kind === 'normal' ? ['#fff1e0', '#ff8a6a', '#8a1a2a'] : kind === 'at' ? ['#fff', '#f0c0ff', '#6a2a9a'] : ['#fff0d0', '#ff4020', '#5a0000'];
      g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(MK.FX.glow(kind === 'at' ? 'rgba(200,120,255,0.5)' : 'rgba(255,60,40,0.5)', 128), mx - 160, my - 160, 320, 320); g.restore();
      g.beginPath(); g.arc(mx, my, 52, 0, TAU); g.fillStyle = rg(g, mx - 15, my - 15, 5, mx, my, 55, mcol); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.15)'; [[-14, -6, 10], [16, 12, 7], [4, -24, 5]].forEach(([dx, dy, rr]) => { g.beginPath(); g.arc(mx + dx, my + dy, rr, 0, TAU); g.fill(); });
      // 山
      const mount = (base, amp, col, seed) => {
        const rr = U.srand(seed);
        g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 24) g.lineTo(x, base - Math.abs(Math.sin(x * 0.006 + seed)) * amp - rr() * amp * 0.3);
        g.lineTo(W, H); g.closePath(); g.fillStyle = col; g.fill();
      };
      mount(H * 0.62, 90, 'rgba(30,14,40,0.9)', 3);
      mount(H * 0.72, 60, 'rgba(16,8,22,1)', 8);
      g.fillStyle = lg(g, 0, H * 0.75, 0, H, ['#0e0814', '#040208']); g.fillRect(0, H * 0.78, W, H * 0.22);
      bgCache[kind] = c;
    }
    ctx.drawImage(bgCache[kind], 0, 0);
    // 地平の照り返し
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hc = { normal: 'rgba(160,40,90,0.35)', cz: 'rgba(255,60,20,0.4)', at: 'rgba(200,90,255,0.35)', upper: 'rgba(255,120,30,0.4)', judge: 'rgba(255,40,60,0.35)' }[kind] || 'rgba(120,60,120,0.3)';
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 1.5);
    ctx.drawImage(MK.FX.glow(hc, 128), -100, H * 0.55, W + 200, H * 0.5);
    ctx.restore();
    // 地表の霧
    ctx.save(); ctx.globalAlpha = 0.28;
    const fog = MK.FX.softDot('rgba(150,120,170,0.5)', 128);
    for (let i = 0; i < 8; i++) {
      const fx = U.mod(i * 160 - t * (14 + i * 2), W + 320) - 160;
      ctx.drawImage(fog, fx - 150, H * 0.78 + (i % 3) * 14, 300, 70);
    }
    ctx.restore();
    // 流れる雲
    ctx.save();
    ctx.globalAlpha = 0.35;
    const cl = MK.FX.softDot(kind === 'at' ? 'rgba(120,60,180,0.6)' : 'rgba(80,30,60,0.6)', 128);
    for (let i = 0; i < 6; i++) {
      const cx = U.mod(i * 200 + t * (10 + i * 3), W + 400) - 200;
      ctx.drawImage(cl, cx - 160, H * 0.18 + (i % 3) * 50 - 50, 320, 100);
    }
    ctx.restore();
  }

  // ---------- UI部品 ----------
  function panel(ctx, x, y, w, h, opt = {}) {
    ctx.save();
    const c = opt.color || '#d9a640';
    ctx.beginPath();
    const cut = opt.cut == null ? 10 : opt.cut;
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, y, 0, y + h, opt.bg || ['rgba(30,10,30,0.88)', 'rgba(8,2,12,0.92)']);
    ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#120408'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = lg(ctx, 0, y, 0, y + h, ['#fff2b0', c, '#6a4010']); ctx.stroke();
    // 角飾り
    ctx.fillStyle = c;
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    });
    if (opt.title) {
      ctx.font = 'bold 15px "Shippori Mincho B1", serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#e8c87a'; ctx.fillText(opt.title, x + 12, y + 6);
    }
    ctx.restore();
  }
  function bar(ctx, x, y, w, h, v, cols = ['#ff6a3a', '#a01010']) {
    ctx.save();
    ctx.fillStyle = '#0a0206'; ctx.fillRect(x, y, w, h);
    const vw = w * U.clamp(v, 0, 1);
    ctx.fillStyle = lg(ctx, 0, y, 0, y + h, [cols[0], cols[1]]); ctx.fillRect(x, y, vw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, vw, h * 0.35);
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.restore();
  }
  function label(ctx, text, x, y, size = 18, color = '#f3e2b0', align = 'left', font) {
    ctx.save();
    ctx.font = `bold ${size}px ${font || '"Shippori Mincho B1", "Yu Mincho", serif'}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.28; ctx.strokeStyle = '#0a0206'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }
  function num(ctx, text, x, y, size = 30, palette = 'gold', align = 'left') {
    MK.FX.fancyText(ctx, String(text), x, y, size, { palette, align, outerW: 0.22 });
  }
  function coin(ctx, x, y, r) {
    ell(ctx, x, y, r, r);
    ctx.fillStyle = rg(ctx, x - r * 0.4, y - r * 0.4, 1, x, y, r, ['#fff6c0', '#ffc53a', '#a0600a']); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.15); ctx.strokeStyle = '#5a3000'; ctx.stroke();
    ctx.fillStyle = '#7a4200'; ctx.font = `bold ${r * 1.1}px "Shippori Mincho B1", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('魔', x, y + r * 0.05);
  }

  // ---------- リール図柄 ----------
  function symbol(ctx, id, w, h) {
    const asset = MK.Assets.img('sym.' + id);
    if (asset) { ctx.drawImage(asset, 0, 0, w, h); return; }
    const cx = w / 2, cy = h / 2;
    ctx.save();
    switch (id) {
      case 'SEVEN': {
        // 翼
        [-1, 1].forEach((d) => {
          ctx.beginPath(); ctx.moveTo(cx + d * 22, cy - 10);
          ctx.quadraticCurveTo(cx + d * 60, cy - 46, cx + d * 72, cy - 20);
          ctx.quadraticCurveTo(cx + d * 60, cy - 16, cx + d * 64, cy - 2);
          ctx.quadraticCurveTo(cx + d * 50, cy - 6, cx + d * 50, cy + 10);
          ctx.quadraticCurveTo(cx + d * 36, cy + 2, cx + d * 22, cy + 14); ctx.closePath();
          fillStroke(ctx, lg(ctx, cx, cy - 40, cx, cy + 14, ['#5a2a7a', '#1a0626']), 2.5);
        });
        ctx.font = `${h * 0.92}px "Dela Gothic One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 12; ctx.strokeStyle = '#0a0206'; ctx.strokeText('7', cx, cy + 4);
        ctx.lineWidth = 6; ctx.strokeStyle = lg(ctx, 0, 0, 0, h, ['#fff4b0', '#d99a20', '#7a4a00']); ctx.strokeText('7', cx, cy + 4);
        ctx.fillStyle = lg(ctx, 0, cy - h * 0.4, 0, cy + h * 0.45, ['#ffb0a0', '#ff2a2a', '#b00010', '#ff5a3a', '#5a0008']);
        ctx.fillText('7', cx, cy + 4);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 22, cy - 30, 30, 4);
        break;
      }
      case 'BAR': {
        [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(cx + d * 30, cy - 24); ctx.quadraticCurveTo(cx + d * 44, cy - 46, cx + d * 36, cy - 52); ctx.quadraticCurveTo(cx + d * 36, cy - 36, cx + d * 18, cy - 24); ctx.closePath(); fillStroke(ctx, lg(ctx, 0, cy - 52, 0, cy - 24, ['#fff3d6', '#8a6a3a']), 2); });
        ctx.beginPath(); ctx.roundRect(cx - 58, cy - 26, 116, 52, 8);
        fillStroke(ctx, lg(ctx, 0, cy - 26, 0, cy + 26, ['#3a1a4a', '#0a0410', '#2a0a3a']), 4, '#0a0206');
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#c38bff'; ctx.stroke();
        ctx.font = `${h * 0.42}px "Dela Gothic One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 5; ctx.strokeStyle = '#0a0206'; ctx.strokeText('BAR', cx, cy + 2);
        ctx.fillStyle = lg(ctx, 0, cy - 18, 0, cy + 18, ['#ffffff', '#c8ccd8', '#6a7088', '#e8ecf5']); ctx.fillText('BAR', cx, cy + 2);
        break;
      }
      case 'COIN': {
        const r = h * 0.4;
        ell(ctx, cx, cy, r + 4, r + 4); ctx.fillStyle = '#3a2000'; ctx.fill();
        ell(ctx, cx, cy, r, r); ctx.fillStyle = rg(ctx, cx - r * 0.4, cy - r * 0.4, 2, cx, cy, r, ['#fffbe0', '#ffd34a', '#c07a0a', '#6a3a00']); ctx.fill();
        ell(ctx, cx, cy, r * 0.78, r * 0.78); ctx.lineWidth = 2.5; ctx.strokeStyle = '#8a5000'; ctx.stroke();
        ctx.font = `bold ${r * 1.15}px "Shippori Mincho B1", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#7a3e00'; ctx.fillText('魔', cx + 1.5, cy + 3);
        ctx.fillStyle = '#ffeaa0'; ctx.fillText('魔', cx, cy + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ell(ctx, cx - r * 0.4, cy - r * 0.45, r * 0.25, r * 0.12, -0.6); ctx.fill();
        break;
      }
      case 'REPLAY': {
        const r = h * 0.4;
        ctx.strokeStyle = '#0a1a3a'; ctx.lineWidth = 7; ell(ctx, cx, cy, r, r); ctx.stroke();
        ctx.strokeStyle = '#3ab8ff'; ctx.lineWidth = 4; ell(ctx, cx, cy, r, r); ctx.stroke();
        ctx.lineWidth = 1.5; ell(ctx, cx, cy, r * 0.82, r * 0.82); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) { const a = ((i * 2) % 5) / 5 * TAU - Math.PI / 2; const px = cx + Math.cos(a) * r * 0.8, py = cy + Math.sin(a) * r * 0.8; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.strokeStyle = 'rgba(120,210,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(0,20,50,0.85)'; ctx.fillRect(cx - 56, cy - 12, 112, 24);
        ctx.strokeStyle = '#3ab8ff'; ctx.lineWidth = 2; ctx.strokeRect(cx - 56, cy - 12, 112, 24);
        ctx.font = `${h * 0.2}px "Dela Gothic One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e8f8ff'; ctx.fillText('REPLAY', cx, cy + 1);
        break;
      }
      case 'SLIME': {
        ctx.translate(cx - 2, cy + h * 0.34); ctx.scale(h / 85, h / 85);
        Monsters.slime(ctx, { breath: 0, walk: 0, lunge: 0, hurt: 0 }, 0, 1);
        break;
      }
      case 'SKULL': {
        ctx.save(); ctx.translate(cx, cy + 6);
        ctx.strokeStyle = '#0a0206'; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-40, -22); ctx.lineTo(40, 26); ctx.moveTo(40, -22); ctx.lineTo(-40, 26); ctx.stroke();
        ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-40, -22); ctx.lineTo(40, 26); ctx.moveTo(40, -22); ctx.lineTo(-40, 26); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -8, 26, Math.PI * 0.82, Math.PI * 0.18); ctx.lineTo(14, 22); ctx.lineTo(-14, 22); ctx.closePath();
        fillStroke(ctx, rg(ctx, -8, -16, 2, 0, -6, 32, ['#ffffff', '#ece4cf', '#9a9078']), 3.5);
        ctx.fillStyle = '#140808'; ell(ctx, -10, -6, 8, 9); ctx.fill(); ell(ctx, 10, -6, 8, 9); ctx.fill();
        glowEye(ctx, -10, -5, 4, '#ff2020'); glowEye(ctx, 10, -5, 4, '#ff2020');
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-4, 11); ctx.lineTo(4, 11); ctx.closePath(); ctx.fillStyle = '#140808'; ctx.fill();
        ctx.strokeStyle = '#140808'; ctx.lineWidth = 2; for (let i = -8; i <= 8; i += 5) { ctx.beginPath(); ctx.moveTo(i, 15); ctx.lineTo(i, 22); ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'CHEST': {
        ctx.translate(cx, cy + 4);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MK.FX.glow('rgba(255,200,60,0.7)', 64), -40, -50, 80, 60); ctx.restore();
        ctx.beginPath(); ctx.rect(-44, -6, 88, 36); fillStroke(ctx, lg(ctx, 0, -6, 0, 30, ['#9a5a22', '#5a2a0a']), 3.5);
        ctx.beginPath(); ctx.moveTo(-44, -6); ctx.lineTo(-44, -18); ctx.quadraticCurveTo(0, -48, 44, -18); ctx.lineTo(44, -6); ctx.closePath();
        fillStroke(ctx, lg(ctx, 0, -40, 0, -6, ['#b8743a', '#6a340e']), 3.5);
        ctx.fillStyle = lg(ctx, 0, -40, 0, 30, ['#fff2a0', '#d9a020', '#7a5000']);
        [-30, 22].forEach((bx) => { ctx.fillRect(bx, -36 + (bx > 0 ? 4 : 4), 8, 66); });
        ctx.fillRect(-44, -9, 88, 6);
        ctx.beginPath(); ctx.roundRect(-8, -6, 16, 18, 3); fillStroke(ctx, '#ffd34a', 2);
        ctx.fillStyle = '#2a1000'; ctx.fillRect(-2, 0, 4, 7);
        break;
      }
    }
    ctx.restore();
  }

  // ---------- ロゴ ----------
  function logo(ctx, x, y, s, t, opt = {}) {
    const asset = MK.Assets.img('logo.main');
    if (asset) { ctx.drawImage(asset, x - 600 * s, y - 180 * s, 1200 * s, 360 * s); return; }
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    // 背面の魔法陣
    MK.FX.magicCircle(ctx, 0, 0, 150, t * 0.5, 'rgba(255,60,60,0.9)', { alpha: 0.35, blur: 8, tilt: 0.42 });
    // 角の装飾
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(d * 250, 10);
      ctx.bezierCurveTo(d * 320, -10, d * 350, -70, d * 320, -120);
      ctx.bezierCurveTo(d * 370, -60, d * 340, 20, d * 260, 40); ctx.closePath();
      fillStroke(ctx, lg(ctx, d * 250, 40, d * 320, -120, ['#3a2a14', '#d8c8a0', '#fff6dc']), 4);
    });
    const shine = U.mod(t * 0.35, 1.6);
    MK.FX.fancyText(ctx, '魔王経営記', 0, 0, 108, { palette: 'gold', glow: 'rgba(255,60,20,0.8)', shine, outerW: 0.3 });
    MK.FX.fancyText(ctx, '（仮）', 300, 42, 30, { palette: 'blood' });
    ctx.font = '600 22px "Cinzel", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8c87a'; ctx.fillText('— MAOU KEIEI-KI —', 0, 74);
    ctx.restore();
  }

  MK.Art = {
    lg, rg, ell, fillStroke, shadow, glowEye,
    monster(ctx, m, t) { drawChar(ctx, m.type, Monsters, m, t, 'monster.' + m.type); },
    hero(ctx, h, t) { drawChar(ctx, h.type, Heroes, h, t, 'hero.' + h.type); },
    maou, castle, background, panel, bar, label, num, coin, symbol, logo,
    Monsters, Heroes,
  };
})(window.MK);
