#!/usr/bin/env python3
"""ニュース回の音（合成音だけなので著作権の心配がない）

  python scripts/bgm/make_news.py
    → generator/assets/bgm/news_open.wav  … OPのジングル（15秒・8小節。lab/ui.py の news_open の動きに合わせてある）
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


BPM_O = 128
BO = 60 / BPM_O          # 1拍 0.469秒
BAR_O = 4 * BO           # 1小節 1.875秒 → 8小節でちょうど15秒
# 覚えてもらう「ナギバクニュースのテーマ」（拍, 音, 長さ拍）。タ・タタ・ターン、の頭が看板
HOOK = [(0, 81, 0.5), (0.5, 81, 0.25), (0.75, 81, 0.25), (1, 86, 1.5), (2.5, 83, 0.5), (3, 81, 1)]
ANS1 = [(0, 78, 0.5), (0.5, 79, 0.5), (1, 81, 1), (2, 76, 0.5), (2.5, 78, 0.5), (3, 74, 1)]
ANS2 = [(0, 78, 0.5), (0.5, 79, 0.5), (1, 81, 0.5), (1.5, 83, 0.5), (2, 86, 2)]
# 半小節ごとの和音（ルート, 和音）
HARM = {1: [(50, (62, 66, 69)), (50, (62, 66, 69))], 2: [(43, (62, 67, 71)), (45, (61, 64, 69))],
        3: [(47, (62, 66, 71)), (43, (62, 67, 71))], 4: [(45, (61, 64, 69)), (50, (62, 66, 69))],
        5: [(43, (62, 67, 71)), (45, (61, 64, 69))], 6: [(50, (62, 66, 69)), (43, (62, 67, 71))]}


def melody(buf, t0, notes, g=0.34, octave=True):
    for b, m, ln in notes:
        op.add(buf, t0 + b * BO, brass(m, ln * BO * 0.92), g)
        if octave:
            op.add(buf, t0 + b * BO, brass(m - 12, ln * BO * 0.92), g * 0.45)


def band(buf, bar, full=True):
    t0 = bar * BAR_O
    for h, (root, ms) in enumerate(HARM[bar]):
        th = t0 + h * 2 * BO
        if full:   # 8分で刻むブラスの裏打ち
            for e in (0.5, 1.5):
                chord(buf, th + e * BO, ms, 0.22, 0.16)
        else:
            chord(buf, th, ms, 1.8 * BO, 0.10)
        for e in range(4):   # 8分のベース
            n = int(BO / 2 * 0.9 * SR)
            f = note(root - 12) * (2 if e % 2 else 1)
            op.add(buf, th + e * BO / 2, op.lp(op.saw(f, n), 800) * op.env(n, d=0.12, s=0.5), 0.36 if full else 0.2)
    for q in range(4):
        tq = t0 + q * BO
        if full:
            op.add(buf, tq, op.kick(), 0.85 if q % 2 == 0 else 0.6)
            if q % 2:
                op.add(buf, tq, op.snare(), 0.6)
            op.add(buf, tq + BO / 2, op.hat(), 0.6)
            op.add(buf, tq + BO / 4 * 3, op.hat(), 0.3)
        else:
            op.add(buf, tq, op.hat(), 0.4)


def hit(buf, t, big=1.0):
    op.add(buf, t, op.kick(), 1.2 * big); op.add(buf, t, op.crash(), 1.0 * big); op.add(buf, t, timpani(note(38), 1.1 * big))


def make_open():
    """15秒のOPジングル。秒数は lab/ui.py の news_open と同じ
      0〜1.875   ティンパニのロール＋弦＋ライザー（帯が走る）
      1.875      ロゴが決まる一発 → 2小節 テーマ（看板のフレーズ）
      5.625      ナギとバクが登場 → 2小節 テーマの2回目＋高く解決
      9.375      今回のニュースの見出し → 1小節 静かにためる（ベルでテーマ、スネアのロール）
      11.25      全員でテーマ → 13.125 決めの一発（タ・タタ・ターン）→ 15秒で消える"""
    L = 8 * BAR_O
    buf = np.zeros(int((L + 1.0) * SR))
    t = 0.0
    while t < BAR_O - 0.08:
        op.add(buf, t, timpani(note(38), 0.12 + 0.6 * t / BAR_O))
        t += 0.055
    op.add(buf, 0, strings((50, 57, 62, 66), BAR_O, 0.12))
    op.add(buf, 0.15, op.riser(BAR_O - 0.15), 0.8)
    hit(buf, BAR_O)
    chord(buf, BAR_O, (50, 57, 62, 66, 69), 0.5, 0.5)
    for bar in (1, 2, 3, 4):
        band(buf, bar)
    melody(buf, 1 * BAR_O, HOOK); melody(buf, 2 * BAR_O, ANS1)
    op.add(buf, 3 * BAR_O, op.crash(), 0.7)
    melody(buf, 3 * BAR_O, HOOK); melody(buf, 4 * BAR_O, ANS2)
    # 5小節目：見出し。静かにためる
    hit(buf, 5 * BAR_O, 0.8)
    band(buf, 5, full=False)
    for b, m, ln in HOOK:
        op.add(buf, 5 * BAR_O + b * BO, bell(m + 12, 1.0), 0.16)
    for e in range(16):
        op.add(buf, 5 * BAR_O + 2 * BO + e * BO / 8, op.snare(), 0.12 + 0.5 * e / 16)
    # 6小節目：全員でテーマ
    hit(buf, 6 * BAR_O)
    band(buf, 6)
    melody(buf, 6 * BAR_O, HOOK, g=0.4)
    for b, m, ln in HOOK:
        op.add(buf, 6 * BAR_O + b * BO, brass(m + 4 if m != 86 else 90, ln * BO * 0.92), 0.16)   # 3度上でハモる
    # 7小節目：決め。タ・タタ・ターン
    T = 7 * BAR_O
    for b, ln in ((0, 0.5), (0.5, 0.25), (0.75, 0.25)):
        chord(buf, T + b * BO, (62, 66, 69, 74), ln * BO * 0.9, 0.45)
        op.add(buf, T + b * BO, op.snare(), 0.7)
    hit(buf, T + BO, 1.2)
    chord(buf, T + BO, (50, 57, 62, 66, 69, 74, 78), 2.6, 0.6)
    op.add(buf, T + BO, bell(86, 2.4), 0.25); op.add(buf, T + BO + 0.1, bell(81, 2.4), 0.18)
    buf = op.hp(buf, 35)
    buf = np.tanh(buf * 1.3) / np.tanh(1.3)
    buf *= 0.9 / np.max(np.abs(buf))
    buf = buf[:int(L * SR)]
    f = int(1.0 * SR)
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
        if bar % 8 == 7:   # 8小節ごとに、OPのテーマの頭（タ・タタ・ターン）をベルで小さく
            for b, m, ln in HOOK[:4]:
                op.add(buf, t0 + b * B, bell(m, 1.4), 0.06)
        elif bar % 4 == 3:
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
