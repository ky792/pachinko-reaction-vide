# ナギバク2.0 試作（anim2）

パーツ式リグ・口パク・カメラ・演出表で動画を組む、ナギバク2.0 の試作。提案書は `docs/nagibaku2/PROPOSAL.md`。

## 試作01（仮素材）
- 場面：休憩室#1 改訂版 k01-030〜040「スロット就活」（約46秒）
- **キャラはまだ公式表情集の全身画像の差し替え**（パーツ素材 N-01〜・B-01〜 の到着待ち）。口パクは右上の「口パク信号」で同期を確認する
- 声は kyu001v2 の関門合格済み wav だけ（sha1 が gate.json と一致しないと `build.py` が止まる）

## 流れ
```
npm install
npm run prep        # 既存ブランチから素材を public/a/ へ取り出し → 台本ロック・関門・口パク信号・演出の展開
npm run render      # out/proto01.mp4（口パク信号つき）
npx remotion render Proto01Clean out/proto01_clean.mp4   # 信号・試作ラベルなし
```
この環境では Chrome を落とせないので `--browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` を付ける。

## ファイル
| ファイル | 役割 |
|---|---|
| `episodes/proto01/direction.yaml` | 演出表（行IDで書く。台本の字面は書かない） |
| `episodes/proto01/script.lock.json` | 台本ロック（話者・字面・読み・声の sha1）。`build.py` が作る |
| `scripts/prep_assets.sh` | 素材の取り出し（表情集を番号名 `nagi_01`〜`08`・`baku_01`〜`08` に付け直す） |
| `scripts/build.py` | 台本ロック・関門チェック・口パク信号（音量＋台本の母音）・演出の展開 → `src/data/proto01.json` |
| `src/lib/Puppet.tsx` | キャラ。パーツが届いたら中身をリグの重ね描きに差し替える（外から渡す値は同じ） |
| `src/lib/Camera.tsx` | カメラ（two / nagi_up / baku_up / baku_punch …） |
| `src/lib/ui.tsx` | 字幕（台本の字面）・ホワイトボード・集中線・小道具・口パク信号 |

## 表情集の番号
| | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 |
|---|---|---|---|---|---|---|---|---|
| ナギ | 通常・無表情 | うなずき | 考え中 | 困り | ため息 | びっくり | どや | 寝落ち |
| バク | にっこり | ウインク | びっくり | ドヤ | テンションMAX | 怒り | あたふた | 号泣（負けの場面では使わない） |
