"""S 資料カード：出典付きの独自資料画面（PNG）を、ポップな枠に入れて見せる

  @S card=S04                     episodes/<回>/sources/S04_*.png を表示
  @S card=S04|S05 at=0|ブログ      2枚目は「ブログ」と言う瞬間に差し替え（秒数でも可）
  @S card=S04 tag="SOURCE"        上のラベル（省略時「資料｜出典付き・独自作成」）

記事のスクリーンショットは使わない。カードの PNG 自体に出典が書いてある前提（下の帯）。
"""
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFilter

from .style import W, H, GOLD, BLUE, TEXT, prog, out3, back, put, scaled, label, bokeh_bg
from . import fx

CX, CY, CW, CH = 80, 175, 1152, 648           # カードの位置と大きさ（右側は話者、下は字幕のための空き）


def _list(s):
    return [x.strip() for x in str(s).split("|") if x.strip()] if s else []


@lru_cache(maxsize=None)
def _card_img(path):
    im = Image.open(path).convert("RGB").resize((CW, CH), Image.LANCZOS)
    pad = 40
    out = Image.new("RGBA", (CW + pad * 2, CH + pad * 2), (0, 0, 0, 0))
    m = Image.new("L", out.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((pad + 14, pad + 20, pad + CW + 14, pad + CH + 20), 22, fill=170)
    sh = Image.new("RGBA", out.size, (0, 0, 0, 255))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(18)))
    out.alpha_composite(sh)
    mask = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, CW - 1, CH - 1), 20, fill=255)
    card = im.convert("RGBA")
    card.putalpha(mask)
    out.alpha_composite(card, (pad, pad))
    ImageDraw.Draw(out).rounded_rectangle((pad - 3, pad - 3, pad + CW + 2, pad + CH + 2), 22, outline=(255, 214, 90), width=5)
    return out, pad


class Source:
    def busy(self, sc):
        return [(CX, CY - 60, CX + CW + 20, CY + CH + 20)]

    def _cards(self, sc, lib):
        o = sc["opts"]
        ids = _list(o.get("card"))
        ats = _list(o.get("at"))
        out = []
        for i, cid in enumerate(ids):
            hits = sorted((lib.ep_dir / "sources").glob(f"{cid}_*.png")) or sorted((lib.ep_dir / "sources").glob(f"{cid}*.png"))
            if not hits:
                raise FileNotFoundError(f"資料カードがありません: {lib.ep_dir}/sources/{cid}_*.png")
            a = ats[i] if i < len(ats) else ("0" if i == 0 else None)
            try:
                ts = float(a)
            except (TypeError, ValueError):
                ts = sc["cue"](a, 0.4 + i * 3.0) - 0.15 if a else 0.4 + i * 3.0
            out.append((max(0.0, ts), str(hits[0])))
        return out

    def draw(self, cv, sc, t, lib):
        o = sc["opts"]
        cv.paste(bokeh_bg())
        from . import style as _st
        lb = label(o.get("tag") or ("SOURCE" if _st.QUIET else "資料｜出典付き・独自作成"), BLUE, 26)
        put(cv, lb, (CX + 8, CY - 58), out3(prog(t, 0.05, 0.4)))
        cards = self._cards(sc, lib)
        cur = [c for c in cards if c[0] <= t] or cards[:1]
        idx = len(cur) - 1
        ts, path = cur[-1]
        img, pad = _card_img(path)
        if idx == 0:
            k = prog(t, ts, 0.55)
            s = 0.86 + 0.14 * back(k, 1.6)
            dy = 60 * (1 - out3(k))
            alpha = min(1.0, k * 2.2)
        else:                       # 差し替え：横から押し出す
            k = prog(t, ts, 0.45)
            prev, _ = _card_img(cards[idx - 1][1])
            put(cv, prev, (CX - pad - 900 * out3(k), CY - pad), 1 - out3(k))
            s, dy, alpha = 1.0, 0, out3(k)
            put(cv, img, (CX - pad + 900 * (1 - out3(k)), CY - pad), alpha)
            img = None
        if img is not None:
            z = s * (1 + 0.012 * prog(t, ts, max(1.0, sc["dur"])))
            g = scaled(img, z) if abs(z - 1) > 1e-3 else img
            put(cv, g, (CX - pad + (img.width - g.width) / 2, CY - pad + dy + (img.height - g.height) / 2), alpha)
        fx.glint(cv, (CX, CY, CX + CW, CY + CH), t, ts + 0.5, 0.8)

    def events(self, sc):
        ev = [(0.05, "whoosh"), (0.45, "pop")]
        ats = _list(sc["opts"].get("at"))
        for a in ats[1:]:
            try:
                ts = float(a)
            except ValueError:
                ts = sc["cue"](a, 3.0) - 0.15
            ev += [(ts, "whoosh"), (ts + 0.3, "pop")]
        return ev


# ---------------------------------------------------------------- 記事ページの画面（@S:shot）
#   @S:shot shot=S07 url="goraku-sangyo.com" focus="60,225,900,900" marks="70,818,545,845@MVP|…" source="出典：…"
#   assets/articles/<shot>.png を、ブラウザ風の枠の中で「全体 → 注目部分へ寄る → 蛍光ペンで印」の順に見せる
BX, BY, BW, BH = 96, 118, 1330, 712        # ブラウザ枠（下は字幕、右は話者のための空き）
BAR = 46
CROP_TOP = 56                              # キット側で付けた確認用の帯を切り取る
UP = 2                                     # 先に2倍へ高品質に拡大しておく（寄ったときにぼけない）


@lru_cache(maxsize=None)
def _shot_img(path):
    im = Image.open(path).convert("RGB")
    im = im.crop((0, CROP_TOP, im.width, im.height))
    return im.resize((im.width * UP, im.height * UP), Image.LANCZOS)


@lru_cache(maxsize=None)
def _browser(url):
    from .style import font
    fr = Image.new("RGBA", (BW + 60, BH + 60), (0, 0, 0, 0))
    m = Image.new("L", fr.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((34, 40, 30 + BW, 36 + BH), 18, fill=180)
    sh = Image.new("RGBA", fr.size, (0, 0, 0, 255))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(16)))
    fr.alpha_composite(sh)
    d = ImageDraw.Draw(fr)
    d.rounded_rectangle((30, 30, 30 + BW, 30 + BH), 16, fill=(236, 239, 245, 255))
    d.rectangle((30, 30 + BAR - 6, 30 + BW, 30 + BAR), fill=(236, 239, 245, 255))
    for k, c in enumerate(((255, 95, 87), (254, 188, 46), (40, 200, 64))):
        d.ellipse((52 + k * 26, 30 + 15, 68 + k * 26, 30 + 31), fill=c)
    d.rounded_rectangle((160, 30 + 9, 30 + BW - 30, 30 + BAR - 9), 12, fill=(255, 255, 255, 255))
    d.text((182, 30 + BAR / 2), url, font=font("medium", 22), fill=(90, 100, 120), anchor="lm")
    return fr


def _rect_aspect(x0, y0, x1, y1, aspect, imw, imh):
    """(x0,y0,x1,y1) を中心はそのまま、縦横比 aspect に広げる（画像からはみ出さないように）"""
    w, h = x1 - x0, y1 - y0
    if w / h < aspect:
        w = h * aspect
    else:
        h = w / aspect
    w, h = min(w, imw), min(h, imh)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x0 = min(max(0, cx - w / 2), imw - w)
    y0 = min(max(0, cy - h / 2), imh - h)
    return [x0, y0, x0 + w, y0 + h]


def _marks(sc):
    out = []
    for i, part in enumerate(_list(sc["opts"].get("marks"))):
        box, _, cue = part.partition("@")
        x0, y0, x1, y1 = [float(v) for v in box.split(",")]
        try:
            ts = float(cue)
        except ValueError:
            ts = sc["cue"](cue, 1.8 + i * 1.5) - 0.1 if cue else 1.8 + i * 1.5
        out.append(((x0, y0 - CROP_TOP, x1, y1 - CROP_TOP), max(1.7, ts)))
    return out


class Shot(Source):
    def busy(self, sc):
        return [(BX, BY - 10, BX + BW + 10, BY + BH + 10)]

    def draw(self, cv, sc, t, lib):
        from .style import ROOT, source_line
        o = sc["opts"]
        cv.paste(bokeh_bg())
        img = _shot_img(str(ROOT / "assets" / "articles" / f"{o['shot']}.png"))
        imw, imh = img.width / UP, img.height / UP
        vw, vh = BW, BH - BAR
        asp = vw / vh
        full = _rect_aspect(0, 0, imw, min(imh, imw / asp), asp, imw, imh)
        full[1], full[3] = 0, full[3] - full[1]
        cam = full                                   # 全体 → 1つ目の注目部分 → （あれば）2つ目…と寄っていく
        prev_t = 0.7
        for i, part in enumerate(_list(o.get("focus", f"0,{CROP_TOP},{imw},{imh + CROP_TOP}"))):
            box, _, cue = part.partition("@")
            fx0, fy0, fx1, fy1 = [float(v) for v in box.split(",")]
            foc = _rect_aspect(fx0, fy0 - CROP_TOP, fx1, fy1 - CROP_TOP, asp, imw, imh)
            if i == 0:
                ts = 0.7
            else:
                try:
                    ts = float(cue)
                except ValueError:
                    ts = sc["cue"](cue, prev_t + 3.0) - 0.5 if cue else prev_t + 3.0
                ts = max(ts, prev_t + 1.2)
            k = out3(prog(t, ts, 1.0))
            cam = [cam[j] + (foc[j] - cam[j]) * k for j in range(4)]
            prev_t = ts
        dz = 0.03 * prog(t, 1.7, max(2.0, sc["dur"]))           # 寄ったあとも少しずつ寄る
        cw, ch = cam[2] - cam[0], cam[3] - cam[1]
        cam = [cam[0] + cw * dz / 2, cam[1] + ch * dz / 2, cam[2] - cw * dz / 2, cam[3] - ch * dz / 2]
        view = img.resize((vw, vh), Image.BICUBIC, box=tuple(v * UP for v in cam))
        sx, sy = vw / (cam[2] - cam[0]), vh / (cam[3] - cam[1])
        lay = ImageDraw.Draw(view, "RGBA")
        for (x0, y0, x1, y1), ts in _marks(sc):                  # 蛍光ペン：左から右へ引く → 赤い枠
            km = prog(t, ts, 0.45)
            if km <= 0:
                continue
            X0, Y0 = (x0 - cam[0]) * sx, (y0 - cam[1]) * sy
            X1, Y1 = (x1 - cam[0]) * sx, (y1 - cam[1]) * sy
            lay.rectangle((X0 - 6, Y0 - 4, X0 - 6 + (X1 - X0 + 12) * out3(km), Y1 + 4), fill=(255, 225, 40, 95))
            if km >= 1:
                ko = out3(prog(t, ts + 0.45, 0.25))
                lay.rounded_rectangle((X0 - 10, Y0 - 8, X1 + 10, Y1 + 8), 8, outline=(230, 40, 60, int(255 * ko)), width=5)
        fr = _browser(o.get("url", ""))
        ke = out3(prog(t, 0.0, 0.45))
        win = fr.copy()
        win.alpha_composite(view.convert("RGBA"), (30, 30 + BAR))
        put(cv, win, (BX - 30, BY - 30 + 70 * (1 - ke)), min(1.0, ke * 1.6))
        if o.get("source"):
            source_line(cv, o["source"])

    def events(self, sc):
        ev = [(0.05, "whoosh"), (0.12, "click"), (0.75, "swipe#1")]
        ev += [(ts, "marker") for _, ts in _marks(sc)]
        return ev


class SourceSwitch:
    """@S は資料カード、@S:shot は記事ページの画面"""
    def __init__(self):
        self.card, self.shot = Source(), Shot()

    def _pick(self, sc):
        return self.shot if sc.get("variant") == "shot" else self.card

    def busy(self, sc):
        return self._pick(sc).busy(sc)

    def draw(self, cv, sc, t, lib):
        return self._pick(sc).draw(cv, sc, t, lib)

    def events(self, sc):
        return self._pick(sc).events(sc)


TEMPLATES = {"S": SourceSwitch()}
