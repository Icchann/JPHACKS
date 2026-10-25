import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.device.csv_store import CSV_COLUMNS
from app.device.protocol import InvalidSerialRecord, parse_serial_line
from app.schemas.test_observations import TestObservation


class ObservationCsvFormatError(ValueError):
    """CSV全体を安全に読めない場合の例外。"""


@dataclass(frozen=True, slots=True)
class ObservationCsvReadResult:
    items: list[TestObservation]
    file_exists: bool
    invalid_row_count: int


def _parse_received_at(value: str) -> datetime:
    received_at = datetime.fromisoformat(value)
    if received_at.tzinfo is None or received_at.utcoffset() is None:
        raise ValueError("received_atにはタイムゾーンが必要です")
    return received_at


def _matches_saved_columns(row: dict[str, str | None], raw_values: tuple[object, ...]) -> bool:
    column_names = CSV_COLUMNS[1:-1]
    return all(
        row[name] == str(value) for name, value in zip(column_names, raw_values, strict=True)
    )


def read_observation_csv(
    path: Path,
    *,
    limit: int,
    node_id: str | None = None,
) -> ObservationCsvReadResult:
    """受信CSVを検証し、ダッシュボード用に受信時刻順で返す。"""

    if not path.exists():
        return ObservationCsvReadResult(items=[], file_exists=False, invalid_row_count=0)
    items: list[TestObservation] = []
    invalid_row_count = 0

    file_size = path.stat().st_size
    # 長期稼働でCSVが数万行以上に肥大化した場合、全行走査を避けて末尾から最新件数を高速取得
    tail_bytes_needed = limit * 300
    if file_size > tail_bytes_needed + 4096 and node_id is None:
        with path.open("rb") as f:
            header_line = f.readline().decode("utf-8", errors="replace").strip()
            header_fields = tuple(next(csv.reader([header_line]), ()))
            if header_fields != CSV_COLUMNS:
                raise ObservationCsvFormatError("受信CSVのヘッダーが現行仕様と一致しません")

            f.seek(file_size - tail_bytes_needed)
            f.readline()  # 途中で切れた先頭行を安全にスキップ
            tail_text = f.read().decode("utf-8", errors="replace")
            reader = csv.DictReader(tail_text.splitlines(), fieldnames=CSV_COLUMNS)
            for row in reader:
                try:
                    raw_line = row.get("raw_line")
                    if not isinstance(raw_line, str):
                        raise InvalidSerialRecord("raw_lineがありません")
                    observation = parse_serial_line(raw_line)
                    if observation is None:
                        raise InvalidSerialRecord("raw_lineがS0レコードではありません")
                    raw_values = (
                        observation.node_id,
                        observation.seq,
                        observation.hop,
                        observation.sample_ms,
                        observation.ax_mg,
                        observation.ay_mg,
                        observation.az_mg,
                        observation.soil_raw,
                        observation.battery_mv,
                    )
                    if not _matches_saved_columns(row, raw_values):
                        raise InvalidSerialRecord("CSV列とraw_lineが一致しません")
                    received_at = _parse_received_at(row["received_at"])
                except (KeyError, TypeError, ValueError):
                    invalid_row_count += 1
                    continue

                items.append(
                    TestObservation(
                        received_at=received_at,
                        node_id=observation.node_id,
                        seq=observation.seq,
                        hop=observation.hop,
                        sample_ms=observation.sample_ms,
                        ax_mg=observation.ax_mg,
                        ay_mg=observation.ay_mg,
                        az_mg=observation.az_mg,
                        soil_raw=observation.soil_raw_measured,
                        battery_mv=observation.battery_mv_measured,
                    )
                )

        items.sort(key=lambda item: item.received_at)
        return ObservationCsvReadResult(
            items=items[-limit:],
            file_exists=True,
            invalid_row_count=invalid_row_count,
        )

    with path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if tuple(reader.fieldnames or ()) != CSV_COLUMNS:
            raise ObservationCsvFormatError("受信CSVのヘッダーが現行仕様と一致しません")

        for row in reader:
            try:
                raw_line = row.get("raw_line")
                if not isinstance(raw_line, str):
                    raise InvalidSerialRecord("raw_lineがありません")
                observation = parse_serial_line(raw_line)
                if observation is None:
                    raise InvalidSerialRecord("raw_lineがS0レコードではありません")
                raw_values = (
                    observation.node_id,
                    observation.seq,
                    observation.hop,
                    observation.sample_ms,
                    observation.ax_mg,
                    observation.ay_mg,
                    observation.az_mg,
                    observation.soil_raw,
                    observation.battery_mv,
                )
                if not _matches_saved_columns(row, raw_values):
                    raise InvalidSerialRecord("CSV列とraw_lineが一致しません")

                received_at = _parse_received_at(row["received_at"])
            except (KeyError, TypeError, ValueError):
                # 受信を止めず、壊れた行だけを除外して件数を画面へ通知します。
                invalid_row_count += 1
                continue

            if node_id is not None and observation.node_id != node_id:
                continue

            items.append(
                TestObservation(
                    received_at=received_at,
                    node_id=observation.node_id,
                    seq=observation.seq,
                    hop=observation.hop,
                    sample_ms=observation.sample_ms,
                    ax_mg=observation.ax_mg,
                    ay_mg=observation.ay_mg,
                    az_mg=observation.az_mg,
                    soil_raw=observation.soil_raw_measured,
                    battery_mv=observation.battery_mv_measured,
                )
            )

    items.sort(key=lambda item: item.received_at)
    return ObservationCsvReadResult(
        items=items[-limit:],
        file_exists=True,
        invalid_row_count=invalid_row_count,
    )
