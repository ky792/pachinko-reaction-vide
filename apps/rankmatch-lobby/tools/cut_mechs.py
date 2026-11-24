"""科目ロボットのシート（5 体横並び）を、1 体ずつの透過 WebP とチーム色マスクに切り出す。

使い方: python3 tools/cut_mechs.py シート.png レベル(1-3) [green|smooth]
  green  … 背景が単色の緑 #00FF00（クロマキーで抜く・緑のにじみも除去）
  smooth … 背景がなめらかなグラデーション（外周から似た色をたどって抜く。tools/clean_art.py と同じ考え方）
出力: assets/mechs/{ja,ma,en,sc,so}_lv{N}.webp（本体）と _m.webp（マゼンタ部分＝チーム色に塗る範囲のマスク）
      assets/mechs/manifest.json に各画像の大きさと、シート内の基準の高さ（縮尺をそろえるため）を書く。
本体のマゼンタ部分は明るいグレーに置きかえ、ゲーム側でマスクにチーム色を乗せる。
"""
import sys, json, collections
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'mechs'
KEYS = ['ja', 'ma', 'en', 'sc', 'so']


def alpha_green(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    d = g - np.maximum(r, b)
    alpha = 1 - np.clip((d - 25) / 70, 0, 1)
    rgb = a[..., :3].copy()
    spill = d > 0  # 縁の緑かぶりを消す
    rgb[..., 1] = np.where(spill, np.maximum(r, b).clip(0, 255), g)
    return rgb, alpha


def alpha_smooth(a, tol=7):
    H, W = a.shape[:2]; px = a[..., :3].astype(int)
    bg = np.zeros((H, W), bool); seen = np.zeros((H, W), bool)
    q = collections.deque()
    for x in range(W): q.append((x, 0, None)); q.append((x, H - 1, None))
    for y in range(H): q.append((0, y, None)); q.append((W - 1, y, None))
    while q:
        x, y, prev = q.popleft()
        if seen[y, x]: continue
        c = px[y, x]
        if prev is not None and np.abs(c - prev).max() > tol: continue
        seen[y, x] = True; bg[y, x] = True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny, nx]: q.append((nx, ny, c))
    # 機体に囲まれた背景（脚の間など）：その行の背景色に近く、ある程度の大きさがある塊も背景にする
    rowc = np.array([np.median(px[y][bg[y]], axis=0) if bg[y].any() else [0, 0, 0] for y in range(H)])
    near = (np.abs(px - rowc[:, None, :]).max(axis=2) <= 9) & ~bg
    lab = np.zeros((H, W), np.int32); cur = 0
    for y0 in range(H):
        for x0 in np.where(near[y0] & (lab[y0] == 0))[0]:
            cur += 1; st = [(y0, x0)]; lab[y0, x0] = cur; comp = []
            while st:
                y, x = st.pop(); comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and near[ny, nx] and lab[ny, nx] == 0: lab[ny, nx] = cur; st.append((ny, nx))
            if len(comp) > 250:
                ys, xs = zip(*comp); bg[list(ys), list(xs)] = True
    alpha = (~bg).astype(float)
    # 1px だけ縁をやわらげる
    from PIL import ImageFilter
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))) / 255.0
    return a[..., :3].copy(), alpha


def segments(alpha, n=5):
    col = (alpha > 0.5).sum(axis=0) > 2
    segs, start = [], None
    for x, on in enumerate(col):
        if on and start is None: start = x
        if not on and start is not None: segs.append([start, x]); start = None
    if start is not None: segs.append([start, len(col)])
    # 近いものをつなぐ（浮遊ユニットや武器の先など）
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < 4: merged[-1][1] = s[1]
        else: merged.append(s)
    while len(merged) > n:  # 一番細いものを近い方へ
        i = min(range(len(merged)), key=lambda k: merged[k][1] - merged[k][0])
        j = i - 1 if i == len(merged) - 1 or (i > 0 and merged[i][0] - merged[i - 1][1] < merged[i + 1][0] - merged[i][1]) else i + 1
        a, b = sorted([i, j]); merged[a] = [merged[a][0], merged[b][1]]; del merged[b]
    if len(merged) != n: raise SystemExit(f'{n} 体に分けられませんでした（{len(merged)} 個）')
    return merged


def blobs(alpha, n=5):
    """つながった塊にラベルを付け、大きい n 個を機体として、小さい塊は横位置が近い機体に足す。戻り値は画素ごとの機体番号（-1 は背景）"""
    H, W = alpha.shape; on = alpha > 0.5; lab = np.full((H, W), -1, np.int32); comps = []
    for y0 in range(H):
        for x0 in np.where(on[y0] & (lab[y0] < 0))[0]:
            cid = len(comps); st = [(y0, x0)]; lab[y0, x0] = cid; n_px = 0; sx = 0
            while st:
                y, x = st.pop(); n_px += 1; sx += x
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and on[ny, nx] and lab[ny, nx] < 0: lab[ny, nx] = cid; st.append((ny, nx))
            comps.append((n_px, sx / n_px))
    big = sorted(sorted(range(len(comps)), key=lambda c: -comps[c][0])[:n], key=lambda c: comps[c][1])
    if len(big) < n: raise SystemExit('機体を5つに分けられませんでした')
    remap = np.full(len(comps), -1, np.int32)
    for i, c in enumerate(big): remap[c] = i
    for c, (npx, cx) in enumerate(comps):
        if remap[c] < 0 and npx > 30: remap[c] = min(range(n), key=lambda i: abs(comps[big[i]][1] - cx))
    out = np.where(lab >= 0, remap[np.maximum(lab, 0)], -1)
    return out


def main():
    src, lv = sys.argv[1], int(sys.argv[2]); mode = sys.argv[3] if len(sys.argv) > 3 else 'green'
    a = np.asarray(Image.open(src).convert('RGBA'))
    rgb, alpha = alpha_green(a) if mode == 'green' else alpha_smooth(a)
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    mag = np.clip((np.minimum(r, b) - g - 50) / 70, 0, 1) * (np.abs(r - b) < 90)  # マゼンタらしさ
    lum = (0.3 * r + 0.59 * g + 0.11 * b)
    gray = np.clip(lum * 0.6 + 120, 0, 255)  # マゼンタ部分は明るいグレーに（上からチーム色を乗せる）
    base = rgb.astype(float)
    for k in range(3): base[..., k] = base[..., k] * (1 - mag) + gray * mag
    OUT.mkdir(parents=True, exist_ok=True)
    man_path = OUT / 'manifest.json'
    man = json.loads(man_path.read_text()) if man_path.exists() else {}
    owner = None
    try:
        segs = segments(alpha)
    except SystemExit:
        # 羽や武器が隣と縦に重なるとき：つながった塊ごとに分け、大きい 5 つを機体、残りは近い機体へ
        owner = blobs(alpha); segs = []
        for k in range(5):
            xs = np.where((owner == k).any(axis=0))[0]; segs.append((xs[0], xs[-1] + 1))
    boxes = []
    for k, (x0, x1) in enumerate(segs):
        own = (alpha[:, x0:x1] > 0.5) if owner is None else (owner[:, x0:x1] == k)
        rows = np.where(own.sum(axis=1) > 1)[0]
        boxes.append((max(0, x0 - 6), max(0, rows[0] - 6), min(a.shape[1], x1 + 6), min(a.shape[0], rows[-1] + 7)))
    if owner is not None:  # 隣の機体のはみ出しを消す
        keep = np.zeros_like(alpha)
        for k in range(5): keep = np.maximum(keep, (owner == k).astype(float))
        from PIL import ImageFilter
        grow = [np.asarray(Image.fromarray(((owner == k) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0 for k in range(5)]
    ref = max(y1 - y0 for (_, y0, _, y1) in boxes)  # シート内で一番高い機体＝縮尺の基準
    for k, (key, (x0, y0, x1, y1)) in enumerate(zip(KEYS, boxes)):
        al_f = alpha if owner is None else alpha * grow[k]
        al = (al_f[y0:y1, x0:x1] * 255).astype(np.uint8)
        body = np.dstack([base[y0:y1, x0:x1].astype(np.uint8), al])
        Image.fromarray(body, 'RGBA').save(OUT / f'{key}_lv{lv}.webp', quality=88, method=6)
        m = (mag[y0:y1, x0:x1] * al_f[y0:y1, x0:x1] * 255).astype(np.uint8)
        Image.fromarray(np.dstack([np.full_like(m, 255)] * 3 + [m]), 'RGBA').save(OUT / f'{key}_lv{lv}_m.webp', quality=85, method=6)
        man[f'{key}_lv{lv}'] = {'w': int(x1 - x0), 'h': int(y1 - y0), 'ref': int(ref)}
        print(key, lv, x1 - x0, y1 - y0, f'magenta {m.mean() / 2.55:.1f}%')
    man_path.write_text(json.dumps(man, indent=1))
    # ブラウザ（file:// でも動くように）は JSON ではなく JS で読む
    (ROOT / 'data' / 'mech-art.js').write_text('/* tools/cut_mechs.py が生成。科目ロボットの本番絵（無いレベルは近いレベル→SVG の仮絵で代用） */\nwindow.MECH_ART = ' + json.dumps(man) + ';\n', encoding='utf-8')


if __name__ == '__main__':
    main()
