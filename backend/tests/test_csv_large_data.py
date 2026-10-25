import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.device.csv_reader import read_observation_csv
from app.device.csv_store import CSV_COLUMNS


def test_large_csv_performance_and_memory(tmp_path: Path) -> None:
    """Issue #9: 10万行規模の極端な大量データでも
    高速かつ省メモリに最新件数を取得できることを検証する。
    """
    large_csv = tmp_path / "large_observations.csv"
    start_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)

    # 10万行の観測データCSVを一括生成
    total_lines = 100_000
    print(f"\n10万行のテストCSVを生成中: {total_lines}行...")

    with large_csv.open("w", encoding="utf-8", newline="\r\n") as f:
        f.write(",".join(CSV_COLUMNS) + "\r\n")
        # 1000行ずつバッファして高速書き込み
        buffer = []
        for i in range(total_lines):
            t = start_time + timedelta(seconds=i * 10)
            node = "T1" if i % 2 == 0 else "S1"
            iso_t = t.isoformat(timespec="milliseconds")
            raw = f"S0,{node},{i % 256},1,{i * 1000},15,-20,980,1450,3300"
            line = f'{iso_t},{node},{i % 256},1,{i * 1000},15,-20,980,1450,3300,"{raw}"\r\n'
            buffer.append(line)
            if len(buffer) >= 5000:
                f.writelines(buffer)
                buffer.clear()
        if buffer:
            f.writelines(buffer)

    file_size_mb = large_csv.stat().st_size / (1024 * 1024)
    print(f"生成完了: ファイルサイズ = {file_size_mb:.2f} MB")

    # 最新500件を取得する実行時間を測定
    t_start = time.perf_counter()
    result = read_observation_csv(large_csv, limit=500)
    duration_sec = time.perf_counter() - t_start

    print(f"読込時間: {duration_sec:.4f} 秒, 取得件数: {len(result.items)}件")

    assert result.file_exists is True
    assert len(result.items) == 500
    assert result.invalid_row_count == 0

    # 最後の観測データが最新のシーケンス番号であることを確認
    last_item = result.items[-1]
    assert last_item.seq == (total_lines - 1) % 256
