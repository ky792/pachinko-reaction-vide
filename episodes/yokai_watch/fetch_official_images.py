#!/usr/bin/env python3
"""妖怪ウォッチ回：SANKYO公式の機種ページから画像を取り込む（GitHub Actions 用）。

この作業環境からは SANKYO のサイトに届かないので CI で取る。
公式ページの og:image と <img> をすべて候補として images/_official/ に保存し、出典を SOURCES.csv に残す。
どれを動画に使うか（yokai.jpg にするか）は、候補を見てから決める。
使用の判断はユーザー指示（2026-10-24「公式の画像使って」）。rights 欄は「公式サイト_ユーザー判断で使用」。
"""
import csv, io, re
from pathlib import Path
from urllib.parse import urljoin
import requests
from PIL import Image

PAGES = ["https://www.sankyo-fever.jp/products/machine_list/ppj/"]
OUT = Path("episodes/yokai_watch/images/_official"); OUT.mkdir(parents=True, exist_ok=True)
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (compatible; NagibakuMaterialResearch/1.0)"

rows, log, seen = [], [], set()
for page in PAGES:
    try:
        r = s.get(page, timeout=(12, 30)); r.raise_for_status(); r.encoding = r.apparent_encoding or "utf-8"
    except Exception as e:
        log.append(f"PAGE NG {page} {e}"); continue
    html = r.text
    (OUT / "page.html").write_text(html, encoding="utf-8")
    urls = re.findall(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html)
    urls += re.findall(r'<img[^>]+(?:data-src|src)=["\']([^"\']+)', html)
    urls += re.findall(r'url\(["\']?([^"\')]+\.(?:png|jpe?g|webp))', html)
    for u in urls:
        u = urljoin(page, u.strip())
        if u in seen or not re.search(r"\.(png|jpe?g|webp)(\?|$)", u, re.I):
            continue
        seen.add(u)
        try:
            ir = s.get(u, timeout=(12, 30), headers={"Referer": page}); ir.raise_for_status()
            im = Image.open(io.BytesIO(ir.content)); im.load()
        except Exception as e:
            log.append(f"IMG NG {u} {e}"); continue
        if im.width < 300 and im.height < 300:
            log.append(f"skip small {im.size} {u}"); continue
        name = f"{len(rows):02d}_{Path(u.split('?')[0]).stem[:40]}.png"
        im.convert("RGBA").save(OUT / name)
        rows.append([name, page, u, f"{im.width}x{im.height}", "公式サイト_ユーザー判断で使用"])
        log.append(f"OK {name} {im.size} {u}")

with (OUT / "SOURCES.csv").open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f); w.writerow(["filename", "source_page", "image_url", "size", "rights"]); w.writerows(rows)
(OUT / "LOG.txt").write_text("\n".join(log) or "なし", encoding="utf-8")
print("\n".join(log))
