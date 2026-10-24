"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createDemoSnapshot } from "./demo-data";
import { findNewAlerts } from "./monitoring-utils";
import type { DemoAlert, MonitoringSnapshot } from "./types";

export const MONITORING_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_REFRESHED_AT = new Date("2026-10-12T00:00:00.000Z");

export function useDemoMonitoring(): {
  snapshot: MonitoringSnapshot;
  newAlerts: DemoAlert[];
  dismissNewAlerts: () => void;
} {
  const [snapshot, setSnapshot] = useState(() =>
    createDemoSnapshot(INITIAL_REFRESHED_AT),
  );
  const [newAlerts, setNewAlerts] = useState<DemoAlert[]>([]);
  const previousAlertsRef = useRef(snapshot.alerts);

  useEffect(() => {
    const refresh = () => {
      const nextSnapshot = createDemoSnapshot();
      const additions = findNewAlerts(
        previousAlertsRef.current,
        nextSnapshot.alerts,
      );
      previousAlertsRef.current = nextSnapshot.alerts;
      setSnapshot(nextSnapshot);

      if (additions.length > 0) {
        setNewAlerts(additions);
      }
    };

    refresh();
    const intervalId = window.setInterval(
      refresh,
      MONITORING_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  const dismissNewAlerts = useCallback(() => setNewAlerts([]), []);

  return {
    snapshot,
    newAlerts,
    dismissNewAlerts,
  };
}
