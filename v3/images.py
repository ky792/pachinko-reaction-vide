"""台本から明示的に呼び出す画像素材（machine / history / document / gallery）

置き場所：episodes/<回>/images/<ファイル>      （画像はリポジトリに入れない。.gitignore 済み）
定義：    episodes/<回>/data.json の "images"

  "images": {
    "history:hall_2008": {
      "file": "images/hall_2008.jpg",          episodes/<回>/ からの相対パス（assets/… も可）
      "caption": "2008年　ホールの景色",          画面に出す見出し
      "source": "出典：〇〇（2008年）",           画面の隅に出す短い出典
      "crop": [x0, y0, x1, y1],                  元画像のこの範囲だけ使う（ピクセル）
      "display_mode": "full",                    full / side / top / background / zoom / gallery
      "emphasis_target": [x0, y0, x1, y1],       見せたい部分（zoom で寄る先・印をつける場所。crop 前の座標）
      "url": "news.example.jp"                   document をブラウザ風の枠で見せるときのURL表示（任意）
    },
    "gallery:garo_materials": {"caption": "初代牙狼をめぐる資料", "items": ["machine:garo_2008", "history:garo_ad_2008"]}
  }

  machine:<機種キー> は assets/machines/<キー>/ の写真をそのまま使う（data.json に書かなくてよい）。

台本：
  @show history:hall_2008               定義の display_mode で表示（mode=… で上書き）
  @show machine:garo_2008 mode=side      次のシーンから「左に図解・右に画像」
  @clear                                 side / top / background の重ね表示を終える

画像が無いときは「画像を準備中」の仮パネルで続行し、IMAGES_MANIFEST.md と SOURCES.md に不足を書き出す。
"""
import json
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

from .style import ROOT, font

TYPES = ("machine", "history", "document", "gallery")
DEFAULT_MODE = {"machine": "side", "history": "full", "document": "zoom", "gallery": "gallery"}
SCENE_MODES = ("full", "zoom", "gallery")          # 1シーンとして見せる
OVERLAY_MODES = ("side", "top", "background")      # 後に続く図解・会話のシーンに重ねる
TYPE_LABEL = {"machine": "MACHINE", "history": "ARCHIVE", "document": "DOCUMENT", "gallery": "GALLERY"}


class Item:
    def __init__(self, ref, typ, key, img, meta, placeholder, path_text):
        self.ref, self.type, self.key = ref, typ, key
        self.img, self.meta = img, meta
        self.placeholder = placeholder
        self.path_text = path_text
        self.caption = meta.get("caption", "")
        self.source = meta.get("source", "")
        self.emphasis = meta.get("emphasis_target")
        self.url = meta.get("url", "")

    @property
    def items(self):
        return self.meta.get("items", [])


def split_ref(ref):
    typ, _, key = str(ref).partition(":")
    if typ not in TYPES or not key:
        raise ValueError(f"画像の指定は type:key の形で（type は {'/'.join(TYPES)}）: {ref}")
    return typ, key


@lru_cache(maxsize=None)
def placeholder_panel(caption, path_text, typ):
    """画像が無いときの仮パネル（実物の画像と誤解されない見た目）"""
    w, h = 1280, 760
    im = Image.new("RGBA", (w, h), (18, 26, 44, 255))
    d = ImageDraw.Draw(im)
    for k in range(-h, w, 36):                     # 斜線の地紋
        d.line((k, h, k + h, 0), fill=(28, 38, 60, 255), width=10)
    dash = 22
    for x in range(20, w - 20, dash * 2):
        d.line((x, 20, min(x + dash, w - 20), 20), fill=(255, 205, 70), width=5)
        d.line((x, h - 20, min(x + dash, w - 20), h - 20), fill=(255, 205, 70), width=5)
    for y in range(20, h - 20, dash * 2):
        d.line((20, y, 20, min(y + dash, h - 20)), fill=(255, 205, 70), width=5)
        d.line((w - 20, y, w - 20, min(y + dash, h - 20)), fill=(255, 205, 70), width=5)
    cx, cy = w / 2, h / 2 - 90                      # 写真アイコン
    d.rounded_rectangle((cx - 90, cy - 62, cx + 90, cy + 62), 14, outline=(150, 166, 196), width=7)
    d.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), outline=(150, 166, 196), width=7)
    d.text((cx, cy + 120), "画像を準備中", font=font("black", 64), fill=(235, 240, 250), anchor="mm")
    if caption:
        d.text((cx, cy + 205), caption, font=font("bold", 40), fill=(255, 214, 90), anchor="mm")
    d.text((cx, cy + 270), f"{TYPE_LABEL.get(typ, typ.upper())}　{path_text}", font=font("medium", 28), fill=(150, 166, 196), anchor="mm")
    return im


class ImageLib:
    def __init__(self, ep_dir, photos, data):
        self.ep = Path(ep_dir)
        self.photos = photos
        self.defs = data.get("images", {})
        self.machines = data.get("machines", {})
        self.cache = {}
        self.used = {}                              # ref → [登場秒…]

    def meta(self, ref):
        typ, key = split_ref(ref)
        m = dict(self.defs.get(ref) or self.defs.get(key, {}))
        if typ == "machine":
            md = self.machines.get(key) or self.photos.meta("machines", key)
            m.setdefault("caption", f"{md.get('name', key)}（{md.get('date', '')}）" if md.get("date") else md.get("name", key))
        return typ, key, m

    def get(self, ref):
        if ref in self.cache:
            return self.cache[ref]
        typ, key, m = self.meta(ref)
        img, ph, path_text = None, False, m.get("file", "")
        if typ == "gallery":
            item = Item(ref, typ, key, None, m, False, "")
            self.cache[ref] = item
            return item
        if typ == "machine" and not m.get("file"):
            p = self.photos.machine(key)
            img, ph = p.img, p.placeholder
            path_text = f"assets/machines/{key}/"
            m.setdefault("source", "")
        else:
            f = m.get("file") or f"images/{key}.jpg"
            path_text = f
            path = (self.ep / f) if (self.ep / f).exists() else (ROOT / f)
            if path.exists():
                img = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
                if m.get("crop"):
                    x0, y0, x1, y1 = m["crop"]
                    img = img.crop((x0, y0, x1, y1))
                    if m.get("emphasis_target"):
                        e = m["emphasis_target"]
                        m["emphasis_target"] = [e[0] - x0, e[1] - y0, e[2] - x0, e[3] - y0]
            else:
                ph = True
        if img is None or (ph and typ != "machine"):
            img = placeholder_panel(m.get("caption", key), path_text, typ)
            ph = True
            m["emphasis_target"] = None
        item = Item(ref, typ, key, img, m, ph, path_text)
        self.cache[ref] = item
        return item

    def note_use(self, ref, t):
        self.used.setdefault(ref, []).append(t)
        it = self.get(ref)
        for sub in it.items:
            self.note_use(sub.split("@")[0], t)

    def write_manifest(self):
        def mmss(t):
            return f"{int(t // 60)}:{int(t % 60):02d}"
        rows = ["# 画像素材の一覧（自動生成）", "",
                "`@show` で使った画像。**未配置**の行は、`episodes/" + self.ep.name + "/` の下に画像を置けば次の書き出しから入る。", "",
                "| 指定 | 種類 | 状態 | ファイル | 見出し | 出典 | 登場 |", "| --- | --- | --- | --- | --- | --- | --- |"]
        missing = []
        for ref in sorted(self.used):
            it = self.get(ref)
            if it.type == "gallery":
                st = "ギャラリー（" + "・".join(s.split("@")[0] for s in it.items) + "）"
            else:
                st = "未配置（仮パネルで表示）" if it.placeholder else "配置済み"
                if it.placeholder:
                    missing.append(it)
            rows.append(f"| `{ref}` | {it.type} | {st} | {it.path_text or '-'} | {it.caption} | {it.source or '-'} | "
                        f"{', '.join(mmss(t) for t in sorted(set(self.used[ref])))} |")
        rows += ["", f"未配置：{len(missing)} 件", ""]
        for it in missing:
            rows.append(f"- `{it.ref}` → `{it.path_text}` に置く（{it.caption}）")
        (self.ep / "IMAGES_MANIFEST.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
        src = ["# 出典一覧（画像素材）", "", "動画内の画像の出典。概要欄にも転記する。", ""]
        for ref in sorted(self.used):
            it = self.get(ref)
            if it.type == "gallery":
                continue
            s = it.source or ("（未記入）" if not it.placeholder else "（画像が未配置）")
            src.append(f"- {it.caption or ref}：{s}　`{ref}`")
        (self.ep / "SOURCES.md").write_text("\n".join(src) + "\n", encoding="utf-8")
        return missing
