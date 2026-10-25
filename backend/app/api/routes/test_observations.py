import os
from datetime import UTC, datetime
from pathlib import Path
from secrets import compare_digest
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.core.config import Settings, get_settings
from app.device.csv_reader import ObservationCsvFormatError, read_observation_csv
from app.device.csv_store import CSV_COLUMNS
from app.schemas.common import ErrorResponse
from app.schemas.test_observations import TestObservationListResponse

# 実証APIモジュールをpytestのテストファイル収集対象から除外します。
__test__ = False

router = APIRouter(prefix="/test", tags=["test-environment"])


@router.get(
    "/observations",
    response_model=TestObservationListResponse,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def list_test_observations(
    limit: int = Query(default=500, ge=1, le=2000),
    node_id: str | None = Query(default=None, min_length=1, max_length=64),
    settings: Settings = Depends(get_settings),  # noqa: B008
    test_token: str | None = Header(default=None, alias="X-Test-Token"),  # noqa: B008
) -> TestObservationListResponse:
    """test環境に限り、シリアル受信CSVの最新観測を返す。"""

    if settings.app_environment != "test":
        raise HTTPException(status_code=404, detail="Not Found")
    if not settings.sanmou_test_api_token:
        raise HTTPException(status_code=503, detail="test API token is not configured")
    if test_token is None or not compare_digest(test_token, settings.sanmou_test_api_token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        result = read_observation_csv(
            settings.observation_csv_path,
            limit=limit,
            node_id=node_id,
        )
    except ObservationCsvFormatError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return TestObservationListResponse(
        items=result.items,
        file_exists=result.file_exists,
        invalid_row_count=result.invalid_row_count,
        refreshed_at=datetime.now(UTC),
    )


@router.delete(
    "/observations",
    status_code=204,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def clear_test_observations(
    settings: Settings = Depends(get_settings),  # noqa: B008
    test_token: str | None = Header(default=None, alias="X-Test-Token"),  # noqa: B008
) -> None:
    """test環境の受信CSV履歴をクリア（ヘッダーのみ再作成）する。"""

    if settings.app_environment != "test":
        raise HTTPException(status_code=404, detail="Not Found")
    if not settings.sanmou_test_api_token:
        raise HTTPException(status_code=503, detail="test API token is not configured")
    if test_token is None or not compare_digest(test_token, settings.sanmou_test_api_token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    csv_path = settings.observation_csv_path
    if csv_path.exists():
        # シリアル受信の追記と競合しないよう、一時ファイル経由でアトミックに置換する。
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path: Path | None = None
        try:
            with NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                newline="",
                dir=csv_path.parent,
                delete=False,
                suffix=".tmp",
            ) as tmp_file:
                tmp_path = Path(tmp_file.name)
                tmp_file.write(",".join(CSV_COLUMNS) + "\n")
                tmp_file.flush()
            os.replace(tmp_path, csv_path)
        except OSError:
            if tmp_path is not None and tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            raise
