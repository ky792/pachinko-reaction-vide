/*
 * P 深淵機関 ABYSS REACTOR — 音声定義
 * file: に外部音源のパスを書く（assets/audio/**）。存在すればそちらを優先再生。
 * synth: は仮素材（WebAudio 合成）。最終版では外部音源への差し替えを想定。
 *
 * ch  : 発音チャンネル（同一チャンネルは後着が前を止める）
 * pri : 優先度（高い音の再生中は低い音を鳴らさない）
 * duck: BGM を下げる量（0..1）
 */
(function () {
  const se = (id) => ['assets/audio/se/' + id + '.wav', 'assets/audio/se/' + id + '.mp3'];
  const bgmf = (id) => ['assets/audio/bgm/' + id + '.mp3', 'assets/audio/bgm/' + id + '.wav'];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---- 簡易シーケンス記法 -------------------------------------------------
  /** 'x' の位置で note を鳴らす 16 ステップ×bars のパターン */
  const hit = (str, note = 60, vel) => (s) => { const c = str[s % str.length]; return c === 'x' ? (vel ? { n: note, v: vel } : note) : c === 'o' ? { n: note, v: (vel || 1) * 0.5 } : null; };
  /** コード進行（ch: [[notes]...], stepsPer: 1コードのステップ数, at: 発音位置配列） */
  const prog = (chords, stepsPer, at = [0], len) => (s) => {
    const i = Math.floor(s / stepsPer) % chords.length, p = s % stepsPer;
    return at.includes(p) ? chords[i].map((n) => ({ n, l: len || stepsPer })) : null;
  };
  /** 音列を 1 ステップずつ（null は休符） */
  const line = (notes, every = 1, len) => (s) => (s % every ? null : (notes[(s / every) % notes.length] == null ? null : { n: notes[(s / every) % notes.length], l: len || every }));
  /** ベース：コードルートに合わせて rhythm で刻む */
  const bassline = (roots, stepsPer, rhythm) => (s) => { const r = roots[Math.floor(s / stepsPer) % roots.length]; const c = rhythm[s % rhythm.length]; return c === 'x' ? r : c === 'h' ? r + 12 : c === 'f' ? r + 7 : null; };

  // Am - F - C - G 系（深い短調）
  const Am = [57, 60, 64], F = [53, 57, 60], C = [48, 55, 64], G = [55, 59, 62], Dm = [50, 53, 57], E = [52, 56, 59], Bb = [46, 53, 58];

  const bgm = {
    normal_lab: { file: bgmf('normal_lab'), bpm: 82, bars: 8, loop: true, gain: 0.9, tracks: [
      { inst: 'pad', seq: prog([Am, F, C, G], 32, [0], 32) },
      { inst: 'bell', seq: line([69, null, 72, null, 76, null, 72, null, 69, null, 71, null, 67, null, null, null], 2), vel: 0.7 },
      { inst: 'subbass', seq: prog([[33], [29], [36], [31]], 32, [0], 30) },
      { inst: 'tick', seq: hit('x...x...x...x.x.') },
    ] },
    normal_core: { file: bgmf('normal_core'), bpm: 92, bars: 8, loop: true, gain: 0.9, tracks: [
      { inst: 'pad', seq: prog([Dm, Bb, F, [52, 57, 61]], 32, [0], 32) },
      { inst: 'bass', seq: bassline([38, 34, 41, 45], 32, 'x.....x.....x...'), vel: 0.6 },
      { inst: 'pluck', seq: line([62, 65, 69, 65, 62, 69, 74, 69], 2), vel: 0.45 },
      { inst: 'hat', seq: hit('..x...x...x...x.'), vel: 0.6 },
      { inst: 'kick', seq: hit('x.......x.......'), vel: 0.5 },
    ] },
    normal_alert: { file: bgmf('normal_alert'), bpm: 104, bars: 4, loop: true, gain: 0.9, tracks: [
      { inst: 'subbass', seq: hit('x...x...x...x...', 33) },
      { inst: 'dpad', seq: prog([[45, 52, 57], [46, 53, 58]], 32, [0], 32), vel: 0.6 },
      { inst: 'alarm', seq: (s) => (s % 32 === 0 ? { n: 76, l: 8 } : null), vel: 0.8 },
      { inst: 'kick', seq: hit('x...x...x...x...'), vel: 0.6 },
      { inst: 'hat', seq: hit('.x.x.x.x.x.x.x.x'), vel: 0.5 },
    ] },
    reach: { file: bgmf('reach'), bpm: 128, bars: 4, loop: true, gain: 1, tracks: [
      { inst: 'kick', seq: hit('x...x...x...x...') },
      { inst: 'bass', seq: bassline([45, 45, 41, 43], 16, '..x...x...x...xh') },
      { inst: 'arp', seq: line([69, 72, 76, 81, 76, 72], 1), vel: 0.9 },
      { inst: 'hat', seq: hit('..x...x...x...x.') },
      { inst: 'dpad', seq: prog([Am, Am, F, G], 16, [0], 16), vel: 0.6 },
    ] },
    sp_connect: { file: bgmf('sp_connect'), bpm: 132, bars: 8, loop: true, gain: 1, tracks: [
      { inst: 'kick', seq: hit('x...x...x...x...') },
      { inst: 'clap', seq: hit('....x.......x...'), vel: 0.8 },
      { inst: 'hat', seq: hit('..x...x...x...xx') },
      { inst: 'bass', seq: bassline([40, 40, 36, 38, 40, 40, 43, 42], 16, 'x.xhx.xhx.xhx.xh'), vel: 0.8 },
      { inst: 'arp', seq: line([64, 67, 71, 76, 71, 67, 64, 59], 1), vel: 0.8 },
      { inst: 'lead', seq: line([76, null, null, 74, null, null, 71, null, 72, null, null, 71, null, null, 67, null], 2), vel: 0.8 },
      { inst: 'dpad', seq: prog([[52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59]], 32, [0], 32), vel: 0.6 },
    ] },
    sp_control: { file: bgmf('sp_control'), bpm: 146, bars: 8, loop: true, gain: 1, tracks: [
      { inst: 'kick', seq: hit('x..x..x...x..x..') },
      { inst: 'snare', seq: hit('....x.......x..x') },
      { inst: 'hat', seq: hit('xxxxxxxxxxxxxxxx'), vel: 0.7 },
      { inst: 'bass', seq: bassline([38, 38, 34, 36, 38, 38, 41, 40], 16, 'xxhxxxhxxxhxxhxx'), vel: 0.75 },
      { inst: 'str', seq: prog([Dm, Dm, Bb, [48, 52, 55], Dm, Dm, F, [52, 56, 59]], 16, [0, 3, 6, 10, 12, 14], 2) },
      { inst: 'alarm', seq: (s) => (s % 64 === 0 ? { n: 74, l: 6 } : null), vel: 0.7 },
    ] },
    sp_awaken: { file: bgmf('sp_awaken'), bpm: 72, bars: 8, loop: true, gain: 1.05, tracks: [
      { inst: 'taiko', seq: hit('x.....x...x.....x.....x...x...x.') },
      { inst: 'choir', seq: prog([Am, F, Dm, E], 32, [0], 32) },
      { inst: 'subbass', seq: prog([[33], [29], [26], [28]], 32, [0], 30) },
      { inst: 'brass', seq: line([69, null, null, null, 72, null, 71, null, 69, null, null, null, 64, null, null, null], 4), vel: 0.8 },
      { inst: 'bell', seq: line([81, null, 79, null, 76, null, null, null], 4), vel: 0.4 },
    ] },
    rush_sp: { file: bgmf('rush_sp'), bpm: 174, bars: 4, loop: true, gain: 1, tracks: [
      { inst: 'kick', seq: hit('x...x...x...x...') },
      { inst: 'snare', seq: hit('....x.......x.xx') },
      { inst: 'hat', seq: hit('x.xxx.xxx.xxx.xx'), vel: 0.6 },
      { inst: 'bass', seq: bassline([45, 41, 43, 44], 16, 'xhxhxhxhxhxhxhxh'), vel: 0.7 },
      { inst: 'lead', seq: line([81, 79, 76, 79, 81, 84, 83, 79], 2), vel: 0.8 },
    ] },
    fanfare: { file: bgmf('fanfare'), bpm: 120, bars: 3, loop: false, gain: 1.1, tracks: [
      { inst: 'brass', seq: (s) => ({ 0: [{ n: 60, l: 3 }, { n: 64, l: 3 }, { n: 67, l: 3 }], 3: [{ n: 60, l: 1 }, { n: 64, l: 1 }, { n: 67, l: 1 }], 4: [{ n: 62, l: 3 }, { n: 65, l: 3 }, { n: 69, l: 3 }], 8: [{ n: 64, l: 8 }, { n: 67, l: 8 }, { n: 72, l: 8 }], 16: [{ n: 65, l: 4 }, { n: 69, l: 4 }, { n: 72, l: 4 }], 20: [{ n: 67, l: 4 }, { n: 71, l: 4 }, { n: 74, l: 4 }], 24: [{ n: 72, l: 24 }, { n: 76, l: 24 }, { n: 79, l: 24 }, { n: 84, l: 24 }] })[s] || null },
      { inst: 'taiko', seq: hit('x..xx...x.......x...x...x.......', 0) },
      { inst: 'subbass', seq: (s) => ({ 0: { n: 36, l: 8 }, 8: { n: 40, l: 8 }, 16: { n: 41, l: 8 }, 24: { n: 36, l: 24 } })[s] || null },
      { inst: 'riser', seq: (s) => (s === 16 ? { n: 0, l: 8 } : null) },
    ] },
    round: { file: bgmf('round'), bpm: 150, bars: 8, loop: true, gain: 0.95, tracks: [
      { inst: 'kick', seq: hit('x...x...x...x...') },
      { inst: 'snare', seq: hit('....x.......x...') },
      { inst: 'ohat', seq: hit('..x...x...x...x.'), vel: 0.8 },
      { inst: 'bass', seq: bassline([48, 43, 45, 41, 48, 43, 41, 43], 16, 'x.hxx.hxx.hxx.hx'), vel: 0.7 },
      { inst: 'brass', seq: prog([[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62], [53, 57, 60], [55, 59, 62]], 16, [0, 6, 10], 3) },
      { inst: 'lead', seq: line([72, null, 74, 76, null, 79, 76, null, 74, null, 72, 71, null, 67, null, null, 69, null, 71, 72, null, 74, 72, null, 71, null, 67, null, 71, null, 74, null], 2), vel: 0.75 },
    ] },
    rush: { file: bgmf('rush'), bpm: 164, bars: 8, loop: true, gain: 1, tracks: [
      { inst: 'kick', seq: hit('x...x...x...x...') },
      { inst: 'snare', seq: hit('....x.......x...') },
      { inst: 'hat', seq: hit('xxxxxxxxxxxxxxxx'), vel: 0.55 },
      { inst: 'bass', seq: bassline([40, 40, 36, 38, 40, 40, 43, 47], 16, 'xhxhxhxhxhxhxhxh'), vel: 0.65 },
      { inst: 'arp', seq: line([64, 71, 76, 71, 67, 71, 76, 79], 1), vel: 0.7 },
      { inst: 'lead', seq: line([76, null, 79, null, 83, null, 81, 79, 76, null, 74, null, 76, null, null, null, 72, null, 74, null, 76, null, 79, 81, 83, null, 81, null, 79, null, null, null], 2), vel: 0.8 },
      { inst: 'dpad', seq: prog([[52, 55, 59], [52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59], [52, 55, 59], [55, 59, 62], [54, 59, 63]], 16, [0], 16), vel: 0.5 },
    ] },
    rush_last: { file: bgmf('rush_last'), bpm: 164, bars: 4, loop: true, gain: 1, tracks: [
      { inst: 'kick', seq: hit('x...x...x...x...') },
      { inst: 'subbass', seq: hit('x.......x.......', 28) },
      { inst: 'alarm', seq: (s) => (s % 16 === 0 ? { n: 79, l: 6 } : null), vel: 0.6 },
      { inst: 'str', seq: prog([[52, 55, 59], [53, 56, 60]], 32, [0, 4, 8, 12, 16, 20, 24, 28], 2), vel: 0.8 },
      { inst: 'riser', seq: (s) => (s % 64 === 48 ? { n: 0, l: 16 } : null) },
    ] },
    result: { file: bgmf('result'), bpm: 90, bars: 4, loop: true, gain: 0.85, tracks: [
      { inst: 'pad', seq: prog([[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], 16, [0], 16) },
      { inst: 'bell', seq: line([72, 76, 79, 76], 4), vel: 0.6 },
      { inst: 'subbass', seq: prog([[36], [33], [29], [31]], 16, [0], 15) },
    ] },
  };

  // ---- 効果音 --------------------------------------------------------------
  const S = {};
  const def = (id, o, synth) => { S[id] = Object.assign({ file: se(id), synth }, o); };

  def('reel_start', { ch: 'reel', pri: 1, len: 0.25, gain: 0.5 }, (a, d, t) => { a.noise(d, t, { filter: 'bandpass', cutoff: 800, cutoffEnd: 3000, dur: 0.18, gain: 0.25, q: 2 }); });
  def('reel_stop', { ch: 'reelstop', pri: 2, len: 0.12, gain: 0.9 }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 180, freqEnd: 60, slide: 0.08, dur: 0.1, gain: 0.7, attack: 0.001, decay: 0.08, sustain: 0.2 });
    a.noise(d, t, { filter: 'highpass', cutoff: 3000, dur: 0.02, gain: 0.3 });
    a.tone(d, t, { type: 'square', freq: 1320, dur: 0.02, gain: 0.05, attack: 0.001, filter: 'lowpass', cutoff: 3000 });
  });
  def('reel_stop_heavy', { ch: 'reelstop', pri: 3, len: 0.3, gain: 1 }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 120, freqEnd: 36, slide: 0.2, dur: 0.25, gain: 0.9, attack: 0.001, decay: 0.2, sustain: 0.2, rev: 0.3 });
    a.noise(d, t, { filter: 'lowpass', cutoff: 1500, dur: 0.06, gain: 0.5 });
    a.tone(d, t, { type: 'triangle', freq: 2200, freqEnd: 1800, dur: 0.05, gain: 0.08, attack: 0.001, release: 0.3, rev: 0.6 });
  });
  def('tenpai', { ch: 'jingle', pri: 4, len: 1.2, duck: 0.6, bus: 'jingle' }, (a, d, t) => {
    for (const n of [57, 64, 69, 72]) a.tone(d, t, { type: 'sawtooth', note: n, dur: 0.5, gain: 0.08, attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.6, filter: 'lowpass', cutoff: 4000, cutoffEnd: 800, cutSlide: 0.8, rev: 0.7 });
    a.tone(d, t, { type: 'sine', freq: 90, freqEnd: 45, dur: 0.4, gain: 0.7, attack: 0.002, decay: 0.3, sustain: 0.1 });
    a.noise(d, t, { filter: 'bandpass', cutoff: 6000, cutoffEnd: 1200, dur: 0.6, gain: 0.15, rev: 0.5 });
  });
  def('reach_voice', { ch: 'voice', pri: 3, len: 1.0, bus: 'jingle' }, (a, d, t) => {
    a.tone(d, t, { type: 'sawtooth', freq: 220, freqEnd: 880, slide: 0.6, dur: 0.8, gain: 0.08, attack: 0.05, filter: 'bandpass', cutoff: 1200, q: 3, rev: 0.6 });
  });
  def('giji', { ch: 'jingle', pri: 4, len: 0.9, duck: 0.5, bus: 'jingle' }, (a, d, t, o) => {
    const lv = (o && o.level) || 1;
    a.tone(d, t, { type: 'square', freq: 300 + lv * 90, freqEnd: 1200 + lv * 300, slide: 0.18, dur: 0.2, gain: 0.08, filter: 'lowpass', cutoff: 3000 });
    a.noise(d, t, { filter: 'bandpass', cutoff: 2500, q: 6, dur: 0.12, gain: 0.4 });
    a.tone(d, t + 0.02, { type: 'triangle', freq: 1600, dur: 0.05, gain: 0.12, release: 0.6, rev: 0.7 });
    a.tone(d, t, { type: 'sine', freq: 160, freqEnd: 50, dur: 0.2, gain: 0.6 });
  });
  def('hold_in', { ch: 'hold', pri: 1, len: 0.15, gain: 0.5 }, (a, d, t) => { a.tone(d, t, { type: 'sine', freq: 1046, dur: 0.04, gain: 0.15, release: 0.15, rev: 0.3 }); a.tone(d, t + 0.05, { type: 'sine', freq: 1568, dur: 0.04, gain: 0.1, release: 0.2, rev: 0.3 }); });
  def('hold_change', { ch: 'holdchg', pri: 3, len: 1.0, duck: 0.3 }, (a, d, t, o) => {
    const lv = (o && o.level) || 1;
    for (let i = 0; i < 3 + lv; i++) a.tone(d, t + i * 0.06, { type: 'triangle', note: 72 + i * 4 + lv * 2, dur: 0.05, gain: 0.1, release: 0.5, rev: 0.8 });
    a.noise(d, t, { filter: 'highpass', cutoff: 5000, dur: 0.4, gain: 0.1, rev: 0.6 });
  });
  def('yokoku', { ch: 'fx', pri: 2, len: 1.2, duck: 0.4 }, (a, d, t) => {
    a.tone(d, t, { type: 'sawtooth', freq: 60, freqEnd: 30, dur: 1.0, gain: 0.25, attack: 0.05, filter: 'lowpass', cutoff: 400, rev: 0.5 });
    for (let i = 0; i < 6; i++) a.noise(d, t + i * 0.05, { filter: 'bandpass', cutoff: 1000 + i * 600, q: 8, dur: 0.02, gain: 0.25 });
  });
  def('zone_in', { ch: 'fx', pri: 3, len: 1.6, duck: 0.6 }, (a, d, t) => {
    a.tone(d, t, { type: 'square', freq: 660, freqEnd: 880, slide: 0.4, dur: 0.4, gain: 0.06, filter: 'lowpass', cutoff: 2000 });
    a.tone(d, t + 0.5, { type: 'square', freq: 660, freqEnd: 880, slide: 0.4, dur: 0.4, gain: 0.06, filter: 'lowpass', cutoff: 2000 });
    a.tone(d, t, { type: 'sine', freq: 50, dur: 1.2, gain: 0.4, attack: 0.1 });
  });
  def('whoosh', { ch: 'fx2', pri: 1, len: 0.5 }, (a, d, t) => { a.noise(d, t, { filter: 'bandpass', cutoff: 300, cutoffEnd: 5000, dur: 0.4, gain: 0.25, attack: 0.25, q: 1.5 }); });
  def('develop', { ch: 'jingle', pri: 5, len: 1.4, duck: 0.9, bus: 'jingle' }, (a, d, t) => {
    a.noise(d, t, { filter: 'bandpass', cutoff: 200, cutoffEnd: 8000, dur: 0.7, gain: 0.25, attack: 0.65, q: 2 });
    a.tone(d, t + 0.7, { type: 'sine', freq: 110, freqEnd: 35, dur: 0.6, gain: 0.9, attack: 0.001, rev: 0.4 });
    a.noise(d, t + 0.7, { filter: 'lowpass', cutoff: 2000, dur: 0.15, gain: 0.6, rev: 0.6 });
    for (const n of [45, 52, 57]) a.tone(d, t + 0.7, { type: 'sawtooth', note: n, dur: 0.6, gain: 0.07, release: 0.6, filter: 'lowpass', cutoff: 1500, rev: 0.6 });
  });
  def('chance', { ch: 'chance', pri: 4, len: 0.9, duck: 0.5, bus: 'jingle' }, (a, d, t, o) => {
    const lv = (o && o.level) || 1, base = 64 + lv * 3;
    for (const [i, n] of [base, base + 4, base + 7, base + 12].entries()) a.tone(d, t + i * 0.035, { type: 'sawtooth', note: n, dur: 0.25, gain: 0.07, release: 0.5, filter: 'lowpass', cutoff: 5000, rev: 0.7 });
    a.tone(d, t, { type: 'sine', freq: 120, freqEnd: 40, dur: 0.3, gain: 0.7 });
  });
  def('cutin', { ch: 'chance', pri: 5, len: 1.0, duck: 0.6, bus: 'jingle' }, (a, d, t) => {
    a.noise(d, t, { filter: 'bandpass', cutoff: 6000, cutoffEnd: 800, dur: 0.3, gain: 0.4, q: 1 });
    a.tone(d, t, { type: 'sine', freq: 140, freqEnd: 35, dur: 0.5, gain: 1, attack: 0.001, rev: 0.4 });
    a.tone(d, t, { type: 'sawtooth', freq: 880, freqEnd: 220, dur: 0.3, gain: 0.08, filter: 'lowpass', cutoff: 3000, rev: 0.5 });
  });
  def('button_prompt', { ch: 'button', pri: 3, len: 0.4 }, (a, d, t) => {
    a.tone(d, t, { type: 'square', freq: 1320, dur: 0.06, gain: 0.08, filter: 'lowpass', cutoff: 4000 });
    a.tone(d, t + 0.1, { type: 'square', freq: 1760, dur: 0.06, gain: 0.08, filter: 'lowpass', cutoff: 4000 });
  });
  def('button_press', { ch: 'button', pri: 6, len: 0.8, duck: 0.8 }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 160, freqEnd: 30, slide: 0.4, dur: 0.5, gain: 1, attack: 0.001, rev: 0.5 });
    a.noise(d, t, { filter: 'lowpass', cutoff: 3000, cutoffEnd: 300, dur: 0.3, gain: 0.7, rev: 0.6 });
    a.tone(d, t, { type: 'sawtooth', freq: 440, freqEnd: 110, dur: 0.2, gain: 0.1, filter: 'lowpass', cutoff: 2000 });
  });
  def('gimmick', { ch: 'gimmick', pri: 4, len: 1.2 }, (a, d, t) => {
    a.tone(d, t, { type: 'sawtooth', freq: 70, freqEnd: 140, slide: 0.8, dur: 0.9, gain: 0.18, attack: 0.05, filter: 'lowpass', cutoff: 600, q: 6 });
    for (let i = 0; i < 6; i++) a.noise(d, t + i * 0.14, { filter: 'bandpass', cutoff: 2200, q: 10, dur: 0.015, gain: 0.35 });
    a.tone(d, t + 0.9, { type: 'sine', freq: 90, freqEnd: 40, dur: 0.25, gain: 0.8, rev: 0.4 });
    a.noise(d, t + 0.9, { filter: 'lowpass', cutoff: 1200, dur: 0.1, gain: 0.6 });
  });
  def('gimmick_small', { ch: 'gimmick', pri: 2, len: 0.4 }, (a, d, t) => {
    for (let i = 0; i < 3; i++) a.noise(d, t + i * 0.08, { filter: 'bandpass', cutoff: 1800, q: 8, dur: 0.02, gain: 0.3 });
    a.tone(d, t, { type: 'sine', freq: 100, freqEnd: 60, dur: 0.15, gain: 0.5 });
  });
  def('freeze', { ch: 'sys', pri: 9, len: 0.6, cut: true }, (a, d, t) => {
    a.tone(d, t, { type: 'square', freq: 3000, freqEnd: 60, slide: 0.08, dur: 0.09, gain: 0.15, filter: 'lowpass', cutoff: 6000 });
    a.noise(d, t, { filter: 'highpass', cutoff: 2000, dur: 0.05, gain: 0.3 });
  });
  def('heartbeat', { ch: 'heart', pri: 8, len: 0.7 }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 70, freqEnd: 40, dur: 0.12, gain: 0.9 });
    a.tone(d, t + 0.22, { type: 'sine', freq: 60, freqEnd: 35, dur: 0.12, gain: 0.6 });
  });
  def('overdrive', { ch: 'jingle', pri: 10, len: 3.2, duck: 1, bus: 'jingle' }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 60, freqEnd: 25, slide: 2.5, dur: 2.8, gain: 1, attack: 0.001, decay: 1, sustain: 0.6, rev: 0.5 });
    a.noise(d, t, { filter: 'lowpass', cutoff: 5000, cutoffEnd: 200, dur: 1.5, gain: 0.8, rev: 0.9 });
    for (const n of [45, 52, 57, 60, 64, 69, 76]) a.tone(d, t + 0.05, { type: 'sawtooth', note: n, dur: 2.6, gain: 0.05, attack: 0.3, release: 1.2, filter: 'lowpass', cutoff: 800, cutoffEnd: 6000, cutSlide: 2, rev: 0.9 });
  });
  def('gekiatsu', { ch: 'jingle', pri: 7, len: 1.4, duck: 0.8, bus: 'jingle' }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 100, freqEnd: 30, dur: 0.8, gain: 1, rev: 0.6 });
    for (const n of [57, 64, 69, 73]) a.tone(d, t, { type: 'triangle', note: n, dur: 1, gain: 0.08, attack: 0.02, release: 0.8, rev: 0.9 });
    a.noise(d, t, { filter: 'bandpass', cutoff: 4000, cutoffEnd: 600, dur: 0.8, gain: 0.3, rev: 0.8 });
  });
  def('win', { ch: 'jingle', pri: 10, len: 2.0, duck: 1, bus: 'jingle' }, (a, d, t) => {
    // 確定音：上昇スイープ＋金属ベル（オリジナル）
    a.tone(d, t, { type: 'sawtooth', freq: 300, freqEnd: 2400, slide: 0.35, dur: 0.4, gain: 0.12, filter: 'bandpass', cutoff: 2000, q: 2, rev: 0.6 });
    for (const [i, n] of [84, 88, 91, 96].entries()) a.tone(d, t + 0.32 + i * 0.05, { type: 'sine', note: n, dur: 0.05, gain: 0.16, release: 1.4, rev: 0.9 });
    a.tone(d, t + 0.32, { type: 'sine', freq: 130, freqEnd: 40, dur: 0.6, gain: 1 });
    a.noise(d, t + 0.32, { filter: 'highpass', cutoff: 6000, dur: 1.2, gain: 0.12, rev: 0.9 });
  });
  def('lose', { ch: 'jingle', pri: 3, len: 0.8 }, (a, d, t) => {
    a.tone(d, t, { type: 'sawtooth', freq: 220, freqEnd: 55, slide: 0.6, dur: 0.6, gain: 0.1, filter: 'lowpass', cutoff: 900 });
    a.tone(d, t, { type: 'sine', freq: 80, freqEnd: 40, dur: 0.4, gain: 0.5 });
  });
  def('shock', { ch: 'fx3', pri: 3, len: 0.5 }, (a, d, t) => { a.tone(d, t, { type: 'sine', freq: 110, freqEnd: 35, dur: 0.35, gain: 0.9, rev: 0.3 }); a.noise(d, t, { filter: 'lowpass', cutoff: 2500, cutoffEnd: 200, dur: 0.25, gain: 0.5 }); });
  def('charge', { ch: 'fx2', pri: 2, len: 1.6 }, (a, d, t) => { a.tone(d, t, { type: 'sawtooth', freq: 80, freqEnd: 1200, slide: 1.4, dur: 1.5, gain: 0.08, attack: 0.1, filter: 'lowpass', cutoff: 3000, rev: 0.4 }); a.noise(d, t, { filter: 'bandpass', cutoff: 300, cutoffEnd: 6000, dur: 1.5, gain: 0.12, attack: 1.3, q: 3 }); });
  def('round_start', { ch: 'sys', pri: 4, len: 0.6 }, (a, d, t) => { for (const [i, n] of [72, 76, 79].entries()) a.tone(d, t + i * 0.07, { type: 'square', note: n, dur: 0.08, gain: 0.06, release: 0.2, filter: 'lowpass', cutoff: 3500, rev: 0.4 }); });
  def('attacker_in', { ch: 'pay', pri: 1, len: 0.08, gain: 0.5, cut: false }, (a, d, t) => { a.tone(d, t, { type: 'sine', freq: 1975, dur: 0.02, gain: 0.08, release: 0.12, rev: 0.2 }); });
  def('heso_in', { ch: 'heso', pri: 1, len: 0.08, gain: 0.5 }, (a, d, t) => { a.tone(d, t, { type: 'triangle', freq: 1318, dur: 0.02, gain: 0.08, release: 0.1 }); });
  def('denchu', { ch: 'denchu', pri: 1, len: 0.1, gain: 0.5 }, (a, d, t) => { a.noise(d, t, { filter: 'bandpass', cutoff: 2600, q: 8, dur: 0.02, gain: 0.3 }); });
  def('rush_in', { ch: 'jingle', pri: 10, len: 3.0, duck: 1, bus: 'jingle' }, (a, d, t) => {
    a.tone(d, t, { type: 'sine', freq: 90, freqEnd: 28, dur: 1.4, gain: 1, rev: 0.6 });
    a.noise(d, t, { filter: 'lowpass', cutoff: 8000, cutoffEnd: 300, dur: 1.2, gain: 0.7, rev: 0.9 });
    for (const n of [52, 59, 64, 67, 71, 76]) a.tone(d, t + 0.1, { type: 'sawtooth', note: n, dur: 2.2, gain: 0.05, attack: 0.05, release: 1, filter: 'lowpass', cutoff: 1000, cutoffEnd: 5000, cutSlide: 1, rev: 0.9 });
  });
  def('st_reset', { ch: 'jingle', pri: 6, len: 1.4, bus: 'jingle' }, (a, d, t) => {
    for (const [i, n] of [64, 67, 71, 76, 79, 83].entries()) a.tone(d, t + i * 0.06, { type: 'square', note: n, dur: 0.06, gain: 0.06, release: 0.4, filter: 'lowpass', cutoff: 4000, rev: 0.6 });
    a.tone(d, t + 0.4, { type: 'sine', freq: 120, freqEnd: 40, dur: 0.3, gain: 0.7 });
  });
  def('rush_end', { ch: 'jingle', pri: 6, len: 2.4, bus: 'jingle' }, (a, d, t) => {
    for (const [i, n] of [76, 72, 69, 64, 60].entries()) a.tone(d, t + i * 0.22, { type: 'triangle', note: n, dur: 0.2, gain: 0.1, release: 0.6, rev: 0.8 });
    a.tone(d, t, { type: 'sawtooth', freq: 400, freqEnd: 60, slide: 1.8, dur: 1.8, gain: 0.05, filter: 'lowpass', cutoff: 1200, rev: 0.6 });
  });
  def('blackout', { ch: 'sys', pri: 9, len: 0.8 }, (a, d, t) => { a.tone(d, t, { type: 'sine', freq: 80, freqEnd: 20, slide: 0.6, dur: 0.7, gain: 0.9 }); });
  def('payout', { ch: 'pay2', pri: 0, len: 0.05, gain: 0.25, cut: false }, (a, d, t) => { a.noise(d, t, { filter: 'bandpass', cutoff: 4500, q: 4, dur: 0.01, gain: 0.15 }); });
  def('count', { ch: 'count', pri: 1, len: 0.04, gain: 0.4 }, (a, d, t) => { a.tone(d, t, { type: 'square', freq: 2093, dur: 0.012, gain: 0.04, release: 0.02 }); });
  def('lever', { ch: 'fx3', pri: 3, len: 0.3 }, (a, d, t) => { a.noise(d, t, { filter: 'bandpass', cutoff: 1200, q: 4, dur: 0.06, gain: 0.5 }); a.tone(d, t, { type: 'sine', freq: 200, freqEnd: 80, dur: 0.1, gain: 0.5 }); });

  NB.registerMachine('abyss-reactor', 'sound', { se: S, bgm });
})();
