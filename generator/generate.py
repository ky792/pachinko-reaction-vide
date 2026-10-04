"""台本JSONから反応集動画を1コマンドで生成する。

    python generate.py scripts/episode_001.json
    python generate.py scripts/episode_001.json --test 45        # 冒頭45秒だけのテスト動画
    python generate.py scripts/episode_001.json --no-voice       # VOICEVOXを使わず推定尺で
    python generate.py scripts/source/episode_001.txt            # テキスト台本を直接渡してもOK（自動でJSON化）
    python generate.py scripts/episode_001.json -o output/my.mp4
"""
import argparse, json, sys, time
from pathlib import Path
from src.common import (ROOT, TEMP, OUTPUT, PipelineError, load_env, load_config, load_script,
                        ensure_dirs, log)
from src.generate_audio import VoiceGenerator
from src import timeline, compose
from src.generate_video import Renderer
from src.parse_script import parse


def main():
    ap = argparse.ArgumentParser(description="パチンコ反応集 動画生成")
    ap.add_argument("script", help="scripts/episode_XXX.json（.yaml / 台本.txt も可）")
    ap.add_argument("-o", "--output", help="出力先 mp4（既定: output/<台本名>.mp4）")
    ap.add_argument("--test", type=float, default=None, help="冒頭N秒だけ書き出すテストモード")
    ap.add_argument("--no-voice", action="store_true", help="VOICEVOXを使わず文字数から尺を推定")
    ap.add_argument("--config", default=None, help="config.json のパス")
    ap.add_argument("--cues-out", default=None, help="画像差し込み情報の出力先（既定: 台本と同じフォルダの image_cues.json）")
    ap.add_argument("--cues-in", default=None, help="手で編集した image_cues.json を使う場合に指定")
    ap.add_argument("--timeline-out", default=None, help="読み上げ用タイムライン(timeline.json)の出力先")
    args = ap.parse_args()

    t0 = time.time()
    load_env()
    cfg = load_config(args.config)
    ensure_dirs()

    sp = Path(args.script)
    if sp.suffix == ".txt":
        log(f"[1/10] テキスト台本をJSONに変換: {sp}")
        js = ROOT / "scripts" / (sp.stem + ".json")
        js.write_text(json.dumps(parse(sp.read_text(encoding="utf-8")), ensure_ascii=False, indent=2), encoding="utf-8")
        sp = js
    log(f"[1/10] 台本読み込み: {sp}")
    script = load_script(sp)

    name = sp.stem + (f"_test{int(args.test)}s" if args.test else "")
    out = Path(args.output) if args.output else OUTPUT / f"{name}.mp4"
    if out.exists() and out.resolve().name.startswith("pachisure_ep2_v7"):
        raise PipelineError("元動画は上書きしません。別の出力名を指定してください。")
    out.parent.mkdir(parents=True, exist_ok=True)

    log("[2/10] 音声生成（キャッシュ利用）")
    voice = VoiceGenerator(cfg, force_estimate=args.no_voice)
    log("[3/10] 音声尺の取得 → [4/10] 表示時間の決定")
    events, total, cues = timeline.build(script, cfg, voice)
    if args.cues_in:
        cues = json.loads(Path(args.cues_in).read_text(encoding="utf-8"))["cues"]
        log(f"       画像差し込み: {args.cues_in} を使用")
    cues_out = Path(args.cues_out) if args.cues_out else sp.parent / "image_cues.json"
    if not args.cues_in:
        cues_out.write_text(json.dumps({"_note": "time=表示開始(秒) duration=表示秒数 files=assets/machines内の画像 label=機種名 layout=single/sequence/row telop=中央テロップ。手で直したら --cues-in で指定",
                                        "cues": [{**c, "file": "assets/machines/" + c["files"][0] if c["files"] else ""} for c in cues]},
                                       ensure_ascii=False, indent=1), encoding="utf-8")
        log(f"       画像差し込み {len(cues)} 件 → {cues_out}")
    if args.timeline_out:
        Path(args.timeline_out).write_text(json.dumps(timeline.export_voice_lines(events, total), ensure_ascii=False, indent=1), encoding="utf-8")
        log(f"       読み上げ用タイムライン → {args.timeline_out}")
    voice.summary()
    dur = min(total, args.test) if args.test else total
    log(f"       イベント {len(events)} 件 / 全体 {total/60:.1f} 分" + (f"（テスト: {dur:.0f} 秒）" if args.test else ""))
    (TEMP / f"{name}_timeline.json").write_text(json.dumps(
        [{k: (str(v) if k == "voice" and v else v) for k, v in e.items()} for e in events],
        ensure_ascii=False, indent=1), encoding="utf-8")

    log("[5/10] キャラ表示・[8/10] 字幕レンダリング（映像書き出し）")
    vtmp = TEMP / f"{name}_video.mp4"
    Renderer(cfg, script, cues).render(events, total, vtmp, limit=dur)

    log("[6/10] BGM・[7/10] SE・声のミックス")
    raw = compose.build_audio(cfg, events, dur)
    norm = TEMP / f"{name}_audio.wav"
    compose.loudnorm(cfg, raw, norm)
    log("[9/10] ffmpeg 合成 → [10/10] mp4 出力")
    compose.mux(vtmp, norm, out)
    lufs = compose.measure(out)
    log(f"完成: {out}  ({dur/60:.1f} 分, {lufs:.1f} LUFS, 処理 {time.time()-t0:.0f} 秒)")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        print(f"\n[エラー] {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n中断しました", file=sys.stderr)
        sys.exit(130)
