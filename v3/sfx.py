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
    else:
        return None
    return _norm(x)
