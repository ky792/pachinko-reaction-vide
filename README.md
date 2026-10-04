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
