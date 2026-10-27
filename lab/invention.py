"""ナギバク研究所の発明品（docs/NAGIBAKU_WORLD.md）。

台本の @show invention:<キー> で出すパネル。左に発明品（バクの手作り）、右に解析結果。
  - 出た直後に「起動」（発明品が落ちてくる → 震えながらスキャン → ANALYZING…）。gag＝smoke/sparks/flash
  - 起動のあとも発明品はずっと動く（ふわふわ浮く、点滅、回転）。段が出るたびに、ぴょんと跳ねて反応する
  - 起動が終わると結果の1段目。@hl 1 / @hl 2 … で段を足す（最後の段は total）
  - steps の bar（％）を順に積んだ横棒で、内訳の足し算を見せる
見た目はテーマ（研究所の紺／号外の紙×墨）に合わせる。色は ui の現在値を毎回読む（テーマで変わるため）。
"""
import json
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

import ui

CATALOG_PATH = Path(__file__).resolve().parent / "inventions.json"
BOOT_SEC = 1.4      # 起動の演出（この後に結果の1段目が出る）
STEP_SEC = 0.7      # 段が足されるときの動き（この間は描画を使い回さない）

PANEL_BOX = (200, 150, 1720, 770)
DEVICE_C = (452, 470)          # 発明品の中心
RIGHT_X0, RIGHT_X1 = 735, 1675


@lru_cache(maxsize=1)
def catalog():
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["inventions"]


def resolve(d):
    """台本のデータ（device＋結果）にカタログの名前・番号・見た目を足す"""
    cat = catalog()
    if d.get("device") not in cat:
        raise ValueError(f"@show invention: lab/inventions.json に無い発明品 → {d.get('device')}")
    e = cat[d["device"]]
    out = dict(d)
    out.setdefault("name", e["name"])
    out.setdefault("no", e["no"])
    out.setdefault("visual", e.get("visual", "gadget"))
    return out


def settle(d):
    """発明品はずっと動いている（浮く・点滅・回る）ので、描画を使い回さない"""
    return 1e9


def n_stages(d):
    return len(d.get("steps", [])) + (1 if d.get("total") else 0)


def stage_at(c, t):
    """(出ている段の数, 最後の段が出てからの秒数)。起動が終わるまでは 0 段"""
    tl = t - c["start"]
    if tl < BOOT_SEC:
        return 0, None
    hold = c.get("data", {}).get("hold")   # hold=true：1段目も @hl 0 を待つ（それまで ANALYZING のまま）
    st, since = (0, None) if hold else (1, tl - BOOT_SEC)
    for ht, idx in c.get("hl", []):
        if idx is not None and t >= ht and idx + 1 > st:
            st, since = idx + 1, t - ht
    return min(st, n_stages(c.get("data", {}))), since


def busy(c, t):
    """段が足されている最中か"""
    _, since = stage_at(c, t)
    return since is not None and since < STEP_SEC


# ---------------------------------------------------------------- 色
def _col(name):
    if name == "key":
        return ui.KEY
    return ui.hexc(ui._VS_COL.get(name or "nagi", name if str(name).startswith("#") else "#2F7FE0"))


def _line():
    return ui.INK if ui.THEME.get("paper") else ui.hexc("#8FA3BF")   # 研究所の紺では明るめの線（暗い枠色だと発明品が沈む）


def _body_fill():
    return ui.hexc("#FFFFFF") if ui.THEME.get("paper") else ui.hexc("#233650")


ORANGE = ui.hexc("#F07A12")


# ---------------------------------------------------------------- 発明品の絵（PIL の図形だけ。外部の画像生成は使わない）
# どの発明品も s（状態）を受け取って 440×480 の絵を返す。s の中身：
#   tl＝出てからの秒数 / scan＝起動の進み 0〜1 / glow＝起動完了の光 0〜1 / stage＝出ている結果の段数
#   since＝最後の段が出てからの秒数 / data＝台本のデータ / rows＝結果の段（steps＋total）
DEV_W, DEV_H = 440, 480
PAL = ("#2F7FE0", "#F07A12", "#E2343B", "#FFB020", "#3FAE6A", "#8A63D2")   # ルーレット等の色（ナギ青・バク橙から）


def _ctx():
    img = Image.new("RGBA", (DEV_W, DEV_H), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def _lw(paper_w=6, lab_w=4):
    return paper_w if ui.THEME.get("paper") else lab_w


def _box(d, b, r, f=None, w=None):
    """号外は墨の影つき、研究所は影なし"""
    w = w or _lw()
    if ui.THEME.get("paper"):
        d.rounded_rectangle((b[0] + 9, b[1] + 9, b[2] + 9, b[3] + 9), r, fill=ui.INK)
    d.rounded_rectangle(b, r, fill=f or _body_fill(), outline=_line(), width=w)


def _pulse(s, period=1.2):
    """0〜1 をゆっくり行き来する（アンテナの点滅など）"""
    return 0.5 + 0.5 * math.sin(s["tl"] * 2 * math.pi / period)


def _kick(s, dur=0.5):
    """段が足された直後だけ 1→0 に減っていく（腕を上げる・光る など）"""
    return 0.0 if s["since"] is None else max(0.0, 1 - s["since"] / dur)


def _cur_v(s):
    return s["rows"][s["stage"] - 1]["v"] if s["stage"] > 0 and s["rows"] else None


def _fit_text(d, xy, txt, w, size, col, weight="black"):
    f = ui.font(weight, size)
    while ui.text_w(txt, f) > w and f.size > 14:
        f = ui.font(weight, f.size - 2)
    d.text(xy, txt, font=f, fill=col, anchor="mm")


def _robot(s):
    """No.01 継続率分解ロボ：箱型の頭、スキャンする目、胸のモニターに今の数字。段が出るたびに右腕を上げる"""
    img, d = _ctx()
    lw, ln = _lw(), _line()
    blink_on = _pulse(s, 0.9) > 0.5 or s["tl"] < BOOT_SEC
    d.line((220, 70, 220, 22), fill=ln, width=lw)
    d.ellipse((204, 4, 236, 36), fill=ORANGE if blink_on else ui.hexc("#FFD21F"), outline=ln, width=lw)
    up = ui.ease_out(_kick(s, 0.6)) if s["stage"] > 0 else 0.0
    boot_wave = math.sin(s["scan"] * math.pi * 4) * 14 if 0 < s["scan"] < 1 else 0
    for sx in (-1, 1):
        x = 220 + sx * 128
        lift = (70 * up if sx == 1 else 0) + (boot_wave * sx)
        _box(d, (x - 22, 248 - lift, x + 22, 362 - lift), 18)
        d.ellipse((x - 30, 350 - lift, x + 30, 410 - lift), fill=ORANGE, outline=ln, width=lw)
    for sx in (-1, 1):
        x = 220 + sx * 52
        _box(d, (x - 26, 392, x + 26, 452), 10)
        _box(d, (x - 44, 440, x + 44, 470), 12, f=ORANGE)
    _box(d, (104, 226, 336, 404), 26)
    _box(d, (140, 256, 300, 340), 14, f=ui.hexc("#16161A"))
    v = _cur_v(s)
    lit = ui.hexc("#FFD21F") if s["glow"] > 0.5 else ui.hexc("#5A5A5A")
    _fit_text(d, (220, 298), v or "%", 148, 54 if not v else 44, lit)
    d.text((220, 372), "No.01", font=ui.font("black", 26), fill=ln if ui.THEME.get("paper") else ui.TEXT, anchor="mm")
    _box(d, (196, 204, 244, 236), 8)
    _box(d, (96, 64, 344, 214), 30)
    for sx in (-1, 1):
        x = 220 + sx * 136
        d.ellipse((x - 16, 122, x + 16, 154), fill=ORANGE, outline=ln, width=lw)
    vb = (128, 102, 312, 176)
    d.rounded_rectangle(vb, 22, fill=ui.hexc("#16161A"), outline=ln, width=lw)
    blink = s["tl"] > BOOT_SEC and (s["tl"] % 3.1) < 0.12
    if blink:
        d.line((150, 139, 290, 139), fill=ui.hexc("#64BFFF"), width=6)
    else:
        g = ui.hexc("#8FE3FF") if s["glow"] >= 1 else ui.hexc("#64BFFF")
        look = 10 * math.sin(s["tl"] * 1.3) if s["tl"] > BOOT_SEC else 0   # 目をきょろきょろ
        for ex in (178, 262):
            r = 15 + 4 * s["glow"] + 6 * _kick(s, 0.4)
            d.ellipse((ex + look - r, 139 - r, ex + look + r, 139 + r), fill=g)
        if 0 < s["scan"] < 1:
            sx = vb[0] + 16 + (vb[2] - vb[0] - 32) * (0.5 - 0.5 * math.cos(s["scan"] * math.pi * 3))
            d.rectangle((sx - 5, vb[1] + 8, sx + 5, vb[3] - 8), fill=ui.hexc("#FFD21F"))
    return img


def _glasses(s):
    """No.02 スペック透視メガネ：レンズの中を光が何度も走る。段が出るとキラッ"""
    img, d = _ctx()
    lw, ln = _lw(10, 7), _line()
    sweep = (s["tl"] * 0.8) % 1.0 if s["tl"] > 0.4 else 0
    for cx in (130, 310):
        lens = (cx - 92, 150, cx + 92, 334)
        d.ellipse(lens, fill=ui.hexc("#CFEFFF") if s["glow"] > 0.5 else ui.hexc("#9CB4C6"), outline=ORANGE, width=lw)
        d.ellipse(lens, outline=ln, width=3)
        y = 168 + 150 * sweep
        half = math.sqrt(max(0, 92 ** 2 - (y - 242) ** 2)) - 12
        if half > 0:
            d.line((cx - half, y, cx + half, y), fill=ui.hexc("#FFFFFF"), width=10)
        # 透かして見えた「数字」
        if s["stage"] > 0:
            d.text((cx, 242), "%", font=ui.font("black", 70), fill=(47, 127, 224, 110), anchor="mm")
    d.arc((190, 200, 250, 260), 200, 340, fill=ORANGE, width=lw)
    d.line((38, 226, 0, 200), fill=ORANGE, width=lw)
    d.line((402, 226, 440, 200), fill=ORANGE, width=lw)
    k = _kick(s, 0.5)
    if k > 0:   # キラッ（十字の星）
        for (sx, sy) in ((70, 160), (370, 300)):
            r = 46 * ui.ease_out(1 - k) + 10
            a = int(255 * k)
            d.line((sx - r, sy, sx + r, sy), fill=(255, 210, 31, a), width=6)
            d.line((sx, sy - r, sx, sy + r), fill=(255, 210, 31, a), width=6)
    return img


def _portal(s):
    """No.03 時空転送装置：何重もの輪がずっと回る。中心は脈打つ。段が出るとワープの光"""
    img, d = _ctx()
    ln = _line()
    spin = s["tl"] * (420 if s["tl"] < BOOT_SEC else 90)
    for i, r in enumerate((190, 150, 110, 70)):
        col = ORANGE if i % 2 == 0 else ui.hexc("#64BFFF")
        a0 = (spin * (1 if i % 2 else -1) * (1 + 0.3 * i) + i * 40) % 360
        d.arc((220 - r, 240 - r, 220 + r, 240 + r), a0, a0 + 300, fill=col, width=16)
        d.arc((220 - r, 240 - r, 220 + r, 240 + r), 0, 360, fill=ln, width=2)
    for j in range(8):   # 吸い込まれていく粒
        ph = (s["tl"] * 0.6 + j / 8) % 1.0
        ang = j * 0.785 + ph * 4
        rr = 200 * (1 - ph)
        x, y = 220 + rr * math.cos(ang), 240 + rr * math.sin(ang)
        d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 210, 31, int(230 * (1 - ph))))
    pr = 30 + 6 * _pulse(s, 0.8) + 40 * _kick(s, 0.5)
    d.ellipse((220 - pr, 240 - pr, 220 + pr, 240 + pr), fill=ui.hexc("#FFD21F") if s["glow"] > 0.5 else ui.hexc("#5A5A5A"), outline=ln, width=4)
    return img


def _radar(s):
    """No.04 ハマり予報機：レーダーの画面を光の線が回り、段が出るたびに点（反応）が増える"""
    img, d = _ctx()
    lw, ln = _lw(), _line()
    _box(d, (40, 30, 400, 450), 30)
    cx, cy, R = 220, 210, 150
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=ui.hexc("#0F2A1E"), outline=ln, width=lw)
    for rr in (50, 100):
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=ui.hexc("#2E7D57"), width=2)
    d.line((cx - R, cy, cx + R, cy), fill=ui.hexc("#2E7D57"), width=2)
    d.line((cx, cy - R, cx, cy + R), fill=ui.hexc("#2E7D57"), width=2)
    ang = math.radians(s["tl"] * (360 if s["tl"] < BOOT_SEC else 140))
    for k in range(10):   # 残光
        a = ang - k * 0.06
        d.line((cx, cy, cx + (R - 4) * math.cos(a), cy + (R - 4) * math.sin(a)),
               fill=(90, 255, 160, int(220 * (1 - k / 10))), width=5)
    for i in range(s["stage"]):   # 反応の点：段ごとに外側へ
        bx = cx + (40 + 35 * i) * math.cos(1.0 + i * 2.1)
        by = cy + (40 + 35 * i) * math.sin(1.0 + i * 2.1)
        r = 10 + (14 * _kick(s, 0.5) if i == s["stage"] - 1 else 0)
        d.ellipse((bx - r, by - r, bx + r, by + r), fill=ui.hexc("#FFD21F"))
    v = _cur_v(s)
    _box(d, (90, 380, 350, 432), 10, f=ui.hexc("#16161A"))
    _fit_text(d, (220, 406), v or "SCAN…", 240, 34, ui.hexc("#5AFFA0"))
    return img


def _scale(s):
    """No.05 出玉はかり：天秤。段が出ると皿に玉が乗って、ゆらゆら揺れてから止まる"""
    img, d = _ctx()
    lw, ln = _lw(), _line()
    steps = s["data"].get("steps", [])
    vals = [steps[i].get("bar", 0) if i < min(s["stage"], len(steps)) else 0 for i in range(2)]
    tot = sum(vals) or 1
    target = max(-22, min(22, 22 * (vals[1] - vals[0]) / tot)) if sum(vals) else 0
    prev = 0.0
    if s["stage"] >= 2 and len(steps) >= 2:
        prev = -22.0   # 左だけ乗っていた状態から
    k = s["since"] if s["since"] is not None else 99
    angle = target + (prev - target if s["stage"] >= 2 else -target) * math.exp(-3.5 * k) * math.cos(9 * k)
    a = math.radians(angle)
    px, py = 220, 150
    _box(d, (150, 420, 290, 456), 10, f=ORANGE)   # 台
    d.line((220, 150, 220, 420), fill=ln, width=lw + 4)
    L = 170
    ends = [(px - L * math.cos(a), py - L * math.sin(a)), (px + L * math.cos(a), py + L * math.sin(a))]
    d.line((ends[0][0], ends[0][1], ends[1][0], ends[1][1]), fill=ln, width=lw + 6)
    d.ellipse((px - 16, py - 16, px + 16, py + 16), fill=ORANGE, outline=ln, width=lw)
    for i, (ex, ey) in enumerate(ends):
        d.line((ex, ey, ex - 50, ey + 120), fill=ln, width=3)
        d.line((ex, ey, ex + 50, ey + 120), fill=ln, width=3)
        bowl = (ex - 74, ey + 90, ex + 74, ey + 160)
        d.chord(bowl, 0, 180, fill=_body_fill(), outline=ln, width=lw)
        n = int(round(vals[i] / 100 * 14)) if vals[i] else 0
        for j in range(n):   # 玉
            row, colj = divmod(j, 5)
            bx = ex - 48 + colj * 24 + (12 if row % 2 else 0)
            by = ey + 112 - row * 20
            d.ellipse((bx - 11, by - 11, bx + 11, by + 11), fill=ui.hexc("#C9CED6"), outline=ln, width=2)
        if i < len(steps) and i < s["stage"]:
            _fit_text(d, (ex, ey + 186), steps[i]["v"], 160, 34, _col(steps[i].get("c")))
    return img


def _roulette(s):
    """No.06 振り分けルーレット：起動で回って1つ目に止まり、段が出るたびに次の項目まで回る"""
    img, d = _ctx()
    lw, ln = _lw(), _line()
    steps = s["data"].get("steps", [])
    vals = [max(0.1, st.get("bar", 1)) for st in steps] or [1]
    tot = sum(vals)
    spans, acc = [], 0.0
    for v in vals:
        spans.append((acc, acc + 360 * v / tot)); acc += 360 * v / tot
    centers = [(a + b) / 2 for a, b in spans]

    def target(i, prev):
        tg = (-90 - centers[min(i, len(centers) - 1)]) % 360
        while tg - prev < 360:
            tg += 360
        return tg
    rot_seq = [0.0]
    for i in range(max(1, s["stage"])):
        rot_seq.append(target(i, rot_seq[-1]))
    if s["stage"] == 0:
        rot = rot_seq[1] * ui.ease_out(s["scan"]) if s["scan"] > 0 else 0
    else:
        k = ui.ease_out(min(1.0, (s["since"] if s["since"] is not None else 9) / 1.0))
        rot = rot_seq[-2] + (rot_seq[-1] - rot_seq[-2]) * k if s["stage"] > 1 else rot_seq[1]
    cx, cy, R = 220, 230, 175
    if ui.THEME.get("paper"):
        d.ellipse((cx - R + 10, cy - R + 10, cx + R + 10, cy + R + 10), fill=ui.INK)
    for i, (a, b) in enumerate(spans):
        hl = s["stage"] > 0 and i == s["stage"] - 1
        col = ui.hexc(PAL[i % len(PAL)])
        d.pieslice((cx - R, cy - R, cx + R, cy + R), a + rot, b + rot, fill=col if hl or s["stage"] == 0 else ui._mix(col, ui.PANEL, 0.45), outline=ln, width=3)
        if b - a > 26:
            m = math.radians((a + b) / 2 + rot)
            tx, ty = cx + R * 0.62 * math.cos(m), cy + R * 0.62 * math.sin(m)
            d.text((tx, ty), steps[i].get("short", steps[i]["v"]) if i < len(steps) else "", font=ui.font("black", 26),
                   fill=(255, 255, 255, 255), anchor="mm", stroke_width=3, stroke_fill=ui.hexc("#16161A"))
    d.ellipse((cx - R, cy - R, cx + R, cy + R), outline=ln, width=lw + 2)
    d.ellipse((cx - 28, cy - 28, cx + 28, cy + 28), fill=ORANGE, outline=ln, width=lw)
    bob = 6 * _kick(s, 0.3)
    d.polygon([(cx - 24, cy - R - 40 + bob), (cx + 24, cy - R - 40 + bob), (cx, cy - R + 8 + bob)], fill=ui.KEY, outline=ln)
    _box(d, (150, 418, 290, 454), 10, f=ORANGE)
    return img


def _calc(s):
    """No.07 ボーダー電卓：ボタンが順に光って、画面の数字がパラパラ回ってから止まる"""
    img, d = _ctx()
    lw, ln = _lw(), _line()
    _box(d, (70, 20, 370, 460), 30)
    _box(d, (100, 52, 340, 140), 12, f=ui.hexc("#1E2A22"))
    v = _cur_v(s)
    rolling = s["stage"] == 0 or (s["since"] is not None and s["since"] < 0.45)
    if rolling:
        n = int(s["tl"] * 20)
        txt = "".join(str((n * (j + 3)) % 10) for j in range(4))
    else:
        txt = v or "0"
    _fit_text(d, (220, 96), txt, 220, 52, ui.hexc("#9BFFB8"))
    keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"]
    press = int(s["tl"] * 7) % 16 if (s["tl"] < BOOT_SEC or rolling) else (14 if _kick(s, 0.4) > 0 else -1)
    for i, kname in enumerate(keys):
        r, c = divmod(i, 4)
        x0, y0 = 100 + c * 62, 170 + r * 70
        on = i == press
        fill = ui.hexc("#FFD21F") if on else (ORANGE if kname == "=" else _body_fill())
        d.rounded_rectangle((x0, y0 + (4 if on else 0), x0 + 52, y0 + 56), 10, fill=fill, outline=ln, width=3)
        d.text((x0 + 26, y0 + 30 + (4 if on else 0)), kname, font=ui.font("black", 28),
               fill=ln if ui.THEME.get("paper") or fill != _body_fill() else ui.TEXT, anchor="mm")
    return img


DEVICES = {"robot": _robot, "glasses": _glasses, "portal": _portal, "radar": _radar,
           "scale": _scale, "roulette": _roulette, "calculator": _calc}


def _smoke(lay, tl, base):
    """起動の失敗ぎみの煙：頭のあたりから灰色の丸が上がって消える"""
    d = ImageDraw.Draw(lay)
    for i in range(4):
        st = 0.55 + 0.28 * i
        k = ui.prog(tl, st, 1.4)
        if k <= 0 or k >= 1:
            continue
        x = base[0] + 40 + 30 * math.sin(i * 2.1 + k * 3) + 26 * i
        y = base[1] - 20 - 120 * ui.ease_out(k)
        r = 24 + 40 * k
        a = int(200 * (1 - k))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(150, 150, 150, a), outline=(90, 90, 90, a), width=3)


def _sparks(lay, tl, center):
    """バチバチ：発明品のまわりに黄色いギザギザが散る"""
    d = ImageDraw.Draw(lay)
    for i in range(6):
        st = 0.6 + 0.15 * i
        k = ui.prog(tl, st, 0.35)
        if k <= 0 or k >= 1:
            continue
        ang = i * 1.7 + 0.4
        r0 = 150 + 40 * k
        pts = []
        for j in range(5):
            rr = r0 + j * 16
            off = (10 if j % 2 else -10)
            pts.append((center[0] + rr * math.cos(ang) + off * math.sin(ang), center[1] + rr * math.sin(ang) - off * math.cos(ang)))
        d.line(pts, fill=(255, 210, 31, int(255 * (1 - k))), width=6, joint="curve")


def _flash(lay, tl, box):
    """ピカッ：パネル全体が一瞬白くなる（メガネがまぶしすぎる等）"""
    k = max(0.0, 1 - abs(tl - 1.05) / 0.25)
    if k > 0:
        ImageDraw.Draw(lay).rectangle(box, fill=(255, 255, 255, int(230 * k)))


GAGS = {"smoke": 2.6, "sparks": 1.8, "flash": 1.4}   # ギャグ → 終わるまでの秒数


# ---------------------------------------------------------------- パネル
def draw(canvas, tl, dur, data, stage, since):
    out = 1 - ui.ease_in_out(ui.prog(tl, dur - 0.4, 0.4))
    if out <= 0:
        return
    W, H = ui.W, ui.H
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x0, y0, x1, y1 = PANEL_BOX
    kp = ui.ease_out(ui.prog(tl, 0.0, 0.28))
    panel = Image.new("RGBA", (x1 - x0 + 20, y1 - y0 + 20), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    ui._ink_box(pd, (0, 0, x1 - x0 - 1, y1 - y0 - 1))
    ui.lab_label(pd, (RIGHT_X0 - x0, 40), f"BAKU WORKS  ·  INVENTION No.{int(data.get('no', 0)):02d}", ORANGE, 20)
    sep_x = RIGHT_X0 - x0 - 40
    pd.line((sep_x, 80, sep_x, y1 - y0 - 40), fill=_line(), width=3 if ui.THEME.get("paper") else 2)
    pd.text((DEVICE_C[0] - x0, y1 - y0 - 66), data["name"], font=ui.font("black", 40), fill=ui.TEXT, anchor="mm")
    ui.paste(lay, panel, (x0, y0 + 24 * (1 - kp)), kp)

    # 発明品：上から落ちてきて、起動中は小刻みに震え、そのあとはふわふわ浮く
    kd = ui.ease_out_back(ui.prog(tl, 0.12, 0.45), 1.5)
    st = {"tl": tl, "scan": ui.prog(tl, 0.55, BOOT_SEC - 0.6) if tl < BOOT_SEC else 0,
          "glow": ui.ease_out(ui.prog(tl, BOOT_SEC - 0.15, 0.25)), "stage": stage, "since": since, "data": data,
          "rows": list(data.get("steps", [])) + ([data["total"]] if data.get("total") else [])}
    dev = DEVICES.get(data.get("visual"), _robot)(st)
    shake = 4 * math.sin(tl * 70) if 0.55 < tl < BOOT_SEC - 0.1 else 0
    bob = 6 * math.sin((tl - BOOT_SEC) * 2.4) if tl > BOOT_SEC else 0
    hop = -18 * math.sin(math.pi * min(1.0, since / 0.35)) if since is not None and since < 0.35 else 0   # 段が出たらぴょん
    dx = DEVICE_C[0] - dev.width / 2 + shake
    dy = DEVICE_C[1] - dev.height / 2 - 30 - 260 * (1 - kd) + bob + hop
    if kd > 0:
        ui.paste(lay, dev, (dx, dy), min(1.0, max(0.0, kd)))
    gag = data.get("gag")
    if gag == "smoke" and tl < GAGS["smoke"]:
        _smoke(lay, tl, (DEVICE_C[0] + 60, DEVICE_C[1] - 150))
    elif gag == "sparks" and tl < GAGS["sparks"]:
        _sparks(lay, tl, (DEVICE_C[0], DEVICE_C[1] - 30))
    elif gag == "flash" and tl < GAGS["flash"]:
        _flash(lay, tl, (x0, y0, x1, y1))

    d = ImageDraw.Draw(lay)
    d.text((RIGHT_X0, y0 + 92), data.get("heading", ""), font=ui.font("black", 50), fill=ui.TEXT, anchor="lm")
    if stage == 0:
        _analyzing(lay, tl, 1.0)
    elif since is not None and since < 0.3 and (data.get("hold") and stage == 1 or not data.get("hold") and tl < BOOT_SEC + 0.3):
        _analyzing(lay, tl, 1 - ui.ease_in_out(since / 0.3))
    if stage > 0:
        _results(lay, data, stage, since)
    ui.paste(canvas, lay, (0, 0), out * kp if kp < 1 else out)


def _analyzing(lay, tl, a):
    if a <= 0 or tl < 0.45:
        return
    tmp = Image.new("RGBA", (RIGHT_X1 - RIGHT_X0, 220), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    dots = "." * (1 + int(tl * 6) % 3)
    if tl >= BOOT_SEC:
        dots = "..."   # 起動が終わったら止める（描画を使い回せるように）
    d.text((0, 60), "ANALYZING" + dots, font=ui.font("black", 54), fill=ORANGE, anchor="lm")
    k = ui.prog(tl, 0.55, BOOT_SEC - 0.6)
    if k >= 1:
        dots = "..."
    w = tmp.width
    d.rectangle((0, 130, w, 160), outline=_line(), width=3)
    d.rectangle((4, 134, 4 + (w - 8) * k, 156), fill=ORANGE)
    ui.paste(lay, tmp, (RIGHT_X0, 330), a)


def _results(lay, data, stage, since):
    steps = list(data.get("steps", []))
    rows = steps + ([dict(data["total"], total=True)] if data.get("total") else [])
    d = ImageDraw.Draw(lay)
    y = 290
    first = max(0, stage - 3)   # 段が4つ以上あるときは、新しい3段だけ見せる（ルーレットの振り分けなど）
    for i, row in enumerate(rows[:stage]):
        if i < first:
            continue
        newest = i == stage - 1
        k = ui.ease_out(ui.prog(since, 0, 0.35)) if newest and since is not None else 1.0
        h = _row(lay, row, y, k)
        y += h
    # 内訳の横棒（steps の bar を順に積む）
    bars = [s for s in steps if s.get("bar") is not None]
    if bars:
        by0, bh = 598, 46
        bx0, bx1 = RIGHT_X0, RIGHT_X1
        bw = bx1 - bx0
        d.rectangle((bx0, by0, bx1, by0 + bh), fill=(ui.PANEL_LINE[0], ui.PANEL_LINE[1], ui.PANEL_LINE[2], 40))
        acc = 0.0
        for i, s in enumerate(steps[:stage]):
            if s.get("bar") is None:
                continue
            newest = i == stage - 1
            kb = ui.ease_out(ui.prog(since, 0.1, 0.55)) if newest and since is not None else 1.0
            a0 = bx0 + bw * acc / 100
            a1 = a0 + bw * s["bar"] / 100 * kb
            d.rectangle((a0, by0, a1, by0 + bh), fill=_col(s.get("c")))
            if acc > 0:
                d.line((a0, by0, a0, by0 + bh), fill=ui.INK if ui.THEME.get("paper") else ui.BG, width=4)
            acc += s["bar"]
        for g in range(1, 10):
            gx = bx0 + bw * g / 10
            d.line((gx, by0 + bh, gx, by0 + bh + (14 if g == 5 else 8)), fill=ui.SUB, width=2)
        d.rectangle((bx0, by0, bx1, by0 + bh), outline=_line(), width=ui.LINE_W)
        total_shown = data.get("total") and stage >= n_stages(data)
        if total_shown:
            tx = bx0 + bw * acc / 100
            d.line((tx, by0 - 14, tx, by0 + bh + 14), fill=ui.KEY, width=6)
    foot = 664
    if data.get("formula") and stage >= n_stages(data):
        kf = ui.ease_out(ui.prog(since, 0.3, 0.3)) if since is not None and stage == n_stages(data) else 1.0
        tmp = Image.new("RGBA", (RIGHT_X1 - RIGHT_X0, 50), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((0, 25), data["formula"], font=ui.font("bold", 30), fill=ui.TEXT, anchor="lm")
        ui.paste(lay, tmp, (RIGHT_X0, foot - 4), kf)
    if data.get("note"):
        d.text((RIGHT_X0, foot + 72), data["note"], font=ui.font("medium", 22), fill=ui.SUB, anchor="lm")


def _row(lay, row, y, k):
    """結果の1段。左に見出しと補足、右に大きな数字。total は数字を赤（号外）／金（研究所）で"""
    h = 100 if row.get("s") else 80
    tmp = Image.new("RGBA", (RIGHT_X1 - RIGHT_X0, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    col = ui.KEY if row.get("total") else _col(row.get("c"))
    d.rectangle((0, 6, 10, h - 18), fill=col)
    d.text((28, 30), row["k"], font=ui.font("black", 36), fill=ui.TEXT, anchor="lm")
    if row.get("s"):
        d.text((28, 70), row["s"], font=ui.font("medium", 26), fill=ui.SUB, anchor="lm")
    fv = ui.font("black", 78 if row.get("total") else 68)
    d.text((tmp.width - 4, 38), row["v"], font=fv, fill=col, anchor="rm",
           stroke_width=4 if ui.THEME.get("paper") else 0, stroke_fill=ui.PANEL)
    ui.paste(lay, tmp, (RIGHT_X0 + 60 * (1 - k), y), k)
    return h
