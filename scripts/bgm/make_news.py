#!/usr/bin/env python3
"""ニュース回の音（合成音だけなので著作権の心配がない）

  python scripts/bgm/make_news.py
    → generator/assets/bgm/news_open.wav  … OPのジングル（約6.5秒。lab/ui.py の news_open の動きに合わせてある）
    → generator/assets/bgm/news_bed.wav   … 本編の下に敷くBGM（104BPM・16小節でつなぎ目なくループ）

ジングルの山場（ui.news_open と同じ秒数）
  0.00〜1.15 ティンパニのロール＋弦の盛り上がり
  1.15       ロゴが決まる：金管の和音＋シンバル
  1.45〜4.3  金管のファンファーレ（ニュース番組っぽい付点のリズム）
  4.45       今回のニュースの見出し：解決の和音＋ベル → 6.5秒で消える
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile

import make_op as op   # lp / hp / add / env / saw / kick / snare / hat / crash / riser を共用

SR = op.SR
OUT = op.OUT
note = op.note
rng = np.random.default_rng(23)


def brass(m, dur, g=1.0):
    """フィルターが開いて閉じる、金管っぽいノコギリ波"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = sum(op.saw(note(m) * r, n, detune=0.004) for r in (1, 1.0015))
    cut = 900 + 3800 * np.exp(-t * 5) * np.minimum(1, t / 0.03)
    out = np.zeros(n)
    for i in range(0, n, 512):
        out[i:i + 512] = op.lp(sig[i:i + 512], float(cut[i]), 1)
    return out * op.env(n, a=0.02, d=0.5, s=0.55, r=0.06) * g


def chord(buf, t, ms, dur, g):
    for m in ms:
        op.add(buf, t, brass(m, dur), g / len(ms) * 2.2)


def timpani(f, g=1.0):
    n = int(0.9 * SR); t = np.arange(n) / SR
    fr = f * (1 + 0.04 * np.exp(-t * 20))
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(fr * 1.5) / SR)
    x += op.lp(rng.standard_normal(n), 400) * np.exp(-t * 40) * 0.5
    return x * np.exp(-t * 3.5) * g


def bell(m, dur=1.8):
    n = int(dur * SR); t = np.arange(n) / SR
    f = note(m)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 4)
            + 0.3 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 7)) * np.exp(-t * 2.2)


def strings(ms, dur, g):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = sum(op.lp(op.saw(note(m), n, detune=0.01), 1800) for m in ms)
    return sig * (t / dur) ** 1.6 * g


def make_open():
    L = 6.5
    buf = np.zeros(int((L + 0.3) * SR))
    # 0〜1.15：ティンパニのロール（だんだん強く）＋弦＋ライザー
    t = 0.0
    while t < 1.1:
        op.add(buf, t, timpani(note(38), 0.15 + 0.6 * t / 1.1))
        t += 0.055
    op.add(buf, 0, strings((50, 57, 62, 66), 1.15, 0.12))
    op.add(buf, 0.1, op.riser(1.05), 0.8)
    # 1.15：ロゴが決まる
    T1 = 1.15
    op.add(buf, T1, op.kick(), 1.2); op.add(buf, T1, op.crash(), 1.1); op.add(buf, T1, timpani(note(38), 1.2))
    chord(buf, T1, (50, 57, 62, 66, 69), 0.55, 0.5)
    # 1.45〜4.3：ファンファーレ（128BPM、D→G→A→D）
    B = 60 / 128
    T2 = 1.45
    motif = [  # (拍, 音, 長さ拍)
        (0, 69, 0.75), (0.75, 69, 0.25), (1, 74, 1), (2, 73, 0.5), (2.5, 71, 0.5), (3, 69, 1),
        (4, 71, 0.75), (4.75, 71, 0.25), (5, 76, 1), (6, 74, 0.5), (6.5, 73, 0.5), (7, 76, 1.2),
    ]
    for b, m, ln in motif:
        op.add(buf, T2 + b * B, brass(m, ln * B * 0.95), 0.34)
        op.add(buf, T2 + b * B, brass(m - 12, ln * B * 0.95), 0.16)
    harm = [(0, (62, 66, 69)), (2, (62, 67, 71)), (4, (64, 67, 71)), (6, (64, 69, 73))]
    for b, ms in harm:
        chord(buf, T2 + b * B, ms, 1.9 * B, 0.22)
        op.add(buf, T2 + b * B, op.lp(op.saw(note(ms[0] - 24), int(1.9 * B * SR)), 500) * op.env(int(1.9 * B * SR), d=0.5, s=0.4), 0.35)
    for q in range(8):
        op.add(buf, T2 + q * B, op.kick(), 0.7 if q % 2 == 0 else 0.45)
        op.add(buf, T2 + q * B + B / 2, op.hat(), 0.6)
        if q % 2:
            op.add(buf, T2 + q * B, op.snare(), 0.5)
    for e in range(4):   # 決めの前のフィル
        op.add(buf, T2 + 7 * B + e * B / 4, op.snare(), 0.4 + 0.12 * e)
    # 4.45：見出し。解決の和音＋ベル
    T3 = 4.45
    op.add(buf, T3, op.kick(), 1.1); op.add(buf, T3, op.crash(), 0.9); op.add(buf, T3, timpani(note(38), 1.0))
    chord(buf, T3, (50, 57, 62, 66, 69, 74), 1.8, 0.55)
    op.add(buf, T3, bell(86), 0.25); op.add(buf, T3 + 0.12, bell(81), 0.18)
    buf = op.hp(buf, 35)
    buf = np.tanh(buf * 1.3) / np.tanh(1.3)
    buf *= 0.9 / np.max(np.abs(buf))
    end = int(L * SR)
    buf = buf[:end]
    f = int(0.9 * SR)
    buf[-f:] *= np.linspace(1, 0, f) ** 1.5
    write("news_open.wav", buf)


def make_bed():
    BPM = 104
    B = 60 / BPM
    BAR = 4 * B
    BARS = 16
    n = int(BARS * BAR * SR)
    buf = np.zeros(n + int(3 * SR))
    prog = [(50, (62, 66, 69)), (47, (62, 66, 71)), (43, (62, 67, 71)), (45, (61, 64, 69))]   # D Bm G A
    arp = [0, 1, 2, 1, 2, 0, 1, 2]
    for bar in range(BARS):
        root, ch = prog[bar % 4]
        t0 = bar * BAR
        # パッド（柔らかく）
        pn = int(BAR * SR)
        pad = sum(op.lp(op.saw(note(m - 12), pn, detune=0.008), 900) for m in ch)
        op.add(buf, t0, pad * op.env(pn, a=0.25, d=2.0, s=0.7, r=0.2), 0.05)
        # ベース（サイン）
        for q in (0, 2, 2.5):
            bn = int(B * 0.9 * SR); tt = np.arange(bn) / SR
            op.add(buf, t0 + q * B, np.sin(2 * np.pi * note(root - 12) * tt) * op.env(bn, d=0.35, s=0.4), 0.32)
        # 爪弾くアルペジオ（8分）
        for e, k in enumerate(arp):
            m = ch[k] + (12 if (bar % 8 >= 4 and e in (3, 7)) else 0)
            an = int(0.5 * SR); tt = np.arange(an) / SR
            f = note(m)
            sig = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 7)
            op.add(buf, t0 + e * B / 2, sig, 0.11 if e % 2 == 0 else 0.08)
        # 軽いリズム
        for q in range(4):
            op.add(buf, t0 + q * B, op.kick(), 0.35 if q in (0, 2) else 0.0)
            op.add(buf, t0 + q * B + B / 2, op.hat(), 0.35)
            if q in (1, 3):
                op.add(buf, t0 + q * B, op.hat(True), 0.18)
        if bar % 4 == 3:   # 4小節ごとにベルで区切る
            op.add(buf, t0 + 3 * B, bell(81, 1.2), 0.05)
    tail = buf[n:].copy()   # はみ出した残響を頭に回して、つなぎ目をなくす
    buf = buf[:n]
    buf[:len(tail)] += tail[:n]
    buf = op.hp(buf, 30)
    buf *= 0.8 / np.max(np.abs(buf))
    write("news_bed.wav", buf)


def write(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    wavfile.write(OUT / name, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(OUT / name, round(len(x) / SR, 2), "秒")


if __name__ == "__main__":
    make_open()
    make_bed()
