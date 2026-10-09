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
@lru_cache(maxsize=1)
def background():
    """研究室の背景画像（generator/assets/backgrounds/lab_room.png）を暗く・ぼかして敷く。
    無ければ #101827 の無地＋方眼。文字が主役になる明るさに抑える"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    p = ASSETS / "backgrounds" / "lab_room.png"
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


def top_bar(canvas, a, chapter_no, chapter_title, year, era=None, milestones=()):
    """左：章タイトル（CHAPTER番号は小さく補助）／右：年表。今の年だけ強調、過去は薄く、未来は暗く"""
    if a <= 0:
        return
    lay = Image.new("RGBA", (W, 150), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lab_label(d, (MARGIN, 40), f"CHAPTER {chapter_no:02d}", NAGI, 20)
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
    d.text((cx, TL_Y - 34), f"{int(year)}", font=font("black", 34), fill=KEY, anchor="mm")
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
    ImageDraw.Draw(tmp).text((W / 2, 90), data["year"], font=font("black", 140), fill=KEY, anchor="mm")
    paste(lay, tmp, (0, cy - 250 + 20 * (1 - st["year"])), st["year"])
    tmp = Image.new("RGBA", (W, 190), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((W / 2, 95), data["title"], font=font("black", 140), fill=TEXT, anchor="mm")
    paste(lay, tmp, (0, cy - 50 + 24 * (1 - st["title"])), st["title"])
    rw = 420 * st["rule"]
    d.line((W / 2 - rw / 2, cy + 175, W / 2 + rw / 2, cy + 175), fill=PANEL_LINE, width=2)
    tmp = Image.new("RGBA", (W, 50), (0, 0, 0, 0))
    lab_label(ImageDraw.Draw(tmp), (W / 2, 25), f"CHAPTER {data['no']:02d}", SUB, 24, anchor="mm")
    paste(lay, tmp, (0, cy + 195), st["no"])
    paste(canvas, lay, (0, 0), out)


# ---------------------------------------------------------------- A 機種紹介カード
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
        src = image.copy(); src.thumbnail((iw, ih))
        box.alpha_composite(src.convert("RGBA"), ((iw - src.width) // 2, (ih - src.height) // 2))
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
    cd.text((44, 78), data["name"], font=font("black", 56), fill=TEXT, anchor="lm")
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
    x0, x1, y = 260, W - 260, data.get("y", 470)
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
        stem = 150 * ke
        e = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ed = ImageDraw.Draw(e)
        ed.line((x, y, x, y - stem if up else y + stem), fill=col, width=3)
        ed.ellipse((x - 11, y - 11, x + 11, y + 11), fill=col, outline=BG, width=4)
        ty = y - 150 - 70 if up else y + 150 + 20
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
        lay.alpha_composite(fade(c, kc), (0, data.get("caption_y", 160)))
    paste(canvas, lay, (0, 0), a)



# ---------------------------------------------------------------- E バクのツッコミ
def tsukkomi_lines(canvas, tl, center):
    """簡素化：演出は字幕の橙アクセントと軽い拡大（emphasis）だけ。ここでは何も足さない"""
    return


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
    f = font("bold", 58 if len(lines) == 1 else 52)
    lh = 64 if len(lines) > 1 else 0
    for i, line in enumerate(lines):
        rich(d, (pw / 2, 40 + ph / 2 + (i - (len(lines) - 1) / 2) * lh + 2), line, f, TEXT, KEY)
    paste(canvas, lay, ((W - pw) / 2, H - MARGIN - ph - 40 + 10 * (1 - a)), a)


# ---------------------------------------------------------------- キャラクター
def load_char(who):
    return Image.open(ASSETS / "characters" / "v2" / who / "normal.png").convert("RGBA")


@lru_cache(maxsize=64)
def _scaled(who, h, bright):
    src = load_char(who)
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


def draw_char(canvas, who, h, t, talking, extra_scale=1.0):
    """呼吸程度のわずかな上下だけ。話している方を明るく。戻り値：素材上の座標→画面座標の変換"""
    bright = 1.0 if talking else 0.78
    hq = int(round(h * extra_scale / 4) * 4)
    img, s = _scaled(who, hq, bright)
    fx, fy = CHAR_FOOT[who]
    bob = 3 * math.sin(2 * math.pi * 0.4 * t + (0 if who == "nagi" else 1.9))
    x = fx - img.width / 2
    y = fy - (img.height - 30) + bob
    canvas.alpha_composite(img, (int(x), int(y)))
    return lambda px, py: (x + 20 + px * s, y + py * s)
