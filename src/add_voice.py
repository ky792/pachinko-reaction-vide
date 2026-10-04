"""完成済み動画に、台本タイムラインどおりの日本語読み上げ（edge-tts）を重ねる。

映像は再エンコードせずそのまま（-c:v copy）。元の音声（BGM・SE）は残し、
少し下げた上に声をミックスして、最後にラウドネスを -15 LUFS 前後へ整える。

    python src/add_voice.py --style dynamic --test 90   # 緩急あり・冒頭90秒（→ output/voice_dynamic_test.mp4）
    python src/add_voice.py --style dynamic             # 緩急あり・フル
    python src/add_voice.py --style flat --test 60      # 以前の一定の読み方
    python src/add_voice.py --tts dummy ...             # 通信なしの動作確認用（声の代わりに短い音）

dynamic: レスを分類して声・速さ・高さ・音量・間を変え、文ごとに分けたクリップをつないで読む（src/voice_style.py）。
GitHub Actions（.github/workflows/add-voice.yml）から実行する想定。スマホ上では実行しない。
"""
import argparse, asyncio, hashlib, json, os, re, subprocess, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice_style import build_plan, summary  # noqa: E402


class Fail(Exception):
    pass


def sh(cmd, what, capture=True):
    p = subprocess.run(cmd, capture_output=capture, text=True)
    if p.returncode != 0:
        raise Fail(f"{what} に失敗しました:\n{(p.stderr or '')[-1500:]}")
    return p


def probe_duration(path):
    p = sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], "動画の長さ取得")
    return float(p.stdout.strip())


def decode(path, sr):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True)
    if p.returncode != 0:
        raise Fail(f"音声のデコードに失敗: {path}\n{p.stderr.decode(errors='ignore')[-800:]}")
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def tempo(x, f, sr):
    """numpy音声を ffmpeg atempo で f 倍速に（音程は変えない）。"""
    if abs(f - 1.0) < 0.01:
        return x
    chain, g = [], f
    while g > 2.0:
        chain.append("atempo=2.0"); g /= 2.0
    chain.append(f"atempo={g:.4f}")
    p = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
                        "-af", ",".join(chain), "-f", "f32le", "-"], input=x.astype(np.float32).tobytes(), capture_output=True)
    if p.returncode != 0:
        return x
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def trim(x, sr, thr=0.006):
    """edge-tts の前後の無音を削る（間を正確に作るため）。"""
    if len(x) == 0:
        return x
    a = np.abs(x)
    idx = np.where(a > thr)[0]
    if len(idx) == 0:
        return x[:0]
    pad = int(0.02 * sr)
    return x[max(0, idx[0] - pad): min(len(x), idx[-1] + pad)]


def tts_text(text, cfg):
    t = text
    for a, b in cfg["tts"].get("replace", {}).items():
        t = t.replace(a, b)
    t = t.replace("\n", "、")
    t = re.sub(r"、+", "、", t).strip("、 ")
    return t


def clip_key(engine, voice, rate, pitch, volume, text):
    raw = json.dumps([engine, voice, rate, pitch, volume, text], ensure_ascii=False)
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


async def synth_all(jobs, cfg, mode):
    """jobs: [dict(voice, rate, pitch, volume, text, path)] を並列生成。既にあるものはスキップ（キャッシュ）。"""
    todo = [j for j in jobs if not j["path"].exists()]
    print(f"[TTS] クリップ合計 {len(jobs)} / 新規 {len(todo)} / キャッシュ {len(jobs) - len(todo)}", flush=True)
    if not todo:
        return
    if mode == "dummy":
        for j in todo:
            j["path"].parent.mkdir(parents=True, exist_ok=True)
            spd = 1 + int(j["rate"].rstrip("%")) / 100
            secs = 0.25 + len(j["text"]) / (8.0 * spd)
            f = 220 + int(j["pitch"].rstrip("Hz")) * 8 + (120 if "Nanami" in j["voice"] else 0)
            sh(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency={f}:duration={secs:.2f}",
                "-af", "apad=pad_dur=0.12,adelay=100", "-c:a", "libmp3lame", str(j["path"])], "ダミー音声生成")
        return
    try:
        import edge_tts
    except ImportError:
        raise Fail("edge-tts が入っていません（pip install edge-tts）")
    sem = asyncio.Semaphore(cfg["tts"].get("concurrency", 4))
    done = 0

    async def one(j):
        nonlocal done
        j["path"].parent.mkdir(parents=True, exist_ok=True)
        last = None
        for attempt in range(cfg["tts"].get("retries", 4)):
            async with sem:
                try:
                    tmp = j["path"].with_suffix(".part")
                    com = edge_tts.Communicate(j["text"], j["voice"], rate=j["rate"], pitch=j["pitch"], volume=j["volume"])
                    await com.save(str(tmp))
                    if tmp.stat().st_size < 500:
                        raise RuntimeError("音声が空でした")
                    tmp.replace(j["path"])
                    done += 1
                    if done % 25 == 0 or done == len(todo):
                        print(f"[TTS] {done}/{len(todo)}", flush=True)
                    return
                except Exception as e:
                    last = e
            await asyncio.sleep(2 * (attempt + 1))
        raise Fail(f"edge-tts で生成できませんでした（{j['voice']}:「{j['text'][:20]}」）: {last}")

    await asyncio.gather(*(one(j) for j in todo))


# ---------------- 声トラックの組み立て ----------------
def build_voice_flat(lines, cfg, sr, N, dur, mode):
    """以前の一定の読み方（1レス=1クリップ、話者ごとに固定の声）。"""
    jobs = []
    for l in lines:
        t = tts_text(l["text"], cfg)
        if not t:
            continue
        v = cfg["tts"]["voices"][l["speaker"]]
        k = clip_key(cfg["tts"]["engine"], v["voice"], v["rate"], v["pitch"], v.get("volume", "+0%"), t)
        l["_job"] = dict(voice=v["voice"], rate=v["rate"], pitch=v["pitch"], volume=v.get("volume", "+0%"), text=t,
                         path=ROOT / cfg["cache_dir"] / (("dummy_" if mode == "dummy" else "") + k + ".mp3"))
        jobs.append(l["_job"])
    asyncio.run(synth_all(jobs, cfg, mode))
    T = cfg["timing"]
    voice, mask = np.zeros(N, np.float32), np.zeros(N, np.float32)
    fast = 0
    for l in lines:
        if "_job" not in l:
            continue
        x = decode(l["_job"]["path"], sr)
        start = l["start"] + T["voice_offset"]
        avail = max(0.3, min(l["end"], dur) - start - T["slot_margin"])
        if len(x) / sr > avail:
            x = tempo(x, min(len(x) / sr / avail, T["max_speedup"]), sr); fast += 1
        s = int(start * sr); e = min(N, s + len(x))
        if s < N:
            voice[s:e] += x[: e - s]; mask[s:e] = 1.0
    print(f"[同期] 読み上げ {len(lines)} 件 / 速めた {fast} 件", flush=True)
    return voice, mask


def build_voice_dynamic(lines, cfg, sr, N, dur, mode):
    S, T = cfg["style"], cfg["timing"]
    plan = build_plan(lines, cfg)
    print("[演出] " + summary(plan), flush=True)
    jobs = []
    for p in plan:
        for s in p["segments"]:
            vol = "+0%"
            k = clip_key(cfg["tts"]["engine"], s["voice"], s["rate_str"], s["pitch_str"], vol, s["text"])
            s["_job"] = dict(voice=s["voice"], rate=s["rate_str"], pitch=s["pitch_str"], volume=vol, text=s["text"],
                             path=ROOT / cfg["cache_dir"] / (("dummy_" if mode == "dummy" else "") + k + ".mp3"))
            jobs.append(s["_job"])
    asyncio.run(synth_all(jobs, cfg, mode))

    target = S.get("clip_target_rms", 0.08)
    voice, mask = np.zeros(N, np.float32), np.zeros(N, np.float32)
    prev_end = 0.0
    stats = {"gap_squeezed": 0, "sped_up": 0, "spill": 0}
    report = []
    for idx, p in enumerate(plan):
        segs = [trim(decode(s["_job"]["path"], sr), sr) for s in p["segments"]]
        if not any(len(x) for x in segs):
            continue
        gaps = [s["gap_before"] for s in p["segments"]]

        def assemble(gscale):
            parts = []
            for x, g in zip(segs, gaps):
                if parts and g > 0:
                    parts.append(np.zeros(int(g * gscale * sr), np.float32))
                parts.append(x)
            return np.concatenate(parts) if parts else np.zeros(0, np.float32)

        start = max(p["start"] + T["voice_offset"] + p["pause_before"], prev_end + S["min_gap_between_lines"])
        limit = min(p["end"], dur) - p["pause_after"]
        avail = max(0.35, limit - start)
        clip = assemble(1.0)
        if len(clip) / sr > avail:                       # まず文中の間を詰める
            clip = assemble(0.4); stats["gap_squeezed"] += 1
        if len(clip) / sr > avail:                       # それでも長ければ少し速く
            f = min(len(clip) / sr / avail, T["max_speedup"])
            clip = tempo(clip, f, sr); stats["sped_up"] += 1
        if len(clip) / sr > avail + 0.05:
            # 次の表示までの余白（pause_after）を使ってでも収める
            avail2 = max(0.35, min(p["end"], dur) - start - 0.05)
            if len(clip) / sr > avail2:
                stats["spill"] += 1
        # 音量をそろえてから、分類ごとの強弱（dB）を付ける
        rms = float(np.sqrt(np.mean(clip ** 2))) if len(clip) else 0.0
        if rms > 1e-4:
            clip = clip * (target / rms)
        clip = clip * (10 ** (p["segments"][0]["gain_db"] / 20))
        s0 = int(start * sr); e0 = min(N, s0 + len(clip))
        if s0 >= N:
            break
        voice[s0:e0] += clip[: e0 - s0]
        mask[s0:e0] = 1.0
        prev_end = start + len(clip) / sr
        report.append({"id": p["id"], "start": round(start, 2), "end": round(prev_end, 2), "slot_end": p["end"],
                       "speaker": p["speaker"], "voice": p.get("voice_key", p["speaker"]), "class": p["cls"], "level": p["level"],
                       "text": p["text"]})
    print(f"[同期] 読み上げ {len(report)} 件 / 文中の間を詰めた {stats['gap_squeezed']} / 速めた {stats['sped_up']} / "
          f"次の表示にはみ出した {stats['spill']}", flush=True)
    (ROOT / "work" / "voice_plan.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return voice, mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", type=float, default=None, help="冒頭N秒だけ書き出す")
    ap.add_argument("--style", default="dynamic", choices=["dynamic", "flat"])
    ap.add_argument("--tts", default="edge", choices=["edge", "dummy"])
    ap.add_argument("--config", default=str(ROOT / "config.json"))
    ap.add_argument("--input", default=None, help="入力動画（configより優先）")
    ap.add_argument("--output", default=None, help="出力先（configより優先）")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    tl = json.loads((ROOT / cfg["timeline"]).read_text(encoding="utf-8"))
    src = Path(args.input) if args.input else ROOT / cfg["input_video"]
    if not src.exists():
        raise Fail(f"入力動画がありません: {src}\n  → input/ に動画を置くか、workflow の video_url を指定してください")
    if args.output:
        out = Path(args.output)
    elif args.style == "dynamic":
        out = ROOT / (cfg["output_dynamic_test"] if args.test else cfg["output_dynamic_full"])
    else:
        out = ROOT / (cfg["output_test"].format(seconds=int(args.test)) if args.test else cfg["output_full"])
    if out.resolve() == src.resolve():
        raise Fail("出力先が元動画と同じです。元動画は上書きしません。")
    out.parent.mkdir(parents=True, exist_ok=True)
    work = ROOT / "work"; work.mkdir(exist_ok=True)

    vdur = probe_duration(src)
    tdur = tl.get("video_duration")
    if tdur and abs(vdur - tdur) > 2.0:
        print(f"[警告] 動画の長さ {vdur:.1f}秒 と台本タイムライン {tdur:.1f}秒 がずれています。別の動画かもしれません。", flush=True)
    dur = min(vdur, args.test) if args.test else vdur
    print(f"[情報] 入力 {src.name} ({vdur:.1f}秒) → 書き出し {dur:.1f}秒 / 読み方: {args.style}", flush=True)

    kinds = set(cfg["tts"].get("read_kinds", []))
    lines = [dict(l) for l in tl["lines"] if l["start"] < dur and l["kind"] in kinds]

    m = cfg["mix"]
    sr = m["sample_rate"]
    N = int(dur * sr) + 1
    mode = "dummy" if args.tts == "dummy" else "edge"
    if args.style == "dynamic":
        voice, mask = build_voice_dynamic(lines, cfg, sr, N, dur, mode)
    else:
        voice, mask = build_voice_flat(lines, cfg, sr, N, dur, mode)

    orig = decode(src, sr)[:N]
    if len(orig) < N:
        orig = np.pad(orig, (0, N - len(orig)))
    k = int(0.15 * sr)
    env = np.convolve(mask, np.ones(k) / k, mode="same")
    duck = 1.0 - (1.0 - m["duck_original_under_voice"]) * np.clip(env, 0, 1)
    mix = orig * m["original_volume"] * duck + voice * m["voice_volume"]
    pk = float(np.max(np.abs(mix))) or 1.0
    mix = (mix / pk * 0.5).astype(np.float32)
    raw = work / "mix_raw.f32"
    mix.tofile(raw)

    I, TP = m["target_lufs"], m["true_peak"]
    fin = ["-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", str(raw)]

    def measure(inp):
        p = sh(["ffmpeg", "-hide_banner", *inp, "-af", f"loudnorm=I={I}:TP={TP}:LRA=11:print_format=json", "-f", "null", "-"], "ラウドネス測定")
        js = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
        if not js:
            raise Fail("ラウドネス測定結果を読めませんでした")
        return json.loads(js.group(0))

    js = measure(fin)
    gain = I - float(js["input_i"])
    pre = work / "mix_pre.wav"
    sh(["ffmpeg", "-y", "-v", "error", *fin, "-af",
        f"volume={gain:.2f}dB,alimiter=limit={10 ** ((TP - 0.5) / 20):.4f}:attack=3:release=60:level=disabled", str(pre)], "プリゲイン")
    js = measure(["-i", str(pre)])
    af = (f"loudnorm=I={I}:TP={TP}:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
          f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
    final = work / "mix_final.wav"
    sh(["ffmpeg", "-y", "-v", "error", "-i", str(pre), "-af", af, "-ar", str(sr), "-ac", "2", str(final)], "ラウドネス調整")

    sh(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-i", str(final), "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", m["audio_bitrate"], "-t", f"{dur:.3f}", "-movflags", "+faststart", str(out)], "動画との結合")
    lufs = measure(["-i", str(out)])["input_i"]
    print(f"[完成] {out.relative_to(ROOT)}  ({dur:.1f}秒, {lufs} LUFS)", flush=True)
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        with open(gh, "a") as f:
            f.write(f"output_path={out.relative_to(ROOT)}\n")


if __name__ == "__main__":
    try:
        main()
    except Fail as e:
        print(f"\n[エラー] {e}", file=sys.stderr)
        sys.exit(1)
