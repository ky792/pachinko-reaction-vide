#!/usr/bin/env python3
"""Irodori-TTS（MIT・日本語専用）で、見本の声（voice_ab/vc_out/ref__*.m4a など）をまねてセリフを読ませる（GitHub Actions 用）

  python scripts/voice_ab/irodori_run.py voice_ab/irodori_request.json voice_ab/irodori_out <Irodori-TTS のフォルダ>

request: {"checkpoint": "Aratako/Irodori-TTS-v4.1-Small", "lines": ["..."],
          "variants": [{"name": "...", "ref": "voice_ab/vc_out/ref__からかい.m4a", "caption": "..."}]}
- ref を省くと見本なし（caption だけで声を作る）
- 1変種＝lines を0.5秒あけてつないだ <name>.wav
action=lines：{"action": "lines", "episode": "episodes/news01", "who": "baku", "variants": [...]}
- 台本の who の行を1行ずつ <out>/<変種名>/<行ID>.wav に（本番用）。読みは voice/dictionary.json の rules で直す（台本の《表記|よみ》は よみ を読む）
"""
import json, re, subprocess, sys, time, wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def base_args(rq, v, work):
    args = ["--hf-checkpoint", v.get("checkpoint", rq["checkpoint"])]
    if v.get("ref"):
        ref = work / f"ref_{Path(v['ref']).stem}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(Path(v["ref"]).resolve()), "-ac", "1", str(ref)], check=True)
        args += ["--ref-wav", str(ref)]
    else:
        args += ["--no-ref"]
    if v.get("caption"):
        args += ["--caption", v["caption"]]
    return args + [str(a) for a in v.get("extra", rq.get("extra", []))]


def lines(rq, out, repo, work):
    sys.path.insert(0, str(ROOT / "lab")); import episode  # noqa: E402
    d = json.loads((ROOT / "voice" / "dictionary.json").read_text(encoding="utf-8"))
    def fix(s):
        for r in d["rules"]:
            s = re.sub(r["re"], r["to"], s)
        return s
    items = [it for sc in sorted((ROOT / rq["episode"] / "script").glob("*.txt")) for it in episode.lines_with_ids(sc)
             if it["who"] == rq["who"] and (not rq.get("only") or it["id"] in rq["only"])]
    for v in rq["variants"]:
        args = base_args(rq, v, work); od = out / v["name"]; od.mkdir(parents=True, exist_ok=True)
        for it in items:
            subprocess.run(["uv", "run", "--no-sync", "python", "infer.py", *args, "--text", fix(it.get("say", it["text"])),
                            "--output-wav", str(od / f"{it['id']}.wav")], cwd=repo, check=True)
            print(v["name"], it["id"], it["text"], flush=True)


def main():
    rq = json.load(open(sys.argv[1])); out = Path(sys.argv[2]).resolve(); repo = Path(sys.argv[3]).resolve()
    out.mkdir(parents=True, exist_ok=True); work = Path("/tmp/irodori"); work.mkdir(exist_ok=True)
    if rq.get("action") == "lines":
        return lines(rq, out, repo, work)
    index = []
    for v in rq["variants"]:
        args = base_args(rq, v, work)
        pcm, sr, t0 = [], 0, time.time()
        for i, line in enumerate(rq["lines"]):
            wp = work / f"{v['name']}_{i}.wav"
            subprocess.run(["uv", "run", "--no-sync", "python", "infer.py", *args, "--text", line, "--output-wav", str(wp)],
                           cwd=repo, check=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wp), "-ac", "1", "-ar", "44100", "-sample_fmt", "s16",
                            str(wp.with_suffix(".s16.wav"))], check=True)
            w = wave.open(str(wp.with_suffix(".s16.wav"))); sr = w.getframerate()
            pcm.append(w.readframes(w.getnframes())); pcm.append(b"\0\0" * int(sr * 0.5))
        with wave.open(str(out / f"{v['name']}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b"".join(pcm))
        index.append({"file": f"{v['name']}.wav", **v, "sec": round(time.time() - t0)}); print(v["name"], flush=True)
        json.dump(index, open(out / "index.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
