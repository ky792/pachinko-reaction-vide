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
| 背景 | #101827（上からごく弱い光＋80px方眼） |
| 情報パネル | #19273B、区切り線 #2A3B55 |
| ナギ | #64BFFF（字幕の左線・名札・解析UI） |
| バク | #F28C38（字幕の右線・名札・ツッコミ） |
| 文字 | #F6F8FC、補足 #9AA8BC、重要数字 #F4C95D |
| 書体 | Noto Sans CJK JP（Black＝見出し・数字、Bold＝字幕、Medium/Regular＝補足） |
| 字幕 | 1行 58px／2行 52px、最大2行、話者側に色線と名札 |
| 強調数字 | 92〜118px |
| 動き | 0.2〜0.6秒、ease-out（出る）／ease-in-out（引っ込む）。揺れ・パーティクル・常時発光は使わない |

字幕の `{…}` で囲んだ部分だけ重要数字色になる。

## 2. 部品（lab/ui.py）

| type | 部品 | 中身 |
| --- | --- | --- |
| `chapter` | F チャプター | CHAPTER番号→年→タイトル→章の問い を順に出して消える |
| （常設） | 上部バー | 左に章番号と章タイトル、右に2008–2026の年表と今の年 |
| `machine` | A 機種紹介カード | 左に実機（`images/` に無ければ「差し替え」仮パネル）、右にスペック行が順に出る。`count` で数字カウントアップ、`key` で強調 |
| `timeline` | B 歴史タイムライン | 範囲（小数の年）と出来事を渡すと、軸→出来事が順に立ち上がる。章全体にも数か月の拡大にも使える |
| `analysis` | D ナギ解析 | 脳タンクが淡く光る→線が伸びる→パネルが開く→比較バー→注記→収納 |
| `tsukkomi` | E バクのツッコミ | 頭の横に橙の線3本（0.45秒）。`emphasis` でバクを一時拡大 |
| （subs） | 字幕 | `who` = nagi / baku、`accent: true` で橙の下線 |

C（スペック比較）は `analysis` の `bars` で2〜3項目まで並べられる。指標の定義が違うときは `note` に必ず書く。

キャラ配置は `layout` で切り替える：`normal`（通常）／`machine`（機種紹介中は縮小）／`hidden`（チャプター中）。

## 3. 24分の本編に広げる手順

1. 台本のシーンIDごとに、`subs`（セリフ）と `cues`（その間に出す部品）を書く。1章＝1つの scene.json にすると扱いやすい。
2. 章の頭に `chapter`、機種の初登場に `machine`、規制や年代の話に `timeline`、見せ場（各章1回まで）に `analysis` を置く。
3. 実機画像は許諾を確認してから `episodes/<回>/images/` に置き、`image` に名前を書く。無ければ仮パネルのまま出る。
4. 確認用の静止画で文字のはみ出しを見てから、全体を書き出す。

## 4. まだ無いもの

- 読み上げ音声：今は字幕の時間を手で指定している。反応集と同じ AivisSpeech（ナギ＝るな／バク＝らせつん）の音声を作り、その長さから字幕の時間を自動で決める処理を足す予定。
- GitHub Actions：`make-reaction.yml` と同じ形で `lab/render.py` を回すワークフローを足す予定。
- キャラの表情差分：今は各1枚（`generator/assets/characters/v2/`）。
