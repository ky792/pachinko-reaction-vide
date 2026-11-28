/*
 * 筐体・盤面レンダラー
 *  静的レイヤー（筐体・盤面・センター枠）は起動時/釘調整時にオフスクリーンへ焼き込み、
 *  毎フレームは可動部・玉・LED・液晶合成のみ描画する。
 *  外部素材（assets/cabinet, assets/playfield）があれば焼き込み時に差し替える。
 */
(function (NB) {
  'use strict';
  const TAU = Math.PI * 2;
  const Mat = NB.Mat;

  class MachineRenderer {
    constructor(machine, assets) {
      this.m = machine; this.L = machine.layout; this.assets = assets;
      this.W = this.L.canvas.w; this.H = this.L.canvas.h;
      this.led = { mode: 'idle', color: [60, 220, 255], t: 0, flash: 0, intensity: 1 };
      this.shake = { x: 0, y: 0, amp: 0 };
    }

    build() {
      this.boardLayer = this.buildBoard();
      this.frameLayer = this.buildFrame();
      this.cabinetLayer = this.buildCabinet();
    }
    rebuildBoard() { this.boardLayer = this.buildBoard(); }

    // ================================================================= 盤面
    buildBoard() {
      const L = this.L, c = NB.makeCanvas(this.W, this.H), g = c.getContext('2d');
      const B = L.board, O = L.outer;
      if (!this.assets.draw(g, 'board_art')) {
        // ベース：深い藍黒の樹脂板＋設計図ライン
        const bg = g.createRadialGradient(450, 560, 60, 450, 600, 520);
        bg.addColorStop(0, '#0e1a22'); bg.addColorStop(0.6, '#081016'); bg.addColorStop(1, '#030507');
        g.fillStyle = bg; g.fillRect(B.x, B.y, B.w, B.h);
        g.save(); g.beginPath(); g.arc(O.x, O.y, O.r, 0, TAU); g.clip();
        // 設計図グリッド
        g.strokeStyle = 'rgba(80,190,230,0.05)'; g.lineWidth = 1;
        for (let x = B.x; x < B.x + B.w; x += 24) { g.beginPath(); g.moveTo(x, B.y); g.lineTo(x, B.y + B.h); g.stroke(); }
        for (let y = B.y; y < B.y + B.h; y += 24) { g.beginPath(); g.moveTo(B.x, y); g.lineTo(B.x + B.w, y); g.stroke(); }
        // 同心円の機関図面
        g.strokeStyle = 'rgba(90,200,240,0.09)';
        for (let r = 60; r < 400; r += 38) { g.setLineDash(r % 76 ? [3, 6] : []); g.beginPath(); g.arc(450, 470, r, 0, TAU); g.stroke(); }
        g.setLineDash([]);
        for (let i = 0; i < 24; i++) { const a = (i * TAU) / 24; g.beginPath(); g.moveTo(450 + Math.cos(a) * 300, 470 + Math.sin(a) * 300); g.lineTo(450 + Math.cos(a) * 395, 470 + Math.sin(a) * 395); g.stroke(); }
        // 左右セクター表記
        g.font = '600 11px "Rajdhani", "Segoe UI", sans-serif'; g.fillStyle = 'rgba(120,210,240,0.28)';
        g.save(); g.translate(96, 800); g.rotate(-Math.PI / 2); g.fillText('SECTOR-A  /  CONTAINMENT FLOW', 0, 0); g.restore();
        g.save(); g.translate(836, 300); g.rotate(Math.PI / 2); g.fillText('SECTOR-B  /  OVERFLOW ROUTE  ▶▶', 0, 0); g.restore();
        // 下部の警告帯（控えめ）
        g.fillStyle = 'rgba(255,170,40,0.06)';
        for (let x = 300; x < 600; x += 22) { g.beginPath(); g.moveTo(x, 940); g.lineTo(x + 11, 940); g.lineTo(x + 1, 960); g.lineTo(x - 10, 960); g.fill(); }
        // 右ルート表示
        g.fillStyle = 'rgba(255,60,60,0.12)'; g.font = '800 30px sans-serif'; g.fillText('▼', 784, 560);
        g.restore();
        // 粒状感
        g.save(); g.beginPath(); g.arc(O.x, O.y, O.r, 0, TAU); g.clip(); g.fillStyle = Mat.grain(g, 128, 128, 0.04); g.fillRect(B.x, B.y, B.w, B.h); g.restore();
      }
      // 外レール（クローム帯）
      g.save();
      g.lineWidth = 10; g.strokeStyle = '#0a0c0e'; g.beginPath(); g.arc(O.x, O.y, O.r + 5, 0, TAU); g.stroke();
      g.lineWidth = 7; g.strokeStyle = Mat.chrome(g, 0, O.y - O.r, 0, O.y + O.r); g.beginPath(); g.arc(O.x, O.y, O.r + 3.5, 0, TAU); g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(O.x, O.y, O.r + 0.5, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
      // 内レール（発射レーン）
      const ir = L.lane.innerR;
      g.lineWidth = 4; g.strokeStyle = Mat.chrome(g, 0, 500, 0, 1000);
      g.beginPath(); g.arc(O.x, O.y, ir - 2, (L.lane.fromDeg * Math.PI) / 180, (L.lane.toDeg * Math.PI) / 180); g.stroke();
      g.restore();
      // 盤面外（レール外側）の黒マスク
      g.save(); g.beginPath(); g.rect(B.x, B.y, B.w, B.h); g.arc(O.x, O.y, O.r + 8, 0, TAU, true);
      const mg = g.createLinearGradient(0, B.y, 0, B.y + B.h); mg.addColorStop(0, '#16191d'); mg.addColorStop(1, '#0b0d0f');
      g.fillStyle = mg; g.fill('evenodd');
      g.fillStyle = Mat.brushed(g, 256, 256, 'rgba(0,0,0,0)', 0.05); g.fill('evenodd');
      g.restore();
      // 入賞口類（静的部）
      this.drawPocketsStatic(g);
      // 風車の台座
      for (const w of L.windmills) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(w.x + 2, w.y + 3, w.r + 3, 0, TAU); g.fill(); }
      // 釘
      this.drawNails(g);
      // 盤面ステッカー：特図表示器（小型 7seg）の筐体
      Mat.bevelPanel(g, () => Mat.roundRect(g, 168, 930, 110, 34, 4), '#090b0d', { bevel: 1.5, shadowBlur: 6 });
      Mat.engrave(g, '特図1  特図2  普図', 223, 970, '600 8px sans-serif', 'rgba(160,180,200,0.6)');
      return c;
    }

    drawNails(g) {
      const L = this.L, r = L.nailRadius + 0.6;
      for (const n of L.nails) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(n.x + 1.6, n.y + 2.4, r + 0.6, 0, TAU); g.fill(); }
      for (const n of L.nails) {
        const ng = g.createRadialGradient(n.x - r * 0.4, n.y - r * 0.5, 0.2, n.x, n.y, r + 0.4);
        ng.addColorStop(0, '#fffbe8'); ng.addColorStop(0.35, '#d6c79a'); ng.addColorStop(0.8, '#6a5c3a'); ng.addColorStop(1, '#2a2416');
        g.fillStyle = ng; g.beginPath(); g.arc(n.x, n.y, r, 0, TAU); g.fill();
      }
    }

    drawPocketsStatic(g) {
      const L = this.L;
      // ヘソ（始動口）：クロームの受け皿
      if (!this.assets.draw(g, 'heso')) {
        const h = L.pockets.find((p) => p.type === 'heso');
        g.save(); g.translate(h.x, h.y);
        Mat.bevelPanel(g, () => { g.beginPath(); g.moveTo(-26, -8); g.lineTo(-13, -8); g.lineTo(-11, 10); g.lineTo(11, 10); g.lineTo(13, -8); g.lineTo(26, -8); g.lineTo(22, 20); g.lineTo(-22, 20); g.closePath(); }, Mat.chrome(g, 0, -8, 0, 20), { bevel: 1.5, shadowBlur: 8 });
        g.fillStyle = '#020304'; g.fillRect(-10.5, -6, 21, 15);
        Mat.engrave(g, 'START', 0, 15, '700 7px sans-serif', 'rgba(20,30,40,0.9)');
        g.restore();
      }
      const gp = L.pockets.find((p) => p.type === 'general');
      if (gp) {
        g.save(); g.translate(gp.x, gp.y);
        Mat.bevelPanel(g, () => Mat.chamferRect(g, -18, -6, 36, 18, 4), Mat.gunmetal(g, 0, -6, 0, 12), { bevel: 1.2, shadowBlur: 6 });
        g.fillStyle = '#020304'; g.fillRect(-12, -6, 24, 9);
        g.restore();
      }
      // スルーゲート
      const T = L.through;
      g.save(); g.translate(T.x, T.y);
      Mat.bevelPanel(g, () => { g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.arc(0, 0, 8, 0, TAU, true); }, Mat.chrome(g, 0, -15, 0, 15), { rule: 'evenodd', bevel: 1, shadowBlur: 5 });
      Mat.engrave(g, 'GATE', 0, 22, '700 7px sans-serif');
      g.restore();
      // アウト口
      const Ou = L.out;
      g.save(); g.fillStyle = '#000'; g.beginPath(); g.ellipse(Ou.x, Ou.y + 6, 34, 12, 0, 0, TAU); g.fill();
      g.strokeStyle = Mat.chrome(g, 0, Ou.y - 6, 0, Ou.y + 18); g.lineWidth = 3; g.stroke(); g.restore();
      // アタッカーガイド・電チュー台座・ステージ下部ガイドを描画
      g.save(); g.lineCap = 'round';
      for (const w of L.attacker.guide) { g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 7; g.beginPath(); g.moveTo(w[0][0] + 1, w[0][1] + 3); g.lineTo(w[1][0] + 1, w[1][1] + 3); g.stroke(); g.strokeStyle = Mat.chrome(g, 0, w[0][1] - 4, 0, w[0][1] + 4); g.lineWidth = 5; g.beginPath(); g.moveTo(w[0][0], w[0][1]); g.lineTo(w[1][0], w[1][1]); g.stroke(); }
      for (const w of L.walls) { g.strokeStyle = '#2a3036'; g.lineWidth = 4; g.beginPath(); g.moveTo(w[0][0], w[0][1]); g.lineTo(w[1][0], w[1][1]); g.stroke(); }
      g.restore();
    }

    // ================================================================= センター枠
    buildFrame() {
      const L = this.L, c = NB.makeCanvas(this.W, this.H), g = c.getContext('2d');
      if (this.assets.draw(g, 'center_frame')) return c;
      const fo = L.frame.outline, lcd = L.lcd;
      const outer = () => { g.beginPath(); fo[0].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); fo[1].forEach((p) => g.lineTo(p[0], p[1])); g.closePath(); };
      const lcdHole = (cont) => { Mat.roundRect(g, lcd.x - 2, lcd.y - 2, lcd.w + 4, lcd.h + 4, 10, cont); };
      const shape = () => { outer(); Mat.roundRect(g, lcd.x - 2, lcd.y - 2, lcd.w + 4, lcd.h + 4, 10, true); };
      // 本体：ガンメタ鋳物
      Mat.bevelPanel(g, shape, Mat.gunmetal(g, 160, 230, 740, 710), { rule: 'evenodd', bevel: 4, shadowBlur: 26, pattern: Mat.brushed(g, 256, 256, 'rgba(0,0,0,0)', 0.07), edge: 'rgba(0,0,0,0.9)', edgeWidth: 2 });
      // 外周クロームトリム
      g.save(); outer(); g.lineWidth = 5; g.strokeStyle = Mat.chrome(g, 0, 236, 0, 706); g.stroke(); g.restore();
      // 液晶ベゼル（段差）
      g.save();
      Mat.roundRect(g, lcd.x - 16, lcd.y - 14, lcd.w + 32, lcd.h + 28, 16); lcdHole(true);
      g.fillStyle = '#0a0c0e'; g.fill('evenodd');
      Mat.roundRect(g, lcd.x - 16, lcd.y - 14, lcd.w + 32, lcd.h + 28, 16); g.lineWidth = 2; g.strokeStyle = Mat.chrome(g, 0, lcd.y - 14, 0, lcd.y + lcd.h + 14); g.stroke();
      lcdHole(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(120,220,255,0.25)'; g.stroke();
      g.restore();
      // 上部：コア格納ハウジング（機関の蓋）
      g.save();
      const hx = 450, hy = 262;
      Mat.bevelPanel(g, () => { g.beginPath(); g.moveTo(330, 300); g.lineTo(352, 246); g.lineTo(548, 246); g.lineTo(570, 300); g.closePath(); }, Mat.gunmetal(g, 0, 246, 0, 300), { bevel: 3, shadowBlur: 14, pattern: Mat.brushed(g), edge: '#000' });
      // 放熱フィン
      for (let i = -5; i <= 5; i++) { const x = hx + i * 15; g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 4, 256, 8, 30); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 4, 256, 1.5, 30); }
      Mat.chromeText(g, 'ABYSS  CORE', hx, 238, '800 13px "Rajdhani", sans-serif', { size: 13, depth: 2 });
      g.restore();
      // 左右のサイドモジュール（ピストン）
      for (const sx of [-1, 1]) {
        const x = 450 + sx * 275;
        g.save();
        Mat.bevelPanel(g, () => Mat.chamferRect(g, x - 14, 380, 28, 200, 6), Mat.gunmetal(g, x - 14, 0, x + 14, 0), { bevel: 2, shadowBlur: 10, pattern: Mat.brushed(g) });
        const cg = g.createLinearGradient(x - 6, 0, x + 6, 0); cg.addColorStop(0, '#3a4048'); cg.addColorStop(0.35, '#f0f4f8'); cg.addColorStop(0.6, '#5a626a'); cg.addColorStop(1, '#202428');
        g.fillStyle = cg; g.fillRect(x - 6, 396, 12, 168);
        g.fillStyle = 'rgba(0,0,0,0.7)'; for (let y = 410; y < 560; y += 22) g.fillRect(x - 7, y, 14, 2);
        Mat.bolt(g, x, 388, 4); Mat.bolt(g, x, 572, 4);
        g.restore();
      }
      // 下部プレート：機種名刻印
      g.save();
      Mat.bevelPanel(g, () => Mat.chamferRect(g, 330, 676, 240, 22, 8), Mat.gunmetal(g, 0, 676, 0, 698), { bevel: 1.5, shadowBlur: 6 });
      Mat.engrave(g, 'NBL-001  ABYSS REACTOR  CONTROL UNIT', 450, 687, '700 9px "Rajdhani", sans-serif', 'rgba(170,200,220,0.75)');
      g.restore();
      // ボルト
      for (const [x, y] of [[184, 470], [716, 470], [210, 640], [690, 640], [262, 330], [638, 330]]) Mat.bolt(g, x, y, 4.5);
      // ワープ入口
      const W = L.warp.sensor;
      g.save(); g.fillStyle = '#000'; g.beginPath(); g.ellipse(W.x + 2, W.y, 6, 9, 0, 0, TAU); g.fill();
      g.strokeStyle = Mat.chrome(g, 0, W.y - 9, 0, W.y + 9); g.lineWidth = 2; g.stroke(); g.restore();
      // ワープ通路（透明樹脂）
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      const wp = L.warp.path;
      g.beginPath(); wp.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 16; g.stroke();
      g.strokeStyle = 'rgba(140,220,255,0.18)'; g.lineWidth = 13; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke();
      g.restore();
      return c;
    }

    drawStage(g, t, glow) {
      const st = this.L.stage;
      g.save();
      const pts = st.floor.concat(st.floor2);
      // 樹脂本体（手前側に厚み）
      g.beginPath(); st.floor.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.lineTo(441, 676); g.lineTo(214, 644); g.closePath();
      g.moveTo(459, 652); st.floor2.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(686, 644); g.lineTo(459, 676); g.closePath();
      const rg = g.createLinearGradient(0, 600, 0, 680); rg.addColorStop(0, 'rgba(120,220,255,0.10)'); rg.addColorStop(1, 'rgba(30,90,140,0.32)');
      g.fillStyle = rg; g.fill();
      // エッジ発光
      const edge = () => { g.beginPath(); st.floor.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.moveTo(st.floor2[0][0], st.floor2[0][1]); st.floor2.forEach((p) => g.lineTo(p[0], p[1])); };
      Mat.glowLine(g, edge, `rgb(${this.led.color.join(',')})`, 1.6, 0.45 + glow * 0.6);
      // センター穴
      g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(442, 650, 16, 6);
      Mat.glowLine(g, () => { g.beginPath(); g.moveTo(436, 660); g.lineTo(464, 660); }, '#ffd040', 1.2, 0.4 + 0.3 * Math.sin(t * 4));
      g.restore();
    }

    // ================================================================= 筐体
    buildCabinet() {
      const c = NB.makeCanvas(this.W, this.H), g = c.getContext('2d');
      if (this.assets.draw(g, 'cabinet_frame')) return c;
      const B = this.L.board;
      const brushed = Mat.brushed(g, 512, 256, 'rgba(0,0,0,0)', 0.06);
      // ボディ全体（盤面窓を抜く）
      const body = () => { Mat.chamferRect(g, 0, 0, this.W, this.H, 26); Mat.roundRect(g, B.x, B.y, B.w, B.h, 34, true); };
      g.save(); body(); g.fillStyle = Mat.gunmetal(g, 0, 0, this.W, this.H); g.fill('evenodd'); g.restore();
      g.save(); body(); g.clip('evenodd'); g.fillStyle = brushed; g.fillRect(0, 0, this.W, this.H); g.restore();
      // 盤面窓の内側ベゼル（ガラス押さえ）
      g.save();
      Mat.roundRect(g, B.x - 14, B.y - 14, B.w + 28, B.h + 28, 44); Mat.roundRect(g, B.x, B.y, B.w, B.h, 34, true);
      g.fillStyle = '#0b0d10'; g.fill('evenodd');
      Mat.roundRect(g, B.x - 14, B.y - 14, B.w + 28, B.h + 28, 44); g.lineWidth = 3; g.strokeStyle = Mat.chrome(g, 0, B.y, 0, B.y + B.h); g.stroke();
      Mat.roundRect(g, B.x - 1, B.y - 1, B.w + 2, B.h + 2, 35); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.stroke();
      g.restore();

      // ---- トップユニット（機関の蓋）
      g.save();
      const top = () => { g.beginPath(); g.moveTo(70, 128); g.lineTo(110, 22); g.lineTo(790, 22); g.lineTo(830, 128); g.closePath(); };
      Mat.bevelPanel(g, top, Mat.gunmetal(g, 0, 22, 0, 128), { bevel: 4, shadowBlur: 20, pattern: brushed, edge: '#000', edgeWidth: 2 });
      // 中央ロゴプレート
      const plate = () => Mat.chamferRect(g, 220, 36, 460, 78, 14);
      Mat.bevelPanel(g, plate, '#07090b', { bevel: 3, shadowBlur: 10 });
      g.save(); plate(); g.clip();
      const lg = g.createLinearGradient(0, 36, 0, 114); lg.addColorStop(0, 'rgba(60,200,255,0.10)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(60,200,255,0.08)');
      g.fillStyle = lg; g.fillRect(220, 36, 460, 78);
      g.restore();
      if (!this.assets.draw(g, 'cabinet_top')) {
        Mat.chromeText(g, 'ABYSS REACTOR', 450, 70, '900 44px "Orbitron", "Rajdhani", "Arial Black", sans-serif', { size: 44, depth: 6 });
        Mat.engrave(g, 'P 深 淵 機 関', 450, 101, '800 15px "Noto Sans JP", sans-serif', 'rgba(170,220,240,0.85)');
      }
      // 放熱スリット（左右）
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const x = 450 + sx * (262 + i * 18);
          g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.moveTo(x - 4, 44 + i * 2); g.lineTo(x + 4, 44 + i * 2); g.lineTo(x + 4 + sx * 8, 108); g.lineTo(x - 4 + sx * 8, 108); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x - 4, 44 + i * 2, 1.2, 60);
        }
      }
      for (const x of [130, 770]) Mat.bolt(g, x, 112, 6);
      Mat.bolt(g, 236, 50, 4); Mat.bolt(g, 664, 50, 4); Mat.bolt(g, 236, 100, 4); Mat.bolt(g, 664, 100, 4);
      g.restore();

      // ---- サイドピラー（LED 導光管の外装）
      for (const sx of [0, 1]) {
        const x = sx ? 870 : 30;
        g.save();
        Mat.bevelPanel(g, () => Mat.chamferRect(g, x - 22, 150, 44, 900, 10), Mat.gunmetal(g, x - 22, 0, x + 22, 0), { bevel: 3, shadowBlur: 14, pattern: brushed });
        g.fillStyle = '#05070a'; Mat.roundRect(g, x - 8, 176, 16, 848, 8); g.fill();
        for (let y = 200; y < 1020; y += 80) { g.fillStyle = Mat.chrome(g, 0, y - 6, 0, y + 6); g.fillRect(x - 14, y - 5, 28, 10); Mat.bolt(g, x, y, 3); }
        g.restore();
      }

      // ---- 下部（上皿・ボタン・スピーカー・ハンドル）
      g.save();
      const low = () => { g.beginPath(); g.moveTo(30, 1080); g.lineTo(870, 1080); g.lineTo(870, 1300); g.lineTo(820, 1350); g.lineTo(80, 1350); g.lineTo(30, 1300); g.closePath(); };
      if (!this.assets.draw(g, 'cabinet_lower')) {
        Mat.bevelPanel(g, low, Mat.gunmetal(g, 0, 1080, 0, 1350), { bevel: 4, shadowBlur: 24, pattern: brushed, edge: '#000', edgeWidth: 2 });
        // 上皿（玉の溜まる皿）
        const tray = () => { g.beginPath(); g.moveTo(90, 1110); g.lineTo(330, 1110); g.quadraticCurveTo(340, 1160, 320, 1180); g.lineTo(110, 1180); g.quadraticCurveTo(80, 1150, 90, 1110); };
        Mat.bevelPanel(g, tray, '#050608', { bevel: 3, shadowBlur: 4, hi: 'rgba(0,0,0,0.8)', lo: 'rgba(255,255,255,0.15)' });
        Mat.engrave(g, 'BALL STOCK', 210, 1196, '700 10px "Rajdhani", sans-serif');
        // スピーカーグリル（右）
        const spk = (cx, cy, r) => {
          g.save(); g.beginPath(); g.arc(cx, cy, r + 6, 0, TAU); g.fillStyle = Mat.chrome(g, 0, cy - r, 0, cy + r); g.fill();
          g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = '#060708'; g.fill(); g.clip();
          g.fillStyle = 'rgba(80,90,100,0.6)';
          for (let y = cy - r; y < cy + r; y += 6) for (let x = cx - r + ((y / 6) % 2) * 3; x < cx + r; x += 6) { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); }
          const sg = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 0, cx, cy, r); sg.addColorStop(0, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = sg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
          g.restore();
        };
        spk(700, 1180, 56);
        // ボタンハウジング（緊急起動スイッチ）
        g.save(); g.translate(450, 1210);
        Mat.bevelPanel(g, () => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * TAU) / 8; g.lineTo(Math.cos(a) * 118, Math.sin(a) * 104); } g.closePath(); }, Mat.gunmetal(g, 0, -104, 0, 104), { bevel: 4, shadowBlur: 18, pattern: brushed, edge: '#000', edgeWidth: 2 });
        for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; Mat.bolt(g, Math.cos(a) * 104, Math.sin(a) * 90, 4, a); }
        g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.fillStyle = '#050608'; g.fill();
        g.lineWidth = 3; g.strokeStyle = Mat.chrome(g, 0, -90, 0, 90); g.stroke();
        Mat.engrave(g, 'REACTOR  IGNITION', 0, -97, '700 10px "Rajdhani", sans-serif', 'rgba(255,200,120,0.6)');
        g.restore();
        // 銘板
        Mat.bevelPanel(g, () => Mat.chamferRect(g, 330, 1316, 240, 26, 6), '#0a0c0e', { bevel: 1.5, shadowBlur: 6 });
        Mat.engrave(g, 'NAGIBAKU LAB  ·  NBL-001', 450, 1329, '700 11px "Rajdhani", sans-serif', 'rgba(200,215,230,0.75)');
      }
      // 下皿
      const lt = () => { g.beginPath(); g.moveTo(90, 1370); g.lineTo(640, 1370); g.lineTo(620, 1520); g.lineTo(110, 1520); g.closePath(); };
      Mat.bevelPanel(g, lt, Mat.gunmetal(g, 0, 1370, 0, 1520), { bevel: 3, shadowBlur: 18, pattern: brushed, edge: '#000' });
      g.save(); Mat.roundRect(g, 140, 1396, 450, 90, 20); g.fillStyle = '#040506'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke(); g.restore();
      Mat.engrave(g, '— OVERFLOW TRAY —', 365, 1502, '700 10px "Rajdhani", sans-serif');
      // ハンドル台座
      g.save(); g.translate(790, 1420);
      Mat.bevelPanel(g, () => { g.beginPath(); g.arc(0, 0, 82, 0, TAU); }, Mat.gunmetal(g, 0, -80, 0, 80), { bevel: 4, shadowBlur: 20, pattern: brushed, edge: '#000' });
      g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fillStyle = '#07080a'; g.fill();
      for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; g.strokeStyle = i > 7 ? 'rgba(255,80,80,0.7)' : 'rgba(180,200,220,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * 74, Math.sin(a) * 74); g.lineTo(Math.cos(a) * 80, Math.sin(a) * 80); g.stroke(); }
      g.restore();
      g.restore();
      return c;
    }

    // ================================================================= 毎フレーム
    /**
     * s: { t, physics, gimmick, lcd(canvas), button, handle, ballCount, rightShoot, gates, lamps, devNails }
     */
    draw(g, s) {
      const L = this.L, t = s.t;
      this.led.t = t;
      g.save();
      // 筐体全体の振動
      if (this.shake.amp > 0.05) { g.translate((Math.random() - 0.5) * this.shake.amp, (Math.random() - 0.5) * this.shake.amp); this.shake.amp *= 0.86; }
      // 外周の背景（ホールの暗がり）
      g.drawImage(this.boardLayer, 0, 0);
      // 液晶
      const lcd = L.lcd;
      if (s.lcd) {
        g.save(); Mat.roundRect(g, lcd.x, lcd.y, lcd.w, lcd.h, 9); g.clip();
        g.drawImage(s.lcd, lcd.x, lcd.y, lcd.w, lcd.h);
        // 液晶面のわずかな反射
        const rg = g.createLinearGradient(lcd.x, lcd.y, lcd.x + lcd.w * 0.6, lcd.y + lcd.h);
        rg.addColorStop(0, 'rgba(255,255,255,0.07)'); rg.addColorStop(0.3, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(lcd.x, lcd.y, lcd.w, lcd.h);
        g.restore();
      }
      // ワープ中の玉（枠の奥）
      this.drawBalls(g, s.physics, 'warp');
      g.drawImage(this.frameLayer, 0, 0);
      this.drawFrameLEDs(g, t);
      this.drawStage(g, t, s.stageGlow || 0);
      this.drawBalls(g, s.physics, 'stage');
      // 役物
      this.drawWindmills(g, s.physics);
      this.drawDenchu(g, s.gates.denchu, t);
      this.drawAttacker(g, s.gates.attacker, t, s.attackerCount);
      this.drawBoardLamps(g, s);
      if (s.devNails) this.drawNailEditor(g, s.devNails);
      // 玉
      this.drawBalls(g, s.physics, 'field');
      // 可動役物（最前面の液晶前）
      if (s.drawGimmick) s.drawGimmick(g);
      this.drawBalls(g, s.physics, 'ghost');
      // ガラス
      this.drawGlass(g, t);
      // 筐体
      g.drawImage(this.cabinetLayer, 0, 0);
      this.drawCabinetLEDs(g, t, s);
      this.drawTray(g, s);
      this.drawButton(g, s.button, t);
      this.drawHandle(g, s.handle, t);
      g.restore();
      // 全体フラッシュ
      if (this.led.flash > 0.01) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(${this.led.flashColor || '255,255,255'},${this.led.flash * 0.5})`; g.fillRect(0, 0, this.W, this.H); g.restore(); this.led.flash *= 0.88; }
    }

    drawBalls(g, ph, layer) {
      if (!ph) return;
      const sp = this.assets.image('ball'), sg = this.assets.image('ball_ghost'), r = this.L.ballRadius;
      for (const b of ph.balls) {
        const isWarp = !!b.warp, isStage = b.onStage && !b.ghost, isGhost = b.ghost;
        const L = isWarp ? 'warp' : isGhost ? 'ghost' : isStage ? 'stage' : 'field';
        if (L !== layer) continue;
        let rr = r;
        if (isGhost) rr = r * (1 + Math.min(0.35, (b.y - 640) / 200));
        g.save();
        if (isWarp) g.globalAlpha = 0.6;
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(b.x + 2, b.y + 3, rr, 0, TAU); g.fill();
        g.drawImage(isGhost ? sg : sp, b.x - rr - 0.5, b.y - rr - 0.5, rr * 2 + 1, rr * 2 + 1);
        g.restore();
      }
    }

    drawWindmills(g, ph) {
      const ws = ph ? ph.windmills : this.L.windmills;
      for (const w of ws) {
        g.save(); g.translate(w.x, w.y); g.rotate(w.angle || 0);
        for (let i = 0; i < 4; i++) {
          g.rotate(TAU / 4);
          g.beginPath(); g.moveTo(-2.5, 0); g.lineTo(-4, -w.r); g.lineTo(4, -w.r); g.lineTo(2.5, 0); g.closePath();
          g.fillStyle = 'rgba(160,230,255,0.45)'; g.fill(); g.strokeStyle = 'rgba(220,250,255,0.8)'; g.lineWidth = 0.8; g.stroke();
        }
        g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fillStyle = Mat.chrome(g, 0, -4, 0, 4); g.fill();
        g.restore();
      }
    }

    drawDenchu(g, open, t) {
      const D = this.L.denchu;
      g.save();
      g.translate(D.x, D.y);
      // 本体
      Mat.bevelPanel(g, () => Mat.chamferRect(g, -16, -10, 32, 26, 4), Mat.gunmetal(g, 0, -10, 0, 16), { bevel: 1.2, shadowBlur: 6 });
      g.fillStyle = '#020304'; g.fillRect(-11, -8, 22, 14);
      // 羽根
      const ang = open ? 0.85 : 0.0;
      for (const sx of [-1, 1]) {
        g.save(); g.translate(sx * 13, -10); g.rotate(-sx * ang);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(sx * -14 * (open ? 0 : 1) + sx * (open ? 2 : 0), -2); g.lineTo(sx * (open ? -2 : -14), open ? -26 : -6); g.lineTo(0, -4); g.closePath();
        g.fillStyle = open ? 'rgba(255,80,80,0.75)' : 'rgba(200,220,240,0.5)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.8; g.stroke();
        g.restore();
      }
      if (open) Mat.glowLine(g, () => { g.beginPath(); g.moveTo(-12, 12); g.lineTo(12, 12); }, '#ff3040', 1.5, 0.8 + 0.2 * Math.sin(t * 30));
      g.restore();
    }

    drawAttacker(g, open, t, count) {
      const A = this.L.attacker;
      g.save();
      if (!this.assets.draw(g, 'attacker')) {
        Mat.bevelPanel(g, () => Mat.chamferRect(g, A.x - 58, A.y - 16, 116, 34, 6), Mat.gunmetal(g, 0, A.y - 16, 0, A.y + 18), { bevel: 1.5, shadowBlur: 8 });
      }
      g.fillStyle = '#010203'; g.fillRect(A.x - 47, A.y - 8, 94, 14);
      // 蓋（開放時は奥へ倒れる）
      const lid = open ? 0.2 : 1;
      g.fillStyle = Mat.chrome(g, 0, A.y - 10, 0, A.y + 4, [255, 220, 200]);
      g.fillRect(A.x - 49, A.y - 9, 98, 10 * lid + 1);
      const col = open ? '#ff4040' : '#3a2020';
      Mat.glowLine(g, () => { g.beginPath(); g.moveTo(A.x - 46, A.y + 12); g.lineTo(A.x + 46, A.y + 12); }, col, 2, open ? 0.9 : 0.15);
      if (open && count != null) {
        for (let i = 0; i < 10; i++) { g.fillStyle = i < count ? '#ffdd55' : 'rgba(80,60,40,0.8)'; g.fillRect(A.x - 45 + i * 9.4, A.y + 6, 7, 3); }
      }
      g.restore();
    }

    /** 盤面のランプ類：特図/普図表示器、保留ランプ、右打ちランプ */
    drawBoardLamps(g, s) {
      const lp = s.lamps || {};
      g.save();
      // 7seg 特図表示（簡易）
      const seg = (x, on, col) => { g.fillStyle = on ? col : 'rgba(60,20,20,0.6)'; g.fillRect(x, 938, 8, 3); g.fillRect(x, 946, 8, 3); g.fillRect(x, 954, 8, 3); };
      seg(182, lp.t1Spin && Math.floor(s.t * 12) % 2, '#ff3a2a'); seg(196, lp.t1Hold > 0, '#ff3a2a');
      seg(216, lp.t2Spin && Math.floor(s.t * 12) % 2, '#ff3a2a'); seg(230, lp.t2Hold > 0, '#ff3a2a');
      seg(254, lp.fSpin && Math.floor(s.t * 8) % 2, '#3aff6a');
      for (let i = 0; i < 4; i++) { g.fillStyle = i < (lp.t1Hold || 0) ? '#ffb030' : 'rgba(60,40,10,0.7)'; g.beginPath(); g.arc(184 + i * 6, 961, 1.8, 0, TAU); g.fill(); }
      for (let i = 0; i < 4; i++) { g.fillStyle = i < (lp.t2Hold || 0) ? '#ffb030' : 'rgba(60,40,10,0.7)'; g.beginPath(); g.arc(218 + i * 6, 961, 1.8, 0, TAU); g.fill(); }
      g.restore();
      // 右打ちランプ（盤面右上）
      const on = s.rightShoot;
      g.save(); g.translate(796, 236);
      Mat.bevelPanel(g, () => Mat.chamferRect(g, -34, -12, 68, 24, 5), '#0a0c0e', { bevel: 1.2, shadowBlur: 6 });
      g.font = '900 12px "Noto Sans JP", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (on && Math.floor(s.t * 3) % 2 === 0) { g.shadowColor = '#ff2020'; g.shadowBlur = 16; g.fillStyle = '#ff5050'; } else g.fillStyle = on ? '#a02020' : 'rgba(90,40,40,0.6)';
      g.fillText('右打ち ▶', 0, 1);
      g.restore();
    }

    drawFrameLEDs(g, t) {
      const L = this.L, a = L.frame.arch;
      const [r, gg, b] = this.led.color;
      const col = `rgb(${r},${gg},${b})`;
      const inten = this.ledIntensity(t, 0);
      // アーチ内側の導光ライン
      Mat.glowLine(g, () => { g.beginPath(); g.ellipse(a.cx, a.cy, a.rx - 14, a.ry - 14, 0, Math.PI * 1.08, Math.PI * 1.92); }, col, 2, inten * 0.7);
      // 液晶下の LED ドット
      for (let i = 0; i < 16; i++) {
        const k = this.ledIntensity(t, i / 16);
        g.save(); g.globalCompositeOperation = 'lighter';
        const x = 222 + i * 30.5, y = 664;
        const rg = g.createRadialGradient(x, y, 0, x, y, 8); rg.addColorStop(0, `rgba(255,255,255,${0.8 * k})`); rg.addColorStop(0.3, `rgba(${r},${gg},${b},${0.7 * k})`); rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        g.fillStyle = rg; g.fillRect(x - 8, y - 8, 16, 16); g.restore();
      }
    }

    /** LED パターン：位置 u(0..1) に対する輝度 */
    ledIntensity(t, u) {
      const md = this.led.mode, I = this.led.intensity;
      switch (md) {
        case 'off': return 0;
        case 'idle': return I * (0.35 + 0.15 * Math.sin(t * 1.2 + u * 2));
        case 'reach': return I * (0.55 + 0.45 * Math.max(0, Math.sin(t * 6 - u * 10)));
        case 'sp': return I * (0.6 + 0.4 * Math.sin(t * 9 - u * 14));
        case 'chase': return I * (Math.max(0, Math.sin(t * 14 - u * 22)) ** 2);
        case 'strobe': return I * (Math.floor(t * 16) % 2 ? 1 : 0.1);
        case 'rainbow': case 'win': return I * (0.75 + 0.25 * Math.sin(t * 10 - u * 8));
        case 'rush': return I * (0.4 + 0.6 * Math.max(0, Math.sin(t * 10 - u * 16)));
        case 'warn': return I * (Math.sin(t * 5) > 0 ? 0.9 : 0.15);
        default: return I * 0.5;
      }
    }
    ledColorAt(t, u) {
      if (this.led.mode === 'rainbow' || this.led.mode === 'win') { const h = (t * 160 + u * 360) % 360; return `hsl(${h},100%,60%)`; }
      const [r, g, b] = this.led.color; return `rgb(${r},${g},${b})`;
    }

    drawCabinetLEDs(g, t, s) {
      // サイド導光管
      for (const x of [30, 870]) {
        for (let i = 0; i < 34; i++) {
          const u = i / 34, y = 186 + i * 24.6, k = this.ledIntensity(t, x > 450 ? u : 1 - u);
          if (k < 0.03) continue;
          g.save(); g.globalCompositeOperation = 'lighter';
          const col = this.ledColorAt(t, u);
          g.globalAlpha = k * 0.9; g.fillStyle = col; g.fillRect(x - 5, y, 10, 18);
          g.globalAlpha = k * 0.25; g.fillRect(x - 12, y - 4, 24, 26);
          g.globalAlpha = k * 0.7; g.fillStyle = '#fff'; g.fillRect(x - 1.5, y + 2, 3, 14);
          g.restore();
        }
      }
      // トップの LED ライン
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        const u = i / 40, x = 118 + i * 16.6, k = this.ledIntensity(t, Math.abs(u - 0.5) * 2);
        if (k < 0.03) continue;
        g.globalAlpha = k; g.fillStyle = this.ledColorAt(t, u);
        g.fillRect(x, 125, 12, 4);
        g.globalAlpha = k * 0.3; g.fillRect(x - 3, 121, 18, 12);
      }
      // 下部ライン
      for (let i = 0; i < 44; i++) {
        const u = i / 44, x = 60 + i * 18.2, k = this.ledIntensity(t, u);
        if (k < 0.03) continue;
        g.globalAlpha = k; g.fillStyle = this.ledColorAt(t, u); g.fillRect(x, 1072, 12, 4);
        g.globalAlpha = k * 0.3; g.fillRect(x - 3, 1068, 18, 12);
      }
      g.restore();
      // ロゴプレート発光
      const lk = this.ledIntensity(t, 0.5);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25 * lk;
      const lg = g.createRadialGradient(450, 75, 10, 450, 75, 260); lg.addColorStop(0, this.ledColorAt(t, 0.5)); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(220, 36, 460, 78); g.restore();
    }

    drawGlass(g, t) {
      const B = this.L.board;
      g.save(); Mat.roundRect(g, B.x, B.y, B.w, B.h, 34); g.clip();
      g.globalCompositeOperation = 'screen';
      if (!this.assets.draw(g, 'glass')) {
        const gr = g.createLinearGradient(B.x, B.y, B.x + B.w, B.y + B.h);
        gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.0)');
        gr.addColorStop(0.62, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.66, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(160,220,255,0.04)');
        g.fillStyle = gr; g.fillRect(B.x, B.y, B.w, B.h);
        // 斜めの映り込み帯
        g.translate(450, 600); g.rotate(-0.6);
        const band = g.createLinearGradient(-60, 0, 60, 0); band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.045)'); band.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = band; g.fillRect(-260, -900, 120, 1800); g.fillRect(140, -900, 40, 1800);
      }
      g.restore();
      // ガラス周辺の影（奥行き）
      g.save(); Mat.roundRect(g, B.x, B.y, B.w, B.h, 34); g.clip();
      g.lineWidth = 26; g.strokeStyle = 'rgba(0,0,0,0.35)'; Mat.roundRect(g, B.x, B.y, B.w, B.h, 34); g.stroke();
      g.restore();
    }

    drawTray(g, s) {
      // 上皿の玉（持ち玉量に応じて山を描く）
      const n = Math.min(260, Math.floor((s.ballCount || 0) / 4));
      const sp = this.assets.image('ball');
      g.save(); g.beginPath(); g.moveTo(92, 1112); g.lineTo(328, 1112); g.quadraticCurveTo(338, 1160, 318, 1178); g.lineTo(112, 1178); g.quadraticCurveTo(82, 1150, 92, 1112); g.clip();
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 21), col = i % 21;
        const x = 104 + col * 10.5 + (row % 2) * 5, y = 1170 - row * 8.5;
        if (y < 1112) break;
        g.drawImage(sp, x - 6, y - 6, 12, 12);
      }
      g.restore();
      // 持ち玉表示（7seg 風）
      g.save(); Mat.roundRect(g, 120, 1206, 180, 28, 4); g.fillStyle = '#050606'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.stroke();
      Mat.sevenSeg(g, String(Math.max(0, Math.floor(s.ballCount || 0))), 294, 1230, 18, '#ff5a2a', 6);
      g.font = '700 10px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.shadowBlur = 0; g.fillStyle = 'rgba(200,210,220,0.6)'; g.fillText('BALLS', 126, 1221);
      g.restore();
    }

    drawButton(g, b, t) {
      const cx = 450, cy = 1210;
      g.save(); g.translate(cx, cy);
      const lit = b && b.lit, press = b && b.pressT > 0 ? b.pressT : 0;
      const img = this.assets.get(lit ? 'push_button_lit' : 'push_button');
      const sc = 1 - press * 0.06;
      g.scale(sc, sc);
      if (img) { g.drawImage(img, -95, -95, 190, 190); }
      else {
        // ボタン本体：透明樹脂ドーム＋内部コア
        const col = lit ? (b.color || '#ff3040') : '#2a6a8a';
        g.beginPath(); g.arc(0, 0, 78, 0, TAU);
        const dg = g.createRadialGradient(-20, -26, 6, 0, 0, 80);
        dg.addColorStop(0, lit ? '#ffffff' : '#9adfff'); dg.addColorStop(0.25, col); dg.addColorStop(0.85, lit ? '#300008' : '#06141c'); dg.addColorStop(1, '#000');
        g.fillStyle = dg; g.fill();
        // 内部構造（機関のシンボル）
        g.save(); g.globalAlpha = lit ? 0.9 : 0.5; g.strokeStyle = lit ? '#fff' : '#8ad8ff'; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke();
        for (let i = 0; i < 3; i++) { g.rotate(TAU / 3 + (lit ? t * 2 : t * 0.3)); g.beginPath(); g.moveTo(0, -12); g.lineTo(10, -36); g.lineTo(-10, -36); g.closePath(); g.stroke(); }
        g.restore();
        // ハイライト
        g.beginPath(); g.ellipse(-22, -34, 34, 16, -0.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
        g.lineWidth = 4; g.strokeStyle = Mat.chrome(g, 0, -78, 0, 78); g.beginPath(); g.arc(0, 0, 78, 0, TAU); g.stroke();
        if (lit) { g.globalCompositeOperation = 'lighter'; const k = 0.5 + 0.5 * Math.sin(t * 14); g.globalAlpha = 0.35 + 0.35 * k; const og = g.createRadialGradient(0, 0, 60, 0, 0, 120); og.addColorStop(0, col); og.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = og; g.beginPath(); g.arc(0, 0, 120, 0, TAU); g.fill(); }
      }
      g.restore();
      if (lit) { g.save(); g.font = '900 20px "Noto Sans JP", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = '#ff2a2a'; g.shadowBlur = 12; g.fillText('PUSH', cx, cy + 128); g.restore(); }
    }

    drawHandle(g, h, t) {
      const cx = 790, cy = 1420;
      const p = h ? h.power : 0;
      g.save(); g.translate(cx, cy);
      // 強度インジケータ（発光）
      g.lineWidth = 5; g.lineCap = 'round';
      g.strokeStyle = 'rgba(40,60,70,0.8)'; g.beginPath(); g.arc(0, 0, 62, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
      const col = p > 0.62 ? '#ff4040' : '#40d8ff';
      g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = h && h.active ? 12 : 0;
      g.beginPath(); g.arc(0, 0, 62, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * p)); g.stroke(); g.shadowBlur = 0;
      g.rotate(-1.2 + p * 2.4);
      const img = this.assets.get('handle');
      if (img) g.drawImage(img, -75, -75, 150, 150);
      else {
        g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fillStyle = Mat.chrome(g, -50, -50, 50, 50); g.fill();
        g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.fillStyle = Mat.gunmetal(g, 0, -40, 0, 40); g.fill();
        for (let i = 0; i < 18; i++) { g.rotate(TAU / 18); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-1.5, -50, 3, 9); }
        // レバー（つまみ）
        g.fillStyle = Mat.chrome(g, -12, 0, 12, 0); Mat.roundRect(g, -10, -78, 20, 46, 8); g.fill();
        g.fillStyle = h && h.active ? '#ff6040' : '#3a4048'; g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill();
      }
      g.restore();
      g.save(); g.font = '700 11px "Rajdhani", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(200,220,235,0.7)';
      g.fillText(h && h.active ? (p > 0.62 ? 'RIGHT SHOT' : 'LEFT SHOT') : 'HANDLE', cx, cy + 96); g.restore();
    }

    drawNailEditor(g, ed) {
      g.save();
      for (const n of this.L.nails) {
        g.strokeStyle = n === ed.sel ? '#ff0' : n.g === 'heso' ? '#f44' : 'rgba(0,255,180,0.5)';
        g.lineWidth = 1; g.beginPath(); g.arc(n.x, n.y, 5, 0, TAU); g.stroke();
      }
      g.restore();
    }

    setLED(mode, color, intensity = 1) {
      this.led.mode = mode; if (color) this.led.color = color; this.led.intensity = intensity;
    }
    flash(amount = 1, color) { this.led.flash = Math.max(this.led.flash, amount); this.led.flashColor = color || '255,255,255'; }
    shakeIt(a) { this.shake.amp = Math.max(this.shake.amp, a); }
  }

  NB.MachineRenderer = MachineRenderer;
})(globalThis.NB);
