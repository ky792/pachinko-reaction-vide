#!/usr/bin/env python3
"""ナギバク V3 比較用 30秒デモ「MAX機の終焉と65%内規／北斗無双の登場」

lab/ と reaction/ には依存しない独立スクリプト（効果音の合成だけ reaction/make_video.py を読む）。
画面は「ショット」単位で丸ごと切り替える。常設するのは左上の番組タグと下の字幕だけ。

  python v3demo/make_30s.py -o output/nagibaku_v3_30s_claude.mp4
  python v3demo/make_30s.py -o output/check.png --stills 1.5,4.5,8,11,14,17,21,24.5,28
"""
import argparse
import math
import subprocess
import sys
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "generator" / "assets"
W, H, FPS, DUR, SR = 1920, 1080, 30, 30.0, 44100

# ---------------------------------------------------------------- 色・文字
NAVY = (11, 18, 32)
TEXT = (246, 248, 252)
SUB = (154, 168, 188)
GOLD = (244, 201, 93)
RED = (232, 72, 72)
BLUE = (100, 191, 255)
ORANGE = (242, 140, 56)

FONT_DIR = Path("/usr/share/fonts/opentype/noto")


@lru_cache(maxsize=None)
def font(weight, size):
    name = {"black": "NotoSansCJK-Black.ttc", "bold": "NotoSansCJK-Bold.ttc",
            "medium": "NotoSansCJK-Medium.ttc", "regular": "NotoSansCJK-Regular.ttc"}[weight]
    for d in (FONT_DIR, ASSETS / "fonts"):
        if (d / name).exists():
            return ImageFont.truetype(str(d / name), size, index=0)
    return ImageFont.truetype(str(FONT_DIR / "NotoSansCJK-Bold.ttc"), size, index=0)


# ---------------------------------------------------------------- 動き
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur) if dur > 0 else float(t >= start)


def out3(x):
    return 1 - (1 - x) ** 3


def inout(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


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
    x1, y1 = min(W, x + img.width), min(H, y + img.height)
    if x1 > x0 and y1 > y0:
        canvas.alpha_composite(img.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def text_layer(txt, f, fill, stroke=0, stroke_fill=NAVY, pad=24):
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    l, t, r, b = d.textbbox((0, 0), txt, font=f, stroke_width=stroke)
    im = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return im


@lru_cache(maxsize=64)
def gold_text(txt, size, weight="black"):
    """金色グラデーションの見出し（縁取り＋落ち影）"""
    f = font(weight, size)
    st = max(4, size // 14)
    base = text_layer(txt, f, (255, 255, 255, 255), stroke=0, pad=40)
    mask = base.split()[3]
    hgt = base.height
    grad = np.zeros((hgt, base.width, 3), np.float32)
    stops = [(0.0, (255, 243, 196)), (0.45, (246, 205, 104)), (0.7, (222, 160, 58)), (1.0, (172, 110, 30))]
    ys = np.linspace(0, 1, hgt)
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


# ---------------------------------------------------------------- 背景（すべて手続き生成 or 自前素材）
@lru_cache(maxsize=1)
def hall_image():
    """AI生成のホールのイラスト（リポジトリ内の hall_anime.png）。実在店舗の写真ではない"""
    return Image.open(ASSETS / "backgrounds" / "hall_anime.png").convert("RGB").resize((W, H))


@lru_cache(maxsize=1)
def dark_grad():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W * 0.5) / W) ** 2 + ((yy - H * 0.42) / H) ** 2)
    k = np.clip(1 - r * 1.4, 0, 1)[..., None]
    img = np.array([8, 12, 22], np.float32) + k * np.array([22, 32, 56], np.float32)
    rng = np.random.default_rng(4)
    img += rng.normal(0, 2.2, (H, W, 1))
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


@lru_cache(maxsize=1)
def metal_bg():
    """機種プロフィール用：ヘアライン加工の暗い金属＋右上から斜めの光"""
    rng = np.random.default_rng(7)
    n = rng.normal(0, 1, (H, W)).astype(np.float32)
    k = np.ones(161, np.float32) / 161
    n = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, n) * 9
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    light = np.clip(1 - np.abs((xx - W * 0.78) * 0.55 + (yy - H * 0.1) * 0.9) / 900, 0, 1) ** 2
    v = 26 + n + light * 34
    img = np.stack([v * 0.92, v * 0.96, v * 1.08], -1)
    vig = np.clip(np.sqrt(((xx - W / 2) / (W * 0.6)) ** 2 + ((yy - H / 2) / (H * 0.6)) ** 2) - 0.5, 0, 1)
    img *= (1 - 0.55 * vig)[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


@lru_cache(maxsize=1)
def bokeh_bg():
    """要点カード用：紺〜紫のグラデーション＋大小のボケ（赤・金）"""
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
    lay = lay.filter(ImageFilter.GaussianBlur(14))
    base.alpha_composite(lay)
    return base


@lru_cache(maxsize=1)
def lab_bg():
    src = Image.open(ASSETS / "backgrounds" / "lab_room.png").convert("RGB").resize((W, H), Image.LANCZOS)
    src = src.filter(ImageFilter.GaussianBlur(7))
    a = np.asarray(src).astype(np.float32) * 0.5
    return Image.fromarray(a.astype(np.uint8), "RGB").convert("RGBA")


@lru_cache(maxsize=1)
def machine_illust():
    """実機ではない、汎用のパチンコ台の概念イラスト（ロゴ・版権要素なし）"""
    S = 2
    w, h = 520 * S, 860 * S
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 40 * S, fill=(52, 58, 72))
    d.rounded_rectangle((10 * S, 10 * S, w - 10 * S, h - 10 * S), 34 * S, fill=(30, 34, 44), outline=(150, 160, 178), width=3 * S)
    d.rounded_rectangle((60 * S, 26 * S, w - 60 * S, 70 * S), 20 * S, fill=(190, 150, 70))       # 上部ランプ
    cx, cy, r = w / 2, 330 * S, 205 * S
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(18, 40, 72), outline=(170, 180, 200), width=5 * S)
    rng = np.random.default_rng(3)
    for _ in range(170):                                                                          # 釘
        a = rng.uniform(0, 2 * math.pi); rr = math.sqrt(rng.uniform(0.15, 0.95)) * r * 0.95
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        d.ellipse((x - 2.5 * S, y - 2.5 * S, x + 2.5 * S, y + 2.5 * S), fill=(200, 205, 215))
    d.rounded_rectangle((cx - 120 * S, cy - 95 * S, cx + 120 * S, cy + 70 * S), 14 * S, fill=(8, 12, 22), outline=(120, 190, 255), width=3 * S)
    for i, col in enumerate([(240, 90, 90), (244, 201, 93), (240, 90, 90)]):                      # 液晶の図柄（記号のみ）
        x = cx - 80 * S + i * 80 * S
        d.rounded_rectangle((x - 30 * S, cy - 50 * S, x + 30 * S, cy + 30 * S), 8 * S, fill=col)
    d.ellipse((cx - 22 * S, cy + 110 * S, cx + 22 * S, cy + 150 * S), fill=(230, 230, 236))        # 始動口
    d.rounded_rectangle((40 * S, 590 * S, w - 40 * S, 700 * S), 24 * S, fill=(70, 78, 96), outline=(150, 160, 178), width=3 * S)
    d.rounded_rectangle((60 * S, 730 * S, w - 60 * S, 820 * S), 24 * S, fill=(58, 64, 80))
    d.ellipse((w - 150 * S, 735 * S, w - 70 * S, 815 * S), fill=(120, 128, 142), outline=(200, 205, 215), width=3 * S)  # ハンドル
    im = im.resize((w // S, h // S), Image.LANCZOS)
    sh = Image.new("RGBA", (im.width + 80, im.height + 80), (0, 0, 0, 0))
    m = Image.new("L", sh.size, 0)
    m.paste(im.split()[3], (40, 50))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.7)))
    out = Image.new("RGBA", sh.size, (0, 0, 0, 0))
    out.alpha_composite(sh)
    out.alpha_composite(im, (40, 30))
    return out


@lru_cache(maxsize=4)
def host(who, h):
    im = Image.open(ASSETS / "characters" / "v2" / who / "normal.png").convert("RGBA")
    return im.resize((int(im.width * h / im.height), h), Image.LANCZOS)


# ---------------------------------------------------------------- 常設要素
def program_tag(cv):
    d = ImageDraw.Draw(cv)
    f = font("bold", 26)
    txt = "ナギバクのパチンコ研究所"
    tw = d.textlength(txt, font=f)
    d.rounded_rectangle((44, 38, 44 + tw + 44, 82), 6, fill=(10, 16, 30, 200))
    d.rectangle((44, 38, 52, 82), fill=BLUE)
    d.text((66, 60), txt, font=f, fill=TEXT, anchor="lm")


def notice_chip(cv, txt):
    d = ImageDraw.Draw(cv)
    f = font("medium", 24)
    tw = d.textlength(txt, font=f)
    x1 = W - 44
    d.rounded_rectangle((x1 - tw - 32, 40, x1, 80), 6, fill=(10, 16, 30, 190), outline=(154, 168, 188, 160), width=2)
    d.text((x1 - 16, 60), txt, font=f, fill=SUB, anchor="rm")


def source_line(cv, txt):
    d = ImageDraw.Draw(cv)
    d.text((W - 48, H - 30), txt, font=font("regular", 22), fill=(170, 180, 198), anchor="rm")


SUBS = [
    (0.0, 3.4, "MAX機がホールを席巻した時代。"),
    (3.4, 6.0, "その終わりが、近づいていた。"),
    (6.0, 9.2, "2016年3月、北斗無双が登場。"),
    (9.2, 12.3, "ST継続率、およそ80%。"),
    (12.3, 15.4, "だが、時代は大きく動き出す。"),
    (15.4, 19.0, "5月、新しい内規の適用が始まった。"),
    (19.0, 22.4, "登場した時期の違いが、"),
    (22.4, 26.0, "その後の立ち位置を変えていく。"),
    (26.0, 30.0, "北斗無双が長く選ばれた理由とは。"),
]


@lru_cache(maxsize=1)
def bottom_shade():
    g = np.zeros((300, W, 4), np.uint8)
    g[..., :3] = 0
    g[..., 3] = (np.linspace(0, 1, 300) ** 1.6 * 175).astype(np.uint8)[:, None]
    return Image.fromarray(g, "RGBA")


@lru_cache(maxsize=16)
def sub_img(txt):
    f = font("black", 62)
    core = text_layer(txt, f, TEXT, stroke=8, stroke_fill=NAVY, pad=30)
    sh = text_layer(txt, f, (0, 0, 0, 255), stroke=8, stroke_fill=(0, 0, 0), pad=30).filter(ImageFilter.GaussianBlur(8))
    out = Image.new("RGBA", core.size, (0, 0, 0, 0))
    out.alpha_composite(fade_img(sh, 0.6), (0, 6))
    out.alpha_composite(core)
    return out


def subtitles(cv, t):
    cv.alpha_composite(bottom_shade(), (0, H - 300))
    for s, e, txt in SUBS:
        if s >= 26.0 and t >= 26.0:
            continue   # 最後は画面中央の問いかけ自体が字幕の役目
        if s <= t < e:
            a = min(prog(t, s, 0.12), 1 - prog(t, e - 0.1, 0.1)) if t > 0.1 else 1
            im = sub_img(txt)
            put(cv, im, ((W - im.width) / 2, H - 92 - im.height / 2), a)


# ---------------------------------------------------------------- ショット
def shot_hall(t):
    """S1 資料全画面：ホールの情景＋金の見出し"""
    z = 1.0 + 0.07 * inout(prog(t, 0, 3.6))
    src = hall_image()
    cw, ch = W / z, H / z
    cx, cy = W / 2, H / 2 - 30 * prog(t, 0, 3.6)
    img = src.crop((int(cx - cw / 2), int(cy - ch / 2), int(cx + cw / 2), int(cy + ch / 2))).resize((W, H), Image.BILINEAR)
    cv = img.convert("RGBA")
    shade = Image.new("RGBA", (W, H), (6, 10, 20, 70))
    cv.alpha_composite(shade)
    k = out3(prog(t, 0.35, 0.6))
    g = gold_text("MAX機の時代", 132)
    put(cv, g, (70 - 40 * (1 - k), 120), k)
    k2 = out3(prog(t, 0.8, 0.5))
    s = text_layer("〜2015年", font("black", 52), TEXT, stroke=6)
    put(cv, s, (110, 120 + g.height - 30), k2)
    notice_chip(cv, "イメージ（イラスト）")
    return cv


def shot_timeline_end(t):
    """S2 年表：MAX機の時代の帯が2015年で途切れ、2016年へ"""
    cv = dark_grad().copy()
    d = ImageDraw.Draw(cv)
    x0, x1, y = 200, W - 200, 560
    years = list(range(2010, 2018))
    X = lambda v: x0 + (x1 - x0) * (v - years[0]) / (years[-1] - years[0])
    ka = inout(prog(t, 0.0, 0.6))
    d.line((x0, y, x0 + (x1 - x0) * ka, y), fill=(70, 84, 110), width=4)
    for yr in years:
        xx = X(yr)
        if xx <= x0 + (x1 - x0) * ka:
            d.line((xx, y - 12, xx, y + 12), fill=(90, 104, 130), width=3)
            d.text((xx, y + 48), str(yr), font=font("bold", 34), fill=SUB, anchor="mm")
    # MAX機の帯（始まりはぼかす＝開始年は示さない）
    kb = out3(prog(t, 0.25, 0.9))
    end = X(2015.9)
    band_end = x0 + (end - x0) * kb
    band = np.zeros((70, int(max(2, band_end - x0)), 4), np.uint8)
    band[..., :3] = GOLD
    alpha = np.clip(np.linspace(0, 1.6, band.shape[1]), 0, 1) * 210
    band[..., 3] = alpha[None, :].astype(np.uint8)
    cv.alpha_composite(Image.fromarray(band, "RGBA"), (x0, y - 120))
    if kb > 0.3:
        d.text((x0 + (end - x0) * 0.55, y - 85), "MAX機の時代", font=font("black", 44), fill=(40, 26, 8), anchor="mm")
    # 終わりの印と2016年への移動
    ke = out3(prog(t, 1.2, 0.5))
    if ke > 0:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        for i in range(6):
            ld.line((end + 4, y - 150 + i * 22, end + 22, y - 136 + i * 22), fill=(230, 230, 236), width=4)
        put(cv, lay, (0, 0), ke)
    km = inout(prog(t, 1.3, 1.0))
    mx = X(2014.6) + (X(2016.0) - X(2014.6)) * km
    d.line((mx, y - 200, mx, y + 20), fill=TEXT, width=3)
    d.ellipse((mx - 12, y - 12, mx + 12, y + 12), fill=GOLD, outline=NAVY, width=4)
    lab = "2016" if km > 0.85 else "2015"
    d.text((mx, y - 236), lab, font=font("black", 64), fill=GOLD, anchor="mm")
    spaced(d, (x0, 230), "TIMELINE", font("bold", 24), BLUE, 6)
    return cv


def shot_profile(t, stat_mode=False):
    """S3 機種プロフィール（質感背景＋概念イラスト＋機種名）"""
    cv = metal_bg().copy()
    ill = machine_illust()
    k = out3(prog(t, 0.0, 0.7))
    sc = 0.70
    im = ill.resize((int(ill.width * sc), int(ill.height * sc)), Image.LANCZOS) if True else ill
    drift = 12 * t
    put(cv, im, (170 - 120 * (1 - k) + drift * 0.6, 120), k)
    d = ImageDraw.Draw(cv)
    d.text((170 + im.width / 2 + drift * 0.6, 120 + im.height + 4), "イラスト（実機写真ではありません）",
           font=font("medium", 24), fill=(190, 198, 212), anchor="mm")
    x = 760 - drift * 0.25
    k1, k2, k3, k4 = (out3(prog(t, s, 0.45)) for s in (0.25, 0.45, 0.9, 1.4))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    spaced(ld, (x, 230), "MACHINE PROFILE", font("bold", 26), GOLD, 7)
    put(cv, lay, (0, 0), k1)
    name1 = text_layer("CR", font("black", 70), TEXT, stroke=0, pad=0)
    put(cv, name1, (x, 290 + 20 * (1 - k2)), k2)
    name2 = text_layer("真・北斗無双", font("black", 160), TEXT, stroke=0, pad=0)
    put(cv, name2, (x - 6, 370 + 20 * (1 - k2)), k2)
    ln = Image.new("RGBA", (int(900 * k3) + 1, 4), GOLD + (255,))
    put(cv, ln, (x, 600), k3)
    info = text_layer("2016年3月 導入", font("black", 64), GOLD, pad=0)
    put(cv, info, (x, 640 + 14 * (1 - k3)), k3)
    maker = text_layer("サミー ｜ 大当たり確率 1/319.7", font("medium", 40), (205, 212, 224), pad=0)
    put(cv, maker, (x, 740 + 14 * (1 - k4)), k4)
    return cv


def shot_stat(t):
    """S4 ビッグスタット：円ゲージが80%まで満ちる（左）、数字の意味（右）"""
    cv = dark_grad().copy()
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    cx, cy, r = 600, 500, 300
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(40, 52, 76), width=30)
    kf = inout(prog(t, 0.15, 1.3))
    v = 80 * kf
    if v > 0.5:
        d.arc((cx - r, cy - r, cx + r, cy + r), -90, -90 + 360 * v / 100, fill=GOLD, width=30)
    cv.alpha_composite(lay)
    d = ImageDraw.Draw(cv)
    num = f"{int(round(v))}%"
    fnum, fyaku = font("black", 170), font("black", 70)
    wn, wy = d.textlength(num, font=fnum), d.textlength("約", font=fyaku)
    x = cx - (wn + wy + 8) / 2
    d.text((x, cy + 58), "約", font=fyaku, fill=GOLD, anchor="ls")
    d.text((x + wy + 8, cy + 58), num, font=fnum, fill=GOLD, anchor="ls")
    k1, k2 = out3(prog(t, 0.3, 0.5)), out3(prog(t, 0.8, 0.5))
    rx = 1030
    lay2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    spaced(ImageDraw.Draw(lay2), (rx, 300), "KEY NUMBER", font("bold", 26), BLUE, 8)
    put(cv, lay2, (0, 0), k1)
    put(cv, text_layer("ST継続率", font("black", 110), TEXT, pad=0), (rx, 350 + 16 * (1 - k1)), k1)
    put(cv, text_layer("ST130回転のうちに", font("bold", 46), (205, 212, 224), pad=0), (rx, 520 + 16 * (1 - k2)), k2)
    put(cv, text_layer("次の当たりを引く割合", font("bold", 46), (205, 212, 224), pad=0), (rx, 586 + 16 * (1 - k2)), k2)
    source_line(cv, "スペック出典：ちょんぼりすた／1geki（機種情報サイト）")
    return cv


def shot_calendar(t):
    """S5 カレンダー：3月→5月へ視線を運ぶ"""
    cv = dark_grad().copy()
    d = ImageDraw.Draw(cv)
    spaced(d, (W / 2, 170), "2016", font("black", 40), SUB, 14, anchor="m")
    months = [("3月", "北斗無双 導入", GOLD), ("4月", "", SUB), ("5月", "新しい内規", RED)]
    cw, chh, gap = 400, 440, 70
    x0 = (W - (cw * 3 + gap * 2)) / 2
    for i, (m, note, col) in enumerate(months):
        k = out3(prog(t, 0.1 + 0.18 * i, 0.45))
        card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle((0, 0, cw - 1, chh - 1), 14, fill=(236, 230, 214))
        cd.rectangle((0, 0, cw, 90), fill=(196, 52, 52) if i == 2 else (60, 70, 92))
        cd.text((cw / 2, 46), "2016", font=font("bold", 36), fill=(255, 255, 255), anchor="mm")
        cd.text((cw / 2, 230), m, font=font("black", 150), fill=(30, 34, 44), anchor="mm")
        if note and (i == 0 or prog(t, 1.6, 0.01) >= 1):
            kn = 1.0 if i == 0 else out3(prog(t, 1.6, 0.4))
            nb = Image.new("RGBA", (cw, 80), (0, 0, 0, 0))
            nd = ImageDraw.Draw(nb)
            nd.rounded_rectangle((30, 6, cw - 30, 74), 10, fill=col + (255,))
            nd.text((cw / 2, 40), note, font=font("black", 38), fill=(20, 16, 10) if i == 0 else (255, 255, 255), anchor="mm")
            card.alpha_composite(fade_img(nb, kn), (0, 330))
        put(cv, card, (x0 + (cw + gap) * i, 300 + 40 * (1 - k)), k)
    # 視線誘導の枠：3月 → 5月
    km = inout(prog(t, 1.0, 1.1))
    fx = x0 + (cw + gap) * 2 * km
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle((fx - 14, 286, fx + cw + 14, 300 + chh + 14), 20,
                                          outline=(GOLD if km < 0.9 else RED) + (255,), width=8)
    put(cv, lay, (0, 0), out3(prog(t, 0.7, 0.3)))
    return cv


def shot_points(t):
    """S6 要点カード：見出しを保ったまま項目が1つずつ増える"""
    cv = bokeh_bg().copy()
    d = ImageDraw.Draw(cv)
    g = gold_text("2016年5月〜 新しい内規", 104)
    put(cv, g, ((W - g.width) / 2, 120), out3(prog(t, 0.0, 0.5)))
    sub = text_layer("日工組（メーカーの業界団体）の申し合わせ", font("bold", 42), TEXT, stroke=5, pad=0)
    put(cv, sub, ((W - sub.width) / 2, 120 + g.height - 6), out3(prog(t, 0.3, 0.5)))
    items = [("①", "新たに納品される台が対象", 0.7), ("②", "継続率の上限は {65%}", 1.5)]
    for i, (n, body, s) in enumerate(items):
        k = prog(t, s, 0.7)
        if k <= 0:
            continue
        y = 470 + 120 * i
        plain = body.replace("{", "").replace("}", "")
        shown = plain[: max(1, int(round(len(plain) * out3(k))))]
        x = 470
        d.text((x, y), n, font=font("black", 64), fill=GOLD, anchor="lm")
        x += 90
        # 「65%」だけ赤で大きく
        if "{" in body and len(shown) > plain.index("65%"):
            pre = plain[: plain.index("65%")]
            d.text((x, y), pre, font=font("black", 64), fill=TEXT, anchor="lm", stroke_width=5, stroke_fill=NAVY)
            x2 = x + d.textlength(pre, font=font("black", 64))
            d.text((x2, y + 6), shown[len(pre):], font=font("black", 92), fill=(255, 92, 92), anchor="lm", stroke_width=6, stroke_fill=NAVY)
        else:
            d.text((x, y), shown, font=font("black", 64), fill=TEXT, anchor="lm", stroke_width=5, stroke_fill=NAVY)
    kn = out3(prog(t, 2.3, 0.4))
    note = text_layer("※法律ではなく、業界団体の自主的なルール", font("medium", 34), (220, 210, 230), pad=0)
    put(cv, note, ((W - note.width) / 2, 760), kn)
    return cv


def shot_compare(t):
    """S7 年表→比較：適用前に出た台と、適用後の新台"""
    cv = dark_grad().copy()
    # 前半：2016年1〜7月の年表。後半：上へ縮みながら比較カードが出る
    ks = inout(prog(t, 3.25, 0.7))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    x0, x1, y = 260, W - 260, 560
    r0, r1 = 2016.0, 2016.58
    X = lambda v: x0 + (x1 - x0) * (v - r0) / (r1 - r0)
    ka = inout(prog(t, 0.0, 0.6))
    d.line((x0, y, x0 + (x1 - x0) * ka, y), fill=(80, 94, 120), width=5)
    for v, lb in ((2016.0, "1月"), (2016.17, "3月"), (2016.33, "5月"), (2016.5, "7月")):
        xx = X(v)
        if xx <= x0 + (x1 - x0) * ka:
            d.line((xx, y - 12, xx, y + 12), fill=(100, 114, 140), width=3)
            d.text((xx, y + 48), lb, font=font("bold", 36), fill=SUB, anchor="mm")
    xr = X(2016.33)
    kr = out3(prog(t, 0.9, 0.5))
    if kr > 0:
        reg = Image.new("RGBA", (int(x1 - xr), 300), (232, 72, 72, int(40 * kr)))
        lay.alpha_composite(reg, (int(xr), y - 260))
        d.line((xr, y - 260, xr, y + 10), fill=(255, 110, 110, int(255 * kr)), width=4)
        d.text((xr + 24, y - 228), "新しい内規の適用後", font=font("black", 44), fill=(255, 140, 140, int(255 * kr)), anchor="lm")
    kh = out3(prog(t, 0.5, 0.5))
    if kh > 0:
        xh = X(2016.17)
        d.line((xh, y - 160 * kh, xh, y), fill=GOLD, width=4)
        d.ellipse((xh - 14, y - 14, xh + 14, y + 14), fill=GOLD, outline=NAVY, width=4)
        d.text((xh, y - 196 * kh), "北斗無双", font=font("black", 50), fill=GOLD, anchor="mm")
    kb = out3(prog(t, 1.6, 0.5))
    if kb > 0:
        d.text((x0 + (xr - x0) / 2, y + 120), "← 適用前に登場", font=font("black", 46), fill=(255, 226, 150, int(255 * kb)), anchor="mm")
    # 年表を上へ縮める
    put(cv, lay, (0, -60 * ks), 1 - ks)
    if ks > 0:
        g = gold_text("適用の前と後", 96)
        put(cv, g, ((W - g.width) / 2, 170 + 16 * (1 - ks)), ks)
    # 比較カード
    if ks > 0:
        cards = [("真・北斗無双", "適用前に登場", "ST継続率", "約80%", GOLD),
                 ("5月以降の新台", "内規の対象", "継続率の上限", "65%", (255, 120, 120))]
        cw, chh, gap = 640, 380, 80
        cx0 = (W - (cw * 2 + gap)) / 2
        for i, (nm, tag, k1, val, col) in enumerate(cards):
            kc = out3(prog(t, 3.5 + 0.25 * i, 0.5))
            card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
            cd = ImageDraw.Draw(card)
            cd.rounded_rectangle((0, 0, cw - 1, chh - 1), 16, fill=(22, 30, 50, 240), outline=col + (255,), width=3)
            cd.text((40, 56), tag, font=font("bold", 32), fill=col, anchor="lm")
            cd.text((40, 118), nm, font=font("black", 60), fill=TEXT, anchor="lm")
            cd.text((40, 200), k1, font=font("bold", 36), fill=SUB, anchor="lm")
            cd.text((cw - 40, 290), val, font=font("black", 132), fill=col, anchor="rm")
            put(cv, card, (cx0 + (cw + gap) * i, 380 + 30 * (1 - kc)), kc)
        kn = out3(prog(t, 4.3, 0.4))
        note = text_layer("※80%と65%は数え方が違う指標。単純な比較はできない", font("medium", 32), (200, 208, 222), pad=0)
        put(cv, note, ((W - note.width) / 2, 795), kn)
    source_line(cv, "出典：nana press（内規）／ちょんぼりすた・1geki（スペック）")
    return cv


def shot_question(t):
    """S8 問いかけ：ラボ背景に戻り、ナギとバクが登場"""
    cv = lab_bg().copy()
    shade = Image.new("RGBA", (W, H), (6, 10, 22, 90))
    cv.alpha_composite(shade)
    k = out3(prog(t, 0.1, 0.6))
    lab = Image.new("RGBA", (W, 60), (0, 0, 0, 0))
    spaced(ImageDraw.Draw(lab), (W / 2, 30), "NEXT", font("bold", 28), BLUE, 10, anchor="m")
    put(cv, lab, (0, 190), k)
    l1 = text_layer("北斗無双が", font("black", 120), TEXT, stroke=8, pad=0)
    put(cv, l1, ((W - l1.width) / 2, 270 + 20 * (1 - k)), k)
    k2 = out3(prog(t, 0.35, 0.6))
    g = gold_text("長く選ばれた理由とは？", 124)
    put(cv, g, ((W - g.width) / 2, 410 + 20 * (1 - k2)), k2)
    kn = out3(prog(t, 0.9, 0.6))
    nagi, baku = host("nagi", 420), host("baku", 400)
    put(cv, nagi, (70, H - nagi.height - 20 + 80 * (1 - kn)), kn)
    put(cv, baku, (W - baku.width - 70, H - baku.height - 20 + 80 * (1 - kn)), kn)
    return cv


SHOTS = [  # (開始, 終了, 関数, 入り方)
    (0.0, 3.4, shot_hall, "cut"),
    (3.4, 6.0, shot_timeline_end, "fade"),
    (6.0, 9.2, shot_profile, "cut"),
    (9.2, 12.3, shot_stat, "zoom"),
    (12.3, 15.4, shot_calendar, "cut"),
    (15.4, 19.0, shot_points, "fade"),
    (19.0, 26.0, shot_compare, "cut"),
    (26.0, 30.0, shot_question, "zoom"),
]
TRANS = {"cut": 0.0, "fade": 0.35, "zoom": 0.32}


def raw_frame(t):
    for s, e, fn, _ in SHOTS:
        if s <= t < e or (fn is SHOTS[-1][2] and t >= s):
            return fn(t - s)
    return SHOTS[-1][2](t - SHOTS[-1][0])


def frame(t):
    cur = None
    for i, (s, e, fn, kind) in enumerate(SHOTS):
        if s <= t < e or (i == len(SHOTS) - 1 and t >= s):
            cur = i
            break
    s, e, fn, kind = SHOTS[cur]
    cv = fn(t - s)
    td = TRANS[kind]
    if cur > 0 and td > 0 and t - s < td:
        p = (t - s) / td
        prev = SHOTS[cur - 1][2](t - SHOTS[cur - 1][0])
        if kind == "zoom":
            z = 1 + 0.12 * (1 - out3(p))
            big = cv.resize((int(W * z), int(H * z)), Image.BILINEAR)
            cv = big.crop(((big.width - W) // 2, (big.height - H) // 2, (big.width - W) // 2 + W, (big.height - H) // 2 + H))
            if p < 0.6:
                cv = cv.filter(ImageFilter.GaussianBlur(10 * (1 - p / 0.6)))
        cv = Image.blend(prev.convert("RGB"), cv.convert("RGB"), inout(p)).convert("RGBA")
    program_tag(cv)
    subtitles(cv, t)
    if t > DUR - 0.6:
        cv = Image.blend(cv.convert("RGB"), Image.new("RGB", (W, H), (0, 0, 0)), prog(t, DUR - 0.6, 0.6)).convert("RGBA")
    return cv.convert("RGB")


# ---------------------------------------------------------------- 音
def synth_bgm():
    """落ち着いたパッド＋12.3秒から脈打つ低音。自作の簡易シンセ"""
    n = int(DUR * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    chords = [(0, [57, 60, 64]), (6, [53, 57, 60]), (12.3, [50, 53, 57]), (15.4, [52, 56, 59]),
              (19, [53, 57, 60]), (22.4, [55, 59, 62]), (26, [57, 60, 64])]
    f = lambda m: 440 * 2 ** ((m - 69) / 12)
    for i, (st, notes) in enumerate(chords):
        en = chords[i + 1][0] if i + 1 < len(chords) else DUR
        a, b = int(st * SR), int(en * SR)
        tt = t[a:b] - st
        env = np.minimum(1, tt / 1.2) * np.minimum(1, (en - st - tt) / 0.8 + 0.05)
        seg = np.zeros(b - a, np.float32)
        for m in notes:
            for det in (-0.12, 0.12):
                seg += np.sin(2 * np.pi * f(m + det) * tt) * 0.08
            seg += np.sin(2 * np.pi * f(m - 12) * tt) * 0.05
        out[a:b] += seg * env
    # 脈（12.3〜26秒）
    for bt in np.arange(12.3, 26.0, 0.5):
        a = int(bt * SR); m = int(0.25 * SR)
        tt = np.arange(m) / SR
        out[a:a + m] += np.sin(2 * np.pi * (55 + 30 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 14) * 0.35
    out *= np.minimum(1, t / 1.0) * np.minimum(1, (DUR - t) / 1.5)
    return out


def build_audio(path):
    sys.path.insert(0, str(ROOT / "reaction"))
    from make_video import synth_se
    n = int(DUR * SR)
    mix = synth_bgm() * 0.55
    hits = [(0.05, "taiko", 0.35), (3.4, "shu", 0.3), (6.0, "don", 0.35), (9.2, "shu", 0.3),
            (12.3, "shu", 0.3), (13.4, "piko", 0.18), (15.4, "taiko", 0.32), (16.1, "pon", 0.25), (16.9, "pon", 0.25),
            (19.0, "shu", 0.28), (19.9, "pon", 0.2), (22.3, "shu", 0.25), (22.6, "don", 0.3), (26.0, "shu", 0.3)]
    for tt in np.arange(9.4, 10.6, 0.09):   # カウントアップのカチカチ
        hits.append((tt, "pon", 0.07))
    for t0, kind, g in hits:
        x = synth_se(kind)
        if x is None:
            continue
        a = int(t0 * SR)
        seg = x[: n - a] * g
        mix[a:a + len(seg)] += seg
    mix = np.clip(mix, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--stills")
    args = ap.parse_args()
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.stills:
        for s in args.stills.split(","):
            frame(float(s)).save(out.with_name(f"{out.stem}_{float(s):05.2f}.png"))
        return
    vtmp, wav = out.with_suffix(".v.mp4"), out.with_suffix(".wav")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                            "-pix_fmt", "yuv420p", str(vtmp)], stdin=subprocess.PIPE)
    nf = int(DUR * FPS)
    for i in range(nf):
        enc.stdin.write(frame(i / FPS).tobytes())
        if i % 150 == 0:
            print(f"  {i / FPS:5.1f}/{DUR}秒", flush=True)
    enc.stdin.close(); enc.wait()
    build_audio(wav)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(vtmp), "-i", str(wav), "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "192k", "-shortest", str(out)], check=True)
    vtmp.unlink(); wav.unlink()
    print("完成:", out)


if __name__ == "__main__":
    main()
