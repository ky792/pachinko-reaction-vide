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
import skit  # noqa: E402
import reading  # noqa: E402
import fx as fxmod  # noqa: E402
import invention as invmod  # noqa: E402

SR = 44100
CHARS_PER_SEC = {"nagi": 5.0, "baku": 5.3}   # 音声が無いときの推定読み上げ速度
GAP = 0.40            # セリフ間の間
SHOW_PAUSE = 0.35     # 資料が切り替わったあと、読む時間を少し取る
CHAPTER_DUR = 2.6
TITLE_DUR = 3.4
INTRO_DUR = 2.2       # キャラ紹介カード（@intro nagi / @intro baku）
WHO = {"ナギ": "nagi", "バク": "baku"}
NUM = re.compile(r"(?:約)?(?:[0-9][0-9,.]*(?:%|個|回転|回|ラウンド|R|分の1|秒)|1/[0-9][0-9.]*)")


# ---------------------------------------------------------------- 台本の読み込み
def parse_script(path):
    """1行ずつ読む。戻り値は命令とセリフの並び"""
    out = []
    pending = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            parts = line[1:].split(None, 1)
            if parts[0] == "dir":
                pending = parse_dir(parts[1] if len(parts) > 1 else "", path.name)
                continue
            out.append({"cmd": parts[0], "arg": parts[1] if len(parts) > 1 else ""})
            continue
        m = re.match(r"^(ナギ|バク)(!?)[:：]\s*(.+)$", line)
        if not m:
            raise ValueError(f"{path.name}: 読めない行 → {raw}")
        out.append({"cmd": "line", "who": WHO[m.group(1)], "tsukkomi": m.group(2) == "!", "text": reading.display(m.group(3)),
                    "say": m.group(3), "dir": pending})   # text＝字幕、say＝読み上げの元（《表記|よみ》入り）
        pending = {}
    return out


# @dir の値の範囲（直後の1セリフだけに効く演出）
DIR_RANGE = {"pre": (0, 2), "post": (0, 2), "speed": (0.7, 1.4), "int": (0.5, 1.6), "vol": (0.5, 1.2), "zoom": (1.0, 2.6)}
DIR_TEXT = ("emph", "mark", "face", "lv", "focus", "se", "mood", "tail", "act", "hiki", "fx")


def parse_dir(arg, name="台本"):
    d = {}
    for tok in arg.split():
        if "=" not in tok:
            raise ValueError(f"{name}: @dir は key=value で書く → {tok}")
        k, v = tok.split("=", 1)
        if k in DIR_RANGE:
            x = float(v)
            lo, hi = DIR_RANGE[k]
            if not lo <= x <= hi:
                raise ValueError(f"{name}: @dir {k}={v} は {lo}〜{hi} の範囲で")
            d[k] = x
        elif k in DIR_TEXT:
            d[k] = v
        else:
            raise ValueError(f"{name}: @dir の知らないキー → {k}")
    return d


def lines_with_ids(script_path):
    """セリフだけを、音声ファイル名と同じID（<章>-001…）つきで返す（lab/tts.py 用）"""
    out, n = [], 0
    for it in parse_script(script_path):
        if it["cmd"] == "line":
            n += 1
            out.append(dict(it, id=f"{script_path.stem}-{n:03d}"))
    return out


def highlight(text):
    """数字（約80%、3000個、1/319.7 など）を自動で重要数字色にする"""
    if "{" in text:
        return text
    return NUM.sub(lambda m: "{" + m.group(0) + "}" if any(ch.isdigit() for ch in m.group(0)) else m.group(0), text)


def split_parts(text, limit=34):
    """長いセリフは「。」で字幕を分ける。1つの字幕は最大2行"""
    sents = [s for s in re.split(r"(?<=[。？！])(?![」』）。？！])", text) if s]   # 「！？」や「…！」」の途中では切らない
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
        if depth_at[k] and depth_at[k - 1]:     # 強調数字の途中では折らない（直前・直後なら折ってよい）
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
    while cut > 0 and text[cut - 1] == "{":    # 強調数字の直前で折るときは「{」ごと次の行へ
        cut -= 1
    return text[:cut] + "\n" + text[cut:]


# ---------------------------------------------------------------- 音声
def wav_len(path):
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


DIR_PRE = 0.15        # @dir のある章で、pre を書かない行の前の間（episode.json の "dir_pre"）
VOICE_TEMPO = 1.0     # episode.json の "voice_tempo"：声全体の速さ（1.1＝1割速く。音の高さは変えない）


def tempo_voice(vpath):
    """voice_tempo が 1 以外なら、速めた写しを voices_tempo<値>/ に作ってそのパスを返す（元の声は変えない）"""
    if abs(VOICE_TEMPO - 1.0) < 1e-3:
        return vpath
    out = vpath.parent.parent / f"voices_tempo{VOICE_TEMPO:g}" / vpath.name
    if not out.exists() or out.stat().st_mtime < vpath.stat().st_mtime:
        out.parent.mkdir(exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(vpath), "-af", f"atempo={VOICE_TEMPO}", str(out)], check=True)
    return out


def est_len(who, text):
    n = len(re.sub(r"[{}、。！？!?…\s]", "", text))
    return max(1.3, n / CHARS_PER_SEC[who] + 0.25)


# ---------------------------------------------------------------- 章を組み立てる
def build_chapter(ep_dir, script_path, data):
    stem = script_path.stem
    items = parse_script(script_path)
    scene = {"duration": 0, "cues": [], "layout": [], "subs": [], "emphasis": [], "se": [],
             "year_track": [], "voices": [], "lines": [], "motion": {"camera": [], "elements": []},
             "focus": [], "bgm_track": [], "acts": [], "songs": [], "faces": [], "hiki": [], "fx": []}
    fx = None           # 再現演出の途中（@dir fx=bousou）：次のセリフの終わりまで続ける
    hiki = None         # ヒキの演出中（@dir hiki=<行数>）：{"start", "left", "duck"}
    directed = any(it.get("dir") for it in items if it["cmd"] == "line")   # @dir がある章だけ新しい間の付け方
    t = 0.25
    cur = None          # 今出ている資料
    pending_hl = None   # @hl：次のセリフの中で円グラフの注目項目を切り替える [(項目番号, セリフ内の位置0〜1)]
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
            # @chapter <キー> [cont] … cont を付けると、章カードを出さずに同じ章の続きとして扱う（上部バー・色味だけ引き継ぐ）
            key, *flags = it["arg"].split()
            ch = data["chapters"][key]
            chap = ch
            if "cont" in flags:
                continue
            close_cur(t)
            set_layout("hidden", t)
            d = {"no": ch["no"], "year": ch["year"], "title": ch["title"], "grade": ch.get("grade")}
            if ch.get("label"):
                d["label"] = ch["label"]
            if key in ("op", "ed"):
                d["label"] = {"op": "OPENING", "ed": "ENDING"}[key]
            scene["cues"].append({"type": "chapter", "start": t, "end": t + CHAPTER_DUR, "data": d})
            scene["se"].append({"t": t + 0.05, "kind": "taiko", "gain": 0.4})
            t += CHAPTER_DUR - 0.25
        elif c == "title":
            # @title [秒] … 秒を付けると、その長さだけタイトルを出す（OPの曲に合わせるとき）
            close_cur(t)
            set_layout("hidden", t)
            td = float(it["arg"]) if it["arg"].strip() else TITLE_DUR
            scene["cues"].append({"type": "title", "start": t, "end": t + td, "data": data["title"]})
            scene["se"].append({"t": t + 0.05, "kind": "don", "gain": 0.35})
            t += td
        elif c == "song":
            # @song <ファイル> [gain=0.8] [len=秒] … OPの曲など。その間はBGMを止め、終わりの1.5秒でフェードアウト
            bits = it["arg"].split()
            opt = dict(b.split("=", 1) for b in bits[1:])
            f = song_path(ep_dir, bits[0])
            ln = float(opt.get("len", 0)) or float(subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)]))
            scene["songs"].append({"t": round(t, 3), "path": str(f), "gain": float(opt.get("gain", 0.8)), "len": ln})
            scene["bgm_track"].append({"t": round(t, 3), "level": 0.0, "dur": 0.3})
            scene["bgm_track"].append({"t": round(t + ln, 3), "level": 1.0, "dur": 1.5})
        elif c == "logo":
            # @logo <ファイル> [秒] … 番組ロゴ（generator/assets/logos/）を全画面で
            bits = it["arg"].split()
            ld = float(bits[1]) if len(bits) > 1 else 3.0
            close_cur(t)
            set_layout("hidden", t)
            scene["cues"].append({"type": "logo", "start": t, "end": t + ld, "data": {"file": bits[0]}})
            scene["se"].append({"t": t + 0.05, "kind": "pon", "gain": 0.3})
            t += ld
        elif c == "intro":
            # @intro nagi … data["intro"][who] のキャラ紹介カードを全画面で出す（ニュース解説のOP）
            close_cur(t)
            set_layout("hidden", t)
            scene["cues"].append({"type": "intro", "start": t, "end": t + INTRO_DUR, "data": dict(data["intro"][it["arg"]], who=it["arg"])})
            scene["se"].append({"t": t + 0.05, "kind": "pon", "gain": 0.3})
            t += INTRO_DUR
        elif c == "year":
            scene["year_track"].append([t, float(it["arg"])])
        elif c == "skit":
            # @skit on / @skit off … 寸劇（キャラを大きく向かい合わせ、セリフごとに動かす。lab/skit.py）
            set_layout("normal" if it["arg"].strip() == "off" else "skit", t)
        elif c == "clear":
            close_cur(t)
            set_layout("normal", t)
        elif c == "hl":
            # @hl 2 … 次のセリフの頭で、円グラフ（pie）の2番目（0始まり）を注目させる
            # @hl 0,1@0.42,2@0.72 … セリフの途中（長さの割合）で注目を移す ／ @hl - … 注目を解除（全部ふつうに戻す）
            pending_hl = []
            for tok in it["arg"].replace(" ", "").split(","):
                idx, _, frac = tok.partition("@")
                pending_hl.append((None if idx == "-" else int(idx), float(frac or 0)))
        elif c == "show":
            kind, name = it["arg"].split(":")
            close_cur(t)
            d = dict(data[kind][name])
            cue = {"type": kind, "start": t, "end": None, "data": d, "id": f"{kind}:{name}"}
            if kind == "machine":
                cue["image"] = d.get("image")
            if kind == "invention":
                # 発明品（docs/NAGIBAKU_WORLD.md）：起動音→（煙）→結果の1段目。@hl 1/2… で段を足す
                d = cue["data"] = invmod.resolve(d)
                scene["se"].append({"t": t + 0.1, "kind": "boot", "gain": 0.22})
                gag_se = {"smoke": ("puff", 0.6, 0.25), "sparks": ("zap", 0.6, 0.2), "flash": ("piko", 0.85, 0.22)}.get(d.get("gag"))
                if gag_se:
                    scene["se"].append({"t": t + gag_se[1], "kind": gag_se[0], "gain": gag_se[2]})
                if not d.get("hold"):
                    scene["se"].append({"t": t + invmod.BOOT_SEC, "kind": "blip", "gain": 0.2})
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
        elif c == "bgm":
            # @bgm cut <秒> / @bgm resume <秒> … BGM をその場でフェードアウト／イン
            # @bgm track <ファイル> … ここから BGM の曲を替える（generator/assets/bgm/。前の曲と1.5秒でつなぐ）
            bits = it["arg"].split()
            if len(bits) == 2 and bits[0] == "track":
                scene.setdefault("bgm_switch", []).append({"t": round(t, 3), "file": bits[1]})
                continue
            if len(bits) != 2 or bits[0] not in ("cut", "resume"):
                raise ValueError("@bgm cut 0.3 / @bgm resume 0.6 / @bgm track <ファイル> の形で書く")
            scene["bgm_track"].append({"t": round(t, 3), "level": 0.0 if bits[0] == "cut" else 1.0, "dur": float(bits[1])})
        elif c == "line":
            dr = it.get("dir", {})
            if dr.get("hiki") and hiki is None:
                # @dir hiki=2 … このセリフから2行ぶん「ヒキ」：背景を暗く・上下に帯・ゆっくり寄る（間の取り方は変えない）
                level = scene["bgm_track"][-1]["level"] if scene["bgm_track"] else 1.0
                hiki = {"start": round(t, 3), "left": max(1, int(dr["hiki"])), "duck": level > 0.5, "first": True}
                if hiki["duck"]:   # BGM が鳴っていれば少し絞る（もう切ってあればそのまま）
                    scene["bgm_track"].append({"t": round(t, 3), "level": 0.35, "dur": 0.5})
            if directed:
                t += dr.get("pre", DIR_PRE)
            line_no += 1
            lid = f"{stem}-{line_no:03d}"
            vpath = ep_dir / "voices" / f"{lid}.wav"
            if vpath.exists():
                vpath = tempo_voice(vpath)
            dur = wav_len(vpath) if vpath.exists() else est_len(it["who"], it["text"])
            if scene["layout"] and scene["layout"][-1]["mode"] == "hidden":
                set_layout("normal", t - 0.2)
            parts = split_parts(it["text"])
            total = sum(len(p) for p in parts)
            tt = t
            for p in parts:
                pd = dur * len(p) / total
                tail = (min(dr.get("post", 0) + 0.12, 0.45) if directed else GAP * 0.8) if p is parts[-1] else 0.02
                scene["subs"].append({"start": tt, "end": tt + pd + tail,
                                      "who": it["who"], "text": wrap2(highlight(p)),
                                      "accent": it["tsukkomi"] or bool(dr.get("mark"))})
                tt += pd
            scene["lines"].append({"id": lid, "who": it["who"], "text": it["text"], "start": round(t, 2),
                                   "dur": round(dur, 2), "voice": vpath.name, "has_voice": vpath.exists(),
                                   "pre": dr.get("pre"), "post": dr.get("post"), "lv": dr.get("lv")})
            face = dr.get("face")
            if scene["layout"] and scene["layout"][-1]["mode"] == "skit":
                act = dr.get("act") or skit.auto_act(it["who"], it["text"])
                if act != "none":
                    scene["acts"].append({"who": it["who"], "start": round(t, 3), "end": round(t + dur, 3), "act": act})
                    face = face or skit.ACT_FACE.get(act)
            if face:   # @dir face=… 表情差分（characters/v2/<who>/<face>.png）。セリフの間＋0.3秒だけ
                scene["faces"].append({"who": it["who"], "start": round(t, 3), "end": round(t + dur + 0.3, 3), "face": face})
            if dr.get("focus"):
                fend = t + dur + dr.get("post", 0)
                if dr.get("zoom", 1.2) > 1.3:            # 大きく寄るカットは長くても2.2秒で戻す
                    fend = min(fend, t + 2.2)
                scene["focus"].append({"who": dr["focus"], "start": round(t - 0.1, 3), "end": round(fend, 3),
                                       "zoom": dr.get("zoom", 1.2)})   # @dir zoom=1.8 で大きく寄る（掛け合いの見せ場のカット）
            if pending_hl is not None:
                if cur is not None and cur["type"] in ("pie", "meter", "invention"):   # meter は @hl 1 で上乗せぶんを足す
                    for idx, frac in pending_hl:
                        cur.setdefault("hl", []).append([round(t + frac * dur, 3), idx])
                        if cur["type"] == "invention" and idx is not None:
                            scene["se"].append({"t": round(t + frac * dur, 3), "kind": "blip", "gain": 0.2})
                pending_hl = None
            if dr.get("se"):
                scene["se"].append({"t": t, "kind": dr["se"], "gain": 0.18})
            if vpath.exists():
                scene["voices"].append({"t": t, "path": str(vpath)})
            if it["tsukkomi"]:
                scene["emphasis"].append({"who": "baku", "start": t, "end": t + dur, "scale": 1.08})
                if not dr.get("se"):
                    scene["se"].append({"t": t, "kind": "piko", "gain": 0.18})
            if dr.get("fx") and fx is None:
                # @dir fx=<種類> … 実機の演出を画面で再現（オマージュ）。lab/fx.py の FX にある種類だけ。
                # セリフの中の言葉の位置（文字数の割合）に合わせて動く。尺・間は変えない
                if dr["fx"] not in fxmod.FX:
                    raise ValueError(f"{stem}: @dir fx の知らない種類 → {dr['fx']}")
                fx = {"kind": dr["fx"], "start": round(t, 3), "left": fxmod.FX[dr["fx"]]["span"], "marks": {}}
            if fx is not None:
                fxmod.find_marks(fx, it["text"], t, dur)
            if hiki is not None and hiki.pop("first", False):
                scene["se"].append({"t": t, "kind": "don", "gain": 0.16})   # ヒキのセリフの頭に低い一打
            t += dur + (dr.get("post", 0) + 0.05 if directed else GAP)
            if fx is not None:
                fx["left"] -= 1
                if fx["left"] <= 0:
                    fxmod.finish(fx, round(t, 3), scene)
                    fx = None
            if hiki is not None:
                hiki["left"] -= 1
                if hiki["left"] <= 0:
                    scene["hiki"].append({"start": hiki["start"], "end": round(t, 3)})
                    if hiki["duck"]:
                        scene["bgm_track"].append({"t": round(t, 3), "level": 1.0, "dur": 0.8})
                    hiki = None
    if fx is not None:
        fxmod.finish(fx, round(t + 0.6, 3), scene)
    if hiki is not None:      # 章の終わりまで続いたヒキ（章の最後の一言など）
        scene["hiki"].append({"start": hiki["start"], "end": round(t + 0.6, 3)})
    close_cur(t)
    t += 0.6
    for cue in scene["cues"]:
        if cue["end"] is None or cue["end"] > t:
            cue["end"] = t
    scene["duration"] = round(t, 2)
    ch = chap or (data["chapters"]["op"] if stem.startswith("00") else {"no": 0, "title": "", "y": 2008})
    scene["chapter"] = {"no": ch["no"], "title": ch.get("bar", ch["title"]), "year": ch.get("y", 2008), "era": ch.get("era"),
                        "label": {"op": "OPENING", "ed": "ENDING"}.get(stem.split("_")[-1], None) if ch["no"] in (0, 8) else None}
    scene["grade"] = ch.get("grade")      # 章の色味（gold／blue／goldred）。背景にだけかける（lab/render.py）
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


def _merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            _merge(a[k], v)
        else:
            a[k] = v
    return a


def load_data(ep):
    """data.json を読む。episode.json があれば、別の回の data.json を土台に data_patch を重ねる（土台は変更しない）"""
    conf_p = ep / "episode.json"
    conf = json.loads(conf_p.read_text(encoding="utf-8")) if conf_p.exists() else {}
    data = json.loads((ep / conf.get("data", "data.json")).read_text(encoding="utf-8"))
    if conf.get("data_patch"):
        _merge(data, json.loads((ep / conf["data_patch"]).read_text(encoding="utf-8")))
    return data, conf


# ---------------------------------------------------------------- 書き出し
def mix_chapter_audio(scene, out_wav):
    """効果音＋（あれば）声。BGMは結合後に通しでかける"""
    sys.path.insert(0, str(ui.ROOT / "reaction"))
    from make_video import synth_se
    n = int(scene["duration"] * SR) + SR
    mix = np.zeros(n, np.float32)
    for s in scene["se"]:
        x = fxmod.lab_se(s["kind"], SR) if s["kind"] in fxmod.LAB_SE else synth_se(s["kind"])
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
    for sg in scene.get("songs", []):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sg["path"], "-t", str(sg["len"]), "-ac", "1", "-ar", str(SR),
                              "-af", f"afade=t=out:st={max(0, sg['len'] - 1.5)}:d=1.5", "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(raw, np.float32) * sg["gain"]
        a = int(sg["t"] * SR)
        seg = x[: max(0, n - a)]
        mix[a:a + len(seg)] += seg
    mix = np.clip(mix, -1, 1)[: int(scene["duration"] * SR)]
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


def song_path(ep_dir, name):
    """曲ファイルの場所：回の music/ → generator/assets/bgm/ の順に探す"""
    for p in (ep_dir / "music" / name, ui.ROOT / "generator" / "assets" / "bgm" / name):
        if p.exists():
            return p
    raise FileNotFoundError(f"@song の曲が見つからない: {name}（episodes/<回>/music/ に置く）")


def load_images(ep_dir, scene):
    from PIL import Image
    imgs = {}
    for c in scene["cues"]:
        name = c.get("image")
        if name and (ep_dir / "images" / name).exists():
            imgs[name] = Image.open(ep_dir / "images" / name).convert("RGBA")
    return imgs


def chapter_key(ep, scene):
    """章の動画の中身を決めるもの（場面の設定・使う音声・実機画像）の指紋。--reuse で、変わっていない章を描き直さないために使う"""
    import hashlib
    h = hashlib.sha1(json.dumps(scene, ensure_ascii=False, sort_keys=True).encode())
    for v in scene.get("voices", []):
        p = Path(v["path"])
        h.update(p.read_bytes() if p.exists() else b"-")
    for name in sorted(load_images(ep, scene)):
        h.update((ep / "images" / name).read_bytes())
    return h.hexdigest()


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


def bgm_volume_expr(track, gain):
    """@bgm cut/resume を ffmpeg の volume 式（時刻 t の関数）にする"""
    expr, level, cur = f"{gain}", 1.0, []
    for b in sorted(track, key=lambda x: x["t"]):
        a, d, to = b["t"], max(b["dur"], 0.01), b["level"]
        cur.append((a, d, level, to))
        level = to
    if not cur:
        return expr
    # 区間ごとに線形補間。最後の状態がその後も続く
    e = f"{cur[-1][3]}"
    for a, d, fr, to in reversed(cur):
        ramp = f"({fr}+({to}-{fr})*min(1,max(0,(t-{a})/{d})))"
        e = f"if(lt(t,{a}),{fr},if(lt(t,{a + d}),{ramp},{e}))"
    return f"{gain}*{e}"


def bgm_bed(out_wav, dur, first, switch, xfade=1.5):
    """曲の切り替え（@bgm track）を反映した BGM を1本の wav にする。各曲は頭から流してループ、つなぎ目は xfade 秒で重ねる"""
    def load(name):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ui.ASSETS / "bgm" / name), "-ac", "2", "-ar", str(SR),
                              "-f", "f32le", "-"], capture_output=True, check=True).stdout
        return np.frombuffer(raw, np.float32).reshape(-1, 2)
    n = int(dur * SR) + SR
    bed = np.zeros((n, 2), np.float32)
    segs = [(0.0, first)] + [(b["t"], b["file"]) for b in sorted(switch, key=lambda x: x["t"])]
    for i, (t0, name) in enumerate(segs):
        t1 = segs[i + 1][0] if i + 1 < len(segs) else dur
        a, b = int(t0 * SR), min(n, int((t1 + xfade) * SR))
        src = load(name)
        reps = int(np.ceil((b - a) / len(src))) + 1
        x = np.tile(src, (reps, 1))[: b - a].copy()
        fi, fo = int(xfade * SR), int(xfade * SR)
        if i:
            x[:fi] *= np.linspace(0, 1, min(fi, len(x)))[:, None]
        if i + 1 < len(segs):
            x[-fo:] *= np.linspace(1, 0, min(fo, len(x)))[:, None]
        bed[a:b] += x
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(bed, -1, 1) * 32767).astype(np.int16).tobytes())


def concat(out_dir, stems, final, bgm_gain=0.10, bgm_track=(), bgm_file="main.wav", bgm_switch=()):
    lst = out_dir / "concat.txt"
    lst.write_text("".join(f"file '{(out_dir / f'{s}.mp4').resolve()}'\n" for s in stems), encoding="utf-8")
    joined = out_dir / "joined.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)], check=True)
    bgm = ui.ASSETS / "bgm" / bgm_file          # 回ごとに episode.json の "bgm" で選べる（既定は main.wav）
    if bgm.exists():
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(joined)]))
        loop = ["-stream_loop", "-1"]
        if bgm_switch:
            bed = out_dir / "bgm_bed.wav"
            bgm_bed(bed, dur, bgm_file, bgm_switch)
            bgm, loop = bed, []
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(joined), *loop, "-i", str(bgm),
                        "-filter_complex",
                        f"[1:a]volume='{bgm_volume_expr(bgm_track, bgm_gain)}':eval=frame,afade=t=in:d=1.5,afade=t=out:st={max(0, dur - 3)}:d=3[b];"
                        f"[0:a][b]amix=inputs=2:duration=first:normalize=0[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{dur}", str(final)], check=True)
        joined.unlink()
    else:
        joined.rename(final)
    return final


def main():
    global GAP
    ap = argparse.ArgumentParser()
    ap.add_argument("episode_dir")
    ap.add_argument("--only", help="この章だけ（ファイル名の頭、例 02_65）")
    ap.add_argument("--stills", action="store_true", help="要所の静止画だけ書き出す")
    ap.add_argument("--manifest", action="store_true", help="セリフID・必要素材の一覧だけ書き出す")
    ap.add_argument("--out", default=None)
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--reuse", action="store_true", help="前に作った章の動画を、中身（台本・音声・画像）が変わっていなければ使い回す")
    args = ap.parse_args()
    ep = Path(args.episode_dir)
    data, conf = load_data(ep)
    global VOICE_TEMPO, DIR_PRE
    VOICE_TEMPO = float(conf.get("voice_tempo", 1.0))
    DIR_PRE = float(conf.get("dir_pre", DIR_PRE))
    GAP = conf.get("gap", GAP)        # episode.json の "gap" でセリフ間の間を回ごとに変えられる（テンポ）
    out_dir = Path(args.out or (ep / "build"))
    out_dir.mkdir(parents=True, exist_ok=True)
    scripts = sorted((ep / "script").glob("*.txt"))
    if args.only:
        scripts = [p for p in scripts if p.stem.startswith(args.only)]
    scenes = {}
    for p in scripts:
        sc = build_chapter(ep, p, data)
        sc["background"] = conf.get("background")     # episode.json の "background"（generator/assets/backgrounds/）
        if sc["background"] and (ep / sc["background"]).exists():   # 回のフォルダに置いた背景（例 images/bg_kv.png）
            sc["background"] = str((ep / sc["background"]).resolve())
        sc["theme"] = conf.get("theme")               # lab（既定）／newmachine（新台解説）
        sc["chips"] = conf.get("chips")               # 新台解説の上部の札
        if conf.get("theme") == "goggai":             # 号外：解析パネルの見出しを打つ音
            for c in sc["cues"]:
                if c["type"] == "analysis":
                    for i in range(len(c["data"].get("heading", ""))):
                        sc["se"].append({"t": round(c["start"] + ui.TYPE_START + ui.TYPE_SEC * i, 3), "kind": "type", "gain": 0.16})
        scenes[p.stem] = sc
        (out_dir / f"{p.stem}.scene.json").write_text(json.dumps(sc, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{p.stem}: {sc['duration'] / 60:5.2f}分  セリフ{len(sc['lines'])}  資料{len(sc['cues'])}")
    total = sum(s["duration"] for s in scenes.values())
    print(f"合計 {total / 60:.2f}分")
    if not args.only:          # 1章だけのときは一覧を書き換えない（他の章のセリフが消えるため）
        write_manifest(ep, data, scenes)
    warn_unlicensed(ep, scenes)
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
    keys = {s: chapter_key(ep, scenes[s]) for s in stems}
    todo = [s for s in stems if not (args.reuse and (out_dir / f"{s}.mp4").exists()
                                     and (out_dir / f"{s}.key").exists() and (out_dir / f"{s}.key").read_text() == keys[s])]
    for s in stems:
        if s not in todo:
            print("使い回し:", s)
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for s, r in zip(todo, ex.map(render_chapter, [(str(ep), s, str(out_dir)) for s in todo])):
            (out_dir / f"{s}.key").write_text(keys[s])
            print("章完成:", r, flush=True)
    if not args.only:
        final = out_dir / f"{ep.name}.mp4"
        track, switch, off = [], [], 0.0
        for stem in stems:
            track += [dict(b, t=b["t"] + off) for b in scenes[stem].get("bgm_track", [])]
            switch += [dict(b, t=b["t"] + off) for b in scenes[stem].get("bgm_switch", [])]
            off += scenes[stem]["duration"]
        concat(out_dir, stems, final, bgm_gain=conf.get("bgm_gain", 0.10), bgm_track=track, bgm_file=conf.get("bgm", "main.wav"),
               bgm_switch=switch)
        print("完成:", final)


def image_rights(ep):
    """images/SOURCES.csv の rights 列（ファイル名→権利の状態）。無い画像は「未確認」扱い"""
    import csv
    f = ep / "images" / "SOURCES.csv"
    if not f.exists():
        return {}
    with f.open(encoding="utf-8-sig", newline="") as fh:
        return {r["filename"]: (r.get("rights") or "未確認") for r in csv.DictReader(fh)}


def warn_unlicensed(ep, scenes):
    """動画に使う実機画像のうち、権利確認が済んでいないものを書き出しのたびに知らせる（公開前チェック用）"""
    rights = image_rights(ep)
    used = sorted({c["image"] for sc in scenes.values() for c in sc["cues"]
                   if c.get("image") and (ep / "images" / c["image"]).exists()})
    bad = [n for n in used if not rights.get(n, "未確認").startswith("確認済")]
    if bad:
        print(f"⚠ 権利未確認の実機画像 {len(bad)}枚を使用中（公開前に許諾確認が必要。images/SOURCES.csv の rights を「確認済」に）:")
        for n in bad:
            print("   -", n, rights.get(n, "SOURCES.csv に記載なし"))


def write_manifest(ep, data, scenes):
    """差し替え用の一覧：セリフID（音声ファイル名）と、必要な実機画像"""
    rows = ["# 差し替え素材の一覧（自動生成）", "", "## 実機画像（images/ に置く）", "", "| ファイル名 | 機種 | 状態 |", "| --- | --- | --- |"]
    rights = image_rights(ep)
    for k, m in data["machine"].items():
        ok = (ep / "images" / m["image"]).exists()
        if not ok:
            state = "仮パネル"
        elif rights.get(m["image"], "未確認").startswith("確認済"):
            state = "実機写真あり（権利確認済）"
        else:
            state = "実機写真追加済（権利未確認）"
        rows.append(f"| {m['image']} | {m['name']} | {state} |")
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
