"""台本 + 音声尺 → 表示タイムライン（各イベントの開始時刻と長さ）を作る。

表示時間は「実際の音声の長さ + 余白」を基本にし、
文字数に応じた範囲（短い/普通/長い）に収める。ただし音声より短くはしない。
"""
import re
from .common import PipelineError

CHAR_KEYS = {"うさぎ": "rabbit", "うさ": "rabbit", "rabbit": "rabbit", "ねこ": "cat", "猫": "cat", "cat": "cat"}


def char_key(speaker):
    if speaker not in CHAR_KEYS:
        raise PipelineError(f"キャラ会話の話者 '{speaker}' が不明です（うさぎ / ねこ）")
    return CHAR_KEYS[speaker]


def pick_face(text, who, ochi=False):
    t = text
    if ochi or any(w in t for w in ("なんでだよ", "やめ", "禁止", "数字出すな")):
        return "angry"
    if t.rstrip().endswith(("？", "?")) or "何なん" in t:
        return "jito" if who == "rabbit" else "shock"
    if any(w in t for w in ("つらい", "虚無", "戻りたい", "高く感じる", "キツ", "悲し")):
        return "cry"
    if any(w in t for w in ("自分で言う", "思うよ", "では", "でしょ", "んだ。", "退屈")):
        return "jito"
    if any(w in t for w in ("明日行く", "そう。", "そんなもん", "忘れる", "祈る", "しないんだけど", "立たない")):
        return "smug"
    return "normal"


def res_face(text, emphasis):
    if "草" in text or emphasis:
        return "smug"
    if text.rstrip().endswith(("？", "?")):
        return "shock"
    if any(w in text for w in ("キツ", "怖", "虚無", "地獄", "無理", "終了")):
        return "cry"
    return "normal"


def _clamp_display(cfg, text, voice_len):
    tm = cfg["timing"]
    n = len(re.sub(r"\s", "", text))
    if n <= tm["short_text_chars"]:
        lo, hi = tm["short_range"]
    elif n <= tm["long_text_chars"]:
        lo, hi = tm["normal_range"]
    else:
        lo, hi = tm["long_range"]
    d = voice_len + tm["gap_after_voice"]
    d = min(max(d, lo), hi)
    return max(d, voice_len + 0.25)


def build(script, cfg, voice):
    tm = cfg["timing"]
    ev, t = [], 0.0
    res_no = 0
    cues = []
    corner = ""

    def add(kind, dur, **kw):
        nonlocal t
        e = dict(kind=kind, start=t, dur=dur, **kw)
        ev.append(e); t += dur
        return e

    title_lines = script.get("title_lines") or [script.get("title", "")]
    for si, sec in enumerate(script["sections"]):
        typ = sec.get("type")
        if typ in ("hook", "reactions"):
            if typ == "reactions":
                add("chapter", tm["chapter_title"], number=sec.get("number", ""),
                    name=sec.get("name", sec.get("title", "")), se="chapter")
                corner = ""
            first = True
            pending = []
            for it in sec.get("items", []):
                if it.get("type") == "image":
                    pending.append(it)
                    continue
                for im in pending:  # 画像は次のレスの表示開始と同時に出す
                    IC = cfg.get("images", {})
                    n = max(1, len(im.get("files", [])))
                    d = (IC.get("row", 3.6) if im.get("layout") == "row" else
                         IC.get("sequence_each", 1.4) * n if im.get("layout") == "sequence" else IC.get("single", 3.0))
                    cues.append({"time": round(t, 3), "duration": d, "files": im.get("files", []),
                                 "label": im.get("label", ""), "telop": im.get("telop", ""), "layout": im.get("layout", "single")})
                    if im.get("label"):
                        corner = im["label"]
                pending = []
                res_no += 1
                wav, vl = voice.get("board", it["text"])
                emph = bool(it.get("emphasis"))
                add("res", _clamp_display(cfg, it["text"], vl), text=it["text"], no=res_no,
                    emphasis=emph, voice=wav, voice_len=vl, reset=first,
                    chapter=None if typ == "hook" else (sec.get("number", ""), sec.get("name", "")),
                    face=it.get("face") or res_face(it["text"], emph),
                    corner=corner if typ == "reactions" else "",
                    se="emphasis" if emph else "res")
                first = False
        elif typ == "title":
            txt = "".join(title_lines) + "。" + (script.get("subtitle") or "")
            wav, vl = voice.get("narrator", txt)
            add("title", max(tm["title_card"], vl + 0.6), lines=title_lines,
                subtitle=script.get("subtitle", ""), voice=wav, voice_len=vl, se="chapter")
        elif typ == "character":
            finale = bool(sec.get("finale"))
            items = sec.get("items", [])
            for i, it in enumerate(items):
                who = char_key(it["speaker"])
                if it.get("pause_before"):
                    add("talk", float(it["pause_before"]), who=who, text="………", face="jito",
                        first=False, finale=finale, pause=True, voice=None, voice_len=0)
                wav, vl = voice.get(who, it["text"])
                gap = tm["finale_gap"] if finale else tm["character_gap"]
                mn = 1.0 if finale else 1.8
                e = add("talk", max(mn, vl + gap + (0.6 if it.get("ochi") else 0)), who=who, text=it["text"],
                        face=it.get("face") or pick_face(it["text"], who, it.get("ochi")),
                        first=(i == 0), finale=finale, pause=False, voice=wav, voice_len=vl,
                        bgm_cut=bool(it.get("bgm_cut")), ochi=bool(it.get("ochi")),
                        se=("character" if i == 0 else None))
                if it.get("bgm_cut"):
                    e["se"] = "bgm_cut"
                if it.get("ochi"):
                    e["se"] = "ochi"
        elif typ == "ending":
            parts = [sec.get("question", "")] + sec.get("choices", []) + sec.get("lines", [])[:2]
            txt = "。".join(p for p in parts if p)
            wav, vl = voice.get("narrator", txt)
            add("ending", max(tm["ending_min"], vl + 1.0), question=sec.get("question", ""),
                choices=sec.get("choices", []), lines=sec.get("lines", []), voice=wav, voice_len=vl,
                bgm="ending")
            add("subscribe", tm["subscribe_card"], bgm="ending", se="character")
        else:
            raise PipelineError(f"不明なセクション type: {typ}（hook / title / reactions / character / ending）")
    return ev, t, cues


def export_voice_lines(events, video_duration):
    """読み上げ用タイムライン（add_voice.py が読む形式）を作る。"""
    lines = []
    for i, e in enumerate(events):
        k = e["kind"]
        nxt = events[i + 1]["start"] if i + 1 < len(events) else e["start"] + e["dur"]
        if k == "res":
            lines.append(dict(start=e["start"], end=nxt, speaker="board", text=e["text"], kind="res"))
        elif k == "talk":
            if e.get("pause"):
                continue
            lines.append(dict(start=e["start"], end=nxt, speaker=e["who"], text=e["text"], kind="talk"))
        elif k == "title":
            lines.append(dict(start=e["start"], end=nxt, speaker="narrator", text="".join(e["lines"]) + "。" + e["subtitle"], kind="title"))
        elif k == "chapter":
            lines.append(dict(start=e["start"], end=nxt, speaker="narrator", text=(e["number"] + "、" + e["name"]), kind="chapter"))
        elif k == "ending":
            txt = "。".join([e["question"]] + e["choices"] + e["lines"][:2])
            lines.append(dict(start=e["start"], end=nxt, speaker="narrator", text=txt, kind="ending"))
        elif k == "subscribe":
            lines.append(dict(start=e["start"] + 0.3, end=e["start"] + e["dur"], speaker="narrator",
                              text="チャンネル登録と高評価、よろしくお願いします！", kind="subscribe"))
    for n, l in enumerate(lines, 1):
        l["id"] = n
        l["start"] = round(l["start"], 3)
        l["end"] = round(l["end"], 3)
    return {"video_duration": round(video_duration, 3),
            "note": "start/end は動画上でそのセリフ（レス）が表示される秒数。end は次の表示が始まる時刻。",
            "lines": [{k: l[k] for k in ("id", "start", "end", "speaker", "kind", "text")} for l in lines]}
