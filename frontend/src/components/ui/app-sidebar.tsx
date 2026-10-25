import Image from "next/image";
import Link from "next/link";

import { Icon } from "../../features/monitoring/components/icon";

import styles from "./app-sidebar.module.css";

const NAV_ITEMS = [
  { label: "地図", icon: "map" as const, href: "/map" },
  { label: "ダッシュボード", icon: "trend" as const, href: "/dashboard" },
  { label: "センサー管理", icon: "sensor" as const, href: "/sensors" },
];

type AppSidebarProps = {
  activePath: "/map" | "/dashboard" | "/sensors";
  demoDescription: string;
  environmentLabel?: string;
  inert?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
};

// 全画面で現在地と未実装項目の伝わり方を統一し、林業現場の画面領域確保のための開閉に対応します。
export function AppSidebar({
  activePath,
  demoDescription,
  environmentLabel = "デモモード",
  inert = false,
  isOpen = true,
  onToggle,
}: AppSidebarProps) {
  return (
    <header
      className={`${styles.appHeader} ${!isOpen ? styles.collapsed : ""}`.trim()}
      inert={inert || undefined}
    >
      <div className={styles.brandRow}>
        {onToggle && (
          <button
            data-sanmou-button="secondary"
            aria-expanded={isOpen}
            aria-label={
              isOpen ? "ナビゲーションを折りたたむ" : "ナビゲーションを展開する"
            }
            className={styles.toggleButton}
            onClick={onToggle}
            type="button"
          >
            <Icon name={isOpen ? "close" : "menu"} />
          </button>
        )}
        <Link
          aria-label="山網の地図画面へ"
          className={styles.brand}
          href="/map"
        >
          <span className={styles.brandMark}>
            <Image
              src="/sanmou-logo.png"
              alt=""
              width={44}
              height={44}
              unoptimized
            />
          </span>
          <div className={styles.brandText}>
            <strong>山網</strong>
            <span>SANMOU</span>
          </div>
        </Link>
      </div>

      <nav className={styles.navigation} aria-label="主要画面">
        {NAV_ITEMS.map((item) => (
          <Link
            aria-current={item.href === activePath ? "page" : undefined}
            className={styles.navItem}
            href={item.href}
            key={item.label}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className={styles.environmentStatus}>
        <span className={styles.demoPulse} aria-hidden="true" />
        <div>
          <strong>{environmentLabel}</strong>
          <span>{demoDescription}</span>
        </div>
      </div>
    </header>
  );
}

// ヘッダーやツールバーからサイドバー/ナビゲーションを開閉するための独立トグルボタン
export function SidebarToggleButton({
  isOpen,
  onClick,
  className,
}: {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      data-sanmou-button="secondary"
      aria-expanded={isOpen}
      aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
      className={`${styles.toggleButton} ${className ?? ""}`.trim()}
      onClick={onClick}
      type="button"
    >
      <Icon name={isOpen ? "close" : "menu"} />
    </button>
  );
}
