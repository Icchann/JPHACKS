import re
from dataclasses import dataclass

PACKET_TYPE = "S0"
FIELD_COUNT = 10
NODE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class InvalidSerialRecord(ValueError):
    """S0形式として始まった行が契約を満たさない場合の例外。"""


@dataclass(frozen=True, slots=True)
class SerialObservation:
    packet_type: str
    node_id: str
    seq: int
    hop: int
    sample_ms: int
    ax_mg: int
    ay_mg: int
    az_mg: int
    soil_raw: int
    battery_mv: int
    raw_line: str

    @property
    def soil_raw_measured(self) -> int | None:
        # -1は土壌水分と電池電圧だけで未計測を表し、加速度には適用しません。
        return None if self.soil_raw == -1 else self.soil_raw

    @property
    def battery_mv_measured(self) -> int | None:
        return None if self.battery_mv == -1 else self.battery_mv


def _parse_non_negative_integer(value: str, field_name: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise InvalidSerialRecord(f"{field_name}は整数である必要があります") from exc

    if parsed < 0:
        raise InvalidSerialRecord(f"{field_name}は0以上である必要があります")
    return parsed


def _parse_integer(value: str, field_name: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise InvalidSerialRecord(f"{field_name}は整数である必要があります") from exc


def parse_serial_line(line: bytes | str) -> SerialObservation | None:
    """S0レコードを解析し、それ以外の起動メッセージなどは無視する。"""

    if isinstance(line, bytes):
        if not line.startswith(b"S0,"):
            return None
        try:
            decoded = line.decode("ascii")
        except UnicodeDecodeError as exc:
            raise InvalidSerialRecord("S0レコードはASCIIである必要があります") from exc
    else:
        if not line.startswith("S0,"):
            return None
        decoded = line

    raw_line = decoded.rstrip("\r\n")
    fields = raw_line.split(",")
    if len(fields) != FIELD_COUNT:
        raise InvalidSerialRecord("S0レコードは10フィールドである必要があります")

    (
        packet_type,
        node_id,
        seq,
        hop,
        sample_ms,
        ax_mg,
        ay_mg,
        az_mg,
        soil_raw,
        battery_mv,
    ) = fields

    if packet_type != PACKET_TYPE:
        return None
    if not NODE_ID_PATTERN.fullmatch(node_id):
        raise InvalidSerialRecord("node_idの形式が不正です")

    return SerialObservation(
        packet_type=packet_type,
        node_id=node_id,
        seq=_parse_non_negative_integer(seq, "seq"),
        hop=_parse_non_negative_integer(hop, "hop"),
        sample_ms=_parse_non_negative_integer(sample_ms, "sample_ms"),
        ax_mg=_parse_integer(ax_mg, "ax_mg"),
        ay_mg=_parse_integer(ay_mg, "ay_mg"),
        az_mg=_parse_integer(az_mg, "az_mg"),
        soil_raw=_parse_integer(soil_raw, "soil_raw"),
        battery_mv=_parse_integer(battery_mv, "battery_mv"),
        raw_line=raw_line,
    )
