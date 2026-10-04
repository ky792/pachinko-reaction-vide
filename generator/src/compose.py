"""音声トラック（声・BGM・SE）を合成し、ラウドネスを整えて映像と結合する。"""
import json, re, subprocess
from math import gcd
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly
from .common import asset_path, TEMP, PipelineError, log


def _read(path, sr):
    try:
        r, x = wavfile.read(str(path))
    except Exception as e:
        raise PipelineError(f"音声ファイルを読めません: {path} ({e})")
    if x.dtype == np.int16:
        x = x.astype(np.float32) / 32768
    elif x.dtype == np.int32:
        x = x.astype(np.float32) / 2147483648
    else:
        x = x.astype(np.float32)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if r != sr:
        g = gcd(r, sr)
        x = resample_poly(x, sr // g, r // g).astype(np.float32)
    return x


def _place(track, x, start, sr, gain=1.0):
    s = int(start * sr)
    if s >= len(track):
        return
    e = min(len(track), s + len(x))
    track[s:e] += x[: e - s] * gain


def _loop(x, n):
    if len(x) == 0:
        return np.zeros(n, np.float32)
    return np.tile(x, int(np.ceil(n / len(x))) + 1)[:n]


def run(cmd, what):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise PipelineError(f"ffmpeg ({what}) に失敗:\n{p.stderr[-1500:]}")
    return p


def build_audio(cfg, events, duration):
    a = cfg["audio"]
    sr = a["sample_rate"]
    N = int(duration * sr) + 1
    voice = np.zeros(N, np.float32); bgm = np.zeros(N, np.float32); se = np.zeros(N, np.float32)

    for e in events:
        if e["start"] >= duration:
            break
        if e.get("voice"):
            _place(voice, _read(e["voice"], sr), e["start"] + 0.12, sr)
        s = e.get("se")
        if s and cfg["se"].get(s, {}).get("enabled"):
            _place(se, _read(asset_path("se/" + cfg["se"][s]["file"]), sr), e["start"], sr)

    end_start = next((e["start"] for e in events if e.get("bgm") == "ending"), duration)
    cut = next((e["start"] for e in events if e.get("bgm_cut")), None)
    main = _read(asset_path("bgm/" + cfg["bgm"]["main"]), sr)
    m_end = int(min(end_start, duration) * sr)
    bgm[:m_end] = _loop(main, m_end)
    if cut is not None and cut < end_start:
        c0 = int(cut * sr); bgm[c0:m_end] = 0
    if end_start < duration:
        ending = _read(asset_path("bgm/" + cfg["bgm"]["ending"]), sr)
        s0 = int(end_start * sr)
        seg = _loop(ending, N - s0)
        fi = min(len(seg), int(1.0 * sr)); seg[:fi] *= np.linspace(0, 1, fi)
        bgm[s0:] = seg
    fo = min(N, int(2.5 * sr)); bgm[-fo:] *= np.linspace(1, 0, fo)
    fi0 = min(N, int(0.4 * sr)); bgm[:fi0] *= np.linspace(0, 1, fi0)

    mix = voice * a["voice_volume"] + bgm * a["bgm_volume"] + se * a["se_volume"]
    pk = float(np.max(np.abs(mix))) or 1.0
    mix = mix / pk * 0.5
    raw = TEMP / "mix_raw.wav"
    wavfile.write(str(raw), sr, mix.astype(np.float32))
    return raw


def _measure_json(src, I, TP):
    p = run(["ffmpeg", "-hide_banner", "-i", str(src), "-af",
             f"loudnorm=I={I}:TP={TP}:LRA=11:print_format=json", "-f", "null", "-"], "ラウドネス測定")
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    if not m:
        raise PipelineError("ラウドネス測定結果を読めませんでした")
    return json.loads(m.group(0))


def loudnorm(cfg, src, dst):
    """目標LUFSへ。ピークで頭打ちにならないよう、先にゲイン+リミッターで寄せてから2パスloudnorm。"""
    a = cfg["audio"]
    I, TP = a["target_lufs"], a["true_peak"]
    js = _measure_json(src, I, TP)
    gain = I - float(js["input_i"])
    pre = TEMP / "mix_pre.wav"
    lim = 10 ** ((TP - 0.5) / 20)
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af",
         f"volume={gain:.2f}dB,alimiter=limit={lim:.4f}:attack=3:release=60:level=disabled",
         str(pre)], "プリゲイン")
    src = pre
    js = _measure_json(src, I, TP)
    af = (f"loudnorm=I={I}:TP={TP}:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
          f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af", af,
         "-ar", str(a["sample_rate"]), str(dst)], "ラウドネス調整")
    return float(js["input_i"])


def measure(path):
    p = run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"], "最終ラウドネス測定")
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    return float(json.loads(m.group(0))["input_i"]) if m else None


def mux(video, audio, out):
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(video), "-i", str(audio),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)], "結合")
