#!/usr/bin/env python3
"""聞き比べ用：B2 などの研究所台本を Gemini の音声生成で読む（未検証の試作。APIキーが入ったら動作確認する）

  GEMINI_API_KEY=... python scripts/voice_ab/gemini_tts.py episodes/ken_test90_B2 -o <出力フォルダ> [--model <モデル名>]

- 1行ずつ生成する（毎回の声のブレを行単位で比べるため）。読みは voice/dictionary.json の rules で直してから渡す
- 演技は言葉で指示する（@dir の tail / mood を日本語の指示文に置き換える）
- モデル名が分からないときは --list でキーで使えるTTSモデルを表示する
"""
import argparse, base64, json, os, re, sys, urllib.request, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
import episode  # noqa: E402

API = "https://generativelanguage.googleapis.com/v1beta"
VOICE = {"nagi": "Kore", "baku": "Puck"}          # 既定の声。AB時に差し替える
CHARA = {"nagi": "冷静で知的な若い女性。標準語。落ち着いて、言い切りははっきり。",
         "baku": "元気な若い男性。関西弁。普段はくだけて語尾を落とさず軽く、ツッコミは勢いよく。"}
TAIL = {"up": "語尾を上げて聞き返すように", "down": "語尾をしっかり下げて言い切るように",
        "flat": "語尾を下げずに軽く流すように", "long": "最後の音を少し伸ばして"}


def call(path, body=None):
    key = os.environ["GEMINI_API_KEY"]
    req = urllib.request.Request(f"{API}/{path}{'&' if '?' in path else '?'}key={key}",
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def direction(it):
    d = it.get("dir", {})
    bits = [CHARA[it["who"]]]
    if it.get("tsukkomi") or d.get("mood") == "excited":
        bits.append("驚いて勢いよく叫ぶように")
    if d.get("mood") == "ask":
        bits.append("聞き返すように")
    bits += [TAIL[t] for t in d.get("tail", "").split("+") if t in TAIL]
    return "、".join(bits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode_dir", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("--model", default="gemini-2.5-flash-preview-tts")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        for m in call("models?pageSize=200")["models"]:
            if "tts" in m["name"].lower():
                print(m["name"])
        return
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for sp in sorted((Path(a.episode_dir) / "script").glob("*.txt")):
        for it in episode.lines_with_ids(sp):
            text = it["text"]
            for r in d["rules"]:
                text = re.sub(r["re"], r["to"], text)
            prompt = f"次のセリフを、{direction(it)}読んでください。セリフ以外は読まないでください。\n{text}"
            body = {"contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseModalities": ["AUDIO"],
                                         "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE[it["who"]]}}}}}
            res = call(f"models/{a.model}:generateContent", body)
            pcm = base64.b64decode(res["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            with wave.open(str(out / f"{it['id']}.wav"), "wb") as w:      # 24kHz・16bit・モノラル
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
            print(it["id"], it["who"], direction(it), flush=True)


if __name__ == "__main__":
    main()
