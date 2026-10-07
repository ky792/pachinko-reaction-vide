# パチンコ反応集 動画づくり（GitHub Actions）

## 新しい回を作る（映像＋読み上げをまとめて）

1. `episodes/<回>/` を作り、台本を `script.txt` として置く（【冒頭フック】【タイトル】【その① …】【IMAGE】【うさぎ＆ねこ】【最後のうさぎ＆ねこ】【エンディング】の形式）
2. 読み方の演出 `directions.json` を置く（無ければ自動の読み方）
3. **Actions → Make episode (video + voice) → Run workflow**
   - `episode`: 回のフォルダ名（例 `ep002`） / `mode`: test（冒頭90秒）か full
4. 完成動画は Artifact と `outputs` ブランチに保存されます

### 実機画像（任意）
`generator/assets/machines/` に、台本の【IMAGE】で指定した名前（例 `unicorn.jpg`）で画像を置くと、右下にズーム付きで表示されます。
画像が無い場合はエラーにならず、機種名のラベルだけ出して続行します。機種名は `generator/assets/machines/machines.json` で変更できます。
画像は自分で撮影したもの・利用条件を確認したものを使ってください。

画像の表示タイミングは台本から自動計算され、`image_cues.json`（Artifact / outputs ブランチ）に書き出されます。
手で直したい場合は `episodes/<回>/image_cues.manual.json` として置くと、そちらが使われます。

---

# 完成動画に読み上げ音声を付ける（GitHub Actions）

完成済みの `1000010320.mp4` に、台本どおりのタイミングで日本語の読み上げ（edge-tts・無料）を重ねます。
映像はそのまま（再エンコードなし）、元のBGM・SEも残します。処理はすべて GitHub Actions 上で動くので、スマホでは何も実行しません。

## 1. 動画をリポジトリに入れる（どれか1つ）

- **A. `input/1000010320.mp4` としてアップロード**（25MBまで。ブラウザの「Add file → Upload files」）
- **B. 25MBを超える場合は Releases に添付**：「Releases → Create a new release」でタグ（例 `v1`）を作り、`1000010320.mp4` を添付して公開。ワークフローが自動で取りに行きます
- **C. ダウンロードURLがある場合**：実行時の `video_url` に貼る

## 2. 実行する

GitHubアプリ／ブラウザで **Actions → Add voice (edge-tts) → Run workflow**

- `mode: test`（既定）… 冒頭60秒だけ → `output/1000010320_voice_test60s.mp4`
- `mode: full` … 全編 → `output/1000010320_voice.mp4`

終わったら、その実行ページ下の **Artifacts**（`voice-test` / `voice-full`）からダウンロードします（zipの中にmp4）。
`save_to_repo`（既定ON）の場合、完成動画は `outputs` ブランチにも保存されます（毎回上書き。最新の1本だけ残ります）。

## 読み方（style）

- **directed**（既定）… 人が演出を付けた台本どおりに読む（`scripts/directions/directed_90s.json`）。
  名無しさんは3人の担当（通常＝落ち着いた男性 / ツッコミ＝テンポのいい男性 / リアクション＝女性）。
  レスを A（主役）/ B（通常）/ C（合いの手）に分け、1レスの中でも文ごとに速さ・高さ・音量を変え、レスの間に本当の無音を入れる。
  無音は削らず、収まらない時は少し速める→それでも無理なCレスは読み上げを省略（画面には残る）。
  全編の演出は `scripts/directions/directed_full.json`（冒頭90秒のテスト用は directed_90s.json）。ディレクションが無い行は dynamic で自動。テスト出力は `output/voice_directed_test.mp4`。
  「319」は「さんいちきゅう」と読む（config の `tts.replace`）。


- **dynamic**（既定）… 緩急あり。名無しさんは4種類の声（A 男性標準 / B 男性やや低め / C 女性標準 / D 男性やや軽め）を、同じ声が3連続しないように使い分けます。
  レスを normal / agreement / surprise / anger / despair / joke / punchline に自動分類し、速さ・高さ・音量・前後の間を変えます。
  演出の強さは「普通 約60% / 少し変化 約25% / 強い 約15%」に抑え、「草」「無理」「正論やめろ」など短いレスは必ず強めに読みます。
  文・行ごとにクリップを分けて間を入れ、最後の短い一言（オチ）の前は少し長めに空けます。設定は config.json の `style`、分類ルールは `src/voice_style.py`。
  実行後の `work/voice_plan.json`（Artifactにも同梱）で、各レスの分類・声・読み上げ位置を確認できます。
  ※ edge-tts の日本語の声は男性(Keita)・女性(Nanami)の2種のため、4種類は高さ・速さで作り分けています。
- **flat** … 以前の一定の読み方

テスト（冒頭90秒）の出力は `output/voice_dynamic_test.mp4`、フルは `output/1000010320_voice_dynamic.mp4`。

## 3. 調整（config.json）

- `tts.voices` … 声の種類・速さ・高さ。掲示板レス=Keita(+15%)、うさぎ=Nanami(+5%)、ねこ=Keita(高め)、ナレーション=Nanami
- `tts.read_kinds` … 読み上げる対象（res=レス, talk=うさぎ＆ねこ, title, ending, subscribe。章タイトルは表示1.3秒と短いため既定で読まない。読ませたい場合は `chapter` を追加）
- `tts.replace` … 読み間違いの修正（例: "LT": "エルティー"）
- `mix.original_volume` … 元のBGM・SEの音量（既定0.32）。`duck_original_under_voice` … 声が出ている間はさらに下げる割合
- `timing.max_speedup` … 声が表示時間に収まらない時に速める上限（既定1.5倍）

音声は `cache/tts` にキャッシュされ、次回の実行では同じセリフを作り直しません。

## 注意

- edge-tts は Microsoft Edge の読み上げ機能を使う無料のツールです（公式の有料APIではありません）。仕様変更で動かなくなることがあります
- `scripts/timeline.json` は、この動画を作ったときの表示タイミングです。別の動画に使う場合はその動画のタイムラインに差し替えてください

---

# テロップ型の反応集（下部中央テロップ・右上トピック）

`episodes/<回>/reaction.json` に台本を置き、**Actions → Make reaction video (telop format) → Run workflow**（`episode` に回の名前）。
完成動画は Artifact と `outputs-<回>` ブランチに保存されます。

- 背景画像（任意）：`episodes/<回>/images/` に reaction.json の `bg.image` と同じ名前で置く。無い時はホール背景＋機種名パネル
- 色：`white`（通常）/ `red`・`yellow`（強調・フック）/ `blue`（ツッコミ・オチ）、サイズ：`normal` 80px / `hook` 100px / `ochi` 130px
- SE：`pon` `piko` `shock` `taiko` `don` `none`（その場で合成）
- 大オチの行に `"bgm_cut": true` で直前にBGMを切って一拍溜める
- 音量比 声100 : SE75 : BGM18、コメント間の間は0.04秒

## 固定キャラ（ナギ・バク）
- 基準デザイン：`generator/assets/characters/reference_nagi_baku.png`
- 表情素材：`characters/nagi/`（normal / explain / think / surprise / point）、`characters/baku/`（normal / max / tsukkomi / mutto / cheer）。基準画像から `reaction/cut_characters.py` で切り出し
- reaction.json の `who` に `nagi`（解説・整理）/ `baku`（驚き・ツッコミ）。`face` を省くとセリフの中身から自動で表情を選ぶ
