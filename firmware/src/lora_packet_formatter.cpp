/**
 * @file lora_packet_formatter.cpp
 * @brief LoRa S1新形式パケット生成の実装
 *
 * 設計意図 (Issue #56):
 * 1. 物理設置ID (installation_id)、起動ID (boot_id)、観測連番 (sample_seq) を含め、
 *    再設置前後や再起動後の観測を時刻の推測なしに厳密に識別できるようにする。
 * 2. 旧形式S0と区別するためプレフィックスを "S1" とする。
 * 3. 土壌生値・電池電圧の未計測は "-1" として出力し、加速度の負値と明確に区別する。
 */

#include "lora_packet_formatter.h"
#include <stdio.h>

size_t sanmou_format_s1_packet(
    char *out_buf,
    size_t max_len,
    const char *node_id,
    const char *installation_id,
    const char *boot_id,
    uint32_t sample_seq,
    uint8_t hop,
    uint32_t sample_ms,
    int16_t ax_mg,
    int16_t ay_mg,
    int16_t az_mg,
    int16_t soil_raw,
    int16_t battery_mv,
    uint8_t config_version
) {
    if (!out_buf || max_len == 0 || !node_id || !installation_id || !boot_id) {
        return 0;
    }

    int written = snprintf(
        out_buf,
        max_len,
        "S1,%s,%s,%s,%u,%u,%u,%d,%d,%d,%d,%d,%u\r\n",
        node_id,
        installation_id,
        boot_id,
        (unsigned)sample_seq,
        (unsigned)hop,
        (unsigned)sample_ms,
        ax_mg,
        ay_mg,
        az_mg,
        soil_raw,
        battery_mv,
        (unsigned)config_version
    );

    return (written > 0 && (size_t)written < max_len) ? (size_t)written : 0;
}
