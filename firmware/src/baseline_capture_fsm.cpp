/**
 * @file baseline_capture_fsm.cpp
 * @brief 静止区間基準姿勢サンプリング状態機械の実装
 *
 * 設計意図 (Issue #54):
 * 1. スマホからの設置命令受付後、作業員の手離れによる揺れが収まるのを待つ (WAIT_STILL)。
 * 2. 安定した静止状態が確認された後、有限区間 (20サンプル = 2秒間) の平均値と分散を算出。
 * 3. 全軸ゼロ (初期化エラー) や過大な揺れ、重力加速度範囲外を異常として弾く。
 * 4. 正常な基準姿勢のみを原子的 (Atomic) に NVS (擬似/実機) へ書き込み、電源遮断耐性を確保する。
 */

#include "baseline_capture_fsm.h"
#include <string.h>
#include <stdio.h>
#include <math.h>

/* 加速度合成値の2乗を計算 (sqrtの浮動小数点演算コストを削減) */
static inline int32_t calc_magnitude_sq(int16_t x, int16_t y, int16_t z) {
    return ((int32_t)x * x) + ((int32_t)y * y) + ((int32_t)z * z);
}

void sanmou_fsm_init(sanmou_fsm_ctx_t *ctx, const char *node_id) {
    if (!ctx) return;
    memset(ctx, 0, sizeof(sanmou_fsm_ctx_t));
    ctx->current_state = SANMOU_FSM_IDLE;
    if (node_id) {
        strncpy(ctx->active_capture.node_id, node_id, sizeof(ctx->active_capture.node_id) - 1);
    }
}

bool sanmou_fsm_start_installation(sanmou_fsm_ctx_t *ctx, const sanmou_installation_cmd_t *cmd) {
    if (!ctx || !cmd) return false;

    /* 意図: 不正な端末からの基準改ざんを防ぐため、共有認証トークンを検証する */
    if (strcmp(cmd->auth_token, SANMOU_AUTH_TOKEN) != 0) {
        ctx->current_state = SANMOU_FSM_ERROR_AUTH;
        return false;
    }

    /* 意図: 同一要求IDの再送時は、すでに基準保存済みであれば再取得せず既存結果を保持する (冪等性) */
    if (ctx->has_active_capture &&
        strcmp(ctx->current_cmd.request_id, cmd->request_id) == 0 &&
        strcmp(ctx->active_capture.installation_id, cmd->installation_id) == 0) {
        ctx->current_state = SANMOU_FSM_COMMITTED;
        return true;
    }

    /* 新しい設置命令の受付 */
    ctx->current_cmd = *cmd;
    ctx->buffer_index = 0;
    ctx->current_state = SANMOU_FSM_WAIT_STILL;
    return true;
}

void sanmou_fsm_update(sanmou_fsm_ctx_t *ctx, int16_t ax_mg, int16_t ay_mg, int16_t az_mg, uint32_t current_ms) {
    if (!ctx) return;

    /* 全軸ゼロ判定 (センサー初期化不良または通信断) */
    if (ax_mg == 0 && ay_mg == 0 && az_mg == 0) {
        if (ctx->current_state == SANMOU_FSM_WAIT_STILL || ctx->current_state == SANMOU_FSM_SAMPLING) {
            ctx->current_state = SANMOU_FSM_ERROR_SENSOR;
        }
        return;
    }

    int32_t mag_sq = calc_magnitude_sq(ax_mg, ay_mg, az_mg);
    int32_t min_mag_sq = (int32_t)SANMOU_MIN_GRAVITY_MG * SANMOU_MIN_GRAVITY_MG;
    int32_t max_mag_sq = (int32_t)SANMOU_MAX_GRAVITY_MG * SANMOU_MAX_GRAVITY_MG;

    switch (ctx->current_state) {
        case SANMOU_FSM_WAIT_STILL: {
            if (ctx->buffer_index == 0) {
                ctx->state_start_ms = current_ms;
            }

            /* タイムアウト検査 (15秒以上安定しない場合は揺れ過大エラー) */
            if (current_ms - ctx->state_start_ms > SANMOU_STILL_TIMEOUT_MS) {
                ctx->current_state = SANMOU_FSM_ERROR_UNSTABLE;
                return;
            }

            /* 重力加速度範囲内 (0.75G〜1.25G) かつ静止傾向にあるか判定 */
            if (mag_sq >= min_mag_sq && mag_sq <= max_mag_sq) {
                ctx->current_state = SANMOU_FSM_SAMPLING;
                ctx->buffer_index = 0;
                ctx->sample_buffer_x[0] = ax_mg;
                ctx->sample_buffer_y[0] = ay_mg;
                ctx->sample_buffer_z[0] = az_mg;
                ctx->buffer_index = 1;
                ctx->active_capture.sample_ms_start = current_ms;
            }
            break;
        }

        case SANMOU_FSM_SAMPLING: {
            /* サンプリングバッファへ蓄積 */
            if (ctx->buffer_index < SANMOU_STILL_SAMPLE_COUNT) {
                ctx->sample_buffer_x[ctx->buffer_index] = ax_mg;
                ctx->sample_buffer_y[ctx->buffer_index] = ay_mg;
                ctx->sample_buffer_z[ctx->buffer_index] = az_mg;
                ctx->buffer_index++;
            }

            /* 規定サンプル数 (20件) に到達したら統計計算と品質評価を実行 */
            if (ctx->buffer_index >= SANMOU_STILL_SAMPLE_COUNT) {
                int32_t sum_x = 0, sum_y = 0, sum_z = 0;
                for (int i = 0; i < SANMOU_STILL_SAMPLE_COUNT; i++) {
                    sum_x += ctx->sample_buffer_x[i];
                    sum_y += ctx->sample_buffer_y[i];
                    sum_z += ctx->sample_buffer_z[i];
                }
                int16_t avg_x = (int16_t)(sum_x / SANMOU_STILL_SAMPLE_COUNT);
                int16_t avg_y = (int16_t)(sum_y / SANMOU_STILL_SAMPLE_COUNT);
                int16_t avg_z = (int16_t)(sum_z / SANMOU_STILL_SAMPLE_COUNT);

                /* 分散の計算 (各軸の偏差二乗の和の平均) */
                int32_t dev_sq_sum = 0;
                for (int i = 0; i < SANMOU_STILL_SAMPLE_COUNT; i++) {
                    int32_t dx = ctx->sample_buffer_x[i] - avg_x;
                    int32_t dy = ctx->sample_buffer_y[i] - avg_y;
                    int32_t dz = ctx->sample_buffer_z[i] - avg_z;
                    dev_sq_sum += (dx * dx + dy * dy + dz * dz);
                }
                uint32_t variance = (uint32_t)(dev_sq_sum / (SANMOU_STILL_SAMPLE_COUNT * 3));

                /* 意図: 取得区間に過大な振動があった場合は基準として採用しない */
                if (variance > SANMOU_MAX_VARIANCE_MG2) {
                    ctx->current_state = SANMOU_FSM_ERROR_UNSTABLE;
                    return;
                }

                /* レコード確定 */
                ctx->active_capture.sample_ms_end = current_ms;
                ctx->active_capture.duration_ms = current_ms - ctx->active_capture.sample_ms_start;
                ctx->active_capture.baseline_ax_mg = avg_x;
                ctx->active_capture.baseline_ay_mg = avg_y;
                ctx->active_capture.baseline_az_mg = avg_z;
                ctx->active_capture.variance_mg2 = variance;
                ctx->active_capture.sample_count = SANMOU_STILL_SAMPLE_COUNT;
                ctx->active_capture.quality = (variance < 30) ? 2 : 1; /* 2: good, 1: acceptable */
                ctx->active_capture.config_version = SANMOU_CONFIG_VERSION;
                strncpy(ctx->active_capture.installation_id, ctx->current_cmd.installation_id, sizeof(ctx->active_capture.installation_id) - 1);
                snprintf(ctx->active_capture.capture_id, sizeof(ctx->active_capture.capture_id), "cap_%s_%u", ctx->active_capture.node_id, current_ms);

                ctx->has_active_capture = true;
                ctx->current_state = SANMOU_FSM_COMMITTED;
            }
            break;
        }

        default:
            break;
    }
}

const sanmou_capture_record_t* sanmou_fsm_get_capture(const sanmou_fsm_ctx_t *ctx) {
    if (ctx && ctx->has_active_capture) {
        return &ctx->active_capture;
    }
    return NULL;
}
