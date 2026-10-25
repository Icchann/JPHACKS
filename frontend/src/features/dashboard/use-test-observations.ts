"use client";

import { useCallback, useEffect, useState } from "react";

import type { TestObservationResponse } from "./test-observation-types";

const REFRESH_INTERVAL_MS = 3_000;

type TestObservationState = {
  data: TestObservationResponse | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export function useTestObservations(): TestObservationState {
  const [data, setData] = useState<TestObservationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/test-observations", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`観測APIが応答しませんでした（${response.status}）`);
      }
      const nextData = (await response.json()) as TestObservationResponse;
      // 長期開きっぱなし稼働でのメモリ肥大化を防ぐため、最新500件のスライディングウィンドウで上限固定
      const cappedItems = Array.isArray(nextData.items)
        ? nextData.items.slice(-500)
        : [];
      setData({ ...nextData, items: cappedItems });
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "観測データを取得できませんでした",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初回取得もタイマー経由にし、購読開始とReactの描画を分離します。
    const initialTimerId = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timerId = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialTimerId);
      window.clearInterval(timerId);
    };
  }, [refresh]);

  return { data, error, isLoading, refresh };
}
