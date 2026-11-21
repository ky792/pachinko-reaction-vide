"""nbmem の自動テスト（抽出・競合判定・保存・再読み込み・フック・個人情報の除外）

  python -m unittest scripts/memory/test_nbmem.py -v
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "nbmem.py"


def fresh(tmp):
    """一時フォルダを正本の置き場にして nbmem を読み込み直す"""
    os.environ["NBMEM_ROOT"] = str(tmp)
    sys.path.insert(0, str(HERE))
    if "nbmem" in sys.modules:
        del sys.modules["nbmem"]
    import nbmem  # noqa: E402
    return nbmem


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.m = fresh(self.tmp)

    def run_cli(self, *args, stdin=None):
        env = dict(os.environ, NBMEM_ROOT=str(self.tmp))
        return subprocess.run([sys.executable, str(SCRIPT), *args], input=stdin, text=True, capture_output=True, env=env)


class TestExtract(Base):
    def test_keeps_durable_and_drops_chitchat(self):
        text = ("バクは女の子で、一人称はウチにしたい。\n"
                "今日は疲れた。\n"
                "とりあえず作ってみて。\n"
                "BGMはもうちょい大きめがいい。\n"
                "Claude codeに作らせた方がいいのかな\n"
                "サムネ案は不要。\n"
                "ありがとう！")
        cs = self.m.extract(text)
        vals = [c["value"] for c in cs]
        self.assertTrue(any("一人称はウチ" in v for v in vals))
        self.assertTrue(any("BGM" in v for v in vals))
        self.assertTrue(any("サムネ" in v for v in vals))
        self.assertFalse(any("疲れた" in v or "とりあえず" in v or "のかな" in v or "ありがとう" in v for v in vals))

    def test_categories_and_keys(self):
        cs = {c["value"]: c for c in self.m.extract("バクの一人称はウチにする。\n新台解説の見た目は号外風で行くと決定。\nナギが目を開けるのはNG。")}
        c1 = next(c for v, c in cs.items() if "一人称" in v)
        self.assertEqual(c1["key"], "baku.first_person")
        self.assertEqual(c1["category"], "character")
        c2 = next(c for v, c in cs.items() if "号外" in v)
        self.assertEqual(c2["category"], "decision")
        c3 = next(c for v, c in cs.items() if "目を開け" in v)
        self.assertEqual(c3["category"], "correction")
        self.assertEqual(c3["key"], "nagi.eyes")

    def test_real_chat_lines(self):
        # このチャットの実際の発言から
        text = "\n".join(["ChatGPTにパワハラしまくってたら強制的に切られた", "これを基準にしたい", "とりあえず今回のスロット複雑すぎ回の背景ね",
                          "1いらんくね、渡したやろ", "負けたわのとこバク笑わせる必要なくね", "Claude codeに作らせた方がいいのかな",
                          "今後はキャラの立ち絵を使うときは必ず表情集の絵柄に合わせてほしい。", "手取りは月15〜18万くらいだから有料のツールは使いたくない"])
        vals = [c["value"] for c in self.m.extract(text)]
        self.assertIn("負けたわのとこバク笑わせる必要なくね", vals)
        self.assertTrue(any("表情集の絵柄" in v for v in vals))
        for bad in ("パワハラ", "これを基準", "とりあえず", "1いらんくね", "作らせた方", "手取り"):
            self.assertFalse(any(bad in v for v in vals), bad)
        c = next(c for c in self.m.extract(text) if "笑わせる" in c["value"])
        self.assertEqual(c["category"], "correction")

    def test_one_off_scope_is_dropped(self):
        self.assertEqual(self.m.extract("この回だけBGMを小さめにして。"), [])

    def test_nbmem_block(self):
        text = '共有記憶に追加して\n```nbmem\n{"key":"bgm.volume","category":"style","value":"BGMは大きめ","quote":"BGMはもうちょい大きめ"}\n```'
        cs = self.m.parse_blocks(text, "chatgpt")
        self.assertEqual(len(cs), 1)
        self.assertEqual(cs[0]["source"]["surface"], "chatgpt")
        self.assertEqual(cs[0]["key"], "bgm.volume")


    def test_memo_with_block_uses_block_only(self):
        memo = "# ChatGPT からのメモ\n今日の会話で決まったこと。\n```nbmem\n" + \
               '{"category": "style", "value": "サムネの文字は白フチの太字にしてほしい", "quote": "白フチの太字がいい"}' + "\n```\n"
        cs = self.m.from_text(memo, "chatgpt")
        self.assertEqual(len(cs), 1)
        self.assertEqual(cs[0]["value"], "サムネの文字は白フチの太字にしてほしい")

    def test_bare_json_lines(self):
        memo = ('{"category":"character","subject":"ナギの口調","value":"ナギは標準語のタメ口で話し、敬語は使わない。","quote":"ナギは敬語を使わない","source":{"surface":"claude"}}\n'
                '{"category":"style","value":"BGMは大きめ","quote":"BGM大きめ"}\n')
        cs = self.m.from_text(memo, "memo")
        self.assertEqual([c["category"] for c in cs], ["character", "style"])
        self.assertEqual(cs[0]["source"]["surface"], "claude")

    def test_code_is_not_extracted_as_memory(self):
        self.assertEqual(self.m.from_text("```\nprint('毎回必ず実行してほしい')\n```", "x"), [])


class TestPrivacy(Base):
    def test_secrets_and_personal_info_are_never_stored(self):
        bad = ["トークンは ghp_abcdefghijklmnopqrstuvwxyz0123 を使って",
               "連絡は taro@example.com にしてほしい",
               "手取りは月15万なので節約したい",
               "電話は 090-1234-5678 にして",
               "パスワード: hunter2 を使うようにして"]
        for t in bad:
            self.assertEqual(self.m.extract(t), [], t)
            st = self.m.load_store()
            r = self.m.apply(st, {"key": "x", "category": "production", "value": t, "source": {"surface": "t", "date": "2026-01-01", "quote": t}})
            self.assertTrue(r.startswith("rejected"), t)
            self.assertEqual(st["entries"], {})

    def test_propose_cli_refuses_secret(self):
        r = self.run_cli("propose", "--value", "APIキー: sk-ant-1234567890abcdef を保存して")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((self.tmp / "memory" / "inbox").exists() and any((self.tmp / "memory" / "inbox").iterdir()))


class TestConflictAndMerge(Base):
    def cand(self, key, value, replace=False, date="2026-11-01"):
        return {"key": key, "category": "character", "value": value, "replace": replace,
                "source": {"surface": "test", "date": date, "quote": value}}

    def test_duplicate_is_merged_not_added(self):
        st = self.m.load_store()
        self.assertEqual(self.m.apply(st, self.cand("baku.first_person", "バクの一人称はウチ")), "added")
        self.assertEqual(self.m.apply(st, self.cand("baku.first_person", "バクの一人称は「ウチ」", date="2026-11-02")), "merged")
        self.assertEqual(len(st["entries"]), 1)
        self.assertEqual(len(st["entries"]["baku.first_person"]["history"]), 2)

    def test_same_quote_is_merged(self):
        st = self.m.load_store()
        self.m.apply(st, {"key": "kyu.ochi_face", "category": "correction", "value": "負けた場面でバクを笑わせない",
                          "source": {"surface": "t", "date": "2026-11-22", "quote": "負けたわのとこバク笑わせる必要なくね"}})
        r = self.m.apply(st, {"key": "correction.x", "category": "correction", "value": "負けたわのとこバク笑わせる必要なくね",
                              "source": {"surface": "cc", "date": "2026-11-22", "quote": "負けたわのとこバク笑わせる必要なくね"}})
        self.assertEqual(r, "merged")
        self.assertEqual(len(st["entries"]), 1)

    def test_similar_text_with_other_key_is_merged(self):
        st = self.m.load_store()
        self.m.apply(st, self.cand("style.aaaa1111", "概要欄はキャラとチャンネルの紹介だけでいい"))
        r = self.m.apply(st, self.cand("style.bbbb2222", "概要欄はキャラとチャンネルの紹介だけでいい。"))
        self.assertEqual(r, "merged")
        self.assertEqual(len(st["entries"]), 1)

    def test_contradiction_is_not_overwritten(self):
        st = self.m.load_store()
        self.m.apply(st, self.cand("baku.first_person", "バクの一人称はウチ"))
        r = self.m.apply(st, self.cand("baku.first_person", "バクの一人称はオレ"))
        self.assertEqual(r, "conflict")
        self.assertEqual(st["entries"]["baku.first_person"]["value"], "バクの一人称はウチ")
        self.assertEqual(len(st["conflicts"]), 1)

    def test_polarity_contradiction_without_topic_key(self):
        st = self.m.load_store()
        self.m.apply(st, self.cand("style.aaaa0000", "サムネ案を毎回入れてほしい"))
        r = self.m.apply(st, self.cand("style.bbbb0000", "サムネ案は毎回いらない"))
        self.assertEqual(r, "conflict")

    def test_resolve_accept_new_keeps_history(self):
        st = self.m.load_store()
        self.m.apply(st, self.cand("bgm.volume", "BGMは控えめ"))
        self.m.apply(st, self.cand("bgm.volume", "BGMはマニュアルより大きめ"))
        self.m.resolve(st, "bgm.volume", accept_new=True)
        e = st["entries"]["bgm.volume"]
        self.assertEqual(e["value"], "BGMはマニュアルより大きめ")
        self.assertEqual(e["history"][-1]["previous"], "BGMは控えめ")
        self.assertEqual(st["conflicts"], [])

    def test_explicit_replace_updates(self):
        st = self.m.load_store()
        self.m.apply(st, self.cand("voice.speed", "声は1.0倍"))
        self.assertEqual(self.m.apply(st, self.cand("voice.speed", "声は1.1倍の早口", replace=True)), "updated")
        self.assertEqual(st["entries"]["voice.speed"]["value"], "声は1.1倍の早口")


class TestPersistence(Base):
    def test_save_reload_render_and_context(self):
        st = self.m.load_store()
        self.m.apply(st, {"key": "baku.gender", "category": "character", "value": "バクは女の子",
                          "source": {"surface": "claude-chat", "date": "2026-10-26", "quote": "バクは女の子"}})
        self.m.save_store(st)
        self.m.render(st)
        m2 = fresh(self.tmp)                      # 別のセッション（読み込み直し）
        st2 = m2.load_store()
        self.assertIn("baku.gender", st2["entries"])
        self.assertEqual(st2["entries"]["baku.gender"]["source"]["date"], "2026-10-26")
        md = (self.tmp / "memory" / "MEMORY.md").read_text(encoding="utf-8")
        self.assertIn("バクは女の子", md)
        self.assertIn("バクは女の子", m2.context_text(st2))

    def test_cli_extract_ingest_cycle(self):
        conv = self.tmp / "conv.txt"
        conv.write_text("ナギの喋り方はふわふわ系のJKっぽくしてほしい。\n今日は眠い。", encoding="utf-8")
        self.assertEqual(self.run_cli("extract", str(conv), "--surface", "chatgpt").returncode, 0)
        r = self.run_cli("ingest", "--clear")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("added", r.stdout)
        st = json.loads((self.tmp / "memory" / "store.json").read_text(encoding="utf-8"))
        self.assertEqual(len(st["entries"]), 1)
        self.assertFalse(list((self.tmp / "memory" / "inbox").glob("*.json")))
        # 同じ会話をもう一度取り込んでも増えない
        self.run_cli("extract", str(conv))
        self.run_cli("ingest", "--clear")
        st = json.loads((self.tmp / "memory" / "store.json").read_text(encoding="utf-8"))
        self.assertEqual(len(st["entries"]), 1)


class TestCheck(Base):
    def test_check_detects_planted_secret(self):
        st = self.m.load_store()
        self.m.apply(st, {"key": "a.b", "category": "style", "value": "BGMは大きめ", "source": {"surface": "t", "date": "2026-01-01", "quote": "q"}})
        st["entries"]["a.b"]["value"] = "メールは x@y.com"       # 手で書き換えられた場合
        self.m.save_store(st)
        self.assertEqual(self.run_cli("check").returncode, 1)

    def test_check_passes_clean_store(self):
        st = self.m.load_store()
        self.m.apply(st, {"key": "a.b", "category": "style", "value": "BGMは大きめ", "source": {"surface": "t", "date": "2026-01-01", "quote": "q"}})
        self.m.save_store(st)
        self.m.render(st)
        r = self.run_cli("check")
        self.assertEqual(r.returncode, 0, r.stdout)


class TestHooks(Base):
    def test_session_start_outputs_context_json(self):
        st = self.m.load_store()
        self.m.apply(st, {"key": "nagi.eyes", "category": "character", "value": "ナギは目を閉じたまま（開けさせない）",
                          "source": {"surface": "t", "date": "2026-10-01", "quote": "q"}})
        self.m.save_store(st)
        self.m.render(st)
        r = self.run_cli("hook-session-start")
        o = json.loads(r.stdout)
        self.assertIn("目を閉じたまま", o["hookSpecificOutput"]["additionalContext"])

    def test_stop_hook_reads_transcript_user_messages_only(self):
        tp = self.tmp / "t.jsonl"
        rows = [
            {"type": "user", "message": {"role": "user", "content": "負けたわのとこバクを笑わせるのはNGにして。"}},
            {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": "BGMは絶対に大きくしないでおきますね。"}]}},
            {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "ログ：必ず失敗にする"}]}},
            {"type": "user", "message": {"role": "user", "content": "ありがとう"}},
        ]
        tp.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
        r = self.run_cli("hook-stop", stdin=json.dumps({"transcript_path": str(tp), "session_id": "abc"}))
        self.assertEqual(r.returncode, 0, r.stderr)
        inbox = json.loads((self.tmp / "memory" / "inbox" / "cc-abc.json").read_text(encoding="utf-8"))
        self.assertEqual(len(inbox), 1)
        self.assertIn("笑わせる", inbox[0]["value"])
        self.assertEqual(inbox[0]["source"]["surface"], "claude-code")


if __name__ == "__main__":
    unittest.main()
