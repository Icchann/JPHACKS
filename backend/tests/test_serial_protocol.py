import pytest

from app.device.protocol import InvalidSerialRecord, parse_serial_line


def test_parse_current_device_sample() -> None:
    observation = parse_serial_line(b"S0,T1,247,0,672755,-976,0,96,-1,-1")

    assert observation is not None
    assert observation.node_id == "T1"
    assert observation.seq == 247
    assert observation.hop == 0
    assert observation.sample_ms == 672_755
    assert (observation.ax_mg, observation.ay_mg, observation.az_mg) == (-976, 0, 96)
    assert observation.soil_raw == -1
    assert observation.battery_mv == -1
    assert observation.soil_raw_measured is None
    assert observation.battery_mv_measured is None


def test_negative_acceleration_is_not_treated_as_missing() -> None:
    observation = parse_serial_line("S0,T2,1,0,10,-1,-1,-1,0,3300")

    assert observation is not None
    assert (observation.ax_mg, observation.ay_mg, observation.az_mg) == (-1, -1, -1)
    assert observation.soil_raw_measured == 0
    assert observation.battery_mv_measured == 3300


def test_non_s0_startup_message_is_ignored() -> None:
    assert parse_serial_line(b"ESP-ROM:esp32c3-api1-20210207") is None


@pytest.mark.parametrize(
    "line",
    [
        "S0,T1,247,0,672755,-976,0,96,-1",
        "S0,T1,not-a-number,0,672755,-976,0,96,-1,-1",
        "S0,T1,247,-1,672755,-976,0,96,-1,-1",
        "S0,T1,247,0,-1,-976,0,96,-1,-1",
        "S0,不正,247,0,672755,-976,0,96,-1,-1",
    ],
)
def test_malformed_s0_record_is_rejected(line: str) -> None:
    with pytest.raises(InvalidSerialRecord):
        parse_serial_line(line)
