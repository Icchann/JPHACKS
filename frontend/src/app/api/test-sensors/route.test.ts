import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

describe("test sensors proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("dev環境ではルートを公開しない", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "dev");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      new Request("http://localhost/api/test-sensors"),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test環境の登録内容とトークンをFastAPIへ中継する", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "test");
    vi.stubEnv("SANMOU_TEST_API_TOKEN", "temporary-token");
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://127.0.0.1:8011");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"id":"sensor-id"}', {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const request = new Request("http://localhost/api/test-sensors", {
      body: JSON.stringify({ sensor_code: "T1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await POST(request);

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8011/sensors", {
      body: '{"sensor_code":"T1"}',
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Token": "temporary-token",
      },
      method: "POST",
    });
    expect(response.status).toBe(201);
  });
});
