import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// メモリ内で各ノードの基準姿勢（キャリブレーションベクトル）および警報状態をPCとスマホ間で共有
type BaselineData = {
  ax: number;
  ay: number;
  az: number;
  setAt: string;
};

export type SharedAlertData = {
  sensorCode: string;
  sensorName: string;
  tiltDeg: number;
  reason: string;
  triggeredAt: string;
} | null;

const globalState = globalThis as unknown as {
  __sanmouBaselines?: Record<string, BaselineData>;
  __sanmouActiveAlert?: SharedAlertData;
};

const baselines: Record<string, BaselineData> =
  globalState.__sanmouBaselines ?? (globalState.__sanmouBaselines = {});

let sharedActiveAlert: SharedAlertData =
  globalState.__sanmouActiveAlert ?? null;

export function GET(request: Request) {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node_id");

  return NextResponse.json({
    baselines,
    activeAlert: sharedActiveAlert,
    ...(nodeId ? { node_id: nodeId, baseline: baselines[nodeId] ?? null } : {}),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      node_id?: string;
      ax?: number;
      ay?: number;
      az?: number;
      setAt?: string;
      activeAlert?: SharedAlertData;
      clearAlert?: boolean;
    };

    // 警報の手動設定または解除
    if (body.clearAlert) {
      sharedActiveAlert = null;
      globalState.__sanmouActiveAlert = null;
    } else if (body.activeAlert !== undefined) {
      sharedActiveAlert = body.activeAlert;
      globalState.__sanmouActiveAlert = sharedActiveAlert;
    }

    // 基準姿勢の保存
    if (
      body.node_id &&
      typeof body.ax === "number" &&
      typeof body.ay === "number" &&
      typeof body.az === "number"
    ) {
      const setAt = body.setAt ?? new Date().toLocaleTimeString("ja-JP");
      baselines[body.node_id] = {
        ax: body.ax,
        ay: body.ay,
        az: body.az,
        setAt,
      };

      // 基準が設定されたら警報を連動停止
      sharedActiveAlert = null;
      globalState.__sanmouActiveAlert = null;

      return NextResponse.json({
        success: true,
        node_id: body.node_id,
        baseline: baselines[body.node_id],
        activeAlert: sharedActiveAlert,
      });
    }

    return NextResponse.json({
      success: true,
      activeAlert: sharedActiveAlert,
      baselines,
    });
  } catch {
    return NextResponse.json(
      { error: "無効なリクエストです" },
      { status: 400 },
    );
  }
}

export function DELETE(request: Request) {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node_id");

  sharedActiveAlert = null;
  globalState.__sanmouActiveAlert = null;

  if (nodeId) {
    if (baselines[nodeId]) {
      delete baselines[nodeId];
    }
    return NextResponse.json({
      success: true,
      deleted: nodeId,
      activeAlert: null,
    });
  }

  Object.keys(baselines).forEach((key) => {
    delete baselines[key];
  });
  return NextResponse.json({
    success: true,
    cleared: true,
    activeAlert: null,
  });
}
