#!/usr/bin/env python3
"""声を作ったあとの読み検査：Whisper（faster-whisper・無料・CPU）で文字起こしして、台本とかなで照合する

  python scripts/reading/asr_check.py episodes/eva_history [--only ID,…] [--chapter 02_] [--model small]
  python scripts/reading/asr_check.py episodes/eva_history --transcripts asr.json   # 文字起こし済みのものを使う（試験用）
  → episodes/<回>/reading/asr.json（文字起こしの控え。音声が同じなら作り直さない）、report.json、report.md

照合のしかた（判定はすべて「候補」。ASR は聞き間違えるし、同じ読みの別の字は区別できない）
- 台本の読み上げ用テキストと、文字起こしを、どちらも OpenJTalk でカタカナにして並べる（漢字の書き分けの差を消す）
- 2音以上ずれたところを、脱落（台本にあるのに聞こえない）・重複（同じ音がくり返し聞こえる）・誤読（違う音）として拾う
- 辞書で読みが決まっている語のところでずれたら「誤読（辞書語）」として高めに出す
- 1秒あたりの音の数が、その話者のふつうから大きく外れる行（脱落・くり返し・間延びの疑い）
- ナギ（AivisSpeech）は、合成のときにエンジンが使った読み（voice_ab/aivis_lines/kana.json）でも辞書語を確かめる
"""
import argparse
import hashlib
import json
import re
import statistics
import sys
import wave
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading  # noqa: E402
from precheck import all_lines, write_md  # noqa: E402

flat = lambda s: s.replace("|", "")  # noqa: E731
# 5行で比べた結果（asr_probe.py）：kotoba-whisper は faster-whisper では空になる。large-v3-turbo が専門用語と関西弁を一番正しく書いた。
# hotwords（専門用語の手がかり）は良くも悪くもならず、単語の間に空白が入るので既定では使わない
DEFAULT_MODEL = "large-v3-turbo"


def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()


def wav_len(p):
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()


def load16k(p):
    """wav → 16kHz モノラル float32（faster-whisper に配列で渡す。PyAV の版の違いで読めないことがあるため）"""
    import numpy as np
    from scipy.signal import resample_poly
    with wave.open(str(p)) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != 16000:
        from math import gcd
        g = gcd(sr, 16000)
        x = resample_poly(x, 16000 // g, sr // g).astype(np.float32)
    return x


def hotwords():
    """専門用語を Whisper に手がかりとして渡す（「確変」を「閣園」と書かないように）。台本の文そのものは渡さない"""
    d = reading.load_dict()
    words = sorted({t["surface"] for t in d.get("terms", []) if t.get("status") == "ok" and re.search(r"[一-龯]", t["surface"])})
    return " ".join(words)


def transcribe(items, ep, model_name, cache):
    todo = [it for it in items if cache.get(it["id"], {}).get("sha1") != it["sha1"] or cache[it["id"]].get("model") != model_name]
    if not todo:
        return
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    hot = hotwords() if USE_HOTWORDS[0] else None
    for n, it in enumerate(todo, 1):
        segs, _ = model.transcribe(load16k(it["wav"]), language="ja", beam_size=5, temperature=0.0,
                                   condition_on_previous_text=False, vad_filter=False, hotwords=hot)
        cache[it["id"]] = {"sha1": it["sha1"], "model": model_name, "text": "".join(s.text for s in segs).strip()}
        print(f"[{n}/{len(todo)}] {it['id']} {cache[it['id']]['text']}", flush=True)


def engine_kana(k):
    """AivisSpeech の kana（AquesTalk 風：' / _ ？ 、 入り）→ ふつうのカタカナ"""
    return re.sub(r"[/'_]", "", k).replace("？", "、")


USE_HOTWORDS = [False]
PREDICTED = set()      # 声を作る前の検査（precheck.json）が怪しいと見た (行ID, 語)


def compare(it, asr_text, terms, d):
    sp = reading.speech_text(it["say"], d, reading.ENGINE[it["who"]])
    reading.use_engine(None, d)          # 照合は辞書語を読みに置き換えてから比べるので、ユーザー辞書は使わない
    exp = reading.canon(sp, d, terms, rules=False)
    got = reading.canon(asr_text, d, terms) if asr_text else ""
    sm = SequenceMatcher(None, exp, got, autojunk=False)
    spans = []
    for surf, yomi, src, status in terms:
        if surf in it["text"]:
            tk = flat(reading.yomi_kana(yomi))
            for m in re.finditer(re.escape(tk), exp):
                spans.append((m.start(), m.end(), surf, yomi))
    found = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        e, g = exp[i1:i2], got[j1:j2]
        hit = next(((s, y) for a, b, s, y in spans if a < max(i2, i1 + 1) and b > i1), None)
        if max(len(e), len(g)) < 2 and not hit:
            continue                                   # 1音だけの差は ASR のゆれが多いので拾わない
        if tag == "delete":
            kind, why = "脱落", f"台本の「{e}」が聞こえない"
        elif tag == "insert":
            rep = g in exp[max(0, i1 - len(g)):i1 + len(g)]
            kind, why = ("重複", f"「{g}」がくり返し聞こえる") if rep else ("余分な音", f"台本にない「{g}」が聞こえる")
        else:
            kind, why = "誤読", f"台本は「{e}」、聞こえたのは「{g}」"
        level = "低"
        if hit:
            kind = kind + "（辞書語）" if kind != "誤読" else "誤読（辞書語）"
            why += f"（辞書語「{hit[0]}」のところ）"
            if (it["id"], hit[0]) in PREDICTED:
                level, why = "高", why + "。声を作る前の検査でも同じ語が怪しいと出ている"
            else:   # 文字起こしだけの差：1〜2音は Whisper の聞き違い（濁点・似た音）も多い
                level = "中" if max(len(e), len(g)) >= 3 else "低"
        elif max(len(e), len(g)) >= 4:
            level = "中"
        found.append({"kind": kind, "where": e or g, "expect": hit[1] if hit else e, "reason": why, "level": level})
    return exp, got, sm.ratio(), found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--only")
    ap.add_argument("--chapter")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--transcripts", help="{行ID: 文字起こし} の JSON（Whisper を回さずに照合だけする）")
    ap.add_argument("--hotwords", action="store_true", help="専門用語を手がかりとして渡す")
    ap.add_argument("--min-ratio", type=float, default=0.8, help="行全体の一致がこれより低ければ候補にする")
    a = ap.parse_args()
    ep = Path(a.episode)
    USE_HOTWORDS[0] = a.hotwords
    out = ep / "reading"; out.mkdir(exist_ok=True)
    d = reading.load_dict()
    terms = [t for t in reading.terms(d) if t[3] == "ok"]
    items = []
    for it in all_lines(ep, set(a.only.split(",")) if a.only else None, a.chapter):
        wav = ep / "voices" / f"{it['id']}.wav"
        if wav.exists():
            items.append(dict(it, wav=wav, sha1=sha1(wav), dur=wav_len(wav)))
    pf = out / "precheck.json"
    if pf.exists():
        PREDICTED.update((r["id"], r["where"]) for r in json.loads(pf.read_text(encoding="utf-8")) if r["kind"] == "辞書と違う")
    cf = out / "asr.json"
    cache = json.loads(cf.read_text(encoding="utf-8")) if cf.exists() else {}
    if a.transcripts:
        tr = json.loads(Path(a.transcripts).read_text(encoding="utf-8"))
        for it in items:
            if it["id"] in tr:
                cache[it["id"]] = {"sha1": it["sha1"], "model": "given", "text": tr[it["id"]]}
    else:
        transcribe(items, ep, a.model, cache)
    cf.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    texts = [cache.get(it["id"], {}).get("text", "") for it in items]
    if texts and sum(1 for t in texts if not t.strip()) > len(texts) * 0.3:
        raise SystemExit(f"文字起こしが空の行が多すぎる（{sum(1 for t in texts if not t.strip())}/{len(texts)}）。モデルか設定がおかしいので照合しない")
    kf = ROOT / "voice_ab" / "aivis_lines" / "kana.json"
    ekana = json.loads(kf.read_text(encoding="utf-8")) if kf.exists() else {}

    rows, rates = [], {"nagi": [], "baku": []}
    results = []
    for it in items:
        asr = cache.get(it["id"], {}).get("text")
        if not asr:
            continue                      # 文字起こしできなかった行は照合しない（全部「脱落」にしない）
        exp, got, ratio, found = compare(it, asr, terms, d)
        rate = len(exp) / max(0.3, it["dur"])
        rates[it["who"]].append(rate)
        results.append((it, asr, exp, got, ratio, found, rate))
    med = {w: statistics.median(v) if v else 0 for w, v in rates.items()}
    for it, asr, exp, got, ratio, found, rate in results:
        if ratio < a.min_ratio and not any(f["level"] != "低" for f in found):
            found.append({"kind": "全体のずれ", "where": "", "expect": "", "level": "中",
                          "reason": f"台本と文字起こしの一致が {ratio:.0%}（{a.min_ratio:.0%} 未満）"})
        m = med[it["who"]]
        if m and len(exp) >= 10 and (rate > m * 1.5 or rate < m * 0.6):     # 短い行は前後の無音で速さがぶれるので見ない
            found.append({"kind": "速さ", "where": "", "expect": "", "level": "低",
                          "reason": f"1秒あたり {rate:.1f} 音（この話者のふつうは {m:.1f}）。"
                                    + ("脱落・早口の疑い" if rate > m else "くり返し・間延び・余分な音の疑い")})
        ek = ekana.get(it["id"])
        if ek and re.search(r"[一-龯]", ek.get("kana", "")):
            ek = None                     # 古い形式（元の文のまま）の控えは使わない
        sure = set()      # 読みが確かめられている辞書語（ここでの文字起こしのずれは Whisper の聞き違い・字の選び違い）
        if it["who"] == "nagi" and ek and ek.get("text") == reading.speech_text(it["say"], d, "aivis"):
            nk = flat(reading.norm(engine_kana(ek["kana"])))
            for surf, yomi, src, status in terms:
                if surf not in it["text"]:
                    continue
                if flat(reading.norm(reading.yomi_kana(yomi))) in nk:   # 長音の書き方（ボウソウ／ボオソオ）の差はならしてから比べる
                    sure.add(surf)
                else:
                    found.append({"kind": "誤読（エンジンの読み）", "where": surf, "expect": yomi, "level": "高",
                                  "reason": f"合成に使った読みに「{yomi}」がない（エンジンの読み：{engine_kana(ek['kana'])}）"})
        if it["who"] == "baku":   # バクは、辞書で読みをかなに置き換えて送った語なら読みは決まっている
            sp = reading.speech_text(it["say"], d, "irodori")
            sure.update(surf for surf, yomi, src, status in terms if surf in it["text"] and surf not in sp)
        if sure:
            found = [f for f in found if not (f["kind"].endswith("（辞書語）") and
                                              any(f.get("expect") == y for s2, y, _, _ in terms if s2 in sure))]
        for f in found:
            rows.append(dict(f, id=it["id"], who=it["who"], text=it["text"], asr=asr, ratio=round(ratio, 3),
                             audio=f"episodes/{ep.name}/voices/{it['id']}.wav"))
    # 同じ辞書語が2行以上で違って聞こえたら、たまたまではないので「高」に上げる（例：役物→薬物）
    seen = {}
    for r in rows:
        if r["kind"] == "誤読（辞書語）" and r.get("expect"):
            seen.setdefault(r["expect"], set()).add(r["id"])
    for r in rows:
        ids = seen.get(r.get("expect"), ())
        if r["kind"] == "誤読（辞書語）" and len(ids) >= 2 and r["level"] != "高":
            r["level"] = "高"
            r["reason"] += f"。同じ語が {len(ids)} 行で違って聞こえる"
    order = {"高": 0, "中": 1, "低": 2}
    rows.sort(key=lambda r: (order[r["level"]], r["id"]))
    (out / "report.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    write_md(out / "report.md", [dict(r, reason=f"{r['reason']}。文字起こし：{r['asr']}") for r in rows],
             f"読み検査（声を作ったあと・文字起こしと照合）：{ep.name}")
    kinds = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"{len(results)} 行を照合。候補 {len(rows)} 件（{len({r['id'] for r in rows})} 行）", kinds, "→", out / "report.md")


if __name__ == "__main__":
    main()
