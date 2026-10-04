"""完成済み動画に、台本タイムラインどおりの日本語読み上げ（edge-tts）を重ねる。

映像は再エンコードせずそのまま（-c:v copy）。元の音声（BGM・SE）は残し、
少し下げた上に声をミックスして、最後にラウドネスを -15 LUFS 前後へ整える。

    python src/add_voice.py --test 60     # 冒頭60秒だけ（テスト）
    python src/add_voice.py               # フル
    python src/add_voice.py --tts dummy   # 通信なしの動作確認用（声の代わりに短い音）

GitHub Actions（.github/workflows/add-voice.yml）から実行する想定。スマホ上では実行しない。
"""
import argparse, asyncio, hashlib, json, os, re, subprocess, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


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
    """任意の音声/動画ファイル → float32 モノラル（ffmpegでデコード）。"""
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True)
    if p.returncode != 0:
        raise Fail(f"音声のデコードに失敗: {path}\n{p.stderr.decode(errors='ignore')[-800:]}")
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def tts_text(text, cfg):
    t = text
    for a, b in cfg["tts"].get("replace", {}).items():
        t = t.replace(a, b)
    t = t.replace("\n", "、")
    t = re.sub(r"、+", "、", t).strip("、 ")
    return t


def cache_path(cfg, spk, text):
    v = cfg["tts"]["voices"][spk]
    key = json.dumps([cfg["tts"]["engine"], v["voice"], v["rate"], v["pitch"], v.get("volume", "+0%"), text], ensure_ascii=False)
    return ROOT / cfg["cache_dir"] / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".mp3")


async def synth_all(jobs, cfg, mode):
    """jobs: [(spk, text, path)] を並列で生成。既にあるものはスキップ（キャッシュ）。"""
    todo = [j for j in jobs if not j[2].exists()]
    print(f"[TTS] 合計 {len(jobs)} / 新規 {len(todo)} / キャッシュ {len(jobs) - len(todo)}", flush=True)
    if not todo:
        return
    if mode == "dummy":
        for spk, text, path in todo:
            path.parent.mkdir(parents=True, exist_ok=True)
            secs = 0.3 + len(text) / 9.0
            sh(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency={330 if spk=='board' else 520}:duration={secs:.2f}",
                "-af", "volume=0.4", str(path)], "ダミー音声生成")
        return
    try:
        import edge_tts
    except ImportError:
        raise Fail("edge-tts が入っていません（pip install edge-tts）")
    sem = asyncio.Semaphore(cfg["tts"].get("concurrency", 4))
    done = 0

    async def one(spk, text, path):
        nonlocal done
        v = cfg["tts"]["voices"][spk]
        path.parent.mkdir(parents=True, exist_ok=True)
        last = None
        for attempt in range(cfg["tts"].get("retries", 4)):
            async with sem:
                try:
                    tmp = path.with_suffix(".part")
                    com = edge_tts.Communicate(text, v["voice"], rate=v["rate"], pitch=v["pitch"], volume=v.get("volume", "+0%"))
                    await com.save(str(tmp))
                    if tmp.stat().st_size < 500:
                        raise RuntimeError("音声が空でした")
                    tmp.replace(path)
                    done += 1
                    if done % 20 == 0 or done == len(todo):
                        print(f"[TTS] {done}/{len(todo)}", flush=True)
                    return
                except Exception as e:  # 通信エラー等はリトライ
                    last = e
            await asyncio.sleep(2 * (attempt + 1))
        raise Fail(f"edge-tts で生成できませんでした（{spk}:「{text[:20]}」）: {last}")

    await asyncio.gather(*(one(*j) for j in todo))


def atempo_chain(f):
    parts = []
    while f > 2.0:
        parts.append("atempo=2.0"); f /= 2.0
    parts.append(f"atempo={f:.4f}")
    return ",".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", type=float, default=None, help="冒頭N秒だけ書き出す")
    ap.add_argument("--tts", default="edge", choices=["edge", "dummy"])
    ap.add_argument("--config", default=str(ROOT / "config.json"))
    ap.add_argument("--input", default=None, help="入力動画（configより優先）")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    tl = json.loads((ROOT / cfg["timeline"]).read_text(encoding="utf-8"))
    src = Path(args.input) if args.input else ROOT / cfg["input_video"]
    if not src.exists():
        raise Fail(f"入力動画がありません: {src}\n  → input/ に動画を置くか、workflow の video_url を指定してください")
    if args.test:
        out = ROOT / cfg["output_test"].format(seconds=int(args.test))
    else:
        out = ROOT / cfg["output_full"]
    if out.resolve() == src.resolve():
        raise Fail("出力先が元動画と同じです。元動画は上書きしません。")
    out.parent.mkdir(parents=True, exist_ok=True)
    work = ROOT / "work"; work.mkdir(exist_ok=True)

    vdur = probe_duration(src)
    tdur = tl.get("video_duration")
    if tdur and abs(vdur - tdur) > 2.0:
        print(f"[警告] 動画の長さ {vdur:.1f}秒 と台本タイムライン {tdur:.1f}秒 がずれています。別の動画かもしれません。", flush=True)
    dur = min(vdur, args.test) if args.test else vdur
    print(f"[情報] 入力 {src.name} ({vdur:.1f}秒) → 書き出し {dur:.1f}秒", flush=True)

    kinds = set(cfg["tts"].get("read_kinds", []))
    lines = [l for l in tl["lines"] if l["start"] < dur and l["kind"] in kinds]
    jobs = []
    for l in lines:
        t = tts_text(l["text"], cfg)
        if t:
            l["_tts"] = t
            l["_path"] = cache_path(cfg, l["speaker"], t) if args.tts == "edge" else ROOT / "work" / "dummy" / (cache_path(cfg, l["speaker"], t).name)
            jobs.append((l["speaker"], t, l["_path"]))
    asyncio.run(synth_all(jobs, cfg, "dummy" if args.tts == "dummy" else "edge"))

    m, T = cfg["mix"], cfg["timing"]
    sr = m["sample_rate"]
    N = int(dur * sr) + 1
    voice = np.zeros(N, np.float32)
    mask = np.zeros(N, np.float32)
    fast = slow = 0
    for i, l in enumerate(lines):
        if "_path" not in l:
            continue
        x = decode(l["_path"], sr)
        start = l["start"] + T["voice_offset"]
        nxt = min(l["end"], dur)
        avail = max(0.3, nxt - start - T["slot_margin"])
        length = len(x) / sr
        if length > avail:
            f = min(length / avail, T["max_speedup"])
            p = subprocess.run(["ffmpeg", "-v", "error", "-i", str(l["_path"]), "-af", atempo_chain(f), "-ac", "1", "-ar", str(sr),
                                "-f", "f32le", "-"], capture_output=True)
            if p.returncode == 0:
                x = np.frombuffer(p.stdout, dtype=np.float32).copy()
            fast += 1
            if len(x) / sr > avail + 0.05:
                slow += 1
        s = int(start * sr)
        e = min(N, s + len(x))
        if s < N:
            voice[s:e] += x[: e - s]
            mask[s:e] = 1.0
    print(f"[同期] 読み上げ {len(lines)} 件 / 枠に収めるため速めた {fast} 件 / 枠を少しはみ出した {slow} 件", flush=True)

    orig = decode(src, sr)[:N]
    if len(orig) < N:
        orig = np.pad(orig, (0, N - len(orig)))
    # 声が出ている間だけ元音声（BGM）をさらに少し下げる（滑らかに）
    k = int(0.15 * sr)
    env = np.convolve(mask, np.ones(k) / k, mode="same")
    duck = 1.0 - (1.0 - m["duck_original_under_voice"]) * np.clip(env, 0, 1)
    mix = orig * m["original_volume"] * duck + voice * m["voice_volume"]
    pk = float(np.max(np.abs(mix))) or 1.0
    mix = (mix / pk * 0.5).astype(np.float32)
    raw = work / "mix_raw.f32"
    mix.tofile(raw)

    # ラウドネス調整（ゲイン＋リミッター → 2パス loudnorm）
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

    # 映像はコピー（再エンコードしない）、音声だけ差し替え
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
