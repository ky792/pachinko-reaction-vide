#!/usr/bin/env python3
"""白背景のキャラ画像（全身）を透過PNGにする。
使い方: python reaction/prep_characters.py <入力.png> <出力.png>
- 外側の白だけを透過（輪郭線の内側の白い毛は残す）
- 効果線（！や？）は残す
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGB")).astype(int)
white = (a.min(2) > 228) & ((a.max(2) - a.min(2)) < 30)
lab, n = ndi.label(white)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
fg = ~bg
fg = ndi.binary_opening(fg, iterations=1)
# 小さなゴミを除く
lab2, n2 = ndi.label(fg)
if n2:
    sz = ndi.sum(fg, lab2, range(1, n2 + 1))
    fg = np.isin(lab2, [i + 1 for i, s in enumerate(sz) if s > 400])
alpha = ndi.gaussian_filter(fg.astype(float), 0.8)
rgba = np.dstack([a, np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
Image.fromarray(rgba, "RGBA").save(dst)
print(dst)
