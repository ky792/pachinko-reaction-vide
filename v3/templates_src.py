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
        lb = label(o.get("tag", "資料｜出典付き・独自作成"), BLUE, 26)
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


TEMPLATES = {"S": Source()}
