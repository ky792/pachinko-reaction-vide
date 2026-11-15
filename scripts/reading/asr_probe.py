#!/usr/bin/env python3
"""文字起こしの設定を数行で比べる（CI 用。モデルや hotwords の違いで空になる・崩れるのを先に見る）

  python scripts/reading/asr_probe.py episodes/eva_history 02_bousou-006,03_shingeki-053 …
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_check  # noqa: E402

ep, ids = Path(sys.argv[1]), sys.argv[2].split(",")
from faster_whisper import WhisperModel  # noqa: E402
hot = asr_check.hotwords()
for name in ("kotoba-tech/kotoba-whisper-v2.0-faster", "large-v3-turbo", "medium", "small"):
    try:
        m = WhisperModel(name, device="cpu", compute_type="int8")
    except Exception as e:  # noqa: BLE001
        print("読めない:", name, e); continue
    for hw in (None, hot):
        for i in ids:
            t = time.time()
            segs, _ = m.transcribe(asr_check.load16k(ep / "voices" / f"{i}.wav"), language="ja", beam_size=5, temperature=0.0,
                                   condition_on_previous_text=False, vad_filter=False, hotwords=hw)
            print(f"[{name}|{'hot' if hw else 'nohot'}] {i} {time.time() - t:.1f}s :: {''.join(s.text for s in segs)}", flush=True)
