import { NextResponse } from "next/server";

export async function forwardTestApi(
  path: string,
  request?: Request,
): Promise<NextResponse> {
  if (process.env.SANMOU_APP_ENV !== "test") {
    return new NextResponse(null, { status: 404 });
  }

  const testToken = process.env.SANMOU_TEST_API_TOKEN;
  if (!testToken) {
    return NextResponse.json(
      {
        error: {
          code: "TEST_CONFIG_ERROR",
          message: "test環境の設定が不足しています",
        },
      },
      { status: 503 },
    );
  }

  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";
  const method = request?.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request?.text();

  try {
    // 検証用管理トークンはNext.jsからFastAPIへだけ渡し、ブラウザーへ公開しません。
    const response = await fetch(`${backendUrl}${path}`, {
      body,
      cache: "no-store",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Test-Token": testToken,
      },
      method,
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "センサーAPIへ接続できません",
        },
      },
      { status: 502 },
    );
  }
}
