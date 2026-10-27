#!/usr/bin/env python3
"""山網（Sanmou）ワンコマンド起動スクリプト

非エンジニアや審査員が、コマンド1つ（またはダブルクリック）で
依存関係の確認・サーバー起動・ブラウザ表示までを全自動で行うためのスクリプト。
"""

import argparse
import os
import secrets
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "sanmou-test.sqlite3"
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
DEFAULT_FRONTEND_HOST = "127.0.0.1"
LAN_FRONTEND_HOST = "0.0.0.0"
PROCESS_STOP_TIMEOUT_SECONDS = 5
BROWSER_OPEN_DELAY_SECONDS = 2.5
BANNER_LINE_WIDTH = 50


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="山網（Sanmou）山林監視システムを起動します"
    )
    parser.add_argument(
        "--allow-lan",
        action="store_true",
        help="LAN内のスマホ等から接続できるよう Next.js を 0.0.0.0 で待ち受けます",
    )
    return parser.parse_args()


def resolve_frontend_host(allow_lan_flag: bool) -> str:
    # 意図しないLAN公開による管理APIへの第三者到達を防ぐため、既定は127.0.0.1に限定します。
    if allow_lan_flag or os.environ.get("SANMOU_ALLOW_LAN") == "1":
        return LAN_FRONTEND_HOST
    return DEFAULT_FRONTEND_HOST


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
        print(
            "\n[1/3] 初回起動のため、画面用ライブラリをセットアップしています（約1〜2分）..."
        )
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


def get_backend_python() -> Path | None:
    venv_dir = BACKEND_DIR / ".venv"
    if not venv_dir.exists():
        return None
    venv_python = (
        venv_dir / "Scripts" / "python.exe"
        if os.name == "nt"
        else venv_dir / "bin" / "python"
    )
    return venv_python if venv_python.exists() else None


def build_backend_env(test_api_token: str | None = None) -> dict[str, str]:
    env = os.environ.copy()
    DEFAULT_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    env.setdefault(
        "DATABASE_URL",
        f"sqlite+pysqlite:///{DEFAULT_DATABASE_PATH.resolve().as_posix()}",
    )
    if test_api_token:
        env["APP_ENVIRONMENT"] = "test"
        env["SANMOU_TEST_API_TOKEN"] = test_api_token
    current_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = (
        f"{BACKEND_DIR}{os.pathsep}{current_pythonpath}"
        if current_pythonpath
        else str(BACKEND_DIR)
    )
    return env


def stop_process(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=PROCESS_STOP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        proc.kill()


def main() -> None:
    args = parse_args()
    frontend_host = resolve_frontend_host(bool(args.allow_lan))
    print("=" * BANNER_LINE_WIDTH)
    print("  🌲 山網（Sanmou）山林監視システム を起動しています")
    print("=" * BANNER_LINE_WIDTH)

    npm_bin = get_npm_executable()
    ensure_frontend_dependencies(npm_bin)

    backend_process: subprocess.Popen[bytes] | None = None
    backend_python = get_backend_python()
    test_api_token: str | None = (
        secrets.token_urlsafe(32) if backend_python is not None else None
    )
    if backend_python is not None:
        print("\n[バックエンド] DBマイグレーションとFastAPIサーバーを起動しています...")
        backend_env = build_backend_env(test_api_token)
        subprocess.run(
            [
                str(backend_python),
                "-m",
                "alembic",
                "-c",
                str(BACKEND_DIR / "alembic.ini"),
                "upgrade",
                "head",
            ],
            cwd=BACKEND_DIR,
            env=backend_env,
            check=True,
        )
        backend_process = subprocess.Popen(
            [
                str(backend_python),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                BACKEND_HOST,
                "--port",
                str(BACKEND_PORT),
            ],
            cwd=BACKEND_DIR,
            env=backend_env,
        )

    print(f"\n[2/3] Webサーバーを起動しています（待受: {frontend_host}）...")
    frontend_env = os.environ.copy()
    if test_api_token is not None:
        frontend_env.update(
            {
                "BACKEND_INTERNAL_URL": f"http://{BACKEND_HOST}:{BACKEND_PORT}",
                "SANMOU_APP_ENV": "test",
                "SANMOU_TEST_API_TOKEN": test_api_token,
            }
        )
    # Next.js 開発サーバーを起動（単独PC安全モードが既定、--allow-lan指定時のみLAN公開）
    process = subprocess.Popen(
        [npm_bin, "run", "dev", "--", "--hostname", frontend_host],
        cwd=FRONTEND_DIR,
        env=frontend_env,
    )
    url = "http://localhost:3000/map"
    print(f"\n[3/3] ブラウザを自動で開きます: {url}")
    print("\n※ 終了するときは、この画面で [Ctrl + C] を押してください。\n")

    # サーバーが立ち上がるのを少し待ってからブラウザを開く
    time.sleep(BROWSER_OPEN_DELAY_SECONDS)
    try:
        webbrowser.open(url)
    except (OSError, webbrowser.Error):
        # GUIのない環境等でブラウザ自動起動に失敗した場合もURLを案内してサーバー稼働を継続します。
        print(f"ブラウザの自動起動をスキップしました。手動で {url} を開いてください。")

    try:
        process.wait()
    except KeyboardInterrupt:
        print("\n\n山網システムを安全に停止しています...")
    finally:
        stop_process(process)
        stop_process(backend_process)
        print("✓ システムを停止しました。お疲れ様でした。\n")


if __name__ == "__main__":
    main()
