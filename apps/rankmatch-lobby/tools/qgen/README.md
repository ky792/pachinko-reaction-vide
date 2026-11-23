# 問題の量産パイプライン（大学受験・共通テスト水準）

AI が下書き → 答えを伏せて別に解かせて検算 → 機械チェック → 人がレビュー → `data/questions-gen.js` に書き出し。

```sh
pip install anthropic          # node も必要（data/*.js の読み込みに使う）
export ANTHROPIC_API_KEY=...

python3 tools/qgen/qgen.py plan                          # 不足数と概算コスト（API は呼ばない）
python3 tools/qgen/qgen.py audit                         # 既存問題の水準判定 → 中学レベルを差し替え候補に
python3 tools/qgen/qgen.py generate --min-weight 3       # ★3 単元から下書き（--dry-run で内訳だけ表示）
python3 tools/qgen/qgen.py verify                        # 検算＋機械チェック → work/verified.json
#   tools/qgen/review.html をブラウザで開き verified.json を読み込む → 採用/却下・修正 → approved.json を保存
#   保存した approved.json を tools/qgen/work/ に置く
python3 tools/qgen/qgen.py export                        # data/questions-gen.js を生成、index.html に読み込みを追加
```

- API を呼ぶ処理は既定で Message Batches（料金半額・完了まで最大24時間）。少量を急ぐときは `--sync`。
- 目標問題数は ★3=16 / ★2=10 / ★1=6 問（`qgen.py` の `TARGET`）。
- 検算の判定：`pass`＝検算の答えが一致・指摘なし、`flag`＝一致したが軽い指摘あり（要確認）、`fail`＝答えが食い違う・正解が複数・事実誤り・選択肢重複・既存と重複など。
- 中学レベルと判定された既存問題は、その単元の新しい問題が目標の半分以上そろったときだけ `RETIRE` で外す（範囲が空かないように）。
- id は問題文のハッシュ（`mg3fa21c` など）。学習履歴が id に紐づくので、出した問題の id は変えない。
- `work/` は作業用（git に入れない）。
