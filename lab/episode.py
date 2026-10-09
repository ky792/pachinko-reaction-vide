#!/usr/bin/env python3
"""台本（script/*.txt）＋資料データ（data.json）から、章ごとの scene を組み立てて動画にする。

使い方:
  python lab/episode.py episodes/ken_full                 # 全章を書き出して結合
  python lab/episode.py episodes/ken_full --only 02_65    # 1章だけ（確認用）
  python lab/episode.py episodes/ken_full --stills        # 各章の要所の静止画だけ
  python lab/episode.py episodes/ken_full --manifest      # セリフID・素材の一覧を書き出すだけ

差し替えの仕組み:
  - セリフ：script/*.txt を直す（1行＝1セリフ）
  - 音声：voices/<セリフID>.wav を置くと、その長さで全タイミングが決まり直す（無ければ文字数から推定）
  - 実機画像：images/<data.json の image 名> を置くと仮パネルから差し替わる
  - 資料（スペック・比較・年表など）：data.json を直す
"""
import argparse
import json
import re
import subprocess
import sys
import wave
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render  # noqa: E402
import motion  # noqa: E402
import ui  # noqa: E402

SR = 44100
CHARS_PER_SEC = {"nagi": 5.0, "baku": 5.3}   # 音声が無いときの推定読み上げ速度
GAP = 0.40            # セリフ間の間
SHOW_PAUSE = 0.35     # 資料が切り替わったあと、読む時間を少し取る
CHAPTER_DUR = 2.6
TITLE_DUR = 3.4
WHO = {"ナギ": "nagi", "バク": "baku"}
NUM = re.compile(r"(?:約)?(?:[0-9][0-9,.]*(?:%|個|回転|回|ラウンド|R|分の1|秒)|1/[0-9][0-9.]*)")


# ---------------------------------------------------------------- 台本の読み込み
def parse_script(path):
    """1行ずつ読む。戻り値は命令とセリフの並び"""
    out = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            parts = line[1:].split(None, 1)
            out.append({"cmd": parts[0], "arg": parts[1] if len(parts) > 1 else ""})
            continue
        m = re.match(r"^(ナギ|バク)(!?)[:：]\s*(.+)$", line)
        if not m:
            raise ValueError(f"{path.name}: 読めない行 → {raw}")
        out.append({"cmd": "line", "who": WHO[m.group(1)], "tsukkomi": m.group(2) == "!", "text": m.group(3)})
    return out


def highlight(text):
    """数字（約80%、3000個、1/319.7 など）を自動で重要数字色にする"""
    if "{" in text:
        return text
    return NUM.sub(lambda m: "{" + m.group(0) + "}" if any(ch.isdigit() for ch in m.group(0)) else m.group(0), text)


def split_parts(text, limit=34):
    """長いセリフは「。」で字幕を分ける。1つの字幕は最大2行"""
    sents = [s for s in re.split(r"(?<=[。？！])", text) if s]
    parts, buf = [], ""
    for s in sents:
        if buf and len(buf) + len(s) > limit:
            parts.append(buf); buf = s
        else:
            buf += s
    if buf:
        parts.append(buf)
    out = []
    for p in parts:   # 2行に収まりにくい長さは「、」で字幕を分ける
        while len(p) > 30:
            commas = [i for i, ch in enumerate(p[:-1]) if ch == "、" and 6 <= i <= len(p) - 6]
            if not commas:
                break
            cut = min(commas, key=lambda i: abs(i - len(p) / 2))
            out.append(p[:cut + 1]); p = p[cut + 1:]
        out.append(p)
    return out


def wrap2(text, width=21):
    """字幕を2行に。句読点の直後で折り、行頭に句読点を置かない。{…}の途中では折らない"""
    plain = text.replace("{", "").replace("}", "")
    if len(plain) <= width:
        return text
    # 文字位置（括弧を除いた数）→ 元の位置 の対応
    idx, pos = [], 0
    depth_at = []
    depth = 0
    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1; continue
        if ch == "}":
            depth -= 1; continue
        idx.append(i); depth_at.append(depth)
    n = len(plain)
    mid = n / 2
    cands = []
    for k in range(1, n):
        if depth_at[k] or depth_at[k - 1]:
            continue
        if plain[k] in "、。！？!?）」』ー…":
            continue
        a, b = k, n - k
        if a > width or b > width:
            continue
        score = abs(k - mid) - (10 if plain[k - 1] in "、。！？!?" else 0)
        cands.append((score, k))
    k = min(cands)[1] if cands else int(mid)
    cut = idx[k]
    return text[:cut] + "\n" + text[cut:]


# ---------------------------------------------------------------- 音声
def wav_len(path):
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def est_len(who, text):
    n = len(re.sub(r"[{}、。！？!?…\s]", "", text))
    return max(1.3, n / CHARS_PER_SEC[who] + 0.25)


# ---------------------------------------------------------------- 章を組み立てる
def build_chapter(ep_dir, script_path, data):
    stem = script_path.stem
    items = parse_script(script_path)
    scene = {"duration": 0, "cues": [], "layout": [], "subs": [], "emphasis": [], "se": [],
             "year_track": [], "voices": [], "lines": [], "motion": {"camera": [], "elements": []}}
    t = 0.25
    cur = None          # 今出ている資料
    chap = None
    line_no = 0

    def close_cur(at):
        nonlocal cur
        if cur is not None:
            cur["end"] = at + 0.3
            scene["cues"].append(cur)
            cur = None

    def set_layout(mode, at):
        if not scene["layout"] or scene["layout"][-1]["mode"] != mode:
            scene["layout"].append({"start": max(0.0, at), "mode": mode})

    for it in items:
        c = it["cmd"]
        if c == "chapter":
            ch = data["chapters"][it["arg"]]
            chap = ch
            close_cur(t)
            set_layout("hidden", t)
            d = {"no": ch["no"], "year": ch["year"], "title": ch["title"]}
            if it["arg"] in ("op", "ed"):
                d["label"] = {"op": "OPENING", "ed": "ENDING"}[it["arg"]]
            scene["cues"].append({"type": "chapter", "start": t, "end": t + CHAPTER_DUR, "data": d})
            scene["se"].append({"t": t + 0.05, "kind": "taiko", "gain": 0.4})
            t += CHAPTER_DUR - 0.25
        elif c == "title":
            close_cur(t)
            set_layout("hidden", t)
            scene["cues"].append({"type": "title", "start": t, "end": t + TITLE_DUR, "data": data["title"]})
            scene["se"].append({"t": t + 0.05, "kind": "don", "gain": 0.35})
            t += TITLE_DUR
        elif c == "year":
            scene["year_track"].append([t, float(it["arg"])])
        elif c == "clear":
            close_cur(t)
            set_layout("normal", t)
        elif c == "show":
            kind, name = it["arg"].split(":")
            close_cur(t)
            d = dict(data[kind][name])
            cue = {"type": kind, "start": t, "end": None, "data": d, "id": f"{kind}:{name}"}
            if kind == "machine":
                cue["image"] = d.get("image")
            cur = cue
            set_layout("machine" if kind == "machine" else "normal", t - 0.1)
            scene["se"].append({"t": t + 0.02, "kind": "pon" if kind == "analysis" else "shu", "gain": 0.22})
            t += SHOW_PAUSE
        elif c == "camera":
            # @camera <zoom> <x> <y> <duration> (すべて数字。位置は原画のピクセル)
            bits = it["arg"].split()
            if len(bits) != 4:
                raise ValueError("@camera zoom x y duration の4値が必要です")
            zoom, x, y, duration = map(float, bits)
            if not 1.0 <= zoom <= 3.0 or duration < 0:
                raise ValueError("@camera: zoom は1〜3、duration は0以上")
            frames = scene["motion"]["camera"]
            previous = motion.sample(frames, t, motion.CAMERA_DEFAULT)
            frames.append({"t": round(t, 3), **previous})
            frames.append({"t": round(t + duration, 3), "zoom": zoom, "x": x, "y": y})
        elif c == "motion":
            # @motion <target> <dx> <dy> <scale> <rotate> <opacity> <duration>
            bits = it["arg"].split()
            if len(bits) != 7:
                raise ValueError("@motion target dx dy scale rotate opacity duration の7値が必要です")
            target = bits[0]
            dx, dy, scale, rotate, opacity, duration = map(float, bits[1:])
            if scale <= 0 or not 0 <= opacity <= 1 or duration < 0:
                raise ValueError("@motion: scale > 0、opacity は0〜1、duration は0以上")
            motions = scene["motion"]["elements"]
            element = next((e for e in motions if e["target"] == target), None)
            if element is None:
                element = {"target": target, "keyframes": []}
                motions.append(element)
            frames = element["keyframes"]
            previous = motion.sample(frames, t, motion.ELEMENT_DEFAULT)
            frames.append({"t": round(t, 3), **previous})
            frames.append({"t": round(t + duration, 3), "dx": dx, "dy": dy,
                           "scale": scale, "rotate": rotate, "opacity": opacity})
        elif c == "pause":
            t += float(it["arg"])
        elif c == "line":
            line_no += 1
            lid = f"{stem}-{line_no:03d}"
            vpath = ep_dir / "voices" / f"{lid}.wav"
            dur = wav_len(vpath) if vpath.exists() else est_len(it["who"], it["text"])
            if scene["layout"] and scene["layout"][-1]["mode"] == "hidden":
                set_layout("normal", t - 0.2)
            parts = split_parts(it["text"])
            total = sum(len(p) for p in parts)
            tt = t
            for p in parts:
                pd = dur * len(p) / total
                scene["subs"].append({"start": tt, "end": tt + pd + (GAP * 0.8 if p is parts[-1] else 0.02),
                                      "who": it["who"], "text": wrap2(highlight(p)), "accent": it["tsukkomi"]})
                tt += pd
            scene["lines"].append({"id": lid, "who": it["who"], "text": it["text"], "start": round(t, 2),
                                   "dur": round(dur, 2), "voice": vpath.name, "has_voice": vpath.exists()})
            if vpath.exists():
                scene["voices"].append({"t": t, "path": str(vpath)})
            if it["tsukkomi"]:
                scene["emphasis"].append({"who": "baku", "start": t, "end": t + dur, "scale": 1.08})
                scene["se"].append({"t": t, "kind": "piko", "gain": 0.18})
            t += dur + GAP
    close_cur(t)
    t += 0.6
    for cue in scene["cues"]:
        if cue["end"] is None or cue["end"] > t:
            cue["end"] = t
    scene["duration"] = round(t, 2)
    ch = chap or (data["chapters"]["op"] if stem.startswith("00") else {"no": 0, "title": "", "y": 2008})
    scene["chapter"] = {"no": ch["no"], "title": ch["title"], "year": ch.get("y", 2008), "era": ch.get("era"),
                        "label": {"op": "OPENING", "ed": "ENDING"}.get(stem.split("_")[-1], None) if ch["no"] in (0, 8) else None}
    if ch["no"] == 0:
        scene["chapter"]["label"] = "OPENING"
    if ch["no"] == 8:
        scene["chapter"]["label"] = "ENDING"
    if not scene["year_track"]:
        scene["year_track"] = [[0, ch.get("y", 2008)]]
    scene["milestones"] = [2008]
    if not scene["layout"]:
        scene["layout"] = [{"start": 0, "mode": "normal"}]
    return scene


# ---------------------------------------------------------------- 書き出し
def mix_chapter_audio(scene, out_wav):
    """効果音＋（あれば）声。BGMは結合後に通しでかける"""
    sys.path.insert(0, str(ui.ROOT / "reaction"))
    from make_video import synth_se
    n = int(scene["duration"] * SR) + SR
    mix = np.zeros(n, np.float32)
    for s in scene["se"]:
        x = synth_se(s["kind"])
        if x is None:
            continue
        a = int(s["t"] * SR)
        seg = x[: max(0, n - a)] * s.get("gain", 0.3)
        mix[a:a + len(seg)] += seg
    for v in scene["voices"]:
        x = render.read_wav_mono(v["path"])
        a = int(v["t"] * SR)
        seg = x[: max(0, n - a)]
        mix[a:a + len(seg)] += seg
    mix = np.clip(mix, -1, 1)[: int(scene["duration"] * SR)]
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


def load_images(ep_dir, scene):
    from PIL import Image
    imgs = {}
    for c in scene["cues"]:
        name = c.get("image")
        if name and (ep_dir / "images" / name).exists():
            imgs[name] = Image.open(ep_dir / "images" / name).convert("RGBA")
    return imgs


def render_chapter(args):
    ep_dir, stem, out_dir = Path(args[0]), args[1], Path(args[2])
    scene = json.loads((out_dir / f"{stem}.scene.json").read_text(encoding="utf-8"))
    images = load_images(ep_dir, scene)
    n = int(round(scene["duration"] * ui.FPS))
    vtmp = out_dir / f"{stem}.video.mp4"
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", f"{ui.W}x{ui.H}", "-r", str(ui.FPS), "-i", "-", "-c:v", "libx264",
                            "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-g", "60", str(vtmp)],
                           stdin=subprocess.PIPE)
    for f in range(n):
        enc.stdin.write(render.render_frame(scene, f / ui.FPS, images).tobytes())
        if f % 900 == 0:
            print(f"  [{stem}] {f / ui.FPS:6.1f}/{scene['duration']}秒", flush=True)
    enc.stdin.close(); enc.wait()
    wav = out_dir / f"{stem}.wav"
    mix_chapter_audio(scene, wav)
    out = out_dir / f"{stem}.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(vtmp), "-i", str(wav), "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "192k", "-ar", str(SR), "-ac", "2", "-shortest", str(out)], check=True)
    vtmp.unlink(); wav.unlink()
    return str(out)


def concat(out_dir, stems, final, bgm_gain=0.10):
    lst = out_dir / "concat.txt"
    lst.write_text("".join(f"file '{(out_dir / f'{s}.mp4').resolve()}'\n" for s in stems), encoding="utf-8")
    joined = out_dir / "joined.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)], check=True)
    bgm = ui.ASSETS / "bgm" / "main.wav"
    if bgm.exists():
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(joined)]))
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(joined), "-stream_loop", "-1", "-i", str(bgm),
                        "-filter_complex",
                        f"[1:a]volume={bgm_gain},afade=t=in:d=1.5,afade=t=out:st={max(0, dur - 3)}:d=3[b];"
                        f"[0:a][b]amix=inputs=2:duration=first:normalize=0[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{dur}", str(final)], check=True)
        joined.unlink()
    else:
        joined.rename(final)
    return final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode_dir")
    ap.add_argument("--only", help="この章だけ（ファイル名の頭、例 02_65）")
    ap.add_argument("--stills", action="store_true", help="要所の静止画だけ書き出す")
    ap.add_argument("--manifest", action="store_true", help="セリフID・必要素材の一覧だけ書き出す")
    ap.add_argument("--out", default=None)
    ap.add_argument("--jobs", type=int, default=2)
    args = ap.parse_args()
    ep = Path(args.episode_dir)
    data = json.loads((ep / "data.json").read_text(encoding="utf-8"))
    out_dir = Path(args.out or (ep / "build"))
    out_dir.mkdir(parents=True, exist_ok=True)
    scripts = sorted((ep / "script").glob("*.txt"))
    if args.only:
        scripts = [p for p in scripts if p.stem.startswith(args.only)]
    scenes = {}
    for p in scripts:
        sc = build_chapter(ep, p, data)
        scenes[p.stem] = sc
        (out_dir / f"{p.stem}.scene.json").write_text(json.dumps(sc, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{p.stem}: {sc['duration'] / 60:5.2f}分  セリフ{len(sc['lines'])}  資料{len(sc['cues'])}")
    total = sum(s["duration"] for s in scenes.values())
    print(f"合計 {total / 60:.2f}分")
    write_manifest(ep, data, scenes)
    if args.manifest:
        return
    if args.stills:
        for stem, sc in scenes.items():
            imgs = load_images(ep, sc)
            pts = sorted({round(c["start"] + min(4.0, (c["end"] - c["start"]) * 0.6), 2) for c in sc["cues"]})
            for tt in pts:
                render.render_frame(sc, tt, imgs).save(out_dir / f"{stem}_{tt:07.2f}.png")
        return
    stems = list(scenes)
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for r in ex.map(render_chapter, [(str(ep), s, str(out_dir)) for s in stems]):
            print("章完成:", r, flush=True)
    if not args.only:
        final = out_dir / f"{ep.name}.mp4"
        concat(out_dir, stems, final)
        print("完成:", final)


def write_manifest(ep, data, scenes):
    """差し替え用の一覧：セリフID（音声ファイル名）と、必要な実機画像"""
    rows = ["# 差し替え素材の一覧（自動生成）", "", "## 実機画像（images/ に置く）", "", "| ファイル名 | 機種 | 状態 |", "| --- | --- | --- |"]
    for k, m in data["machine"].items():
        ok = (ep / "images" / m["image"]).exists()
        rows.append(f"| {m['image']} | {m['name']} | {'あり' if ok else '仮パネル'} |")
    rows += ["", "## セリフと音声（voices/<ID>.wav を置くとその長さでタイミングが決まる）", "",
             "| ID | 話者 | 開始(推定) | セリフ |", "| --- | --- | --- | --- |"]
    offset = 0.0
    for stem, sc in scenes.items():
        for ln in sc["lines"]:
            m, s = divmod(offset + ln["start"], 60)
            rows.append(f"| {ln['id']} | {'ナギ' if ln['who'] == 'nagi' else 'バク'} | {int(m):02d}:{s:04.1f} | {ln['text']} |")
        offset += sc["duration"]
    (ep / "MANIFEST.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
