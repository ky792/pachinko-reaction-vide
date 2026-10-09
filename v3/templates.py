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

from .style import (W, H, NAVY, TEXT, SUB, GOLD, RED, BLUE, font, prog, out3, inout, lerp, put, scaled,
                    text_layer, gold_text, label, spaced, fit_size, dark_grad, metal_bg, bokeh_bg, lab_bg,
                    chip, source_line)
from .media import with_shadow

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
            if o.get("sub"):
                put(cv, text_layer(o["sub"], font("black", 52), TEXT, stroke=6), (110, 120 + g.height - 30), out3(prog(t, 0.8, 0.5)))
        if a.note:
            chip(cv, a.note)
        if a.credit and not a.placeholder:
            source_line(cv, a.credit)


# ================================================================ B 実機＋機種名＋スペック
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
        # 前景：実機（影つき）。右から大きく入り、左へ寄って小さくなる
        a = lib.get(m["asset"])
        if t >= t_photo + 0.25:
            k_in = out3(prog(t, t_photo + 0.25, 0.55))   # 年表が上へ退いてから入る
            k_mv = inout(prog(t, t_left, 0.7))
            h_big, h_small = 760, 720
            hh = lerp(h_big, h_small, k_mv)
            img = scaled(a.img, hh / a.img.height)
            sh, pad = with_shadow(img)
            cx = lerp(W / 2 + 260 * (1 - k_in), 485, k_mv)
            cy = lerp(H / 2 + 60, 570, k_mv)
            put(cv, sh, (cx - img.width / 2 - pad, cy - img.height / 2 - pad), k_in)
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
                if t < ts:
                    continue
                k = out3(prog(t, ts, 0.4))
                row = Image.new("RGBA", (960, 92), (0, 0, 0, 0))
                rd = ImageDraw.Draw(row)
                rd.text((0, 46), sp["k"], font=font("bold", 40), fill=(205, 212, 224), anchor="lm")
                big_v = sp.get("key")
                rd.text((940, 46), sp["v"], font=font("black", 78 if big_v else 54), fill=GOLD if big_v else TEXT, anchor="rm")
                rd.line((0, 90, 940, 90), fill=(255, 255, 255, 40), width=2)
                put(cv, row, (x + 30 * (1 - k), y0 + 92 * i), k)
            if sc.get("source"):
                source_line(cv, sc["source"])

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
            put(cv, card, (x0 + (cw + gap) * i, 300 + 40 * (1 - k)), k)
        # 視線誘導の枠：最初の印 → 注目の月（ナレーションでその月を言う瞬間に動く）
        start_i = next((i for i, mo in enumerate(months) if str(mo) in marks and mo != focus), 0)
        fi = months.index(focus)
        km = inout(prog(t, t_focus - 0.4, 0.9))
        fx = x0 + (cw + gap) * lerp(start_i, fi, km)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(lay).rounded_rectangle((fx - 14, 286, fx + cw + 14, 300 + chh + 14), 20,
                                              outline=(GOLD if km < 0.9 else RED) + (255,), width=8)
        put(cv, lay, (0, 0), out3(prog(t, 0.7, 0.3)))


# ================================================================ D 数字・比較
class Numbers:
    def busy(self, sc):
        if sc["variant"] == "stat":
            return [(280, 180, 920, 820), (1020, 280, 1820, 680)]
        return [(200, 140, W - 200, 860)]

    def draw(self, cv, sc, t, lib):
        cv.paste(dark_grad())
        (self._stat if sc["variant"] == "stat" else self._compare)(cv, sc, t)

    def _stat(self, cv, sc, t):
        o = sc["opts"]
        val = float(o["value"])
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        cx, cy, r = 600, 500, 300
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(40, 52, 76), width=30)
        kf = inout(prog(t, 0.15, 1.3))
        v = val * kf
        if v > 0.5:
            d.arc((cx - r, cy - r, cx + r, cy + r), -90, -90 + 360 * min(v, 100) / 100, fill=GOLD, width=30)
        cv.alpha_composite(lay)
        d = ImageDraw.Draw(cv)
        num = f"{int(round(v))}%"
        fnum, fpre = font("black", 170), font("black", 70)
        pre = o.get("prefix", "")
        wn, wp = d.textlength(num, font=fnum), d.textlength(pre, font=fpre) if pre else 0
        x = cx - (wn + wp + (8 if pre else 0)) / 2
        if pre:
            d.text((x, cy + 58), pre, font=fpre, fill=GOLD, anchor="ls")
        d.text((x + wp + (8 if pre else 0), cy + 58), num, font=fnum, fill=GOLD, anchor="ls")
        k1, k2 = out3(prog(t, 0.3, 0.5)), out3(prog(t, 0.8, 0.5))
        rx = 1030
        put(cv, label(o.get("tag", "KEY NUMBER"), BLUE, 26), (rx, 290), k1)
        lb = o.get("label", "")
        put(cv, text_layer(lb, font("black", fit_size(lb, "black", 110, 800)), TEXT, pad=0), (rx, 350 + 16 * (1 - k1)), k1)
        for i, ln in enumerate(o.get("lines", [])):
            put(cv, text_layer(ln, font("bold", 46), (205, 212, 224), pad=0), (rx, 520 + 66 * i + 16 * (1 - k2)), k2)
        if sc.get("source"):
            source_line(cv, sc["source"])

    def _compare(self, cv, sc, t):
        o = sc["opts"]
        if o.get("heading"):
            k = out3(prog(t, 0.0, 0.5))
            g = gold_text(o["heading"], 96)
            put(cv, g, ((W - g.width) / 2, 150 + 16 * (1 - k)), k)
        items = o["items"]
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
            put(cv, card, (cx0 + (cw + gap) * i, 380 + 30 * (1 - kc)), kc)
        if o.get("note"):
            kn = out3(prog(t, sc["cue"](o.get("note_cue", "違う"), 1.6), 0.4))
            note = text_layer(o["note"], font("medium", 32), (200, 208, 222), pad=0)
            put(cv, note, ((W - note.width) / 2, 795), kn)
        if sc.get("source"):
            source_line(cv, sc["source"])


# ================================================================ E 要点
class Points:
    def busy(self, sc):
        return [(380, 100, W - 200, 820)]

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        cv.paste(bokeh_bg())
        d = ImageDraw.Draw(cv)
        g = gold_text(o["heading"], fit_size(o["heading"], "black", 104, 1600))
        put(cv, g, ((W - g.width) / 2, 120), out3(prog(t, 0.0, 0.5)))
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
            d.text((470, y), "①②③④⑤"[i], font=fbody, fill=GOLD, anchor="lm")
            rich_line(d, (560, y), out, fbody, TEXT, (255, 92, 92), key_font=fkey)
        if o.get("note"):
            last = sc["cue"](o["items"][-1].replace("{", "").replace("}", "")[:5], 0.7 + 0.9 * (len(o["items"]) - 1))
            note = text_layer(o["note"], font("medium", 34), (220, 210, 230), pad=0)
            put(cv, note, ((W - note.width) / 2, 760), out3(prog(t, last + 1.0, 0.4)))


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
            put(cv, g, ((W - g.width) / 2, 250 + 20 * (1 - k)), k)
        if o.get("card2"):
            k2 = out3(prog(t, sc["cue"](o.get("card2_cue", o["card2"][:4]), 1.0), 0.5))
            l2 = text_layer(o["card2"], font("black", fit_size(o["card2"], "black", 84, 1300)), TEXT, stroke=7, pad=0)
            put(cv, l2, ((W - l2.width) / 2, 470 + 16 * (1 - k2)), k2)


TEMPLATES = {"A": Photo(), "B": Machine(), "C": History(), "D": Numbers(), "E": Points(), "F": Talk()}
