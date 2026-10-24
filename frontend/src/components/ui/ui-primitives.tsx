import type { ButtonHTMLAttributes } from "react";

import styles from "./ui-primitives.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

type MainStatus = "normal" | "caution" | "danger" | "unknown";
type HealthStatus =
  "online" | "offline" | "ok" | "fault" | "lowBattery" | "unknown";

type StatusBadgeProps = {
  status: MainStatus;
  label: string;
};

type HealthBadgeProps = {
  status: HealthStatus;
  label: string;
};

type KpiTone = MainStatus | "brand" | "offline";

type KpiTileProps = {
  label: string;
  value: number | string | null;
  suffix?: string;
  tone?: KpiTone;
};

const STATUS_SYMBOLS: Record<MainStatus, string> = {
  normal: "✓",
  caution: "!",
  danger: "!",
  unknown: "?",
};

const HEALTH_SYMBOLS: Record<HealthStatus, string> = {
  online: "●",
  offline: "×",
  ok: "✓",
  fault: "!",
  lowBattery: "!",
  unknown: "?",
};

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

// 操作の優先度をvariantで表し、画面ごとのボタン表現を統一します。
export function Button({
  className,
  variant = "secondary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes(styles.button, styles[variant], className)}
      type={type}
      {...props}
    />
  );
}

// 主状態はヘルス情報と別部品にして、状態の意味を混在させません。
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={styles.badge} data-status={status}>
      <span aria-hidden="true">{STATUS_SYMBOLS[status]}</span>
      {label}
    </span>
  );
}

export function HealthBadge({ status, label }: HealthBadgeProps) {
  return (
    <span className={styles.healthBadge} data-status={status}>
      <span aria-hidden="true">{HEALTH_SYMBOLS[status]}</span>
      {label}
    </span>
  );
}

// nullは0件と区別し、未取得を示す記号として表示します。
export function KpiTile({
  label,
  value,
  suffix,
  tone = "brand",
}: KpiTileProps) {
  const isUnknown = value === null;

  return (
    <article className={styles.kpiTile} data-tone={tone}>
      <span>{label}</span>
      <div>
        <strong>{isUnknown ? "—" : value}</strong>
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </article>
  );
}

export type { HealthStatus, KpiTone, MainStatus };
