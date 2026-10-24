import Link from "next/link";
import React from "react";

import { Icon } from "../../features/monitoring/components/icon";
import type { BreadcrumbItem } from "../../features/monitoring/types";

import styles from "./breadcrumbs.module.css";

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

// 複数山林・工区の階層関係を現場作業員が一目で把握できるようにします。
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="パンくずリスト"
      className={`${styles.nav} ${className ?? ""}`.trim()}
    >
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1 || item.current;

          return (
            <li className={styles.item} key={`${item.label}-${index}`}>
              {index > 0 && (
                <span aria-hidden="true" className={styles.separator}>
                  <Icon name="chevron" className={styles.separatorIcon} />
                </span>
              )}
              {isLast ? (
                <span aria-current="page" className={styles.current}>
                  {item.label}
                </span>
              ) : item.href ? (
                <Link className={styles.link} href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span className={styles.text}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
