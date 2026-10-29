"""S1新形式パケットパーサーおよびS0互換性の単体テスト (Issue #56)"""

import pytest

from app.device.protocol import (
    InvalidSerialRecord,
    parse_serial_line,
)


def test_parse_s1_valid_packet() -> None:
    line = "S1,T1,inst_T1_20261029_090000,b_0001_a9f2,42,0,123456,-115,-92,990,-1,3250,1"
    obs = parse_serial_line(line)
    assert obs is not None
    assert obs.packet_type == "S1"
    assert obs.node_id == "T1"
    assert obs.installation_id == "inst_T1_20261029_090000"
    assert obs.boot_id == "b_0001_a9f2"
    assert obs.seq == 42
    assert obs.hop == 0
    assert obs.sample_ms == 123456
    assert obs.ax_mg == -115
    assert obs.ay_mg == -92
    assert obs.az_mg == 990
    assert obs.soil_raw == -1
    assert obs.soil_raw_measured is None
    assert obs.battery_mv == 3250
    assert obs.battery_mv_measured == 3250
    assert obs.config_version == 1
    assert obs.is_valid_gravity_vector is True


def test_parse_s0_compatibility() -> None:
    line = "S0,T1,247,0,672755,-976,0,96,-1,-1"
    obs = parse_serial_line(line)
    assert obs is not None
    assert obs.packet_type == "S0"
    assert obs.node_id == "T1"
    assert obs.seq == 247
    assert obs.installation_id is None
    assert obs.boot_id is None
    assert obs.config_version == 0


def test_parse_s1_invalid_field_count() -> None:
    line = "S1,T1,inst_01,b_01,10,0,100,0,0,1000,-1,-1"  # 12 fields (1欠落)
    with pytest.raises(InvalidSerialRecord, match="13フィールド"):
        parse_serial_line(line)


def test_parse_s1_invalid_installation_id() -> None:
    line = "S1,T1,inst invalid space!,b_01,10,0,100,0,0,1000,-1,-1,1"
    with pytest.raises(InvalidSerialRecord, match="installation_id"):
        parse_serial_line(line)


def test_parse_non_serial_ignored() -> None:
    assert parse_serial_line("ESP-ROM:esp32c3-api-2026") is None
    assert parse_serial_line("INFO: LoRa module ready") is None
