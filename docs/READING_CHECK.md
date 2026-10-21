# 読み間違いの検査と修正（ナギバク）

声を作る前と作ったあとに読みを確かめ、間違っていた行だけを作り直す。どれもローカルか GitHub Actions で、無料で動く（有料APIなし）。

## 1. いまの声の作り方と、できること・できないこと

| | ナギ | バク |
| --- | --- | --- |
| エンジン | AivisSpeech（コハク「ねむたい」）。VOICEVOX 互換で、読みは中の **OpenJTalk** が決める | Irodori-TTS（v4.1-Small-MF、見本声 まお）。**文字をそのまま読むモデル**で、読みを外から指定する機能はない |
| 作る場所 | `voice-ab-aivis.yml`（`voice_ab/aivis_request.json` を push） | `voice-ab-irodori.yml`（`voice_ab/irodori_request.json` を push） |
| 読みの直し方 | **AivisSpeech のユーザー辞書**（`aivis_words`：漢字の表記・読み・アクセント）。合成のたびに `/user_dict_word` で登録する。字幕も読み上げ用テキストも漢字のまま。アクセントは `kana_fix`（`engine: aivis`）で `/accent_phrases` を使って直せる | **Irodori に送る直前**に、辞書にある語だけ読みに置き換える（`rules` の `engine: irodori`）。漢字をまとめてかなにはしない |
| 声を作る前の検査 | **ほぼ当たる**：手元の pyopenjtalk で、エンジンと同じ読みが先に分かる | **目安**：OpenJTalk の読みはモデルの読みと一致するとは限らない |
| 作ったあとの確認 | エンジンが実際に使った読み（`voice_ab/aivis_lines/kana.json`）＋ Whisper の文字起こし | Whisper の文字起こしだけ |

- Whisper の照合は「候補」を出すだけ。同じ読みの別の言葉、聞き取りやすい誤読、アクセントの違いは見つけられない。最後は人が聞いて決める。
- この作業環境からは Whisper のモデルを落とせない（Hugging Face に届かない）ので、文字起こしは GitHub Actions（`voice-check.yml`）で回す。声を作る前の検査は手元で動く（`pip install pyopenjtalk-plus`）。
- 声の設定（話者・スタイル・速さ・抑揚・見本声・字幕の間）は変えない。作り直すのは指定した行だけで、依頼ファイルの設定はそのまま使う。
  - Irodori は同じ文でも作るたびに少し声が揺れるので、作り直した行は聞いて確かめる。
- 音声を差し替えると、その長さで字幕と場面のタイミングが自動で決まり直る（`lab/episode.py`）。`--reuse` を付けると、音声・台本・画像が変わった章だけ描き直して全体をつなぎ直す。

## 2. 字幕と読み上げを分ける
- 台本に `《表記|よみ》` と書くと、字幕には「表記」、読み上げには「よみ」が使われる。
  - 例：`ナギ: 《加持|かじ》さんの全回転。`
- 読み上げ用テキストの作り方：`《》` をよみにしてから、`voice/dictionary.json` の `rules` を順に当てる（`lab/reading.py` の `speech_text`）。
- 声の使い回し（`reuse_voices.py`）は読み上げの元で比べるので、よみを変えた行は作り直しの対象になる。

## 3. 辞書（`voice/dictionary.json`）
| 項目 | 中身 | 読み上げを変えるか |
| --- | --- | --- |
| `terms` | 用語・機種・メーカー・エヴァの固有名詞などの読み。`cat`（分類）と `status`（`ok`＝確定／`要確認`＝人が確かめるまで確定しない） | 変えない（検査の基準） |
| `aivis_words` | ナギ用：AivisSpeech のユーザー辞書（`surface` 漢字、`pronunciation` カタカナ、`accent_type`、`word_type`、`priority`、`status`、`accent_status`＝確認済み／推定） | 変える（ナギ） |
| `rules` | 読み上げ前に当てる置き換え（正規表現）。`engine` なし＝両方、`irodori`＝バクだけ、`aivis`＝ナギだけ | 変える |
| `kana_fix` | 読み（カナ）の置き換えでアクセントを直す。`engine: aivis` のものだけナギに使う | 変える（ナギ） |
| `words` | 前の VOICEVOX 用のユーザー辞書。AivisSpeech には `"legacy_words": true` のときだけ入れる | — |
| `history` | 誤読を直した記録（いつ・どの語・何と聞こえた・どの行・どのエンジン） | — |

- 読みが分からない語は推測で `ok` にしない。`要確認` で入れておくと、使った行が検査で毎回出てくる。

## 4. 手順
```sh
# 1) 声を作る前（手元）：読みの怪しい所を出す → episodes/<回>/reading/precheck.md
python scripts/reading/precheck.py episodes/eva_history

# 2) 直すと決めた語を辞書へ（history に記録が残る）
#    --for nagi → aivis_words（ユーザー辞書。アクセントは --accent で指定、省くと OpenJTalk の推定＝accent_status 推定）
#    --for baku → rules（engine: irodori）／ --for both → 両方
python scripts/reading/fix.py add 出玉 でだま --heard ダシダマ --line eva_history:05_fuyu-039 --cat 用語 --for nagi
#    その行の言い回しでだけずれるもの（「J.A.を止めろ」→トドメロ）は台本に《止めろ|とめろ》と書く（字幕は漢字のまま）
python scripts/reading/fix.py add 竹屋 タケヤ --confirm          # 要確認の語を確定するだけ

# 3) 声を作ったあと：voice_ab/check_request.json を push → CI が Whisper で照合
#    {"episode": "episodes/eva_history", "model": "small"}   （only で行を絞れる）
#    → episodes/<回>/reading/report.md（行ID・話者・種類・問題箇所・期待する読み・検出理由・確度・音声ファイル）

# 4) 直す行だけ作り直す（依頼ファイルの only だけ書き換え、push で CI が作る）
python scripts/reading/fix.py request episodes/eva_history --from report --level 高
python scripts/reading/fix.py request episodes/eva_history --ids 02_bousou-069,05_fuyu-039

# 5) できた音声を差し替えて、変わった章だけ描き直す
python scripts/voice_ab/finalize_lines.py voice_ab/aivis_lines episodes/eva_history/voices --ids-from episodes/eva_history --shift -1.5 --only <ナギの行>
python scripts/voice_ab/finalize_lines.py voice_ab/irodori_lines/eva_baku8 episodes/eva_history/voices --ids-from episodes/eva_history --squeeze --only <バクの行>
python lab/episode.py episodes/eva_history --reuse

# 6) 修正前後を比べる（作り直す前の音声は request のときに reading/before/ に控えてある）
python scripts/reading/compare.py episodes/eva_history        # CI では --whisper で前後とも文字起こし
#    → reading/compare.md（読み・文字起こし・照合・長さの前後）、reading/ab/<行ID>.wav と all.wav（修正前 → 修正後の聞き比べ）
```

## 5. 検査の中身
**声を作る前（`precheck.py`）**

| 種類 | 何を見るか |
| --- | --- |
| 辞書と違う | 辞書で読みが決まっている語を、その行で OpenJTalk がどう読むか（ナギは aivis_words をユーザー辞書に入れた OpenJTalk＝AivisSpeech と同じ仕組みで読む）。文の中で読みが変わる場合も拾う（例：「出玉は」→ダシダマ、「初号機や」→ショゴーハタヤ） |
| 英字残り／小数 | 読み上げ用テキストに残った英字、小数 |
| 要確認の語 | `status=要確認` の語を使っている |
| 辞書にない固有名詞 | OpenJTalk が固有名詞と見た漢字の語（読みは参考） |
| 再発注意 | 前に直した語（`history`）が、直す `rules` を通らずに残っている |

**声を作ったあと（`asr_check.py`）**
- 照合のしかた：台本と文字起こしを、どちらも「rules → 辞書語をその読みに → OpenJTalk でかな → 長音などをならす」で同じ形にして並べる。
- 拾うもの：
  - 2音以上のずれ（脱落・重複・余分な音・誤読）
  - 辞書語のところのずれ（誤読（辞書語）、確度：高）
  - 行全体の一致が80%未満
  - 1秒あたりの音の数が、その話者のふつうから大きく外れる行
  - ナギは、エンジンが合成に使った読みに辞書の読みがあるか
- 1音だけのずれは、文字起こしの揺れが多いので拾わない。
- 文字起こしは `reading/asr.json` に控えてあり、音声が変わった行だけ文字起こしし直す。

## 公開前の総点検（必ず全行）
直した行だけの照合では、昔から作ってある行の読み間違いが残る（例：「役物」→ヤクブツ。10/19 の照合で確度「低」として出ていたのに直されなかった）。公開用に書き出す前に、次の2つを全行で回す。
1. ナギの全行のエンジンの読みを控える：`voice_ab/aivis_request.json` を `{"action": "lines", …, "kana_only": true}`（`only` なし）にして push。声は作らず `voice_ab/aivis_lines/kana.json` に全行の読みが入る（数分）。
2. 全行の文字起こし照合：`voice_ab/check_request.json` から `only` を外して push（30分前後）。
- 1 があると、ナギの行はエンジンが実際に使った読みで照合されるので、辞書語の誤読が確度「高」で必ず出る。
- 同じ辞書語が2行以上で違って聞こえたものも「高」に上がる。
- 「高」は全部、直すか（辞書に足す・《表記|よみ》）、聞いて問題なしと決めてから書き出す。
- 辞書の `terms` は検査の基準でしかなく、読み上げは変えない。読みを直すには `fix.py add`（`aivis_words`／`rules`）に入れる。
