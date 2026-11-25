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

CX, CY = 630, 640                 # 文字盤の中心
GAUGE_R = (292, 350)              # 外周ゲージ（描かれたシアンの帯）
GAUGE_A = (0, 135)                # ゲージのある角度（12時から時計回り）
BODY_R = 432                      # 時計本体（ベゼル外周）
GEARS = [  # 回す歯車：中心・半径・1秒あたりの角度（向きと速さをばらばらに）
    {'id': 'a', 'x': 575, 'y': 810, 'r': 92, 'dps': 7},
    {'id': 'b', 'x': 630, 'y': 532, 'r': 50, 'dps': -20},
    {'id': 'c', 'x': 780, 'y': 850, 'r': 58, 'dps': 13},
    {'id': 'd', 'x': 725, 'y': 866, 'r': 32, 'dps': -34},
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
tip = np.array([805, 345]); tail = np.array([598, 692])
d = tip - tail
t = np.clip(((xx - tail[0]) * d[0] + (yy - tail[1]) * d[1]) / (d @ d), 0, 1)
dist = np.hypot(xx - (tail[0] + t * d[0]), yy - (tail[1] + t * d[1]))
red = (r > 0.5) & (g < 0.42) & (b < 0.38) & (r - g > 0.25)
hand = (red & (dist < 34)) | ((rad < 34) & red)
hand = cv2.dilate(hand.astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
clean = cv2.inpaint(bgr, hand, 7, cv2.INPAINT_TELEA)

# 2) 右下のデジタル数字「00:45」を消す（SEC. は残す）
digit_box = (xx > 850) & (xx < 1168) & (yy > 1012) & (yy < 1158)
cream = (r > 0.62) & (g > 0.58) & (b > 0.45) & (sat < 0.4)
dig = cv2.dilate((digit_box & cream).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
clean = cv2.inpaint(clean, dig, 9, cv2.INPAINT_TELEA)

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
body_zone = (rad < BODY_R + 30) | (np.hypot(xx - 330, yy - 270) < 75) | (np.hypot(xx - 935, yy - 270) < 75)
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
cv2.ellipse(m, (642, 118), (132, 112), 0, 0, 360, 255, -1)     # 吊り輪
cv2.rectangle(m, (575, 100), (712, 300), 255, -1)               # リューズ
cv2.ellipse(m, (330, 275), (62, 60), 0, 0, 360, 255, -1)        # 左ボタン
cv2.ellipse(m, (935, 275), (62, 60), 0, 0, 360, 255, -1)        # 右ボタン
cv2.circle(m, (642, 118), 92, 0, -1)                            # 吊り輪の穴
cv2.circle(m, (CX, CY), BODY_R, 255, -1)
m = cv2.GaussianBlur(m, (0, 0), 1.5)
Image.fromarray(np.dstack([card, m]), 'RGBA').save(OUT / 'body.png')

# 6) 歯車：円形の切り抜き（縁はぼかす）と、歯車が見える窓（アイボリーの文字盤・刻印プレートを除く）
ivory = (cr > 0.6) & (cg > 0.55) & (cb > 0.42) & (csat < 0.32)
plates = np.zeros((H, W), np.uint8)
cv2.ellipse(plates, (520, 610), (115, 60), 0, 0, 360, 255, -1)  # NAGIBAKU LAB. の黒いプレート
cv2.rectangle(plates, (735, 600), (870, 700), 255, -1)          # 45 SEC. のプレート
win = (~ivory) & (plates == 0) & (rad < 236)
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

geo = {'size': W, 'cx': CX, 'cy': CY, 'body_r': BODY_R, 'gauge_r': GAUGE_R, 'gauge_a': GAUGE_A, 'gears': GEARS, 'hand_len': 330,
       'digits_box': [868, 1018, 1160, 1150]}
(OUT / 'geometry.json').write_text(json.dumps(geo, ensure_ascii=False, indent=1), encoding='utf-8')
print('ok', OUT)
