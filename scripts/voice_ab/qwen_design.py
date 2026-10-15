#!/usr/bin/env python3
"""Qwen3-TTS のボイスデザインで、声の説明ごとにセリフを読ませる（GitHub Actions・CPU 用）

  python scripts/voice_ab/qwen_design.py voice_ab/qwen_request.json voice_ab/qwen_out

request: {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "language": "Japanese",
          "lines": ["..."], "designs": [{"name": "anime1", "instruct": "..."}]}
- 1つの説明につき、lines を1行ずつ作って 0.5秒の間でつなぎ、<name>.wav に書き出す
- 読みは voice/dictionary.json の rules で直してから渡す
"""
import json, re, sys, time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parents[2]


def main():
    rq = json.load(open(sys.argv[1])); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))

    def fix(s):
        for r in d["rules"]:
            s = re.sub(r["re"], r["to"], s)
        return s

    torch.set_num_threads(max(1, torch.get_num_threads()))
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(rq["model"], device_map="cpu", dtype=torch.float32)
    print(f"モデル読み込み {time.time() - t0:.0f}秒", flush=True)
    lines = [fix(s) for s in rq["lines"]]
    index = []
    for ds in rq["designs"]:
        t1 = time.time()
        wavs, sr = model.generate_voice_design(text=lines, language=[rq.get("language", "Japanese")] * len(lines),
                                               instruct=[ds["instruct"]] * len(lines))
        gap = np.zeros(int(sr * 0.5), dtype=np.float32)
        audio = np.concatenate([np.concatenate([np.asarray(w, dtype=np.float32), gap]) for w in wavs])
        sf.write(out / f"{ds['name']}.wav", audio, sr)
        index.append({"file": f"{ds['name']}.m4a", "name": ds["name"], "instruct": ds["instruct"], "sec": round(len(audio) / sr, 1),
                      "gen_sec": round(time.time() - t1)})
        print(ds["name"], f"{len(audio) / sr:.1f}秒の音声を {time.time() - t1:.0f}秒で生成", flush=True)
    json.dump(index, open(out / "index.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
