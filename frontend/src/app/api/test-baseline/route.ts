import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HTTP_BAD_REQUEST = 400;
const DEFAULT_STATE_FILENAME = "sanmou-test-baseline-state.json";

export type BaselineData = {
  ax: number;
  ay: number;
  az: number;
  setAt: string;
};

export type AlertData = {
  sensorCode: string;
  sensorName: string;
  tiltDeg: number;
  reason: string;
  triggeredAt: string;
};

export type SharedAlertData = AlertData | null;

type PersistedBaselineState = {
  baselines: Record<string, BaselineData>;
  activeAlerts: Record<string, AlertData>;
};

const globalState = globalThis as unknown as {
  __sanmouBaselines?: Record<string, BaselineData>;
  __sanmouActiveAlerts?: Record<string, AlertData>;
  __sanmouActiveAlert?: SharedAlertData;
};

// Next.js の開発・本番ワーカー間でメモリ空間が分かれても基準姿勢と機体別警報が失われないよう、
// OSの一時ディレクトリ（または環境変数指定パス）にJSONとして永続化する（Issue #29）
function resolveStateFilePath(): string {
  const configuredPath = process.env.SANMOU_BASELINE_STATE_PATH?.trim();
  const fileName = configuredPath
    ? path.basename(configuredPath)
    : DEFAULT_STATE_FILENAME;
  return path.join(os.tmpdir(), fileName);
}

function syncGlobalState(state: PersistedBaselineState): void {
  globalState.__sanmouBaselines = state.baselines;
  globalState.__sanmouActiveAlerts = state.activeAlerts;
  globalState.__sanmouActiveAlert =
    Object.values(state.activeAlerts)[0] ?? null;
}

function readPersistedState(): PersistedBaselineState {
  const stateFilePath = resolveStateFilePath();
  if (fs.existsSync(stateFilePath)) {
    try {
      const rawText = fs.readFileSync(stateFilePath, "utf-8");
      const parsed = JSON.parse(rawText) as Partial<PersistedBaselineState>;
      const state: PersistedBaselineState = {
        baselines:
          parsed.baselines && typeof parsed.baselines === "object"
            ? parsed.baselines
            : {},
        activeAlerts:
          parsed.activeAlerts && typeof parsed.activeAlerts === "object"
            ? parsed.activeAlerts
            : {},
      };
      syncGlobalState(state);
      return state;
    } catch {
      // ファイル破損や競合読み取り時はメモリ上のキャッシュへフォールバックし、API応答を継続する
    }
  }

  const fallbackState: PersistedBaselineState = {
    baselines: globalState.__sanmouBaselines ?? {},
    activeAlerts: globalState.__sanmouActiveAlerts ?? {},
  };
  syncGlobalState(fallbackState);
  return fallbackState;
}

function writePersistedState(state: PersistedBaselineState): void {
  syncGlobalState(state);
  const stateFilePath = resolveStateFilePath();
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
    fs.writeFileSync(stateFilePath, JSON.stringify(state), "utf-8");
  } catch {
    // 読み取り専用環境等でファイル書込に失敗した場合も、プロセス内グローバル状態は維持する
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidAlertPayload(value: unknown): value is AlertData {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    typeof value.sensorCode === "string" &&
    value.sensorCode.trim().length > 0 &&
    typeof value.sensorName === "string" &&
    value.sensorName.trim().length > 0 &&
    typeof value.tiltDeg === "number" &&
    Number.isFinite(value.tiltDeg) &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0
  );
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node_id")?.trim() || null;
  const { baselines, activeAlerts } = readPersistedState();
  const primaryActiveAlert: SharedAlertData =
    Object.values(activeAlerts)[0] ?? null;

  return NextResponse.json({
    baselines,
    activeAlerts,
    activeAlert: primaryActiveAlert,
    ...(nodeId ? { node_id: nodeId, baseline: baselines[nodeId] ?? null } : {}),
  });
}

export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON形式が不正です" },
      { status: HTTP_BAD_REQUEST },
    );
  }

  if (!isPlainRecord(parsedBody) || Object.keys(parsedBody).length === 0) {
    return NextResponse.json(
      { error: "リクエストボディが空または不正です" },
      { status: HTTP_BAD_REQUEST },
    );
  }

  const hasBaselineFields =
    parsedBody.ax !== undefined ||
    parsedBody.ay !== undefined ||
    parsedBody.az !== undefined;
  const hasClearAlert = typeof parsedBody.clearAlert === "boolean";
  const hasActiveAlert = parsedBody.activeAlert !== undefined;

  if (!hasBaselineFields && !hasClearAlert && !hasActiveAlert) {
    return NextResponse.json(
      { error: "基準姿勢または警報操作のパラメータが必要です" },
      { status: HTTP_BAD_REQUEST },
    );
  }

  const state = readPersistedState();
  const normalizedNodeId =
    typeof parsedBody.node_id === "string" ? parsedBody.node_id.trim() : "";

  // 基準姿勢ベクトルが指定されている場合は型と全軸ゼロ（seq=0初期化値）を厳密に検証する
  if (hasBaselineFields) {
    if (
      !normalizedNodeId ||
      typeof parsedBody.ax !== "number" ||
      !Number.isFinite(parsedBody.ax) ||
      typeof parsedBody.ay !== "number" ||
      !Number.isFinite(parsedBody.ay) ||
      typeof parsedBody.az !== "number" ||
      !Number.isFinite(parsedBody.az)
    ) {
      return NextResponse.json(
        { error: "node_id および有効な数値の ax, ay, az が必要です" },
        { status: HTTP_BAD_REQUEST },
      );
    }

    if (parsedBody.ax === 0 && parsedBody.ay === 0 && parsedBody.az === 0) {
      return NextResponse.json(
        { error: "全軸ゼロの初期化値は基準姿勢として登録できません" },
        { status: HTTP_BAD_REQUEST },
      );
    }

    const setAt =
      typeof parsedBody.setAt === "string" && parsedBody.setAt.trim().length > 0
        ? parsedBody.setAt.trim()
        : new Date().toLocaleTimeString("ja-JP");

    state.baselines[normalizedNodeId] = {
      ax: parsedBody.ax,
      ay: parsedBody.ay,
      az: parsedBody.az,
      setAt,
    };

    // 対象機体の基準が再確定されたため、当該機体の警報のみを解除し、他機体の警報は維持する（Issue #29）
    delete state.activeAlerts[normalizedNodeId];
    writePersistedState(state);

    const primaryActiveAlert: SharedAlertData =
      Object.values(state.activeAlerts)[0] ?? null;

    return NextResponse.json({
      success: true,
      node_id: normalizedNodeId,
      baseline: state.baselines[normalizedNodeId],
      baselines: state.baselines,
      activeAlerts: state.activeAlerts,
      activeAlert: primaryActiveAlert,
    });
  }

  // 警報の解除リクエスト処理（node_id 指定時は該当機体のみ、未指定時は全クリア）
  if (parsedBody.clearAlert === true) {
    if (normalizedNodeId) {
      delete state.activeAlerts[normalizedNodeId];
    } else {
      state.activeAlerts = {};
    }
  } else if (hasActiveAlert) {
    if (parsedBody.activeAlert === null) {
      if (normalizedNodeId) {
        delete state.activeAlerts[normalizedNodeId];
      } else {
        state.activeAlerts = {};
      }
    } else if (isValidAlertPayload(parsedBody.activeAlert)) {
      const targetCode = parsedBody.activeAlert.sensorCode.trim();
      state.activeAlerts[targetCode] = {
        sensorCode: targetCode,
        sensorName: parsedBody.activeAlert.sensorName.trim(),
        tiltDeg: parsedBody.activeAlert.tiltDeg,
        reason: parsedBody.activeAlert.reason.trim(),
        triggeredAt:
          typeof parsedBody.activeAlert.triggeredAt === "string" &&
          parsedBody.activeAlert.triggeredAt.trim().length > 0
            ? parsedBody.activeAlert.triggeredAt
            : new Date().toISOString(),
      };
    } else {
      return NextResponse.json(
        { error: "activeAlert の形式が不正です" },
        { status: HTTP_BAD_REQUEST },
      );
    }
  }

  writePersistedState(state);
  const primaryActiveAlert: SharedAlertData =
    Object.values(state.activeAlerts)[0] ?? null;

  return NextResponse.json({
    success: true,
    baselines: state.baselines,
    activeAlerts: state.activeAlerts,
    activeAlert: primaryActiveAlert,
  });
}

export function DELETE(request: Request) {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node_id")?.trim() || null;
  const state = readPersistedState();

  if (nodeId) {
    // 特定機体のみの削除時は、他機体の基準姿勢および警報を消去しない（Issue #29）
    delete state.baselines[nodeId];
    delete state.activeAlerts[nodeId];
    writePersistedState(state);

    const primaryActiveAlert: SharedAlertData =
      Object.values(state.activeAlerts)[0] ?? null;

    return NextResponse.json({
      success: true,
      deleted: nodeId,
      baselines: state.baselines,
      activeAlerts: state.activeAlerts,
      activeAlert: primaryActiveAlert,
    });
  }

  state.baselines = {};
  state.activeAlerts = {};
  writePersistedState(state);

  return NextResponse.json({
    success: true,
    cleared: true,
    baselines: state.baselines,
    activeAlerts: state.activeAlerts,
    activeAlert: null,
  });
}
