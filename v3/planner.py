"""台本 → シーン構成。テンプレートは自動で選び、@指定があればそちらを優先する。

台本の書き方:
  ナギ: セリフ            （標準語の解説）
  バク: セリフ            （関西弁の反応）
  バク!: セリフ           （驚き・ツッコミ。バクを強調）
  @A headline="MAX機の時代" sub="〜2015年"     ← 次のセリフから、テンプレートAの新しいシーン
  @C:era band="MAX機の時代" end=2015.9 goto=2016
  @host nagi size=300 pos=bl alpha=0.9         ← 今のシーンのキャラ表示を上書き（off で非表示）
  @trans fade                                  ← 今のシーンへの入り方（cut / fade / zoom / push）
  @moment analysis at="65%" box=560,430,900,90 ← ナギの解析演出を、その語句を言う瞬間に重ねる（v3/moments.py）
  @C:calendar intro=era_shift reels="2016年|5月|新内規"   ← 時代転換のリールから入る

自動選択のルール（上から順に判定）:
  1. 機種名（data.json の aliases）＋「登場・導入」        → B 機種紹介
  2. 直前がBで、その機種のスペックの数字か機種名を言っている → Bの続き（スペックを順に出す）
  3. %の数字が2つ                                          → D 比較
  4. バクの驚き（バク!:）で%の数字                         → D 大きな数字
  5. 「ポイント」「①」など                                → E 要点
  6. 「◯年」「◯月」                                       → C カレンダー
  7. 最初の行で「時代」「ホール」                           → A 写真
  8. 数字を含まない                                        → F 掛け合い（直前と同じなら続ける）
"""
import json
import re
import wave
from pathlib import Path

from .moments import INTROS

WHO = {"ナギ": "nagi", "バク": "baku"}
CHARS_PER_SEC = {"nagi": 5.2, "baku": 5.6}
GAP = 0.24
MIN_DUR = {"A": 3.2, "B": 5.2, "C": 3.0, "D": 4.0, "E": 3.4, "F": 2.6, "R": 4.0, "T": 4.0, "V": 4.0, "S": 3.0, "I": 3.0}
TRANS = {"A": "fade", "B": "cut", "C": "fade", "D": "zoom", "E": "fade", "F": "push", "R": "fade", "T": "push", "V": "fade", "S": "zoom", "I": "fade"}
VARIANT = {"A": "photo", "B": "machine", "C": "calendar", "D": "stat", "E": "points", "F": "talk",
           "R": "rail", "T": "timeline", "V": "duo", "S": "source", "I": "image"}


def parse_opts(s):
    out = {}
    for m in re.finditer(r'(\w+)=("([^"]*)"|\S+)', s):
        v = m.group(3) if m.group(3) is not None else m.group(2)
        out[m.group(1)] = v
    flags = [w for w in re.sub(r'(\w+)=("([^"]*)"|\S+)', "", s).split()]
    for f in flags:
        out[f] = True
    return out


def parse(path):
    items = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            head, _, rest = line[1:].partition(" ")
            items.append({"cmd": head, "opts": parse_opts(rest)})
            continue
        m = re.match(r"^(ナギ|バク)(!?)(?:\[([^\]]*)\])?[:：]\s*(.+)$", line)
        if not m:
            raise ValueError(f"読めない行: {raw}")
        vo = parse_opts(m.group(3) or "")              # ナギ[mood=joke pre=-0.1]: … → 声の演技と、前の間の調整
        items.append({"cmd": "line", "who": WHO[m.group(1)], "exclaim": m.group(2) == "!", "text": m.group(4),
                      "voice": vo})
    return items


def wav_len(p):
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()


def est_len(who, text):
    n = len(re.sub(r"[、。！？!?…\s]", "", text))
    return max(1.2, n / CHARS_PER_SEC[who] + 0.2)


def mark_numbers(text):
    return re.sub(r"(約?[0-9][0-9,.]*(?:%|個|回転|回)|1/[0-9][0-9.]*)", r"{\1}", text)


class Planner:
    def __init__(self, ep_dir):
        self.ep = Path(ep_dir)
        self.data = json.loads((self.ep / "data.json").read_text(encoding="utf-8"))
        self.machines = self.data.get("machines", {})

    # ---------------------------------------------------------- 自動選択
    def find_machine(self, text):
        for key, m in self.machines.items():
            for al in [m["short"]] + m.get("aliases", []):
                if al in text:
                    return key
        return None

    def auto(self, ln, cur, ctx):
        text, who = ln["text"], ln["who"]
        mk = self.find_machine(text)
        if mk and re.search(r"登場|導入", text):
            return "B", "machine", {"machine": mk}, True
        pcts = re.findall(r"([0-9]+(?:\.[0-9]+)?)%", text)
        if (cur and cur["template"] == "D" and cur["variant"] == "stat" and pcts
                and pcts[0] == str(cur["opts"].get("value"))):          # 同じ数字への反応は、同じ画面のまま
            return "D", None, {}, False
        if who == "baku" and ln["exclaim"] and len(pcts) == 1:     # 驚きは数字を大きく見せる方を優先
            return "D", "stat", {"value": pcts[0]}, True
        if cur and cur["template"] == "B":
            specs = self.machines[cur["opts"]["machine"]]["specs"]
            if any(s.get("say", s["v"]) in text for s in specs) or mk == cur["opts"]["machine"]:
                return "B", None, {}, False
        if len(pcts) >= 2:
            return "D", "compare", {"pcts": pcts}, True
        if who == "baku" and ln["exclaim"] and pcts:
            return "D", "stat", {"value": pcts[0]}, True
        if re.search(r"ポイント|①|つ目", text):
            return "E", "points", {}, True
        mm = re.search(r"([0-9]{1,2})月", text)
        if mm or re.search(r"[0-9]{4}年", text):
            return "C", "calendar", {"month": int(mm.group(1)) if mm else None}, True
        if ctx["first"] and re.search(r"時代|ホール", text):
            return "A", "photo", {}, True
        if not re.search(r"[0-9]", text):
            if cur and cur["template"] == "F":
                return "F", "talk", {}, False
            return "F", "talk", {}, True
        return (cur["template"], cur["variant"], {}, False) if cur else ("F", "talk", {}, True)

    # ---------------------------------------------------------- 自動の中身（opts）を埋める
    def fill(self, sc, ctx):
        t, v, o = sc["template"], sc["variant"], sc["opts"]
        text = " ".join(l["text"] for l in sc["lines"])
        if isinstance(o.get("reels"), str):          # リールの文字は「|」区切り（どのテンプレートでも）
            o["reels"] = o["reels"].split("|")
        if o.get("machine") and t != "B" and o["machine"] in self.machines:   # どのテンプレートでも machine= で機種を指定できる
            sc["machine"] = self.machines[o["machine"]]
            ctx["machine"] = sc["machine"]
        if t == "B":
            sc["machine"] = self.machines[o["machine"]]
            sc["source"] = sc["machine"].get("source")
            ctx["machine"] = sc["machine"]
            ctx["year"] = int(sc["machine"]["year"])
        elif t == "D" and v == "stat":
            val = o.get("value")
            m = ctx.get("machine")
            spec = None
            if m:
                spec = next((s for s in m["specs"] if f"{val}%" in s["v"]), None)
            fact = None if spec else next((f for f in self.data.get("facts", []) if f["value"] == f"{val}%"), None)
            if fact:                        # 規制・ルールの数字は「衝撃」の出し方にする
                o.setdefault("tone", fact.get("tone", "shock"))
                o.setdefault("tag", "NEW RULE")
            o.setdefault("prefix", "約" if (spec and spec["v"].startswith("約")) else "")
            o.setdefault("label", spec["k"] if spec else (fact["label"] if fact else "注目の数字"))
            o.setdefault("lines", self.data.get("explain", {}).get(o["label"], []))
            if isinstance(o["lines"], str):
                o["lines"] = o["lines"].split("|")
            sc["source"] = self.data.get("compare_source") if fact else (m.get("source") if m else None)
            sc["machine"] = m if spec else None          # 機種の数字なら、その機種の写真を添える
        elif t == "D" and v == "compare":
            items = []
            m = ctx.get("machine")
            pl = o.get("pcts", re.findall(r"([0-9]+(?:\.[0-9]+)?)%", text))
            for p in (pl.split(",") if isinstance(pl, str) else pl):
                spec = next((s for s in (m["specs"] if m else []) if f"{p}%" in s["v"]), None)
                if spec:
                    items.append({"tag": m.get("compare_tag", ""), "name": m["name"].replace("CR", ""),
                                  "label": spec["k"], "value": spec["v"], "key": True})
                    continue
                fact = next((f for f in self.data.get("facts", []) if f["value"] == f"{p}%"), None)
                if fact:
                    items.append(dict(fact))
            o["items"] = items
            sc["machine"] = m
            if "違う" in text and "note" not in o:
                vals = "と".join(i["value"].replace("約", "") for i in items)
                o.setdefault("note", f"※{vals}は数え方が違う指標。単純な比較はできない")
            o.setdefault("heading", self.data.get("compare_heading"))
            sc["source"] = self.data.get("compare_source")
        elif t == "C" and v == "calendar":
            year = int(o.get("year", ctx.get("year", 2016)))
            evs = [e for e in self.data.get("events", []) if e["date"].startswith(str(year))]
            focus = int(o.get("focus") or o.get("month") or (int(evs[-1]["date"][5:7]) if evs else 1))
            months_ev = [int(e["date"][5:7]) for e in evs if int(e["date"][5:7]) <= focus]
            first = min(months_ev + [focus])
            o.update({"year": year, "focus": focus,
                      "months": o.get("months", list(range(first, focus + 1))[-3:]),
                      "marks": {str(int(e["date"][5:7])): e["label"] for e in evs}})
            if isinstance(o["months"], str):
                o["months"] = [int(x) for x in o["months"].split(",")]
            ctx["event"] = next((e for e in evs if int(e["date"][5:7]) == focus), None)
            ev = ctx["event"]
            if ev and ev.get("turn") and "intro" not in o:      # 転換点の月は、リールの導入演出から入る
                o["intro"] = "era_shift"
                o.setdefault("reels", f"{year}年|{focus}月|{ev.get('short', ev['label'])}")
            if isinstance(o.get("reels"), str):
                o["reels"] = o["reels"].split("|")
            ctx["year"] = year
        elif t == "E":
            ev = ctx.get("event")
            if ev:
                y, mo = ev["date"][:4], int(ev["date"][5:7])
                o.setdefault("heading", f"{y}年{mo}月〜 {ev['label']}")
                o.setdefault("sub", ev.get("sub"))
                o.setdefault("note", ev.get("note"))
            o.setdefault("heading", "ポイント")
            if "items" not in o:
                body = text.split("。", 1)[1] if "。" in text else text
                parts = [p.strip("。 ") for p in re.split(r"で、|、", body) if p.strip("。 ")]
                o["items"] = [mark_numbers(p) for p in parts]
            elif isinstance(o["items"], str):
                o["items"] = o["items"].split("|")
        elif t == "F":
            o.setdefault("tag", "TALK")

    # ---------------------------------------------------------- 全体
    def plan(self):
        items = parse(self.ep / "script.txt")
        scenes, cur, pending, ctx = [], None, None, {"first": True}
        pause_next = 0.0
        manual = False
        n = 0
        overlay, ov_line, clear_line = None, False, False          # @show … mode=side/top/background と @clear
        for it in items:
            c = it["cmd"]
            if c == "line":
                n += 1
                ln = {"id": f"{n:03d}", "who": it["who"], "exclaim": it["exclaim"], "text": it["text"],
                      "pre": pause_next + float(it.get("voice", {}).get("pre", 0) or 0), "mood": it.get("voice", {}).get("mood")}
                pause_next = 0.0
                if pending:
                    t, _, var = pending["cmd"].partition(":")
                    cur = {"template": t, "variant": var or VARIANT[t],
                           "opts": dict(pending["opts"]), "lines": [], "hosts": dict(pending.get("hosts", {})),
                           "trans": pending.get("trans", TRANS[t]), "_trans_set": "trans" in pending,
                           "moments": pending.get("moments", [])}
                    if t == "B" and "machine" not in cur["opts"]:
                        cur["opts"]["machine"] = self.find_machine(ln["text"])
                    if overlay and t != "I":
                        cur["overlay"] = dict(overlay)
                    scenes.append(cur)
                    pending = None
                    ov_line = clear_line = False
                elif manual and cur is not None:       # @manual：シーンは台本の @ 行だけで切り替える
                    if ov_line and overlay and cur["template"] != "I":     # 同じシーンの途中から重ねる
                        cur["overlay"] = dict(overlay, from_line=ln["id"])
                    if clear_line and cur.get("overlay"):
                        cur["overlay"]["until_line"] = ln["id"]
                    ov_line = clear_line = False
                else:
                    t, var, o, new = self.auto(ln, cur, ctx)
                    if new or cur is None:
                        cur = {"template": t, "variant": var or "", "opts": o, "lines": [], "hosts": {}, "trans": TRANS[t],
                               "auto": True}
                        scenes.append(cur)
                cur["lines"].append(ln)
                ctx["first"] = False
            elif c == "manual":
                manual = True
            elif c == "show":                       # @show history:hall_2008 mode=full
                from .images import DEFAULT_MODE, SCENE_MODES, split_ref
                ref = next((k for k, v in it["opts"].items() if v is True and ":" in k), None)
                if not ref:
                    raise ValueError("@show の後に type:key を書く（例 @show history:hall_2008）")
                typ, key = split_ref(ref)
                d = self.data.get("images", {}).get(ref) or self.data.get("images", {}).get(key) or {}
                mode = it["opts"].get("mode") or d.get("display_mode") or DEFAULT_MODE[typ]
                o = {k: v for k, v in it["opts"].items() if v is not True}
                o.update({"ref": ref, "mode": mode})
                if typ == "gallery":
                    o["items"] = d.get("items", [])
                if mode in SCENE_MODES:
                    pending = {"cmd": "I", "opts": o}
                else:
                    overlay = {"ref": ref, "mode": mode}
                    ov_line = not pending
            elif c == "clear":                      # 重ね表示を終える
                overlay = None
                clear_line = True
            elif re.fullmatch(r"[A-Z](:\w+)?", c):
                pending = it
            elif c == "host" and cur is not None:
                o = it["opts"]
                who = next(k for k in o if k in ("nagi", "baku"))
                cfg = {"show": not o.get("off")}
                for k in ("size", "alpha"):
                    if k in o:
                        cfg[k] = float(o[k]) if k == "alpha" else int(o[k])
                for k in ("from", "until"):          # 表示時間（秒 または セリフ中の語句）
                    if k in o:
                        cfg[k] = o[k]
                if "pos" in o:
                    cfg["pos"] = o["pos"]
                cfg["force"] = True
                (pending.setdefault("hosts", {}) if pending else cur["hosts"])[who] = cfg
            elif c == "pause":                      # @pause 1.0 → 次のセリフの前に間をあける（演出を見せる）
                pause_next = float(next(iter(it["opts"])))
            elif c == "moment":                     # @moment analysis at="65%" box=x,y,w,h
                name = next(k for k, v in it["opts"].items() if v is True)
                mo = {"name": name, **{k: v for k, v in it["opts"].items() if v is not True}}
                if pending:
                    pending.setdefault("moments", []).append(mo)
                elif cur is not None:
                    cur.setdefault("moments", []).append(mo)
            elif c == "trans":
                kind = next(iter(it["opts"]))
                if pending:
                    pending["trans"] = kind
                elif cur is not None:
                    cur["trans"] = kind
        ctx = {}
        for sc in scenes:
            self.fill(sc, ctx)
        self.timing(scenes)
        return scenes

    def timing(self, scenes):
        t = 0.0
        prev_who = None
        for k, sc in enumerate(scenes):
            if k > 0 and sc["opts"].get("intro") == "chapter":     # 章の終わりに一呼吸（data.json の chapter_rest）
                scenes[k - 1]["dur"] += float(self.data.get("chapter_rest", 0.0))
                t += float(self.data.get("chapter_rest", 0.0))
            sc["start"] = t
            lt = t + (0.15 if sc is not scenes[0] else 0.3)
            lt += INTROS.get(sc["opts"].get("intro"), 0.0)          # 導入演出（リールなど）の間はナレーションを待つ
            for ln in sc["lines"]:
                if prev_who and ln["who"] != prev_who:          # 話者が替わるときは少し長めの間（data.json の turn_gap）
                    lt += max(0.0, float(self.data.get("turn_gap", GAP)) - GAP)
                prev_who = ln["who"]
                vp = self.ep / "voices" / f"{ln['id']}.wav"
                ln["voice"] = str(vp) if vp.exists() else None
                ln["dur"] = wav_len(vp) if vp.exists() else est_len(ln["who"], ln["text"])
                lt += ln.get("pre", 0.0)
                ln["start"] = lt
                lt += ln["dur"] + GAP
            end = max(lt + 0.1, t + MIN_DUR[sc["template"]])
            sc["dur"] = end - t
            t = end
        return t
