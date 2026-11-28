/*
 * 音声管理
 *  - バス構成：master ← [bgm, se, jingle, voice] / reverb send
 *  - 外部音源（assets/audio/**）があれば優先再生、無ければ合成音（仮素材）にフォールバック
 *  - SE はチャンネル＋優先度管理。ジングル再生時は BGM をダッキング
 *  - silence() で演出用の完全無音を作る
 */
(function (NB) {
  'use strict';
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  class AudioManager {
    constructor(bank) {
      this.bank = bank;            // 機種の音声定義（machines/<id>/sound.js）
      this.ctx = null;
      this.buffers = new Map();    // 外部音源
      this.volumes = { master: 0.8, bgm: 0.55, se: 0.8, jingle: 0.85 };
      this.channels = {};          // ch -> {pri, stop, until}
      this.bgm = null;
      this.muted = false;
      this.speed = 1;
      this.fileStatus = {};
    }

    /** ユーザー操作後に呼ぶ（自動再生制限） */
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -10; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
      this.master.connect(this.comp).connect(ctx.destination);
      this.bus = {};
      for (const k of ['bgm', 'se', 'jingle']) { const g = ctx.createGain(); g.connect(this.master); this.bus[k] = g; }
      this.duckGain = ctx.createGain(); this.duckGain.connect(this.bus.bgm);
      this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(2.4, 2.8);
      this.revSend = ctx.createGain(); this.revSend.gain.value = 0.28;
      this.revSend.connect(this.reverb).connect(this.master);
      this.noiseBuf = this.makeNoise();
      this.applyVolumes();
      this.loadFiles();
      this.schedTimer = setInterval(() => this.tickBGM(), 25);
    }

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.02);
      for (const k in this.bus) this.bus[k].gain.setTargetAtTime(this.volumes[k], t, 0.02);
    }
    setVolume(k, v) { this.volumes[k] = v; this.applyVolumes(); }
    toggleMute() { this.muted = !this.muted; this.applyVolumes(); return this.muted; }

    impulse(sec, decay) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    }
    makeNoise() {
      const ctx = this.ctx, len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }

    /** 外部音源読み込み（http(s) 配信時のみ。file:// では合成音を使用） */
    async loadFiles() {
      if (location.protocol === 'file:') return;
      const all = Object.assign({}, this.bank.se, this.bank.bgm);
      await Promise.all(Object.keys(all).map(async (id) => {
        const def = all[id]; if (!def.file) return;
        for (const src of [].concat(def.file)) {
          try {
            const r = await fetch(src); if (!r.ok) continue;
            const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
            this.buffers.set(id, buf); this.fileStatus[id] = src; return;
          } catch (e) { /* 次の候補へ */ }
        }
        this.fileStatus[id] = null;
      }));
    }

    // ------------------------------------------------------------ synth primitives
    env(g, t, a, peak, d, sus, r, len) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setTargetAtTime(peak * sus, t + a, d / 3);
      g.gain.setTargetAtTime(0.0001, t + Math.max(a, len), r / 4);
    }
    /** 汎用トーン */
    tone(dest, t, o) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
      const f0 = o.freq || midiHz(o.note || 60);
      osc.frequency.setValueAtTime(f0, t);
      if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + (o.slide || o.dur || 0.2));
      if (o.detune) osc.detune.value = o.detune;
      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.setValueAtTime(o.cutoff || 2000, t); f.Q.value = o.q || 0.7;
        if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffEnd), t + (o.cutSlide || o.dur || 0.2));
        node.connect(f); node = f;
      }
      const g = ctx.createGain();
      this.env(g, t, o.attack ?? 0.005, o.gain ?? 0.3, o.decay ?? 0.1, o.sustain ?? 0.6, o.release ?? 0.1, o.dur ?? 0.2);
      node.connect(g); g.connect(dest);
      if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.revSend); }
      osc.start(t); osc.stop(t + (o.dur ?? 0.2) + (o.release ?? 0.1) + 0.1);
      return osc;
    }
    noise(dest, t, o) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.frequency.setValueAtTime(o.cutoff || 3000, t); f.Q.value = o.q || 1;
      if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffEnd), t + (o.dur || 0.2));
      const g = ctx.createGain();
      this.env(g, t, o.attack ?? 0.002, o.gain ?? 0.3, o.decay ?? 0.05, o.sustain ?? 0.3, o.release ?? 0.08, o.dur ?? 0.1);
      src.connect(f).connect(g).connect(dest);
      if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.revSend); }
      src.start(t, Math.random()); src.stop(t + (o.dur ?? 0.1) + (o.release ?? 0.08) + 0.1);
    }

    /** 楽器（BGM 用） */
    inst(name, dest, t, note, len, vel = 1) {
      const T = (o) => this.tone(dest, t, o), Nn = (o) => this.noise(dest, t, o);
      switch (name) {
        case 'kick': T({ type: 'sine', freq: 150, freqEnd: 42, slide: 0.12, dur: 0.18, gain: 0.9 * vel, attack: 0.001, decay: 0.12, sustain: 0.3, release: 0.1 }); T({ type: 'triangle', freq: 900, freqEnd: 120, slide: 0.02, dur: 0.02, gain: 0.25 * vel, attack: 0.0005 }); break;
        case 'taiko': T({ type: 'sine', freq: 95, freqEnd: 50, slide: 0.3, dur: 0.4, gain: 0.9 * vel, attack: 0.002, decay: 0.3, sustain: 0.2, release: 0.3, rev: 0.6 }); Nn({ filter: 'lowpass', cutoff: 600, dur: 0.08, gain: 0.4 * vel }); break;
        case 'snare': Nn({ filter: 'highpass', cutoff: 1500, dur: 0.12, gain: 0.35 * vel, rev: 0.25 }); T({ type: 'triangle', freq: 220, freqEnd: 160, dur: 0.06, gain: 0.25 * vel }); break;
        case 'clap': for (let i = 0; i < 3; i++) this.noise(dest, t + i * 0.012, { filter: 'bandpass', cutoff: 1400, q: 1.5, dur: 0.03, gain: 0.3 * vel, rev: 0.3 }); break;
        case 'hat': Nn({ filter: 'highpass', cutoff: 8000, dur: 0.03, gain: 0.12 * vel, release: 0.03 }); break;
        case 'ohat': Nn({ filter: 'highpass', cutoff: 7000, dur: 0.18, gain: 0.1 * vel, release: 0.1 }); break;
        case 'tick': T({ type: 'square', freq: 2400, dur: 0.01, gain: 0.04 * vel, attack: 0.0005, release: 0.02, filter: 'highpass', cutoff: 1800 }); break;
        case 'bass': T({ type: 'sawtooth', note, dur: len * 0.9, gain: 0.32 * vel, attack: 0.004, decay: 0.12, sustain: 0.5, release: 0.05, filter: 'lowpass', cutoff: 900, cutoffEnd: 220, cutSlide: 0.15, q: 4 }); T({ type: 'sine', note: note - 12, dur: len * 0.9, gain: 0.3 * vel, attack: 0.004, release: 0.05 }); break;
        case 'subbass': T({ type: 'sine', note, dur: len, gain: 0.45 * vel, attack: 0.02, sustain: 0.9, release: 0.2 }); break;
        case 'pad': for (const d of [-8, 7]) T({ type: 'sawtooth', note, detune: d, dur: len, gain: 0.07 * vel, attack: Math.min(0.8, len * 0.4), decay: 0.5, sustain: 0.8, release: 0.9, filter: 'lowpass', cutoff: 1100, q: 0.5, rev: 0.7 }); break;
        case 'dpad': for (const d of [-12, 0, 11]) T({ type: 'sawtooth', note, detune: d, dur: len, gain: 0.05 * vel, attack: 0.05, sustain: 0.85, release: 0.4, filter: 'lowpass', cutoff: 2200, q: 0.8, rev: 0.4 }); break;
        case 'bell': T({ type: 'sine', note: note + 12, dur: 0.05, gain: 0.12 * vel, attack: 0.001, decay: 0.8, sustain: 0.01, release: 1.2, rev: 0.8 }); T({ type: 'sine', note: note + 31, dur: 0.02, gain: 0.03 * vel, attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4 }); break;
        case 'arp': T({ type: 'square', note, dur: len * 0.5, gain: 0.07 * vel, attack: 0.002, decay: 0.08, sustain: 0.3, release: 0.08, filter: 'lowpass', cutoff: 2600, rev: 0.35 }); break;
        case 'pluck': T({ type: 'sawtooth', note, dur: 0.05, gain: 0.12 * vel, attack: 0.002, decay: 0.15, sustain: 0.1, release: 0.15, filter: 'lowpass', cutoff: 3200, cutoffEnd: 500, cutSlide: 0.2, rev: 0.4 }); break;
        case 'lead': for (const d of [-6, 6]) T({ type: 'sawtooth', note, detune: d, dur: len * 0.95, gain: 0.07 * vel, attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.12, filter: 'lowpass', cutoff: 3600, q: 1, rev: 0.35 }); break;
        case 'brass': for (const d of [-7, 0, 7]) T({ type: 'sawtooth', note, detune: d, dur: len * 0.92, gain: 0.06 * vel, attack: 0.04, decay: 0.3, sustain: 0.75, release: 0.15, filter: 'lowpass', cutoff: 600, cutoffEnd: 3200, cutSlide: 0.08, q: 1.2, rev: 0.45 }); break;
        case 'str': for (const d of [-10, 10]) T({ type: 'sawtooth', note, detune: d, dur: len * 0.6, gain: 0.06 * vel, attack: 0.003, decay: 0.1, sustain: 0.4, release: 0.06, filter: 'lowpass', cutoff: 2800, rev: 0.3 }); break;
        case 'choir': for (const d of [-9, 0, 9]) T({ type: 'triangle', note, detune: d, dur: len, gain: 0.08 * vel, attack: 0.25, sustain: 0.9, release: 0.8, filter: 'bandpass', cutoff: 900, q: 1.2, rev: 0.9 }); break;
        case 'alarm': T({ type: 'square', note, freqEnd: midiHz(note + 5), slide: len, dur: len, gain: 0.05 * vel, attack: 0.01, release: 0.05, filter: 'lowpass', cutoff: 1800 }); break;
        case 'riser': Nn({ filter: 'bandpass', cutoff: 400, cutoffEnd: 9000, dur: len, gain: 0.12 * vel, attack: len * 0.9, sustain: 1, release: 0.05, q: 2 }); break;
        default: break;
      }
    }

    // ------------------------------------------------------------ SE
    play(id, opts = {}) {
      if (!this.ctx) return;
      const def = this.bank.se[id];
      if (!def) { console.warn('[audio] unknown se', id); return; }
      const now = this.ctx.currentTime;
      const ch = def.ch || 'fx', pri = def.pri || 1;
      const cur = this.channels[ch];
      if (cur && cur.until > now && cur.pri > pri && !opts.force) return; // 優先度の低い音は鳴らさない
      if (cur && cur.until > now && cur.stop && def.cut !== false) cur.stop();
      const bus = def.bus === 'jingle' ? this.bus.jingle : this.bus.se;
      const out = this.ctx.createGain(); out.gain.value = (def.gain ?? 1) * (opts.gain ?? 1); out.connect(bus);
      const len = def.len || 0.5;
      let srcNode = null;
      if (this.buffers.has(id)) {
        srcNode = this.ctx.createBufferSource(); srcNode.buffer = this.buffers.get(id); srcNode.connect(out); srcNode.start(now);
      } else if (def.synth) {
        def.synth(this, out, now + 0.005, opts);
      }
      this.channels[ch] = {
        pri, until: now + len,
        stop: () => { out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); if (srcNode) try { srcNode.stop(this.ctx.currentTime + 0.1); } catch (e) {} },
      };
      if (def.duck) this.duck(def.duck, len);
    }
    stopChannel(ch) { const c = this.channels[ch]; if (c && c.stop) c.stop(); delete this.channels[ch]; }

    duck(amount, sec) {
      if (!this.ctx) return;
      const g = this.duckGain.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setTargetAtTime(1 - amount, t, 0.04); g.setTargetAtTime(1, t + sec, 0.4);
    }

    /** 演出用の完全無音（指定秒） */
    silence(sec, fade = 0.03) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (const k in this.bus) { const g = this.bus[k].gain; g.cancelScheduledValues(t); g.setTargetAtTime(0, t, fade); if (sec > 0) g.setTargetAtTime(this.volumes[k], t + sec, 0.01); }
      for (const ch in this.channels) this.stopChannel(ch);
    }
    unsilence() { this.applyVolumes(); }

    // ------------------------------------------------------------ BGM sequencer
    playBGM(id, opts = {}) {
      if (!this.ctx) { this.pendingBGM = id; return; }
      if (this.bgm && this.bgm.id === id && !opts.restart) return;
      this.stopBGM(opts.fadeOut ?? 0.4);
      const def = this.bank.bgm[id]; if (!def) return;
      const out = this.ctx.createGain(); out.connect(this.duckGain);
      const t = this.ctx.currentTime;
      out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(def.gain ?? 1, t + (opts.fadeIn ?? 0.3));
      const b = { id, def, out, step: 0, next: t + 0.05 };
      if (this.buffers.has(id)) {
        const s = this.ctx.createBufferSource(); s.buffer = this.buffers.get(id); s.loop = def.loop !== false; s.connect(out); s.start(t); b.src = s;
      }
      this.bgm = b;
    }
    stopBGM(fade = 0.4) {
      if (!this.bgm || !this.ctx) { this.bgm = null; return; }
      const b = this.bgm, t = this.ctx.currentTime;
      b.out.gain.cancelScheduledValues(t); b.out.gain.setTargetAtTime(0.0001, t, Math.max(0.01, fade / 3));
      if (b.src) try { b.src.stop(t + fade + 0.2); } catch (e) {}
      setTimeout(() => b.out.disconnect(), (fade + 0.5) * 1000);
      this.bgm = null;
    }
    tickBGM() {
      const b = this.bgm; if (!b || b.src || !this.ctx) return;
      const d = b.def, spb = 60 / d.bpm / 4; // 16分
      const total = d.bars * 16;
      while (b.next < this.ctx.currentTime + 0.12) {
        const s = b.step % total;
        if (!d.loop && b.step >= total) { this.stopBGM(0.5); return; }
        for (const tr of d.tracks) {
          const ev = tr.seq(s, Math.floor(b.step / total));
          if (ev == null) continue;
          for (const e of [].concat(ev)) {
            if (e == null) continue;
            const note = typeof e === 'object' ? e.n : e; const len = (typeof e === 'object' && e.l) || tr.len || 1;
            this.inst(tr.inst, b.out, b.next, note, len * spb, (typeof e === 'object' && e.v) || tr.vel || 1);
          }
        }
        b.step++; b.next += spb;
      }
    }
  }

  AudioManager.midiHz = midiHz;
  NB.AudioManager = AudioManager;
})(globalThis.NB);
