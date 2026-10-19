"""読み（字幕と読み上げの分離・辞書・かな比較）の共通処理

- 台本の《表記|よみ》：字幕には「表記」、読み上げには「よみ」を使う（例：《加持|かじ》さん）
- 読み上げ用テキスト＝《》を「よみ」にしたあと、voice/dictionary.json の rules を順に当てたもの
- 照合用のかな＝OpenJTalk（pyopenjtalk）でカタカナにし、長音などの表記ゆれをならしたもの
  AivisSpeech（ナギ）は中で同じ OpenJTalk を使うので、ナギの読みはほぼこれで先に分かる。
  Irodori-TTS（バク）は文字をそのまま読むモデルなので、ここでのかなは「目安」にしかならない
"""
import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT = ROOT / "voice" / "dictionary.json"
RUBY = re.compile(r"《([^|《》]+)\|([^《》]+)》")


def display(text):
    """字幕用（《表記|よみ》→ 表記）"""
    return RUBY.sub(r"\1", text)


def say(text):
    """読み上げの元（《表記|よみ》→ よみ）。rules はまだ当てない"""
    return RUBY.sub(r"\2", text)


def load_dict(path=DICT):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_dict(d, path=DICT):
    Path(path).write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


ENGINE = {"nagi": "aivis", "baku": "irodori"}


def apply_rules(s, d, engine=None):
    """rules を順に当てる。engine を付けた rule（"aivis"／"irodori"）は、そのエンジンのときだけ当てる"""
    for r in d["rules"]:
        if engine and r.get("engine", "all") not in ("all", engine):
            continue
        s = re.sub(r["re"], r["to"], s)
    return s


def speech_text(text, d, engine=None):
    """エンジンに渡すテキスト（台本の行 → 《》をよみに → rules）"""
    return apply_rules(say(text), d, engine)


def aivis_words(d, all_status=False):
    """AivisSpeech のユーザー辞書に入れる語（status=要確認 は入れない）"""
    return [w for w in d.get("aivis_words", []) if all_status or w.get("status", "ok") != "要確認"]


def accent_guess(pron):
    """カタカナの読みから、OpenJTalk が推すアクセント核の位置（推定。耳で確かめるまで accent_status=推定）"""
    nodes = frontend(pron)
    return int(nodes[0]["acc"]) if len(nodes) == 1 else 0


def mora_count(pron):
    return len(re.sub(r"[ャュョァィゥェォ]", "", pron))


_ENGINE_NOW = [None]


def use_engine(engine, d):
    """OpenJTalk の読みを、そのエンジンに合わせる。aivis なら aivis_words をユーザー辞書として読み込む（AivisSpeech と同じ仕組み）"""
    if _ENGINE_NOW[0] == engine:
        return
    ojt = _openjtalk()
    ojt.unset_user_dict()
    words = aivis_words(d) if engine == "aivis" else []
    if words:
        import tempfile
        tmp = Path(tempfile.mkdtemp())
        rows = []
        for w in words:
            pron = w["pronunciation"]
            acc = int(w.get("accent_type", 0))
            surf = w["surface"].translate(_FULL)
            rows.append(f"{surf},1348,1348,{w.get('cost', 1000)},名詞,{'固有名詞' if w.get('word_type') == 'PROPER_NOUN' else '一般'},*,*,*,*,"
                        f"{surf},{pron},{pron},{acc}/{mora_count(pron)},*")
        (tmp / "u.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
        import os
        saved = os.dup(1), os.dup(2)                 # 辞書を作るときの進み具合の表示（C から直接出る）を隠す
        nul = os.open(os.devnull, os.O_WRONLY)
        os.dup2(nul, 1); os.dup2(nul, 2)
        try:
            ojt.mecab_dict_index(str(tmp / "u.csv"), str(tmp / "u.dic"))
        finally:
            os.dup2(saved[0], 1); os.dup2(saved[1], 2); os.close(nul)
        ojt.update_global_jtalk_with_user_dict(str(tmp / "u.dic"))
    kana.cache_clear()
    _ENGINE_NOW[0] = engine


def _literal(pat):
    """正規表現が「ただの文字列」ならその文字列、そうでなければ None"""
    s = pat.replace("\\.", ".")
    return None if re.search(r"[\\\[\]()?*+|^${}]", s) else s


def terms(d):
    """読みが決まっている語の一覧：(表記, よみ, 出どころ, 状態)。状態は ok／要確認"""
    out = []
    for t in d.get("terms", []):
        out.append((t["surface"], t["yomi"], "terms", t.get("status", "要確認")))
    for r in d["rules"]:
        lit = _literal(r["re"])
        if lit and r["to"] and re.search(r"[ぁ-んァ-ヶ]", r["to"]):
            out.append((lit, r["to"], "rules", r.get("status", "ok")))
    return out


# ---------------------------------------------------------------- かな
def _openjtalk():
    try:
        import pyopenjtalk
        return pyopenjtalk
    except ImportError as e:  # pragma: no cover
        raise SystemExit("pyopenjtalk が要る：pip install pyopenjtalk-plus") from e


@lru_cache(maxsize=20000)
def kana(s):
    """テキスト → カタカナ（OpenJTalk の読み）"""
    return _openjtalk().g2p(s, kana=True)


def frontend(s):
    return _openjtalk().run_frontend(s)


_HIRA = {chr(c): chr(c + 0x60) for c in range(ord("ぁ"), ord("ゖ") + 1)}
_ROWS = {"ア": "アカガサザタダナハバパマヤャラワァ", "イ": "イキギシジチヂニヒビピミリィ", "ウ": "ウクグスズツヅヌフブプムユュルゥヴ",
         "エ": "エケゲセゼテデネヘベペメレェ", "オ": "オコゴソゾトドノホボポモヨョロヲォ"}
_VOWEL = {ch: v for v, chars in _ROWS.items() for ch in chars}
_LONG = {"ア": "", "イ": "イ", "ウ": "ウ", "エ": "イ", "オ": "ウ"}   # その段のあとに来たら伸ばす音とみなす文字（ケイ・ショウ・キュウ）


def norm(s):
    """照合用にならす：ひらがな→カタカナ、記号・空白を消す、長音（ー・ウ・イ・オ…）とヲ・ヅなどの表記ゆれをそろえる"""
    s = "".join(_HIRA.get(ch, ch) for ch in s)
    s = s.replace("ヲ", "オ").replace("ヅ", "ズ").replace("ヂ", "ジ").replace("ヴ", "ブ")
    if re.search(r"[、。，．,.！？!?・\s]", s):     # 句読点をまたいで長音をつなげない（「テ、エ」を「テー」にしない）
        return "|".join(x for x in (norm(p) for p in re.split(r"[、。，．,.！？!?・\s]+", s)) if x)
    s = re.sub(r"[^ァ-ヶー]", "", s)
    out = []
    for ch in s:
        prev = out[-1] if out else ""
        v = _VOWEL.get(prev)
        if ch == "ー" or (v and ch in _LONG[v]) or (ch in "アイウエオ" and prev == ch):   # 伸ばす音はすべて「ー」1つに（オオ→オー）
            if prev and prev != "ー":
                out.append("ー")
            continue
        out.append(ch)
    return "".join(out)


def yomi_kana(yomi):
    """辞書の読み（かな）を、発音どおりのカタカナにして照合用にならす（ひらがなの「へ」「は」→エ・ワ など）"""
    return norm(kana(yomi) if re.search(r"[^ァ-ヶー]", yomi) else yomi)


_FULL = str.maketrans({chr(c): chr(c + 0xFEE0) for c in range(0x21, 0x7F)})


def reading_in(sp, target):
    """読み上げ用テキスト sp の中で、target の部分を OpenJTalk が実際にどう読むか（その語をふくむ単語の読みをつなげたもの）。
    見つからなければ None（数字などで OpenJTalk の分け方とずれるとき）"""
    nodes = frontend(sp)
    joined, spans, pos = "", [], 0
    for n in nodes:
        spans.append((pos, pos + len(n["string"]), n["pron"].replace("’", "")))
        joined += n["string"]; pos += len(n["string"])
    t = target.translate(_FULL)
    i = joined.find(t) if t in joined else joined.find(target)
    if i < 0:
        return None
    j = i + len(t)
    cover = [(a, b, pr) for a, b, pr in spans if a < j and b > i]
    if len(cover) == 1 and (cover[0][0] < i or cover[0][1] > j):
        return ""                      # 長い別の語の一部（「台詞」の「台」など）→ 比べない
    if cover[0][0] == i and cover[-1][1] == j:
        return "=" + "".join(pr for a, b, pr in cover)     # 語の切れ目がぴったり → 読みが同じかで比べる
    return "".join(pr for a, b, pr in cover)


def canon(text, d, terms_ok, rules=True):
    """照合用のかな（区切りなし）：rules → 辞書で読みの決まった語をその読みに → OpenJTalk → ならす
    台本と文字起こしの両方をこれで同じ形にしてから比べる（漢字の書き方の差・辞書語の読みの差を消す）"""
    s = apply_rules(text, d) if rules else text
    for surf, yomi in sorted({(t[0], t[1]) for t in terms_ok}, key=lambda x: -len(x[0])):
        if surf in s:
            s = s.replace(surf, yomi)
    return norm(kana(s)).replace("|", "")
