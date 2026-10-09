"""Checks that the optional explainer motion engine is deterministic and compatible."""
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from lab import motion, episode


class MotionTest(unittest.TestCase):
    def test_sample_interpolates_with_missing_values(self):
        frames = [
            {"t": 0, "x": 0, "zoom": 1},
            {"t": 2, "x": 100, "zoom": 1.2, "ease": "linear"},
            {"t": 4, "x": 80},
        ]
        mid = motion.sample(frames, 1, motion.CAMERA_DEFAULT)
        self.assertAlmostEqual(mid["x"], 50)
        self.assertAlmostEqual(mid["zoom"], 1.1)
        self.assertAlmostEqual(motion.sample(frames, 4, motion.CAMERA_DEFAULT)["zoom"], 1.2)

    def test_camera_default_is_identical(self):
        image = Image.new("RGBA", (100, 60), (10, 20, 30, 255))
        self.assertIs(motion.camera_image(image, motion.CAMERA_DEFAULT), image)

    def test_camera_crops_without_exposing_borders(self):
        image = Image.new("RGB", (100, 100), "red")
        ImageDraw.Draw(image).rectangle((40, 40, 60, 60), fill="yellow")
        result = motion.camera_image(image, {"zoom": 2, "x": 10000, "y": -10000})
        self.assertEqual(result.size, image.size)
        self.assertEqual(result.getpixel((99, 99))[0], 255)

    def test_element_animation_position(self):
        canvas = Image.new("RGBA", (100, 80), (0, 0, 0, 255))
        layer = Image.new("RGBA", (100, 80))
        ImageDraw.Draw(layer).rectangle((10, 10, 19, 19), fill=(255, 0, 0, 255))
        motion.composite_element(canvas, layer, [{"t": 0, "dx": 20}], 0)
        self.assertEqual(canvas.getpixel((35, 15))[:3], (255, 0, 0))
        self.assertEqual(canvas.getpixel((15, 15))[:3], (0, 0, 0))

    def test_scene_commands_build_keyframes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "script").mkdir()
            script = root / "script" / "00_op.txt"
            script.write_text(
                "@camera 1.15 90 0 1.2\n"
                "@show keyword:test\n"
                "@motion keyword:test 60 0 1.1 0 1 0.4\n"
                "ナギ: これはモーションテストです。\n",
                encoding="utf-8",
            )
            data = {
                "chapters": {"op": {"no": 0, "title": "test", "y": 2008}},
                "keyword": {"test": {"word": "test", "sub": ""}},
            }
            scene = episode.build_chapter(root, script, data)
            self.assertEqual(scene["motion"]["camera"][-1]["zoom"], 1.15)
            self.assertEqual(scene["motion"]["elements"][0]["target"], "keyword:test")
            self.assertTrue(scene["cues"])
            json.dumps(scene, ensure_ascii=False)

    def test_motion_demo_json(self):
        p = Path(__file__).resolve().parent.parent / "episodes" / "lab_motion_demo" / "scene.json"
        scene = json.loads(p.read_text(encoding="utf-8"))
        self.assertTrue(scene["motion"]["camera"])
        self.assertTrue(scene["motion"]["elements"])


if __name__ == "__main__":
    unittest.main()
