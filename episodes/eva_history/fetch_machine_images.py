#!/usr/bin/env python3
"""Fetch model-matched photographs for the EVA history episode.

Images are third-party copyrighted reference material. Downloading does not
grant the right to redistribute or publish them. Check each usage separately.
No substitutes from other models are accepted.
"""
from __future__ import annotations

import csv
import html
import io
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from PIL import Image, ImageOps

OUT = Path("episodes/eva_history/images")
OUT.mkdir(parents=True, exist_ok=True)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; NagibakuMaterialResearch/1.0)", "Accept": "text/html,image/*;q=0.9,*/*;q=0.7"}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
TIMEOUT = (12, 30)

# SANKYO's public manufacturer museum. Each entry is checked against its
# machine-specific collection page (not a generic keyword search).
SANKYO = [
    ("eva_cr1.jpg", 792, "CR新世紀エヴァンゲリオン（初代）"),
    ("eva_second.jpg", 798, "CR新世紀エヴァンゲリオン セカンドインパクト"),
    ("eva_kiseki.jpg", 804, "CR新世紀エヴァンゲリオン 奇跡の価値は"),
    ("eva_shito.jpg", 808, "CR新世紀エヴァンゲリオン 使徒、再び"),
    ("eva_shisha.jpg", 813, "CR新世紀エヴァンゲリオン 最後のシ者"),
    ("eva_fukuin.jpg", 817, "CRヱヴァンゲリヲン 始まりの福音"),
    ("eva7.jpg", 820, "CRヱヴァンゲリヲン7"),
    ("eva8.jpg", 823, "CRヱヴァンゲリヲン8"),
    ("eva9.jpg", 826, "CRヱヴァンゲリヲン9"),
    ("eva10.jpg", 828, "CRヱヴァンゲリヲン10"),
    ("eva_mezame.jpg", 830, "CRヱヴァンゲリヲン いま、目覚めの時"),
    ("eva12.jpg", 831, "CRヱヴァンゲリヲン 2018年モデル"),
    ("eva_choukakusei.jpg", 836, "Pヱヴァンゲリヲン 超覚醒"),
    ("eva_shinsei.jpg", 900, "新世紀エヴァンゲリオン シト、新生"),
    ("eva_sinku.jpg", 909, "P新世紀エヴァンゲリオン 決戦〜真紅〜"),
    ("eva_rei.jpg", 952, "シン・エヴァンゲリオン Type レイ"),
    ("eva_kaworu.jpg", 953, "スマパチ シン・エヴァンゲリオン Type カヲル"),
    ("eva_kioku.jpg", 989, "e 新世紀エヴァンゲリオン はじまりの記憶"),
]
# Two cases require images of their actual variants, not photos of
# Ultra-Awakening and standard purple Hajimari respectively.
SPECIAL = [
    ("eva_choubousou.jpg", "Pヱヴァンゲリヲン 超暴走",
     "https://www.fields.biz/products/ps/images/index/img_pe13_bousou.gif",
     "https://www.fields.biz/products/ps/machine_list2019.html"),
    ("evared.jpg", "P 新世紀エヴァンゲリオン -319 RED-",
     "https://pachimaga.com/free/2026/e_eva319red/e_eva319red_cabinet.webp",
     "https://pachimaga.com/free/mach/maker-p/bisty/e_eva319red.php"),
]
CHASSIS = re.compile(
    r'(?:(?:https?:)?//www\.sankyo-fever\.jp)?'
    r'(/assets/images/collection/pachinko/\d+/pachinko\.\d+\.chassis_1\.(?:png|jpg|jpeg|webp))',
    re.I,
)
EXPECTED = {x[0] for x in SANKYO} | {x[0] for x in SPECIAL} | {"eva15.jpg"}

def fetch(url: str) -> bytes:
    err = None
    for retry in range(3):
        try:
            response = SESSION.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            if len(response.content) < 2000 or len(response.content) > 10_000_000:
                raise ValueError(f"invalid download size: {len(response.content)}")
            return response.content
        except (requests.RequestException, ValueError) as exc:
            err = exc
            time.sleep(1 + retry)
    raise RuntimeError(str(err))

def museum_url(page_id: int) -> str:
    page = f"https://www.sankyo-fever.jp/collection/{page_id}/"
    raw = SESSION.get(page, timeout=TIMEOUT)
    raw.raise_for_status()
    markup = html.unescape(raw.text).replace("\\/", "/")
    paths = CHASSIS.findall(markup)
    if not paths:
        raise ValueError("no model-specific chassis_1 image on manufacturer page")
    return urljoin(page, paths[0])

def save_jpg(filename: str, content: bytes) -> tuple[int, int]:
    im = Image.open(io.BytesIO(content))
    im.load()
    if im.width < 100 or im.height < 100:
        raise ValueError(f"image too small ({im.width}x{im.height})")
    if getattr(im, "is_animated", False):
        im.seek(0)
    im = ImageOps.exif_transpose(im).convert("RGBA")
    white = Image.new("RGBA", im.size, (255, 255, 255, 255))
    white.alpha_composite(im)
    out = white.convert("RGB")
    if max(out.size) > 1800:
        out.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    out.save(OUT / filename, "JPEG", quality=91, optimize=True)
    return out.size

def main() -> None:
    records = []
    for filename, page_id, machine in SANKYO:
        page = f"https://www.sankyo-fever.jp/collection/{page_id}/"
        row = dict(filename=filename, machine=machine, source_page=page,
                   image_url="", status="missing", rights="未確認_要確認")
        try:
            url = museum_url(page_id)
            row["image_url"] = url
            size = save_jpg(filename, fetch(url))
            row["status"] = f"downloaded_{size[0]}x{size[1]}"
            print("OK", filename, url, size, flush=True)
        except Exception as exc:
            row["status"] = f"ERROR: {type(exc).__name__}: {exc}"
            print("MISSING", filename, row["status"], flush=True)
        records.append(row)
    for filename, machine, url, page in SPECIAL:
        row = dict(filename=filename, machine=machine, source_page=page,
                   image_url=url, status="missing", rights="未確認_要確認")
        try:
            size = save_jpg(filename, fetch(url))
            row["status"] = f"downloaded_{size[0]}x{size[1]}"
            print("OK", filename, url, size, flush=True)
        except Exception as exc:
            row["status"] = f"ERROR: {type(exc).__name__}: {exc}"
            print("MISSING", filename, row["status"], flush=True)
        records.append(row)
    original = OUT / "eva15.jpg"
    records.append(dict(filename="eva15.jpg", machine="P新世紀エヴァンゲリオン15 未来への咆哮",
                        source_page="repository:generator/assets/machines/eva15.jpg",
                        image_url="", status="existing" if original.is_file() else "missing",
                        rights="未確認_要確認"))
    with (OUT / "SOURCES.csv").open("w", encoding="utf-8-sig", newline="") as fp:
        wr = csv.DictWriter(fp, fieldnames=["filename", "machine", "source_page", "image_url", "status", "rights"])
        wr.writeheader()
        wr.writerows(records)
    missing = [x["filename"] for x in records if x["status"].startswith(("missing", "ERROR"))]
    (OUT / "MISSING.txt").write_text("\n".join(missing) if missing else "なし\n", encoding="utf-8")
    print(f"RESULT {len(EXPECTED) - len(missing)}/{len(EXPECTED)}; missing:", missing)
    # GitHub action can record partial success so failures are visible in MISSING.txt.

if __name__ == "__main__":
    main()
