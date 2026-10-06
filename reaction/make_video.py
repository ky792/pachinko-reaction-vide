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


def voicevox_one(text, v, out_path):
    import urllib.parse, urllib.request
    base = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")
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


def make_voice(items, ep, cache_dir):
    """各コメントの読み上げ音声（edge-tts）を作る。キャッシュあり。"""
    cache_dir.mkdir(parents=True, exist_ok=True)
    voices = ep["voices"]
    rep = ep.get("reading", {})
    board_cycle = voices["board"]
    bi = 0
    for it in items:
        who = it.get("who", "board")
        if who == "board":
            v = board_cycle[bi % len(board_cycle)]; bi += 1
        else:
            v = voices[who]
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
        self.hall = Image.open(ASSETS / "backgrounds" / "hall_real.png").convert("RGB").resize((W, H))
        self.chars = {}
        for who in ("rabbit", "cat"):
            d = {}
            for p in (ASSETS / "characters" / who).glob("*.png"):
                im = Image.open(p).convert("RGBA")
                if who == "cat":
                    im = im.transpose(Image.FLIP_LEFT_RIGHT)
                d[p.stem] = im
            self.chars[who] = d
        self.bg_cache = {}

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
            base.paste(fg, ((W - fg.width) // 2, 24))
        else:
            # 画像が無い時：ホール背景を暗くして、機種名パネルを出す
            base = Image.blend(base.filter(ImageFilter.GaussianBlur(3)), Image.new("RGB", (W, H), (0, 0, 0)), 0.42)
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

    def frame(self, sec, it):
        if it.get("title"):
            return self.title_frame(it)
        im = self.background(sec).copy().convert("RGBA")
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

        # キャラ（左下うさぎ・右下ねこ）。しゃべっている方を大きく前に
        who = it.get("who", "board")
        for c, x_left in (("rabbit", True), ("cat", False)):
            talking = (who == c)
            face = it.get("face", "normal") if talking else "normal"
            src = self.chars[c].get(face) or self.chars[c]["normal"]
            hgt = 430 if talking else 330
            ch = src.resize((int(src.width * hgt / src.height), hgt))
            if not talking and who != "board":
                ch = Image.blend(Image.new("RGBA", ch.size, (0, 0, 0, 0)), ch, 0.85)
            x = 10 if x_left else W - ch.width - 10
            im.alpha_composite(ch, (x, H - ch.height - 10))

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
        ImageDraw.Draw(bub).rounded_rectangle((290, 610, W - 290, 985), 40, fill=(0, 0, 0, 115),
                                               outline=(255, 255, 255, 150), width=4)
        im.alpha_composite(bub)
        d = ImageDraw.Draw(im)
        for i, l in enumerate(lines):
            draw_stroked(d, (W // 2, top + lh * i + lh // 2), l, fnt, color, STROKE[size])

        # キャラの名札
        if who in ("rabbit", "cat", "narrator"):
            name = {"rabbit": "うさぎ", "cat": "ねこ", "narrator": "概要"}[who]
            col = {"rabbit": (255, 120, 160), "cat": (255, 150, 40), "narrator": (70, 90, 120)}[who]
            fn = font(44)
            tw = d.textlength(name, font=fn)
            nx = W // 2; ny = top - 46
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
            it["_voice"] = np.zeros(int(SR * max(1.1, n / 6.3)), np.float32)
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

    # 画面（コメントごとに1枚・完全カット）
    painter = Painter(ep, ep_path.parent)
    concat = []
    prev_frame = None
    for i, it in enumerate(items):
        sec = ep["sections"][it["_sec"]]
        if it.get("hold_before") and prev_frame:
            concat.append((prev_frame, OCHI_HOLD))
        p = work / f"f{i:03d}.png"
        painter.frame(sec, it).save(p)
        dur = it["_dur"] + (END_HOLD if i == len(items) - 1 else 0)
        concat.append((p, dur))
        prev_frame = p
    lst = work / "frames.txt"
    with open(lst, "w") as f:
        for p, d in concat:
            f.write(f"file '{p.resolve()}'\nduration {d:.3f}\n")
        f.write(f"file '{concat[-1][0].resolve()}'\n")

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
        if cut is not None:
            c = int(cut * SR); fade = int(0.03 * SR)
            bgm[c:c + fade] *= np.linspace(1, 0, fade)
            bgm[c + fade:] = 0
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
        "ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(wav),
        "-vf", f"fps={FPS},format=yuv420p", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-t", f"{total:.3f}", "-movflags", "+faststart",
        str(out)], check=True)
    print(f"完成: {out}")


if __name__ == "__main__":
    main()
