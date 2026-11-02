#!/usr/bin/env python3
"""明るめのBGMを自作する（著作権の心配がない合成音）。ニュース解説用

  python scripts/bgm/make_bright.py      # generator/assets/bgm/bright_pop.wav（メロディあり）と bright_light.wav（メロディなし）

- 124BPM・ハ長調、I–V–vi–IV の16小節（約31秒）ループ。声の下で鳴らす前提で、中域を空けた軽い音
"""
import numpy as np
from pathlib import Path
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
BPM = 124
BEAT = 60 / BPM
BARS = 16
N = int(BARS * 4 * BEAT * SR)
OUT = Path(__file__).resolve().parents[2] / "generator" / "assets" / "bgm"
note = lambda m: 440 * 2 ** ((m - 69) / 12)
rng = np.random.default_rng(7)


def add(buf, start, sig):
    s = int(start * SR)
    e = min(len(buf), s + len(sig))
    if s < len(buf):
        buf[s:e] += sig[:e - s]


def pluck(f, dur, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    env = np.exp(-t * 6) * (1 - np.exp(-t * 400))
    return env * (np.sin(2 * np.pi * f * t) + 0.4 * bright * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 10)
                  + 0.2 * bright * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 16))


def bell(f, dur):
    t = np.arange(int(dur * SR)) / SR
    return np.exp(-t * 4) * (1 - np.exp(-t * 300)) * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 4.01 * f * t) * np.exp(-t * 12))


def make(melody=True):
    buf = np.zeros(N)
    prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]   # C G Am F
    for bar in range(BARS):
        chd = prog[bar % 4]
        t0 = bar * 4 * BEAT
        for k in (0, 1, 1.5, 2.5, 3, 3.5):                # 跳ねるコードのリズム
            for j, m in enumerate(chd):
                add(buf, t0 + k * BEAT + j * 0.006, 0.06 * pluck(note(m + 12), 0.35))
        for k in range(4):                                 # ベース：ルートとオクターブ
            add(buf, t0 + k * BEAT, 0.22 * pluck(note(chd[0] - 12 + (12 if k % 2 else 0)), 0.4, 0.3))
        for k in range(4):                                 # キック、2・4拍目にクラップ、8分のシェイカー
            tk = np.arange(int(0.18 * SR)) / SR
            add(buf, t0 + k * BEAT, 0.32 * np.exp(-tk * 22) * np.sin(2 * np.pi * (55 + 90 * np.exp(-tk * 40)) * tk))
            if k % 2:
                tc = np.arange(int(0.12 * SR)) / SR
                for d in (0, 0.007, 0.015):
                    add(buf, t0 + k * BEAT + d, 0.05 * np.exp(-tc * 35) * rng.standard_normal(len(tc)))
            for h in (0, 0.5):
                th = np.arange(int(0.04 * SR)) / SR
                add(buf, t0 + (k + h) * BEAT, (0.03 if h else 0.018) * np.exp(-th * 70) * rng.standard_normal(len(th)))
    if melody:                                             # 4小節で1周する短いフック（高めのベル）
        hook = [(0, 76), (0.5, 79), (1, 81), (2, 79), (3, 76), (4, 74), (4.5, 76), (5, 79), (6, 74),
                (8, 72), (8.5, 74), (9, 76), (10, 72), (11, 69), (12, 72), (12.5, 74), (13, 76), (14, 79), (15, 77)]
        for rep in range(BARS // 4):
            if rep % 2:                                    # 2周に1回だけ鳴らして、うるさくしない
                continue
            for b, m in hook:
                add(buf, (rep * 16 + b) * BEAT, 0.07 * bell(note(m + 12), 0.8))
    bo, ao = butter(2, 6500 / (SR / 2))
    buf = lfilter(bo, ao, buf)
    bh, ah = butter(1, 60 / (SR / 2), btype="high")
    buf = lfilter(bh, ah, buf)
    return buf / np.max(np.abs(buf)) * 0.85


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, mel in (("bright_pop.wav", True), ("bright_light.wav", False)):
        wavfile.write(OUT / name, SR, (make(mel) * 32767).astype(np.int16))
        print(OUT / name, round(N / SR, 1), "秒")


if __name__ == "__main__":
    main()
