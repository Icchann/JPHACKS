import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/test-installations/confirm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("test環境でFastAPIへリクエストを中継しレスポンスを返すこと", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "test");
    vi.stubEnv("SANMOU_TEST_API_TOKEN", "temporary-token");
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://127.0.0.1:8000");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "confirmed",
          request_id: "test-req",
          node_id: "T1",
          installation_id: "inst-01",
          capture_id: "cap-01",
          confirmed_at: "2026-10-29T10:00:00Z",
          message: "確定しました",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const req = new Request(
      "http://localhost:3000/api/test-installations/confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: "test-req" }),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("confirmed");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/installations/confirm",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
