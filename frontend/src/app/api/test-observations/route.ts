import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const DEFAULT_OBSERVATION_LIMIT = "500";
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_BAD_GATEWAY = 502;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

export const dynamic = "force-dynamic";

// LAN公開時に第三者サイトからのCSRFや無認証での観測履歴削除を防ぐため、DELETEにOrigin検証とトークン検証を課します。
function validateDeleteRequest(request?: Request): NextResponse | null {
  const originHeader = request?.headers.get("origin");
  if (originHeader && request?.url) {
    try {
      const requestHost = new URL(request.url).host;
      const originHost = new URL(originHeader).host;
      if (requestHost !== originHost) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN_ORIGIN",
              message: "異なるオリジンからの変更リクエストは許可されていません",
            },
          },
          { status: HTTP_STATUS_FORBIDDEN },
        );
      }
    } catch {
      // 不正なOriginヘッダー形式もCross-Origin攻撃の可能性があるため安全側で拒否します。
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_ORIGIN",
            message: "オリジンヘッダーの形式が不正です",
          },
        },
        { status: HTTP_STATUS_FORBIDDEN },
      );
    }
  }

  const expectedOperatorToken = process.env.SANMOU_OPERATOR_TOKEN?.trim();
  if (expectedOperatorToken) {
    const headerToken = request?.headers.get("x-sanmou-operator-token")?.trim();
    const queryToken = request?.url
      ? new URL(request.url).searchParams.get("operator_token")?.trim()
      : undefined;
    const providedToken = headerToken || queryToken;
    if (providedToken !== expectedOperatorToken) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED_OPERATOR",
            message: "管理操作トークンが無効または不足しています",
          },
        },
        { status: HTTP_STATUS_UNAUTHORIZED },
      );
    }
  }

  return null;
}

export async function GET(request?: Request) {
  if (process.env.SANMOU_APP_ENV !== "test") {
    return new NextResponse(null, { status: HTTP_STATUS_NOT_FOUND });
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
      { status: HTTP_STATUS_SERVICE_UNAVAILABLE },
    );
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? DEFAULT_BACKEND_URL;

  const params = new URLSearchParams();
  let limit = DEFAULT_OBSERVATION_LIMIT;
  if (request?.url) {
    const requestUrl = new URL(request.url);
    const requestedLimit = requestUrl.searchParams.get("limit");
    const requestedNodeId = requestUrl.searchParams.get("node_id");
    if (requestedLimit) {
      limit = requestedLimit;
    }
    params.set("limit", limit);
    if (requestedNodeId) {
      params.set("node_id", requestedNodeId);
    }
  } else {
    params.set("limit", limit);
  }

  try {
    // 実証用トークンはサーバー間だけで渡し、ブラウザーへ公開しません。
    const response = await fetch(
      `${backendUrl}/test/observations?${params.toString()}`,
      {
        cache: "no-store",
        headers: { "X-Test-Token": testToken },
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    // FastAPI未起動や通信断の際も内部例外を漏らさず、画面側で扱える502 JSONへ変換します。
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "観測APIへ接続できません",
        },
      },
      { status: HTTP_STATUS_BAD_GATEWAY },
    );
  }
}

export async function DELETE(request?: Request) {
  if (process.env.SANMOU_APP_ENV !== "test") {
    return new NextResponse(null, { status: HTTP_STATUS_NOT_FOUND });
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
      { status: HTTP_STATUS_SERVICE_UNAVAILABLE },
    );
  }

  const deleteGuardResponse = validateDeleteRequest(request);
  if (deleteGuardResponse) {
    return deleteGuardResponse;
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? DEFAULT_BACKEND_URL;

  try {
    const response = await fetch(`${backendUrl}/test/observations`, {
      method: "DELETE",
      headers: { "X-Test-Token": testToken },
    });
    return new NextResponse(null, { status: response.status });
  } catch {
    // FastAPI未起動や通信断の際も内部例外を漏らさず、画面側で扱える502 JSONへ変換します。
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "観測APIへ接続できません",
        },
      },
      { status: HTTP_STATUS_BAD_GATEWAY },
    );
  }
}
