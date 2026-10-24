#!/usr/bin/env python3
"""読み間違いを直す：辞書に読みを足して記録を残し、直した行だけを作り直す依頼を書く

  # 1) 読みを決める（以後どの回でもこの読みで読む。history に記録が残る）
  #    ナギ → AivisSpeech のユーザー辞書（aivis_words）、バク → Irodori に送る前の置き換え（rules・engine=irodori）
  python scripts/reading/fix.py add 出玉 でだま --heard ダシダマ --line eva_history:05_fuyu-039 --cat 用語 --for nagi
  #    1つの行の言い回しだけで読みがずれるもの（「止めろ」→トドメロ など）は、台本に《止めろ|とめろ》と書く（字幕は漢字のまま）
  python scripts/reading/fix.py add 竹屋 タケヤ --confirm          # 要確認の語を人が確かめた（読み上げは変えない）

  # 2) 直す行を選んで、作り直しの依頼を書く（声の設定は今の依頼ファイルのまま。行の指定 only だけ書き換える）
  python scripts/reading/fix.py request episodes/eva_history --ids 05_fuyu-039,02_bousou-069
  python scripts/reading/fix.py request episodes/eva_history --from precheck --level 高
  python scripts/reading/fix.py request episodes/eva_history --from report --level 高 --who nagi
  → voice_ab/aivis_request.json（ナギ）と voice_ab/irodori_request.json（バク）の only を書き換える。push すると CI が作り直す

  #    作り直す前の音声は episodes/<回>/reading/before/ に控える（修正前後の比較用）
  # 3) CI が終わったら、作り直した行だけ差し替えて、その章だけ作り直す
  python scripts/voice_ab/finalize_lines.py voice_ab/aivis_lines episodes/eva_history/voices --ids-from episodes/eva_history --shift -1.5 --only <ナギの行>
  python scripts/voice_ab/finalize_lines.py voice_ab/irodori_lines/eva_baku8 episodes/eva_history/voices --ids-from episodes/eva_history --squeeze --only <バクの行>
  python lab/episode.py episodes/eva_history --reuse      # 変わった章だけ描き直して、全体をつなぎ直す
  python scripts/reading/compare.py episodes/eva_history  # 修正前後の比較（reading/compare.md と聞き比べ用の wav）
"""
import argparse
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
import reading  # noqa: E402

REQ = {"nagi": ROOT / "voice_ab" / "aivis_request.json", "baku": ROOT / "voice_ab" / "irodori_request.json"}


def to_kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def cmd_add(a):
    """直す読みを辞書に入れる。
    ナギ（AivisSpeech）→ aivis_words（ユーザー辞書。字幕も読み上げ用テキストも漢字のまま、エンジンが読みとアクセントを使う）
    バク（Irodori）     → rules に engine=irodori で（送る直前にこの語だけ読みに置き換える）"""
    d = reading.load_dict()
    today = datetime.date.today().isoformat()
    t = next((t for t in d.setdefault("terms", []) if t["surface"] == a.surface), None)
    if t is None:
        t = {"surface": a.surface, "yomi": a.yomi, "cat": a.cat or "未分類"}
        d["terms"].append(t)
    t.update({"yomi": a.yomi, "status": "ok"})
    if a.cat:
        t["cat"] = a.cat
    done = []
    if not a.confirm and a.who in ("nagi", "both"):
        pron = to_kata(a.yomi)
        acc = a.accent if a.accent is not None else reading.accent_guess(pron)
        w = next((w for w in d.setdefault("aivis_words", []) if w["surface"] == a.surface), None)
        if w is None:
            w = {"surface": a.surface}
            d["aivis_words"].append(w)
        w.update({"pronunciation": pron, "accent_type": acc, "word_type": a.pos, "priority": 8, "status": "ok",
                  "accent_status": "確認済み" if a.accent is not None else "推定"})
        done.append(f"ナギ：ユーザー辞書 {a.surface} → {pron}（アクセント {acc}{'' if a.accent is not None else '・推定'}）")
    if not a.confirm and a.who in ("baku", "both"):
        pat = re.escape(a.surface)
        r = next((r for r in d["rules"] if r["re"] == pat and r.get("engine") == "irodori"), None)
        if r:
            r["to"] = a.yomi
        else:     # 細かい語ほど先に当てたいので、先頭近く（ほかの汎用ルールより前）に入れる
            d["rules"].insert(0, {"re": pat, "to": a.yomi, "why": a.note or "誤読の修正", "status": "ok", "engine": "irodori"})
        done.append(f"バク：送る前に {a.surface} → {a.yomi}")
    d.setdefault("history", []).append({"date": today, "surface": a.surface, "yomi": a.yomi, "heard": a.heard or "",
                                        "line": a.line or "", "for": a.who, "action": "確認のみ" if a.confirm else " / ".join(done),
                                        "note": a.note or ""})
    reading.save_dict(d)
    print("\n".join(done) if done else f"確認済みにした：{a.surface} → {a.yomi}")


def ids_from(ep, src, level, who):
    order = {"高": 0, "中": 1, "低": 2}
    rows = json.loads((ep / "reading" / f"{src}.json").read_text(encoding="utf-8"))
    return sorted({r["id"] for r in rows if order[r["level"]] <= order[level] and (not who or r["who"] == who)})


def backup(ep, ids, who_of):
    """作り直す前の音声と、そのときの読み上げ用テキストを reading/before/ に控える（compare.py で前後を比べる）"""
    import shutil
    bdir = ep / "reading" / "before"; bdir.mkdir(parents=True, exist_ok=True)
    info_f = bdir / "info.json"
    info = json.loads(info_f.read_text(encoding="utf-8")) if info_f.exists() else {}
    sys.path.insert(0, str(ROOT / "scripts" / "reading"))
    from precheck import all_lines
    d = reading.load_dict()
    lines = {it["id"]: it for it in all_lines(ep)}
    for i in ids:
        src = ep / "voices" / f"{i}.wav"
        if src.exists() and i not in info:          # いちばん最初の版を残す（何度作り直しても「修正前」は同じ）
            shutil.copy(src, bdir / f"{i}.wav")
            eng = reading.ENGINE[who_of[i]]
            info[i] = {"who": who_of[i], "speech": reading.speech_text(lines[i]["say"], d, eng)}
    info_f.write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")


def cmd_request(a):
    sys.path.insert(0, str(ROOT / "scripts" / "reading"))
    from precheck import all_lines
    ep = Path(a.episode)
    want = set(a.ids.split(",")) if a.ids else set(ids_from(ep, a.src, a.level, a.who))
    who_of = {it["id"]: it["who"] for it in all_lines(ep)}
    unknown = want - set(who_of)
    if unknown:
        raise SystemExit(f"台本にない行ID：{sorted(unknown)}")
    backup(ep, sorted(want), who_of)
    for who, path in REQ.items():
        ids = sorted(i for i in want if who_of[i] == who)
        if not ids:
            continue
        rq = json.loads(path.read_text(encoding="utf-8"))
        rq["episode"] = f"episodes/{ep.name}"
        rq["only"] = ids
        path.write_text(json.dumps(rq, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{'ナギ' if who == 'nagi' else 'バク'} {len(ids)} 行 → {path.relative_to(ROOT)}：{','.join(ids)}")
    log = ep / "reading" / "fixes.json"
    hist = json.loads(log.read_text(encoding="utf-8")) if log.exists() else []
    hist.append({"date": datetime.date.today().isoformat(), "ids": sorted(want), "from": a.ids and "手で指定" or f"{a.src}（{a.level}以上）"})
    log.parent.mkdir(exist_ok=True)
    log.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("add", help="読みを決めて辞書に入れる")
    p.add_argument("surface"); p.add_argument("yomi")
    p.add_argument("--heard", help="実際に聞こえた（間違った）読み")
    p.add_argument("--line", help="見つけた行（回:行ID）")
    p.add_argument("--cat", help="用語・機種・メーカー・人名 など")
    p.add_argument("--note")
    p.add_argument("--confirm", action="store_true", help="要確認の語を確定するだけ（読み上げは変えない）")
    p.add_argument("--for", dest="who", choices=["nagi", "baku", "both"], default="both", help="どちらの声で直すか")
    p.add_argument("--accent", type=int, help="ナギのアクセント核の位置（0=平板）。省くと OpenJTalk の推定で、accent_status=推定")
    p.add_argument("--pos", default="COMMON_NOUN", choices=["COMMON_NOUN", "PROPER_NOUN", "VERB", "ADJECTIVE", "SUFFIX"])
    p.set_defaults(fn=cmd_add)
    p = sub.add_parser("request", help="直す行だけ作り直す依頼を書く")
    p.add_argument("episode")
    p.add_argument("--ids", help="行IDをカンマ区切りで")
    p.add_argument("--from", dest="src", choices=["precheck", "report"], default="report")
    p.add_argument("--level", choices=["高", "中", "低"], default="高")
    p.add_argument("--who", choices=["nagi", "baku"])
    p.set_defaults(fn=cmd_request)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
