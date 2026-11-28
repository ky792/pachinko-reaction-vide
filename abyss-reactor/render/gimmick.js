/*
 * 深淵コア 役物描画
 * 外部素材（assets/mechanism/core_*.png）があれば使用、無ければプロシージャル描画。
 */
(function (NB) {
  'use strict';
  const TAU = Math.PI * 2, Mat = NB.Mat;

  NB.drawGimmick = function (g, gm, assets, t) {
    const s = gm.s;
    const stow = { x: 450, y: 262, sc: 0.42 }, dep = { x: 450, y: 462, sc: 1 };
    const p = s.pos;
    let x = NB.math.lerp(stow.x, dep.x, p), y = NB.math.lerp(stow.y, dep.y, p), sc = NB.math.lerp(stow.sc, dep.sc, p);
    if (s.shake > 0.05) { x += (Math.random() - 0.5) * s.shake; y += (Math.random() - 0.5) * s.shake; }
    const R = 118 * sc;
    const hue = s.rainbow > 0.01 ? (t * 200) % 360 : s.hue;
    const col = (l, a = 1) => `hsla(${hue},100%,${l}%,${a})`;
    g.save();
    if (p < 0.2) { g.beginPath(); g.rect(0, 288 - (p / 0.2) * 60, 900, 2000); g.clip(); }
    g.translate(x, y);
    // 落ち影（液晶へ）
    if (p > 0.2) { g.save(); g.globalAlpha = 0.5 * p; g.fillStyle = '#000'; g.beginPath(); g.ellipse(10, 16, R * 1.05, R * 1.02, 0, 0, TAU); g.filter = 'blur(10px)'; g.fill(); g.restore(); }
    // 後光
    if (s.glow > 0.05) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const hg = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R * (1.6 + s.open * 0.8));
      hg.addColorStop(0, col(60, 0.55 * s.glow)); hg.addColorStop(1, col(50, 0));
      g.fillStyle = hg; g.beginPath(); g.arc(0, 0, R * 2.4, 0, TAU); g.fill();
      g.restore();
    }
    // コア球
    const orbR = R * 0.5;
    const ext = assets && assets.get('core_orb');
    if (ext) g.drawImage(ext, -orbR, -orbR, orbR * 2, orbR * 2);
    else {
      const og = g.createRadialGradient(-orbR * 0.3, -orbR * 0.3, 1, 0, 0, orbR);
      og.addColorStop(0, '#ffffff'); og.addColorStop(0.25, col(75)); og.addColorStop(0.7, col(40)); og.addColorStop(1, col(10));
      g.globalAlpha = 0.35 + 0.65 * s.glow; g.fillStyle = og; g.beginPath(); g.arc(0, 0, orbR, 0, TAU); g.fill(); g.globalAlpha = 1;
      // 内部のエネルギー渦
      g.save(); g.beginPath(); g.arc(0, 0, orbR, 0, TAU); g.clip(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        g.rotate(gm.angle * (0.6 + i * 0.25)); g.strokeStyle = col(80, 0.25 * s.glow); g.lineWidth = 2 * sc;
        g.beginPath(); g.ellipse(0, 0, orbR * (0.3 + i * 0.13), orbR * 0.12, 0, 0, TAU); g.stroke();
      }
      g.restore();
    }
    // 内輪（回転・目盛り）
    g.save(); g.rotate(gm.angle);
    g.lineWidth = 7 * sc; g.strokeStyle = '#0d1014'; g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.stroke();
    g.lineWidth = 1.5 * sc; g.strokeStyle = col(70, 0.4 + 0.6 * s.glow);
    for (let i = 0; i < 48; i++) { const a = (i * TAU) / 48, l = i % 4 ? 0.04 : 0.09; g.beginPath(); g.moveTo(Math.cos(a) * R * (0.62 - l), Math.sin(a) * R * (0.62 - l)); g.lineTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62); g.stroke(); }
    g.restore();
    // 可動プレート（8枚・アイリス）
    const plateImg = assets && assets.get('core_plate');
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 - gm.angle * 0.05;
      g.save(); g.rotate(a);
      const off = R * (0.08 + 0.55 * s.open), tilt = s.open * 0.5;
      g.translate(0, -off); g.rotate(tilt);
      if (plateImg) g.drawImage(plateImg, -R * 0.32, -R * 0.75, R * 0.64, R * 0.9);
      else {
        g.beginPath(); g.moveTo(-R * 0.28, -R * 0.05); g.lineTo(-R * 0.16, -R * 0.62); g.lineTo(R * 0.16, -R * 0.62); g.lineTo(R * 0.28, -R * 0.05); g.lineTo(0, R * 0.08); g.closePath();
        g.fillStyle = Mat.gunmetal(g, -R * 0.3, -R * 0.6, R * 0.3, 0); g.fill();
        g.lineWidth = 1.4 * sc; g.strokeStyle = Mat.chrome(g, 0, -R * 0.6, 0, 0); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-R * 0.1, -R * 0.5, R * 0.2, R * 0.04);
        g.fillStyle = col(65, 0.3 + 0.7 * s.glow); g.fillRect(-R * 0.03, -R * 0.42, R * 0.06, R * 0.28);
      }
      g.restore();
    }
    // 外輪（鋳物リング）
    const ring = assets && assets.get('core_ring');
    if (ring) g.drawImage(ring, -R * 1.28, -R * 1.28, R * 2.56, R * 2.56);
    else {
      g.lineWidth = 22 * sc; g.strokeStyle = Mat.gunmetal(g, -R, -R, R, R); g.beginPath(); g.arc(0, 0, R * 1.02, 0, TAU); g.stroke();
      g.lineWidth = 3 * sc; g.strokeStyle = Mat.chrome(g, 0, -R, 0, R); g.beginPath(); g.arc(0, 0, R * 1.11, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, R * 0.93, 0, TAU); g.lineWidth = 2 * sc; g.stroke();
      for (let i = 0; i < 12; i++) { const a = (i * TAU) / 12; Mat.bolt(g, Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02, 3.6 * sc, a); }
      // 導光スリット
      for (let i = 0; i < 4; i++) {
        const a0 = (i * TAU) / 4 + 0.25;
        Mat.glowLine(g, () => { g.beginPath(); g.arc(0, 0, R * 1.02, a0, a0 + 0.9); }, col(60), 2.2 * sc, 0.25 + 0.75 * s.glow);
      }
    }
    g.restore();
  };
})(globalThis.NB);
