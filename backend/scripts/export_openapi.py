import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
OUTPUT_PATH = REPOSITORY_ROOT / "frontend" / "openapi.json"

# リポジトリ直下から実行した場合もバックエンドパッケージを解決できるようにします。
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402  # パス設定後にアプリケーションを読み込みます。


def main() -> None:
    # FastAPIが生成する契約を唯一の入力としてフロントエンド型へ連携します。
    OUTPUT_PATH.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OpenAPI schema exported to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
