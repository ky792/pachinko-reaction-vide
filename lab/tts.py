#!/usr/bin/env python3
"""研究所シリーズの声を VOICEVOX（無料・ローカル）で作る。

  python lab/tts.py episodes/ken_test90_B          # voices/<セリフID>.wav を書き出す

- 声の設定は エピソードの casting.json（無ければ voice/casting_b.json＝改善版B）
- 読みは voice/dictionary.json（置き換え rules・ユーザー辞書 words・アクセント直し kana_fix）
- 台本の @dir（直後の1セリフだけに効く）で、話速・抑揚・音量・強調語・声の種類を変える
    speed=1.1  int=0.9  vol=0.85  emph=同じ条件,手かせ  mood=excited  tail=up+long
- tail＝語尾の型（up 上げる／down 下げる／flat 平らに保つ／long 最後の音を伸ばす。up+long のように + でつなぐ）
- 語尾の「タメ」（drawl）と辞書まわりは、PR #3（v3/voice.py）の処理をそのまま移したもの
- 同じセリフ・同じ設定なら cache/tts_lab/ から再利用する（作り直さない）
"""
import hashlib
import math
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import episode  # noqa: E402
import reading  # noqa: E402

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
    s = reading.say(text)           # 《表記|よみ》→ よみ
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
SEMITONE = 0.0578     # VOICEVOX の pitch は ln(Hz)。1半音 ≒ ln(2)/12


def tail(q, kinds):
    """語尾の型。量は参考の声の実測（docs/analysis/voice_reference_2026-10-14.md）から：
    up＝最後を約＋5半音（疑問文は VOICEVOX が上げるので約＋2半音だけ足す）、down＝最後の3拍で約−8半音、
    flat＝最後の3拍を下げずに保つ、long＝最後の音を約2倍"""
    voiced = [m for ap in q["accent_phrases"] for m in ap["moras"] if m["pitch"] > 0]
    if len(voiced) < 2:
        return
    last = q["accent_phrases"][-1]
    for k in kinds:
        if k == "up":
            amt = 2 if last.get("is_interrogative") else 5
            voiced[-1]["pitch"] += amt * SEMITONE
            voiced[-2]["pitch"] += amt * SEMITONE * 0.4
            voiced[-1]["vowel_length"] *= 1.4
        elif k == "down":
            for i, m in enumerate(voiced[-3:]):
                m["pitch"] -= 8 * SEMITONE * (i + 1) / 3
        elif k == "flat":
            ref = voiced[-4]["pitch"] if len(voiced) >= 4 else voiced[0]["pitch"]
            for m in voiced[-3:]:
                m["pitch"] = max(m["pitch"], ref - SEMITONE)
        elif k == "long":
            ms = last["moras"]
            ms[-1]["vowel_length"] *= 2.0
        else:
            print(f"    tail の知らない型: {k}（up / down / flat / long）")


def cap_pitch(q, pitch_scale, max_hz=None, min_hz=None):
    """高すぎる・低すぎる音を抑える（声がかすれる／ガラガラする高さに入らないように）。
    上限・下限の1半音手前から先は、はみ出した分を3割に縮める。
    VOICEVOX は合成時に pitch × 2^pitchScale するので、その分を見込んで決める"""
    for ap in q["accent_phrases"]:
        for m in ap["moras"]:
            if m["pitch"] <= 0:
                continue
            if max_hz:
                knee = math.log(max_hz) / (2 ** pitch_scale) - SEMITONE
                if m["pitch"] > knee:
                    m["pitch"] = knee + (m["pitch"] - knee) * 0.3
            if min_hz:
                knee = math.log(min_hz) / (2 ** pitch_scale) + SEMITONE
                if m["pitch"] < knee:
                    m["pitch"] = knee - (knee - m["pitch"]) * 0.3


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
        emphasize(q, w, sp, d, rise=cfg.get("emph_rise", 0.12))
    if direc.get("tail"):
        tail(q, direc["tail"].split("+"))
    if cfg.get("pitch_max_hz") or cfg.get("pitch_min_hz"):
        cap_pitch(q, q["pitchScale"], cfg.get("pitch_max_hz"), cfg.get("pitch_min_hz"))
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
            voice_keys = {k: v for k, v in direc.items() if k in ("speed", "int", "vol", "emph", "mood", "tail")}
            if direc and not voice_keys:
                voice_keys = {"_directed": 1}        # 演出つき台本（前後の無音を最小にする）
            key = hashlib.sha1(json.dumps([it.get("say", it["text"]), it["who"], it["tsukkomi"], voice_keys, casting[it["who"]], d, version],
                                          ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
            cache = CACHE / f"{key}.wav"
            kana = "(再利用)"
            if not cache.exists():
                wav, kana, mood = line_audio(it.get("say", it["text"]), it["who"], casting, d,
                                             {k: v for k, v in voice_keys.items() if k != "_directed"} or ({"_": 1} if direc else {}),
                                             it["tsukkomi"])
                cache.write_bytes(wav)
            (out / f"{it['id']}.wav").write_bytes(cache.read_bytes())
            kana_log.append(f"{it['id']}\t{it['text']}\t{kana}")
            print(f"  {it['id']} {it['who']}: {kana}", flush=True)
    (out / "_kana.txt").write_text("\n".join(kana_log) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
