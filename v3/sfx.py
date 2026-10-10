"""ナギバク独自の効果音（numpy で合成。既存機種の音は使わない）"""
from functools import lru_cache

import numpy as np

SR = 44100


def _env(n, a=0.004, d=0.1):
    t = np.arange(n) / SR
    return np.clip(t / a, 0, 1) * np.exp(-t / d)


def _norm(x):
    return (x / (np.max(np.abs(x)) + 1e-9)).astype(np.float32)


@lru_cache(maxsize=None)
def make(kind):
    rng = np.random.default_rng(3)
    if kind == "hold":            # 保留変化：キュイン（上がるチャープ＋きらめき）
        n = int(0.42 * SR); t = np.arange(n) / SR
        f = 600 * np.exp(t * 5.2)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.003, 0.18)
        x += 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * _env(n, 0.003, 0.08)
    elif kind == "hold_gold":     # 金への変化：和音のキュイン＋長めの余韻
        n = int(0.9 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for m in (1.0, 1.26, 1.5, 2.0):
            f = 700 * m * np.exp(np.minimum(t, 0.25) * 4)
            x += np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.003, 0.35)
    elif kind == "tick":          # ゲージの1目盛り
        n = int(0.05 * SR); t = np.arange(n) / SR
        x = np.sign(np.sin(2 * np.pi * 1900 * t)) * _env(n, 0.001, 0.015) * 0.6
    elif kind == "impact":        # 数字の叩きつけ：ドドン
        n = int(1.0 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for d0 in (0.0, 0.11):
            a = int(d0 * SR); tt = t[: n - a]
            f = 95 * np.exp(-tt * 9) + 42
            x[a:] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.22) * (1.0 if d0 else 0.8)
        noise = rng.standard_normal(n)
        x += np.convolve(noise, np.ones(25) / 25, "same") * np.exp(-t / 0.04) * 2.5
    elif kind == "fanfare":       # 注目機種の登場：短いファンファーレ（ドミソド）
        notes = [(0.0, 523.25), (0.09, 659.25), (0.18, 783.99), (0.27, 1046.5)]
        n = int(0.9 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for st, fr in notes:
            a = int(st * SR); tt = t[: n - a]
            x[a:] += (np.sign(np.sin(2 * np.pi * fr * tt)) * 0.35 + np.sin(2 * np.pi * fr * tt)) * np.exp(-tt / (0.5 if st == 0.27 else 0.12))
    elif kind == "sparkle":       # きらめき（上昇アルペジオ）
        n = int(0.6 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for i, fr in enumerate([1568, 1976, 2349, 2637, 3136]):
            a = int(i * 0.05 * SR); tt = t[: n - a]
            x[a:] += np.sin(2 * np.pi * fr * tt) * np.exp(-tt / 0.12)
    elif kind == "boing":         # バクのツッコミ：びよん
        n = int(0.45 * SR); t = np.arange(n) / SR
        f = 260 + 140 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 4)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.004, 0.2)
    elif kind == "whoosh":
        n = int(0.32 * SR); t = np.arange(n) / SR
        noise = rng.standard_normal(n)
        y = np.zeros(n); acc = 0.0
        for i in range(n):
            a = 0.05 + 0.5 * (i / n)
            acc += a * (noise[i] - acc); y[i] = acc
        x = y * np.sin(np.pi * t / t[-1]) ** 1.5
    elif kind == "pop":           # 項目が出る：ポン
        n = int(0.12 * SR); t = np.arange(n) / SR
        f = 950 * np.exp(-t * 7)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.002, 0.04)
    elif kind == "stamp":         # カレンダーの強調：ダン
        n = int(0.35 * SR); t = np.arange(n) / SR
        x = np.sin(2 * np.pi * (130 * np.exp(-t * 6) + 60) * t) * np.exp(-t / 0.09)
        x += rng.standard_normal(n) * np.exp(-t / 0.015) * 0.5
    elif kind == "senbare":       # 先バレ：ピピン（短い高音2つ）
        n = int(0.22 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for st, fr in ((0.0, 2093.0), (0.07, 2637.0)):
            a = int(st * SR); tt = t[: n - a]
            x[a:] += (np.sin(2 * np.pi * fr * tt) + 0.3 * np.sin(2 * np.pi * fr * 2 * tt)) * np.exp(-tt / 0.05)
    elif kind == "chapter":       # 章の入口：短い3音（ナギバクのジングルを短くしたもの）
        notes = [(0.0, 1046.5, 0.08), (0.07, 1318.5, 0.08), (0.14, 1568.0, 0.35)]
        n = int(0.7 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for st, fr, dc in notes:
            a = int(st * SR); tt = t[: n - a]
            x[a:] += (np.sin(2 * np.pi * fr * tt) + 0.3 * np.sin(2 * np.pi * fr * 2.76 * tt) * np.exp(-tt / 0.06)
                      + 0.2 * np.sign(np.sin(2 * np.pi * fr * tt))) * np.exp(-tt / dc)
        x += np.sin(2 * np.pi * (70 + 50 * np.exp(-t * 30)) * t) * np.exp(-t / 0.12)
    elif kind == "jingle":        # ナギバク研究所の専用ジングル（ソ・ド・ミ｜レ・ソー）ベル＋矩形波＋低音
        notes = [(0.0, 783.99, 0.1), (0.08, 1046.5, 0.1), (0.16, 1318.5, 0.1), (0.3, 1174.7, 0.1), (0.38, 1568.0, 0.55)]
        n = int(1.3 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for st, fr, dc in notes:
            a = int(st * SR); tt = t[: n - a]
            bell = np.sin(2 * np.pi * fr * tt) + 0.35 * np.sin(2 * np.pi * fr * 2.76 * tt) * np.exp(-tt / 0.08)
            x[a:] += (bell + 0.25 * np.sign(np.sin(2 * np.pi * fr * tt))) * np.exp(-tt / dc)
        a = int(0.38 * SR); tt = t[: n - a]
        for m in (1.0, 1.26, 1.5):
            x[a:] += 0.35 * np.sin(2 * np.pi * 392 * m * tt) * np.exp(-tt / 0.6)
        x += np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 30)) * t) * np.exp(-t / 0.18) * 1.2
    elif kind == "scan":          # ナギの解析：ピ・ピ・ピッ＋さらっとした走査音
        n = int(0.42 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for i, fr in enumerate((1320, 1660, 1980)):
            a = int(i * 0.06 * SR); tt = t[: n - a]
            x[a:] += np.sin(2 * np.pi * fr * tt) * np.exp(-tt / 0.03) * 0.8
        noise = rng.standard_normal(n)
        hp = noise - np.convolve(noise, np.ones(8) / 8, "same")
        x += hp * np.sin(np.pi * t / t[-1]) * 0.12
    elif kind == "slap":          # ツッコミ：ピシッ
        n = int(0.09 * SR); t = np.arange(n) / SR
        noise = rng.standard_normal(n)
        x = (noise - np.convolve(noise, np.ones(4) / 4, "same")) * np.exp(-t / 0.012) * 2
        x += np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.01)
    elif kind == "reel_tick":     # リール回転中のカタカタ
        n = int(0.025 * SR); t = np.arange(n) / SR
        x = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.004) + rng.standard_normal(n) * np.exp(-t / 0.003) * 0.4
    elif kind == "reel_stop":     # リール停止：ガチッ
        n = int(0.16 * SR); t = np.arange(n) / SR
        x = np.sin(2 * np.pi * (180 * np.exp(-t * 20) + 90) * t) * np.exp(-t / 0.05)
        x += rng.standard_normal(n) * np.exp(-t / 0.006) * 0.8
    elif kind == "reach":         # 最後のリールの溜め：上がっていく音
        n = int(0.55 * SR); t = np.arange(n) / SR
        f = 380 * np.exp(t * 1.6)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 16 * t)) * np.minimum(1, t / 0.05)
        x *= np.exp(-np.maximum(0, t - 0.45) / 0.04)
    elif kind == "align":         # 揃い：明るい和音＋きらめき
        n = int(1.3 * SR); t = np.arange(n) / SR
        x = np.zeros(n)
        for m in (523.25, 659.25, 783.99, 1046.5):
            x += (np.sin(2 * np.pi * m * t) + 0.3 * np.sin(2 * np.pi * m * 2.76 * t) * np.exp(-t / 0.1)) * np.exp(-t / 0.5)
        for i, fr in enumerate((2093, 2637, 3136, 4186)):
            a = int((0.05 + 0.06 * i) * SR); tt = t[: n - a]
            x[a:] += 0.4 * np.sin(2 * np.pi * fr * tt) * np.exp(-tt / 0.1)
    elif kind == "shock":         # 規制の衝撃：ズドーン（低く沈む）
        n = int(1.2 * SR); t = np.arange(n) / SR
        x = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 2.2) + 38) / SR) * np.exp(-t / 0.45)
        x += 0.35 * (np.sin(2 * np.pi * 233 * t) + np.sin(2 * np.pi * 247 * t)) * np.exp(-t / 0.3)
        noise = rng.standard_normal(n)
        x += np.convolve(noise, np.ones(30) / 30, "same") * np.exp(-t / 0.05) * 3
    else:
        return None
    return _norm(x)
