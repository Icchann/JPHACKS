import csv
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.device.csv_store import CSV_COLUMNS, ObservationCsvStore
from app.device.protocol import parse_serial_line


def test_append_writes_current_csv_shape(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    store = ObservationCsvStore(csv_path)
    observation = parse_serial_line("S0,T1,247,0,672755,-976,0,96,-1,-1")
    assert observation is not None

    store.append(
        observation,
        datetime(2026, 9, 30, 18, 30, 11, 171_000, tzinfo=timezone(timedelta(hours=9))),
    )

    with csv_path.open("r", encoding="utf-8", newline="") as csv_file:
        rows = list(csv.reader(csv_file))
    assert rows == [
        list(CSV_COLUMNS),
        [
            "2026-09-30T18:30:11.171+09:00",
            "T1",
            "247",
            "0",
            "672755",
            "-976",
            "0",
            "96",
            "-1",
            "-1",
            "S0,T1,247,0,672755,-976,0,96,-1,-1",
        ],
    ]


def test_append_rejects_naive_received_at(tmp_path: Path) -> None:
    observation = parse_serial_line("S0,T1,247,0,672755,-976,0,96,-1,-1")
    assert observation is not None

    with pytest.raises(ValueError, match="タイムゾーン"):
        ObservationCsvStore(tmp_path / "observations.csv").append(
            observation, datetime(2026, 9, 30, 18, 30, 11)
        )


def test_append_rejects_existing_csv_with_different_header(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    csv_path.write_text("unexpected,header\r\n", encoding="utf-8")
    observation = parse_serial_line("S0,T1,247,0,672755,-976,0,96,-1,-1")
    assert observation is not None

    with pytest.raises(ValueError, match="ヘッダー"):
        ObservationCsvStore(csv_path).append(observation, datetime(2026, 9, 30, tzinfo=UTC))


def test_append_writes_header_to_existing_zero_byte_file(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    csv_path.write_bytes(b"")
    store = ObservationCsvStore(csv_path)
    store._validate_existing_header()
    observation = parse_serial_line("S0,T1,1,0,3115,-128,-176,928,-1,-1")
    assert observation is not None

    store.append(observation, datetime(2026, 9, 30, 18, 30, 11, tzinfo=UTC))

    with csv_path.open("r", encoding="utf-8", newline="") as csv_file:
        rows = list(csv.reader(csv_file))
    assert rows[0] == list(CSV_COLUMNS)
    assert len(rows) == 2


def test_append_accepts_existing_utf8_bom_header(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    csv_path.write_text(",".join(CSV_COLUMNS) + "\r\n", encoding="utf-8-sig")
    store = ObservationCsvStore(csv_path)
    observation = parse_serial_line("S0,T1,1,0,3115,-128,-176,928,-1,-1")
    assert observation is not None

    store.append(observation, datetime(2026, 9, 30, 18, 30, 11, tzinfo=UTC))

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        rows = list(csv.reader(csv_file))
    assert rows[0] == list(CSV_COLUMNS)
    assert len(rows) == 2
