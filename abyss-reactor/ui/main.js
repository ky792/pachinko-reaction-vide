/*
 * アプリ起動・メインループ・入力・表示モード
 *  表示モード：play（通常）/ stream（16:9 配信）/ machine（実機のみ）
 *  キー：Space 発射 / ←→ 強さ / R 右打ち切替 / Enter・B ボタン / A オート / D 開発者 / S 表示モード / F 全画面 / M 消音
 */
(function (NB) {
  'use strict';
  const MACHINE_ID = (new URLSearchParams(location.search).get('machine')) || 'abyss-reactor';

  class App {
    constructor() {
      const machine = NB.machines[MACHINE_ID];
      this.machine = machine;
      // 釘調整の保存値
      try { const n = JSON.parse(localStorage.getItem('nb-nails-' + MACHINE_ID) || 'null'); if (Array.isArray(n) && n.length) machine.layout.nails = n; } catch (e) {}
      this.assets = new NB.AssetManager(machine.assets);
      this.audio = new NB.AudioManager(machine.sound);
      this.lcd = new NB.LCD(this.assets);
      this.mr = new NB.MachineRenderer(machine, this.assets);
      this.canvas = document.getElementById('machine');
      this.ctx = this.canvas.getContext('2d');
      this.dcCanvas = document.getElementById('counter');
      this.dc = new NB.DataCounter(this.dcCanvas);
      this.mode = 'play';
      this.idleT = 0;
      this.fps = 60; this.frames = 0; this.fpsT = 0;
    }

    async boot() {
      const bar = document.querySelector('#boot .bar i');
      await this.assets.load((p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
      NB.Sprites.makeAll(this.assets);
      this.mr.build();
      this.game = new NB.Game(this.machine, { audio: this.audio, lcd: this.lcd, mr: this.mr });
      this.game.load();
      try { const s = JSON.parse(localStorage.getItem('nb-settings') || 'null'); if (s) { Object.assign(this.game.settings, s.game || {}); Object.assign(this.audio.volumes, s.vol || {}); this.game.handle.power = this.game.settings.leftPower; } } catch (e) {}
      this.dev = new NB.DevTools(this);
      this.bindInput();
      this.bindPanel();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('fullscreenchange', () => this.resize());
      setInterval(() => this.persist(), 10000);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });
      window.addEventListener('beforeunload', () => this.persist());
      document.querySelector('#boot .start').hidden = false;
      document.querySelector('#boot .bar').hidden = true;
      const params = new URLSearchParams(location.search);
      if (params.get('mode')) this.setMode(params.get('mode'));
      if (params.get('auto') === '1') { this.game.settings.autoPlay = true; this.game.settings.autoButton = true; }
      if (params.get('autostart') === '1') this.start();
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    start() {
      document.getElementById('boot').classList.add('gone');
      this.audio.unlock();
      if (this.game.mode === 'rush') this.audio.playBGM('rush'); else this.audio.playBGM('normal_lab');
      this.lcd.fx('flash', 0.6, {}); this.mr.flash(0.5);
    }

    persist() {
      if (!this.game) return;
      this.game.save();
      try { localStorage.setItem('nb-settings', JSON.stringify({ game: this.game.settings, vol: this.audio.volumes })); } catch (e) {}
    }

    // ------------------------------------------------------------------ レイアウト
    setMode(m) {
      this.mode = m;
      document.body.dataset.mode = m;
      if (m !== 'play') this.dev.toggle(false);
      this.resize();
      this.updatePanel();
    }
    cycleMode() { this.setMode({ play: 'stream', stream: 'machine', machine: 'play' }[this.mode]); }

    resize() {
      const vw = window.innerWidth, vh = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const stage = document.getElementById('stage');
      let mh, showCounter;
      if (this.mode === 'stream') {
        // 16:9 ボックス
        let bw = vw, bh = vw * 9 / 16; if (bh > vh) { bh = vh; bw = vh * 16 / 9; }
        stage.style.width = bw + 'px'; stage.style.height = bh + 'px';
        mh = bh * 0.98; showCounter = true;
        this.dcCanvas.style.height = (bh * 0.9) + 'px'; this.dcCanvas.style.width = (bh * 0.9 * 0.52) + 'px';
      } else {
        stage.style.width = vw + 'px'; stage.style.height = vh + 'px';
        const panelH = this.mode === 'play' ? (vw < 700 ? 132 : 76) : 0;
        mh = vh - panelH - 8;
        const mw = mh * 900 / 1560;
        showCounter = this.mode === 'play' && vw > mw + 300;
        if (showCounter) { const ch = Math.min(mh * 0.86, (vw - mw - 40) / 0.52); this.dcCanvas.style.height = ch + 'px'; this.dcCanvas.style.width = ch * 0.52 + 'px'; }
        if (!showCounter && vw < mw) { mh = vw * 1560 / 900; }
      }
      const mw = mh * 900 / 1560;
      this.canvas.style.width = mw + 'px'; this.canvas.style.height = mh + 'px';
      const k = Math.min(2, (mh * dpr) / 1560);
      this.canvas.width = Math.round(900 * k); this.canvas.height = Math.round(1560 * k); this.scale = k;
      this.dcCanvas.style.display = showCounter ? 'block' : 'none';
      const ch = parseFloat(this.dcCanvas.style.height) || 0;
      this.dcCanvas.width = Math.round(520 * Math.min(2, (ch * dpr) / 1000)); this.dcCanvas.height = Math.round(1000 * Math.min(2, (ch * dpr) / 1000));
      this.showCounter = showCounter;
    }

    // ------------------------------------------------------------------ 入力
    toLogical(e) { const r = this.canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 900, y: ((e.clientY - r.top) / r.height) * 1560 }; }
    bindInput() {
      const G = this.game, c = this.canvas;
      let drag = null;
      c.addEventListener('pointerdown', (e) => {
        this.audio.unlock(); this.idleT = 0;
        const p = this.toLogical(e);
        if (this.nailEdit) { let best = null, bd = 12; for (const n of this.machine.layout.nails) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = n; } } this.nailEdit.sel = best; if (best) { drag = { nail: best }; c.setPointerCapture(e.pointerId); } return; }
        if (Math.hypot(p.x - 790, p.y - 1420) < 100) { drag = { handle: true, wasActive: G.handle.active, moved: 0, sy: p.y, sp: G.handle.power }; G.handle.active = true; G.settings.autoPlay = false; c.setPointerCapture(e.pointerId); this.updatePanel(); return; }
        if (Math.hypot(p.x - 450, p.y - 1210) < 100) { G.pressButton(); return; }
      });
      c.addEventListener('pointermove', (e) => {
        if (!drag) return; const p = this.toLogical(e);
        if (drag.nail) { drag.nail.x = Math.round(p.x * 2) / 2; drag.nail.y = Math.round(p.y * 2) / 2; this.dev.applyNails(); return; }
        if (drag.handle) { drag.moved += Math.abs(p.y - drag.sy); G.handle.power = NB.math.clamp(drag.sp + (drag.sy - p.y) / 240, 0, 1); this.updatePanel(); }
      });
      const up = () => { if (drag && drag.handle && drag.moved < 6 && drag.wasActive) G.handle.active = false; drag = null; this.updatePanel(); };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        this.audio.unlock(); this.idleT = 0;
        const k = e.key;
        if (k === ' ') { e.preventDefault(); G.handle.active = !G.handle.active; G.settings.autoPlay = false; }
        else if (k === 'ArrowLeft' || k === 'ArrowDown') G.handle.power = Math.max(0, G.handle.power - 0.02);
        else if (k === 'ArrowRight' || k === 'ArrowUp') G.handle.power = Math.min(1, G.handle.power + 0.02);
        else if (k === 'Enter' || k === 'b' || k === 'B') G.pressButton();
        else if (k === 'r' || k === 'R') G.handle.power = G.handle.power > 0.62 ? G.settings.leftPower : G.settings.rightPower;
        else if (k === 'a' || k === 'A') { G.settings.autoPlay = !G.settings.autoPlay; G.settings.autoButton = G.settings.autoPlay; if (!G.settings.autoPlay) G.handle.active = false; }
        else if (k === 'd' || k === 'D') { if (this.mode === 'play') this.dev.toggle(); }
        else if (k === 's' || k === 'S') this.cycleMode();
        else if (k === 'f' || k === 'F') this.fullscreen();
        else if (k === 'm' || k === 'M') this.audio.toggleMute();
        else if (k === 'Escape' && this.mode !== 'play') this.setMode('play');
        else return;
        this.updatePanel();
      });
      document.querySelector('#boot .start').onclick = () => this.start();
    }
    fullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }

    bindPanel() {
      const G = this.game, $ = (id) => document.getElementById(id);
      $('p-fire').onclick = () => { G.handle.active = !G.handle.active; G.settings.autoPlay = false; this.updatePanel(); };
      $('p-power').oninput = (e) => { G.handle.power = +e.target.value; };
      $('p-right').onclick = () => { G.handle.power = G.handle.power > 0.62 ? G.settings.leftPower : G.settings.rightPower; this.updatePanel(); };
      $('p-auto').onclick = () => { G.settings.autoPlay = !G.settings.autoPlay; if (!G.settings.autoPlay) G.handle.active = false; this.updatePanel(); };
      $('p-autobtn').onclick = () => { G.settings.autoButton = !G.settings.autoButton; this.updatePanel(); };
      $('p-push').onclick = () => G.pressButton();
      $('p-mode').onclick = () => this.cycleMode();
      $('p-full').onclick = () => this.fullscreen();
      $('p-mute').onclick = () => { this.audio.unlock(); this.audio.toggleMute(); this.updatePanel(); };
      $('p-dev').onclick = () => this.dev.toggle();
      this.updatePanel();
    }
    updatePanel() {
      const G = this.game; if (!G) return; const $ = (id) => document.getElementById(id);
      $('p-fire').classList.toggle('on', G.handle.active);
      $('p-power').value = G.handle.power;
      $('p-right').classList.toggle('on', G.handle.power > 0.62);
      $('p-auto').classList.toggle('on', G.settings.autoPlay);
      $('p-autobtn').classList.toggle('on', G.settings.autoButton);
      $('p-mute').classList.toggle('on', this.audio.muted);
    }

    // ------------------------------------------------------------------ ループ
    loop(now) {
      let dt = (now - this.last) / 1000; this.last = now;
      if (dt > 0.25) dt = 0.25; // タブ復帰時の暴走防止
      const G = this.game;
      try {
        G.update(dt);
        // デモ画面
        const idle = G.phase === 'idle' && !G.holds1.length && !G.holds2.length && G.mode === 'normal';
        this.idleT = idle ? this.idleT + dt : 0;
        const demo = this.idleT > 40 && !G.handle.active;
        if (demo && !this.demo) { this.demo = true; this.lcd.setBG('title', 1.5); this.lcd.reels.setLayout('hidden', 0.8); }
        if (!demo && this.demo) { this.demo = false; this.lcd.setBG(G.stage, 0.6); this.lcd.reels.setLayout('main', 0.5); }
        const lcdCanvas = this.lcd.render();
        if (this.demo) { const g = this.lcd.g, t = this.lcd.t; g.save(); g.globalAlpha = 0.5 + 0.5 * Math.min(1, (this.idleT - 40) / 2); if (!this.assets.draw(g, 'logo_title', { x: 160, y: 120, w: 640, h: 220 })) { NB.bigText(g, 'ABYSS REACTOR', 480, 220, 84, 'chrome', { font: '"Orbitron", sans-serif', t }); NB.bigText(g, 'P 深淵機関', 480, 310, 44, 'cyan', { t }); } if (Math.floor(t * 1.5) % 2) NB.bigText(g, 'NAGIBAKU LAB  ·  NBL-001', 480, 420, 22, 'white', { font: '"Orbitron", sans-serif', glow: 0.4 }); g.restore(); }
        const ctx = this.ctx;
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 900, 1560);
        this.mr.draw(ctx, {
          t: now / 1000, physics: G.physics, lcd: lcdCanvas, gates: G.physics.gates,
          attackerCount: G.bh && G.bh.sub === 'open' ? G.bh.count : null,
          button: G.button, handle: G.handle, ballCount: G.balls, rightShoot: G.rightShoot, lamps: G.lamps(),
          stageGlow: G.mr.led.flash, devNails: this.nailEdit,
          drawGimmick: (g) => NB.drawGimmick(g, G.gm, this.assets, now / 1000),
        });
        if (this.showCounter && (this.frames % 6 === 0)) this.dc.draw(G, { clock: true });
      } catch (err) { console.error(err); }
      this.frames++; this.fpsT += dt; if (this.fpsT > 1) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; window.__fps = this.fps; }
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  NB.App = App;
  window.addEventListener('DOMContentLoaded', () => { const app = (window.app = new App()); app.boot(); });
})(globalThis.NB);
