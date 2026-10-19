"""読みの検査（lab/reading.py・scripts/reading/）のテスト。pyopenjtalk が要る：pip install pyopenjtalk-plus

  python -m unittest tests/test_reading.py -v
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lab"))
sys.path.insert(0, str(ROOT / "scripts" / "reading"))
import reading  # noqa: E402

try:
    import pyopenjtalk  # noqa: F401
    HAVE_OJT = True
except ImportError:
    HAVE_OJT = False


class Ruby(unittest.TestCase):
    def test_split(self):
        t = "《加持|かじ》さんの全回転"
        self.assertEqual(reading.display(t), "加持さんの全回転")
        self.assertEqual(reading.say(t), "かじさんの全回転")

    def test_norm(self):
        for a, b in [("オオアタリ", "オーアタリ"), ("ショゴウキ", "ショゴーキ"), ("ケイゾク", "ケーゾク"), ("タマシイ", "タマシー")]:
            self.assertEqual(reading.norm(a), reading.norm(b))
        self.assertNotEqual(reading.norm("トオール"), reading.norm("トール"))   # 語の切れ目の「オ」は伸ばさない


@unittest.skipUnless(HAVE_OJT, "pyopenjtalk が無い")
class Check(unittest.TestCase):
    def setUp(self):
        self.d = reading.load_dict()
        self.terms = [t for t in reading.terms(self.d) if t[3] == "ok"]

    def test_reading_in_context(self):
        self.assertIn("ハタ", reading.reading_in("右の初号機や！", "初号機"))      # 「機や」を ハタヤ と読む

    def test_asr_compare(self):
        import asr_check
        it = {"id": "x", "who": "nagi", "text": "出玉なしの確変に入る。", "say": "出玉なしの確変に入る。"}
        _, _, ratio, found = asr_check.compare(it, "出玉なしの確変に入る。", self.terms, self.d)
        self.assertEqual(found, []); self.assertGreater(ratio, 0.95)
        _, _, _, found = asr_check.compare(it, "だしだまなしの確変に入る。", self.terms, self.d)
        self.assertTrue(any(f["kind"] == "誤読（辞書語）" for f in found))
        _, _, _, found = asr_check.compare(dict(it, text="少なくとも、広めたのはこの台。", say="少なくとも、広めたのはこの台。"),
                                           "広めたのはこの台。", self.terms, self.d)
        self.assertTrue(any(f["kind"] == "脱落" for f in found))


if __name__ == "__main__":
    unittest.main()
