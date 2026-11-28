# 素材制作リスト（P 深淵機関 ABYSS REACTOR）

- 置き場所とファイル名は `machines/abyss-reactor/assets.js`（画像・動画）と `machines/abyss-reactor/sound.js`（音声）に定義済み。**同名ファイルを置けば、コードを変えずに差し替わる。** 未配置なら仮素材で動作する。
- 表示位置・サイズは manifest の `x, y, w, h, anchor` で調整できる。筐体系の座標は 900×1560、液晶系は 960×540。
- 全素材は `docs/ART_DIRECTION.md` の共通方針と共通プロンプトに従う。
- 優先度：**S** = これが無いと実機に見えない／**A** = 演出の迫力に直結／**B** = あると良い
- 開発者モードの「素材の表示確認」で、外部素材／仮素材のどちらが使われているかを確認できる。

---

## 1. 筐体（assets/cabinet）

| 素材 | ファイル | 用途・位置 | 解像度 | 形式 | 透過 | アニメ | 優先 |
|---|---|---|---|---|---|---|---|
| 筐体フレーム | cabinet_frame.png | 筐体全体。盤面窓（x46,y150,808×900、角R34）は透過 | 1800×3120（2倍） | PNG | 要 | 無 | S |
| トップユニット | cabinet_top.png | 上部ロゴ部 0,0 / 900×156 | 1800×312 | PNG | 要 | 無 | A |
| 下部パネル | cabinet_lower.png | 上皿・スピーカー部 0,1050 / 900×510 | 1800×1020 | PNG | 要 | 無 | A |
| ハンドル | handle.png | 中心 790,1420（回転させて使う） | 300×300 | PNG | 要 | 無（コードで回転） | A |
| ボタン（通常／発光） | push_button.png / push_button_lit.png | 中心 450,1210 | 380×380 | PNG | 要 | 無 | S |

**画像生成プロンプト（筐体フレーム）**
`front orthographic view of an original pachinko cabinet frame, industrial reactor containment vessel design, top unit shaped like a reactor cap with cooling fins and an empty engraved logo plate, side pillars with glass light-guide tubes and bolted brackets, heavy gunmetal and brushed steel, chrome bezel around a large rounded rectangular window, lower section with ball tray, round speaker grille, octagonal emergency ignition switch housing in the center, handle mount at lower right, symmetric, transparent window area, 2:3.47 aspect` ＋共通プロンプト
※ LED の発光はコードで重ねるため、**消灯状態**で描くこと。

**ボタン**：`top view of a large domed push button, clear red resin dome over a mechanical reactor symbol with three blades, chrome ring, octagonal bolted housing, studio lighting from upper left`（発光版は内部から強く赤く光らせる）

## 2. 盤面（assets/playfield）

| 素材 | ファイル | 位置 | 解像度 | 形式 | 透過 | 優先 |
|---|---|---|---|---|---|---|
| 盤面セル画 | board_art.png | 46,150 / 808×900（中心450,600、半径392の円内が遊技領域） | 1616×1800 | PNG | 不要 | S |
| センター役物枠 | center_frame.png | 140,214 / 620×510。液晶開口（190,318 / 520×292、角R10）は透過 | 1240×1020 | PNG | 要 | S |
| ステージ | stage.png | 200,590 / 500×120 透明樹脂 | 1000×240 | PNG | 要 | A |
| ヘソ／アタッカー／電チュー | heso.png / attacker.png / denchu.png | manifest 参照 | 2倍 | PNG | 要 | A |
| ガラス反射 | glass_reflection.png | 盤面と同サイズ、スクリーン合成 | 1616×1800 | PNG | 要（黒＝透明扱い） | B |

**盤面セル画**：`printed artwork for a pachinko playfield board, dark navy-black base, faint engineering blueprint grid, concentric reactor schematics, two cyan energy conduits rising from the bottom along both sides, subtle hexagonal panels at the bottom, small warning chevrons on the right route, very low contrast so steel balls stay visible, no characters` ＋共通
※ 釘・レールはコードで描画する。セル画には描かないこと（位置が合わなくなるため）。

**センター枠**：`ornate central LCD frame for a pachinko machine, heavy cast gunmetal arch with machined chrome trim, reactor core housing with cooling fins on top center, piston modules on left and right, engraved plate at the bottom, inlaid cyan light-guide lines (unlit), transparent rectangular LCD opening, transparent warp passage of clear resin on the left side`

## 3. 役物：深淵コア（assets/mechanism）

| 素材 | ファイル | 解像度 | 備考 | 優先 |
|---|---|---|---|---|
| 外輪 | core_ring.png | 600×600 | 中心基準、12本のボルト、導光スリット | S |
| 可動プレート | core_plate.png | 180×260 | 1枚分。コードで8枚を回転・展開させる。上端が外側 | S |
| 中心球 | core_orb.png | 300×300 | 白飛びしたコア、内部に渦 | A |

`isolated mechanical iris gimmick part, [outer cast ring with 12 hex bolts and four light slits | single tapered armor plate with a glowing slit | glowing energy orb with swirling plasma], gunmetal and chrome, transparent background, front view`
**Blender 推奨**：外輪とプレートはモデリングして正面からレンダリングすれば質感が最も安定する（Cycles、HDRI はスタジオ、キーライトは左上）。

## 4. 図柄（assets/symbols）— 優先 S

`symbol_1.png` 〜 `symbol_9.png`、各 512×512（表示は 220px 基準）、PNG 透過、中心揃え。
- 共通：八角形の機関モジュールプレートの上に、押し出したクローム数字。数字の中心に発光ラインを入れる。数字ごとのエネルギー色：1 シアン／2 ミント／3 ブルー／4 バイオレット／5 グリーン／6 オレンジ／8 マゼンタ／9 アイスホワイト
- **7 は専用デザイン**：金の数字、赤熱したコア、金の放射フィン。他より一回り大きく見せる
- 高速変動用のブラー版はコードで自動生成する

`single numeral "N" as a premium pachinko reel symbol, extruded chrome digit with beveled industrial stencil shape and an inner glowing [color] light line, mounted on an octagonal gunmetal reactor module plate with rivets and an inner glowing ring, transparent background, centered, front view, crisp`

## 5. 保留（assets/hold）— 優先 S

`hold_normal / blue / green / red / gold / rainbow .png`、256×256、PNG 透過。
エネルギーカプセルをモチーフにし、**色だけでなく形も段階的に変える**：
normal＝小型、白く薄い光／blue＝青い液体／green＝内部にコイル／red＝稲妻と側面フィン、ガラスにひび／gold＝金キャップ、軌道リング、泡／rainbow＝カプセルではなく虹色の多面体結晶

`small energy capsule, vertical glass tube with machined metal caps, glowing [color] liquid energy inside, [variant details], transparent background, product render`

## 6. 液晶背景（assets/backgrounds）— ループ動画

960×540 以上（1920×1080 推奨）、WebM（VP9）または MP4、無音、**8〜12 秒のシームレスループ**、優先 A

| ファイル | 内容 | 動画生成プロンプト |
|---|---|---|
| bg_lab.webm | 研究施設ステージ（落ち着いた通常時） | `slow dolly forward through a dim futuristic research corridor, ceiling light panels, wall monitors with data, cold cyan mist, calm, seamless loop` |
| bg_core.webm | 深淵機関内部 | `inside a colossal reactor, concentric rotating rings around a distant glowing cyan core, drifting particles, slow camera push, seamless loop` |
| bg_alert.webm | 警戒区域（先読みゾーン） | `emergency lockdown corridor, rotating red beacon lights, hazard-striped blast doors, red haze, tense, seamless loop` |
| bg_rush.webm | 深淵RUSH | `extreme high-speed flight through a hexagonal energy tunnel, red and cyan light streaks, intense, seamless loop` |
| bg_sp_connect.webm | 機関接続リーチ | `cables converging into a giant reactor socket, data packets of light flowing along them, digital grid floor, cyan` |
| bg_sp_control.webm | 暴走制御リーチ | `reactor control room in meltdown, control rods lowering, huge pressure gauge needle shaking, red alarm strobes` |
| bg_sp_awaken.webm | 深淵覚醒リーチ | `vertical descent down an endless circular shaft into the abyss, rings passing by, ending with a gigantic red cracked energy core` |

※ 液晶の図柄・保留・テロップはコードで上に重ねる。背景には文字や数字を入れないこと。

## 7. 演出動画（assets/movies）— 優先 A

| ファイル | 長さ | 内容 |
|---|---|---|
| mv_overdrive.webm | 3.5秒 | 黒から白い閃光、深淵コアの8枚プレートが展開し虹色の衝撃波、"ABYSS OVERDRIVE" は入れない（ロゴは別素材） |
| mv_rush_in.webm | 4秒 | 機関が全開になり、赤いトンネルへ突入するカメラワーク |
| mv_awaken_core.webm | 3秒 | 巨大コアのひびから光があふれて砕ける（当たり確定直前用） |

`cinematic, 24fps, original sci-fi reactor, [内容], dramatic light convergence then burst, shockwave, particles, no text`
※ 現状のコードは背景動画の再生までは自動対応。演出動画を本編として流すには `engine/director.js` に再生イベントを追加する必要がある（README 参照）。

## 8. エフェクト（assets/effects）— 優先 B
fx_shockwave.png（4×4 の16コマ、各256px）、fx_spark.png（64px）、fx_lightning.png（4×2 の8コマ）。加算合成前提で黒背景も可。

## 9. 液晶 UI（assets/ui）— 優先 A

| ファイル | サイズ | 内容 |
|---|---|---|
| logo_title.png | 1280×440 | 機種ロゴ「ABYSS REACTOR / P 深淵機関」クローム押し出し＋シアン発光線 |
| logo_rush.png | 1280×480 | 「深淵RUSH」赤い極太、斜体、金属縁、"ABYSS RUSH" の小文字 |
| logo_overdrive.png | 1520×440 | 「ABYSS OVERDRIVE」虹色クローム、ひび割れた光 |
| title_sp_connect / control / awaken.png | 1400×400 | 各 SP リーチのタイトル文字（シアン／赤／虹） |

`game logo text "XXXX", extruded polished chrome letters with thick black outline and an inner glowing [color] line, heavy industrial sci-fi style, transparent background`（文字が崩れる場合は、文字を Illustrator などで組んでから質感だけ生成AIで足すこと）

---

## 10. 音声（assets/audio）

- BGM：`assets/audio/bgm/<id>.mp3`（または .wav）、44.1kHz、ステレオ、**ループ前提の曲は頭とお尻がつながる尺で**
- SE：`assets/audio/se/<id>.wav`（または .mp3）、無音の頭出しを詰める
- 外部音源は http 配信時のみ読み込まれる。音量・ダッキング・チャンネル優先度は `sound.js` の `gain` / `duck` / `pri` で調整する
- 既存機種の楽曲・効果音に似せないこと

### BGM（音楽生成AI向け）

| id | 尺 / BPM | プロンプト | 優先 |
|---|---|---|---|
| normal_lab | 60秒ループ / 82 | `dark ambient electronic, slow minor pads, sparse metallic bell arpeggio, sub bass, calm research facility, cinematic, loopable` | S |
| normal_core | 60秒 / 92 | `deep pulsing synth bass, mysterious pads, plucked arpeggios, soft kick, inside a reactor, loopable` | A |
| normal_alert | 30秒 / 104 | `tense alarm ambience, low pulses, rising dissonant pads, faint siren motif, loopable` | A |
| reach | 30秒 / 128 | `driving synth bass and arpeggio, four-on-the-floor, rising tension, pachinko reach theme, loopable` | S |
| sp_connect | 45秒 / 132 | `cyber techno, energetic bassline, glittering arpeggios, heroic lead, low-mid excitement` | S |
| sp_control | 45秒 / 146 | `aggressive industrial drum and bass, distorted bass, staccato strings, alarm stabs, high tension` | S |
| sp_awaken | 60秒 / 72 | `epic orchestral hybrid, taiko drums, dark choir, brass swells, monumental, highest expectation` | S |
| fanfare | 6秒（ループ無） | `triumphant brass fanfare with timpani and shimmering cymbal, jackpot celebration, original melody` | S |
| round | 60秒 / 150 | `uplifting euphoric synth rock, brass hits, celebration, loopable` | A |
| rush | 90秒 / 164 | `high speed trance rock, relentless drums, heroic lead melody, red-hot energy, loopable` | S |
| rush_last | 30秒 / 164 | `rush theme variation, stripped back, ticking tension, warning synth, riser, loopable` | A |
| rush_sp | 30秒 / 174 | `frantic breakbeat, screaming lead, final battle feeling` | A |
| result | 30秒 / 90 | `calm major key pads and bells, reflective aftermath, loopable` | B |

### 効果音（SE）

| id | 内容 | プロンプト | 優先 |
|---|---|---|---|
| reel_start | 図柄変動開始 | `short mechanical whoosh, spinning start` | A |
| reel_stop / reel_stop_heavy | 図柄停止（軽／重） | `heavy metallic thud with short click, weighty stop` / `deeper impact with ring` | S |
| tenpai | テンパイ | `dramatic synth chord stab with sub hit and shimmer` | S |
| reach_voice | リーチ音声（任意） | オリジナル声優の「リーチ」など | B |
| giji | 疑似連 | `metallic clank plus rising electronic tone, level up` | S |
| hold_in / hold_change | 保留の追加／変化 | `soft energy blip` / `ascending sparkle, intensity by color` | S |
| yokoku / zone_in | 先読み・ゾーン突入 | `glitchy low whoosh` / `two-tone alarm and sub swell` | A |
| develop | 発展 | `riser into big impact, transition` | S |
| chance / cutin | チャンスアップ／カットイン | `bright stinger chord` / `slash impact with whoosh` | S |
| button_prompt / button_press | ボタン煽り／押下 | `alert beeps` / `massive impact, boom, debris` | S |
| gimmick / gimmick_small | 役物駆動 | `heavy servo motor whir with mechanical clicks and a clunk` | S |
| freeze / blackout / heartbeat | フリーズ・暗転・鼓動 | `digital glitch stop` / `sub drop` / `low heartbeat` | S |
| overdrive / gekiatsu | 最上位・激アツ | `colossal reversed swell into explosion with choir` / `deep boom with metallic choir` | S |
| win | 大当たり確定音 | `original ascending shimmering sweep into bright bell cluster, unmistakable jackpot confirm` | S |
| lose | ハズレ | `descending synth fall, subdued` | A |
| round_start / attacker_in / heso_in / denchu / payout / count | 小物 | `short chime` / `tiny ping` / `click` | B |
| rush_in / st_reset / rush_end | RUSH 関連 | `huge impact with choir` / `ascending arpeggio confirm` / `gentle descending motif` | S |
| shock / charge / whoosh / lever | 汎用 | `impact` / `charging riser` / `whoosh` / `lever clunk` | B |
