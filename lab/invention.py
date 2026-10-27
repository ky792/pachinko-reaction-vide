"""ナギバク研究所の発明品（docs/NAGIBAKU_WORLD.md）。

台本の @show invention:<キー> で出すパネル。左に発明品（バクの手作り）、右に解析結果。
  - 出た直後に「起動」（発明品が落ちてくる → 目がスキャン → ANALYZING…）。gag="smoke" なら頭から煙
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
SMOKE_END = 2.6     # 煙が消えるまで

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
    """動きが止まるまでの秒数（render の描画の使い回し用）"""
    return (SMOKE_END if d.get("gag") == "smoke" else BOOT_SEC) + 0.45


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
    return ui.INK if ui.THEME.get("paper") else ui.PANEL_LINE


def _body_fill():
    return ui.hexc("#FFFFFF") if ui.THEME.get("paper") else ui.hexc("#233650")


ORANGE = ui.hexc("#F07A12")


# ---------------------------------------------------------------- 発明品の絵（PIL の図形だけ。外部の画像生成は使わない）
def _robot(k_scan, glow, blink=False):
    """継続率分解ロボ：箱型の頭＋スキャンする横長の目、胸に％の表示、頭にバク色のアンテナ"""
    img = Image.new("RGBA", (440, 480), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lw = 6 if ui.THEME.get("paper") else 4
    ln, fill = _line(), _body_fill()
    shadow = ui.THEME.get("paper")

    def box(b, r, f=None, w=lw):
        if shadow:
            d.rounded_rectangle((b[0] + 9, b[1] + 9, b[2] + 9, b[3] + 9), r, fill=ui.INK)
        d.rounded_rectangle(b, r, fill=f or fill, outline=ln, width=w)

    # アンテナ
    d.line((220, 70, 220, 22), fill=ln, width=lw)
    d.ellipse((204, 4, 236, 36), fill=ORANGE, outline=ln, width=lw)
    # 腕（体の後ろ）
    for sx in (-1, 1):
        x = 220 + sx * 128
        box((x - 22, 248, x + 22, 362), 18)
        d.ellipse((x - 30, 350, x + 30, 410), fill=ORANGE, outline=ln, width=lw)
    # 足
    for sx in (-1, 1):
        x = 220 + sx * 52
        box((x - 26, 392, x + 26, 452), 10)
        box((x - 44, 440, x + 44, 470), 12, f=ORANGE)
    # 胴
    box((104, 226, 336, 404), 26)
    box((140, 256, 300, 340), 14, f=ui.hexc("#16161A"))
    pct = ui.font("black", 54)
    d.text((220, 300), "%", font=pct, fill=ui.hexc("#FFD21F") if glow > 0.5 else ui.hexc("#5A5A5A"), anchor="mm")
    d.text((220, 372), "No.01", font=ui.font("black", 26), fill=ln if shadow else ui.TEXT, anchor="mm")
    # 首
    box((196, 204, 244, 236), 8)
    # 頭
    box((96, 64, 344, 214), 30)
    for sx in (-1, 1):   # 耳のボルト
        x = 220 + sx * 136
        d.ellipse((x - 16, 122, x + 16, 154), fill=ORANGE, outline=ln, width=lw)
    # 目（横長のバイザー）
    vb = (128, 102, 312, 176)
    d.rounded_rectangle(vb, 22, fill=ui.hexc("#16161A"), outline=ln, width=lw)
    if blink:
        d.line((150, 139, 290, 139), fill=ui.hexc("#64BFFF"), width=6)
    else:
        g = ui.hexc("#64BFFF") if glow < 1 else ui.hexc("#8FE3FF")
        for ex in (178, 262):
            r = 15 + 4 * glow
            d.ellipse((ex - r, 139 - r, ex + r, 139 + r), fill=g)
        if 0 < k_scan < 1:   # スキャンの光が左右に走る
            sx = vb[0] + 16 + (vb[2] - vb[0] - 32) * (0.5 - 0.5 * math.cos(k_scan * math.pi * 3))
            d.rectangle((sx - 5, vb[1] + 8, sx + 5, vb[3] - 8), fill=ui.hexc("#FFD21F"))
    return img


def _glasses(k_scan, glow, blink=False):
    """スペック透視メガネ：大きな丸メガネ。レンズの中を光が走る"""
    img = Image.new("RGBA", (440, 480), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lw = 10 if ui.THEME.get("paper") else 7
    ln = _line()
    for cx in (130, 310):
        d.ellipse((cx - 92, 150, cx + 92, 334), fill=ui.hexc("#CFEFFF") if glow > 0.5 else ui.hexc("#9CB4C6"), outline=ORANGE, width=lw)
        d.ellipse((cx - 92, 150, cx + 92, 334), outline=ln, width=3)
        if 0 < k_scan < 1:
            y = 160 + 164 * k_scan
            d.line((cx - 70, y, cx + 70, y), fill=ui.hexc("#FFFFFF"), width=8)
    d.arc((190, 200, 250, 260), 200, 340, fill=ORANGE, width=lw)
    d.line((38, 226, 0, 200), fill=ORANGE, width=lw)
    d.line((402, 226, 440, 200), fill=ORANGE, width=lw)
    return img


def _portal(k_scan, glow, blink=False):
    """時空転送装置：何重もの輪。起動中は輪が回る"""
    img = Image.new("RGBA", (440, 480), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ln = _line()
    for i, r in enumerate((190, 150, 110, 70)):
        col = ORANGE if i % 2 == 0 else ui.hexc("#64BFFF")
        a0 = (k_scan * 360 * (1 if i % 2 else -1) + i * 40) % 360
        d.arc((220 - r, 240 - r, 220 + r, 240 + r), a0, a0 + 300, fill=col, width=16)
        d.arc((220 - r, 240 - r, 220 + r, 240 + r), 0, 360, fill=ln, width=2)
    d.ellipse((190, 210, 250, 270), fill=ui.hexc("#FFD21F") if glow > 0.5 else ui.hexc("#5A5A5A"), outline=ln, width=4)
    return img


DEVICES = {"robot": _robot, "glasses": _glasses, "portal": _portal}


def _smoke(lay, tl, base):
    """起動の失敗ぎみの煙：頭のあたりから灰色の丸が3つ上がって消える"""
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

    # 発明品：上から落ちてきて、起動中は小刻みに震える
    kd = ui.ease_out_back(ui.prog(tl, 0.12, 0.45), 1.5)
    scan = ui.prog(tl, 0.55, BOOT_SEC - 0.6)
    glow = ui.ease_out(ui.prog(tl, BOOT_SEC - 0.15, 0.25))
    blink = 2.2 < tl < 2.32 and data.get("gag") != "smoke"
    dev = DEVICES.get(data.get("visual"), _robot)(scan if tl < BOOT_SEC else 0, glow, blink)
    shake = 4 * math.sin(tl * 70) if 0.55 < tl < BOOT_SEC - 0.1 else 0
    dx = DEVICE_C[0] - dev.width / 2 + shake
    dy = DEVICE_C[1] - dev.height / 2 - 30 - 260 * (1 - kd)
    if kd > 0:
        ui.paste(lay, dev, (dx, dy), min(1.0, max(0.0, kd)))
    if data.get("gag") == "smoke" and tl < SMOKE_END:
        _smoke(lay, tl, (DEVICE_C[0] + 60, DEVICE_C[1] - 150))

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
    for i, row in enumerate(rows[:stage]):
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
