# パチンコ反応集 動画ジェネレーター

台本（JSON / テキスト）から、5ちゃん風レス＋うさぎ＆ねこの会話の反応集動画（1920x1080 / 30fps / H.264+AAC）を1コマンドで作ります。
デザインは `pachisure_ep2_v7.mp4` と同じです（元動画は使わず、上書きもしません）。

## 準備

```bash
pip install -r requirements.txt          # Pillow / numpy / scipy
# ffmpeg をインストール（PATH を通す）
cp .env.example .env                     # VOICEVOX の URL などを書く
python src/make_default_assets.py        # 既定の素材（キャラ・背景・BGM・SE）を assets/ に作成（既存ファイルは上書きしない）
```

音声を入れる場合は VOICEVOX を起動しておきます（既定: `http://127.0.0.1:50021`）。
起動していない場合は、文字数から尺を推定して**音声なし**で書き出します（`config.json` の `voice.fallback_when_unavailable` を `"error"` にすると停止します）。

## 使い方

```bash
# テキスト台本 → JSON（【その① …】【うさぎ＆ねこ】などを自動分類）
python src/parse_script.py scripts/source/episode_001.txt scripts/episode_001.json

# 動画を作る
python generate.py scripts/episode_001.json              # → output/episode_001.mp4
python generate.py scripts/episode_001.json --test 45    # 冒頭45秒だけのテスト版
python generate.py scripts/episode_001.json --no-voice   # 音声なし（推定尺）
python generate.py scripts/source/episode_002.txt        # テキスト台本を直接渡してもOK
```

処理の流れ: 台本読み込み → 音声生成（キャッシュ） → 音声尺取得 → 表示時間決定 → キャラ表示・字幕描画 → BGM・SE → ffmpeg合成 → ラウドネス調整（-15 LUFS） → mp4出力

## 新しい回を作るとき変えるもの

| 変えるもの | 場所 |
|---|---|
| 台本 | `scripts/source/episode_XXX.txt`（またはJSON） |
| タイトル | 台本の【タイトル】 |
| 背景 | `assets/backgrounds/hall.png` を差し替え（または `config.json` の `assets.background`） |
| キャラ画像 | `assets/characters/rabbit/*.png`, `cat/*.png`（normal / cry / shock / smug / angry / jito） |

## テキスト台本の書き方

```
【0:00 オープニング】      ← 冒頭フック（掲示板レス）
名無しさん
本文…

【タイトル】
最近のパチンコ、          ← 最後の行以外がタイトル
さすがにキツすぎる件
パチンコ民の反応集        ← 最後の行がサブタイトル

【その① とにかく回らない】  ← 章（「その①」と章名に自動分割）
名無しさん
本文（複数行OK。「名無しさん」の行が来るまでが1レス）

【うさぎ＆ねこ】            ← キャラ会話
うさぎ：
台詞
ねこ：
台詞

【最後のうさぎ＆ねこ】      ← 最後の会話（最後から2つ目の台詞でBGMを抜き、一拍おいて最後の台詞でオチ）

【エンディング】            ← 1段落目＝質問、「」の行＝選択肢、残り＝案内文
```

- 「草」「わかる」「正論やめろ」など短いレスは自動で強調（大きめ表示＋SE）。JSONで `"emphasis": true/false` を指定して上書きできます。
- キャラの表情は台詞から自動で選びます。JSONで `"face": "angry"` など指定すると上書き（normal / cry / shock / smug / angry / jito）。

## JSON の形

```json
{
  "title": "最近のパチンコ、さすがにキツすぎる件",
  "title_lines": ["最近のパチンコ、", "さすがにキツすぎる件"],
  "subtitle": "パチンコ民の反応集",
  "sections": [
    {"type": "hook", "items": [{"speaker": "名無しさん", "text": "…"}]},
    {"type": "title"},
    {"type": "reactions", "number": "その①", "name": "とにかく回らない",
     "items": [{"speaker": "名無しさん", "text": "…", "emphasis": false}]},
    {"type": "character", "items": [{"speaker": "うさぎ", "text": "…"}, {"speaker": "ねこ", "text": "…"}]},
    {"type": "character", "finale": true, "items": [
      {"speaker": "ねこ", "text": "でも明日行く。", "bgm_cut": true},
      {"speaker": "うさぎ", "text": "なんでだよ。", "pause_before": 1.0, "ochi": true}]},
    {"type": "ending", "question": "…", "choices": ["回らない"], "lines": ["コメント欄で教えてください。"]}
  ]
}
```

## 設定（config.json）

- `voice.speakers` … 話者ID（VOICEVOXのstyle id）と読み上げ速度。既定: 掲示板 1.15倍 / うさぎ 1.05倍 / ねこ 1.10倍
- `timing` … 表示時間のルール。基本は「実際の音声の長さ＋余白」。短い 1.2〜2秒 / 普通 2〜4秒 / 長い 4〜6秒の範囲に収める（音声より短くはしない）
- `audio` … 声 100% / BGM 12% / SE 28%、最終 -15 LUFS（True Peak -1.5dB）
- `se` … SEごとのON/OFF（レス表示SEは既定OFF＝うるさくしない）
- `layout` … レス文字サイズ（既定54px、強調84px）、`disclaimer`（画面左下の注意書き。空文字で非表示）など

## キャッシュ

VOICEVOXの音声は `audio/generated/<ハッシュ>.wav` に保存し、同じ（話者・速度・本文）なら再利用します。
話者や速度を変えると自動で作り直されます。

## フォルダ

```
assets/      backgrounds/ characters/{rabbit,cat}/ bgm/ se/ fonts/
scripts/     episode_XXX.json, source/（テキスト台本）
audio/generated/   音声キャッシュ
temp/        途中生成物（映像のみ・ミックス・タイムライン）
output/      完成動画
src/         parse_script.py generate_audio.py timeline.py render_text.py generate_video.py compose.py make_default_assets.py
generate.py  入口
```

## エラーが出たら

`[エラー]` の後に原因と対処が表示されます（台本の書式、素材やフォントの不足、VOICEVOX未接続、ffmpeg未インストールなど）。
