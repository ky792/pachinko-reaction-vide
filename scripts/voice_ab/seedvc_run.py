#!/usr/bin/env python3
"""Gemini の声（自然なイントネーション）を、AivisSpeech の声色に変える（Seed-VC・GitHub Actions 用）

  python scripts/voice_ab/seedvc_run.py voice_ab/vc_request.json voice_ab/vc_out <seed-vc のフォルダ>

request: {"aivis": {"name": "まお", "styles": ["からかい"], "lines": ["..."]},
          "sources": ["voice_ab/vc_in/zephyr.m4a"],
          "modes": [{"name": "speech"}, {"name": "f0auto", "f0": true, "auto": true}, {"name": "f0+7", "f0": true, "shift": 7}]}
- 声色の見本は、AivisSpeech（127.0.0.1:10101）で lines を読ませて作る
- 出力：<元の名前>__<スタイル>__<モード>.wav
"""
import io, json, subprocess, sys, urllib.parse, urllib.request, wave
from pathlib import Path

BASE = "http://127.0.0.1:10101"


def post(path, params, body=None):
    req = urllib.request.Request(f"{BASE}{path}?{urllib.parse.urlencode(params)}", method="POST",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def main():
    rq = json.load(open(sys.argv[1])); out = Path(sys.argv[2]); svc = Path(sys.argv[3]).resolve()
    out.mkdir(parents=True, exist_ok=True); work = Path("/tmp/vc"); work.mkdir(exist_ok=True)
    with urllib.request.urlopen(f"{BASE}/speakers", timeout=60) as r:
        sp = next(s for s in json.loads(r.read()) if rq["aivis"]["name"] in s["name"])
    refs = {}
    for style in rq["aivis"]["styles"]:
        sid = next(st["id"] for st in sp["styles"] if st["name"] == style)
        pcm, sr = [], 44100
        for line in rq["aivis"]["lines"]:
            q = json.loads(post("/audio_query", {"text": line, "speaker": sid}))
            w = wave.open(io.BytesIO(post("/synthesis", {"speaker": sid}, q)))
            sr = w.getframerate(); pcm.append(w.readframes(w.getnframes())); pcm.append(b"\0\0" * int(sr * 0.3))
        p = work / f"ref_{style}.wav"
        with wave.open(str(p), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b"".join(pcm))
        refs[style] = p; (out / f"ref__{style}.wav").write_bytes(p.read_bytes())
    srcs = []
    for s in rq["sources"]:
        p = work / (Path(s).stem + ".wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", s, "-ac", "1", "-ar", "44100", str(p)], check=True)
        srcs.append(p)
    for src in srcs:
        for style, ref in refs.items():
            for m in rq["modes"]:
                od = work / f"o_{src.stem}_{style}_{m['name']}"; od.mkdir(exist_ok=True)
                cmd = [sys.executable, "inference.py", "--source", str(src), "--target", str(ref), "--output", str(od),
                       "--diffusion-steps", str(rq.get("steps", 30)), "--length-adjust", "1.0", "--inference-cfg-rate", "0.7",
                       "--f0-condition", str(bool(m.get("f0"))), "--auto-f0-adjust", str(bool(m.get("auto"))),
                       "--semi-tone-shift", str(m.get("shift", 0)), "--fp16", "False"]
                subprocess.run(cmd, cwd=svc, check=True)
                res = sorted(od.glob("*.wav"))[-1]
                (out / f"{src.stem}__{style}__{m['name']}.wav").write_bytes(res.read_bytes())
                print(src.stem, style, m["name"], flush=True)


if __name__ == "__main__":
    main()
