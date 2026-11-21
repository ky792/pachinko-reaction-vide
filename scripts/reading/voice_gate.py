#!/usr/bin/env python3
"""書き出し前の関門：台本にない声が混ざっていないかを全行で確かめ、通った音声だけを「検査済み」にする

  python scripts/reading/voice_gate.py episodes/kyu001v2
  → episodes/<回>/reading/gate.json（行ごとの sha1・合否）・gate.md。1行でも落ちたら終了コード1

落とす条件（asr_check の文字起こし asr.json を使う。声が変わっていたら asr_check を先に回すこと）
- 台本の終わりより後ろに、かなで1音以上の声が聞こえる（＝勝手に足された声）
- 台本の最初の音より前に、声（「んー」など）が聞こえる
- 台本との一致（かな）が 0.75 未満（台詞が抜けた・別のことを言っている）。文字起こしが台本の字面と同じなら通す
- 文字起こしが音声と合っていない（sha1 が違う＝声を作り直したのに検査していない）
耳で聞いて問題ないと確かめた行は reading/gate_override.json に {行ID: "理由"} で書くと通す（sha1 も一緒に記録され、声を作り直すと無効になる）
"""
import hashlib
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading  # noqa: E402
from precheck import all_lines  # noqa: E402
from trim_tail import expected_kana  # noqa: E402

MIN_RATIO = 0.75


def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()


def main():
    ep = Path(sys.argv[1])
    ep = (ROOT / ep).resolve() if not ep.is_absolute() else ep
    d = reading.load_dict()
    terms = [t for t in reading.terms(d) if t[3] == "ok"]
    asr = json.loads((ep / "reading" / "asr.json").read_text(encoding="utf-8"))
    ovp = ep / "reading" / "gate_override.json"
    override = json.loads(ovp.read_text(encoding="utf-8")) if ovp.exists() else {}
    lines, bad = {}, []
    for it in all_lines(ep):
        wp = ep / "voices" / f"{it['id']}.wav"
        if not wp.exists():
            lines[it["id"]] = {"ok": False, "why": "音声がない"}
            bad.append(it["id"])
            continue
        h = sha1(wp)
        a = asr.get(it["id"], {})
        why = []
        if a.get("sha1") != h:
            why.append("文字起こしがこの音声のものではない（asr_check を回す）")
        else:
            exp = expected_kana(it, d, terms)
            reading.use_engine(None, d)
            got = reading.canon(a.get("text", ""), d, terms) if a.get("text") else ""
            sm = SequenceMatcher(None, exp, got, autojunk=False)
            blocks = [b for b in sm.get_matching_blocks() if b.size]
            if blocks:
                last, first = blocks[-1], blocks[0]
                tail = got[last.b + last.size:] if last.a + last.size >= len(exp) - 2 else ""
                head = got[:first.b] if first.a == 0 else ""
                if len(tail) >= 1:
                    why.append(f"台本の後ろに「{tail}」が聞こえる")
                # 終わりのあたり（台本の後ろ4割）で、台本より声が2音以上多い（「つまらんねん」→「つまらんないなぁね」）
                more = sum(max(0, (j2 - j1) - (i2 - i1)) for tag, i1, i2, j1, j2 in sm.get_opcodes()
                           if tag in ("insert", "replace") and i1 >= len(exp) * 0.6)
                if more >= 2 and not tail:
                    why.append(f"台本の終わりのあたりに余分な声（+{more}音）：{a.get('text', '')}")
                if len(head) >= 1:
                    why.append(f"台本の前に「{head}」が聞こえる")
            same = re.sub(r"[、。？！!?…,. 「」ー]", "", a.get("text", "")) == re.sub(r"[、。？！!?…,. 「」ー]", "", re.sub(r"《([^|》]+)\|[^》]+》", r"\1", it["text"]))
            if sm.ratio() < MIN_RATIO and not same:
                why.append(f"台本との一致が低い（{sm.ratio():.2f}）：{a.get('text', '')}")
        ov = override.get(it["id"])
        if why and ov and (not isinstance(ov, dict) or ov.get("sha1") in (None, h)):
            lines[it["id"]] = {"sha1": h, "ok": True, "why": "；".join(why), "override": ov if isinstance(ov, str) else ov.get("reason")}
            continue
        lines[it["id"]] = {"sha1": h, "ok": not why, "why": "；".join(why), "asr": a.get("text", "")}
        if why:
            bad.append(it["id"])
    out = {"ok": not bad, "failed": bad, "lines": lines}
    (ep / "reading" / "gate.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    md = [f"# 音声の関門：{ep.name}", "", f"{'合格' if not bad else f'不合格 {len(bad)} 行'}（全 {len(lines)} 行）", ""]
    if bad:
        md += ["| 行ID | 理由 | 文字起こし |", "| --- | --- | --- |"]
        md += [f"| {k} | {lines[k]['why']} | {lines[k].get('asr', '')} |" for k in bad]
    (ep / "reading" / "gate.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    sys.exit(0 if not bad else 1)


if __name__ == "__main__":
    main()
