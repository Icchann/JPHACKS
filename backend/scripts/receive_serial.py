import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Protocol

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# リポジトリ直下から実行した場合もバックエンドパッケージを解決できるようにします。
sys.path.insert(0, str(BACKEND_ROOT))

from app.device.csv_store import ObservationCsvStore  # noqa: E402
from app.device.receiver import SerialObservationReceiver  # noqa: E402


class SerialReader(Protocol):
    def read(self, size: int) -> bytes: ...


def receive_forever(reader: SerialReader, receiver: SerialObservationReceiver) -> None:
    while True:
        chunk = reader.read(4096)
        if chunk:
            receiver.receive(chunk)


def main() -> None:
    parser = argparse.ArgumentParser(description="山網USBシリアル受信アダプタ")
    parser.add_argument("--port", required=True, help="例: COM3")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/data/observations.csv"),
        help="受信CSVの保存先",
    )
    args = parser.parse_args()

    # pyserialは実機受信時だけ読み込み、解析テストを実機依存にしません。
    import serial  # type: ignore[import-untyped]

    store = ObservationCsvStore(args.output)
    receiver = SerialObservationReceiver(store=store, now=lambda: datetime.now().astimezone())

    try:
        with serial.Serial(
            port=args.port,
            baudrate=115_200,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1,
        ) as serial_port:
            receive_forever(serial_port, receiver)
    except KeyboardInterrupt:
        # Ctrl+Cは通常終了として扱い、受信件数だけを表示します。
        print(f"受信を終了しました: {receiver.stats.saved_records}件保存")


if __name__ == "__main__":
    main()
