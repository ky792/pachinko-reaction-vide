# ナギバクのパチンコ研究所 UI（lab/）

歴史解説シリーズ用の画面部品と書き出し。反応集（reaction/）とは別系統で、互いに影響しない。

```
python lab/render.py episodes/lab_demo/scene.json -o output/lab_demo.mp4
python lab/render.py episodes/lab_demo/scene.json -o output/check.png --stills 5.5,10.5,19   # 確認用の静止画
```

## 1. デザインシステム

| 項目 | 値 |
| --- | --- |
| 画面 | 1920×1080 / 30fps、端の余白 60px、角丸 12px |
| 背景 | ラボ背景画像を暗く・ぼかして使用（無ければ #101827＋80px方眼） |
| 情報パネル | #19273B、区切り線 #2A3B55 |
| ナギ | #64BFFF（字幕の左線・名札・解析UI） |
| バク | #F28C38（字幕の右線・名札・ツッコミ） |
| 文字 | #F6F8FC、補足 #9AA8BC、重要数字 #F4C95D |
| 書体 | Noto Sans CJK JP（Black＝見出し・数字、Bold＝字幕、Medium/Regular＝補足） |
| 字幕 | 1行 58px／2行 52px、最大2行、話者側に色線と名札 |
| 強調数字 | 比較画面 166px、章タイトル 140px、スペック行 60px |
| 動き | 0.2〜0.6秒、ease-out（出る）／ease-in-out（引っ込む）。揺れ・パーティクル・常時発光は使わない |

字幕の `{…}` で囲んだ部分だけ重要数字色になる。

### 見やすさのルール（スマホ基準）

- 注釈は1〜2行、1行15〜22字まで。長い説明はセリフに回す。
- 比較画面は数字が主役（約166px）。説明文は数字より必ず小さく。
- 比較画面には「北斗無双と65%内規」のような短い見出しを必ず付ける。
- 年表は今の年だけ黄色で強調、過去は薄いグレー、未来は暗く。
- 研究ラボ感は小さな英字ラベル（NAGI ANALYSIS / DATA LOG / LAB RECORD）、細い罫線、パネル四隅のL字だけで出す。
- ナギの脳タンクの光は解析の頭に一瞬だけ。バクのツッコミは字幕の橙ラインと軽い拡大（1.08倍）だけ。
- 背景は `generator/assets/backgrounds/lab_room.png` を暗く・ぼかして使う。

## 2. 部品（lab/ui.py）

| type | 部品 | 中身 |
| --- | --- | --- |
| `chapter` | F チャプター | 年とタイトルを大きくほぼ同時に出し、CHAPTER番号は小さく添える（約2.4秒） |
| （常設） | 上部バー | 左に章タイトル（CHAPTER番号は小さく）、右に2008–2026の年表（今の年だけ強調） |
| `machine` | A 機種紹介カード | 左に実機（`images/` に無ければ「差し替え」仮パネル）、右にスペック行が順に出る。`count` で数字カウントアップ、`key` で強調 |
| `timeline` | B 歴史タイムライン | 範囲（小数の年）と出来事を渡すと、軸→出来事が順に立ち上がる。章全体にも数か月の拡大にも使える |
| `analysis` | D ナギ解析 | 脳タンクが一瞬光る→解析ライン→パネル展開→数字2つを大きく比較→短い注記→収納 |
| `tsukkomi` | E バクのツッコミ | 字幕の橙ラインと1.08倍の軽い拡大だけ（`emphasis`） |
| `keyword` | G キーワード | 章の要点を1語で大きく |
| `flow` | H フロー | 仕組みを手順として左から右へ |
| `lineup` | I ラインナップ | 機種カードを並べる（OPは早送り、EDは振り返り） |
| `title` | J タイトル | 動画タイトルの全画面表示 |
| （subs） | 字幕 | `who` = nagi / baku、`accent: true` で橙の下線 |

C（スペック比較）は `analysis` の `bars` で2項目を左右に並べる（`heading` に短い見出し、`prefix` に「約」など）。指標の定義が違うときは `note` に短く書く。

キャラ配置は `layout` で切り替える：`normal`（通常）／`machine`（機種紹介中は縮小）／`hidden`（チャプター中）。

## 3. 本編（episodes/ken_full）の作り方

本編は「台本」「資料データ」「素材」を分けて持ち、`lab/episode.py` が組み立てる。V2デモ（`episodes/lab_demo/scene.json`）はそのまま残してある。

```
python lab/episode.py episodes/ken_full                # 全章を書き出して結合（build/ken_full.mp4）
python lab/episode.py episodes/ken_full --only 04       # 第4章だけ
python lab/episode.py episodes/ken_full --stills        # 各資料の静止画だけ（レイアウト確認）
python lab/episode.py episodes/ken_full --manifest      # MANIFEST.md（セリフIDと必要画像の一覧）を更新
```

| 置き場所 | 中身 | 差し替え方 |
| --- | --- | --- |
| `script/00_op.txt`〜`08_ed.txt` | 台本。1行＝1セリフ（`ナギ:` / `バク:` / ツッコミは `バク!:`） | テキストを直すだけ |
| `data.json` | 機種カード・比較・年表・フロー・キーワード・並び・読み | 数字や文言を直す |
| `images/` | 実機画像（ファイル名は data.json の `image`） | 置けば仮パネルから自動で差し替わる |
| `voices/<セリフID>.wav` | 読み上げ音声（IDは MANIFEST.md） | 置けばその長さで全タイミングが決まり直す |

台本の命令：`@chapter ch2`（章タイトル）／`@title`（動画タイトル）／`@show machine:hokuto`（中央の資料を切り替え。種類は machine・analysis・timeline・flow・keyword・lineup）／`@clear`（資料を消す）／`@year 2016.2`（上部年表の現在地）／`@pause 0.5`（間）。

- 字幕は自動で作る：「。」で分け、30字を超えると「、」で分け、1行21字以内の2行に折る。数字＋単位（約80%、3000個、1/319.7 など）は自動で黄色。
- 音声が無い間は、ナギ5.0字／秒・バク5.3字／秒で長さを推定する。
- BGMは結合後に全体へ通しでかける（`generator/assets/bgm/main.wav`、音量0.10）。

## 4. まだ無いもの

- 読み上げ音声：AivisSpeech（ナギ＝るな／バク＝らせつん）で `voices/` を作る処理。置き場所と仕組みはできている。
- GitHub Actions：`lab/episode.py` を回すワークフロー。
- キャラの表情差分：今は各1枚（`generator/assets/characters/v2/`）。
