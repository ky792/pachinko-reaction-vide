/* ==========================================================
 * 起動・メインループ
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U;

  function boot() {
    MK.LCD.init(document.getElementById('lcd'));
    MK.Reels.init(document.getElementById('reels'));
    MK.Cabinet.init();
    MK.LCD.setScene('normal');
    document.getElementById('devToggle').onclick = () => MK.Dev.toggle();
    MK.Dev.applyParams();

    const full = document.getElementById('lcdFull');
    const fctx = full.getContext('2d');

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000) * MK.timeScale;
      last = now;
      const t = U.now();
      MK.FX.update(dt);
      MK.Reels.update(dt);
      MK.LCD.update(dt);
      MK.LCD.draw(t);
      MK.Reels.draw();
      MK.Cabinet.update(dt, t);
      MK.Dev.Auto.update(dt);
      MK.Dev.update();
      // 液晶のみ表示：LCD＋小さなリールを 1920x1080 に合成
      if (document.body.classList.contains('lcdonly')) {
        fctx.drawImage(MK.LCD.canvas, 0, 0, 1920, 1080);
        const rw = 486 * 1.05, rh = 246 * 1.05, rx = 1920 - rw - 40, ry = 1080 - rh - 40;
        fctx.fillStyle = '#1a0a06'; fctx.fillRect(rx - 10, ry - 10, rw + 20, rh + 20);
        fctx.strokeStyle = '#d9a640'; fctx.lineWidth = 4; fctx.strokeRect(rx - 10, ry - 10, rw + 20, rh + 20);
        fctx.drawImage(MK.Reels && document.getElementById('reels'), rx, ry, rw, rh);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  MK.Assets.load().then(boot);
})(window.MK);
