# Remotion 試作（ナギバク）

React のコードで動画を作る Remotion の試作。第1弾はニュース回のOP（15秒、news_open.wav に同期）。

- 本体: `src/NewsOpening.tsx`（ビート＝14フレームごとに切り替え）
- 素材: `public/`（スタジオ・報道台・ナギ/バク・パチンコニュースロゴ・ジングル）
- 書き出し: このフォルダを変更して push すると Actions「Remotion news OP (trial)」が動き、`outputs-remotion` ブランチに mp4 と確認用の静止画が保存される
