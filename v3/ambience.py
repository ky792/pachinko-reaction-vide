"""時代ごとの空気（画面の粒子）と、カメラの動き

  particles(cv, style, t)   章の曲調に合わせた粒子を重ねる（泡・火の粉・金の粒・スピード線・電子のグリッド など）
  drift(cv, t, dur, seed)   静かな画面（要点・掛け合い・資料）をゆっくり寄せて、止まって見えないようにする
  punch(cv, k)              驚き・数字の瞬間に一瞬だけ寄る
どれも軽い処理（1フレーム数ミリ秒〜20ミリ秒）。
"""
import math
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1080

KIND = {"retro": "pixels", "ocean": "bubbles", "epic": "embers", "gold": "gold", "battle": "embers_red", "idol": "stars",
        "speed": "speed", "calm": "grid", "edm": "neon", "future": "neon", "warm": "confetti", "lab": "dust"}


@lru_cache(maxsize=None)
def _dot(r, col, blur):
    s = int(r * 2 + blur * 4 + 4)
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = s / 2
    d.ellipse((c - r, c - r, c + r, c + r), fill=col)
    return im.filter(ImageFilter.GaussianBlur(blur)) if blur else im


@lru_cache(maxsize=None)
def _ring(r, col):
    s = int(r * 2 + 8)
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((4, 4, s - 4, s - 4), outline=col, width=3)
    ImageDraw.Draw(im).ellipse((s * 0.3, s * 0.25, s * 0.42, s * 0.37), fill=(255, 255, 255, 150))
    return im


@lru_cache(maxsize=None)
def _seeds(kind, n):
    rng = np.random.default_rng(abs(hash(kind)) % 2 ** 31)
    return rng.random((n, 6))


def particles(cv, style, t, strength=1.0):
    kind = KIND.get(style)
    if not kind or strength <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    if kind == "bubbles":
        for x0, sp, r, ph, a, _ in _seeds(kind, 26):
            y = H + 60 - ((t * (40 + 60 * sp) + ph * H * 1.3) % (H + 160))
            x = x0 * W + 18 * math.sin(t * 1.5 + ph * 6)
            rr = int(6 + 16 * r)
            lay.alpha_composite(_ring(rr, (170, 225, 255, int(70 + 70 * a))), (int(x - rr), int(y - rr)))
    elif kind in ("embers", "embers_red", "gold", "dust"):
        col = {"embers": (255, 150, 60), "embers_red": (255, 70, 60), "gold": (255, 214, 90), "dust": (180, 210, 255)}[kind]
        n = 18 if kind == "dust" else 34
        for x0, sp, r, ph, a, wob in _seeds(kind, n):
            y = H + 30 - ((t * (50 + 90 * sp) + ph * H * 1.4) % (H + 80))
            x = x0 * W + 40 * math.sin(t * (0.6 + wob) + ph * 7)
            rr = 1.5 + 3.5 * r
            al = int((90 if kind == "dust" else 170) * a * (0.5 + 0.5 * math.sin(t * 5 + ph * 9)) * strength)
            lay.alpha_composite(_dot(round(rr * 2) / 2, col + (max(0, al),), 1.5), (int(x), int(y)))
    elif kind == "stars":
        for x0, y0, r, ph, a, _ in _seeds(kind, 22):
            k = 0.5 + 0.5 * math.sin(t * 3 + ph * 9)
            x, y = x0 * W, y0 * H * 0.8
            s = 4 + 10 * r * k
            al = int(200 * k * a * strength)
            d.line((x - s, y, x + s, y), fill=(255, 240, 200, al), width=2)
            d.line((x, y - s, x, y + s), fill=(255, 240, 200, al), width=2)
    elif kind == "speed":
        for y0, sp, ln, ph, a, _ in _seeds(kind, 16):
            x = W + 200 - ((t * (900 + 1400 * sp) + ph * W * 2) % (W + 600))
            y = y0 * H
            d.line((x, y, x + 120 + 260 * ln, y), fill=(255, 210, 160, int(60 + 90 * a * strength)), width=2)
    elif kind == "grid":
        off = (t * 24) % 80
        for k in range(-1, H // 80 + 2):
            y = k * 80 + off
            d.line((0, y, W, y), fill=(140, 120, 255, int(22 * strength)), width=1)
        sy = (t * 160) % (H + 200) - 100
        d.rectangle((0, sy, W, sy + 3), fill=(170, 150, 255, int(60 * strength)))
    elif kind == "neon":
        for x0, y0, r, ph, a, sp in _seeds(kind, 20):
            x = (x0 * W + t * (20 + 40 * sp)) % W
            y = y0 * H + 10 * math.sin(t * 2 + ph * 5)
            col = (255, 80, 200) if a > 0.5 else (80, 220, 255)
            al = int(110 * (0.5 + 0.5 * math.sin(t * 4 + ph * 8)) * strength)
            lay.alpha_composite(_dot(3.0 + round(r * 3), col + (al,), 3), (int(x), int(y)))
    elif kind == "confetti":
        cols = [(255, 214, 90), (255, 110, 120), (120, 200, 255), (150, 240, 160)]
        for x0, sp, r, ph, a, wob in _seeds(kind, 30):
            y = ((t * (60 + 80 * sp) + ph * H * 1.3) % (H + 80)) - 40
            x = x0 * W + 30 * math.sin(t * (1 + wob) + ph * 6)
            ang = t * 3 + ph * 10
            w, h = 10 * abs(math.cos(ang)) + 2, 6
            d.rectangle((x - w / 2, y - h / 2, x + w / 2, y + h / 2), fill=cols[int(a * 4) % 4] + (int(170 * strength),))
    elif kind == "pixels":
        for x0, y0, r, ph, a, sp in _seeds(kind, 24):
            k = (t * (0.4 + sp) + ph) % 1.0
            x = int(x0 * W / 16) * 16
            y = int((y0 * H - k * 120) / 16) * 16
            al = int(120 * math.sin(math.pi * k) * strength)
            col = [(255, 120, 120), (120, 220, 255), (255, 230, 120)][int(a * 3) % 3]
            d.rectangle((x, y, x + 12, y + 12), fill=col + (al,))
    cv.alpha_composite(lay)


def zoom(cv, z, cx=W / 2, cy=H / 2):
    """画面を z 倍に寄せる（中心 cx,cy）"""
    if abs(z - 1) < 1e-3:
        return cv
    w, h = W / z, H / z
    x0 = min(max(0, cx - w / 2), W - w)
    y0 = min(max(0, cy - h / 2), H - h)
    return cv.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + w, y0 + h))


def drift(cv, t, dur, seed=0):
    """ゆっくり寄る＋少し横に流れる（シーンごとに向きを変える）"""
    k = min(1.0, max(0.0, t / max(dur, 1.0)))
    z = 1.0 + 0.035 * k
    dx = (1 if seed % 2 else -1) * 30 * (k - 0.5)
    return zoom(cv, z, W / 2 + dx, H / 2 + (8 if seed % 3 else -8) * (k - 0.5))
