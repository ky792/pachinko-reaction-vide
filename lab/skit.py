"""寸劇（テイコウペンギン型の冒頭）用のキャラ演技。

台本で `@skit on` 〜 `@skit off` の間は、キャラを大きく向かい合わせに出し、セリフごとに動かす。
素材は1枚絵（表情差分なし）なので、動き・傾き・漫符（！？汗）で感情を見せる。

動き（@dir act=… で指定。指定がなければ語尾から自動）
  hop    小さく跳ねる（「！」で終わる行の既定）
  jump   大きく跳ねる（驚き・はしゃぎ）
  shake  小刻みに震える（怒り・ツッコミ）
  tilt   首をかしげる＋「？」（「？」で終わる行の既定）
  shock  のけぞって「！」
  sweat  汗をたらす
  slump  しょんぼり縮む
  lean   相手に詰め寄る
  none   何もしない
"""
import math

from PIL import Image, ImageDraw

import ui

H_SKIT = 600                     # 寸劇中のキャラの高さ（全身の絵）
H_BUST = 760                     # バストアップの表情差分を使うときの高さ
POS = {"nagi": 560, "baku": 1360}  # 足元の中心 x
FOOT_Y = ui.H - 150
FACE = {"nagi": 1, "baku": -1}   # 相手のいる向き（+1＝右）


# 動きに合う表情（表情差分の画像があるときだけ変わる。無ければ normal のまま）
ACT_FACE = {"hop": "happy", "jump": "excited", "shake": "angry", "tilt": "confused", "shock": "surprised",
            "sweat": "sweat", "slump": "sad", "lean": "smug"}


def auto_act(who, text):
    t = text.rstrip()
    if t.endswith("？"):
        return "tilt"
    if t.endswith("！"):
        return "jump" if who == "baku" and t.count("！") >= 2 else "hop"
    return "none"


def _act_now(scene, who, t):
    for a in scene.get("acts", []):
        if a["who"] == who and a["start"] <= t < a["end"] + 0.4:
            return a["act"], t - a["start"], a["end"] - a["start"]
    return None, 0.0, 0.0


def _mark(canvas, kind, x, y, k):
    """漫符：！ ？ 汗。k は出方（0〜1）"""
    if k <= 0:
        return
    lay = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    if kind in ("!", "?"):
        col = ui.KEY if kind == "!" else ui.NAGI
        f = ui.font("black", 150)
        for dx, dy in ((-5, 0), (5, 0), (0, -5), (0, 5)):
            d.text((120 + dx, 120 + dy), kind, font=f, fill=(20, 24, 36, 255), anchor="mm")
        d.text((120, 120), kind, font=f, fill=col, anchor="mm")
    else:  # 汗
        d.polygon([(120, 40), (80, 130), (160, 130)], fill=(120, 190, 255, 235))
        d.ellipse((78, 95, 162, 180), fill=(120, 190, 255, 235))
        d.ellipse((98, 115, 116, 140), fill=(230, 245, 255, 220))
    s = 0.6 + 0.4 * ui.ease_out_back(min(1.0, k), 1.8)
    lay = lay.resize((max(1, int(240 * s)), max(1, int(240 * s))), Image.LANCZOS)
    ui.paste(canvas, lay, (int(x - lay.width / 2), int(y - lay.height / 2)), min(1.0, k * 1.5))


def draw(canvas, scene, t, speaker, k_in, alpha, face_at=lambda who, t: "normal"):
    """寸劇のキャラ2人を描く。k_in は登場（横から滑り込む 0→1）、alpha は全体の濃さ"""
    for who in ("nagi", "baku"):
        talking = speaker == who
        act, tl, dur = _act_now(scene, who, t)
        dx = dy = ang = 0.0
        sx = sy = 1.0
        bright = 1.0 if talking or speaker is None else 0.8
        mark, mk, my = None, 0.0, 0.0
        # 呼吸と、話している間の小さな弾み
        dy += 4 * math.sin(2 * math.pi * 0.45 * t + (0 if who == "nagi" else 1.9))
        if talking:
            dy -= 7 * abs(math.sin(2 * math.pi * 2.3 * t))
            sy *= 1 + 0.012 * abs(math.sin(2 * math.pi * 2.3 * t))
        end_k = 1 - ui.ease_in_out(ui.prog(tl, dur, 0.35)) if act else 0.0
        if act == "hop":
            dy -= 45 * math.sin(math.pi * min(1.0, tl / 0.32))
        elif act == "jump":
            dy -= 95 * abs(math.sin(math.pi * min(2.0, tl / 0.34)))
            sy *= 1 + 0.04 * math.sin(math.pi * min(1.0, tl / 0.34))
        elif act == "shake":
            dx += 11 * math.sin(2 * math.pi * 17 * tl) * max(0.0, 1 - tl / 0.9)
        elif act == "tilt":
            ang = 9 * FACE[who] * -1 * ui.ease_out(ui.prog(tl, 0, 0.25)) * end_k
            mark, mk, my = "?", ui.prog(tl, 0.05, 0.3) * end_k, 0.0
        elif act == "shock":
            p = ui.ease_out_back(ui.prog(tl, 0, 0.22), 2.0)
            dx -= 40 * FACE[who] * p * end_k
            sx *= 1 + 0.06 * p * end_k; sy *= 1 + 0.06 * p * end_k
            mark, mk = "!", ui.prog(tl, 0.0, 0.2) * end_k
        elif act == "sweat":
            mark, mk, my = "sweat", ui.prog(tl, 0.1, 0.3) * end_k, 40 * ui.ease_in_out(ui.prog(tl, 0.1, 1.2))
        elif act == "slump":
            p = ui.ease_in_out(ui.prog(tl, 0, 0.4)) * end_k
            sy *= 1 - 0.07 * p; dy += 25 * p; bright *= 1 - 0.18 * p
            mark, mk, my = "sweat", ui.prog(tl, 0.3, 0.3) * end_k, 30 * ui.ease_in_out(ui.prog(tl, 0.3, 1.2))
        elif act == "lean":
            dx += 70 * FACE[who] * ui.ease_out(ui.prog(tl, 0, 0.3)) * end_k
            ang = -5 * FACE[who] * ui.ease_out(ui.prog(tl, 0, 0.3)) * end_k
        if act in ("hop", "jump") and who == "baku" and tl < 0.7:
            mark, mk = "!", ui.prog(tl, 0.05, 0.2) * (1 - ui.prog(tl, 0.5, 0.2))
        # 登場：左右の画面外から滑り込む
        dx += -FACE[who] * 760 * (1 - ui.ease_out(k_in))
        h = int(round(H_SKIT * sy / 8) * 8)
        face = face_at(who, t)
        bust = ui.has_busts(who)
        if bust:      # バストアップの表情差分：下端を画面の下に隠す。漫符は絵に描いてあるので足さない
            h = int(round(H_BUST * sy / 8) * 8)
            img, _ = ui.scaled_bust(who, h, round(bright, 2), face)
            if face != "normal":
                mark = None
        else:
            img, _ = ui._scaled(who, h, round(bright, 2), face)
        if abs(sx - sy) > 0.004:
            img = img.resize((max(1, int(img.width * sx / sy)), img.height), Image.LANCZOS)
        if abs(ang) > 0.2:
            img = img.rotate(ang, resample=Image.BICUBIC, expand=True)
        x = POS[who] + dx - img.width / 2
        y = (ui.H + 20 if bust else FOOT_Y) + dy - img.height
        ui.paste(canvas, img, (int(x), int(y)), alpha)
        if mark:
            mx = POS[who] + dx + FACE[who] * -150
            _mark(canvas, mark, mx, y + 40 + my, mk * alpha)
