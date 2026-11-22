#!/usr/bin/env bash
# 試作に使う既存素材を、元のブランチから public/a/ に取り出す（リポジトリに二重に入れない）
#  - キャラ：公式表情集の切り出し（feat/kyu001-remotion の remotion/public/kyu/）を、表情集の番号の名前に付け直す
#  - 背景・効果音・BGM：同上
#  - 声：kyu001v2 の関門合格済み wav と gate.json（feat/kyu001-voice）
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/a
mkdir -p "$OUT/char" "$OUT/se" "$OUT/voice"
git fetch -q origin feat/kyu001-remotion feat/kyu001-voice 2>/dev/null || true
R=origin/feat/kyu001-remotion
V=origin/feat/kyu001-voice
get() { git show "$1:$2" > "$3"; }

# 表情集の番号 → 既存ファイル（同じ絵に別名が付いているので、番号を正本にする）
declare -A NAGI=([01]=normal [02]=happy [03]=confused [04]=sweat [05]=sad [06]=surprised [07]=smug [08]=sleep)
declare -A BAKU=([01]=happy [02]=normal [03]=surprised [04]=smug [05]=excited [06]=angry [07]=confused [08]=despair)
for k in "${!NAGI[@]}"; do get $R "remotion/public/kyu/nagi_${NAGI[$k]}.png" "$OUT/char/nagi_$k.png"; done
for k in "${!BAKU[@]}"; do get $R "remotion/public/kyu/baku_${BAKU[$k]}.png" "$OUT/char/baku_$k.png"; done

get $R remotion/public/kyu/room.jpg "$OUT/room.jpg"
get $R remotion/public/kyu/bgm.mp3 "$OUT/bgm.mp3"
for s in emphasis pop ochi res chapter; do get $R "remotion/public/kyu/se_$s.wav" "$OUT/se/$s.wav"; done

get $V episodes/kyu001v2/script/k01.txt "$OUT/k01.txt"
get $V episodes/kyu001v2/reading/gate.json "$OUT/gate.json"
python3 - "$OUT" <<'PY'
import re, subprocess, sys
out = sys.argv[1]
ids = re.findall(r"^\s*-\s*(k\d\d-\d{3})", open("episodes/proto01/direction.yaml", encoding="utf-8").read(), re.M)
lo, hi = min(ids), max(ids)
for n in range(int(lo[-3:]), int(hi[-3:]) + 1):
    i = f"{lo[:4]}{n:03d}"
    data = subprocess.check_output(["git", "show", f"origin/feat/kyu001-voice:episodes/kyu001v2/voices/{i}.wav"])
    open(f"{out}/voice/{i}.wav", "wb").write(data)
PY

# キャラ画像は小さい（約320〜440px）ので、寄りのカメラ用に2倍へ拡大（描き直しではなく画素の補間）
python3 - "$OUT/char" <<'PY'
import sys, glob
from PIL import Image, ImageFilter
for f in glob.glob(sys.argv[1] + "/*.png"):
    im = Image.open(f).convert("RGBA")
    if im.width > 600:
        continue
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    im.save(f)
PY
echo "prep done: $(ls $OUT/char | wc -l) char, $(ls $OUT/voice | wc -l) voices"
