import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
A = np.asarray(im).astype(int)
boxes = {
 "nagi/normal":  (362,454,518,612), "nagi/explain": (535,454,690,612),
 "nagi/think":   (362,628,518,786), "nagi/surprise":(535,628,690,786),
 "nagi/point":   (22,222,340,600),
 "baku/normal":  (1088,454,1244,612), "baku/max": (1258,454,1414,612),
 "baku/tsukkomi":(1088,628,1244,786), "baku/mutto":(1258,628,1414,786),
 "baku/cheer":   (728,240,1078,600),
}
for name,(x0,y0,x1,y1) in boxes.items():
    a = A[y0:y1, x0:x1]
    h, w, _ = a.shape
    # 背景＝明るく彩度の低い色（輪郭線の外側）
    lum = a.mean(2); sat = a.max(2) - a.min(2)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if name.startswith("nagi"):
        bgish = (lum > 150) & ((b - r) > 14) & (sat < 120)
    else:
        bgish = (lum > 175) & (sat < 95)
    # 右上の表情ラベル（青 or 赤の札）を消す
    top = np.zeros_like(lum, bool); top[: int(h * 0.26), int(w * 0.35):] = True
    badge = top & (sat > 110) & ((b > r + 60) if name.startswith("nagi") else ((r > b + 120) & (g < 120)))
    bl, bn = ndi.label(ndi.binary_dilation(badge, iterations=2))
    erase = np.zeros_like(badge)
    if bn:
        sz = ndi.sum(badge, bl, range(1, bn + 1))
        for k, z in enumerate(sz, 1):
            if z > 300:
                erase |= ndi.binary_fill_holes(bl == k)
    erase = ndi.binary_dilation(erase, iterations=1)
    # 背景の飾り（青い模様・オレンジの星）を消す
    if name.startswith("nagi"):
        deco = (sat > 100) & (b > r + 60) & (g > 70)
        deco[int(h * 0.35):] = False
        erase |= deco
    else:
        deco = (r > 220) & (g < 140) & (b < 90)
        deco[int(h * 0.22):] = False; deco[:, int(w * 0.3):] = False
        erase |= ndi.binary_dilation(deco, iterations=1)
    lab, n = ndi.label(bgish)
    edge = set(np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    fg = ~bg & ~erase
    fg = ndi.binary_opening(fg, iterations=1)
    lab2, n2 = ndi.label(fg)
    if n2:
        sizes = ndi.sum(fg, lab2, range(1, n2 + 1))
        keep = 1 + int(np.argmax(sizes))
        fg = lab2 == keep
    fg = ndi.binary_fill_holes(fg)
    alpha = ndi.gaussian_filter(fg.astype(float), 0.7)
    rgba = np.dstack([a, (np.clip(alpha, 0, 1) * 255)]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    bb = out.getbbox(); out = out.crop(bb)
    out = out.resize((out.width * 3, out.height * 3), Image.LANCZOS)
    import os; os.makedirs(f"{outdir}/{name.split('/')[0]}", exist_ok=True)
    out.save(f"{outdir}/{name}.png")
    print(name, out.size)
