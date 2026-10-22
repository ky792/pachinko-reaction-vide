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
  （牙狼）garo_ken 牙狼剣／fog 顔の枠／konjiki 金色／inazuma 稲妻保留／door 1回転
  （牙狼v2）hane 羽根とメーター／battle 1stバトル／shingeki 震撃／nanairo 7色／yami 闇→光／tokei 長い変動
           byousoku 秒速／kasane 初代と重なる／vlight 光の枠／count3000 カウントアップ／kyokugen 1500vs7500／burst
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
    # ---- 牙狼
    "garo_ken": {"span": 2, "marks": {"stab": ["牙狼剣", "斬馬剣"], "push": ["押し込む"]}},
    "fog": {"span": 2, "marks": {"go": ["F.O.G."], "pulse": ["顔や"]}},
    "konjiki": {"span": 1, "marks": {"go": ["金色"]}},
    "inazuma": {"span": 2, "marks": {"strike": ["稲妻"]}},
    "door": {"span": 2, "marks": {"go": ["1回転"]}},
    # 牙狼回 v2：台ごとに1つ
    "hane": {"span": 3, "marks": {"open": ["羽根"], "v": ["Vに"], "p50": ["50%"], "p82": ["82%"]}},
    "battle": {"span": 3, "marks": {"go": ["1stバトル"], "weak": ["弱"], "strong": ["強"]}},
    "shingeki": {"span": 2, "marks": {"go": ["震撃"], "don": ["ドン"]}},
    "nanairo": {"span": 2, "marks": {"go": ["L.F.O.G."], "color": ["7色"]}},
    "yami": {"span": 2, "marks": {"light": ["照らす"], "back": ["戻ってきた"]}},
    "tokei": {"span": 2, "marks": {"go": ["変動が長い"], "slow": ["なかなか"]}},
    "byousoku": {"span": 2, "marks": {"go": ["秒速"], "kore": ["これや"]}},
    "kasane": {"span": 3, "marks": {"now": ["81%"], "old": ["82%"]}},
    "vlight": {"span": 1, "marks": {"go": ["V-LIGHT"]}},
    "count3000": {"span": 2, "marks": {"go": ["3000"]}},
    "kyokugen": {"span": 3, "marks": {"go": ["極限"], "win": ["勝てば"], "lose": ["負けても"]}},
    "burst": {"span": 1, "marks": {"go": ["BURST"]}},
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

    elif k == "garo_ken":
        st = _m(fx, "stab", default=s0 + 0.5)
        add(st - 0.18, "shu", 0.2); add(st, "impact", 0.32)
        add(_m(fx, "push"), "don", 0.25)
    elif k == "fog":
        g = _m(fx, "go", default=s0)
        add(g - 0.6, "shu", 0.12); add(g, "rumble", 0.22)
        for i in range(6):
            add(g + 0.15 + 0.07 * i, "tick", 0.14)                      # 装甲がはまる音
        add(g + FOG_LOCK, "impact", 0.30)
        add(_m(fx, "pulse"), "don", 0.22)
    elif k == "konjiki":
        g = _m(fx, "go", default=s0); add(g, "shu", 0.15); add(g + 0.35, "piko", 0.14)
    elif k == "inazuma":
        for b in fx["marks"].get("strike", [])[:2]:
            add(b, "impact", 0.28)
    elif k == "door":
        g = _m(fx, "go", default=s0); add(g, "shu", 0.2); add(g + 0.35, "don", 0.3)
    elif k == "hane":
        for o in fx["marks"].get("open", [])[:2]:
            add(o, "piko", 0.12)
        v = _m(fx, "v"); add(v + 0.7 if v is not None else None, "pon", 0.2)
        add(_m(fx, "p50"), "shu", 0.12); add(_m(fx, "p82"), "piko", 0.18)
    elif k == "battle":
        add(_m(fx, "go"), "taiko", 0.25); add(_m(fx, "weak"), "pon", 0.15); add(_m(fx, "strong"), "impact", 0.26)
    elif k == "shingeki":
        for h in (fx["marks"].get("go", []) + fx["marks"].get("don", []))[:3]:
            add(h, "don", 0.34); add(h, "rumble", 0.3)
    elif k == "nanairo":
        g = _m(fx, "go", default=s0); add(g, "shu", 0.18); add(g + FOG_LOCK / 3.5, "impact", 0.26); add(_m(fx, "color"), "piko", 0.18)
    elif k == "yami":
        add(_m(fx, "light"), "shu", 0.16); add(_m(fx, "back"), "pon", 0.16)
    elif k == "tokei":
        g = _m(fx, "go", default=s0)
        for i in range(int(max(0, end - g))):
            add(g + i, "tick", 0.22)
    elif k == "byousoku":
        g = _m(fx, "go", default=s0); add(g, "shu", 0.22)
        st = _m(fx, "kore", default=end - 0.6)
        for i in range(3):
            add(st + 0.12 * i, "pon", 0.16)
    elif k == "kasane":
        add(_m(fx, "now"), "pon", 0.15); o = _m(fx, "old"); add(o, "pon", 0.15)
        add(o + 1.7 if o is not None else None, "impact", 0.22)
    elif k == "vlight":
        g = _m(fx, "go", default=s0); add(g, "shu", 0.2); add(g + 1.1, "piko", 0.16)
    elif k == "count3000":
        g = _m(fx, "go", default=s0)
        for i in range(10):
            add(g + 0.13 * i, "tick", 0.16)
        add(g + 1.3, "impact", 0.24)
    elif k == "kyokugen":
        add(_m(fx, "go"), "taiko", 0.25); add(_m(fx, "win"), "impact", 0.28)
    elif k == "burst":
        g = _m(fx, "go", default=s0); add(g - 0.3, "shu", 0.18); add(g, "impact", 0.32)

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
        names = {"garo_ken": (("stab", 0.3),), "door": (("go", 0.25),), "shingeki": (("go", 0.6), ("don", 0.6)),
                 "battle": (("strong", 0.35),), "fog": (("go", 0.35),), "nanairo": (("go", 0.3),), "burst": (("go", 0.4),), "kyokugen": (("win", 0.3),)}.get(fx["kind"], ())
        for name, d0 in names:
            s = _m(fx, name)
            s = (s + 0.35) if (s is not None and fx["kind"] == "door") else s
            s = (s + FOG_LOCK) if (s is not None and fx["kind"] == "fog") else s
            s = (s + FOG_LOCK / 3.5) if (s is not None and fx["kind"] == "nanairo") else s
            if s is not None and s <= t < s + d0:
                k = 1 - (t - s) / d0
                dx += 12 * k * math.sin(t * 2 * math.pi * 27); dy += 8 * k * math.sin(t * 2 * math.pi * 33 + 1)
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


# ---------------------------------------------------------------- 牙狼の演出（オリジナルの絵）
GOLDC = (255, 205, 70)


def _sword():
    """牙狼剣のイメージ（オリジナル）：金の鍔と柄、銀の刀身。切っ先が下"""
    if "sword" not in _C:
        w, h = 200, 700
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        cx = w / 2
        d.ellipse((cx - 22, 6, cx + 22, 50), fill=GOLDC + (255,), outline=(120, 80, 10, 255), width=3)        # 柄頭
        d.rectangle((cx - 15, 46, cx + 15, 150), fill=(40, 30, 20, 255))                                      # 柄
        for y in range(54, 150, 14):
            d.line((cx - 15, y, cx + 15, y + 8), fill=(120, 90, 40, 255), width=3)
        d.polygon([(cx - 92, 150), (cx + 92, 150), (cx + 70, 180), (cx - 70, 180)], fill=GOLDC + (255,), outline=(120, 80, 10, 255))  # 鍔
        d.polygon([(cx - 26, 180), (cx + 26, 180), (cx + 22, h - 70), (cx, h - 8), (cx - 22, h - 70)], fill=(215, 222, 232, 255))    # 刀身
        d.polygon([(cx - 4, 190), (cx + 4, 190), (cx + 3, h - 80), (cx, h - 40), (cx - 3, h - 80)], fill=(255, 255, 255, 255))         # 樋の光
        d.line((cx - 26, 180, cx - 22, h - 70), fill=(140, 150, 165, 255), width=2)
        g = Image.new("RGBA", (w, h), (255, 230, 150, 0)); g.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(14)))
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); out.alpha_composite(g); out.alpha_composite(im)
        _C["sword"] = out
    return _C["sword"]


def _rays(cv, cx, cy, k, color=GOLDC, n=26, r0=60, r1=900):
    if k <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for i in range(n):
        a = i / n * 2 * math.pi
        w = 0.035
        d.polygon([(cx + r0 * math.cos(a - w), cy + r0 * math.sin(a - w)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a)),
                   (cx + r0 * math.cos(a + w), cy + r0 * math.sin(a + w))], fill=color + (int(150 * k),))
    cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(2)))


def _garo_ken(cv, t, fx):
    st = _m(fx, "stab", default=fx["start"] + 0.5)
    if t < st - 0.25:
        return
    out = 1 - ease_in_out(prog(t, fx["end"], 0.45))
    _black(cv, 0.4 * min(1, prog(t, st - 0.25, 0.25)) * out)
    sw = _sword()
    tip_y = 650
    fall = ease_in_out(prog(t, st - 0.22, 0.22)) ** 2
    y0, y1 = -sw.height - 40, tip_y - sw.height          # 画面の上から、切っ先が tip_y に刺さるまで
    y = y0 + (y1 - y0) * fall
    push = _m(fx, "push")
    if push and t >= push:
        y += 34 * ease_out(prog(t, push, 0.15))
    if t >= st:
        _rays(cv, W / 2, tip_y - 20, math.exp(-(t - st) / 0.35) * out)
        fl = 1 - prog(t, st, 0.16)
        if fl > 0:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 250, 230, int(150 * fl))))
        # 刺さった所の割れ目
        d = ImageDraw.Draw(cv)
        for i in range(7):
            a = math.pi * (0.1 + 0.8 * i / 6)
            d.line((W / 2, tip_y, W / 2 + 120 * math.cos(a) * (1 if i % 2 else -1), tip_y + 26 * math.sin(a)), fill=(255, 220, 140, int(200 * out)), width=3)
    paste(cv, sw, (W / 2 - sw.width / 2, y), out)
    if push and t >= push:
        p = math.exp(-(t - push) / 0.4)
        cv.alpha_composite(fade(_edge(GOLDC), 0.7 * p * out))
        _rays(cv, W / 2, 360, p * out, (255, 240, 180), 32, 40, 1000)


def _emblem():
    """金の紋章の枠（オリジナル。顔は描かない）：6つの部品"""
    if "emb" not in _C:
        parts = []
        cx, cy, R = 300, 300, 230
        for k in range(6):
            im = Image.new("RGBA", (600, 600), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
            a0, a1 = math.pi / 3 * k - math.pi / 2, math.pi / 3 * (k + 1) - math.pi / 2
            pts = [(cx + R * math.cos(a0), cy + R * math.sin(a0)), (cx + R * math.cos(a1), cy + R * math.sin(a1)),
                   (cx + (R - 46) * math.cos(a1), cy + (R - 46) * math.sin(a1)), (cx + (R - 46) * math.cos(a0), cy + (R - 46) * math.sin(a0))]
            d.polygon(pts, fill=GOLDC + (255,), outline=(130, 80, 10, 255))
            am = (a0 + a1) / 2                                              # 外に伸びる飾り
            d.polygon([(cx + R * math.cos(am - 0.12), cy + R * math.sin(am - 0.12)), (cx + (R + 70) * math.cos(am), cy + (R + 70) * math.sin(am)),
                       (cx + R * math.cos(am + 0.12), cy + R * math.sin(am + 0.12))], fill=(255, 225, 120, 255), outline=(130, 80, 10, 255))
            parts.append((im, am))
        _C["emb"] = parts
    return _C["emb"]


def _fog(cv, t, fx):
    g = _m(fx, "go", default=fx["start"] + 0.3)
    if t < g - 0.05:
        return
    out = 1 - ease_in_out(prog(t, fx["end"], 0.5))
    _black(cv, 0.5 * min(1, prog(t, g - 0.05, 0.2)) * out)
    layer = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    inner = Image.new("RGBA", (600, 600), (0, 0, 0, 0)); ImageDraw.Draw(inner).regular_polygon((300, 300, 184), 6, rotation=0, fill=(30, 20, 5, 170))
    layer.alpha_composite(inner)
    for i, (im, am) in enumerate(_emblem()):
        k = ease_out(prog(t, g + 0.06 * i, 0.4))
        dx, dy = (1 - k) * 420 * math.cos(am), (1 - k) * 420 * math.sin(am)
        tmp = Image.new("RGBA", (600, 600), (0, 0, 0, 0)); tmp.paste(im, (int(dx), int(dy)), im)
        layer.alpha_composite(ui.fade(tmp, k))
    done = g + 0.75
    p = _pulse(t, [done] + fx["marks"].get("pulse", []), 0.35)
    glow = Image.new("RGBA", layer.size, GOLDC + (0,)); glow.putalpha(layer.getchannel("A").filter(ImageFilter.GaussianBlur(18)))
    paste(cv, glow, (W / 2 - 300, 330 - 300), (0.5 + 0.5 * p) * out)
    paste(cv, layer, (W / 2 - 300, 330 - 300), out)
    if t >= done:
        _rays(cv, W / 2, 330, p * out, GOLDC, 24, 230, 900)


def _konjiki(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    if t < g:
        return
    a = 1 - ease_in_out(prog(t, fx["end"] + 0.4, 0.6))
    k = ease_out(prog(t, g, 0.55))
    if "gold" not in _C:
        yy = np.linspace(0, 1, H)[:, None] * np.ones((1, W))
        arr = np.zeros((H, W, 4), np.uint8)
        arr[..., 0], arr[..., 1], arr[..., 2] = 255, (190 + 50 * (1 - yy)).astype(np.uint8), (40 + 80 * (1 - yy)).astype(np.uint8)
        arr[..., 3] = (110 + 60 * yy).astype(np.uint8)
        _C["gold"] = Image.fromarray(arr, "RGBA")
    m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).rectangle((0, H - H * k, W, H), fill=int(255 * a))
    cv.paste(Image.alpha_composite(cv, _C["gold"]), (0, 0), m.filter(ImageFilter.GaussianBlur(30)))
    rng = np.random.default_rng(21)
    d = ImageDraw.Draw(cv)
    for i in range(70):                                   # 舞い上がる金の光
        x0 = rng.uniform(0, W); sp = rng.uniform(120, 320); ph = rng.uniform(0, 3)
        tt = (t - g + ph) % 3.0
        y = H + 20 - sp * tt
        if y < -20:
            continue
        r = rng.uniform(2, 5)
        d.ellipse((x0 - r, y - r, x0 + r, y + r), fill=(255, 245, 190, int(220 * a * k)))
    cv.alpha_composite(fade(_edge(GOLDC), 0.5 * a * k))


def _bolt(seed, x0, y0, x1, y1):
    rng = np.random.default_rng(seed); pts = [(x0, y0)]
    n = 9
    for i in range(1, n):
        f = i / n
        pts.append((x0 + (x1 - x0) * f + rng.uniform(-60, 60), y0 + (y1 - y0) * f + rng.uniform(-10, 10)))
    pts.append((x1, y1))
    return pts


def _inazuma(cv, t, fx):
    strikes = fx["marks"].get("strike", [])[:2]
    a = _env(t, fx["start"], fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    hx = [540, 610, 680, 750]; hy = 818                   # 保留の玉（4つ）
    d = ImageDraw.Draw(cv)
    d.rounded_rectangle((500, hy - 34, 790, hy + 34), 34, fill=(0, 0, 0, int(150 * a)))
    hit = any(t >= s for s in strikes)
    for i, x in enumerate(hx):
        col = (220, 30, 40) if (hit and i == 3) else (90, 150, 255)
        d.ellipse((x - 22, hy - 22, x + 22, hy + 22), fill=col + (int(255 * a),), outline=(255, 255, 255, int(200 * a)), width=3)
    for k, s in enumerate(strikes):
        tl = t - s
        if not 0 <= tl < 0.45:
            continue
        v = 1 - prog(tl, 0.1, 0.35)
        pts = _bolt(5 + k, 640 + (k * 80 - 40), -20, hx[3], hy - 22)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
        ld.line(pts, fill=(255, 40, 40, 255), width=16, joint="curve"); ld.line(pts, fill=(255, 235, 235, 255), width=5, joint="curve")
        g = lay.filter(ImageFilter.GaussianBlur(10))
        paste(cv, g, (0, 0), v); paste(cv, lay, (0, 0), v)
        if tl < 0.12:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 60, 60, int(110 * (1 - tl / 0.12)))))
        cv.alpha_composite(fade(_edge((255, 30, 30)), 0.7 * v))


def _door(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    if t < g:
        return
    close = ease_in_out(prog(t, g, 0.35))
    opn = ease_in_out(prog(t, fx["end"] - 0.7, 0.6))
    k = close * (1 - opn)
    if k <= 0:
        return
    if "doorL" not in _C:
        dw = W // 2
        L = Image.new("RGBA", (dw, H), (18, 16, 22, 255)); d = ImageDraw.Draw(L)
        for y in range(40, H, 120):
            d.rectangle((30, y, dw - 30, y + 80), outline=(70, 64, 80, 255), width=3)
        d.rectangle((dw - 14, 0, dw, H), fill=GOLDC + (255,))
        d.line((dw - 20, 0, dw - 20, H), fill=(120, 80, 10, 255), width=3)
        _C["doorL"] = L; _C["doorR"] = L.transpose(Image.FLIP_LEFT_RIGHT)
    L, R = _C["doorL"], _C["doorR"]
    cv.alpha_composite(L, (int(-L.width + L.width * k), 0))
    cv.alpha_composite(R, (int(W - R.width * k), 0))
    shut = g + 0.35
    if t >= shut and opn <= 0:
        p = math.exp(-(t - shut) / 0.3)
        d = ImageDraw.Draw(cv)
        d.rectangle((W / 2 - 3, 0, W / 2 + 3, H), fill=(255, 245, 200, int(255 * min(1, 0.4 + p))))
        cv.alpha_composite(fade(_edge(GOLDC), 0.6 * p))
        glow = ease_out(prog(t, shut + 0.6, 0.5))
        if glow > 0:                                       # 最終ジャッジ：合わせ目から光が漏れる
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
            ld.rectangle((W / 2 - 40 * glow, 0, W / 2 + 40 * glow, H), fill=(255, 235, 160, int(200 * glow)))
            cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(24)))


# ---------------------------------------------------------------- 牙狼回 v2：台ごとの演出（オリジナルの絵。実機の画面・顔・ロゴは描かない）
def _txt(text, size, color=(255, 255, 255), glow=GOLDC, weight="black"):
    """太字＋にじみ（キャッシュ）"""
    key = ("x", text, size, color, glow, weight)
    if key not in _C:
        f = ui.font(weight, size)
        w = int(ui.text_w(text, f)) + 120; h = int(size * 1.6)
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((w / 2, h / 2), text, font=f, fill=color + (255,), anchor="mm",
                                stroke_width=max(2, size // 22), stroke_fill=(40, 24, 0, 255))
        g = Image.new("RGBA", (w, h), glow + (0,)); g.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(max(6, size // 9))))
        _C[key] = (im, g)
    return _C[key]


def _put(cv, text, size, cx, cy, a, scale=1.0, color=(255, 255, 255), glow=GOLDC, glow_a=0.7, weight="black"):
    if a <= 0:
        return
    im, g = _txt(text, size, color, glow, weight)
    for x, al in ((g, glow_a * a), (im, a)):
        if abs(scale - 1) > 1e-3:
            x = x.resize((max(1, int(x.width * scale)), max(1, int(x.height * scale))), Image.BICUBIC)
        paste(cv, x, (cx - x.width / 2, cy - x.height / 2), al)


def _flash(cv, t, s, dur=0.14, color=(255, 250, 230), amt=140):
    if s is not None and s <= t < s + dur:
        cv.alpha_composite(Image.new("RGBA", (W, H), color + (int(amt * (1 - (t - s) / dur)),)))


def _bar(cv, x, y, w, h, frac, color, a, label=None, val=None):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((x, y, x + w, y + h), h // 2, fill=(10, 8, 6, int(200 * a)), outline=GOLDC + (int(220 * a),), width=3)
    if frac > 0.002:
        d.rounded_rectangle((x + 5, y + 5, x + 5 + (w - 10) * min(frac, 1), y + h - 5), (h - 10) // 2, fill=color + (int(255 * a),))
    cv.alpha_composite(lay)
    if label:
        _put(cv, label, 40, x - 120, y + h / 2, a, weight="bold", glow_a=0.4)
    if val:
        _put(cv, val, 54, x + w + 120, y + h / 2, a)


def _hane(cv, t, fx):
    """初代：羽根が開いて玉を拾い、Vへ → 魔戒チャンスのメーター 50%→82%"""
    a = _env(t, fx["start"], fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.45 * a)
    opens = fx["marks"].get("open", [])
    cx, cy = W / 2, 330
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((cx - 260, cy - 190, cx + 260, cy + 190), 30, fill=(20, 16, 10, int(210 * a)), outline=GOLDC + (int(255 * a),), width=4)
    ang = 0.0
    for o in opens:                                       # 開く→閉じるを2回ずつ
        if o <= t < o + 1.2:
            ang = max(ang, abs(math.sin((t - o) / 1.2 * 2 * math.pi * 2)))
    for side in (-1, 1):                                  # 羽根（付け根を軸に回る板）
        px, py = cx + side * 46, cy - 10
        phi = math.radians(8 + 58 * ang)                  # 閉じ＝ほぼ真上、開き＝外へ倒れる
        L = 120
        tip = (px + side * L * math.sin(phi), py - L * math.cos(phi))
        nx, ny = math.cos(phi) * 14, side * math.sin(phi) * 14      # 板の太さ
        d.polygon([(px - nx, py - ny), (px + nx, py + ny), (tip[0] + nx * 0.5, tip[1] + ny * 0.5), (tip[0] - nx * 0.5, tip[1] - ny * 0.5)],
                  fill=GOLDC + (int(255 * a),), outline=(120, 80, 10, int(255 * a)))
        d.ellipse((px - 12, py - 12, px + 12, py + 12), fill=(140, 90, 20, int(255 * a)))
    d.polygon([(cx - 40, cy + 120), (cx + 40, cy + 120), (cx, cy + 165)], fill=(255, 230, 120, int(255 * a)))   # V入賞口
    v = _m(fx, "v")
    if v is not None and v <= t < v + 0.9:                # 玉がVに落ちる
        k = ease_in_out(prog(t, v, 0.7))
        by = cy - 150 + 270 * k
        d.ellipse((cx - 16, by - 16, cx + 16, by + 16), fill=(235, 238, 245, int(255 * a)), outline=(120, 120, 130, int(255 * a)), width=2)
    cv.alpha_composite(lay)
    _put(cv, "V", 44, cx, cy + 135, a, color=(40, 20, 0), glow=(255, 240, 180))
    if v is not None:
        _flash(cv, t, v + 0.7, 0.2, (255, 235, 150), 90)
    p50, p82 = _m(fx, "p50"), _m(fx, "p82")
    if p50 is not None and t >= p50 - 0.1:
        f = 0.5 * ease_out(prog(t, p50, 0.5))
        if p82 is not None and t >= p82:
            f = 0.5 + 0.32 * ease_out(prog(t, p82, 0.7))
        lab = "継続" if (p82 is not None and t >= p82) else "突入"
        val = f"{round(f * 100)}%"
        _bar(cv, cx - 380, 600, 760, 56, f, (255, 190, 50), a * ease_out(prog(t, p50 - 0.1, 0.3)), lab, val)


def _battle(cv, t, fx):
    """閃騎鋼：1stバトル。弱攻撃82%・強攻撃13%のゲージ"""
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.45 * a)
    _put(cv, "1st BATTLE", 96, W / 2, 230, a * ease_out(prog(t, g, 0.3)), 1 + 0.25 * (1 - ease_out(prog(t, g, 0.18))), glow=(255, 120, 40))
    _flash(cv, t, g, 0.12)
    wk, st = _m(fx, "weak"), _m(fx, "strong")
    if wk is not None and t >= wk - 0.05:
        _bar(cv, W / 2 - 330, 380, 660, 64, 0.82 * ease_out(prog(t, wk, 0.6)), (90, 210, 255), a, "弱", "82%")
    if st is not None and t >= st - 0.05:
        _bar(cv, W / 2 - 330, 500, 660, 64, 0.13 * ease_out(prog(t, st, 0.3)), (230, 40, 40), a, "強", "13%")
        _flash(cv, t, st, 0.18, (255, 60, 50), 120)
        if t < st + 0.6:
            cv.alpha_composite(fade(_edge((255, 30, 30)), 0.7 * (1 - prog(t, st, 0.6)) * a))


def _shingeki(cv, t, fx):
    """FINAL：震撃。左下から衝撃の輪が広がり、画面が揺れる"""
    hits = (fx["marks"].get("go", []) + fx["marks"].get("don", []))[:3]
    a = _env(t, fx["start"], fx["end"], 0.2, 0.4)
    if a <= 0 or not hits:
        return
    for s in hits:
        tl = t - s
        if not 0 <= tl < 1.1:
            continue
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
        for i in range(3):
            r = 120 + 1900 * ease_out(prog(tl, 0.08 * i, 0.9))
            al = int(220 * (1 - prog(tl, 0.08 * i, 1.0)) * a)
            ld.ellipse((60 - r, H - 60 - r, 60 + r, H - 60 + r), outline=(255, 200, 90, al), width=int(22 - 5 * i))
        cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(3)))
        if tl < 0.1:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 240, 200, int(120 * (1 - tl / 0.1)))))
        cv.alpha_composite(fade(_edge(GOLDC), 0.6 * (1 - prog(tl, 0, 1.0)) * a))
    g = hits[0]
    if t >= g:
        _put(cv, "震撃", 150, W / 2, 330, a * (1 - prog(t, g + 1.6, 0.5)), 1 + 0.3 * (1 - ease_out(prog(t, g, 0.15))), glow=(255, 120, 30))


def _emblem_color(color):
    key = ("embc", color)
    if key not in _C:
        lay = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
        for im, _ in _emblem():
            lay.alpha_composite(im)
        c = Image.new("RGBA", lay.size, color + (0,)); c.putalpha(lay.getchannel("A"))
        _C[key] = (lay, c)
    return _C[key]


def _nanairo(cv, t, fx):
    """魔戒ノ花：顔の枠が一瞬で組み上がり、7色に光る"""
    g = _m(fx, "go", default=fx["start"] + 0.3)
    if t < g - 0.05:
        return
    out = 1 - ease_in_out(prog(t, fx["end"], 0.5))
    _black(cv, 0.5 * min(1, prog(t, g - 0.05, 0.15)) * out)
    lay = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    ImageDraw.Draw(lay).regular_polygon((300, 300, 184), 6, fill=(30, 20, 5, 170))
    for i, (im, am) in enumerate(_emblem()):              # 最速：全部が0.15秒で集まる
        k = ease_out(prog(t, g + 0.02 * i, 0.15))
        tmp = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
        tmp.paste(im, (int((1 - k) * 380 * math.cos(am)), int((1 - k) * 380 * math.sin(am))), im)
        lay.alpha_composite(ui.fade(tmp, k))
    done = g + 0.25
    _flash(cv, t, done, 0.12)
    c0 = _m(fx, "color")
    glow_col = GOLDC
    if c0 is not None and t >= c0:
        h = ((t - c0) * 0.9) % 1.0
        glow_col = tuple(int(255 * v) for v in colorsys.hsv_to_rgb(h, 0.75, 1.0))
        q = int(h * 12) / 12                                # 色を少しずつ（キャッシュ用に12段）
        _, col = _emblem_color(tuple(int(255 * v) for v in colorsys.hsv_to_rgb(q, 0.55, 1.0)))
        lay.alpha_composite(ui.fade(col, 0.55))
    glow = Image.new("RGBA", lay.size, glow_col + (0,)); glow.putalpha(lay.getchannel("A").filter(ImageFilter.GaussianBlur(20)))
    paste(cv, glow, (W / 2 - 300, 30), 0.9 * out)
    paste(cv, lay, (W / 2 - 300, 30), out)
    if t >= done:
        _rays(cv, W / 2, 330, (0.35 + 0.35 * math.sin(t * 6) ** 2) * out, glow_col, 28, 230, 900)


def _yami(cv, t, fx):
    """闇を照らす者：暗い画面に光が差して、台が浮かび上がる"""
    s = fx["start"]
    li, bk = _m(fx, "light", default=s + 1.5), _m(fx, "back")
    end = bk + 0.6 if bk is not None else fx["end"]
    if t > end + 0.8:
        return
    dark = min(1, prog(t, s - 0.15, 0.25)) * (1 - ease_in_out(prog(t, end, 0.8)))
    if dark <= 0:
        return
    r = 0 if t < li else 40 + 900 * ease_out(prog(t, li, 1.4))
    key = ("yami", int(r // 20))
    if key not in _C:
        lw, lh = 480, 270; sc = W / lw
        yy, xx = np.mgrid[0:lh, 0:lw].astype(np.float32)
        cx, cy = 520 / sc, 500 / sc                       # 台の写真のあたり
        dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) * sc
        rr = (r // 20) * 20
        al = np.clip((dist - rr) / 260 + 0.0, 0, 1) if rr > 0 else np.ones_like(dist)
        arr = np.zeros((lh, lw, 4), np.uint8); arr[..., 3] = (al * 245).astype(np.uint8)
        _C[key] = Image.fromarray(arr, "RGBA").resize((W, H), Image.BICUBIC)
    paste(cv, _C[key], (0, 0), dark)
    if t >= li:
        k = math.exp(-(t - li) / 0.8) * dark
        _rays(cv, 520, 500, 0.6 * k, (255, 240, 190), 20, 60, 700)


def _tokei(cv, t, fx):
    """冴島鋼牙XX：変動が長い。針がのろのろ回る時計"""
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    cx, cy, R = W / 2, 320, 170
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.ellipse((cx - R - 10, cy - R - 10, cx + R + 10, cy + R + 10), fill=(10, 10, 14, int(200 * a)))
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(245, 240, 225, int(240 * a)), outline=GOLDC + (int(255 * a),), width=8)
    for i in range(12):
        an = i / 12 * 2 * math.pi
        r0 = R - (28 if i % 3 == 0 else 16)
        d.line((cx + r0 * math.sin(an), cy - r0 * math.cos(an), cx + (R - 6) * math.sin(an), cy - (R - 6) * math.cos(an)),
               fill=(40, 30, 20, int(255 * a)), width=6 if i % 3 == 0 else 3)
    el = max(0.0, t - g)
    step = math.floor(el / 1.0)                          # 1秒に1目盛り、カクッと進む
    frac = ease_out(min(1, (el - step) / 0.12))
    an = (step + frac) / 60 * 2 * math.pi
    d.line((cx, cy, cx + (R - 30) * math.sin(an), cy - (R - 30) * math.cos(an)), fill=(200, 30, 30, int(255 * a)), width=7)
    d.line((cx, cy, cx + (R - 80) * math.sin(an / 12), cy - (R - 80) * math.cos(an / 12)), fill=(30, 30, 30, int(255 * a)), width=10)
    d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=GOLDC + (int(255 * a),))
    cv.alpha_composite(lay)
    dots = "・" * (1 + int(el * 1.5) % 3)
    _put(cv, "変動中" + dots, 52, cx, cy + R + 60, a, weight="bold", glow_a=0.3)


def _byousoku(cv, t, fx):
    """真・牙狼：秒速。集中線と、高速で回る数字"""
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.15, 0.5)
    if a <= 0:
        return
    rng = np.random.default_rng(int(t * 30))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    for i in range(70):                                   # 集中線（毎フレーム少しずつ変える）
        an = rng.uniform(0, 2 * math.pi); r0 = rng.uniform(330, 520); w = rng.uniform(0.004, 0.012)
        ld.polygon([(W / 2 + r0 * math.cos(an - w), 420 + r0 * math.sin(an - w)), (W / 2 + 1400 * math.cos(an), 420 + 1400 * math.sin(an)),
                    (W / 2 + r0 * math.cos(an + w), 420 + r0 * math.sin(an + w))], fill=(255, 255, 255, 190))
    paste(cv, lay, (0, 0), a)
    k = _m(fx, "kore")
    stop = k if k is not None else fx["end"] - 0.6
    for i in range(3):
        x = W / 2 + (i - 1) * 190
        box = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(box).rounded_rectangle((x - 80, 250, x + 80, 450), 18, fill=(15, 12, 8, int(225 * a)), outline=GOLDC + (int(255 * a),), width=4)
        cv.alpha_composite(box)
        st = stop + 0.12 * i
        if t < st:
            n = int(t * 40 + i * 3) % 10
            for dy, al in ((-40, 0.25), (0, 0.85), (40, 0.25)):     # 縦にぶれた数字（高速回転）
                _put(cv, str((n + (dy > 0) - (dy < 0)) % 10), 140, x, 350 + dy, a * al, 1.0, glow_a=0.15)
        else:
            _put(cv, "7", 150, x, 350, a, 1 + 0.25 * (1 - ease_out(prog(t, st, 0.15))), color=(255, 230, 120))
    _flash(cv, t, stop + 0.24, 0.15)
    _put(cv, "秒速", 92, W / 2, 560, a * ease_out(prog(t, g, 0.25)), 1 + 0.2 * (1 - ease_out(prog(t, g, 0.2))), glow=(255, 150, 40))


def _kasane(cv, t, fx):
    """月虹ノ旅人：今回の 50%・81% と、初代の 50%・82% が並んで重なる"""
    nw, old = _m(fx, "now", default=fx["start"]), _m(fx, "old")
    a = _env(t, nw - 0.1, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.4 * a)
    meet = (old + 1.2) if old is not None else None
    m = ease_in_out(prog(t, meet, 0.5)) if meet is not None else 0

    def panel(x, year, spec, al, col):
        box = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(box).rounded_rectangle((x - 250, 250, x + 250, 520), 24, fill=(12, 10, 6, int(220 * al)), outline=col + (int(255 * al),), width=5)
        cv.alpha_composite(box)
        _put(cv, year, 54, x, 310, al, weight="bold", glow_a=0.3)
        _put(cv, spec, 74, x, 430, al, color=(255, 236, 170))
    xr = W / 2 + 290 * (1 - m); xl = W / 2 - 290 * (1 - m)
    panel(xr, "2021 月虹ノ旅人", "50%・81%", a * ease_out(prog(t, nw, 0.3)) * (1 - m), (120, 200, 255))
    if old is not None and t >= old - 0.05:
        panel(xl, "2008 初代", "50%・82%", a * ease_out(prog(t, old, 0.3)), GOLDC)
    if meet is not None and t >= meet + 0.5:
        _flash(cv, t, meet + 0.5, 0.16)
        p = math.exp(-(t - meet - 0.5) / 0.6)
        _rays(cv, W / 2, 385, p * a, GOLDC, 26, 260, 900)
        _put(cv, "ほぼ同じ", 70, W / 2, 600, a * ease_out(prog(t, meet + 0.5, 0.25)), glow=(255, 150, 40))


def _vlight(cv, t, fx):
    """牙狼11：枠を光の線がなぞる"""
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g, fx["end"] + 0.4, 0.05, 0.6)
    if a <= 0:
        return
    k = ease_in_out(prog(t, g, 1.1))
    per = 2 * (W + H)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)

    def pt(s):                                             # 上の中央から時計回り
        s = (s + W / 2) % per
        if s < W: return (s, 8)
        s -= W
        if s < H: return (W - 8, s)
        s -= H
        if s < W: return (W - s, H - 8)
        return (8, H - (s - W))
    for side in (1, -1):                                   # 左右に分かれて走り、下で出会う
        pts = [pt(side * per / 2 * k * i / 40) for i in range(41)]
        ld.line(pts, fill=(255, 245, 210, 255), width=10, joint="curve")
        hx, hy = pts[-1]
        ld.ellipse((hx - 22, hy - 22, hx + 22, hy + 22), fill=(255, 255, 255, 255))
    g2 = lay.filter(ImageFilter.GaussianBlur(14))
    tint = Image.new("RGBA", (W, H), GOLDC + (0,)); tint.putalpha(g2.getchannel("A"))
    paste(cv, tint, (0, 0), a); paste(cv, lay, (0, 0), a)
    if k >= 1:
        cv.alpha_composite(fade(_edge(GOLDC), 0.5 * a * math.exp(-(t - g - 1.1) / 0.8)))


def _count3000(cv, t, fx):
    """3000LT：0→3000のカウントアップ"""
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.2, 0.5)
    if a <= 0:
        return
    _black(cv, 0.4 * a)
    k = ease_out(prog(t, g, 1.3))
    n = int(round(3000 * k / 10) * 10)
    done = g + 1.3
    s = 1 + 0.2 * math.exp(-(t - done) / 0.2) if t >= done else 1.0
    _put(cv, f"{n:,}", 210, W / 2, 360, a, s, color=(255, 236, 160))
    _put(cv, "個", 90, W / 2 + 390, 400, a * k, color=(255, 236, 160))
    if t >= done:
        _flash(cv, t, done, 0.14)
        _rays(cv, W / 2, 360, math.exp(-(t - done) / 0.6) * a, GOLDC, 30, 200, 1000)
        cv.alpha_composite(fade(_edge(GOLDC), 0.6 * math.exp(-(t - done) / 0.8) * a))


def _kyokugen(cv, t, fx):
    """牙狼12：極限7500バトル。1500と7500がせめぎ合って7500で止まる"""
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.25, 0.5)
    if a <= 0:
        return
    _black(cv, 0.5 * a)
    win, lose = _m(fx, "win"), _m(fx, "lose")
    stop = win if win is not None else g + 2.0
    _put(cv, "極限バトル", 84, W / 2, 200, a * ease_out(prog(t, g, 0.25)), glow=(255, 80, 40))
    if t < stop:
        sel = int((t - g) * (10 - 6 * prog(t, g, stop - g))) % 2     # だんだん遅くなる
    else:
        sel = 1
    for i, (txt, x) in enumerate((("1500", W / 2 - 300), ("7500", W / 2 + 300))):
        on = (sel == i)
        col = (255, 236, 160) if on else (150, 140, 120)
        sc = 1.0 + (0.12 if on else 0)
        if t >= stop and i == 1:
            sc = 1.25 + 0.2 * math.exp(-(t - stop) / 0.2)
        al = a * (1.0 if on or t < stop else 0.35)
        _put(cv, txt, 150, x, 400, al, sc, color=col, glow=(255, 160, 40) if on else (60, 60, 60), glow_a=0.8 if on else 0.2)
    _put(cv, "VS", 70, W / 2, 400, a * (1 if t < stop else 0.3), glow=(255, 60, 40))
    if t >= stop:
        _flash(cv, t, stop, 0.15)
        _rays(cv, W / 2 + 300, 400, math.exp(-(t - stop) / 0.6) * a, GOLDC, 26, 180, 900)
    if lose is not None and t >= lose:
        _put(cv, "勝てば7500 ／ 負けても1500　約50%", 52, W / 2, 600, a * ease_out(prog(t, lose, 0.3)), weight="bold", glow_a=0.3)


def _burst(cv, t, fx):
    """魔戒BURST：画面が中心から弾ける"""
    g = _m(fx, "go", default=fx["start"])
    if t < g - 0.3:
        return
    a = _env(t, g - 0.3, fx["end"], 0.3, 0.5)
    tl = t - g
    if tl < 0:                                             # 弾ける直前に光が集まる
        k = ease_in_out(prog(tl, -0.3, 0.3))
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); r = 160 * (1 - k) + 10
        ImageDraw.Draw(lay).ellipse((W / 2 - r, 380 - r, W / 2 + r, 380 + r), outline=(255, 240, 200, int(220 * k)), width=6)
        cv.alpha_composite(lay)
        return
    _flash(cv, t, g, 0.18, (255, 255, 255), 200)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    rng = np.random.default_rng(11)
    for i in range(48):                                    # 破片
        an = rng.uniform(0, 2 * math.pi); sp = rng.uniform(600, 1600); sz = rng.uniform(10, 34)
        r = sp * ease_out(min(1, tl / 1.2))
        x, y = W / 2 + r * math.cos(an), 380 + r * math.sin(an)
        col = (255, 60, 50) if i % 3 == 0 else GOLDC
        al = int(255 * a * (1 - prog(tl, 0.6, 0.8)))
        ld.polygon([(x + sz * math.cos(an + q), y + sz * math.sin(an + q)) for q in (0, 2.2, 4.0)], fill=col + (al,))
    for i in range(2):                                     # 衝撃の輪
        r = 60 + 1300 * ease_out(prog(tl, 0.1 * i, 0.8))
        ld.ellipse((W / 2 - r, 380 - r, W / 2 + r, 380 + r), outline=(255, 120, 60, int(230 * a * (1 - prog(tl, 0.1 * i, 0.8)))), width=18 - 6 * i)
    cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.5)))
    _put(cv, "BURST", 170, W / 2, 380, a * (1 - prog(tl, 1.6, 0.5)), 1 + 0.35 * (1 - ease_out(prog(tl, 0, 0.18))), glow=(255, 70, 40))
    cv.alpha_composite(fade(_edge((255, 60, 40)), 0.6 * a * math.exp(-tl / 0.7)))


# ---------------------------------------------------------------- 顔の役物（F.O.G.）の組み上がり：作り込み版
# 顔そのものは描かない（キャラクターのデザインのため）。金属の部品が集まり、刃が開き、ギアが噛み合って光る「仕掛け」を見せる
FOG_S = 860                     # 部品を描く正方形の大きさ
FOG_LOCK = 1.25                 # go から何秒で噛み合うか（等速のとき）


def _metal(mask, base=(255, 200, 70), seed=0):
    """形（L）に金属の色をのせる：縦の帯のグラデ＋縁の明るい線と暗い影"""
    w, h = mask.size
    yy = np.linspace(0, 1, h)[:, None] * np.ones((1, w))
    xx = np.ones((h, 1)) * np.linspace(0, 1, w)[None, :]
    band = 0.55 + 0.45 * np.sin((yy * 5.0 + xx * 1.7 + seed * 0.37) * math.pi) ** 2
    rgb = np.dstack([np.clip(c * band * 1.08, 0, 255) for c in base])
    m = np.asarray(mask, np.float32) / 255
    hi = np.clip(m - np.roll(np.roll(m, 3, 0), 3, 1), 0, 1)          # 左上の縁＝光
    lo = np.clip(m - np.roll(np.roll(m, -3, 0), -3, 1), 0, 1)        # 右下の縁＝影
    rgb = rgb + hi[..., None] * 120 - lo[..., None] * 110
    out = np.dstack([np.clip(rgb, 0, 255), m * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _fog_parts():
    if "fog2" in _C:
        return _C["fog2"]
    S = FOG_S; c = S / 2
    P = {}
    # 刃（12枚）：外向きの細長い刃。付け根を (c, c) からの距離 r0 に置いた「上向き」1枚を作り、回して使う
    m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
    r0, r1 = 250, 410
    d.polygon([(c - 26, c - r0), (c + 26, c - r0), (c + 10, c - r1 + 40), (c, c - r1), (c - 10, c - r1 + 40)], fill=255)
    d.polygon([(c - 26, c - r0), (c - 46, c - r0 - 60), (c - 18, c - r0 - 30)], fill=255)        # 返し
    d.polygon([(c + 26, c - r0), (c + 46, c - r0 - 60), (c + 18, c - r0 - 30)], fill=255)
    P["blade"] = _metal(m, (255, 214, 110), 1)
    # 装甲（6枚）：太い六角の帯を6つに割ったもの
    P["plates"] = []
    for k in range(6):
        m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
        a0, a1 = math.pi / 3 * k - math.pi / 2, math.pi / 3 * (k + 1) - math.pi / 2
        R, Ri = 255, 180
        pts = [(c + R * math.cos(a0), c + R * math.sin(a0)), (c + R * math.cos(a1), c + R * math.sin(a1)),
               (c + Ri * math.cos(a1), c + Ri * math.sin(a1)), (c + Ri * math.cos(a0), c + Ri * math.sin(a0))]
        d.polygon(pts, fill=255)
        am = (a0 + a1) / 2
        for q in (-0.3, 0.3):                                            # 鋲
            x, y = c + 212 * math.cos(am + q), c + 212 * math.sin(am + q)
            d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=0)
        im = _metal(m, (255, 196, 60), k)
        dd = ImageDraw.Draw(im)
        for q in (-0.3, 0.3):
            x, y = c + 212 * math.cos(am + q), c + 212 * math.sin(am + q)
            dd.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(255, 245, 200, 255), outline=(110, 70, 10, 255), width=2)
        P["plates"].append((im, am))
    # ギア（歯つきの輪）
    m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
    d.ellipse((c - 150, c - 150, c + 150, c + 150), fill=255); d.ellipse((c - 106, c - 106, c + 106, c + 106), fill=0)
    for i in range(20):
        a = i / 20 * 2 * math.pi; w = 0.08
        d.polygon([(c + 146 * math.cos(a - w), c + 146 * math.sin(a - w)), (c + 170 * math.cos(a - w * 0.6), c + 170 * math.sin(a - w * 0.6)),
                   (c + 170 * math.cos(a + w * 0.6), c + 170 * math.sin(a + w * 0.6)), (c + 146 * math.cos(a + w), c + 146 * math.sin(a + w))], fill=255)
    for i in range(6):                                                   # 輪の中の窓（回っているのが分かる目印）
        a = i / 6 * 2 * math.pi
        d.ellipse((c + 128 * math.cos(a) - 10, c + 128 * math.sin(a) - 10, c + 128 * math.cos(a) + 10, c + 128 * math.sin(a) + 10), fill=0)
    P["gear"] = _metal(m, (230, 180, 70), 3)
    # 芯：暗い六角の台座＋赤い宝石
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(core)
    d.regular_polygon((c, c, 100), 6, rotation=30, fill=(28, 18, 6, 255), outline=(150, 100, 20, 255))
    d.regular_polygon((c, c, 82), 6, rotation=30, outline=(90, 60, 15, 255))
    gem = Image.new("L", (S, S), 0); ImageDraw.Draw(gem).polygon([(c, c - 58), (c + 38, c), (c, c + 58), (c - 38, c)], fill=255)
    core.alpha_composite(_metal(gem, (255, 70, 50), 5))
    P["core"] = core
    # 光の帯（斜め）
    band = Image.new("L", (S, S), 0); ImageDraw.Draw(band).polygon([(0, 0), (90, 0), (90 + S, S), (S, S)], fill=255)
    P["band"] = band.filter(ImageFilter.GaussianBlur(22))
    _C["fog2"] = P
    return P


def _fog_draw(cv, t, g, cy, out, speed=1.0, tint=None, pulses=()):
    """g＝組み上がりの開始。speed＞1で速く組み上がる。tint(時刻)→RGB で色を重ねる（7色用）"""
    P = _fog_parts(); S = FOG_S; c = S / 2
    tl = (t - g) * speed
    lock = FOG_LOCK
    lay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # 1) 芯：小さい光の点から開く
    k = ease_out(prog(tl, 0.0, 0.3))
    if k > 0:
        im = P["core"] if k >= 1 else P["core"].resize((max(1, int(S * k)), max(1, int(S * k))), Image.BICUBIC)
        lay.alpha_composite(im, (int(c - im.width / 2), int(c - im.height / 2)))
    # 3) 装甲：外から順に飛んできてはまる
    for i, (im, am) in enumerate(P["plates"]):
        k = ease_out(prog(tl, 0.15 + 0.07 * i, 0.4))
        if k <= 0:
            continue
        dist = (1 - k) * 520
        tmp = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        tmp.paste(im, (int(dist * math.cos(am)), int(dist * math.sin(am))), im)
        lay.alpha_composite(ui.fade(tmp, min(1, k * 1.5)))
    # 2) ギア：速く回って、噛み合う瞬間にピタッと止まる
    if tl >= 0.05:
        if tl < lock:
            ang = 720 * (1 - (1 - tl / lock) ** 2)                      # だんだん遅く
        else:
            ang = 720 + 4 * math.exp(-(tl - lock) / 0.08) * math.sin((tl - lock) * 60)   # 止まった反動
        gk = ease_out(prog(tl, 0.05, 0.25))
        lay.alpha_composite(ui.fade(P["gear"].rotate(-ang, Image.BICUBIC), gk))
    # 4) 刃：12枚が、畳まれた向きから外へ開く
    for i in range(12):
        k = ease_out(prog(tl, 0.55 + 0.035 * i, 0.4))
        if k <= 0:
            continue
        base = i * 30
        fold = (1 - k) * 80 * (1 if i % 2 else -1)
        bl = P["blade"]
        if k < 1:
            sc = 0.6 + 0.4 * k
            bl = bl.resize((int(S * sc), int(S * sc)), Image.BICUBIC)
            tmp = Image.new("RGBA", (S, S), (0, 0, 0, 0)); tmp.alpha_composite(bl, (int(c - bl.width / 2), int(c - bl.height / 2))); bl = tmp
        rb = bl.rotate(-(base + fold), Image.BICUBIC)
        lay.alpha_composite(ui.fade(rb, min(1, k * 1.6)), (0, 0))
    # 5) 色を重ねる（7色）
    if tint is not None:
        col = Image.new("RGBA", (S, S), tint + (0,)); col.putalpha(lay.getchannel("A").point(lambda v: int(v * 0.5)))
        lay.alpha_composite(col)
    # 6) 光の帯：噛み合ってから、1.6秒ごとに斜めに走る
    if tl >= lock:
        ph = ((tl - lock) % 1.6) / 1.6
        sh = int(-S + ph * 2.2 * S)
        band = Image.new("L", (S, S), 0); band.paste(P["band"], (sh, 0))
        a = np.minimum(np.asarray(band, np.float32), np.asarray(lay.getchannel("A"), np.float32)) * 0.75
        hl = Image.new("RGBA", (S, S), (255, 252, 235, 0)); hl.putalpha(Image.fromarray(a.astype(np.uint8)))
        lay.alpha_composite(hl)
    # にじみ
    gcol = tint if tint is not None else GOLDC
    p = _pulse(t, [g + lock / speed] + list(pulses), 0.35)
    glow = Image.new("RGBA", (S, S), gcol + (0,)); glow.putalpha(lay.getchannel("A").filter(ImageFilter.GaussianBlur(26)))
    x0, y0 = W / 2 - S / 2, cy - S / 2
    paste(cv, glow, (x0, y0), (0.45 + 0.55 * p) * out)
    paste(cv, lay, (x0, y0), out)
    # 7) 噛み合った瞬間：白い光・衝撃の輪・火花
    tk = t - (g + lock / speed)
    if tk >= 0:
        if tk < 0.14:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 250, 225, int(170 * (1 - tk / 0.14) * out))))
        if tk < 0.9:
            ring = Image.new("RGBA", (W, H), (0, 0, 0, 0)); rd = ImageDraw.Draw(ring)
            r = 260 + 900 * ease_out(prog(tk, 0, 0.9))
            rd.ellipse((W / 2 - r, cy - r, W / 2 + r, cy + r), outline=gcol + (int(230 * (1 - tk / 0.9) * out),), width=14)
            cv.alpha_composite(ring.filter(ImageFilter.GaussianBlur(3)))
        if tk < 1.2:
            sp = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sp)
            rng = np.random.default_rng(17)
            for i in range(60):
                an = rng.uniform(0, 2 * math.pi); v = rng.uniform(500, 1300); ln = rng.uniform(16, 40)
                r = 200 + v * tk; fall = 260 * tk * tk
                x, y = W / 2 + r * math.cos(an), cy + r * math.sin(an) + fall
                al = int(255 * (1 - tk / 1.2) * out)
                sd.line((x, y, x - ln * math.cos(an), y - ln * math.sin(an)), fill=(255, 235, 160, al), width=4)
            cv.alpha_composite(sp)
        _rays(cv, W / 2, cy, p * out, gcol, 28, 300, 1000)
        cv.alpha_composite(fade(_edge(gcol), 0.55 * p * out))


def _fog2(cv, t, fx):
    g = _m(fx, "go", default=fx["start"] + 0.3)
    pre = g - 0.6
    if t < pre:
        return
    out = 1 - ease_in_out(prog(t, fx["end"], 0.5))
    _black(cv, 0.62 * min(1, prog(t, pre, 0.35)) * out)
    if t < g + 0.2:                                                      # 組み上がる前：金の粒が中心へ集まる
        sp = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sp)
        rng = np.random.default_rng(9)
        k = prog(t, pre, 0.8)
        for i in range(70):
            an = rng.uniform(0, 2 * math.pi); r = rng.uniform(300, 900) * (1 - ease_in_out(k))
            x, y = W / 2 + r * math.cos(an), 400 + r * math.sin(an)
            s = rng.uniform(2, 5)
            sd.ellipse((x - s, y - s, x + s, y + s), fill=(255, 225, 140, int(230 * min(1, k * 3))))
        cv.alpha_composite(sp)
    _fog_draw(cv, t, g, 400, out, 1.0, None, fx["marks"].get("pulse", []))


def _nanairo2(cv, t, fx):
    g = _m(fx, "go", default=fx["start"] + 0.3)
    if t < g - 0.05:
        return
    out = 1 - ease_in_out(prog(t, fx["end"], 0.5))
    _black(cv, 0.6 * min(1, prog(t, g - 0.05, 0.15)) * out)
    c0 = _m(fx, "color")
    tint = None
    if c0 is not None and t >= c0:
        q = int(((t - c0) * 0.9 % 1.0) * 12) / 12
        tint = tuple(int(255 * v) for v in colorsys.hsv_to_rgb(q, 0.8, 1.0))
    _fog_draw(cv, t, g, 400, out, 3.5, tint)                             # シリーズ最速：3.5倍の速さで組み上がる


DRAW = {"garo_ken": _garo_ken, "fog": _fog2, "konjiki": _konjiki, "inazuma": _inazuma, "door": _door,
        "bousou": _bousou, "flame": _flame, "knife": _knife, "yari": _yari, "kourin": _kourin, "omedetou": _omedetou,
        "lever": _lever, "rebabu": _rebabu, "honeycomb": _honeycomb, "emergency": _emergency, "spiral": _spiral,
        "beat": _beat, "hane": _hane, "battle": _battle, "shingeki": _shingeki, "nanairo": _nanairo2, "yami": _yami,
        "tokei": _tokei, "byousoku": _byousoku, "kasane": _kasane, "vlight": _vlight, "count3000": _count3000,
        "kyokugen": _kyokugen, "burst": _burst}


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
