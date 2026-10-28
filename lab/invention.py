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
LAUNCH_SEC = 6.3    # launch=true：起動シーン（画面が切り替わる）の長さ
LAUNCH_OPEN = 5.75  # 起動シーンのシャッターが開き始める時刻（ここからパネルの時間が始まる）
# 起動シーンの段取り（秒）
L_SHUT, L_HOLD, L_OPEN1 = 0.35, 0.75, 1.0       # 閉じる／ロゴを見せる／開いて暗い研究所へ
L_CHECK0, L_CHARGE0, L_WAKE = 1.15, 2.55, 3.75  # 起動チェック開始／充電開始／目を覚ます（フラッシュ）
L_NAME0, L_ONLINE = 4.05, 4.95                  # 名前が1文字ずつ落ちてくる／SYSTEM ONLINE
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
    if e.get("sprite") and (SPRITE_DIR / e["sprite"]).is_dir():   # 絵がそろっていれば図形の代わりに絵を使う
        out.setdefault("sprite", e["sprite"])
        out["visual"] = "sprite"
    out.setdefault("kind", e.get("kind"))
    return out


def settle(d):
    """発明品はずっと動いている（浮く・点滅・回る）ので、描画を使い回さない"""
    return 1e9


def n_stages(d):
    if d.get("sim"):
        return 2   # 1段目＝シミュレーションを回す、2段目＝理論値と平均を重ねる
    return len(d.get("steps", [])) + (1 if d.get("total") else 0)


def launch_offset(d):
    """起動シーンがある発明品は、パネルの時間をシャッターが開くところから数える"""
    return LAUNCH_OPEN if d.get("launch") else 0.0


def stage_at(c, t):
    """(出ている段の数, 最後の段が出てからの秒数)。起動が終わるまでは 0 段"""
    tl = t - c["start"] - launch_offset(c.get("data", {}))
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
    """No.01 RNC-01（絵が無いときの図形版）：箱型の頭、スキャンする目、胸のモニターに今の数字。段が出るたびに右腕を上げる"""
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


def _sim_draws(sim):
    """上乗せシミュレーター：毎回同じ結果になるよう、seed 固定で trials 回ぶん引く（確率どおりの振り分け）"""
    import numpy as np
    ps = np.array([b["p"] for b in sim["buckets"]], float)
    ps = ps / ps.sum()
    return np.random.default_rng(int(sim.get("seed", 7))).choice(len(ps), size=int(sim.get("trials", 1000)), p=ps)


def sim_progress(data, stage, since):
    """何回目まで回したか（0〜trials）"""
    sim = data["sim"]
    n = int(sim.get("trials", 1000))
    if stage <= 0 or since is None:
        return 0
    if stage >= 2:
        return n
    k = min(1.0, since / float(sim.get("run_sec", 4.0)))
    return int(round(n * (k ** 1.6)))   # 最初はゆっくり、だんだん速く


def _simulator(s):
    """No.08 上乗せシミュレーター：画面で回数がカウントアップ。横のレバーが回すたびにガチャッと動き、今の結果がピカッ"""
    img, d = _ctx()
    lw, ln = _lw(), _line()
    data = s["data"]
    sim = data.get("sim", {"buckets": [{"k": "?", "p": 1}]})
    n = sim_progress(data, s["stage"], s["since"])
    _box(d, (40, 40, 360, 440), 28)
    _box(d, (70, 74, 330, 250), 14, f=ui.hexc("#16161A"))
    if n > 0:
        draws = _sim_draws(sim)
        last = sim["buckets"][int(draws[n - 1])]["k"]
        _fit_text(d, (200, 130), last, 240, 50, ui.hexc("#FFD21F"))
        _fit_text(d, (200, 210), f"{n:,} / {int(sim.get('trials', 1000)):,}回", 240, 30, ui.hexc("#9BFFB8"), "bold")
    else:
        _fit_text(d, (200, 160), "READY" if s["tl"] > BOOT_SEC else "BOOT…", 240, 46, ui.hexc("#9BFFB8"))
    for i in range(5):   # ランプ
        on = (int(s["tl"] * 8) + i) % 5 == 0 if n and n < int(sim.get("trials", 1000)) else s["glow"] > 0.5 and i % 2 == 0
        x = 96 + i * 52
        d.ellipse((x - 16, 272, x + 16, 304), fill=ui.hexc("#FFD21F") if on else ui.hexc("#5A5A5A"), outline=ln, width=3)
    for j in range(3):   # 放出口と玉
        d.rounded_rectangle((90 + j * 80, 330, 150 + j * 80, 410), 10, fill=ui.hexc("#16161A"), outline=ln, width=3)
    running = 0 < n < int(sim.get("trials", 1000))
    lever = math.sin(s["tl"] * 24) if running else 0
    lx, ly = 380, 220
    tip = (lx + 10 + 26 * lever, ly - 120 + 30 * abs(lever))
    d.line((lx, ly, tip[0], tip[1]), fill=ln, width=lw + 4)
    d.ellipse((tip[0] - 24, tip[1] - 24, tip[0] + 24, tip[1] + 24), fill=ORANGE, outline=ln, width=lw)
    _box(d, (360, 200, 400, 260), 8, f=ORANGE)
    return img


SPRITE_DIR = ui.ASSETS / "inventions"


@lru_cache(maxsize=64)
def _sprite(folder, face, box):
    """絵の発明品（generator/assets/inventions/<folder>/<face>.png）を box に収まる大きさで読む"""
    f = SPRITE_DIR / folder / f"{face}.png"
    if not f.exists():
        f = SPRITE_DIR / folder / "base.png"
    im = Image.open(f).convert("RGBA")
    k = min(box[0] / im.width, box[1] / im.height)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


WAKE_SEC = 0.55      # ここまでは寝ている（落ちてくる間）
SURPRISE_SEC = 1.15  # 起動で飛び起きる（びっくり）
KOMARI_SEC = 3.2     # 煙で困り顔 → そのあとは疲れ顔で結果待ち


def _face_for(s):
    """表情の流れ（表情シート rnc01/ を使う）：
    寝てる → 起動で飛び起きる（びっくり）→ 考え中 → 煙なら困り顔 → 疲れ顔で待つ → 分析中 → 段ごとににっこり → 解説"""
    data, tl, stage = s["data"], s["tl"], s["stage"]
    faces = data.get("faces") or ["bunseki", "genki", "kaisetsu"]
    if tl < WAKE_SEC:
        return "nemu"
    if tl < SURPRISE_SEC:
        return "bikkuri"
    if stage == 0:
        gag = data.get("gag")
        if tl < BOOT_SEC or not gag:
            return "kangae"
        if gag == "smoke":
            return "komari" if tl < KOMARI_SEC else "tsukare"
        return "bikkuri" if tl < KOMARI_SEC else "kangae"
    if s["since"] is not None and s["since"] < 0.6 and stage > 1:
        return "genki"   # 段が出た直後はうれしそう
    return faces[min(stage - 1, len(faces) - 1)]


def _face_switch(s):
    """今の表情に変わってから何秒か（さかのぼって探す。最大0.3秒）"""
    cur = _face_for(s)
    for k in range(1, 11):
        back = dict(s, tl=s["tl"] - 0.03 * k,
                    since=None if s["since"] is None else s["since"] - 0.03 * k)
        if back["since"] is not None and back["since"] < 0:
            back["stage"] = max(0, s["stage"] - 1)
            back["since"] = None if back["stage"] == 0 else 9
        if back["tl"] < 0 or _face_for(back) != cur:
            return cur, 0.03 * (k - 1), (_face_for(back) if back["tl"] >= 0 else None)
    return cur, 9.0, None


def _pose(face, tl, sw):
    """表情ごとの動き：(横のずれ, 縦のずれ, 回転, 横の伸び, 縦の伸び)"""
    if face == "nemu":      # すやすや：ゆっくり大きく呼吸
        b = math.sin(tl * 2.2)
        return 0, 0, 0, 1 + 0.02 * b, 1 - 0.03 * b
    if face == "bikkuri":   # 飛び起きる：ぴょんと跳ねて縦に伸びる
        k = min(1.0, sw / 0.45)
        return 0, -60 * math.sin(math.pi * k), 0, 1 - 0.06 * math.sin(math.pi * k), 1 + 0.1 * math.sin(math.pi * k)
    if face == "kangae":    # 考え中：首をかしげて左右にゆらゆら
        return 0, 0, 5 * math.sin(tl * 2.4), 1, 1
    if face == "komari":    # 困り顔：小刻みにふるえる
        return 3 * math.sin(tl * 55), 0, 0, 1, 1
    if face == "tsukare":   # 疲れ顔：沈んでゆっくりため息
        b = math.sin(tl * 1.4)
        return 0, 8 + 4 * b, 0, 1 + 0.02 * b, 1 - 0.03 * b
    if face == "genki":     # にっこり：小さくジャンプ
        k = min(1.0, sw / 0.35)
        return 0, -30 * math.sin(math.pi * k), 0, 1, 1 + 0.05 * math.sin(math.pi * k)
    if face == "kaisetsu":  # 解説：画面を指して少し前のめり
        return 0, 0, -3 + 1.5 * math.sin(tl * 1.8), 1, 1
    b = math.sin(tl * 3.1)  # 分析中など：ふつうの呼吸
    return 0, 0, 0, 1, 1 + 0.018 * b


def _sprite_layer(folder, face, tl, sw, alpha=1.0):
    im = _sprite(folder, face, (DEV_W - 30, DEV_H - 40))
    dx, dy, rot, sx, sy = _pose(face, tl, sw)
    pop = 1 + 0.12 * max(0.0, 1 - sw / 0.18)   # 表情が変わった瞬間に少しふくらむ
    w, h = max(1, int(im.width * sx * pop)), max(1, int(im.height * sy * pop))
    im = im.resize((w, h), Image.BILINEAR)
    if abs(rot) > 0.1:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    layer = Image.new("RGBA", (DEV_W, DEV_H), (0, 0, 0, 0))
    layer.alpha_composite(im, (int((DEV_W - im.width) / 2 + dx), int(DEV_H - im.height - 34 + dy)))
    if alpha < 1:
        layer = ui.fade(layer, alpha)
    return layer


def _sprite_device(s):
    """絵で描いた発明品（RNC-01 など）。表情シートの絵を流れで切り替え、表情ごとに動きを付ける。切り替えは0.15秒で重ねる"""
    folder = s["data"].get("sprite")
    face, sw, prev = _face_switch(s)
    img = Image.new("RGBA", (DEV_W, DEV_H), (0, 0, 0, 0))
    if prev and sw < 0.15:
        img.alpha_composite(_sprite_layer(folder, prev, s["tl"], 9.0, 1 - sw / 0.15))
        img.alpha_composite(_sprite_layer(folder, face, s["tl"], sw, sw / 0.15))
    else:
        img.alpha_composite(_sprite_layer(folder, face, s["tl"], sw))
    return img


DEVICES = {"sprite": _sprite_device, "simulator": _simulator, "robot": _robot, "glasses": _glasses, "portal": _portal, "radar": _radar,
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
    off = launch_offset(data)
    tl, dur = tl - off, dur - off
    if out <= 0 or tl < 0:
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
    if data.get("kind"):
        pd.text((DEVICE_C[0] - x0, y1 - y0 - 82), data["name"], font=ui.font("black", 40), fill=ui.TEXT, anchor="mm")
        pd.text((DEVICE_C[0] - x0, y1 - y0 - 42), data["kind"], font=ui.font("bold", 24), fill=ui.SUB, anchor="mm")
    else:
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
        _analyzing(lay, tl, 1.0, data)
        if tl > BOOT_SEC:
            _beam(lay, tl)
    elif since is not None and since < 0.75 and (data.get("hold") and stage == 1 or not data.get("hold") and tl < BOOT_SEC + 0.75):
        # 結果が出る瞬間：COMPLETE のスタンプを押してから、解析画面が消える
        _analyzing(lay, tl, 1 - ui.ease_in_out(min(1.0, max(0.0, since - 0.45) / 0.15)), data, done=min(1.0, since / 0.45) + 1e-3)
    if stage > 0:
        first = stage == 1 and since is not None and (data.get("hold") or tl < BOOT_SEC + 0.75)
        if first and since < 0.6:
            pass   # COMPLETE のスタンプの間は、まだ結果を出さない
        else:
            (_sim_results if data.get("sim") else _results)(lay, data, stage, (since - 0.6) if first else since)
    ui.paste(canvas, lay, (0, 0), out * kp if kp < 1 else out)


def _log_lines(data):
    """解析ログに流す行。data["log"] があればそれ、無ければ結果の見出しから作る"""
    if data.get("log"):
        return list(data["log"])
    rows = list(data.get("steps", [])) + ([data["total"]] if data.get("total") else [])
    return ["LOAD   SPEC DATA"] + [f"SCAN   {r['k']}" for r in rows] + ["CALC   ..."]


TARGET_END = 3.7   # spec_rows があるとき：ここまではスペック表にカーソルを合わせる場面、そのあと端末で解析


def _cursor(d, x, y, s=1.0):
    """マウスカーソル（白い矢印・墨のふち）"""
    pts = [(0, 0), (0, 46), (12, 35), (21, 56), (30, 52), (21, 32), (37, 32)]
    pts = [(x + px * s, y + py * s) for px, py in pts]
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(22, 22, 26, 255))
    d.line(pts + [pts[0]], fill=(22, 22, 26, 255), width=3)


def _spec_target(lay, tl, a, data):
    """スペック表の窓：カーソルが動いて『トータル継続率 約80%』をクリック → 行が選ばれ、虫めがねで数字に寄る"""
    rows = data["spec_rows"]
    ti = int(data.get("target", len(rows) - 1))
    W0 = RIGHT_X1 - RIGHT_X0
    x0, y0 = RIGHT_X0, 284
    lay2 = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay2)
    paper = ui.THEME.get("paper")
    win_h = 70 + 84 * len(rows)
    ki = ui.ease_out(ui.prog(tl, 0.5, 0.3))
    if ki <= 0:
        return
    d.rounded_rectangle((x0, y0, x0 + W0, y0 + win_h), 10, fill=ui.hexc("#FFFFFF") if paper else ui.hexc("#0B1220"),
                        outline=_line(), width=3)
    d.rectangle((x0 + 3, y0 + 3, x0 + W0 - 3, y0 + 46), fill=ui.hexc("#16161A"))
    d.text((x0 + 20, y0 + 25), "SPEC  " + data.get("spec_title", ""), font=ui.font("bold", 24), fill=ui.hexc("#FFD21F"), anchor="lm")
    vx = x0 + W0 - 30
    click = 2.3
    for i, (k, v) in enumerate(rows):
        ry = y0 + 60 + 84 * i
        sel = i == ti and tl > click
        if sel:   # 選ばれた行：黄色の帯と、ぐるぐる回る点線の枠
            d.rectangle((x0 + 10, ry, x0 + W0 - 10, ry + 74), fill=(255, 210, 31, 110))
            ph = int(tl * 40) % 24
            for xx in range(x0 + 10 - ph, x0 + W0 - 10, 24):
                xa, xb = max(x0 + 10, xx), min(x0 + W0 - 10, xx + 12)
                if xb > xa:
                    d.line((xa, ry, xb, ry), fill=(226, 52, 59, 255), width=4)
                    d.line((xa, ry + 74, xb, ry + 74), fill=(226, 52, 59, 255), width=4)
        d.text((x0 + 30, ry + 37), k, font=ui.font("bold", 34), fill=ui.TEXT if not paper else ui.INK, anchor="lm")
        d.text((vx, ry + 37), v, font=ui.font("black", 48), fill=ui.KEY if sel else (ui.TEXT if not paper else ui.INK), anchor="rm")
        if i < len(rows) - 1:
            d.line((x0 + 20, ry + 80, x0 + W0 - 20, ry + 80), fill=ui.hexc("#C9CED6") if paper else ui.hexc("#2A3B55"), width=2)
    tx, ty = vx - 70, y0 + 60 + 84 * ti + 37      # 狙う数字の位置
    # カーソル：レンのほうから数字へ
    sx, sy = DEVICE_C[0] + 150, DEVICE_C[1] + 60
    km = ui.ease_in_out(ui.prog(tl, 1.3, 0.9))
    wob = 12 * math.sin(tl * 7) * (1 - km)
    cx, cy = sx + (tx - sx) * km + wob, sy + (ty - sy) * km - 60 * math.sin(math.pi * km)
    pressed = click <= tl < click + 0.12
    if tl > 1.1:
        _cursor(d, cx, cy, 0.85 if pressed else 1.0)
    if click <= tl < click + 0.5:   # クリックの波紋
        r = 10 + 70 * ui.prog(tl, click, 0.5)
        d.ellipse((tx - r, ty - r, tx + r, ty + r), outline=(226, 52, 59, int(255 * (1 - ui.prog(tl, click, 0.5)))), width=5)
    # 虫めがね：数字に寄ってスキャン
    kz = ui.ease_out_back(ui.prog(tl, click + 0.25, 0.35), 1.6)
    if kz > 0:
        R = int(120 * min(1.0, kz))
        lx, ly = tx - 400, ty - 40
        lens = Image.new("RGBA", (2 * R + 1, 2 * R + 1), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lens)
        ld.ellipse((0, 0, 2 * R, 2 * R), fill=ui.hexc("#FFFDF6") if paper else ui.hexc("#13213A"))
        ld.text((R, R), rows[ti][1], font=ui.font("black", max(10, int(84 * min(1.0, kz)))), fill=ui.KEY, anchor="mm")
        sline = R + R * 0.8 * math.sin(tl * 6)
        ld.rectangle((0, sline - 3, 2 * R, sline + 3), fill=(100, 191, 255, 140))
        mask = Image.new("L", lens.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 2 * R, 2 * R), fill=255)
        lens.putalpha(Image.composite(lens.getchannel("A"), mask, mask))
        lay2.alpha_composite(lens, (int(lx - R), int(ly - R)))
        d.ellipse((lx - R, ly - R, lx + R, ly + R), outline=ui.hexc("#16161A"), width=8)
        d.line((lx + R * 0.7, ly + R * 0.7, lx + R * 1.15, ly + R * 1.15), fill=ui.hexc("#16161A"), width=16)
        if tl > click + 0.6:
            ui.draw_spaced(d, (lx, ly - R - 26), "TARGET LOCK", ui.font("black", 26), (226, 52, 59, 255), 4, anchor="mm")
    ui.paste(lay, lay2, (0, 0), a * ki)


def _analyzing(lay, tl, a, data=None, done=0.0):
    """解析中の画面：端末のログが1文字ずつ打たれ、横でデータの波形が揺れ、進捗が99%まで上がる。
    done（0〜1）は結果が出た瞬間の『COMPLETE』の出方。
    spec_rows があるときは、先にスペック表で数字にカーソルを合わせる場面（TARGET_END まで）"""
    if a <= 0 or tl < 0.45:
        return
    data = data or {}
    if data.get("spec_rows") and done <= 0:
        if tl < TARGET_END:
            _spec_target(lay, tl, a, data)
            return
        if tl < TARGET_END + 0.3:   # 端末へ切り替え
            _spec_target(lay, tl, a * (1 - (tl - TARGET_END) / 0.3), data)
    if data.get("spec_rows"):
        tl = tl - (TARGET_END - 0.6)   # ログ・進捗は切り替えてから始める
    W0 = RIGHT_X1 - RIGHT_X0
    tmp = Image.new("RGBA", (W0, 380), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    paper = ui.THEME.get("paper")
    term_bg = ui.hexc("#16161A") if paper else ui.hexc("#0B1220")
    green = ui.hexc("#7CFFB2")
    # 端末の窓
    d.rounded_rectangle((0, 0, W0 - 1, 300), 10, fill=term_bg, outline=_line(), width=3)
    for i, c in enumerate(("#E2343B", "#FFB020", "#3FAE6A")):
        d.ellipse((16 + i * 24, 14, 32 + i * 24, 30), fill=ui.hexc(c))
    d.text((W0 - 18, 22), "RNC-01 / ANALYZE", font=ui.font("bold", 18), fill=ui.hexc("#6B7A90"), anchor="rm")
    # 走査線（上から下へ流れる）
    sy = 40 + (tl * 160) % 250
    d.rectangle((2, sy, W0 - 3, sy + 3), fill=(124, 255, 178, 60))
    # ログを1文字ずつ（左側）
    lines = _log_lines(data)
    cps = 26.0
    budget = max(0.0, (tl - 0.6) * cps) if done <= 0 else 1e9   # 結果が出たらログは全部出しきる
    f = ui.font("bold", 24)
    y = 58
    for ln in lines:
        if budget <= 0:
            break
        shown = ln[: int(budget)]
        budget -= len(ln) + 6   # 行の終わりで少し待つ
        d.text((22, y), "> " + shown, font=f, fill=green, anchor="lm")
        if 0 < budget + len(ln) + 6 - len(shown) <= len(ln) + 6 and len(shown) < len(ln) and int(tl * 4) % 2 == 0:
            d.rectangle((22 + ui.text_w("> " + shown, f) + 4, y - 12, 22 + ui.text_w("> " + shown, f) + 18, y + 12), fill=green)
        y += 40
    if budget > 0 and int(tl * 3) % 2 == 0:   # 全部打ち終わったら次の行でカーソルが点滅
        d.rectangle((22, y - 12, 36, y + 12), fill=green)
    # 右側：データの波形（イコライザー）
    gx0, gx1, gy = int(W0 * 0.62), W0 - 24, 270
    nbar = 14
    bw = (gx1 - gx0) / nbar
    for i in range(nbar):
        h = 40 + 150 * (0.5 + 0.5 * math.sin(tl * (5 + i * 0.7) + i * 1.3)) * (0.6 + 0.4 * math.sin(tl * 1.7 + i))
        if done > 0:
            h *= max(0.0, 1 - min(1.0, done))
        if h < 1:
            continue
        x = gx0 + i * bw
        col = ui.hexc("#64BFFF") if i % 3 else ORANGE
        d.rectangle((x + 3, gy - h, x + bw - 3, gy), fill=col)
    d.line((gx0, gy + 2, gx1, gy + 2), fill=ui.hexc("#6B7A90"), width=2)
    # 進捗（99%で止まって、結果が出たら100%）
    k = 0.99 * (1 - math.exp(-max(0.0, tl - 0.55) / 1.6))
    if done > 0:
        k = 1.0
    pct = int(k * 100)
    by = 322
    label = "ANALYZING" + "." * (1 + int(tl * 4) % 3)
    d.text((0, by - 2), label if done <= 0 else "COMPLETE", font=ui.font("black", 34), fill=ORANGE, anchor="lm")
    d.text((W0, by - 2), f"{pct}%", font=ui.font("black", 34), fill=ORANGE, anchor="rm")
    d.rectangle((0, by + 24, W0 - 1, by + 50), outline=_line(), width=3)
    d.rectangle((4, by + 28, 4 + (W0 - 9) * k, by + 46), fill=ORANGE)
    # 進捗バーの上を光が走る
    gx = 4 + ((tl * 380) % max(1, (W0 - 9) * k))
    d.rectangle((gx, by + 28, gx + 24, by + 46), fill=(255, 255, 255, 120))
    ui.paste(lay, tmp, (RIGHT_X0, 284), a)
    if done > 0:   # COMPLETE のスタンプ
        ks = ui.ease_out_back(min(1.0, done * 2.2), 2.0)
        st = Image.new("RGBA", (520, 140), (0, 0, 0, 0))
        sd = ImageDraw.Draw(st)
        sd.rounded_rectangle((6, 6, 514, 134), 14, outline=ui.KEY, width=8)
        sd.text((260, 72), "COMPLETE", font=ui.font("black", 76), fill=ui.KEY, anchor="mm")
        st = st.rotate(-6, resample=Image.BICUBIC, expand=True)
        sc = max(0.05, 1.6 - 0.6 * ks)
        st = st.resize((int(st.width * sc), int(st.height * sc)), Image.LANCZOS)
        ui.paste(lay, st, (RIGHT_X0 + W0 / 2 - st.width / 2, 430 - st.height / 2), a * min(1.0, done * 3))


def _beam(lay, tl):
    """レン（発明品）から解析画面へ、データの粒が流れていく"""
    d = ImageDraw.Draw(lay)
    sx, sy = DEVICE_C[0] + 120, DEVICE_C[1] - 40
    ex, ey = RIGHT_X0 + 20, 450
    for j in range(10):
        ph = (tl * 0.9 + j / 10) % 1.0
        x = sx + (ex - sx) * ph
        y = sy + (ey - sy) * ph - 80 * math.sin(math.pi * ph)
        a = int(255 * math.sin(math.pi * ph))
        ch = "01%#"[j % 4]
        d.text((x, y), ch, font=ui.font("black", 26), fill=(100, 191, 255, a), anchor="mm")


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


def _sim_results(lay, data, stage, since):
    """上乗せシミュレーターの結果：出玉ごとの棒グラフが、回した回数に合わせて伸びる。2段目で理論値の線と平均"""
    import numpy as np
    sim = data["sim"]
    bk = sim["buckets"]
    n = sim_progress(data, stage, since)
    draws = _sim_draws(sim)[:n]
    counts = np.bincount(draws, minlength=len(bk)) if n else np.zeros(len(bk), int)
    d = ImageDraw.Draw(lay)
    x0, x1, base, top = RIGHT_X0 + 10, RIGHT_X1 - 10, 600, 300
    pmax = max(b["p"] for b in bk) * 1.25
    slot = (x1 - x0) / len(bk)
    bw = slot * 0.62
    d.line((x0, base, x1, base), fill=_line(), width=ui.LINE_W + 1)
    show_theory = stage >= 2
    kt = ui.ease_out(min(1.0, since / 0.5)) if show_theory and since is not None else (1.0 if show_theory else 0)
    for i, b in enumerate(bk):
        cx = x0 + slot * (i + 0.5)
        pct = 100 * counts[i] / n if n else 0
        h = (base - top) * pct / pmax
        col = ui.hexc(PAL[i % len(PAL)])
        d.rectangle((cx - bw / 2, base - h, cx + bw / 2, base), fill=col, outline=_line(), width=2)
        d.text((cx, base + 28), b["k"], font=ui.font("black", 26), fill=ui.TEXT, anchor="mm")
        if n:
            d.text((cx, base - h - 22), f"{pct:.1f}%", font=ui.font("black", 30), fill=col, anchor="mm",
                   stroke_width=3 if ui.THEME.get("paper") else 0, stroke_fill=ui.PANEL)
        if kt > 0:   # 理論値（確率）の線
            ty = base - (base - top) * b["p"] / pmax
            for xx in range(int(cx - bw / 2 - 10), int(cx + bw / 2 + 10), 18):
                xe = min(xx + 10, cx + bw / 2 + 10)
                d.line((xx, ty, xe, ty), fill=(22, 22, 26, int(255 * kt)), width=9)          # 墨のふち
                d.line((xx, ty, xe, ty), fill=(255, 210, 31, int(255 * kt)), width=5)        # 黄色の点線
    head = (f"{n:,}回の結果" + ("　黄色の点線＝確率どおり" if show_theory else "")) if n else ""
    d.text((x1, 296), head, font=ui.font("bold", 26), fill=ui.SUB, anchor="rm")
    foot = 664
    if n:
        vals = np.array(sim["values"], float)
        avg = float(vals[draws].mean())
        txt = f"シミュレーション平均 約{avg:,.0f}個"
        if show_theory:
            th = float((vals * np.array([b["p"] for b in bk]) / sum(b["p"] for b in bk)).sum())
            txt += f"　／　確率どおりの平均 約{th:,.0f}個"
        d.text((RIGHT_X0, foot + 20), txt, font=ui.font("bold", 30), fill=ui.TEXT, anchor="lm")
    if data.get("note"):
        d.text((RIGHT_X0, foot + 72), data["note"], font=ui.font("medium", 22), fill=ui.SUB, anchor="lm")


# ---------------------------------------------------------------- 起動シーン（launch=true）：画面が切り替わる
def _hazard(d, y0, y1, shift, W):
    """黄色と黒の斜めしま（警告テープ）"""
    d.rectangle((0, y0, W, y1), fill=ui.hexc("#FFD21F"))
    step = 70
    for x in range(-step * 2, W + step * 2, step):
        xx = x + shift % step
        d.polygon([(xx, y0), (xx + 34, y0), (xx + 34 - (y1 - y0), y1), (xx - (y1 - y0), y1)], fill=ui.hexc("#16161A"))


def _shutter_k(tl):
    """シャッターの閉じ具合（1＝閉じている）と、その下に見せる画面（"scene"＝起動シーン / "normal"＝いつもの画面）"""
    e = ui.ease_in_out
    if tl < L_SHUT:
        return e(tl / L_SHUT), "normal"                                  # 閉じる
    if tl < L_HOLD:
        return 1.0, "scene"                                              # 閉じたままロゴ
    if tl < L_OPEN1:
        return 1 - e((tl - L_HOLD) / (L_OPEN1 - L_HOLD)), "scene"         # 開くと起動シーン
    if tl < LAUNCH_OPEN - 0.3:
        return 0.0, "scene"
    if tl < LAUNCH_OPEN:
        return e((tl - (LAUNCH_OPEN - 0.3)) / 0.3), "scene"               # また閉じる
    return 1 - e(min(1.0, (tl - LAUNCH_OPEN) / (LAUNCH_SEC - LAUNCH_OPEN))), "normal"   # 開くといつもの画面


def launch_se(t0):
    """起動シーンの効果音（episode.py が入れる）"""
    se = [(0.3, "impact", 0.24), (0.32, "rumble", 0.14), (L_OPEN1 - 0.15, "shu", 0.2)]
    for i in range(4):                                     # 起動チェックのカチッ
        se += [(L_CHECK0 + 0.3 * i, "tick", 0.3), (L_CHECK0 + 0.3 * i + 0.22, "blip", 0.16)]
    se += [(L_CHARGE0, "boot", 0.24), (L_CHARGE0 + 0.2, "rumble_long", 0.16), (L_WAKE - 0.05, "don", 0.34),
           (L_WAKE, "impact", 0.22)]
    for i in range(6):                                     # 名前が1文字ずつ落ちる
        se.append((L_NAME0 + 0.12 * i, "piko" if i < 5 else "don", 0.1 if i < 5 else 0.3))
    se += [(L_ONLINE, "impact", 0.26), (LAUNCH_OPEN - 0.05, "impact", 0.2), (LAUNCH_OPEN + 0.05, "shu", 0.2)]
    return [{"t": round(t0 + a, 3), "kind": k, "gain": g} for a, k, g in se]


def _launch_scene(tl, data):
    W, H = ui.W, ui.H
    sc = Image.new("RGBA", (W, H), ui.hexc("#070C18"))
    d = ImageDraw.Draw(sc)
    charge = ui.prog(tl, L_CHARGE0, L_WAKE - L_CHARGE0)           # 0〜1：充電
    woke = tl >= L_WAKE
    hy = 640
    spd = 1.2 + 4 * charge + (2 if woke else 0)
    for i in range(14):   # 奥へ流れる床のグリッド（充電でだんだん速く）
        z = ((i + tl * spd) % 14) / 14
        y = hy + (H - hy) * z ** 2
        d.line((0, y, W, y), fill=(40, 120, 220, int(40 + 160 * z)), width=2)
    for j in range(-12, 13):
        d.line((W / 2 + j * 30, hy, W / 2 + j * 260, H), fill=(40, 120, 220, 90), width=2)
    cx, cy = W / 2, 560
    # 上からのスポットライト（だんだん明るく）
    spot = ui.ease_out(ui.prog(tl, L_CHECK0, 1.2))
    if spot > 0:
        sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(sp).polygon([(cx - 90, 0), (cx + 90, 0), (cx + 420, 980), (cx - 420, 980)], fill=(120, 190, 255, int(46 * spot)))
        sc.alpha_composite(sp)
    # 充電：下から光の粒が吸い込まれ、輪が回りながら縮む
    if L_CHARGE0 <= tl < L_WAKE + 0.2:
        for j in range(26):
            ph = (tl * (0.8 + 1.6 * charge) + j / 26) % 1.0
            ang = j * 0.9
            r = 520 * (1 - ph)
            x, y = cx + r * math.cos(ang), cy + 40 + r * 0.55 * math.sin(ang)
            a = int(255 * min(1.0, ph * 3) * (0.4 + 0.6 * charge))
            d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(100, 191, 255, a))
        for i, rr in enumerate((330, 280)):
            r2 = rr * (1.05 - 0.25 * charge)
            a0 = (tl * (200 + 300 * charge) * (1 if i else -1)) % 360
            d.arc((cx - r2, cy - r2, cx + r2, cy + r2), a0, a0 + 250, fill=(100, 191, 255, 200), width=8)
    wake = ui.prog(tl, L_WAKE, 0.8)
    if woke:   # 目を覚ますと光の輪が広がる
        for r, a in ((260 + 700 * wake, int(240 * (1 - wake))), (220, 90)):
            if a > 0:
                d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(100, 191, 255, a), width=12)
    folder = data.get("sprite")
    if folder:   # ロボ：影のまま眠っている → 充電でふるえる → 光って飛び起きる → タブレットを構える
        if tl < L_WAKE:
            face = "nemu"
        elif tl < L_NAME0 + 0.4:
            face = "bikkuri"
        else:
            face = "base"
        box = (760, 560) if face == "base" else (620, 470)
        im = _sprite(folder, face, box)
        pop = 1 + 0.1 * max(0.0, 1 - abs(tl - L_WAKE) / 0.22) + (0.06 * max(0.0, 1 - abs(tl - (L_NAME0 + 0.4)) / 0.2))
        im = im.resize((int(im.width * pop), int(im.height * pop)), Image.LANCZOS)
        lit = ui.ease_out(ui.prog(tl, L_WAKE - 0.08, 0.25))
        if lit < 1:   # まだ暗い：輪郭だけ青く光る影
            sil = Image.new("RGBA", im.size, (14, 20, 36, 255))
            sil.putalpha(im.getchannel("A"))
            glow = Image.new("RGBA", im.size, (100, 191, 255, 255))
            glow.putalpha(im.getchannel("A").point(lambda v: int(v * (0.15 + 0.5 * charge))))
            sil.alpha_composite(glow)
            im = Image.blend(sil, im, lit)
        shake = (6 * charge * math.sin(tl * 80)) if L_CHARGE0 < tl < L_WAKE else 0
        hop = -70 * math.sin(math.pi * ui.prog(tl, L_WAKE, 0.45)) if L_WAKE < tl < L_WAKE + 0.45 else 0
        sc.alpha_composite(im, (int(cx - im.width / 2 + shake), int(1000 - im.height + hop)))
        if face == "bikkuri" and tl < L_WAKE + 0.5:   # 目の光線（ピカーン）
            k = 1 - ui.prog(tl, L_WAKE, 0.5)
            ImageDraw.Draw(sc).polygon([(cx - 20, 690), (cx + 20, 690), (cx + 900, 600), (cx + 900, 780)], fill=(255, 255, 255, int(120 * k)))
    # 上：BAKU WORKS と名前（名前は目を覚ましてから1文字ずつ落ちてくる）
    kn = ui.ease_out(ui.prog(tl, L_OPEN1, 0.4))
    ui.draw_spaced(d, (W / 2, 110), "BAKU WORKS  ·  INVENTION No.%02d" % int(data.get("no", 0)),
                   ui.font("bold", 30), (240, 122, 18, int(255 * kn)), 6, anchor="mm")
    name = data.get("name", "")
    f_big = ui.font("black", 160)
    if tl < L_NAME0:
        d.text((W / 2, 230), "BOOT SEQUENCE" if tl < L_CHARGE0 else "CHARGING", font=ui.font("black", 74),
               fill=(255, 255, 255, int(255 * kn * (0.55 + 0.45 * (int(tl * 3) % 2)))), anchor="mm")
    else:
        widths = [ui.text_w(ch, f_big) + 6 for ch in name]
        x = W / 2 - sum(widths) / 2
        for i, ch in enumerate(name):
            k = ui.prog(tl, L_NAME0 + 0.12 * i, 0.18)
            if k > 0:
                y = 230 - 160 * (1 - ui.ease_out_back(k, 1.8))
                d.text((x + widths[i] / 2, y), ch, font=f_big, fill=(255, 255, 255, int(255 * min(1, k * 2))), anchor="mm",
                       stroke_width=7, stroke_fill=(47, 127, 224, 255))
            x += widths[i]
        if data.get("kind"):
            kk = ui.ease_out(ui.prog(tl, L_NAME0 + 0.8, 0.3))
            d.text((W / 2 + 80 * (1 - kk), 375), data["kind"], font=ui.font("black", 48), fill=(154, 210, 255, int(255 * kk)), anchor="mm")
    # 左：起動チェック（ゲージが伸びて OK）
    for i, ck in enumerate(("POWER", "SENSOR", "DATA TANK", "LINK")):
        st = L_CHECK0 + 0.3 * i
        if tl < st:
            continue
        y = 450 + i * 64
        g = ui.prog(tl, st, 0.22)
        d.text((110, y), ck, font=ui.font("bold", 32), fill=(124, 255, 178, 255), anchor="lm")
        d.rectangle((330, y - 10, 520, y + 10), outline=(124, 255, 178, 160), width=2)
        d.rectangle((333, y - 7, 333 + 184 * g, y + 7), fill=(124, 255, 178, 255))
        if g >= 1:
            d.text((540, y), "OK", font=ui.font("black", 32), fill=(124, 255, 178, 255), anchor="lm")
    # 右：充電の％
    if L_CHARGE0 <= tl < L_WAKE + 0.6:
        pct = int(100 * min(1.0, charge))
        d.text((W - 110, 470), "CHARGE", font=ui.font("bold", 32), fill=(255, 210, 31, 255), anchor="rm")
        d.text((W - 110, 545), f"{pct}%", font=ui.font("black", 96), fill=(255, 210, 31, 255), anchor="rm",
               stroke_width=4, stroke_fill=ui.hexc("#16161A"))
    if tl > L_ONLINE:
        ko = ui.ease_out_back(ui.prog(tl, L_ONLINE, 0.3), 2.0)
        tmp = Image.new("RGBA", (760, 140), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((380, 70), "SYSTEM ONLINE", font=ui.font("black", 78), fill=ui.hexc("#FFD21F"),
                                   anchor="mm", stroke_width=6, stroke_fill=ui.hexc("#16161A"))
        tmp = tmp.rotate(-4, resample=Image.BICUBIC, expand=True)
        s2 = max(0.05, 1.6 - 0.6 * ko)
        tmp = tmp.resize((int(tmp.width * s2), int(tmp.height * s2)), Image.LANCZOS)
        ui.paste(sc, tmp, (W - 90 - tmp.width, 600 - tmp.height / 2), min(1.0, ko))
    _hazard(d, 0, 54, tl * 400, W)
    _hazard(d, H - 54, H, -tl * 400, W)
    fl = max(0.0, 1 - abs(tl - L_WAKE) / 0.14)   # 目を覚ます瞬間のフラッシュ
    if fl > 0:
        sc.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(235 * fl))))
    # ゆっくりカメラが寄る（充電中は揺れる）
    z = 1 + 0.06 * ui.ease_in_out(ui.prog(tl, L_OPEN1, L_WAKE - L_OPEN1)) - 0.04 * ui.ease_out(ui.prog(tl, L_WAKE, 0.4))
    jx = 7 * charge * math.sin(tl * 61) if L_CHARGE0 < tl < L_WAKE else 0
    if abs(z - 1) > 1e-3 or jx:
        big = sc.resize((int(W * z), int(H * z)), Image.BILINEAR)
        out = Image.new("RGBA", (W, H), ui.hexc("#070C18"))
        out.alpha_composite(big, (int((W - big.width) / 2 + jx), int((H - big.height) / 2)))
        sc = out
    return sc


def draw_launch(cv, tl, data):
    """起動シーン：シャッターが閉じる → 暗い研究所でロボが光って目を覚ます（SYSTEM ONLINE）→ シャッターが閉じて開くと元の画面"""
    if tl < 0 or tl >= LAUNCH_SEC:
        return
    W, H = ui.W, ui.H
    k, under = _shutter_k(tl)
    if under == "scene":
        cv.alpha_composite(_launch_scene(tl, data))
    if k > 0.001:
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        half = W / 2 * k
        col = ui.hexc("#16161A")
        d.rectangle((0, 0, half, H), fill=col)
        d.rectangle((W - half, 0, W, H), fill=col)
        for x0 in (half - 40, W - half):   # シャッターの縁の警告テープ
            d.rectangle((x0, 0, x0 + 40, H), fill=ui.hexc("#FFD21F"))
            for y in range(-80, H + 80, 60):
                d.polygon([(x0, y), (x0 + 40, y - 30), (x0 + 40, y - 6), (x0, y + 24)], fill=col)
        if k > 0.98:   # 閉じきったところにロゴ（ガシャン）
            kl = ui.ease_out_back(ui.prog(tl, L_SHUT, 0.3), 1.8) if tl < L_OPEN1 else 1.0
            d.text((W / 2, H / 2 - 30), "BAKU WORKS", font=ui.font("black", int(40 + 70 * min(1.0, kl))), fill=ui.hexc("#FFD21F"), anchor="mm")
            if tl < L_OPEN1:
                d.text((W / 2, H / 2 + 60), "LAUNCH", font=ui.font("bold", 40), fill=(255, 255, 255, 200), anchor="mm")
        cv.alpha_composite(sh)
