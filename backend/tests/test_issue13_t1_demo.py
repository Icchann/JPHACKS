import time

from app.device.protocol import (
    calculate_tilt_angle_deg,
    parse_serial_line,
)

# Issue #13 に記載されたデモ予定実機の9行の受信ログ
ISSUE13_T1_LOGS = [
    "S0,T1,0,0,1609,0,0,0,-1,-1",
    "S0,T1,1,0,3115,-128,-176,928,-1,-1",
    "S0,T1,2,0,4615,-128,-112,944,-1,-1",
    "S0,T1,3,0,6120,-128,-112,944,-1,-1",
    "S0,T1,4,0,7620,-128,-96,944,-1,-1",
    "S0,T1,5,0,9125,-128,-96,944,-1,-1",
    "S0,T1,6,0,10625,-144,-112,912,-1,-1",
    "S0,T1,7,0,12130,-128,-144,944,-1,-1",
    "S0,T1,8,0,13630,-112,-128,944,-1,-1",
]


def test_issue13_t1_logs_parsing_and_criteria():
    """Issue #13 の実機T1受信ログ9行を入力し、受け入れ条件をすべて検証する。"""
    observations = []
    start_time = time.perf_counter()

    for line in ISSUE13_T1_LOGS:
        obs = parse_serial_line(line)
        assert obs is not None, f"パースに失敗: {line}"
        observations.append(obs)

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    # 1. T1 を全行で正しく認識していること
    assert len(observations) == 9
    for i, obs in enumerate(observations):
        assert obs.node_id == "T1", f"行{i}: node_id が T1 ではありません"
        assert obs.seq == i, f"行{i}: seq が連続していません"
        assert obs.hop == 0

        # 負の加速度が正しく保持されていること（符号破棄がないこと）
        if i >= 1:
            assert obs.ax_mg < 0, f"行{i}: ax_mg の負号が欠落しています"
            assert obs.ay_mg < 0, f"行{i}: ay_mg の負号が欠落しています"
            assert obs.az_mg > 0

        # 土壌・電池の -1 は未計測（None）として扱うこと（架空の値を補わない）
        assert obs.soil_raw == -1
        assert obs.battery_mv == -1
        assert obs.soil_raw_measured is None
        assert obs.battery_mv_measured is None

    # 2. 送信周期の実測確認（約1.5秒周期・sample_ms の差分）
    intervals = [
        observations[i].sample_ms - observations[i - 1].sample_ms
        for i in range(1, len(observations))
    ]
    avg_interval = sum(intervals) / len(intervals)
    assert 1500 <= avg_interval <= 1506, f"平均周期が約1.5秒ではありません: {avg_interval} ms"
    for diff in intervals:
        assert 1500 <= diff <= 1506

    # 3. seq=0 の全軸ゼロは基準取得・角度計算から除外すること
    seq0 = observations[0]
    assert seq0.seq == 0
    assert seq0.is_zero_acceleration is True
    assert seq0.is_valid_gravity_vector is False

    # 4. seq=1 以降は有効な重力ベクトルであること
    for obs in observations[1:]:
        assert obs.is_zero_acceleration is False
        assert obs.is_valid_gravity_vector is True

    # 5. seq=1〜3 で安定した基準姿勢（ax0, ay0, az0）を確定する
    stable_samples = [obs for obs in observations if obs.is_valid_gravity_vector][:3]
    assert len(stable_samples) == 3
    base_ax = sum(obs.ax_mg for obs in stable_samples) / 3
    base_ay = sum(obs.ay_mg for obs in stable_samples) / 3
    base_az = sum(obs.az_mg for obs in stable_samples) / 3

    assert -130 <= base_ax <= -120
    assert -140 <= base_ay <= -130
    assert 930 <= base_az <= 945

    # 6. 後続データ（seq=4〜8）で基準姿勢からの角度変位を計算（平常姿勢では微小変化であること）
    for obs in observations[4:]:
        tilt_deg = calculate_tilt_angle_deg(
            obs.ax_mg, obs.ay_mg, obs.az_mg, base_ax, base_ay, base_az
        )
        assert tilt_deg is not None
        assert tilt_deg < 5.0, f"平常姿勢で角度が大きすぎます: {tilt_deg}°"

    # 7. タニさんが体を傾けたシミュレーション（20°以上の姿勢変位を確実に検知）
    tilted_ax = -450.0
    tilted_ay = -380.0
    tilted_az = 720.0
    tilted_deg = calculate_tilt_angle_deg(
        tilted_ax, tilted_ay, tilted_az, base_ax, base_ay, base_az
    )
    assert tilted_deg is not None
    assert tilted_deg >= 15.0, f"姿勢変化が検知できていません: {tilted_deg}°"

    # 8. パース処理および基準判定が低遅延（< 5ms）で完了すること
    assert elapsed_ms < 5.0, f"処理が遅延しています: {elapsed_ms} ms"
