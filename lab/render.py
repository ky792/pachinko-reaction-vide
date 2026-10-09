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
import motion  # noqa: E402

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


BACK = ("chapter", "title", "timeline", "machine", "keyword", "flow", "lineup")


def year_at(scene, t):
    """上部年表の現在地。year_track [[秒, 年], ...] の間を0.8秒かけて滑らかに動かす"""
    tr = scene.get("year_track")
    if not tr:
        return scene["chapter"]["year"], True
    i = max([j for j, (t0, _) in enumerate(tr) if t >= t0], default=0)
    if i == 0:
        return tr[0][1], True
    k = ui.prog(t, tr[i][0], 0.8)
    return tr[i - 1][1] + (tr[i][1] - tr[i - 1][1]) * ui.ease_in_out(k), k >= 1


def tank_pos(h, extra=1.0):
    """ナギの脳タンクの画面座標（呼吸の上下は無視＝解析UIを静止させるため）"""
    hq = int(round(h * extra / 4) * 4)
    img, s = ui._scaled("nagi", hq, 1.0)
    fx, fy = ui.CHAR_FOOT["nagi"]
    x = fx - img.width / 2
    y = fy - (img.height - 30)
    return (x + 20 + ui.TANK[0] * s, y + ui.TANK[1] * s)


def _draw_cue(cv, c, tl, dur, images, data_tank=None):
    tp, d = c["type"], c.get("data", {})
    if tp == "chapter":
        ui.chapter_card(cv, tl, dur, d)
    elif tp == "title":
        ui.title_card(cv, tl, dur, d)
    elif tp == "timeline":
        ui.timeline(cv, tl, dur, d)
    elif tp == "machine":
        ui.machine_card(cv, tl, dur, d, images.get(c.get("image")))
    elif tp == "keyword":
        ui.keyword(cv, tl, dur, d)
    elif tp == "flow":
        ui.flow(cv, tl, dur, d)
    elif tp == "lineup":
        ui.lineup(cv, tl, dur, d)
    elif tp == "analysis" and data_tank is not None:
        ui.analysis(cv, tl, dur, d, data_tank)


def state_key(scene, t):
    """画面のUIが止まっていれば、その状態を表すキーを返す（動いている間は None）"""
    # 要素を動かす章では座標変化をキャッシュしてしまわないようにする。
    if scene.get("motion", {}).get("elements"):
        return None
    key = []
    y, still = year_at(scene, t)
    if not still:
        return None
    cues = scene["cues"]
    chap_end = max((c["end"] for c in cues if c["type"] in ("chapter", "title")), default=0)
    if chap_end and chap_end - 0.4 <= t < chap_end + 0.15:
        return None
    key.append(round(y, 3))
    for i, c in enumerate(cues):
        if not (c["start"] <= t < c["end"]):
            continue
        if c["type"] == "tsukkomi":
            continue
        tl, dur = t - c["start"], c["end"] - c["start"]
        settle = ui.SETTLE.get(c["type"], lambda d: 0.6)(c.get("data", {}))
        outro = ui.OUTRO.get(c["type"], 0.45)
        if tl < settle or tl > dur - outro:
            return None
        key.append(("c", i))
    for i, sb in enumerate(scene["subs"]):
        if sb["start"] <= t < sb["end"]:
            tl, dur = t - sb["start"], sb["end"] - sb["start"]
            if tl < 0.22 or tl > dur - 0.17:
                return None
            key.append(("s", i))
    h, a = layout_state(scene, t)
    if not (a in (0.0, 1.0)):
        return None
    key.append((round(h), a))
    return tuple(key)


def render_layers(scene, t, images):
    ch = scene["chapter"]
    cues = scene["cues"]
    under = ui.background().copy()
    chap_end = max((c["end"] for c in cues if c["type"] in ("chapter", "title")), default=0)
    first_bg = min((c["start"] for c in cues if c["type"] in ("chapter", "title")), default=1e9)
    in_card = any(c["start"] <= t < c["end"] for c in cues if c["type"] in ("chapter", "title"))
    if in_card:
        bar_a = 0.0 if t >= first_bg + 0.3 else 1 - ui.prog(t, first_bg, 0.3)
        # 全画面表示が終わる直前から上部バーを戻す
        for c in cues:
            if c["type"] in ("chapter", "title") and c["start"] <= t < c["end"]:
                bar_a = max(bar_a, ui.ease_out(ui.prog(t, c["end"] - 0.4, 0.5)))
    else:
        bar_a = 1.0
    y, _ = year_at(scene, t)
    ui.top_bar(under, bar_a, ch["no"], ch["title"], y, ch.get("era"), scene.get("milestones", ()), ch.get("label"))
    for c in cues:
        if c["start"] <= t < c["end"] and c["type"] in BACK:
            element = motion.matching_element(scene, c)
            if element is None:
                _draw_cue(under, c, t - c["start"], c["end"] - c["start"], images)
            else:
                layer = ui.Image.new("RGBA", (ui.W, ui.H), (0, 0, 0, 0))
                _draw_cue(layer, c, t - c["start"], c["end"] - c["start"], images)
                motion.composite_element(under, layer, element.get("keyframes", []), t)
    over = ui.Image.new("RGBA", (ui.W, ui.H), (0, 0, 0, 0))
    h, a = layout_state(scene, t)
    for c in cues:
        if c["start"] <= t < c["end"] and c["type"] == "analysis" and a > 0.01:
            _draw_cue(over, c, t - c["start"], c["end"] - c["start"], images, tank_pos(h))
    for sb in scene["subs"]:
        if sb["start"] <= t < sb["end"]:
            ui.subtitle(over, t - sb["start"], sb["end"] - sb["start"], sb["who"], sb["text"], sb.get("accent", False))
    return under, over


_CACHE = {}


def render_frame(scene, t, images):
    k = state_key(scene, t)
    if k is not None and k in _CACHE:
        under, over = _CACHE[k]
    else:
        under, over = render_layers(scene, t, images)
        if k is not None:
            _CACHE.clear()
            _CACHE[k] = (under, over)
    # 資料・背景だけを仮想カメラで動かし、案内役と字幕は固定する。
    cv = motion.camera_image(under.copy(), motion.camera_state(scene, t))
    h, a = layout_state(scene, t)
    who = speaker_at(scene, t)
    if a > 0.01:
        lay = ui.Image.new("RGBA", (ui.W, ui.H), (0, 0, 0, 0))
        for c in ("nagi", "baku"):
            ui.draw_char(lay, c, h, t, talking=(who == c or who is None), extra_scale=emphasis_at(scene, c, t))
        ui.paste(cv, lay, (0, 0), a)
    cv.alpha_composite(over)
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
