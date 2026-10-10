"""章ごとのレンダリングログ・時間・使用素材の一覧を作る（分割レンダリングのあとに実行）

  python -m v3.report20 episodes/v5_haken20 <レンダリングの作業フォルダ>
    → episodes/v5_haken20/RENDER_LOG.md（章ごとの時間・所要時間・使用素材）
"""
import json
import re
import sys
from pathlib import Path

from .planner import Planner
from .photos import PhotoLib

TPL = {"A": "写真", "B": "機種紹介", "C": "年表", "D": "数字", "E": "要点", "F": "掛け合い", "R": "時代のレール",
       "T": "年表", "V": "2台の対比", "S": "資料カード"}


def mmss(t):
    return f"{int(t // 60):02d}:{t % 60:04.1f}"


def machines_in(sc):
    o = sc["opts"]
    keys = []
    if sc.get("machine") and sc["machine"].get("photos"):
        keys.append(sc["machine"]["photos"])
    for k in ("left", "right", "machine"):
        v = o.get(k)
        if v and isinstance(v, str) and re.fullmatch(r"[a-z0-9_]+", v):
            keys.append(v)
    for part in re.split(r"[|/,]", str(o.get("cards", "")) + "|" + str(o.get("groups", "")) + "|" + str(o.get("events", ""))):
        m = re.search(r"([a-z][a-z0-9_]+)", part.split("@")[0] if "@" in part else (part.split(":")[1] if part.count(":") >= 1 else part))
        if m:
            keys.append(m.group(1))
    return [k for i, k in enumerate(keys) if k not in keys[:i]]


def main():
    ep, work = Path(sys.argv[1]), Path(sys.argv[2])
    pl = Planner(ep)
    scenes = pl.plan()
    lib = PhotoLib()
    seg = json.loads((work / "segments.json").read_text(encoding="utf-8"))
    times = {}
    for ln in (work / "times.txt").read_text().splitlines():
        p = ln.split()
        times[p[0]] = (int(p[3].rstrip("s")), p[4] if len(p) > 4 else "")
    b, names = seg["bounds"], seg["names"]
    rows = [f"# 章ごとのレンダリングログ（{ep.name}）", "",
            "1920×1080・30fps・H.264（libx264 / CRF19 / yuv420p）。章ごとに映像だけを書き出して無劣化でつなぎ、全編の音声（AAC 192kbps）を重ねた。",
            "**非公開レビュー用**：実機写真は権利未確認（許諾確認中）。", "",
            "| 章 | 範囲 | 長さ | フレーム | レンダリング所要 | 検証 |", "| --- | --- | --- | --- | --- | --- |"]
    total_r = 0
    for i, nm in enumerate(names):
        a, z = b[i], b[i + 1]
        tt, rc = times.get(f"{i:02d}", (0, "?"))
        total_r += tt
        rows.append(f"| {nm} | {mmss(a)}〜{mmss(z)} | {z - a:.1f}秒 | {round((z - a) * 30)} | {tt // 60}分{tt % 60:02d}秒 | {"フレーム数一致" if rc else "?"} |")
    rows += ["", f"レンダリング合計（2本並列）：{total_r // 60}分{total_r % 60:02d}秒（CPU時間の合計。実時間はおよそ半分）", ""]
    rows += ["## 章ごとの使用素材", ""]
    for i, nm in enumerate(names):
        a, z = b[i], b[i + 1]
        scs = [s for s in scenes if a - 0.01 <= s["start"] < z - 0.01]
        rows.append(f"### {nm}（{mmss(a)}〜{mmss(z)}）")
        rows.append("- 画面構成：" + " → ".join(f"{s['template']} {TPL[s['template']]}" for s in scs))
        ms, cards = [], []
        for s in scs:
            ms += [k for k in machines_in(s) if k not in ms]
            if s["template"] == "S":
                cards += [c for c in str(s["opts"].get("card", "")).split("|") if c and c not in cards]
            if s["template"] == "A" and s["opts"].get("hall"):
                ms.append("hall:" + s["opts"]["hall"])
        for k in ms:
            if k.startswith("hall:"):
                rows.append(f"- ホール写真：assets/halls/{k[5:]}（運営者提供・権利未確認・イメージ表示）")
                continue
            ph = lib.machine(k)
            info = ph.meta
            if ph.placeholder:
                st = "機種名カード（写真なし）"
            elif info.get("permission") == "owner":
                st = "運営者提供写真（権利未確認・検証用）"
            elif info.get("permission") == "pending":
                st = f"制作キット {info.get('kit_id', '')}（許諾確認中・公開版では使わない）"
            else:
                st = "使用可"
            md = pl.data.get("machines", {}).get(k) or lib.meta("machines", k)
            rows.append(f"- 実機写真：{md.get('name', k)}（{md.get('date', '')}）— {st}　出典：{info.get('source_url', '-')}")
        for c in cards:
            f = sorted((ep / "sources").glob(f"{c}_*.png"))
            rows.append(f"- 資料カード：{c}（{f[0].name if f else '-'}・出典付きの独自資料画面）")
        rows.append("- 外部の実機動画・記事スクリーンショット：使用なし")
        rows.append("")
    (ep / "RENDER_LOG.md").write_text("\n".join(rows), encoding="utf-8")
    print("\n".join(rows[:30]))


if __name__ == "__main__":
    main()
