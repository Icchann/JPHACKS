/**
 * @file baseline_capture_fsm.h
 * @brief 静止区間基準姿勢サンプリング状態機械のヘッダー
 */

#ifndef BASELINE_CAPTURE_FSM_H
#define BASELINE_CAPTURE_FSM_H

#include "sanmou_contracts.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    sanmou_fsm_status_t current_state;
    sanmou_installation_cmd_t current_cmd;
    sanmou_capture_record_t active_capture;
    int16_t sample_buffer_x[SANMOU_STILL_SAMPLE_COUNT];
    int16_t sample_buffer_y[SANMOU_STILL_SAMPLE_COUNT];
    int16_t sample_buffer_z[SANMOU_STILL_SAMPLE_COUNT];
    uint16_t buffer_index;
    uint32_t state_start_ms;
    bool has_active_capture;
} sanmou_fsm_ctx_t;

/* 初期化: NVSから直近の確定設置と基準を復元 */
void sanmou_fsm_init(sanmou_fsm_ctx_t *ctx, const char *node_id);

/* 設置命令受信時の処理 (認証・競合チェックを行い状態遷移) */
bool sanmou_fsm_start_installation(sanmou_fsm_ctx_t *ctx, const sanmou_installation_cmd_t *cmd);

/* 周期実行ハンドラー: 加速度サンプリングと静止判定・NVS保存を実行 */
void sanmou_fsm_update(sanmou_fsm_ctx_t *ctx, int16_t ax_mg, int16_t ay_mg, int16_t az_mg, uint32_t current_ms);

/* 現在の確定基準を取得 */
const sanmou_capture_record_t* sanmou_fsm_get_capture(const sanmou_fsm_ctx_t *ctx);

#ifdef __cplusplus
}
#endif

#endif /* BASELINE_CAPTURE_FSM_H */
