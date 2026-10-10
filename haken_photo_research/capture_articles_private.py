#!/usr/bin/env python3
"""Screenshots of PUBLIC source article headers for private fact-checking ONLY.
Do not include these screenshots in a publicly distributed video without
specific legal basis/permissions. They are not publication assets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
import json
out=Path("haken_article_evidence");out.mkdir(exist_ok=True)
items=[
("S03_2005_sanyo_company","https://www.sanyobussan.co.jp/pdf/sanyogroup_comanyprofile2025.pdf"),
("S04_2008_garo_archive","https://www.sansei-rd.com/p_garo_archive/archive/garo.html"),
("S07_2015_award","https://www.goraku-sangyo.com/%E3%83%8B%E3%83%95%E3%83%86%E3%82%A3%E3%80%80%E3%80%8C%E3%83%91%E3%83%81%E3%83%B3%E3%82%B3%E3%83%BB%E3%83%91%E3%83%81%E3%82%B9%E3%83%ADaward-2015%E3%80%8D%E7%99%BA%E8%A1%A8/"),
("S08_2016_sammy","https://www.sammy.co.jp/japanese/product/pachinko/2015/cr_shin_hokuto_muso/spec/"),
("S09_2018_65rule","https://news.p-world.co.jp/articles/10538/greenbelt"),
("S11_2020_sanyo","https://www.sanyobussan.co.jp/jobs/special02/"),
("S13_2022_daito","https://www.daitogiken.com/products/pachinko/?search=&year=6"),
("S15_2024_LTreport","https://web-greenbelt.jp/post-83761/"),
("S16_2024_karakuri","https://www.sankyo-fever.jp/collection/968/"),
("S17_2025_ghoul","https://www.sankyo-fever.jp/collection/980/"),
("S18_2026_ranking","https://www.pidea.jp/machine-ranking"),
]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
    context=browser.new_context(viewport={"width":1365,"height":900},device_scale_factor=1,ignore_https_errors=True,locale="ja-JP")
    for name,url in items:
        rec={"id":name,"url":url,"result":"failed"}
        page=context.new_page()
        try:
            page.goto(url,wait_until="domcontentloaded",timeout=23000)
            page.wait_for_timeout(1000)
            # Search engines or access-denied are not archived as proof.
            title=page.title(); content=(page.locator("body").inner_text(timeout=4000)[:250] if "pdf" not in url else "")
            if any(x in title.lower() for x in ["access denied","403 forbidden","not found"]) or any(x in content.lower() for x in ["access denied","not found","403 forbidden"]):
                raise ValueError(f"error page {title}")
            dest=out/(name+".png")
            page.screenshot(path=str(dest),full_page=False,animations="disabled",timeout=12000)
            img=Image.open(dest).convert("RGB")
            d=ImageDraw.Draw(img)
            d.rectangle([0,0,img.width,54],fill="#a01014")
            try:font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",19)
            except:font=ImageFont.load_default()
            d.text((20,12),"PRIVATE REFERENCE ONLY - PUBLIC VIDEO USE NOT CLEARED",font=font,fill="white")
            img.save(dest)
            rec.update({"result":"captured","title":title,"file":dest.name})
            print("OK",name,title,flush=True)
        except Exception as exc:
            print("ERROR",name,type(exc).__name__,str(exc)[:180],flush=True)
            rec["error"]=str(exc)[:180]
        finally:
            page.close()
        results.append(rec)
    context.close();browser.close()
(out/"取得記録.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
(out/"README_PRIVATE_ONLY.txt").write_text(
    "These are partial images of external webpages for fact checking in a private editorial workflow.\n"
    "They are NOT granted for public reuse. Their inclusion does NOT confer permission to reproduce them in YouTube videos.\n"
    "For final videos use independently designed sourced graphics, or obtain permission / assess quotation conditions.\n"
,encoding="utf-8")
print("TOTAL",len([r for r in results if r['result']=='captured']),"of",len(results),flush=True)
