/**
 * 音はすべて Web Audio API でその場で合成（外部素材なし）。
 * master ─┬─ sfx（効果音）
 *         ├─ amb（観客のざわめき）
 *         └─ bgm（BGMループ）
 * 設定の音量スライダー・ミュートは master に掛かるので、効果音とBGMの両方に連動する。
 * 自動再生制限のため、最初のユーザー操作（unlock）までは一切鳴らさない。
 */

export type SfxName =
  | 'tap'
  | 'select'
  | 'confirm'
  | 'whistle'
  | 'whistleEnd'
  | 'kick'
  | 'pass'
  | 'dribble'
  | 'net'
  | 'cheer'
  | 'bigCheer'
  | 'goalFanfare'
  | 'groan'
  | 'save'
  | 'steal'
  | 'skill'
  | 'evolve'
  | 'draw'
  | 'card'
  | 'rare'
  | 'ssr'
  | 'godBoom'
  | 'godChoir'
  | 'reroll'
  | 'judge'
  | 'success'
  | 'fail'
  | 'hitstop'
  | 'ticket';

export type BgmName = 'title' | 'match' | null;

/** 大きな演出音は同時発音制限を無視して必ず鳴らす */
const PRIORITY: SfxName[] = ['goalFanfare', 'ssr', 'godBoom', 'godChoir', 'whistle', 'whistleEnd', 'net'];

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Track {
  tempo: number;
  bars: number;
  /** 1小節ごとのコード（MIDIノート） */
  chords: number[][];
  step: (bar: number, s: number, t: number, chord: number[], out: GainNode) => void;
}

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private unlocked = false;
  private voices: number[] = [];
  private last = new Map<string, number>();
  volume = 0.7;
  muted = false;

  // 観客
  private crowdNodes: AudioNode[] = [];
  private crowdGain: GainNode | null = null;
  private crowdWanted = false;

  // BGM
  private bgmWanted: BgmName = null;
  private bgmCurrent: BgmName = null;
  private trackGain: GainNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private stepIdx = 0;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined' || !this.unlocked) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      // 音割れ防止のコンプレッサ
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.bgmBus = this.ctx.createGain();
      this.ambBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0.32;
      this.ambBus.gain.value = 1;
      this.sfxBus.connect(this.master);
      this.bgmBus.connect(this.master);
      this.ambBus.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.master!.gain.value = this.muted ? 0 : this.volume;
    return this.ctx;
  }

  /** 最初のユーザー操作で呼ぶ。保留していたBGM・環境音もここで始まる */
  unlock(): void {
    if (this.unlocked) {
      this.ensure();
      return;
    }
    this.unlocked = true;
    this.ensure();
    if (this.bgmWanted) this.startBgm(this.bgmWanted);
    if (this.crowdWanted) this.startCrowd();
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.03);
  }

  // ===== 低レベル =====

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number, out?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out ?? this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 金管っぽい音（ファンファーレ用） */
  private brass(freq: number, at: number, dur: number, gain: number, out?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'sawtooth';
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.004;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(freq * 5, t + 0.06);
    f.frequency.linearRampToValueAtTime(freq * 3, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(out ?? this.sfxBus!);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, filter: BiquadFilterType, freq: number, at = 0, q = 1, attack = 0.01, out?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out ?? this.sfxBus!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** BGMのダッキング（ファンファーレ中は下げる） */
  private duck(sec: number): void {
    if (!this.bgmBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.bgmBus.gain.cancelScheduledValues(t);
    this.bgmBus.gain.setTargetAtTime(0.08, t, 0.05);
    this.bgmBus.gain.setTargetAtTime(0.32, t + sec, 0.4);
  }

  // ===== 効果音 =====

  play(name: SfxName): void {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    // 同じ音の連打と同時発音数を制限（処理を軽く）
    const lastT = this.last.get(name) ?? -1;
    if (now - lastT < 0.05) return;
    this.voices = this.voices.filter((e) => e > now);
    if (this.voices.length >= 8 && !PRIORITY.includes(name)) return;
    this.last.set(name, now);
    this.voices.push(now + 0.6);
    switch (name) {
      case 'tap':
        this.tone(900, 0.045, 'square', 0.045);
        this.tone(1350, 0.04, 'sine', 0.04, 0.02);
        break;
      case 'select':
        this.tone(660, 0.06, 'triangle', 0.12);
        this.tone(990, 0.08, 'triangle', 0.1, 0.04);
        break;
      case 'confirm':
        this.tone(523, 0.08, 'square', 0.08);
        this.tone(784, 0.08, 'square', 0.08, 0.05);
        this.tone(1046, 0.14, 'square', 0.08, 0.1);
        break;
      case 'whistle':
        this.tone(2100, 0.25, 'sine', 0.12);
        this.tone(2150, 0.4, 'sine', 0.1, 0.28);
        break;
      case 'whistleEnd':
        this.tone(2100, 0.18, 'sine', 0.12);
        this.tone(2100, 0.18, 'sine', 0.12, 0.26);
        this.tone(2140, 0.7, 'sine', 0.12, 0.52);
        break;
      case 'kick':
        this.tone(150, 0.1, 'sine', 0.4, 0, 55);
        this.noise(0.05, 0.16, 'bandpass', 1800);
        break;
      case 'pass':
        this.tone(220, 0.07, 'sine', 0.22, 0, 110);
        this.noise(0.03, 0.08, 'bandpass', 2500);
        break;
      case 'dribble':
        this.tone(200, 0.05, 'sine', 0.13, 0, 110);
        this.tone(230, 0.05, 'sine', 0.11, 0.09, 120);
        break;
      case 'net':
        this.noise(0.5, 0.35, 'highpass', 3000, 0, 0.7);
        this.tone(90, 0.25, 'sine', 0.3, 0, 50);
        break;
      case 'cheer':
        this.noise(1.6, 0.22, 'bandpass', 1100, 0.05, 0.6, 0.15);
        this.noise(1.4, 0.12, 'bandpass', 2400, 0.1, 0.8, 0.2);
        break;
      case 'bigCheer':
        this.noise(2.6, 0.3, 'bandpass', 1000, 0.05, 0.5, 0.1);
        this.noise(2.4, 0.18, 'bandpass', 2600, 0.1, 0.7, 0.2);
        break;
      case 'goalFanfare': {
        this.duck(2.6);
        const seq: [number, number, number][] = [
          [72, 0, 0.14],
          [72, 0.15, 0.14],
          [72, 0.3, 0.14],
          [77, 0.45, 0.5],
          [76, 1.0, 0.18],
          [77, 1.2, 0.18],
          [81, 1.4, 0.8],
        ];
        for (const [n, at, d] of seq) this.brass(NOTE(n), at, d, 0.09);
        for (const n of [65, 69, 72]) this.brass(NOTE(n), 1.4, 0.8, 0.05);
        break;
      }
      case 'groan':
        this.noise(1.2, 0.16, 'lowpass', 500, 0, 0.7, 0.1);
        this.tone(240, 0.8, 'sawtooth', 0.035, 0, 130);
        this.tone(196, 0.9, 'triangle', 0.05, 0.15, 110);
        break;
      case 'save':
        this.tone(180, 0.12, 'square', 0.12, 0, 90);
        this.noise(0.7, 0.13, 'bandpass', 900, 0.05, 0.6, 0.1);
        break;
      case 'steal':
        this.tone(330, 0.07, 'square', 0.08);
        this.tone(495, 0.1, 'square', 0.08, 0.06);
        break;
      case 'success':
        this.tone(784, 0.1, 'triangle', 0.14);
        this.tone(1175, 0.22, 'triangle', 0.13, 0.08);
        this.tone(1568, 0.25, 'sine', 0.06, 0.12);
        break;
      case 'fail':
        this.tone(330, 0.16, 'square', 0.06, 0, 220);
        this.tone(220, 0.28, 'square', 0.06, 0.13, 150);
        break;
      case 'skill':
        this.noise(0.35, 0.14, 'highpass', 2000, 0, 0.5, 0.25);
        this.tone(440, 0.3, 'sawtooth', 0.06, 0, 1320);
        this.tone(1320, 0.25, 'triangle', 0.07, 0.28);
        break;
      case 'evolve':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, 'square', 0.06, i * 0.06));
        this.tone(1568, 0.6, 'triangle', 0.1, 0.38);
        this.noise(0.8, 0.12, 'highpass', 4000, 0.35, 0.5, 0.05);
        break;
      case 'draw':
        // ガチャを引く：上昇するうなり＋コイン
        this.noise(0.6, 0.12, 'bandpass', 800, 0, 2, 0.4);
        this.tone(200, 0.55, 'sawtooth', 0.05, 0, 900);
        this.tone(1568, 0.08, 'square', 0.06, 0.55);
        this.tone(2093, 0.25, 'triangle', 0.08, 0.62);
        break;
      case 'card':
        // カードめくり：短いシュッ＋カチッ
        this.noise(0.09, 0.12, 'highpass', 3500, 0, 0.8, 0.02);
        this.tone(1400, 0.035, 'triangle', 0.06, 0.06);
        break;
      case 'rare':
        this.duck(1.2);
        [72, 76, 79].forEach((n, i) => this.brass(NOTE(n), i * 0.09, 0.22, 0.07));
        this.brass(NOTE(84), 0.3, 0.5, 0.08);
        break;
      case 'ssr':
        this.duck(2.4);
        [67, 72, 76, 79].forEach((n, i) => this.brass(NOTE(n), i * 0.1, 0.18, 0.08));
        for (const n of [72, 76, 79, 84]) this.brass(NOTE(n), 0.45, 1.2, 0.05);
        this.noise(1.2, 0.08, 'highpass', 6000, 0.45, 0.5, 0.05);
        [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.04, 0.5 + i * 0.12));
        break;
      case 'godBoom':
        this.duck(4);
        this.tone(55, 2.2, 'sine', 0.6, 0, 30);
        this.tone(110, 1.6, 'sawtooth', 0.1, 0, 40);
        this.noise(1.8, 0.3, 'lowpass', 300, 0, 0.7, 0.02);
        break;
      case 'godChoir':
        [261.6, 329.6, 392, 523.2, 659.2].forEach((f) => {
          this.tone(f, 2.8, 'sawtooth', 0.03, 0);
          this.tone(f * 1.005, 2.8, 'sine', 0.05, 0);
        });
        this.noise(2.5, 0.08, 'highpass', 6000, 0.2, 0.5, 0.5);
        break;
      case 'reroll':
        this.tone(300, 0.15, 'sawtooth', 0.05, 0, 900);
        break;
      case 'judge':
        this.tone(988, 0.08, 'sine', 0.12);
        this.tone(1480, 0.18, 'sine', 0.12, 0.07);
        break;
      case 'hitstop':
        this.tone(70, 0.15, 'sine', 0.4, 0, 40);
        this.noise(0.08, 0.2, 'lowpass', 1200);
        break;
      case 'ticket':
        [659, 880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.09, i * 0.1));
        break;
    }
  }

  // ===== 観客のざわめき =====

  /** 試合中だけ流す（小さめ） */
  crowd(on: boolean): void {
    this.crowdWanted = on;
    if (!this.unlocked) return;
    if (on) this.startCrowd();
    else this.stopCrowd();
  }

  private startCrowd(): void {
    const ctx = this.ensure();
    if (!ctx || this.crowdGain) return;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.8);
    g.connect(this.ambBus!);
    const mk = (freq: number, q: number, lfoRate: number, depth: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const vg = ctx.createGain();
      vg.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const lg = ctx.createGain();
      lg.gain.value = depth;
      lfo.connect(lg).connect(vg.gain);
      src.connect(f).connect(vg).connect(g);
      src.start();
      lfo.start();
      this.crowdNodes.push(src, lfo);
    };
    mk(700, 0.6, 0.13, 0.25);
    mk(1700, 0.9, 0.21, 0.3);
    this.crowdGain = g;
  }

  private stopCrowd(): void {
    if (!this.ctx || !this.crowdGain) return;
    const g = this.crowdGain;
    const nodes = this.crowdNodes;
    g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          (n as AudioScheduledSourceNode).stop();
        } catch {
          /* noop */
        }
      }
      g.disconnect();
    }, 1500);
    this.crowdNodes = [];
    this.crowdGain = null;
  }

  /** チャンス・ピンチで観客を盛り上げる（0=平常, 1=最高潮） */
  crowdLevel(level: number): void {
    if (!this.ctx || !this.crowdGain) return;
    const v = 0.05 + Math.max(0, Math.min(1, level)) * 0.22;
    this.crowdGain.gain.setTargetAtTime(v, this.ctx.currentTime, level > 0.5 ? 0.25 : 0.8);
  }

  // ===== BGM =====

  bgm(name: BgmName): void {
    this.bgmWanted = name;
    if (!this.unlocked) return;
    if (name === this.bgmCurrent) return;
    this.startBgm(name);
  }

  private startBgm(name: BgmName): void {
    const ctx = this.ensure();
    if (!ctx) return;
    // 現在の曲をフェードアウト
    if (this.trackGain) {
      const old = this.trackGain;
      old.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
      window.setTimeout(() => old.disconnect(), 1500);
      this.trackGain = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.bgmCurrent = name;
    if (!name) return;
    const track = TRACKS[name];
    const tg = ctx.createGain();
    tg.gain.value = 0.0001;
    tg.gain.setTargetAtTime(1, ctx.currentTime + 0.1, 0.4);
    tg.connect(this.bgmBus!);
    this.trackGain = tg;
    this.nextTime = ctx.currentTime + 0.12;
    this.stepIdx = 0;
    const stepDur = 60 / track.tempo / 4;
    const total = track.bars * 16;
    this.timer = window.setInterval(() => {
      if (!this.ctx || this.trackGain !== tg) return;
      while (this.nextTime < this.ctx.currentTime + 0.35) {
        const i = this.stepIdx % total;
        const bar = Math.floor(i / 16);
        const s = i % 16;
        const t = this.nextTime - this.ctx.currentTime;
        if (t >= 0) track.step(bar, s, t, track.chords[bar % track.chords.length], tg);
        this.nextTime += stepDur;
        this.stepIdx++;
      }
    }, 90);
  }

  /** BGM用の音（ミュート中も呼ばれるが master が0なので無音） */
  note(freq: number, at: number, dur: number, type: OscillatorType, gain: number, out: GainNode): void {
    if (!this.ctx) return;
    this.tone(freq, dur, type, gain, at, undefined, out);
  }

  hat(at: number, gain: number, out: GainNode): void {
    if (!this.ctx) return;
    this.noise(0.04, gain, 'highpass', 7000, at, 0.7, 0.003, out);
  }

  thump(at: number, gain: number, out: GainNode): void {
    if (!this.ctx) return;
    this.tone(120, 0.12, 'sine', gain, at, 45, out);
  }
}

export const sfx = new Sound();

// ===== BGMの譜面（短いフレーズの繰り返し） =====
const TRACKS: Record<'title' | 'match', Track> = {
  // タイトル：明るい C - Am - F - G のアルペジオ
  title: {
    tempo: 104,
    bars: 4,
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ],
    step: (bar, s, t, chord, out) => {
      if (s === 0) for (const n of chord) sfx.note(NOTE(n), t, 1.9, 'triangle', 0.035, out);
      if (s % 4 === 0) sfx.note(NOTE(chord[0] - 12), t, 0.4, 'sine', 0.09, out);
      if (s % 2 === 0) {
        const arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
        sfx.note(NOTE(arp[(s / 2) % 4]), t, 0.18, 'square', 0.022, out);
      }
      // 2小節ごとの短いメロディ
      const mel: Record<number, number> = bar % 2 === 1 ? { 8: 79, 10: 81, 12: 79, 14: 76 } : {};
      if (mel[s]) sfx.note(NOTE(mel[s]), t, 0.25, 'triangle', 0.05, out);
    },
  },
  // 試合：Am - F - C - G のドライブ感（ベース＋ハイハット＋キック）
  match: {
    tempo: 126,
    bars: 4,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    step: (_bar, s, t, chord, out) => {
      if (s % 4 === 0) sfx.thump(t, 0.12, out);
      if (s % 4 === 2) sfx.hat(t, 0.04, out);
      if (s % 2 === 0) sfx.note(NOTE(chord[0] - 12), t, 0.14, 'sawtooth', 0.03, out);
      if (s === 0 || s === 8) for (const n of chord) sfx.note(NOTE(n + 12), t, 0.5, 'triangle', 0.018, out);
      if (s === 6 || s === 14) sfx.note(NOTE(chord[2] + 12), t, 0.12, 'square', 0.018, out);
    },
  },
};
