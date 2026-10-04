"""読み上げ演出プラン: レスの分類・声の割り当て・文の分割・間（ポーズ）を決める。

edge-tts は1つの音声の中で抑揚を細かく変えられないため、
1レスを「文・行」単位のクリップに分け、クリップごとに rate / pitch / 音量 / 前後の無音 を設定する。
結果は plan（JSON化可能な辞書のリスト）として返し、add_voice.py が音声化・配置する。
"""
import random
import re

CLASSES = ("normal", "agreement", "surprise", "anger", "despair", "joke", "punchline")
STRONG = {"surprise", "anger", "despair", "punchline"}

# ---- 分類ルール（上から順に判定。score は「演出を強めに付ける優先度」） ----
AGREE_EXACT = {"草", "それな", "わかる", "分かる", "ワイ", "ワイも", "ワイもです", "意外とあるな", "美しい流れ",
               "一番悲しいやつ", "完全に麻痺してる"}
SHORT_STRONG = {  # 短く・強く読ませる（必ず強い演出）
    "草": "agreement", "それな": "agreement", "わかる": "agreement", "分かる": "agreement",
    "無理": "despair", "地獄": "despair", "正論やめろ": "anger", "なんでだよ": "anger",
    "数字出すな\n余計ムカつく": "anger", "分かっとるわ！": "anger", "その引きいらん": "anger",
    "終了": "punchline", "当たりとは": "punchline", "怖すぎる": "surprise", "おめでとう！": "surprise",
    "通常画面": "punchline", "養分の完成": "punchline", "今年8回目": "punchline",
}
ANGER_W = ("やめろ", "やめてくれ", "腹立つ", "ムカつく", "分かっとるわ", "なんでだよ", "数字出すな", "いらん", "強制終了", "何なん")
DESPAIR_W = ("キツ", "虚無", "帰りたい", "死んで", "地獄", "無理", "絶望", "悲し", "つらい", "苦しい", "消える", "悩む", "通常画面おる")
SURPRISE_W = ("一番怖い", "ヤバ", "マジ", "嘘だろ", "怖い", "異常", "おかしい", "！？", "感覚バグ")
JOKE_W = ("草", "かよ", "調教", "チュートリアル", "役職", "投資商品", "隠しボス", "数学者", "引き強", "募金", "学ぶ男",
          "甘デジ扱い", "メンタル管理", "麻痺", "良心的", "遊べるやん", "YouTube見て", "時間の流れ", "概念", "ワイ「", "台\n「")


def classify(text):
    t = text.strip()
    if t in SHORT_STRONG:
        return SHORT_STRONG[t], 10.0
    if t in AGREE_EXACT:
        return "agreement", 6.0
    if t.startswith("なお") or t in ("そして通常", "その後は知らん", "残り5％引いた引き強"):
        return "punchline", 7.0
    if any(w in t for w in ANGER_W):
        return "anger", 6.0
    if any(w in t for w in DESPAIR_W):
        return "despair", 5.0
    if any(w in t for w in SURPRISE_W):
        return "surprise", 4.5
    if any(w in t for w in JOKE_W) or re.search(r"^(昔|今)\n", t):
        return "joke", 4.0
    if len(t) <= 6 and "\n" not in t:
        return "agreement", 3.0
    return "normal", 0.0


# ---- 文の分割 ----
def split_segments(text, cfg):
    """改行と文末（。！？）で区切る。「↓」は長めの間として扱う。"""
    t = text
    for a, b in cfg["tts"].get("replace", {}).items():
        if a != "↓":
            t = t.replace(a, b)
    parts = []
    for line in t.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line == "↓":
            parts.append({"arrow": True})
            continue
        for s in re.findall(r"[^。！？!?]+[。！？!?」』）)]*|[」』）)]+", line):
            s = s.strip()
            if not s:
                continue
            if re.fullmatch(r"[」』）)。！？!?]+", s) and parts and "text" in parts[-1]:
                parts[-1]["text"] += s   # 閉じカッコだけのかけらは前に付ける
            else:
                parts.append({"text": s})
    segs, pending_gap = [], 0.0
    for p in parts:
        if p.get("arrow"):
            pending_gap += 0.3
            continue
        segs.append({"text": p["text"], "gap_before": pending_gap})
        pending_gap = 0.0
    return segs


def _pct(v):
    return f"{int(round(v)):+d}%"


def _hz(v):
    return f"{int(round(v)):+d}Hz"


def build_plan(lines, cfg, seed=7):
    S = cfg["style"]
    rng = random.Random(seed)
    board_voices = list(S["board_voices"].keys())
    plan = []

    # 1) 分類
    for l in lines:
        cls, score = classify(l["text"]) if l["speaker"] == "board" else ("normal", 0.0)
        plan.append({**l, "cls": cls, "score": score, "level": "none"})

    # 2) 演出の強さ配分：普通 60% / 少し変化 25% / 強い 15%（掲示板レスの中で）
    board = [p for p in plan if p["speaker"] == "board"]
    n = len(board)
    n_strong = round(n * S["ratio"]["strong"])
    n_mild = round(n * S["ratio"]["mild"])
    cand = sorted([p for p in board if p["cls"] != "normal"], key=lambda p: (-p["score"], p["id"]))
    for i, p in enumerate(cand):
        if p["score"] >= 10 or i < n_strong:
            p["level"] = "strong"
        elif i < n_strong + n_mild:
            p["level"] = "mild"
        else:
            p["level"] = "none"
    # 強い演出が近くで続きすぎないように（直前2レス以内に strong があれば mild に）
    last_strong = -99
    for i, p in enumerate(board):
        if p["level"] == "strong":
            if i - last_strong <= 1 and p["score"] < 10:
                p["level"] = "mild"
            else:
                last_strong = i

    # 3) 声の割り当て（同じ声が3連続しない／章の頭はリセット）
    hist = []
    prev_kind = None
    for p in plan:
        if p["speaker"] != "board":
            if p["kind"] == "chapter":
                hist = []
            prev_kind = p["kind"]
            continue
        chapter_head = prev_kind in ("chapter", "title")
        prefer = S.get("class_voice_preference", {}).get(p["cls"]) if p["level"] != "none" else None
        options = [v for v in board_voices if not (len(hist) >= 2 and hist[-1] == hist[-2] == v)]
        if chapter_head:
            v = S.get("chapter_head_voice", board_voices[0])
        elif prefer and prefer in options and rng.random() < 0.6:
            v = prefer
        else:
            weights = [0.5 if hist and hist[-1] == o else 1.0 for o in options]
            v = rng.choices(options, weights=weights)[0]
        if len(hist) >= 2 and hist[-1] == hist[-2] == v:
            v = [o for o in board_voices if o != v][0]
        p["voice_key"] = v
        p["chapter_head"] = chapter_head
        hist.append(v)
        prev_kind = p["kind"]

    # 4) 読み方（クリップごとの rate/pitch/音量 と 前後の間）
    talk_idx = [i for i, p in enumerate(plan) if p["kind"] == "talk"]
    ochi_id = None
    if talk_idx:
        ochi_id = plan[talk_idx[-1]]["id"]           # 最後の会話の最後の台詞 = オチ
    for i, p in enumerate(plan):
        segs = split_segments(p["text"], cfg)
        if p["speaker"] == "board":
            vb = S["board_voices"][p["voice_key"]]
            st = S["classes"][p["cls"]] if p["level"] != "none" else S["classes"]["normal"]
            k = 1.0 if p["level"] == "strong" else (0.5 if p["level"] == "mild" else 0.0)
            base = S["classes"]["normal"]
            def mix(key):
                lo, hi = base[key], st[key]
                if isinstance(lo, list): lo = rng.uniform(*lo)
                if isinstance(hi, list): hi = rng.uniform(*hi)
                return lo + (hi - lo) * k if p["level"] != "none" else lo
            rate = mix("rate") + vb.get("rate_offset", 0)
            pitch = mix("pitch") + vb.get("pitch", 0)
            gain = mix("gain_db")
            pb = mix("pause_before") if "pause_before" in st else 0.0
            pa = mix("pause_after")
            voice = vb["voice"]
            if p.get("chapter_head"):
                pb = max(pb, rng.uniform(*S["chapter_head_pause"]))
            inner = S["inner_gap"]
            ochi_gap = S["ochi_gap"]
        else:
            role = p["speaker"] if p["speaker"] in ("rabbit", "cat") else "narrator"
            c = S["characters"][role]
            voice, rate, pitch, gain = c["voice"], c["rate"], c["pitch"], 0.0
            pb = rng.uniform(*S["talk_gap"]) if p["kind"] == "talk" else 0.15
            pa = 0.2
            inner = c.get("inner_gap", S["inner_gap"])
            ochi_gap = S["ochi_gap"]
            if p["id"] == ochi_id:          # オチの台詞：長めのためを作る
                pb = S["finale_ochi_pause"]
                pitch += 4; gain = 1.5
            if i + 1 < len(plan) and plan[i + 1]["id"] == ochi_id:
                pa = 0.5
        # 文中の間：通常は短く、最後の一言（短いオチ）の前は長め
        for j, s in enumerate(segs):
            if j == 0:
                s["gap_before"] = 0.0
            else:
                g = rng.uniform(*inner)
                last_short = j == len(segs) - 1 and len(s["text"]) <= 10
                if last_short:
                    g = rng.uniform(*ochi_gap)
                s["gap_before"] = max(s.get("gap_before", 0.0), g) + (0.3 if s.get("gap_before", 0) >= 0.3 else 0)
            s["rate"], s["pitch"], s["gain_db"], s["voice"] = rate, pitch, gain, voice
            if j == len(segs) - 1 and len(segs) >= 2 and p["speaker"] == "board" and p["level"] != "none":
                s["pitch"] = pitch - 2           # 最後の一言は少し落として言い切る
        for s in segs:
            s["rate_str"], s["pitch_str"] = _pct(s["rate"]), _hz(s["pitch"])
        p.update(segments=segs, pause_before=round(pb, 3), pause_after=round(pa, 3), voice=voice)
    return plan


def summary(plan):
    board = [p for p in plan if p["speaker"] == "board"]
    n = len(board) or 1
    lv = {k: sum(1 for p in board if p["level"] == k) for k in ("none", "mild", "strong")}
    cl = {c: sum(1 for p in board if p["cls"] == c and p["level"] != "none") for c in CLASSES}
    vc = {}
    for p in board:
        vc[p["voice_key"]] = vc.get(p["voice_key"], 0) + 1
    run, worst = 1, 1
    for a, b in zip(board, board[1:]):
        run = run + 1 if a["voice_key"] == b["voice_key"] else 1
        worst = max(worst, run)
    return (f"演出の配分: 普通 {lv['none']*100//n}% / 少し変化 {lv['mild']*100//n}% / 強い {lv['strong']*100//n}%  "
            f"分類(演出あり): {', '.join(f'{k}={v}' for k, v in cl.items() if v)}  "
            f"声: {', '.join(f'{k}={v}' for k, v in sorted(vc.items()))}  同じ声の最長連続: {worst}")
