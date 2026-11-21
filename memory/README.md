# ナギバク共有記憶（nbmem）

ナギバク制作の「キャラ設定・制作方針・修正指示・決定事項」を、AI ごとにばらばらに覚えさせず、GitHub 上の1か所にまとめる仕組み。

- **正本は1つだけ**：`memory/store.json`（main ブランチのもの）。
- **AI が読むもの**：`memory/MEMORY.md`（store.json から自動で作る読みやすい版）。
- **確定のしかた**：追加・変更は必ずブランチ＋プルリクエスト。**マージ＝確定**。main に直接書かない。
- **矛盾**：確定済みの記憶と食い違う提案は上書きせず、`memory/CONFLICTS.md` に載せる。人が `resolve` で決める。
- **残さないもの**：一時的な指示（「今回だけ」「とりあえず」）、雑談、質問、個人情報・認証情報（お金・健康・勤め先・連絡先・トークン等は機械的にはじく）。

## 記録される中身（1件ごと）

| 項目 | 内容 |
| --- | --- |
| key | 話題のキー（例 `baku.first_person`）。同じ話題の矛盾を見つけるのに使う |
| category | character（キャラ設定）/ style（演出・見た目）/ production（制作方針）/ correction（修正指示）/ decision（決定事項） |
| value | 記憶の中身 |
| source | 出典（どこで・いつ・元の発言） |
| created / updated | 作った日時・変えた日時 |
| history | 変更履歴（created / restated / updated と、前の値） |

## AI ごとの使い方

| 使う場所 | 読み込み | 追加 |
| --- | --- | --- |
| Claude Code | **自動**：セッション開始時に SessionStart フックが MEMORY.md を読み込む（`.claude/settings.json`） | **自動**：Stop フックが会話のユーザー発言から候補を抜き出し `memory/inbox/` に置く → 区切りで `python scripts/memory/nbmem.py submit` を実行すると PR になる |
| Codex | AGENTS.md の指示で、作業前に MEMORY.md を読む（フックがないため） | 作業の最後に `nbmem.py propose …` / `extract` → `submit`（AGENTS.md に手順） |
| Claude（claude.ai）・ChatGPT | `memory/WEB_AI.md` の文を貼る（リポジトリが読める連携があれば URL を読ませる。なければ MEMORY.md の中身を貼る） | 「この内容を共有記憶に追加して」→ AI が ```nbmem ブロックを出す → **GitHub の Issue に貼って `memory` ラベル**（スマホの GitHub アプリで可）→ Actions が照合して PR を作る |
| GitHub Actions など一時的な環境 | `nbmem.py context` | `memory-inbox/<名前>` ブランチに `memory/inbox/*.json` を push → Actions が PR を作る（環境が消えても残る） |

## コマンド

```
python scripts/memory/nbmem.py context                     # 記憶を表示
python scripts/memory/nbmem.py extract 会話.txt --surface chatgpt   # 会話から候補を抜き出す（inbox へ）
python scripts/memory/nbmem.py propose --category character --key baku.first_person --value "バクの一人称は「ウチ」" --quote "元の発言"
python scripts/memory/nbmem.py ingest                      # inbox を正本に照合（重複は統合・矛盾は CONFLICTS へ）
python scripts/memory/nbmem.py resolve KEY --accept-new    # 矛盾を新しい方に（--keep-old で今のまま）
python scripts/memory/nbmem.py submit                      # main から切ったブランチに反映して PR を出す
python scripts/memory/nbmem.py check                       # 正本の点検（個人情報・形・MEMORY.md が最新か）
python -m unittest scripts/memory/test_nbmem.py -v         # 自動テスト
```

## できること・できないこと

- **できる（外部連携なし）**：Claude Code での自動読み込み・自動抽出、Codex での読み込みと手動抽出、GitHub Issue 経由での追加（ChatGPT・Claude Web の会話からでも、ブロックを貼れば反映）、PR での確認、Actions 上での永続化。
- **追加の連携が必要**：ChatGPT・Claude Web が **自分で** 記憶を読む（GitHub 連携・コネクタ、または公開URL）。ChatGPT・Claude Web の会話履歴を **自動で** 取り込むことはできない（会話の中身を Issue に貼る・ブロックを貼る、のどちらかが必要）。
- 抜き出しは規則ベースなので、言い回しによっては拾い漏れ・拾いすぎがある。拾いすぎは PR で落とせる。AI が会話の意味を判断して ```nbmem ブロックや `propose` で渡すのが一番正確。
