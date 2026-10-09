"""配色・文字・動き・背景。30秒Claude版の見た目（ネイビー×ゴールド×ホワイト）をそのまま部品化したもの"""
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "generator" / "assets"
W, H, FPS, SR = 1920, 1080, 30, 44100

NAVY = (11, 18, 32)
TEXT = (246, 248, 252)
SUB = (154, 168, 188)
GOLD = (244, 201, 93)
RED = (255, 110, 110)
BLUE = (100, 191, 255)
ORANGE = (242, 140, 56)
SPEAKER = {"nagi": BLUE, "baku": ORANGE}
NAME = {"nagi": "ナギ", "baku": "バク"}

FONT_DIRS = [Path("/usr/share/fonts/opentype/noto"), ASSETS / "fonts"]


@lru_cache(maxsize=None)
def font(weight, size):
    name = {"black": "NotoSansCJK-Black.ttc", "bold": "NotoSansCJK-Bold.ttc",
            "medium": "NotoSansCJK-Medium.ttc", "regular": "NotoSansCJK-Regular.ttc"}[weight]
    for d in FONT_DIRS:
        if (d / name).exists():
            return ImageFont.truetype(str(d / name), size, index=0)
    for d in FONT_DIRS:
        for alt in ("NotoSansCJK-Bold.ttc", "NotoSansCJK-Black.ttc"):
            if (d / alt).exists():
                return ImageFont.truetype(str(d / alt), size, index=0)
    raise FileNotFoundError("Noto Sans CJK が見つかりません")


# ---------------------------------------------------------------- 動き
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur) if dur > 0 else float(t >= start)


def out3(x):
    return 1 - (1 - x) ** 3


def inout(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def back(x, s=1.4):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def lerp(a, b, k):
    return a + (b - a) * k


# ---------------------------------------------------------------- 合成
def fade_img(img, a):
    if a >= 0.999:
        return img
    r, g, b, al = img.split()
    return Image.merge("RGBA", (r, g, b, al.point(lambda v: int(v * max(0.0, a)))))


def put(canvas, img, xy, a=1.0):
    if a <= 0.003:
        return
    x, y = int(round(xy[0])), int(round(xy[1]))
    img = fade_img(img, a)
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(canvas.width, x + img.width), min(canvas.height, y + img.height)
    if x1 > x0 and y1 > y0:
        canvas.alpha_composite(img.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def scaled(img, s):
    if abs(s - 1) < 1e-3:
        return img
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.BILINEAR)


def text_layer(txt, f, fill, stroke=0, stroke_fill=NAVY, pad=24):
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    l, t, r, b = d.textbbox((0, 0), txt, font=f, stroke_width=stroke)
    im = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return im


def fit_size(txt, weight, size, max_w, min_size=28):
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    while size > min_size and d.textlength(txt, font=font(weight, size)) > max_w:
        size -= 4
    return size


@lru_cache(maxsize=128)
def gold_text(txt, size, weight="black"):
    f = font(weight, size)
    st = max(4, size // 14)
    base = text_layer(txt, f, (255, 255, 255, 255), pad=40)
    mask = base.split()[3]
    hgt = base.height
    stops = [(0.0, (255, 243, 196)), (0.45, (246, 205, 104)), (0.7, (222, 160, 58)), (1.0, (172, 110, 30))]
    ys = np.linspace(0, 1, hgt)
    grad = np.zeros((hgt, base.width, 3), np.float32)
    for c in range(3):
        grad[..., c] = np.interp(ys, [s for s, _ in stops], [v[c] for _, v in stops])[:, None]
    gold = Image.fromarray(grad.astype(np.uint8), "RGB").convert("RGBA")
    gold.putalpha(mask)
    outline = text_layer(txt, f, (40, 22, 6, 255), stroke=st, stroke_fill=(40, 22, 6), pad=40)
    shadow = outline.filter(ImageFilter.GaussianBlur(10))
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.alpha_composite(fade_img(shadow, 0.8), (6, 8))
    out.alpha_composite(outline)
    out.alpha_composite(gold)
    return out


def spaced(d, xy, txt, f, fill, sp, anchor="l"):
    x, y = xy
    total = sum(d.textlength(c, font=f) for c in txt) + sp * (len(txt) - 1)
    if anchor == "m":
        x -= total / 2
    for c in txt:
        d.text((x, y), c, font=f, fill=fill, anchor="lm")
        x += d.textlength(c, font=f) + sp


def label(txt, color=BLUE, size=24):
    """小さな英字ラベル（MACHINE PROFILE など）"""
    f = font("bold", size)
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    w = sum(d.textlength(c, font=f) for c in txt) + 7 * (len(txt) - 1)
    im = Image.new("RGBA", (int(w) + 8, size + 16), (0, 0, 0, 0))
    spaced(ImageDraw.Draw(im), (2, (size + 16) / 2), txt, f, color, 7)
    return im


# ---------------------------------------------------------------- 背景
@lru_cache(maxsize=1)
def dark_grad():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W * 0.5) / W) ** 2 + ((yy - H * 0.42) / H) ** 2)
    k = np.clip(1 - r * 1.4, 0, 1)[..., None]
    img = np.array([8, 12, 22], np.float32) + k * np.array([22, 32, 56], np.float32)
    img += np.random.default_rng(4).normal(0, 2.2, (H, W, 1))
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


@lru_cache(maxsize=1)
def metal_bg():
    rng = np.random.default_rng(7)
    pw = W + 240
    n = rng.normal(0, 1, (H, pw)).astype(np.float32)
    k = np.ones(161, np.float32) / 161
    n = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, n) * 9
    yy, xx = np.mgrid[0:H, 0:pw].astype(np.float32)
    light = np.clip(1 - np.abs((xx - pw * 0.78) * 0.55 + (yy - H * 0.1) * 0.9) / 900, 0, 1) ** 2
    v = 26 + n + light * 34
    img = np.stack([v * 0.92, v * 0.96, v * 1.08], -1)
    vig = np.clip(np.sqrt(((xx - pw / 2) / (pw * 0.6)) ** 2 + ((yy - H / 2) / (H * 0.6)) ** 2) - 0.5, 0, 1)
    img *= (1 - 0.55 * vig)[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")   # 横に240px広い＝パララックス用


@lru_cache(maxsize=1)
def bokeh_bg():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (xx / W * 0.6 + yy / H * 0.4)[..., None]
    img = (1 - t) * np.array([14, 18, 46], np.float32) + t * np.array([46, 16, 52], np.float32)
    base = Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    rng = np.random.default_rng(11)
    for _ in range(46):
        r = rng.uniform(24, 110)
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        col = [(214, 40, 70), (240, 120, 60), (244, 201, 93), (120, 60, 200)][rng.integers(0, 4)]
        d.ellipse((x - r, y - r, x + r, y + r), fill=col + (int(rng.uniform(25, 70)),))
    base.alpha_composite(lay.filter(ImageFilter.GaussianBlur(14)))
    return base


@lru_cache(maxsize=1)
def lab_bg():
    src = Image.open(ASSETS / "backgrounds" / "lab_room.png").convert("RGB").resize((W, H), Image.LANCZOS)
    a = np.asarray(src.filter(ImageFilter.GaussianBlur(7))).astype(np.float32) * 0.5
    return Image.fromarray(a.astype(np.uint8), "RGB").convert("RGBA")


@lru_cache(maxsize=1)
def bottom_shade():
    g = np.zeros((300, W, 4), np.uint8)
    g[..., 3] = (np.linspace(0, 1, 300) ** 1.6 * 175).astype(np.uint8)[:, None]
    return Image.fromarray(g, "RGBA")


def program_tag(cv):
    d = ImageDraw.Draw(cv)
    f = font("bold", 26)
    txt = "ナギバクのパチンコ研究所"
    tw = d.textlength(txt, font=f)
    d.rounded_rectangle((44, 38, 44 + tw + 44, 82), 6, fill=(10, 16, 30, 200))
    d.rectangle((44, 38, 52, 82), fill=BLUE)
    d.text((66, 60), txt, font=f, fill=TEXT, anchor="lm")


def chip(cv, txt, xy=None, anchor="r"):
    """右上などに出す小さな注記（イメージ・仮素材・出典）"""
    d = ImageDraw.Draw(cv)
    f = font("medium", 24)
    tw = d.textlength(txt, font=f)
    if xy is None:
        x1, y = W - 44, 40
    else:
        x1, y = xy
    x0 = x1 - tw - 32 if anchor == "r" else x1
    d.rounded_rectangle((x0, y, x0 + tw + 32, y + 40), 6, fill=(10, 16, 30, 200), outline=(154, 168, 188, 160), width=2)
    d.text((x0 + 16, y + 20), txt, font=f, fill=SUB, anchor="lm")


def source_line(cv, txt):
    ImageDraw.Draw(cv).text((W - 48, H - 30), txt, font=font("regular", 22), fill=(170, 180, 198), anchor="rm")
