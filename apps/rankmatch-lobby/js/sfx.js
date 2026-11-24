/* 効果音（Web Audio API で生成。外部ファイルなし）。
 * ブラウザの制約で、ユーザーの最初の操作（タップ・キー）のあとに鳴り始める。
 * 音量・ミュートは localStorage に保存（無くても動く）。
 * SFX.play(name, ...) … correct / wrong / exWin / exLose / stamp(win) / duelStart / duelEnd(win) / armorUp / tap */
(function () {
  const KEY = 'rankmatch-lobby:sfx';
  let st = { mute: false, vol: 0.6 };
  try { st = Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  let ac = null, master = null;
  function unlock() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.connect(ac.destination); } catch (e) { return; } }
    if (ac.state === 'suspended') ac.resume();
    master.gain.value = st.mute ? 0 : st.vol;
  }
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));

  /* 音のもと：音程（周波数の変化つき）と、ノイズ（打撃・衝撃） */
  function tone(f, dur, { type = 'sine', gain = 0.3, at = 0, to = null, attack = 0.005 } = {}) {
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { gain = 0.3, at = 0, freq = 1200, q = 0.8 } = {}) {
    const t = ac.currentTime + at, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  const SOUNDS = {
    tap: () => tone(1400, 0.04, { type: 'triangle', gain: 0.08 }),
    correct: () => { tone(880, 0.09, { type: 'triangle', gain: 0.22 }); tone(1320, 0.16, { type: 'triangle', gain: 0.22, at: 0.07 }); },
    wrong: () => { tone(260, 0.18, { type: 'square', gain: 0.1, to: 170 }); },
    exWin: () => { noise(0.12, { gain: 0.35, freq: 1800 }); tone(520, 0.12, { type: 'sawtooth', gain: 0.08, to: 780 }); },
    exLose: () => { noise(0.14, { gain: 0.3, freq: 600 }); tone(300, 0.16, { type: 'sawtooth', gain: 0.07, to: 160 }); },
    // 決着スタンプ：一番気持ちいい瞬間なので、重い打撃＋和音で強く
    stamp: (win) => {
      tone(110, 0.45, { gain: 0.6, to: 45 }); noise(0.35, { gain: 0.55, freq: 220, q: 0.5 });
      const ch = win ? [523, 659, 784, 1047] : [311, 370, 466];
      ch.forEach((f, i) => tone(f, 0.55, { type: win ? 'triangle' : 'sawtooth', gain: win ? 0.14 : 0.06, at: 0.06 + i * 0.05 }));
    },
    duelStart: () => { tone(220, 0.5, { type: 'sawtooth', gain: 0.08, to: 880 }); noise(0.3, { gain: 0.15, freq: 3000, at: 0.35 }); },
    duelEnd: (win) => SOUNDS.stamp(win),
    armorUp: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.16, at: i * 0.07 })); noise(0.5, { gain: 0.12, freq: 5000, at: 0.3 }); },
  };

  function play(name, ...args) {
    if (st.mute || !SOUNDS[name]) return;
    unlock(); if (!ac || ac.state !== 'running') return;
    try { SOUNDS[name](...args); } catch (e) {}
  }
  const later = (ms, name, ...args) => setTimeout(() => play(name, ...args), ms);
  function setMute(m) { st.mute = !!m; save(); if (master) master.gain.value = st.mute ? 0 : st.vol; }
  function setVol(v) { st.vol = Math.max(0, Math.min(1, v)); save(); if (master) master.gain.value = st.mute ? 0 : st.vol; }
  window.SFX = { play, later, setMute, setVol, toggle: () => setMute(!st.mute), muted: () => st.mute, vol: () => st.vol };
})();
