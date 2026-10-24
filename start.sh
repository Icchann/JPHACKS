#!/usr/bin/env bash
# 山網（Sanmou）ワンライナー起動スクリプト (macOS / Linux)

set -e

echo "===================================================="
echo "  🌲 山網（Sanmou）山林監視システム を起動します"
echo "===================================================="
echo ""
echo "ブラウザが自動的に開くまで数秒お待ちください..."
echo "終了するときは [Ctrl + C] を押してください。"
echo ""

if command -v python3 &> /dev/null; then
    python3 start.py
else
    python start.py
fi
