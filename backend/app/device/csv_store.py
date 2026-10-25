import csv
from datetime import datetime
from pathlib import Path
from threading import Lock

from app.device.protocol import SerialObservation

CSV_COLUMNS = (
    "received_at",
    "node_id",
    "seq",
    "hop",
    "sample_ms",
    "ax_mg",
    "ay_mg",
    "az_mg",
    "soil_raw",
    "battery_mv",
    "raw_line",
)


class ObservationCsvStore:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = Lock()

    @property
    def path(self) -> Path:
        return self._path

    def append(self, observation: SerialObservation, received_at: datetime) -> None:
        if received_at.tzinfo is None or received_at.utcoffset() is None:
            raise ValueError("received_atにはタイムゾーンが必要です")

        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            write_header = not self._path.exists() or self._path.stat().st_size == 0
            if not write_header:
                self._validate_existing_header()
                write_header = not self._path.exists() or self._path.stat().st_size == 0
            with self._path.open("a", encoding="utf-8", newline="") as csv_file:
                writer = csv.writer(csv_file, lineterminator="\r\n")
                if write_header:
                    writer.writerow(CSV_COLUMNS)
                writer.writerow(
                    (
                        received_at.isoformat(timespec="milliseconds"),
                        observation.node_id,
                        observation.seq,
                        observation.hop,
                        observation.sample_ms,
                        observation.ax_mg,
                        observation.ay_mg,
                        observation.az_mg,
                        observation.soil_raw,
                        observation.battery_mv,
                        observation.raw_line,
                    )
                )
                # 実証実験中にプロセスが停止しても直前の行を失いにくいよう毎行反映します。
                csv_file.flush()

    def _validate_existing_header(self) -> None:
        try:
            with self._path.open("r", encoding="utf-8-sig", newline="") as csv_file:
                reader = csv.reader(csv_file)
                header = next(reader, None)
        except FileNotFoundError:
            return
        if header is None:
            return
        if tuple(header) != CSV_COLUMNS:
            raise ValueError("保存先CSVのヘッダーが現行仕様と一致しません")
