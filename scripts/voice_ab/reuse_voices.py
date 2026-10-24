#!/usr/bin/env python3
"""台本を直したあと、セリフが変わっていない行の音声を新しい行IDへ付け替え、作り直しが要る行IDを出す

  python scripts/voice_ab/reuse_voices.py <前の台本フォルダ> episodes/<回>
  → 変わらない行は episodes/<回>/voices/<新ID>.wav に付け替え。新しい行・変わった行の ID を who ごとに JSON で出す
"""
import json, shutil, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))
import episode  # noqa: E402


def lines(d):
    return [it for sc in sorted(Path(d).glob("*.txt")) for it in episode.lines_with_ids(sc)]


def main():
    old_dir, ep = Path(sys.argv[1]), Path(sys.argv[2])
    vdir = ep / "voices"
    old = {}
    for it in lines(old_dir):
        old.setdefault((it["who"], it.get("say", it["text"])), it["id"])
    tmp = Path(tempfile.mkdtemp())
    for f in vdir.glob("*.wav"):
        shutil.copy(f, tmp / f.name)
    need = {"nagi": [], "baku": []}
    for f in vdir.glob("*.wav"):
        f.unlink()
    for it in lines(ep / "script"):
        oid = old.get((it["who"], it.get("say", it["text"])))
        if oid and (tmp / f"{oid}.wav").exists():
            shutil.copy(tmp / f"{oid}.wav", vdir / f"{it['id']}.wav")
        else:
            need[it["who"]].append(it["id"])
    print(json.dumps(need, ensure_ascii=False))


if __name__ == "__main__":
    main()
