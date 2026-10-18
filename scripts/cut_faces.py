#!/usr/bin/env python3
"""表情差分のシート（4×2・白背景・下にラベル）から、表情ごとの透過PNGを切り出す

  python scripts/cut_faces.py     # generator/assets/characters/v2/<who>/face/<表情>.png

- 白背景は、画像の外周からつながっている白だけを透明にする（キャラの中の白い毛は残る）
- 各コマはラベル（色の帯）の上までを使う。下端はバストアップの切れ目になる
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

V2 = Path(__file__).resolve().parents[1] / "generator" / "assets" / "characters" / "v2"
# シートのコマ順 → 表情名（ui.FACES の名前に合わせる）
SHEETS = {
    "baku": {"rows": [(0, 452), (522, 963)],
             "names": ["happy", "normal", "surprised", "smug", "excited", "angry", "sweat", "sad"]},
    "nagi": {"rows": [(0, 475), (536, 984)],
             "names": ["normal", "happy", "confused", "sweat", "sad", "surprised", "smug", None]},   # 8コマ目（寝落ち）は線画のすき間が多く切り抜けないので使わない
}
ALIAS = {"baku": {"confused": "sweat", "despair": "sad"},
         "nagi": {"angry": "sad", "excited": "happy", "despair": "sad"}}


def bg_mask(a, thr=232, seal=3):
    """外周からつながる白。線画の小さなすき間から毛の白に漏れないよう、線を seal px 太らせてから塗り、あとで戻す"""
    white = a.min(2) >= thr
    ink = ndimage.binary_dilation(~white, iterations=seal)
    lab, _ = ndimage.label(white & ~ink)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # 太らせた分だけ、背景を白い所へ広げ直す
    return ndimage.binary_dilation(bg, iterations=seal, mask=white)


def drop_edge_bits(alpha):
    """コマの左右の端にかかる小さなかけら（隣のコマのはみ出し）を消す"""
    lab, n = ndimage.label(alpha > 0)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    big = sizes.max()
    for i, sz in enumerate(sizes, 1):
        comp = lab == i
        if sz < big * 0.15 and (comp[:, :3].any() or comp[:, -3:].any()):
            alpha[comp] = 0
    return alpha


def main():
    for who, cfg in SHEETS.items():
        src = Image.open(V2 / "sheets" / f"{who}_faces.png").convert("RGB")
        W = src.width
        out = V2 / who / "face"
        out.mkdir(parents=True, exist_ok=True)
        for r, (y0, y1) in enumerate(cfg["rows"]):
            for c in range(4):
                cell = np.asarray(src.crop((c * W // 4 + 8, y0, (c + 1) * W // 4 - 8, y1))).copy()   # 左右8pxは隣のコマのはみ出しが入るので切る
                name = cfg["names"][r * 4 + c]
                if name is None:
                    continue
                m = bg_mask(cell)
                alpha = drop_edge_bits(np.where(m, 0, 255).astype(np.uint8))
                rgba = np.dstack([cell, alpha])
                im = Image.fromarray(rgba, "RGBA")
                im.save(out / f"{name}.png")
        for a, b in ALIAS[who].items():
            Image.open(out / f"{b}.png").save(out / f"{a}.png")
        print(who, sorted(p.stem for p in out.glob("*.png")))


if __name__ == "__main__":
    main()
