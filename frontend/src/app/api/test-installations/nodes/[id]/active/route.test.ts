import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/test-installations/nodes/[id]/active", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("test環境でFastAPIへ機体のアクティブ設置取得リクエストを中継すること", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "test");
    vi.stubEnv("SANMOU_TEST_API_TOKEN", "temporary-token");
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://127.0.0.1:8000");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          node_id: "T1",
          installation_id: "inst_T1_live",
          version: 2,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const req = new Request(
      "http://localhost:3000/api/test-installations/nodes/T1/active",
    );
    const params = Promise.resolve({ id: "T1" });

    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.node_id).toBe("T1");
    expect(data.version).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/installations/nodes/T1/active",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
