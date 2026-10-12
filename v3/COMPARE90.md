# 90秒のA/B比較を作る

同じ台本・素材・声の冒頭90秒を、A＝通常演出、B＝強化演出で比較します。
既存のV3動画制作・キャラ・音楽・読み方辞書を再利用します。

## 次に押すボタン

今回のPRでは、Checks → Generate 90-second A-B comparison → Details を開きます。
成功した実行の Artifacts → comparison-90s をダウンロードしてください。
mainにマージしなくても、PRの自動実行で比較動画を作れます。

レビュー後にこのPRがmainへ反映されたら、毎回の操作は次のとおりです。

1. episodes/<回>/script.txt の台本、data.json、images/ の素材を差し替える。
2. Actions → Generate 90-second A-B comparison → Run workflow。
3. episodeに回のフォルダ名を入れ、qualityはfastを選んで実行。
4. comparison-90sをダウンロードし、AB.mp4を再生。

素材をGitHubで再利用する場合は、既存.gitignoreで除外されるimages/を含め、
利用するファイルを明示して登録してください（例：git add -f episodes/<回>/images/写真.jpg）。
未登録のローカル素材はGitHub Actionsから使えません。

## 出てくるファイル

- A.mp4：通常演出、声・BGM・効果音付き、90秒。
- B.mp4：強化演出、同じ声・BGMと追加効果音、90秒。
- AB.mp4：左右で同時比較、90秒。音声はAを使用。Bの効果音はB.mp4で確認。
- manifest.json：秒数検査、声の有無、使った画像と不足箇所。
- MISSING_PHOTOS.md：未配置の写真一覧。

fastは1280×720・毎秒12枚の描画を30fpsのMP4にします。
fullは1920×1080・30fpsです。fastは演出確認用で、動きの滑らかさはfullより低くなります。

## 高速化と再利用

初回だけ固定のPython依存関係とVOICEVOXを用意します。
音声は台詞・声の設定・読み方辞書・エンジン版で保存し、同じ条件なら使い回します。
90秒に入る台詞だけ音声を作ります。番号が変わってもキャッシュを使えます。
ローカルでは台本・素材・コード・設定が同じなら、完成済み動画もそのまま再利用します。
GitHub Actionsでも音声とVOICEVOXエンジンのキャッシュを復元します。

ローカル実行：

```bash
python -m pip install -r v3/requirements.txt
VOICEVOX_DIR="$PWD/cache/voicevox-engine" bash scripts/setup_voicevox.sh
python -m v3.compare episodes/v5_preview_part2 --voice
```

声なしの映像確認だけ急ぐ場合：

```bash
python -m v3.compare episodes/v5_preview_part2 --silent-preview --fps 6 --width 960
```

声なし版は画面とレポートに明記します。声がないのに声付き完成とは扱いません。
台本が90秒未満なら止めます。引き伸ばしや静止画の繰り返しで埋めません。
写真・資料がない場合は既存の「準備中」パネルで続行します。

## 今回の残作業

- GitHub Actionsで声付きの実出力・結果を確認する。
- v5_preview_part2の実機写真・歴史写真・記事画像を置いて、準備中パネルを差し替える。
- まずfastでA/Bを選び、必要に応じてfullで滑らかさ・読み方・音量を確認する。
- PRのレビューとmain反映は利用者の判断で行う。

既存のmake-episode、add-voice、make-reaction、labの実装とワークフローは変更しません。
V3用の既存VOICEVOX起動スクリプトは、取得失敗を検出して即座に止め、
起動を確認してから成功を表示するよう修正しました。
