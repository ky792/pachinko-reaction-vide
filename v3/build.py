#!/usr/bin/env python3
"""ナギバク V3：台本から動画を作る入口

  python -m v3.build episodes/v3_hokuto -o output/v3_hokuto.mp4
  python -m v3.build episodes/v3_hokuto --plan                  # シーン構成と必要素材だけ表示（PLAN.md を書き出す）
  python -m v3.build episodes/v3_hokuto -o out.png --stills 3,8  # 静止画で確認
  python -m v3.build episodes/v3_hokuto -o out.mp4 --final      # 本番：許諾が ok の素材だけ使う

流れ：台本 → シーン自動構成（planner）→ 素材読み込み（media）→ レイアウト（templates）
      → モーション・キャラ（hosts）→ 字幕・音声同期 → MP4
"""
import argparse
import re
import subprocess
import sys
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import fx, hosts, moments, sfx
from .media import Library
from .photos import PhotoLib
from .planner import Planner
from .style import (W, H, FPS, SR, ROOT, NAVY, TEXT, SPEAKER, NAME, font, prog, out3, inout, put, fade_img,
                    text_layer, bottom_shade, program_tag)
from .templates import TEMPLATES

TRANS_DUR = {"cut": 0.0, "fade": 0.35, "zoom": 0.45, "push": 0.45}


# ---------------------------------------------------------------- シーンの準備
def prepare(scenes):
    for sc in scenes:
        s0 = sc["start"]
        lines = sc["lines"]

        def cue(phrase, default, lines=lines, s0=s0):
            """その語句をナレーションで言う瞬間（シーン内の秒）"""
            if phrase is None:
                return default
            for ln in lines:
                i = ln["text"].find(str(phrase))
                if i >= 0:
                    return ln["start"] - s0 + ln["dur"] * i / max(1, len(ln["text"]))
            return default

        sc["cue"] = cue
        sc["_busy"] = TEMPLATES[sc["template"]].busy(sc)
        cache = {}

        def plan_for(who, exclaim=False, sc=sc, cache=cache):
            if (who, exclaim) not in cache:
                cache[(who, exclaim)] = hosts.resolve(sc, who, exclaim)
            return cache[(who, exclaim)]

        sc["_host_plan"] = plan_for
        first = {}
        for ln in lines:
            for who in plan_for(ln["who"], ln["exclaim"]):
                first.setdefault(who, max(0.0, ln["start"] - s0 - 0.15))
        sc["_host_first"] = first
        # 演出のタイミング（効果音・フラッシュ・画面振動）。テンプレートの events ＋ バクのツッコミ
        ev = [(s0 + t, k) for t, k in getattr(TEMPLATES[sc["template"]], "events", lambda _: [])(sc)]
        for ln in lines:
            if ln["exclaim"] and ln["who"] == "baku":
                ev += [(ln["start"] + t, k) for t, k in moments.tsukkomi_events(0.0)]
        if sc["opts"].get("intro") == "era_shift":
            ev += [(s0 + t, k) for t, k in moments.era_events(sc["opts"]["reels"])]
        if sc["opts"].get("intro") == "chapter":
            ev += [(s0 + t, k) for t, k in moments.chapter_events()]
        ev += [(s0 + t, k) for t, k in moments.overlay_events(sc)]
        sc["_events"] = ev


def current_line(sc, t_abs):
    for ln in sc["lines"]:
        if ln["start"] <= t_abs < ln["start"] + ln["dur"] + 0.3:
            return ln
    return None


# ---------------------------------------------------------------- 字幕
def split_parts(text, limit=30):
    sents = [s for s in re.split(r"(?<=[。！？!?])", text) if s]
    parts, buf = [], ""
    for s in sents:
        if buf and len(buf) + len(s) > limit:
            parts.append(buf); buf = s
        else:
            buf += s
    if buf:
        parts.append(buf)
    out = []
    for p in parts:
        while len(p) > limit:
            cm = [i for i, ch in enumerate(p[:-1]) if ch == "、" and 6 <= i <= len(p) - 6]
            if not cm:
                break
            c = min(cm, key=lambda i: abs(i - len(p) / 2))
            out.append(p[:c + 1]); p = p[c + 1:]
        out.append(p)
    return out


def wrap(text, width=20):
    if len(text) <= width:
        return [text]
    best = min((i for i in range(1, len(text))), key=lambda i: abs(i - len(text) / 2) - (8 if text[i - 1] in "、。！？" else 0))
    while text[best] in "、。！？」ー" and best < len(text) - 1:
        best += 1
    return [text[:best], text[best:]]


@lru_cache(maxsize=256)
def sub_img(txt, who):
    lines = wrap(txt)
    size = 60
    f = font("black", size)
    lay = [text_layer(l, f, TEXT, stroke=8, stroke_fill=NAVY, pad=20) for l in lines]
    w = max(l.width for l in lay)
    h = sum(l.height for l in lay) - 20 * (len(lay) - 1)
    out = Image.new("RGBA", (w + 140, h + 20), (0, 0, 0, 0))
    y = 10
    for l in lay:
        sh = l.copy()
        sh = Image.merge("RGBA", (*Image.new("RGB", l.size, (0, 0, 0)).split(), l.split()[3])).filter(ImageFilter.GaussianBlur(8))
        out.alpha_composite(fade_img(sh, 0.55), ((out.width - l.width) // 2, y + 6))
        out.alpha_composite(l, ((out.width - l.width) // 2, y))
        y += l.height - 20
    # 話者の小さな名札（キャラが画面にいなくても誰の言葉か分かる）
    d = ImageDraw.Draw(out)
    fn = font("black", 26)
    nm = NAME[who]
    tw = d.textlength(nm, font=fn)
    x0 = (out.width - lay[0].width) // 2 - tw - 28
    d.rounded_rectangle((x0, 34, x0 + tw + 24, 74), 8, fill=SPEAKER[who] + (235,))
    d.text((x0 + 12 + tw / 2, 54), nm, font=fn, fill=NAVY, anchor="mm")
    return out


def draw_subtitle(cv, sc, t_abs):
    ln = current_line(sc, t_abs)
    if not ln or t_abs > ln["start"] + ln["dur"] + 0.15:
        return
    parts = split_parts(ln["text"])
    total = sum(len(p) for p in parts)
    tt = ln["start"]
    for p in parts:
        pd = ln["dur"] * len(p) / total
        last = p is parts[-1]
        if tt <= t_abs < tt + pd + (0.15 if last else 0):
            im = sub_img(p, ln["who"])
            a = prog(t_abs, tt, 0.1)
            put(cv, im, ((W - im.width) / 2, H - 50 - im.height), a)
            return
        tt += pd


# ---------------------------------------------------------------- 1枚
def scene_frame(sc, t_abs, lib, with_hosts=True):
    cv = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    t = t_abs - sc["start"]
    TEMPLATES[sc["template"]].draw(cv, sc, t, lib)
    moments.overlay(cv, sc, t)
    if sc["opts"].get("intro") == "era_shift":
        moments.era_shift(cv, t, sc["opts"]["reels"], sc["opts"].get("intro_title", "TURNING POINT"))
    if sc["opts"].get("intro") == "chapter":
        o = sc["opts"]
        moments.chapter(cv, t, o.get("chapter", ""), o.get("chapter_sub", ""), o.get("chapter_no", ""))
    if with_hosts:
        ln = current_line(sc, t_abs)
        who = ln["who"] if ln else (sc["lines"][-1]["who"] if sc["lines"] else None)
        line_t = t_abs - ln["start"] if ln else 99
        hosts.draw(cv, sc, t, who, line_t, bool(ln and ln["exclaim"]), ln["text"] if ln else "")
    return cv


FLASH = {"flash": (0.42, (255, 255, 255)), "flash_s": (0.22, (255, 255, 255)),   # 強さは控えめ（目に優しく、要所だけ）
         "flash_r": (0.30, (255, 70, 80))}
SHAKE = {"shake": 13, "shake_s": 6}


def screen_fx(cv, scenes, t):
    for sc in scenes:
        for t0, kind in sc["_events"]:
            if kind in FLASH and 0 <= t - t0 < 0.3:
                fx.flash(cv, t, t0, FLASH[kind][0], col=FLASH[kind][1])
    dx = dy = 0
    for kind, amp in SHAKE.items():
        evs = [t0 for sc in scenes for t0, k in sc["_events"] if k == kind]
        ox, oy = fx.shake_offset(t, evs, amp=amp)
        dx += ox; dy += oy
    return fx.apply_shake(cv, (dx, dy))


def frame(scenes, total, t, lib):
    i = max(j for j, s in enumerate(scenes) if s["start"] <= t or j == 0)
    sc = scenes[i]
    cv = scene_frame(sc, t, lib)
    td = TRANS_DUR.get(sc["trans"], 0)
    if i > 0 and td and t - sc["start"] < td:
        p = (t - sc["start"]) / td
        prev = scene_frame(scenes[i - 1], t, lib)
        prev_tpl = TEMPLATES[scenes[i - 1]["template"]]
        if sc["trans"] == "zoom" and hasattr(prev_tpl, "focus_point"):
            # 写真→図解：前の画面の「注目の数字」へ寄っていき、そのまま数字の画面になる
            fpx, fpy = prev_tpl.focus_point(scenes[i - 1])
            z = 1 + 1.4 * inout(p)
            big = prev.resize((int(W * z), int(H * z)), Image.BILINEAR)
            ox, oy = fpx * z - fpx - (W / 2 - fpx) * inout(p), fpy * z - fpy - (H / 2 - fpy) * inout(p)
            ox, oy = int(min(max(0, ox), big.width - W)), int(min(max(0, oy), big.height - H))
            prev_z = big.crop((ox, oy, ox + W, oy + H))
            zi = 1 + 0.08 * (1 - out3(p))
            nb = cv.resize((int(W * zi), int(H * zi)), Image.BILINEAR)
            cvz = nb.crop(((nb.width - W) // 2, (nb.height - H) // 2, (nb.width - W) // 2 + W, (nb.height - H) // 2 + H))
            cv = Image.blend(prev_z, cvz, inout(prog(p, 0.35, 0.65)))
        elif sc["trans"] == "zoom":
            z = 1 + 0.12 * (1 - out3(p))
            big = cv.resize((int(W * z), int(H * z)), Image.BILINEAR)
            cv = big.crop(((big.width - W) // 2, (big.height - H) // 2, (big.width - W) // 2 + W, (big.height - H) // 2 + H))
            if p < 0.6:
                cv = cv.filter(ImageFilter.GaussianBlur(10 * (1 - p / 0.6)))
            cv = Image.blend(prev, cv, inout(p))
        elif sc["trans"] == "push":
            k = inout(p)
            out = Image.new("RGBA", (W, H), (0, 0, 0, 255))
            out.paste(prev, (int(-W * k), 0))
            out.paste(cv, (int(W * (1 - k)), 0))
            cv = out
        else:
            cv = Image.blend(prev, cv, inout(p))
    cv = screen_fx(cv, scenes, t)          # 揺れ・フラッシュは絵だけ。字幕は揺らさない
    program_tag(cv)
    cv.alpha_composite(bottom_shade(), (0, H - 300))
    if sc["template"] in ("E", "F") and sc["opts"].get("source"):      # 要点・掛け合いの画面の出典（台本の source=）
        from .style import source_line
        source_line(cv, sc["opts"]["source"])
    draw_subtitle(cv, sc, t)
    if t > total - 0.6:
        cv = Image.blend(cv, Image.new("RGBA", (W, H), (0, 0, 0, 255)), prog(t, total - 0.6, 0.6))
    return cv.convert("RGB")


# ---------------------------------------------------------------- 音
BPM = 120
SE_GAIN = {"hold": 0.32, "hold_gold": 0.4, "tick": 0.14, "impact": 0.55, "fanfare": 0.3, "sparkle": 0.16,
           "boing": 0.3, "whoosh": 0.22, "pop": 0.2, "stamp": 0.4,
           "senbare": 0.22, "jingle": 0.34, "scan": 0.2, "slap": 0.3, "reel_tick": 0.08, "reel_stop": 0.4,
           "reach": 0.18, "align": 0.32, "shock": 0.55, "chapter": 0.3}


def _kick(n):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t * 35)) / SR) * np.exp(-t * 11)


def _hat(n, rng):
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    return (x - np.convolve(x, np.ones(6) / 6, "same")) * np.exp(-t * 60)


def synth_bgm(total, scenes):
    """明るく弾む研究所BGM（オリジナル）。情報が出る場面はドラムで前に進め、数字の直前は一瞬止めて溜める"""
    n = int(total * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    rng = np.random.default_rng(7)
    prog_ = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]      # C - Am - F - G
    f = lambda m: 440 * 2 ** ((m - 69) / 12)
    beat = 60 / BPM
    bar = beat * 4
    # パッド＋ベース（小節ごとにコード進行）
    for bi, st in enumerate(np.arange(0, total, bar)):
        a, b = int(st * SR), min(n, int((st + bar) * SR))
        tt = t[a:b] - st
        ch = prog_[bi % 4]
        seg = np.zeros(b - a)
        for m in ch:
            for det in (-0.1, 0.1):
                seg += np.sin(2 * np.pi * f(m + det) * tt) * 0.05
        for k in range(8):               # 8分のベース（ルート→オクターブ）
            s8 = int(k * beat / 2 * SR)
            ln_ = min(int(beat / 2 * SR), len(tt) - s8)
            if ln_ <= 0:
                break
            t8 = np.arange(ln_) / SR
            fr = f(ch[0] - 24 + (12 if k % 2 else 0))
            seg[s8:s8 + ln_] += np.sign(np.sin(2 * np.pi * fr * t8)) * 0.05 * np.exp(-t8 * 9)
        # きらっとしたベル（2拍目と4拍目の裏）
        for k in (3, 7):
            s8 = int(k * beat / 2 * SR)
            ln_ = min(int(0.4 * SR), len(tt) - s8)
            if ln_ > 0:
                t8 = np.arange(ln_) / SR
                seg[s8:s8 + ln_] += np.sin(2 * np.pi * f(ch[(k // 4) + 1] + 12) * t8) * 0.05 * np.exp(-t8 * 8)
        out[a:b] += seg
    # ドラム：B/C/D/E は全開、A/F は軽く
    drum_on = np.zeros(n, np.float32)
    for sc in scenes:
        a, b = int(sc["start"] * SR), min(n, int((sc["start"] + sc["dur"]) * SR))
        drum_on[a:b] = 1.0 if sc["template"] in ("B", "C", "D", "E") else 0.45
        if sc["opts"].get("intro") == "era_shift":             # リールの間もドラムを止める
            drum_on[a:int((sc["start"] + moments.ERA["align"]) * SR)] = 0.0
        if sc["template"] == "D" and sc["variant"] == "stat":    # 保留変化の間は止めて溜める
            from .templates import SLAM
            from .templates import DONE
            from .templates import stat_shift
            sh = stat_shift(sc)
            c0 = int((sc["start"] + sh) * SR)
            c1 = int((sc["start"] + sh + (SLAM if sc["opts"].get("tone") == "shock" else DONE)) * SR)
            drum_on[c0:c1] = 0.0
    kick, hat = _kick(int(0.3 * SR)), _hat(int(0.08 * SR), rng)
    for bt in np.arange(0, total, beat / 2):
        a = int(bt * SR)
        if a >= n:
            break
        g = drum_on[a]
        if g <= 0:
            continue
        on_beat = abs((bt / beat) - round(bt / beat)) < 1e-6
        x = kick * 0.5 if on_beat else hat * 0.12
        m = min(len(x), n - a)
        out[a:a + m] += x[:m] * g
    return out * np.minimum(1, t / 0.8) * np.minimum(1, (total - t) / 1.5)


def build_audio(scenes, total, path):
    n = int(total * SR)
    mix = synth_bgm(total, scenes) * 0.55
    for sc in scenes:
        for t0, kind in sc["_events"]:
            if kind not in SE_GAIN:
                continue
            x = sfx.make(kind)
            a = int(t0 * SR)
            if a >= n:
                continue
            seg = x[: n - a] * SE_GAIN[kind]
            mix[a:a + len(seg)] += seg
    for sc in scenes:   # 声（voices/<ID>.wav があれば）
        for ln in sc["lines"]:
            if ln.get("voice"):
                with wave.open(ln["voice"]) as w:
                    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
                    if w.getnchannels() > 1:
                        x = x.reshape(-1, w.getnchannels()).mean(1)
                    if w.getframerate() != SR:
                        x = np.interp(np.arange(int(len(x) * SR / w.getframerate())) * w.getframerate() / SR, np.arange(len(x)), x)
                a = int(ln["start"] * SR)
                mix[a:a + len(x)] += x[: n - a]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- 計画の書き出し
def write_plan(ep, scenes, lib, total):
    rows = [f"# シーン構成（自動生成）  合計 {total:.1f}秒", "",
            "| # | 開始 | 長さ | テンプレート | 選び方 | キャラ | セリフ |", "| --- | --- | --- | --- | --- | --- | --- |"]
    names = {"A": "A 写真", "B": "B 機種紹介", "C": "C 年表・カレンダー", "D": "D 数字・比較", "E": "E 要点", "F": "F 掛け合い",
             "R": "R 時代のレール", "T": "T 年表", "V": "V 2台の対比", "S": "S 資料カード"}
    for i, sc in enumerate(scenes):
        hs = sorted({w for ln in sc["lines"] for w in sc["_host_plan"](ln["who"], ln["exclaim"])})
        rows.append(f"| {i + 1} | {sc['start']:.1f} | {sc['dur']:.1f} | {names[sc['template']]}（{sc['variant']}） | "
                    f"{'自動' if sc.get('auto') else '台本で指定'} | {'・'.join(NAME[h] for h in hs) or 'なし'} | "
                    f"{' / '.join(l['text'] for l in sc['lines'])} |")
    rows += ["", "## 素材", "", "| キー | 状態 | ファイル | 許諾 |", "| --- | --- | --- | --- |"]
    for k, st, f, lic in lib.report:
        rows.append(f"| {k} | {st} | {f} | {lic} |")
    (Path(ep) / "PLAN.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
    print("\n".join(rows))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("-o", "--output")
    ap.add_argument("--stills")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--final", action="store_true")
    ap.add_argument("--range", help="映像だけを a,b 秒の範囲で書き出す（章ごとの分割レンダリング用。音声なし）")
    ap.add_argument("--audio", action="store_true", help="全編の音声（WAV）だけを書き出す")
    ap.add_argument("--chapters", action="store_true", help="章の開始秒を JSON で表示する")
    a = ap.parse_args()
    ep = Path(a.episode)
    pl = Planner(ep)
    scenes = pl.plan()
    total = scenes[-1]["start"] + scenes[-1]["dur"] + 0.4
    scenes[-1]["dur"] += 0.4
    prepare(scenes)
    lib = Library(ep, final=a.final)
    from . import style as _style
    _style.REVIEW = None if a.final else pl.data.get("review_label")
    lib.photos = PhotoLib(final=a.final)
    for sc in scenes:          # 必要素材を先に読み込んで一覧にする
        if sc["template"] == "A" and not sc["opts"].get("hall") and sc["variant"] != "archive":
            lib.get(sc["opts"].get("asset", "hall"))
        if sc["template"] == "A" and sc["variant"] == "archive":
            lib.photos.hall(sc["opts"].get("hall", "max_era"), sc["opts"].get("role", "main"))
        if sc["template"] == "A" and sc["opts"].get("hall"):
            lib.photos.hall(sc["opts"]["hall"], sc["opts"].get("role", "photo"))
    for m in pl.machines.values():                 # 回に出てくる機種の写真をすべて確認（不足一覧に出す）
        if m.get("photos"):
            lib.photos.machine(m["photos"], "front")
    for sc in scenes:
        if sc.get("machine") and sc["machine"].get("photos"):
            for role in ("front", "detail", "cabinet"):
                lib.photos.machine(sc["machine"]["photos"], role)
    write_plan(ep, scenes, lib, total)
    print("\n".join(lib.photos.write_missing(ep)))
    if a.plan:
        return
    if a.chapters:
        import json
        ch = [{"start": round(sc["start"], 3), "name": sc["opts"].get("chapter", ""), "sub": sc["opts"].get("chapter_sub", ""),
               "no": sc["opts"].get("chapter_no", "")} for sc in scenes if sc["opts"].get("intro") == "chapter"]
        print(json.dumps({"total": total, "chapters": ch}, ensure_ascii=False))
        return
    out = Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    if a.audio:
        build_audio(scenes, total, out)
        print("音声:", out)
        return
    if a.range:
        r0, r1 = (float(x) for x in a.range.split(","))
        f0, f1 = int(round(r0 * FPS)), min(int(round(total * FPS)), int(round(r1 * FPS)))
        enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                                "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                                "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE)
        import time
        t0 = time.time()
        for i in range(f0, f1):
            enc.stdin.write(frame(scenes, total, i / FPS, lib).tobytes())
            if (i - f0) % 300 == 0:
                print(f"  {i / FPS:7.1f}秒（{f0 / FPS:.1f}〜{f1 / FPS:.1f}）経過{time.time() - t0:6.0f}s", flush=True)
        enc.stdin.close(); enc.wait()
        print(f"範囲完成: {out} フレーム{f1 - f0} 所要{time.time() - t0:.0f}s")
        return
    if a.stills:
        for s in a.stills.split(","):
            frame(scenes, total, float(s), lib).save(out.with_name(f"{out.stem}_{float(s):05.2f}.png"))
        return
    vtmp, wav = out.with_suffix(".v.mp4"), out.with_suffix(".wav")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                            "-pix_fmt", "yuv420p", str(vtmp)], stdin=subprocess.PIPE)
    nf = int(round(total * FPS))
    for i in range(nf):
        enc.stdin.write(frame(scenes, total, i / FPS, lib).tobytes())
        if i % 150 == 0:
            print(f"  {i / FPS:5.1f}/{total:.1f}秒", flush=True)
    enc.stdin.close(); enc.wait()
    build_audio(scenes, total, wav)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(vtmp), "-i", str(wav), "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "192k", "-shortest", str(out)], check=True)
    vtmp.unlink(); wav.unlink()
    print("完成:", out)


if __name__ == "__main__":
    main()
