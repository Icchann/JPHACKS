import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_RESET_CONTENT = 205;
const HTTP_STATUS_NOT_MODIFIED = 304;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_BAD_GATEWAY = 502;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const MUTATION_METHODS: Record<string, true> = {
  POST: true,
  PATCH: true,
  DELETE: true,
};

// LAN公開時に第三者サイトからのCSRFや無認証での台帳改変・削除を防ぐため、変更系リクエストにOrigin検証とトークン検証を課します。
function validateMutationRequest(
  method: string,
  request?: Request,
): NextResponse | null {
  if (!MUTATION_METHODS[method.toUpperCase()]) {
    return null;
  }

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

export async function forwardTestApi(
  path: string,
  request?: Request,
): Promise<NextResponse> {
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

  const method = request?.method ?? "GET";
  const mutationGuardResponse = validateMutationRequest(method, request);
  if (mutationGuardResponse) {
    return mutationGuardResponse;
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? DEFAULT_BACKEND_URL;
  const rawBody =
    method === "GET" || method === "HEAD" || method === "DELETE"
      ? undefined
      : await request?.text();
  const body = rawBody ? rawBody : undefined;

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
    // 204/205/304 はボディを持てないため、テキスト化せず null ボディで返却します。
    if (
      response.status === HTTP_STATUS_NO_CONTENT ||
      response.status === HTTP_STATUS_RESET_CONTENT ||
      response.status === HTTP_STATUS_NOT_MODIFIED
    ) {
      return new NextResponse(null, { status: response.status });
    }
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
          message: "センサーAPIへ接続できません",
        },
      },
      { status: HTTP_STATUS_BAD_GATEWAY },
    );
  }
}
