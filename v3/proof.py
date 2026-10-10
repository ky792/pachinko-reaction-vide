"""校閲：読み上げ前に「読み」と「数字の出典」を一覧にして、人が確認するところだけ目立たせる

  python -m v3.proof episodes/v4_haken        → episodes/v4_haken/PROOF.md

  読みのチェック（VOICEVOX が実際に読むカナで確認）
    ・英字が残っている（辞書・置き換えルールに無い英字はそのまま読まれる）
    ・辞書の読みがまだ「未確認」（ok=false）の言葉を使っている
    ・『』で囲んだ機種名などが辞書に無い
    ・辞書にある言葉なのに、エンジンの読みに辞書の読みが入っていない（読み間違いの疑い）
  数字のチェック
    ・台本の数字（年・％・確率・回・個・秒・位）が facts.json（出典つきの数字の一覧）に無い
"""
import json
import re
import sys
from pathlib import Path

from . import voice
from .planner import parse

NUM = re.compile(r"1/[0-9]+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?(?:%|年|月|回転|回|個|秒|位|店舗)?")


def kana_of(text, speaker, cache={}):
    k = (text, speaker)
    if k not in cache:
        cache[k] = voice.query(text, speaker)["kana"]
    return cache[k]


def plain(kana):
    """比較用：記号を消し、長音の書き方の違い（ウ/オ、イ/エ、ー）をそろえる"""
    k = re.sub(r"[^ァ-ヴー]", "", kana)
    return k.replace("ー", "").replace("ウ", "オ").replace("イ", "エ")


def check(ep):
    ep = Path(ep)
    d = voice.load_dict()
    voice.sync_dict(d)
    cast = voice.cast()
    facts_p = ep / "facts.json"
    facts = json.loads(facts_p.read_text(encoding="utf-8")) if facts_p.exists() else {"values": []}
    known = {f["v"]: f for f in facts["values"]}
    words = d["words"]
    rows, n, nflag = [], 0, 0
    for it in parse(ep / "script.txt"):
        if it["cmd"] != "line":
            continue
        n += 1
        who, text = it["who"], it["text"]
        spk = cast[who]["speaker"]
        st = voice.speech_text(text, d)
        kana = voice.read_kana(text, spk, d)
        flags = []
        if re.search(r"(ップ|ッフ|フ)ン", kana) and re.search(r"[0-9]", text):
            flags.append("数字のあとが『〜ふん／ぷん』と読まれている（分数・時間の読み間違いの疑い）")
        rest = re.findall(r"[A-Za-z][A-Za-z0-9\-\.:]*", st)
        if rest:
            flags.append("英字のまま：" + "・".join(sorted(set(rest))))
        for w in words:
            if w["surface"] in text or w["surface"] in st:
                if not w.get("ok"):
                    flags.append(f"辞書の読みが未確認：{w['surface']}＝{w['yomi']}")
                elif plain(kana_of(w["yomi"], spk)) not in plain(kana):
                    flags.append(f"読み間違いの疑い：{w['surface']}（辞書は{w['yomi']}）")
        for nm in re.findall(r"『([^』]+)』", text):
            covered = any(w["surface"] in nm for w in words) or voice.speech_text(nm, d) != nm
            if not covered:
                flags.append(f"辞書に無い名前：{nm}")
        for tok in NUM.findall(text):
            core = tok
            if core not in known and re.sub(r"[^0-9./]", "", core) not in known:
                flags.append(f"出典が未登録の数字：{tok}")
        if flags:
            nflag += 1
        rows.append((n, who, text, st, kana, flags))
    lines = [f"# 校閲シート（{ep.name}）", "",
             f"全 {n} セリフ／要確認 {nflag} セリフ。**要確認の行だけ見て、読みが違えば voice/dictionary.json を直す。**", "",
             "カナの見方：' の直前の音が高く、そこで下がる（アクセント）。/ と 、 は区切り。_ は無声化。", ""]
    for n_, who, text, st, kana, flags in rows:
        mark = "⚠️" if flags else "✅"
        lines.append(f"### {mark} {n_:03d} {'ナギ' if who == 'nagi' else 'バク'}")
        lines.append(f"- 台本：{text}")
        if st != text:
            lines.append(f"- 読み上げ用：{st}")
        lines.append(f"- 読み：{kana}")
        for f in flags:
            lines.append(f"  - ⚠️ {f}")
        lines.append("")
    (ep / "PROOF.md").write_text("\n".join(lines), encoding="utf-8")
    return rows


if __name__ == "__main__":
    rows = check(sys.argv[1])
    print(sum(1 for r in rows if r[5]), "/", len(rows), "セリフに要確認")
