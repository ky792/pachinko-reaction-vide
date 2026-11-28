# 新台解説：eシャングリラ・フロンティア（研究所UI版 v2）制作メモ

- 本番：Composition `Shanfro2`（`src/labui/ShanfroEpisode2.tsx` → `LabEpisode.tsx`）。データ `src/labui/ep/shanfro2.json` は `scripts/build_labui_episode.py episodes/shanfro2 public/ep/shanfro2 src/labui/ep/shanfro2.json` で作る
- 台本：ユーザー提供台本を監査して直したもの（`AUDIT.md`）。画面の中身は `ui.json`
- 背景：ユーザー指定の新台解説の背景（`public/labui/shinkai_bg.png`、2026-11-28）。絵の中の大型モニター（章名・波形・棒グラフ・章の進み具合）と実機の液晶（色が回り、章が変わるとフラッシュ）にUIを重ね、天井リング・脳タンクの光の呼吸と光の粒で動かす。データ画面のときは寄って暗く・ぼかす
- 研究所UI（LAB OS）：上の中央に章レール、左上に研究所タグ＋解析中の機種、右上にモード表示。パネル（表・円グラフ・横棒）、レン（RNC-01）の継続率解析、BOOSTシミュレーター、リール・判定スタンプ、警告割り込み、画面ジャック
- キャラ：ナギ＝nagi.png（説明中は指し棒）、バク＝baku_stand.png（2026-11-28 の新しい立ち絵）。割り込みの顔は両耳ありの表情（kyu/）
- 声：`feat/shanfro2-voice` の `episodes/shanfro2/`（ナギ＝AivisSpeech コハク「ねむたい」0.95/0.65・−1.5半音、バク＝Irodori-TTS v4.1-Small-MF garo2_fix_s53＋squeeze）。voice-check（trim）の関門に全77行合格 → `sync_voices.py --tempo 1.1` で取り込み（新台解説は1.1倍）。セリフの間は声なし
- 効果音：パネルが出る音はホログラムB2（holo_appear／holo_data／holo_disappear）
- OP曲・本編BGM：前のシャンフロ回と同じ（op_brass.wav／newmachine_matsuri.wav）。ED：全動画共通（最後の台詞から曲を流してエンドカードでサビ）
- 書き出し：コミットメッセージに `[render]` を入れて push → `.github/workflows/remotion-shanfro2.yml` が静止画→MP4→Release `shanfro2`、720p確認版は `outputs-shanfro2` ブランチ

## 気になる点（耳で確認していない）
- 08_matome-004 バク「一発の当たりで《塊|かたまり》を取る台やな」：文字起こしでは「かたまり」が崩れて聞こえる（確度・中）
- 02_kihon-004 ナギ「7で揃えば直行」、02_kihon-007「399を回しきる」：文字起こしが崩れている（確度・低）

## 画像（2026-11-28 ユーザー指示「画像調べて入れて」）
- 筐体画像：グリーンべるとの記事（web-greenbelt.jp/post-117814）の筐体写真を白抜きして `public/ep/shanfro2/img/cab.png` に。取り込みは `.github/workflows/shanfro2-fetch-images.yml`
- 使う場所：タイトル画面の右、01章の機種紹介（image:cab）、06章のアクセル枠（imgdata:waku）、まとめ（imgdata:matome）。画像を出す画面にはコピーライトを表示
- アクセル枠の部位アップ・液晶演出の画像（DMMぱちタウン）は、GitHub Actions からの取得を拒否されて取れなかった
