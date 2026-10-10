"""ナギとバクの声（VOICEVOX エンジン）と、読みの辞書

  エンジン：VOICEVOX ENGINE（Linux CPU 版）を http://127.0.0.1:50021 で起動しておく
  辞書　　：voice/dictionary.json
            words … 機種名・用語の読みとアクセント（エンジンのユーザー辞書に登録）
            rules … 読み上げ前の置き換え（1/319.7 → 319.7分の1、ST → エスティー など）
  声の設定：voice/casting.json（キャラごとの話者ID・速さ・高さ・抑揚）

  python -m v3.voice episodes/v4_haken            # 全セリフの音声を voices/<ID>.wav に書き出す
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from .style import ROOT

ENGINE = "http://127.0.0.1:50021"
DICT = ROOT / "voice" / "dictionary.json"
CAST = ROOT / "voice" / "casting.json"
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))     # ローカルのエンジンにはプロキシを通さない


def _req(method, path, params=None, body=None, raw=False):
    url = ENGINE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with _opener.open(r, timeout=120) as res:
        b = res.read()
    return b if raw else (json.loads(b) if b else None)


def load_dict():
    return json.loads(DICT.read_text(encoding="utf-8"))


def speech_text(text, d=None):
    """台本の文 → 読み上げ用の文（rules を順に適用）"""
    d = d or load_dict()
    s = text
    for r in d["rules"]:
        s = re.sub(r["re"], r["to"], s)
    return s


def sync_dict(d=None):
    """voice/dictionary.json の words をエンジンのユーザー辞書に入れ直す"""
    d = d or load_dict()
    cur = _req("GET", "/user_dict") or {}
    for uid in cur:
        _req("DELETE", f"/user_dict_word/{uid}")
    for w in d["words"]:
        _req("POST", "/user_dict_word", {"surface": w["surface"], "pronunciation": w["yomi"],
                                         "accent_type": int(w.get("accent", 0)), "word_type": "PROPER_NOUN",
                                         "priority": 10})


def query(text, speaker):
    return _req("POST", "/audio_query", {"text": text, "speaker": speaker})


def synth(q, speaker):
    return _req("POST", "/synthesis", {"speaker": speaker}, body=q, raw=True)


def cast():
    return json.loads(CAST.read_text(encoding="utf-8"))


def line_audio(text, who, d=None, c=None):
    """1セリフ → (wav バイト列, 読み上げ用の文, エンジンが読んだカナ)"""
    c = c or cast()
    cfg = c[who]
    st = speech_text(text, d)
    q = query(st, cfg["speaker"])
    q["speedScale"] = cfg.get("speed", 1.0)
    q["pitchScale"] = cfg.get("pitch", 0.0)
    q["intonationScale"] = cfg.get("intonation", 1.0)
    q["volumeScale"] = cfg.get("volume", 1.0)
    q["prePhonemeLength"], q["postPhonemeLength"] = 0.05, 0.08
    if cfg.get("drawl"):
        drawl(q, cfg["drawl"])
    return synth(q, cfg["speaker"]), st, q["kana"]


def drawl(q, p):
    """気だるげな「タメ」：読点の前と文末の音を伸ばし、文末はゆるく下げる。読点の間も少し長く
    p = {"comma": 読点前の伸ばし倍率, "end": 文末の伸ばし倍率, "fall": 文末の下げ幅, "pause": 間の倍率}"""
    q["pauseLengthScale"] = p.get("pause", 1.3)
    aps = q["accent_phrases"]
    for i, ap in enumerate(aps):
        ms = ap["moras"]
        if not ms:
            continue
        last = ms[-1]
        if ap.get("pause_mora") and i < len(aps) - 1:          # 「まぁ、」の「ぁ」をためる
            last["vowel_length"] *= p.get("comma", 1.5)
        if i == len(aps) - 1:                                   # 文末：「〜だねー」をゆるく伸ばして下げる
            last["vowel_length"] *= p.get("end", 2.2)
            fall = p.get("fall", 0.18)
            for k, m in enumerate(ms[-3:]):
                if m["pitch"] > 0:
                    m["pitch"] -= fall * (k + 1) / 3


def main():
    from .planner import parse
    ep = Path(sys.argv[1])
    d = load_dict()
    sync_dict(d)
    c = cast()
    out = ep / "voices"
    out.mkdir(exist_ok=True)
    n = 0
    for it in parse(ep / "script.txt"):
        if it["cmd"] != "line":
            continue
        n += 1
        wav, st, kana = line_audio(it["text"], it["who"], d, c)
        (out / f"{n:03d}.wav").write_bytes(wav)
        print(f"{n:03d} {it['who']}: {kana}")


if __name__ == "__main__":
    main()
