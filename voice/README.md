# 声と校閲（V4〜）

- 声：VOICEVOX ENGINE（無料・CPU で動く）。`bash scripts/setup_voicevox.sh` で用意して起動
- 読みの辞書：`voice/dictionary.json`（words＝機種名などの読みとアクセント、rules＝1/319.7→319.7分の1 などの置き換え）
- 声の割り当て：`voice/casting.json`（ナギ・バクの話者ID・速さ・高さ・抑揚）

## 手順
1. `python -m v3.proof episodes/<回>` → `PROOF.md`（校閲シート）。⚠️ の行だけ確認し、読みが違えば辞書を直す
2. `python -m v3.voice episodes/<回>` → `voices/<行番号>.wav`（全セリフの音声）
3. `python -m v3.build episodes/<回> -o out.mp4` → 音声の長さに合わせて字幕・場面が自動で組み直される

## 注意
- VOICEVOX の各キャラクターには個別の利用規約がある。動画には「VOICEVOX:キャラ名」のクレジットが必要（キャラごとに規約を確認すること）
- VOICEVOX は標準語のアクセントで読むため、バクの関西弁は東京式のイントネーションになる。気になる言葉は辞書のアクセントで個別に調整する
