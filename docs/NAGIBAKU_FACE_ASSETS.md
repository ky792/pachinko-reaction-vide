# ナギ・バクの表情差分（素材の作り方と使い方）

> 2026-10-18。表情差分の画像を置けば、動画にそのまま反映される（置いていない表情は normal.png のまま）。

## 置き場所とファイル名
`generator/assets/characters/v2/<nagi|baku>/<表情>.png`

| ファイル名 | 表情 | 主に使う場面 |
| --- | --- | --- |
| normal.png | いつもの顔（今ある絵） | 普段 |
| happy.png | 笑顔 | 跳ねる（hop）、うれしい話 |
| excited.png | 大はしゃぎ・目がキラキラ | 大きく跳ねる（jump）、大当たり・連チャンの話 |
| surprised.png | 驚き（目を見開く・口を開ける） | のけぞる（shock） |
| sad.png | しょんぼり | 縮む（slump）、負けた話 |
| angry.png | 怒り・ツッコミ | 震える（shake）、「なんでやねん！」 |
| confused.png | 困惑・首をかしげる | 首をかしげる（tilt）、「？」 |
| smug.png | ドヤ顔・得意げ | 詰め寄る（lean）、知ってる話をするとき |
| sweat.png | 焦り・冷や汗 | 汗（sweat） |
| despair.png | 絶望（白目・魂が抜ける） | ハマり・大負けのオチ（台本で face=despair を指定したときだけ） |

- 最低限ほしいのは **happy / surprised / sad / angry / confused / smug** の6つ（各キャラ）。
- ナギは「だいたい眠い」キャラなので、驚き（surprised）だけは目を開けると効く。

## 絵の条件（差し替えたときにガタつかないように）
- **今の normal.png と同じ体・同じポーズ・同じ服**で、**顔（と、あれば手）だけ**を変える。
- **キャンバスの大きさと足元の位置を normal.png とそろえる**（入れ替えたときにキャラがずれない）。
- 背景は**透過PNG**。白フチ（ステッカー風の縁取り）も今と同じに。
- **大きめに**：高さ1500px以上が理想（今の normal.png は高さ約500pxで、寸劇で大きく出すと少しぼやける）。normal.png も同じ大きさで描き直せるとなお良い。

## 台本での使い方
- 寸劇（`@skit on`）では、動き（`@dir act=`）に合う表情が自動で付く：hop→happy、jump→excited、shake→angry、tilt→confused、shock→surprised、sweat→sweat、slump→sad、lean→smug。
- 本編でも `@dir face=surprised` のように書けば、そのセリフの間だけ表情が変わる。

## 2026-10-18 受け取った素材
- 表情シート：`generator/assets/characters/v2/sheets/{baku,nagi}_faces.png`（4×2、白背景、バストアップ）→ `python scripts/cut_faces.py` で `v2/<who>/face/<表情>.png` に切り出し
  - バク：①happy ②normal（ウインク）③surprised ④smug ⑤excited ⑥angry ⑦sweat ⑧sad（confused＝sweat、despair＝sad で代用）
  - ナギ：①normal ②happy ③confused ④sweat ⑤sad ⑥surprised ⑦smug ⑧sleep（angry＝sad、excited＝happy、despair＝sleep で代用）
  - 2026-10-18 にコマの間を空けたシートに差し替え（隣と重ならないので、そのまま切り抜ける）
- **寸劇ではバストアップを使う**（下端はセリフ欄の上辺に合わせてフェードで消す。セリフ欄の左右に配置。絵に漫符があるので、表情があるときは自前の漫符を出さない）。本編の小さいキャラは全身の normal.png のまま（ナギの脳タンクの位置合わせがあるため）
- ロゴ：`generator/assets/logos/{news,history,newmachine}.png`（history は「パチスロクロニクル」に差し替え済み・白背景を透過に）。台本で `@logo history.png 3.6`
- 背景：歴史回は `generator/assets/backgrounds/history_room.png`（`episode.json` の `"background"`）。研究室の背景と同じく、ぼかして暗くして敷く
