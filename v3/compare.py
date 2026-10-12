"""Reuse the V3 renderer to compare normal/rich effects on the same 90 seconds.

python -m v3.compare episodes/v5_preview_part2 --voice
python -m v3.compare episodes/v5_preview_part2 --silent-preview --fps 6
"""
import argparse
import copy
import hashlib
import json
import math
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

from . import build, style
from .images import ImageLib
from .media import Library
from .photos import PhotoLib
from .planner import Planner, parse

_STATE = None


def clip_scenes(scenes, seconds):
    """Exclude later voices; retain original timing and durations at the cut."""
    if not scenes or scenes[-1]['start'] + scenes[-1]['dur'] < seconds:
        raise ValueError(f'台本が{seconds:g}秒に足りません。台本を追加してください。')
    result = []
    for sc in scenes:
        if sc['start'] >= seconds:
            break
        item = copy.deepcopy(sc)
        item['lines'] = [ln for ln in item['lines'] if ln['start'] < seconds]
        result.append(item)
    return result


def voice_key(line, casting, dictionary, version):
    cfg = casting[line['who']]
    mood = line.get('voice', {}).get('mood') or (cfg.get('exclaim_mood') if line['exclaim'] else None)
    data = [line['text'], line['who'], mood, cfg, dictionary, version]
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True).encode()).hexdigest(), mood


def ensure_voice(ep, seconds, cache):
    """Only synthesize lines needed for the preview; reuse content-addressed WAVs."""
    from . import voice
    dictionary = voice.load_dict()
    cp = ep / 'casting.json'
    casting = json.loads(cp.read_text()) if cp.exists() else voice.cast()
    version = voice._req('GET', '/version')
    voice.sync_dict(dictionary)
    cache.mkdir(parents=True, exist_ok=True)
    out = ep / 'voices'
    out.mkdir(exist_ok=True)
    needed = []
    for n, line in enumerate((x for x in parse(ep / 'script.txt') if x['cmd'] == 'line'), 1):
        key, mood = voice_key(line, casting, dictionary, version)
        cached = cache / f'{key}.wav'
        if not cached.exists():
            wav, _, _ = voice.line_audio(line['text'], line['who'], dictionary, casting, mood)
            tmp = cached.with_suffix('.tmp')
            tmp.write_bytes(wav)
            tmp.replace(cached)
            print(f'voice {n:03d}: generated', flush=True)
        else:
            print(f'voice {n:03d}: cached', flush=True)
        (out / f'{n:03d}.wav').write_bytes(cached.read_bytes())
        needed.append(key)
        current = Planner(ep).plan()
        ln = next(ln for sc in current for ln in sc['lines'] if ln['id'] == f'{n:03d}')
        if ln['start'] + ln['dur'] >= seconds:
            break
    return needed


def fingerprint(ep, options):
    digest = hashlib.sha256(json.dumps(options, sort_keys=True).encode())
    paths = set((style.ROOT / 'v3').glob('*.py'))
    paths.update((style.ROOT / 'voice').glob('*.json'))
    for root in [ep, style.ASSETS, style.ROOT / 'assets']:
        for p in root.rglob('*'):
            rel = p.relative_to(root)
            if p.is_file() and not any(x in ('build', 'cache', '__pycache__') for x in rel.parts):
                if p.suffix.lower() in ('.txt', '.json', '.png', '.jpg', '.jpeg', '.wav', '.ttc', '.ttf'):
                    paths.add(p)
    for p in sorted(paths):
        name = p.relative_to(style.ROOT) if p.is_relative_to(style.ROOT) else p
        digest.update(str(name).encode())
        with p.open('rb') as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                digest.update(chunk)
    return digest.hexdigest()


def init_render(episode, rich, seconds, fps, size, silent):
    global _STATE
    ep = Path(episode)
    pl = Planner(ep)
    scenes = clip_scenes(pl.plan(), seconds)
    data = dict(pl.data, rich_fx=rich)
    build.prepare(scenes, data)
    build.MUSIC = data.get('music')
    build.RICH = rich
    style.REVIEW = '90秒 A/B検証・声なし' if silent else '90秒 A/B検証'
    style.QUIET = bool(data.get('quiet_notes'))
    lib = Library(ep)
    lib.photos = PhotoLib()
    lib.images = ImageLib(ep, lib.photos, data)
    if silent:
        for sc in scenes:
            for ln in sc['lines']:
                ln['voice'] = None
    _STATE = (scenes, seconds, fps, size, lib)


def render_frame(index):
    scenes, seconds, fps, size, lib = _STATE
    im = build.frame(scenes, seconds, index / fps, lib)
    im = im.resize(size, Image.Resampling.BILINEAR)
    return im.tobytes()


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ]))


def validate_video(path, seconds):
    info = probe(path)
    kinds = {x['codec_type'] for x in info['streams']}
    if not {'video', 'audio'} <= kinds:
        raise ValueError(f'{path}: 映像または音声トラックがありません')
    for stream in info['streams']:
        if stream['codec_type'] in ('video', 'audio'):
            if abs(float(stream['duration']) - seconds) > 0.1:
                raise ValueError(f'{path}: {stream["codec_type"]}が{seconds:g}秒ではありません')
    return {'duration': float(info['format']['duration']), 'bytes': path.stat().st_size}


def render_variant(ep, dest, rich, args):
    settings = (str(ep), rich, args.seconds, args.fps, (args.width, args.width * 9 // 16), args.silent_preview)
    init_render(*settings)
    frames = round(args.seconds * args.fps)
    temp = dest.with_suffix('.render.mp4')
    wav = dest.with_suffix('.wav')
    build.build_audio(_STATE[0], args.seconds, wav)
    encoder = subprocess.Popen([
        'ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', f'{settings[4][0]}x{settings[4][1]}', '-r', str(args.fps), '-i', '-',
        '-i', str(wav), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-threads', '2', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac',
        '-b:a', '160k', '-t', str(args.seconds), '-movflags', '+faststart', str(temp)
    ], stdin=subprocess.PIPE)
    started = time.monotonic()
    try:
        # Submit bounded batches so raw frame buffers cannot exhaust RAM.
        with ProcessPoolExecutor(max_workers=args.workers, initializer=init_render, initargs=settings) as pool:
            for start in range(0, frames, args.workers * 4):
                end = min(frames, start + args.workers * 4)
                for raw in pool.map(render_frame, range(start, end)):
                    encoder.stdin.write(raw)
                if start // (args.fps * 10) != end // (args.fps * 10):
                    print(f'{dest.name}: {end / args.fps:.0f}/{args.seconds:g}s ({time.monotonic()-started:.0f}s)', flush=True)
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError('ffmpeg encoding failed')
        validate_video(temp, args.seconds)
        temp.replace(dest)
    finally:
        if encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        wav.unlink(missing_ok=True)
        temp.unlink(missing_ok=True)


def comparison(a, b, output, seconds):
    # A single 90s split-screen file; BGM and narration from A avoid doubled voices.
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error', '-i', str(a), '-i', str(b),
        '-filter_complex', '[0:v]scale=960:540,drawbox=x=0:y=0:w=70:h=50:color=black@0.7:t=fill,drawtext=text=A:x=20:y=8:fontsize=32:fontcolor=white[a];[1:v]scale=960:540,drawbox=x=0:y=0:w=70:h=50:color=black@0.7:t=fill,drawtext=text=B:x=20:y=8:fontsize=32:fontcolor=white[b];[a][b]hstack[v]',
        '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'ultrafast',
        '-crf', '23', '-threads', '2', '-c:a', 'copy', '-t', str(seconds),
        '-movflags', '+faststart', str(output)
    ], check=True)
    return validate_video(output, seconds)


def main(argv=None):
    parser = argparse.ArgumentParser(description='同じ台本・声・素材で90秒のA/B比較を生成')
    parser.add_argument('episode', type=Path)
    parser.add_argument('-o', '--output', type=Path, default=style.ROOT / 'output' / 'compare90')
    parser.add_argument('--seconds', type=float, default=90)
    parser.add_argument('--fps', type=int, choices=(6, 12, 30), default=12)
    parser.add_argument('--width', type=int, choices=(960, 1280, 1920), default=1280)
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--voice', action='store_true', help='必要な音声を生成。生成済みならキャッシュを再利用')
    parser.add_argument('--silent-preview', action='store_true', help='声なし確認版。画面とレポートに明記')
    parser.add_argument('--voice-cache', type=Path, default=style.ROOT / 'cache' / 'tts-v3')
    args = parser.parse_args(argv)
    if not math.isfinite(args.seconds) or args.seconds <= 0 or args.workers < 1:
        parser.error('秒数とworkersは正の値にしてください')
    if args.voice and args.silent_preview:
        parser.error('--voiceと--silent-previewは同時に指定できません')
    if not args.episode.resolve().is_relative_to((style.ROOT / 'episodes').resolve()):
        parser.error('episodes/配下の回を指定してください')
    if args.voice:
        ensure_voice(args.episode, args.seconds, args.voice_cache)
    scenes = clip_scenes(Planner(args.episode).plan(), args.seconds)
    missing_voice = [ln['id'] for sc in scenes for ln in sc['lines'] if not ln.get('voice')]
    if missing_voice and not args.silent_preview:
        parser.error('音声がありません。--voiceで生成するか、--silent-previewを明示してください')
    args.output.mkdir(parents=True, exist_ok=True)
    options = {'seconds': args.seconds, 'fps': args.fps, 'width': args.width, 'silent': args.silent_preview}
    key = fingerprint(args.episode, options)
    manifest = args.output / 'manifest.json'
    old = json.loads(manifest.read_text()) if manifest.exists() else {}
    outputs = {name: args.output / f'{name}.mp4' for name in ('A', 'B', 'AB')}
    if old.get('input_sha256') == key and all(p.exists() for p in outputs.values()):
        for p in outputs.values():
            validate_video(p, args.seconds)
        print('同じ台本・素材・設定のため、完成済みのA/B動画を再利用しました。')
        return
    for name, rich in [('A', False), ('B', True)]:
        render_variant(args.episode, outputs[name], rich, args)
    info = comparison(outputs['A'], outputs['B'], outputs['AB'], args.seconds)
    # Capture concrete missing-image warnings using the same library as the renderer.
    init_render(str(args.episode), True, args.seconds, args.fps, (args.width, args.width * 9 // 16), args.silent_preview)
    lib = _STATE[-1]
    for sc in _STATE[0]:
        for ref in [sc['opts'].get('ref'), (sc.get('overlay') or {}).get('ref')]:
            if ref:
                lib.images.note_use(ref, sc['start'])
        if sc.get('machine', {}).get('photos'):
            lib.photos.machine(sc['machine']['photos'], 'front')
    lib.photos.write_missing(args.output)
    image_report = {ref: {'times': times, 'placeholder': lib.images.get(ref).placeholder,
                          'file': lib.images.get(ref).path_text}
                    for ref, times in lib.images.used.items()}
    report = {'input_sha256': key, 'episode': str(args.episode), **options,
              'narration': not args.silent_preview, 'A': '通常演出', 'B': '強化演出',
              'AB_audio': 'Aの音声（Bの効果音はB.mp4で確認）',
              'same_script_voice_timing': True, 'validation': info,
              'images': image_report, 'missing_voice': missing_voice}
    manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    text = f'# {args.seconds:g}秒A/B比較\n\nA：通常演出。B：強化演出。同じ台本・素材・声・開始位置です。\n\n'
    text += '声なし確認版です。BGM・効果音・字幕はあります。\n\n' if args.silent_preview else 'ナギとバクの読み上げ音声付きです。\n\n'
    text += 'AB.mp4は左右同時比較（音声はA）。Bの効果音はB.mp4で確認できます。\n\n'
    text += '写真・資料がない箇所は既存の準備中パネルで表示します。manifest.jsonとMISSING_PHOTOS.mdを確認してください。\n'
    (args.output / 'RESULT.md').write_text(text, encoding='utf-8')
    print(f'完成: {outputs["AB"]}', flush=True)


if __name__ == '__main__':
    main()
