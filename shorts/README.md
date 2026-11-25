# 30秒ナギバク研究所（YouTube Shorts 専用）

縦型 1080×1920・30fps。横型の `remotion/`・`lab/` とはフォルダもワークフローも分けている（横型には触らない）。

## 画面（全回共通）
- 上：シリーズ名＋今回のテーマ（0フレーム目から表示＝フック）
- 中央：研究所の分析モニター（中身は `monitor.type` で差し替え）
- モニターの下：字幕（話している人の名前つき・数字は色付き）
- 下：ナギ（左）とバク（右）のバストアップ。右の縦ボタン列・下の説明欄に重要な情報が掛からない位置
- 最後：チャンネル登録の誘導（画面演出のみ・声は足さない）

## 1本の作り方
1. 台本：`episodes/<声の回>/script/<名前>.txt`（`バク: …` `ナギ: …`、読みは《表記|よみ》）
2. 声：AivisSpeech（ナギ）／Irodori（バク）で作る → `scripts/voice_ab/finalize_lines.py` → voice-check（`trim: true`）→ 関門合格
3. 取り込み：`python shorts/scripts/sync_voices.py episodes/<声の回> shorts/public/<id>/voice --tempo 1.1`
4. 演出：`shorts/episodes/<id>/episode.json`（行ごとに face・monitor・tap・pop・shake・se、オチ前の pre、テーマ、BGM）
5. タイムライン：`python shorts/scripts/build.py <id>`（声の長さから全タイミングを決める。検査していない声があると止まる）
   声ができる前の画面確認は `--estimate`
6. `src/episodes.ts` に1行足す → `shorts/render.json` を書き換えて push（`full: true` で完成版を release `shorts-<id>` に）

## モニターの種類（src/Monitor.tsx）
| type | 中身 | 主な項目 |
| --- | --- | --- |
| hook | 大きい数字＋リング | value, label |
| scan | 解析中（タブレット操作の受け） | label, text |
| icons | アイコンを並べる（RUSH×10 など） | count, label |
| formula | 式を1行ずつ＋割合の帯＋大きい数字 | rows, big, big_at_end |
| steps | 段々に減る棒グラフ＋式＋大きい数字 | p, n, label, note, formula, big |
| glitch | 表示が揺らぐ（ぼやき・ツッコミ） | value |
| clean | 何も足さない数字（オチ） | value, label |

表情は `public/chars/<nagi|baku>_<表情>.png`（休憩室と同じ素材）。ナギは目を開けない。
