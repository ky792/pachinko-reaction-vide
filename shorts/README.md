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


# ナギの45秒解析（現行シリーズ）
- 作り方：台本 `episodes/<声の回>/script/*.txt` → 声（AivisSpeech／Irodori）→ voice-check（関門）→ `shorts/episodes/<id>/episode.json`（顔・カメラ・モニター・fx）→ `python shorts/scripts/build45.py <id>`（声を45秒に収めてタイムラインを作る）→ `src/episodes.ts` に1行 → `shorts/render.json` を push
- 演出（fx）：bigcap（巨大字幕）／shake（振動）／speed（スピード線）／boom（爆発）／stamp（画面いっぱいの判子）／deform（squash・stretch・deflate・tilt・wobble の一時変形）／sparkle（ドヤ顔のキラキラ）／flash。顔面ズームは行の cam（focus と zoom）
- 最後：暗転 → ナギバク研究所（チャンネルアイコン `public/series/channel_icon.png`）＋チャンネル登録

## 45秒解析の時計UI（固定・変更禁止）
- 採用デザイン：`shorts/assets_src/analysis_clock_design.png`（2026-11-25）。レトロな機械式懐中時計×近未来の研究所UI
- 素材：`public/series/nagi45/clock/`（`python shorts/scripts/make_clock_assets.py` で採用デザインから切り出す）
  - card.png（背景つき全体・描かれた秒針／数字／ゲージ／発光を消した土台）・body.png（時計本体の切り抜き）・glow.png（シアンの発光）・gauge.png（外周ゲージの点灯）・gear_a〜d.png＋gearwin.png（回す歯車と見える窓）・geometry.json（中心・半径・歯車）
  - 音：boot.wav（起動）・tick.wav（秒針）・gears_loop.wav（歯車の駆動）・stop.wav（停止）
- 使い方：`<AnalysisClock start={解析開始フレーム} seconds={45} title="題" />` と `<ClockSounds start seconds />`（Nagi45.tsx が呼ぶ。台本・解説とは独立）
- 動き：解析開始で中央に大きく（背景つき）起動 → 発光が点灯 → 歯車が回り出す → 左上へ縮小、右に REMAINING のデジタル表示。
  秒針は1秒ごとにカチッ（60秒で一周、残り45秒＝9時 → 反時計回り → 0秒＝12時）。デジタル表示・外周ゲージも同じ残り秒から作るので完全に同期。
  残り5秒で発光とゲージが赤（振動・過剰な点滅なし）。0秒で秒針が12時、歯車停止、停止音、「解析完了」の帯
- 画像を作り直すとき：パーツ別の素材（背景・本体・文字盤・秒針なし・歯車ごと・発光パーツ）を同じ構図・同じ大きさの透過PNGでもらえれば、切り出しより精度が上がる
