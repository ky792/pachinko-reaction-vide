# ナギバク4分試作「各時代のパチンコ覇権台」— 制作報告（検証版）

**この動画は公開用最終版ではありません。** 権利未確認の提供写真と、写真の代わりの機種名カード（仮画像）を使った検証版です。

- 形式：1920×1080／30fps／H.264＋AAC
- 長さ：約4分07秒（台本の目標 4:00〜4:40 の範囲）
- 声：まだ無し（字幕の表示時間は文字数から自動計算。`voices/<行番号>.wav` を置くと、その長さに合わせて全体が自動で組み直される）

## 章の開始時刻

| 章 | 開始 | 内容 |
| --- | --- | --- |
| 0 | 0:00.0 | 冒頭「覇権は変わる」 |
| 1 | 0:10.1 | 1990年代後半「源さん、そして海」 |
| 2 | 0:41.2 | 2000年代「海の安定感、牙狼の衝撃」 |
| 3 | 1:19.3 | 2010年代前半「MAX機の黄金期」 |
| 4 | 1:46.5 | 2016年以降「北斗無双が残った」 |
| 5 | 2:12.6 | 2020年「速さで主役になった源さん」 |
| 6 | 2:45.0 | 2021〜23年「エヴァ15とリゼロ」 |
| 7 | 3:21.7 | 2024〜現在「LTと新しい人気機」 |
| 8 | 3:49.0 | まとめ＋視聴者参加 |

合計 4分7.1秒

## 利用素材一覧

| 素材 | 使った場面 | 状態 |
| --- | --- | --- |
| CR真・北斗無双 正面（ZIP同梱 `北斗無双_ユーザー提供.jpg`） | 冒頭レール、2016年の章（登場・液晶→円グラフ・比較カード） | 運営者提供・**権利未確認**。転載元ロゴ（赤丸のP）は消さずにそのまま |
| 真・北斗無双 ST中の液晶「幻闘RUSH」（以前のチャットで提供） | 2016年の章 | 運営者提供・**権利未確認** |
| CR牙狼 魔戒ノ花 正面（以前のチャットで提供） | 2010年代前半の章 | 運営者提供・**権利未確認**。転載元ロゴはそのまま |
| ホール写真（ZIP同梱 `ホール_ユーザー提供.jpg`） | 2010年代前半の章の背景 | 運営者提供・**権利未確認**。撮影時期不明のため「イメージ写真（撮影時期不明）」と表示。当時の写真とは表示していない |
| 機種名カード（年代＋機種名・番組オリジナル） | 写真の無い10機種 | 自作。実機の絵は描いていない |
| 効果音・BGM・ジングル | 全編 | すべてプログラムで合成したオリジナル（実機の音・第三者の映像は不使用） |

## 未入手画像一覧（assets_manifest.md と照合）

| 優先 | 機種 | 置き場所 | 状態 |
| --- | --- | --- | --- |
| 必須 | CR大工の源さん（1996） | assets/machines/daiku_gensan_1996/front.png | 未入手 → 機種名カード |
| 必須 | 初代 CR海物語（1999） | assets/machines/umi_1999/front.png | 未入手 → 機種名カード |
| 必須 | CR大海物語（2005） | assets/machines/oumi_2005/front.png | 未入手 → 機種名カード |
| 必須 | 初代 CR牙狼XX（2008） | assets/machines/garo_2008/front.png | 未入手 → 機種名カード |
| 推奨 | CR牙狼 金色になれ（2014） | assets/machines/garo_konjiki_2014/front.png | 未入手 → 機種名カード |
| 必須 | CR牙狼 魔戒ノ花（2015） | assets/machines/garo_makainohana/front.jpg | 提供写真あり・**権利未確認** |
| 必須 | CR真・北斗無双（2016） | assets/machines/hokuto_musou/front_zip.jpg | 提供写真あり・**権利未確認** |
| 必須 | P大工の源さん 超韋駄天（2020） | assets/machines/gensan_chouidaten/front.png | 未入手 → 機種名カード |
| 必須 | エヴァ15 未来への咆哮（2021） | assets/machines/eva15/front.png | 未入手 → 機種名カード |
| 推奨 | Pリゼロ 鬼がかりver.（2022） | assets/machines/rezero_onigakari/front.png | 未入手 → 機種名カード |
| 推奨 | eからくりサーカス2 魔王ver.（2024） | assets/machines/karakuri2_maou/front.png | 未入手 → 機種名カード |
| 推奨 | e東京喰種（2025） | assets/machines/tokyoghoul/front.png | 未入手 → 機種名カード |
| 補助 | 一般ホール写真 | assets/halls/max_era/photo_zip.jpg | 提供写真あり・**権利未確認** |

入手方法：各メーカーの公式サイト・広報窓口で「YouTube（収益化あり）の解説動画での実機画像の使用」を申請し、許諾の範囲（改変・切り抜き・クレジット）を記録する。
許諾が取れた写真を上の場所に置き、metadata.json に `"permission": "granted"`・出典URL・権利者・利用条件・確認日を書けば、同じ台本のまま写真入りになる。

## 出典と確認条件（台本の事実）

| 内容 | 出典 | 備考 |
| --- | --- | --- |
| 1996年 CR大工の源さん（三洋物産）、キングオブパチンコ大賞1996で1位 | [ドル箱 1996年](https://www.dorubako.biz/year/1996.html) | 二次資料。メーカー一次資料での確認が望ましい |
| 1999年2月 CR海物語（シリーズ第一号機） | [ドル箱 1999年](https://dorubako.biz/year/1999.html) | 二次資料 |
| 2005年3月 CR大海物語、3つのステージを選べる | [P-TOWN](https://p-town.dmm.com/specials/2281) | |
| 2008年11月 初代CR牙狼XX、魔戒チャンス継続率82% | [サンセイR&D 公式コラム](https://www.sansei-rd.com/decade_of_pachinko_garo/column/index.html)・[牙狼アーカイブ](https://www.sansei-rd.com/p_garo_archive/archive/garo.html) | 突入50%・1/397.18 は牙狼アーカイブ |
| 2014年 金色になれ／2015年 魔戒ノ花 | [サンセイR&D 牙狼アーカイブ](https://www.sansei-rd.com/p_garo_archive/history/promotion2010_2019.html)・[DMMぱちタウン](https://p-town.dmm.com/machines/2276) | 魔戒ノ花の導入は2015年10月13日 |
| 2015年アンケート：全国約100店舗の店長、稼働に貢献した台1位が魔戒ノ花（22.9%） | [パチ7](https://pachiseven.jp/articles/detail/694) | 対象と設問による結果。販売台数ではない |
| 2016年3月 CR真・北斗無双、1/319.7・ST130回・継続約80% | [ちょんぼりすた](https://chonborista.com/?p=15825)・[1geki](https://1geki.jp/pachinko/cr_sin_hokutomusou/01/) | |
| 継続率65%の上限：2016年5月以降の新台が対象 | [nana press](https://nana-press.com/post/5924) | 80%（ST継続率）と65%（上限）は数え方・対象時期が違うことを画面に注記 |
| 2020年4月 超韋駄天、1/319.6、継続約93%（時短3回＋残保留1個）、平均約3.5秒 | [1geki](https://1geki.jp/pachinko/p_daigentyoida/) | |
| PiDEAWARD2020 パチンコ部門大賞（稼働貢献1位・LINEアンケート1位） | [PiDEA](https://www.pidea.jp/articles/1607414458) | 2020年12月10日の記事 |
| 2021年12月 エヴァ15、1/319.7・ST163回・継続約81% | [パチセブン](https://pachiseven.jp/machines/6414/cutout/2)・[1geki](https://1geki.jp/pachinko/p_eva15roar/1/) | |
| エヴァ15 P-WORLDアワード2022 ユーザー・ホール両部門GOLD、長期稼働 | [P-WORLD ニュース](https://news.p-world.co.jp/articles/23040/yugitsushin) | 2023年2月9日 |
| 2022年1月 リゼロ鬼がかり、約1/319.6・継続約77%・突入時約3000個 | [P-TOWN](https://p-town.dmm.com/specials/2507) | |
| 2024年11月 からくりサーカス2 魔王ver.（LT） | [ちょんぼりすた](https://chonborista.com/?p=219950) | |
| 2025年4月 e東京喰種（LT） | [公式](https://pachi-e-tokyoghoul.jp/)・[ちょんぼりすた](https://chonborista.com/pachinko/bisty/230670/) | |
| スマパチ 2023年4月〜、LT 2024年〜 | 日刊ゲンダイ（京楽PR記事）・[SANKYO](https://www.sankyo-fever.jp/beginner/useful-information/6/) | episodes/ken_full/SOURCES.md と同じ |

「覇権台」は番組が選んだ各時代の代表機で、公式な順位ではないことを冒頭に表示。2024年以降は「2026年10月時点の注目機」と表示し、覇権とは断定していない。

## 実装変更点（ブランチ feat/v4-haken）

- `v3/templates_era.py`（新規）：R（時代のレール／まとめ＋ロゴ）、T（年表と主役カード）、V（2台の対比、「？」から登場演出で明かす）
- `v3/moments.py`：章の入口（年代カード1.5秒＋短いジングル）を追加。`@X intro=chapter chapter=1990s ...`
- `v3/media.py`：写真が無い機種の「年代＋機種名カード」（実機の絵は描かない）
- `v3/photos.py`：運営者提供の写真（permission=owner）は検証版でのみ使い、`--final` では除外。画面に「権利未確認（検証用）」と表示
- `v3/planner.py`：`@manual`（シーンは台本の @ 行だけで切り替え）、テンプレート R/T/V、どのテンプレートでも `machine=`、比較の `pcts=80,65`
- `v3/templates.py`：機種紹介の差し色（`accent=purple` など）、長い正式名は2行に、提供写真の上に乗る札の位置調整
- `lab/`・`reaction/`・`generator/` は変更していない（V4 の動画生成は `v3/` パッケージで動いているため、今回もそこを拡張）

## 作り直し方

```
python -m v3.build episodes/v4_haken -o out.mp4            # 検証版（提供写真＋機種名カード）
python -m v3.build episodes/v4_haken -o out.mp4 --final    # 許諾済みの写真だけ（今は全部カード）
python -m v3.build episodes/v4_haken --plan                # シーン表と不足写真の一覧だけ
```

## レンダリング記録（2026-10-10）

- 映像の生成：715秒（約12分、247秒の動画をクラウドの作業環境で1回）
- 送付用の圧縮：約4分40秒（2パス、映像780kbps＋音声96kbps → 約27MB。チャットに送れる30MB以内にするため）
- 圧縮前のマスター（約57MB）は作業環境にあり、必要なら章ごとに分けて高画質で送れる

## 点検した項目

- 字幕の文字切れ：全章の静止画で確認（長い機種名は2行・小さい札に自動で調整）
- 静止画像の引き伸ばし：機種写真は元の大きさ以下で表示（拡大なし）、液晶画像は1.2倍まで
- 1レイアウトの長時間連続：最長は年表（約22秒）で、中で主役カードと文字が動く。その他は約6〜19秒で切り替わる
- 画像・数字・キャラ・字幕の重なり：静止画で確認し、札・注記・カードの位置を調整
