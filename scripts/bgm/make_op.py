#!/usr/bin/env python3
"""OP用の短いBGM（ジングル）を自作する。合成音だけなので著作権の心配がない

  python scripts/bgm/make_op.py      # generator/assets/bgm/op_rock.wav と op_brass.wav（どちらも約12秒）

- A「rock」：160BPM・ニ長調。8分のベースとシンセのコードで走る、アニメOP寄り
- B「brass」：160BPM・同じ進行。シンコペーションのブラス風スタブとベルのメロディ、跳ねるハイハット
- 構成は8小節：1小節目＝ためて上がる（ライザー＋ドラムのフィル）→ 2〜7小節目＝メロディ → 8小節目＝決めの一発で終わる
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
BPM = 160
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 8
N = int((BARS * BAR + 1.2) * SR)
OUT = Path(__file__).resolve().parents[2] / "generator" / "assets" / "bgm"
note = lambda m: 440 * 2 ** ((m - 69) / 12)
rng = np.random.default_rng(11)

# 進行（2〜7小節目）：D A Bm G Em A → 8小節目 D
CHORDS = [None, (62, 66, 69), (61, 64, 69), (59, 62, 66), (59, 62, 67), (59, 64, 67), (61, 64, 69), (62, 66, 69)]
ROOTS = [None, 38, 33, 35, 31, 40, 33, 38]
# メロディ（8分音符ごと。0＝休み、-1＝前の音を伸ばす）
MELODY = [
    [0] * 8,
    [74, 74, 76, 78, 81, -1, 78, -1],
    [76, -1, 73, 76, 78, -1, 76, -1],
    [74, 74, 76, 78, 79, -1, 78, 76],
    [74, -1, 71, 74, 76, -1, -1, 0],
    [79, 79, 78, 76, 78, -1, 76, 74],
    [76, -1, 78, 79, 81, -1, 81, -1],
    [86, -1, -1, -1, -1, -1, -1, -1],
]


def lp(x, f, order=2):
    b, a = butter(order, min(f / (SR / 2), 0.99), "low")
    return lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = butter(order, min(f / (SR / 2), 0.99), "high")
    return lfilter(b, a, x)


def add(buf, start, sig, g=1.0):
    s = int(start * SR)
    if s >= len(buf):
        return
    e = min(len(buf), s + len(sig))
    buf[s:e] += sig[:e - s] * g


def env(n, a=0.005, d=0.2, s=0.0, r=0.05):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * (s + (1 - s) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4)))
    rel = int(r * SR)
    if rel and n > rel:
        e[-rel:] *= np.linspace(1, 0, rel)
    return e


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for dt in ((-detune, 0, detune) if detune else (0,)):
        ph = (f * (1 + dt) * t + rng.random()) % 1
        out += 2 * ph - 1
    return out / (3 if detune else 1)


def square(f, n, vib=0.0):
    t = np.arange(n) / SR
    fm = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.15))
    ph = np.cumsum(fm) / SR
    return np.sign(np.sin(2 * np.pi * ph)) * 0.6 + 0.4 * np.sin(2 * np.pi * ph)


def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 1.2


def snare():
    n = int(0.25 * SR); t = np.arange(n) / SR
    noise = hp(rng.standard_normal(n), 1500) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    return (noise * 0.7 + tone * 0.6)


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 70)) * 0.35


def crash():
    n = int(1.6 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4000) * np.exp(-t * 2.2) * 0.35


def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    for i in range(0, n, 2048):           # だんだん明るくなるノイズ
        seg = x[i:i + 2048]
        out[i:i + len(seg)] = hp(seg, 300 + 6000 * (i / n) ** 2, 1)
    return out * (t / dur) ** 2 * 0.4


def drums(buf, style):
    # 1小節目：スネアのフィルで上げる
    for i in range(8):
        add(buf, i * BEAT / 2, snare(), 0.25 + 0.6 * i / 8)
    for k in range(4, 8):
        add(buf, (k + 4) * BEAT / 2 - BEAT / 4, snare(), 0.5)
    for b in range(1, BARS - 1):
        t0 = b * BAR
        if style == "rock":
            for q in range(4):
                add(buf, t0 + q * BEAT, kick(), 0.9 if q in (0, 2) else 0.55)
            for q in (1, 3):
                add(buf, t0 + q * BEAT, snare(), 0.75)
            for e in range(8):
                add(buf, t0 + e * BEAT / 2, hat(e % 2 == 1), 0.8)
        else:
            for pos in (0, 1.5, 2.5):
                add(buf, t0 + pos * BEAT, kick(), 0.85)
            for q in (1, 3):
                add(buf, t0 + q * BEAT, snare(), 0.7)
            for e in range(8):                       # 跳ねるハイハット
                sw = BEAT / 2 * (0.16 if e % 2 else 0)
                add(buf, t0 + e * BEAT / 2 + sw, hat(e == 7), 0.7)
        if b == BARS - 2:                            # 決めの前のフィル
            for e in range(4):
                add(buf, t0 + 2 * BEAT + e * BEAT / 4, snare(), 0.45 + 0.1 * e)
    end = (BARS - 1) * BAR
    add(buf, end, kick(), 1.1); add(buf, end, crash(), 1.0); add(buf, end, snare(), 0.6)
    add(buf, BAR, crash(), 0.9)


def bass(buf, style):
    for b in range(1, BARS):
        f = note(ROOTS[b])
        if b == BARS - 1:
            n = int(1.4 * SR)
            add(buf, b * BAR, lp(saw(f, n), 700) * env(n, d=0.6), 0.5)
            continue
        steps = range(8) if style == "rock" else (0, 3, 4, 6, 7)
        for e in steps:
            n = int(BEAT / 2 * 0.9 * SR)
            ff = f * (2 if (style == "rock" and e % 2) else 1)
            add(buf, b * BAR + e * BEAT / 2, lp(saw(ff, n), 900) * env(n, d=0.12, s=0.5), 0.42)


def chords(buf, style):
    for b in range(1, BARS):
        ch = CHORDS[b]
        if style == "rock":
            hits = [(0, BAR * 0.98)] if b < BARS - 1 else [(0, 1.4)]
            gain = 0.16
        else:
            hits = [(0, 0.2), (1.5 * BEAT, 0.2), (2.5 * BEAT, 0.35)] if b < BARS - 1 else [(0, 1.4)]
            gain = 0.22
        for pos, dur in hits:
            n = int(dur * SR)
            sig = sum(saw(note(m), n, detune=0.006) for m in ch)
            cut = 2500 if style == "rock" else 1200 + 2500 * np.exp(-np.arange(n) / SR * 8)
            if style == "rock":
                sig = lp(sig, cut)
            else:   # フィルターが閉じていくブラス風
                out = np.zeros(n)
                for i in range(0, n, 1024):
                    out[i:i + 1024] = lp(sig[i:i + 1024], float(cut[i]), 1)
                sig = out
            add(buf, b * BAR + pos, sig * env(n, a=0.01, d=0.4 if style == "rock" else 0.12, s=0.6 if style == "rock" else 0.2, r=0.04), gain)


def lead(buf, style):
    step = BEAT / 2
    for b, bar in enumerate(MELODY):
        for i, m in enumerate(bar):
            if m <= 0:
                continue
            ln = 1
            while i + ln < len(bar) and bar[i + ln] == -1:
                ln += 1
            dur = ln * step * 0.95 if b < BARS - 1 else 1.3
            n = int(dur * SR)
            if style == "rock":
                sig = lp(square(note(m), n, vib=0.006), 3800) * env(n, a=0.01, d=0.5, s=0.7, r=0.04)
                add(buf, b * BAR + i * step, sig, 0.22)
            else:
                t = np.arange(n) / SR
                f = note(m)
                sig = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6)
                       + 0.25 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 9)) * env(n, a=0.004, d=0.35, s=0.35, r=0.04)
                add(buf, b * BAR + i * step, sig, 0.3)
                add(buf, b * BAR + i * step + step * 0.75, sig * 0.25, 0.3)   # 軽いこだま


def make(style):
    buf = np.zeros(N)
    add(buf, 0, riser(BAR), 1.0)
    drums(buf, style); bass(buf, style); chords(buf, style); lead(buf, style)
    buf = hp(buf, 35)
    buf = np.tanh(buf * 1.4) / np.tanh(1.4)
    buf *= 0.9 / np.max(np.abs(buf))
    fade = int(0.6 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)
    OUT.mkdir(parents=True, exist_ok=True)
    wavfile.write(OUT / f"op_{style}.wav", SR, (buf * 32767).astype(np.int16))
    print(OUT / f"op_{style}.wav", round(len(buf) / SR, 2), "秒")


if __name__ == "__main__":
    for s in ("rock", "brass"):
        make(s)
