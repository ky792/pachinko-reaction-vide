"""ナギとバクの出し方。シーンの役割ごとの既定値＋台本からの上書き＋情報を隠さない配置

シーンごとの指定（台本の @host 行、またはテンプレートの既定値）:
  {"nagi": {"show": True, "size": 300, "pos": "bl", "alpha": 1.0},
   "baku": {"show": False}}
pos: bl=左下 br=右下 l=左（大）r=右（大）
"""
from functools import lru_cache

from PIL import Image, ImageEnhance

from .style import ASSETS, W, H, put, prog, out3, back, inout

# テンプレートごとの既定（指示書の方針どおり）
DEFAULTS = {
    "A": {},                                                   # 歴史・資料：出さない
    "C": {},                                                   # 歴史：出さない
    "B": {"speaker": {"size": 250, "pos": "auto"}},             # 機種紹介：話者を端に小さく
    "D": {"baku_exclaim": {"size": 330, "pos": "br"}},          # 数字：基本出さない。バクの驚きだけ
    "E": {"nagi": {"size": 300, "pos": "bl"}},                 # 重要な解説：ナギ
    "F": {"nagi": {"size": 500, "pos": "l"}, "baku": {"size": 480, "pos": "r"}},   # 掛け合い：2人
}

ANCHORS = {"bl": (40, H - 40), "br": (W - 40, H - 40), "l": (330, H - 20), "r": (W - 330, H - 20)}


@lru_cache(maxsize=16)
def sprite(who, h):
    im = Image.open(ASSETS / "characters" / "v2" / who / "normal.png").convert("RGBA")
    return im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)


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


def resolve(scene, line_who):
    """シーンの指定と、いま話している人から、表示するキャラと配置を決める"""
    tpl = scene["template"]
    rule = dict(DEFAULTS.get(tpl, {}))
    plan = {}
    if "speaker" in rule and line_who:
        plan[line_who] = dict(rule["speaker"])
    if "baku_exclaim" in rule and line_who == "baku":
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


def draw(cv, scene, t_scene, who_speaking, line_t, exclaim):
    """t_scene=シーン内の秒、line_t=今のセリフの経過秒"""
    plan = scene["_host_plan"](who_speaking)
    for who, cfg in plan.items():
        sp = sprite(who, cfg["size"])
        first = scene.get("_host_first", {}).get(who, 0.0)
        k = out3(prog(t_scene, first, 0.35))
        talking = who == who_speaking
        a = cfg.get("alpha", 1.0) * k
        img = sp
        if not talking and scene["template"] == "F":
            img = ImageEnhance.Brightness(sp).enhance(0.72)
        s = 1.0
        if talking and exclaim:   # 驚き・ツッコミ：軽く拡大して戻す
            s = 1 + 0.08 * out3(prog(line_t, 0, 0.2)) * (1 - inout(prog(line_t, 0.9, 0.35)))
        if abs(s - 1) > 1e-3:
            img = img.resize((int(img.width * s), int(img.height * s)), Image.BILINEAR)
        x0, y0, x1, y1 = _box(who, cfg)
        cx = (x0 + x1) / 2
        put(cv, img, (cx - img.width / 2, y1 - img.height + 60 * (1 - k)), a)
