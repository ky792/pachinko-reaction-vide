"""ナギバクのパチンコ研究所：UIデザインシステム（部品）

すべての部品は「キャンバス(RGBA)・その部品の経過時間 tl・表示時間 dur・データ」を受け取り、
その瞬間の見た目を描くだけの関数。動き（出る・引っ込む）は tl と dur から決まるので、
台本側（scene.json）では「いつからいつまで、どの部品に、何を出すか」だけを書けばよい。
"""
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "generator" / "assets"

# ---------------------------------------------------------------- デザイントークン
def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

BG = hexc("#101827")
PANEL = hexc("#19273B")
PANEL_LINE = hexc("#2A3B55")
NAGI = hexc("#64BFFF")
BAKU = hexc("#F28C38")
TEXT = hexc("#F6F8FC")
SUB = hexc("#9AA8BC")
KEY = hexc("#F4C95D")
MARGIN = 60
RADIUS = 12
LINE_W = 2            # パネル枠の太さ（号外テーマは太い墨線）
INK = hexc("#16161A")
YEL = hexc("#FFD21F")
SPEAKER = {"nagi": NAGI, "baku": BAKU}
ACCENT = NAGI          # パネルのラベル・四隅・矢印などの差し色（テーマで変わる。字幕の話者色は変えない）

# ---------------------------------------------------------------- テーマ（シリーズごとの見た目）
# lab＝研究所（歴史回の既定）／newmachine＝新台解説（ホール風：黒×ワインレッド×金、上部はスペックの札）
THEMES = {
    "lab": {"BG": "#101827", "PANEL": "#19273B", "PANEL_LINE": "#2A3B55", "ACCENT": "#64BFFF", "KEY": "#F4C95D",
            "SUB": "#9AA8BC", "bar": "timeline", "chapter": "lab", "blur": 9, "bg_mix": (0.34, 0.42)},
    "newmachine": {"BG": "#140A10", "PANEL": "#26121B", "PANEL_LINE": "#4D2634", "ACCENT": "#FF5D6C", "KEY": "#FFD34E",
                   "SUB": "#CDB0B9", "bar": "chips", "chapter": "band", "blur": 16, "bg_mix": (0.30, 0.50)},
    # goggai＝新台解説の号外（紙×黄×墨）。歴史回の紺と一目で違う明るい画。枠は太い墨線
    "goggai": {"BG": "#F7F5EE", "PANEL": "#FFFDF6", "PANEL_LINE": "#16161A", "ACCENT": "#16161A", "KEY": "#E2343B",
               "SUB": "#6B6658", "TEXT": "#16161A", "bar": "goggai", "chapter": "band", "band": "#FFD21F",
               "paper": True, "line_w": 5, "radius": 4},
}
THEME = dict(THEMES["lab"], name="lab")
POINT_LABEL = "POINT"   # 章カードの番号の上の札（ニュース回は "TOPIC"）
BAR_LABEL = "新台解説"   # 号外テーマの左上の札（ニュース回は episode.json の "bar_label" で「ニュース」）


def apply_theme(name):
    """テーマの色を部品全体に反映する（各プロセスで描く前に1回呼ぶ）"""
    global BG, PANEL, PANEL_LINE, ACCENT, KEY, SUB, TEXT, THEME, LINE_W, RADIUS
    name = name if name in THEMES else "lab"
    if THEME.get("name") == name:
        return
    t = THEMES[name]
    BG, PANEL, PANEL_LINE, ACCENT, KEY, SUB = (hexc(t[k]) for k in ("BG", "PANEL", "PANEL_LINE", "ACCENT", "KEY", "SUB"))
    TEXT = hexc(t.get("TEXT", "#F6F8FC"))
    LINE_W = t.get("line_w", 2)
    RADIUS = t.get("radius", 12)
    THEME = dict(t, name=name)
    background.cache_clear()
NAME = {"nagi": "ナギ", "baku": "バク"}

_FONT_FILES = {
    "black": "NotoSansCJK-Black.ttc", "bold": "NotoSansCJK-Bold.ttc",
    "medium": "NotoSansCJK-Medium.ttc", "regular": "NotoSansCJK-Regular.ttc",
}
_FONT_DIRS = [Path("/usr/share/fonts/opentype/noto"), ASSETS / "fonts"]


@lru_cache(maxsize=None)
def font(weight, size):
    for d in _FONT_DIRS:
        p = d / _FONT_FILES[weight]
        if p.exists():
            return ImageFont.truetype(str(p), size, index=0)   # index0 = JP
    for d in _FONT_DIRS:                                        # Black/Bold しか無い環境
        for name in ("NotoSansCJK-Bold.ttc", "NotoSansCJK-Black.ttc"):
            if (d / name).exists():
                return ImageFont.truetype(str(d / name), size, index=0)
    raise FileNotFoundError("Noto Sans CJK が見つかりません")


# ---------------------------------------------------------------- 動きの部品
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur) if dur > 0 else float(t >= start)


def ease_out(x):          # cubic
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out_back(x, s=1.2):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def life(tl, dur, tin=0.35, tout=0.35):
    """出る(0→1)・居る(1)・引っ込む(1→0) の係数"""
    a = ease_out(prog(tl, 0, tin))
    b = 1 - ease_in_out(prog(tl, dur - tout, tout))
    return min(a, b)


def fade(img, a):
    if a >= 0.999:
        return img
    r, g, b, al = img.split()
    al = al.point(lambda v: int(v * max(0.0, a)))
    return Image.merge("RGBA", (r, g, b, al))


def paste(canvas, img, xy, a=1.0):
    if a <= 0.003:
        return
    x, y = int(round(xy[0])), int(round(xy[1]))
    canvas.alpha_composite(fade(img, a), (x, y)) if 0 <= x and 0 <= y and x + img.width <= W and y + img.height <= H \
        else _paste_clip(canvas, fade(img, a), x, y)


def _paste_clip(canvas, img, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + img.width), min(H, y + img.height)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(img.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def text_w(txt, f, spacing=0):
    return ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(txt, font=f) + spacing * max(0, len(txt) - 1)


def draw_spaced(d, xy, txt, f, fill, spacing, anchor="lm"):
    """字間をあけた英数字（CHAPTER 02 など）"""
    total = text_w(txt, f, spacing)
    x, y = xy
    if anchor[0] == "m":
        x -= total / 2
    for ch in txt:
        d.text((x, y), ch, font=f, fill=fill, anchor="l" + anchor[1])
        x += d.textlength(ch, font=f) + spacing


def rich(d, center, line, f, base, key):
    """{…} で囲んだ部分だけ重要数字色にして中央揃えで描く"""
    segs, buf, on = [], "", False
    for ch in line:
        if ch in "{}":
            if buf:
                segs.append((buf, on))
            buf, on = "", ch == "{"
        else:
            buf += ch
    if buf:
        segs.append((buf, on))
    total = sum(d.textlength(s, font=f) for s, _ in segs)
    x = center[0] - total / 2
    for s, k in segs:
        d.text((x, center[1]), s, font=f, fill=key if k else base, anchor="lm")
        x += d.textlength(s, font=f)


# ---------------------------------------------------------------- 研究ラボらしさの小部品
def lab_label(d, xy, txt, col=None, size=20, anchor="lm"):
    """小さな英字ラベル（NAGI ANALYSIS / DATA LOG / LAB RECORD）。字間広め・控えめ"""
    draw_spaced(d, xy, txt, font("bold", size), col or SUB, 4, anchor=anchor)


def corner_ticks(d, box, col, n=16, w=2):
    """パネルの四隅だけに細いL字。枠全体を光らせない"""
    x0, y0, x1, y1 = box
    for (x, y, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line((x, y, x + sx * n, y), fill=col, width=w)
        d.line((x, y, x, y + sy * n), fill=col, width=w)


# ---------------------------------------------------------------- 背景
@lru_cache(maxsize=4)
def background(name="lab_room.png"):
    """背景画像（generator/assets/backgrounds/<name>。既定は研究室）を暗く・ぼかして敷く。
    無ければ #101827 の無地＋方眼。文字が主役になる明るさに抑える。回ごとに episode.json の "background" で変えられる"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if THEME.get("paper"):   # 号外：紙色＋細かい網点
        img = Image.new("RGBA", (W, H), BG)
        d = ImageDraw.Draw(img)
        for y in range(0, H + 36, 36):
            for x in range((y // 36 % 2) * 18, W + 36, 36):
                d.ellipse((x - 2.4, y - 2.4, x + 2.4, y + 2.4), fill=(22, 22, 26, 16))
        return img
    p = Path(name) if name and Path(name).is_absolute() else ASSETS / "backgrounds" / (name or "lab_room.png")
    if p.exists():
        src = Image.open(p).convert("RGB")
        s = max(W / src.width, H / src.height)
        src = src.resize((int(src.width * s + 0.5), int(src.height * s + 0.5)), Image.LANCZOS)
        src = src.crop(((src.width - W) // 2, (src.height - H) // 2, (src.width - W) // 2 + W, (src.height - H) // 2 + H))
        src = src.filter(ImageFilter.GaussianBlur(THEME.get("blur", 9)))
        mix = THEME.get("bg_mix", (0.34, 0.42))
        img = np.asarray(src).astype(np.float32) * mix[0] + np.array(BG[:3], np.float32) * mix[1]
    else:
        img = np.zeros((H, W, 3), np.float32) + np.array(BG[:3], np.float32)
        grid = ((xx % 80) < 1) | ((yy % 80) < 1)
        img[grid] += 5
    vign = np.clip(np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2), 0, 1.4)
    img *= (1 - 0.35 * np.clip(vign - 0.5, 0, 1))[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


# ---------------------------------------------------------------- 常設：上部バー（章ラベル＋年表ミニマップ）
TL_X0, TL_X1, TL_Y = 1200, W - MARGIN, 70
YEARS = (2008, 2026)
FUTURE = (40, 52, 70, 255)     # 未来＝暗め
PAST = (120, 136, 160, 255)    # 過去＝薄く残す


def year_x(y):
    return TL_X0 + (TL_X1 - TL_X0) * (y - YEARS[0]) / (YEARS[1] - YEARS[0])


def top_bar(canvas, a, chapter_no, chapter_title, year, era=None, milestones=(), label=None, chips=None):
    """左：章タイトル（CHAPTER番号は小さく補助）／右：年表。今の年だけ強調、過去は薄く、未来は暗く。
    新台解説テーマ（bar=chips）では、右側を年表の代わりに機種のスペックの札にする"""
    if a <= 0:
        return
    lay = Image.new("RGBA", (W, 150), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    if THEME.get("bar") == "goggai":   # 左上：墨の帯に黄の差し色と「新台解説」、右：スペックの札
        ft = font("black", 40)
        bw = max(560, int(text_w(chapter_title, ft)) + 110)
        d.rectangle((10, 46, bw + 10, 136), fill=INK)
        d.rectangle((0, 36, bw, 126), fill=INK)
        d.rectangle((0, 36, 16, 126), fill=YEL)
        d.text((48, 62), BAR_LABEL, font=font("black", 24), fill=YEL, anchor="lm")
        d.text((48, 100), chapter_title, font=ft, fill=BG, anchor="lm")
        _spec_chips(d, chips or [])
        paste(canvas, lay, (-int(60 * (1 - a)), 0), a)
        return
    lab_label(d, (MARGIN, 40), label or (f"POINT {chapter_no:02d}" if THEME.get("bar") == "chips" else f"CHAPTER {chapter_no:02d}"), ACCENT, 20)
    d.text((MARGIN, 82), chapter_title, font=font("black", 44), fill=TEXT, anchor="lm")
    if THEME.get("bar") == "chips":
        _spec_chips(d, chips or [])
        paste(canvas, lay, (0, 0), a)
        return
    # 年表
    cx = year_x(year)
    d.line((TL_X0, TL_Y, cx, TL_Y), fill=PAST, width=3)
    d.line((cx, TL_Y, TL_X1, TL_Y), fill=FUTURE, width=3)
    for y in range(YEARS[0], YEARS[1] + 1):
        x = year_x(y)
        h = 7 if y % 2 == 0 else 4
        d.line((x, TL_Y - h, x, TL_Y + h), fill=PAST if y < year else FUTURE, width=2)
    fs = font("medium", 22)
    d.text((TL_X0, TL_Y + 32), str(YEARS[0]), font=fs, fill=PAST, anchor="lm")
    d.text((TL_X1, TL_Y + 32), str(YEARS[1]), font=fs, fill=FUTURE, anchor="rm")
    for my in milestones:
        if my < year:
            x = year_x(my)
            d.ellipse((x - 4, TL_Y - 4, x + 4, TL_Y + 4), fill=PAST)
    if era:   # 章が扱う期間
        d.line((year_x(era[0]), TL_Y, year_x(era[1]), TL_Y), fill=ACCENT, width=5)
    d.ellipse((cx - 11, TL_Y - 11, cx + 11, TL_Y + 11), fill=KEY, outline=BG, width=3)
    d.text((cx, TL_Y - 34), f"{int(year + 1e-6)}", font=font("black", 34), fill=KEY, anchor="mm")
    paste(canvas, lay, (0, 0), a)


def _spec_chips(d, chips):
    """上部右：機種名と、確率・突入・継続などの札（右寄せ）。key の札は金"""
    x = W - MARGIN
    y0, h = 46, 54
    for c in reversed(chips):
        f1, f2 = font("medium", 20), font("black", 30)
        w = int(max(text_w(c.get("k", ""), f1), text_w(c["v"], f2)) + 40)
        col = KEY if c.get("key") else ACCENT
        if THEME.get("paper"):
            d.rectangle((x - w + 7, y0 + 7, x + 7, y0 + h + 21), fill=INK)
            d.rectangle((x - w, y0, x, y0 + h + 14), fill=YEL if c.get("key") else PANEL, outline=INK, width=4)
            d.text((x - w / 2, y0 + 18), c.get("k", ""), font=f1, fill=SUB if not c.get("key") else INK, anchor="mm")
            d.text((x - w / 2, y0 + 48), c["v"], font=f2, fill=INK, anchor="mm")
            x -= w + 20
            continue
        d.rounded_rectangle((x - w, y0, x, y0 + h + 14), 10, fill=(PANEL[0], PANEL[1], PANEL[2], 230), outline=col, width=2)
        d.text((x - w / 2, y0 + 18), c.get("k", ""), font=f1, fill=SUB, anchor="mm")
        d.text((x - w / 2, y0 + 48), c["v"], font=f2, fill=KEY if c.get("key") else TEXT, anchor="mm")
        x -= w + 14


# ---------------------------------------------------------------- F チャプター
def chapter_card(canvas, tl, dur, data):
    """年とタイトルがほぼ同時に立ち上がる。CHAPTER番号は小さく添えるだけ"""
    out = 1 - ease_in_out(prog(tl, dur - 0.4, 0.4))
    if out <= 0:
        return
    if THEME.get("chapter") == "band":
        return _chapter_band(canvas, tl, dur, data, out)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    cy = H / 2 - 30
    st = {k: ease_out(prog(tl, s, 0.45)) for k, s in (("year", 0.0), ("title", 0.15), ("no", 0.3), ("rule", 0.3))}
    tmp = Image.new("RGBA", (W, 180), (0, 0, 0, 0))
    accent = {"blue": (130, 170, 235, 255), "goldred": (255, 96, 64, 255)}.get(data.get("grade"), KEY)   # 章の色味に合わせる
    ImageDraw.Draw(tmp).text((W / 2, 90), data["year"], font=font("black", 140), fill=accent, anchor="mm")
    paste(lay, tmp, (0, cy - 250 + 20 * (1 - st["year"])), st["year"])
    tmp = Image.new("RGBA", (W, 190), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((W / 2, 95), data["title"], font=font("black", 140), fill=TEXT, anchor="mm")
    paste(lay, tmp, (0, cy - 50 + 24 * (1 - st["title"])), st["title"])
    rw = 420 * st["rule"]
    d.line((W / 2 - rw / 2, cy + 175, W / 2 + rw / 2, cy + 175), fill=PANEL_LINE, width=2)
    tmp = Image.new("RGBA", (W, 50), (0, 0, 0, 0))
    lab_label(ImageDraw.Draw(tmp), (W / 2, 25), data.get("label") or f"CHAPTER {data['no']:02d}", SUB, 24, anchor="mm")
    paste(lay, tmp, (0, cy + 195), st["no"])
    paste(canvas, lay, (0, 0), out)


def _chapter_band(canvas, tl, dur, data, out):
    """新台解説の章カード：斜めの赤い帯が横切り、その上にタイトル。左に大きなPOINT番号、上に要の数字（金）"""
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rectangle((0, 0, W, H), fill=(BG[0], BG[1], BG[2], int(150 * ease_out(prog(tl, 0, 0.3)))))
    kb = ease_out(prog(tl, 0.0, 0.45))
    cy = H / 2 + 10
    band = Image.new("RGBA", (W + 400, 230), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bc = hexc(THEME["band"]) if THEME.get("band") else ACCENT
    bd.rectangle((0, 0, W + 400, 230), fill=(bc[0], bc[1], bc[2], 235 if not THEME.get("paper") else 255))
    stripe = INK if THEME.get("paper") else KEY
    bd.rectangle((0, 0, W + 400, 8 if not THEME.get("paper") else 12), fill=stripe)
    bd.rectangle((0, 222 if not THEME.get("paper") else 218, W + 400, 230), fill=stripe)
    band = band.rotate(-4, resample=Image.BICUBIC, expand=True)
    bx = -200 - (W + 400) * (1 - kb)
    paste(lay, band, (bx, cy - band.height / 2), 1.0)
    kt = ease_out(prog(tl, 0.2, 0.4))
    no = Image.new("RGBA", (420, 300), (0, 0, 0, 0))
    nd = ImageDraw.Draw(no)
    nd.text((210, 70), POINT_LABEL, font=font("black", 44), fill=TEXT, anchor="mm")
    nd.text((210, 185), f"{data['no']:02d}", font=font("black", 190), fill=TEXT, anchor="mm", stroke_width=6, stroke_fill=BG)
    paste(lay, no, (120, cy - 165 + 20 * (1 - kt)), kt)
    tt = Image.new("RGBA", (1300, 200), (0, 0, 0, 0))
    td = ImageDraw.Draw(tt)
    ft = font("black", 120 if text_w(data["title"], font("black", 120)) < 1260 else 92)
    td.text((20, 100), data["title"], font=ft, fill=TEXT, anchor="lm", stroke_width=5,
            stroke_fill=(YEL if THEME.get("paper") else (BG[0], BG[1], BG[2], 255)))
    paste(lay, tt, (560 + 40 * (1 - kt), cy - 100), kt)
    ky = ease_out(prog(tl, 0.35, 0.4))
    if data.get("year"):
        yt = Image.new("RGBA", (1300, 120), (0, 0, 0, 0))
        ImageDraw.Draw(yt).text((20, 60), data["year"], font=font("black", 84), fill=KEY, anchor="lm",
                                stroke_width=8 if THEME.get("paper") else 5, stroke_fill=(BG[0], BG[1], BG[2], 255))
        paste(lay, yt, (580, cy - 250 + 16 * (1 - ky)), ky)
    paste(canvas, lay, (0, 0), out)


# ---------------------------------------------------------------- A 機種紹介カード
MACHINE_ZOOM = 0.06            # 表示中にゆっくり寄る量（1.00 → 1.06）
MACHINE_PAN = (0.5, 0.40)      # 寄っていく先（画像内の比率。既定は盤面〜液晶のあたり）
MACHINE_MOVE = (0.3, 8.0)      # 寄り始め・寄り終わるまでの秒数。そのあとは止める（静止中は描画を使い回せる）


_FIT_CACHE = {}


def _machine_fit(image, iw, ih):
    """実機画像を枠に収まる最大サイズへ（小さい画像は拡大。縦横比はそのまま）"""
    key = (id(image), iw, ih)
    if key not in _FIT_CACHE:
        _FIT_CACHE[key] = (image, _fit(image, iw, ih))   # image も持って id の使い回しを防ぐ
    return _FIT_CACHE[key][1]


def _drop_white_bg(image, tol=28):
    """四隅が白い画像（白背景の実機写真）だけ、隅からつながった白い背景を透明にする。台の中の白は残す"""
    rgb = np.asarray(image.convert("RGB")).astype(np.int16)
    h, w = rgb.shape[:2]
    near = (255 - rgb).max(axis=2) <= tol
    corners = [near[0, 0], near[0, w - 1], near[h - 1, 0], near[h - 1, w - 1]]
    if sum(corners) < 3:
        return image
    from scipy import ndimage
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = np.asarray(image.convert("RGBA"))[..., 3].copy()
    soft = ndimage.gaussian_filter(bg.astype(np.float32), 0.8)   # 輪郭のギザギザを少しなじませる
    alpha = (alpha * (1 - soft)).clip(0, 255).astype(np.uint8)
    out = image.convert("RGBA"); out.putalpha(Image.fromarray(alpha))
    return out


def _fit(image, iw, ih):
    image = _drop_white_bg(image)
    bb = image.convert("RGBA").getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb and (bb[2] - bb[0]) * (bb[3] - bb[1]) < image.width * image.height * 0.9:
        image = image.crop(bb)            # 透明な余白（公式画像の上半分など）を切り落としてから枠に合わせる
    k = min(iw / image.width, ih / image.height)
    fw, fh = max(1, round(image.width * k)), max(1, round(image.height * k))
    out = image.convert("RGBA").resize((fw, fh), Image.LANCZOS)
    if k > 1.2:   # 拡大したぶんの甘さを少しだけ締める
        out = out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
    return out


def _machine_photo(image, iw, ih, tl, dur, pan=None):
    """枠（iw×ih）の中央に実機を置き、枠の中だけでゆっくりズーム＆パン（はみ出さない）"""
    base = _machine_fit(image, iw, ih)
    fw, fh = base.size
    p = ease_in_out(prog(tl, MACHINE_MOVE[0], min(MACHINE_MOVE[1], max((dur or 0) - 1.0, 0.5))))
    z = 1 + MACHINE_ZOOM * p
    px, py = pan or MACHINE_PAN
    cx = fw / 2 + (px * fw - fw / 2) * p
    cy = fh / 2 + (py * fh - fh / 2) * p
    vw, vh = fw / z, fh / z
    x0 = min(max(cx - vw / 2, 0), fw - vw)
    y0 = min(max(cy - vh / 2, 0), fh - vh)
    frame = base.transform((fw, fh), Image.AFFINE, (1 / z, 0, x0, 0, 1 / z, y0), Image.BICUBIC)
    box = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    box.alpha_composite(frame, ((iw - fw) // 2, (ih - fh) // 2))
    return box


def machine_card(canvas, tl, dur, data, image=None):
    """左：実機（無ければ差し替え用の仮パネル）／右：スペック。行は順番に出る"""
    a_in = ease_out(prog(tl, 0, 0.45))
    a_out = 1 - ease_in_out(prog(tl, dur - 0.4, 0.4))
    a = min(a_in, a_out)
    if a <= 0:
        return
    # 実機
    iw, ih = 520, 640
    ix, iy = 250, 170
    box = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    bd = ImageDraw.Draw(box)
    if image is not None:
        box.alpha_composite(_machine_photo(image, iw, ih, tl, dur, data.get("pan")), (0, 0))
    else:
        bd.rounded_rectangle((0, 0, iw - 1, ih - 1), RADIUS, fill=PANEL)
        for k in range(0, iw + ih, 28):   # 斜線＝「ここは仮」の目印
            bd.line((k, 0, k - ih, ih), fill=(255, 255, 255, 10), width=2)
        bd.rounded_rectangle((0, 0, iw - 1, ih - 1), RADIUS, outline=PANEL_LINE, width=LINE_W)
        bd.text((iw / 2, ih / 2 - 30), "実機画像", font=font("bold", 40), fill=SUB, anchor="mm")
        bd.text((iw / 2, ih / 2 + 26), "許諾確認後に差し替え", font=font("regular", 26), fill=SUB, anchor="mm")
    paste(canvas, box, (ix - 50 * (1 - a_in), iy), a)

    # スペック
    cx, cy, cw = 840, 170, 860
    rows = data["rows"]
    rh = 92
    ch = 165 + rh * len(rows) + 30
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((0, 0, cw - 1, ch - 1), RADIUS, fill=PANEL)
    cd.rectangle((0, 24, 6, ch - 24), fill=ACCENT)
    corner_ticks(cd, (10, 10, cw - 11, ch - 11), ACCENT)
    lab_label(cd, (44, 34), data.get("tag", "DATA LOG"), ACCENT, 18)
    fsz = 56
    while fsz > 34 and text_w(data["name"], font("black", fsz)) > cw - 100:
        fsz -= 4
    cd.text((44, 78), data["name"], font=font("black", fsz), fill=TEXT, anchor="lm")
    cd.text((46, 126), data.get("sub", ""), font=font("medium", 30), fill=SUB, anchor="lm")
    for i, r in enumerate(rows):
        ra = ease_out(prog(tl, 0.45 + 0.28 * i, 0.35))
        if ra <= 0:
            continue
        y = 165 + rh * i
        row = Image.new("RGBA", (cw, rh), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        rd.line((44, 0, cw - 44, 0), fill=PANEL_LINE, width=2)
        rd.text((44, rh / 2), r["k"], font=font("medium", 32), fill=SUB, anchor="lm")
        v = r["v"]
        if r.get("count") is not None:   # 数字のカウントアップ
            n = r["count"] * ease_out(prog(tl, 0.45 + 0.28 * i, 0.9))
            v = r["v"].replace(str(r["count"]), str(int(round(n))))
        hl = r.get("key")
        rd.text((cw - 44, rh / 2), v, font=font("black", 60 if hl else 40), fill=KEY if hl else TEXT, anchor="rm")
        card.alpha_composite(fade(row, ra), (0, y + int(10 * (1 - ra))))
    paste(canvas, card, (cx + 60 * (1 - a_in), cy), a)



# ---------------------------------------------------------------- D ナギ解析
TANK = (235, 350, 62)   # ナギ素材上の脳タンク中心と半径（generator/assets/characters/v2/nagi/normal.png）


@lru_cache(maxsize=4)
def _glow(r):
    s = int(r * 4)
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32) - s / 2
    a = np.clip(1 - np.sqrt(xx ** 2 + yy ** 2) / (s / 2), 0, 1) ** 2.2
    g = np.zeros((s, s, 4), np.uint8)
    g[..., :3] = NAGI[:3]
    g[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(g, "RGBA")


def tank_glow(canvas, center, r, k):
    if k <= 0:
        return
    g = _glow(int(r))
    paste(canvas, g, (center[0] - g.width / 2, center[1] - g.height / 2), 0.5 * k)


TYPE_START, TYPE_SEC = 1.2, 0.045   # 解析パネルの見出しを打ち始める時刻と1文字の間隔


def analysis(canvas, tl, dur, data, tank):
    """研究施設の端末のように静かに。タンクの光は最初の一瞬だけ→解析ライン→パネル展開→数字が主役"""
    T_OUT = 0.9
    t_close = dur - T_OUT
    flash = math.sin(math.pi * prog(tl, 0, 0.7))          # 0→1→0 の一瞬だけ
    tank_glow(canvas, tank, TANK[2] * 1.1, flash)

    px0, py0, px1, py1 = 470, 160, 1500, 820
    path = [(tank[0], tank[1] - 40), (tank[0], py1 - 70), (px0, py1 - 70)]
    seg_len = [math.dist(path[i], path[i + 1]) for i in range(len(path) - 1)]
    total = sum(seg_len)
    k_line = ease_in_out(prog(tl, 0.3, 0.55)) * (1 - ease_in_out(prog(tl, t_close + 0.45, 0.4)))
    if k_line > 0:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        rem = total * k_line
        pts = [path[0]]
        for i, L in enumerate(seg_len):
            if rem >= L:
                pts.append(path[i + 1]); rem -= L
            else:
                (x0, y0), (x1, y1) = path[i], path[i + 1]
                pts.append((x0 + (x1 - x0) * rem / L, y0 + (y1 - y0) * rem / L)); break
        d.line(pts, fill=NAGI, width=2, joint="curve")
        ex, ey = pts[-1]
        d.rectangle((ex - 4, ey - 4, ex + 4, ey + 4), fill=NAGI)
        canvas.alpha_composite(lay)

    k_open = ease_out(prog(tl, 0.8, 0.5)) * (1 - ease_in_out(prog(tl, t_close, 0.45)))
    if k_open <= 0:
        return
    pw, ph = px1 - px0, py1 - py0
    panel = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 246), outline=PANEL_LINE, width=LINE_W)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), ACCENT)
    k_c = ease_out(prog(tl, 1.2, 0.4)) * (1 - ease_in_out(prog(tl, t_close - 0.3, 0.3)))
    if k_c > 0:
        c = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        cd = ImageDraw.Draw(c)
        # 見出し：何を比べているか
        lab_label(cd, (48, 52), data.get("tag", "NAGI ANALYSIS"), ACCENT, 20)
        head = data["heading"]
        if THEME.get("paper"):   # 号外：見出しを端末のように1文字ずつ打つ（音は episode.py が TYPE_SEC 間隔で付ける）
            n = int(max(0.0, tl - TYPE_START) / TYPE_SEC)
            shown = head[:n]
            cd.text((48, 104), shown, font=font("black", 58), fill=TEXT, anchor="lm")
            if n < len(head) or int(tl * 4) % 2 == 0 and tl < TYPE_START + TYPE_SEC * len(head) + 0.8:
                cx = 48 + text_w(shown, font("black", 58)) + 8
                cd.rectangle((cx, 78, cx + 26, 130), fill=NAGI)
        else:
            cd.text((48, 104), head, font=font("black", 58), fill=TEXT, anchor="lm")
        cd.line((48, 150, pw - 48, 150), fill=PANEL_LINE, width=2)
        # 数字が主役の2列
        bars = data["bars"]
        n = len(bars)
        colw = (pw - 96) / n
        for i, b in enumerate(bars):
            x0 = 48 + colw * i
            kb = ease_out(prog(tl, 1.45 + 0.35 * i, 0.9))
            col = KEY if b.get("key") else TEXT
            if i:
                cd.line((x0 - 1, 190, x0 - 1, 470), fill=PANEL_LINE, width=2)
            xl = x0 + (36 if i else 0)
            cd.text((xl, 200), b["k"], font=font("bold", 36), fill=TEXT if b.get("key") else SUB, anchor="lm")
            v = int(round(b["value"] * kb))
            fbig = font("black", 166)
            num = f"{v}%"
            y_num = 330
            x = xl
            if b.get("prefix"):
                fp = font("black", 64)
                cd.text((x, y_num + 40), b["prefix"], font=fp, fill=col, anchor="ls")
                x += cd.textlength(b["prefix"], font=fp) + 6
            cd.text((x, y_num + 40), num, font=fbig, fill=col, anchor="ls")
            # 細いバー（数字の補助）
            bw = colw - 84
            yb = 420
            cd.rectangle((xl, yb, xl + bw, yb + 8), fill=PANEL_LINE)
            cd.rectangle((xl, yb, xl + bw * b["value"] / 100 * kb, yb + 8), fill=col)
            if b.get("sub"):
                cd.text((xl, yb + 44), b["sub"], font=font("medium", 30), fill=SUB, anchor="lm")
        # 注記：1〜2行・短く
        kn = ease_out(prog(tl, 2.5, 0.5))
        if kn > 0 and data.get("note"):
            nd = Image.new("RGBA", (pw, 120), (0, 0, 0, 0))
            ndd = ImageDraw.Draw(nd)
            ndd.line((48, 6, pw - 48, 6), fill=PANEL_LINE, width=2)
            for j, line in enumerate(data["note"][:2]):
                ndd.text((48, 46 + 46 * j), line, font=font("bold" if j == 0 else "medium", 34), fill=TEXT if j == 0 else SUB, anchor="lm")
            c.alpha_composite(fade(nd, kn), (0, ph - 130))
        panel.alpha_composite(fade(c, k_c))
    vis_w = max(2, int(pw * min(1, k_open * 1.25)))
    vis_h = max(2, int(ph * k_open))
    crop = panel.crop((0, ph - vis_h, vis_w, ph))
    paste(canvas, crop, (px0, py0 + ph - vis_h), min(1, k_open * 1.4))


# ---------------------------------------------------------------- B 歴史タイムライン
def timeline(canvas, tl, dur, data):
    """横方向の年表。目盛り→出来事が左から順に立ち上がる。range は小数の年（2016.25=2016年4月頃）。
    章全体（2008–2026）にも、数か月の拡大表示にも同じ部品を使う。"""
    a = life(tl, dur, 0.4, 0.4)
    if a <= 0:
        return
    x0, x1, y = 260, W - 260, data.get("y", 545)
    r0, r1 = data["range"]
    X = lambda v: x0 + (x1 - x0) * (v - r0) / (r1 - r0)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    k_axis = ease_in_out(prog(tl, 0.0, 0.7))
    d.line((x0, y, x0 + (x1 - x0) * k_axis, y), fill=PANEL_LINE, width=4)
    for tk in data.get("ticks", []):
        x = X(tk["v"])
        if x <= x0 + (x1 - x0) * k_axis:
            d.line((x, y - 10, x, y + 10), fill=PANEL_LINE, width=3)
            d.text((x, y + 40), tk["label"], font=font("medium", 26), fill=SUB, anchor="mm")
    for i, ev in enumerate(data["events"]):
        ke = ease_out(prog(tl, 0.6 + 0.6 * i, 0.5))
        if ke <= 0:
            continue
        x = X(ev["v"])
        col = KEY if ev.get("key") else ACCENT
        latest = all(prog(tl, 0.6 + 0.6 * j, 0.01) < 1 for j in range(i + 1, len(data["events"])))
        # 今説明している出来事だけ強く。過去は箱を残したまま色だけ落とす
        tcol = TEXT if latest else SUB
        if not latest:
            col = PAST
        up = i % 2 == 0
        stem = 120 * ke
        e = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ed = ImageDraw.Draw(e)
        ed.line((x, y, x, y - stem if up else y + stem), fill=col, width=3)
        ed.ellipse((x - 11, y - 11, x + 11, y + 11), fill=col, outline=BG, width=4)
        ty = y - 120 - 110 if up else y + 120 + 20
        bw = max(text_w(ev["label"], font("black", 44)), text_w(ev.get("sub", ""), font("medium", 28))) + 56
        bx = min(max(x - bw / 2, MARGIN), W - MARGIN - bw)
        ed.rounded_rectangle((bx, ty - 10, bx + bw, ty + 100), RADIUS, fill=PANEL, outline=col, width=2)
        ed.text((bx + bw / 2, ty + 28), ev["label"], font=font("black", 44), fill=tcol, anchor="mm")
        ed.text((bx + bw / 2, ty + 74), ev.get("sub", ""), font=font("medium", 28), fill=col, anchor="mm")
        lay.alpha_composite(fade(e, ke))
    if data.get("caption"):
        kc = ease_out(prog(tl, 0.6 + 0.6 * len(data["events"]), 0.5))
        c = Image.new("RGBA", (W, 120), (0, 0, 0, 0))
        cdr = ImageDraw.Draw(c)
        lab_label(cdr, (W / 2, 22), data.get("tag", "LAB RECORD"), ACCENT, 20, anchor="mm")
        cdr.text((W / 2, 76), data["caption"], font=font("black", 50), fill=TEXT, anchor="mm")
        lay.alpha_composite(fade(c, kc), (0, data.get("caption_y", 140)))
    paste(canvas, lay, (0, 0), a)



# ---------------------------------------------------------------- E バクのツッコミ
def tsukkomi_lines(canvas, tl, center):
    """簡素化：演出は字幕の橙アクセントと軽い拡大（emphasis）だけ。ここでは何も足さない"""
    return



# ---------------------------------------------------------------- G キーワード（章の要点を1語で）
def keyword(canvas, tl, dur, data):
    a = life(tl, dur, 0.45, 0.35)
    if a <= 0:
        return
    lines = data["word"].split("\n")
    fw = font("black", 96 if max(len(l) for l in lines) <= 12 else 80)
    fs = font("medium", 36)
    tw = max([text_w(l, fw) for l in lines] + [text_w(data.get("sub", ""), fs)])
    pw = int(min(1500, max(900, tw + 160)))
    lh = int(fw.size * 1.22)
    ph = 120 + lh * len(lines) + (80 if data.get("sub") else 20)
    panel = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 240), outline=PANEL_LINE, width=LINE_W)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), ACCENT)
    lab_label(d, (pw / 2, 52), data.get("tag", "LAB RECORD"), ACCENT, 20, anchor="mm")
    for i, l in enumerate(lines):
        rich(d, (pw / 2, 100 + lh * i + lh / 2), l, fw, TEXT, KEY)
    if data.get("sub"):
        y = 100 + lh * len(lines) + 20
        d.line((pw / 2 - 160, y, pw / 2 + 160, y), fill=PANEL_LINE, width=2)
        d.text((pw / 2, y + 42), data["sub"], font=fs, fill=SUB, anchor="mm")
    y0 = 170 + (560 - ph) / 2
    paste(canvas, panel, ((W - pw) / 2, y0 + 18 * (1 - a)), a)


# ---------------------------------------------------------------- H フロー（仕組みを順番に）
def flow(canvas, tl, dur, data):
    """手順を左→右へ1つずつ。いま出た段だけ枠を強調し、前の段は色を落とす"""
    a = life(tl, dur, 0.4, 0.35)
    if a <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lab_label(d, (W / 2, 210), data.get("tag", "LAB RECORD"), ACCENT, 20, anchor="mm")
    d.text((W / 2, 268), data["heading"], font=font("black", 58), fill=TEXT, anchor="mm")
    steps = data["steps"]
    n = len(steps)
    gap = 70
    bw = min(440, (W - 2 * 200 - gap * (n - 1)) / n)
    total = bw * n + gap * (n - 1)
    x0 = (W - total) / 2
    y0, bh = 380, 230
    shown = [prog(tl, 0.35 + 0.45 * i, 0.35) for i in range(n)]
    last = max([i for i in range(n) if shown[i] > 0], default=-1)
    for i, st in enumerate(steps):
        k = ease_out(shown[i])
        if k <= 0:
            continue
        x = x0 + (bw + gap) * i
        col = KEY if st.get("key") else ACCENT
        cur = i == last
        box = Image.new("RGBA", (int(bw), bh), (0, 0, 0, 0))
        bd = ImageDraw.Draw(box)
        bd.rounded_rectangle((0, 0, bw - 1, bh - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 245),
                             outline=col if (cur or st.get("key")) else PANEL_LINE, width=3 if cur else 2)
        lab_label(bd, (28, 36), f"STEP {i + 1:02d}", col if cur else SUB, 18)
        ft = font("black", 44 if text_w(st["t"], font("black", 44)) < bw - 40 else 36)
        bd.text((bw / 2, bh / 2 + 6), st["t"], font=ft, fill=TEXT if (cur or st.get("key")) else SUB, anchor="mm")
        if st.get("s"):
            bd.text((bw / 2, bh - 46), st["s"], font=font("medium", 28), fill=SUB, anchor="mm")
        lay.alpha_composite(fade(box, k), (int(x), int(y0 + 14 * (1 - k))))
        if i < n - 1 and shown[i + 1] > 0:
            ka = ease_out(shown[i + 1])
            ax0, ax1, ay = x + bw + 12, x + bw + 12 + (gap - 24) * ka, y0 + bh / 2
            d.line((ax0, ay, ax1, ay), fill=ACCENT, width=3)
            d.line((ax1 - 10, ay - 9, ax1, ay, ax1 - 10, ay + 9), fill=ACCENT, width=3)
    paste(canvas, lay, (0, 0), a)


# ---------------------------------------------------------------- I ラインナップ（機種を並べて振り返る）
def lineup(canvas, tl, dur, data):
    """カードを順に並べる。fast=True は時代をさかのぼる早送り（今のカードだけ明るい）"""
    a = life(tl, dur, 0.35, 0.35)
    if a <= 0:
        return
    items = data["items"]
    n = len(items)
    rows = [items] if n <= 4 else [items[:4], items[4:]]
    cw, ch, gx, gy = 380, 210, 34, 34
    step = 0.32 if data.get("fast") else 0.55
    total_h = ch * len(rows) + gy * (len(rows) - 1)
    y_top = 190 + (600 - total_h) / 2
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lab_label(d, (W / 2, y_top - 36), data.get("tag", "LAB RECORD"), ACCENT, 20, anchor="mm")
    idx = 0
    appeared = [prog(tl, 0.3 + step * i, 0.3) for i in range(n)]
    newest = max([i for i in range(n) if appeared[i] > 0], default=-1)
    for r, row in enumerate(rows):
        x0 = (W - (cw * len(row) + gx * (len(row) - 1))) / 2
        for j, it in enumerate(row):
            k = ease_out(appeared[idx])
            if k > 0:
                cur = idx == newest
                hot = cur or (it.get("key") and not data.get("fast"))
                col = KEY if it.get("key") else ACCENT
                c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
                cd = ImageDraw.Draw(c)
                cd.rounded_rectangle((0, 0, cw - 1, ch - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 245),
                                     outline=col if hot else PANEL_LINE, width=3 if hot else 2)
                cd.text((30, 44), it["y"], font=font("black", 34), fill=KEY if hot else SUB, anchor="lm")
                fn = font("black", 46 if text_w(it["name"], font("black", 46)) < cw - 60 else 36)
                cd.text((30, 112), it["name"], font=fn, fill=TEXT if hot or not data.get("fast") else SUB, anchor="lm")
                cd.text((30, 168), it["f"], font=font("medium", 30), fill=col if hot else SUB, anchor="lm")
                lay.alpha_composite(fade(c, k if (hot or not data.get("fast")) else k * 0.55),
                                    (int(x0 + (cw + gx) * j), int(y_top + (ch + gy) * r + 12 * (1 - k))))
            idx += 1
    paste(canvas, lay, (0, 0), a)


# ---------------------------------------------------------------- K 円グラフ＋表（振り分け）
PIE_COLORS = [hexc("#64BFFF"), hexc("#F28C38"), hexc("#8E7CFF"), hexc("#4FD1A5"), hexc("#E8607A"), hexc("#7FA3C8")]


PIE_COLORS_GOG = [hexc("#2F7FE0"), hexc("#FFD21F"), hexc("#F07A12"), hexc("#1AA38A"), hexc("#E2343B"), hexc("#B9B3A3")]
PIE_COLORS_NEW = [hexc("#FF5D6C"), hexc("#4FC3F7"), hexc("#B57CFF"), hexc("#FF9F43"), hexc("#7ED6A0"), hexc("#C9A9B2")]


def _pie_color(i, s):
    if s.get("c"):
        return hexc(s["c"])
    pal = PIE_COLORS_GOG if THEME.get("paper") else PIE_COLORS_NEW if THEME.get("name") == "newmachine" else PIE_COLORS
    return KEY if s.get("key") else pal[i % len(pal)]


def _mix(c, to, k):
    return tuple(int(c[j] + (to[j] - c[j]) * k) for j in range(3)) + (255,)


def pie(canvas, tl, dur, data, hl=None):
    """振り分けを、左のドーナツグラフと右の表で見せる。
    data: heading, tag, center（グラフ中央の文字）, center_sub, slices[{k, s, v, label, key, c}], note
    hl: (今の注目項目, 前の注目項目, 切り替えの進み)。台本の @hl。注目項目は飛び出して大きく、ほかは控えめにする"""
    a = life(tl, dur, 0.4, 0.35)
    if a <= 0:
        return
    sl = data["slices"]
    n = len(sl)
    total = sum(s["v"] for s in sl) or 1
    foc = [0.0] * n
    act = 0.0
    if hl:
        cur, prev, k = hl
        if cur is not None:
            foc[cur] += k; act += k
        if prev is not None:
            foc[prev] += 1 - k; act += 1 - k
        act = min(1.0, act)
    dimk = [0.62 * act * (1 - f) for f in foc]       # 注目していない項目をどれだけ控えめにするか
    pw, ph = 1560, 640
    panel = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 242), outline=PANEL_LINE, width=LINE_W)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), ACCENT)
    lab_label(d, (48, 50), data.get("tag", "DATA LOG"), ACCENT, 20)
    d.text((48, 100), data["heading"], font=font("black", 54), fill=TEXT, anchor="lm")
    d.line((48, 144, pw - 48, 144), fill=PANEL_LINE, width=2)
    # 左：ドーナツ（2倍で描いて縮めて滑らかに）
    R, cx, cy = 236, 300, 160 + (ph - 160) / 2 - 4
    sweep = ease_in_out(prog(tl, 0.35, 0.9))
    S = 2
    POP = 22                                          # 注目した区画が外へ飛び出す量（px）
    G = 2 * (R + POP + 8) * S
    g = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    c0 = G / 2
    box = (c0 - R * S, c0 - R * S, c0 + R * S, c0 + R * S)
    gd.ellipse(box, fill=PANEL_LINE)
    hole = int(R * 0.42 * S)
    spans, ang = [], -90.0
    for s_ in sl:
        sp = 360.0 * s_["v"] / total
        spans.append((ang, sp)); ang += sp
    for i, s_ in enumerate(sl):
        a0, sp = spans[i]
        e = min(a0 + sp, -90.0 + 360.0 * sweep)
        if e > a0 and foc[i] < 0.5:
            gd.pieslice(box, a0, e, fill=_mix(_pie_color(i, s_), PANEL, dimk[i]))
    for a0, sp in spans:                              # 切れ目の細い線
        rad = math.radians(a0)
        gd.line((c0, c0, c0 + math.cos(rad) * R * S, c0 + math.sin(rad) * R * S), fill=PANEL, width=4)
    gd.ellipse((c0 - hole, c0 - hole, c0 + hole, c0 + hole), fill=PANEL)
    for i, s_ in enumerate(sl):                       # 注目の区画：外へずらして少し大きく、上に重ねる
        if foc[i] < 0.5:
            continue
        a0, sp = spans[i]
        e = min(a0 + sp, -90.0 + 360.0 * sweep)
        if e <= a0:
            continue
        mid = math.radians(a0 + sp / 2)
        off = POP * S * foc[i]
        ox, oy = math.cos(mid) * off, math.sin(mid) * off
        rr = (R + 10 * foc[i]) * S
        layer = Image.new("RGBA", (G, G), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.pieslice((c0 + ox - rr, c0 + oy - rr, c0 + ox + rr, c0 + oy + rr), a0, e, fill=_pie_color(i, s_),
                    outline=INK if THEME.get("paper") else (255, 255, 255, 255), width=(5 if THEME.get("paper") else 3) * S)
        ld.ellipse((c0 + ox - hole, c0 + oy - hole, c0 + ox + hole, c0 + oy + hole), fill=(0, 0, 0, 0))
        g.alpha_composite(layer)
    g = g.resize((G // S, G // S), Image.LANCZOS)
    gx, gy = int(cx - G / S / 2), int(cy - G / S / 2)
    panel.alpha_composite(fade(g, ease_out(prog(tl, 0.2, 0.4))), (gx, gy))
    # グラフの中の文字：広い区画は「名前＋割合」、中くらいは割合だけ、細い区画は表に任せる。注目の区画は大きく
    kt = ease_out(prog(tl, 1.15, 0.4))
    if kt > 0:
        dark = INK if THEME.get("paper") else (16, 24, 39, 255)
        onc = (255, 255, 255, 255) if THEME.get("paper") else TEXT
        kc = YEL if THEME.get("paper") else KEY
        for i, s_ in enumerate(sl):
            a0, sp = spans[i]
            rm = R * 0.71
            arc = math.radians(sp) * rm
            mid = math.radians(a0 + sp / 2)
            off = POP * foc[i]
            px, py = cx + math.cos(mid) * (rm + off), cy + math.sin(mid) * (rm + off)
            lab = s_.get("label", f"{s_['v']}%")
            big = foc[i] >= 0.5
            tx = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
            td = ImageDraw.Draw(tx)
            if arc >= 150:
                td.text((px, py - (19 if big else 15)), s_.get("in", s_["k"]), font=font("black", 30 if big else 24), fill=onc,
                        anchor="mm", stroke_width=5, stroke_fill=dark)
                td.text((px, py + (21 if big else 16)), lab, font=font("black", 36 if big else 26), fill=kc if big else onc,
                        anchor="mm", stroke_width=5, stroke_fill=dark)
            elif arc >= 52 or big:
                td.text((px, py), lab.replace("約", ""), font=font("black", 34 if big else (24 if arc < 80 else 28)),
                        fill=kc if big else onc, anchor="mm", stroke_width=5, stroke_fill=dark)
            else:
                continue
            panel.alpha_composite(fade(tx, kt * (1 - dimk[i])))
    kc = ease_out(prog(tl, 0.9, 0.4))
    if kc > 0 and data.get("center"):
        cl = Image.new("RGBA", (2 * hole, 2 * hole), (0, 0, 0, 0))
        cdd = ImageDraw.Draw(cl)
        cdd.text((hole, hole - (16 if data.get("center_sub") else 0)), data["center"], font=font("black", 34), fill=TEXT, anchor="mm")
        if data.get("center_sub"):
            cdd.text((hole, hole + 24), data["center_sub"], font=font("medium", 22), fill=SUB, anchor="mm")
        panel.alpha_composite(fade(cl, kc * (1 - 0.5 * act)), (int(cx - hole), int(cy - hole)))
    # 右：表（色・名前・中身・割合）。行は順に出て、key の行は金色。注目の行は色の帯で目立たせ、ほかは薄く
    tx0, tx1 = 600, pw - 56
    rh = min(84, (ph - 200 - (60 if data.get("note") else 0)) / n)
    ty = 176 + ((ph - 200 - (60 if data.get("note") else 0)) - rh * n) / 2
    fname = font("black", 40 if rh >= 70 else 34)
    fsub = font("medium", 28)
    fval = font("black", 50 if rh >= 70 else 42)
    fval_big = font("black", 60 if rh >= 70 else 52)
    for i, s_ in enumerate(sl):
        k = ease_out(prog(tl, 0.45 + 0.22 * i, 0.35))
        if k <= 0:
            continue
        row = Image.new("RGBA", (tx1 - tx0, int(rh)), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        col = _pie_color(i, s_)
        hot = s_.get("key")
        big = foc[i] >= 0.5
        if big:
            rd.rounded_rectangle((0, 3, tx1 - tx0 - 1, rh - 4), 12, fill=(col[0], col[1], col[2], 70), outline=col, width=3)
        elif hot:
            rd.rounded_rectangle((0, 4, tx1 - tx0 - 1, rh - 5), 10, fill=(KEY[0], KEY[1], KEY[2], 34), outline=KEY, width=2)
        rd.rounded_rectangle((18, rh / 2 - 14, 46, rh / 2 + 14), 6, fill=col)
        rd.text((72, rh / 2), s_["k"], font=fname, fill=TEXT if big else (KEY if hot else TEXT), anchor="lm")
        if s_.get("s"):
            rd.text((72 + text_w(s_["k"], fname) + 22, rh / 2 + 4), s_["s"], font=fsub, fill=TEXT if big else SUB, anchor="lm")
        rd.text((tx1 - tx0 - 24, rh / 2), s_.get("label", f"{s_['v']}%"), font=fval_big if big else fval,
                fill=KEY if (big or hot) else TEXT, anchor="rm")
        if i < n - 1 and not hot and not big and not sl[i + 1].get("key") and foc[i + 1] < 0.5:
            rd.line((18, rh - 1, tx1 - tx0 - 18, rh - 1), fill=PANEL_LINE, width=1)
        panel.alpha_composite(fade(row, k * (1 - dimk[i])), (tx0 + int(16 * (1 - k)), int(ty + rh * i)))
    if data.get("note"):
        kn = ease_out(prog(tl, 0.6 + 0.22 * n, 0.4))
        if kn > 0:
            nl = Image.new("RGBA", (tx1 - tx0, 50), (0, 0, 0, 0))
            ImageDraw.Draw(nl).text((18, 25), data["note"], font=font("medium", 28), fill=SUB, anchor="lm")
            panel.alpha_composite(fade(nl, kn * (1 - 0.5 * act)), (tx0, ph - 74))
    paste(canvas, panel, ((W - pw) / 2, 168 + 14 * (1 - a)), a)


# ---------------------------------------------------------------- L スペック表（読みやすい一覧）
def spec_table(canvas, tl, dur, data):
    """項目・値・補足の3列の表。key の行は金色で強調。data: heading, tag, rows[{k, v, s, key}]"""
    a = life(tl, dur, 0.4, 0.35)
    if a <= 0:
        return
    rows = data["rows"]
    n = len(rows)
    pw = 1400
    rh = 86
    ph = 170 + rh * n + 30
    panel = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 242), outline=PANEL_LINE, width=LINE_W)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), ACCENT)
    lab_label(d, (48, 50), data.get("tag", "DATA LOG"), ACCENT, 20)
    d.text((48, 100), data["heading"], font=font("black", 54), fill=TEXT, anchor="lm")
    d.line((48, 144, pw - 48, 144), fill=PANEL_LINE, width=2)
    c1, c2 = 60, 430
    for i, r in enumerate(rows):
        k = ease_out(prog(tl, 0.35 + 0.2 * i, 0.35))
        if k <= 0:
            continue
        hot = r.get("key")
        row = Image.new("RGBA", (pw - 64, rh), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        if hot:
            rd.rounded_rectangle((0, 6, pw - 65, rh - 7), 10, fill=(KEY[0], KEY[1], KEY[2], 34), outline=KEY, width=2)
        elif i % 2 == 0:
            rd.rounded_rectangle((0, 6, pw - 65, rh - 7), 10, fill=(255, 255, 255, 10))
        rd.text((c1 - 32, rh / 2), r["k"], font=font("bold", 34), fill=KEY if hot else SUB, anchor="lm")
        fv = font("black", 48)
        rd.text((c2 - 32, rh / 2), r["v"], font=fv, fill=KEY if hot else TEXT, anchor="lm")
        if r.get("s"):
            rd.text((pw - 64 - 28, rh / 2 + 2), r["s"], font=font("medium", 30), fill=SUB, anchor="rm")
        panel.alpha_composite(fade(row, k), (32 + int(16 * (1 - k)), int(164 + rh * i)))
    paste(canvas, panel, ((W - pw) / 2, 170 + (600 - ph) / 2 + 14 * (1 - a)), a)


# ---------------------------------------------------------------- J タイトル
def title_card(canvas, tl, dur, data):
    out = 1 - ease_in_out(prog(tl, dur - 0.45, 0.45))
    if out <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    k1, k2, k3 = (ease_out(prog(tl, s, 0.5)) for s in (0.0, 0.2, 0.45))
    lines = data["main"].split("\n")
    tmp = Image.new("RGBA", (W, 60), (0, 0, 0, 0))
    lab_label(ImageDraw.Draw(tmp), (W / 2, 30), data.get("label", ""), ACCENT, 24, anchor="mm")
    paste(lay, tmp, (0, 250), k1)
    for i, l in enumerate(lines):
        tmp = Image.new("RGBA", (W, 160), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((W / 2, 80), l, font=font("black", 124), fill=TEXT if i else KEY, anchor="mm")
        paste(lay, tmp, (0, 330 + 150 * i + 20 * (1 - k2)), k2)
    d.line((W / 2 - 240, 660, W / 2 + 240, 660), fill=PANEL_LINE, width=2)
    tmp = Image.new("RGBA", (W, 70), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((W / 2, 35), data.get("sub", ""), font=font("medium", 42), fill=SUB, anchor="mm")
    paste(lay, tmp, (0, 690), k3)
    paste(canvas, lay, (0, 0), out)


@lru_cache(maxsize=8)
def load_logo(name):
    return Image.open(ASSETS / "logos" / name).convert("RGBA")


def logo_card(canvas, tl, dur, data):
    """番組ロゴ（generator/assets/logos/）を全画面で。ポンと弾んで出て、ゆっくり寄る"""
    out = 1 - ease_in_out(prog(tl, dur - 0.35, 0.35))
    if out <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lay).rectangle((0, 0, W, H), fill=(BG[0], BG[1], BG[2], int(215 * ease_out(prog(tl, 0, 0.3)))))
    logo = load_logo(data["file"])
    k = ease_out_back(prog(tl, 0.05, 0.5), 1.8)
    s = (0.55 + 0.45 * k) * (1 + 0.04 * prog(tl, 0.6, max(0.1, dur - 0.6)))
    base = min(1400 / logo.width, 760 / logo.height)
    im = logo.resize((max(1, int(logo.width * base * s)), max(1, int(logo.height * base * s))), Image.LANCZOS)
    paste(lay, im, ((W - im.width) / 2, (H - im.height) / 2 - 20), min(1.0, prog(tl, 0.05, 0.2)))
    paste(canvas, lay, (0, 0), out)


def intro_card(canvas, tl, dur, data):
    """キャラ紹介（ニュース解説のOP）：左に大きな立ち絵、右に肩書き・名前・ひとことプロフィール"""
    out = 1 - ease_in_out(prog(tl, dur - 0.35, 0.35))
    if out <= 0:
        return
    who = data["who"]
    col = SPEAKER[who]
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    k0, k1, k2, k3 = (ease_out(prog(tl, s, 0.45)) for s in (0.0, 0.12, 0.25, 0.4))
    d.rectangle((0, 0, W, H), fill=(BG[0], BG[1], BG[2], int(200 * k0)))
    ch = load_char(who)
    hh = 900
    ch = ch.resize((int(ch.width * hh / ch.height), hh))
    paste(lay, ch, (int(140 - 80 * (1 - k1)), H - hh - 40), k1)
    x = 980
    tmp = Image.new("RGBA", (900, 70), (0, 0, 0, 0))
    lab_label(ImageDraw.Draw(tmp), (0, 35), data.get("tag", ""), col, 26)
    paste(lay, tmp, (x, 300), k2)
    tmp = Image.new("RGBA", (900, 200), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((0, 100), data["name"], font=font("black", 170), fill=col, anchor="lm")
    paste(lay, tmp, (x + int(40 * (1 - k2)), 360), k2)
    tmp = Image.new("RGBA", (900, 70), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((0, 35), data.get("role", ""), font=font("bold", 46), fill=TEXT, anchor="lm")
    paste(lay, tmp, (x, 570), k3)
    for i, line in enumerate(data.get("profile", [])):
        tmp = Image.new("RGBA", (900, 60), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((0, 30), line, font=font("medium", 38), fill=SUB, anchor="lm")
        paste(lay, tmp, (x, 650 + 58 * i), k3)
    paste(canvas, lay, (0, 0), out)



# ---------------------------------------------------------------- K 対決カード（当たり vs 転落 など）
_VS_COL = {"nagi": "#2F7FE0", "baku": "#F07A12", "red": "#E2343B", "ink": "#16161A"}


def _ink_box(d, box, top=None):
    """号外は墨の影つきの角ばった箱、それ以外はいつものパネル"""
    x0, y0, x1, y1 = box
    if THEME.get("paper"):
        d.rectangle((x0 + 12, y0 + 12, x1 + 12, y1 + 12), fill=INK)
        d.rectangle(box, fill=PANEL, outline=INK, width=LINE_W)
    else:
        d.rounded_rectangle(box, RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 242), outline=PANEL_LINE, width=LINE_W)
    if top is not None:
        d.rectangle((x0 + LINE_W, y0 + LINE_W, x1 - LINE_W, y0 + 20), fill=top)


def versus(canvas, tl, dur, data):
    """2つの確率を左右に並べて『どっちを先に引くか』を見せる。真ん中に VS が弾んで出る"""
    out = 1 - ease_in_out(prog(tl, dur - 0.4, 0.4))
    if out <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    kh = ease_out(prog(tl, 0.0, 0.22))
    if data.get("heading"):
        tmp = Image.new("RGBA", (W, 90), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((W / 2, 45), data["heading"], font=font("black", 56), fill=TEXT, anchor="mm")
        paste(lay, tmp, (0, 178 + 16 * (1 - kh)), kh)
    bw, bh, y = 640, 360, 290
    for i, side in enumerate((data["left"], data["right"])):
        k = ease_out(prog(tl, 0.1 + 0.06 * i, 0.28))
        col = hexc(_VS_COL.get(side.get("c", "ink"), side.get("c", "#16161A")))
        box = Image.new("RGBA", (bw + 20, bh + 20), (0, 0, 0, 0))
        bd = ImageDraw.Draw(box)
        _ink_box(bd, (0, 0, bw - 1, bh - 1), col)
        bd.text((44, 82), side["k"], font=font("black", 46), fill=SUB, anchor="lm")
        fv = font("black", 140)
        while text_w(side["v"], fv) > bw - 80:
            fv = font("black", fv.size - 6)
        bd.text((44, 196), side["v"], font=fv, fill=col, anchor="lm")
        if side.get("s"):
            bd.line((44, 284, bw - 44, 284), fill=PANEL_LINE, width=2)
            bd.text((44, 320), side["s"], font=font("bold", 36), fill=TEXT, anchor="lm")
        x = (W / 2 - bw - 70) if i == 0 else (W / 2 + 70)
        paste(lay, box, (x + (-1 if i == 0 else 1) * 80 * (1 - k), y), k)
    kv = ease_out_back(prog(tl, 0.32, 0.4), 2.2)
    if kv > 0:
        vs = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
        vd = ImageDraw.Draw(vs)
        r = 74 * kv
        vd.ellipse((110 - r, 110 - r, 110 + r, 110 + r), fill=YEL if THEME.get("paper") else KEY, outline=INK, width=6)
        vd.text((110, 112), "VS", font=font("black", int(max(8, 64 * kv))), fill=INK, anchor="mm")
        paste(lay, vs, (W / 2 - 110, y + bh / 2 - 110), min(1.0, kv))
    if data.get("note"):
        kn = ease_out(prog(tl, 0.6, 0.16))
        tmp = Image.new("RGBA", (W, 70), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((W / 2, 35), data["note"], font=font("bold", 38), fill=TEXT, anchor="mm")
        paste(lay, tmp, (0, y + bh + 40), kn)
    paste(canvas, lay, (0, 0), out)


# ---------------------------------------------------------------- L 継続率メーター（単体 → 引き戻し込み）
def meter(canvas, tl, dur, data, add_since=None):
    """横長のメーター。まず単体の数字まで伸び、@hl 1 のタイミングで上乗せぶんが別の色で足される"""
    out = 1 - ease_in_out(prog(tl, dur - 0.4, 0.4))
    if out <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    px0, py0, px1, py1 = 200, 170, W - 200, 740
    kp = ease_out(prog(tl, 0.0, 0.28))
    panel = Image.new("RGBA", (px1 - px0 + 20, py1 - py0 + 20), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    _ink_box(pd, (0, 0, px1 - px0 - 1, py1 - py0 - 1))
    lab_label(pd, (56, 60), data.get("tag", "NAGI ANALYSIS"), ACCENT, 20)
    pd.text((56, 116), data["heading"], font=font("black", 58), fill=TEXT, anchor="lm")
    paste(lay, panel, (px0, py0 + 24 * (1 - kp)), kp)
    if kp < 1:
        paste(canvas, lay, (0, 0), out)
        return
    base, add = data["base"], data.get("add")
    x0, x1, y0, bh = px0 + 60, px1 - 60, py0 + 240, 96
    w = x1 - x0
    kb = ease_out(prog(tl, 0.25, 0.9))
    d.rectangle((x0, y0, x1, y0 + bh), fill=(PANEL_LINE[0], PANEL_LINE[1], PANEL_LINE[2], 40))
    for g in range(1, 10):                       # 10%ごとの目盛り
        gx = x0 + w * g / 10
        d.line((gx, y0 + bh, gx, y0 + bh + (18 if g == 5 else 10)), fill=SUB, width=2)
    d.text((x0, y0 + bh + 40), "0%", font=font("bold", 28), fill=SUB, anchor="lm")
    d.text((x1, y0 + bh + 40), "100%", font=font("bold", 28), fill=SUB, anchor="rm")
    bc = hexc(_VS_COL.get(base.get("c", "nagi"), "#2F7FE0"))
    bx = x0 + w * base["value"] / 100 * kb
    d.rectangle((x0, y0, bx, y0 + bh), fill=bc)
    v = base["value"] * kb
    if kb > 0.15:
        d.text((bx - 24, y0 + bh / 2 + 2), f"{base.get('prefix', '')}{v:.0f}%", font=font("black", 60), fill=(255, 255, 255, 255),
               anchor="rm", stroke_width=5, stroke_fill=INK)
    d.text((x0, y0 - 36), base["k"], font=font("black", 40), fill=TEXT, anchor="lm")
    if add and add_since is not None:
        ka = ease_out(prog(add_since, 0.0, 0.6))
        ac = hexc(_VS_COL.get(add.get("c", "baku"), "#F07A12"))
        ax0 = x0 + w * base["value"] / 100
        ax1 = ax0 + w * (add["value"] - base["value"]) / 100 * ka
        d.rectangle((ax0, y0, ax1, y0 + bh), fill=ac)
        d.line((ax0, y0, ax0, y0 + bh), fill=INK if THEME.get("paper") else BG, width=4)
        kt = ease_out_back(prog(add_since, 0.35, 0.35), 1.6)
        if kt > 0:
            tmp = Image.new("RGBA", (900, 130), (0, 0, 0, 0))
            td = ImageDraw.Draw(tmp)
            td.text((880, 40), add["k"], font=font("black", 36), fill=ac, anchor="rm")
            td.text((880, 96), f"{add.get('prefix', '')}{add['value']}%", font=font("black", 72), fill=ac, anchor="rm",
                    stroke_width=6, stroke_fill=PANEL)
            sc = 0.7 + 0.3 * kt
            tmp = tmp.resize((int(900 * sc), int(130 * sc)), Image.LANCZOS)
            paste(lay, tmp, (x0 + w * add["value"] / 100 - tmp.width + 20, y0 - tmp.height - 4), min(1.0, kt))
    d.rectangle((x0, y0, x1, y0 + bh), outline=INK if THEME.get("paper") else PANEL_LINE, width=LINE_W)
    for j, line in enumerate(data.get("note", [])):
        kn = ease_out(prog(tl, 1.0 + 0.06 * j, 0.16))
        tmp = Image.new("RGBA", (w, 60), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((0, 30), line, font=font("bold" if j == 0 else "medium", 34), fill=TEXT if j == 0 else SUB, anchor="lm")
        paste(lay, tmp, (x0, y0 + bh + 90 + 50 * j), kn)
    paste(canvas, lay, (0, 0), out)

SETTLE = {   # 各部品の「動きが止まる」までの秒数（静止中は描画を使い回して高速化）
    "chapter": lambda d: 0.8, "title": lambda d: 1.0, "intro": lambda d: 0.9, "logo": lambda d: 1e9, "keyword": lambda d: 0.5,
    "machine": lambda d: max(0.45 + 0.28 * len(d["rows"]) + 0.95, sum(MACHINE_MOVE) + 0.05),
    "analysis": lambda d: max(3.4, TYPE_START + TYPE_SEC * len(d.get("heading", "")) + 0.9) if THEME.get("paper") else 3.4, "timeline": lambda d: 0.6 + 0.6 * len(d["events"]) + 0.6,
    "flow": lambda d: 0.35 + 0.45 * len(d["steps"]) + 0.4,
    "lineup": lambda d: 0.3 + (0.32 if d.get("fast") else 0.55) * len(d["items"]) + 0.35,
    "pie": lambda d: max(1.3, 0.6 + 0.22 * len(d["slices"]) + 0.45),
    "spec_table": lambda d: 0.35 + 0.2 * len(d["rows"]) + 0.4,
    "versus": lambda d: 1.0, "meter": lambda d: 1.4,
    "invention": lambda d: 1e9,   # lab/invention.py：発明品はずっと動いている
}
OUTRO = {"analysis": 1.0, "chapter": 0.45, "title": 0.45, "intro": 0.35, "logo": 0.35}


# ---------------------------------------------------------------- 字幕
def subtitle(canvas, tl, dur, who, text, accent=False):
    a = life(tl, dur, 0.2, 0.15)
    if a <= 0:
        return
    pw, ph = 1160, 150
    lay = Image.new("RGBA", (pw, ph + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    col = SPEAKER[who]
    if THEME.get("paper"):
        d.rectangle((0, 40, pw - 1, ph + 39), fill=PANEL, outline=INK, width=LINE_W)
    else:
        d.rounded_rectangle((0, 40, pw - 1, ph + 39), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 238))
    left = who == "nagi"
    bx = 0 if left else pw - 8
    d.rounded_rectangle((bx, 40, bx + 7, ph + 39), 3, fill=col)
    if accent:   # 重要なツッコミだけ下線も橙に
        d.line((40, ph + 38, pw - 40, ph + 38), fill=BAKU, width=4)
    fn = font("bold", 30)
    nm = NAME[who]
    tw = text_w(nm, fn) + 40
    nx = 28 if left else pw - 28 - tw
    d.rounded_rectangle((nx, 20, nx + tw, 64), 8, fill=col)
    d.text((nx + tw / 2, 42), nm, font=fn, fill=BG, anchor="mm")
    lines = text.split("\n")
    size = 58 if len(lines) == 1 else 52
    plain = [l.replace("{", "").replace("}", "") for l in lines]
    while size > 40 and max(text_w(l, font("bold", size)) for l in plain) > pw - 90:
        size -= 2
    f = font("bold", size)
    lh = 64 if len(lines) > 1 else 0
    for i, line in enumerate(lines):
        rich(d, (pw / 2, 40 + ph / 2 + (i - (len(lines) - 1) / 2) * lh + 2), line, f, TEXT, KEY)
    paste(canvas, lay, ((W - pw) / 2, H - MARGIN - ph - 40 + 10 * (1 - a)), a)


# ---------------------------------------------------------------- キャラクター
FACES = ("normal", "happy", "surprised", "sad", "angry", "confused", "smug", "sweat", "excited", "despair")


@lru_cache(maxsize=None)
def load_char(who, face="normal"):
    """表情差分 characters/v2/<who>/<face>.png。無ければ normal.png を使う"""
    p = ASSETS / "characters" / "v2" / who / f"{face}.png"
    if not p.exists():
        p = ASSETS / "characters" / "v2" / who / "normal.png"
    return Image.open(p).convert("RGBA")


@lru_cache(maxsize=None)
def load_bust(who, face="normal"):
    """寸劇用のバストアップ表情 characters/v2/<who>/face/<face>.png（scripts/cut_faces.py で切り出し）。
    無い表情は face/normal.png、それも無ければ全身の normal.png"""
    d = ASSETS / "characters" / "v2" / who / "face"
    for p in (d / f"{face}.png", d / "normal.png"):
        if p.exists():
            return Image.open(p).convert("RGBA")
    return load_char(who)


def has_busts(who):
    return (ASSETS / "characters" / "v2" / who / "face" / "normal.png").exists()


@lru_cache(maxsize=96)
def scaled_bust(who, h, bright, face="normal", fade_px=0):
    """バストアップを高さ h に。fade_px を付けると下端をその幅でフェードアウト（切れ目を見せない）"""
    src = load_bust(who, face)
    s = h / src.height
    im = src.resize((max(1, int(src.width * s)), int(h)), Image.LANCZOS)
    if bright < 0.999:
        rgb = Image.eval(im.convert("RGB"), lambda v: int(v * bright))
        im = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
    if fade_px:
        a = np.asarray(im.split()[3]).astype(np.float32)
        ramp = np.ones(im.height, np.float32)
        ramp[-fade_px:] = np.linspace(1, 0, fade_px)
        im.putalpha(Image.fromarray((a * ramp[:, None]).astype(np.uint8)))
    return im, s


@lru_cache(maxsize=64)
def _scaled(who, h, bright, face="normal"):
    src = load_char(who, face)
    s = h / src.height
    im = src.resize((max(1, int(src.width * s)), int(h)), Image.LANCZOS)
    if bright < 0.999:
        rgb = Image.eval(im.convert("RGB"), lambda v: int(v * bright))
        im = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
    # 足元の影
    out = Image.new("RGBA", (im.width + 40, im.height + 30), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((out.width * 0.18, im.height - 10, out.width * 0.82, im.height + 18), fill=(0, 0, 0, 110))
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    out.alpha_composite(im, (20, 0))
    return out, s


CHAR_FOOT = {"nagi": (190, H - 24), "baku": (W - 200, H - 24)}


def draw_char(canvas, who, h, t, talking, extra_scale=1.0, face="normal", shift=0.0):
    """呼吸程度のわずかな上下だけ。話している方を明るく。戻り値：素材上の座標→画面座標の変換。shift＝足元の横ずらし（寄りのカット用）"""
    bright = 1.0 if talking else 0.78
    hq = int(round(h * extra_scale / 4) * 4)
    img, s = _scaled(who, hq, bright, face)
    fx, fy = CHAR_FOOT[who]
    fx += shift
    bob = 3 * math.sin(2 * math.pi * 0.4 * t + (0 if who == "nagi" else 1.9))
    x = fx - img.width / 2
    y = fy - (img.height - 30) + bob
    canvas.alpha_composite(img, (int(x), int(y)))
    return lambda px, py: (x + 20 + px * s, y + py * s)


# ---------------------------------------------------------------- 明朝（再現演出の文字。lab/fx.py）
_SERIF = ("NotoSerifCJK-Black.ttc", "NotoSerifCJK-Bold.ttc")
_FX = {}
FX_RED = (214, 28, 36)


def serif(size):
    for d in _FONT_DIRS:
        for name in _SERIF:
            if (d / name).exists():
                return ImageFont.truetype(str(d / name), size, index=0)
    return font("black", size)


# ---------------------------------------------------------------- L ニュース番組のOP（@newsopen）
NEWS_NAVY = hexc("#0B2A5B")
NEWS_RED = hexc("#D7262E")
NEWS_WHITE = (255, 255, 255, 255)


def _stripes(lay, k, y, h, cols, slant=260):
    """斜めの帯を左から右へ流す。k=0〜1（1で画面を覆いきる）"""
    d = ImageDraw.Draw(lay)
    x1 = -slant + (W + slant * 2) * k
    for i, c in enumerate(cols):
        off = i * 70
        xa = x1 - off
        d.polygon([(xa - W - slant, y), (xa, y), (xa - slant, y + h), (xa - W - slant * 2, y + h)], fill=c)


# 曲（scripts/bgm/make_news.py の make_open）と同じ秒数。128BPM・1小節1.875秒
NO_LOGO, NO_TICKER, NO_ANCHOR, NO_HEAD, NO_FULL, NO_FINAL = 1.875, 2.6, 5.625, 9.375, 11.25, 13.594


def _anchor(who, name, role, side, k):
    """キャスター紹介：全身の立ち絵＋紺の名札（左に赤い差し色）"""
    ch = load_char(who)
    hh = 560
    ch = ch.resize((int(ch.width * hh / ch.height), hh), Image.LANCZOS)
    lay = Image.new("RGBA", (760, 760), (0, 0, 0, 0))
    lay.alpha_composite(ch, ((760 - ch.width) // 2, 0))
    d = ImageDraw.Draw(lay)
    d.rectangle((70, 560, 690, 700), fill=NEWS_NAVY)
    d.rectangle((70, 560, 86, 700), fill=NEWS_RED)
    d.text((112, 600), role, font=font("bold", 30), fill=(170, 200, 245, 255), anchor="lm")
    d.text((112, 652), name, font=font("black", 56), fill=NEWS_WHITE, anchor="lm")
    return lay


def news_open(canvas, tl, dur, data):
    """ニュース番組のOP（15秒・news_open.wav に合わせる）。
    帯が走る → ロゴが決まる → 下にニュースの帯 → ナギとバクがキャスターとして登場 → 今回のニュースの見出し
    → 全員でテーマ（光が走る）→ 決めの一発で見出しが弾む → 帯が横切って本編へ"""
    lead = data.get("lead", 0.0)
    tl, dur = tl - lead, dur - lead
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    g = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    top, bot = np.array([18, 52, 108], np.float32), np.array([6, 18, 44], np.float32)
    arr = (top * (1 - g) + bot * g)[:, None, :].repeat(W, 1).reshape(H, W, 3)
    lay.alpha_composite(Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA"))
    cx, cy = W / 2, H / 2 - 60
    # 回る輪（地球儀）と方眼。決めの拍で少し脈打つ
    kr = ease_out(prog(tl, 0.4, 1.2))
    if kr > 0:
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        for x in range(0, W, 96):
            rd.line((x, 0, x, H), fill=(120, 170, 255, 18), width=1)
        for y in range(0, H, 96):
            rd.line((0, y, W, y), fill=(120, 170, 255, 18), width=1)
        beat = max(0.0, 1 - ((tl - NO_LOGO) % (60 / 128)) / 0.25) if tl > NO_LOGO else 0.0
        R = 330 + 40 * (1 - kr) + 12 * beat
        rd.ellipse((cx - R, cy - R, cx + R, cy + R), outline=(150, 195, 255, 90 + int(60 * beat)), width=3)
        rd.ellipse((cx - R * 1.18, cy - R * 1.18, cx + R * 1.18, cy + R * 1.18), outline=(150, 195, 255, 40), width=2)
        rot = tl * 0.9
        for i in range(6):
            w = abs(math.cos(rot + i * math.pi / 6)) * R
            rd.ellipse((cx - w, cy - R, cx + w, cy + R), outline=(150, 195, 255, 55), width=2)
        for j in (-0.6, -0.3, 0.3, 0.6):
            yy = cy + R * j
            ww = R * math.sqrt(1 - j * j)
            rd.line((cx - ww, yy, cx + ww, yy), fill=(150, 195, 255, 55), width=2)
        rd.line((cx - R, cy, cx + R, cy), fill=(150, 195, 255, 70), width=2)
        for i in range(3):
            a = tl * 2.4 + i * 2.1
            px, py = cx + R * math.cos(a), cy + R * math.sin(a)
            rd.ellipse((px - 7, py - 7, px + 7, py + 7), fill=(255, 90, 90, 220))
        lay.alpha_composite(fade(ring.filter(ImageFilter.GaussianBlur(0.6)), kr * (1 - 0.55 * prog(tl, NO_ANCHOR, 0.5))))
    # 頭の赤白の帯
    ks = prog(tl, 0.0, 1.4)
    if 0 < ks < 1:
        _stripes(lay, ease_in_out(ks), 300, 120, [NEWS_RED, NEWS_WHITE])
        _stripes(lay, ease_in_out(max(0, ks - 0.12) / 0.88), 640, 70, [NEWS_WHITE, NEWS_RED])
    # キャスター（ナギ左・バク右）。見出しが出たら少し下がって控える
    ka = ease_out(prog(tl, NO_ANCHOR, 0.5))
    if ka > 0:
        an = data.get("anchors", {})
        dn = ease_in_out(prog(tl, NO_HEAD, 0.5))
        for who, side, delay in (("nagi", -1, 0.0), ("baku", 1, 0.25)):
            k = ease_out_back(prog(tl, NO_ANCHOR + delay, 0.5), 1.3)
            if k <= 0:
                continue
            nm, role = an.get(who, ({"nagi": "ナギ", "baku": "バク"}[who], ""))
            im = _anchor(who, nm, role, side, k)
            s2 = 1 - 0.4 * dn
            im = im.resize((int(im.width * s2), int(im.height * s2)), Image.LANCZOS)
            m = 60 - 40 * dn
            x = (m if side < 0 else W - m - im.width) + side * 700 * (1 - k)
            y = 225 + 240 * dn
            paste(lay, im, (x, y), min(1.0, k))
    # ロゴ（キャスター登場で上へ寄って小さく）
    kl = ease_out_back(prog(tl, NO_LOGO, 0.45), 1.6)
    if kl > 0:
        logo = Image.new("RGBA", (1500, 420), (0, 0, 0, 0))
        ld = ImageDraw.Draw(logo)
        ld.text((750, 150), "ナギバク", font=font("black", 210), fill=NEWS_WHITE, anchor="mm", stroke_width=4, stroke_fill=NEWS_NAVY)
        kb = ease_out(prog(tl, NO_LOGO + 0.3, 0.4))
        bw = int(1120 * kb)
        if bw > 0:
            ld.polygon([(750 - bw / 2 + 30, 285), (750 + bw / 2 + 30, 285), (750 + bw / 2 - 30, 385), (750 - bw / 2 - 30, 385)], fill=NEWS_RED)
            if kb > 0.6:
                ld.text((750, 335), "PACHINKO  NEWS", font=font("black", 74), fill=NEWS_WHITE, anchor="mm")
        up = ease_in_out(prog(tl, NO_ANCHOR - 0.3, 0.6))
        s = (0.8 + 0.2 * kl) * (1 - 0.35 * up)
        im = logo.resize((int(1500 * s), int(420 * s)), Image.LANCZOS)
        for t0 in (3.4, NO_FULL):   # 光が横切る
            sh = prog(tl, t0, 0.9)
            if 0 < sh < 1:
                m = Image.new("L", im.size, 0)
                x = -300 + (im.width + 600) * sh
                ImageDraw.Draw(m).polygon([(x, 0), (x + 120, 0), (x - 80, im.height), (x - 200, im.height)], fill=150)
                shine = Image.new("RGBA", im.size, (255, 255, 255, 0))
                shine.putalpha(Image.fromarray(np.minimum(np.asarray(m), np.asarray(im.getchannel("A")))))
                im.alpha_composite(shine.filter(ImageFilter.GaussianBlur(6)))
        ly = (cy - im.height / 2) * (1 - up) + 90 * up
        paste(lay, im, ((W - im.width) / 2, ly), min(1.0, prog(tl, NO_LOGO, 0.12)))
    # 下のニュースの帯（流れる文字）
    kt = ease_out(prog(tl, NO_TICKER, 0.4))
    if kt > 0:
        bar = Image.new("RGBA", (W, 76), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bar)
        bd.rectangle((0, 0, W, 76), fill=(255, 255, 255, 240))
        f = font("bold", 36)
        unit = data.get("ticker", "NAGIBAKU PACHINKO NEWS") + "　●　"
        uw = text_w(unit, f)
        x = 250 - (tl - NO_TICKER) * 260 % uw
        while x < W:
            bd.text((x, 38), unit, font=f, fill=NEWS_NAVY, anchor="lm")
            x += uw
        bd.rectangle((0, 0, 230, 76), fill=NEWS_RED)
        bd.text((115, 38), "NEWS", font=font("black", 40), fill=NEWS_WHITE, anchor="mm")
        paste(lay, bar, (0, H - 110 + 80 * (1 - kt)), kt)
    # 今回のニュースの見出し（決めの一発で弾む）
    kh = ease_out(prog(tl, NO_HEAD, 0.45))
    if kh > 0 and data.get("headline"):
        hb = Image.new("RGBA", (1000, 230), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hb)
        hd.rectangle((0, 0, 1000, 230), fill=(255, 255, 255, 245))
        hd.rectangle((0, 0, 16, 230), fill=NEWS_RED)
        hd.text((60, 58), data.get("kicker", "今回のニュース"), font=font("black", 40), fill=NEWS_RED, anchor="lm")
        hf = font("black", 92)
        while text_w(data["headline"], hf) > 900 and hf.size > 48:
            hf = font("black", hf.size - 4)
        hd.text((60, 150), data["headline"], font=hf, fill=NEWS_NAVY, anchor="lm")
        pop = 1 + 0.07 * max(0.0, 1 - prog(tl, NO_FINAL, 0.35)) if tl >= NO_FINAL else 1.0
        if pop != 1.0:
            hb = hb.resize((int(1000 * pop), int(230 * pop)), Image.LANCZOS)
        paste(lay, hb, ((W - hb.width) / 2 + 160 * (1 - kh), 470 - (hb.height - 230) / 2), kh)
    # フラッシュ（ロゴが決まる瞬間・全員でテーマ・決めの一発）
    for t0, a0 in ((NO_LOGO, 150), (NO_FULL, 70), (NO_FINAL, 110)):
        if t0 <= tl < t0 + 0.2:
            lay.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(a0 * (1 - prog(tl, t0, 0.2))))))
    # 抜け：帯が横切って本編へ
    ke = prog(tl, dur - 0.45, 0.45)
    out = 1.0
    if ke > 0:
        _stripes(lay, ease_in_out(ke), 0, H, [NEWS_RED, NEWS_WHITE, NEWS_NAVY], slant=420)
        out = 1 - prog(tl, dur - 0.12, 0.12)
    paste(canvas, lay, (0, 0), out)
