"""ChatGPT などで作った陣地の絵の背景を消して、本当の透過 PNG にする。

使い方: python3 tools/clean_art.py 入力.png 出力.png [x,y ...]
  x,y は建物に囲まれて残った背景の位置（任意・複数可）
対応する背景：
 - 偽の透過（白とグレーの市松模様）・白背景
 - 暗い背景／グラデーション／建物の後ろの白っぽい光のもや
仕組み：画像の外周から「なめらかに続く無彩色（＋淡いピンクのにじみ）」をたどって背景とみなす。
建物の輪郭線のような急な色の変化があるところで止まるので、建物の中の白い面は残る。
淡いピンクのにじみはマゼンタの半透明（＝持ち主の色の光）として少しだけ残す。
"""
import sys, collections
from PIL import Image

def clean(src_path, dst_path, tol=8, seeds=()):
    src = Image.open(src_path).convert('RGB'); W, H = src.size; px = src.load()
    def neutral(c, t=30): r, g, b = c; return max(r, g, b) - min(r, g, b) <= t
    def bright_neutral(c): return min(c) >= 222 and max(c) - min(c) <= 12
    def pinkish(c): r, g, b = c; return 6 <= min(r, b) - g <= 90 and abs(r - b) < 60
    def close(a, b): return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol
    cls = bytearray(W * H); seen = bytearray(W * H)
    q = collections.deque()
    for x in range(W):
        q.append((x, 0, None)); q.append((x, H - 1, None))
    for y in range(H):
        q.append((0, y, None)); q.append((W - 1, y, None))
    for sx, sy in seeds:  # 建物に囲まれた背景（外周とつながらない光のもや）を指定して消す
        q.append((sx, sy, None))
    while q:
        x, y, prev = q.popleft(); i = y * W + x
        if seen[i]: continue
        c = px[x, y]
        ok = bright_neutral(c) or ((neutral(c) or pinkish(c)) and (prev is None or close(c, prev)))
        if not ok: continue
        seen[i] = 1; cls[i] = 2 if pinkish(c) and not bright_neutral(c) else 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]: q.append((nx, ny, c))
    # 建物に囲まれて残った市松模様の塊（2色が混在する明るい塊）も消す
    vis = bytearray(W * H)
    light = lambda c: min(c) >= 236 and max(c) - min(c) <= 8
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if cls[i] or vis[i] or not light(px[x, y]): continue
            comp = []; qq = collections.deque([(x, y)])
            while qq:
                cx, cy = qq.popleft(); j = cy * W + cx
                if vis[j] or cls[j] or not light(px[cx, cy]): continue
                vis[j] = 1; comp.append(j)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H: qq.append((nx, ny))
            if len(comp) > 150:
                hi = sum(1 for j in comp if px[j % W, j // W][0] >= 250); lo = sum(1 for j in comp if px[j % W, j // W][0] <= 246)
                if hi > len(comp) * 0.2 and lo > len(comp) * 0.2:
                    for j in comp: cls[j] = 1
    out = Image.new('RGBA', (W, H)); op = out.load()
    for y in range(H):
        for x in range(W):
            i = y * W + x; r, g, b = px[x, y]
            if cls[i] == 1: op[x, y] = (0, 0, 0, 0)
            elif cls[i] == 2: op[x, y] = (255, 0, 255, int(max(0, min(1, (min(r, b) - g - 6) / 70)) * 140))
            else: op[x, y] = (r, g, b, 255)
    out.save(dst_path)
    return cls.count(1) / len(cls)

if __name__ == '__main__':
    seeds = [tuple(int(v) for v in a.split(',')) for a in sys.argv[3:]]
    print(clean(sys.argv[1], sys.argv[2], seeds=seeds))
