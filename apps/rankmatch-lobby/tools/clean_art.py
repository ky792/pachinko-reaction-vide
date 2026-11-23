"""ChatGPT などで作った陣地の絵の「偽の透過（市松模様）」や白背景を消して、本当の透過 PNG にする。

使い方: python3 tools/clean_art.py 入力.png assets/territory/skins/skin_xxx.png
 - 画像の外周からつながる、明るい無彩色（白・薄いグレー＝市松模様）を透明にする
 - 外周につながる淡いピンクのにじみは、マゼンタの半透明（＝持ち主の色の光）として残す
 - 建物に囲まれて残った市松模様の塊（2色が混在する明るい塊）も消す
"""
import sys, collections
from PIL import Image

def clean(src_path, dst_path):
    src = Image.open(src_path).convert('RGB'); W, H = src.size; px = src.load()
    nb = lambda r, g, b: min(r, g, b) >= 222 and max(r, g, b) - min(r, g, b) <= 12
    pink = lambda r, g, b: min(r, b) >= 170 and (min(r, b) - g) >= 12 and abs(r - b) < 70
    cls = bytearray(W * H); seen = bytearray(W * H)
    q = collections.deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft(); i = y * W + x
        if seen[i]: continue
        seen[i] = 1; r, g, b = px[x, y]
        if nb(r, g, b): cls[i] = 1
        elif pink(r, g, b): cls[i] = 2
        else: continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]: q.append((nx, ny))
    vis = bytearray(W * H)
    light = lambda r, g, b: min(r, g, b) >= 236 and max(r, g, b) - min(r, g, b) <= 8
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if cls[i] or vis[i] or not light(*px[x, y]): continue
            comp = []; q = collections.deque([(x, y)])
            while q:
                cx, cy = q.popleft(); j = cy * W + cx
                if vis[j] or cls[j] or not light(*px[cx, cy]): continue
                vis[j] = 1; comp.append(j)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H: q.append((nx, ny))
            if len(comp) > 150:
                hi = sum(1 for j in comp if px[j % W, j // W][0] >= 250); lo = sum(1 for j in comp if px[j % W, j // W][0] <= 246)
                if hi > len(comp) * 0.2 and lo > len(comp) * 0.2:
                    for j in comp: cls[j] = 1
    out = Image.new('RGBA', (W, H)); op = out.load()
    for y in range(H):
        for x in range(W):
            i = y * W + x; r, g, b = px[x, y]
            if cls[i] == 1: op[x, y] = (0, 0, 0, 0)
            elif cls[i] == 2: op[x, y] = (255, 0, 255, int(max(0, min(1, (min(r, b) - g - 12) / 80)) * 170))
            else:
                edge = any(0 <= x + dx < W and 0 <= y + dy < H and cls[(y + dy) * W + x + dx] == 1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                op[x, y] = (r, g, b, 90) if edge and min(r, g, b) > 190 and max(r, g, b) - min(r, g, b) < 20 else (r, g, b, 255)
    out.save(dst_path)

if __name__ == '__main__':
    clean(sys.argv[1], sys.argv[2])
