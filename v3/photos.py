"""写真管理：機種・ホール・資料の写真を、権利情報と一緒に管理して自動で読み込む

置き場所（リポジトリ直下）
  assets/
    machines/<機種キー>/          例 hokuto_musou/
      metadata.json               権利・出典・使い方（下の形式）
      front.png                   実機全体の正面（背景を抜いた透過PNGが理想。白背景の写真なら自動で抜く）
      detail.jpg                  盤面のアップ
      cabinet.jpg                 筐体の特徴が分かる写真
      official.jpg                公式資料（チラシ・プレスリリースなど）
    halls/<キー>/                 例 max_era/
      metadata.json
      main.jpg                    当時のホール風景

metadata.json の形式
  {
    "name": "CR真・北斗無双",
    "photos": {
      "front": {
        "file": "front.png",
        "what": "実機全体の正面",
        "source_url": "https://...",          出典URL
        "rights_holder": "株式会社サミー ほか",  権利者
        "license": "permission",               permission（個別に許諾）/ cc0 / cc-by / cc-by-sa / own（自分で撮影・作成）/ ai（AI生成のイメージ）
        "permission": "granted",               granted（許諾済み）/ pending（確認中）/ none
        "terms": "YouTube動画での使用を許諾。改変可…",   利用条件（許諾のメールや規約の要点）
        "scope": "YouTube（収益化含む）",       使用可能な範囲
        "credit": "画像提供：株式会社サミー",   画面に出すクレジット
        "credit_required": true,
        "cutout": true,                        背景を抜いて使う（実機の正面など）
        "focus": [0.5, 0.42]                   トリミングで残す中心（0〜1）。切れてはいけない被写体の位置
      }
    }
  }

使えるかどうか（usable）
  ファイルがあり、license が cc0 / cc-by / cc-by-sa / own / ai か、permission が granted のもの。
  プレビューでは「確認中」の写真も画面に「許諾確認中・公開不可」と出して表示する。本番（--final）では使わない。
  無い・使えない写真は仮素材（「仮素材」と明記）に置き換え、不足一覧（MISSING_PHOTOS.md）に出す。
"""
import json
from pathlib import Path

from PIL import Image, ImageOps

from .style import ROOT
from .media import cutout, concept_machine, concept_photo

LIB = ROOT / "assets"
OPEN_LICENSES = {"cc0", "cc-by", "cc-by-sa", "own", "ai", "public-domain"}
ROLES = {
    "front": "実機全体の正面写真",
    "detail": "盤面のアップ写真",
    "cabinet": "筐体の特徴が分かる写真",
    "official": "機種紹介に使える公式資料",
    "main": "当時のホール風景",
}


class Photo:
    def __init__(self, kind, key, role, img, meta, placeholder, note, warn=None):
        self.kind, self.key, self.role = kind, key, role
        self.img, self.meta = img, meta
        self.placeholder = placeholder          # True＝仮素材（実物ではない）
        self.note = note                        # 画面右上に出す注記
        self.credit = "" if placeholder else (meta.get("credit", "") if meta.get("credit_required", True) else "")
        self.focus = tuple(meta.get("focus", (0.5, 0.45)))
        self.warn = warn

    @property
    def aspect(self):
        return self.img.width / self.img.height


class PhotoLib:
    def __init__(self, final=False, root=LIB):
        self.final, self.root = final, Path(root)
        self.cache, self.report, self.missing = {}, [], []

    def meta(self, kind, key):
        p = self.root / kind / key / "metadata.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"photos": {}}

    def get(self, kind, key, role):
        ck = (kind, key, role)
        if ck in self.cache:
            return self.cache[ck]
        md = self.meta(kind, key)
        info = md.get("photos", {}).get(role, {})
        f = info.get("file")
        path = (self.root / kind / key / f).resolve() if f else None
        exists = bool(path and path.exists())
        lic, perm = info.get("license", "none"), info.get("permission", "none")
        cleared = lic in OPEN_LICENSES or perm == "granted"
        show = exists and (cleared or not self.final)
        rel = f"assets/{kind}/{key}/{f}" if f else f"assets/{kind}/{key}/{role}.png"
        if show:
            img = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
            if info.get("cutout"):
                img = cutout(img)
            if lic == "ai":
                note = "イメージ（AI生成イラスト・実際の写真ではありません）"
            elif cleared:
                note = ""
            else:
                note = "許諾確認中の写真（公開版では使いません）"
            warn = f"解像度が低め（{img.width}×{img.height}）" if max(img.size) < 900 else None
            ph = Photo(kind, key, role, img, info, False, note, warn)
            self.report.append({"key": f"{kind}/{key}/{role}", "what": info.get("what", ROLES.get(role, role)),
                                "state": "使用" if cleared else "表示のみ（許諾確認中）", "file": rel,
                                "source": info.get("source_url", ""), "holder": info.get("rights_holder", ""),
                                "license": lic, "permission": perm, "terms": info.get("terms", ""),
                                "scope": info.get("scope", ""), "credit": info.get("credit", ""), "warn": warn})
        else:
            img = concept_machine() if role in ("front", "cabinet") else concept_photo()
            reason = "ファイルなし" if not exists else "許諾が未確認"
            ph = Photo(kind, key, role, img, info, True, "仮素材（実機写真ではありません）")
            self.missing.append({"key": f"{kind}/{key}/{role}", "what": info.get("what", ROLES.get(role, role)),
                                 "file": rel, "reason": reason, "how": info.get("how", md.get("how", "")),
                                 "candidates": info.get("candidates", md.get("candidates", []))})
        self.cache[ck] = ph
        return ph

    def machine(self, key, role="front"):
        return self.get("machines", key, role)

    def hall(self, key, role="main"):
        return self.get("halls", key, role)

    def write_missing(self, ep_dir):
        rows = ["# 写真の不足一覧（自動生成）", ""]
        if not self.missing:
            rows.append("不足はありません。")
        else:
            rows += ["| 写真 | 内容 | 置く場所 | 理由 | 入手方法 |", "| --- | --- | --- | --- | --- |"]
            seen = set()
            for m in self.missing:
                if m["key"] in seen:
                    continue
                seen.add(m["key"])
                rows.append(f"| {m['key']} | {m['what']} | `{m['file']}` | {m['reason']} | {m['how']} |")
        rows += ["", "## 使用中の写真", ""]
        if self.report:
            rows += ["| 写真 | 状態 | 出典 | 権利者 | 利用条件 | クレジット |", "| --- | --- | --- | --- | --- | --- |"]
            for r in self.report:
                rows.append(f"| {r['key']} | {r['state']}{('・' + r['warn']) if r['warn'] else ''} | {r['source'] or '-'} | "
                            f"{r['holder'] or '-'} | {r['license']} / {r['permission']}：{r['terms'] or '-'} | {r['credit'] or '-'} |")
        else:
            rows.append("なし")
        (Path(ep_dir) / "MISSING_PHOTOS.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
        return rows


# ---------------------------------------------------------------- 縦横比に合わせたトリミング
def contain(img, w, h, max_up=1.6):
    """枠に収める（切らない・引き伸ばさない）。拡大は max_up 倍まで"""
    s = min(w / img.width, h / img.height, max_up)
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)


def cover(img, w, h, focus=(0.5, 0.45)):
    """枠を埋める。はみ出す分は focus（被写体の位置）を中心に残して切る。縦横比は変えない"""
    s = max(w / img.width, h / img.height)
    big = img.resize((max(w, int(img.width * s + 0.5)), max(h, int(img.height * s + 0.5))), Image.LANCZOS)
    cx, cy = focus[0] * big.width, focus[1] * big.height
    x0 = int(min(max(0, cx - w / 2), big.width - w))
    y0 = int(min(max(0, cy - h / 2), big.height - h))
    return big.crop((x0, y0, x0 + w, y0 + h))
