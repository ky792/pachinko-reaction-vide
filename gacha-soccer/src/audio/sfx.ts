/**
 * 効果音はすべて Web Audio API でその場で合成（外部素材なし＝ライセンス問題なし）。
 */

export type SfxName =
  | 'tap'
  | 'select'
  | 'confirm'
  | 'whistle'
  | 'kick'
  | 'dribble'
  | 'net'
  | 'cheer'
  | 'bigCheer'
  | 'groan'
  | 'save'
  | 'steal'
  | 'skill'
  | 'evolve'
  | 'card'
  | 'rare'
  | 'ssr'
  | 'godBoom'
  | 'godChoir'
  | 'reroll'
  | 'judge'
  | 'fail'
  | 'hitstop'
  | 'ticket';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.7;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.master!.gain.value = this.muted ? 0 : this.volume;
    return this.ctx;
  }

  /** ユーザー操作時に呼んで AudioContext を有効化 */
  unlock(): void {
    this.ensure();
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number): void {
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
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, filter: BiquadFilterType, freq: number, at = 0, q = 1, attack = 0.01): void {
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
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName): void {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    switch (name) {
      case 'tap':
        this.tone(880, 0.05, 'square', 0.05);
        break;
      case 'select':
        this.tone(660, 0.06, 'triangle', 0.12);
        this.tone(990, 0.08, 'triangle', 0.1, 0.04);
        break;
      case 'confirm':
        this.tone(523, 0.08, 'square', 0.1);
        this.tone(784, 0.08, 'square', 0.1, 0.05);
        this.tone(1046, 0.14, 'square', 0.1, 0.1);
        break;
      case 'whistle':
        this.tone(2100, 0.25, 'sine', 0.12);
        this.tone(2150, 0.35, 'sine', 0.1, 0.28);
        break;
      case 'kick':
        this.tone(140, 0.09, 'sine', 0.35, 0, 60);
        this.noise(0.04, 0.12, 'bandpass', 1800);
        break;
      case 'dribble':
        this.tone(220, 0.05, 'sine', 0.15, 0, 120);
        this.tone(240, 0.05, 'sine', 0.12, 0.08, 130);
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
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.05, 0.1 + i * 0.09));
        break;
      case 'groan':
        this.noise(1.0, 0.15, 'lowpass', 500, 0, 0.7, 0.1);
        this.tone(220, 0.6, 'sawtooth', 0.04, 0, 140);
        break;
      case 'save':
        this.tone(180, 0.12, 'square', 0.15, 0, 90);
        this.noise(0.6, 0.12, 'bandpass', 900, 0.05, 0.6, 0.1);
        break;
      case 'steal':
        this.tone(330, 0.07, 'square', 0.1);
        this.tone(495, 0.1, 'square', 0.1, 0.06);
        break;
      case 'skill':
        this.noise(0.35, 0.15, 'highpass', 2000, 0, 0.5, 0.25);
        this.tone(440, 0.3, 'sawtooth', 0.08, 0, 1320);
        this.tone(1320, 0.25, 'triangle', 0.08, 0.28);
        break;
      case 'evolve':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, 'square', 0.08, i * 0.06));
        this.tone(1568, 0.6, 'triangle', 0.1, 0.38);
        this.noise(0.8, 0.12, 'highpass', 4000, 0.35, 0.5, 0.05);
        break;
      case 'card':
        this.tone(1200, 0.04, 'triangle', 0.06);
        break;
      case 'rare':
        this.tone(880, 0.12, 'triangle', 0.12);
        this.tone(1320, 0.2, 'triangle', 0.12, 0.08);
        break;
      case 'ssr':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, i * 0.07));
        this.noise(0.6, 0.08, 'highpass', 5000, 0.25, 0.5, 0.05);
        break;
      case 'godBoom':
        this.tone(55, 2.2, 'sine', 0.6, 0, 30);
        this.tone(110, 1.6, 'sawtooth', 0.12, 0, 40);
        this.noise(1.8, 0.3, 'lowpass', 300, 0, 0.7, 0.02);
        break;
      case 'godChoir':
        [261.6, 329.6, 392, 523.2, 659.2].forEach((f) => {
          this.tone(f, 2.8, 'sawtooth', 0.035, 0);
          this.tone(f * 1.005, 2.8, 'sine', 0.06, 0);
        });
        this.noise(2.5, 0.08, 'highpass', 6000, 0.2, 0.5, 0.5);
        break;
      case 'reroll':
        this.tone(300, 0.15, 'sawtooth', 0.06, 0, 900);
        break;
      case 'judge':
        this.tone(988, 0.08, 'sine', 0.12);
        this.tone(1480, 0.18, 'sine', 0.12, 0.07);
        break;
      case 'fail':
        this.tone(200, 0.2, 'square', 0.07, 0, 110);
        break;
      case 'hitstop':
        this.tone(70, 0.15, 'sine', 0.4, 0, 40);
        this.noise(0.08, 0.2, 'lowpass', 1200);
        break;
      case 'ticket':
        [659, 880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.1, i * 0.1));
        break;
    }
  }
}

export const sfx = new Sfx();
