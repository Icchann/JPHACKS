/**
 * @file sanmou_contracts.h
 * @brief 山網 共通ファームウェア契約・定数・データ構造定義
 *
 * 準拠: Issue #53, #54, #55, #56, CONTRACTS.md
 * 意図: ESP32C3、ADXL367、E220間の通信において、軸・mg換算・版番号・
 *       および静止区間判定定数を単一の正本として定義し、不整合を排除する。
 */

#ifndef SANMOU_CONTRACTS_H
#define SANMOU_CONTRACTS_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* 測定設定版 */
#define SANMOU_CONFIG_VERSION 1

/* 静止基準取得パラメータ */
#define SANMOU_STILL_SAMPLE_COUNT 20       /* 基準取得に必要な静止サンプル数 */
#define SANMOU_STILL_INTERVAL_MS 100       /* サンプリング間隔(10Hz = 100ms) */
#define SANMOU_STILL_TIMEOUT_MS 15000      /* 静止待ちタイムアウト(15秒) */
#define SANMOU_MAX_VARIANCE_MG2 100        /* 許容加速度分散 (mg^2) */
#define SANMOU_MIN_GRAVITY_MG 750          /* 静止重力合成ベクトルの許容最小値 (mg) */
#define SANMOU_MAX_GRAVITY_MG 1250         /* 静止重力合成ベクトルの許容最大値 (mg) */

/* BLE 待受設定 */
#define SANMOU_BLE_ADVERTISING_TIMEOUT_SEC 300 /* 電源投入後5分待受 */
#define SANMOU_AUTH_TOKEN "sanmou-field-token-2026"

/* BLE UUID 定義 */
#define SANMOU_SERVICE_UUID "7a261800-0001-4b19-9000-00805f9b34fb"
#define SANMOU_CHAR_CMD_UUID "7a261801-0001-4b19-9000-00805f9b34fb"
#define SANMOU_CHAR_STATUS_UUID "7a261802-0001-4b19-9000-00805f9b34fb"

/* 状態機械ステータスコード */
typedef enum {
    SANMOU_FSM_IDLE = 0,
    SANMOU_FSM_WAIT_STILL = 1,
    SANMOU_FSM_SAMPLING = 2,
    SANMOU_FSM_COMMITTED = 3,
    SANMOU_FSM_ERROR_UNSTABLE = 10,
    SANMOU_FSM_ERROR_SENSOR = 11,
    SANMOU_FSM_ERROR_AUTH = 12,
    SANMOU_FSM_ERROR_CONFLICT = 13
} sanmou_fsm_status_t;

/* 機体内に永続化される基準姿勢レコード */
typedef struct {
    char capture_id[40];
    char installation_id[40];
    char node_id[16];
    int16_t baseline_ax_mg;
    int16_t baseline_ay_mg;
    int16_t baseline_az_mg;
    uint32_t variance_mg2;
    uint16_t sample_count;
    uint32_t duration_ms;
    uint8_t quality; /* 0: rejected, 1: acceptable, 2: good */
    uint8_t config_version;
    uint32_t sample_ms_start;
    uint32_t sample_ms_end;
} sanmou_capture_record_t;

/* 設置命令 */
typedef struct {
    char request_id[37];
    char installation_id[40];
    char auth_token[32];
    uint8_t expected_version;
} sanmou_installation_cmd_t;

#ifdef __cplusplus
}
#endif

#endif /* SANMOU_CONTRACTS_H */
