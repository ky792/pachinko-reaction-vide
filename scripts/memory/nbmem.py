#!/usr/bin/env python3
"""ナギバク共有記憶（nbmem）— GitHub 上の1つのファイルを、Claude・Claude Code・Codex・ChatGPT 共通の「正本」にする

正本は memory/store.json（構造化）。memory/MEMORY.md はそこから作る読みやすい版（AI が最初に読むもの）。
確定（正式反映）＝ main にマージされたもの。追加・変更は必ずブランチ＋プルリクエストで入る。

  python scripts/memory/nbmem.py context                 # 記憶を表示（セッション開始時に読む）
  python scripts/memory/nbmem.py extract FILE|-          # 会話テキストから「残すべき発言」を抜き出して候補にする（inbox に置く）
  python scripts/memory/nbmem.py propose --key K --category C --subject S --value V --quote Q [--replace]
  python scripts/memory/nbmem.py ingest                  # inbox の候補を正本に照合して反映（重複は統合・矛盾は CONFLICTS へ）
  python scripts/memory/nbmem.py resolve KEY --accept-new|--keep-old   # 矛盾を人が決める
  python scripts/memory/nbmem.py render                  # MEMORY.md / CONFLICTS.md を作り直す
  python scripts/memory/nbmem.py submit                  # 候補を main から切ったブランチに反映して PR を出す（gh が必要）
  python scripts/memory/nbmem.py hook-session-start      # Claude Code の SessionStart フック用
  python scripts/memory/nbmem.py hook-stop               # Claude Code の Stop フック用（標準入力の transcript_path を読む）

外部 API・課金なし（抜き出しは規則ベース。AI が自分で判断して propose / nbmem ブロックで渡すこともできる）。
個人情報・認証情報らしきものは、どの経路でも保存しない（scrub）。
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(os.environ.get("NBMEM_ROOT") or Path(__file__).resolve().parents[2])
MEM = ROOT / "memory"
STORE = MEM / "store.json"
INBOX = MEM / "inbox"
CATEGORIES = {
    "character": "キャラ設定",
    "style": "演出・見た目の好み",
    "production": "制作方針",
    "correction": "修正指示（過去の指摘）",
    "decision": "決定事項",
}
JST = dt.timezone(dt.timedelta(hours=9))


def now():
    return dt.datetime.now(JST).isoformat(timespec="seconds")


def today():
    return dt.datetime.now(JST).date().isoformat()


# ───────────────────────── 個人情報・認証情報のふるい
SECRET_PATTERNS = [
    (r"gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}", "GitHub トークン"),
    (r"sk-[A-Za-z0-9_\-]{16,}|sk-ant-[A-Za-z0-9_\-]{10,}", "API キー"),
    (r"AKIA[0-9A-Z]{16}", "AWS キー"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "秘密鍵"),
    (r"(?i)(password|passwd|パスワード|暗証番号|api[ _-]?key|APIキー|トークン|token|secret|シークレット)\s*[:：=は]", "認証情報"),
    (r"[\w.+-]+@[\w-]+\.[\w.-]+", "メールアドレス"),
    (r"(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|(?<!\d)0[789]0\d{8}(?!\d)", "電話番号"),
    (r"〒?\d{3}-\d{4}", "郵便番号"),
    (r"(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)", "カード番号らしき数字"),
    (r"(給料|給与|手取り|年収|月収|貯金|借金|ローン|口座)", "お金・収入"),
    (r"(病院|病気|通院|薬を|診断|持病)", "健康"),
    (r"(会社を辞め|退職|転職|勤務先|職場の)", "勤め先"),
    (r"(住所|自宅|最寄り駅|本名)", "住所・本名"),
]


def scrub_reason(text):
    """保存してはいけない内容なら理由を返す（なければ None）"""
    for pat, why in SECRET_PATTERNS:
        if re.search(pat, text):
            return why
    return None


# ───────────────────────── 文の正規化・比較
def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[\s、。，．,.!！?？「」『』（）()【】\[\]・…ー〜~\-]", "", s)
    return s.lower()


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


NEG = r"(不要|いらない|要らない|使わない|しない|なし|無し|禁止|NG|やめ|ダメ|だめ|入れない|出さない)"


def polarity(s):
    return -1 if re.search(NEG, s) else 1


POS = r"(入れてほしい|入れて欲しい|してほしい|して欲しい|にしてほしい|ほしい|欲しい|がいい|にしたい|にする|入れる|使う|出す|あり|有り)"


def core(s):
    """賛否の言い回しと助詞を外した中身（「サムネ案を毎回入れてほしい」「サムネ案は毎回いらない」→ どちらも サムネ案毎回）"""
    s = re.sub(NEG, "", norm(s))
    s = re.sub(POS, "", s)
    return re.sub(r"(は|を|が|に|で|も|の)", "", s)


def same_topic(a, b):
    ca, cb = core(a), core(b)
    if len(ca) < 3 or len(cb) < 3:
        return False
    return ca in cb or cb in ca or SequenceMatcher(None, ca, cb, autojunk=False).ratio() >= 0.75


# ───────────────────────── 話題（キー）を決める
# よく出る話題は決まったキーにまとめる（同じ話題の矛盾を見つけるため）。当てはまらなければ文から作る
TOPICS = [
    ("baku.first_person", r"バク.*一人称|一人称.*バク"),
    ("nagi.first_person", r"ナギ.*一人称|一人称.*ナギ"),
    ("baku.gender", r"バク.*(女の子|男の子|性別)"),
    ("nagi.eyes", r"ナギ.*(目を|目は|眠り目|目を開け)"),
    ("baku.speech", r"バク.*(関西弁|口調|喋り方|しゃべり方)"),
    ("nagi.speech", r"ナギ.*(標準語|口調|喋り方|しゃべり方)"),
    ("baku.voice", r"バク.*(声|ボイス)"),
    ("nagi.voice", r"ナギ.*(声|ボイス)"),
    ("voice.speed", r"(早口|話速|声.*倍速|読み上げの速さ)"),
    ("bgm.volume", r"BGM.*(大き|小さ|音量)"),
    ("telop.style", r"(テロップ|字幕).*(色|大きさ|フォント|位置)"),
    ("thumbnail", r"サムネ"),
    ("description", r"概要欄"),
    ("render.engine", r"(Remotion|映像エンジン)"),
    ("voice.hallucination", r"(ハルシネーション|余分な声|勝手に.*声)"),
]


def topic_key(text, category):
    for key, pat in TOPICS:
        if re.search(pat, text):
            return key
    return f"{category}.{hashlib.sha1(norm(text).encode()).hexdigest()[:8]}"


# ───────────────────────── 会話から抜き出す（規則ベース）
DURABLE = (r"(にしたい|がいい|のがいい|が好み|好き|嫌い|にして(ほしい|欲しい)?|してほしい|して欲しい|は不要|いらない|要らない|使わない|入れない|"
           r"禁止|NG|で行く|でいく|で決定|に決定|と決定|に決めた|で確定|採用|基準にしたい|今後|毎回|いつも|常に|必ず|絶対|呼ぶ|一人称|口調|"
           r"ルール|方針|べき|じゃなくて|ではなく|やめて|しないで|させないで|必要なくね|いらなくね|いらんくね|要らなくね|いらんやろ)")
TRANSIENT = (r"(今日|今回だけ|この回だけ|この動画だけ|とりあえず|一旦|いったん|試しに|作ってみて|見せて|やってみて|送って|疲れ|眠い|ねむい|"
             r"ありがとう|おはよう|おやすみ|こんにちは|すごい|いいね|了解|おけ|OK$|^w+$|草$|笑$)")


def category_of(s):
    if re.search(r"(じゃなくて|ではなく|違う|間違|直して|修正|やめて|しないで|させないで|NG|不評|必要なくね|いらなくね|いらんくね|要らなくね)", s):
        return "correction"
    if re.search(r"(で決定|に決定|と決定|で行く|でいく|採用|に決めた|で確定|基準にしたい)", s):
        return "decision"
    if re.search(r"(ナギ|バク|所長|レン|RNC|キャラ|一人称|口調|関西弁|標準語)", s):
        return "character"
    if re.search(r"(演出|BGM|テロップ|字幕|UI|色|フォント|画面|アニメ|効果音|SE|表情|背景|ドット|サムネ|オープニング|OP|エンディング)", s):
        return "style"
    return "production"


def split_sentences(text):
    parts = re.split(r"(?<=[。！!？?\n])|(?<=ね)\s+", text)
    return [p.strip(" \t\n　") for p in parts if p and p.strip()]


def extract(text, surface="chat", date=None):
    """会話テキスト（ユーザーの発言）→ 候補のリスト。一時的な発言・雑談・質問・個人情報は捨てる"""
    out, seen = [], set()
    for s in split_sentences(text):
        if len(norm(s)) < 6:
            continue
        if re.search(TRANSIENT, s):
            continue
        slang_neg = re.search(r"(必要なくね|いらなくね|いらんくね|要らなくね|いらんやろ)", s)
        q = (s.endswith(("？", "?", "かな", "かな？")) or re.search(r"(ある？|ない？|くね|くない？)$", s)) and not slang_neg
        if q and not re.search(r"(にしたい|してほしい|して欲しい)", s):
            continue
        if not re.search(DURABLE, s):
            continue
        # 指すものが会話の外にある短い文（「これを基準にしたい」）は、それだけでは記憶にならない
        if re.match(r"^(これ|それ|あれ|ここ|そこ|この|その|あの)", s) and len(norm(s)) < 16:
            continue
        # 中身の言葉（カタカナ2字以上・漢字2字以上・英字）がない文は捨てる
        if not re.search(r"[ァ-ヶー]{2,}|[一-龯]{2,}|[A-Za-z]{2,}", s):
            continue
        if scrub_reason(s):
            continue
        cat = category_of(s)
        key = topic_key(s, cat)
        if (key, norm(s)) in seen:
            continue
        seen.add((key, norm(s)))
        out.append({"key": key, "category": cat, "subject": subject_of(s, key), "value": s,
                    "source": {"surface": surface, "date": date or today(), "quote": s[:200]},
                    "replace": False})
    return out


def subject_of(s, key):
    if "." in key and not re.search(r"\.[0-9a-f]{8}$", key):
        return key
    m = re.match(r"(.{2,14}?)(は|が|を|の)", s)
    return m.group(1) if m else s[:14]


def parse_blocks(text, surface="chat"):
    """AI が書く ```nbmem ブロック（1行1件の JSON）を読む"""
    out = []
    for blk in re.findall(r"```nbmem\s*\n(.*?)```", text, flags=re.S):
        for line in blk.splitlines():
            line = line.strip().rstrip(",")
            if not line or line.startswith("#"):
                continue
            try:
                c = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not c.get("value"):
                continue
            c.setdefault("category", category_of(c["value"]))
            c.setdefault("key", topic_key(c.get("subject", "") + c["value"], c["category"]))
            c.setdefault("subject", subject_of(c["value"], c["key"]))
            src = c.get("source") or {}
            c["source"] = {"surface": src.get("surface", surface), "date": src.get("date", today()),
                           "quote": src.get("quote", c.get("quote", c["value"]))[:200]}
            c["replace"] = bool(c.get("replace"))
            out.append(c)
    return out


def from_text(text, surface):
    """nbmem ブロックがあればそれだけを使う（AI が判断して書いたもの）。なければ本文から規則で抜き出す。
    コードブロックの中身は規則の抜き出しに使わない"""
    blocks = parse_blocks(text, surface)
    if blocks:
        return blocks
    return extract(re.sub(r"```.*?```", "", text, flags=re.S), surface)


# ───────────────────────── 正本の読み書き
def load_store():
    if STORE.exists():
        return json.loads(STORE.read_text(encoding="utf-8"))
    return {"version": 1, "updated": None, "entries": {}, "conflicts": []}


def save_store(st):
    st["updated"] = now()
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(st, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def apply(st, cand):
    """候補1件を正本に照合する。戻り値：'added' | 'merged' | 'updated' | 'conflict' | 'rejected:<理由>'"""
    why = scrub_reason(cand["value"] + " " + cand["source"].get("quote", ""))
    if why:
        return f"rejected:{why}"
    if cand["category"] not in CATEGORIES:
        cand["category"] = category_of(cand["value"])
    ents = st["entries"]
    key = cand["key"]
    # 同じ話題キーがなくても、ほぼ同じ文の記憶があれば同じものとして扱う（重複の統合）
    if key not in ents:
        for k, e in ents.items():
            if e["status"] == "confirmed" and similar(e["value"], cand["value"]) >= 0.85:
                key = k
                break
    q = norm(cand["source"].get("quote", ""))
    if key not in ents and q:
        for k, e in ents.items():
            if q in {norm(h["source"].get("quote", "")) for h in e.get("history", [])} | {norm(e["source"].get("quote", ""))}:
                return "merged"                  # 同じ発言から作った記憶がすでにある
    rec = {"date": cand["source"]["date"], "value": cand["value"], "source": cand["source"]}
    if key not in ents:
        # 決まったキーでなくても、同じ話題で逆のこと（いる/いらない）を言っていたら矛盾として止める
        for k, e in ents.items():
            if e["status"] == "confirmed" and polarity(e["value"]) != polarity(cand["value"]) and same_topic(e["value"], cand["value"]):
                key = k
                break
    if key not in ents:
        ents[key] = {"key": key, "category": cand["category"], "subject": cand.get("subject") or key,
                     "value": cand["value"], "status": "confirmed", "created": now(), "updated": now(),
                     "source": cand["source"], "history": [dict(rec, change="created")]}
        return "added"
    e = ents[key]
    if similar(e["value"], cand["value"]) >= 0.85 and polarity(e["value"]) == polarity(cand["value"]):
        if not any(h["source"].get("quote") == cand["source"].get("quote") for h in e["history"]):
            e["history"].append(dict(rec, change="restated"))
            e["updated"] = now()
        return "merged"
    if cand.get("replace"):
        e["history"].append(dict(rec, change="updated", previous=e["value"]))
        e.update(value=cand["value"], updated=now(), source=cand["source"], category=cand["category"])
        return "updated"
    # 確定済みと矛盾 → 勝手に上書きしない
    c = {"key": key, "current": e["value"], "proposed": cand["value"], "source": cand["source"],
         "category": cand["category"], "noted": now()}
    if not any(x["key"] == key and norm(x["proposed"]) == norm(cand["value"]) for x in st["conflicts"]):
        st["conflicts"].append(c)
    return "conflict"


def resolve(st, key, accept_new):
    pend = [c for c in st["conflicts"] if c["key"] == key]
    if not pend:
        raise SystemExit(f"{key} の矛盾はない")
    c = pend[-1]
    if accept_new:
        apply(st, {"key": key, "category": c["category"], "value": c["proposed"], "source": c["source"], "replace": True})
    st["conflicts"] = [x for x in st["conflicts"] if x["key"] != key]
    return c


# ───────────────────────── inbox（未反映の候補）
def write_inbox(cands, name=None):
    if not cands:
        return None
    INBOX.mkdir(parents=True, exist_ok=True)
    p = INBOX / f"{name or dt.datetime.now(JST).strftime('%Y%m%d-%H%M%S')}.json"
    p.write_text(json.dumps(cands, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


def ingest(st, paths=None):
    res = []
    for p in sorted(paths or INBOX.glob("*.json")):
        for c in json.loads(Path(p).read_text(encoding="utf-8")):
            res.append((c.get("key"), apply(st, c), c["value"]))
    return res


def check(st):
    """正本の点検（PR の自動テストで使う）：形・出典・履歴があるか、個人情報らしきものがないか、MEMORY.md が最新か"""
    errs = []
    for k, e in st["entries"].items():
        for f in ("key", "category", "subject", "value", "status", "source", "history", "created", "updated"):
            if f not in e:
                errs.append(f"{k}: {f} がない")
        if e.get("category") not in CATEGORIES:
            errs.append(f"{k}: 分類 {e.get('category')} が不明")
        if not (e.get("source") or {}).get("date"):
            errs.append(f"{k}: 出典の日付がない")
        texts = [e.get("value", "")] + [h.get("value", "") + (h.get("source") or {}).get("quote", "") for h in e.get("history", [])]
        for t in texts:
            why = scrub_reason(t)
            if why:
                errs.append(f"{k}: 保存してはいけないもの（{why}）")
    md = MEM / "MEMORY.md"
    if st["entries"] and md.exists():
        cur = md.read_text(encoding="utf-8")
        render(st)
        if md.read_text(encoding="utf-8") != cur:
            errs.append("MEMORY.md が store.json と合っていない（render を実行する）")
    for x in errs:
        print("NG", x)
    print("OK" if not errs else f"{len(errs)} 件の問題")
    return 1 if errs else 0


# ───────────────────────── 読みやすい版
def render(st):
    lines = ["# ナギバク共有記憶（正本：memory/store.json）", "",
             "ナギバク制作に関わるAI（Claude・Claude Code・Codex・ChatGPT）はこの内容に従う。",
             "ここにない設定は推測で決めず、ここと矛盾する指示が来たら確認する。追加・変更の手順は memory/README.md。", "",
             f"最終更新：{st.get('updated') or '-'}　件数：{len(st['entries'])}　未解決の矛盾：{len(st['conflicts'])}", ""]
    for cat, label in CATEGORIES.items():
        es = sorted((e for e in st["entries"].values() if e["category"] == cat and e["status"] == "confirmed"),
                    key=lambda e: (e["subject"], e["created"]))
        if not es:
            continue
        lines += [f"## {label}", ""]
        for e in es:
            src = e["source"]
            lines.append(f"- {e['value']}（{src.get('date', '')}・{src.get('surface', '')}・`{e['key']}`）")
        lines.append("")
    (MEM / "MEMORY.md").write_text("\n".join(lines), encoding="utf-8")
    cl = ["# 未解決の矛盾（確定済みの記憶と食い違う提案）", "",
          "勝手には上書きしていない。決めるには：`python scripts/memory/nbmem.py resolve <キー> --accept-new`（新しい方にする）/ `--keep-old`（今のまま）", ""]
    for c in st["conflicts"]:
        cl += [f"## `{c['key']}`", f"- いま：{c['current']}", f"- 提案：{c['proposed']}（{c['source'].get('date')}・{c['source'].get('surface')}）", ""]
    if not st["conflicts"]:
        cl.append("なし")
    (MEM / "CONFLICTS.md").write_text("\n".join(cl) + "\n", encoding="utf-8")


def main_memory_md():
    """作業ブランチに memory/ がないときは、main の MEMORY.md を読む（正本は main の1か所だけ）"""
    try:
        subprocess.run(["git", "fetch", "-q", "--depth", "1", "origin", "main"], cwd=ROOT, timeout=20, capture_output=True)
        r = subprocess.run(["git", "show", "origin/main:memory/MEMORY.md"], cwd=ROOT, capture_output=True, text=True, timeout=10)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def context_text(st, limit=12000):
    md = (MEM / "MEMORY.md").read_text(encoding="utf-8") if (MEM / "MEMORY.md").exists() else main_memory_md()
    extra = []
    pend = sorted(INBOX.glob("*.json")) if INBOX.exists() else []
    if pend:
        extra.append(f"\n※ まだ正本に入っていない記憶の候補が {len(pend)} 件（memory/inbox）。作業の区切りで `python scripts/memory/nbmem.py submit` を実行して PR にする。")
    if st["conflicts"]:
        extra.append(f"※ 未解決の矛盾が {len(st['conflicts'])} 件（memory/CONFLICTS.md）。該当する作業では確定済みの方に従い、ユーザーに確認する。")
    return (md[:limit] + "".join(extra)).strip()


# ───────────────────────── Claude Code の会話記録（JSONL）からユーザーの発言だけを取る
def user_text_from_transcript(path):
    out = []
    for line in Path(path).read_text(encoding="utf-8", errors="ignore").splitlines():
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        if o.get("type") != "user":
            continue
        m = o.get("message") or {}
        c = m.get("content")
        if isinstance(c, str):
            out.append(c)
        elif isinstance(c, list):
            out += [p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text"]
    # ツールの結果やシステムの差し込みは除く
    return "\n".join(t for t in out if t and not t.lstrip().startswith(("<", "Base directory", "[Request interrupted")))


# ───────────────────────── PR にする（main から切ったブランチに反映）
def sh(*a, **k):
    return subprocess.run(a, cwd=ROOT, check=True, text=True, capture_output=True, **k).stdout.strip()


def submit(base="main", dry=False):
    pend = sorted(INBOX.glob("*.json"))
    if not pend:
        print("候補なし")
        return None
    cands = [c for p in pend for c in json.loads(p.read_text(encoding="utf-8"))]
    branch = f"memory/update-{dt.datetime.now(JST).strftime('%Y%m%d-%H%M%S')}"
    tmp = ROOT / ".nbmem-wt"
    fetch = lambda b: sh("git", "fetch", "-q", "--depth", "50", "origin", f"+{b}:refs/remotes/origin/{b}")  # noqa: E731
    fetch(base)
    if base == "main" and subprocess.run(["git", "cat-file", "-e", "origin/main:memory/store.json"], cwd=ROOT,
                                         capture_output=True).returncode:
        base = "feat/shared-memory"            # 仕組みの PR がまだマージ前のときだけ
        fetch(base)
    sh("git", "worktree", "add", "-q", "-B", branch, str(tmp), f"origin/{base}")
    try:
        env = dict(os.environ, NBMEM_ROOT=str(tmp))
        cand_file = tmp / "memory" / "inbox" / "_submit.json"
        cand_file.parent.mkdir(parents=True, exist_ok=True)
        cand_file.write_text(json.dumps(cands, ensure_ascii=False), encoding="utf-8")
        out = subprocess.run([sys.executable, str(tmp / "scripts/memory/nbmem.py"), "ingest", "--clear"], env=env,
                             text=True, capture_output=True, check=True).stdout
        body = "会話から抜き出した記憶の候補を、正本（memory/store.json）に照合した結果です。\n\n" \
               "マージすると確定（正式反映）。矛盾は上書きせず memory/CONFLICTS.md に載せています。\n\n```\n" + out + "\n```"
        subprocess.run(["git", "add", "-A", "memory"], cwd=tmp, check=True)
        if not subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=tmp).returncode:
            print("正本に変化なし（すべて既存と同じ）")
            for p in pend:
                p.unlink()
            return None
        subprocess.run(["git", "commit", "-q", "-m", "memory: 会話からの記憶の候補を反映（要確認）"], cwd=tmp, check=True)
        if dry:
            print(body)
            return branch
        subprocess.run(["git", "-c", "push.negotiate=true", "push", "-q", "-u", "origin", branch], cwd=tmp, check=True)
        # PR は REST で作る（GraphQL が使えない環境でも動くように）
        url = subprocess.run(["git", "remote", "get-url", "origin"], cwd=tmp, capture_output=True, text=True).stdout.strip()
        m = re.search(r"github\.com[:/]([^/]+/[^/.]+?)(?:\.git)?$", url) or re.search(r"/git/([^/]+/[^/]+?)(?:\.git)?$", url)
        repo = m.group(1) if m else ""
        r = subprocess.run(["gh", "api", f"repos/{repo}/pulls", "-f", "title=共有記憶の更新（要確認）", "-f", f"head={branch}",
                            "-f", f"base={base}", "-f", f"body={body}", "--jq", ".html_url"], cwd=tmp, capture_output=True, text=True)
        print(r.stdout.strip() or f"PR を作れなかった（{r.stderr.strip()[:200]}）。ブランチ {branch} から PR を作ってください")
        for p in pend:
            p.unlink()
        print(f"PR を出した：{branch}")
        return branch
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(tmp)], cwd=ROOT)


# ───────────────────────── CLI
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("context")
    x = sp.add_parser("extract")
    x.add_argument("file")
    x.add_argument("--surface", default="chat")
    x.add_argument("--name")
    x.add_argument("--print", action="store_true")
    p = sp.add_parser("propose")
    for k in ("key", "category", "subject", "value", "quote"):
        p.add_argument(f"--{k}")
    p.add_argument("--surface", default="claude-code")
    p.add_argument("--replace", action="store_true")
    g = sp.add_parser("ingest")
    g.add_argument("--clear", action="store_true")
    r = sp.add_parser("resolve")
    r.add_argument("key")
    m = r.add_mutually_exclusive_group(required=True)
    m.add_argument("--accept-new", action="store_true")
    m.add_argument("--keep-old", action="store_true")
    sp.add_parser("render")
    sp.add_parser("check")
    s = sp.add_parser("submit")
    s.add_argument("--base", default="main")
    s.add_argument("--dry", action="store_true")
    sp.add_parser("hook-session-start")
    sp.add_parser("hook-stop")
    a = ap.parse_args(argv)
    st = load_store()

    if a.cmd == "context":
        print(context_text(st))
    elif a.cmd == "extract":
        text = sys.stdin.read() if a.file == "-" else Path(a.file).read_text(encoding="utf-8")
        cands = from_text(text, a.surface)
        if a.print:
            print(json.dumps(cands, ensure_ascii=False, indent=1))
        else:
            p = write_inbox(cands, a.name)
            print(f"{len(cands)} 件の候補 → {p}" if p else "候補なし")
    elif a.cmd == "propose":
        if not a.value:
            raise SystemExit("--value が要る")
        cat = a.category or category_of(a.value)
        c = {"key": a.key or topic_key((a.subject or "") + a.value, cat), "category": cat, "subject": a.subject or "",
             "value": a.value, "source": {"surface": a.surface, "date": today(), "quote": (a.quote or a.value)[:200]},
             "replace": a.replace}
        why = scrub_reason(a.value + " " + (a.quote or ""))
        if why:
            raise SystemExit(f"保存しない（{why}らしきものを含む）")
        print(write_inbox([c]))
    elif a.cmd == "ingest":
        res = ingest(st)
        save_store(st)
        render(st)
        for key, r_, v in res:
            print(f"{r_:<10} {key}  {v}")
        if a.clear:
            for p_ in INBOX.glob("*.json"):
                p_.unlink()
    elif a.cmd == "resolve":
        c = resolve(st, a.key, a.accept_new)
        save_store(st)
        render(st)
        print(("新しい方にした：" if a.accept_new else "今のままにした：") + c["proposed"])
    elif a.cmd == "render":
        render(st)
    elif a.cmd == "check":
        sys.exit(check(st))
    elif a.cmd == "submit":
        submit(a.base, a.dry)
    elif a.cmd == "hook-session-start":
        txt = context_text(st)
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart",
                                                 "additionalContext": "【ナギバク共有記憶】\n" + txt}}, ensure_ascii=False))
    elif a.cmd == "hook-stop":
        try:
            info = json.loads(sys.stdin.read() or "{}")
        except json.JSONDecodeError:
            info = {}
        tp = info.get("transcript_path")
        if not tp or not Path(tp).exists():
            return
        text = user_text_from_transcript(tp)
        cands = from_text(text, "claude-code")
        # すでに正本にあるもの（同じ文）は候補にしない
        known = {norm(e["source"].get("quote", "")) for e in st["entries"].values()} | {
            norm(h["source"].get("quote", "")) for e in st["entries"].values() for h in e.get("history", [])}
        cands = [c for c in cands if norm(c["source"]["quote"]) not in known
                 and not any(similar(e["value"], c["value"]) >= 0.85 for e in st["entries"].values())]
        sid = re.sub(r"[^\w-]", "", str(info.get("session_id", "session")))[:40]
        p = INBOX / f"cc-{sid}.json"
        if cands:
            write_inbox(cands, f"cc-{sid}")
            print(f"[nbmem] 記憶の候補 {len(cands)} 件 → {p.relative_to(ROOT)}（submit で PR）", file=sys.stderr)
        elif p.exists():
            p.unlink()


if __name__ == "__main__":
    main()
