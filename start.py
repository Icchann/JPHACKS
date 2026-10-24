#!/usr/bin/env python3
"""山網（Sanmou）ワンコマンド起動スクリプト

非エンジニアや審査員が、コマンド1つ（またはダブルクリック）で
依存関係の確認・サーバー起動・ブラウザ表示までを全自動で行うためのスクリプト。
"""

import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def get_npm_executable() -> str:
    # Windows環境の npm.cmd と macOS/Linuxの npm を自動判別
    cmd = "npm.cmd" if os.name == "nt" else "npm"
    resolved = shutil.which(cmd)
    if not resolved:
        print("\n[エラー] Node.js / npm が見つかりません。")
        print("https://nodejs.org/ から Node.js をインストールしてください。\n")
        sys.exit(1)
    return resolved


def ensure_frontend_dependencies(npm_bin: str) -> None:
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        print("\n[1/3] 初回起動のため、画面用ライブラリをセットアップしています（約1〜2分）...")
        try:
            subprocess.run(
                [npm_bin, "install"],
                cwd=FRONTEND_DIR,
                check=True,
            )
            print("✓ セットアップが完了しました。")
        except subprocess.CalledProcessError as exc:
            print(f"\n[エラー] ライブラリの導入に失敗しました: {exc}")
            sys.exit(1)
    else:
        print("\n✓ 画面ライブラリのセットアップを確認しました。")


def main() -> None:
    print("=" * 50)
    print("  🌲 山網（Sanmou）山林監視システム を起動しています")
    print("=" * 50)

    npm_bin = get_npm_executable()
    ensure_frontend_dependencies(npm_bin)

    print("\n[2/3] Webサーバーを起動しています...")
    # Next.js 開発サーバーを起動
    process = subprocess.Popen(
        [npm_bin, "run", "dev"],
        cwd=FRONTEND_DIR,
    )

    url = "http://localhost:3000/map"
    print(f"\n[3/3] ブラウザを自動で開きます: {url}")
    print("\n※ 終了するときは、この画面で [Ctrl + C] を押してください。\n")

    # サーバーが立ち上がるのを少し待ってからブラウザを開く
    time.sleep(2.5)
    try:
        webbrowser.open(url)
    except Exception:
        # ブラウザ自動起動に失敗してもURLを明示しているので続行
        pass

    try:
        process.wait()
    except KeyboardInterrupt:
        print("\n\n山網システムを安全に停止しています...")
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        print("✓ システムを停止しました。お疲れ様でした。\n")


if __name__ == "__main__":
    main()
