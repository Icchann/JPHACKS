"use client";

import { useCallback, useEffect, useState } from "react";

import type { TestObservationResponse } from "./test-observation-types";

const REFRESH_INTERVAL_MS = 3_000;

export type UseTestObservationsResult = {
  data: TestObservationResponse | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export function useTestObservations(enabled = true): UseTestObservationsResult {
  const [data, setData] = useState<TestObservationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/test-observations", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`観測APIが応答しませんでした（${response.status}）`);
      }
      const nextData = (await response.json()) as TestObservationResponse;
      // 長期稼働でのメモリ肥大化を防ぎつつ、低頻度送信ノードが500件制限で消失しないよう各ノードの最新レコードを保持する
      const incomingItems = Array.isArray(nextData.items) ? nextData.items : [];
      setData((prev) => {
        if (incomingItems.length === 0) {
          return { ...nextData, items: [] };
        }
        const cappedItems = incomingItems.slice(-500);
        const presentNodeIds = new Set(cappedItems.map((item) => item.node_id));
        const preservedFromPrev = (prev?.items ?? []).filter(
          (item) => !presentNodeIds.has(item.node_id),
        );
        return {
          ...nextData,
          items: [...preservedFromPrev.slice(-50), ...cappedItems],
        };
      });
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
    if (!enabled) {
      return;
    }
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
  }, [enabled, refresh]);

  return { data, error, isLoading: enabled ? isLoading : false, refresh };
}
