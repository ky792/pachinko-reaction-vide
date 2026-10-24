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
import fx as fxmod  # noqa: E402
import motion  # noqa: E402
import skit  # noqa: E402

SR = 44100
CHAR_H = {"normal": 330, "machine": 250, "hidden": 330, "skit": 330}


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


def skit_state(scene, t):
    """寸劇モードの濃さ（0〜1）と、寸劇が始まってからの秒数。切り替えは0.4秒で滑らかに"""
    lays = sorted(scene["layout"], key=lambda x: x["start"])
    k, since = 0.0, 0.0
    for i, L in enumerate(lays):
        if t < L["start"]:
            break
        on = 1.0 if L["mode"] == "skit" else 0.0
        prev = k
        p = ui.ease_in_out(ui.prog(t, L["start"], 0.4)) if i else 1.0   # 最初から寸劇なら、いきなり寸劇
        k = prev + (on - prev) * p
        if on:
            since = t - L["start"]
    return k, since


def face_at(scene, who, t):
    for f in scene.get("faces", []):
        if f["who"] == who and f["start"] <= t < f["end"]:
            return f["face"]
    return "normal"


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


def focus_state(scene, t):
    """オチの寄り：(寄る相手, 0〜1, 拡大率)。0.3秒で寄り、終わりから0.35秒で戻す"""
    for f in scene.get("focus", []):
        if f["start"] <= t < f["end"] + 0.35:
            k = min(ui.ease_out(ui.prog(t, f["start"], 0.3)), 1 - ui.ease_in_out(ui.prog(t, f["end"], 0.35)))
            return f["who"], max(0.0, k), f.get("zoom", 1.2)
    return None, 0.0, 1.2


HIKI_IN, HIKI_OUT = 0.6, 0.5
HIKI_ZOOM, HIKI_ZOOM_SEC = 0.07, 5.0     # ヒキの間に、背景と資料へゆっくり寄る量と秒数
HIKI_BAR = 70                           # 上下の黒帯の高さ（px）


def hiki_state(scene, t):
    """ヒキの濃さ（0〜1）と始まってからの秒数。0.6秒で暗くなり、終わってから0.5秒で戻る"""
    for h in scene.get("hiki", []):
        if h["start"] <= t < h["end"] + HIKI_OUT:
            k = min(ui.ease_in_out(ui.prog(t, h["start"], HIKI_IN)), 1 - ui.ease_in_out(ui.prog(t, h["end"], HIKI_OUT)))
            return max(0.0, k), t - h["start"]
    return 0.0, 0.0


_VIG = {}


def _vignette():
    """中央は少し、周りほど深く暗くする幕（1回だけ作る）"""
    if "v" not in _VIG:
        import numpy as np
        yy, xx = np.mgrid[0:ui.H, 0:ui.W].astype(np.float32)
        r = np.sqrt(((xx - ui.W / 2) / (ui.W / 2)) ** 2 + ((yy - ui.H * 0.45) / (ui.H / 2)) ** 2) / 1.25
        a = 0.42 + 0.40 * np.clip(r, 0, 1) ** 1.6
        g = np.zeros((ui.H, ui.W, 4), np.uint8)
        g[..., 3] = (a * 255).astype(np.uint8)
        _VIG["v"] = ui.Image.fromarray(g, "RGBA")
    return _VIG["v"]


BACK = ("chapter", "title", "intro", "logo", "timeline", "machine", "keyword", "flow", "lineup", "pie", "spec_table")


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
    elif tp == "logo":
        ui.logo_card(cv, tl, dur, d)
    elif tp == "intro":
        ui.intro_card(cv, tl, dur, d)
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
    elif tp == "pie":
        ui.pie(cv, tl, dur, d, hl_at(c, c["start"] + tl) if c.get("hl") else None)
    elif tp == "spec_table":
        ui.spec_table(cv, tl, dur, d)
    elif tp == "analysis" and data_tank is not None:
        ui.analysis(cv, tl, dur, d, data_tank)


HL_SEC = 0.3   # 円グラフの注目が移るのにかける秒数


def hl_at(c, t):
    """円グラフの注目：(今の項目, 前の項目, 切り替えの進み 0〜1)。項目 None＝注目なし"""
    cur, prev, k = None, None, 1.0
    for ht, idx in c.get("hl", []):
        if t >= ht:
            prev, cur = cur, idx
            k = ui.ease_in_out(ui.prog(t, ht, HL_SEC))
    return cur, prev, k


def state_key(scene, t):
    """画面のUIが止まっていれば、その状態を表すキーを返す（動いている間は None）"""
    # 要素を動かす章では座標変化をキャッシュしてしまわないようにする。
    if scene.get("motion", {}).get("elements"):
        return None
    if focus_state(scene, t)[1] > 0 or skit_state(scene, t)[0] > 0:
        return None
    key = []
    y, still = year_at(scene, t)
    if not still:
        return None
    cues = scene["cues"]
    chap_end = max((c["end"] for c in cues if c["type"] in ("chapter", "title", "intro", "logo")), default=0)
    if chap_end and chap_end - 0.4 <= t < chap_end + 0.15:
        return None
    key.append(round(y, 3))
    if scene.get("grade"):
        key.append(("g", grade_level(scene, t)))
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
        if c.get("hl"):
            hc, _, hk = hl_at(c, t)
            if hk < 1:
                return None
            key.append(("hl", i, hc))
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


_GRADE = {}
GRADE_CARD_SEC = 0.5   # 章カードの間は色味を強く、終わってからこの秒数で普段の強さに戻す


def _grade_bg(name, grade, k):
    """章ごとの色味を背景だけにかける（キャラ・資料・字幕は元の色のまま）。
    gold＝栄光（金）／blue＝転落（色を抜いて暗い青）／goldred＝復活（金と赤）。k は強さ（普段0.6、章カードで1.0）"""
    import numpy as np
    k = round(k, 2)
    key = (name, grade, k)
    if key not in _GRADE:
        if len(_GRADE) > 24:
            _GRADE.clear()
        base = np.asarray(ui.background(name).convert("RGB")).astype(np.float32)
        lum = (base @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
        yy, xx = np.mgrid[0:ui.H, 0:ui.W].astype(np.float32)
        if grade == "gold":
            tone = lum * np.array([1.55, 1.15, 0.45], np.float32) + np.array([18, 10, 0], np.float32)
        elif grade == "blue":
            tone = lum * np.array([0.62, 0.78, 1.18], np.float32)
        elif grade == "goldred":
            side = np.clip(np.abs(xx - ui.W / 2) / (ui.W / 2), 0, 1)[..., None] ** 1.5   # 端ほど赤く
            gold = lum * np.array([1.55, 1.15, 0.45], np.float32) + np.array([18, 10, 0], np.float32)
            red = lum * np.array([1.7, 0.55, 0.45], np.float32) + np.array([24, 0, 0], np.float32)
            tone = gold * (1 - side) + red * side
        else:
            tone = base
        out = base * (1 - k) + tone * k
        _GRADE[key] = ui.Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    return _GRADE[key]


def grade_level(scene, t):
    """普段は0.6。章カードの間は1.0（重要な切り替えの瞬間だけ強く）"""
    lv = 0.6
    for c in scene["cues"]:
        if c["type"] == "chapter" and c.get("data", {}).get("grade"):
            if c["start"] <= t < c["end"]:
                lv = 1.0
            elif c["end"] <= t < c["end"] + GRADE_CARD_SEC:
                lv = max(lv, 1.0 - 0.4 * ui.ease_in_out(ui.prog(t, c["end"], GRADE_CARD_SEC)))
    return round(lv * 20) / 20     # 段階を粗くして、作った背景を使い回す


def render_layers(scene, t, images):
    ui.apply_theme(scene.get("theme"))
    ch = scene["chapter"]
    cues = scene["cues"]
    name = scene.get("background") or "lab_room.png"
    if scene.get("grade"):
        under = _grade_bg(name, scene["grade"], grade_level(scene, t)).copy()
    else:
        under = ui.background(name).copy()
    chap_end = max((c["end"] for c in cues if c["type"] in ("chapter", "title", "intro", "logo")), default=0)
    first_bg = min((c["start"] for c in cues if c["type"] in ("chapter", "title", "intro", "logo")), default=1e9)
    in_card = any(c["start"] <= t < c["end"] for c in cues if c["type"] in ("chapter", "title", "intro", "logo"))
    if in_card:
        bar_a = 0.0 if t >= first_bg + 0.3 else 1 - ui.prog(t, first_bg, 0.3)
        # 全画面表示が終わる直前から上部バーを戻す
        for c in cues:
            if c["type"] in ("chapter", "title", "intro", "logo") and c["start"] <= t < c["end"]:
                bar_a = max(bar_a, ui.ease_out(ui.prog(t, c["end"] - 0.4, 0.5)))
    else:
        bar_a = 1.0
    bar_a *= 1 - skit_state(scene, t)[0]
    y, _ = year_at(scene, t)
    ui.top_bar(under, bar_a, ch["no"], ch["title"], y, ch.get("era"), scene.get("milestones", ()), ch.get("label"), scene.get("chips"))
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
    cam = motion.camera_state(scene, t)
    hk, hsince = hiki_state(scene, t)
    if hk > 0:                                   # ヒキ：資料と背景にゆっくり寄る
        cam = dict(cam, zoom=cam["zoom"] * (1 + HIKI_ZOOM * hk * ui.ease_in_out(ui.prog(hsince, 0, HIKI_ZOOM_SEC))))
    cv = motion.camera_image(under.copy(), cam)
    h, a = layout_state(scene, t)
    who = speaker_at(scene, t)
    fw, fk, fz = focus_state(scene, t)
    if fk > 0:                                   # 背景と資料を暗くして、キャラに目を向ける（大きく寄るほど暗く）
        shade = ui.Image.new("RGBA", (ui.W, ui.H), (0, 0, 0, int(255 * min(0.6, 0.35 + 0.2 * (fz - 1.2)) * fk)))
        cv.alpha_composite(shade)
    if hk > 0:                                   # ヒキ：周りから暗く＋上下に黒帯
        vig = _vignette()
        cv.alpha_composite(vig if hk >= 0.999 else ui.fade(vig, hk))
        bar = int(round(HIKI_BAR * ui.ease_out(hk)))
        if bar > 0:
            d = ui.ImageDraw.Draw(cv)
            d.rectangle((0, 0, ui.W, bar), fill=(0, 0, 0, 255))
            d.rectangle((0, ui.H - bar, ui.W, ui.H), fill=(0, 0, 0, 255))
    sk, since = skit_state(scene, t)
    if sk > 0.01:
        skit.draw(cv, scene, t, who, ui.prog(since, 0, 0.7), sk, lambda w, tt: face_at(scene, w, tt))
    a *= 1 - sk
    if a > 0.01:
        for c in ("nagi", "baku"):
            lay = ui.Image.new("RGBA", (ui.W, ui.H), (0, 0, 0, 0))
            ex = emphasis_at(scene, c, t) * (1 + (fz - 1) * fk if c == fw else 1.0)
            shift = 0.0
            if c == fw and fz > 1.3:             # 大きく寄るときは画面の内側へ（端で切れないように）
                shift = (1 if c == "nagi" else -1) * 230 * (fz - 1.2) / 1.2 * fk
            ui.draw_char(lay, c, h, t, talking=(who == c or who is None), extra_scale=ex, face=face_at(scene, c, t), shift=shift)
            dim = (1 - 0.5 * fk if fw and c != fw else 1.0) * (1 - 0.45 * hk if who and c != who else 1.0)
            ui.paste(cv, lay, (0, 0), a * dim)
    fxmod.draw(cv, scene, t)                 # 再現演出（キャラの上・字幕の下。lab/fx.py）
    dx, dy = fxmod.shake(scene, t)
    if dx or dy:                             # レバー振動：字幕以外を画面ごと揺らす（端が見えないよう少し拡大）
        z = cv.resize((int(ui.W * 1.02), int(ui.H * 1.02)), ui.Image.BILINEAR)
        cv.paste(z, (int(-ui.W * 0.01 + dx), int(-ui.H * 0.01 + dy)))
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
