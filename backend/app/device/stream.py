from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BufferedFrame:
    line: bytes
    has_crlf: bool


class SerialLineBuffer:
    """分割受信と複数行受信をCRLF単位のレコードへ組み直す。"""

    def __init__(self, max_buffer_bytes: int = 65_536) -> None:
        if max_buffer_bytes <= 0:
            raise ValueError("max_buffer_bytesは1以上である必要があります")
        self._buffer = bytearray()
        self._max_buffer_bytes = max_buffer_bytes
        self.dropped_bytes = 0

    @property
    def pending_bytes(self) -> int:
        return len(self._buffer)

    def feed(self, chunk: bytes) -> list[BufferedFrame]:
        if not chunk:
            return []

        self._buffer.extend(chunk)
        frames: list[BufferedFrame] = []

        while True:
            newline_index = self._buffer.find(b"\n")
            if newline_index < 0:
                break

            framed = bytes(self._buffer[: newline_index + 1])
            del self._buffer[: newline_index + 1]
            has_crlf = framed.endswith(b"\r\n")
            line = framed[:-2] if has_crlf else framed[:-1]
            frames.append(BufferedFrame(line=line, has_crlf=has_crlf))

        if len(self._buffer) > self._max_buffer_bytes:
            # 改行されない起動ログ等でメモリを消費し続けないよう、未完了部分を破棄します。
            self.dropped_bytes += len(self._buffer)
            self._buffer.clear()

        return frames
