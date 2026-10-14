#!/usr/bin/env python3
"""聞き比べ用：研究所台本の掛け合いを、Gemini の2人会話モードで1リクエストにまとめて読む

  GEMINI_API_KEY=... python scripts/voice_ab/gemini_dialogue.py episodes/ken_test90_B2 -o out.wav [--model ...]

- 声と演技の設定は voice/casting_gemini.json
- 行ごとの演技（@dir の tail / mood、叫び）は DIRECTOR'S NOTES に行番号つきで渡す
- 無料枠はモデルごとに1日10回なので、1章＝1リクエストにすると無料でも回せる（1行ずつに切り分けるのは別途）
"""
import argparse, base64, json, re, sys, wave
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab")); sys.path.insert(0, str(Path(__file__).resolve().parent))
import episode  # noqa: E402
from gemini_tts import call, TAIL  # noqa: E402

NAME = {"nagi": "Nagi", "baku": "Baku"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode_dir")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--model", default="gemini-3.8-flash-tts")
    a = ap.parse_args()
    cast = json.loads((ROOT / "voice" / "casting_gemini.json").read_text(encoding="utf-8"))
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))
    lines, notes = [], []
    for sp in sorted((Path(a.episode_dir) / "script").glob("*.txt")):
        for n, it in enumerate(episode.lines_with_ids(sp), 1):
            text = it["text"]
            for r in d["rules"]:
                text = re.sub(r["re"], r["to"], text)
            lines.append(f"{NAME[it['who']]}: {text}")
            dr = it.get("dir", {})
            bits = (["驚いて勢いよく叫ぶ"] if it.get("tsukkomi") or dr.get("mood") == "excited" else []) + \
                   (["聞き返す"] if dr.get("mood") == "ask" else []) + \
                   [TAIL[t] for t in dr.get("tail", "").split("+") if t in TAIL]
            if bits:
                notes.append(f"- {n}行目（{NAME[it['who']]}）：{'、'.join(bits)}")
    prompt = ("# AUDIO PROFILE\n" + "\n".join(f"{NAME[w]}: {cast[w]['profile']}" for w in ("nagi", "baku")) +
              "\n\n## THE SCENE\n" + cast["scene"] +
              "\n\n### DIRECTOR'S NOTES\n" + cast["notes"] + "\n" + "\n".join(notes) +
              "\nOnly the TRANSCRIPT is spoken. Do not read these notes or the speaker names.\n\n#### TRANSCRIPT\n" + "\n".join(lines))
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"multiSpeakerVoiceConfig": {"speakerVoiceConfigs": [
                {"speaker": NAME[w], "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cast[w]["voice"]}}} for w in ("nagi", "baku")]}}}}
    res = call(f"models/{a.model}:generateContent", body)
    pcm = base64.b64decode(res["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    with wave.open(a.out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
    print(a.out, round(len(pcm) / 48000, 1), "秒")


if __name__ == "__main__":
    main()
