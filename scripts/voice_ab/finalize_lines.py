#!/usr/bin/env python3
"""CIで作ったセリフ音声を、動画用にそろえる（episodes/<回>/voices/<行ID>.wav）

  python scripts/voice_ab/finalize_lines.py <入力フォルダ> <出力フォルダ> [--ids-from episodes/<回>] [--shift -1.5] [--squeeze]

- --shift：響きごと音の高さを変える（半音。asetrate 方式。ナギは -1.5）
- 前後の無音を切る。--squeeze で文中の0.25秒を超える無音を0.2秒に詰める（Irodori は読点で長く止まるため）
- 24kHz・モノラル・RMS 3000 にそろえる
- --ids-from を付けると、その回の台本にある行IDのファイルだけを処理する
"""
import argparse, subprocess, sys, wave
from pathlib import Path
import numpy as np

SR = 24000


def load(path, shift):
    w = wave.open(str(path)); sr = w.getframerate(); w.close()
    af = []
    if shift:
        r = 2 ** (shift / 12)
        af.append(f"asetrate={sr}*{r:.6f},aresample={sr},atempo={1 / r:.6f}")
    af.append("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,"
              "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-af", ",".join(af), "-ac", "1", "-ar", str(SR),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32)


def squeeze(a, hop=240, max_gap=0.25, keep=0.2):
    n = len(a) // hop
    e = np.array([np.sqrt((a[i * hop:(i + 1) * hop] ** 2).mean()) for i in range(n)])
    quiet = e < np.sqrt((a ** 2).mean()) * 10 ** (-28 / 20)
    mask = np.ones(len(a), bool); i = 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            L = (j - i) * hop
            if L > max_gap * SR and i > 0 and j < n:
                s = i * hop + int(keep / 2 * SR); mask[s:s + L - int(keep * SR)] = False
            i = j
        else:
            i += 1
    return a[mask]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--ids-from"); ap.add_argument("--shift", type=float, default=0.0)
    ap.add_argument("--squeeze", action="store_true")
    a = ap.parse_args()
    src, dst = Path(a.src), Path(a.dst); dst.mkdir(parents=True, exist_ok=True)
    files = sorted(src.glob("*.wav"))
    if a.ids_from:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab")); import episode  # noqa: E402
        ids = {it["id"] for sc in sorted((Path(a.ids_from) / "script").glob("*.txt")) for it in episode.lines_with_ids(sc)}
        files = [f for f in files if f.stem in ids]
    for f in files:
        x = load(f, a.shift)
        if a.squeeze:
            x = squeeze(x)
        x = np.clip(x * 3000 / max(np.sqrt((x ** 2).mean()), 1), -32767, 32767).astype(np.int16)
        with wave.open(str(dst / f.name), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())
    print(len(files), "files →", dst)


if __name__ == "__main__":
    main()
