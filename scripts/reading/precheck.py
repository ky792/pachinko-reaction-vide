#!/usr/bin/env python3
"""声を作る前の読み検査（ローカル・無料。pyopenjtalk だけで動く）

  python scripts/reading/precheck.py episodes/eva_history [--only 02_bousou-010,…] [--chapter 02_]
  → episodes/<回>/reading/precheck.json と precheck.md

見ること（どれも「候補」。直すかどうかは人が決める）
- 英字残り    ：読み上げ用テキストに英字が残っている（エンジンごとに読みがぶれる）→ rules か《表記|よみ》で読みを決める
- 小数        ：「1.2%」のような小数（台本ルールでは小数を読ませない）
- 辞書と違う  ：辞書で読みが決まっている語なのに、OpenJTalk の読みに辞書の読みが出てこない
                ナギ（AivisSpeech＝中身は OpenJTalk）はこのとおりに読む見込みが高い。バク（Irodori）は目安
- 要確認の語  ：辞書で status=要確認 の語を使っている（読みを推測で決めない）
- 辞書にない固有名詞：OpenJTalk が固有名詞と見た漢字の語で、辞書にないもの（OpenJTalk の読みは参考）
- 再発注意    ：前に誤読を直した語（history）が、直す rules を通らずに残っている
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
import episode  # noqa: E402
import reading  # noqa: E402

KANJI = re.compile(r"[一-龯々〆ヵヶ]")


def all_lines(ep, only=None, chapter=None):
    out = []
    for sc in sorted((ep / "script").glob("*.txt")):
        if chapter and not sc.stem.startswith(chapter):
            continue
        for it in episode.lines_with_ids(sc):
            if only and it["id"] not in only:
                continue
            out.append(it)
    return out


def check_line(it, d, terms, known):
    disp, sp = it["text"], reading.speech_text(it["say"], d)
    kana = reading.kana(sp)
    nk = reading.norm(kana)
    found = []

    def add(kind, where, expect, reason, level):
        found.append({"id": it["id"], "who": it["who"], "kind": kind, "where": where, "expect": expect,
                      "reason": reason, "level": level, "text": disp, "speech": sp, "kana": kana})

    for m in re.finditer(r"[A-Za-zＡ-Ｚａ-ｚ]+(?:[ .\-][A-Za-z]+)*", sp):
        add("英字残り", m.group(0), "", f"読み上げ用テキストに英字「{m.group(0)}」が残っている。OpenJTalk の読み：{reading.kana(m.group(0))}", "中")
    for m in re.finditer(r"\d+\.\d+", sp):
        add("小数", m.group(0), "", "台本ルールでは確率などの小数を読ませない", "中")
    for surf, yomi, src, status in terms:
        if surf not in disp:
            continue
        if status != "ok":
            add("要確認の語", surf, yomi, f"辞書で status={status}。読み「{yomi}」は人の確認待ち", "高")
            continue
        tgt = surf if surf in sp else (yomi if yomi in sp else None)
        if tgt is None:
            continue                       # ほかの rules で書き換わっている
        got = reading.reading_in(sp, tgt)
        exp = reading.yomi_kana(yomi)
        flat = lambda x: x.replace("|", "")
        ok = flat(exp) in flat(reading.norm(got) if got is not None else nk)
        if not ok:
            add("辞書と違う", surf, yomi,
                f"辞書の読み「{yomi}」と違う（この行での OpenJTalk の読み：{got or reading.kana(surf)}）"
                + ("。ナギはこの読みになる見込みが高い" if it["who"] == "nagi" else "。バク（Irodori）では目安"), "高" if it["who"] == "nagi" else "中")
    for n in reading.frontend(sp):
        s = n["string"]
        if n["pos_group1"] == "固有名詞" and KANJI.search(s) and s not in known:
            add("辞書にない固有名詞", s, "", f"辞書にない固有名詞。OpenJTalk の読み（参考・未確定）：{n['pron'].replace('’', '')}", "低")
    for h in d.get("history", []):
        if h["surface"] in disp and h["surface"] in sp:
            add("再発注意", h["surface"], h["yomi"], f"前に「{h.get('heard', '?')}」と誤読して直した語が、直さないまま読み上げに残っている（{h.get('date', '')}）", "高")
    return found


def write_md(path, rows, title):
    lines = [f"# {title}", "", f"候補 {len(rows)} 件（自動検出。直すかどうかは人が決める）", "",
             "| 行ID | 話者 | 種類 | 問題箇所 | 期待する読み | 検出理由 | 確度 | 音声 |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        who = "ナギ" if r["who"] == "nagi" else "バク"
        lines.append(f"| {r['id']} | {who} | {r['kind']} | {r['where']} | {r['expect']} | {r['reason']} | {r['level']} | {r.get('audio', '')} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--only", help="行IDをカンマ区切りで")
    ap.add_argument("--chapter", help="章ファイル名の頭（例 02_）")
    a = ap.parse_args()
    ep = Path(a.episode)
    d = reading.load_dict()
    terms = reading.terms(d)
    known = {t[0] for t in terms} | {w["surface"] for w in d.get("words", [])}
    rows = []
    for it in all_lines(ep, set(a.only.split(",")) if a.only else None, a.chapter):
        for r in check_line(it, d, terms, known):
            r["audio"] = f"episodes/{ep.name}/voices/{r['id']}.wav"
            rows.append(r)
    order = {"高": 0, "中": 1, "低": 2}
    rows.sort(key=lambda r: (order[r["level"]], r["id"]))
    out = ep / "reading"; out.mkdir(exist_ok=True)
    (out / "precheck.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    write_md(out / "precheck.md", rows, f"読み検査（声を作る前）：{ep.name}")
    kinds = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"候補 {len(rows)} 件", kinds, "→", out / "precheck.md")


if __name__ == "__main__":
    main()
