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

from . import hosts
from .media import Library
from .planner import Planner
from .style import (W, H, FPS, SR, ROOT, NAVY, TEXT, SPEAKER, NAME, font, prog, out3, inout, put, fade_img,
                    text_layer, bottom_shade, program_tag)
from .templates import TEMPLATES

TRANS_DUR = {"cut": 0.0, "fade": 0.35, "zoom": 0.32, "push": 0.45}


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

        def plan_for(who, sc=sc, cache=cache):
            if who not in cache:
                cache[who] = hosts.resolve(sc, who)
            return cache[who]

        sc["_host_plan"] = plan_for
        first = {}
        for ln in lines:
            for who in plan_for(ln["who"]):
                first.setdefault(who, max(0.0, ln["start"] - s0 - 0.15))
        sc["_host_first"] = first


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
    if with_hosts:
        ln = current_line(sc, t_abs)
        who = ln["who"] if ln else (sc["lines"][-1]["who"] if sc["lines"] else None)
        line_t = t_abs - ln["start"] if ln else 99
        hosts.draw(cv, sc, t, who, line_t, bool(ln and ln["exclaim"]))
    return cv


def frame(scenes, total, t, lib):
    i = max(j for j, s in enumerate(scenes) if s["start"] <= t or j == 0)
    sc = scenes[i]
    cv = scene_frame(sc, t, lib)
    td = TRANS_DUR.get(sc["trans"], 0)
    if i > 0 and td and t - sc["start"] < td:
        p = (t - sc["start"]) / td
        prev = scene_frame(scenes[i - 1], t, lib)
        if sc["trans"] == "zoom":
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
    program_tag(cv)
    cv.alpha_composite(bottom_shade(), (0, H - 300))
    draw_subtitle(cv, sc, t)
    if t > total - 0.6:
        cv = Image.blend(cv, Image.new("RGBA", (W, H), (0, 0, 0, 255)), prog(t, total - 0.6, 0.6))
    return cv.convert("RGB")


# ---------------------------------------------------------------- 音
def synth_bgm(total, scenes):
    n = int(total * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    prog_ = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59], [53, 57, 60], [55, 59, 62]]
    f = lambda m: 440 * 2 ** ((m - 69) / 12)
    bounds = [s["start"] for s in scenes] + [total]
    for i in range(len(scenes)):
        st, en = bounds[i], bounds[i + 1]
        a, b = int(st * SR), int(en * SR)
        tt = t[a:b] - st
        env = np.minimum(1, tt / 1.0) * np.minimum(1, (en - st - tt) / 0.6 + 0.05)
        seg = np.zeros(b - a, np.float32)
        for m in prog_[i % len(prog_)]:
            for det in (-0.12, 0.12):
                seg += np.sin(2 * np.pi * f(m + det) * tt) * 0.08
            seg += np.sin(2 * np.pi * f(m - 12) * tt) * 0.05
        out[a:b] += seg * env
        if scenes[i]["template"] in ("C", "D", "E"):        # 情報を出す場面だけ低い鼓動
            for bt in np.arange(st, en, 0.5):
                a2, m2 = int(bt * SR), int(0.25 * SR)
                t2 = np.arange(min(m2, n - a2)) / SR
                out[a2:a2 + len(t2)] += np.sin(2 * np.pi * (55 + 30 * np.exp(-t2 * 30)) * t2) * np.exp(-t2 * 14) * 0.3
    return out * np.minimum(1, t / 1.0) * np.minimum(1, (total - t) / 1.5)


def build_audio(scenes, total, path):
    sys.path.insert(0, str(ROOT / "reaction"))
    from make_video import synth_se
    from .templates import Machine
    n = int(total * SR)
    mix = synth_bgm(total, scenes) * 0.5
    hits = []
    for i, sc in enumerate(scenes):
        s0 = sc["start"]
        hits.append((s0, {"B": "don", "C": "taiko"}.get(sc["template"], "shu"), 0.3 if i else 0.25))
        if sc["template"] == "B":
            tp, tn, tl, ts = Machine().phases(sc)
            hits += [(s0 + tp, "shu", 0.25)] + [(s0 + x, "pon", 0.22) for x in ts]
        if sc["template"] == "D" and sc["variant"] == "stat":
            hits += [(s0 + x, "pon", 0.06) for x in np.arange(0.2, 1.4, 0.09)]
        if sc["template"] == "E":
            hits += [(s0 + max(0.5, sc["cue"](it.replace("{", "").replace("}", "")[:5], 0.7 + 0.9 * k) - 0.1), "pon", 0.2)
                     for k, it in enumerate(sc["opts"]["items"])]
        for ln in sc["lines"]:
            if ln["exclaim"]:
                hits.append((ln["start"], "piko", 0.18))
    for t0, kind, g in hits:
        x = synth_se(kind)
        if x is None:
            continue
        a = int(t0 * SR)
        seg = x[: max(0, n - a)] * g
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
    mix = np.clip(mix, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- 計画の書き出し
def write_plan(ep, scenes, lib, total):
    rows = [f"# シーン構成（自動生成）  合計 {total:.1f}秒", "",
            "| # | 開始 | 長さ | テンプレート | 選び方 | キャラ | セリフ |", "| --- | --- | --- | --- | --- | --- | --- |"]
    names = {"A": "A 写真", "B": "B 機種紹介", "C": "C 年表・カレンダー", "D": "D 数字・比較", "E": "E 要点", "F": "F 掛け合い"}
    for i, sc in enumerate(scenes):
        hs = sorted({w for ln in sc["lines"] for w in sc["_host_plan"](ln["who"])})
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
    a = ap.parse_args()
    ep = Path(a.episode)
    pl = Planner(ep)
    scenes = pl.plan()
    total = scenes[-1]["start"] + scenes[-1]["dur"] + 0.4
    scenes[-1]["dur"] += 0.4
    prepare(scenes)
    lib = Library(ep, final=a.final)
    for sc in scenes:          # 必要素材を先に読み込んで一覧にする
        if sc["template"] == "A":
            lib.get(sc["opts"].get("asset", "hall"))
        if sc["template"] == "B":
            lib.get(sc["machine"]["asset"])
    write_plan(ep, scenes, lib, total)
    if a.plan:
        return
    out = Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
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
