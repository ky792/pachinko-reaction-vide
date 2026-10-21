"""実機の演出のオマージュ（再現演出）。台本の @dir fx=<種類> で、そのセリフから span 行ぶん出す。

  - 時刻はセリフの中の言葉の位置（文字数の割合）で決まる（marks）。尺・間は変えない
  - 絵はすべてその場で描くオリジナル（ロゴ・実機映像・キャラ絵は使わない）
  - キャラの上・字幕の下に重ねる（字幕は常に読める）

種類（FX）と、反応する言葉：
  bousou    ボタン→暗転→「まさか、」→「暴走！？」（鼓動3拍）
  flame     青い炎が立ちのぼり、ドクン／鼓動で脈打つ
  knife     ズバッ：画面が斜めに切れてずれる（白）
  yari      引き裂く：画面が赤く裂ける
  kourin    暗転して「まもなく／降臨」
  omedetou  おめでとう：光と紙吹雪、拍手
  lever     震える／ロング振動：画面が震える、風：風が抜ける
  rebabu    白・赤・虹：画面の縁が順に光る
  honeycomb ハニカム：金のハニカムが走る
  emergency EMERGENCY：赤い警報の帯と点滅
  spiral    スパイラル：渦とカウントダウン
  beat      鼓動：暗い中で赤く脈打つ
"""
import colorsys
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import ui
from ui import W, H, prog, ease_out, ease_in_out, fade, paste

RED = (214, 28, 36)
BLUE = (60, 150, 255)
GOLD = (255, 200, 80)

# span＝何行ぶん続けるか、marks＝反応する言葉（同じ名前に複数の言葉を並べられる。出てきた順に全部拾う）
FX = {
    "bousou": {"span": 2, "marks": {"btn": ["ボタン"], "dark": ["暗転"], "text": ["まさか"]}, "bgm": "cut:dark"},
    "flame": {"span": 3, "marks": {"fire": ["青い炎"], "beat": ["ドクン", "鼓動"]}, "bgm": "duck:fire"},
    "knife": {"span": 2, "marks": {"cut": ["ズバッ"]}},
    "yari": {"span": 2, "marks": {"cut": ["引き裂く"]}},
    "kourin": {"span": 2, "marks": {"text": ["まもなく降臨"]}, "bgm": "cut:text"},
    "omedetou": {"span": 1, "marks": {"go": ["おめでとう"]}},
    "lever": {"span": 2, "marks": {"shake": ["震える"], "long": ["ロング振動"], "wind": ["風"]}},
    "rebabu": {"span": 1, "marks": {"c": ["白", "赤", "虹"]}},
    "honeycomb": {"span": 2, "marks": {"go": ["ハニカム"]}},
    "emergency": {"span": 2, "marks": {"go": ["EMERGENCY"]}},
    "spiral": {"span": 1, "marks": {"go": ["スパイラル"]}},
    "beat": {"span": 1, "marks": {"beat": ["鼓動"]}},
}


# ---------------------------------------------------------------- 台本 → 時刻
def find_marks(fx, text, t, dur):
    """このセリフの中で、反応する言葉が出てくる時刻を拾う"""
    n = max(len(text), 1)
    for name, words in FX[fx["kind"]]["marks"].items():
        hits = []
        for w in words:
            i = text.find(w)
            while i >= 0:
                hits.append(round(t + dur * i / n, 3))
                i = text.find(w, i + 1)
        fx["marks"].setdefault(name, []).extend(sorted(hits))


def _m(fx, name, k=0, default=None):
    ms = fx["marks"].get(name) or []
    return ms[k] if len(ms) > k else default


def finish(fx, end, scene):
    """演出の終わりが決まったら、効果音・BGM の出し入れを足して scene に入れる"""
    fx.pop("left", None)
    fx["end"] = end
    k, s0 = fx["kind"], fx["start"]
    se = scene["se"]

    def add(t, kind, gain):
        if t is not None:
            se.append({"t": round(t, 3), "kind": kind, "gain": gain})

    if k == "bousou":
        tx = _m(fx, "text", default=s0 + 2)
        add(_m(fx, "btn"), "pon", 0.22)
        add(_m(fx, "dark"), "shu", 0.12)
        for i in range(3):
            add(tx + 0.9 + 0.85 * i, "heartbeat", 0.55 - 0.12 * i)
    elif k == "flame":
        add(_m(fx, "fire"), "flame", 0.30)
        for b in fx["marks"].get("beat", []):
            add(b, "heartbeat", 0.5)
    elif k in ("knife", "yari"):
        c = _m(fx, "cut", default=s0 + 1)
        add(c - 0.08, "shu", 0.18)
        add(c, "impact", 0.30 if k == "yari" else 0.22)
    elif k == "kourin":
        add(_m(fx, "text"), "don", 0.25)
    elif k == "omedetou":
        add(_m(fx, "go"), "clap", 0.32)
    elif k == "lever":
        add(_m(fx, "shake"), "rumble", 0.35)
        add(_m(fx, "long"), "rumble_long", 0.38)
        add(_m(fx, "wind"), "shu", 0.20)
    elif k == "rebabu":
        for i, c in enumerate(fx["marks"].get("c", [])[:3]):
            add(c, "piko" if i == 2 else "pon", 0.16 + 0.05 * i)
    elif k == "honeycomb":
        add(_m(fx, "go"), "shu", 0.18)
    elif k == "emergency":
        add(_m(fx, "go"), "alarm", 0.26)
    elif k == "spiral":
        g = _m(fx, "go", default=s0)
        n = int(max(0, end - g - 0.3))
        for i in range(n + 1):
            add(g + 0.3 + i, "tick", 0.20)
    elif k == "beat":
        b = _m(fx, "beat", default=s0 + 1)
        add(b, "heartbeat", 0.5)
        add(b + 0.85, "heartbeat", 0.4)

    bgm = FX[k].get("bgm")
    if bgm:
        mode, mark = bgm.split(":")
        at = _m(fx, mark, default=s0)
        scene["bgm_track"].append({"t": at, "level": 0.0 if mode == "cut" else 0.3, "dur": 0.15 if mode == "cut" else 0.4})
        scene["bgm_track"].append({"t": round(end + 0.2, 3), "level": 1.0, "dur": 0.9})
    scene["fx"].append(fx)


# ---------------------------------------------------------------- 効果音（その場で合成・著作権フリー）
LAB_SE = ("heartbeat", "clap", "alarm", "rumble", "rumble_long", "tick", "flame")


def lab_se(kind, SR):
    rng = np.random.default_rng(7)
    if kind == "heartbeat":   # ドクン：低い2打（ドッ・クン）
        n = int(0.7 * SR); t = np.arange(n) / SR

        def thump(t0, f0, amp):
            tt = np.clip(t - t0, 0, None)
            f = f0 * np.exp(-tt * 9) + 38
            e = np.where(t >= t0, np.clip(tt / 0.006, 0, 1) * np.exp(-tt / 0.11), 0)
            return np.sin(2 * np.pi * np.cumsum(f) / SR) * e * amp
        x = thump(0.0, 95, 1.0) + thump(0.21, 80, 0.75)
        return (np.tanh(x * 1.6) / np.tanh(1.6)).astype(np.float32)
    if kind == "clap":        # 拍手：短いノイズのはじけを、たくさんの人ぶん重ねる
        n = int(2.6 * SR); x = np.zeros(n, np.float32)
        for _ in range(260):
            a = int(rng.uniform(0, 2.2) * SR); m = int(0.025 * SR)
            burst = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.006 * SR))
            x[a:a + m] += burst[: n - a] * rng.uniform(0.3, 1.0)
        b = np.convolve(x, np.ones(6) / 6, mode="same")   # 高すぎる音を少し丸める
        env = np.minimum(1, np.arange(n) / (0.25 * SR)) * np.clip((2.6 * SR - np.arange(n)) / (0.8 * SR), 0, 1)
        return (b * env * 0.18).astype(np.float32)
    if kind == "alarm":       # 警報：高低2音を4回
        n = int(2.0 * SR); t = np.arange(n) / SR
        f = np.where((t * 4).astype(int) % 2 == 0, 960, 720)
        x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.35
        x *= np.clip((2.0 - t) / 0.3, 0, 1) * np.minimum(1, t / 0.01)
        return x.astype(np.float32)
    if kind in ("rumble", "rumble_long"):   # レバーの振動：低いブーンの断続
        d = 2.0 if kind == "rumble_long" else 1.0
        n = int(d * SR); t = np.arange(n) / SR
        x = np.sin(2 * np.pi * 52 * t) + 0.4 * np.sin(2 * np.pi * 104 * t)
        x *= (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 12 * t))) * np.clip((d - t) / 0.25, 0, 1) * np.minimum(1, t / 0.02)
        return (x * 0.6).astype(np.float32)
    if kind == "tick":        # タイマーのカチッ
        n = int(0.06 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.008) * 0.7).astype(np.float32)
    if kind == "flame":       # 炎がボッと立つ：ノイズを低めに
        n = int(1.2 * SR); t = np.arange(n) / SR
        x = rng.standard_normal(n)
        for _ in range(3):
            x = np.convolve(x, np.ones(12) / 12, mode="same")
        x *= np.minimum(1, t / 0.08) * np.exp(-t / 0.5) * 3.0
        return x.astype(np.float32)
    return None


# ---------------------------------------------------------------- 描画の部品
_C = {}


def _env(t, a, b, fin=0.25, fout=0.5):
    return max(0.0, min(ease_out(prog(t, a, fin)), 1 - ease_in_out(prog(t, b, fout))))


def _black(cv, a):
    if a > 0:
        cv.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * min(a, 1)))))


def _title(text, size, color=(255, 255, 255), glow=RED, squeeze=0.74):
    """白い明朝（横を詰めて縦長に見せる）＋にじみ。キャッシュする"""
    key = ("t", text, size, color, glow, squeeze)
    if key not in _C:
        f = ui.serif(size)
        w = int(ui.text_w(text, f)) + 80
        h = int(size * 1.5)
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((w / 2, h / 2), text, font=f, fill=color + (255,), anchor="mm")
        im = im.resize((max(1, int(w * squeeze)), h), Image.LANCZOS)
        pad = 60
        t = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        t.alpha_composite(im, (pad, pad))
        g = Image.new("RGBA", t.size, glow + (0,))
        g.putalpha(t.getchannel("A").filter(ImageFilter.GaussianBlur(16)))
        _C[key] = (t, g.filter(ImageFilter.GaussianBlur(8)))
    return _C[key]


def _put_title(cv, text, size, cy, a, scale=1.0, glow_a=0.6, color=(255, 255, 255), glow=RED):
    if a <= 0:
        return
    t, g = _title(text, size, color, glow)
    for im, al in ((g, glow_a * a), (t, a)):
        if abs(scale - 1) > 1e-3:
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.BICUBIC)
        paste(cv, im, (W / 2 - im.width / 2, cy - im.height / 2), al)


def _edge(color):
    """画面の縁だけ色づく幕"""
    key = ("e", color)
    if key not in _C:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 1.35
        a = np.clip((r - 0.45) / 0.55, 0, 1) ** 1.8
        g = np.zeros((H, W, 4), np.uint8)
        g[..., :3] = color
        g[..., 3] = (a * 210).astype(np.uint8)
        _C[key] = Image.fromarray(g, "RGBA")
    return _C[key]


def _pulse(t, beats, tau=0.22):
    return max((math.exp(-(t - b) / tau) for b in beats if t >= b), default=0.0)


def _flicker(tl):
    """2回瞬いてから点く"""
    return tl >= 0.22 or (0.0 <= tl < 0.05) or (0.10 <= tl < 0.16)


# ---------------------------------------------------------------- 各演出
def _bousou(cv, t, fx):
    end = fx["end"]
    dark = _m(fx, "dark", default=fx["start"] + 1.5)
    tx = _m(fx, "text", default=dark + 1)
    out = 1 - ease_in_out(prog(t, end, 0.6))
    _black(cv, ease_out(prog(t, dark, 0.18)) * out)
    tl = t - tx
    if tl < 0:
        return
    slam = tx + 0.9                          # 「暴走！？」は1拍目の鼓動と同時に
    beats = [slam + 0.85 * i for i in range(3)]
    p = _pulse(t, beats)
    if p > 0.02:
        cv.alpha_composite(fade(_edge(RED), 0.6 * p * out))
    grow = 1.0 + 0.03 * ease_out(prog(tl, 0.22, 3.0))
    if _flicker(tl):
        _put_title(cv, "まさか、", 112, 330, out, grow, 0.35)
    if t >= slam:
        s = (1.0 + 0.28 * (1 - ease_out(prog(t, slam, 0.14)))) * grow * (1 + 0.035 * p)
        _put_title(cv, "暴走！？", 210, 540, out * ease_out(prog(t, slam, 0.06)), s, 0.55 + 0.45 * p)
        if t < slam + 0.12:                  # 叩きつけた瞬間に白く光る
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(110 * (1 - prog(t, slam, 0.12))))))
    k = ease_out(prog(tl, 0.25, 0.5)) * out
    if k > 0:
        d = ImageDraw.Draw(cv)
        half = 600 * k
        for y in (238, 668):
            d.rectangle((W / 2 - half, y, W / 2 + half, y + 2), fill=RED + (int(255 * k),))


def _flame_layer(t, boost):
    """青い炎（低解像度で描いて拡大）"""
    w, h = 480, 270
    x = np.arange(w, dtype=np.float32)[None, :]
    y = np.arange(h, dtype=np.float32)[:, None]
    hh = (0.34 + 0.10 * np.sin(x * 0.045 + t * 5.5) + 0.07 * np.sin(x * 0.13 - t * 8.7)
          + 0.04 * np.sin(x * 0.31 + t * 13.1) + 0.18 * boost) * h
    yb = (h - y)
    a = np.clip(1 - yb / np.maximum(hh, 1), 0, 1) ** 1.3
    core = np.clip(1 - yb / np.maximum(hh * 0.45, 1), 0, 1)
    rgb = np.zeros((h, w, 3), np.float32)
    rgb[..., 0] = 30 + 200 * core
    rgb[..., 1] = 110 + 140 * core
    rgb[..., 2] = 255
    im = Image.fromarray(np.dstack([rgb, a * 235]).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(2.5))
    return im.resize((W, H), Image.BICUBIC)


def _flame(cv, t, fx):
    fire = _m(fx, "fire", default=fx["start"] + 1)
    a = _env(t, fire - 0.1, fx["end"], 0.35, 0.6)
    if a <= 0:
        return
    _black(cv, 0.55 * a)
    p = _pulse(t, fx["marks"].get("beat", []), 0.25)
    paste(cv, _flame_layer(t, p), (0, 0), a * min(1, prog(t, fire - 0.1, 0.5)))
    if p > 0.02:
        cv.alpha_composite(fade(_edge(BLUE), 0.7 * p * a))


def _split(cv, t, c, color, width, shift, hold):
    """斜めの線で画面を切り、左上と右下をずらす"""
    k = 1 - ease_in_out(prog(t, c + hold, 0.35))
    sweep = ease_out(prog(t, c - 0.1, 0.1))
    p0, p1 = (W * 0.78, -40), (W * 0.22, H + 40)
    px, py = p0[0] + (p1[0] - p0[0]) * sweep, p0[1] + (p1[1] - p0[1]) * sweep
    if t >= c:
        dx, dy = shift * k, shift * 0.45 * k
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon([(0, 0), p0, p1, (0, H)], fill=255)
        base = cv.copy()
        a = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        a.paste(base, (int(-dx), int(-dy)))
        b = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        b.paste(base, (int(dx), int(dy)))
        b.paste(a, (0, 0), mask)
        cv.paste(b, (0, 0))
        fl = 1 - prog(t, c, 0.3)
        if fl > 0:
            cv.alpha_composite(Image.new("RGBA", (W, H), color + (int(120 * fl),)))
    la = min(1.0, k + 0.0) if t >= c else 1.0
    if sweep > 0 and la > 0:
        line = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(line).line((p0, (px, py)), fill=color + (255,), width=width)
        glow = line.filter(ImageFilter.GaussianBlur(width * 2))
        paste(cv, glow, (0, 0), la)
        paste(cv, line, (0, 0), la)


def _knife(cv, t, fx):
    c = _m(fx, "cut", default=fx["start"] + 1)
    if c - 0.12 <= t < c + 1.0:
        _split(cv, t, c, (255, 255, 255), 6, 16, 0.35)


def _yari(cv, t, fx):
    c = _m(fx, "cut", default=fx["start"] + 1)
    if c - 0.12 <= t < c + 1.6:
        _split(cv, t, c, RED, 12, 26, 0.9)
        p = math.exp(-max(0, t - c) / 0.35) if t >= c else 0
        if p > 0.02:
            cv.alpha_composite(fade(_edge(RED), 0.8 * p))


def _kourin(cv, t, fx):
    tx = _m(fx, "text", default=fx["start"] + 0.5)
    out = 1 - ease_in_out(prog(t, fx["end"], 0.6))
    _black(cv, ease_out(prog(t, tx - 0.15, 0.2)) * out)
    tl = t - tx
    if tl < 0 or not _flicker(tl):
        return
    grow = 1.0 + 0.04 * ease_out(prog(tl, 0.2, 3.0))
    _put_title(cv, "まもなく", 96, 360, out, grow, 0.3, glow=(255, 255, 255))
    _put_title(cv, "降臨", 230, 545, out, grow, 0.5, glow=(255, 255, 255))


def _confetti(t, t0):
    n = 150
    if "conf" not in _C:
        r = np.random.default_rng(3)
        _C["conf"] = dict(x=r.uniform(0, W, n), v=r.uniform(260, 520, n), s=r.uniform(8, 18, n),
                          ph=r.uniform(0, 6.28, n), d=r.uniform(-0.3, 0.6, n),
                          c=[colorsys.hsv_to_rgb(h, 0.55, 1.0) for h in r.uniform(0, 1, n)])
    c = _C["conf"]
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(n):
        tt = t - t0 - c["d"][i]
        if tt < 0:
            continue
        y = -30 + c["v"][i] * tt
        if y > H + 30:
            continue
        x = c["x"][i] + 40 * math.sin(c["ph"][i] + tt * 3)
        s = c["s"][i]
        w = s * abs(math.cos(c["ph"][i] + tt * 6))
        col = tuple(int(v * 255) for v in c["c"][i]) + (230,)
        d.rectangle((x - w / 2, y - s / 2, x + w / 2, y + s / 2), fill=col)
    return im


def _omedetou(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.05, fx["end"] + 0.6, 0.3, 0.7)
    if a <= 0:
        return
    if "bloom" not in _C:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W * 0.5)) ** 2 + ((yy - H * 0.35) / (H * 0.6)) ** 2)
        al = np.clip(1 - r, 0, 1) ** 1.5
        b = np.zeros((H, W, 4), np.uint8)
        b[..., 0], b[..., 1], b[..., 2] = 255, 236, 190
        b[..., 3] = (al * 150).astype(np.uint8)
        _C["bloom"] = Image.fromarray(b, "RGBA")
    _black(cv, 0.45 * a)                     # 文字が読めるよう、後ろの資料を少し沈める
    paste(cv, _C["bloom"], (0, 0), a)
    paste(cv, _confetti(t, g), (0, 0), a)
    _put_title(cv, "おめでとう", 150, 330, a * ease_out(prog(t, g, 0.4)), 1.0 + 0.03 * prog(t, g, 3),
               0.55, color=(255, 246, 220), glow=GOLD)


def shake(scene, t):
    """レバー振動：画面ごと震わせる量（px）"""
    dx = dy = 0.0
    for fx in scene.get("fx", []):
        if fx["kind"] != "lever":
            continue
        for name, d, amp in (("shake", 1.0, 9), ("long", 2.0, 11)):
            for s in fx["marks"].get(name, []):
                if s <= t < s + d:
                    k = (1 - (t - s) / d) ** 0.6
                    dx += amp * k * math.sin(t * 2 * math.pi * 23)
                    dy += amp * 0.6 * k * math.sin(t * 2 * math.pi * 31 + 1.3)
    return dx, dy


def _lever(cv, t, fx):
    for w in fx["marks"].get("wind", []):
        tl = t - w
        if not 0 <= tl < 1.0:
            continue
        a = min(ease_out(prog(tl, 0, 0.15)), 1 - prog(tl, 0.55, 0.45))
        if "streaks" not in _C:
            r = np.random.default_rng(5)
            _C["streaks"] = [(r.uniform(80, H - 220), r.uniform(200, 700), r.uniform(0, 1), r.uniform(2, 5)) for _ in range(34)]
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for y, ln, ph, wd in _C["streaks"]:
            x = W + 200 - ((tl * 2600 + ph * W * 1.5) % (W * 1.6))
            d.line((x, y, x + ln, y), fill=(230, 245, 255, 150), width=int(wd))
        paste(cv, im.filter(ImageFilter.GaussianBlur(1.2)), (0, 0), a)
    for name, d in (("shake", 1.0), ("long", 2.0)):
        for s in fx["marks"].get(name, []):
            if s <= t < s + d:                 # 震えている間、縁がうっすら光る
                cv.alpha_composite(fade(_edge((255, 255, 255)), 0.25 * (1 - (t - s) / d)))


def _border(color_fn, t):
    """縁の光（低解像度で作って拡大）。color_fn(角度0〜1) → RGB"""
    w, h = 320, 180
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.minimum.reduce([xx, yy, w - 1 - xx, h - 1 - yy])
    a = np.clip(1 - dist / 14, 0, 1) ** 1.4
    ang = (np.arctan2(yy - h / 2, xx - w / 2) / (2 * np.pi) + 0.5)
    rgb = color_fn(ang, t)
    im = Image.fromarray(np.dstack([rgb, a * 240]).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(1.5))
    return im.resize((W, H), Image.BICUBIC)


def _rebabu(cv, t, fx):
    cs = fx["marks"].get("c", [])
    if not cs or t < cs[0]:
        return
    a = 1 - ease_in_out(prog(t, fx["end"] + 0.3, 0.6))
    stage = sum(1 for c in cs if t >= c) - 1
    if stage <= 0:
        fn = lambda ang, tt: np.dstack([np.full(ang.shape, 255.0)] * 3)
    elif stage == 1:
        fn = lambda ang, tt: np.dstack([np.full(ang.shape, 235.0), np.full(ang.shape, 40.0), np.full(ang.shape, 48.0)])
    else:
        def fn(ang, tt):
            hue = (ang + tt * 0.6) % 1.0
            i = (hue * 6).astype(int) % 6
            f = hue * 6 - np.floor(hue * 6)
            q, p = 1 - f, f
            r = np.choose(i, [1, q, 0, 0, p, 1]); g = np.choose(i, [p, 1, 1, q, 0, 0]); b = np.choose(i, [0, 0, p, 1, 1, q])
            return np.dstack([r, g, b]) * 255
    pop = math.exp(-(t - cs[min(stage, len(cs) - 1)]) / 0.25)
    paste(cv, _border(fn, t), (0, 0), a * (0.75 + 0.25 * pop))
    if pop > 0.05:
        col = [(255, 255, 255), (235, 40, 48), (255, 255, 255)][min(stage, 2)]
        cv.alpha_composite(fade(_edge(col), 0.35 * pop * a))


def _hex_grid():
    if "hex" not in _C:
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        r = 46
        dx, dy = r * 1.5, r * math.sqrt(3)
        for i in range(-1, int(W / dx) + 2):
            for j in range(-1, int(H / dy) + 2):
                cx = i * dx
                cy = j * dy + (dy / 2 if i % 2 else 0)
                pts = [(cx + r * math.cos(math.pi / 3 * k), cy + r * math.sin(math.pi / 3 * k)) for k in range(7)]
                d.line(pts, fill=GOLD + (230,), width=3)
        g = im.filter(ImageFilter.GaussianBlur(5))
        g.alpha_composite(im)
        _C["hex"] = g
    return _C["hex"]


def _honeycomb(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    if t < g:
        return
    a = 1 - ease_in_out(prog(t, fx["end"], 0.5))
    sweep = ease_out(prog(t, g, 0.55))
    mask = Image.new("L", (W, H), 0)
    x = -400 + (W + 800) * sweep
    ImageDraw.Draw(mask).polygon([(0, 0), (x + 300, 0), (x - 300, H), (0, H)], fill=255)
    tint = Image.new("RGBA", (W, H), (40, 24, 0, 110))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.alpha_composite(tint)
    layer.alpha_composite(_hex_grid())
    shine = (t - g) * 900 % (W + 600) - 300            # 光の帯が走る
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).polygon([(shine, 0), (shine + 120, 0), (shine - 80, H), (shine - 200, H)], fill=120)
    glow = Image.new("RGBA", (W, H), (255, 240, 200, 0)); glow.putalpha(sh.filter(ImageFilter.GaussianBlur(30)))
    layer.alpha_composite(glow)
    m2 = Image.eval(mask, lambda v: int(v * a * 0.75))
    cv.paste(Image.alpha_composite(cv, layer), (0, 0), m2)


def _emergency(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g, fx["end"], 0.15, 0.5)
    if a <= 0:
        return
    blink = 0.5 + 0.5 * math.cos((t - g) * 2 * math.pi * 2.2)
    cv.alpha_composite(Image.new("RGBA", (W, H), RED + (int(70 * blink * a),)))
    cv.alpha_composite(fade(_edge(RED), (0.5 + 0.4 * blink) * a))
    if "band" not in _C:
        bh = 64
        band = Image.new("RGBA", (W * 2, bh), (20, 0, 0, 235))
        d = ImageDraw.Draw(band)
        for x in range(-bh, W * 2, 44):
            d.polygon([(x, bh), (x + 22, bh), (x + 22 + bh, 0), (x + bh, 0)], fill=RED + (255,))
        f = ui.font("black", 40)
        lab = Image.new("RGBA", (W * 2, bh), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lab)
        for x in range(0, W * 2, 520):
            ld.rectangle((x + 40, 8, x + 420, bh - 8), fill=(20, 0, 0, 255))
            ld.text((x + 230, bh / 2), "EMERGENCY", font=f, fill=(255, 235, 235, 255), anchor="mm")
        band.alpha_composite(lab)
        _C["band"] = band
    band = _C["band"]
    off = int((t - g) * 160) % 520
    for y, sgn in ((0, 1), (H - band.height, -1)):
        x = -off if sgn > 0 else off - 520
        paste(cv, band, (x, y), a * ease_out(prog(t, g, 0.2)))


def _spiral_img():
    if "spi" not in _C:
        s = 1500
        im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for arm in range(6):
            pts = []
            for k in range(0, 900):
                th = k * 0.02 + arm * math.pi / 3
                r = 6 + k * 0.85
                pts.append((s / 2 + r * math.cos(th), s / 2 + r * math.sin(th)))
            d.line(pts, fill=(170, 90, 255, 200), width=10)
        _C["spi"] = im.filter(ImageFilter.GaussianBlur(3))
    return _C["spi"]


def _spiral(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.55 * a)
    sp = _spiral_img().rotate(-(t - g) * 160, resample=Image.BICUBIC)
    paste(cv, sp, (W / 2 - sp.width / 2, H * 0.42 - sp.height / 2), 0.55 * a)
    left = max(0.0, fx["end"] - 0.3 - t)
    txt = f"{left:05.2f}"
    f = ui.font("black", 120)
    im = Image.new("RGBA", (560, 170), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((280, 85), txt, font=f, fill=(255, 255, 255, 255), anchor="mm")
    gl = Image.new("RGBA", im.size, (200, 120, 255, 0)); gl.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(10)))
    paste(cv, gl, (W / 2 - 280, 300), a)
    paste(cv, im, (W / 2 - 280, 300), a)


def _beat(cv, t, fx):
    b = _m(fx, "beat", default=fx["start"] + 1)
    a = _env(t, b - 0.25, fx["end"], 0.25, 0.5)
    if a <= 0:
        return
    _black(cv, 0.5 * a)
    p = _pulse(t, [b, b + 0.85], 0.25)
    if p > 0.02:
        cv.alpha_composite(fade(_edge(RED), 0.85 * p * a))


DRAW = {"bousou": _bousou, "flame": _flame, "knife": _knife, "yari": _yari, "kourin": _kourin, "omedetou": _omedetou,
        "lever": _lever, "rebabu": _rebabu, "honeycomb": _honeycomb, "emergency": _emergency, "spiral": _spiral,
        "beat": _beat}


NOTE = "※演出はイメージです。実機の演出ではありません"


def _note(cv, a):
    """注釈：演出が出ている間だけ、右上に小さく"""
    if "note" not in _C:
        f = ui.font("medium", 24)
        w = int(ui.text_w(NOTE, f)) + 36
        im = Image.new("RGBA", (w, 42), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((0, 0, w - 1, 41), 8, fill=(0, 0, 0, 150))
        d.text((w / 2, 21), NOTE, font=f, fill=(255, 255, 255, 235), anchor="mm")
        _C["note"] = im
    im = _C["note"]
    paste(cv, im, (W - im.width - 36, 84), a)


def draw(cv, scene, t):
    """今出ている再現演出をすべて描く（キャラの上・字幕の下）。出ている間は注釈も出す"""
    na = 0.0
    for fx in scene.get("fx", []):
        if fx["start"] - 0.2 <= t < fx["end"] + 1.0:
            DRAW[fx["kind"]](cv, t, fx)
            first = min([v for ms in fx["marks"].values() for v in ms] or [fx["start"]])
            na = max(na, _env(t, first - 0.3, fx["end"] + 0.3, 0.3, 0.4))
    if na > 0:
        _note(cv, na)
