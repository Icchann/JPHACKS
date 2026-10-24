import csv
from datetime import UTC, datetime
from pathlib import Path

from app.device.csv_store import ObservationCsvStore
from app.device.receiver import SerialObservationReceiver


def test_receiver_saves_only_valid_s0_crlf_records(tmp_path: Path) -> None:
    received_at = datetime(2026, 9, 30, 9, 30, 11, 171_000, tzinfo=UTC)
    csv_path = tmp_path / "observations.csv"
    receiver = SerialObservationReceiver(
        store=ObservationCsvStore(csv_path), now=lambda: received_at
    )

    receiver.receive(b"ESP32 booting\r\nS0,T1,247,0,672755,-976")
    stats = receiver.receive(
        b",0,96,-1,-1\r\nS0,T1,bad,0,1,0,0,1000,-1,-1\r\nS0,T1,248,0,674000,-975,0,90,-1,-1\n"
    )

    assert stats.saved_records == 1
    assert stats.ignored_lines == 1
    assert stats.invalid_records == 1
    assert stats.invalid_terminators == 1
    with csv_path.open("r", encoding="utf-8", newline="") as csv_file:
        rows = list(csv.reader(csv_file))
    assert len(rows) == 2
    assert rows[1][0] == "2026-09-30T09:30:11.171+00:00"
    assert rows[1][1] == "T1"
