"""45秒解析の時計UI：採用デザイン画像（assets_src/analysis_clock_design.png・1254×1254）からパーツを切り出す

  python shorts/scripts/make_clock_assets.py
→ shorts/public/series/nagi45/clock/
  card.png       … 背景つきの全体（描かれた秒針・デジタル数字・ゲージ・発光を消した土台）
  body.png       … 時計本体だけ（透過。土台から切り抜き）
  glow.png       … シアンの発光パーツだけ（ボタン・側面ランプ・内部の光）
  gauge.png      … 外周ゲージの点灯状態だけ（角度でクリップして減らす）
  gear_a〜d.png  … 回す歯車（円形の切り抜き）／gearwin.png … 歯車が見える窓（文字盤の外）
  geometry.json  … 中心・半径・歯車の位置（コンポーネントが読む）
画像の座標系のまま書き出すので、コンポーネント側は同じ大きさで重ねるだけでずれない
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets_src' / 'analysis_clock_design.png'
OUT = ROOT / 'public' / 'series' / 'nagi45' / 'clock'
OUT.mkdir(parents=True, exist_ok=True)

CX, CY = 628, 659                 # 文字盤の中心（2026-11-25 v2 アニメ調デザイン）
GAUGE_R = (300, 350)              # 外周ゲージ（描かれたシアンの帯）
GAUGE_A = (0, 135)                # ゲージのある角度（12時から時計回り）
BODY_R = 428                      # 時計本体（ベゼル外周）
GEARS = [  # 回す歯車：中心・半径・1秒あたりの角度（向きと速さをばらばらに）
    {'id': 'a', 'x': 575, 'y': 815, 'r': 100, 'dps': 7},
    {'id': 'b', 'x': 680, 'y': 558, 'r': 98, 'dps': -12},
    {'id': 'c', 'x': 725, 'y': 862, 'r': 48, 'dps': 22},
    {'id': 'd', 'x': 812, 'y': 585, 'r': 50, 'dps': -26},
]

bgr = cv2.imread(str(SRC))
H, W = bgr.shape[:2]
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx, mn = rgb.max(2), rgb.min(2)
sat = (mx - mn) / (mx + 1e-6)
yy, xx = np.mgrid[0:H, 0:W]
rad = np.hypot(xx - CX, yy - CY)
ang = (np.degrees(np.arctan2(xx - CX, -(yy - CY))) + 360) % 360

# 1) 描かれた赤い秒針を消す（針の帯の中の赤＋縁取り）
tip = np.array([818, 350]); tail = np.array([610, 700])
d = tip - tail
t = np.clip(((xx - tail[0]) * d[0] + (yy - tail[1]) * d[1]) / (d @ d), 0, 1)
dist = np.hypot(xx - (tail[0] + t * d[0]), yy - (tail[1] + t * d[1]))
red = (r > 0.5) & (g < 0.42) & (b < 0.38) & (r - g > 0.25)
hand = (red & (dist < 30)) | ((rad < 48) & red) | ((dist < 34) & (t > 0.02) & (t < 1.0))   # 赤い針＋縁取りの帯ごと
hand = cv2.dilate(hand.astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
clean = cv2.inpaint(bgr, hand, 7, cv2.INPAINT_TELEA)


# 2) 右下のデジタル数字「00:45」を消す（SEC. は残す）
digit_box = (xx > 825) & (xx < 1160) & (yy > 1030) & (yy < 1170)
cream = (r > 0.7) & (g > 0.7) & (b > 0.6) & (sat < 0.3)
dig = cv2.dilate((digit_box & cream).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
clean = cv2.inpaint(clean, dig, 9, cv2.INPAINT_TELEA)

def sym_fill(img, mask, x, y, rr):
    crop = img[y - rr:y + rr, x - rr:x + rr].astype(np.float32)
    mk = mask[y - rr:y + rr, x - rr:x + rr] > 0
    if not mk.any():
        return
    disc = np.zeros(mk.shape, bool); cv2.circle(disc.view(np.uint8), (rr, rr), rr - 2, 1, -1)
    best = None
    for th in range(20, 340, 2):
        M = cv2.getRotationMatrix2D((rr, rr), th, 1)
        rot = cv2.warpAffine(crop, M, (2 * rr, 2 * rr), flags=cv2.INTER_LINEAR)
        rmk = cv2.warpAffine(mk.astype(np.uint8), M, (2 * rr, 2 * rr), flags=cv2.INTER_NEAREST) > 0
        ok = disc & ~mk & ~rmk
        err = np.abs(rot[ok] - crop[ok]).mean()
        if best is None or err < best[0]:
            best = (err, rot, rmk)
    err, rot, rmk = best
    fill = disc & mk & ~rmk
    crop[fill] = rot[fill]
    img[y - rr:y + rr, x - rr:x + rr] = crop.astype(np.uint8)
    sub = mask[y - rr:y + rr, x - rr:x + rr]
    sub[fill] = 0                      # 埋めた所はもう穴ではない（2回目は残りだけ）
    print('歯車の対称補完', x, y, '誤差', round(float(err), 1))


Mrot = cv2.getRotationMatrix2D((CX, CY), 30, 1)   # 30度先（時計回り）の文字盤を持ってくる
rot30 = cv2.warpAffine(bgr, Mrot, (W, H), flags=cv2.INTER_CUBIC)
gb = GEARS[1]
in_gb = np.hypot(xx - gb['x'], yy - gb['y']) < gb['r']
outer = (hand > 0) & (rad >= 190) & ~in_gb
clean[outer] = rot30[outer]


def sym_fill2(img, mask, x0, y0, rr):
    best = None
    for dx in range(-4, 5, 2):
        for dy in range(-4, 5, 2):
            x, y = x0 + dx, y0 + dy
            crop = img[y - rr:y + rr, x - rr:x + rr].astype(np.float32)
            mk = mask[y - rr:y + rr, x - rr:x + rr] > 0
            disc = np.zeros(mk.shape, np.uint8); cv2.circle(disc, (rr, rr), rr - 2, 1, -1); disc = disc > 0
            for th in list(range(36, 136, 2)) + list(range(224, 324, 2)):   # 針の帯は中心を通るので180度付近は自分自身に重なる→除く
                M = cv2.getRotationMatrix2D((rr, rr), th, 1)
                rot = cv2.warpAffine(crop, M, (2 * rr, 2 * rr))
                rmk = cv2.warpAffine(mk.astype(np.uint8), M, (2 * rr, 2 * rr), flags=cv2.INTER_NEAREST) > 0
                gold = (crop[..., 2] > 170) & (crop[..., 1] > 120) & (crop[..., 0] < 120)   # BGR：金色の歯だけで合わせる
                ok = disc & ~mk & ~rmk & gold
                if ok.sum() < 200:
                    continue
                err = np.abs(rot[ok] - crop[ok]).mean()
                if best is None or err < best[0]:
                    best = (err, x, y, rot, rmk, mk, disc)
    err, x, y, rot, rmk, mk, disc = best
    crop = img[y - rr:y + rr, x - rr:x + rr].astype(np.float32)
    fill = disc & mk & ~rmk
    crop[fill] = rot[fill]
    img[y - rr:y + rr, x - rr:x + rr] = crop.astype(np.uint8)
    sub = mask[y - rr:y + rr, x - rr:x + rr]
    sub[fill] = 0                      # 埋めた所はもう穴ではない（2回目は残りだけ）
    print('歯車の対称補完', x, y, '誤差', round(float(err), 1))


for gr in GEARS:
    if (hand[gr['y'] - gr['r']:gr['y'] + gr['r'], gr['x'] - gr['r']:gr['x'] + gr['r']] > 0).any():
        hole = hand.copy()
        sym_fill2(clean, hole, gr['x'], gr['y'], gr['r'])
        sym_fill2(clean, hole, gr['x'], gr['y'], gr['r'])

# 歯車bの軸（針の帯が中心を通るので描き直す。回しても形が変わらない丸）
gx, gy = 680, 560
cv2.circle(clean, (gx, gy), 27, (40, 30, 30), -1, cv2.LINE_AA)
cv2.circle(clean, (gx, gy), 24, (55, 180, 242), -1, cv2.LINE_AA)
cv2.circle(clean, (gx, gy), 13, (40, 30, 30), -1, cv2.LINE_AA)
cv2.circle(clean, (gx, gy), 10, (200, 196, 196), -1, cv2.LINE_AA)

crgb = cv2.cvtColor(clean, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
cr, cg, cb = crgb[..., 0], crgb[..., 1], crgb[..., 2]
cmx, cmn = crgb.max(2), crgb.min(2)
csat = (cmx - cmn) / (cmx + 1e-6)
cyan = (cb > 0.42) & (cg > 0.42) & (cr < 0.55) & (csat > 0.28) & (cb > cr + 0.15)

# 3) 外周ゲージ：点灯状態を取り出し、土台は消灯（暗いスロット）にする
gauge_zone = (rad > GAUGE_R[0]) & (rad < GAUGE_R[1]) & (ang > GAUGE_A[0]) & (ang < GAUGE_A[1])
gmask = (cyan & gauge_zone)
gmask_s = cv2.GaussianBlur(cv2.dilate(gmask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)), (0, 0), 1.2)
gauge = np.dstack([crgb * 255, gmask_s]).astype(np.uint8)
Image.fromarray(gauge, 'RGBA').save(OUT / 'gauge.png')

# 4) 発光パーツ（ゲージ以外のシアン）を取り出す。土台は消灯（くすんだ紺）にする
body_zone = (rad < BODY_R + 30) | (np.hypot(xx - 335, yy - 265) < 80) | (np.hypot(xx - 920, yy - 260) < 80)
glow_m = cyan & ~gauge_zone & body_zone
glow_s = cv2.GaussianBlur(cv2.dilate(glow_m.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)), (0, 0), 1.5)
glow = np.dstack([crgb * 255, glow_s]).astype(np.uint8)
Image.fromarray(glow, 'RGBA').save(OUT / 'glow.png')

off = crgb.copy()
lum = (0.3 * cr + 0.59 * cg + 0.11 * cb)[..., None]
dark = np.concatenate([0.10 + lum * 0.18, 0.16 + lum * 0.22, 0.24 + lum * 0.28], axis=2)
alpha = (np.maximum(gmask_s, glow_s).astype(np.float32) / 255)[..., None]
off = off * (1 - alpha) + dark * alpha
card = (np.clip(off, 0, 1) * 255).astype(np.uint8)
Image.fromarray(card, 'RGB').save(OUT / 'card.png')

# 5) 時計本体の切り抜き（ベゼル円＋上のリューズと吊り輪＋左右のボタン）
m = np.zeros((H, W), np.uint8)
cv2.circle(m, (CX, CY), BODY_R, 255, -1)
cv2.ellipse(m, (640, 112), (140, 110), 0, 0, 360, 255, -1)     # 吊り輪
cv2.rectangle(m, (560, 95), (720, 300), 255, -1)                # リューズ
cv2.ellipse(m, (335, 268), (70, 66), 0, 0, 360, 255, -1)        # 左ボタン
cv2.ellipse(m, (920, 262), (70, 66), 0, 0, 360, 255, -1)        # 右ボタン
cv2.rectangle(m, (192, 555), (260, 740), 255, -1)               # 左のオレンジのボタン
cv2.rectangle(m, (996, 555), (1064, 740), 255, -1)              # 右のオレンジのボタン
cv2.circle(m, (640, 112), 80, 0, -1)                            # 吊り輪の穴
cv2.circle(m, (CX, CY), BODY_R, 255, -1)
m = cv2.GaussianBlur(m, (0, 0), 1.5)
Image.fromarray(np.dstack([card, m]), 'RGBA').save(OUT / 'body.png')

# 6) 歯車：円形の切り抜き（縁はぼかす）と、歯車が見える窓（アイボリーの文字盤・刻印プレートを除く）
ivory = (cr > 0.8) & (cg > 0.75) & (cb > 0.6) & (csat < 0.28)
plates = np.zeros((H, W), np.uint8)
cv2.rectangle(plates, (395, 525), (612, 705), 255, -1)          # NAGIBAKU LAB. のプレート
cv2.rectangle(plates, (715, 615), (875, 712), 255, -1)          # 45 SEC. のプレート
cv2.ellipse(plates, (600, 700), (190, 26), -8, 0, 360, 255, -1) # 中央の銀のブリッジ
win = (~ivory) & (plates == 0) & (rad < 250)
win = cv2.morphologyEx(win.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
win = cv2.GaussianBlur(win, (0, 0), 1.2)
Image.fromarray(np.dstack([np.full((H, W, 3), 255, np.uint8), win]), 'RGBA').save(OUT / 'gearwin.png')
for gr in GEARS:
    x, y, rr = gr['x'], gr['y'], gr['r']
    crop = card[y - rr:y + rr, x - rr:x + rr]
    dm = np.zeros((2 * rr, 2 * rr), np.uint8)
    cv2.circle(dm, (rr, rr), rr - 3, 255, -1)
    dm = cv2.GaussianBlur(dm, (0, 0), 2.5)
    Image.fromarray(np.dstack([crop, dm]), 'RGBA').save(OUT / f"gear_{gr['id']}.png")

geo = {'size': W, 'cx': CX, 'cy': CY, 'body_r': BODY_R, 'gauge_r': GAUGE_R, 'gauge_a': GAUGE_A, 'gears': GEARS, 'hand_len': 352, 'style': 'anime',
       'digits_box': [826, 1028, 1160, 1170]}
(OUT / 'geometry.json').write_text(json.dumps(geo, ensure_ascii=False, indent=1), encoding='utf-8')
print('ok', OUT)
