#!/usr/bin/env python3
"""Gemini で、台本の片方の話者のセリフを数行ずつまとめて作り、1行ずつの音声に切り分けて保存する（無料枠向け）

  GEMINI_API_KEY=... python scripts/voice_ab/gemini_chunks.py episodes/news01 nagi [--chunk 6] [--model gemini-3.8-flash-tts] [--max-requests 10]

- 声と演技は voice/casting_c.json の <who>（voice・profile）。行ごとの演技（叫び・聞き返し・語尾の型）は行の指示に足す
- 1回のリクエスト＝chunk 行。切り分けは scripts/voice_ab/split_lines.py（文字数から長さを見積もる）
- できた行は episodes/<回>/voices/<行ID>.wav（24kHz・音量そろえ済み）。すでにある行は作らない → 無料枠が尽きたら翌日に続きから
  （作り直したい行は voices/<行ID>.gemini_done を消す）
"""
import argparse, json, re, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab")); sys.path.insert(0, str(Path(__file__).resolve().parent))
import episode  # noqa: E402
from gemini_tts import call, save_audio, TAIL  # noqa: E402

LOUD = ("75%！", "全部1500", "夢あるやん", "島に1人", "ほぼ全員")


def note(it):
    dr = it.get("dir", {})
    bits = (["驚いて勢いよく叫ぶ"] if it.get("tsukkomi") or dr.get("mood") == "excited" else []) + \
           (["聞き返す"] if dr.get("mood") == "ask" else []) + [TAIL[t] for t in dr.get("tail", "").split("+") if t in TAIL]
    if any(k in it["text"] for k in LOUD):
        bits.append("テンション高く、驚いて")
    if "コメント" in it["text"] or "書いてくれたら" in it["text"]:
        bits.append("視聴者に呼びかけるように、明るく")
    return "、".join(bits)


def to24k(src, dst):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-ac", "1", "-af", "aresample=24000", "-ar", "24000",
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.int16).astype(float)
    a = (a * (3000 / max(np.sqrt(np.mean(a ** 2)), 1))).clip(-32000, 32000).astype(np.int16)
    with wave.open(str(dst), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(a.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode_dir"); ap.add_argument("who", choices=["nagi", "baku"])
    ap.add_argument("--chunk", type=int, default=6)
    ap.add_argument("--model", default=None)
    ap.add_argument("--max-requests", type=int, default=10)
    a = ap.parse_args()
    ep = Path(a.episode_dir); vdir = ep / "voices"; vdir.mkdir(exist_ok=True)
    cast = json.loads((ROOT / "voice" / "casting_c.json").read_text(encoding="utf-8"))[a.who]
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))
    items = [it for sc in sorted((ep / "script").glob("*.txt")) for it in episode.lines_with_ids(sc) if it["who"] == a.who]
    todo = [it for it in items if not (vdir / f"{it['id']}.gemini_done").exists()]
    print(f"{a.who}: 全{len(items)}行のうち未作成 {len(todo)}行", flush=True)
    for n, k in enumerate(range(0, len(todo), a.chunk)):
        if n >= a.max_requests:
            print("今回の回数の上限に達したので終了"); break
        group = todo[k:k + a.chunk]
        parts = []
        for it in group:
            t = it["text"]
            for r in d["rules"]:
                t = re.sub(r["re"], r["to"], t)
            parts.append({"text": t, "speechMetadata": {"style": cast["profile"] + note(it) + "。1行ごとに少し間を空ける。"}})
        body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cast["voice"]}}}}}
        res = call(f"models/{a.model or cast['model']}:generateContent", body)     # 1日の上限なら SystemExit で止まる
        with tempfile.TemporaryDirectory() as tmp:
            whole = Path(tmp) / "all.wav"
            save_audio(whole, res["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            if len(group) == 1:
                (Path(tmp) / f"{group[0]['id']}.wav").write_bytes(whole.read_bytes())
            else:
                subprocess.run([sys.executable, str(ROOT / "scripts/voice_ab/split_lines.py"), str(whole), tmp,
                                *[it["id"] for it in group], "--texts", "|".join(it["text"] for it in group)], check=True)
            for it in group:
                to24k(Path(tmp) / f"{it['id']}.wav", vdir / f"{it['id']}.wav")
                (vdir / f"{it['id']}.gemini_done").write_text(f"{cast['voice']} {a.model or cast['model']}\n")
        print(f"  {n + 1}回目：{group[0]['id']}〜{group[-1]['id']} 完了", flush=True)


if __name__ == "__main__":
    main()
