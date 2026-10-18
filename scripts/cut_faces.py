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


MARGIN = 130   # コマの左右にはみ出した腕・しっぽ・漫符も拾えるよう、横に広げた共通キャンバスにする


def main():
    for who, cfg in SHEETS.items():
        src = np.asarray(Image.open(V2 / "sheets" / f"{who}_faces.png").convert("RGB")).copy()
        Hs, Ws = src.shape[:2]
        fg = ~bg_mask(src)
        lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
        objs = ndimage.find_objects(lab)
        cw = Ws // 4
        out = V2 / who / "face"
        out.mkdir(parents=True, exist_ok=True)
        for r, (y0, y1) in enumerate(cfg["rows"]):
            for c in range(4):
                name = cfg["names"][r * 4 + c]
                if name is None:
                    continue
                # 隣のキャラとくっついているので、コマの境目付近で絵がいちばん薄い縦の列で切り分ける
                def split(b):
                    if b <= 0 or b >= Ws:
                        return max(0, min(Ws, b))
                    lo, hi = max(1, b - 110), min(Ws - 1, b + 110)
                    colsum = fg[y0:y1, lo:hi].sum(0)
                    return lo + int(colsum.argmin())
                x0, x1 = split(c * cw), split((c + 1) * cw)
                keep = np.zeros_like(fg)
                cell = lab[y0:y1, x0:x1]
                ids, cnt = np.unique(cell[cell > 0], return_counts=True)
                main = ids[cnt.argmax()]
                for i in ids:
                    sl = objs[i - 1]
                    cy = (sl[0].start + sl[0].stop) / 2
                    cx = (sl[1].start + sl[1].stop) / 2
                    if i == main or (x0 <= cx < x1 and y0 <= cy < y1):
                        keep |= lab == i
                keep[:, :x0] = False                   # 切り分けた線の外（隣のキャラ）は捨てる
                keep[:, x1:] = False
                keep[y1:] = False                      # ラベルの帯より下は使わない
                keep[:y0] = False
                gx0 = c * cw - MARGIN                  # 共通キャンバスの左端（コマの位置基準）
                ex0, ex1 = max(0, gx0), min(Ws, (c + 1) * cw + MARGIN)
                canvas = np.zeros((y1 - y0, cw + 2 * MARGIN, 4), np.uint8)
                ox = ex0 - gx0
                patch = src[y0:y1, ex0:ex1]
                alpha = np.where(keep[y0:y1, ex0:ex1], 255, 0).astype(np.uint8)
                canvas[:, ox:ox + (ex1 - ex0), :3] = patch
                canvas[:, ox:ox + (ex1 - ex0), 3] = alpha
                Image.fromarray(canvas, "RGBA").save(out / f"{name}.png")
        for a, b in ALIAS[who].items():
            Image.open(out / f"{b}.png").save(out / f"{a}.png")
        print(who, sorted(p.stem for p in out.glob("*.png")))


if __name__ == "__main__":
    main()
