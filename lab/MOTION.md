# ナギバク解説動画：モーション編集システム（初期版）

**対象は lab/ の解説動画のみ。** reaction/ や generator/ は変更しない。

## 今できること

- 既存の台本や資料はそのまま。モーションを指定しなければ従来の絵を維持する。
- 背景・年表・機種カードなどの資料層に仮想カメラのズーム／パンをかける。
- 機種カード等に移動・拡縮・回転・透明度のキーフレームを付ける。
- ナギ、バク、字幕、解析パネルは画面手前に固定し、読みやすさを確保する。
- GitHub Actionsで、デモ・静止画・1章・全章の書き出しを実行する。
- voices/ に音声WAVがある場合は、既存処理で自動的に尺を合わせる。

**未実装:** AivisSpeech音声の自動生成、レイヤー別のパララックス、モーションブラー、
参考動画のデザイン全体の再現。次の開発段階で扱う。

## 20秒デモを出力

GitHub → Actions → Render NagiBaku Lab explainer → Run workflow。
mode を demo にして実行し、成功後に Artifacts からMP4を取得する。
この新しいワークフローはmainにマージされたあとに通常のActions一覧から実行可能。

ローカル（Python 3.12 / Pillow / numpy / scipy / ffmpeg / Noto Sans CJK）:

~~~shell
python lab/render.py episodes/lab_motion_demo/scene.json -o output/lab_motion_demo.mp4
python lab/render.py episodes/lab_motion_demo/scene.json -o output/preview.png --stills 3,5
python lab/episode.py episodes/ken_full --only 02 --out output/ken_full
~~~

## 台本で演出を書く

今までの episode.py に命令を追加した。

~~~text
@show machine:hokuto
@camera 1.15 100 -20 0.8
ナギ: この時代を代表する一台です。
@motion machine:hokuto 60 0 1.04 0 1 0.5
バク: なんやこの数字は！
~~~

**@camera zoom x y duration**
- zoom=1.0 が等倍、1〜3。x/y は元画像のピクセル単位。
- 今の再生時刻から duration 秒かけて移動（指示自体で動画の尺は増えない）。
- 画面端を超える場合、黒帯を出さないようカメラ移動を制限する。
- zoom=1.0ではカメラのパンはできない。

**@motion target dx dy scale rotate opacity duration**
- target は machine:hokuto のような @show の識別子、または machine のような種類。
- dx/dy：移動px、scale：倍率、rotate：反時計回りの角度、opacity：0〜1。
- duration秒で今の設定から新しい値に補間。字幕・キャラには影響しない。

## 直接scene.jsonに書く場合

~~~json
{
  "motion": {
    "camera": [
      {"t": 0, "zoom": 1, "x": 0, "y": 0},
      {"t": 4, "zoom": 1.14, "x": 100, "y": -20}
    ],
    "elements": [{
      "target": "machine",
      "keyframes": [
        {"t": 2.1, "dx": 120, "scale": 0.93, "opacity": 0.7},
        {"t": 3.0, "dx": 0, "scale": 1, "opacity": 1}
      ]
    }]
  }
}
~~~

これは追記部分の例。全体構成は episodes/lab_motion_demo/scene.json を参照。
tは章開始時からの秒数。ease は linear / out / smooth（デフォルト）。

## 現段階の限界

- カメラの移動と要素の変形を増やすと、レンダリング時間が伸びることがある。
- GitHub Actionsの無料利用には枠・制限がある。無制限ではない。
- AivisSpeechのモデルUUIDと商用利用条件が未確認のためTTS自動生成は未実装。
  voices/ の各IDのWAVがない場合、現在は効果音・BGMだけでナレーションは入らない。
- プレビュー用の短い動画が出力できたら、まず文字切れ・目線移動・速度を確認する。

## 開発順

1. 20秒デモを書き出して目視チェック。
2. AivisSpeechモデルを確認し、ナギとバクの音声の自動生成を追加。
3. カメラレイヤーを奥行き別に分け、パララックス等を追加。
4. 機種・年表・比較の動きを6〜10種類のテンプレートにまとめる。
5. 必要になればRemotionと同じ20秒デモを比較する。
