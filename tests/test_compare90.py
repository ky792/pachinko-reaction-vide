"""Preview boundaries and content-addressed voice reuse must remain safe."""
import copy
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from v3 import build
from v3.compare import clip_scenes, voice_key
from v3.planner import Planner


class Compare90Test(unittest.TestCase):
    def test_cut_excludes_later_voice_but_keeps_overlapping_line(self):
        scenes = [{'start': 0, 'dur': 100, 'lines': [
            {'id': '001', 'start': 88, 'dur': 8},
            {'id': '002', 'start': 96, 'dur': 4}]}]
        original = copy.deepcopy(scenes)
        result = clip_scenes(scenes, 90)
        self.assertEqual([x['id'] for x in result[0]['lines']], ['001'])
        self.assertEqual(result[0]['lines'][0]['dur'], 8)
        self.assertEqual(scenes, original)

    def test_short_script_is_rejected_instead_of_frozen_padding(self):
        with self.assertRaises(ValueError):
            clip_scenes([{'start': 0, 'dur': 35, 'lines': []}], 90)

    def test_actual_voice_crossing_cut_is_cropped(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'voice.wav'
            with wave.open(str(p), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
                w.writeframes((np.ones(44100 * 2, dtype=np.int16) * 1000).tobytes())
            scenes = [{'start': 0, 'dur': 5, 'template': 'F', 'opts': {}, '_events': [],
                       'lines': [{'start': 1, 'dur': 2, 'voice': str(p)},
                                 {'start': 4, 'dur': 2, 'voice': str(p)}]}]
            output = Path(tmp) / 'mix.wav'
            old = build.MUSIC
            try:
                build.MUSIC = None
                build.build_audio(clip_scenes(scenes, 2), 2, output)
            finally:
                build.MUSIC = old
            with wave.open(str(output)) as w:
                self.assertEqual(w.getnframes(), 88200)

    def test_voice_cache_changes_when_reading_or_cast_changes(self):
        line = {'who': 'nagi', 'text': '牙狼', 'exclaim': False, 'voice': {}}
        cast = {'nagi': {'speaker': 14, 'speed': 1}}
        key, _ = voice_key(line, cast, {'rules': []}, '0.25.2')
        other, _ = voice_key(line, {'nagi': {'speaker': 14, 'speed': 1.2}}, {'rules': []}, '0.25.2')
        reading, _ = voice_key(line, cast, {'rules': [{'re': '牙狼', 'to': 'ガロ'}]}, '0.25.2')
        self.assertNotEqual(key, other)
        self.assertNotEqual(key, reading)

    def test_existing_episode_has_at_least_90_seconds(self):
        ep = Path(__file__).resolve().parent.parent / 'episodes/v5_preview_part2'
        scenes = clip_scenes(Planner(ep).plan(), 90)
        self.assertGreaterEqual(scenes[-1]['start'] + scenes[-1]['dur'], 90)


if __name__ == '__main__':
    unittest.main()
