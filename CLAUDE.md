# ナギバク制作（Claude Code 向け）

- **共有記憶**：ナギバクの設定・好み・修正指示・決定は `memory/MEMORY.md`（正本は `memory/store.json`）。セッション開始時に SessionStart フックが自動で読み込み、Stop フックが会話から記憶の候補を自動で `memory/inbox/` に作る（`.claude/settings.json`）。使い方の決まりは `memory/AGENT_RULES.md` に従う。
- 作業ブランチ（feat/*）の CLAUDE.md・docs にある制作手順（台本・音声・Remotion など）も、そのブランチで作業するときは従う。
- main に直接コミットしない。課金・公開はしない。
