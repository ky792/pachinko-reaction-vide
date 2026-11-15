#!/usr/bin/env python3
"""読みを直して作り直した行の、修正前後を比べる

  python scripts/reading/compare.py episodes/eva_history            # 文字起こしは reading/asr*.json にあるものを使う
  python scripts/reading/compare.py episodes/eva_history --whisper  # 修正前後の両方を Whisper で文字起こしする（CI 用）
  → episodes/<回>/reading/compare.md・compare.json、reading/ab/<行ID>.wav（修正前 → 0.7秒 → 修正後）、reading/ab/all.wav（全部つなぎ）

比べるもの：読み上げ用テキスト、OpenJTalk の読み（ナギはユーザー辞書を入れた読み）、合成に使った読み（ナギ）、
文字起こしと照合結果、長さ（間やテンポが大きく変わっていないか）
"""
import argparse
import json
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading  # noqa: E402
from precheck import all_lines  # noqa: E402
import asr_check  # noqa: E402

SR = 24000


def read(p):
    with wave.open(str(p)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        sr = w.getframerate()
    if sr != SR:
        x = np.interp(np.arange(0, len(x), sr / SR), np.arange(len(x)), x)
    return x


def write(p, x):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.clip(x, -32768, 32767).astype(np.int16).tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--whisper", action="store_true")
    ap.add_argument("--model", default=asr_check.DEFAULT_MODEL)
    a = ap.parse_args()
    ep = Path(a.episode)
    bdir = ep / "reading" / "before"
    info = json.loads((bdir / "info.json").read_text(encoding="utf-8"))
    lines = {it["id"]: it for it in all_lines(ep)}
    d = reading.load_dict()
    terms = [t for t in reading.terms(d) if t[3] == "ok"]
    rd = ep / "reading"
    cf, bf = rd / "asr.json", rd / "asr_before.json"
    after_asr = json.loads(cf.read_text(encoding="utf-8")) if cf.exists() else {}
    before_asr = json.loads(bf.read_text(encoding="utf-8")) if bf.exists() else {}
    items_b, items_a = [], []
    for i in info:
        bw, aw = bdir / f"{i}.wav", ep / "voices" / f"{i}.wav"
        items_b.append(dict(lines[i], wav=bw, sha1=asr_check.sha1(bw)))
        items_a.append(dict(lines[i], wav=aw, sha1=asr_check.sha1(aw)))
    if a.whisper:
        asr_check.transcribe(items_b, ep, a.model, before_asr)
        asr_check.transcribe(items_a, ep, a.model, after_asr)
        bf.write_text(json.dumps(before_asr, ensure_ascii=False, indent=1), encoding="utf-8")
        cf.write_text(json.dumps(after_asr, ensure_ascii=False, indent=1), encoding="utf-8")
    ekana = {}
    kf = ROOT / "voice_ab" / "aivis_lines" / "kana.json"
    if kf.exists():
        ekana = json.loads(kf.read_text(encoding="utf-8"))
    abd = rd / "ab"; abd.mkdir(exist_ok=True)
    rows, allpcm = [], []
    gap = np.zeros(int(SR * 0.7), dtype=np.float32)
    for ib, ia in zip(items_b, items_a):
        i, who = ib["id"], ib["who"]
        eng = reading.ENGINE[who]
        sp_after = reading.speech_text(lines[i]["say"], d, eng)
        reading.use_engine(None, d)
        k_before = reading.kana(info[i]["speech"])
        reading.use_engine(eng, d)
        k_after = reading.kana(sp_after)
        reading.use_engine(None, d)
        row = {"id": i, "who": who, "text": lines[i]["text"], "speech_before": info[i]["speech"], "speech_after": sp_after,
               "kana_before": k_before, "kana_after": k_after, "remade": ib["sha1"] != ia["sha1"],
               "dur_before": round(asr_check.wav_len(ib["wav"]), 2), "dur_after": round(asr_check.wav_len(ia["wav"]), 2),
               "audio_before": str(ib["wav"]), "audio_after": str(ia["wav"]), "ab": str(abd / f"{i}.wav")}
        if who == "nagi" and i in ekana:
            row["engine_kana_after"] = ekana[i]["kana"]
        for tag, cache, it in (("before", before_asr, ib), ("after", after_asr, ia)):
            c = cache.get(i)
            if c and c.get("sha1") == it["sha1"]:
                _, _, ratio, found = asr_check.compare(lines[i], c["text"], terms, d)
                row[f"asr_{tag}"] = c["text"]; row[f"ratio_{tag}"] = round(ratio, 3)
                row[f"issues_{tag}"] = [f"{f['kind']}：{f['reason']}" for f in found]
        xb, xa = read(ib["wav"]), read(ia["wav"])
        ab = np.concatenate([xb, gap, xa])
        write(abd / f"{i}.wav", ab)
        allpcm += [ab, np.zeros(int(SR * 1.2), dtype=np.float32)]
        rows.append(row)
    if allpcm:
        write(abd / "all.wav", np.concatenate(allpcm))
    (rd / "compare.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    md = ["# 読みの修正：前後の比較", "", "聞き比べ：`reading/ab/<行ID>.wav`（修正前 → 0.7秒 → 修正後）、全部つなぎ `reading/ab/all.wav`", "",
          "| 行ID | 話者 | 字幕 | 読み（前 → 後） | 文字起こし（前 → 後） | 照合（前 → 後） | 長さ |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        who = "ナギ" if r["who"] == "nagi" else "バク"
        iss = lambda k: "；".join(r.get(k, [])) or ("問題なし" if k in r else "—")  # noqa: E731
        md.append(f"| {r['id']} | {who} | {r['text']} | {r['kana_before']} → {r['kana_after']}"
                  + (f"（合成の読み：{r['engine_kana_after']}）" if r.get("engine_kana_after") else "")
                  + f" | {r.get('asr_before', '—')} → {r.get('asr_after', '—')} | {iss('issues_before')} → {iss('issues_after')}"
                  + f" | {r['dur_before']}秒 → {r['dur_after']}秒{'' if r['remade'] else '（まだ作り直していない）'} |")
    (rd / "compare.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"{len(rows)} 行 → {rd / 'compare.md'}、{abd / 'all.wav'}")


if __name__ == "__main__":
    main()
