#!/usr/bin/env python3
"""研究所シリーズの声を VOICEVOX（無料・ローカル）で作る。

  python lab/tts.py episodes/ken_test90_B          # voices/<セリフID>.wav を書き出す

- 声の設定は エピソードの casting.json（無ければ voice/casting_b.json＝改善版B）
- 読みは voice/dictionary.json（置き換え rules・ユーザー辞書 words・アクセント直し kana_fix）
- 台本の @dir（直後の1セリフだけに効く）で、話速・抑揚・音量・強調語・声の種類を変える
    speed=1.1  int=0.9  vol=0.85  emph=同じ条件,手かせ  mood=excited
- 語尾の「タメ」（drawl）と辞書まわりは、PR #3（v3/voice.py）の処理をそのまま移したもの
- 同じセリフ・同じ設定なら cache/tts_lab/ から再利用する（作り直さない）
"""
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import episode  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ENGINE = "http://127.0.0.1:50021"
DICT = ROOT / "voice" / "dictionary.json"
CAST = ROOT / "voice" / "casting_b.json"
CACHE = ROOT / "cache" / "tts_lab"
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # ローカルのエンジンにはプロキシを通さない


def _req(method, path, params=None, body=None, raw=False):
    url = ENGINE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with _opener.open(r, timeout=120) as res:
        b = res.read()
    return b if raw else (json.loads(b) if b else None)


# ---------------------------------------------------------------- 辞書（v3/voice.py と同じ）
def load_dict():
    return json.loads(DICT.read_text(encoding="utf-8"))


def speech_text(text, d):
    s = text
    for r in d["rules"]:
        s = re.sub(r["re"], r["to"], s)
    return s


def sync_dict(d):
    cur = _req("GET", "/user_dict") or {}
    for uid in cur:
        _req("DELETE", f"/user_dict_word/{uid}")
    for w in d["words"]:
        _req("POST", "/user_dict_word", {"surface": w["surface"], "pronunciation": w["yomi"],
                                         "accent_type": int(w.get("accent", 0)), "word_type": "PROPER_NOUN",
                                         "priority": 10})


def kana_fix(q, speaker, d):
    k = q["kana"]
    new = k
    for f in d.get("kana_fix", []):
        new = re.sub(f["re"], f["to"], new)
    if new != k:
        parts = re.split(r"([/、])", new)
        new = "".join(x if x in "/、" or "'" in x or not x else x + "'" for x in parts)
        q["accent_phrases"] = _req("POST", "/accent_phrases", {"text": new, "speaker": speaker, "is_kana": "true"})
        q["kana"] = new


def drawl(q, p):
    """語尾のタメ：読点の前と文末を伸ばし、読点の次を少し上げる（メリハリ）"""
    q["pauseLengthScale"] = p.get("pause", 1.3)
    aps = q["accent_phrases"]
    for i, ap in enumerate(aps):
        ms = ap["moras"]
        if not ms:
            continue
        last = ms[-1]
        if ap.get("pause_mora") and i < len(aps) - 1:
            last["vowel_length"] *= p.get("comma", 1.5)
        if p.get("punch") and i > 0 and aps[i - 1].get("pause_mora"):
            for m in ms:
                if m["pitch"] > 0:
                    m["pitch"] += p["punch"]
        if i == len(aps) - 1:
            last["vowel_length"] *= p.get("end", 2.2)
            fall = p.get("fall", 0.18)
            for k, m in enumerate(ms[-3:]):
                if m["pitch"] > 0:
                    m["pitch"] -= fall * (k + 1) / 3


# ---------------------------------------------------------------- 1セリフの演技
def emphasize(q, word, speaker, d, rise=0.12, stretch=1.15):
    """強調語：その語のモーラだけ少し高く・長く。見つからなければ何もしない（警告だけ）"""
    wq = _req("POST", "/audio_query", {"text": speech_text(word, d), "speaker": speaker})
    target = [m["text"] for ap in wq["accent_phrases"] for m in ap["moras"]]
    flat = [m for ap in q["accent_phrases"] for m in ap["moras"]]
    texts = [m["text"] for m in flat]
    n = len(target)
    for i in range(len(texts) - n + 1):
        if texts[i:i + n] == target:
            for m in flat[i:i + n]:
                if m["pitch"] > 0:
                    m["pitch"] += rise
                m["vowel_length"] *= stretch
            return True
    print(f"    強調語が見つかりません: {word}（{''.join(target)}）")
    return False


def voice_cfg(casting, who, mood):
    cfg = dict(casting[who])
    if mood and mood in cfg.get("moods", {}):
        mc = cfg["moods"][mood]
        cfg.update({k: v for k, v in mc.items() if k != "drawl"})
        if "drawl" in mc:
            cfg["drawl"] = {**cfg.get("drawl", {}), **mc["drawl"]} if mc["drawl"] else None
    return cfg


def line_audio(text, who, casting, d, direc, exclaim):
    mood = direc.get("mood") or (casting[who].get("exclaim_mood") if exclaim else None)
    cfg = voice_cfg(casting, who, mood)
    sp = cfg["speaker"]
    q = _req("POST", "/audio_query", {"text": speech_text(text, d), "speaker": sp})
    q["speedScale"] = cfg.get("speed", 1.0) * float(direc.get("speed", 1.0))
    q["pitchScale"] = cfg.get("pitch", 0.0)
    q["intonationScale"] = cfg.get("intonation", 1.0) * float(direc.get("int", 1.0))
    q["volumeScale"] = cfg.get("volume", 1.0) * float(direc.get("vol", 1.0))
    if direc:      # 演出つきの台本は、間を台本側（@dir pre/post）で決めるので前後の無音は最小に
        q["prePhonemeLength"], q["postPhonemeLength"] = 0.02, 0.03
    else:
        q["prePhonemeLength"], q["postPhonemeLength"] = 0.05, 0.08
    kana_fix(q, sp, d)
    if cfg.get("drawl"):
        drawl(q, cfg["drawl"])
    for w in [x for x in direc.get("emph", "").split(",") if x]:
        emphasize(q, w, sp, d)
    return _req("POST", "/synthesis", {"speaker": sp}, body=q, raw=True), q["kana"], mood


def main():
    ep = Path(sys.argv[1])
    d = load_dict()
    sync_dict(d)
    cp = ep / "casting.json"
    casting = json.loads((cp if cp.exists() else CAST).read_text(encoding="utf-8"))
    version = _req("GET", "/version")
    out = ep / "voices"
    out.mkdir(exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    kana_log = []
    for sp in sorted((ep / "script").glob("*.txt")):
        for it in episode.lines_with_ids(sp):
            direc = it.get("dir", {})
            voice_keys = {k: v for k, v in direc.items() if k in ("speed", "int", "vol", "emph", "mood")}
            if direc and not voice_keys:
                voice_keys = {"_directed": 1}        # 演出つき台本（前後の無音を最小にする）
            key = hashlib.sha1(json.dumps([it["text"], it["who"], it["tsukkomi"], voice_keys, casting[it["who"]], d, version],
                                          ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
            cache = CACHE / f"{key}.wav"
            kana = "(再利用)"
            if not cache.exists():
                wav, kana, mood = line_audio(it["text"], it["who"], casting, d,
                                             {k: v for k, v in voice_keys.items() if k != "_directed"} or ({"_": 1} if direc else {}),
                                             it["tsukkomi"])
                cache.write_bytes(wav)
            (out / f"{it['id']}.wav").write_bytes(cache.read_bytes())
            kana_log.append(f"{it['id']}\t{it['text']}\t{kana}")
            print(f"  {it['id']} {it['who']}: {kana}", flush=True)
    (out / "_kana.txt").write_text("\n".join(kana_log) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
