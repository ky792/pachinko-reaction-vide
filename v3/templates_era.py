"""年代をまたぐ回のためのテンプレート（R / T / V）

  R:rail      時代のレール（90s→00s→10s→20s→NOW）。機種カードが順に駅へ降りてきて、最後に問いかけ
  R:summary   まとめのレール。紹介した機種名を年代ごとに並べ、最後に番組ロゴ
  T:timeline  年表の上に機種カードを並べ、ナレーションに合わせて主役のカードを入れ替える
  V:duo       2台の対比（左右）。右は「？」のシルエットから、注目機種の登場演出で明かす

機種の写真は photos ライブラリから自動で読み込む。無ければ「年代＋機種名」の文字カード（実機の絵は描かない）。
"""
import math
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .style import (W, H, NAVY, TEXT, SUB, GOLD, RED, BLUE, ORANGE, font, prog, out3, inout, back, lerp, put, scaled,
                    text_layer, gold_text, label, spaced, fit_size, dark_grad, metal_bg, bokeh_bg, chip, source_line)
from .media import with_shadow
from .photos import contain
from . import fx, moments
from .templates import ACCENTS, photo_notes


def _parse_list(s):
    return [x.strip() for x in str(s).split("|") if x.strip()] if s else []


def _card(lib, key, w, h):
    """機種の写真（または文字カード）を枠に収めて影をつける。(影つき画像, pad, 写真, 本体の大きさ)"""
    ph = lib.photos.machine(key, "front")
    ck = (key, w, h)
    if not hasattr(lib, "_cardcache"):
        lib._cardcache = {}
    if ck not in lib._cardcache:
        im = contain(ph.img, w, h, max_up=1.0)
        sh, pad = with_shadow(im, strength=0.6, blur=18, offset=(12, 16))
        lib._cardcache[ck] = (sh, pad, ph, im.size)
    return lib._cardcache[ck]


def _meta(lib, key):
    return lib.photos.meta("machines", key)


def _when(md):
    return md.get("date", "")


def _cue_or(sc, v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return sc["cue"](v, default) if v else default


def _notes_for(cv, lib, keys):
    """写真の注記は1つにまとめる（提供写真・文字カードの別）"""
    phs = [lib.photos.machine(k, "front") for k in keys]
    owner = any(p.meta.get("permission") == "owner" and not p.placeholder for p in phs)
    pend = any(p.meta.get("permission") == "pending" and not p.placeholder for p in phs)
    if owner and pend:
        chip(cv, "提供写真・許諾確認中の写真を含む（検証用）")
    elif owner:
        chip(cv, "提供写真は権利未確認（検証用）／他は機種名カード" if any(p.placeholder for p in phs)
             else "提供写真（権利未確認・検証用）")
    elif any(p.meta.get("permission") == "pending" and not p.placeholder for p in phs):
        chip(cv, "許諾確認中の写真（公開版では使いません）")
    elif any(p.placeholder for p in phs):
        chip(cv, "機種名カード（実機画像は準備中）")


# ================================================================ R 時代のレール
class Rail:
    Y = 700
    X0, X1 = 230, W - 260

    def busy(self, sc):
        return [(120, 120, W - 120, 740)]

    def _stops(self, sc):
        st = _parse_list(sc["opts"].get("stops", "90s|00s|10s|20s|NOW"))
        n = len(st)
        return [(s, self.X0 + (self.X1 - self.X0) * i / (n - 1)) for i, s in enumerate(st)]

    def _cards(self, sc):
        """cards="daiku_gensan_1996@0:0.6|garo_2008@1:1.6" → [(key, 駅番号, 時刻)]"""
        out = []
        for i, c in enumerate(_parse_list(sc["opts"].get("cards", ""))):
            key, _, rest = c.partition("@")
            stop, _, at = rest.partition(":")
            out.append((key, int(stop or i), _cue_or(sc, at, 0.6 + 1.1 * i)))
        return out

    def _draw_rail(self, cv, sc, t, upto):
        stops = self._stops(sc)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        ka = inout(prog(t, 0.0, 0.6))
        x_end = self.X0 + (self.X1 - self.X0) * ka
        d.line((self.X0, self.Y, x_end, self.Y), fill=(70, 84, 112, 255), width=10)
        xg = self.X0 + (self.X1 - self.X0) * upto            # 金色の進み具合（紹介した時代まで）
        d.line((self.X0, self.Y, min(xg, x_end), self.Y), fill=GOLD + (255,), width=10)
        for i, (name, x) in enumerate(stops):
            if x > x_end + 1:
                continue
            lit = x <= xg + 1
            r = 22 if lit else 16
            d.ellipse((x - r, self.Y - r, x + r, self.Y + r), fill=(GOLD if lit else (90, 104, 132)) + (255,),
                      outline=NAVY + (255,), width=5)
            d.text((x, self.Y + 58), name, font=font("black", 46), fill=(TEXT if lit else SUB), anchor="mm",
                   stroke_width=5, stroke_fill=NAVY)
        cv.alpha_composite(lay)
        return stops

    def draw(self, cv, sc, t, lib):
        cv.paste(metal_bg().crop((int(120 * prog(t, 0, sc["dur"])), 0, int(120 * prog(t, 0, sc["dur"])) + W, H)))
        cv.alpha_composite(Image.new("RGBA", (W, H), (6, 10, 22, 90)))
        self.Y = 620 if sc["variant"] == "summary" else 700        # まとめは下に2人が並ぶので少し上
        if sc["variant"] == "summary":
            return self._summary(cv, sc, t, lib)
        cards = self._cards(sc)
        stops = self._stops(sc)
        n = len(stops) - 1
        upto = 0.0
        for key, si, at in cards:
            if t >= at:
                upto = max(upto, si / n)
        upto = upto * out3(prog(t, cards[0][2] if cards else 0, 0.6)) if cards else 0
        self._draw_rail(cv, sc, t, upto)
        for key, si, at in cards:
            if t < at:
                continue
            sh, pad, ph, (iw, ih) = _card(lib, key, 230, 300)
            x = stops[si][1]
            k = prog(t, at, 0.45)
            e = back(k, 1.8) if k < 1 else 1.0
            y_end = self.Y - 60 - ih / 2
            y = lerp(-ih, y_end, e)
            put(cv, sh, (x - sh.width / 2, y - sh.height / 2), min(1.0, k * 3))
            fx.sparkles(cv, (x, y_end), t, at + 0.4, n=14, spread=220, seed=si + 2)
            kl = out3(prog(t, at + 0.35, 0.3))
            md = _meta(lib, key)
            # 機種名の小さな札（レールの下の年代名とぶつからないよう、カードの上）
            tg = text_layer(md.get("short", md.get("name", key)), font("bold", 28), TEXT, stroke=5, pad=0)
            put(cv, tg, (x - tg.width / 2, y_end - ih / 2 - 46), kl)
        _notes_for(cv, lib, [c[0] for c in cards if t >= c[2]])
        if sc["opts"].get("title"):
            ta = _cue_or(sc, sc["opts"].get("title_at"), (cards[-1][2] + 1.0) if cards else 1.0)
            if t >= ta:
                g = gold_text(sc["opts"]["title"], fit_size(sc["opts"]["title"], "black", 120, 1500))
                s = 1 + 0.6 * (1 - back(prog(t, ta, 0.32), 2.2))
                gs = scaled(g, s)
                put(cv, gs, ((W - gs.width) / 2, 120 - (gs.height - g.height) / 2), min(1, prog(t, ta, 0.08)))
        if sc["opts"].get("note"):
            nt = text_layer(sc["opts"]["note"], font("medium", 26), (200, 208, 222), stroke=4, pad=0)
            put(cv, nt, (60, 96), out3(prog(t, 0.8, 0.5)))

    # まとめ：年代ごとに機種名を積み、最後に番組ロゴ
    def _summary(self, cv, sc, t, lib):
        groups = [_parse_list(g.replace(",", "|")) for g in str(sc["opts"].get("groups", "")).split("/")]
        stops = self._stops(sc)
        n = len(stops) - 1
        t_step = float(sc["opts"].get("step", 0.55))
        upto = min(1.0, max(0.0, (t - 0.4) / (t_step * len(groups)))) if groups else 0
        self._draw_rail(cv, sc, t, upto * (len(groups) - 1) / n if groups else 0)
        k_idx = 0
        for gi, keys in enumerate(groups):
            x = stops[min(gi, n)][1]
            for j, key in enumerate(keys):
                at = 0.4 + t_step * gi + 0.12 * j
                kk = out3(prog(t, at, 0.35))
                if kk <= 0:
                    continue
                md = _meta(lib, key)
                nm = md.get("short", md.get("name", key))
                f = font("black", fit_size(nm, "black", 34, 330))
                tl = text_layer(nm, f, TEXT, stroke=5, pad=0)
                bw, bh = tl.width + 34, tl.height + 22
                chipim = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
                ImageDraw.Draw(chipim).rounded_rectangle((0, 0, bw - 1, bh - 1), 12, fill=(14, 22, 40, 230),
                                                        outline=GOLD + (200,), width=3)
                chipim.alpha_composite(tl, (17, 11))
                y = self.Y - 70 - (len(keys) - j) * (bh + 12)
                put(cv, chipim, (x - bw / 2, y + 30 * (1 - kk)), kk)
                k_idx += 1
        # 最後に番組ロゴ（オリジナル）
        tl0 = sc["dur"] - float(sc["opts"].get("logo_len", 1.8))
        kl = prog(t, tl0, 0.4)
        if kl > 0:
            cv.alpha_composite(Image.new("RGBA", (W, H), (6, 10, 22, int(225 * kl))))
            g = gold_text("ナギバクのパチンコ研究所", 96)
            s = 1 + 0.3 * (1 - back(kl, 2.0))
            gs = scaled(g, s)
            put(cv, gs, ((W - gs.width) / 2, 380 - (gs.height - g.height) / 2), kl)
            sub = text_layer(sc["opts"].get("logo_sub", "NAGIBAKU PACHINKO LAB"), font("black", 34), BLUE, pad=0)
            put(cv, sub, ((W - sub.width) / 2, 520), kl)

    def events(self, sc):
        if sc["variant"] == "summary":
            groups = str(sc["opts"].get("groups", "")).split("/")
            t_step = float(sc["opts"].get("step", 0.55))
            ev = [(0.05, "whoosh")] + [(0.4 + t_step * i, "pop") for i in range(len(groups))]
            ev += [(sc["dur"] - float(sc["opts"].get("logo_len", 1.8)), "jingle")]
            return ev
        ev = [(0.05, "whoosh")]
        for key, si, at in self._cards(sc):
            ev += [(at, "whoosh"), (at + 0.38, "stamp"), (at + 0.42, "sparkle")]
        if sc["opts"].get("title"):
            cards = self._cards(sc)
            ta = _cue_or(sc, sc["opts"].get("title_at"), (cards[-1][2] + 1.0) if cards else 1.0)
            ev += [(ta, "impact"), (ta, "flash_s")]
        return ev


# ================================================================ T 年表＋主役のカード
class Timeline:
    AXIS_Y = 700

    def busy(self, sc):
        return [(100, 120, W - 100, 860)]

    def _events(self, sc):
        """events="1996:daiku_gensan_1996:源さん|1999:umi_1999:海物語" → [(年, 機種, 主役になる時刻)]"""
        out = []
        for i, e in enumerate(_parse_list(sc["opts"].get("events", ""))):
            parts = e.split(":")
            yr, key = float(parts[0]), parts[1]
            cue = parts[2] if len(parts) > 2 else None
            out.append((yr, key, _cue_or(sc, cue, 0.5 + 3 * i) - 0.2))
        out[0] = (out[0][0], out[0][1], min(out[0][2], 0.5))
        return out

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        cv.paste(dark_grad())
        evs = self._events(sc)
        y0, y1 = [float(v) for v in str(o.get("range", "1995-2000")).split("-")]
        x0, x1 = 220, W - 220
        X = lambda v: x0 + (x1 - x0) * (v - y0) / (y1 - y0)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        ka = inout(prog(t, 0.0, 0.6))
        d.line((x0, self.AXIS_Y, x0 + (x1 - x0) * ka, self.AXIS_Y), fill=(80, 94, 122, 255), width=6)
        for yr in range(int(y0), int(y1) + 1):
            if X(yr) <= x0 + (x1 - x0) * ka:
                d.line((X(yr), self.AXIS_Y - 12, X(yr), self.AXIS_Y + 12), fill=(110, 124, 150, 255), width=3)
                d.text((X(yr), self.AXIS_Y + 44), str(yr), font=font("bold", 32), fill=SUB, anchor="mm")
        cv.alpha_composite(lay)
        if o.get("heading"):
            put(cv, label(o.get("tag", "TIMELINE"), BLUE, 24), (110, 110), out3(prog(t, 0.1, 0.4)))
            hg = gold_text(o["heading"], fit_size(o["heading"], "black", 84, 1100))
            put(cv, hg, (100, 140), out3(prog(t, 0.15, 0.5)))
        cur = max([i for i, (_, _, at) in enumerate(evs) if t >= at] or [0])
        for i, (yr, key, at) in enumerate(evs):
            if t < at - 0.01 and i > cur:
                continue
            focus = i == cur
            kf = inout(prog(t, at, 0.5)) if focus else 1 - inout(prog(t, evs[min(i + 1, len(evs) - 1)][2], 0.5))
            kin = out3(prog(t, at, 0.45))
            sh, pad, ph, (iw, ih) = _card(lib, key, 270, 360)
            s = lerp(0.62, 1.0, kf)
            img = scaled(sh, s)
            x = X(yr)
            cy = self.AXIS_Y - 60 - ih * s / 2 - 10
            dim = lerp(0.55, 1.0, kf)
            put(cv, img, (x - img.width / 2, cy - img.height / 2 + 40 * (1 - kin)), kin * dim)
            # 年表の点と、カードへの細い線
            pl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            pd = ImageDraw.Draw(pl)
            pd.line((x, cy + ih * s / 2, x, self.AXIS_Y), fill=(GOLD if focus else (120, 130, 150)) + (255,), width=3)
            pd.ellipse((x - 14, self.AXIS_Y - 14, x + 14, self.AXIS_Y + 14), fill=(GOLD if focus else (120, 130, 150)) + (255,),
                       outline=NAVY + (255,), width=4)
            put(cv, pl, (0, 0), kin)
            # 主役のカードの横に、機種名と年
            if focus:
                md = _meta(lib, key)
                side = 1 if x < W / 2 else -1
                tx = x + side * (iw / 2 + 50)
                nm = md.get("name", key)
                nl = text_layer(nm, font("black", fit_size(nm, "black", 64, 640)), TEXT, stroke=6, pad=0)
                wl = text_layer(f"{_when(md)}　{md.get('maker', '')}", font("bold", 36), GOLD, stroke=5, pad=0)
                kt = out3(prog(t, at + 0.25, 0.4))
                nx = tx if side > 0 else tx - nl.width
                wx = tx if side > 0 else tx - wl.width
                put(cv, nl, (nx + 30 * side * (1 - kt), cy - 70), kt)
                put(cv, wl, (wx + 30 * side * (1 - kt), cy + 10), kt)
                ln = md.get("line")
                if ln:
                    ll = text_layer(ln, font("bold", 34), (205, 212, 224), stroke=4, pad=0)
                    put(cv, ll, ((tx if side > 0 else tx - ll.width), cy + 70), out3(prog(t, at + 0.5, 0.4)))
        _notes_for(cv, lib, [e[1] for e in evs if t >= e[2]])
        if o.get("source"):
            source_line(cv, o["source"])

    def events(self, sc):
        ev = [(0.05, "whoosh")]
        for yr, key, at in self._events(sc):
            ev += [(max(0.1, at), "pop"), (max(0.1, at) + 0.3, "stamp")]
        return ev


# ================================================================ V 2台の対比
class Duo:
    def busy(self, sc):
        return [(160, 150, W - 160, 820)]

    def _times(self, sc):
        o = sc["opts"]
        return (_cue_or(sc, o.get("left_at"), 0.3), _cue_or(sc, o.get("q_at"), None) if o.get("q_at") else None,
                _cue_or(sc, o.get("right_at"), 1.2))

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        cv.paste(dark_grad())
        tl, tq, tr = self._times(sc)
        if o.get("heading"):
            k = out3(prog(t, 0.0, 0.5))
            hg = gold_text(o["heading"], fit_size(o["heading"], "black", 80, 1400))
            put(cv, hg, ((W - hg.width) / 2, 70 + 14 * (1 - k)), k)
        cols = [ACCENTS.get(o.get("left_accent", "blue"), BLUE), ACCENTS.get(o.get("right_accent", "gold"), GOLD)]
        for side, key, at, col in (("left", o.get("left"), tl, cols[0]), ("right", o.get("right"), tr, cols[1])):
            if not key:
                continue
            cx = 520 if side == "left" else W - 520
            cy = 490
            if side == "right" and tq is not None and tq <= t < at:          # 「？」のシルエット（まだ明かさない）
                kq = out3(prog(t, tq, 0.35))
                q = Image.new("RGBA", (290, 400), (0, 0, 0, 0))
                qd = ImageDraw.Draw(q)
                qd.rounded_rectangle((0, 0, 289, 399), 28, fill=(16, 22, 38, 235), outline=col + (200,), width=5)
                qd.text((145, 200), "？", font=font("black", 200), fill=col, anchor="mm")
                wob = 6 * math.sin(t * 9)
                put(cv, q, (cx - 145, cy - 200 + wob), kq)
                continue
            if t < at:
                continue
            if side == "right" and o.get("right_entry"):
                moments.entry_before(cv, t, at)
            sh, pad, ph, (iw, ih) = _card(lib, key, 300, 400)
            k = prog(t, at, 0.45)
            e = back(k, 1.7) if k < 1 else 1.0
            x = lerp(cx + (-420 if side == "left" else 420), cx, e)
            put(cv, sh, (x - sh.width / 2, cy - sh.height / 2), min(1.0, k * 3))
            if side == "right" and o.get("right_entry"):
                moments.entry_after(cv, t, at, (cx, cy), (cx - iw / 2, cy - ih / 2, cx + iw / 2, cy + ih / 2),
                                    ribbon=o.get("right_ribbon", "注目機種 ENTRY!"))
            md = _meta(lib, key)
            kt = out3(prog(t, at + 0.3, 0.4))
            nm = md.get("short", md.get("name", key))
            nl = text_layer(nm, font("black", fit_size(nm, "black", 52, 640)), TEXT, stroke=6, pad=0)
            put(cv, nl, (cx - nl.width / 2, cy + ih / 2 + 26), kt)
            wl = text_layer(_when(md), font("bold", 34), col, stroke=5, pad=0)
            put(cv, wl, (cx - wl.width / 2, cy + ih / 2 + 26 + nl.height + 8), kt)
            tag = o.get(f"{side}_tag")
            if tag:                                # 特徴のひとこと（色つきの札）
                f = font("black", 36)
                tt = text_layer(tag, f, NAVY, pad=0)
                b = Image.new("RGBA", (tt.width + 40, tt.height + 24), (0, 0, 0, 0))
                ImageDraw.Draw(b).rounded_rectangle((0, 0, b.width - 1, b.height - 1), 12, fill=col + (255,))
                b.alpha_composite(tt, (20, 12))
                kb = prog(t, at + 0.5, 0.3)
                bs = scaled(b, 1 + 0.3 * (1 - back(kb, 2.0))) if kb > 0 else None
                if bs is not None:
                    put(cv, bs, (cx - bs.width / 2, cy - ih / 2 - bs.height - 6), min(1, kb * 3))
        if o.get("left") and o.get("right") and t >= max(tl, tr):
            kv = prog(t, max(tl, tr) + 0.3, 0.3)
            if kv > 0:
                r = 58 * (0.4 + 0.6 * back(kv, 2.4))
                bd = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
                dd = ImageDraw.Draw(bd)
                dd.ellipse((100 - r, 100 - r, 100 + r, 100 + r), fill=NAVY + (255,), outline=GOLD + (255,), width=6)
                dd.text((100, 98), o.get("mid", "VS"), font=font("black", int(r * 0.8)), fill=GOLD, anchor="mm")
                put(cv, bd, (W / 2 - 100, 490 - 100), 1.0)
        if o.get("note"):
            nt = text_layer(o["note"], font("medium", 28), (200, 208, 222), stroke=4, pad=0)
            put(cv, nt, ((W - nt.width) / 2, 200), out3(prog(t, _cue_or(sc, o.get("note_at"), 1.0), 0.5)))
        _notes_for(cv, lib, [k for k in (o.get("left"), o.get("right")) if k])
        if o.get("source"):
            source_line(cv, o["source"])

    def events(self, sc):
        o = sc["opts"]
        tl, tq, tr = self._times(sc)
        ev = [(0.05, "whoosh"), (tl, "whoosh"), (tl + 0.4, "stamp")]
        if tq is not None:
            ev += [(tq, "pop")]
        if o.get("right_entry"):
            ev += [(tr - 0.15, "whoosh")] + moments.entry_events(tr)
        else:
            ev += [(tr, "whoosh"), (tr + 0.4, "stamp")]
        if o.get("left") and o.get("right"):
            ev += [(max(tl, tr) + 0.3, "pop")]
        return ev


TEMPLATES = {"R": Rail(), "T": Timeline(), "V": Duo()}
