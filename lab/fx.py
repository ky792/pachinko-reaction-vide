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
    # 牙狼回 v3（栄光・転落・復活）：章の切り替えの演出。実機の再現ではないので注釈は出さない（NO_NOTE）
    "tenraku": {"span": 2, "marks": {"go": ["転落"]}},
    "fukkatsu": {"span": 2, "marks": {"go": ["100万"]}},
}
NO_NOTE = {"tenraku", "fukkatsu"}


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
        add(st - 0.65, "piko", 0.10); add(st - 0.22, "shu", 0.24); add(st, "impact", 0.34); add(st, "rumble", 0.22)
        st2 = fx["marks"].get("stab", [])[1:2]
        for x in st2:
            add(x, "flame", 0.22)
        add(_m(fx, "push"), "don", 0.3); add(_m(fx, "push"), "impact", 0.2)
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
    elif k == "tenraku":
        g = _m(fx, "go", default=s0); add(g, "impact", 0.22); add(g + 0.1, "rumble", 0.2)
    elif k == "fukkatsu":
        g = _m(fx, "go", default=s0); add(g - 0.25, "shu", 0.18); add(g, "don", 0.32); add(g + 0.05, "impact", 0.24)

    bgm = FX[k].get("bgm")
    if bgm:
        mode, mark = bgm.split(":")
        at = _m(fx, mark, default=s0)
        scene["bgm_track"].append({"t": at, "level": 0.0 if mode == "cut" else 0.3, "dur": 0.15 if mode == "cut" else 0.4})
        scene["bgm_track"].append({"t": round(end + 0.2, 3), "level": 1.0, "dur": 0.9})
    scene["fx"].append(fx)


# ---------------------------------------------------------------- 効果音（その場で合成・著作権フリー）
LAB_SE = ("heartbeat", "clap", "alarm", "rumble", "rumble_long", "tick", "flame", "type", "boot", "blip", "puff", "zap")


_TYPE_N = [0]


def time_seed():
    """打鍵音の高さを1回ごとにずらす（毎回同じ順番なので書き出し結果は変わらない）"""
    _TYPE_N[0] += 1
    return _TYPE_N[0] * 0.137


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
    if kind == "type":        # キーボードの打鍵：短いクリック＋少しのノイズ（毎回少し高さを変える）
        n = int(0.035 * SR); t = np.arange(n) / SR
        f = float(np.random.default_rng(int(time_seed() * 1000) % 9973).uniform(1500, 2300))
        x = np.sign(np.sin(2 * np.pi * f * t)) * 0.4 + np.random.default_rng(11).standard_normal(n) * 0.25
        return (x * np.exp(-t / 0.006)).astype(np.float32)
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
    if kind == "boot":        # 発明品の起動：キュイーンと上がる音＋ピピッ（lab/invention.py）
        n = int(1.25 * SR); t = np.arange(n) / SR
        f = 260 + 1300 * np.clip(t / 0.85, 0, 1) ** 1.6
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.45 + 0.18 * np.sign(np.sin(2 * np.pi * np.cumsum(f * 2) / SR))
        x *= np.minimum(1, t / 0.03) * np.clip((0.95 - t) / 0.12, 0, 1)
        for b0 in (1.0, 1.12):
            m = (t >= b0) & (t < b0 + 0.07)
            x[m] += np.sign(np.sin(2 * np.pi * 1760 * (t[m] - b0))) * 0.3
        return x.astype(np.float32)
    if kind == "blip":        # 解析結果の段が出る：短い2音のピコッ
        n = int(0.16 * SR); t = np.arange(n) / SR
        f = np.where(t < 0.07, 1320, 1760)
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-((t % 0.08) / 0.05)) * 0.5).astype(np.float32)
    if kind == "zap":         # バチバチ：短い電気のノイズを3回
        n = int(0.9 * SR); t = np.arange(n) / SR
        x = np.zeros(n, np.float32)
        for b0 in (0.0, 0.15, 0.32):
            m = (t >= b0) & (t < b0 + 0.1)
            x[m] = (rng.standard_normal(m.sum()) * np.sign(np.sin(2 * np.pi * 120 * t[m]))) * 0.5
        return x.astype(np.float32)
    if kind == "puff":        # 煙がポフッ：柔らかいノイズ
        n = int(0.7 * SR); t = np.arange(n) / SR
        x = rng.standard_normal(n)
        for _ in range(4):
            x = np.convolve(x, np.ones(16) / 16, mode="same")
        x *= np.minimum(1, t / 0.04) * np.exp(-t / 0.22) * 4.0
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
        names = {"garo_ken": (("stab", 0.4), ("push", 0.3)), "door": (("go", 0.25),), "shingeki": (("go", 0.6), ("don", 0.6)),
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
    # 狼の顔（オリジナルの紋章）：左右に割った2枚と、目
    def mir(pts):
        return pts + [(-x, y) for x, y in reversed(pts)]
    head = [(0, -125), (-58, -112), (-128, -205), (-152, -66), (-170, 6), (-200, 58), (-156, 66), (-176, 112), (-104, 134),
            (-120, 168), (-58, 160), (-30, 196), (0, 205)]
    m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
    d.polygon([(c + x, c + y) for x, y in mir(head)], fill=255)
    for sx in (-1, 1):                                                   # 彫り（暗い溝）
        d.polygon([(c + sx * x, c + y) for x, y in ((-112, -168), (-134, -78), (-74, -104))], fill=70)          # 耳の内側
        d.polygon([(c + sx * x, c + y) for x, y in ((-16, -70), (-120, -48), (-150, -20), (-108, -38))], fill=90)  # 眉
        d.polygon([(c + sx * x, c + y) for x, y in ((-118, -40), (-36, -4), (-44, 14), (-110, -16))], fill=40)    # 目の穴（吊り目）
        d.line([(c + sx * -30, c + 20), (c + sx * -22, c + 110)], fill=110, width=8)                             # 鼻すじ
        d.line([(c + sx * -150, c + 40), (c + sx * -70, c + 70), (c + sx * -40, c + 130)], fill=120, width=6)     # 頬の毛並み
    d.polygon([(c - 6, c - 110), (c + 6, c - 110), (c + 14, c - 60), (c, c - 40), (c - 14, c - 60)], fill=150)    # 額の印
    d.polygon([(c - 30, c + 116), (c + 30, c + 116), (c, c + 150)], fill=30)                                     # 鼻
    wolf = _metal(m, (255, 206, 80), 7)
    shade = np.asarray(m, np.float32) / 255                              # 溝の濃さを暗さに反映
    arr = np.asarray(wolf).astype(np.float32)
    arr[..., :3] *= np.clip(0.35 + 0.65 * shade, 0, 1)[..., None] ** 0.8
    arr[..., 3] = np.where(np.asarray(m) > 0, 255, 0)
    wolf = Image.fromarray(arr.astype(np.uint8), "RGBA")
    ImageDraw.Draw(wolf).line([(c + x, c + y) for x, y in mir(head)] + [(c + head[0][0], c + head[0][1])], fill=(60, 34, 4, 255), width=7, joint="curve")
    L = wolf.copy(); L.paste((0, 0, 0, 0), (int(c), 0, S, S))
    R = wolf.copy(); R.paste((0, 0, 0, 0), (0, 0, int(c), S))
    P["wolfL"], P["wolfR"] = L, R
    eye = Image.new("L", (S, S), 0); d = ImageDraw.Draw(eye)
    for sx in (-1, 1):
        d.polygon([(c + sx * x, c + y) for x, y in ((-112, -36), (-40, -2), (-48, 10), (-106, -16))], fill=255)
    P["eyes"] = eye
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
    # 4.5) 狼の顔：左右から合わさって、噛み合う瞬間に完成
    k = ease_in_out(prog(tl, lock - 0.4, 0.4))
    if k > 0:
        dx = int((1 - k) * 420)
        lay.alpha_composite(ui.fade(P["wolfL"], min(1, k * 2)), (-dx, 0))
        lay.alpha_composite(ui.fade(P["wolfR"], min(1, k * 2)), (dx, 0))
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
    if tl >= lock:                                                       # 目が光る（噛み合った瞬間に強く、そのあと脈打つ）
        ek = min(1, (tl - lock) / 0.12) * (0.75 + 0.25 * math.sin(t * 5) ** 2) + 0.6 * p
        ecol = (255, 60, 40)
        e = Image.new("RGBA", (S, S), ecol + (0,)); e.putalpha(P["eyes"].filter(ImageFilter.GaussianBlur(10)))
        core = Image.new("RGBA", (S, S), (255, 150, 110, 0)); core.putalpha(P["eyes"])
        paste(cv, e, (x0, y0), min(1, ek) * out); paste(cv, e, (x0, y0), min(1, ek) * out)
        paste(cv, core, (x0, y0), min(1, ek) * out)
        if tl - lock < 0.5:                                              # 目からの光の筋
            fl = Image.new("RGBA", (W, H), (0, 0, 0, 0)); fd = ImageDraw.Draw(fl)
            fa = int(220 * (1 - (tl - lock) / 0.5) * out)
            for sx in (-1, 1):
                ex, ey = W / 2 + sx * 72, cy - 6
                fd.line((ex - 260, ey, ex + 260, ey), fill=(255, 120, 90, fa), width=5)
            cv.alpha_composite(fl.filter(ImageFilter.GaussianBlur(2)))
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


# ---------------------------------------------------------------- 牙狼剣：作り込み版（オリジナルの剣。落下→刺さる→ひび→光→押し込み）
KEN_TIP = 720                    # 切っ先が刺さる高さ


def _sword2():
    if "sword2" in _C:
        return _C["sword2"]
    w, h = 300, 690; cx = w / 2
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # 刀身（銀）
    m = Image.new("L", (w, h), 0); d = ImageDraw.Draw(m)
    d.polygon([(cx - 30, 230), (cx + 30, 230), (cx + 26, h - 110), (cx, h - 6), (cx - 26, h - 110)], fill=255)
    blade = _metal(m, (205, 214, 228), 2)
    bd = ImageDraw.Draw(blade)
    bd.polygon([(cx - 5, 250), (cx + 5, 250), (cx + 4, h - 130), (cx, h - 70), (cx - 4, h - 130)], fill=(120, 130, 148, 255))   # 樋
    for i, y in enumerate(range(286, h - 160, 44)):                     # 彫り（オリジナルの紋様）
        a = 10 if i % 2 else 7
        bd.line((cx - a, y, cx, y + 14, cx + a, y), fill=(255, 210, 120, 255), width=3)
    bd.line((cx - 30, 230, cx - 26, h - 110), fill=(255, 255, 255, 230), width=2)   # 刃の光る縁
    out.alpha_composite(blade)
    # 鍔（金）：翼のように左右に張り出し、先がとがる
    m = Image.new("L", (w, h), 0); d = ImageDraw.Draw(m)
    d.polygon([(cx - 140, 196), (cx - 60, 176), (cx - 34, 206), (cx + 34, 206), (cx + 60, 176), (cx + 140, 196),
               (cx + 100, 214), (cx + 46, 238), (cx, 252), (cx - 46, 238), (cx - 100, 214)], fill=255)
    for sx in (-1, 1):
        d.polygon([(cx + sx * 140, 196), (cx + sx * 150, 160), (cx + sx * 116, 190)], fill=255)
    guard = _metal(m, (255, 204, 80), 4)
    gd = ImageDraw.Draw(guard)
    gd.regular_polygon((cx, 218, 26), 6, rotation=30, fill=(40, 24, 6, 255), outline=(120, 80, 10, 255))
    gm = Image.new("L", (w, h), 0); ImageDraw.Draw(gm).polygon([(cx, 200), (cx + 14, 218), (cx, 236), (cx - 14, 218)], fill=255)
    guard.alpha_composite(_metal(gm, (255, 60, 45), 6))                  # 赤い石
    out.alpha_composite(guard)
    # 柄：巻きの模様
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((cx - 17, 64, cx + 17, 180), 8, fill=255)
    grip = _metal(m, (90, 50, 20), 1)
    gd = ImageDraw.Draw(grip)
    for y in range(70, 180, 13):
        gd.line((cx - 17, y, cx + 17, y + 9), fill=(190, 140, 60, 255), width=4)
    out.alpha_composite(grip)
    # 柄頭
    m = Image.new("L", (w, h), 0); d = ImageDraw.Draw(m)
    d.polygon([(cx, 6), (cx + 30, 40), (cx, 74), (cx - 30, 40)], fill=255)
    pm = _metal(m, (255, 210, 90), 5)
    ImageDraw.Draw(pm).ellipse((cx - 9, 31, cx + 9, 49), fill=(255, 70, 50, 255), outline=(110, 30, 10, 255), width=2)
    out.alpha_composite(pm)
    glow = Image.new("RGBA", (w, h), (255, 225, 140, 0)); glow.putalpha(out.getchannel("A").filter(ImageFilter.GaussianBlur(16)))
    full = Image.new("RGBA", (w, h), (0, 0, 0, 0)); full.alpha_composite(glow); full.alpha_composite(out)
    band = Image.new("L", (w, h), 0); ImageDraw.Draw(band).polygon([(0, 0), (w, 0), (w, 70), (0, 130)], fill=255)
    _C["sword2"] = (full, out.getchannel("A"), band.filter(ImageFilter.GaussianBlur(14)))
    return _C["sword2"]


def _cracks(seed):
    """刺さった所から広がるひび（折れ線）。床の遠近感で横長に"""
    key = ("crk", seed)
    if key not in _C:
        rng = np.random.default_rng(seed); lines = []
        for i in range(11):
            an = math.pi * (i / 10) + rng.uniform(-0.12, 0.12)
            pts = [(0.0, 0.0)]; x = y = 0.0; L = rng.uniform(240, 520)
            for s in range(7):
                st = L / 7
                a2 = an + rng.uniform(-0.45, 0.45)
                x += st * math.cos(a2) * (1 if i < 5 else 1); y += st * math.sin(a2) * 0.28
                pts.append((x * (-1 if an > math.pi / 2 else 1) if False else x, y))
            lines.append(pts)
        _C[key] = lines
    return _C[key]


def _garo_ken2(cv, t, fx):
    st = _m(fx, "stab", default=fx["start"] + 0.5)
    st2 = (fx["marks"].get("stab") or [None, None])[1] if len(fx["marks"].get("stab") or []) > 1 else None
    push = _m(fx, "push")
    if t < st - 0.7:
        return
    out = 1 - ease_in_out(prog(t, fx["end"], 0.45))
    _black(cv, 0.55 * min(1, prog(t, st - 0.7, 0.35)) * out)
    sw, sw_a, band = _sword2()
    cx = W / 2
    y_hit = KEN_TIP - sw.height + 6
    # 落ちる前：上で光る星
    if t < st - 0.22:
        k = prog(t, st - 0.7, 0.4)
        r = 18 + 30 * math.sin(k * math.pi)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        d.polygon([(cx, 60 - r * 2), (cx + r * 0.35, 60), (cx, 60 + r * 2), (cx - r * 0.35, 60)], fill=(255, 245, 210, int(240 * k)))
        d.polygon([(cx - r * 2, 60), (cx, 60 - r * 0.35), (cx + r * 2, 60), (cx, 60 + r * 0.35)], fill=(255, 245, 210, int(240 * k)))
        cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.5)))
        return
    fall = ease_in_out(prog(t, st - 0.22, 0.22)) ** 2
    y0 = -sw.height - 40
    y = y0 + (y_hit - y0) * fall
    if push is not None and t >= push:
        y += 46 * ease_out(prog(t, push, 0.15))
    # 落ちている間：残像
    if t < st:
        for i in (3, 2, 1):
            yy = y - i * 70
            paste(cv, sw, (cx - sw.width / 2, yy), 0.18 * (4 - i) / 3 * out)
    # 刺さった：ひび・衝撃波・破片・光
    if t >= st:
        tk = t - st
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        grow = ease_out(prog(tk, 0, 0.35))
        for pts in _cracks(31):
            n = max(2, int(len(pts) * grow))
            p2 = [(cx + px, KEN_TIP + py) for px, py in pts[:n]]
            p2 += [(cx - px, KEN_TIP + py) for px, py in []]
            d.line(p2, fill=(255, 200, 90, int(255 * out)), width=5, joint="curve")
            d.line([(2 * cx - x, y2) for x, y2 in p2], fill=(255, 200, 90, int(255 * out)), width=5, joint="curve")
        gl = lay.filter(ImageFilter.GaussianBlur(8))
        pulse = 0.6 + 0.4 * math.sin(t * 5) ** 2
        paste(cv, gl, (0, 0), out * pulse); paste(cv, gl, (0, 0), out * 0.6)
        core = Image.new("RGBA", (W, H), (255, 250, 220, 0)); core.putalpha(lay.getchannel("A").point(lambda v: v // 2))
        cv.alpha_composite(core)
        if tk < 0.7:                                                     # 床を走る衝撃波（横長の輪）
            sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
            r = 80 + 900 * ease_out(prog(tk, 0, 0.7))
            sd.ellipse((cx - r, KEN_TIP - r * 0.18, cx + r, KEN_TIP + r * 0.18), outline=(255, 230, 160, int(230 * (1 - tk / 0.7) * out)), width=10)
            cv.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2)))
        if tk < 1.0:                                                     # 破片
            de = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(de)
            rng = np.random.default_rng(13)
            for i in range(40):
                an = rng.uniform(math.pi * 1.05, math.pi * 1.95); v = rng.uniform(300, 900); s = rng.uniform(5, 14)
                x = cx + v * tk * math.cos(an); y2 = KEN_TIP + v * tk * math.sin(an) + 900 * tk * tk
                dd.rectangle((x - s / 2, y2 - s / 2, x + s / 2, y2 + s / 2), fill=(200, 170, 110, int(255 * (1 - tk) * out)))
            cv.alpha_composite(de)
        _rays(cv, cx, KEN_TIP - 20, math.exp(-tk / 0.35) * out)
        if tk < 0.16:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 250, 230, int(170 * (1 - tk / 0.16)))))
        # 立ちのぼる火の粉
        sp = Image.new("RGBA", (W, H), (0, 0, 0, 0)); spd = ImageDraw.Draw(sp)
        rng = np.random.default_rng(29)
        for i in range(36):
            x0 = cx + rng.uniform(-160, 160); sp_ = rng.uniform(80, 220); ph = rng.uniform(0, 2.5)
            tt = (tk + ph) % 2.5
            yy = KEN_TIP - sp_ * tt
            r = rng.uniform(2, 4)
            spd.ellipse((x0 - r, yy - r, x0 + r, yy + r), fill=(255, 210, 120, int(220 * (1 - tt / 2.5) * out * min(1, tk * 2))))
        cv.alpha_composite(sp)
    # 剣
    paste(cv, sw, (cx - sw.width / 2, y), out)
    if t >= st:                                                          # 刀身を走る光
        ph = ((t - st) % 1.4) / 1.4
        b = Image.new("L", sw.size, 0); b.paste(band, (0, int(-150 + ph * (sw.height + 300))))
        a = np.minimum(np.asarray(b, np.float32), np.asarray(sw_a, np.float32)) * 0.8
        hl = Image.new("RGBA", sw.size, (255, 255, 245, 0)); hl.putalpha(Image.fromarray(a.astype(np.uint8)))
        paste(cv, hl, (cx - sw.width / 2, y), out)
    if st2 is not None and t >= st2:                                     # 2回目（斬馬剣）：赤く燃える
        k = math.exp(-(t - st2) / 0.9)
        red = Image.new("RGBA", sw.size, (255, 60, 30, 0)); red.putalpha(sw_a.filter(ImageFilter.GaussianBlur(20)))
        paste(cv, red, (cx - sw.width / 2, y), k * out)
        if t - st2 < 0.12:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 80, 50, int(110 * (1 - (t - st2) / 0.12)))))
    # PUSH の表示（押し込むまで）
    if push is not None and st + 0.8 <= t < push + 0.1:
        a = ease_out(prog(t, st + 0.8, 0.3)) * out
        p = 0.5 + 0.5 * math.sin((t - st) * 7)
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0)); rd = ImageDraw.Draw(ring)
        hy = y + 110
        r = 70 + 14 * p
        rd.ellipse((cx - r, hy - r, cx + r, hy + r), outline=(255, 220, 120, int(230 * a)), width=6)
        cv.alpha_composite(ring.filter(ImageFilter.GaussianBlur(1)))
        _put(cv, "PUSH", 64, cx + 210, hy, a * (0.7 + 0.3 * p), 1 + 0.06 * p, glow=(255, 120, 40))
    if push is not None and t >= push:                                   # 押し込んだ：光の柱
        k = math.exp(-(t - push) / 0.5)
        col = Image.new("RGBA", (W, H), (0, 0, 0, 0)); cd = ImageDraw.Draw(col)
        wd = 60 + 260 * ease_out(prog(t, push, 0.3))
        cd.rectangle((cx - wd / 2, 0, cx + wd / 2, KEN_TIP), fill=(255, 235, 160, int(200 * k * out)))
        cv.alpha_composite(col.filter(ImageFilter.GaussianBlur(30)))
        cv.alpha_composite(fade(_edge(GOLDC), 0.8 * k * out))
        _rays(cv, cx, 360, k * out, (255, 240, 180), 32, 40, 1000)


# ================================================================ 作り込み版（牙狼回 v2 の残り14種）
# 絵はすべてオリジナル。実機の画面・キャラ・ロゴは描かない。F.O.G.・牙狼剣と同じ部品（金属・火花・衝撃波）で質感をそろえる
STEEL = (150, 156, 170)


def _mtext(text, size, base=GOLDC, weight="black"):
    """金属の文字（縁取り＋にじみ）。キャッシュする"""
    key = ("mt", text, size, base, weight)
    if key not in _C:
        f = ui.font(weight, size)
        w = int(ui.text_w(text, f)) + 90; h = int(size * 1.55)
        m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).text((w / 2, h / 2), text, font=f, fill=255, anchor="mm")
        body = _metal(m, base, len(text))
        o = Image.new("RGBA", (w, h), (45, 26, 4, 0)); o.putalpha(m.filter(ImageFilter.MaxFilter(9)))
        full = Image.new("RGBA", (w, h), (0, 0, 0, 0)); full.alpha_composite(o); full.alpha_composite(body)
        g = Image.new("RGBA", (w, h), base + (0,)); g.putalpha(m.filter(ImageFilter.GaussianBlur(max(6, size // 7))))
        _C[key] = (full, g)
    return _C[key]


def _mput(cv, text, size, cx, cy, a, scale=1.0, base=GOLDC, glow_a=0.7, weight="black"):
    if a <= 0:
        return
    im, g = _mtext(text, size, base, weight)
    for x, al in ((g, glow_a * a), (im, a)):
        if abs(scale - 1) > 1e-3:
            x = x.resize((max(1, int(x.width * scale)), max(1, int(x.height * scale))), Image.BICUBIC)
        paste(cv, x, (cx - x.width / 2, cy - x.height / 2), al)


def _mnum(cv, s, size, cx, cy, a, scale=1.0, base=GOLDC):
    """数字を1文字ずつの金属文字で並べる（カウントアップ用。文字ごとにキャッシュ）"""
    ims = [_mtext(ch, size, base)[0] for ch in s]
    adv = [int(size * (0.62 if ch.isdigit() else 0.34)) for ch in s]
    tw = sum(adv); x = cx - tw * scale / 2
    for ch, im, ad in zip(s, ims, adv):
        if abs(scale - 1) > 1e-3:
            im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
        paste(cv, im, (x + ad * scale / 2 - im.width / 2, cy - im.height / 2), a)
        x += ad * scale


def _sparks(cv, cx, cy, tk, a, n=50, seed=3, color=(255, 230, 150), speed=(400, 1200), grav=600, dur=1.1, spread=(0, 2 * math.pi)):
    if tk < 0 or tk > dur or a <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); rng = np.random.default_rng(seed)
    for i in range(n):
        an = rng.uniform(*spread); v = rng.uniform(*speed); ln = rng.uniform(12, 34)
        x = cx + v * tk * math.cos(an); y = cy + v * tk * math.sin(an) + grav * tk * tk
        vx = v * math.cos(an); vy = v * math.sin(an) + 2 * grav * tk; sp = math.hypot(vx, vy) + 1e-6
        d.line((x, y, x - vx / sp * ln, y - vy / sp * ln), fill=color + (int(255 * a * (1 - tk / dur)),), width=3)
    cv.alpha_composite(lay)


def _ring(cv, cx, cy, r, width, color, al, squash=1.0, blur=2):
    if al <= 0 or r <= 0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse((cx - r, cy - r * squash, cx + r, cy + r * squash), outline=color + (int(255 * min(1, al)),), width=max(1, int(width)))
    cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur)) if blur else lay)


def _ball(r=22, tint=None):
    """パチンコ玉（銀の球。tint で色玉）"""
    key = ("ball", r, tint)
    if key not in _C:
        s = r * 2 + 4; yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
        dx = (xx - s / 2) / r; dy = (yy - s / 2) / r; dd = dx * dx + dy * dy
        shade = np.clip(0.5 + 0.5 * (-dx * 0.45 - dy * 0.7), 0, 1)
        spec = np.exp(-(((dx + 0.35) ** 2 + (dy + 0.42) ** 2) / 0.025))
        rim = np.clip((dd - 0.75) / 0.25, 0, 1) * 0.35
        v = np.clip(shade * 190 + spec * 255 + rim * 120 + 30, 0, 255)
        arr = np.zeros((s, s, 4), np.float32)
        col = np.array(tint if tint else (235, 238, 248), np.float32) / 255
        for i in range(3):
            arr[..., i] = np.clip(v * (col[i] if tint else col[i]) + spec * 255 * (1 - col[i]), 0, 255)
        arr[..., 3] = np.clip((1 - dd) * 40, 0, 1) * 255
        _C[key] = Image.fromarray(arr.astype(np.uint8), "RGBA")
    return _C[key]


def _plate(w, h, border=GOLDC, seed=0, r=24, inner=(12, 10, 8, 230)):
    """金属の枠のパネル（中は暗い板・四隅に鋲）"""
    key = ("plate", w, h, border, seed, r, inner)
    if key not in _C:
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
        im.alpha_composite(_metal(m, border, seed))
        mi = Image.new("L", (w, h), 0); ImageDraw.Draw(mi).rounded_rectangle((11, 11, w - 12, h - 12), max(4, r - 8), fill=255)
        yy = np.linspace(0, 1, h)[:, None] * np.ones((1, w))
        arr = np.zeros((h, w, 4), np.uint8)
        for i in range(3):
            arr[..., i] = np.clip(inner[i] + 26 * (1 - yy), 0, 255)
        arr[..., 3] = inner[3]
        im.paste(Image.fromarray(arr, "RGBA"), (0, 0), mi)
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((15, 15, w - 16, h - 16), max(4, r - 10), outline=(255, 220, 140, 80), width=2)
        for x, y in ((24, 24), (w - 24, 24), (24, h - 24), (w - 24, h - 24)):
            d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 236, 180, 255), outline=(100, 64, 10, 255), width=2)
        _C[key] = im
    return _C[key]


def _pput(cv, im, cx, cy, a, scale=1.0):
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    paste(cv, im, (cx - im.width / 2, cy - im.height / 2), a)


def _smoke(seed=1):
    """暗い煙のもと（低解像度のノイズをぼかしたもの・左右につながる）"""
    key = ("smoke", seed)
    if key not in _C:
        rng = np.random.default_rng(seed)
        a = rng.random((68, 240)).astype(np.float32)
        im = Image.fromarray((a * 255).astype(np.uint8), "L").resize((960, 270), Image.BICUBIC).filter(ImageFilter.GaussianBlur(10))
        im2 = Image.fromarray((rng.random((34, 120)) * 255).astype(np.uint8), "L").resize((960, 270), Image.BICUBIC).filter(ImageFilter.GaussianBlur(18))
        _C[key] = Image.blend(im, im2, 0.5)
    return _C[key]


# ---------------------------------------------------------------- 1) 初代：羽根役物（玉を拾ってVへ）＋メーター
def _wing():
    if "wing" not in _C:
        L = 190; s = L * 2 + 20
        m = Image.new("L", (s, s), 0); d = ImageDraw.Draw(m); c = s / 2
        d.polygon([(c, c - 16), (c + L * 0.55, c - 26), (c + L, c - 8), (c + L, c + 6), (c + L * 0.55, c + 14), (c, c + 16)], fill=255)
        d.ellipse((c - 22, c - 22, c + 22, c + 22), fill=255)
        im = _metal(m, (255, 210, 90), 2)
        ImageDraw.Draw(im).ellipse((c - 9, c - 9, c + 9, c + 9), fill=(110, 70, 15, 255))
        _C["wing"] = im
    return _C["wing"]


def _hane3(cv, t, fx):
    a = _env(t, fx["start"], fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.5 * a)
    cx, cy = W / 2, 330
    _pput(cv, _plate(600, 430, GOLDC, 3), cx, cy, a)
    opens = fx["marks"].get("open", [])
    ang = 0.0
    for o in opens:
        if o <= t < o + 1.4:
            ang = max(ang, abs(math.sin((t - o) / 1.4 * 2 * math.pi)))
    wg = _wing(); c = wg.width / 2
    for side in (-1, 1):
        px, py = cx + side * 70, cy + 80
        deg = 90 - 62 * ang if side > 0 else 90 + 62 * ang
        im = wg.rotate(deg, Image.BICUBIC)
        paste(cv, im, (px - c, py - c), a)
    # V入賞口（光る）
    v = _m(fx, "v")
    vg = math.exp(-(t - v - 0.75) / 0.4) if (v is not None and t >= v + 0.75) else 0
    vm = Image.new("L", (160, 90), 0); ImageDraw.Draw(vm).polygon([(10, 4), (150, 4), (80, 86)], fill=255)
    vp = _metal(vm, (255, 230, 140) if vg < 0.2 else (255, 255, 220), 4)
    paste(cv, vp, (cx - 80, cy + 120), a)
    _mput(cv, "V", 54, cx, cy + 148, a, 1 + 0.25 * vg, base=(255, 90, 60), glow_a=0.4 + 0.6 * vg)
    if vg > 0:
        _rays(cv, cx, cy + 150, vg * a, (255, 240, 170), 22, 40, 500)
    # 玉：羽根が開くたびに上から落ちて拾われる
    for i, o in enumerate(opens[:2] + ([v] if v is not None else [])):
        if o is None:
            continue
        tl = t - (o + 0.2)
        if 0 <= tl < 0.75:
            k = ease_in_out(prog(tl, 0, 0.75))
            bx = cx + (1 - k) * (90 if i % 2 else -90) * math.sin(tl * 9)
            by = cy - 180 + 340 * k
            paste(cv, _ball(20), (bx - 22, by - 22), a)
    # メーター（半円のゲージ）
    p50, p82 = _m(fx, "p50"), _m(fx, "p82")
    if p50 is not None and t >= p50 - 0.1:
        ga = a * ease_out(prog(t, p50 - 0.1, 0.3))
        f = 0.5 * ease_out(prog(t, p50, 0.6))
        if p82 is not None and t >= p82:
            f = 0.5 + 0.32 * ease_out(prog(t, p82, 0.8))
        gx, gy, R = cx, 770, 230
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        d.pieslice((gx - R - 18, gy - R - 18, gx + R + 18, gy + R + 18), 180, 360, fill=(12, 10, 8, int(220 * ga)))
        d.arc((gx - R, gy - R, gx + R, gy + R), 180, 360, fill=(70, 55, 30, int(255 * ga)), width=34)
        d.arc((gx - R, gy - R, gx + R, gy + R), 180, 180 + 180 * f, fill=(255, 196, 60, int(255 * ga)), width=34)
        for q in range(11):
            an = math.pi + math.pi * q / 10
            d.line((gx + (R + 22) * math.cos(an), gy + (R + 22) * math.sin(an), gx + (R + 34) * math.cos(an), gy + (R + 34) * math.sin(an)), fill=(255, 225, 150, int(255 * ga)), width=3)
        an = math.pi + math.pi * f
        d.line((gx, gy, gx + (R - 30) * math.cos(an), gy + (R - 30) * math.sin(an)), fill=(255, 70, 50, int(255 * ga)), width=8)
        d.ellipse((gx - 14, gy - 14, gx + 14, gy + 14), fill=GOLDC + (int(255 * ga),))
        cv.alpha_composite(lay)
        lab = "継続" if (p82 is not None and t >= p82) else "突入"
        _mput(cv, lab, 40, gx, gy - 120, ga, weight="bold", glow_a=0.3)
        _mput(cv, f"{round(f * 100)}%", 74, gx, gy - 60, ga, base=(255, 236, 170))
        if p82 is not None and t >= p82 + 0.8:
            _sparks(cv, gx + (R - 30) * math.cos(an), gy + (R - 30) * math.sin(an), t - p82 - 0.8, ga, 30, 5, dur=0.8)


# ---------------------------------------------------------------- 2) 閃騎鋼：1stバトル（斬撃とゲージ）
def _slash(cv, t, s, color, x0, y0, x1, y1, width=26, dur=0.45):
    tl = t - s
    if not 0 <= tl < dur:
        return
    k = ease_out(prog(tl, 0, 0.12)); fadeo = 1 - prog(tl, 0.12, dur - 0.12)
    xe, ye = x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.line((x0, y0, xe, ye), fill=color + (int(255 * fadeo),), width=width)
    d.line((x0, y0, xe, ye), fill=(255, 255, 255, int(255 * fadeo)), width=max(3, width // 4))
    cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(6))); cv.alpha_composite(lay)


def _seg_gauge(cv, x, y, w, frac, color, a, blink=1.0):
    _pput(cv, _plate(w + 40, 84, (220, 225, 235), 2, 16), x + w / 2, y, a)
    n = 20; sw = (w - 20) / n
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for i in range(n):
        on = (i + 0.5) / n <= frac
        col = color if on else (40, 40, 46)
        al = int(255 * a * (blink if on else 0.8))
        d.rectangle((x + 10 + i * sw + 2, y - 22, x + 10 + (i + 1) * sw - 2, y + 22), fill=col + (al,))
    cv.alpha_composite(lay)


def _battle3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.55 * a)
    _mput(cv, "1st BATTLE", 110, W / 2, 200, a * ease_out(prog(t, g, 0.2)), 1 + 0.4 * (1 - ease_out(prog(t, g, 0.18))), base=(255, 200, 90))
    _flash(cv, t, g, 0.12)
    _sparks(cv, W / 2, 200, t - g, a, 40, 8, dur=0.8)
    wk, st = _m(fx, "weak"), _m(fx, "strong")
    if wk is not None and t >= wk - 0.05:
        _slash(cv, t, wk, (80, 190, 255), 300, 620, 1620, 300)
        _mput(cv, "弱攻撃", 44, 440, 400, a, weight="bold", base=(150, 210, 255), glow_a=0.3)
        _seg_gauge(cv, 560, 400, 760, 0.82 * ease_out(prog(t, wk + 0.1, 0.7)), (90, 200, 255), a)
        _mput(cv, "82%", 60, 1440, 400, a * ease_out(prog(t, wk + 0.6, 0.3)), base=(170, 225, 255))
    if st is not None and t >= st - 0.05:
        _slash(cv, t, st, (255, 40, 30), 320, 260, 1600, 700, 40)
        _slash(cv, t, st + 0.08, (255, 40, 30), 320, 700, 1600, 260, 40)
        blink = 0.55 + 0.45 * (math.sin((t - st) * 14) > 0)
        _mput(cv, "強攻撃", 44, 440, 540, a, weight="bold", base=(255, 140, 120), glow_a=0.3)
        _seg_gauge(cv, 560, 540, 760, 0.13 * ease_out(prog(t, st + 0.1, 0.3)), (255, 50, 40), a, blink)
        _mput(cv, "13%", 60, 1440, 540, a * ease_out(prog(t, st + 0.3, 0.3)), base=(255, 120, 100))
        _flash(cv, t, st, 0.2, (255, 60, 40), 140)
        _sparks(cv, W / 2, 480, t - st, a, 60, 9, (255, 140, 90), dur=1.0)
        if t < st + 0.8:
            cv.alpha_composite(fade(_edge((255, 30, 30)), 0.8 * (1 - prog(t, st, 0.8)) * a))


# ---------------------------------------------------------------- 3) FINAL：震撃（左下からの衝撃）
def _shingeki3(cv, t, fx):
    hits = (fx["marks"].get("go", []) + fx["marks"].get("don", []))[:3]
    a = _env(t, fx["start"], fx["end"], 0.2, 0.4)
    if a <= 0 or not hits:
        return
    _black(cv, 0.35 * a)
    ox, oy = 40, H - 40
    for j, s in enumerate(hits):
        tl = t - s
        if not 0 <= tl < 1.4:
            continue
        for i in range(3):
            r = 100 + 2000 * ease_out(prog(tl, 0.07 * i, 1.0))
            _ring(cv, ox, oy, r, 26 - 7 * i, (255, 200, 90), 0.9 * (1 - prog(tl, 0.07 * i, 1.1)) * a, 1.0, 4)
        if tl < 0.12:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 240, 200, int(150 * (1 - tl / 0.12)))))
        _sparks(cv, ox + 60, oy - 60, tl, a, 70, 20 + j, (255, 210, 140), (600, 1700), 500, 1.3, (-math.pi / 2 - 0.1, 0.1))
        de = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(de); rng = np.random.default_rng(40 + j)
        for q in range(40):                                              # 吹き飛ぶ破片
            an = rng.uniform(-math.pi / 2, 0); v = rng.uniform(500, 1400); s2 = rng.uniform(8, 22)
            x = ox + v * tl * math.cos(an); y = oy + v * tl * math.sin(an) + 700 * tl * tl
            rot = tl * rng.uniform(4, 10)
            dd.polygon([(x + s2 * math.cos(rot + q2), y + s2 * math.sin(rot + q2)) for q2 in (0, 2.1, 4.0)], fill=(170, 140, 90, int(255 * (1 - tl / 1.4) * a)))
        cv.alpha_composite(de)
        cv.alpha_composite(fade(_edge(GOLDC), 0.7 * (1 - prog(tl, 0, 1.2)) * a))
    g = hits[0]
    if t >= g:
        k = 1 - ease_out(prog(t, g, 0.16))
        _mput(cv, "震撃", 190, W / 2 + 40 * k, 330 + 30 * k, a * (1 - prog(t, g + 2.2, 0.5)), 1 + 0.5 * k, base=(255, 196, 70))


# ---------------------------------------------------------------- 4) 金色になれ：画面が金色に満ちる
def _konjiki3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    if t < g:
        return
    a = 1 - ease_in_out(prog(t, fx["end"] + 0.4, 0.6))
    k = ease_in_out(prog(t, g, 0.9))
    if "gold3" not in _C:
        yy = np.linspace(0, 1, H // 2)[:, None] * np.ones((1, W // 2))
        arr = np.zeros((H // 2, W // 2, 4), np.uint8)
        arr[..., 0] = 255; arr[..., 1] = (180 + 60 * (1 - yy)).astype(np.uint8); arr[..., 2] = (30 + 90 * (1 - yy)).astype(np.uint8)
        arr[..., 3] = (120 + 70 * yy).astype(np.uint8)
        _C["gold3"] = Image.fromarray(arr, "RGBA").resize((W, H), Image.BICUBIC)
    # 波打つ水面のように下から満ちる
    lw, lh = W // 4, H // 4
    m = Image.new("L", (lw, lh), 0); d = ImageDraw.Draw(m)
    level = lh - lh * 1.15 * k
    pts = [(x, level + 6 * math.sin(x * 0.06 + t * 5) + 4 * math.sin(x * 0.13 - t * 7)) for x in range(0, lw + 4, 4)]
    d.polygon([(0, lh)] + pts + [(lw, lh)], fill=int(255 * a))
    m = m.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(4))
    cv.paste(Image.alpha_composite(cv, _C["gold3"]), (0, 0), m)
    surf = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(surf)       # 水面の光る線
    sd.line([(x * 4, y * 4) for x, y in pts], fill=(255, 250, 220, int(220 * a * (1 - k * 0.6))), width=6)
    cv.alpha_composite(surf.filter(ImageFilter.GaussianBlur(3)))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    rng = np.random.default_rng(23)
    for i in range(7):                                                   # 立ちのぼる光の柱
        x = rng.uniform(100, W - 100); ph = rng.uniform(0, 2); wd = rng.uniform(30, 90)
        al = (0.5 + 0.5 * math.sin((t - g) * 2.5 + ph * 3)) * a * k
        d.rectangle((x - wd / 2, 0, x + wd / 2, H), fill=(255, 240, 180, int(70 * al)))
    cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(20)))
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(sp)
    for i in range(90):                                                  # 金の粒
        x0 = rng.uniform(0, W); v = rng.uniform(120, 340); ph = rng.uniform(0, 3)
        tt = (t - g + ph) % 3.0
        y = H + 20 - v * tt
        r = rng.uniform(2, 5)
        d.ellipse((x0 - r, y - r, x0 + r, y + r), fill=(255, 248, 200, int(230 * a * k)))
    for i in range(10):                                                  # きらめく星
        x = rng.uniform(150, W - 150); y = rng.uniform(120, 760); ph = rng.uniform(0, 1)
        tw = max(0, math.sin((t - g) * 3 + ph * 6)) ** 4 * a * k
        r = 30 * tw
        if r > 1:
            d.polygon([(x, y - r), (x + r * 0.18, y), (x, y + r), (x - r * 0.18, y)], fill=(255, 255, 240, int(255 * tw)))
            d.polygon([(x - r, y), (x, y - r * 0.18), (x + r, y), (x, y + r * 0.18)], fill=(255, 255, 240, int(255 * tw)))
    cv.alpha_composite(sp)
    cv.alpha_composite(fade(_edge(GOLDC), 0.55 * a * k))


# ---------------------------------------------------------------- 5) 闇を照らす者：闇の煙→光の筋が台を照らす
def _yami3(cv, t, fx):
    s = fx["start"]
    li, bk = _m(fx, "light", default=s + 1.5), _m(fx, "back")
    end = bk + 0.8 if bk is not None else fx["end"]
    if t > end + 0.9 or t < s - 0.2:
        return
    dark = min(1, prog(t, s - 0.15, 0.3)) * (1 - ease_in_out(prog(t, end, 0.9)))
    tx, ty = 520, 500                                                    # 台の写真のあたり
    r = 0 if t < li else 40 + 1000 * ease_out(prog(t, li, 1.6))
    key = ("yami3", int(r // 25))
    if key not in _C:
        lw, lh = 480, 270; sc = W / lw
        yy, xx = np.mgrid[0:lh, 0:lw].astype(np.float32)
        dist = np.sqrt((xx - tx / sc) ** 2 + (yy - ty / sc) ** 2) * sc
        rr = (r // 25) * 25
        al = np.clip((dist - rr) / 300, 0, 1) if rr > 0 else np.ones_like(dist)
        _C[key] = Image.fromarray((al * 255).astype(np.uint8), "L").resize((W, H), Image.BICUBIC)
    sm = _smoke(4)
    off = int((t * 40) % 960)
    smk = Image.new("L", (W, H)); strip = Image.new("L", (1920, 270)); strip.paste(sm, (-off, 0)); strip.paste(sm, (960 - off, 0))
    smk = strip.resize((W, H), Image.BICUBIC)
    alpha = np.asarray(_C[key], np.float32) / 255 * (0.82 + 0.18 * np.asarray(smk, np.float32) / 255) * dark
    blk = np.zeros((H, W, 4), np.uint8); blk[..., 0] = 6; blk[..., 1] = 4; blk[..., 2] = 12
    blk[..., 3] = np.clip(alpha * 250, 0, 255).astype(np.uint8)
    cv.alpha_composite(Image.fromarray(blk, "RGBA"))
    if t >= li:                                                          # 上から差しこむ光の筋と、舞うほこり
        k = min(1, prog(t, li, 0.4)) * dark
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        d.polygon([(tx - 60, -20), (tx + 60, -20), (tx + 260, ty + 260), (tx - 260, ty + 260)], fill=(255, 240, 190, int(110 * k)))
        cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(30)))
        dust = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(dust); rng = np.random.default_rng(61)
        for i in range(50):
            fy = rng.uniform(0, 1); x = tx + (rng.uniform(-1, 1) * (60 + 200 * fy)) + 20 * math.sin(t * 0.8 + i)
            y = (fy * (ty + 240) + (t - li) * rng.uniform(10, 30)) % (ty + 240)
            rr2 = rng.uniform(1.5, 3.5)
            dd.ellipse((x - rr2, y - rr2, x + rr2, y + rr2), fill=(255, 245, 210, int(200 * k)))
        cv.alpha_composite(dust)
        _rays(cv, tx, ty, 0.5 * math.exp(-(t - li) / 0.9) * dark, (255, 240, 190), 20, 60, 700)
    if bk is not None and bk <= t < bk + 0.15:
        _flash(cv, t, bk, 0.15, (255, 240, 200), 110)


# ---------------------------------------------------------------- 6) GOLDSTORM翔：赤い稲妻が保留に落ちる
def _bolt3(seed, x0, y0, x1, y1, n=10, jit=70):
    rng = np.random.default_rng(seed); pts = [(x0, y0)]
    for i in range(1, n):
        f = i / n
        pts.append((x0 + (x1 - x0) * f + rng.uniform(-jit, jit), y0 + (y1 - y0) * f + rng.uniform(-12, 12)))
    pts.append((x1, y1))
    return pts


def _inazuma3(cv, t, fx):
    strikes = fx["marks"].get("strike", [])[:2]
    a = _env(t, fx["start"], fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    # 嵐の空（上から暗く、雲が流れる）
    if "storm" not in _C:
        yy = np.linspace(0, 1, H)[:, None] * np.ones((1, W))
        arr = np.zeros((H, W, 4), np.uint8); arr[..., 0] = 20; arr[..., 1] = 10; arr[..., 2] = 24
        arr[..., 3] = (np.clip(1 - yy * 1.1, 0, 1) * 200).astype(np.uint8)
        _C["storm"] = Image.fromarray(arr, "RGBA")
    paste(cv, _C["storm"], (0, 0), a)
    sm = _smoke(9); off = int((t * 60) % 960)
    strip = Image.new("L", (1920, 270)); strip.paste(sm, (-off, 0)); strip.paste(sm, (960 - off, 0))
    cl = strip.resize((W, H), Image.BICUBIC).crop((0, 0, W, 320)).point(lambda v: max(0, v - 110) * 2)
    cloud = Image.new("RGBA", (W, 320), (60, 40, 70, 0)); cloud.putalpha(cl)
    paste(cv, cloud, (0, 0), a)
    hx = [520, 610, 700, 790]; hy = 818
    _pput(cv, _plate(390, 96, (220, 225, 235), 6, 30), 655, hy, a)
    hit = any(t >= s for s in strikes)
    for i, x in enumerate(hx):
        red = hit and i == 3
        b = _ball(26, (255, 70, 60) if red else (120, 170, 255))
        paste(cv, b, (x - b.width / 2, hy - b.height / 2), a)
    if hit:                                                              # 赤い保留のまわりを電気が走る
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        for q in range(3):
            an = (t * 7 + q * 2.1) % (2 * math.pi)
            p = _bolt3(int(t * 30) + q, hx[3] + 30 * math.cos(an), hy + 30 * math.sin(an), hx[3] + 60 * math.cos(an + 0.8), hy + 60 * math.sin(an + 0.8), 4, 12)
            d.line(p, fill=(255, 120, 110, int(230 * a)), width=3)
        cv.alpha_composite(lay)
        gl = Image.new("RGBA", (200, 200), (255, 40, 30, 0)); ImageDraw.Draw(gl).ellipse((40, 40, 160, 160), fill=(255, 40, 30, 150))
        paste(cv, gl.filter(ImageFilter.GaussianBlur(20)), (hx[3] - 100, hy - 100), a * (0.7 + 0.3 * math.sin(t * 9)))
    for k, s in enumerate(strikes):
        tl = t - s
        if not -0.05 <= tl < 0.55:
            continue
        v = 1 - prog(tl, 0.12, 0.43)
        main = _bolt3(5 + k, 700 + (k * 160 - 80), -30, hx[3], hy - 26)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
        ld.line(main, fill=(255, 40, 40, 255), width=20, joint="curve"); ld.line(main, fill=(255, 240, 240, 255), width=6, joint="curve")
        for b in range(4):                                               # 枝分かれ
            j = 2 + b * 2
            if j < len(main) - 1:
                br = _bolt3(30 + b + k, main[j][0], main[j][1], main[j][0] + (160 if b % 2 else -160), main[j][1] + 180, 5, 30)
                ld.line(br, fill=(255, 80, 70, 220), width=7, joint="curve")
        paste(cv, lay.filter(ImageFilter.GaussianBlur(12)), (0, 0), v); paste(cv, lay, (0, 0), v)
        if 0 <= tl < 0.14:
            cv.alpha_composite(Image.new("RGBA", (W, H), (255, 70, 60, int(120 * (1 - tl / 0.14)))))
        _sparks(cv, hx[3], hy - 26, tl, a, 40, 70 + k, (255, 150, 120), (300, 900), 700, 0.8)
        cv.alpha_composite(fade(_edge((255, 30, 30)), 0.75 * v * a))


# ---------------------------------------------------------------- 7) 冴島鋼牙XX：長い変動（金の時計と歯車）
def _clock_face():
    if "clock" not in _C:
        S = 460; c = S / 2
        m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
        d.ellipse((4, 4, S - 4, S - 4), fill=255); d.ellipse((40, 40, S - 40, S - 40), fill=0)
        for i in range(12):                                              # 外周の飾りの突起
            an = i / 12 * 2 * math.pi
            d.polygon([(c + 200 * math.cos(an - 0.08), c + 200 * math.sin(an - 0.08)), (c + 228 * math.cos(an), c + 228 * math.sin(an)),
                       (c + 200 * math.cos(an + 0.08), c + 200 * math.sin(an + 0.08))], fill=255)
        im = _metal(m, (255, 205, 80), 3)
        face = Image.new("RGBA", (S, S), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        fd.ellipse((40, 40, S - 40, S - 40), fill=(22, 18, 14, 245))
        fd.ellipse((60, 60, S - 60, S - 60), outline=(120, 90, 40, 255), width=2)
        for i in range(60):
            an = i / 60 * 2 * math.pi - math.pi / 2; r0 = 170 if i % 5 else 156
            fd.line((c + r0 * math.cos(an), c + r0 * math.sin(an), c + 182 * math.cos(an), c + 182 * math.sin(an)), fill=(230, 190, 110, 255), width=4 if i % 5 == 0 else 2)
        face.alpha_composite(im)
        f = ui.font("bold", 34)
        for i, num in enumerate(("XII", "III", "VI", "IX")):
            an = i * math.pi / 2 - math.pi / 2
            fd = ImageDraw.Draw(face); fd.text((c + 128 * math.cos(an), c + 128 * math.sin(an)), num, font=f, fill=(255, 220, 140, 255), anchor="mm")
        _C["clock"] = face
    return _C["clock"]


def _hand(length, width, color):
    key = ("hand", length, width, color)
    if key not in _C:
        s = length * 2 + 20; c = s / 2
        m = Image.new("L", (s, s), 0); ImageDraw.Draw(m).polygon([(c - width, c + 20), (c + width, c + 20), (c + width * 0.4, c - length), (c, c - length - 14), (c - width * 0.4, c - length)], fill=255)
        _C[key] = _metal(m, color, 1)
    return _C[key]


def _tokei3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.45 * a)
    cx, cy = W / 2, 360
    gear = _fog_parts()["gear"]
    for (dx, dy, sc, sp) in ((-230, -120, 0.55, 8), (240, 90, 0.45, -11)):  # 後ろでゆっくり回る歯車
        gi = gear.resize((int(gear.width * sc), int(gear.height * sc)), Image.BICUBIC).rotate((t - g) * sp, Image.BICUBIC)
        paste(cv, gi, (cx + dx - gi.width / 2, cy + dy - gi.height / 2), 0.8 * a)
    face = _clock_face()
    paste(cv, face, (cx - face.width / 2, cy - face.height / 2), a)
    el = max(0.0, t - g)
    step = math.floor(el / 1.0); frac = ease_out(min(1, (el - step) / 0.1))
    sec = (step + frac) / 60 * 360
    for ln, wd, col, deg in ((110, 9, (60, 40, 20), 300 + sec / 60), (160, 6, (255, 210, 120), 40 + sec / 12), (178, 3, (255, 70, 50), sec)):
        h = _hand(ln, wd, col).rotate(-deg, Image.BICUBIC)
        paste(cv, h, (cx - h.width / 2, cy - h.height / 2), a)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(lay).ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=GOLDC + (int(255 * a),)); cv.alpha_composite(lay)
    dots = "・" * (1 + int(el * 1.5) % 3)
    _mput(cv, "変動中" + dots, 56, cx, cy + 290, a, weight="bold", glow_a=0.35)


# ---------------------------------------------------------------- 8) 真・牙狼：秒速（高速の図柄と集中線）
def _reel_strip():
    if "reel" not in _C:
        f = ui.font("black", 130); h = 170
        im = Image.new("RGBA", (150, h * 10), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        for i in range(10):
            d.text((75, h * i + h / 2), str(i), font=f, fill=(255, 236, 170, 255), anchor="mm", stroke_width=5, stroke_fill=(60, 30, 0, 255))
        blur = im.resize((150, h * 10 // 6), Image.BICUBIC).resize((150, h * 10), Image.BICUBIC).filter(ImageFilter.GaussianBlur(4))
        _C["reel"] = (im, blur, h)
    return _C["reel"]


def _byousoku3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.15, 0.5)
    if a <= 0:
        return
    _black(cv, 0.35 * a)
    rng = np.random.default_rng(int(t * 30))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    for i in range(90):                                                  # 集中線（白と金）
        an = rng.uniform(0, 2 * math.pi); r0 = rng.uniform(360, 560); w = rng.uniform(0.004, 0.014)
        col = (255, 255, 255) if i % 3 else (255, 210, 110)
        ld.polygon([(W / 2 + r0 * math.cos(an - w), 380 + r0 * math.sin(an - w)), (W / 2 + 1500 * math.cos(an), 380 + 1500 * math.sin(an)),
                    (W / 2 + r0 * math.cos(an + w), 380 + r0 * math.sin(an + w))], fill=col + (200,))
    paste(cv, lay, (0, 0), a)
    k = _m(fx, "kore")
    stop = k if k is not None else fx["end"] - 0.6
    strip, blur, h = _reel_strip()
    for i in range(3):
        x = W / 2 + (i - 1) * 210
        _pput(cv, _plate(190, 240, GOLDC, i, 18), x, 360, a)
        st = stop + 0.15 * i
        win = Image.new("RGBA", (150, 190), (0, 0, 0, 0))
        if t < st:
            pos = ((t - g) * 4200 + i * 900) % (h * 10)
            src = blur
            yoff = int(-pos)
            win.paste(src.crop((0, max(0, -yoff), 150, min(h * 10, -yoff + 190))), (0, max(0, yoff)))
            if -yoff + 190 > h * 10:
                rest = -yoff + 190 - h * 10
                win.paste(src.crop((0, 0, 150, rest)), (0, 190 - rest))
            paste(cv, win, (x - 75, 265), a)
        else:
            bounce = 18 * math.exp(-(t - st) / 0.08) * math.cos((t - st) * 40)
            _mput(cv, "7", 150, x, 360 + bounce, a, base=(255, 90, 60))
            _sparks(cv, x, 360, t - st, a, 16, 80 + i, dur=0.5, speed=(200, 600))
    _flash(cv, t, stop + 0.3, 0.15)
    if t >= g:
        kk = ease_out(prog(t, g, 0.25))
        for j in range(4, 0, -1):                                        # 文字の残像
            _mput(cv, "秒速", 110, W / 2 - 60 * j * (1 - kk) - 20 * j, 600, a * 0.12 * (5 - j) * kk, base=(255, 196, 70), glow_a=0)
        _mput(cv, "秒速", 110, W / 2 - 200 * (1 - kk), 600, a * kk, base=(255, 196, 70))


# ---------------------------------------------------------------- 9) 月虹ノ旅人：初代の数字と重なる
def _kasane3(cv, t, fx):
    nw, old = _m(fx, "now", default=fx["start"]), _m(fx, "old")
    a = _env(t, nw - 0.1, fx["end"], 0.3, 0.5)
    if a <= 0:
        return
    _black(cv, 0.5 * a)
    meet = (old + 1.2) if old is not None else None
    m = ease_in_out(prog(t, meet, 0.55)) if meet is not None else 0

    def plaque(x, year, spec, al, border, seed):
        _pput(cv, _plate(540, 300, border, seed, 26), x, 380, al)
        _mput(cv, year, 48, x, 300, al, weight="bold", base=(235, 225, 210), glow_a=0.2)
        _mput(cv, spec, 92, x, 410, al, base=border)
    xr = W / 2 + 300 * (1 - m); xl = W / 2 - 300 * (1 - m)
    plaque(xr, "2021 月虹ノ旅人", "50%・81%", a * ease_out(prog(t, nw, 0.3)) * (1 - m), (150, 200, 255), 1)
    if old is not None and t >= old - 0.05:
        plaque(xl, "2008 初代", "50%・82%", a * ease_out(prog(t, old, 0.3)), GOLDC, 2)
    if meet is not None and t >= meet + 0.55:
        tk = t - meet - 0.55
        _flash(cv, t, meet + 0.55, 0.16)
        _ring(cv, W / 2, 380, 280 + 800 * ease_out(prog(tk, 0, 0.8)), 14, GOLDC, (1 - prog(tk, 0, 0.8)) * a)
        _sparks(cv, W / 2, 380, tk, a, 60, 33, dur=1.0)
        p = math.exp(-tk / 0.6)
        _rays(cv, W / 2, 380, p * a, GOLDC, 26, 280, 900)
        # 「ほぼ同じ」のはんこ（回りながら押される）
        sk = ease_out(prog(tk, 0.15, 0.25))
        if sk > 0:
            if "stamp" not in _C:
                st = Image.new("RGBA", (260, 260), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
                sd.ellipse((8, 8, 252, 252), outline=(220, 40, 30, 255), width=12); sd.ellipse((26, 26, 234, 234), outline=(220, 40, 30, 255), width=4)
                sd.text((130, 130), "ほぼ\n同じ", font=ui.font("black", 64), fill=(220, 40, 30, 255), anchor="mm", align="center", spacing=4)
                _C["stamp"] = st
            im = _C["stamp"].rotate(-14 - 40 * (1 - sk), Image.BICUBIC)
            _pput(cv, im, W / 2 + 330, 590, a * sk, 1 + 0.8 * (1 - sk))


# ---------------------------------------------------------------- 10) GOLD IMPACT：扉が閉まって1回転で決着
def _door_half():
    if "door3" not in _C:
        dw = W // 2
        m = Image.new("L", (dw, H), 255)
        steel = _metal(m, (70, 72, 84), 5)
        d = ImageDraw.Draw(steel)
        for y in range(70, H - 40, 160):                                 # 凹んだ板
            d.rectangle((50, y, dw - 70, y + 120), outline=(30, 30, 38, 255), width=4)
            d.rectangle((54, y + 4, dw - 74, y + 116), outline=(120, 124, 140, 255), width=2)
            for x in (66, dw - 86):
                for yy in (y + 14, y + 106):
                    d.ellipse((x - 6, yy - 6, x + 6, yy + 6), fill=(190, 194, 205, 255), outline=(40, 40, 48, 255))
        gm = Image.new("L", (dw, H), 0); ImageDraw.Draw(gm).rectangle((dw - 34, 0, dw, H), fill=255)
        steel.alpha_composite(_metal(gm, GOLDC, 2))                       # 合わせ目の金の縁
        lm = Image.new("L", (dw, H), 0); ImageDraw.Draw(lm).pieslice((dw - 150, H / 2 - 150, dw + 150, H / 2 + 150), 90, 270, fill=255)
        ImageDraw.Draw(lm).pieslice((dw - 96, H / 2 - 96, dw + 96, H / 2 + 96), 90, 270, fill=0)
        steel.alpha_composite(_metal(lm, GOLDC, 4))                       # 錠の半円
        _C["door3"] = (steel, steel.transpose(Image.FLIP_LEFT_RIGHT))
    return _C["door3"]


def _door3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    if t < g:
        return
    close = ease_in_out(prog(t, g, 0.35)) ** 1.5
    opn = ease_in_out(prog(t, fx["end"] - 0.7, 0.6))
    k = close * (1 - opn)
    if k <= 0:
        return
    L, R = _door_half()
    cv.alpha_composite(L, (int(-L.width + L.width * k), 0))
    cv.alpha_composite(R, (int(W - R.width * k), 0))
    shut = g + 0.35
    if t >= shut and opn <= 0:
        tk = t - shut
        p = math.exp(-tk / 0.3)
        _sparks(cv, W / 2, H - 60, tk, 1, 50, 44, (220, 200, 160), (200, 700), 500, 0.9, (math.pi * 1.05, math.pi * 1.95))   # 下で舞う火花
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        d.rectangle((W / 2 - 3, 0, W / 2 + 3, H), fill=(255, 245, 200, int(255 * min(1, 0.4 + p))))
        cv.alpha_composite(lay)
        cv.alpha_composite(fade(_edge(GOLDC), 0.6 * p))
        lk = ease_out(prog(tk, 0.15, 0.3))                               # 錠の中心に光る玉がはまる
        if lk > 0:
            gm = Image.new("RGBA", (220, 220), (0, 0, 0, 0)); ImageDraw.Draw(gm).ellipse((40, 40, 180, 180), fill=(255, 220, 120, 255))
            paste(cv, gm.filter(ImageFilter.GaussianBlur(18)), (W / 2 - 110, H / 2 - 110), lk)
            _mput(cv, "1", 120, W / 2, H / 2, lk, 1 + 0.5 * (1 - lk), base=(255, 236, 170))
        glow = ease_out(prog(tk, 0.6, 0.5))
        if glow > 0:                                                     # 合わせ目から光が漏れる
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
            ld.rectangle((W / 2 - 50 * glow, 0, W / 2 + 50 * glow, H), fill=(255, 235, 160, int(210 * glow)))
            cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(26)))
            _rays(cv, W / 2, H / 2, 0.4 * glow, GOLDC, 24, 150, 900)


# ---------------------------------------------------------------- 11) 牙狼11：光の枠（V-LIGHT）
def _vlight3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g, fx["end"] + 0.6, 0.05, 0.6)
    if a <= 0:
        return
    k = ease_in_out(prog(t, g, 1.0))
    per = 2 * (W + H)

    def pt(s):
        s = (s + W / 2) % per
        if s < W: return (s, 26)
        s -= W
        if s < H: return (W - 26, s)
        s -= H
        if s < W: return (W - s, H - 26)
        return (26, H - (s - W))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    heads = []
    for side in (1, -1):
        pts = [pt(side * per / 2 * k * i / 60) for i in range(61)]
        ld.line(pts, fill=(255, 245, 210, 255), width=24, joint="curve")
        heads.append(pts[-1])
    g2 = lay.filter(ImageFilter.GaussianBlur(18))
    tint = Image.new("RGBA", (W, H), GOLDC + (0,)); tint.putalpha(g2.getchannel("A"))
    paste(cv, tint, (0, 0), a); paste(cv, tint, (0, 0), a * 0.6); paste(cv, lay, (0, 0), a)
    for j, (hx, hy) in enumerate(heads):                                 # 先頭の光の玉と、こぼれる粒
        if k < 1:
            gl = Image.new("RGBA", (160, 160), (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse((40, 40, 120, 120), fill=(255, 255, 240, 255))
            paste(cv, gl.filter(ImageFilter.GaussianBlur(14)), (hx - 80, hy - 80), a)
            _sparks(cv, hx, hy, (t - g) % 0.3, a, 10, int(t * 20) + j, dur=0.3, speed=(100, 400), grav=300)
    if k >= 1:                                                           # 一周したら：枠のLEDが順に走り、中央に V の紋章
        tk = t - g - 1.0
        cv.alpha_composite(fade(_edge(GOLDC), 0.6 * a * math.exp(-tk / 0.9)))
        led = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(led)
        n = 48
        for i in range(n):
            x, y = pt(per * i / n)
            on = ((i - tk * 30) % 8) < 2
            d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(255, 250, 220, int((255 if on else 90) * a)))
        cv.alpha_composite(led)
        sk = ease_out(prog(tk, 0, 0.25))
        _mput(cv, "V", 230, W / 2, 380, a * sk * (1 - prog(tk, 2.0, 0.5)), 1 + 0.6 * (1 - sk), base=(255, 210, 100))
        _ring(cv, W / 2, 380, 150 + 600 * ease_out(prog(tk, 0, 0.7)), 12, GOLDC, (1 - prog(tk, 0, 0.7)) * a)
        _flash(cv, t, g + 1.0, 0.12)


# ---------------------------------------------------------------- 12) 3000LT：カウントアップと玉の雨
def _count3000_3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.2, 0.5)
    if a <= 0:
        return
    _black(cv, 0.5 * a)
    dur = 1.6
    k = ease_out(prog(t, g, dur))
    rng = np.random.default_rng(12)
    for i in range(70):                                                  # 玉の雨
        x = rng.uniform(80, W - 80); v = rng.uniform(700, 1300); ph = rng.uniform(0, 1.2); r = int(rng.uniform(12, 20))
        tt = (t - g + ph) % 1.2
        y = -40 + v * tt
        if y < H:
            b = _ball(r)
            paste(cv, b, (x - b.width / 2, y - b.height / 2), a * min(1, (t - g + 0.3) * 3) * (0.85 if t < g + dur else 0.5))
    n = int(round(3000 * k / 10) * 10)
    done = g + dur
    s = 1.0 + (0.22 * math.exp(-(t - done) / 0.2) if t >= done else 0)
    _pput(cv, _plate(900, 280, GOLDC, 7, 30), W / 2, 370, a)
    _mnum(cv, f"{n:,}", 190, W / 2 - 40, 370, a, s, base=(255, 230, 150))
    _mput(cv, "個", 90, W / 2 + 330, 400, a * k, base=(255, 230, 150))
    if t >= done:
        tk = t - done
        _flash(cv, t, done, 0.15)
        _ring(cv, W / 2, 370, 300 + 900 * ease_out(prog(tk, 0, 0.8)), 16, GOLDC, (1 - prog(tk, 0, 0.8)) * a)
        _sparks(cv, W / 2, 370, tk, a, 80, 14, dur=1.2)
        _rays(cv, W / 2, 370, math.exp(-tk / 0.6) * a, GOLDC, 30, 300, 1000)
        cv.alpha_composite(fade(_edge(GOLDC), 0.6 * math.exp(-tk / 0.8) * a))


# ---------------------------------------------------------------- 13) 牙狼12：極限バトル 1500 vs 7500
def _kyokugen3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    a = _env(t, g - 0.1, fx["end"], 0.25, 0.5)
    if a <= 0:
        return
    _black(cv, 0.6 * a)
    win, lose = _m(fx, "win"), _m(fx, "lose")
    stop = win if win is not None else g + 2.0
    _mput(cv, "極限バトル", 96, W / 2, 170, a * ease_out(prog(t, g, 0.25)), 1 + 0.3 * (1 - ease_out(prog(t, g, 0.2))), base=(255, 120, 70))
    if t < stop:
        sel = int((t - g) * (11 - 7 * prog(t, g, max(0.1, stop - g)))) % 2
    else:
        sel = 1
    xs = (W / 2 - 330, W / 2 + 330)
    for i, (txt, x) in enumerate((("1500", xs[0]), ("7500", xs[1]))):
        on = sel == i
        if t >= stop and i == 0:                                         # 負けた側は割れて落ちる
            tk = t - stop
            if tk > 1.2:
                continue
            for q, (dx, dy, rot) in enumerate(((-1, -1, -20), (1, -1, 15), (-1, 1, 25), (1, 1, -10))):
                part = _plate(440, 260, (150, 150, 160), 2, 24).crop((0 if dx < 0 else 220, 0 if dy < 0 else 130, 220 if dx < 0 else 440, 130 if dy < 0 else 260)).rotate(rot * tk * 3, Image.BICUBIC, expand=True)
                paste(cv, part, (x + dx * (110 + 200 * tk) - part.width / 2, 400 + dy * 65 + 900 * tk * tk - part.height / 2), a * (1 - tk / 1.2))
            continue
        sc = 1.0
        if t >= stop and i == 1:
            sc = 1.18 + 0.2 * math.exp(-(t - stop) / 0.2)
        border = (255, 210, 90) if on else (130, 130, 140)
        _pput(cv, _plate(440, 260, border, 1 + i, 24), x, 400, a * (1 if on or t < stop else 0.5), sc)
        _mput(cv, txt, 140, x, 400, a * (1 if on else 0.45), sc, base=(255, 230, 150) if on else (170, 170, 180), glow_a=0.8 if on else 0.1)
    if t < stop:                                                         # 2枚の間を走る電撃
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        for q in range(2):
            p = _bolt3(int(t * 24) + q * 7, xs[0] + 220, 400 + q * 20 - 10, xs[1] - 220, 400 - q * 20 + 10, 8, 26)
            d.line(p, fill=(255, 120, 80, int(230 * a)), width=5)
        cv.alpha_composite(lay.filter(ImageFilter.GaussianBlur(2))); cv.alpha_composite(lay)
        _mput(cv, "VS", 90, W / 2, 400, a, base=(255, 90, 60))
    else:
        tk = t - stop
        _flash(cv, t, stop, 0.15)
        _sparks(cv, xs[1], 400, tk, a, 70, 52, dur=1.1)
        _rays(cv, xs[1], 400, math.exp(-tk / 0.6) * a, GOLDC, 28, 240, 1000)
        _ring(cv, xs[1], 400, 260 + 700 * ease_out(prog(tk, 0, 0.7)), 14, GOLDC, (1 - prog(tk, 0, 0.7)) * a)
    if lose is not None and t >= lose:
        _mput(cv, "勝てば7500 ／ 負けても1500　約50%", 52, W / 2, 640, a * ease_out(prog(t, lose, 0.3)), weight="bold", base=(240, 230, 210), glow_a=0.2)


# ---------------------------------------------------------------- 14) 魔戒BURST：力が集まって弾ける
def _shards():
    if "shards" not in _C:
        out = []; rng = np.random.default_rng(77)
        for i in range(8):
            s = 70; m = Image.new("L", (s, s), 0)
            pts = [(rng.uniform(0, s), rng.uniform(0, s * 0.3)), (rng.uniform(s * 0.6, s), rng.uniform(s * 0.4, s)), (rng.uniform(0, s * 0.4), rng.uniform(s * 0.6, s))]
            ImageDraw.Draw(m).polygon(pts, fill=255)
            out.append(_metal(m, (255, 80, 50) if i % 3 == 0 else GOLDC, i))
        _C["shards"] = out
    return _C["shards"]


def _burst3(cv, t, fx):
    g = _m(fx, "go", default=fx["start"])
    if t < g - 0.8:
        return
    a = _env(t, g - 0.8, fx["end"], 0.3, 0.5)
    cy = 380
    tl = t - g
    _black(cv, 0.45 * a)
    if tl < 0:                                                           # 弾ける前：粒が集まり、輪が縮む
        k = ease_in_out(prog(tl, -0.8, 0.8))
        sp = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(sp); rng = np.random.default_rng(5)
        for i in range(80):
            an = rng.uniform(0, 2 * math.pi); r = rng.uniform(250, 900) * (1 - k)
            x, y = W / 2 + r * math.cos(an), cy + r * math.sin(an); s = rng.uniform(2, 5)
            d.ellipse((x - s, y - s, x + s, y + s), fill=(255, 150, 90, int(240 * k)))
        cv.alpha_composite(sp)
        _ring(cv, W / 2, cy, 380 * (1 - k) + 20, 8, (255, 200, 150), k * a)
        gl = Image.new("RGBA", (300, 300), (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse((90, 90, 210, 210), fill=(255, 210, 160, 255))
        paste(cv, gl.filter(ImageFilter.GaussianBlur(30)), (W / 2 - 150, cy - 150), k * a)
        return
    _flash(cv, t, g, 0.2, (255, 255, 255), 220)
    if "burstlay" not in _C:                                             # 放射状の爆発の模様
        lw, lh = 480, 270; yy, xx = np.mgrid[0:lh, 0:lw].astype(np.float32)
        ang = np.arctan2(yy - lh * cy / H, xx - lw / 2); dist = np.sqrt((xx - lw / 2) ** 2 + (yy - lh * cy / H) ** 2) / 200
        rays = 0.5 + 0.5 * np.sin(ang * 23) * np.sin(ang * 7 + 1)
        al = np.clip((1 - dist) * (0.6 + 0.6 * rays), 0, 1)
        arr = np.zeros((lh, lw, 4), np.uint8); arr[..., 0] = 255; arr[..., 1] = (120 + 120 * (1 - dist)).clip(60, 240).astype(np.uint8); arr[..., 2] = 60
        arr[..., 3] = (al * 255).astype(np.uint8)
        _C["burstlay"] = Image.fromarray(arr, "RGBA").resize((W, H), Image.BICUBIC)
    sc = 0.3 + 1.4 * ease_out(prog(tl, 0, 0.5))
    bl = _C["burstlay"]
    im = bl.resize((int(W * sc), int(H * sc)), Image.BICUBIC)
    paste(cv, im, (W / 2 - im.width / 2, cy - im.height * cy / H), a * (1 - prog(tl, 0.3, 0.9)))
    for i in range(3):
        _ring(cv, W / 2, cy, 80 + 1500 * ease_out(prog(tl, 0.08 * i, 0.9)), 22 - 6 * i, (255, 120, 60) if i % 2 else (255, 220, 150), (1 - prog(tl, 0.08 * i, 0.9)) * a, 1.0, 3)
    rng = np.random.default_rng(11)
    for i, sh in enumerate(_shards() * 4):                               # 金属の破片
        an = rng.uniform(0, 2 * math.pi); v = rng.uniform(500, 1500)
        r = v * ease_out(min(1, tl / 1.3))
        x, y = W / 2 + r * math.cos(an), cy + r * math.sin(an) + 200 * tl * tl
        im2 = sh.rotate(tl * rng.uniform(200, 700), Image.BICUBIC, expand=True)
        paste(cv, im2, (x - im2.width / 2, y - im2.height / 2), a * (1 - prog(tl, 0.7, 0.8)))
    _sparks(cv, W / 2, cy, tl, a, 90, 19, (255, 190, 120), (700, 1800), 300, 1.2)
    k = 1 - ease_out(prog(tl, 0, 0.18))
    _mput(cv, "BURST", 200, W / 2, cy, a * (1 - prog(tl, 1.8, 0.5)), 1 + 0.5 * k, base=(255, 110, 70))
    cv.alpha_composite(fade(_edge((255, 60, 40)), 0.7 * a * math.exp(-tl / 0.7)))


# ---------------------------------------------------------------- 牙狼回 v3：章の切り替え
COLD = (120, 160, 220)


def _tenraku(cv, t, fx):
    """転落：金の縁が消え、金の破片が下へ落ちる。冷たい青の幕と「転落」の鋼の文字が沈む"""
    g = _m(fx, "go", default=fx["start"])
    if t < g - 0.1:
        return
    tl = t - g
    a = 1 - ease_in_out(prog(t, fx["end"] + 0.2, 0.7))
    cv.alpha_composite(fade(_edge(GOLDC), 0.6 * a * math.exp(-tl / 0.25)))          # 一瞬だけ金→すぐ消える
    cv.alpha_composite(fade(_edge((20, 40, 80)), 0.85 * a * ease_out(prog(tl, 0.1, 0.8))))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); rng = np.random.default_rng(41)
    for i in range(46):                                                   # 金の破片が落ちて、色が抜けていく
        x = rng.uniform(80, W - 80); y0 = rng.uniform(-200, 380); v = rng.uniform(260, 620); sz = rng.uniform(8, 24)
        y = y0 + v * tl + 420 * tl * tl
        if y > H + 40:
            continue
        cool = min(1, tl / 1.4)
        col = tuple(int(GOLDC[j] * (1 - cool) + (150, 160, 175)[j] * cool) for j in range(3))
        an = rng.uniform(0, math.pi) + tl * rng.uniform(2, 6)
        pts = [(x + sz * math.cos(an + q), y + sz * 0.6 * math.sin(an + q)) for q in (0, 2.1, 4.0)]
        d.polygon(pts, fill=col + (int(230 * a * (1 - prog(tl, 1.6, 0.8))),))
    cv.alpha_composite(lay)
    sink = 40 * ease_in_out(prog(tl, 0.2, 1.6))
    _mput(cv, "転落", 210, W / 2, 360 + sink, a * ease_out(prog(tl, 0, 0.3)) * (1 - prog(tl, 2.2, 0.6)), 1.12 - 0.12 * ease_out(prog(tl, 0, 0.3)), base=COLD, glow_a=0.5)


def _fukkatsu(cv, t, fx):
    """復活：下から金と赤の光が立ちのぼり、「復活」の金の文字が赤くにじんで現れる"""
    g = _m(fx, "go", default=fx["start"])
    if t < g - 0.3:
        return
    tl = t - g
    a = 1 - ease_in_out(prog(t, fx["end"] + 0.3, 0.7))
    k = ease_out(prog(tl, -0.3, 0.5))
    _rays(cv, W / 2, H + 60, k * a * (0.6 + 0.4 * math.exp(-max(tl, 0) / 1.2)), GOLDC, 28, 120, 1300)
    _rays(cv, W / 2, H + 60, 0.5 * k * a, (230, 50, 40), 14, 160, 1100)
    _sparks(cv, W / 2, 380, tl, a, 80, 29, (255, 210, 120), (500, 1500), 380, 1.3)
    _sparks(cv, W / 2, 380, tl, a, 40, 31, (255, 90, 60), (400, 1200), 380, 1.2)
    sc = 1 + 0.35 * (1 - ease_out(prog(tl, 0, 0.22)))
    _mput(cv, "復活", 220, W / 2, 360, a * ease_out(prog(tl, 0, 0.18)) * (1 - prog(tl, 2.4, 0.6)), sc, glow_a=0.8)
    cv.alpha_composite(fade(_edge((230, 60, 40)), 0.55 * a * k))
    cv.alpha_composite(fade(_edge(GOLDC), 0.35 * a * math.exp(-max(tl, 0) / 0.8)))


DRAW = {"garo_ken": _garo_ken2, "fog": _fog2, "konjiki": _konjiki3, "inazuma": _inazuma3, "door": _door3,
        "bousou": _bousou, "flame": _flame, "knife": _knife, "yari": _yari, "kourin": _kourin, "omedetou": _omedetou,
        "lever": _lever, "rebabu": _rebabu, "honeycomb": _honeycomb, "emergency": _emergency, "spiral": _spiral,
        "beat": _beat, "hane": _hane3, "battle": _battle3, "shingeki": _shingeki3, "nanairo": _nanairo2, "yami": _yami3,
        "tokei": _tokei3, "byousoku": _byousoku3, "kasane": _kasane3, "vlight": _vlight3, "count3000": _count3000_3,
        "kyokugen": _kyokugen3, "burst": _burst3, "tenraku": _tenraku, "fukkatsu": _fukkatsu}


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
            if fx["kind"] in NO_NOTE:
                continue
            first = min([v for ms in fx["marks"].values() for v in ms] or [fx["start"]])
            na = max(na, _env(t, first - 0.3, fx["end"] + 0.3, 0.3, 0.4))
    if na > 0:
        _note(cv, na)
