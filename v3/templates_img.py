"""I 画像が主役のシーン（@show … mode=full / zoom / gallery）と、図解に重ねる表示（side / top / background）

  full     全画面。ゆっくり寄りながら見出し。小さい画像はぼかした拡大を背景に敷き、本体は枠に収める
  zoom     資料を紙のように置き、emphasis_target へ寄って蛍光ペンの印（url があればブラウザ風の枠）
  gallery  複数の画像を順番に。前の画像は左へ小さく積んでいく（items の "ref@語句" で出す時刻を指定）
  side     左に図解（元の画面を縮小）、右に画像
  top      上に画像の帯、下に図解（縮小）
  background  図解の後ろに画像を薄く敷く
"""
import math
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

from .style import (W, H, GOLD, BLUE, TEXT, SUB, NAVY, font, prog, out3, inout, back, put, scaled, label,
                    gold_text, text_layer, fit_size, bokeh_bg, lab_bg, source_line)
from .photos import contain, cover
from . import fx
from .images import TYPE_LABEL

ACC = {"machine": (255, 205, 70), "history": (230, 180, 120), "document": (120, 200, 255), "gallery": (255, 140, 170)}


def _lib(lib):
    return lib.images


def _emph_center(it):
    e = it.emphasis
    if not e:
        return 0.5, 0.42
    return ((e[0] + e[2]) / 2) / it.img.width, ((e[1] + e[3]) / 2) / it.img.height


@lru_cache(maxsize=64)
def _blur_bg(key, img_id, w, h):
    return None


def _framed(img, w, h, border=10, col=(245, 240, 228)):
    """写真・資料を白い枠に収めて影をつける"""
    im = contain(img, w - border * 2, h - border * 2, max_up=3.0)
    fr = Image.new("RGBA", (im.width + border * 2, im.height + border * 2), col + (255,))
    fr.alpha_composite(im.convert("RGBA"), (border, border))
    pad = 30
    out = Image.new("RGBA", (fr.width + pad * 2, fr.height + pad * 2), (0, 0, 0, 0))
    m = Image.new("L", out.size, 0)
    ImageDraw.Draw(m).rectangle((pad + 10, pad + 16, pad + fr.width + 10, pad + fr.height + 16), fill=170)
    sh = Image.new("RGBA", out.size, (0, 0, 0, 255))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(14)))
    out.alpha_composite(sh)
    out.alpha_composite(fr, (pad, pad))
    return out, pad, border, im.size


_FRAME_CACHE = {}


def framed(it, w, h, border=10):
    k = (it.ref, w, h, border)
    if k not in _FRAME_CACHE:
        _FRAME_CACHE[k] = _framed(it.img, w, h, border)
    return _FRAME_CACHE[k]


_BG_CACHE = {}


def backdrop(it):
    """画像を画面いっぱいに：大きい画像はそのまま、小さい画像はぼかして背景にする"""
    if it.ref not in _BG_CACHE:
        big = cover(it.img.convert("RGB"), W, H, focus=_emph_center(it)).convert("RGBA")
        if max(it.img.size) < 1400 or it.placeholder:
            big = big.filter(ImageFilter.GaussianBlur(18))
            big = ImageEnhance.Brightness(big).enhance(0.55)
        _BG_CACHE[it.ref] = big
    return _BG_CACHE[it.ref]


def caption_block(cv, it, t, t0=0.3, xy=(80, 120), maxw=1300):
    if not it.caption:
        return
    k = out3(prog(t, t0, 0.5))
    tag = label(TYPE_LABEL.get(it.type, it.type.upper()), BLUE if it.type == "document" else (200, 120, 40), 24)
    put(cv, tag, (xy[0] - 30 * (1 - k), xy[1]), k)
    g = gold_text(it.caption, fit_size(it.caption, "black", 76, maxw))
    put(cv, g, (xy[0] - 50 * (1 - k), xy[1] + tag.height + 8), k)


def mark(cv, box, t, ts, col=(255, 225, 40)):
    """蛍光ペン（左→右）＋赤枠"""
    km = prog(t, ts, 0.45)
    if km <= 0:
        return
    X0, Y0, X1, Y1 = box
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rectangle((X0 - 6, Y0 - 4, X0 - 6 + (X1 - X0 + 12) * out3(km), Y1 + 4), fill=col + (90,))
    if km >= 1:
        ko = out3(prog(t, ts + 0.45, 0.25))
        d.rounded_rectangle((X0 - 10, Y0 - 8, X1 + 10, Y1 + 8), 8, outline=(230, 40, 60, int(255 * ko)), width=5)
    cv.alpha_composite(lay)


def _cue(sc, v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return sc["cue"](v, default) - 0.15 if v else default


class ImageScene:
    def busy(self, sc):
        mode = sc["opts"].get("mode")
        if mode == "full":
            return [(0, 0, W, H)]
        if mode == "gallery":
            return [(80, 150, W - 360, 880)]
        return [(90, 110, 1440, 860)]

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        it = _lib(lib).get(o["ref"])
        getattr(self, "_" + o.get("mode", "full"))(cv, sc, t, lib, it)

    # ------------------------------------------------ 全画面
    def _full(self, cv, sc, t, lib, it):
        bg = backdrop(it)
        z = 1.0 + 0.07 * inout(prog(t, 0, max(sc["dur"], 2.0)))
        fx_, fy_ = _emph_center(it)
        cv.paste(bg.resize((W, H), Image.BILINEAR, box=_zbox(z, fx_ * W, fy_ * H)))
        small = max(it.img.size) < 1400 or it.placeholder
        if small:                                       # 小さい画像は枠に収めて中央に（引き伸ばしすぎない）
            fr, pad, _, _ = framed(it, 1180, 700, border=0 if it.placeholder else 12)
            k = out3(prog(t, 0.15, 0.6))
            zz = (0.94 + 0.06 * k) * (1 + 0.03 * prog(t, 0.8, max(2.0, sc["dur"])))
            g = scaled(fr, zz)
            put(cv, g, ((W - g.width) / 2 + 160, (H - g.height) / 2 + 60 + 40 * (1 - k)), min(1, k * 1.5))
        # 下と左上を暗くして文字を読みやすく
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        for y in range(0, 360, 6):
            d.rectangle((0, y, W, y + 6), fill=(6, 10, 20, int(150 * (1 - y / 360))))
        cv.alpha_composite(sh)
        caption_block(cv, it, t, 0.35, (80, 110), 1500)
        if it.source:
            source_line(cv, it.source)

    # ------------------------------------------------ 資料の拡大
    def _zoom(self, cv, sc, t, lib, it):
        cv.paste(lab_bg())
        cv.alpha_composite(Image.new("RGBA", (W, H), (6, 10, 22, 120)))
        VX, VY, VW, VH = 110, 230, 1280, 590          # 上は見出し、下は字幕のための空き
        img = it.img
        asp = VW / VH
        full = _fit_rect(0, 0, img.width, img.height, asp, img)
        e = it.emphasis or [img.width * 0.1, img.height * 0.1, img.width * 0.9, img.height * 0.6]
        ex = (e[2] - e[0]) * 0.25
        foc = _fit_rect(e[0] - ex, e[1] - ex, e[2] + ex, e[3] + ex, asp, img)
        k = out3(prog(t, 0.8, 1.1))
        cam = [full[j] + (foc[j] - full[j]) * k for j in range(4)]
        view = img.convert("RGB").resize((VW, VH), Image.BICUBIC, box=tuple(cam)).convert("RGBA")
        paper = Image.new("RGBA", (VW + 24, VH + 24), (245, 240, 228, 255))
        paper.alpha_composite(view, (12, 12))
        ke = out3(prog(t, 0.0, 0.5))
        rot = 1.2 * (1 - ke) - 0.4
        pg = paper.rotate(rot, expand=True, resample=Image.BICUBIC)
        shadow = Image.new("RGBA", (pg.width + 60, pg.height + 60), (0, 0, 0, 0))
        m = Image.new("L", shadow.size, 0)
        m.paste(pg.split()[3], (40, 46))
        sb = Image.new("RGBA", shadow.size, (0, 0, 0, 255))
        sb.putalpha(m.filter(ImageFilter.GaussianBlur(16)).point(lambda v: v * 0.7))
        shadow.alpha_composite(sb)
        shadow.alpha_composite(pg, (30, 30))
        put(cv, shadow, (VX - 42, VY - 42 + 80 * (1 - ke)), min(1, ke * 1.6))
        if it.emphasis and not it.placeholder:
            sx, sy = VW / (cam[2] - cam[0]), VH / (cam[3] - cam[1])
            box = (VX + (e[0] - cam[0]) * sx, VY + (e[1] - cam[1]) * sy, VX + (e[2] - cam[0]) * sx, VY + (e[3] - cam[1]) * sy)
            mark(cv, box, t, max(1.9, _cue(sc, sc["opts"].get("mark_at"), 2.0)))
        caption_block(cv, it, t, 0.2, (90, 66), 1300)
        if it.source:
            source_line(cv, it.source)

    # ------------------------------------------------ ギャラリー
    def _gallery(self, cv, sc, t, lib, it):
        cv.paste(bokeh_bg())
        il = _lib(lib)
        items = [s.split("@") for s in it.items]
        n = len(items)
        span = max(1.0, sc["dur"] - 0.6)
        times = []
        for i, parts in enumerate(items):
            times.append(_cue(sc, parts[1], 0.4 + span * i / n) if len(parts) > 1 else 0.4 + span * i / n)
        times = [max(0.3, x) for x in times]
        cur = max([i for i, ts in enumerate(times) if ts <= t] or [0])
        # 前の画像：左に小さく積む
        for i in range(cur):
            sub = il.get(items[i][0])
            fr, pad, _, _ = framed(sub, 360, 250, border=8)
            kk = out3(prog(t, times[i + 1], 0.5)) if i + 1 < n else 1
            y = 190 + (i % 3) * 230 if True else 0
            x = 70 + (i // 3) * 40
            ang = (-4, 3, -2, 4)[i % 4]
            g = fr.rotate(ang, expand=True, resample=Image.BICUBIC)
            put(cv, g, (x, y), 0.92 * kk + 0.0)
        # 今の画像：右から大きく入ってくる
        sub = il.get(items[cur][0])
        fr, pad, _, _ = framed(sub, 1060, 600, border=0 if sub.placeholder else 12)
        k = out3(prog(t, times[cur], 0.55))
        g = fr.rotate(2 * (1 - k), expand=True, resample=Image.BICUBIC)
        put(cv, g, (500 + 320 * (1 - k), 220 + (600 - fr.height + 2 * pad) / 2), min(1, k * 1.5))
        # 見出し：ギャラリー名と、今の画像の説明
        caption_block(cv, it, t, 0.1, (80, 70), 1600) if it.caption else None
        if sub.caption:
            tl = text_layer(sub.caption, font("bold", 36), TEXT, stroke=5, pad=0)
            put(cv, tl, (530 + 320 * (1 - k), 840), k)
        # ページ数
        dots = Image.new("RGBA", (40 * n, 20), (0, 0, 0, 0))
        dd = ImageDraw.Draw(dots)
        for i in range(n):
            dd.ellipse((i * 40 + 4, 4, i * 40 + 16, 16), fill=(255, 205, 70) if i == cur else (120, 130, 150))
        put(cv, dots, (W - 380 - dots.width, 180), 1)
        if sub.source:
            source_line(cv, sub.source)

    def events(self, sc):
        o = sc["opts"]
        mode = o.get("mode", "full")
        ev = [(0.05, "whoosh")]
        if mode == "full":
            ev += [(0.2, "shutter"), (0.35, "crash")]
        elif mode == "zoom":
            ev += [(0.1, "paper"), (0.85, "swipe#2"), (max(1.9, _cue(sc, o.get("mark_at"), 2.0)), "marker")]
        elif mode == "gallery":
            items = [str(x).split("@") for x in o.get("items", [])]
            n = max(1, len(items))
            span = max(1.0, sc["dur"] - 0.6)
            for i, parts in enumerate(items):
                ts = _cue(sc, parts[1], 0.4 + span * i / n) if len(parts) > 1 else 0.4 + span * i / n
                ev.append((max(0.3, ts), f"shutter#{i % 5}"))
        return ev


def gallery_events(sc, lib):
    """ギャラリーの1枚ごとにシャッター"""
    it = lib.images.get(sc["opts"]["ref"])
    items = [s.split("@") for s in it.items]
    n = len(items)
    span = max(1.0, sc["dur"] - 0.6)
    out = []
    for i, parts in enumerate(items):
        ts = _cue(sc, parts[1], 0.4 + span * i / n) if len(parts) > 1 else 0.4 + span * i / n
        out.append((max(0.3, ts), f"shutter#{i % 5}"))
    return out


def _zbox(z, cx, cy):
    w, h = W / z, H / z
    x0 = min(max(0, cx - w / 2), W - w)
    y0 = min(max(0, cy - h / 2), H - h)
    return (x0, y0, x0 + w, y0 + h)


def _fit_rect(x0, y0, x1, y1, asp, img):
    w, h = x1 - x0, y1 - y0
    if w / h < asp:
        w = h * asp
    else:
        h = w / asp
    w, h = min(w, img.width), min(h, img.height)
    if w / h > asp:
        w = h * asp
    else:
        h = w / asp
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x0 = min(max(0, cx - w / 2), img.width - w)
    y0 = min(max(0, cy - h / 2), img.height - h)
    return [x0, y0, x0 + w, y0 + h]


# ---------------------------------------------------------------- 図解に重ねる表示
def compose_overlay(cv, sc, t, lib):
    """シーンの絵（cv）を縮めて、画像と並べる。返り値は新しい画面"""
    ov = sc.get("overlay")
    if not ov:
        return cv
    t0 = ov.get("t0", 0.0)
    if t < t0 or t > ov.get("t1", 1e9):
        return cv
    it = lib.images.get(ov["ref"])
    k = inout(prog(t, t0, 0.55))
    mode = ov["mode"]
    if mode == "background":
        bg = backdrop(it).convert("RGB")
        bg = ImageEnhance.Color(bg).enhance(0.6)
        return Image.blend(cv.convert("RGB"), bg, 0.2 * k).convert("RGBA")
    out = lab_bg().copy().convert("RGBA")
    out.alpha_composite(Image.new("RGBA", (W, H), (6, 10, 22, 110)))
    if mode == "side":
        s = 1 - 0.36 * k
        x, y = 40 * k, 150 * k
        rect = (1290, 150, 1880, 760)            # 下端は話者（右下）にかからない高さまで
    else:                                   # top
        s = 1 - 0.5 * k
        x, y = (W - W * s) / 2, 470 * k
        rect = (120, 100, 1800, 455)
    small = cv.resize((int(W * s), int(H * s)), Image.BILINEAR)
    m = Image.new("L", small.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, small.width - 1, small.height - 1), int(28 * k), fill=255)
    out.paste(small, (int(x), int(y)), m)
    ImageDraw.Draw(out).rounded_rectangle((x - 3, y - 3, x + small.width + 2, y + small.height + 2), int(28 * k),
                                          outline=(255, 205, 70, int(200 * k)), width=4)
    # 画像のパネル
    x0, y0, x1, y1 = rect
    fr, pad, border, (iw, ih) = framed(it, x1 - x0, y1 - y0 - 90, border=0 if it.placeholder else 10)
    ki = out3(prog(t, t0 + 0.25, 0.5))
    px = x0 + (x1 - x0 - fr.width) / 2 + 200 * (1 - ki) * (1 if mode == "side" else 0)
    py = y0 + (0 if mode == "side" else (y1 - y0 - 90 - fr.height) / 2) - 200 * (1 - ki) * (0 if mode == "side" else 1)
    put(out, fr, (px, py), ki)
    if it.caption:
        cap = text_layer(it.caption, font("black", fit_size(it.caption, "black", 40, x1 - x0)), GOLD, stroke=5, pad=0)
        put(out, cap, (x0 + (x1 - x0 - cap.width) / 2, py + fr.height - pad + 6), ki)
    if it.source:
        st = text_layer(it.source, font("regular", 22), (190, 198, 214), stroke=3, pad=0)
        put(out, st, (x0 + (x1 - x0 - st.width) / 2, py + fr.height - pad + 58), ki)
    return out


TEMPLATES = {"I": ImageScene()}
