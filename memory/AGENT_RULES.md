# 共有記憶の使い方（Claude Code・Codex 共通。CLAUDE.md と AGENTS.md はこのファイルを参照する）

1. **作業の前に読む**：`memory/MEMORY.md`（ないブランチでは `git fetch origin main && git show origin/main:memory/MEMORY.md`）。ここにある設定・方針・過去の指摘・決定に従う。ここと矛盾する指示が来たら、勝手にどちらかにせず確認する。
2. **ユーザーの発言で、今後も使う情報が出たら候補にする**（ユーザーに「覚えて」と言わせない）：
   - 残す：キャラ設定、演出・見た目の好み、制作方針、修正指示（「〜じゃなくて〜」「〜はNG」）、採用した決定。
   - 残さない：「今回だけ」「とりあえず」「試しに」などの一時的な指示、雑談、質問、個人情報・認証情報（お金・健康・勤め先・連絡先・トークン等）。
   - 候補の作り方：`python scripts/memory/nbmem.py propose --category <character|style|production|correction|decision> --key <話題キー> --value "<一文>" --quote "<ユーザーの元の発言>"`
     （Claude Code では Stop フックが会話から自動で候補を作るので、漏れたものだけ足せばよい）
3. **作業の区切りで PR にする**：`python scripts/memory/nbmem.py submit`（main から切ったブランチに反映し、既存の記憶と照合して PR を出す。重複は統合、矛盾は上書きせず memory/CONFLICTS.md へ）。**main に直接書かない。マージはユーザーがする。**
4. 「共有記憶に追加して」と言われたら、2 の基準で抜き出して propose → submit。既存と同じなら何もしない、矛盾するなら PR で食い違いを示す。
5. 確定済みの記憶を変えるのは、ユーザーが変更をはっきり言ったときだけ（`propose ... --replace`、または `resolve KEY --accept-new`）。
