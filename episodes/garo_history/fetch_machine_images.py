#!/usr/bin/env python3
"""牙狼歴史回の実機画像を取り込む（GitHub Actions 用）。

画像は第三者の著作物。ダウンロードしても公開・再配布の許諾にはならない（SOURCES.csv の rights は「未確認_要確認」）。
別機種の画像で代用しない。メーカー公式アーカイブ（パチンコ牙狼アーカイブ）を優先し、無い機種だけ P-WORLD を使う。
"""
import csv, io
from pathlib import Path
import requests
from PIL import Image

OUT = Path("episodes/garo_history/images"); OUT.mkdir(parents=True, exist_ok=True)
A = "https://www.sansei-rd.com/p_garo_archive"
ITEMS = [  # (保存名, 機種名, 画像URL, 出典ページ)
    ("garo_xx.png", "CR牙狼XX", f"{A}/images/archive/machine/main01.png", f"{A}/archive/garo.html"),
    ("garo_red.png", "CR牙狼〜RED REQUIEM〜", f"{A}/images/archive/machine/main02.png", f"{A}/archive/garo_rr.html"),
    ("garo_senki.png", "CR牙狼魔戒閃騎鋼", f"{A}/images/archive/machine/main03.png", f"{A}/archive/garo_hagane.html"),
    ("garo_final.png", "CR牙狼FINAL", f"{A}/images/archive/machine/main04.png", f"{A}/archive/garo_final.html"),
    ("garo_konjiki.png", "CR牙狼金色になれ", f"{A}/images/archive/machine/main05.png", f"{A}/archive/garo_konjiki.html"),
    ("garo_hana.png", "CR牙狼魔戒ノ花", f"{A}/images/archive/machine/main06.png", f"{A}/archive/garo_makainohana.html"),
    ("garo_yami.jpg", "CR牙狼闇を照らす者XX", "https://idn.p-world.co.jp/machines/8120/image/thumb_1.jpg", "https://www.p-world.co.jp/machine/database/8120"),
    ("garo_sho.png", "CR牙狼GOLDSTORM翔", f"{A}/images/archive/machine/main07.png", f"{A}/archive/garo_goldstorm.html"),
    ("garo_koga.png", "P牙狼冴島鋼牙", f"{A}/images/archive/machine/main08.png", f"{A}/archive/p_garo_saejimakouga.html"),
    ("garo_shin.png", "P真・牙狼", f"{A}/images/archive/machine/spinoff13.png", f"{A}/archive/p_shingaro.html"),
    ("garo_gekko.png", "P牙狼月虹ノ旅人", f"{A}/images/archive/machine/main09.png", f"{A}/archive/p_garo_gt.html"),
    ("garo_gi.png", "P牙狼GOLD IMPACT", f"{A}/images/archive/machine/main10.png", f"{A}/archive/p_garo_gi.html"),
    ("garo11.png", "P牙狼11〜冴島大河〜", f"{A}/images/archive/machine/main11.png", f"{A}/archive/p_garo11_st.html"),
    ("garo_3000.png", "e牙狼 神速神撃3000LT", f"{A}/images/archive/machine/spinoff17.png", f"{A}/archive/e_garo_ss3000lt.html"),
    ("garo12.png", "e牙狼12 黄金騎士極限", f"{A}/images/archive/machine/main12.png", f"{A}/archive/p_garo12_ok.html"),
    ("garo11_burst.png", "e牙狼11〜冴島大河〜魔戒BURST Ver.", f"{A}/images/archive/machine/spinoff18.png", f"{A}/archive/e_garo11_mb.html"),
]
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (compatible; NagibakuMaterialResearch/1.0)"
rows, missing = [], []
for name, machine, url, page in ITEMS:
    try:
        r = s.get(url, timeout=(12, 30), headers={"Referer": page}); r.raise_for_status()
        im = Image.open(io.BytesIO(r.content)); im.load()
        if name.endswith(".png"):
            im.convert("RGBA").save(OUT / name)
        else:
            im.convert("RGB").save(OUT / name, quality=95)
        rows.append([name, machine, page, url, f"downloaded_{im.width}x{im.height}", "未確認_要確認"]); print("OK", name, im.size)
    except Exception as e:
        missing.append(f"{name}\t{machine}\t{e}"); print("NG", name, e)
with (OUT / "SOURCES.csv").open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f); w.writerow(["filename", "machine", "source_page", "image_url", "status", "rights"]); w.writerows(rows)
(OUT / "MISSING.txt").write_text("\n".join(missing) or "なし", encoding="utf-8")
