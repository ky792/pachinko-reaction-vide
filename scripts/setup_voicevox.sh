#!/bin/bash
# VOICEVOX ENGINE（Linux CPU 版）を用意して起動する。クラウドの作業環境・GitHub Actions 用
# 使い方: bash scripts/setup_voicevox.sh  → http://127.0.0.1:50021 で起動
set -e
VER=${VOICEVOX_VER:-0.25.2}
DIR=${VOICEVOX_DIR:-$HOME/tts}
mkdir -p "$DIR" && cd "$DIR"
if [ ! -x linux-cpu-x64/run ]; then
  curl -sSL -o 7z.tar.xz https://github.com/ip7z/7zip/releases/download/24.09/7z2409-linux-x64.tar.xz
  mkdir -p 7zbin && tar -xf 7z.tar.xz -C 7zbin
  curl -sSL -o engine.7z.001 "https://github.com/VOICEVOX/voicevox_engine/releases/download/$VER/voicevox_engine-linux-cpu-x64-$VER.7z.001"
  ./7zbin/7zz x -y engine.7z.001 > /dev/null && rm -f engine.7z.001 7z.tar.xz
fi
if ! curl -s --noproxy '*' http://127.0.0.1:50021/version > /dev/null; then
  (cd linux-cpu-x64 && setsid nohup ./run --host 127.0.0.1 --port 50021 > "$DIR/engine.log" 2>&1 < /dev/null &)
fi
for i in $(seq 1 60); do curl -s --noproxy '*' http://127.0.0.1:50021/version > /dev/null && break; sleep 2; done
echo "VOICEVOX ENGINE $(curl -s --noproxy '*' http://127.0.0.1:50021/version) 起動"
