/* ==========================================================
 * 筐体：ボタン・レバー・ランプ・7セグ・役物・拡縮
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U;
  const $ = (s) => document.querySelector(s);

  // ---------- 7セグ ----------
  const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
  function drawSeg(cv, value, digits, color) {
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    const str = String(value).padStart(digits, ' ').slice(-digits);
    const dw = w / digits, t = h * 0.1, L = dw * 0.62, Hh = (h - t * 3) / 2;
    for (let i = 0; i < digits; i++) {
      const on = SEGS[str[i]] || '';
      const x0 = i * dw + (dw - L) / 2 + 3, y0 = h * 0.06;
      const seg = {
        a: [x0 + t * 0.5, y0, L - t, t], g: [x0 + t * 0.5, y0 + Hh + t, L - t, t], d: [x0 + t * 0.5, y0 + Hh * 2 + t * 2, L - t, t],
        f: [x0, y0 + t * 0.5, t, Hh], b: [x0 + L - t, y0 + t * 0.5, t, Hh],
        e: [x0, y0 + Hh + t * 1.5, t, Hh], c: [x0 + L - t, y0 + Hh + t * 1.5, t, Hh],
      };
      for (const k in seg) {
        const [x, y, sw, sh] = seg[k];
        const lit = on.includes(k);
        g.fillStyle = lit ? color : 'rgba(255,60,60,0.07)';
        g.shadowColor = color; g.shadowBlur = lit ? 8 : 0;
        g.save(); g.translate(x + sw / 2, y + sh / 2); g.transform(1, 0, -0.12, 1, 0, 0);
        g.fillRect(-sw / 2, -sh / 2, sw, sh); g.restore();
      }
    }
    g.shadowBlur = 0;
  }

  let stage, topper, tctx, belly, bctx, segs = {}, stopBtns = [], lever, eye, plate, toastEl, toastTimer;
  let bellyT = 0;

  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / 720, vh / 1280);
    stage.style.transform = `scale(${s})`;
  }

  function drawTopper(t) {
    const g = tctx;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 720, 170);
    // 炎
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = 20 + i * 27 + Math.sin(t * 2 + i) * 4;
      const hgt = 40 + 34 * (0.5 + 0.5 * Math.sin(t * 5 + i * 1.7)) * (0.6 + 0.4 * Math.sin(t * 1.3 + i));
      const gr = g.createLinearGradient(0, 170, 0, 170 - hgt * 1.6);
      gr.addColorStop(0, 'rgba(255,80,20,0.7)'); gr.addColorStop(0.5, 'rgba(255,40,10,0.35)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 18, 170);
      g.quadraticCurveTo(x - 14 + Math.sin(t * 7 + i) * 6, 170 - hgt, x + Math.sin(t * 4 + i) * 8, 170 - hgt * 1.6);
      g.quadraticCurveTo(x + 14, 170 - hgt * 0.8, x + 18, 170); g.closePath(); g.fill();
    }
    g.restore();
    // ロゴは重いのでキャッシュ（約0.5秒ごとに魔法陣の回転だけ更新）
    if (!logoCache || t - logoT > 0.5) {
      logoT = t;
      logoCache = logoCache || document.createElement('canvas');
      logoCache.width = 1440; logoCache.height = 340;
      const lc = logoCache.getContext('2d');
      lc.setTransform(2, 0, 0, 2, 0, 0); lc.clearRect(0, 0, 720, 170);
      MK.Art.logo(lc, 360, 84, 0.68, t);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(logoCache, 0, 0);
    // 光沢スイープ
    const sx = MK.U.mod(t * 260, 2600) - 300;
    g.save(); g.globalCompositeOperation = 'source-atop';
    const sg = g.createLinearGradient(sx - 80, 0, sx + 80, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,240,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg; g.fillRect(sx - 80, 40, 160, 220);
    g.restore();
  }
  let logoCache = null, logoT = -9;

  function drawBelly(t) {
    const g = bctx, A = MK.Art;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 720, 170);
    g.fillStyle = A.lg(g, 0, 0, 0, 170, ['#2a0410', '#12020a', '#050104']); g.fillRect(0, 0, 720, 170);
    MK.FX.magicCircle(g, 560, 120, 130, t * 0.3, 'rgba(255,60,90,1)', { alpha: 0.25, blur: 0, tilt: 0.5 });
    g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(MK.FX.glow('rgba(255,80,40,0.35)', 128), 360, -40, 400, 260); g.restore();
    A.maou(g, 600, 230, 0.42, t, 'grin');
    const ms = ['slime', 'goblin', 'skeleton', 'imp'];
    ms.forEach((type, i) => A.monster(g, { type, x: 40 + i * 62, y: 156, s: 0.55, face: 1, anim: 'idle', lv: 1 }, t + i));
    MK.FX.fancyText(g, '勇者を倒せ。', 160, 40, 30, { palette: 'gold', align: 'left' });
    MK.FX.fancyText(g, '赤字を出すな。', 196, 82, 30, { palette: 'blood', align: 'left' });
    g.font = '600 11px "Cinzel", serif'; g.fillStyle = '#c9a65a'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('NAGIBAKU LAB  PROTOTYPE No.001', 300, 118);
    g.font = '700 9px "Shippori Mincho B1", serif'; g.fillStyle = 'rgba(255,230,200,0.7)';
    g.fillText('※本機は架空の試作機です。実際の遊技機・金銭・換金とは一切関係ありません。', 262, 146);
    // 金属枠
    g.strokeStyle = '#d9a640'; g.lineWidth = 2; g.strokeRect(8, 6, 704, 150);
  }

  const MODE_NAMES = { normal: '通常時', cz: 'CZ\n勇者襲来', at: 'AT\n魔王経営', judge: '継続\nジャッジ', upper: '上位AT\n世界征服', upperJudge: '王国軍\n決戦' };

  const C = {
    init() {
      stage = $('#stage');
      topper = $('#topper'); tctx = topper.getContext('2d');
      belly = $('#belly'); bctx = belly.getContext('2d');
      segs = { credit: $('#segCredit'), game: $('#segGame'), pay: $('#segPay') };
      stopBtns = [...document.querySelectorAll('.stop')];
      lever = $('#lever'); eye = $('#eyeLamp'); plate = $('#modePlate'); toastEl = $('#toast');
      fit();
      window.addEventListener('resize', fit);
      const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); MK.Audio.unlock(); fn(e); });
      tap(lever, () => { lever.classList.add('down'); MK.Game.lever(); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => lever.addEventListener(ev, () => setTimeout(() => lever.classList.remove('down'), 90)));
      stopBtns.forEach((b, i) => tap(b, () => MK.Game.stop(i)));
      tap($('#btnBet'), () => MK.Game.bet());
      tap($('#btnPush'), () => MK.Game.push());
      // キーボード
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
        MK.Audio.unlock();
        if (k === ' ' || k === 'enter' || k === 'arrowup') { e.preventDefault(); lever.classList.add('down'); setTimeout(() => lever.classList.remove('down'), 140); MK.Game.lever(); }
        else if (k === 'z' || k === '1' || k === 'arrowleft') MK.Game.stop(0);
        else if (k === 'x' || k === '2' || k === 'arrowdown') { e.preventDefault(); MK.Game.stop(1); }
        else if (k === 'c' || k === '3' || k === 'arrowright') MK.Game.stop(2);
        else if (k === 'b') MK.Game.bet();
        else if (k === 'p') MK.Game.push();
        else if (k === 'm') { MK.Audio.setMuted(!MK.Audio.muted); C.toast(MK.Audio.muted ? 'サウンド OFF' : 'サウンド ON'); }
        else if (k === 'd') MK.Dev && MK.Dev.toggle();
        else if (k === 'h') document.body.classList.toggle('rec');
        else if (k === 'l') document.body.classList.toggle('lcdonly');
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawBelly(0));
      drawBelly(0);
    },
    setLamp(m) { stage.dataset.lamp = m; },
    flashLamps(ms = 300) { stage.classList.add('flashlamp'); setTimeout(() => stage.classList.remove('flashlamp'), ms); },
    eyeLamp(on) { eye.classList.toggle('on', !!on); if (on) C.flashLamps(400); },
    pulse(name) {
      const el = name === 'bet' ? $('#btnBet') : name === 'push' ? $('#btnPush') : name.startsWith('stop') ? stopBtns[+name.slice(4)] : null;
      if (!el) return;
      el.classList.add('press'); setTimeout(() => el.classList.remove('press'), 120);
    },
    showNavi(order) {
      order.forEach((reel, k) => { stopBtns[reel].querySelector('em').textContent = k + 1; stopBtns[reel].classList.add('navi'); });
    },
    hideNavi() { stopBtns.forEach((b) => { b.classList.remove('navi', 'next'); b.querySelector('em').textContent = ''; }); },
    stopLamp(i) { stopBtns[i].classList.remove('navi', 'next'); stopBtns[i].querySelector('em').textContent = ''; },
    toast(msg, ms = 2400) {
      toastEl.textContent = msg; toastEl.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    },
    update(dt, t) {
      const S = MK.S, G = MK.Game;
      stopBtns.forEach((b, i) => {
        b.classList.toggle('on', !!G.cur && MK.Reels.isSpinning(i));
        if (G.cur && G.cur.navi) b.classList.toggle('next', G.cur.order[G.cur.pressed.length] === i);
      });
      drawSeg(segs.credit, Math.min(50, S.medals), 2, '#ff3a3a');
      drawSeg(segs.game, S.games % 10000, 4, '#ff3a3a');
      drawSeg(segs.pay, S.pay || 0, 2, '#ffb43a');
      plate.textContent = MODE_NAMES[S.mode] || '';
      plate.style.whiteSpace = 'pre';
      $('#btnPush').classList.toggle('ready', !!C.pushReady);
      drawTopper(t);
      bellyT += dt;
      if (bellyT > 0.1) { bellyT = 0; drawBelly(t); }
    },
  };
  MK.Cabinet = C;
})(window.MK);
