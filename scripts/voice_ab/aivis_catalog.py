#!/usr/bin/env python3
"""AivisHub のモデル一覧を取ってくる（GitHub Actions 用。この作業環境からは AivisHub に届かない）

  python scripts/voice_ab/aivis_catalog.py voice_ab/aivis_catalog   # .json（生データ）と .md（一覧表）を書き出す

- 人気順に最大 300 件。ライセンスが商用OK（ACML / CC0）のものに印を付ける（ACML-NC は非商用）
- API の形式が分からない部分は生データ（.json）をそのまま残す
"""
import json, sys, urllib.parse, urllib.request

API = "https://api.aivis-project.com/v1/aivm-models/search"


def get(params):
    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=60) as r:
        return json.loads(r.read())


def main():
    out = sys.argv[1]
    models, page = [], 1
    while len(models) < 300:
        d = get({"sort": "download", "page": page, "limit": 30})
        items = d.get("aivm_models") or d.get("models") or d.get("items") or []
        if not items:
            if page == 1:
                print(json.dumps(d, ensure_ascii=False)[:2000])
            break
        models += items
        total = d.get("total") or d.get("total_count")
        if total and len(models) >= total:
            break
        page += 1
    json.dump(models, open(out + ".json", "w"), ensure_ascii=False, indent=1)
    rows = ["| 商用 | 名前 | ライセンス | 声 | 話者／スタイル | DL | uuid |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for m in models:
        lic = str(m.get("license_type") or m.get("license") or "")
        ok = "○" if lic in ("ACML", "CC0") else ("✕" if "NC" in lic else "?")
        spk = "; ".join(f"{s.get('name')}（{','.join(st.get('name', '') for st in s.get('styles', []))}）" for s in m.get("speakers", []))
        timbre = m.get("voice_timbre") or m.get("category") or ""
        rows.append(f"| {ok} | {m.get('name')} | {lic} | {timbre} | {spk[:120]} | {m.get('total_download_count', '')} | {m.get('aivm_model_uuid', '')} |")
    open(out + ".md", "w").write("# AivisHub モデル一覧（人気順）\n\n" + "\n".join(rows) + "\n")
    print(len(models), "件")


if __name__ == "__main__":
    main()
