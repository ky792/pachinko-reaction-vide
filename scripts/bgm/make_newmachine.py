#!/usr/bin/env python3
"""新台解説シリーズ用のBGMを自作する（合成音だけ・著作権の心配なし）

  python scripts/bgm/make_newmachine.py    # generator/assets/bgm/newmachine_matsuri.wav

- 128BPM・ニ長調、和風のヨナ抜き（ド・レ・ミ・ソ・ラ）のメロディを木琴っぽい音で。太鼓・手拍子・跳ねるベース
- 歴史回（bright_pop）と聞き分けがつくように、お祭り寄りの明るさ。声の下で鳴らす前提でメロディは控えめ・中域を空ける
- 16小節（約30秒）で頭とお尻がつながるループ。音量感は bright_pop（RMS 約0.12）にそろえる
"""
import numpy as np

import make_op as op
from make_moods import loop_write, taiko

SR = op.SR


def marimba(f, n):
    """木琴っぽい音：基音＋4倍音、速い減衰"""
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 30)
    return s * np.exp(-t * 7)


def clap():
    n = int(0.12 * SR)
    noise = np.random.default_rng(7).standard_normal(n)
    e = np.zeros(n)
    for k in (0, int(0.012 * SR), int(0.024 * SR)):
        e[k:] += np.exp(-np.arange(n - k) / SR * 45)
    return op.hp(op.lp(noise * e, 3500), 900) * 0.5


def main():
    bpm = 128; beat = 60 / bpm; bar = 4 * beat
    # D G A D / Bm G A D の繰り返し（明るく、最後に戻る）
    prog = [(62, 66, 69), (55, 59, 62), (57, 61, 64), (62, 66, 69), (59, 62, 66), (55, 59, 62), (57, 61, 64), (62, 66, 69)] * 2
    n = int(16 * bar * SR); buf = np.zeros(n)
    yona = [62, 64, 66, 69, 71, 74, 76, 78]          # D E F# A B D E F#（ヨナ抜き）
    rng = np.random.default_rng(11)
    motif = [0, 2, 3, 2, 4, 3, 2, -1, 3, 4, 5, 4, 3, 2, 3, -1]   # 8分×16（-1は休み）
    for b, ch in enumerate(prog):
        t0 = b * bar
        for q in range(4):                                     # 太鼓（どん）
            op.add(buf, t0 + q * beat, taiko(), 0.55 if q % 2 == 0 else 0.35)
        for q in (1, 3):                                       # 手拍子
            op.add(buf, t0 + q * beat, clap(), 0.55)
        for e in range(8):                                     # 跳ねるハイハット（シャッフル気味）
            sw = 0.04 * beat if e % 2 else 0
            op.add(buf, t0 + e * beat / 2 + sw, op.hat(False), 0.35)
        for e in range(8):                                     # オクターブで跳ねるベース
            ln = int(beat / 2 * 0.8 * SR)
            f = op.note(ch[0] - 24) * (2 if e % 2 else 1)
            op.add(buf, t0 + e * beat / 2, op.lp(op.saw(f, ln), 700) * op.env(ln, d=0.1, s=0.4), 0.30)
        for pos in (0.5 * beat, 1.5 * beat, 2.5 * beat, 3.5 * beat):   # 裏で刻むコード（中域は控えめ）
            ln = int(0.16 * SR)
            sig = op.lp(sum(op.square(op.note(m + 12), ln) for m in ch), 2600) * op.env(ln, d=0.08, s=0.1, r=0.02)
            op.add(buf, t0 + pos, sig, 0.045)
        half = motif[:8] if b % 2 == 0 else motif[8:]          # 木琴のメロディ（2小節で1フレーズ）
        for e, k in enumerate(half):
            if k < 0:
                continue
            k = min(len(yona) - 1, k + (1 if b >= 8 and e == 4 else 0))
            ln = int(0.5 * SR)
            op.add(buf, t0 + e * beat / 2, marimba(op.note(yona[k] + 12), ln), 0.16 + 0.02 * rng.random())
        if b % 8 == 0:
            op.add(buf, t0, op.crash(), 0.35)
    loop_write(buf, "newmachine_matsuri.wav")


if __name__ == "__main__":
    main()
