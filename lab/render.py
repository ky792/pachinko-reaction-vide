#!/usr/bin/env python3
"""scene.json（台本＋演出の指定）から研究所フォーマットの動画を書き出す。

使い方:
  python lab/render.py episodes/lab_demo/scene.json -o output/lab_demo.mp4
  python lab/render.py ... --stills 1,4.5,9,13,18   # 指定秒の静止画だけ書き出す（確認用）

scene.json の中身（すべて秒指定）:
  chapter   : 上部バーに出す章番号・章タイトル・年・扱う期間(era)
  cues      : 部品ごとの出番。type = chapter / machine / analysis / tsukkomi
  layout    : キャラの大きさの切り替え（normal / machine / hidden）
  subs      : 字幕（who = nagi / baku、{…} は重要数字色）
  emphasis  : 話者の一時拡大（バクのツッコミなど）
  se, bgm   : 効果音とBGM
"""
import argparse
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui  # noqa: E402

SR = 44100
CHAR_H = {"normal": 330, "machine": 250, "hidden": 330}


def layout_state(scene, t):
    """キャラの高さと表示度を、切り替えの前後0.4秒で滑らかにつなぐ"""
    lays = sorted(scene["layout"], key=lambda x: x["start"])
    i = max([j for j, L in enumerate(lays) if t >= L["start"]], default=0)
    cur, prev = lays[i], (lays[i - 1] if i > 0 else None)
    k =ui.ease_in_out(ui.prog(t, cur["start"], 0.4)) if prev else 1.0

    def val(L):
        return CHAR_H[L["mode"]], 0.0 if L["mode"] == "hidden" else 1.0
    h1, a1 = val(cur)
    if prev is None:
        return h1, a1
    h0, a0 = val(prev)
    return h0 + (h1 - h0) * k, a0 + (a1 - a0) * k


def speaker_at(scene, t):
    for s in scene["subs"]:
        if s["start"] <= t < s["end"]:
            return s["who"]
    return None


def emphasis_at(scene, who, t):
    for e in scene.get("emphasis", []):
        if e["who"] == who and e["start"] <= t < e["end"] + 0.3:
            up = ui.ease_out_back(ui.prog(t, e["start"], 0.25), 1.6)
            down = 1 - ui.ease_in_out(ui.prog(t, e["end"], 0.3))
            return 1 + (e.get("scale", 1.12) - 1) * min(up, down)
    return 1.0


def render_frame(scene, t, images):
    cv = ui.background().copy()
    ch = scene["chapter"]
    cues = scene["cues"]
    chap_end = max((c["end"] for c in cues if c["type"] == "chapter"), default=0)
    bar_a = ui.ease_out(ui.prog(t, chap_end - 0.4, 0.5)) if chap_end else 1.0
    ui.top_bar(cv, bar_a, ch["no"], ch["title"], ch["year"], ch.get("era"), scene.get("milestones", ()))

    # 資料（キャラより奥）
    tank_screen = None
    for c in cues:
        if not (c["start"] <= t < c["end"]):
            continue
        tl, dur = t - c["start"], c["end"] - c["start"]
        if c["type"] == "chapter":
            ui.chapter_card(cv, tl, dur, c["data"])
        elif c["type"] == "timeline":
            ui.timeline(cv, tl, dur, c["data"])
        elif c["type"] == "machine":
            ui.machine_card(cv, tl, dur, c["data"], images.get(c.get("image")))

    # キャラ
    h, a = layout_state(scene, t)
    who = speaker_at(scene, t)
    xf = {}
    if a > 0.01:
        lay = ui.Image.new("RGBA", (ui.W, ui.H), (0, 0, 0, 0))
        for c in ("nagi", "baku"):
            xf[c] = ui.draw_char(lay, c, h, t, talking=(who == c or who is None), extra_scale=emphasis_at(scene, c, t))
        ui.paste(cv, lay, (0, 0), a)

    # キャラに紐づく演出（手前）
    for c in cues:
        if not (c["start"] <= t < c["end"]):
            continue
        tl, dur = t - c["start"], c["end"] - c["start"]
        if c["type"] == "analysis" and "nagi" in xf:
            tank_screen = xf["nagi"](ui.TANK[0], ui.TANK[1])
            ui.analysis(cv, tl, dur, c["data"], tank_screen)
        elif c["type"] == "tsukkomi" and "baku" in xf:
            ui.tsukkomi_lines(cv, tl, xf["baku"](170, 150))

    for s in scene["subs"]:
        if s["start"] <= t < s["end"]:
            ui.subtitle(cv, t - s["start"], s["end"] - s["start"], s["who"], s["text"], s.get("accent", False))
    return cv.convert("RGB")


def read_wav_mono(path):
    with wave.open(str(path)) as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        x = np.frombuffer(w.readframes(n), {2: np.int16, 4: np.int32}[sw]).astype(np.float32)
    x = x.reshape(-1, ch).mean(1) / (32768.0 if sw == 2 else 2 ** 31)
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)
    return x


def mix_audio(scene, out_wav):
    sys.path.insert(0, str(ui.ROOT / "reaction"))
    from make_video import synth_se  # 既存の効果音合成を共用
    n = int(scene["duration"] * SR) + SR // 2
    mix = np.zeros(n, np.float32)
    for s in scene.get("se", []):
        x = synth_se(s["kind"])
        if x is None:
            continue
        a = int(s["t"] * SR)
        seg = x[: n - a] * s.get("gain", 0.5)
        mix[a:a + len(seg)] += seg
    b = scene.get("bgm")
    if b:
        p = ui.ASSETS / "bgm" / b["file"]
        if p.exists():
            x = read_wav_mono(p)
            x = np.tile(x, n // len(x) + 1)[:n]
            env = np.minimum(1, np.minimum(np.arange(n) / (SR * 1.0), (n - np.arange(n)) / (SR * 1.5)))
            mix += x / (np.abs(x).max() + 1e-9) * b.get("gain", 0.12) * env
    mix = np.clip(mix, -1, 1)
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--stills", help="カンマ区切りの秒。指定するとその瞬間のPNGだけ書き出す")
    args = ap.parse_args()
    scene_path = Path(args.scene)
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    images = {}
    for c in scene["cues"]:
        name = c.get("image")
        if name:
            p = scene_path.parent / "images" / name
            if p.exists():
                images[name] = Image.open(p).convert("RGBA")
            else:
                print(f"  画像なし → 仮パネルで表示: {name}")
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.stills:
        for s in args.stills.split(","):
            render_frame(scene, float(s), images).save(out.with_name(f"{out.stem}_{float(s):05.2f}.png"))
        return
    n = int(round(scene["duration"] * ui.FPS))
    vtmp = out.with_suffix(".video.mp4")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", f"{ui.W}x{ui.H}", "-r", str(ui.FPS), "-i", "-", "-c:v", "libx264",
                            "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(vtmp)], stdin=subprocess.PIPE)
    for f in range(n):
        enc.stdin.write(render_frame(scene, f / ui.FPS, images).tobytes())
        if f % 60 == 0:
            print(f"  {f / ui.FPS:5.1f}/{scene['duration']}秒")
    enc.stdin.close(); enc.wait()
    wav = out.with_suffix(".wav")
    mix_audio(scene, wav)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(vtmp), "-i", str(wav), "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", str(out)], check=True)
    vtmp.unlink(); wav.unlink()
    print("完成:", out)


if __name__ == "__main__":
    main()
