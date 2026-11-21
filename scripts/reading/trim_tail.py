#!/usr/bin/env python3
"""台詞の後ろに勝手に付いた声（ハルシネーション）を切り落とす

  python scripts/reading/trim_tail.py episodes/kyu001v2 [--only ID,…]

TTS（とくに Irodori）は、台詞を言い終えたあとに「うわぁぁ」「ちゅー」のような台本にない声を足すことがある。
Whisper（faster-whisper）で単語ごとの時刻つきで書き起こし、台本の最後の音が聞こえた時刻で音声を切る。
- 台本と文字起こしは、どちらもかなにして並べる（asr_check と同じ reading.canon）
- 台本の最後の音（終わりから2音以内）が文字起こしで見つかれば、その単語の終わり＋余韻（声が静かになるまで、最大0.35秒）で切る
- 台本の終わりが見つからない行は切らない（本物の台詞を切らないため）→ voice_gate で落ちる
結果：episodes/<回>/voices/*.wav を上書き、episodes/<回>/reading/trim.json に記録（元の長さ・切った位置・切った部分の文字起こし）
"""
import argparse
import json
import re
import sys
import wave
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading  # noqa: E402
from asr_check import DEFAULT_MODEL, load16k  # noqa: E402
from precheck import all_lines  # noqa: E402

TAIL_SLACK = 2       # 台本の終わりから何音までの取りこぼしを「言い終えた」とみなすか
MAX_RING = 0.35      # 単語の終わりから、声の余韻として残す最大の長さ（秒）
PAD = 0.06           # 切る位置のあとに残す無音（秒）
FADE = 0.03


def expected_kana(it, d, terms):
    sp = reading.speech_text(it["say"], d, reading.ENGINE[it["who"]])
    reading.use_engine(None, d)
    return reading.canon(sp, d, terms, rules=False)


def surf_norm(t):
    return re.sub(r"[\s、。，．,.!！?？…「」『』（）()ー〜~]", "", re.sub(r"《([^|》]+)\|[^》]+》", r"\1", t or ""))


def find_cut(words, exp, d, terms, script_surface=""):
    """words=[(text,start,end)] → (後ろを切る秒 or None, 台本の後ろに聞こえた文字, 前を切る秒 or None)"""
    got, owner = "", []
    for wi, (w, _, _) in enumerate(words):
        k = reading.canon(w, d, terms) if w.strip() else ""
        got += k
        owner += [wi] * len(k)
    if not got or not exp:
        return None, "", None
    sm = SequenceMatcher(None, exp, got, autojunk=False)
    blocks = [b for b in sm.get_matching_blocks() if b.size]
    # 前：台本の最初の音がそのまま聞こえていて、その前に声（「んー」など）があれば、そこを切る
    head = None
    if blocks and blocks[0].a == 0 and blocks[0].b >= 1:
        gi0 = blocks[0].b
        w0 = owner[gi0]
        first = owner.index(w0)                      # その単語のかなが始まる位置
        n = owner.count(w0)
        ws, we = words[w0][1], words[w0][2]
        head = max(0.0, ws + (we - ws) * (gi0 - first) / max(1, n) - 0.05)   # 単語の途中なら、かなの割合で時刻を見積もる
    end_blocks = [b for b in blocks if b.a + b.size >= len(exp) - TAIL_SLACK]
    if not end_blocks:
        return None, "", head
    b = end_blocks[-1]
    gi = b.b + b.size - 1
    wi = owner[gi]
    # かなの照合で拾えなかった最後の字（「有利区間」の「間」が単独だと別の読みになる等）を切らないように、
    # 次の単語の字面が台本の終わりの字面に含まれていれば、台詞の一部として残す
    tail_surface = surf_norm(script_surface)[-8:]
    while wi + 1 < len(words) and surf_norm(words[wi + 1][0]) and surf_norm(words[wi + 1][0]) in tail_surface:
        wi += 1
    extra = "".join(w for w, _, _ in words[wi + 1:]).strip()
    return words[wi][2], extra, head


def ring_end(x, sr, t):
    """t から、声が静かになる（10ms 窓で6つ続けて小さい）ところまで延ばす。最大 MAX_RING 秒"""
    fr = int(sr * 0.01)
    peak = float(np.sqrt(np.mean(x ** 2)) or 1e-4)
    thr = max(0.012, peak * 0.18)
    i = int(t * sr)
    quiet = 0
    limit = min(len(x), int((t + MAX_RING) * sr))
    while i + fr <= limit:
        if np.sqrt(np.mean(x[i:i + fr] ** 2)) < thr:
            quiet += 1
            if quiet >= 6:
                return (i - 5 * fr) / sr
        else:
            quiet = 0
        i += fr
    return limit / sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--only")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    a = ap.parse_args()
    ep = (ROOT / a.episode).resolve() if not Path(a.episode).is_absolute() else Path(a.episode)
    d = reading.load_dict()
    terms = [t for t in reading.terms(d) if t[3] == "ok"]
    only = set(a.only.split(",")) if a.only else None
    items = [it for it in all_lines(ep, only) if (ep / "voices" / f"{it['id']}.wav").exists()]
    from faster_whisper import WhisperModel
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    logp = ep / "reading" / "trim.json"
    log = json.loads(logp.read_text(encoding="utf-8")) if logp.exists() else {}
    for n, it in enumerate(items, 1):
        wp = ep / "voices" / f"{it['id']}.wav"
        with wave.open(str(wp)) as w:
            params, sr = w.getparams(), w.getframerate()
            raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        x = raw.astype(np.float32) / 32768
        segs, _ = model.transcribe(load16k(wp), language="ja", beam_size=5, temperature=0.0,
                                   condition_on_previous_text=False, vad_filter=False, word_timestamps=True)
        words = [(wd.word, wd.start, wd.end) for s in segs for wd in (s.words or [])]
        exp = expected_kana(it, d, terms)
        t, extra, head = find_cut(words, exp, d, terms, it.get("text") or it["say"])
        dur = len(x) / sr
        rec = {"orig": round(dur, 3), "asr": "".join(w for w, _, _ in words).strip()}
        cut = dur
        if t is None:
            rec.update(cut=None, note="台本の終わりが聞き取れないので後ろは切らない（関門で確かめる）")
        else:
            c = min(dur, ring_end(x, sr, t) + PAD)
            if dur - c > 0.12:
                cut = c
                rec.update(cut=round(cut, 3), removed=round(dur - cut, 3), extra=extra)
        start = head if head and head > 0.08 else 0.0
        if start:
            rec.update(head_cut=round(start, 3))
        if cut < dur or start:
            y = raw[int(start * sr): int(cut * sr)].astype(np.float32)
            f = int(sr * FADE)
            y[-f:] *= np.linspace(1, 0, f)
            y[:f] *= np.linspace(0, 1, f)
            with wave.open(str(wp), "wb") as o:
                o.setparams(params)
                o.writeframes(y.astype(np.int16).tobytes())
        log[it["id"]] = rec
        print(f"[{n}/{len(items)}] {it['id']} 後ろ{rec.get('removed', 0)}s 前{rec.get('head_cut', 0)}s  後ろの声：{extra!r}", flush=True)
    logp.parent.mkdir(parents=True, exist_ok=True)
    logp.write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
