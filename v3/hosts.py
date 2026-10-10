"""ナギとバクの出し方。シーンの役割ごとの既定値＋台本からの上書き＋情報を隠さない配置

シーンごとの指定（台本の @host 行、またはテンプレートの既定値）:
  {"nagi": {"show": True, "size": 300, "pos": "bl", "alpha": 1.0},
   "baku": {"show": False}}
pos: bl=左下 br=右下 l=左（大）r=右（大）
"""
import math
from functools import lru_cache

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from . import fx, moments
from .style import ASSETS, W, H, put, prog, out3, back, inout

# テンプレートごとの既定（指示書の方針どおり）
DEFAULTS = {
    "A": {},                                                   # 歴史・資料：出さない
    "C": {},                                                   # 歴史：出さない
    "B": {"speaker": {"size": 220, "pos": "auto"}},             # 実機紹介：話者を端に小さく（写真を隠さない）
    "D": {"baku_exclaim": {"size": 330, "pos": "br"}},          # 数字：基本出さない。バクの驚きだけ
    "E": {"nagi": {"size": 300, "pos": "bl"}},                 # 重要な解説：ナギ
    "F": {"nagi": {"size": 500, "pos": "l"}, "baku": {"size": 480, "pos": "r"}},   # 掛け合い：2人
    "R": {"speaker": {"size": 230, "pos": "auto"}},             # 時代のレール：話者を端に小さく
    "T": {},                                                   # 年表：出さない（ツッコミだけ飛び込む）
    "V": {"speaker": {"size": 220, "pos": "auto"}},             # 2台の対比：話者を端に小さく
    "S": {"speaker": {"size": 300, "pos": "br"}},               # 資料カード：右の空きに話者
}

ANCHORS = {"bl": (40, H - 40), "br": (W - 40, H - 40), "l": (330, H - 20), "r": (W - 330, H - 20)}


FACES = ASSETS / "characters" / "v2"
# 表情差分：<who>/<face>.png があれば使う（なければ normal.png ＋ 頭上の記号で代用）
EXCLAIM_FACE = {"baku": "surprise", "nagi": "surprise"}
TALK_FACE = {"nagi": "explain", "baku": "talk"}
TANK = (235 / 299, 350 / 504)        # ナギの脳タンクの位置（元画像に対する比率）


@lru_cache(maxsize=32)
def sprite(who, h, face="normal"):
    p = FACES / who / f"{face}.png"
    if not p.exists():
        p = FACES / who / "normal.png"
    im = Image.open(p).convert("RGBA")
    return im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)


def has_face(who, face):
    return (FACES / who / f"{face}.png").exists()


def _box(who, cfg):
    sp = sprite(who, cfg["size"])
    ax, ay = ANCHORS[cfg["pos"]]
    left = cfg["pos"] in ("bl", "l")
    x = ax if left else ax - sp.width
    if cfg["pos"] in ("l", "r"):
        x = ax - sp.width / 2
    return (x, ay - sp.height, x + sp.width, ay)


def overlap(a, b):
    w = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return w * h


def resolve(scene, line_who, exclaim=False):
    """シーンの指定と、いま話している人から、表示するキャラと配置を決める"""
    tpl = scene["template"]
    rule = dict(DEFAULTS.get(tpl, {}))
    plan = {}
    if exclaim and line_who == "baku" and tpl != "F":     # バクのツッコミはどの場面でも右下に飛び込む
        plan["baku"] = {"size": 320, "pos": "br", "force": True}
    if "speaker" in rule and line_who and line_who not in plan:
        plan[line_who] = dict(rule["speaker"])
    if "baku_exclaim" in rule and line_who == "baku" and exclaim and "baku" not in plan:
        plan["baku"] = dict(rule["baku_exclaim"])
    for who in ("nagi", "baku"):
        if who in rule:
            plan[who] = dict(rule[who])
    for who, cfg in scene.get("hosts", {}).items():       # 台本の @host で上書き
        if cfg.get("show") is False:
            plan.pop(who, None)
        else:
            plan[who] = {**plan.get(who, {"size": 280, "pos": "br"}), **cfg}
    # 情報を隠さない：auto は空いている角を選び、重なりが大きければ出さない
    keep = {}
    for who, cfg in plan.items():
        cfg.setdefault("alpha", 1.0)
        cands = ["br", "bl"] if cfg.get("pos", "auto") == "auto" else [cfg["pos"]]
        best = None
        for pos in cands:
            c = {**cfg, "pos": pos}
            box = _box(who, c)
            hit = sum(overlap(box, r) for r in scene.get("_busy", []))
            area = (box[2] - box[0]) * (box[3] - box[1])
            if best is None or hit < best[0]:
                best = (hit / area, c)
        if best and (best[0] <= 0.08 or tpl == "F" or cfg.get("force")):
            keep[who] = best[1]
    return keep


def _tank_glow(cv, who, img, pos, t_line):
    """ナギが話し始めると脳タンクが光る（解説の合図）"""
    k = prog(t_line, 0, 0.9)
    if who != "nagi" or k <= 0 or k >= 1:
        return
    a = math.sin(math.pi * k)
    r = img.width * 0.16
    cx, cy = pos[0] + img.width * TANK[0], pos[1] + img.height * TANK[1]
    lay = Image.new("RGBA", (int(r * 4), int(r * 4)), (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse((r, r, r * 3, r * 3), fill=(120, 230, 255, 200))
    lay = lay.filter(ImageFilter.GaussianBlur(r * 0.45))
    put(cv, lay, (cx - lay.width / 2, cy - lay.height / 2), a)


# セリフの内容 → 表情（差分画像があれば使う）と頭上の記号
EXPRESSIONS = [
    # (誰, 条件, 表情ファイル名, 頭上の記号)
    ("baku", lambda tx, ex: ex and ("？" in tx or "?" in tx), "surprise", "question"),
    ("baku", lambda tx, ex: "ややこし" in tx or "なんで" in tx, "confused", "sweat"),
    ("baku", lambda tx, ex: ex, "surprise", "surprise"),
    ("nagi", lambda tx, ex: any(w in tx for w in ("そういうこと", "つまり", "ポイント")), "explain", "spark"),
    ("nagi", lambda tx, ex: True, "explain", None),
    ("baku", lambda tx, ex: True, "talk", None),
]


def expression(who, text, exclaim):
    for w, cond, face, emo in EXPRESSIONS:
        if w == who and cond(text, exclaim):
            return face, emo
    return "normal", None


def _window(scene, cfg):
    """@host の from= / until= （秒 または セリフ中の語句）"""
    def at(v, default):
        if v is None:
            return default
        try:
            return float(v)
        except (TypeError, ValueError):
            return scene["cue"](v, default)
    return at(cfg.get("from"), -1.0), at(cfg.get("until"), 1e9)


def draw(cv, scene, t_scene, who_speaking, line_t, exclaim, line_text=""):
    """t_scene=シーン内の秒、line_t=今のセリフの経過秒"""
    plan = scene["_host_plan"](who_speaking, exclaim)
    for who, cfg in plan.items():
        t_from, t_until = _window(scene, cfg)
        if not (t_from <= t_scene <= t_until):
            continue
        talking = who == who_speaking
        face, emo = expression(who, line_text, exclaim) if talking else ("normal", None)
        if not has_face(who, face):
            face = "normal"
        sp = sprite(who, cfg["size"], face)
        first = scene.get("_host_first", {}).get(who, 0.0)
        pk = prog(t_scene, first, 0.45)
        k = back(pk, 1.8) if pk < 1 else 1.0            # 登場：下から弾んで出る
        a = cfg.get("alpha", 1.0) * min(1.0, pk * 2.5)
        img = sp
        if not talking and scene["template"] == "F":
            img = ImageEnhance.Brightness(sp).enhance(0.72)
        s, sx, sy, rot, dy = 1.0, 1.0, 1.0, 0.0, 0.0
        dy += 3 * math.sin(t_scene * 2.4 + (0 if who == "nagi" else 1.7))      # 呼吸のような小さな揺れ
        x0, y0, x1, y1 = _box(who, cfg)
        cx = (x0 + x1) / 2
        if talking and exclaim:   # ツッコミ（moments.tsukkomi）：吹き出し＋集中線を後ろに、拡大・伸び縮み・跳ね
            s, sx, sy, rot, jdy = moments.tsukkomi_pose(line_t)
            dy += jdy
            moments.tsukkomi_back(cv, (cx, (y0 + y1) / 2 - 20), cfg["size"], line_t)
        elif talking and line_t < 0.3:   # 話し始めに軽くうなずく
            dy += 8 * math.sin(math.pi * line_t / 0.3)
        if abs(s * sx - 1) > 1e-3 or abs(s * sy - 1) > 1e-3:
            img = img.resize((int(img.width * s * sx), int(img.height * s * sy)), Image.BILINEAR)
        if abs(rot) > 0.2:
            img = img.rotate(rot, expand=True, resample=Image.BICUBIC)
        pos = (cx - img.width / 2, y1 - img.height + 90 * (1 - k) + dy)
        put(cv, img, pos, a)
        if talking and not exclaim and scene["template"] in ("B", "E", "F"):
            _tank_glow(cv, who, img, pos, line_t)
        if talking and emo and (face == "normal" or emo == "spark") and line_t < 1.4:
            # 表情差分がないときは頭上の記号で気持ちを出す（ナギの「ひらめき」は控えめに短く）
            sc_ = cfg["size"] / 330 * (0.7 if who == "nagi" else 1.0)
            if exclaim or line_t < 1.2:
                fx.emote(cv, emo, (cx + img.width * 0.18, pos[1] + 30), line_t, 0.05, scale=sc_)
