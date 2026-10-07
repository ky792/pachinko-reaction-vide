#!/usr/bin/env python3
"""反応集フォーマット（下部中央テロップ型）の動画を作る。

制作基準（マニュアル）:
  - 白文字＋黒太フチ、画面下部中央（下端から約12%）、1行12〜16字
  - 強調/冒頭フック=赤・黄、オチ/ツッコミ=青、大オチは通常の1.5倍以上
  - コメント切替は完全カット、コメント間ポーズ0.05秒以下
  - 右上に「※トピック名」を常時表示
  - 音量比 音声100 : SE 75 : BGM 18、大オチ直前でBGM完全カット
  - 背景はセクション単位で切替（コメントごとに変えない）

使い方:
  python reaction/make_video.py episodes/ep003/reaction.json -o output/ep003.mp4
  python reaction/make_video.py ... --no-voice   # 読み上げなし（文字数から尺を推定）
"""
import argparse
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "generator" / "assets"
W, H, FPS, SR = 1920, 1080, 30, 44100

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    str(ASSETS / "fonts" / "NotoSansCJK-Black.ttc"),
]

COLORS = {
    "white": (255, 255, 255),
    "red": (255, 48, 48),
    "yellow": (255, 222, 0),
    "blue": (40, 140, 255),
}
SIZES = {"normal": 80, "hook": 90, "ochi": 130}   # px（=pt相当）
STROKE = {"normal": 14, "hook": 16, "ochi": 16}

# 音量（読み上げ=1.0 基準）
VOICE_GAIN, SE_GAIN, BGM_GAIN = 1.0, 0.75, 0.15
GAP = 0.04            # コメント間の間（0.05秒以下）
OCHI_HOLD = 0.15      # 大オチ前の溜め（BGMカット後）
END_HOLD = 1.6        # 大オチ後の余韻


def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    sys.exit("[エラー] 日本語フォント（Noto Sans CJK）が見つかりません")


# ---------------------------------------------------------------- 効果音
def synth_se(kind):
    """著作権フリーの効果音をその場で合成する。"""
    def env(n, attack=0.004, decay=0.08):
        t = np.arange(n) / SR
        a = np.clip(t / attack, 0, 1)
        return a * np.exp(-t / decay)

    if kind == "pon":
        n = int(0.12 * SR); t = np.arange(n) / SR
        f = 880 * np.exp(-t * 6)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, decay=0.045)
    elif kind == "piko":
        n = int(0.16 * SR); t = np.arange(n) / SR
        f = np.where(t < 0.06, 1320, 1980)
        x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 * env(n, decay=0.07)
    elif kind == "shock":
        n = int(0.6 * SR); t = np.arange(n) / SR
        f = 520 * np.exp(-t * 3.2)
        x = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR))
        x *= env(n, decay=0.25) * 0.8
    elif kind == "taiko":
        n = int(0.5 * SR); t = np.arange(n) / SR
        f = 120 * np.exp(-t * 4) + 55
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, attack=0.002, decay=0.16)
        rng = np.random.default_rng(1)
        hit = rng.standard_normal(n) * env(n, attack=0.001, decay=0.015) * 0.6
        x = body + hit
    elif kind == "shu":
        n = int(0.35 * SR); t = np.arange(n) / SR
        rng = np.random.default_rng(3)
        noise = rng.standard_normal(n)
        # 高→低に流れるホワイトノイズ
        out = np.zeros(n); y = 0.0
        for i in range(n):
            a = 0.08 + 0.6 * (1 - t[i] / 0.35)
            y += a * (noise[i] - y); out[i] = y
        x = out * np.sin(np.pi * np.clip(t / 0.35, 0, 1)) ** 1.5
    elif kind == "don":
        n = int(1.2 * SR); t = np.arange(n) / SR
        f = 90 * np.exp(-t * 2.5) + 38
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, attack=0.002, decay=0.45)
        rng = np.random.default_rng(2)
        noise = rng.standard_normal(n)
        k = np.ones(40) / 40
        noise = np.convolve(noise, k, "same") * env(n, attack=0.001, decay=0.12) * 1.5
        x = body + noise
    else:
        return None
    x = x / (np.max(np.abs(x)) + 1e-9)
    return x.astype(np.float32)


# ---------------------------------------------------------------- 音声
def read_wav_mono(path):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def trim_silence(x, thr=0.012):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.01 * SR))
    b = min(len(x), idx[-1] + int(0.03 * SR))
    return x[a:b]


async def tts_one(text, voice, rate, pitch, out_path):
    import edge_tts
    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await com.save(str(out_path))


def engine_base(v):
    if v.get("engine") == "aivis":
        return os.environ.get("AIVIS_URL", "http://127.0.0.1:10101")
    return os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")


def voicevox_one(text, v, out_path):
    """VOICEVOX / AivisSpeech（VOICEVOX互換API）で1文を合成する。"""
    import urllib.parse, urllib.request
    base = engine_base(v)
    q = urllib.parse.urlencode({"text": text, "speaker": v["speaker"]})
    with urllib.request.urlopen(urllib.request.Request(f"{base}/audio_query?{q}", method="POST"), timeout=60) as r:
        query = json.loads(r.read())
    query.update({"speedScale": v.get("speed", 1.0), "pitchScale": v.get("pitch", 0.0),
                  "intonationScale": v.get("intonation", 0.9), "volumeScale": 1.0,
                  "prePhonemeLength": 0.02, "postPhonemeLength": 0.02})
    body = json.dumps(query).encode()
    req = urllib.request.Request(f"{base}/synthesis?speaker={v['speaker']}", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        out_path.write_bytes(r.read())


_SPEAKERS = {}


def resolve_speaker(v):
    """{"candidates": [["猫使ビィ","ノーマル"], ...]} を VOICEVOX の style id に解決する。"""
    if "candidates" not in v:
        return v
    base = engine_base(v)
    if base not in _SPEAKERS:
        import urllib.request
        with urllib.request.urlopen(f"{base}/speakers", timeout=60) as r:
            _SPEAKERS[base] = json.loads(r.read())
    for name, style in v["candidates"]:
        for sp in _SPEAKERS[base]:
            if sp["name"] != name and not sp["name"].startswith(name + "("):
                continue
            for st in sp["styles"]:
                if st["name"] == style:
                    out = dict(v); out.pop("candidates"); out["speaker"] = st["id"]
                    out["_name"] = ("AivisSpeech:" if v.get("engine") == "aivis" else "VOICEVOX:") + name
                    print(f"  話者: {name}（{style}） id={st['id']}")
                    return out
    have = "; ".join(sp["name"] + "(" + ",".join(st["name"] for st in sp["styles"]) + ")" for sp in _SPEAKERS[base])
    sys.exit(f"[エラー] 話者が見つかりません: {v['candidates']}  使える話者: {have}")


USED_VOICES = set()


def make_voice(items, ep, cache_dir):
    """各コメントの読み上げ音声（edge-tts）を作る。キャッシュあり。"""
    cache_dir.mkdir(parents=True, exist_ok=True)
    voices = ep["voices"]
    rep = ep.get("reading", {})
    if any("candidates" in v for v in voices["board"]):
        voices["board"] = [resolve_speaker(v) for v in voices["board"]]
    board_cycle = voices["board"]
    bi = 0
    for it in items:
        who = norm_who(it.get("who", "board"))
        if who == "board":
            v = board_cycle[bi % len(board_cycle)]; bi += 1
        else:
            v = voices[who]
        if it.get("corner"):
            it["_voice"] = np.zeros(int(SR * it.get("min", 1.0)), np.float32)
            continue
        if it.get("voice"):
            v = it["voice"] = resolve_speaker(it["voice"]) if "candidates" in it["voice"] else it["voice"]
        if "candidates" in v:
            v = voices[who] = resolve_speaker(v)
        USED_VOICES.add(v.get("_name", ""))
        v = {k: x for k, x in v.items() if k != "_name"}
        if it.get("speed") and "speaker" in v:
            v = dict(v, speed=it["speed"])
        say = it.get("say") or it["text"].replace("\n", "")
        for k, val in rep.items():
            say = say.replace(k, val)
        key = hashlib.sha1(f"{say}|{json.dumps(v, sort_keys=True)}".encode()).hexdigest()[:16]
        mp3 = cache_dir / (f"{key}.wav" if "speaker" in v else f"{key}.mp3")
        if not mp3.exists():
            for attempt in range(3):
                try:
                    if "speaker" in v:
                        voicevox_one(say, v, mp3)
                    else:
                        asyncio.run(tts_one(say, v["voice"], v["rate"], v["pitch"], mp3))
                    break
                except Exception as e:  # noqa
                    print(f"  TTS再試行 {attempt+1}: {e}")
                    if mp3.exists():
                        mp3.unlink()
            else:
                sys.exit(f"[エラー] 読み上げを作れませんでした: {say}")
        x = trim_silence(read_wav_mono(mp3))
        rms = np.sqrt(np.mean(x ** 2)) + 1e-9
        x = x / rms * 0.22
        x = np.tanh(x * 1.1) / np.tanh(1.1)   # ピークだけ軽く抑える
        it["_voice"] = x.astype(np.float32)
        print(f"  声 {len(x)/SR:4.2f}s {who:5s} {say}")


# ---------------------------------------------------------------- 画面
CHAR_TALK, CHAR_IDLE = 400, 335      # 元画像(正方形キャンバス)の高さをこの px に
CHAR_X = {"nagi": 175, "baku": W - 185}   # 足元の中心
FOOT_Y = H - 18


def sticker(src, sc, bright):
    """縮小→白フチ→足元の影。返り値は (画像, 足元中心からのオフセット)。"""
    im = src.resize((max(1, int(src.width * sc)), max(1, int(src.height * sc))), Image.LANCZOS)
    pad = 14
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2 + 20), (0, 0, 0, 0))
    a = np.asarray(im)[..., 3]
    from scipy import ndimage as ndi
    big = np.zeros((canvas.height, canvas.width), bool)
    big[pad:pad + im.height, pad:pad + im.width] = a > 60
    ys, xs = np.where(big)
    foot_y, cx = ys.max(), int(np.median(xs))
    # 影（足元の楕円）
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((cx - im.width * 0.32, foot_y - 12, cx + im.width * 0.32, foot_y + 14), fill=(0, 0, 0, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    canvas.alpha_composite(sh)
    # 白フチ
    edge = ndi.binary_dilation(big, iterations=6)
    e = np.zeros((canvas.height, canvas.width, 4), np.uint8)
    e[edge] = (255, 255, 255, 255)
    eimg = Image.fromarray(e, "RGBA").filter(ImageFilter.GaussianBlur(0.8))
    canvas.alpha_composite(eimg)
    body = im
    if bright < 1:
        rgb = Image.eval(im.convert("RGB"), lambda v: int(v * bright))
        body = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
    canvas.alpha_composite(body, (pad, pad))
    return canvas, (cx, foot_y)


def corner_glow():
    g = np.zeros((H, W, 4), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    for (cx, col) in ((170, (60, 140, 255)), (W - 170, (255, 120, 40))):
        d = np.sqrt(((xx - cx) / 420.0) ** 2 + ((yy - (H + 40)) / 380.0) ** 2)
        a = np.clip(1 - d, 0, 1) ** 1.6 * 150
        for k in range(3):
            g[..., k] = np.where(a > g[..., 3], col[k], g[..., k])
        g[..., 3] = np.maximum(g[..., 3], a)
    return Image.fromarray(g.astype(np.uint8), "RGBA")


def ease_out_back(x):
    c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


ALIAS = {"rabbit": "nagi", "cat": "baku", "usagi": "nagi", "neko": "baku"}
IDLE_FACE = {"nagi": "normal", "baku": "normal"}
FACE_ALIAS = {"shock": "surprise", "smug": "explain", "jito": "mutto", "angry": "tsukkomi", "cry": "surprise"}


def norm_who(w):
    return ALIAS.get(w, w)


FACE_FALLBACK = {"nagi": {"point": "explain", "max": "explain", "cheer": "explain", "tsukkomi": "think", "mutto": "think"},
                 "baku": {"cheer": "normal", "surprise": "max", "explain": "normal", "think": "mutto", "point": "tsukkomi"}}


def pick_face(c, it):
    f = _pick_face(c, it)
    return FACE_FALLBACK[c].get(f, f)


def _pick_face(c, it):
    """セリフの中身から表情を選ぶ（face 指定があればそれを優先）。
    ナギ: normal / explain / think / surprise / point
    バク: normal / max / tsukkomi / mutto / cheer"""
    f = it.get("face")
    if f:
        f = FACE_ALIAS.get(f, f) if f not in ("normal",) else f
        if f in ("normal", "explain", "think", "surprise", "point", "max", "tsukkomi", "mutto", "cheer"):
            if c == "baku" and f == "surprise": return "max"
            if c == "baku" and f == "explain": return "normal"
            if c == "nagi" and f in ("max", "cheer"): return "explain"
            if c == "nagi" and f in ("tsukkomi", "mutto"): return "think"
            return f
    t = it["text"]
    if c == "nagi":
        if "？" in t or "?" in t or "かな" in t: return "think"
        if "！？" in t or "えっ" in t: return "surprise"
        if any(k in t for k in ("まとめ", "つまり", "ポイント")): return "point"
        if any(ch.isdigit() for ch in t): return "explain"
        return "normal"
    if any(k in t for k in ("だろ", "やろ", "なんで", "おかしい", "やんけ")): return "tsukkomi"
    if any(k in t for k in ("草", "w", "ｗ", "最高", "！！")): return "max"
    if any(k in t for k in ("…", "ずる", "納得いかん")): return "mutto"
    if "！" in t: return "cheer"
    return "normal"


def draw_stroked(draw, xy, text, fnt, fill, stroke, anchor="mm"):
    draw.text(xy, text, font=fnt, fill=fill, stroke_width=stroke,
              stroke_fill=(0, 0, 0), anchor=anchor)


def wrap(text, limit=16):
    """台本の改行を優先。長すぎる行だけ均等に分ける。"""
    lines = []
    for raw in text.split("\n"):
        if len(raw) <= limit:
            lines.append(raw); continue
        k = -(-len(raw) // limit)
        step = -(-len(raw) // k)
        lines += [raw[i:i + step] for i in range(0, len(raw), step)]
    return [l for l in lines if l != ""]


class Painter:
    def __init__(self, ep, ep_dir):
        self.ep = ep
        self.ep_dir = ep_dir
        self.hall = Image.open(ASSETS / "backgrounds" / (ep.get("background") or "hall_anime.png")).convert("RGB").resize((W, H))
        # 固定キャラ：ナギ（うさぎ・左下）とバク（ねこ・右下）。全身・白フチ付きで前計算
        self.sprites = {}
        for who in ("nagi", "baku"):
            for p in (ASSETS / "characters" / who).glob("*.png"):
                src = Image.open(p).convert("RGBA")
                for mode, sc, bright in (("talk", CHAR_TALK / src.height, 1.0), ("idle", CHAR_IDLE / src.height, 0.86)):
                    self.sprites[(who, p.stem, mode)] = sticker(src, sc, bright)
        self.bg_cache = {}
        self.glow = corner_glow()

    def find_image(self, name):
        for base in (self.ep_dir / "images", ASSETS / "machines"):
            p = base / name
            if p.exists():
                return p
        return None

    def background(self, sec):
        key = json.dumps(sec.get("bg", {}), ensure_ascii=False)
        if key in self.bg_cache:
            return self.bg_cache[key]
        bg = sec.get("bg", {})
        img_path = self.find_image(bg["image"]) if bg.get("image") else None
        base = self.hall.copy()
        if img_path:
            src = Image.open(img_path).convert("RGB")
            # ぼかした同じ画像で全面を埋め、中央に全体が収まるように置く（固定）
            fill = src.copy(); fill = fill.resize((W, int(W * fill.height / fill.width)))
            fill = fill.crop((0, max(0, (fill.height - H) // 2), W, max(0, (fill.height - H) // 2) + H)).resize((W, H))
            base = fill.filter(ImageFilter.GaussianBlur(24))
            base = Image.blend(base, Image.new("RGB", (W, H), (0, 0, 0)), 0.45)
            s = min(1240 / src.width, 570 / src.height)
            fg = src.resize((int(src.width * s), int(src.height * s)))
            if bg.get("spec"):
                # 実機（左）＋スペック表（右）を並べる
                card = self.spec_card(bg["spec"])
                gap = 40
                tot = fg.width + gap + card.width
                x0 = (W - tot) // 2
                base.paste(fg, (x0, 24))
                base.paste(card, (x0 + fg.width + gap, 140), card)
            else:
                base.paste(fg, ((W - fg.width) // 2, 24))
        elif bg.get("spec"):
            base = Image.blend(base.filter(ImageFilter.GaussianBlur(6)), Image.new("RGB", (W, H), (0, 0, 0)), 0.45)
            card = self.spec_card(bg["spec"])
            base.paste(card, ((W - card.width) // 2, 140), card)
        else:
            # 画像が無い時：ホール背景を暗くして、機種名パネルを出す
            base = Image.blend(base.filter(ImageFilter.GaussianBlur(4)), Image.new("RGB", (W, H), (0, 0, 0)), 0.38)
            label = bg.get("label")
            if label:
                d = ImageDraw.Draw(base)
                lines = label.split("\n")
                f1 = font(76 if max(len(l) for l in lines) <= 14 else 60)
                boxw = 1300; lh = int(f1.size * 1.25)
                boxh = 70 + lh * len(lines)
                x0 = (W - boxw) // 2; y0 = 160
                panel = Image.new("RGBA", (boxw, boxh), (12, 12, 20, 210))
                base.paste(panel, (x0, y0), panel)
                d.rectangle((x0, y0, x0 + boxw, y0 + boxh), outline=(255, 222, 0), width=6)
                for i, l in enumerate(lines):
                    draw_stroked(d, (W // 2, y0 + 35 + lh * i + lh // 2), l, f1, (255, 255, 255), 8)
        self.bg_cache[key] = base
        return base

    def spec_card(self, spec):
        """スペック表の画像を作る。rows: [[項目, 値, 強調色(任意)], ...]"""
        rows = spec["rows"]
        cw = spec.get("width", 760)
        head_h, row_h, pad = 80, 68, 18
        ch = head_h + row_h * len(rows) + pad * 2
        card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        d.rounded_rectangle((0, 0, cw - 1, ch - 1), 26, fill=(14, 16, 28, 235), outline=(255, 222, 0), width=6)
        d.rounded_rectangle((0, 0, cw - 1, head_h), 26, fill=(200, 28, 40))
        d.rectangle((0, head_h - 26, cw - 1, head_h), fill=(200, 28, 40))
        title = spec["title"]
        ft = font(52 if len(title) <= 13 else 42)
        d.text((cw / 2, head_h / 2 + 2), title, font=ft, fill=(255, 255, 255), anchor="mm",
               stroke_width=5, stroke_fill=(0, 0, 0))
        fk, fv = font(38), font(46)
        for i, r in enumerate(rows):
            y = head_h + pad + row_h * i + row_h / 2
            if i:
                d.line((28, y - row_h / 2, cw - 28, y - row_h / 2), fill=(255, 255, 255, 60), width=2)
            d.text((36, y), r[0], font=fk, fill=(200, 205, 220), anchor="lm")
            col = COLORS.get(r[2], (255, 255, 255)) if len(r) > 2 and r[2] else (255, 255, 255)
            d.text((cw - 36, y), r[1], font=fv, fill=col, anchor="rm", stroke_width=4, stroke_fill=(0, 0, 0))
        return card

    def title_frame(self, it):
        im = Image.blend(self.hall.filter(ImageFilter.GaussianBlur(6)), Image.new("RGB", (W, H), (0, 0, 0)), 0.5).convert("RGBA")
        d = ImageDraw.Draw(im)
        sub = it.get("sub")
        if sub:
            fs = font(64)
            tw = d.textlength(sub, font=fs)
            d.rounded_rectangle((W / 2 - tw / 2 - 40, 190, W / 2 + tw / 2 + 40, 300), 24, fill=(220, 30, 40),
                                outline=(0, 0, 0), width=6)
            d.text((W / 2, 245), sub, font=fs, fill=(255, 255, 255), anchor="mm", stroke_width=5, stroke_fill=(0, 0, 0))
        ft = font(112)
        lines = it["text"].split("\n")
        lh = 145
        top = 600 - lh * len(lines) // 2
        cols = [COLORS["red"], COLORS["red"]]
        for i, l in enumerate(lines):
            draw_stroked(d, (W // 2, top + lh * i + lh // 2), l, ft, cols[min(i, 1)], 18)
        return im.convert("RGB")

    def corner_band(self, it):
        if getattr(self, "_band", None) is None or self._band_text != it["text"]:
            bw, bh = W, 150
            band = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
            d = ImageDraw.Draw(band)
            d.rectangle((0, 0, bw, bh), fill=(16, 18, 34, 235))
            d.rectangle((0, 0, bw // 2, 10), fill=(40, 110, 255))
            d.rectangle((bw // 2, 0, bw, 10), fill=(255, 110, 30))
            d.rectangle((0, bh - 10, bw // 2, bh), fill=(40, 110, 255))
            d.rectangle((bw // 2, bh - 10, bw, bh), fill=(255, 110, 30))
            f = font(74)
            d.text((bw / 2, bh / 2 + 2), it["text"].replace("\n", " "), font=f, fill=(255, 255, 255), anchor="mm",
                   stroke_width=8, stroke_fill=(0, 0, 0))
            self._band, self._band_text = band, it["text"]
        return self._band

    def corner(self, layer, it, tau):
        """コーナー名の帯を右からサッと出して左へ流す。"""
        dur = it.get("min", 1.0); tin = 0.18; tout = 0.18
        if tau < tin:
            x = int(W * (1 - tau / tin) ** 2)
        elif tau > dur - tout:
            k = (tau - (dur - tout)) / tout
            x = -int(W * k * k)
        else:
            x = 0
        band = self.corner_band(it)
        base = layer.copy()
        base.paste(band, (x, 700), band)
        return self.chars(base, {"who": "board", "text": ""}, 0, tau)

    def chars(self, layer, it, tau, t):
        """静止レイヤーにナギ・バクを重ねる（登場ポップ＋しゃべり中の揺れ＋待機の呼吸）。"""
        import math
        fr = layer.copy()
        who = norm_who(it.get("who", "board"))
        for c, phase in (("nagi", 0.0), ("baku", 1.7)):
            talking = who == c
            if talking:
                face = pick_face(c, it)
                spr, (fx, fy) = self.sprites.get((c, face, "talk")) or self.sprites[(c, "normal", "talk")]
                strong = face in ("max", "surprise", "tsukkomi")
                k = min(tau / 0.32, 1.0)
                scale = 0.82 + 0.18 * ease_out_back(k) if tau < 0.32 else 1.0
                jump = (46 if strong else 24) * math.sin(math.pi * min(tau / 0.34, 1.0)) if tau < 0.34 else 0
                bob = 6 * math.sin(2 * math.pi * (1.6 if strong else 1.1) * tau)
                dy = -jump - abs(bob) if strong else -jump + bob
                lean = (12 if c == "nagi" else -12) * (1 - k)   # 中央側から飛び込む
            else:
                face = IDLE_FACE[c]
                spr, (fx, fy) = self.sprites[(c, face, "idle")]
                scale = 1.0
                dy = 4 * math.sin(2 * math.pi * 0.45 * t + phase)
                lean = 0
            if scale != 1.0:
                spr = spr.resize((max(1, int(spr.width * scale)), max(1, int(spr.height * scale))), Image.BILINEAR)
                fx, fy = fx * scale, fy * scale
            x = int(CHAR_X[c] - fx + lean)
            y = int(FOOT_Y - fy + dy)
            fr.paste(spr, (x, y), spr)
        return fr

    def frame(self, sec, it):
        if it.get("title"):
            return self.title_frame(it)
        im = self.background({"bg": it.get("bg", sec.get("bg", {}))}).copy().convert("RGBA")
        d = ImageDraw.Draw(im)

        # 右上トピック
        topic = sec.get("topic")
        if topic:
            ft = font(58)
            tw = d.textlength(topic, font=ft)
            x1 = W - 40; x0 = x1 - tw - 56; y0 = 34; y1 = y0 + 92
            box = Image.new("RGBA", (int(x1 - x0), y1 - y0), (0, 0, 0, 170))
            im.alpha_composite(box, (int(x0), y0))
            d.rectangle((x0, y0, x1, y1), outline=(255, 255, 255), width=4)
            draw_stroked(d, ((x0 + x1) / 2, (y0 + y1) / 2), topic, ft, (255, 255, 255), 6)

        who = norm_who(it.get("who", "board"))
        im.alpha_composite(self.glow)
        if it.get("corner"):
            return im.convert("RGB")

        # テロップ（下部中央・下端から約12%）
        size = it.get("size", "normal")
        fnt = font(SIZES[size])
        lines = wrap(it["text"], 12 if size == "ochi" else 16)
        lh = int(SIZES[size] * 1.22)
        bottom = int(H * 0.88)
        top = bottom - lh * len(lines)
        color = COLORS[it.get("color", "white")]
        # 固定吹き出し（大きさは毎回同じ＝切替でガタつかない）
        bub = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(bub).rounded_rectangle((320, 610, W - 320, 985), 40, fill=(0, 0, 0, 115),
                                               outline=(255, 255, 255, 150), width=4)
        im.alpha_composite(bub)
        d = ImageDraw.Draw(im)
        for i, l in enumerate(lines):
            draw_stroked(d, (W // 2, top + lh * i + lh // 2), l, fnt, color, STROKE[size])

        # キャラの名札
        if who in ("nagi", "baku", "narrator"):
            name = it.get("label") or {"nagi": "ナギ", "baku": "バク", "narrator": "概要"}[who]
            col = {"nagi": (30, 80, 200), "baku": (220, 60, 30), "narrator": (70, 90, 120)}[who]
            fn = font(44)
            tw = d.textlength(name, font=fn)
            nx = 330 + tw / 2 + 50; ny = 628
            d.rounded_rectangle((nx - tw / 2 - 26, ny - 32, nx + tw / 2 + 26, ny + 32), 18, fill=col,
                                outline=(0, 0, 0), width=5)
            d.text((nx, ny), name, font=fn, fill=(255, 255, 255), anchor="mm",
                   stroke_width=4, stroke_fill=(0, 0, 0))
        return im.convert("RGB")


# ---------------------------------------------------------------- 本体
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--no-voice", action="store_true")
    ap.add_argument("--work", default="work/reaction")
    ap.add_argument("--cache", default="cache/tts_reaction")
    args = ap.parse_args()

    ep_path = Path(args.episode)
    ep = json.loads(ep_path.read_text(encoding="utf-8"))
    work = Path(args.work); shutil.rmtree(work, ignore_errors=True); work.mkdir(parents=True)

    items = []
    for si, sec in enumerate(ep["sections"]):
        for it in sec["items"]:
            it["_sec"] = si
            items.append(it)

    if args.no_voice:
        for it in items:
            n = len(it["text"].replace("\n", ""))
            it["_voice"] = np.zeros(int(SR * (it.get("min", 1.0) if it.get("corner") else max(1.1, n / 6.3))), np.float32)
    else:
        make_voice(items, ep, Path(args.cache))

    # タイムライン：声の長さ＋0.04秒。大オチ前だけBGMカット→溜め
    t = 0.0
    timeline = []
    for it in items:
        if it.get("bgm_cut"):
            it["_bgm_cut_at"] = t
        if it.get("hold_before"):
            t += OCHI_HOLD
        dur = len(it["_voice"]) / SR + GAP
        dur = max(dur, it.get("min", 1.2))
        it["_start"], it["_dur"] = t, dur
        timeline.append({"start": round(t, 3), "dur": round(dur, 3), "text": it["text"],
                         "who": it.get("who", "board"), "se": it.get("se", "pon"),
                         "topic": ep["sections"][it["_sec"]].get("topic")})
        t += dur
    total = t + END_HOLD
    (work / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"全体 {total:.1f}秒 / コメント {len(items)}件")

    # 画面：コメントごとの静止レイヤー（完全カット）＋キャラだけ毎フレーム動かす
    painter = Painter(ep, ep_path.parent)
    layers = []
    for i, it in enumerate(items):
        sec = ep["sections"][it["_sec"]]
        lay = painter.frame(sec, it).convert("RGB")
        if i in (0, len(items) - 1) or i % 5 == 0:
            lay.save(work / f"f{i:03d}.png")
        layers.append(lay)
    starts = [it["_start"] for it in items]
    vf = work / "video.mp4"
    n_frames = int(round(total * FPS))
    enc = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
        "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(vf)],
        stdin=subprocess.PIPE)
    seg = 0
    for f in range(n_frames):
        t = f / FPS
        while seg + 1 < len(items) and t >= starts[seg + 1]:
            seg += 1
        it = items[seg]
        if it.get("title"):
            fr = layers[seg]
        elif it.get("corner"):
            fr = painter.corner(layers[seg], it, t - starts[seg])
        else:
            fr = painter.chars(layers[seg], it, t - starts[seg], t)
        enc.stdin.write(fr.tobytes())
        if f % 300 == 0:
            print(f"  映像 {t:5.1f}/{total:.1f}秒")
    enc.stdin.close(); enc.wait()

    # 音声ミックス
    n_total = int(total * SR) + SR
    voice = np.zeros(n_total, np.float32)
    se = np.zeros(n_total, np.float32)
    se_cache = {}
    for it in items:
        a = int(it["_start"] * SR)
        v = it["_voice"]; voice[a:a + len(v)] += v
        kind = it.get("se", "pon")
        if kind and kind != "none":
            if kind not in se_cache:
                se_cache[kind] = synth_se(kind)
            s = se_cache[kind]
            if s is not None:
                se[a:a + len(s)] += s[: n_total - a]
    se *= 0.85 * SE_GAIN  # 声のピーク付近に対して70%

    bgm = np.zeros(n_total, np.float32)
    bgm_file = ASSETS / "bgm" / ep.get("bgm", "main.wav")
    if bgm_file.exists():
        b = read_wav_mono(bgm_file)
        rms = np.sqrt(np.mean(b ** 2)) + 1e-9
        b = b / rms * 0.22       # 声の平均的な大きさにそろえてから
        b *= ep.get("bgm_gain", BGM_GAIN)
        reps = int(np.ceil(n_total / len(b)))
        bgm = np.tile(b, reps)[:n_total]
        cut = next((it["_bgm_cut_at"] for it in items if "_bgm_cut_at" in it), None)
        resume = next((it["_start"] for it in items if it.get("bgm_resume")), None)
        if cut is not None:
            c = int(cut * SR); fade = int(0.03 * SR)
            bgm[c:c + fade] *= np.linspace(1, 0, fade)
            r = int(resume * SR) if resume is not None else n_total
            bgm[c + fade:r] = 0
            if resume is not None:
                fi = int(0.4 * SR)
                bgm[r:r + fi] *= np.linspace(0, 1, len(bgm[r:r + fi]))
    mix = voice * VOICE_GAIN + se + bgm
    peak = np.max(np.abs(mix))
    if peak > 0.98:
        mix *= 0.98 / peak
    wav = work / "mix.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())

    out = Path(args.output); out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", str(vf), "-i", str(wav),
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-t", f"{total:.3f}", "-movflags", "+faststart",
        str(out)], check=True)
    names = sorted(n for n in USED_VOICES if n)
    if names:
        (out.parent / (out.stem + "_credits.txt")).write_text(" / ".join(names), encoding="utf-8")
    print(f"完成: {out}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            print(f"::error::{e.code}")
        raise
    except Exception:
        import traceback
        tb = traceback.format_exc()
        print("::error::" + tb.replace("\n", "%0A"))
        raise
