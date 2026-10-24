from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from app.device.csv_store import ObservationCsvStore
from app.device.protocol import InvalidSerialRecord, parse_serial_line
from app.device.stream import SerialLineBuffer


@dataclass(slots=True)
class ReceiverStats:
    saved_records: int = 0
    ignored_lines: int = 0
    invalid_records: int = 0
    invalid_terminators: int = 0


class SerialObservationReceiver:
    def __init__(
        self,
        store: ObservationCsvStore,
        now: Callable[[], datetime],
        line_buffer: SerialLineBuffer | None = None,
    ) -> None:
        self._store = store
        self._now = now
        self._line_buffer = line_buffer or SerialLineBuffer()
        self.stats = ReceiverStats()

    def receive(self, chunk: bytes) -> ReceiverStats:
        for frame in self._line_buffer.feed(chunk):
            if not frame.has_crlf:
                self.stats.invalid_terminators += 1
                continue

            try:
                observation = parse_serial_line(frame.line)
            except InvalidSerialRecord:
                # 生データや位置情報をログへ出さず、件数だけを呼び出し側へ公開します。
                self.stats.invalid_records += 1
                continue

            if observation is None:
                self.stats.ignored_lines += 1
                continue

            self._store.append(observation, self._now())
            self.stats.saved_records += 1

        return self.stats
