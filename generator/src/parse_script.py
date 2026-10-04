"""台本テキスト（【見出し】形式）を script JSON に変換する。

使い方:
    python src/parse_script.py scripts/source/episode_001.txt scripts/episode_001.json

見出しの自動分類:
    【...オープニング...】/【冒頭】          -> hook       (掲示板レス)
    【タイトル】                            -> title      (1行目以降がタイトル、最後の行がサブタイトル)
    【その① ...】                           -> reactions  (章: 掲示板レス)
    【うさぎ＆ねこ】                        -> character  (キャラ会話)
    【最後のうさぎ＆ねこ】                  -> character  (finale: true, オチ演出付き)
    【エンディング】                        -> ending     (コメント誘導・登録案内)
"""
import json, re, sys
from pathlib import Path

BOARD_NAMES = ("名無しさん", "名無し", "風吹けば名無し")
CHAR_ALIASES = {"うさぎ": "rabbit", "うさ": "rabbit", "ねこ": "cat", "猫": "cat"}
EMPHASIS_WORDS = {"草", "わかる", "分かる", "それな", "無理", "地獄", "正論やめろ", "なんでだよ",
                  "ワイ", "ワイも", "ワイもです", "終了", "怖すぎる", "当たりとは", "おめでとう！", "やめろ。"}

HEAD_RE = re.compile(r"^【(.+?)】\s*$")
SPEAKER_RE = re.compile(r"^(うさぎ|うさ|ねこ|猫)(?:\s*[：:]\s*(.*))?$")
IMAGE_MARK = "@@IMAGE"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")


def _clean(lines):
    """前後の空行を落とし、内部の連続空行は1つの改行にまとめる。"""
    out = []
    for ln in lines:
        s = ln.rstrip()
        if not s:
            if out and out[-1] != "":
                out.append("")
            continue
        out.append(s)
    while out and out[-1] == "":
        out.pop()
    # 空行は「間」として残さず詰める（画面上は改行1つ）
    return "\n".join(x for x in out if x != "")


def classify(head):
    h = head.replace(" ", "")
    if "オープニング" in h or h.startswith("冒頭") or "0:00" in h:
        return "hook"
    if h.startswith("タイトル"):
        return "title"
    if "うさぎ" in h and "ねこ" in h:
        return "character"
    if h.startswith("エンディング") or "コメント" in h:
        return "ending"
    if h.startswith("その"):
        return "reactions"
    return "reactions"


def _parse_image(lines):
    """【IMAGE】ブロック: ファイル名 / 画面端：「ラベル」 / 画面テロップ：「…」 / 横並び・順番 などの指示。"""
    files, label, telop, layout, want = [], "", "", "single", None
    for ln in lines:
        t = ln.strip()
        if not t:
            continue
        if t.lower().endswith(IMG_EXT):
            files.append(t); continue
        if t.startswith("画面端"):
            want = "label"; rest = t.split("：", 1)[-1].strip() if "：" in t else ""
            if rest: label = rest.strip("「」"); want = None
            continue
        if "テロップ" in t:
            want = "telop"; rest = t.split("：", 1)[-1].strip() if "：" in t else ""
            if rest: telop = rest.strip("「」"); want = None
            continue
        if want and t.startswith("「"):
            if want == "label": label = t.strip("「」")
            else: telop = t.strip("「」")
            want = None; continue
        if "横並び" in t: layout = "row"
        elif "順番" in t or "テンポよく" in t: layout = "sequence"
    if len(files) > 1 and layout == "single":
        layout = "sequence"
    return {"type": "image", "files": files, "label": label, "telop": telop, "layout": layout}


def parse_board(lines):
    items, cur, img = [], None, None
    def flush():
        nonlocal cur, img
        if img is not None:
            items.append(("image", img)); img = None
        if cur is not None:
            items.append(("res", cur)); cur = None
    for ln in lines:
        st = ln.strip()
        if st == IMAGE_MARK:
            flush(); img = []; continue
        if st in BOARD_NAMES:
            flush(); cur = []; continue
        if img is not None:
            img.append(ln); continue
        if cur is not None:
            cur.append(ln)
    flush()
    res = []
    for kind, it in items:
        if kind == "image":
            res.append(_parse_image(it)); continue
        text = _clean(it)
        if not text:
            continue
        item = {"speaker": "名無しさん", "text": text}
        if text in EMPHASIS_WORDS or (len(text) <= 4 and "\n" not in text):
            item["emphasis"] = True
        res.append(item)
    return res


def parse_character(lines):
    items, cur_sp, cur = [], None, []
    def flush():
        if cur_sp and _clean(cur):
            items.append({"speaker": cur_sp, "text": _clean(cur)})
    for ln in lines:
        m = SPEAKER_RE.match(ln.strip())
        if m:
            flush()
            cur_sp = {"rabbit": "うさぎ", "cat": "ねこ"}[CHAR_ALIASES[m.group(1)]]
            cur = [m.group(2)] if m.group(2) else []
        else:
            cur.append(ln)
    flush()
    return items


def parse(text):
    blocks, head, buf = [], None, []
    lines_in = []
    for ln in text.splitlines():
        if re.fullmatch(r"\s*[-=─━]{3,}\s*", ln):
            continue  # 区切り線
        if ln.strip() == "【IMAGE】":
            ln = IMAGE_MARK
        lines_in.append(ln)
    for ln in lines_in:
        m = HEAD_RE.match(ln.strip())
        if m:
            if head is not None:
                blocks.append((head, buf))
            head, buf = m.group(1), []
        else:
            buf.append(ln)
    if head is not None:
        blocks.append((head, buf))

    script = {"title": "", "subtitle": "", "sections": []}
    for head, lines in blocks:
        kind = classify(head)
        if kind == "title":
            ls = [l.strip() for l in lines if l.strip()]
            if ls:
                script["subtitle"] = ls[-1] if len(ls) > 1 else ""
                title_lines = ls[:-1] if len(ls) > 1 else ls
                script["title_lines"] = title_lines
                script["title"] = "".join(title_lines)
            script["sections"].append({"type": "title"})
        elif kind == "hook":
            script["sections"].append({"type": "hook", "items": parse_board(lines)})
        elif kind == "reactions":
            m = re.match(r"^(その[①-⑳0-9]+)\s*(.*)$", head.strip())
            num, name = (m.group(1), m.group(2)) if m else ("", head.strip())
            script["sections"].append({"type": "reactions", "title": head.strip(),
                                       "number": num, "name": name, "items": parse_board(lines)})
        elif kind == "character":
            sec = {"type": "character", "items": parse_character(lines)}
            if "最後" in head:
                sec["finale"] = True
                its = sec["items"]
                if len(its) >= 2:
                    its[-2]["bgm_cut"] = True      # ボケの瞬間にBGMを抜く
                    its[-1]["pause_before"] = 1.0  # 一拍おいてツッコミ
                    its[-1]["ochi"] = True
            script["sections"].append(sec)
        elif kind == "ending":
            ls = [l.strip() for l in lines]
            # 「…」で囲まれた（複数行可）まとまりを抽出
            quotes, cur, inq = [], [], False
            plain = []
            for l in ls:
                if not l:
                    continue
                if l.endswith("：") or l.endswith(":"):
                    continue  # 「画面：」「続けて表示：」などの指示
                if inq or l.startswith("「"):
                    cur.append(l.strip("「」")); inq = not l.endswith("」") if (inq or l.startswith("「")) else inq
                    if not inq:
                        quotes.append("\n".join(cur)); cur = []
                    continue
                plain.append(l)
            question = quotes[0] if quotes else (plain[0] if plain else "")
            choices = [x.rstrip("？?") for x in plain if x.endswith(("？", "?"))]
            rest = quotes[1:] + [x for x in plain if not x.endswith(("？", "?")) and "チャンネル登録" not in x]
            script["sections"].append({"type": "ending", "question": question, "choices": choices, "lines": rest})
    return script


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    script = parse(src.read_text(encoding="utf-8"))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8")
    n_board = sum(len(s.get("items", [])) for s in script["sections"] if s["type"] in ("hook", "reactions"))
    n_char = sum(len(s.get("items", [])) for s in script["sections"] if s["type"] == "character")
    print(f"変換完了: {dst}  章={sum(1 for s in script['sections'] if s['type']=='reactions')} "
          f"レス={n_board} キャラ台詞={n_char}")


if __name__ == "__main__":
    main()
