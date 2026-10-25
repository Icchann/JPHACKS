import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    // 実証用トークンはサーバー間だけで渡し、ブラウザーへ公開しません。
    const response = await fetch(`${backendUrl}/test/observations?limit=500`, {
      cache: "no-store",
      headers: { "X-Test-Token": testToken },
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
          message: "観測APIへ接続できません",
        },
      },
      { status: 502 },
    );
  }
}

export async function DELETE() {
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

  try {
    const response = await fetch(`${backendUrl}/test/observations`, {
      method: "DELETE",
      headers: { "X-Test-Token": testToken },
    });
    return new NextResponse(null, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "観測APIへ接続できません",
        },
      },
      { status: 502 },
    );
  }
}
