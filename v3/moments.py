"""ナギバク専用の演出パッケージ（どの回でも使い回せる「見せ場」）

  A machine_entry  注目機種の登場：先バレ（画面の縁が金に2回光る）→ 専用ジングル → 中央に着地（衝撃波・帯・光）
  B analysis       ナギの解析：青い走査線＋対象を挟み込むブラケット＋ANALYSIS タグ。グラフや比較の要所に重ねる
  C tsukkomi       バクのツッコミ：オレンジのトゲ吹き出し＋集中線＋拡大と伸び縮み（ポーズの変化）＋短いSE
  D era_shift      時代の転換：3つのリールが回って順に止まり、最後だけ溜めてから揃う（年号・月・出来事）
  shock            規制などの衝撃：D の大きな数字を赤い保留で出す（tone=shock）

どれも「描く関数」と「効果音・画面効果の時刻表（events）」の組。
メリハリのため、普段の解説には使わず、見せ場だけで呼ぶ。

呼び出し方
  自動   B 機種紹介 → machine_entry ／ バク!: → tsukkomi ／ data.json の events に "turn": true がある月の C → era_shift
         B の注目スペック・E の数字・D 比較の「違う」→ analysis ／ data.json の facts の数字を バク!: で驚く → shock
  台本   @C:calendar intro=era_shift reels="2016年|5月|新内規"
         @moment analysis at="65%" box=560,430,900,90       （今のシーンの、その語句を言う瞬間に重ねる）
"""
import math
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import fx
from .style import (W, H, NAVY, TEXT, SUB, GOLD, BLUE, ORANGE, font, prog, out3, inout, back, put, scaled,
                    text_layer, gold_text, spaced, fit_size, label)

# ================================================================ A 注目機種の登場
SENBARE = (0.62, 0.34)          # 着地の何秒前に先バレが光るか


@lru_cache(maxsize=4)
def _edge_glow(col, width=150):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    a = np.clip(1 - d / width, 0, 1) ** 2 * 230
    im = np.zeros((H, W, 4), np.uint8)
    im[..., :3] = col
    im[..., 3] = a.astype(np.uint8)
    return Image.fromarray(im, "RGBA")


def entry_before(cv, t, t0):
    """先バレ：着地の直前に、画面の縁が金色に2回光る（実機の演出ではなく研究所の『来るぞ』の合図）"""
    for dt in SENBARE:
        k = prog(t, t0 - dt, 0.24)
        if 0 < k < 1:
            put(cv, _edge_glow(GOLD), (0, 0), math.sin(math.pi * k) * 0.9)


def shockwave(cv, center, t, t0, r0=120, r1=760, col=GOLD):
    for i, (dl, c) in enumerate(((0.0, col), (0.08, (255, 255, 255)))):
        k = prog(t, t0 + dl, 0.5)
        if 0 < k < 1:
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            r = r0 + (r1 - r0) * out3(k)
            ImageDraw.Draw(lay).ellipse((center[0] - r, center[1] - r * 0.62, center[0] + r, center[1] + r * 0.62),
                                        outline=c + (int(230 * (1 - k)),), width=int(14 - 8 * k))
            cv.alpha_composite(lay)


def entry_after(cv, t, t0, center, box, ribbon="注目機種 ENTRY!"):
    shockwave(cv, center, t, t0)
    fx.sparkles(cv, center, t, t0, n=28, spread=540)
    fx.glint(cv, box, t, t0 + 0.35, 0.7)
    if ribbon:
        fx.ribbon(cv, ribbon, (box[0] - 60, box[1] - 30), t, t0 + 0.05, 1.5)


def entry_events(t0):
    return [(t0 - SENBARE[0], "senbare"), (t0 - SENBARE[1], "senbare"), (t0, "jingle"), (t0, "flash"),
            (t0 + 0.4, "sparkle")]


# ================================================================ B ナギの解析
def analysis(cv, box, t, t0, hold=1.6, tag="ANALYSIS"):
    """青い解析：走査線が横切り、ブラケットが対象を挟み込む。hold 秒で静かに消える（普段の画面に戻す）"""
    if t < t0:
        return
    a = 1 - prog(t, t0 + hold, 0.45)
    if a <= 0:
        return
    x0, y0, x1, y1 = [float(v) for v in box]
    k = out3(prog(t, t0, 0.35))
    pad = 70 * (1 - k) + 12
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rectangle((x0, y0, x1, y1), fill=BLUE + (int(26 * k),))
    L = min(46, (x1 - x0) / 4, (y1 - y0) / 2)
    c = BLUE + (255,)
    for (px, py, sx, sy) in ((x0 - pad, y0 - pad, 1, 1), (x1 + pad, y0 - pad, -1, 1),
                             (x0 - pad, y1 + pad, 1, -1), (x1 + pad, y1 + pad, -1, -1)):
        d.line((px, py, px + L * sx, py), fill=c, width=6)
        d.line((px, py, px, py + L * sy), fill=c, width=6)
    # 走査線（左→右）
    ks = prog(t, t0 + 0.05, 0.5)
    if 0 < ks < 1:
        sx = x0 + (x1 - x0) * inout(ks)
        for i in range(10):
            d.line((sx - i * 8, y0 - 6, sx - i * 8, y1 + 6), fill=(150, 220, 255, int(200 * (1 - i / 10) * (1 - ks * 0.4))), width=4)
    glow = lay.filter(ImageFilter.GaussianBlur(6))
    put(cv, glow, (0, 0), a * 0.8)
    put(cv, lay, (0, 0), a)
    if tag:
        tg = label(tag, BLUE, 20)
        put(cv, tg, (x0 - pad, y0 - pad - tg.height - 8), a * k)


def analysis_events(t0):
    return [(t0, "scan")]


# ================================================================ C バクのツッコミ
@lru_cache(maxsize=8)
def _balloon(r):
    S = 2
    R = r * S
    im = Image.new("RGBA", (R * 2 + 20, R * 2 + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = im.width / 2
    rng = np.random.default_rng(11)
    pts = []
    n = 22
    for i in range(n * 2):
        ang = math.pi * i / n
        rr = R * (1.0 if i % 2 == 0 else rng.uniform(0.66, 0.76))
        pts.append((c + rr * math.cos(ang), c + rr * 0.86 * math.sin(ang)))
    d.polygon(pts, fill=ORANGE + (235,), outline=(255, 236, 200, 255))
    inner = [(c + (x - c) * 0.8, c + (y - c) * 0.8) for x, y in pts]
    d.polygon(inner, fill=(255, 176, 84, 255))
    im = im.resize((im.width // S, im.height // S), Image.LANCZOS)
    return im


def tsukkomi_back(cv, center, size, t_line):
    """キャラの後ろ：オレンジのトゲ吹き出しがポンと開き、0.9秒で消える。集中線も短く"""
    fx.speed_lines(cv, t_line, 0.0, dur=0.8)
    k = prog(t_line, 0.0, 0.28)
    if k <= 0:
        return
    a = 1 - prog(t_line, 0.75, 0.3)
    if a <= 0:
        return
    s = 0.3 + 0.7 * back(k, 2.4)
    img = scaled(_balloon(int(size * 0.62)), s)
    img = img.rotate(-8 * (1 - k) + 3 * math.sin(t_line * 9), resample=Image.BICUBIC)
    put(cv, img, (center[0] - img.width / 2, center[1] - img.height / 2), a * 0.95)


def tsukkomi_pose(t_line):
    """拡大と伸び縮み（ポーズ差分の代わり）。(拡大率, 横, 縦, 傾き, 上下)"""
    k = prog(t_line, 0, 0.18)
    peak = 1 + 0.22 * out3(k)
    settle = 1 - inout(prog(t_line, 0.85, 0.35))
    s = 1 + (peak - 1) * settle
    sq = math.sin(min(1.0, t_line / 0.36) * math.pi * 2) * max(0.0, 1 - t_line / 0.36)
    sx, sy = 1 + 0.07 * sq, 1 - 0.07 * sq
    rot = 7 * math.sin(t_line * 22) * max(0.0, 1 - t_line / 0.7)
    jk = prog(t_line, 0, 0.42)
    dy = -70 * math.sin(math.pi * jk) if jk < 1 else 0.0
    return s, sx, sy, rot, dy


def tsukkomi_events(t0):
    return [(t0, "slap"), (t0 + 0.06, "boing"), (t0, "shake_s")]


# ================================================================ D 時代の転換（リール）
ERA = {"stops": (0.5, 0.82, 1.38), "align": 1.38, "out": 1.62, "lead": 1.95}
RW, RH, RG = 440, 240, 36


@lru_cache(maxsize=16)
def _cell(txt, col=TEXT):
    f = font("black", fit_size(txt, "black", 120, RW - 60))
    return text_layer(txt, f, col, stroke=6, stroke_fill=NAVY, pad=0)


@lru_cache(maxsize=8)
def _strip(final, fillers):
    """回転中のリールの帯（ぼかし済み）"""
    toks = list(fillers) + [final]
    im = Image.new("RGBA", (RW, RH * len(toks)), (0, 0, 0, 0))
    for i, tk in enumerate(toks):
        c = _cell(tk, (200, 210, 228))
        im.alpha_composite(c, ((RW - c.width) // 2, i * RH + (RH - c.height) // 2))
    blur = im.resize((RW, im.height // 6), Image.BILINEAR).resize(im.size, Image.BILINEAR)
    return blur


def _frame(col, lit):
    im = Image.new("RGBA", (RW + 24, RH + 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, RW + 23, RH + 23), 22, fill=(16, 24, 42, 255), outline=col + (255,), width=6 if lit else 4)
    d.rounded_rectangle((12, 12, RW + 11, RH + 11), 14, fill=(232, 228, 216, 255))
    # 窓の上下に影（円筒っぽく）
    sh = np.zeros((RH, RW, 4), np.uint8)
    yy = np.linspace(-1, 1, RH)[:, None]
    sh[..., 3] = (np.clip(np.abs(yy) - 0.45, 0, 1) / 0.55 * 150).astype(np.uint8).repeat(RW, 1)
    im.alpha_composite(Image.fromarray(sh, "RGBA"), (12, 12))
    return im


def era_shift(cv, t, reels, title="TURNING POINT", fillers=("？", "★", "N", "…")):
    """時代転換：リールが回り、左→中→右の順に止まる（右だけ溜める）。揃うと金の線が走って資料の画面へ"""
    st, al, ot, ld = ERA["stops"], ERA["align"], ERA["out"], ERA["lead"]
    if t > ld + 0.05:
        return
    a_bg = 1 - inout(prog(t, ot, ld - ot))
    a_pn = 1 - inout(prog(t, ot, 0.18))          # リールは先に消し、資料の画面だけが残るように
    bg = Image.new("RGBA", (W, H), (8, 13, 26, int(250 * a_bg)))
    cv.alpha_composite(bg)
    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    n = len(reels)
    x0 = (W - (RW * n + RG * (n - 1))) / 2
    y0 = 400
    spaced(ImageDraw.Draw(panel), (W / 2, 290), title, font("black", 34), GOLD, 12, anchor="m")
    aligned = t >= al
    for i, final in enumerate(reels):
        stop = st[min(i, len(st) - 1)]
        x = x0 + (RW + RG) * i
        tension = i == n - 1 and st[i - 1] <= t < stop if i else False
        col = GOLD if aligned else ((255, 120, 90) if tension and int(t * 12) % 2 == 0 else (90, 104, 132))
        fr = _frame(col, aligned or tension)
        win = Image.new("RGBA", (RW, RH), (0, 0, 0, 0))
        if t < stop:
            strip = _strip(final, tuple(fillers))
            speed = 5200 if not tension else 5200 * max(0.18, (stop - t) / (stop - st[i - 1]))
            off = (t * speed) % (strip.height - RH)
            win.alpha_composite(strip.crop((0, int(off), RW, int(off) + RH)))
        else:
            c = _cell(final, (30, 34, 44) if not aligned else (150, 20, 30))
            kb = prog(t, stop, 0.3)
            dy = -60 * (1 - back(kb, 2.6)) if kb < 1 else 0
            win.alpha_composite(c, ((RW - c.width) // 2, int((RH - c.height) / 2 + dy)))
        fr.alpha_composite(win, (12, 12))
        panel.alpha_composite(fr, (int(x - 12), int(y0 - 12)))
    if aligned:   # 揃いのライン
        k = out3(prog(t, al, 0.25))
        lx0, lx1 = x0 - 40, x0 - 40 + (RW * n + RG * (n - 1) + 80) * k
        d = ImageDraw.Draw(panel)
        d.line((lx0, y0 + RH / 2, lx1, y0 + RH / 2), fill=GOLD + (230,), width=10)
    s = 1 + 0.06 * inout(prog(t, ot, ld - ot))
    put(cv, scaled(panel, s), (W / 2 - W * s / 2, H / 2 - H * s / 2), a_pn)
    if aligned and a_pn > 0:
        fx.glint(cv, (x0, y0, x0 + RW * n + RG * (n - 1), y0 + RH), t, al + 0.05, 0.5)
        fx.sparkles(cv, (W / 2, y0 + RH / 2), t, al, n=30, spread=700, seed=8)


def era_events(reels):
    st, al = ERA["stops"], ERA["align"]
    ev = [(0.02, "whoosh")]
    ev += [(x, "reel_tick") for x in np.arange(0.05, st[-1] - 0.05, 0.07)]
    ev += [(s, "reel_stop") for s in st[:len(reels)]]
    ev += [(st[-2] + 0.02, "reach"), (al, "align"), (al, "flash_s")]
    return ev


INTROS = {"era_shift": ERA["lead"]}      # 台本の intro= で使える導入演出と、ナレーションを待つ秒数


# ================================================================ 台本の @moment
def overlay(cv, sc, t):
    for m in sc.get("moments", []):
        if m["name"] == "analysis":
            t0 = sc["cue"](m.get("at"), float(m.get("t", 0.5)))
            box = [float(v) for v in str(m["box"]).split(",")]
            box = (box[0], box[1], box[0] + box[2], box[1] + box[3])
            analysis(cv, box, t, t0, tag=m.get("tag", "ANALYSIS"))


def overlay_events(sc):
    ev = []
    for m in sc.get("moments", []):
        if m["name"] == "analysis":
            ev += analysis_events(sc["cue"](m.get("at"), float(m.get("t", 0.5))))
    return ev
