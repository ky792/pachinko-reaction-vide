#!/usr/bin/env python3
"""声選び用：同じセリフを Gemini の複数の声で読ませる（1声＝1リクエスト）

  GEMINI_API_KEY=... python scripts/voice_ab/audition.py -o <出力フォルダ> --voices Orus,Algenib --model gemini-3.8-flash-lite-tts \\
      --profile "低めで余裕のある関西弁の若い男性" --lines "それな。入らん日はほんまに入らん。|規制が、北斗無双のライバル止めてくれとるやん！"
"""
import argparse, base64, sys, wave
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gemini_tts import call, save_audio  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--model", default="gemini-3.8-flash-tts")
    ap.add_argument("--profile", required=True, help="AUDIO PROFILE（キャラの説明）")
    ap.add_argument("--notes", default="", help="DIRECTOR'S NOTES（演技の指示）")
    ap.add_argument("--lines", required=True, help="| 区切りのセリフ")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    transcript = "\n".join(a.lines.split("|"))
    prompt = (f"# AUDIO PROFILE\n{a.profile}\n\n### DIRECTOR'S NOTES\n{a.notes}\n"
              f"Only the TRANSCRIPT is spoken. Do not read these notes.\n\n#### TRANSCRIPT\n{transcript}")
    style = a.profile + a.notes
    parts = ([{"text": s, "speechMetadata": {"style": style}} for s in a.lines.split("|")]   # 3.8 系はテキストをそのまま読むので、演技は speechMetadata に
             if "3.8" in a.model else [{"text": prompt}])
    for v in a.voices.split(","):
        body = {"contents": [{"parts": parts}],
                "generationConfig": {"responseModalities": ["AUDIO"],
                                     "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": v}}}}}
        res = call(f"models/{a.model}:generateContent", body)
        save_audio(out / f"{v}.wav", res["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
        print(v, flush=True)


if __name__ == "__main__":
    main()
