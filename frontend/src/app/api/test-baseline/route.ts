import { NextResponse } from "next/server";

// メモリ内で各ノードの基準姿勢（キャリブレーションベクトル）をPCとスマホ間で共有
type BaselineData = {
  ax: number;
  ay: number;
  az: number;
  setAt: string;
};

const baselines: Record<string, BaselineData> = {};

export function GET(request: Request) {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node_id");
  if (nodeId) {
    return NextResponse.json({
      node_id: nodeId,
      baseline: baselines[nodeId] ?? null,
    });
  }
  return NextResponse.json({ baselines });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      node_id: string;
      ax: number;
      ay: number;
      az: number;
      setAt?: string;
    };
    if (!body?.node_id) {
      return NextResponse.json({ error: "node_idが必要です" }, { status: 400 });
    }
    const setAt = body.setAt ?? new Date().toLocaleTimeString("ja-JP");
    baselines[body.node_id] = {
      ax: body.ax,
      ay: body.ay,
      az: body.az,
      setAt,
    };
    return NextResponse.json({
      success: true,
      node_id: body.node_id,
      baseline: baselines[body.node_id],
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
  if (nodeId && baselines[nodeId]) {
    delete baselines[nodeId];
    return NextResponse.json({ success: true, deleted: nodeId });
  }
  return NextResponse.json({ success: true });
}
