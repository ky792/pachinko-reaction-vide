#!/usr/bin/env python3
"""AivisSpeech で、指定モデルの全話者・全スタイルにセリフを読ませる（GitHub Actions 用）

  python scripts/voice_ab/aivis_audition.py voice_ab/aivis_request.json voice_ab/aivis_out

request: {"action": "audition", "models": [{"uuid": "...", "for": "nagi|baku"}],
          "lines": {"nagi": ["..."], "baku": ["..."]}, "speed": 1.0, "intonation": 1.0}
- 各スタイルで lines[for] を続けて読み、<モデル名>_<話者>_<スタイル>.wav に1本で書き出す（試聴用）
- 読みは voice/dictionary.json の rules で直してから渡す（台本の《表記|よみ》は よみ を読む）
- action=lines では、エンジンが実際に使った読み（audio_query の kana）を <out>/kana.json に残す（読み間違い検査用）
- dictionary.json の aivis_words（漢字の表記・読み・アクセント）を AivisSpeech のユーザー辞書に入れてから読む（"user_dict": false で入れない）
  字幕の漢字はそのままで、読みだけエンジンの辞書で直す。kana_fix のうち engine=aivis のものでアクセントも直す
"""
import json, re, sys, urllib.parse, urllib.request, wave, io
from pathlib import Path

BASE = "http://127.0.0.1:10101"
ROOT = Path(__file__).resolve().parents[2]


def post(path, params, body=None):
    req = urllib.request.Request(f"{BASE}{path}?{urllib.parse.urlencode(params)}", method="POST",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def lines(rq, out, fix):
    """action=lines：台本のうち who の行だけを1行ずつ <行ID>.wav に書き出す（本番用の音声）"""
    sys.path.insert(0, str(ROOT / "lab")); import episode  # noqa: E402
    with urllib.request.urlopen(f"{BASE}/speakers", timeout=60) as r:
        sp = next(s for s in json.loads(r.read()) if rq["model"]["name"] in s["name"])
    sid = next(st["id"] for st in sp["styles"] if st["name"] == rq["style"])
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))
    import reading  # noqa: E402
    if rq.get("user_dict", True):          # aivis_words（読みとアクセント）を AivisSpeech のユーザー辞書に入れる
        n = 0
        for w in reading.aivis_words(d):
            post("/user_dict_word", {"surface": w["surface"], "pronunciation": w["pronunciation"],
                                     "accent_type": int(w.get("accent_type", 0)), "word_type": w.get("word_type", "COMMON_NOUN"),
                                     "priority": int(w.get("priority", 8))})
            n += 1
        print("ユーザー辞書に登録:", n, "語", flush=True)
    if rq.get("legacy_words"):             # 前の VOICEVOX 用の words も入れる（既定は入れない）
        for w in d["words"]:
            post("/user_dict_word", {"surface": w["surface"], "pronunciation": w["yomi"],
                                     "accent_type": int(w.get("accent", 0)), "word_type": "PROPER_NOUN", "priority": 10})
    kfix = [f for f in d.get("kana_fix", []) if f.get("engine") == "aivis"]   # アクセントの直し（AivisSpeech 用だけ）
    kf = out / "kana.json"
    kanas = json.loads(kf.read_text(encoding="utf-8")) if kf.exists() else {}
    for sc in sorted((ROOT / rq["episode"] / "script").glob("*.txt")):
        for it in episode.lines_with_ids(sc):
            if it["who"] != rq["who"] or (rq.get("only") and it["id"] not in rq["only"]):
                continue
            text = reading.speech_text(it.get("say", it["text"]), d, "aivis")
            q = json.loads(post("/audio_query", {"text": text, "speaker": sid}))
            new = q.get("kana", "")
            for f in kfix:
                new = re.sub(f["re"], f["to"], new)
            if kfix and new != q.get("kana", ""):
                q["accent_phrases"] = json.loads(post("/accent_phrases", {"text": new, "speaker": sid, "is_kana": "true"}))
                q["kana"] = new
            q.update({"speedScale": rq.get("speed", 1.0), "intonationScale": rq.get("intonation", 1.0),
                      "prePhonemeLength": 0.05, "postPhonemeLength": 0.08})
            (out / f"{it['id']}.wav").write_bytes(post("/synthesis", {"speaker": sid}, q))
            kanas[it["id"]] = {"text": text, "kana": q.get("kana", "")}
            print(it["id"], it["text"], flush=True)
    kf.write_text(json.dumps(kanas, ensure_ascii=False, indent=1), encoding="utf-8")


def variants(rq, out, fix):
    """action=variants：同じ声・スタイルで、速さ・抑揚などを変えた版を作る。<name>.wav に lines をつないで書き出す"""
    with urllib.request.urlopen(f"{BASE}/speakers", timeout=60) as r:
        sp = next(s for s in json.loads(r.read()) if rq["model"]["name"] in s["name"])
    sid = next(st["id"] for st in sp["styles"] if st["name"] == rq["style"])
    index = []
    for v in rq["variants"]:
        pcm, sr = [], 44100
        for line in rq["lines"]:
            q = json.loads(post("/audio_query", {"text": fix(line), "speaker": sid}))
            q.update({"speedScale": v.get("speed", 1.0), "intonationScale": v.get("intonation", 1.0),
                      "pitchScale": v.get("pitch", 0.0)})
            if "tempo_dynamics" in v:
                q["tempoDynamicsScale"] = v["tempo_dynamics"]
            w = wave.open(io.BytesIO(post("/synthesis", {"speaker": sid}, q)))
            sr = w.getframerate(); pcm.append(w.readframes(w.getnframes())); pcm.append(b"\0\0" * int(sr * 0.5))
        with wave.open(str(out / f"{v['name']}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b"".join(pcm))
        index.append({"file": f"{v['name']}.wav", **v}); print(v["name"], flush=True)
    json.dump(index, open(out / "index.json", "w"), ensure_ascii=False, indent=1)


def main():
    rq = json.load(open(sys.argv[1])); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))
    def fix(s):
        for r in d["rules"]:
            s = re.sub(r["re"], r["to"], s)
        return s
    if rq["action"] == "lines":
        return lines(rq, out, fix)
    if rq["action"] == "variants":
        return variants(rq, out, fix)
    with urllib.request.urlopen(f"{BASE}/speakers", timeout=60) as r:
        speakers = json.loads(r.read())
    want = {m["name"]: m["for"] for m in rq["models"]}     # /speakers の話者名＝AivisHub のモデル名で対応づける
    index = []
    for sp in speakers:
        who = want.get(sp["name"]) or next((w for n, w in want.items() if n in sp["name"] or sp["name"] in n), None)
        if who is None:
            print("対象外の話者:", sp["name"]); continue
        for st in sp["styles"]:
            pcm, sr = [], 44100
            for line in rq["lines"][who]:
                q = json.loads(post("/audio_query", {"text": fix(line), "speaker": st["id"]}))
                q.update({"speedScale": rq.get("speed", 1.0), "intonationScale": rq.get("intonation", 1.0)})
                w = wave.open(io.BytesIO(post("/synthesis", {"speaker": st["id"]}, q)))
                sr = w.getframerate(); pcm.append(w.readframes(w.getnframes())); pcm.append(b"\0\0" * int(sr * 0.5))
            name = re.sub(r"[^\w\-]", "_", f"{sp['name']}_{st['name']}")
            with wave.open(str(out / f"{name}.wav"), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b"".join(pcm))
            index.append({"file": f"{name}.wav", "speaker": sp["name"], "style": st["name"], "for": who})
            print(name, flush=True)
    json.dump(index, open(out / "index.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
