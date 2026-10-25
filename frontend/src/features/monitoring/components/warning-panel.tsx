import { HealthBadge, StatusBadge } from "../../../components/ui/ui-primitives";
import {
  ALERT_LABELS,
  CATEGORY_LABELS,
  formatJapanDateTime,
  formatMeasuredValue,
  sortAlerts,
} from "../monitoring-utils";
import type { DemoAlert } from "../types";
import { Icon } from "./icon";
import styles from "./monitoring-home.module.css";

type WarningPanelProps = {
  alerts: DemoAlert[];
  refreshedAt: string;
  selectedSensorId: string | null;
  onFocusSensor: (sensorId: string) => void;
  onTriggerTestAlert?: () => void;
};

export function WarningPanel({
  alerts,
  refreshedAt,
  selectedSensorId,
  onFocusSensor,
  onTriggerTestAlert,
}: WarningPanelProps) {
  const sortedAlerts = sortAlerts(alerts);

  return (
    <aside className={styles.warningPanel} aria-label="警告パネル">
      <header className={styles.warningHeader}>
        <div>
          <p>ACTIVE ALERTS</p>
          <h2>警告</h2>
          <time dateTime={refreshedAt}>
            更新 {formatJapanDateTime(refreshedAt)}
          </time>
        </div>
        <span className={styles.alertCount}>{alerts.length}</span>
      </header>
      {onTriggerTestAlert && (
        <button
          type="button"
          className={styles.triggerAlertDemoBtn}
          onClick={onTriggerTestAlert}
        >
          ⚠️ PC警報テスト発火（実演用）
        </button>
      )}

      <div className={styles.warningList}>
        {sortedAlerts.length > 0 ? (
          sortedAlerts.map((alert) => (
            <button
              className={styles.warningCard}
              aria-pressed={selectedSensorId === alert.sensorId}
              data-selected={selectedSensorId === alert.sensorId}
              data-severity={alert.severity}
              key={alert.id}
              type="button"
              onClick={() => onFocusSensor(alert.sensorId)}
            >
              <span className={styles.warningCardTopline}>
                {alert.severity === "status" ? (
                  <HealthBadge
                    label={ALERT_LABELS[alert.severity]}
                    status="lowBattery"
                    lampTone="silver"
                  />
                ) : (
                  <StatusBadge
                    label={ALERT_LABELS[alert.severity]}
                    status={alert.severity}
                  />
                )}
                <time dateTime={alert.startedAt}>
                  {formatJapanDateTime(alert.startedAt)}
                </time>
              </span>
              <strong>{CATEGORY_LABELS[alert.category]}</strong>
              <span className={styles.sensorIdentity}>
                {alert.sensorCode} · {alert.sensorName}
              </span>
              <span className={styles.measuredValue}>
                実測値 {formatMeasuredValue(alert.measuredValue, alert.unit)}
              </span>
              <span className={styles.focusAction}>
                <span className={styles.activeState}>進行中</span>
                地図で確認
                <Icon name="chevron" />
              </span>
            </button>
          ))
        ) : (
          <p className={styles.emptyState}>現在の警告はありません</p>
        )}
      </div>

      <footer className={styles.warningFooter}>
        <Icon name="alert" />
        <p>警報は参考情報です。現地の安全を保証するものではありません。</p>
      </footer>
    </aside>
  );
}
