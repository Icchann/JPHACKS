"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  status: "ok";
  service: string;
};

export function ApiHealthStatus() {
  const [message, setMessage] = useState("API 接続確認中");

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch("/api/backend/health", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const health = (await response.json()) as HealthResponse;
        setMessage(health.status === "ok" ? "API 接続済み" : "API 応答異常");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMessage("API に接続できません");
        }
      }
    }

    void checkHealth();

    return () => controller.abort();
  }, []);

  return <p role="status">{message}</p>;
}
