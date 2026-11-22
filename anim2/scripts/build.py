#!/usr/bin/env python3
"""台本（ロック）＋演出表＋関門合格済みの声 → Remotion 用のデータ

  python3 scripts/build.py episodes/proto01

やること
1. 台本 k01.txt から行IDを振り、演出表に出てくる行の「話者・字面・読み」を script.lock.json に固定する
2. 声は関門（gate.json）に合格し、sha1 が一致するものだけを使う。1行でも違えば止める（台本外の声を入れない）
3. 声の波形と台本の読み（かな）から、口の形を1コマずつ決める（口パクの信号）
4. 演出表を行ごとの状態に展開して、src/data/<回>.json に書く
"""
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import pyopenjtalk
import yaml

FPS = 30
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "public" / "a"
WHO = {"ナギ": "nagi", "バク": "baku"}
# 口の形：0=閉 1=小 2=中 3=大 4=お
CLOSE, SMALL, MID, BIG, O = range(5)


def parse_script(path):
    lines, n = {}, 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"^(ナギ|バク):\s*(.+)$", s)
        if not m:
            continue
        n += 1
        body = m.group(2)
        lines[f"k01-{n:03d}"] = {
            "who": WHO[m.group(1)],
            "text": re.sub(r"《([^|》]+)\|[^》]+》", r"\1", body),
            "reading": re.sub(r"《[^|》]+\|([^》]+)》", r"\1", body),
        }
    return lines


def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()


def load_pcm(p, sr=16000):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype=np.float32), sr


VOWEL = {}
for row, v in (("アカサタナハマヤラワガザダバパァャ", "a"), ("イキシチニヒミリギジヂビピィ", "i"),
               ("ウクスツヌフムユルグズヅブプゥュヴ", "u"), ("エケセテネヘメレゲゼデベペェ", "e"),
               ("オコソトノホモヨロヲゴゾドボポォョ", "o")):
    for ch in row:
        VOWEL[ch] = v


def vowels(reading):
    kana = pyopenjtalk.g2p(reading, kana=True)
    out = []
    for ch in kana:
        if ch in "ャュョァィゥェォ" and out:
            out[-1] = VOWEL[ch]          # キャ→a
        elif ch in VOWEL:
            out.append(VOWEL[ch])
        elif ch == "ン":
            out.append("N")
        elif ch == "ー" and out:
            out.append(out[-1])
        elif ch == "ッ":
            out.append("Q")
    return out


def mouth_track(wav, reading, who):
    """音量で「声が出ているコマ」を決め、そこに台本の母音を順番に割り当てる（Irodori は時刻情報が無いため推定）"""
    x, sr = load_pcm(wav)
    hop = sr // FPS
    nf = math.ceil(len(x) / hop)
    rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(nf)])
    rms = np.convolve(rms, [0.25, 0.5, 0.25], mode="same")
    peak = np.percentile(rms, 97) or 1.0
    lvl = rms / peak
    voiced = lvl > 0.14
    vs = vowels(reading)
    idx = np.flatnonzero(voiced)
    shapes = [CLOSE] * nf
    if len(idx) and vs:
        for k, f in enumerate(idx):
            v = vs[min(len(vs) - 1, int(k * len(vs) / len(idx)))]
            a = lvl[f]
            if v in ("N", "Q"):
                s = CLOSE if a < 0.5 else SMALL
            elif who == "nagi":       # ナギは淡々：大きく開けない
                s = {"a": MID, "i": SMALL, "e": SMALL, "u": O, "o": O}[v]
                if a < 0.35:
                    s = SMALL
            else:
                s = {"a": BIG if a > 0.55 else MID, "e": MID, "i": SMALL, "u": O, "o": O}[v]
                if a < 0.3:
                    s = SMALL
            shapes[f] = s
    # 2コマ未満のちらつきを消す
    for i in range(1, nf - 1):
        if shapes[i] != shapes[i - 1] and shapes[i] != shapes[i + 1]:
            shapes[i] = shapes[i - 1]
    return shapes, [round(float(v), 3) for v in np.clip(lvl, 0, 1.5)], len(x) / sr


def main(ep):
    ep = Path(ep).resolve()
    d = yaml.safe_load((ep / "direction.yaml").read_text(encoding="utf-8"))
    script = parse_script(A / "k01.txt")
    gate = json.loads((A / "gate.json").read_text(encoding="utf-8"))["lines"]

    order = [list(item)[0] for item in d["lines"]]
    cues = {list(item)[0]: (list(item.values())[0] or {}) for item in d["lines"]}

    # 1・2：台本のロックと声の関門
    lock, errors = [], []
    for lid in order:
        if lid not in script:
            errors.append(f"{lid}: 台本に無い行")
            continue
        wav = A / "voice" / f"{lid}.wav"
        g = gate.get(lid)
        h = sha1(wav) if wav.exists() else None
        if not g or not g.get("ok"):
            errors.append(f"{lid}: 関門に合格していない")
        elif g.get("sha1") != h:
            errors.append(f"{lid}: 声が関門で検査したものと違う（sha1 不一致）")
        s = script[lid]
        lock.append({"id": lid, **s, "text_sha1": hashlib.sha1(s["text"].encode()).hexdigest()[:12], "voice_sha1": h})
    if errors:
        print("書き出し中止：\n  " + "\n  ".join(errors))
        sys.exit(1)
    (ep / "script.lock.json").write_text(json.dumps({"source": d["source"], "lines": lock}, ensure_ascii=False, indent=1), encoding="utf-8")

    # 3・4：タイミング・口パク・演出の状態
    state = {"cam": "two", "nagi": {"face": "nagi_01", "tilt": 0}, "baku": {"face": "baku_01", "tilt": 0}, "board": None}
    st = d.get("start", {})
    state["cam"] = st.get("cam", "two")
    for w in ("nagi", "baku"):
        if w in st:
            state[w]["face"] = st[w]
    t = round(d.get("lead", 0.5) * FPS)
    out_lines = []
    for item in lock:
        c = cues[item["id"]]
        t += round(c.get("pause_before", 0) * FPS)
        for k in ("cam", "board"):
            if k in c:
                state[k] = c[k]
        for w in ("nagi", "baku"):
            if w in c:
                v = c[w]
                state[w] = {**state[w], **({"face": v} if isinstance(v, str) else v)}
        wav = A / "voice" / f"{item['id']}.wav"
        mouth, level, dur = mouth_track(wav, item["reading"], item["who"])
        n = len(mouth)
        out_lines.append({
            "id": item["id"], "who": item["who"], "text": item["text"],
            "start": t, "end": t + n, "voice": f"a/voice/{item['id']}.wav",
            "mouth": mouth, "level": level,
            "cam": state["cam"], "nagi": dict(state["nagi"]), "baku": dict(state["baku"]),
            "board": state["board"],
            "fx": c.get("fx"), "se": c.get("se"), "shake": c.get("shake", 0), "prop": c.get("prop"),
        })
        t += n + round(d.get("gap", 0.25) * FPS)
    total = t + round(d.get("tail", 1.0) * FPS)
    data = {"fps": FPS, "total": total, "bgm": d.get("bgm"), "lines": out_lines}
    outp = ROOT / "src" / "data" / f"{ep.name}.json"
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"ok: {len(out_lines)} 行・{total / FPS:.1f} 秒・関門合格 {len(lock)}/{len(lock)} → {outp.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])
