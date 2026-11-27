/* ==========================================================
 * サウンド：WebAudio 内蔵シンセ（素材差し替え可）
 * ========================================================== */
(function (MK) {
  'use strict';
  let ac = null, master = null, bgmGain = null, sfxGain = null, comp = null;
  let muted = false;
  let bgm = null;
  let pendingBgm = null;

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ac.createGain(); master.gain.value = 0.8;
      bgmGain = ac.createGain(); bgmGain.gain.value = 0.32;
      sfxGain = ac.createGain(); sfxGain.gain.value = 0.9;
      bgmGain.connect(comp); sfxGain.connect(comp); comp.connect(master); master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(); s.buffer = noiseBuf; return s;
  }

  function env(g, t, a, peak, d, sus = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
  }

  function tone(type, f0, f1, dur, vol = 0.3, dest, delay = 0) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dur, vol, fType, f0, f1, delay = 0, q = 1) {
    const t = ac.currentTime + delay;
    const n = noise(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = fType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.003, vol, dur);
    n.connect(f); f.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t + dur + 0.05);
  }
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function chord(notes, dur, type = 'sawtooth', vol = 0.08, delay = 0) {
    notes.forEach((n) => {
      tone(type, NOTE(n), NOTE(n), dur, vol, sfxGain, delay);
      tone(type, NOTE(n) * 1.004, NOTE(n) * 1.004, dur, vol * 0.6, sfxGain, delay);
    });
  }

  const SFX = {
    lever() { burst(0.08, 0.6, 'lowpass', 1800, 300); tone('sine', 120, 50, 0.15, 0.5); },
    start() { tone('square', 880, 880, 0.05, 0.05); },
    stop(i) { burst(0.05, 0.5, 'bandpass', 2500 - i * 300, 800, 0, 2); tone('sine', 180, 60, 0.08, 0.4); },
    bet() { tone('square', 1200, 1200, 0.03, 0.05); tone('square', 1600, 1600, 0.03, 0.05, null, 0.04); },
    pay(n = 8) { for (let i = 0; i < Math.min(n, 15); i++) tone('square', 2093, 2093, 0.04, 0.04, null, i * 0.055); },
    replay() { tone('triangle', 1318, 1318, 0.08, 0.12); tone('triangle', 1760, 1760, 0.12, 0.12, null, 0.08); },
    navi() { tone('sine', 1046, 1046, 0.08, 0.15); tone('sine', 1568, 1568, 0.12, 0.15, null, 0.07); },
    rare(lv = 1) {
      tone('sawtooth', 300, 2400 + lv * 400, 0.5, 0.12);
      tone('square', 600, 4800, 0.5, 0.05);
      if (lv >= 3) burst(0.6, 0.3, 'highpass', 2000, 9000);
    },
    hit() { burst(0.12, 0.7, 'lowpass', 3000, 200); tone('square', 220, 60, 0.12, 0.25); },
    slash() { burst(0.18, 0.5, 'bandpass', 6000, 900, 0, 3); },
    magic() { tone('sine', 400, 1600, 0.4, 0.15); tone('triangle', 800, 3200, 0.4, 0.08, null, 0.05); },
    explode() { burst(1.0, 1, 'lowpass', 2500, 60); tone('sine', 90, 30, 0.8, 0.8); },
    levelup() { [72, 76, 79, 84].forEach((n, i) => tone('square', NOTE(n), NOTE(n), 0.1, 0.07, null, i * 0.07)); },
    coin() { tone('square', 1975, 1975, 0.05, 0.06); tone('square', 2637, 2637, 0.12, 0.06, null, 0.05); },
    alarm() { for (let i = 0; i < 4; i++) { tone('sawtooth', 880, 440, 0.22, 0.1, null, i * 0.25); } },
    build() { for (let i = 0; i < 3; i++) { burst(0.06, 0.4, 'bandpass', 900, 600, i * 0.15, 4); tone('square', 160, 90, 0.07, 0.15, null, i * 0.15); } },
    thunder() { burst(1.4, 1, 'lowpass', 6000, 80); tone('sawtooth', 60, 30, 1.2, 0.4); },
    freeze() { tone('sine', 60, 30, 2.5, 0.6); burst(2.5, 0.3, 'lowpass', 400, 80); },
    win() { chord([60, 64, 67, 72], 0.5, 'sawtooth', 0.05); chord([65, 69, 72, 77], 0.9, 'sawtooth', 0.05, 0.45); },
    lose() { [64, 63, 62, 58].forEach((n, i) => tone('triangle', NOTE(n), NOTE(n) * 0.98, 0.35, 0.12, null, i * 0.3)); },
    fanfare(kind = 'at') {
      const base = kind === 'upper' ? 2 : 0;
      const seq = [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72, 77]];
      seq.forEach((c, i) => chord(c.map((n) => n + base), i === 3 ? 1.6 : 0.28, 'sawtooth', 0.05, i * 0.22));
      tone('sine', NOTE(36 + base), NOTE(36 + base), 2.2, 0.35, null, 0.66);
      burst(1.5, 0.25, 'highpass', 3000, 12000, 0.66);
    },
    cutin() { burst(0.35, 0.5, 'bandpass', 1200, 6000, 0, 1.5); tone('sawtooth', 200, 800, 0.3, 0.08); },
  };

  // --- BGM：モード別の簡易シーケンサ ---
  const PATTERNS = {
    normal: { bpm: 96, bass: [45, 45, 48, 45, 43, 43, 41, 40], arp: [69, 72, 76, 72, 67, 71, 74, 71], wave: 'triangle' },
    cz: { bpm: 150, bass: [40, 40, 40, 43, 40, 40, 46, 45], arp: [76, 75, 76, 79, 76, 75, 82, 81], wave: 'sawtooth' },
    at: { bpm: 140, bass: [41, 41, 48, 41, 43, 43, 50, 43], arp: [77, 81, 84, 81, 79, 83, 86, 83], wave: 'square' },
    upper: { bpm: 158, bass: [38, 38, 45, 38, 41, 41, 48, 43], arp: [74, 78, 81, 86, 77, 81, 84, 89], wave: 'sawtooth' },
    judge: { bpm: 168, bass: [40, 40, 40, 40, 41, 41, 41, 43], arp: [76, 79, 76, 82, 77, 80, 77, 83], wave: 'sawtooth' },
  };
  function startBgm(name) {
    stopBgm();
    if (!ac || !PATTERNS[name]) return;
    const fileKey = 'bgm.' + name;
    const file = MK.Assets && MK.Assets.sound(fileKey);
    if (file) { file.loop = true; file.currentTime = 0; file.volume = muted ? 0 : 0.5; file.play().catch(() => {}); bgm = { file }; return; }
    const p = PATTERNS[name];
    const step = 60 / p.bpm / 2;
    let i = 0, next = ac.currentTime + 0.05;
    const timer = setInterval(() => {
      while (next < ac.currentTime + 0.2) {
        const b = p.bass[(i >> 1) % p.bass.length];
        if (i % 2 === 0) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sawtooth'; o.frequency.value = NOTE(b - 12);
          const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
          g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(0.5, next + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, next + step * 1.8);
          o.connect(f); f.connect(g); g.connect(bgmGain); o.start(next); o.stop(next + step * 2);
        }
        const a = p.arp[i % p.arp.length];
        const o2 = ac.createOscillator(), g2 = ac.createGain();
        o2.type = p.wave; o2.frequency.value = NOTE(a);
        g2.gain.setValueAtTime(0.0001, next); g2.gain.exponentialRampToValueAtTime(0.09, next + 0.005);
        g2.gain.exponentialRampToValueAtTime(0.0001, next + step * 0.9);
        o2.connect(g2); g2.connect(bgmGain); o2.start(next); o2.stop(next + step);
        if (name !== 'normal' && i % 4 === 0) {
          const n = noise(), gf = ac.createGain(), hf = ac.createBiquadFilter();
          hf.type = 'lowpass'; hf.frequency.value = 160;
          gf.gain.setValueAtTime(0.9, next); gf.gain.exponentialRampToValueAtTime(0.0001, next + 0.15);
          n.connect(hf); hf.connect(gf); gf.connect(bgmGain); n.start(next); n.stop(next + 0.2);
        }
        if (name !== 'normal' && i % 2 === 1) {
          const n = noise(), gf = ac.createGain(), hf = ac.createBiquadFilter();
          hf.type = 'highpass'; hf.frequency.value = 7000;
          gf.gain.setValueAtTime(0.12, next); gf.gain.exponentialRampToValueAtTime(0.0001, next + 0.05);
          n.connect(hf); hf.connect(gf); gf.connect(bgmGain); n.start(next); n.stop(next + 0.06);
        }
        i++; next += step;
      }
    }, 50);
    bgm = { timer, name };
  }
  function stopBgm() {
    pendingBgm = null;
    if (!bgm) return;
    if (bgm.timer) clearInterval(bgm.timer);
    if (bgm.file) bgm.file.pause();
    bgm = null;
  }

  MK.Audio = {
    unlock() { if (!ctx()) return; if (pendingBgm) { const n = pendingBgm; pendingBgm = null; startBgm(n); } },
    play(name, ...args) {
      if (muted) return;
      const file = MK.Assets && MK.Assets.sound(name);
      if (file) { try { const c = file.cloneNode(); c.play().catch(() => {}); } catch (e) {} return; }
      if (!ctx() || !SFX[name]) return;
      try { SFX[name](...args); } catch (e) { /* noop */ }
    },
    bgm(name) { if (!ac) { pendingBgm = name; return; } ctx(); if (bgm && bgm.name === name) return; startBgm(name); },
    stopBgm,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.8;
      if (bgm && bgm.file) bgm.file.volume = m ? 0 : 0.5;
    },
    get muted() { return muted; },
  };
})(window.MK);
