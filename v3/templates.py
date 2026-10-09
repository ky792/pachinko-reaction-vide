"""テンプレート A〜F。どれも「シーン内の経過秒 t」から1枚の絵を作る。

  A 実機・資料写真が主役の全画面        photo
  B 写真＋機種名＋スペックの紹介         machine（年表→実機→機種名→スペックの順に出る）
  C 年表・カレンダーの歴史解説           era / calendar
  D グラフ・数字による性能比較           stat / compare
  E 要点を順番に出す説明                 points
  F ナギバクの掛け合い                   talk

各テンプレートは busy(scene) で「情報がある領域」を返す。キャラはその領域を避けて置かれる。
表示タイミングは scene["cue"](語句) で「その語句をナレーションで言う瞬間」に合わせる。
"""
import re

import numpy as np
from PIL import Image, ImageDraw

from functools import lru_cache

from PIL import ImageEnhance, ImageFilter

from .style import (W, H, NAVY, TEXT, SUB, GOLD, RED, BLUE, font, prog, out3, inout, back, lerp, put, scaled,
                    text_layer, gold_text, label, spaced, fit_size, dark_grad, metal_bg, bokeh_bg, lab_bg,
                    chip, source_line, paper_bg, sunburst)
from .media import with_shadow
from .photos import contain, cover
from . import fx, moments


def machine_photo(lib, sc, roles=("front",)):
    """シーンの機種の写真を、指定の順で探す（実物があればそれ、無ければ最初の役割の仮素材）"""
    key = (sc.get("machine") or {}).get("photos")
    if not key or not getattr(lib, "photos", None):
        return None
    for r in roles:
        ph = lib.photos.machine(key, r)
        if not ph.placeholder:
            return ph
    return lib.photos.machine(key, "front")       # 実物が1枚も無いときは、実機の形の仮素材（「仮素材」と明記）


def photo_notes(cv, ph, credit=True):
    if ph is None:
        return
    if ph.note:
        chip(cv, f"{ph.note}（{ph.meta.get('file', ph.role)}）" if ph.placeholder else ph.note)
    if credit and ph.credit:
        source_line(cv, ph.credit)


def with_credit(src, ph):
    """出典の行に写真のクレジットを足す（1行にまとめて重ならないように）"""
    if ph is not None and getattr(ph, "credit", ""):
        return f"{src}　写真：{ph.credit}" if src else f"写真：{ph.credit}"
    return src

NUM = re.compile(r"(約?[0-9][0-9,.]*(?:%|個|回転|回|分の1)|1/[0-9][0-9.]*)")


def rich_line(d, xy, txt, f, base, key, key_font=None, stroke=5):
    """{…} の部分だけ色と大きさを変えて左揃えで描く"""
    x, y = xy
    for part in re.split(r"(\{[^}]*\})", txt):
        if not part:
            continue
        k = part.startswith("{")
        s = part.strip("{}")
        ff = (key_font or f) if k else f
        d.text((x, y), s, font=ff, fill=key if k else base, anchor="lm", stroke_width=stroke, stroke_fill=NAVY)
        x += d.textlength(s, font=ff)


# ================================================================ A 写真が主役
class Photo:
    def busy(self, sc):
        return [(40, 100, 1100, 420)]

    def draw(self, cv, sc, t, lib):
        if sc["variant"] == "archive":
            return self._archive(cv, sc, t, lib)
        o = sc["opts"]
        a = lib.get(o.get("asset", "hall"))
        src = a.img.convert("RGB")
        s = max(W / src.width, H / src.height)
        z = 1.0 + 0.06 * inout(prog(t, 0, sc["dur"] + 0.4))
        cw, ch = W / (s * z), H / (s * z)
        cx, cy = src.width / 2, src.height / 2 - 20 * prog(t, 0, sc["dur"])
        img = src.crop((int(cx - cw / 2), int(cy - ch / 2), int(cx + cw / 2), int(cy + ch / 2))).resize((W, H), Image.BILINEAR)
        cv.paste(img.convert("RGBA"))
        cv.alpha_composite(Image.new("RGBA", (W, H), (6, 10, 20, 70)))
        if o.get("headline"):
            k = out3(prog(t, 0.35, 0.6))
            g = gold_text(o["headline"], fit_size(o["headline"], "black", 132, 1500))
            put(cv, g, (70 - 40 * (1 - k), 120), k)
            fx.glint(cv, (70, 120, 70 + g.width, 120 + g.height), t, 1.0, 0.7)
            if o.get("sub"):
                put(cv, text_layer(o["sub"], font("black", 52), TEXT, stroke=6), (110, 120 + g.height - 30), out3(prog(t, 0.8, 0.5)))
        if a.note:
            chip(cv, a.note)
        if a.credit and not a.placeholder:
            source_line(cv, a.credit)


    def _archive(self, cv, sc, t, lib):
        """歴史資料：紙の上に額縁つきの写真。色はほんの少しだけ古く、ズームは控えめ"""
        o = sc["opts"]
        ph = lib.photos.hall(o.get("hall", "max_era"), o.get("role", "main"))
        cv.paste(paper_bg())
        fw, fh = 1000, 640                       # 額縁の中の写真の大きさ
        z = 1.0 + 0.035 * prog(t, 0, sc["dur"] + 0.5)
        if not hasattr(self, "_cache"):
            self._cache = {}
        ck = (id(ph), fw, fh)
        if ck not in self._cache:
            base = cover(ph.img.convert("RGB"), int(fw * 1.04), int(fh * 1.04), ph.focus)
            g = ImageEnhance.Color(base).enhance(0.72)                       # 彩度を少し落とす
            warm = Image.new("RGB", g.size, (255, 226, 180))
            g = Image.blend(g, Image.composite(g, warm, Image.new("L", g.size, 200)), 0.25)
            self._cache[ck] = g.convert("RGBA")
        src = self._cache[ck]
        cw, ch = int(fw / z * 1.0), int(fh / z * 1.0)
        x0 = (src.width - cw) // 2
        y0 = (src.height - ch) // 2
        photo = src.crop((x0, y0, x0 + cw, y0 + ch)).resize((fw, fh), Image.BILINEAR)
        frame = Image.new("RGBA", (fw + 44, fh + 44 + 60), (0, 0, 0, 0))
        fd = ImageDraw.Draw(frame)
        fd.rectangle((0, 0, frame.width - 1, frame.height - 1), fill=(250, 247, 238, 255))
        frame.alpha_composite(photo, (22, 22))
        cap = o.get("caption", ph.note or "")
        if cap:
            fd.text((frame.width / 2, fh + 22 + 32), cap, font=font("medium", 26), fill=(90, 80, 66), anchor="mm")
        ka = out3(prog(t, 0.05, 0.6))
        fr = frame.rotate(-1.6 + 0.8 * (1 - ka), expand=True, resample=Image.BICUBIC)
        sh = Image.new("RGBA", fr.size, (0, 0, 0, 0))
        sh.putalpha(fr.split()[3].point(lambda v: v * 0.45))
        sh = sh.filter(ImageFilter.GaussianBlur(16))
        fx0, fy0 = 790 + 40 * (1 - ka), 120
        put(cv, sh, (fx0 + 14, fy0 + 22), ka)
        put(cv, fr, (fx0, fy0), ka)
        # 左：年号と見出し
        k1 = out3(prog(t, 0.35, 0.5))
        put(cv, label(o.get("tag", "ARCHIVE"), NAVY, 24), (110, 210), k1)
        yr = str(o.get("year", ""))
        if yr:
            g = gold_text(yr, fit_size(yr, "black", 190, 600))
            put(cv, g, (90 - 30 * (1 - k1), 250), k1)
            fx.glint(cv, (90, 250, 90 + g.width, 250 + g.height), t, 0.9, 0.6)
        k2 = out3(prog(t, 0.6, 0.5))
        if o.get("headline"):
            hl = text_layer(o["headline"], font("black", fit_size(o["headline"], "black", 92, 640)), NAVY, pad=0)
            put(cv, hl, (110, 500 + 16 * (1 - k2)), k2)
            ln = Image.new("RGBA", (max(1, int(hl.width * k2)), 8), GOLD + (255,))
            put(cv, ln, (110, 500 + hl.height + 22), k2)
        if o.get("sub"):
            put(cv, text_layer(o["sub"], font("bold", 44), (70, 64, 56), pad=0), (112, 650), out3(prog(t, 0.8, 0.5)))
        if ph.placeholder:
            chip(cv, ph.note)
        if ph.credit and not ph.meta.get("license") == "ai":
            source_line(cv, ph.credit)


def _events_A(sc):
    if sc["variant"] == "archive":
        return [(0.05, "whoosh"), (0.9, "sparkle")]
    return [(0.3, "whoosh"), (1.0, "sparkle")]


Photo.events = staticmethod(_events_A)


# ================================================================ B 実機＋機種名＋スペック
@lru_cache(maxsize=1)
def _sunburst():
    return sunburst(720, 28, GOLD, 70)


@lru_cache(maxsize=8)
def _name_banner(name):
    g = gold_text(name, fit_size(name, "black", 92, 1100))
    bw, bh = g.width + 140, g.height + 30
    band = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    d.polygon([(40, 0), (bw, 0), (bw - 40, bh), (0, bh)], fill=(10, 16, 30, 235))
    d.line((40, 3, bw, 3), fill=GOLD + (255,), width=5)
    d.line((0, bh - 3, bw - 40, bh - 3), fill=GOLD + (255,), width=5)
    band.alpha_composite(g, ((bw - g.width) // 2, (bh - g.height) // 2))
    return band

GAUGE = 1.0     # 期待度ゲージが満ちる秒数


class Machine:
    TEXT_X = 900

    def busy(self, sc):
        return [(150, 180, 820, 940), (self.TEXT_X, 180, 1860, 770)]

    def phases(self, sc):
        m = sc["machine"]
        t_photo = max(0.9, min(sc["cue"](m["short"], 1.0) - 0.1, 2.0))
        t_left = t_photo + 0.85          # 年表が退く → 実機が入る → 左へ寄る → 空いた右側に機種名
        t_name = t_left + 0.45
        specs = []
        prev = t_left + 0.3
        for i, sp in enumerate(m["specs"]):
            c = sc["cue"](sp.get("say", sp["v"]), None)
            ts = max(prev, (c - 0.15) if c is not None else prev + 0.45)
            if sp.get("key"):
                ts = max(ts, prev + GAUGE)
            specs.append(ts)
            prev = ts + 0.25
        return t_photo, t_name, t_left, specs

    def draw(self, cv, sc, t, lib):
        m = sc["machine"]
        t_photo, t_name, t_left, t_specs = self.phases(sc)
        # 奥：金属の背景（ゆっくり流れる）
        bg = metal_bg()
        shift = int(240 * prog(t, 0, sc["dur"] + 1))
        cv.paste(bg.crop((shift, 0, shift + W, H)))
        # 中景：大きな年号（中くらいの速さで流れる＝奥行き）
        yr = str(int(m["year"]))
        big = text_layer(yr, font("black", 420), (255, 255, 255, 18), pad=0)
        put(cv, big, (W - big.width - 40 - 120 * prog(t, 0, sc["dur"] + 1), 260), 1.0)
        # 年表の帯：最初は中央に大きく、実機が出ると上へ小さく退く
        k_tl = out3(prog(t, 0.0, 0.5))
        k_up = inout(prog(t, t_photo - 0.2, 0.6))
        self._year_strip(cv, m, t, k_tl, k_up)
        moments.entry_before(cv, t, t_photo + 0.25)          # 先バレ（着地の直前に縁が光る）
        # 前景：実機写真（背景を抜いて影と光）。中央に大きく着地 → 左へ寄ってプロフィールに
        a = machine_photo(lib, sc, ("front", "cabinet")) or lib.get(m["asset"])
        te = t_photo + 0.25
        if t >= te:
            k_in = out3(prog(t, te, 0.55))                   # 年表が上へ退いてから入る
            k_mv = inout(prog(t, t_left, 0.7))
            cx = lerp(W / 2 + 260 * (1 - k_in), 485, k_mv)
            cy = lerp(H / 2 + 60, 570, k_mv)
            # 放射状の光：着地で広がり、プロフィールでは薄く残して奥行きに
            ka = out3(prog(t, te, 0.4)) * lerp(1.0, 0.28, k_mv)
            if ka > 0.01:
                sb = _sunburst()
                sb = sb.rotate(-8 * t, resample=Image.BILINEAR)
                sbs = scaled(sb, lerp(1.0, 0.7, k_mv))
                put(cv, sbs, (cx - sbs.width / 2, cy - sbs.height / 2), ka)
            # 縦横比に合わせて収める（横長の写真でもはみ出さない）。プロフィールではゆっくりズーム
            h_box = lerp(760, 720, k_mv) * (1 + 0.045 * prog(t, t_left + 0.7, sc["dur"]))
            w_box = lerp(900, 640, k_mv)
            img = scaled(a.img, min(h_box / a.img.height, w_box / a.img.width))
            sh, pad = with_shadow(img)
            bump = 1 + 0.06 * (1 - out3(prog(t, te, 0.45)))   # 着地の瞬間だけ少し弾む
            if bump > 1.001:
                sh = scaled(sh, bump)
            put(cv, sh, (cx - sh.width / 2, cy - sh.height / 2), k_in)
            moments.entry_after(cv, t, te, (cx, cy),
                                (cx - img.width / 2, cy - img.height / 2, cx + img.width / 2, cy + img.height / 2))
            # 機種名が勢いよく登場（中央にいる間だけ。左へ寄ると右の見出しに引き継ぐ）
            kb = 1 - prog(t, t_left, 0.3)
            if t >= te + 0.12 and kb > 0:
                bn = _name_banner(m["name"])
                s_ = 1 + 0.5 * (1 - back(prog(t, te + 0.12, 0.3), 2.2))
                bns = scaled(bn, s_)
                put(cv, bns, (W / 2 - bns.width / 2, 790 - bns.height / 2), min(1, prog(t, te + 0.12, 0.06)) * kb)
            if hasattr(a, "role"):
                photo_notes(cv, a, credit=t < t_name)
            else:
                if a.note:
                    chip(cv, f"{a.note}（{a.info.get('file', a.key)}）" if a.placeholder else a.note)
                if a.credit and not a.placeholder:
                    source_line(cv, a.credit)
        # 右：機種名とスペック
        x = self.TEXT_X
        if t >= t_name:
            k1 = out3(prog(t, t_name, 0.45))
            put(cv, label("MACHINE PROFILE", GOLD, 24), (x, 200), k1)
            nm = m["name"]
            size = fit_size(nm, "black", 110, 1860 - x)
            put(cv, text_layer(nm, font("black", size), TEXT, pad=0), (x - 4, 250 + 18 * (1 - k1)), k1)
            k2 = out3(prog(t, t_name + 0.25, 0.45))
            put(cv, text_layer(f"{m['maker']} ｜ {m['date']} 導入", font("bold", 40), GOLD, pad=0), (x, 250 + size + 34), k2)
            ln = Image.new("RGBA", (max(1, int(900 * k2)), 3), GOLD + (255,))
            put(cv, ln, (x, 250 + size + 100), k2)
            y0 = 250 + size + 120
            for i, sp in enumerate(m["specs"]):
                ts = t_specs[i]
                big_v = sp.get("key")
                ry = y0 + 92 * i
                if big_v:                                      # ナギの解析：ゲージが満ちる間、青いブラケットで挟む
                    moments.analysis(cv, (x - 6, ry + 4, x + 950, ry + 88), t, ts - GAUGE, hold=GAUGE + 0.9, tag=None)
                if big_v and ts - GAUGE <= t < ts:          # 注目の数字は、期待度ゲージが満ちてから出す
                    put(cv, text_layer(sp["k"], font("bold", 40), (205, 212, 224), pad=0), (x, ry + 20), 1.0)
                    fx.gauge(cv, (x + 300, ry + 22), 520, 48, prog(t, ts - GAUGE, GAUGE - 0.1), label="")
                    continue
                if t < ts:
                    continue
                k = out3(prog(t, ts, 0.4))
                row = Image.new("RGBA", (960, 92), (0, 0, 0, 0))
                rd = ImageDraw.Draw(row)
                rd.text((0, 46), sp["k"], font=font("bold", 40), fill=(205, 212, 224), anchor="lm")
                if not big_v:
                    rd.text((940, 46), sp["v"], font=font("black", 54), fill=TEXT, anchor="rm")
                rd.line((0, 90, 940, 90), fill=(255, 255, 255, 40), width=2)
                put(cv, row, (x + 30 * (1 - k), ry), k)
                if big_v:
                    vi = text_layer(sp["v"], font("black", 84), GOLD, stroke=5, stroke_fill=(60, 30, 0), pad=10)
                    c = (x + 940 - vi.width / 2 + 10, ry + 46)
                    fx.burst(cv, c, t, ts, r_in=60, r_out=300)
                    fx.slam_text(cv, vi, c, t, ts)
                    fx.sparkles(cv, c, t, ts, n=18, spread=260, seed=4)
            if sc.get("source"):
                source_line(cv, with_credit(sc["source"], a if hasattr(a, "role") else None))

    def focus_point(self, sc):
        """次の画面へズームで切り替えるときの中心＝注目スペックの数字"""
        m = sc["machine"]
        size = fit_size(m["name"], "black", 110, 1860 - self.TEXT_X)
        y0 = 250 + size + 120
        i = next((i for i, sp in enumerate(m["specs"]) if sp.get("key")), len(m["specs"]) - 1)
        return (self.TEXT_X + 840, y0 + 92 * i + 46)

    def events(self, sc):
        tp, tn, tl, ts = self.phases(sc)
        te = tp + 0.25
        ev = [(0.05, "whoosh"), (tn, "pop"), (te + 0.12, "stamp")] + moments.entry_events(te)
        for i, sp in enumerate(sc["machine"]["specs"]):
            if sp.get("key"):
                ev += moments.analysis_events(ts[i] - GAUGE)
                ev += [(ts[i] - GAUGE + k * (GAUGE - 0.1) / 10, "tick") for k in range(10)]
                ev += [(ts[i], "stamp"), (ts[i], "sparkle")]      # ここは「写真を見せる場面」。揺れ・フラッシュは次の数字の場面に任せる
            else:
                ev.append((ts[i], "pop"))
        return ev

    def _year_strip(self, cv, m, t, k_tl, k_up):
        lay = Image.new("RGBA", (W, 260), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        x0, x1, y = 360, W - 360, 130
        r0, r1 = m["year"] - 2.0, m["year"] + 2.0
        X = lambda v: x0 + (x1 - x0) * (v - r0) / (r1 - r0)
        d.line((x0, y, x1, y), fill=(120, 132, 156, 255), width=4)
        for yy in range(int(r0) + 1, int(r1) + 1):
            d.line((X(yy), y - 12, X(yy), y + 12), fill=(140, 150, 170, 255), width=3)
            d.text((X(yy), y + 44), str(yy), font=font("bold", 34), fill=SUB, anchor="mm")
        km = inout(prog(t, 0.1, 0.7))
        mx = X(lerp(m["year"] - 1.6, m["year"], km))
        d.ellipse((mx - 14, y - 14, mx + 14, y + 14), fill=GOLD, outline=NAVY, width=4)
        d.text((mx, y - 56), m["date"], font=font("black", 52), fill=GOLD, anchor="mm")
        s = lerp(1.0, 0.55, k_up)
        img = scaled(lay, s)
        yy = lerp(H / 2 - 160, 70, k_up)
        put(cv, img, ((W - img.width) / 2, yy), k_tl * (1 - 0.35 * k_up))


# ================================================================ C 年表・カレンダー
class History:
    def busy(self, sc):
        return [(150, 140, W - 150, 860)]

    def draw(self, cv, sc, t, lib):
        cv.paste(dark_grad())
        v = sc["variant"]
        if v == "calendar":
            self._calendar(cv, sc, t)
        else:
            self._era(cv, sc, t)

    def _era(self, cv, sc, t):
        o = sc["opts"]
        d = ImageDraw.Draw(cv)
        y0, y1 = int(o.get("from", 2010)), int(o.get("to", 2017))
        end = float(o.get("end", 2015.9))
        goto = float(o.get("goto", 2016))
        x0, x1, y = 200, W - 200, 560
        X = lambda v: x0 + (x1 - x0) * (v - y0) / (y1 - y0)
        ka = inout(prog(t, 0.0, 0.6))
        d.line((x0, y, x0 + (x1 - x0) * ka, y), fill=(70, 84, 110), width=4)
        for yr in range(y0, y1 + 1):
            if X(yr) <= x0 + (x1 - x0) * ka:
                d.line((X(yr), y - 12, X(yr), y + 12), fill=(90, 104, 130), width=3)
                d.text((X(yr), y + 48), str(yr), font=font("bold", 34), fill=SUB, anchor="mm")
        kb = out3(prog(t, 0.25, 0.9))
        be = x0 + (X(end) - x0) * kb
        band = np.zeros((70, int(max(2, be - x0)), 4), np.uint8)
        band[..., :3] = GOLD
        band[..., 3] = (np.clip(np.linspace(0, 1.6, band.shape[1]), 0, 1) * 210)[None, :].astype(np.uint8)
        cv.alpha_composite(Image.fromarray(band, "RGBA"), (x0, y - 120))
        if kb > 0.3 and o.get("band"):
            d.text((x0 + (X(end) - x0) * 0.55, y - 85), o["band"], font=font("black", 44), fill=(40, 26, 8), anchor="mm")
        ke = out3(prog(t, 1.2, 0.5))
        if ke > 0:
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            for i in range(6):
                ld.line((X(end) + 4, y - 150 + i * 22, X(end) + 22, y - 136 + i * 22), fill=(230, 230, 236), width=4)
            put(cv, lay, (0, 0), ke)
        km = inout(prog(t, 1.3, 1.0))
        mx = lerp(X(goto - 1.4), X(goto), km)
        d.line((mx, y - 200, mx, y + 20), fill=TEXT, width=3)
        d.ellipse((mx - 12, y - 12, mx + 12, y + 12), fill=GOLD, outline=NAVY, width=4)
        d.text((mx, y - 236), str(int(goto) if km > 0.85 else int(goto) - 1), font=font("black", 64), fill=GOLD, anchor="mm")
        put(cv, label("TIMELINE", BLUE), (x0, 216), 1.0)

    def _calendar(self, cv, sc, t):
        o = sc["opts"]
        months = [int(m) for m in o["months"]]
        marks = o.get("marks", {})
        focus = int(o.get("focus", months[-1]))
        d = ImageDraw.Draw(cv)
        spaced(d, (W / 2, 170), str(o.get("year", "")), font("black", 40), SUB, 14, anchor="m")
        n = len(months)
        cw, chh, gap = 400, 440, 70
        x0 = (W - (cw * n + gap * (n - 1))) / 2
        t_focus = sc["cue"](f"{focus}月", 1.0)
        for i, mo in enumerate(months):
            k = out3(prog(t, 0.1 + 0.18 * i, 0.45))
            card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
            cdr = ImageDraw.Draw(card)
            is_focus = mo == focus
            cdr.rounded_rectangle((0, 0, cw - 1, chh - 1), 14, fill=(236, 230, 214))
            cdr.rectangle((0, 0, cw, 90), fill=(196, 52, 52) if is_focus else (60, 70, 92))
            cdr.text((cw / 2, 46), str(o.get("year", "")), font=font("bold", 36), fill=(255, 255, 255), anchor="mm")
            cdr.text((cw / 2, 230), f"{mo}月", font=font("black", 150), fill=(30, 34, 44), anchor="mm")
            mk = marks.get(str(mo))
            if mk:
                shown = 1.0 if not is_focus else out3(prog(t, t_focus + 0.3, 0.4))
                nb = Image.new("RGBA", (cw, 80), (0, 0, 0, 0))
                nd = ImageDraw.Draw(nb)
                col = (196, 52, 52) if is_focus else GOLD
                nd.rounded_rectangle((30, 6, cw - 30, 74), 10, fill=col + (255,))
                nd.text((cw / 2, 40), mk, font=font("black", fit_size(mk, "black", 38, cw - 80)),
                        fill=(255, 255, 255) if is_focus else (20, 16, 10), anchor="mm")
                from .style import fade_img
                card.alpha_composite(fade_img(nb, shown), (0, 330))
            jig = 0
            if is_focus:
                kk = prog(t, t_focus + 0.3, 0.35)
                if 0 < kk < 1:
                    jig = int(16 * (1 - kk) * np.sin(kk * 40))
                if t >= t_focus + 0.3:
                    sc_ = 1 + 0.08 * (1 - out3(prog(t, t_focus + 0.3, 0.3)))
                    card = scaled(card, sc_)
            put(cv, card, (x0 + (cw + gap) * i + jig - (card.width - cw) / 2, 300 + 40 * (1 - k) - (card.height - chh) / 2), k)
        # 視線誘導の枠：最初の印 → 注目の月（ナレーションでその月を言う瞬間に動く）
        start_i = next((i for i, mo in enumerate(months) if str(mo) in marks and mo != focus), 0)
        fi = months.index(focus)
        km = inout(prog(t, t_focus - 0.4, 0.9))
        fx = x0 + (cw + gap) * lerp(start_i, fi, km)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(lay).rounded_rectangle((fx - 14, 286, fx + cw + 14, 300 + chh + 14), 20,
                                              outline=(GOLD if km < 0.9 else RED) + (255,), width=8)
        put(cv, lay, (0, 0), out3(prog(t, 0.7, 0.3)))


def _events_C(sc):
    if sc["variant"] == "calendar":
        tf = sc["cue"](f"{sc['opts']['focus']}月", 1.0)
        return [(0.05, "whoosh")] + [(0.1 + 0.18 * i, "pop") for i in range(len(sc["opts"]["months"]))] + \
               [(tf + 0.3, "stamp"), (tf + 0.3, "shake_s")]
    return [(0.05, "whoosh"), (1.2, "stamp")]


History.events = staticmethod(_events_C)


# ================================================================ D 数字・比較
ORB_STEPS = [0.05, 0.4, 0.75, 1.1]   # 保留玉の色が変わる時刻（青→緑→赤→金）
SHOCK_STEPS = [0.05, 0.45, 0.85]      # 衝撃（tone=shock）は 青→緑→赤 で止めて溜める
SLAM = 1.45                           # 弾けて数字が叩きつけられる時刻（衝撃）
COUNT_STEPS = [0.05, 0.35, 0.65, 0.95]   # 写真つきの数字：保留変化（少し速め）
COUNT0, COUNT_DUR = 1.05, 1.0             # カウントアップの開始と長さ
DONE = COUNT0 + COUNT_DUR + 0.05          # 円グラフが完成して強調する時刻
SHOCK_RED = (236, 72, 84)


class Numbers:
    def busy(self, sc):
        if sc["variant"] == "stat":
            if sc.get("machine") and sc["opts"].get("tone") != "shock":
                return [(220, 180, 820, 820), (900, 280, 1400, 680), (1410, 110, 1870, 705)]
            return [(280, 180, 920, 820), (1020, 280, 1820, 680)]
        return [(200, 140, W - 200, 860)]

    def draw(self, cv, sc, t, lib):
        cv.paste(dark_grad())
        if sc["variant"] == "stat":
            self._stat(cv, sc, t, lib)
        else:
            self._compare(cv, sc, t, lib)

    # 写真つきの数字：実機写真 → 保留変化 → カウントアップで円グラフが満ちる → 完成で強調
    def _photo_card(self, cv, sc, t, lib):
        ph = machine_photo(lib, sc, ("detail", "front"))
        if ph is None:
            return None
        cw, chh, x0, y0 = 440, 580, 1420, 120         # 下端は 700 まで（右下にバクが飛び込んでも写真を隠さない）
        if not hasattr(self, "_cards"):
            self._cards = {}
        ck = id(ph)
        if ck not in self._cards:
            card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
            cd = ImageDraw.Draw(card)
            cd.rounded_rectangle((0, 0, cw - 1, chh - 1), 22, fill=(18, 26, 44, 255))
            if ph.placeholder or ph.meta.get("cutout"):
                im = contain(ph.img, cw - 60, chh - 60)        # 実機の正面は切らずに収める
                card.alpha_composite(im, ((cw - im.width) // 2, (chh - im.height) // 2))
            else:
                im = cover(ph.img, cw - 16, chh - 16, ph.focus)  # 盤面アップは被写体を中心に切り出す
                mask = Image.new("L", im.size, 0)
                ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), 16, fill=255)
                im.putalpha(mask)
                card.alpha_composite(im, (8, 8))
            ImageDraw.Draw(card).rounded_rectangle((0, 0, cw - 1, chh - 1), 22, outline=GOLD + (255,), width=4)
            self._cards[ck] = card
        k = out3(prog(t, 0.05, 0.5))
        z = 1 + 0.03 * prog(t, 0, sc["dur"])
        card = scaled(self._cards[ck], z)
        put(cv, card, (x0 + 120 * (1 - k) - (card.width - cw) / 2, y0 - (card.height - chh) / 2), k)
        photo_notes(cv, ph, credit=False)
        return ph

    def _num_img(self, txt, pre, col, shock, size=170):
        fnum, fpre = font("black", size), font("black", int(size * 0.41))
        d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        wn, wp = d.textlength(txt, font=fnum), d.textlength(pre, font=fpre) if pre else 0
        im = Image.new("RGBA", (int(wn + wp + 60), int(size * 1.53)), (0, 0, 0, 0))
        nd = ImageDraw.Draw(im)
        base = int(size * 1.18)
        sf = (70, 10, 16) if shock else (60, 30, 0)
        if pre:
            nd.text((10, base), pre, font=fpre, fill=col, anchor="ls", stroke_width=5, stroke_fill=sf)
        nd.text((10 + wp + (8 if pre else 0), base), txt, font=fnum, fill=col, anchor="ls", stroke_width=6, stroke_fill=sf)
        return im

    def _stat(self, cv, sc, t, lib):
        o = sc["opts"]
        val = float(o["value"])
        shock = o.get("tone") == "shock"
        with_photo = bool(sc.get("machine")) and not shock
        ph = self._photo_card(cv, sc, t, lib) if with_photo else None
        col = SHOCK_RED if shock else GOLD
        steps = SHOCK_STEPS if shock else COUNT_STEPS
        t_go = SLAM if shock else COUNT0                  # 保留が弾けて数字が動き出す時刻
        cx, cy, r = (520, 500, 280) if ph else (600, 500, 300)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(40, 52, 76), width=30)
        kf = out3(prog(t, SLAM, 0.6)) if shock else prog(t, COUNT0, COUNT_DUR) ** 0.8
        v = val * kf
        if v > 0.5:
            d.arc((cx - r, cy - r, cx + r, cy + r), -90, -90 + 360 * min(v, 100) / 100, fill=col, width=30)
        cv.alpha_composite(lay)
        fx.hold_orb(cv, (cx, cy), 120, t, steps, burst_at=t_go)
        if not shock:          # 期待度アップ：保留が変わるたびにゲージが1段上がり、数字が完成したら消える
            stage = sum(1 for s_ in steps if t >= s_)
            ga = 1 - prog(t, DONE + 0.3, 0.4)
            if ga > 0 and stage > 0:
                gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                fx.gauge(gl, (cx - 280, 850), 380, 40, stage / len(steps), label="期待度", segs=len(steps))
                put(cv, gl, (0, 0), ga)
        rx = 900 if ph else 1030
        if t < t_go:
            return self._stat_text(cv, sc, t, rx, 470 if ph else 800, t_go)
        pre = o.get("prefix", "")
        if shock:               # 規制の数字：赤で叩きつける（警告）
            fx.burst(cv, (cx, cy), t, SLAM, col=col, r_in=200, r_out=720)
            fx.slam_text(cv, self._num_img(f"{int(round(val))}%", pre, col, True), (cx, cy - 10), t, SLAM)
        else:                   # カウントアップ → 円グラフ完成 → 強調
            num = self._num_img(f"{int(v)}%", pre, col, False, 150 if ph else 170)
            if t < DONE:
                put(cv, num, (cx - num.width / 2, cy - 10 - num.height / 2), 1.0)
            else:
                fx.burst(cv, (cx, cy), t, DONE, col=col, r_in=200, r_out=720)
                fx.sparkles(cv, (cx, cy), t, DONE + 0.05, n=30, spread=480)
                s_ = 1 + 0.35 * (1 - back(prog(t, DONE, 0.3), 2.0))
                ns = scaled(num, s_)
                put(cv, ns, (cx - ns.width / 2, cy - 10 - ns.height / 2), 1.0)
                kr = prog(t, DONE, 0.5)            # 完成したリングに光の輪
                if kr < 1:
                    ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    rr = r + 40 * out3(kr)
                    ImageDraw.Draw(ring).ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=GOLD + (int(220 * (1 - kr)),), width=10)
                    cv.alpha_composite(ring)
        self._stat_text(cv, sc, t, rx, 470 if ph else 800, t_go)
        if sc.get("source"):
            source_line(cv, with_credit(sc["source"], ph))

    def _stat_text(self, cv, sc, t, rx=1030, maxw=800, t_go=SLAM):
        o = sc["opts"]
        k1, k2 = out3(prog(t, 0.3, 0.5)), out3(prog(t, (DONE if o.get("tone") != "shock" else t_go) + 0.2, 0.5))
        put(cv, label(o.get("tag", "KEY NUMBER"), RED if o.get("tone") == "shock" else BLUE, 26), (rx, 290), k1)
        lb = o.get("label", "")
        put(cv, text_layer(lb, font("black", fit_size(lb, "black", 110, maxw)), TEXT, pad=0), (rx, 350 + 16 * (1 - k1)), k1)
        for i, ln in enumerate(o.get("lines", [])):
            f = font("bold", fit_size(ln, "bold", 46, maxw + 40))
            put(cv, text_layer(ln, f, (205, 212, 224), pad=0), (rx, 520 + 66 * i + 16 * (1 - k2)), k2)

    def _compare(self, cv, sc, t, lib=None):
        o = sc["opts"]
        if o.get("heading"):
            k = out3(prog(t, 0.0, 0.5))
            g = gold_text(o["heading"], 96)
            put(cv, g, ((W - g.width) / 2, 150 + 16 * (1 - k)), k)
        items = o["items"]
        thumb = None
        cw, chh, gap = 640, 380, 80
        cx0 = (W - (cw * len(items) + gap * (len(items) - 1))) / 2
        for i, it in enumerate(items):
            ts = sc["cue"](it["value"], 0.3 + 0.5 * i)
            kc = out3(prog(t, max(0.2, ts - 0.2), 0.5))
            col = GOLD if it.get("key") else RED
            card = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
            cdr = ImageDraw.Draw(card)
            cdr.rounded_rectangle((0, 0, cw - 1, chh - 1), 16, fill=(22, 30, 50, 240), outline=col + (255,), width=3)
            cdr.text((40, 56), it.get("tag", ""), font=font("bold", 32), fill=col, anchor="lm")
            cdr.text((40, 118), it["name"], font=font("black", fit_size(it["name"], "black", 60, cw - 80)), fill=TEXT, anchor="lm")
            cdr.text((40, 200), it.get("label", ""), font=font("bold", 36), fill=SUB, anchor="lm")
            cdr.text((cw - 40, 290), it["value"], font=font("black", 132), fill=col, anchor="rm")
            if it.get("key") and lib is not None:      # 機種のカードには実機写真のサムネイル
                ph = machine_photo(lib, sc, ("front",))
                if ph is not None:
                    thumb = ph
                    th = contain(ph.img, 130, 190)
                    card.alpha_composite(th, (cw - 40 - th.width, 24))
                    if ph.placeholder:
                        cdr.text((cw - 40 - th.width / 2, 24 + th.height + 14), "仮素材", font=font("bold", 20), fill=SUB, anchor="mm")
            if t >= max(0.2, ts - 0.2):
                card = scaled(card, 1 + 0.25 * (1 - back(prog(t, max(0.2, ts - 0.2), 0.3), 2.0)))
                put(cv, card, (cx0 + (cw + gap) * i + cw / 2 - card.width / 2, 380 + chh / 2 - card.height / 2), kc)
        if len(items) == 2 and o.get("note"):   # ナギの解析：「数え方」で2枚をまとめて走査 →「違う」で≠
            ta = sc["cue"](o.get("scan_cue", "数え方"), 1.2)
            moments.analysis(cv, (cx0 - 6, 374, cx0 + cw * 2 + gap + 6, 386 + chh), t, ta, hold=1.5)
            tn = sc["cue"](o.get("note_cue", "違う"), 1.6)
            kb = prog(t, tn, 0.3)
            if kb > 0:
                r = 62 * (0.4 + 0.6 * back(kb, 2.4))
                bx, by = W / 2, 380 + chh / 2
                badge = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
                bd = ImageDraw.Draw(badge)
                bd.ellipse((100 - r, 100 - r, 100 + r, 100 + r), fill=(214, 40, 60, 255), outline=GOLD + (255,), width=6)
                bd.text((100, 96), "≠", font=font("black", int(r * 1.3)), fill=(255, 255, 255), anchor="mm")
                put(cv, badge, (bx - 100, by - 100), 1.0)
        if o.get("note"):
            kn = out3(prog(t, sc["cue"](o.get("note_cue", "違う"), 1.6), 0.4))
            note = text_layer(o["note"], font("medium", 32), (200, 208, 222), pad=0)
            put(cv, note, ((W - note.width) / 2, 795), kn)
        if sc.get("source"):
            source_line(cv, with_credit(sc["source"], thumb))


def _events_D(sc):
    if sc["variant"] == "stat" and sc["opts"].get("tone") == "shock":
        return [(s, "hold") for s in SHOCK_STEPS] + [(SLAM, "shock"), (SLAM, "flash_r"), (SLAM, "shake")]
    if sc["variant"] == "stat":
        ev = [(COUNT_STEPS[0], "hold"), (COUNT_STEPS[1], "hold"), (COUNT_STEPS[2], "hold"), (COUNT_STEPS[3], "hold_gold"),
              (COUNT0, "pop")]
        ev += [(COUNT0 + k * 0.07, "tick") for k in range(int(COUNT_DUR / 0.07))]       # カウントアップの音
        ev += [(DONE, "impact"), (DONE, "flash"), (DONE, "shake"), (DONE + 0.1, "sparkle")]
        if sc.get("machine"):
            ev.insert(0, (0.05, "whoosh"))
        return ev
    ev = [(0.05, "whoosh")]
    for i, it in enumerate(sc["opts"]["items"]):
        ev.append((max(0.2, sc["cue"](it["value"], 0.3 + 0.5 * i) - 0.2), "stamp"))
    if sc["opts"].get("note"):
        ev += moments.analysis_events(sc["cue"](sc["opts"].get("scan_cue", "数え方"), 1.2))
        ev += [(sc["cue"](sc["opts"].get("note_cue", "違う"), 1.6), "stamp")]
    return ev


Numbers.events = staticmethod(_events_D)


# ================================================================ E 要点
class Points:
    def busy(self, sc):
        return [(380, 100, W - 200, 820)]

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        cv.paste(bokeh_bg())
        d = ImageDraw.Draw(cv)
        g = gold_text(o["heading"], fit_size(o["heading"], "black", 104, 1600))
        kh = prog(t, 0.0, 0.5)
        put(cv, g, ((W - g.width) / 2, 120 - 80 * (1 - back(kh, 1.8))), min(1, kh * 2))
        fx.glint(cv, ((W - g.width) / 2, 120, (W + g.width) / 2, 120 + g.height), t, 0.6, 0.7)
        if o.get("sub"):
            sub = text_layer(o["sub"], font("bold", 42), TEXT, stroke=5, pad=0)
            put(cv, sub, ((W - sub.width) / 2, 120 + g.height - 6), out3(prog(t, 0.3, 0.5)))
        fbody, fkey = font("black", 64), font("black", 92)
        for i, item in enumerate(o["items"]):
            plain = item.replace("{", "").replace("}", "")
            ts = sc["cue"](plain[:5], 0.7 + 0.9 * i)
            k = prog(t, max(0.5, ts - 0.1), 0.7)
            if k <= 0:
                continue
            n = int(round(len(plain) * out3(k)))
            shown, cnt, out = "", 0, ""
            for part in re.split(r"(\{[^}]*\})", item):      # 文字を書き出す途中でも {…} の色を保つ
                body = part.strip("{}")
                take = body[: max(0, n - cnt)]
                cnt += len(body)
                if take:
                    out += ("{" + take + "}") if part.startswith("{") else take
            y = 470 + 120 * i
            # 書き終わった項目の数字には、蛍光ペンのようなマーカーを引く
            km = prog(t, max(0.5, ts - 0.1) + 0.8, 0.35)
            if km > 0 and "{" in item:
                pre = item.split("{")[0]
                keyw = item.split("{")[1].split("}")[0]
                mx0 = 560 + d.textlength(pre, font=fbody)
                mw = d.textlength(keyw, font=fkey)
                mk = Image.new("RGBA", (int(mw * km) + 1, 34), (255, 220, 60, 150))
                cv.alpha_composite(mk, (int(mx0), int(y + 22)))
                moments.analysis(cv, (mx0 - 8, y - 52, mx0 + mw + 8, y + 56), t, max(0.5, ts - 0.1) + 0.8, hold=1.4, tag=None)
                d = ImageDraw.Draw(cv)
            bounce = 1 + 0.3 * (1 - out3(prog(t, max(0.5, ts - 0.1), 0.25)))
            num = text_layer("①②③④⑤"[i], font("black", int(64 * bounce)), GOLD, pad=0)
            put(cv, num, (470 + 30 - num.width / 2, y - num.height / 2), 1.0)
            rich_line(d, (560, y), out, fbody, TEXT, (255, 92, 92), key_font=fkey)
        if o.get("note"):
            last = sc["cue"](o["items"][-1].replace("{", "").replace("}", "")[:5], 0.7 + 0.9 * (len(o["items"]) - 1))
            note = text_layer(o["note"], font("medium", 34), (220, 210, 230), pad=0)
            put(cv, note, ((W - note.width) / 2, 760), out3(prog(t, last + 1.0, 0.4)))


def _events_E(sc):
    ev = [(0.05, "whoosh"), (0.6, "sparkle")]
    for i, it in enumerate(sc["opts"]["items"]):
        t_i = max(0.5, sc["cue"](it.replace("{", "").replace("}", "")[:5], 0.7 + 0.9 * i) - 0.1)
        ev.append((t_i, "pop"))
        if "{" in it:
            ev += moments.analysis_events(t_i + 0.8)
    return ev


Points.events = staticmethod(_events_E)


# ================================================================ F 掛け合い
class Talk:
    def busy(self, sc):
        return [(560, 160, 1360, 520)]

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        cv.paste(lab_bg())
        cv.alpha_composite(Image.new("RGBA", (W, H), (6, 10, 22, 80)))
        k = out3(prog(t, 0.2, 0.5))
        if o.get("tag"):
            lb = label(o["tag"], BLUE, 28)
            put(cv, lb, ((W - lb.width) / 2, 190), k)
        if o.get("card"):
            txt = o["card"]
            g = gold_text(txt, fit_size(txt, "black", 110, 1300))
            if t >= 0.2:
                gs = scaled(g, 1 + 0.6 * (1 - back(prog(t, 0.2, 0.32), 2.2)))
                put(cv, gs, ((W - gs.width) / 2, 250 + g.height / 2 - gs.height / 2), min(1, prog(t, 0.2, 0.08)))
        if o.get("card2"):
            k2 = out3(prog(t, sc["cue"](o.get("card2_cue", o["card2"][:4]), 1.0), 0.5))
            l2 = text_layer(o["card2"], font("black", fit_size(o["card2"], "black", 84, 1300)), TEXT, stroke=7, pad=0)
            put(cv, l2, ((W - l2.width) / 2, 470 + 16 * (1 - k2)), k2)


def _events_F(sc):
    ev = [(0.2, "impact")]
    if sc["opts"].get("card2"):
        ev.append((sc["cue"](sc["opts"].get("card2_cue", sc["opts"]["card2"][:4]), 1.0), "pop"))
    return ev


Talk.events = staticmethod(_events_F)


TEMPLATES = {"A": Photo(), "B": Machine(), "C": History(), "D": Numbers(), "E": Points(), "F": Talk()}
