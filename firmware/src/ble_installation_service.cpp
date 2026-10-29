/**
 * @file ble_installation_service.cpp
 * @brief 設置用BLE GATTサービス、機体照合、操作認証、待受制御の実装
 *
 * 設計意図 (Issue #55):
 * 1. NFCで識別したnode_idとBLE ModelNumberの一致を確認可能にする。
 * 2. 認可済み端末のみが基準変更できるよう共有auth_tokenを検証する。
 * 3. 電源投入後5分間のみアドバタイズを行い、設置完了後はBLEを停止して電池消耗を防ぎLoRa送信に専念する。
 */

#include "ble_installation_service.h"
#include <string.h>
#include <stdio.h>

void sanmou_ble_init(sanmou_ble_server_t *server, const char *node_id, sanmou_fsm_ctx_t *fsm_ctx, uint32_t current_ms) {
    if (!server) return;
    memset(server, 0, sizeof(sanmou_ble_server_t));
    if (node_id) {
        strncpy(server->node_id, node_id, sizeof(server->node_id) - 1);
    }
    server->fsm_ctx = fsm_ctx;
    server->ble_active = true;
    server->ble_start_ms = current_ms;
}

void sanmou_ble_update(sanmou_ble_server_t *server, uint32_t current_ms) {
    if (!server || !server->ble_active) return;

    /* 意図: 電源投入後5分 (300秒) を超えたら待受を自動終了し、省電力モードへ移行 */
    uint32_t elapsed_ms = current_ms - server->ble_start_ms;
    if (elapsed_ms > ((uint32_t)SANMOU_BLE_ADVERTISING_TIMEOUT_SEC * 1000)) {
        server->ble_active = false;
    }
}

int sanmou_ble_on_write_cmd(sanmou_ble_server_t *server, const uint8_t *data, size_t len) {
    if (!server || !server->fsm_ctx || !data || len == 0) return -1;

    /* 意図: 受信JSON文字列から命令・要求ID・設置ID・認証トークンを安全に抽出 */
    char json_str[256];
    size_t copy_len = len < (sizeof(json_str) - 1) ? len : (sizeof(json_str) - 1);
    memcpy(json_str, data, copy_len);
    json_str[copy_len] = '\0';

    sanmou_installation_cmd_t cmd;
    memset(&cmd, 0, sizeof(cmd));

    /* 簡易JSONパース (組込み環境でのフットプリント最小化) */
    char *req_id = strstr(json_str, "\"request_id\":");
    if (req_id) {
        sscanf(req_id, "\"request_id\":\"%36[^\"]\"", cmd.request_id);
    }
    char *inst_id = strstr(json_str, "\"installation_id\":");
    if (inst_id) {
        sscanf(inst_id, "\"installation_id\":\"%39[^\"]\"", cmd.installation_id);
    }
    char *token = strstr(json_str, "\"auth_token\":");
    if (token) {
        sscanf(token, "\"auth_token\":\"%31[^\"]\"", cmd.auth_token);
    }

    bool accepted = sanmou_fsm_start_installation(server->fsm_ctx, &cmd);
    return accepted ? 0 : -2;
}

size_t sanmou_ble_on_read_status(sanmou_ble_server_t *server, char *out_buf, size_t max_len) {
    if (!server || !server->fsm_ctx || !out_buf || max_len == 0) return 0;

    sanmou_fsm_status_t state = server->fsm_ctx->current_state;
    const sanmou_capture_record_t *cap = sanmou_fsm_get_capture(server->fsm_ctx);

    const char *status_str = "idle";
    switch (state) {
        case SANMOU_FSM_WAIT_STILL: status_str = "wait_still"; break;
        case SANMOU_FSM_SAMPLING: status_str = "sampling"; break;
        case SANMOU_FSM_COMMITTED: status_str = "committed"; break;
        case SANMOU_FSM_ERROR_UNSTABLE: status_str = "error_unstable"; break;
        case SANMOU_FSM_ERROR_SENSOR: status_str = "error_sensor"; break;
        case SANMOU_FSM_ERROR_AUTH: status_str = "error_auth"; break;
        case SANMOU_FSM_ERROR_CONFLICT: status_str = "error_conflict"; break;
        default: status_str = "idle"; break;
    }

    int written = 0;
    if (cap && state == SANMOU_FSM_COMMITTED) {
        const char *qual_str = (cap->quality == 2) ? "good" : (cap->quality == 1) ? "acceptable" : "rejected";
        written = snprintf(out_buf, max_len,
            "{\"status\":\"%s\",\"request_id\":\"%s\",\"node_id\":\"%s\",\"installation_id\":\"%s\","
            "\"capture_id\":\"%s\",\"sample_count\":%u,\"duration_ms\":%u,\"baseline_ax_mg\":%d,"
            "\"baseline_ay_mg\":%d,\"baseline_az_mg\":%d,\"variance_mg2\":%u,\"quality\":\"%s\",\"config_version\":%u}",
            status_str,
            server->fsm_ctx->current_cmd.request_id,
            server->node_id,
            cap->installation_id,
            cap->capture_id,
            (unsigned)cap->sample_count,
            (unsigned)cap->duration_ms,
            cap->baseline_ax_mg,
            cap->baseline_ay_mg,
            cap->baseline_az_mg,
            (unsigned)cap->variance_mg2,
            qual_str,
            (unsigned)cap->config_version
        );
    } else {
        written = snprintf(out_buf, max_len,
            "{\"status\":\"%s\",\"node_id\":\"%s\",\"request_id\":\"%s\"}",
            status_str,
            server->node_id,
            server->fsm_ctx->current_cmd.request_id
        );
    }

    return (written > 0 && (size_t)written < max_len) ? (size_t)written : 0;
}
