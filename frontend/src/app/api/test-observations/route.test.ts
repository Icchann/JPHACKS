import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("test observations proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("dev環境ではルートを公開しない", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "dev");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET();

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test環境ではトークンをブラウザーに公開せずFastAPIへ付与する", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "test");
    vi.stubEnv("SANMOU_TEST_API_TOKEN", "temporary-token");
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://127.0.0.1:8011");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"source":"device_test"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/test/observations?limit=500",
      {
        cache: "no-store",
        headers: { "X-Test-Token": "temporary-token" },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: "device_test" });
  });

  it("node_idとlimitのクエリパラメータをFastAPIへ転送する", async () => {
    vi.stubEnv("SANMOU_APP_ENV", "test");
    vi.stubEnv("SANMOU_TEST_API_TOKEN", "temporary-token");
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://127.0.0.1:8011");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"items":[]}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(
      new Request(
        "http://localhost/api/test-observations?node_id=T2&limit=100",
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/test/observations?limit=100&node_id=T2",
      {
        cache: "no-store",
        headers: { "X-Test-Token": "temporary-token" },
      },
    );
    expect(response.status).toBe(200);
  });
});
