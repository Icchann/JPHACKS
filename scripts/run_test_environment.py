import argparse
import os
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
FRONTEND_ROOT = PROJECT_ROOT / "frontend"
DEFAULT_CSV_PATH = BACKEND_ROOT / "data" / "observations.csv"
DEFAULT_DATABASE_PATH = BACKEND_ROOT / "data" / "sanmou-test.sqlite3"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="山網の実証実験環境（USB受信・API・画面）をまとめて起動します"
    )
    parser.add_argument("--port", help="集約機のCOMポート（例: COM3）")
    parser.add_argument(
        "--no-serial",
        action="store_true",
        help="USB受信を起動せず、既存CSVだけで画面を確認します",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV_PATH,
        help="受信CSVの保存・読込先",
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=DEFAULT_DATABASE_PATH,
        help="検証用SQLiteデータベースの保存先",
    )
    parser.add_argument("--backend-port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=3000)
    args = parser.parse_args()
    if not args.no_serial and not args.port:
        parser.error("USB受信を行う場合は --port COM3 のように指定してください")
    return args


def _npm_executable() -> str:
    executable = "npm.cmd" if os.name == "nt" else "npm"
    resolved = shutil.which(executable)
    if resolved is None:
        raise RuntimeError(
            "npmが見つかりません。Node.js 24系（Active LTS）をセットアップしてください"
        )
    return resolved


def _ensure_backend_environment() -> str:
    venv_dir = BACKEND_ROOT / ".venv"
    venv_python = (
        venv_dir / "Scripts" / "python.exe"
        if os.name == "nt"
        else venv_dir / "bin" / "python"
    )
    if not venv_dir.exists():
        print(
            "\n[初回自動準備] バックエンド環境（Python仮想環境）を自動作成しています（約1分、初回のみ）..."
        )
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
        print("✓ 依存ライブラリを自動導入しています...")
        pip_bin = (
            venv_dir / "Scripts" / "pip.exe"
            if os.name == "nt"
            else venv_dir / "bin" / "pip"
        )
        subprocess.run(
            [str(pip_bin), "install", "-r", str(BACKEND_ROOT / "requirements.txt")],
            check=True,
        )
        print("✓ バックエンド環境の準備が完了しました。\n")
    return str(venv_python) if venv_python.exists() else sys.executable


def _ensure_frontend_dependencies() -> None:
    node_modules = FRONTEND_ROOT / "node_modules"
    if not node_modules.exists():
        print(
            "\n[初回自動準備] 画面ライブラリを自動導入しています（約1分、初回のみ）..."
        )
        npm_bin = _npm_executable()
        subprocess.run([npm_bin, "install"], cwd=str(FRONTEND_ROOT), check=True)
        print("✓ 画面ライブラリの準備が完了しました。\n")


def _python_executable() -> str:
    return _ensure_backend_environment()


def _stop_processes(processes: list[subprocess.Popen[bytes]]) -> None:
    # 親の終了時に受信・API・画面を残さないよう、起動した子プロセスだけを停止します。
    for process in processes:
        if process.poll() is None:
            process.terminate()

    for process in processes:
        if process.poll() is not None:
            continue
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def main() -> int:
    args = _parse_args()
    _ensure_frontend_dependencies()
    csv_path = args.csv.resolve()
    database_path = args.database.resolve()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    environment = os.environ.copy()
    test_api_token = secrets.token_urlsafe(32)
    environment.update(
        {
            "APP_ENVIRONMENT": "test",
            "OBSERVATION_CSV_PATH": str(csv_path),
            "DATABASE_URL": database_url,
            "FRONTEND_ORIGIN": f"http://localhost:{args.frontend_port}",
            "BACKEND_INTERNAL_URL": f"http://127.0.0.1:{args.backend_port}",
            "SANMOU_APP_ENV": "test",
            "SANMOU_TEST_API_TOKEN": test_api_token,
        }
    )
    current_pythonpath = environment.get("PYTHONPATH", "")
    environment["PYTHONPATH"] = (
        f"{BACKEND_ROOT}{os.pathsep}{current_pythonpath}"
        if current_pythonpath
        else str(BACKEND_ROOT)
    )

    # API起動前に常に最新マイグレーションまで進め、手作業の初期化漏れを防ぎます。
    subprocess.run(
        [
            _python_executable(),
            "-m",
            "alembic",
            "-c",
            str(BACKEND_ROOT / "alembic.ini"),
            "upgrade",
            "head",
        ],
        cwd=BACKEND_ROOT,
        env=environment,
        check=True,
    )

    commands: list[tuple[str, list[str]]] = [
        (
            "FastAPI",
            [
                _python_executable(),
                "-m",
                "uvicorn",
                "app.main:app",
                "--app-dir",
                str(BACKEND_ROOT),
                "--host",
                "127.0.0.1",
                "--port",
                str(args.backend_port),
            ],
        ),
        (
            "Next.js",
            [
                _npm_executable(),
                "--prefix",
                str(FRONTEND_ROOT),
                "run",
                "dev",
                "--",
                "--hostname",
                "0.0.0.0",
                "--port",
                str(args.frontend_port),
            ],
        ),
    ]
    if not args.no_serial:
        commands.insert(
            0,
            (
                "USBシリアル受信",
                [
                    _python_executable(),
                    str(BACKEND_ROOT / "scripts" / "receive_serial.py"),
                    "--port",
                    args.port,
                    "--output",
                    str(csv_path),
                ],
            ),
        )

    processes: list[subprocess.Popen[bytes]] = []
    try:
        print(f"test環境を起動します: CSV={csv_path}")
        print(f"検証用DB: {database_path}")
        for name, command in commands:
            print(f"- {name} を起動")
            processes.append(
                subprocess.Popen(command, cwd=PROJECT_ROOT, env=environment)
            )

        dashboard_url = f"http://localhost:{args.frontend_port}/dashboard"
        print(f"ダッシュボード: {dashboard_url}")
        print(f"センサー管理: http://localhost:{args.frontend_port}/sensors")
        print("終了するには Ctrl+C を押してください")

        # 起動から2.5秒後に自動でブラウザを開く
        try:
            import webbrowser

            time.sleep(2.5)
            webbrowser.open(dashboard_url)
        except (OSError, webbrowser.Error):
            pass
        reported_stopped: set[str] = set()
        while True:
            for process, (name, _) in zip(processes, commands, strict=True):
                if name in reported_stopped:
                    continue
                exit_code = process.poll()
                if exit_code is not None:
                    if name == "USBシリアル受信":
                        reported_stopped.add(name)
                        print(
                            f"[警告] {name} が終了しました（終了コード: {exit_code}）。"
                            "既存CSVおよび管理API・画面サーバーの稼働は継続します。"
                        )
                        continue
                    print(f"{name} が終了しました（終了コード: {exit_code}）")
                    return exit_code or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\ntest環境を終了します")
        return 0
    finally:
        _stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(main())
