/**
 * @file lora_packet_formatter.h
 * @brief LoRa S1新形式パケット生成ヘッダー
 */

#ifndef LORA_PACKET_FORMATTER_H
#define LORA_PACKET_FORMATTER_H

#include "sanmou_contracts.h"
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * S1パケットをフォーマットしてバッファへ書き込む
 * 出力形式: S1,<node_id>,<installation_id>,<boot_id>,<sample_seq>,<hop>,<sample_ms>,<ax_mg>,<ay_mg>,<az_mg>,<soil_raw>,<battery_mv>,<config_version>\r\n
 */
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
);

#ifdef __cplusplus
}
#endif

#endif /* LORA_PACKET_FORMATTER_H */
