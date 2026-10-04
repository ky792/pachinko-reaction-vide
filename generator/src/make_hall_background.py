"""パチンコ店のホール（島の通路を正面から見た構図）の背景画像を描く。オリジナル描画・ロゴなし。

    python src/make_hall_background.py            → assets/backgrounds/hall_real.png
    python src/make_hall_background.py --seed 3   （台の画面の色・配置を変える）
"""
import sys, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SS = 2
W, H = 1920 * SS, 1080 * SS
CX, CY, FOC = W / 2, H * 0.47, 1.05 * W / 2


def P(x, y, z):
    return (CX + FOC * x / z, CY - FOC * y / z)


def poly(d, pts, fill, outline=None, width=1):
    d.polygon([P(*p) for p in pts], fill=fill, outline=outline)
    if outline and width > 1:
        q = [P(*p) for p in pts]
        d.line(q + [q[0]], fill=outline, width=width)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def main():
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
    rng = np.random.default_rng(seed)
    im = Image.new("RGB", (W, H), (10, 8, 18))
    d = ImageDraw.Draw(im, "RGBA")

    XW, FLOOR, CEIL, Z0, Z1 = 2.3, -1.55, 1.75, 1.6, 34.0
    # 天井
    poly(d, [(-XW, CEIL, Z0), (XW, CEIL, Z0), (XW, CEIL, Z1), (-XW, CEIL, Z1)], (22, 20, 34))
    z = Z0
    while z < Z1:  # 天井の照明パネル
        poly(d, [(-0.9, CEIL - 0.01, z), (0.9, CEIL - 0.01, z), (0.9, CEIL - 0.01, z + 0.9), (-0.9, CEIL - 0.01, z + 0.9)],
             (255, 245, 220, int(230 * min(1, 6 / z))))
        z += 2.6
    # 床（カーペット柄）
    poly(d, [(-XW, FLOOR, Z0), (XW, FLOOR, Z0), (XW, FLOOR, Z1), (-XW, FLOOR, Z1)], (90, 22, 40))
    z = Z0
    k = 0
    while z < Z1:
        dz = 0.55
        for i in range(-4, 4):
            if (i + k) % 2 == 0:
                x0 = i * XW / 4
                poly(d, [(x0, FLOOR, z), (x0 + XW / 4, FLOOR, z), (x0 + XW / 4, FLOOR, z + dz), (x0, FLOOR, z + dz)], (120, 34, 52))
        z += dz; k += 1
    # 通路の床の反射
    for i in range(40):
        zz = Z0 + i * 0.8
        a = int(40 * math.exp(-i / 12))
        poly(d, [(-0.5, FLOOR + 0.001, zz), (0.5, FLOOR + 0.001, zz), (0.5, FLOOR + 0.001, zz + 0.4), (-0.5, FLOOR + 0.001, zz + 0.4)], (255, 220, 200, a))
    # 奥の壁と看板
    poly(d, [(-XW, FLOOR, Z1), (XW, FLOOR, Z1), (XW, CEIL, Z1), (-XW, CEIL, Z1)], (30, 24, 50))
    poly(d, [(-1.2, 0.9, Z1 - 0.01), (1.2, 0.9, Z1 - 0.01), (1.2, 1.4, Z1 - 0.01), (-1.2, 1.4, Z1 - 0.01)], (255, 60, 90))
    poly(d, [(-1.1, 0.95, Z1 - 0.02), (1.1, 0.95, Z1 - 0.02), (1.1, 1.35, Z1 - 0.02), (-1.1, 1.35, Z1 - 0.02)], (255, 140, 160))

    screen_cols = [((255, 60, 120), (255, 200, 60)), ((60, 160, 255), (140, 255, 255)), ((255, 170, 30), (255, 250, 150)),
                   ((150, 80, 255), (255, 120, 220)), ((40, 220, 140), (220, 255, 120)), ((255, 80, 60), (255, 220, 120))]
    frame_cols = [(200, 30, 50), (40, 90, 200), (230, 170, 30), (120, 60, 200), (220, 220, 230), (30, 30, 40)]
    MW = 0.82  # 台の幅（奥行き方向）
    for side in (-1, 1):
        zs = np.arange(Z0 + 0.2, Z1 - 1, MW)
        for z in zs[::-1]:  # 奥から手前へ
            x = side * XW
            z0, z1 = z, z + MW * 0.94
            light = min(1.0, 3.2 / z + 0.25)
            fc = frame_cols[int(rng.integers(len(frame_cols)))]
            # 台枠
            poly(d, [(x, -0.75, z0), (x, -0.75, z1), (x, 0.95, z1), (x, 0.95, z0)], shade(fc, light))
            # 遊技盤（円形のガラス枠）＋中央液晶
            zm = (z0 + z1) / 2
            def circ(yc, rad, n=28):
                return [(x, yc + rad * math.sin(t), zm + rad * 0.95 * math.cos(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]
            poly(d, circ(0.2, 0.43), shade((205, 210, 225), light))
            poly(d, circ(0.2, 0.39), shade((70, 110, 170), light))
            a, b = screen_cols[int(rng.integers(len(screen_cols)))]
            poly(d, [(x, 0.06, zm - 0.24), (x, 0.06, zm + 0.24), (x, 0.44, zm + 0.24), (x, 0.44, zm - 0.24)], shade((20, 20, 30), light))
            poly(d, [(x, 0.09, zm - 0.21), (x, 0.09, zm + 0.21), (x, 0.41, zm + 0.21), (x, 0.41, zm - 0.21)], shade(a, light * 1.1))
            poly(d, [(x, 0.09, zm - 0.21), (x, 0.09, zm + 0.21), (x, 0.2, zm + 0.21), (x, 0.2, zm - 0.21)], shade(b, light * 1.1))
            for k3 in (-1, 0, 1):  # 図柄っぽい3つの四角
                zz = zm + k3 * 0.12
                poly(d, [(x, 0.22, zz - 0.04), (x, 0.22, zz + 0.04), (x, 0.34, zz + 0.04), (x, 0.34, zz - 0.04)], shade((255, 255, 255), light))
            # ヘソ（スタートチャッカー）
            poly(d, [(x, -0.1, zm - 0.05), (x, -0.1, zm + 0.05), (x, -0.04, zm + 0.05), (x, -0.04, zm - 0.05)], shade((255, 210, 60), light))
            # 液晶の光が床と通路ににじむ
            gx = x * 0.9
            poly(d, [(gx, FLOOR + 0.002, z0), (gx, FLOOR + 0.002, z1), (gx - side * 0.6, FLOOR + 0.002, z1), (gx - side * 0.6, FLOOR + 0.002, z0)], a + (int(50 * light),))
            # 釘・玉（小さな点）
            for _ in range(10):
                yy = float(rng.uniform(-0.18, 0.55)); zz = float(rng.uniform(z0 + 0.08, z1 - 0.08))
                px, py = P(x, yy, zz); r = max(1.5, 5 * SS / zz)
                d.ellipse([px - r, py - r, px + r, py + r], fill=shade((240, 240, 255), light))
            # 上皿・下皿
            poly(d, [(x, -1.0, z0 + 0.04), (x, -1.0, z1 - 0.04), (x, -0.75, z1 - 0.04), (x, -0.75, z0 + 0.04)], shade((50, 50, 60), light))
            poly(d, [(x, -0.95, z0 + 0.1), (x, -0.95, z1 - 0.25), (x, -0.8, z1 - 0.25), (x, -0.8, z0 + 0.1)], shade((200, 200, 215), light))
            # ハンドル
            hx, hy = P(x, -0.88, z1 - 0.12); r = 14 * SS / z * 3
            d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=shade((30, 30, 35), light))
            # 台下のキャビネット
            poly(d, [(x, FLOOR, z0), (x, FLOOR, z1 + MW * 0.06), (x, -1.0, z1 + MW * 0.06), (x, -1.0, z0)], shade((35, 30, 45), light))
            # データランプ（台上）
            poly(d, [(x, 1.05, z0 + 0.25), (x, 1.05, z1 - 0.25), (x, 1.32, z1 - 0.25), (x, 1.32, z0 + 0.25)], shade((25, 25, 30), light))
            poly(d, [(x, 1.12, z0 + 0.3), (x, 1.12, z1 - 0.3), (x, 1.25, z1 - 0.3), (x, 1.25, z0 + 0.3)], (255, 70, 50, int(220 * light)))
            # 椅子（通路側にはみ出す）
            cx_ = x - side * 0.5
            seat = shade((150, 30, 40), light)
            poly(d, [(cx_, -0.9, z0 + 0.15), (cx_, -0.9, z1 - 0.15), (cx_ - side * 0.35, -0.9, z1 - 0.15), (cx_ - side * 0.35, -0.9, z0 + 0.15)], seat)
            poly(d, [(cx_ - side * 0.35, -0.9, z0 + 0.15), (cx_ - side * 0.35, -0.4, z0 + 0.22), (cx_ - side * 0.35, -0.4, z1 - 0.22), (cx_ - side * 0.35, -0.9, z1 - 0.15)], shade(seat, 1.15))
            poly(d, [(cx_ - side * 0.17, FLOOR, (z0 + z1) / 2 - 0.03), (cx_ - side * 0.17, FLOOR, (z0 + z1) / 2 + 0.03),
                     (cx_ - side * 0.17, -0.9, (z0 + z1) / 2 + 0.03), (cx_ - side * 0.17, -0.9, (z0 + z1) / 2 - 0.03)], shade((120, 120, 130), light))
        # 島の上の看板帯
        poly(d, [(side * XW, 1.38, Z0), (side * XW, 1.38, Z1), (side * XW, 1.6, Z1), (side * XW, 1.6, Z0)], (255, 200, 50, 235))
        poly(d, [(side * XW, 1.41, Z0), (side * XW, 1.41, Z1), (side * XW, 1.57, Z1), (side * XW, 1.57, Z0)], (220, 40, 60, 235))

    # 奥を暗く（霧）
    fog = Image.new("L", (W, H), 0)
    fd = ImageDraw.Draw(fog)
    for r in range(60, 0, -1):
        rr = r / 60
        fd.ellipse([CX - W * 0.18 * rr, CY - H * 0.2 * rr, CX + W * 0.18 * rr, CY + H * 0.2 * rr], fill=int(150 * (1 - rr)))
    im = Image.composite(Image.new("RGB", (W, H), (20, 16, 34)), im, fog)
    im = im.resize((1920, 1080), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.2))
    out = ROOT / "assets" / "backgrounds" / "hall_real.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    print(f"write: {out}")


if __name__ == "__main__":
    main()
