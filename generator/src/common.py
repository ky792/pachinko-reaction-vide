"""共通処理: パス・設定・.env・フォント・エラー表示。"""
import json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
TEMP = ROOT / "temp"
OUTPUT = ROOT / "output"
AUDIO_CACHE = ROOT / "audio" / "generated"


class PipelineError(Exception):
    """原因と対処を含むエラー。generate.py がメッセージを表示して終了する。"""


def load_env(path=None):
    """python-dotenv が無くても動く最小の .env 読み込み（既存の環境変数を優先）。"""
    p = Path(path) if path else ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def load_config(path=None):
    p = Path(path) if path else ROOT / "config.json"
    if not p.exists():
        raise PipelineError(f"設定ファイルが見つかりません: {p}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise PipelineError(f"config.json の書式エラー: {e}")


def load_script(path):
    p = Path(path)
    if not p.exists():
        raise PipelineError(f"台本ファイルが見つかりません: {p}")
    if p.suffix in (".yaml", ".yml"):
        try:
            import yaml
        except ImportError:
            raise PipelineError("YAML台本を使うには PyYAML が必要です（pip install pyyaml）。JSONなら不要です。")
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
    else:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise PipelineError(f"台本JSONの書式エラー ({p.name}): {e}")
    if "sections" not in data:
        raise PipelineError(f"台本に 'sections' がありません: {p}")
    return data


def asset_path(rel):
    p = ASSETS / rel
    if not p.exists():
        raise PipelineError(f"素材が見つかりません: {p}\n  → python src/make_default_assets.py で既定素材を作成できます")
    return p


_font_cache = {}
def font(cfg, kind, size):
    from PIL import ImageFont
    key = (kind, size)
    if key in _font_cache:
        return _font_cache[key]
    cands = cfg["assets"]["fonts"][kind]
    for c in cands:
        p = Path(c) if c.startswith("/") else ASSETS / c
        if p.exists():
            f = ImageFont.truetype(str(p), size, index=0) if p.suffix == ".ttc" else ImageFont.truetype(str(p), size)
            _font_cache[key] = f
            return f
    raise PipelineError(f"フォント({kind})が見つかりません。assets/fonts に日本語フォントを置くか config.json の fonts を設定してください: {cands}")


def ensure_dirs():
    for d in (TEMP, OUTPUT, AUDIO_CACHE):
        d.mkdir(parents=True, exist_ok=True)


def log(msg):
    print(msg, flush=True)
