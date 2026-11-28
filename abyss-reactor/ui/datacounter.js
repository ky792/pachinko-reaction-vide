/*
 * データカウンター（ホール設置型を模した表示器）
 * 総回転・現在回転・大当たり・初当たり・RUSH突入・最大連・累計出玉・差玉・スランプグラフ・履歴
 */
(function (NB) {
  'use strict';
  const Mat = NB.Mat;

  class DataCounter {
    constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.W = 520; this.H = 1000; }

    seg(g, text, x, y, size, color = '#ff6a2a', digits = 5) {
      const neg = String(text).startsWith('-');
      Mat.sevenSeg(g, String(text), x, y, size * 0.8, color, digits);
    }

    draw(game, opts = {}) {
      const g = this.g, W = this.W, H = this.H, S = game.stats;
      g.setTransform(this.c.width / W, 0, 0, this.c.height / H, 0, 0);
      g.clearRect(0, 0, W, H);
      // 筐体
      Mat.bevelPanel(g, () => Mat.roundRect(g, 6, 6, W - 12, H - 12, 22), Mat.gunmetal(g, 0, 0, W, H), { bevel: 4, shadowBlur: 20, edge: '#000', edgeWidth: 2 });
      g.fillStyle = '#030405'; Mat.roundRect(g, 22, 22, W - 44, H - 44, 14); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.stroke();
      // ヘッダー
      g.fillStyle = '#0b0e12'; Mat.roundRect(g, 34, 34, W - 68, 70, 10); g.fill();
      g.font = '900 30px "Orbitron", "Rajdhani", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = Mat.chrome(g, 0, 50, 0, 90); g.fillText('ABYSS', 52, 70);
      g.font = '800 15px "Noto Sans JP", sans-serif'; g.fillStyle = 'rgba(150,220,245,0.9)'; g.fillText('DATA COUNTER  No.001', 186, 62);
      g.font = '600 12px "Noto Sans JP", sans-serif'; g.fillStyle = 'rgba(200,210,220,0.6)'; g.fillText(game.spec.title, 186, 84);
      // 状態ランプ
      const lampOn = (label, x, on, col) => {
        g.save(); g.fillStyle = on ? col : 'rgba(60,60,60,0.6)'; if (on) { g.shadowColor = col; g.shadowBlur = 14; }
        Mat.roundRect(g, x, 116, 104, 30, 6); g.fill(); g.restore();
        g.font = '800 14px "Noto Sans JP", sans-serif'; g.textAlign = 'center'; g.fillStyle = on ? '#000' : 'rgba(200,200,200,0.4)'; g.fillText(label, x + 52, 131);
      };
      lampOn('通常', 40, game.mode === 'normal' && game.phase !== 'bighit', '#40c8ff');
      lampOn('大当たり', 152, game.phase === 'bighit', '#ffc030');
      lampOn('深淵RUSH', 264, game.mode === 'rush', '#ff3a4a');
      lampOn(game.mode === 'rush' ? `残${game.st ?? '-'}` : '保留' + (game.holds1.length), 376, game.mode === 'rush' || game.holds1.length > 0, '#9aff6a');
      // メイン数字
      const rows = [
        ['現在回転数', S.spinsSinceHit, '#ff6a2a', 5],
        ['総回転数', S.spins, '#ff6a2a', 6],
        ['大当たり', S.hits, '#ff3a2a', 4],
        ['初当たり', S.firstHits, '#ff3a2a', 4],
        ['RUSH突入', S.rushEntries, '#ff3a2a', 4],
        ['最大連チャン', S.maxChain, '#ffc030', 4],
        ['累計出玉', S.payout, '#ffc030', 7],
        ['差玉', S.payout - S.launched, (S.payout - S.launched) >= 0 ? '#5aff6a' : '#ff5a5a', 7],
      ];
      let y = 190;
      for (const [label, v, col, dig] of rows) {
        g.font = '700 16px "Noto Sans JP", sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(210,220,230,0.75)'; g.fillText(label, 44, y - 14);
        this.seg(g, String(v), W - 46, y, 40, col, dig);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(40, y + 10, W - 80, 1);
        y += 58;
      }
      // 初当たり確率表示
      const rate = S.firstHits ? (S.spinsByMode.normal / S.firstHits).toFixed(1) : '---';
      g.font = '700 14px "Noto Sans JP", sans-serif'; g.fillStyle = 'rgba(200,210,220,0.65)'; g.textAlign = 'left';
      g.fillText(`初当たり確率 1/${rate}　（設計値 1/${(1 / game.spec.normal.probability).toFixed(1)}）`, 44, y - 14);
      // スランプグラフ
      const gy = y + 26, gh = 180, gx = 40, gw = W - 80;
      g.fillStyle = '#05070a'; g.fillRect(gx, gy, gw, gh); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.strokeRect(gx, gy, gw, gh);
      const hist = S.history.concat([{ s: S.spins, d: S.payout - S.launched }]);
      let mx = 1000; for (const h of hist) mx = Math.max(mx, Math.abs(h.d));
      mx = Math.ceil(mx / 1000) * 1000;
      const maxS = Math.max(100, S.spins);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(gx, gy + gh / 2); g.lineTo(gx + gw, gy + gh / 2); g.stroke();
      g.font = '600 11px sans-serif'; g.fillStyle = 'rgba(200,210,220,0.5)'; g.textAlign = 'left';
      g.fillText(`+${mx}`, gx + 4, gy + 12); g.fillText(`-${mx}`, gx + 4, gy + gh - 4); g.textAlign = 'right'; g.fillText(`${maxS}回転`, gx + gw - 4, gy + gh - 4);
      g.save(); g.beginPath(); g.rect(gx, gy, gw, gh); g.clip();
      g.strokeStyle = '#ffb030'; g.lineWidth = 2; g.shadowColor = '#ff9020'; g.shadowBlur = 6; g.beginPath();
      hist.forEach((h, i) => { const x = gx + (h.s / maxS) * gw, yy = gy + gh / 2 - (h.d / mx) * (gh / 2); i ? g.lineTo(x, yy) : g.moveTo(x, yy); });
      g.stroke(); g.restore();
      g.font = '700 13px "Noto Sans JP", sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(200,210,220,0.7)'; g.fillText('差玉推移', gx, gy - 6);
      // 履歴
      const hy = gy + gh + 34;
      g.fillText('大当たり履歴', gx, hy - 8);
      const log = S.hitLog.slice(-8).reverse();
      log.forEach((h, i) => {
        const yy = hy + i * 24;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'; g.fillRect(gx, yy, gw, 22);
        g.font = '700 14px "Noto Sans JP", sans-serif'; g.textAlign = 'left';
        g.fillStyle = h.kind === 'rush' ? '#ff5a6a' : h.toRush ? '#ffc040' : '#8ad8ff';
        g.fillText(h.kind === 'rush' ? `RUSH ${h.chain}連目` : h.toRush ? '初当たり → RUSH' : '初当たり（通常）', gx + 8, yy + 15);
        g.textAlign = 'right'; g.fillStyle = '#ff8a4a'; g.fillText(`${h.spins}回転`, gx + gw - 8, yy + 15);
      });
      if (opts.clock) { g.font = '600 12px sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(200,210,220,0.4)'; g.fillText(`稼働 ${fmt(S.playSec)}`, W - 40, H - 34); }
    }
  }
  function fmt(s) { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; }

  NB.DataCounter = DataCounter;
})(globalThis.NB);
