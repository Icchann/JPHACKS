/**
 * @file ble_installation_service.h
 * @brief 設置用BLE GATTサービス、機体照合、認証、待受制御のヘッダー
 */

#ifndef BLE_INSTALLATION_SERVICE_H
#define BLE_INSTALLATION_SERVICE_H

#include "sanmou_contracts.h"
#include "baseline_capture_fsm.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char node_id[16];
    bool ble_active;
    uint32_t ble_start_ms;
    sanmou_fsm_ctx_t *fsm_ctx;
} sanmou_ble_server_t;

/* BLEサーバー初期化 (GATTサービスとアドバタイズ開始) */
void sanmou_ble_init(sanmou_ble_server_t *server, const char *node_id, sanmou_fsm_ctx_t *fsm_ctx, uint32_t current_ms);

/* 周期ハンドラー (5分待受タイマーによるBLE停止制御) */
void sanmou_ble_update(sanmou_ble_server_t *server, uint32_t current_ms);

/* スマホからの設置命令JSON受信時のディスパッチハンドラー */
int sanmou_ble_on_write_cmd(sanmou_ble_server_t *server, const uint8_t *data, size_t len);

/* スマホからの基準結果取得時のJSON生成ハンドラー (バッファに書き込み長さを返す) */
size_t sanmou_ble_on_read_status(sanmou_ble_server_t *server, char *out_buf, size_t max_len);

#ifdef __cplusplus
}
#endif

#endif /* BLE_INSTALLATION_SERVICE_H */
