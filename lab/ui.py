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
SPEAKER = {"nagi": NAGI, "baku": BAKU}
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
    p = ASSETS / "backgrounds" / (name or "lab_room.png")
    if p.exists():
        src = Image.open(p).convert("RGB")
        s = max(W / src.width, H / src.height)
        src = src.resize((int(src.width * s + 0.5), int(src.height * s + 0.5)), Image.LANCZOS)
        src = src.crop(((src.width - W) // 2, (src.height - H) // 2, (src.width - W) // 2 + W, (src.height - H) // 2 + H))
        src = src.filter(ImageFilter.GaussianBlur(9))
        img = np.asarray(src).astype(np.float32) * 0.34 + np.array(BG[:3], np.float32) * 0.42
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


def top_bar(canvas, a, chapter_no, chapter_title, year, era=None, milestones=(), label=None):
    """左：章タイトル（CHAPTER番号は小さく補助）／右：年表。今の年だけ強調、過去は薄く、未来は暗く"""
    if a <= 0:
        return
    lay = Image.new("RGBA", (W, 150), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lab_label(d, (MARGIN, 40), label or f"CHAPTER {chapter_no:02d}", NAGI, 20)
    d.text((MARGIN, 82), chapter_title, font=font("black", 44), fill=TEXT, anchor="lm")
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
        d.line((year_x(era[0]), TL_Y, year_x(era[1]), TL_Y), fill=NAGI, width=5)
    d.ellipse((cx - 11, TL_Y - 11, cx + 11, TL_Y + 11), fill=KEY, outline=BG, width=3)
    d.text((cx, TL_Y - 34), f"{int(year + 1e-6)}", font=font("black", 34), fill=KEY, anchor="mm")
    paste(canvas, lay, (0, 0), a)


# ---------------------------------------------------------------- F チャプター
def chapter_card(canvas, tl, dur, data):
    """年とタイトルがほぼ同時に立ち上がる。CHAPTER番号は小さく添えるだけ"""
    out = 1 - ease_in_out(prog(tl, dur - 0.4, 0.4))
    if out <= 0:
        return
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
        bd.rounded_rectangle((0, 0, iw - 1, ih - 1), RADIUS, outline=PANEL_LINE, width=2)
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
    cd.rectangle((0, 24, 6, ch - 24), fill=NAGI)
    corner_ticks(cd, (10, 10, cw - 11, ch - 11), NAGI)
    lab_label(cd, (44, 34), data.get("tag", "DATA LOG"), NAGI, 18)
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
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 246), outline=PANEL_LINE, width=2)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), NAGI)
    k_c = ease_out(prog(tl, 1.2, 0.4)) * (1 - ease_in_out(prog(tl, t_close - 0.3, 0.3)))
    if k_c > 0:
        c = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        cd = ImageDraw.Draw(c)
        # 見出し：何を比べているか
        lab_label(cd, (48, 52), data.get("tag", "NAGI ANALYSIS"), NAGI, 20)
        cd.text((48, 104), data["heading"], font=font("black", 58), fill=TEXT, anchor="lm")
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
        col = KEY if ev.get("key") else NAGI
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
        lab_label(cdr, (W / 2, 22), data.get("tag", "LAB RECORD"), NAGI, 20, anchor="mm")
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
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 240), outline=PANEL_LINE, width=2)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), NAGI)
    lab_label(d, (pw / 2, 52), data.get("tag", "LAB RECORD"), NAGI, 20, anchor="mm")
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
    lab_label(d, (W / 2, 210), data.get("tag", "LAB RECORD"), NAGI, 20, anchor="mm")
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
        col = KEY if st.get("key") else NAGI
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
            d.line((ax0, ay, ax1, ay), fill=NAGI, width=3)
            d.line((ax1 - 10, ay - 9, ax1, ay, ax1 - 10, ay + 9), fill=NAGI, width=3)
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
    lab_label(d, (W / 2, y_top - 36), data.get("tag", "LAB RECORD"), NAGI, 20, anchor="mm")
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
                col = KEY if it.get("key") else NAGI
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


def _pie_color(i, s):
    if s.get("c"):
        return hexc(s["c"])
    return KEY if s.get("key") else PIE_COLORS[i % len(PIE_COLORS)]


def pie(canvas, tl, dur, data):
    """振り分けを、左のドーナツグラフと右の表で見せる。
    data: heading, tag, center（グラフ中央の文字）, center_sub, slices[{k, s, v, label, key, c}], note"""
    a = life(tl, dur, 0.4, 0.35)
    if a <= 0:
        return
    sl = data["slices"]
    n = len(sl)
    total = sum(s["v"] for s in sl) or 1
    pw, ph = 1560, 640
    panel = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 242), outline=PANEL_LINE, width=2)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), NAGI)
    lab_label(d, (48, 50), data.get("tag", "DATA LOG"), NAGI, 20)
    d.text((48, 100), data["heading"], font=font("black", 54), fill=TEXT, anchor="lm")
    d.line((48, 144, pw - 48, 144), fill=PANEL_LINE, width=2)
    # 左：ドーナツ（2倍で描いて縮めて滑らかに）
    R, cx, cy = 210, 290, 160 + (ph - 160) / 2 - 6
    sweep = ease_in_out(prog(tl, 0.35, 0.9))
    S = 2
    g = Image.new("RGBA", (2 * R * S + 4, 2 * R * S + 4), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    box = (2, 2, 2 + 2 * R * S, 2 + 2 * R * S)
    gd.ellipse(box, fill=PANEL_LINE)
    ang = -90.0
    for i, s in enumerate(sl):
        span = 360.0 * s["v"] / total
        end = min(ang + span, -90.0 + 360.0 * sweep)
        if end > ang:
            gd.pieslice(box, ang, end, fill=_pie_color(i, s))
        ang += span
    # 切れ目の細い線と中央の穴
    ang = -90.0
    for s in sl:
        rad = math.radians(ang)
        c0 = 2 + R * S
        gd.line((c0, c0, c0 + math.cos(rad) * R * S, c0 + math.sin(rad) * R * S), fill=PANEL, width=4 * S // 2)
        ang += 360.0 * s["v"] / total
    hole = int(R * 0.58 * S)
    c0 = 2 + R * S
    gd.ellipse((c0 - hole, c0 - hole, c0 + hole, c0 + hole), fill=PANEL)
    g = g.resize((g.width // S, g.height // S), Image.LANCZOS)
    panel.alpha_composite(fade(g, ease_out(prog(tl, 0.2, 0.4))), (int(cx - R - 1), int(cy - R - 1)))
    kc = ease_out(prog(tl, 0.9, 0.4))
    if kc > 0 and data.get("center"):
        cl = Image.new("RGBA", (2 * hole, 2 * hole), (0, 0, 0, 0))
        cdd = ImageDraw.Draw(cl)
        h2 = hole / S * 2
        cdd.text((hole, hole - (18 if data.get("center_sub") else 0)), data["center"], font=font("black", 40), fill=TEXT, anchor="mm")
        if data.get("center_sub"):
            cdd.text((hole, hole + 30), data["center_sub"], font=font("medium", 26), fill=SUB, anchor="mm")
        panel.alpha_composite(fade(cl, kc), (int(cx - hole), int(cy - hole)))
    # 右：表（色・名前・中身・割合）。行は順に出て、key の行は金色
    tx0, tx1 = 600, pw - 56
    rh = min(84, (ph - 200 - (60 if data.get("note") else 0)) / n)
    ty = 176 + ((ph - 200 - (60 if data.get("note") else 0)) - rh * n) / 2
    fname = font("black", 40 if rh >= 70 else 34)
    fsub = font("medium", 28)
    fval = font("black", 50 if rh >= 70 else 42)
    for i, s in enumerate(sl):
        k = ease_out(prog(tl, 0.45 + 0.22 * i, 0.35))
        if k <= 0:
            continue
        row = Image.new("RGBA", (tx1 - tx0, int(rh)), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        col = _pie_color(i, s)
        hot = s.get("key")
        if hot:
            rd.rounded_rectangle((0, 4, tx1 - tx0 - 1, rh - 5), 10, fill=(KEY[0], KEY[1], KEY[2], 34), outline=KEY, width=2)
        rd.rounded_rectangle((18, rh / 2 - 14, 46, rh / 2 + 14), 6, fill=col)
        rd.text((72, rh / 2), s["k"], font=fname, fill=KEY if hot else TEXT, anchor="lm")
        if s.get("s"):
            rd.text((72 + text_w(s["k"], fname) + 22, rh / 2 + 4), s["s"], font=fsub, fill=SUB, anchor="lm")
        rd.text((tx1 - tx0 - 24, rh / 2), s.get("label", f"{s['v']}%"), font=fval, fill=KEY if hot else TEXT, anchor="rm")
        if i < n - 1 and not hot and not sl[i + 1].get("key"):
            rd.line((18, rh - 1, tx1 - tx0 - 18, rh - 1), fill=PANEL_LINE, width=1)
        panel.alpha_composite(fade(row, k), (tx0 + int(16 * (1 - k)), int(ty + rh * i)))
    if data.get("note"):
        kn = ease_out(prog(tl, 0.6 + 0.22 * n, 0.4))
        if kn > 0:
            nl = Image.new("RGBA", (tx1 - tx0, 50), (0, 0, 0, 0))
            ImageDraw.Draw(nl).text((18, 25), data["note"], font=font("medium", 28), fill=SUB, anchor="lm")
            panel.alpha_composite(fade(nl, kn), (tx0, ph - 74))
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
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), RADIUS, fill=(PANEL[0], PANEL[1], PANEL[2], 242), outline=PANEL_LINE, width=2)
    corner_ticks(d, (10, 10, pw - 11, ph - 11), NAGI)
    lab_label(d, (48, 50), data.get("tag", "DATA LOG"), NAGI, 20)
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
    lab_label(ImageDraw.Draw(tmp), (W / 2, 30), data.get("label", ""), NAGI, 24, anchor="mm")
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


SETTLE = {   # 各部品の「動きが止まる」までの秒数（静止中は描画を使い回して高速化）
    "chapter": lambda d: 0.8, "title": lambda d: 1.0, "intro": lambda d: 0.9, "logo": lambda d: 1e9, "keyword": lambda d: 0.5,
    "machine": lambda d: max(0.45 + 0.28 * len(d["rows"]) + 0.95, sum(MACHINE_MOVE) + 0.05),
    "analysis": lambda d: 3.4, "timeline": lambda d: 0.6 + 0.6 * len(d["events"]) + 0.6,
    "flow": lambda d: 0.35 + 0.45 * len(d["steps"]) + 0.4,
    "lineup": lambda d: 0.3 + (0.32 if d.get("fast") else 0.55) * len(d["items"]) + 0.35,
    "pie": lambda d: max(1.3, 0.6 + 0.22 * len(d["slices"]) + 0.45),
    "spec_table": lambda d: 0.35 + 0.2 * len(d["rows"]) + 0.4,
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


def draw_char(canvas, who, h, t, talking, extra_scale=1.0, face="normal"):
    """呼吸程度のわずかな上下だけ。話している方を明るく。戻り値：素材上の座標→画面座標の変換"""
    bright = 1.0 if talking else 0.78
    hq = int(round(h * extra_scale / 4) * 4)
    img, s = _scaled(who, hq, bright, face)
    fx, fy = CHAR_FOOT[who]
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
