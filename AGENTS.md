# ナギバク制作（Codex など、AGENTS.md を読むエージェント向け）

- **共有記憶**：作業を始める前に `memory/MEMORY.md` を読む（正本は `memory/store.json`。Claude Code と同じファイル）。使い方の決まりは `memory/AGENT_RULES.md` に従う。
- Codex にはセッション開始・終了のフックがないため、代わりに：
  - 始め：`python scripts/memory/nbmem.py context` の出力を読む。
  - 終わり：その作業中にユーザーが伝えた、今後も使う設定・好み・修正指示・決定を `python scripts/memory/nbmem.py propose …` で候補にし、`python scripts/memory/nbmem.py submit` で PR にする（会話の書き出しがあれば `nbmem.py extract <ファイル> --surface codex` でもよい）。
- main に直接コミットしない。課金・公開はしない。
