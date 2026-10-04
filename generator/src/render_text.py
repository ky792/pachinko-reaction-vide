"""文字・吹き出し・帯などの画像パーツを Pillow で描く。"""
import numpy as np
from PIL import Image, ImageDraw
from .common import font

GOLD = (255, 205, 60)
RED = (230, 40, 50)
INK = (25, 25, 30)
ACC = [(80, 170, 255), (255, 190, 40), (120, 210, 110), (200, 120, 255), (255, 130, 200), (90, 220, 220)]


def dim(im, a=0.6):
    arr = np.array(im)
    arr[..., 3] = (arr[..., 3] * a).astype(np.uint8)
    return Image.fromarray(arr)


def darken(im, k=0.72):
    """透けさせずに暗くする（背景がにぎやかでも古いレスが読める）。"""
    arr = np.array(im).astype(np.float32)
    arr[..., :3] *= k
    return Image.fromarray(arr.astype(np.uint8))


def wrap(text, f, maxw):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for ch in para:
            if f.getlength(cur + ch) > maxw and cur:
                lines.append(cur); cur = ch
            else:
                cur += ch
        lines.append(cur)
    return lines


def res_bubble(cfg, no, text, emphasis=False):
    L = cfg["layout"]
    pad = 28
    if emphasis:
        fs = L["res_font_emphasis"]
    else:
        fs = L["res_font"]
        nl = len(wrap(text, font(cfg, "bold", fs), L["res_max_width"]))
        if nl > 6:
            fs = int(fs * 0.84)
        if nl > 9:
            fs = int(fs * 0.84)
    f = font(cfg, "black" if emphasis else "bold", fs)
    fh = font(cfg, "bold", 29)
    lines = wrap(text, f, L["res_max_width"])
    lh = int(fs * 1.37)
    tw = max(f.getlength(ln) for ln in lines)
    bw = int(max(tw, 380) + 2 * pad + 16)
    bh = pad + 38 + lh * len(lines) + pad - 6
    acc = ACC[no % len(ACC)]
    im = Image.new("RGBA", (bw + 12, bh + 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, bw + 10, bh + 10], 24, fill=(0, 0, 0, 120))
    d.rounded_rectangle([0, 0, bw, bh], 24, fill=(255, 253, 247), outline=acc, width=6)
    d.rounded_rectangle([0, 0, 16, bh], 8, fill=acc)
    d.text((pad + 16, pad - 12), f"{no}：名無しさん", font=fh, fill=(40, 140, 60))
    y = pad + 38
    col = RED if emphasis else INK
    for ln in lines:
        d.text((pad + 16, y), ln, font=f, fill=col)
        y += lh
    return im


def header(cfg, im, title, chapter=None):
    W = im.width
    d = ImageDraw.Draw(im)
    ft = font(cfg, "black", 50)
    d.rectangle([0, 0, W, 112], fill=(8, 8, 14))
    d.rectangle([0, 108, W, 116], fill=GOLD)
    t = f"【反応集】{title}"
    while ft.getlength(t) > W - 80 and ft.size > 30:
        ft = font(cfg, "black", ft.size - 2)
    d.text(((W - ft.getlength(t)) // 2, 56 - ft.size * 0.62), t, font=ft, fill=(255, 215, 70))
    if chapter:
        fp = font(cfg, "black", 34)
        txt = f"{chapter[0]} {chapter[1]}".strip()
        w = fp.getlength(txt) + 40
        d.rounded_rectangle([30, 128, 30 + w, 182], 27, fill=RED)
        d.text((50, 132), txt, font=fp, fill=(255, 255, 255))
    disc = cfg["layout"].get("disclaimer", "")
    if disc:  # 空文字なら表示しない
        fs = font(cfg, "regular", 26)
        d.text((24, im.height - 50), disc, font=fs, fill=(180, 180, 210))


def progress(im, p):
    d = ImageDraw.Draw(im)
    W, H = im.size
    d.rectangle([0, H - 8, W, H], fill=(40, 40, 60))
    d.rectangle([0, H - 8, int(W * max(0, min(1, p))), H], fill=GOLD)


def chapter_banner(cfg, im, number, name, bx):
    W = im.width
    d = ImageDraw.Draw(im)
    d.rectangle([bx, 330, bx + W, 600], fill=(200, 30, 45))
    d.rectangle([bx, 320, bx + W, 330], fill=GOLD)
    d.rectangle([bx, 600, bx + W, 610], fill=GOLD)
    fn, fc = font(cfg, "black", 70), font(cfg, "black", 120)
    while fc.getlength(name) > W - 360 and fc.size > 60:
        fc = font(cfg, "black", fc.size - 4)
    d.text((bx + 160, 352), number, font=fn, fill=(255, 230, 120))
    d.text((bx + 160, 432), name, font=fc, fill=(255, 255, 255), stroke_width=6, stroke_fill=(120, 10, 20))


def title_layer(cfg, size, lines, subtitle):
    W, H = size
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    fT = font(cfg, "black", 120)
    while max(fT.getlength(l) for l in lines) > W - 200:
        fT = font(cfg, "black", fT.size - 4)
    y0 = 250
    for k, ln in enumerate(lines):
        col = (255, 255, 255) if k < len(lines) - 1 else (255, 70, 80)
        sc = (20, 10, 30) if k < len(lines) - 1 else (255, 255, 255)
        d.text(((W - fT.getlength(ln)) // 2, y0 + k * int(fT.size * 1.35)), ln, font=fT, fill=col,
               stroke_width=10, stroke_fill=sc)
    if subtitle:
        tg = font(cfg, "black", 52)
        w = tg.getlength(subtitle) + 70
        y = y0 + len(lines) * int(fT.size * 1.35) + 40
        d.rounded_rectangle([W // 2 - w // 2, y, W // 2 + w // 2, y + 86], 18, fill=GOLD)
        d.text(((W - tg.getlength(subtitle)) // 2, y + 8), subtitle, font=tg, fill=(20, 10, 30))
    return lay


def say_bubble(cfg, name, color, text, tail_left, max_h=370):
    fs = 54
    while True:
        f = font(cfg, "bold", fs)
        lines = wrap(text, f, 1250)
        lh = int(fs * 1.38)
        h = lh * len(lines) + 74
        if h + 64 <= max_h or fs <= 36:
            break
        fs -= 4
    w = int(max(f.getlength(l) for l in lines)) + 90
    im = Image.new("RGBA", (w + 20, h + 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 40, w + 10, h + 34], 34, fill=(0, 0, 0, 110))
    d.rounded_rectangle([0, 30, w, h + 26], 34, fill=(255, 255, 255), outline=GOLD, width=7)
    tx = 110 if tail_left else w - 110
    d.polygon([(tx - 30, h + 22), (tx + 30, h + 22), (tx + (-18 if tail_left else 18), h + 62)], fill=(255, 255, 255))
    nf = font(cfg, "black", 34)
    nw = nf.getlength(name) + 44
    d.rounded_rectangle([30, 0, 30 + nw, 56], 20, fill=tuple(color))
    d.text((52, 3), name, font=nf, fill=(255, 255, 255))
    for k, l in enumerate(lines):
        d.text((45, 66 + lh * k), l, font=f, fill=INK)
    return im


def ending_panel(cfg, size, question, choices, lines):
    W, H = size
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    fh = font(cfg, "black", 46)
    d.rounded_rectangle([120, 150, 120 + fh.getlength("みんなに質問") + 60, 222], 20, fill=GOLD)
    d.text((150, 156), "みんなに質問", font=fh, fill=(20, 10, 30))
    fq = font(cfg, "black", 66)
    y = 250
    for ln in question.split("\n"):
        d.text((130, y), ln, font=fq, fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0))
        y += 90
    fc = font(cfg, "black", 48)
    x, y = 130, y + 30
    for c in choices:
        t = f"「{c}」"
        w = fc.getlength(t) + 50
        if x + w > W - 520:
            x, y = 130, y + 90
        d.rounded_rectangle([x, y, x + w, y + 74], 37, fill=(255, 255, 255), outline=RED, width=5)
        d.text((x + 25, y + 6), t, font=fc, fill=RED)
        x += w + 24
    fl = font(cfg, "bold", 50)
    y += 120
    for ln in lines[:2]:
        for sub in ln.split("\n"):
            d.text((130, y), sub, font=fl, fill=(255, 215, 70), stroke_width=3, stroke_fill=(0, 0, 0))
            y += 70
    return lay


def subscribe_layer(cfg, size):
    W, H = size
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    f = font(cfg, "black", 64)
    # チャンネル登録ボタン
    t1 = "チャンネル登録"
    w1 = f.getlength(t1) + 120
    x1, y1 = (W - w1) // 2 - 260, 360
    d.rounded_rectangle([x1, y1, x1 + w1, y1 + 120], 60, fill=(220, 30, 40))
    d.polygon([(x1 + 40, y1 + 36), (x1 + 40, y1 + 84), (x1 + 80, y1 + 60)], fill=(255, 255, 255))
    d.text((x1 + 95, y1 + 18), t1, font=f, fill=(255, 255, 255))
    # 高評価ボタン
    t2 = "高評価"
    w2 = f.getlength(t2) + 150
    x2 = x1 + w1 + 40
    d.rounded_rectangle([x2, y1, x2 + w2, y1 + 120], 60, fill=(255, 255, 255))
    # 親指アイコン（簡易）
    d.rounded_rectangle([x2 + 38, y1 + 52, x2 + 58, y1 + 92], 4, fill=(40, 40, 50))
    d.rounded_rectangle([x2 + 62, y1 + 48, x2 + 110, y1 + 94], 10, fill=(40, 40, 50))
    d.polygon([(x2 + 64, y1 + 52), (x2 + 80, y1 + 22), (x2 + 92, y1 + 26), (x2 + 88, y1 + 52)], fill=(40, 40, 50))
    d.text((x2 + 125, y1 + 18), t2, font=f, fill=(40, 40, 50))
    fs = font(cfg, "bold", 52)
    msg = "よろしくお願いします！"
    d.text(((W - fs.getlength(msg)) // 2, y1 + 170), msg, font=fs, fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    return lay


def corner_label(cfg, im, text, alpha=1.0, y=128):
    """画面右上の機種名ラベル（画面端）。"""
    W = im.width
    f = font(cfg, "black", 32)
    while f.getlength(text) > 760 and f.size > 20:
        f = font(cfg, "black", f.size - 2)
    w = int(f.getlength(text)) + 48
    lay = Image.new("RGBA", (w + 8, 62), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle([4, 4, w + 4, 58], 14, fill=(15, 15, 25, 225), outline=GOLD, width=3)
    d.text((28, 10), text, font=f, fill=(255, 225, 120))
    if alpha < 1:
        lay = dim(lay, max(0.0, alpha))
    im.paste(lay, (W - w - 40, y), lay)


def image_panel(im, src, x, y, w, h, p, zoom, fade, label, cfg):
    """実機画像パネル（比率そのまま・軽いズーム＋パン）。x, y は枠の左上、w, h は枠の中の画像サイズ。"""
    z = 1 + zoom * p                     # だんだん寄る
    rw, rh = max(w, int(w * z)), max(h, int(h * z))
    big = src.resize((rw, rh), Image.BILINEAR)
    ox = int((rw - w) * (0.5 + 0.3 * (p - 0.5)))
    oy = (rh - h) // 2
    pic = big.crop((ox, oy, ox + w, oy + h))
    frame = Image.new("RGBA", (w + 16, h + 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([0, 0, w + 15, h + 15], 14, fill=(255, 205, 60, 255))
    frame.paste(pic, (8, 8))
    if label:
        fs = 28
        f = font(cfg, "black", fs)
        lines = wrap(label, f, w - 30)
        while len(lines) > 2 and fs > 18:
            fs -= 2; f = font(cfg, "black", fs); lines = wrap(label, f, w - 30)
        lh = int(fs * 1.3)
        bh = lh * len(lines) + 12
        d.rectangle([8, h + 8 - bh, w + 7, h + 7], fill=(0, 0, 0, 200))
        for i, ln in enumerate(lines):
            d.text((20, h + 8 - bh + 6 + i * lh), ln, font=f, fill=(255, 255, 255))
    if fade < 1:
        frame = dim(frame, max(0.0, fade))
    im.paste(frame, (x - 8, y - 8), frame)


def telop(cfg, im, text, y, alpha=1.0):
    W = im.width
    f = font(cfg, "black", 72)
    w = int(f.getlength(text)) + 90
    lay = Image.new("RGBA", (w, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle([0, 0, w - 1, 111], 26, fill=(230, 40, 50, 235), outline=(255, 255, 255), width=5)
    d.text((45, 6), text, font=f, fill=(255, 255, 255))
    if alpha < 1:
        lay = dim(lay, max(0.0, alpha))
    im.paste(lay, ((W - w) // 2, y), lay)
