#!/usr/bin/env python3
"""Fetch exact-model public reference photos for a PRIVATE editing-only prototype.
Image copyright/permissions are NOT obtained by downloading.
Only declared URL candidates; never silently replace with other models.
"""
from __future__ import annotations
import csv, io, json, os, hashlib, time
from pathlib import Path
from urllib.parse import urlparse
import requests
from PIL import Image

OUT = Path("haken_photos")
OUT.mkdir(exist_ok=True)
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; MediaResearch/1.0)", "Accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}
# First successful VERIFIED image is saved. Source item and machine variant are listed explicitly.
ASSETS=[
("A01","1996_CR大工の源さん","https://auctions.c.yimg.jp/images.auctions.yahoo.co.jp/image/dr000/auc0506/users/4afbc9fff3ba62a1fc53ff27ef75a7769d5d120c/i-img1200x1200-1718762288emnrpg7.jpg","Yahoo!オークション・1996年初代、実機全景",[ ]),
("A02","1999_CR海物語3R","https://ppps.jp/topic/manufacturer/img/sanyoaterialimage1.jpg","SANYO機種紹介・初代CR海物語3R",[]),
("A03","2005_CR大海物語","https://pachimaga.com/free/2023/01/26/4aea74a92f58cf459b199d7951390a465180d818.jpg","パチマガスロマガFREE・2005年大海物語",[]),
("A04","2008_CR牙狼XX","https://www.p-world.co.jp/_machine/img/p5364_1.jpg","P-WORLD・2008年CR牙狼XX",[]),
("A05","2014_CR牙狼金色になれXX","https://www.p-world.co.jp/_machine/img/p7438_1.jpg","P-WORLD・2014年CR牙狼金色になれXX",[]),
("A06","2015_CR牙狼魔戒ノ花XX","https://pachima.itembox.cloud/product/002/000000000212/000000000212-01.jpg","パチマ・2015年CR牙狼魔戒ノ花XX",["https://www.p-world.co.jp/_machine/img/p7806_1.jpg"]),
("A08","2017_CRフィーバー戦姫絶唱シンフォギア","https://item-shopping.c.yimg.jp/i/n/nakaiticom_20202","中一商事・初代199ライトミドル",[]),
("A09","2020_P大工の源さん超韋駄天","https://image.nana-press.com/kaiseki/upload/machines/203/20211018171004_machine_image.png","なな徹・2020超韋駄天",[]),
("A10","2021_Pエヴァ未来への咆哮","https://johojima.com/wp-content/uploads/2021/12/fields_20211219-900x600.jpg","情報島・2021年P未来への咆哮",[]),
("A11","2022_Pリゼロ鬼がかり319","https://www.p-world.co.jp/_machine/img/p9537_1.jpg","P-WORLD・2022年鬼がかりver 319",[]),
("A12","2024_eからくりサーカス2魔王","https://www.p-world.co.jp/_machine/img/p10115_1.jpg","P-WORLD・2024年e魔王ver",[]),
("A13","2025_e東京喰種","https://pachima.itembox.cloud/product/012/000000001246/000000001246-05.jpg","パチマ・2025年e東京喰種",[]),
]
entries=[]
for key,name,src,source_note,alts in ASSETS:
    row={"id":key,"machine":name,"source_note":source_note,"source_url":src,"rights":"未確認（検証用のみ、公開前に権利確認）","status":"未取得","file":"","size":"","sha256":""}
    for url in [src]+alts:
        for attempt in range(2):
            try:
                print("try",key,url,attempt,flush=True)
                r=requests.get(url,headers=HEADERS,timeout=(12,30))
                r.raise_for_status()
                if len(r.content)<3000: raise ValueError("too small")
                pil=Image.open(io.BytesIO(r.content))
                pil.load()
                if pil.width<250 or pil.height<250: raise ValueError("too small dimensions")
                imgformat=(pil.format or 'PNG').upper()
                suffix={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp','GIF':'.gif'}.get(imgformat,'.png')
                target=OUT / f"{key}_{name}{suffix}"
                target.write_bytes(r.content)
                row.update({"source_url":url,"status":"取得済み_権利未確認","file":target.name,"size":f"{pil.width}x{pil.height}","sha256":hashlib.sha256(r.content).hexdigest()})
                print("OK",key,target,len(r.content),pil.size,flush=True)
                break
            except Exception as e:
                print("FAIL",key,type(e).__name__,str(e)[:200],flush=True)
                time.sleep(1)
        if row["file"]: break
    entries.append(row)
with open(OUT/"撮影素材_収録一覧.csv","w",encoding="utf-8-sig",newline="") as f:
    w=csv.DictWriter(f,fieldnames=list(entries[0]));w.writeheader();w.writerows(entries)
(OUT/"取得結果.json").write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf-8')
missing=[x["machine"] for x in entries if not x["file"]]
(OUT/"不足素材.txt").write_text("\n".join(missing) if missing else "12機種分すべて写真データ取得済み（使用許諾は別途必要）",encoding="utf-8")
(OUT/"必読_写真の権利について.txt").write_text(
    "これらはウェブで閲覧できる実機画像の編集検証用コピーです。\n"
    "写真それぞれの撮影者、転載、商用、加工許諾は取得していません。\n"
    "YouTube公開版に無条件に使用できるという意味ではありません。\n"
    "公開用では許諾済素材への差し替え、または引用要件の個別検討・必要な出典表示が必要です。\n"
    "機種名の正確性は動画への合成前に再チェックしてください。\n", encoding='utf-8')
print("RESULT",len(entries)-len(missing),"/",len(entries),"missing",missing,flush=True)
