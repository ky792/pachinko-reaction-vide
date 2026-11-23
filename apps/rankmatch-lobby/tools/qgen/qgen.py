#!/usr/bin/env python3
"""大学受験（共通テスト水準）の4択問題を Claude で量産するパイプライン。

  ingest    手書きの問題（JSON）を下書きに取り込む（API 不要）
  plan      単元ごとの不足数と概算コストを表示（API は呼ばない）
  audit     既存問題の水準を判定（中学レベルの差し替え候補を出す）
  generate  単元ごとに問題を下書き                → work/drafts.jsonl
  verify    答えを伏せて別に解かせ、機械チェック  → work/verified.json
  approve   （任意）検算を通った問題をまとめて採用 → work/approved.json
            ※ふだんは review.html で人が1問ずつ見て approved.json を書き出す
  export    approved.json → data/questions-gen.js（index.html に読み込み追加）

API を呼ぶ処理は既定で Message Batches（料金半額、完了まで最大24時間）。
少量を急ぐときは --sync。キーは環境変数 ANTHROPIC_API_KEY から読む。
"""
import argparse
import difflib
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = HERE / "work"
REMAP = {}  # 旧単元 → 新単元（data/curriculum.js の UNIT_REMAP）
MODEL = os.environ.get("QGEN_MODEL", "claude-opus-5-5")
PREFIX = {"国語": "j", "数学": "m", "英語": "e", "理科": "s", "社会": "x"}
TARGET = {3: 16, 2: 10, 1: 6}          # 単元の目標問題数（★ごと）
PER_CALL = 8                           # 1リクエストで作る最大問数
LONG_UNITS = {"評論読解", "小説読解", "長文読解", "掲示・広告の読み取り"}
# 1問あたりの概算トークン（思考込み）。料金は Opus 5.5 の $4/$20 per MTok、Batches は半額。
EST = {"gen": (1500 / PER_CALL + 200, 900), "verify": (450, 700), "audit": (300, 400)}
PRICE = (4.0, 20.0)

DIFF_TEXT = {
    1: "基礎：共通テストの易しい小問レベル（教科書の基本事項を正確に使えれば解ける）",
    2: "標準：共通テストの平均的な設問レベル（2段階の思考、典型的な引っかけを見抜く）",
    3: "発展：共通テストの難しめの設問〜国公立二次の基礎レベル（複数の知識の組み合わせ）",
}

SYSTEM_GEN = """あなたは大学入学共通テスト対策の作問者です。スマホの学習アプリで出題する4択問題を作ります。

必ず守ること:
- 高校の学習指導要領の範囲で、共通テストで問われる水準にする。中学レベルの易しすぎる問題は作らない。
- 答えがただ1つに決まる。誤答3つは「よくある勘違い・計算ミス・似た用語」から作り、明らかに変な選択肢は入れない。
- 「すべて正しい」「どれでもない」「以上のいずれも」のような選択肢は使わない。
- 正答だけが極端に長い・詳しい、などで答えが推測できないようにする（4つの長さと書き方をそろえる）。
- 問題文だけで完結させる。図・表・グラフ・画像は使えない。数式は x^2, √3, log₂8, sin30°, ∫ のように1行のテキストで書く。
- 問題文は120字程度まで（読解系の単元のみ、本文込みで400字・英文80語程度まで可）。選択肢は1つ40字程度まで。
- 実在の入試問題や市販教材の文章をそのまま写さない。読解の本文はオリジナルで書く。
- 英語の問題は、指示は日本語、問われる英文は英語で書く。
- 解説は80字程度で、なぜその答えになるか（誤答のどこが違うか）を一言で示す。
- 既存の問題と同じ内容・同じ数値の問題は作らない。扱う知識や切り口を散らす。
- correct には正答の選択肢、wrong には誤答3つを入れる（並べ替えはアプリ側でする）。"""

SYSTEM_VERIFY = """あなたは共通テスト問題の校閲者です。4択問題を、正解を知らされずに自分で解いてください。
そのうえで、問題として欠陥がないか確かめます。
- answer: 正しいと判断した選択肢の記号（A〜D）
- confidence: 自分の答えへの確信（high / mid / low）
- issues: 当てはまる欠陥をすべて。なければ空配列。
  multiple_correct（正解が複数ありうる） / no_correct（正解がない） / factual_error（事実・計算の誤り）
  ambiguous（問題文があいまい） / too_easy（中学レベル以下） / out_of_scope（高校範囲外・共通テストで問われない）
  answer_leak（選択肢の形から答えが推測できる） / needs_figure（図表がないと解けない）
- note: 気づいたことを60字程度で（なければ空文字）"""

SYSTEM_AUDIT = """あなたは大学受験の教科指導の専門家です。4択問題の水準を判定してください。
level: middle（中学レベル）/ basic（高校基礎・共通テストの易問）/ standard（共通テスト標準）/ advanced（共通テスト難問・二次基礎）
ok: 問題として正しく成立しているか（答えが1つに決まり、事実誤りがない）
note: 気づいたこと（30字程度、なければ空文字）"""

GEN_SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "difficulty": {"type": "integer", "enum": [1, 2, 3]},
            "q": {"type": "string"},
            "correct": {"type": "string"},
            "wrong": {"type": "array", "items": {"type": "string"}},
            "explain": {"type": "string"},
        },
        "required": ["difficulty", "q", "correct", "wrong", "explain"],
        "additionalProperties": False,
    }}},
    "required": ["questions"],
    "additionalProperties": False,
}
ISSUES = ["multiple_correct", "no_correct", "factual_error", "ambiguous", "too_easy",
          "out_of_scope", "answer_leak", "needs_figure"]
VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "enum": ["A", "B", "C", "D"]},
        "confidence": {"type": "string", "enum": ["high", "mid", "low"]},
        "issues": {"type": "array", "items": {"type": "string", "enum": ISSUES}},
        "note": {"type": "string"},
    },
    "required": ["answer", "confidence", "issues", "note"],
    "additionalProperties": False,
}
AUDIT_SCHEMA = {
    "type": "object",
    "properties": {
        "level": {"type": "string", "enum": ["middle", "basic", "standard", "advanced"]},
        "ok": {"type": "boolean"},
        "note": {"type": "string"},
    },
    "required": ["level", "ok", "note"],
    "additionalProperties": False,
}


# ---------- 共通 ----------
def load_state():
    out = subprocess.run(["node", str(HERE / "dump_bank.js"), "--base"], cwd=ROOT, capture_output=True, text=True, check=True)
    d = json.loads(out.stdout)
    units = []
    for subject, fields in d["curriculum"].items():
        for f in fields:
            for u in f["units"]:
                units.append({"subject": subject, "field": f["field"], "unit": u["name"], "weight": u["weight"]})
    global REMAP
    REMAP = d.get("remap", {})
    return d["bank"], units


def read_json(p, default):
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def write_json(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")


def read_jsonl(p):
    return [json.loads(l) for l in p.read_text("utf-8").splitlines() if l.strip()] if p.exists() else []


def norm(s):
    s = unicodedata.normalize("NFKC", s).lower()
    return re.sub(r"[\s、。，．,.?？!！「」『』（）()]", "", s)


def cnorm(s):
    """選択肢の比較用：大文字小文字・小数点は区別する（Aa と AA、1.4 と 14 は別物）。"""
    return re.sub(r"\s", "", unicodedata.normalize("NFC", s))  # NFKC だと 3ⁿ と 3n が同じになる


def qid(subject, q):
    return f"{PREFIX[subject]}g{hashlib.sha1(norm(q).encode()).hexdigest()[:6]}"


def retired_ids():
    return set(read_json(WORK / "retire.json", []))


def unit_key(u):
    return f"{u['subject']}/{u['unit']}"


def needs(bank, units, gen_counts=None):
    gone = retired_ids()
    gen_counts = gen_counts or {}
    rows = []
    for u in units:
        have = sum(1 for q in bank if q["subject"] == u["subject"] and q["unit"] == u["unit"] and q["id"] not in gone)
        have += gen_counts.get(unit_key(u), 0)
        rows.append({**u, "have": have, "need": max(0, TARGET[u["weight"]] - have)})
    return sorted(rows, key=lambda r: (-r["weight"], -r["need"], r["subject"]))


def pending_counts(bank):
    """書き出し前の下書き数（すでに data/ に入った id と fail は数えない）。"""
    in_bank = {q["id"] for q in bank}
    failed = {v["id"] for v in read_json(WORK / "verified.json", []) if v["status"] == "fail"}
    out = {}
    for d in read_jsonl(WORK / "drafts.jsonl"):
        if d["id"] not in in_bank and d["id"] not in failed:
            k = d["subject"] + "/" + d["unit"]
            out[k] = out.get(k, 0) + 1
    return out


def cost(kind, n, batch=True):
    i, o = EST[kind]
    usd = n * (i * PRICE[0] + o * PRICE[1]) / 1e6
    return usd / 2 if batch else usd


def client():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY が設定されていません。")
    import anthropic
    return anthropic.Anthropic()


def params(system, user, schema, max_tokens):
    return {
        "model": MODEL,
        "max_tokens": max_tokens,
        "thinking": {"type": "adaptive"},
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
    }


def run_requests(reqs, sync, label):
    """reqs: [(custom_id, params)] → {custom_id: parsed_json or None}。"""
    if not reqs:
        return {}
    c = client()
    out = {}
    if sync:
        def one(item):
            cid, p = item
            for attempt in range(3):
                try:
                    with c.messages.stream(**p) as s:
                        m = s.get_final_message()
                    return cid, parse_msg(m)
                except Exception as e:  # noqa: BLE001 - 一時的なエラーは再試行
                    print(f"  [{cid}] {type(e).__name__}: {e}", file=sys.stderr)
                    time.sleep(2 ** attempt * 3)
            return cid, None
        with ThreadPoolExecutor(max_workers=4) as ex:
            for i, (cid, res) in enumerate(ex.map(one, reqs), 1):
                out[cid] = res
                print(f"  {label} {i}/{len(reqs)}", end="\r", file=sys.stderr)
        print(file=sys.stderr)
        return out

    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    batch = c.messages.batches.create(requests=[
        Request(custom_id=cid, params=MessageCreateParamsNonStreaming(**p)) for cid, p in reqs])
    (WORK / "last_batch.txt").write_text(f"{label} {batch.id}\n", "utf-8")
    print(f"  Batch {batch.id} を送信（{len(reqs)}件）。完了を待ちます…", file=sys.stderr)
    while True:
        b = c.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        rc = b.request_counts
        print(f"  処理中 {rc.processing} / 成功 {rc.succeeded} / 失敗 {rc.errored}", end="\r", file=sys.stderr)
        time.sleep(30)
    print(file=sys.stderr)
    for r in c.messages.batches.results(batch.id):
        out[r.custom_id] = parse_msg(r.result.message) if r.result.type == "succeeded" else None
        if r.result.type != "succeeded":
            print(f"  [{r.custom_id}] {r.result.type}", file=sys.stderr)
    return out


def parse_msg(m):
    if m.stop_reason == "refusal":
        return None
    if m.stop_reason == "max_tokens":
        print("  max_tokens で途中終了した応答を捨てました", file=sys.stderr)
        return None
    text = next((b.text for b in m.content if b.type == "text"), "")
    return json.loads(text)


def cid_safe(s):
    return re.sub(r"[^A-Za-z0-9_-]", "_", s)[:64]


# ---------- plan ----------
def cmd_plan(a):
    bank, units = load_state()
    rows = needs(bank, units, pending_counts(bank))
    total = sum(r["need"] for r in rows)
    print(f"{'科目':<4} {'単元':<14} ★  既存(+下書き) 不足")
    for r in rows:
        if r["need"] or a.all:
            print(f"{r['subject']:<4} {r['unit']:<14} {r['weight']}  {r['have']:>4}         {r['need']:>3}")
    print(f"\n不足合計 {total} 問（目標 ★3={TARGET[3]} ★2={TARGET[2]} ★1={TARGET[1]}）")
    print(f"概算コスト（Batches・半額）: 下書き ${cost('gen', total):.2f} + 検算 ${cost('verify', total):.2f}"
          f" = ${cost('gen', total) + cost('verify', total):.2f}")
    print(f"既存問題の水準判定（audit）: ${cost('audit', len(bank)):.2f}（{len(bank)}問）")


# ---------- audit ----------
def cmd_audit(a):
    bank, _ = load_state()
    done = read_json(WORK / "audit.json", {})
    todo = [q for q in bank if q["id"] not in done]
    if a.limit:
        todo = todo[: a.limit]
    print(f"水準判定 {len(todo)}問 概算 ${cost('audit', len(todo), not a.sync):.2f}")
    reqs = []
    for q in todo:
        user = (f"科目: {q['subject']} / 単元: {q['unit']}\n問題: {q['q']}\n"
                f"正答: {q['choices'][q['answer']]}\n誤答: {' / '.join(c for i, c in enumerate(q['choices']) if i != q['answer'])}")
        reqs.append((cid_safe(q["id"]), params(SYSTEM_AUDIT, user, AUDIT_SCHEMA, 4000)))
    res = run_requests(reqs, a.sync, "audit")
    by_cid = {cid_safe(q["id"]): q["id"] for q in todo}
    for cid, r in res.items():
        if r:
            done[by_cid[cid]] = r
    write_json(WORK / "audit.json", done)
    mid = [i for i, r in done.items() if r["level"] == "middle" or not r["ok"]]
    print(f"判定済み {len(done)}問。中学レベルまたは不備: {len(mid)}問 → work/audit.json")
    # 中学レベル／不備の問題を差し替え候補に。retire は export 時に、置き換えが揃った単元だけ適用する。
    write_json(WORK / "retire_candidates.json", mid)


# ---------- generate ----------
def split_counts(n):
    """難度配分：基礎25% 標準45% 発展30%。"""
    d3 = round(n * 0.30)
    d1 = round(n * 0.25)
    return {1: d1, 2: n - d1 - d3, 3: d3}


def cmd_generate(a):
    bank, units = load_state()
    drafts = read_jsonl(WORK / "drafts.jsonl")
    gc = pending_counts(bank)
    cands = read_json(WORK / "retire_candidates.json", [])
    rows = needs(bank, units, gc)
    # 差し替え候補の分も作る（その単元で retire される数だけ上乗せ）
    for r in rows:
        r["need"] += sum(1 for q in bank if q["id"] in cands and q["subject"] == r["subject"] and q["unit"] == r["unit"])
    if a.units:
        want = set(a.units.split(","))
        rows = [r for r in rows if unit_key(r) in want or r["unit"] in want]
    if a.min_weight:
        rows = [r for r in rows if r["weight"] >= a.min_weight]
    rows = [r for r in rows if r["need"] > 0][: a.max_units or None]
    if a.per_unit:
        for r in rows:
            r["need"] = min(r["need"], a.per_unit)
    total = sum(r["need"] for r in rows)
    print(f"{len(rows)}単元・{total}問を下書き 概算 ${cost('gen', total, not a.sync):.2f}")
    if a.dry_run:
        for r in rows:
            print(f"  {unit_key(r)} ★{r['weight']} {r['need']}問")
        return
    reqs, meta = [], {}
    for r in rows:
        existing = [q["q"] for q in bank if q["subject"] == r["subject"] and q["unit"] == r["unit"]]
        existing += [d["q"] for d in drafts if d["subject"] == r["subject"] and d["unit"] == r["unit"]]
        left, part = r["need"], 0
        while left > 0:
            n = min(PER_CALL, left)
            left -= n
            part += 1
            mix = split_counts(n)
            user = (f"科目: {r['subject']}\n分野: {r['field']}\n単元: {r['unit']}\n\n"
                    f"この単元の問題を{n}問作ってください。難度の内訳:\n"
                    + "\n".join(f"- difficulty {k}（{DIFF_TEXT[k]}）: {v}問" for k, v in mix.items() if v)
                    + ("\n\n読解の単元なので、短いオリジナル本文を問題文に含めてください。" if r["unit"] in LONG_UNITS else "")
                    + "\n\nこの単元の既存の問題（内容が重ならないように）:\n"
                    + ("\n".join(f"- {e}" for e in existing[-40:]) or "（なし）"))
            cid = cid_safe(f"g{len(reqs):04d}")
            meta[cid] = r
            reqs.append((cid, params(SYSTEM_GEN, user, GEN_SCHEMA, 32000)))
    res = run_requests(reqs, a.sync, "generate")
    n_ok = 0
    with open(WORK / "drafts.jsonl", "a", encoding="utf-8") as f:
        for cid, r in res.items():
            if not r:
                continue
            u = meta[cid]
            for q in r["questions"]:
                row = {"id": qid(u["subject"], q["q"]), "subject": u["subject"], "field": u["field"],
                       "unit": u["unit"], "weight": u["weight"], **q, "model": MODEL}
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
                n_ok += 1
    print(f"下書き {n_ok}問を追加 → work/drafts.jsonl")


# ---------- ingest（手書き・API を使わない下書き）----------
def cmd_ingest(a):
    """{科目: [[単元, 難度, 問題, [正答, 誤答, 誤答, 誤答], 解説], ...]} の JSON を drafts.jsonl に追加。"""
    _, units = load_state()
    info = {(u["subject"], u["unit"]): u for u in units}
    have = {d["id"] for d in read_jsonl(WORK / "drafts.jsonl")}
    src = json.loads(Path(a.file).read_text("utf-8"))
    n = 0
    with open(WORK / "drafts.jsonl", "a", encoding="utf-8") as f:
        for subject, rows in src.items():
            for unit, diff, q, choices, explain in rows:
                k = f"{subject}/{unit}"
                if k in REMAP:
                    if REMAP[k] is None:
                        continue  # 共通テストで問われないので外した単元
                    unit = REMAP[k]
                u = info.get((subject, unit))
                if not u:
                    sys.exit(f"カリキュラムにない単元: {subject}/{unit}")
                row = {"id": qid(subject, q), "subject": subject, "field": u["field"], "unit": unit, "weight": u["weight"],
                       "difficulty": diff, "q": q, "correct": choices[0], "wrong": choices[1:], "explain": explain,
                       "model": a.author}
                if row["id"] in have:
                    continue
                have.add(row["id"])
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
                n += 1
    print(f"{n}問を drafts.jsonl に追加（{a.file}）")


# ---------- verify ----------
BANNED = re.compile(r"すべて(正しい|誤り)|どれでもない|以上のいずれ|いずれも(正しい|誤り)|all of the above|none of the above", re.I)


def local_checks(d, pool):
    """機械チェック。致命的なら fail、怪しいなら flag の理由を返す。"""
    fail, flag = [], []
    ch = [d["correct"], *d["wrong"]]
    if len(d["wrong"]) != 3:
        fail.append("誤答が3つでない")
    if any(not c.strip() for c in ch) or len({cnorm(c) for c in ch}) != len(ch):
        fail.append("選択肢が空か重複")
    if BANNED.search(" ".join(ch)):
        fail.append("「すべて／どれでもない」系の選択肢")
    lim = 420 if d["unit"] in LONG_UNITS else 160
    if len(d["q"]) > lim:
        flag.append(f"問題文が長い（{len(d['q'])}字）")
    if max(len(c) for c in ch) > 60:
        flag.append("選択肢が長い")
    others = max(len(c) for c in d["wrong"]) if d["wrong"] else 1
    if len(d["correct"]) > max(12, others * 1.7):
        flag.append("正答だけ長い")
    if len(d["explain"]) < 8:
        flag.append("解説が短い")
    if re.search(r"(下|右|左|上|次|この)の(図|表|グラフ)|図[0-9０-９]|図のよう|表のよう", d["q"]):
        flag.append("図表を参照している")
    # 「古文の「○○」の意味は？」のような定型の問題文は似て当然なので、正答も含めて比べる
    nq = norm(d["q"]) + "|" + norm(d["correct"])
    for other_id, other_q in pool:
        nums = lambda t: re.findall(r"\d+(?:\.\d+)?", t.split("|")[0])
        if other_id != d["id"] and nums(nq) == nums(other_q) and difflib.SequenceMatcher(None, nq, other_q).ratio() > 0.9:
            fail.append(f"既存と重複（{other_id}）")
            break
    return fail, flag


def cmd_verify(a):
    bank, _ = load_state()
    drafts = read_jsonl(WORK / "drafts.jsonl")
    done = {v["id"]: v for v in read_json(WORK / "verified.json", [])}
    seen, uniq = set(), []
    for d in drafts:  # 同一問題（同じ id）は最初の1件だけ
        if d["id"] not in seen:
            seen.add(d["id"])
            uniq.append(d)
    todo = [d for d in uniq if d["id"] not in done]
    if a.limit:
        todo = todo[: a.limit]
    print(f"検算 {len(todo)}問" + ("（機械チェックのみ）" if a.no_api else f" 概算 ${cost('verify', len(todo), not a.sync):.2f}"))
    pool_by_unit = {}
    for q in bank:
        pool_by_unit.setdefault((q["subject"], q["unit"]), []).append((q["id"], norm(q["q"]) + "|" + norm(q["choices"][q["answer"]])))
    for d in uniq:
        pool_by_unit.setdefault((d["subject"], d["unit"]), []).append((d["id"], norm(d["q"]) + "|" + norm(d["correct"])))

    reqs, order = [], {}
    for d in todo:
        ch = [d["correct"], *d["wrong"]]
        idx = list(range(len(ch)))
        random.Random(d["id"]).shuffle(idx)
        letters = "ABCD"
        order[d["id"]] = letters[idx.index(0)] if len(ch) == 4 else "?"
        user = (f"科目: {d['subject']} / 単元: {d['unit']}\n\n{d['q']}\n\n"
                + "\n".join(f"{letters[i]}. {ch[j]}" for i, j in enumerate(idx[:4])))
        reqs.append((cid_safe(d["id"]), params(SYSTEM_VERIFY, user, VERIFY_SCHEMA, 16000)))
    res = run_requests(reqs, a.sync, "verify") if todo and not a.no_api else {}
    for d in todo:
        fail, flag = local_checks(d, pool_by_unit.get((d["subject"], d["unit"]), []))
        v = res.get(cid_safe(d["id"]))
        if v is None:
            if not a.no_api:
                flag.append("検算できなかった")
        else:
            hard = {"multiple_correct", "no_correct", "factual_error", "needs_figure"}
            if v["answer"] != order[d["id"]]:
                fail.append(f"別解答（検算は{v['answer']}、正答は{order[d['id']]}）")
            if hard & set(v["issues"]):
                fail.append("検算の指摘: " + ",".join(sorted(hard & set(v["issues"]))))
            soft = set(v["issues"]) - hard
            if soft:
                flag.append("検算の指摘: " + ",".join(sorted(soft)))
            if v["confidence"] == "low":
                flag.append("検算の確信が低い")
        status = "fail" if fail else "flag" if flag else "pass"
        done[d["id"]] = {**d, "status": status, "reasons": fail + flag, "check": v}
    out = list(done.values())
    write_json(WORK / "verified.json", out)
    cnt = {s: sum(1 for v in out if v["status"] == s) for s in ("pass", "flag", "fail")}
    print(f"pass {cnt['pass']} / flag {cnt['flag']} / fail {cnt['fail']} → work/verified.json")
    print("次: tools/qgen/review.html を開いて verified.json を読み込み、レビューして approved.json を書き出す")


# ---------- approve（一括）----------
def cmd_approve(a):
    v = read_json(WORK / "verified.json", [])
    ok = [x for x in v if x["status"] == "pass"]
    write_json(WORK / "approved.json", [{k: x[k] for k in ("id", "subject", "unit", "difficulty", "q", "correct", "wrong", "explain")} for x in ok])
    print(f"pass の {len(ok)}問を approved.json に書き出しました（人のレビューを省略）")


# ---------- export ----------
def js(s):
    return json.dumps(s, ensure_ascii=False)


def cmd_export(a):
    bank, units = load_state()
    path = Path(a.approved) if a.approved else WORK / "approved.json"
    approved = read_json(path, [])
    if not approved:
        sys.exit(f"{path} に採用済みの問題がありません")
    known = {(u["subject"], u["unit"]) for u in units}
    approved = [q for q in approved if (q["subject"], q["unit"]) in known]
    # 差し替え：中学レベル判定の既存問題は、その単元の新しい問題が retire 後も目標の半分以上あるときだけ外す
    cands = set(read_json(WORK / "retire_candidates.json", []))
    new_by_unit = {}
    for q in approved:
        new_by_unit[(q["subject"], q["unit"])] = new_by_unit.get((q["subject"], q["unit"]), 0) + 1
    w = {(u["subject"], u["unit"]): u["weight"] for u in units}
    retire = []
    for q in bank:
        k = (q["subject"], q["unit"])
        if q["id"] in cands and new_by_unit.get(k, 0) >= TARGET[w.get(k, 1)] // 2:
            retire.append(q["id"])
    write_json(WORK / "retire.json", retire)

    lines = [
        "/* AI で作成し、検算と人のレビューを通した問題（tools/qgen/qgen.py export で生成。手で編集しない）。",
        " * 書式：[id, 単元, 難度, 問題, [正答, 誤答, 誤答, 誤答], 解説]。RETIRE は中学レベルとして差し替えた既存問題。 */",
        "(function () {",
        "  const BANK = window.QUESTION_BANK;",
        f"  const RETIRE = new Set({js(retire)});",
        "  for (let i = BANK.length - 1; i >= 0; i--) if (RETIRE.has(BANK[i].id)) BANK.splice(i, 1);",
        "  const add = (subject, rows) => rows.forEach(([id, unit, difficulty, q, choices, explain]) =>",
        "    BANK.push({ id, subject, unit, difficulty, q, choices, answer: 0, explain }));",
    ]
    for subject in PREFIX:
        rows = sorted((q for q in approved if q["subject"] == subject), key=lambda q: (q["unit"], q["difficulty"], q["id"]))
        if not rows:
            continue
        lines.append(f"\n  add({js(subject)}, [")
        for q in rows:
            lines.append(f"    [{js(q['id'])}, {js(q['unit'])}, {q['difficulty']}, {js(q['q'])}, "
                         f"{js([q['correct'], *q['wrong']])}, {js(q['explain'])}],")
        lines.append("  ]);")
    lines.append("})();\n")
    out = ROOT / "data" / "questions-gen.js"
    out.write_text("\n".join(lines), "utf-8")

    html = ROOT / "index.html"
    t = html.read_text("utf-8")
    if "data/questions-gen.js" not in t:
        t = t.replace('<script src="data/questions-2.js"></script>',
                      '<script src="data/questions-2.js"></script>\n<script src="data/questions-gen.js"></script>', 1)
        html.write_text(t, "utf-8")
    print(f"{len(approved)}問を data/questions-gen.js に書き出し（差し替え {len(retire)}問）")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("plan"); s.add_argument("--all", action="store_true"); s.set_defaults(f=cmd_plan)
    s = sp.add_parser("audit"); s.add_argument("--limit", type=int); s.add_argument("--sync", action="store_true"); s.set_defaults(f=cmd_audit)
    s = sp.add_parser("generate")
    s.add_argument("--units", help="科目/単元 または 単元名をカンマ区切り")
    s.add_argument("--min-weight", type=int, help="★がこの値以上の単元だけ")
    s.add_argument("--max-units", type=int)
    s.add_argument("--per-unit", type=int, help="1単元あたりの上限")
    s.add_argument("--sync", action="store_true")
    s.add_argument("--dry-run", action="store_true")
    s.set_defaults(f=cmd_generate)
    s = sp.add_parser("ingest"); s.add_argument("file"); s.add_argument("--author", default="manual"); s.set_defaults(f=cmd_ingest)
    s = sp.add_parser("verify"); s.add_argument("--limit", type=int); s.add_argument("--sync", action="store_true")
    s.add_argument("--no-api", action="store_true", help="機械チェックだけ（API を呼ばない・無料）"); s.set_defaults(f=cmd_verify)
    s = sp.add_parser("approve"); s.set_defaults(f=cmd_approve)
    s = sp.add_parser("export"); s.add_argument("--approved"); s.set_defaults(f=cmd_export)
    a = p.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    a.f(a)


if __name__ == "__main__":
    main()
