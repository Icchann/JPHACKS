import math
import re
from dataclasses import dataclass

PACKET_TYPE_S0 = "S0"
PACKET_TYPE_S1 = "S1"
PACKET_TYPE_O2 = "O2"
PACKET_TYPE = PACKET_TYPE_S0  # 下位互換性用エイリアス
FIELD_COUNT_S0 = 10
FIELD_COUNT_O2 = 12
FIELD_COUNT_S1 = 13
FIELD_COUNT = FIELD_COUNT_S0  # 下位互換性用エイリアス
NODE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
INSTALLATION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
BOOT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
PROFILE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


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
    installation_id: str | None = None
    boot_id: str | None = None
    config_version: int = 1
    profile: str | None = None
    ax_mg_raw: float | None = None
    ay_mg_raw: float | None = None
    az_mg_raw: float | None = None

    @property
    def soil_raw_measured(self) -> int | None:
        # -1は土壌水分と電池電圧だけで未計測を表し、加速度には適用しません。
        return None if self.soil_raw == -1 else self.soil_raw

    @property
    def battery_mv_measured(self) -> int | None:
        return None if self.battery_mv == -1 else self.battery_mv

    @property
    def is_zero_acceleration(self) -> bool:
        """全軸ゼロの加速度レコード（seq=0等の初期化値）を判定する。"""
        return self.ax_mg == 0 and self.ay_mg == 0 and self.az_mg == 0

    @property
    def is_valid_gravity_vector(self) -> bool:
        """重力加速度ベクトルとして有効か（全軸ゼロではなく、健全な重力範囲内か）を判定する。"""
        if self.is_zero_acceleration:
            return False
        total_acc_sq = self.ax_mg**2 + self.ay_mg**2 + self.az_mg**2
        # 1G (約1000mg) に対して 500mg〜2000mg の範囲を健全な静止重力ベクトルとする
        return 500**2 <= total_acc_sq <= 2000**2


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


def _parse_float_to_mg(value: str, field_name: str) -> tuple[int, float]:
    """O2形式の小数mgを四捨五入して整数mgとし、生小数値とともに返却する (Issue #69)。"""
    try:
        val = float(value)
    except ValueError as exc:
        raise InvalidSerialRecord(f"{field_name}は数値である必要があります") from exc
    if not math.isfinite(val):
        raise InvalidSerialRecord(f"{field_name}は有限の数値である必要があります")
    return round(val), val


def parse_serial_line(line: bytes | str) -> SerialObservation | None:
    """S0、S1、またはO2レコードを解析し、それ以外の起動行を無視する (Issue #56, #69)。"""

    if isinstance(line, bytes):
        if not (line.startswith(b"S0,") or line.startswith(b"S1,") or line.startswith(b"O2,")):
            return None
        try:
            decoded = line.decode("ascii")
        except UnicodeDecodeError as exc:
            raise InvalidSerialRecord("シリアルレコードはASCIIである必要があります") from exc
    else:
        if not (line.startswith("S0,") or line.startswith("S1,") or line.startswith("O2,")):
            return None
        decoded = line

    raw_line = decoded.rstrip("\r\n")
    fields = raw_line.split(",")
    packet_type = fields[0] if fields else ""
    if packet_type == PACKET_TYPE_S0:
        if len(fields) != FIELD_COUNT_S0:
            raise InvalidSerialRecord("S0レコードは10フィールドである必要があります")
        (
            _,
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
            installation_id=None,
            boot_id=None,
            config_version=0,
        )

    if packet_type == PACKET_TYPE_S1:
        if len(fields) != FIELD_COUNT_S1:
            raise InvalidSerialRecord("S1レコードは13フィールドである必要があります")
        (
            _,
            node_id,
            installation_id,
            boot_id,
            sample_seq,
            hop,
            sample_ms,
            ax_mg,
            ay_mg,
            az_mg,
            soil_raw,
            battery_mv,
            config_version,
        ) = fields
        if not NODE_ID_PATTERN.fullmatch(node_id):
            raise InvalidSerialRecord("node_idの形式が不正です")
        if not INSTALLATION_ID_PATTERN.fullmatch(installation_id):
            raise InvalidSerialRecord("installation_idの形式が不正です")
        if not BOOT_ID_PATTERN.fullmatch(boot_id):
            raise InvalidSerialRecord("boot_idの形式が不正です")

        return SerialObservation(
            packet_type=packet_type,
            node_id=node_id,
            seq=_parse_non_negative_integer(sample_seq, "sample_seq"),
            hop=_parse_non_negative_integer(hop, "hop"),
            sample_ms=_parse_non_negative_integer(sample_ms, "sample_ms"),
            ax_mg=_parse_integer(ax_mg, "ax_mg"),
            ay_mg=_parse_integer(ay_mg, "ay_mg"),
            az_mg=_parse_integer(az_mg, "az_mg"),
            soil_raw=_parse_integer(soil_raw, "soil_raw"),
            battery_mv=_parse_integer(battery_mv, "battery_mv"),
            raw_line=raw_line,
            installation_id=installation_id,
            boot_id=boot_id,
            config_version=_parse_non_negative_integer(config_version, "config_version"),
        )

    if packet_type == PACKET_TYPE_O2:
        if len(fields) != FIELD_COUNT_O2:
            raise InvalidSerialRecord("O2レコードは12フィールドである必要があります")
        (
            _,
            node_id,
            installation_id,
            boot_id,
            sample_seq,
            sample_ms,
            ax,
            ay,
            az,
            soil_raw,
            battery_mv,
            profile,
        ) = fields
        if not NODE_ID_PATTERN.fullmatch(node_id):
            raise InvalidSerialRecord("node_idの形式が不正です")
        if not INSTALLATION_ID_PATTERN.fullmatch(installation_id):
            raise InvalidSerialRecord("installation_idの形式が不正です")
        if not BOOT_ID_PATTERN.fullmatch(boot_id):
            raise InvalidSerialRecord("boot_idの形式が不正です")
        if not PROFILE_PATTERN.fullmatch(profile):
            raise InvalidSerialRecord("profileの形式が不正です")

        parsed_ax_mg, ax_raw = _parse_float_to_mg(ax, "ax")
        parsed_ay_mg, ay_raw = _parse_float_to_mg(ay, "ay")
        parsed_az_mg, az_raw = _parse_float_to_mg(az, "az")

        return SerialObservation(
            packet_type=packet_type,
            node_id=node_id,
            seq=_parse_non_negative_integer(sample_seq, "sample_seq"),
            hop=0,
            sample_ms=_parse_non_negative_integer(sample_ms, "sample_ms"),
            ax_mg=parsed_ax_mg,
            ay_mg=parsed_ay_mg,
            az_mg=parsed_az_mg,
            soil_raw=_parse_integer(soil_raw, "soil_raw"),
            battery_mv=_parse_integer(battery_mv, "battery_mv"),
            raw_line=raw_line,
            installation_id=installation_id,
            boot_id=boot_id,
            config_version=1,
            profile=profile,
            ax_mg_raw=ax_raw,
            ay_mg_raw=ay_raw,
            az_mg_raw=az_raw,
        )

    return None


def calculate_tilt_angle_deg(
    ax: float,
    ay: float,
    az: float,
    base_ax: float,
    base_ay: float,
    base_az: float,
) -> float | None:
    """基準ベクトルと現在ベクトルの成す角（度）を内積から計算する。無効ベクトルの場合はNone。"""
    curr_norm_sq = ax**2 + ay**2 + az**2
    base_norm_sq = base_ax**2 + base_ay**2 + base_az**2
    if curr_norm_sq == 0 or base_norm_sq == 0:
        return None

    dot_product = ax * base_ax + ay * base_ay + az * base_az
    cos_theta = dot_product / (math.sqrt(curr_norm_sq) * math.sqrt(base_norm_sq))
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))
