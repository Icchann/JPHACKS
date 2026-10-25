#!/usr/bin/env bash
# 山網（Sanmou）実機シリアル受信・メイン起動スクリプト (macOS / Linux)

set -e

echo "===================================================="
echo "  🌲 山網（Sanmou）実機シリアル受信・メイン起動"
echo "===================================================="
echo ""
echo "集約機をPCのUSBに接続した状態で実行してください。"
echo ""
echo "【PCで検出されたUSBシリアルポート】"
ls -1 /dev/tty.usb* 2>/dev/null || echo "(USBシリアルポートが見つかりません。USB接続を確認してください)"
echo ""
read -p "USBシリアルポートを入力してください (例: /dev/tty.usbmodem1101) [未入力で/dev/tty.usbmodem1101]: " PORT
PORT=${PORT:-/dev/tty.usbmodem1101}

echo ""
echo "$PORT でUSBシリアル受信を開始し、システムを起動します..."
echo ""

if command -v python3 &> /dev/null; then
    python3 scripts/run_test_environment.py --port "$PORT"
else
    python scripts/run_test_environment.py --port "$PORT"
fi
