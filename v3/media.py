"""素材の読み込み・権利チェック・切り抜き・影・仮素材

assets.json の1件:
  "hokuto_musou": {
    "file": "images/hokuto_musou.png",   # エピソードフォルダからの相対パス（無ければ仮素材）
    "kind": "cutout" | "photo",          # cutout=背景を抜いた実機、photo=全画面用の写真
    "ai": false,                          # AI生成なら true（画面に「イメージ」と出す）
    "license": "ok" | "pending" | "unknown",
    "credit": "画面に出す出典表記"
  }
本番モード（--final）では license が ok 以外の素材は使わず、仮素材に置き換える。
"""
import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .style import ROOT, W, H, font, fade_img, TEXT, SUB, GOLD


class Asset:
    def __init__(self, key, img, info, placeholder, note):
        self.key, self.img, self.info = key, img, info
        self.placeholder = placeholder      # True=仮素材を描いている
        self.note = note                    # 画面右上に出す注記（イメージ／仮素材 など）
        self.credit = info.get("credit", "")


class Library:
    def __init__(self, ep_dir, final=False):
        self.ep_dir = Path(ep_dir)
        self.final = final
        p = self.ep_dir / "assets.json"
        self.table = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        self.cache = {}
        self.report = []

    def _path(self, f):
        p = self.ep_dir / f
        return p if p.exists() else (ROOT / f if (ROOT / f).exists() else None)

    def get(self, key):
        if key in self.cache:
            return self.cache[key]
        info = self.table.get(key, {})
        path = self._path(info["file"]) if info.get("file") else None
        lic = info.get("license", "unknown")
        usable = path is not None and (lic == "ok" or not self.final)
        if usable:
            img = Image.open(path).convert("RGBA")
            if info.get("kind") == "cutout":
                img = cutout(img)
            note = "イメージ（AI生成）" if info.get("ai") else ("" if lic == "ok" else "許諾確認中の素材")
            a = Asset(key, img, info, False, note)
            self.report.append((key, "使用", str(path.relative_to(ROOT)) if str(path).startswith(str(ROOT)) else str(path), lic))
        else:
            reason = "ファイルなし" if path is None else f"許諾:{lic}"
            img = concept_machine() if info.get("kind") == "cutout" else concept_photo()
            a = Asset(key, img, info, True, "仮素材（実機写真に差し替え）" if info.get("kind") == "cutout" else "仮素材")
            self.report.append((key, f"仮素材（{reason}）", info.get("file", "-"), lic))
        self.cache[key] = a
        return a


# ---------------------------------------------------------------- 切り抜きと影
def cutout(img):
    """透過PNGはそのまま。白っぽい背景の写真は、外周から続く白だけを抜く"""
    a = np.asarray(img)
    if a[..., 3].min() < 250:
        return trim(img)
    from scipy import ndimage as ndi
    rgb = a[..., :3].astype(int)
    white = (rgb.min(2) > 225) & ((rgb.max(2) - rgb.min(2)) < 30)
    lab, _ = ndi.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = ndi.gaussian_filter((~bg).astype(float), 0.8)
    out = np.dstack([a[..., :3], np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return trim(Image.fromarray(out, "RGBA"))


def trim(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img


def with_shadow(img, strength=0.65, blur=24, offset=(18, 26), contact=True):
    """切り抜き画像に、落ち影（ぼかし）＋接地影（足元の楕円）を付けた画像を返す"""
    pad = blur * 3
    out = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    m = Image.new("L", out.size, 0)
    m.paste(img.split()[3], (pad + offset[0], pad + offset[1]))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 255))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * strength)))
    out.alpha_composite(sh)
    if contact:
        c = Image.new("RGBA", out.size, (0, 0, 0, 0))
        cw = img.width * 0.42
        cx, cy = pad + img.width / 2, pad + img.height - 6
        ImageDraw.Draw(c).ellipse((cx - cw, cy - 16, cx + cw, cy + 22), fill=(0, 0, 0, 150))
        out.alpha_composite(c.filter(ImageFilter.GaussianBlur(14)))
    out.alpha_composite(img, (pad, pad))
    return out, pad


# ---------------------------------------------------------------- 仮素材（実物と誤認させない）
@lru_cache(maxsize=1)
def concept_machine():
    """汎用のパチンコ台の概念イラスト＋「仮素材」の帯。ロゴや版権要素は描かない"""
    S = 2
    w, h = 520 * S, 860 * S
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 40 * S, fill=(52, 58, 72))
    d.rounded_rectangle((10 * S, 10 * S, w - 10 * S, h - 10 * S), 34 * S, fill=(30, 34, 44), outline=(150, 160, 178), width=3 * S)
    d.rounded_rectangle((60 * S, 26 * S, w - 60 * S, 70 * S), 20 * S, fill=(190, 150, 70))
    cx, cy, r = w / 2, 330 * S, 205 * S
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(18, 40, 72), outline=(170, 180, 200), width=5 * S)
    rng = np.random.default_rng(3)
    for _ in range(170):
        ang = rng.uniform(0, 2 * math.pi); rr = math.sqrt(rng.uniform(0.15, 0.95)) * r * 0.95
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang)
        d.ellipse((x - 2.5 * S, y - 2.5 * S, x + 2.5 * S, y + 2.5 * S), fill=(200, 205, 215))
    d.rounded_rectangle((cx - 120 * S, cy - 95 * S, cx + 120 * S, cy + 70 * S), 14 * S, fill=(8, 12, 22), outline=(120, 190, 255), width=3 * S)
    for i, col in enumerate([(240, 90, 90), (244, 201, 93), (240, 90, 90)]):
        x = cx - 80 * S + i * 80 * S
        d.rounded_rectangle((x - 30 * S, cy - 50 * S, x + 30 * S, cy + 30 * S), 8 * S, fill=col)
    d.ellipse((cx - 22 * S, cy + 110 * S, cx + 22 * S, cy + 150 * S), fill=(230, 230, 236))
    d.rounded_rectangle((40 * S, 590 * S, w - 40 * S, 700 * S), 24 * S, fill=(70, 78, 96), outline=(150, 160, 178), width=3 * S)
    d.rounded_rectangle((60 * S, 730 * S, w - 60 * S, 820 * S), 24 * S, fill=(58, 64, 80))
    d.ellipse((w - 150 * S, 735 * S, w - 70 * S, 815 * S), fill=(120, 128, 142), outline=(200, 205, 215), width=3 * S)
    # 斜めの「仮素材」帯
    band = Image.new("RGBA", (w * 2, 120 * S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rectangle((0, 0, band.width, band.height), fill=(10, 16, 30, 215))
    bd.line((0, 4 * S, band.width, 4 * S), fill=GOLD + (255,), width=4 * S)
    bd.line((0, band.height - 4 * S, band.width, band.height - 4 * S), fill=GOLD + (255,), width=4 * S)
    bd.text((band.width / 2, band.height / 2), "仮素材 ｜ 実機写真に差し替え", font=font("black", 40 * S), fill=TEXT, anchor="mm")
    band = band.rotate(28, expand=True, resample=Image.BICUBIC)
    mask_src = im.split()[3]
    tmp = Image.new("RGBA", im.size, (0, 0, 0, 0))
    tmp.alpha_composite(band, ((w - band.width) // 2, int(h * 0.62 - band.height / 2)))
    tmp.putalpha(Image.fromarray(np.minimum(np.asarray(tmp.split()[3]), np.asarray(mask_src)), "L"))
    im.alpha_composite(tmp)
    return im.resize((w // S, h // S), Image.LANCZOS)


@lru_cache(maxsize=1)
def concept_photo():
    im = Image.new("RGBA", (W, H), (20, 28, 44, 255))
    d = ImageDraw.Draw(im)
    for k in range(-H, W, 48):
        d.line((k, 0, k + H, H), fill=(28, 38, 58), width=10)
    d.text((W / 2, H / 2), "仮素材 ｜ 写真に差し替え", font=font("black", 72), fill=SUB, anchor="mm")
    return im
