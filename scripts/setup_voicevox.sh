#!/bin/bash
# VOICEVOX ENGINE（Linux CPU 版）を用意して起動する。クラウドの作業環境・GitHub Actions 用
# 使い方: bash scripts/setup_voicevox.sh  → http://127.0.0.1:50021 で起動
set -euo pipefail
VER=${VOICEVOX_VER:-0.25.2}
DIR=${VOICEVOX_DIR:-$PWD/cache/voicevox-engine}
mkdir -p "$DIR" && cd "$DIR"
if [ ! -x linux-cpu-x64/run ]; then
  curl --fail --show-error --location --retry 3 -o 7z.tar.xz https://github.com/ip7z/7zip/releases/download/24.09/7z2409-linux-x64.tar.xz
  mkdir -p 7zbin && tar -xf 7z.tar.xz -C 7zbin
  # Release redirects can be stale. Request a fresh redirect and fail on HTTP errors.
  curl --fail --show-error --location --retry 3 --retry-all-errors -o engine.7z.001.tmp "https://github.com/VOICEVOX/voicevox_engine/releases/download/$VER/voicevox_engine-linux-cpu-x64-$VER.7z.001?run=${GITHUB_RUN_ID:-local}"
  mv engine.7z.001.tmp engine.7z.001
  ./7zbin/7zz x -y engine.7z.001 > extract.log
  test -x linux-cpu-x64/run
  rm -f engine.7z.001 7z.tar.xz
fi
if ! curl -s --noproxy '*' http://127.0.0.1:50021/version > /dev/null; then
  (cd linux-cpu-x64 && nohup ./run --host 127.0.0.1 --port 50021 > "$DIR/engine.log" 2>&1 < /dev/null &)
fi
for i in $(seq 1 60); do
  if version=$(curl --fail --silent --noproxy '*' http://127.0.0.1:50021/version); then
    echo "VOICEVOX ENGINE $version 起動"
    exit 0
  fi
  sleep 2
done
echo "VOICEVOXの起動に失敗しました。" >&2
tail -50 "$DIR/engine.log" >&2
exit 1

