"""パチンコらしい演出の部品（ナギバク独自のデザイン。特定機種の演出は真似しない）

  hold_orb     保留変化風の玉：青 → 緑 → 赤 → 金（虹の縁）と段階的に変わる
  gauge        期待度ゲージ風：区切りのあるバーが色を変えながら満ちる
  slam         重要な数字のインパクト登場：大きく叩きつけて戻る＋集中線＋光の粒
  flash/shake  画面全体の一瞬の白フラッシュと振動（短く、要所だけ）
  glint        斜めに走る光（注目機種の登場や見出し）
  ribbon       注目機種の登場で出る斜めの帯
  emote        キャラの頭上の「！！」「汗」などの記号
  speed_lines  バクのツッコミ時の集中線
"""
import math
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .style import W, H, NAVY, TEXT, GOLD, font, prog, out3, inout, back, put, fade_img, text_layer

STAGES = [(80, 160, 255), (60, 210, 120), (240, 70, 80), (250, 205, 80)]   # 青・緑・赤・金


def stage_color(k):
    """0〜1 の期待度を、青→緑→赤→金 の色に"""
    k = max(0.0, min(1.0, k)) * (len(STAGES) - 1)
    i = min(int(k), len(STAGES) - 2)
    f = k - i
    a, b = STAGES[i], STAGES[i + 1]
    return tuple(int(a[c] + (b[c] - a[c]) * f) for c in range(3))


# ---------------------------------------------------------------- 保留玉
@lru_cache(maxsize=16)
def _orb(stage, r):
    S = 3
    R = r * S
    im = Image.new("RGBA", (R * 2 + 40 * S, R * 2 + 40 * S), (0, 0, 0, 0))
    c = im.width / 2
    col = STAGES[stage]
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((c - R - 14 * S, c - R - 14 * S, c + R + 14 * S, c + R + 14 * S), fill=col + (120,))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(10 * S)))
    yy, xx = np.mgrid[0:im.height, 0:im.width].astype(np.float32)
    d = np.sqrt((xx - c) ** 2 + (yy - c) ** 2) / R
    hl = np.sqrt((xx - (c - R * 0.35)) ** 2 + (yy - (c - R * 0.4)) ** 2) / R
    body = np.zeros((im.height, im.width, 4), np.float32)
    shade = np.clip(1.15 - d * 0.55, 0, 1)
    for k in range(3):
        body[..., k] = col[k] * shade + 255 * np.clip(0.55 - hl, 0, 1) * 1.4
    body[..., 3] = np.clip((1 - d) * R / 1.5, 0, 1) * 255
    body = np.clip(body, 0, 255).astype(np.uint8)
    im.alpha_composite(Image.fromarray(body, "RGBA"))
    dr = ImageDraw.Draw(im)
    if stage == 3:   # 金は虹の縁
        for i, rc in enumerate([(255, 80, 80), (255, 200, 60), (90, 220, 120), (80, 170, 255), (190, 110, 255)]):
            a0 = i * 72
            dr.arc((c - R - 6 * S, c - R - 6 * S, c + R + 6 * S, c + R + 6 * S), a0, a0 + 72, fill=rc + (255,), width=6 * S)
    else:
        dr.ellipse((c - R, c - R, c + R, c + R), outline=(255, 255, 255, 200), width=3 * S)
    # ナギバクの研究所マーク（オリジナル）：中央に小さな「N」
    dr.text((c, c + 2 * S), "N", font=font("black", int(R * 0.9)), fill=(255, 255, 255, 230), anchor="mm",
            stroke_width=3 * S, stroke_fill=(0, 0, 0, 90))
    return im.resize((im.width // S, im.height // S), Image.LANCZOS)


def hold_orb(cv, center, r, t, steps, burst_at=None):
    """steps=[色が変わる時刻, ...]（4段階）。burst_at で弾けて消える"""
    stage = sum(1 for s in steps if t >= s) - 1
    if stage < 0:
        return
    stage = min(stage, 3)
    pop = 1 + 0.35 * (1 - out3(prog(t, steps[stage], 0.22)))
    a = 1.0
    if burst_at is not None and t >= burst_at:
        k = prog(t, burst_at, 0.25)
        pop *= 1 + 0.8 * k
        a = 1 - k
    img = _orb(stage, int(r * pop))
    put(cv, img, (center[0] - img.width / 2, center[1] - img.height / 2), a)
    # 変化の瞬間にリング
    k = prog(t, steps[stage], 0.4)
    if 0 < k < 1:
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        rr = r * (1 + 1.6 * out3(k))
        ImageDraw.Draw(ring).ellipse((center[0] - rr, center[1] - rr, center[0] + rr, center[1] + rr),
                                     outline=STAGES[stage] + (int(255 * (1 - k)),), width=8)
        cv.alpha_composite(ring)


# ---------------------------------------------------------------- 期待度ゲージ
def gauge(cv, xy, w, h, k, label="期待度", segs=10):
    x, y = xy
    lay = Image.new("RGBA", (w + 200, h + 60), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.text((0, h / 2 + 20), label, font=font("black", 34), fill=TEXT, anchor="lm", stroke_width=4, stroke_fill=NAVY)
    gx = 150
    d.rounded_rectangle((gx, 20, gx + w, 20 + h), 10, fill=(10, 16, 30, 220), outline=(255, 255, 255, 120), width=2)
    sw = (w - 12) / segs
    n = k * segs
    for i in range(segs):
        f = max(0.0, min(1.0, n - i))
        if f <= 0:
            continue
        col = stage_color((i + 1) / segs)
        x0 = gx + 6 + sw * i
        d.rounded_rectangle((x0 + 2, 26, x0 + 2 + (sw - 4) * f, 14 + h), 5, fill=col + (255,))
    if k >= 0.999:
        d.text((gx + w + 20, h / 2 + 20), "MAX", font=font("black", 40), fill=GOLD, anchor="lm", stroke_width=4, stroke_fill=NAVY)
    put(cv, lay, (x, y - 20), 1.0)


# ---------------------------------------------------------------- 数字のインパクト
def slam_scale(t, t0):
    """t0 で大きく叩きつけ、0.3秒で等倍に戻る"""
    if t < t0:
        return None
    k = prog(t, t0, 0.32)
    return 1.0 + 0.9 * (1 - back(k, 2.2)) if k < 1 else 1.0


@lru_cache(maxsize=8)
def _burst(r_in, r_out, n, col):
    im = Image.new("RGBA", (r_out * 2, r_out * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = r_out
    rng = np.random.default_rng(5)
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.05, 0.05)
        w = rng.uniform(0.015, 0.04)
        ro = r_out * rng.uniform(0.75, 1.0)
        pts = [(c + r_in * math.cos(a - w), c + r_in * math.sin(a - w)),
               (c + ro * math.cos(a), c + ro * math.sin(a)),
               (c + r_in * math.cos(a + w), c + r_in * math.sin(a + w))]
        d.polygon(pts, fill=col + (170,))
    return im


def burst(cv, center, t, t0, col=GOLD, r_in=170, r_out=620):
    """集中線（放射状の光）。叩きつけの瞬間に広がって消える"""
    k = prog(t, t0, 0.6)
    if k <= 0 or k >= 1:
        return
    img = _burst(r_in, r_out, 36, col)
    s = 0.6 + 0.6 * out3(k)
    img = img.resize((int(img.width * s), int(img.height * s)), Image.BILINEAR)
    img = img.rotate(12 * k, resample=Image.BILINEAR)
    put(cv, img, (center[0] - img.width / 2, center[1] - img.height / 2), 1 - k)


def sparkles(cv, center, t, t0, n=22, spread=420, col=GOLD, seed=1):
    k = prog(t, t0, 0.9)
    if k <= 0 or k >= 1:
        return
    rng = np.random.default_rng(seed)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        dist = spread * rng.uniform(0.3, 1.0) * out3(k)
        x, y = center[0] + dist * math.cos(a), center[1] + dist * math.sin(a) + 80 * k * k
        s = rng.uniform(5, 12) * (1 - k)
        d.polygon([(x, y - s * 2), (x + s * 0.5, y - s * 0.5), (x + s * 2, y), (x + s * 0.5, y + s * 0.5),
                   (x, y + s * 2), (x - s * 0.5, y + s * 0.5), (x - s * 2, y), (x - s * 0.5, y - s * 0.5)],
                  fill=col + (int(255 * (1 - k)),))
    cv.alpha_composite(lay)


def slam_text(cv, img, center, t, t0):
    s = slam_scale(t, t0)
    if s is None:
        return
    im = img.resize((int(img.width * s), int(img.height * s)), Image.BILINEAR) if abs(s - 1) > 1e-3 else img
    a = min(1.0, prog(t, t0, 0.08) * 1.0)
    put(cv, im, (center[0] - im.width / 2, center[1] - im.height / 2), a)


# ---------------------------------------------------------------- 画面全体
def flash(cv, t, t0, strength=0.55, dur=0.18, col=(255, 255, 255)):
    k = prog(t, t0, dur)
    if 0 < k < 1:
        cv.alpha_composite(Image.new("RGBA", (W, H), col + (int(255 * strength * (1 - k) ** 2),)))


def shake_offset(t, events, amp=14, dur=0.28):
    """events の時刻から短く揺れる。(dx, dy) を返す"""
    dx = dy = 0.0
    for t0 in events:
        k = (t - t0) / dur
        if 0 <= k < 1:
            f = (1 - k) ** 2
            dx += amp * f * math.sin(t * 95)
            dy += amp * 0.6 * f * math.cos(t * 81)
    return int(dx), int(dy)


def apply_shake(cv, off):
    if off == (0, 0):
        return cv
    out = Image.new("RGBA", cv.size, (0, 0, 0, 255))
    out.paste(cv, off)
    return out


# ---------------------------------------------------------------- 光・帯
def glint(cv, box, t, t0, dur=0.6):
    """box の範囲を斜めの光が横切る"""
    k = prog(t, t0, dur)
    if k <= 0 or k >= 1:
        return
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    cx = -w * 0.3 + (w * 1.6) * inout(k)
    for off, a in ((0, 140), (40, 70)):
        d.polygon([(cx + off, 0), (cx + off + 70, 0), (cx + off - 120, h), (cx + off - 190, h)], fill=(255, 255, 255, a))
    put(cv, lay.filter(ImageFilter.GaussianBlur(6)), (x0, y0), 1.0)


def ribbon(cv, txt, xy, t, t0, dur=1.6, col=(214, 40, 60)):
    """注目機種の登場で出る斜めの帯（左から差し込んで、しばらく留まって消える）"""
    k_in = out3(prog(t, t0, 0.25))
    k_out = prog(t, t0 + dur, 0.25)
    if k_in <= 0 or k_out >= 1:
        return
    f = font("black", 46)
    tw = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(txt, font=f)
    band = Image.new("RGBA", (int(tw + 120), 84), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    d.polygon([(30, 0), (band.width, 0), (band.width - 30, 84), (0, 84)], fill=col + (240,))
    d.line((30, 4, band.width, 4), fill=GOLD + (255,), width=5)
    d.line((0, 80, band.width - 30, 80), fill=GOLD + (255,), width=5)
    d.text((band.width / 2, 42), txt, font=f, fill=(255, 255, 255), anchor="mm", stroke_width=4, stroke_fill=(80, 0, 10))
    band = band.rotate(8, expand=True, resample=Image.BICUBIC)
    put(cv, band, (xy[0] - 200 * (1 - k_in), xy[1]), (1 - k_out))


# ---------------------------------------------------------------- キャラまわり
def emote(cv, kind, xy, t, t0, scale=1.0):
    """頭上の記号。surprise=！！ sweat=汗 idea=電球の代わりの光 """
    k = prog(t, t0, 0.25)
    if k <= 0:
        return
    s = scale * (0.4 + 0.6 * back(k, 2.0))
    lay = Image.new("RGBA", (220, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    if kind == "surprise":
        for i, ang in enumerate((-12, 10)):
            tl = text_layer("！", font("black", 110), (255, 220, 60), stroke=8, stroke_fill=(120, 40, 0), pad=4)
            tl = tl.rotate(ang, expand=True, resample=Image.BICUBIC)
            lay.alpha_composite(tl, (10 + 80 * i, 0))
    elif kind == "sweat":
        d.ellipse((70, 60, 120, 130), fill=(130, 200, 255, 255), outline=(30, 80, 160, 255), width=5)
        d.polygon([(95, 20), (72, 80), (118, 80)], fill=(130, 200, 255, 255))
    elif kind == "spark":
        for i in range(3):
            x, y = 40 + 60 * i, 60 + (i % 2) * 30
            d.polygon([(x, y - 30), (x + 8, y - 8), (x + 30, y), (x + 8, y + 8), (x, y + 30), (x - 8, y + 8), (x - 30, y), (x - 8, y - 8)],
                      fill=GOLD + (255,))
    img = lay.resize((int(lay.width * s), int(lay.height * s)), Image.BILINEAR)
    wob = 4 * math.sin((t - t0) * 18) if t - t0 < 1.2 else 0
    put(cv, img, (xy[0] - img.width / 2, xy[1] - img.height + wob), 1.0)


@lru_cache(maxsize=4)
def _speed(col):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(9)
    cx, cy = W * 0.78, H * 0.7
    for i in range(70):
        a = rng.uniform(0, 2 * math.pi)
        r0 = rng.uniform(260, 420)
        r1 = 1600
        w = rng.uniform(0.004, 0.012)
        d.polygon([(cx + r0 * math.cos(a), cy + r0 * math.sin(a)),
                   (cx + r1 * math.cos(a - w), cy + r1 * math.sin(a - w)),
                   (cx + r1 * math.cos(a + w), cy + r1 * math.sin(a + w))], fill=col + (90,))
    return im


def speed_lines(cv, t, t0, dur=0.9, col=(242, 140, 56)):
    """バクのツッコミ：画面右下から集中線（短く）"""
    k = prog(t, t0, dur)
    if 0 < k < 1:
        a = math.sin(math.pi * k)
        put(cv, _speed(col), (0, 0), a)
