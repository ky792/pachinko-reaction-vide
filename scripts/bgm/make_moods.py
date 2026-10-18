#!/usr/bin/env python3
"""場面ごとのBGMを自作する（合成音だけ・著作権の心配なし）。声の下で流す前提で、メロディは控えめ

  python scripts/bgm/make_moods.py    # generator/assets/bgm/mood_retro.wav / mood_winter.wav / mood_hype.wav

- retro ：ピコピコした8bit風。昔の台の話（2004〜2009年）
- winter：ゆっくりした短調。規制で冷えた時代（2016〜2019年）
- hype  ：速いドラムとベースで走る。神台・連チャンの話（エヴァ10、超暴走、咆哮）
どれも16小節で、頭とお尻がつながるループ
"""
import numpy as np
from scipy.io import wavfile

import make_op as op

SR = op.SR


def loop_write(buf, name):
    buf = op.hp(buf, 35)
    buf = np.tanh(buf * 1.3) / np.tanh(1.3)
    buf *= 0.85 / max(1e-6, np.max(np.abs(buf)))
    buf *= min(1.0, 0.125 / max(1e-6, np.sqrt((buf ** 2).mean())))     # 音量感を bright_pop（RMS 約0.12）にそろえる
    f = int(0.02 * SR)
    buf[:f] *= np.linspace(0, 1, f); buf[-f:] *= np.linspace(1, 0, f)
    wavfile.write(op.OUT / name, SR, (buf * 32767).astype(np.int16))
    print(op.OUT / name, round(len(buf) / SR, 1), "秒")


def retro():
    bpm = 132; beat = 60 / bpm; bar = 4 * beat
    prog = [(57, 60, 64), (53, 57, 60), (55, 59, 62), (52, 55, 59)] * 4     # Am F G Em
    n = int(16 * bar * SR); buf = np.zeros(n)
    for b, ch in enumerate(prog):
        for e in range(16):                          # 16分のアルペジオ（矩形波）
            m = ch[e % 3] + (12 if e % 6 >= 3 else 0)
            ln = int(beat / 4 * 0.8 * SR)
            sig = np.sign(np.sin(2 * np.pi * op.note(m + 12) * np.arange(ln) / SR)) * op.env(ln, d=0.08, s=0.2, r=0.01)
            op.add(buf, b * bar + e * beat / 4, sig, 0.07)
        for q in range(4):                           # 三角波っぽいベース
            ln = int(beat * 0.9 * SR); t = np.arange(ln) / SR
            sig = (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * op.note(ch[0] - 12) * t)) * op.env(ln, d=0.3, s=0.5, r=0.02)
            op.add(buf, b * bar + q * beat, sig, 0.28)
        for q in range(4):
            op.add(buf, b * bar + q * beat, op.kick(), 0.35 if q % 2 == 0 else 0.0)
            op.add(buf, b * bar + q * beat + beat / 2, op.hat(), 0.5)
        for q in (1, 3):
            op.add(buf, b * bar + q * beat, op.snare(), 0.28)
    loop_write(buf, "mood_retro.wav")


def winter():
    bpm = 76; beat = 60 / bpm; bar = 4 * beat
    prog = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)] * 4     # Am F C G
    n = int(16 * bar * SR); buf = np.zeros(n)
    for b, ch in enumerate(prog):
        ln = int(bar * 1.05 * SR)                    # ゆっくり立ち上がるパッド
        pad = sum(op.saw(op.note(m), ln, detune=0.004) for m in ch)
        pad = op.lp(pad, 900) * op.env(ln, a=0.6, d=2.0, s=0.7, r=0.4)
        op.add(buf, b * bar, pad, 0.07)
        for i, m in enumerate((ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12)):   # まばらなベル
            ln2 = int(1.6 * SR); t = np.arange(ln2) / SR
            bell = (np.sin(2 * np.pi * op.note(m) * t) + 0.3 * np.sin(2 * np.pi * 2.01 * op.note(m) * t)) * np.exp(-t * 2.5)
            op.add(buf, b * bar + i * beat, bell, 0.09)
        ln3 = int(bar * SR)
        op.add(buf, b * bar, op.lp(op.saw(op.note(ch[0] - 24), ln3), 300) * op.env(ln3, a=0.05, d=1.5, s=0.6, r=0.2), 0.2)
    loop_write(buf, "mood_winter.wav")


def hype():
    bpm = 150; beat = 60 / bpm; bar = 4 * beat
    prog = [(62, 66, 69), (59, 62, 66), (55, 59, 62), (57, 61, 64)] * 4     # D Bm G A
    n = int(16 * bar * SR); buf = np.zeros(n)
    for b, ch in enumerate(prog):
        t0 = b * bar
        for q in range(4):
            op.add(buf, t0 + q * beat, op.kick(), 0.8)
        for q in (1, 3):
            op.add(buf, t0 + q * beat, op.snare(), 0.6)
        for e in range(8):
            op.add(buf, t0 + e * beat / 2, op.hat(e % 2 == 1), 0.7)
        for e in range(8):                           # 8分のベース
            ln = int(beat / 2 * 0.9 * SR)
            f = op.note(ch[0] - 24) * (2 if e % 2 else 1)
            op.add(buf, t0 + e * beat / 2, op.lp(op.saw(f, ln), 900) * op.env(ln, d=0.12, s=0.5), 0.35)
        for pos in (0, 1.5 * beat, 2.5 * beat):      # 刻むコード
            ln = int(0.22 * SR)
            sig = op.lp(sum(op.saw(op.note(m), ln, detune=0.006) for m in ch), 2200) * op.env(ln, d=0.12, s=0.2, r=0.03)
            op.add(buf, t0 + pos, sig, 0.12)
        if b % 4 == 0:
            op.add(buf, t0, op.crash(), 0.5)
    loop_write(buf, "mood_hype.wav")


if __name__ == "__main__":
    retro(); winter(); hype()
