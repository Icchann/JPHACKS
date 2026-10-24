import React from "react";

import type { LayerVisibility, MapLayerId, MapPresetMode } from "../types";
import { Icon } from "./icon";
import styles from "./layer-controller.module.css";

type LayerControllerProps = {
  layerStates: Record<MapLayerId, LayerVisibility>;
  onLayerChange: (layerId: MapLayerId, visibility: LayerVisibility) => void;
  activePreset: MapPresetMode;
  onPresetChange: (preset: MapPresetMode) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  className?: string;
};

type LayerConfig = {
  id: MapLayerId;
  label: string;
  iconName: string;
  description: string;
};

const LAYER_CONFIGS: LayerConfig[] = [
  {
    id: "sensor",
    label: "センサー監視",
    iconName: "🌲",
    description: "樹木ノード・斜面ノード・異常警告ピン",
  },
  {
    id: "boundary",
    label: "私有地・境界線",
    iconName: "🚷",
    description: "越境伐採防止の境界線・保安林指定地域",
  },
  {
    id: "rest_point",
    label: "休憩・詰所・水場",
    iconName: "☕",
    description: "避難小屋・土場休憩所・現場水場",
  },
  {
    id: "route_track",
    label: "作業道の轍・獣道",
    iconName: "🚜",
    description: "重機・軽トラ通行可能ルート、シカ・イノシシ道",
  },
  {
    id: "wildlife_hazard",
    label: "危険生物生息域",
    iconName: "⚠️",
    description: "スズメバチ営巣地・マムシ・クマ出没注意地点",
  },
  {
    id: "geology_risk",
    label: "地質・崩落注意帯",
    iconName: "🪨",
    description: "断層破砕帯・過去の崩壊履歴エリア",
  },
];

const PRESETS: Array<{ id: MapPresetMode; label: string; icon: string }> = [
  { id: "disaster", label: "災害監視", icon: "⚡" },
  { id: "planning", label: "作業計画", icon: "📋" },
  { id: "safety", label: "安全警戒", icon: "⚠️" },
  { id: "all", label: "全表示", icon: "🌐" },
];

// 現場の情報過多を防ぎ、利用目的に応じて表示を薄く・非表示に切り替えられるようにします。
export function LayerController({
  layerStates,
  onLayerChange,
  activePreset,
  onPresetChange,
  isOpen,
  onToggleOpen,
  className,
}: LayerControllerProps) {
  return (
    <div className={`${styles.container} ${className ?? ""}`.trim()}>
      <button
        aria-expanded={isOpen}
        aria-label="地図の表示レイヤーを切り替える"
        className={styles.triggerButton}
        onClick={onToggleOpen}
        type="button"
      >
        <Icon name="layers" className={styles.triggerIcon} />
        <span className={styles.triggerLabel}>表示レイヤー</span>
        <span className={styles.presetBadge}>
          {PRESETS.find((p) => p.id === activePreset)?.label ?? "カスタム"}
        </span>
      </button>

      {isOpen && (
        <section aria-label="地図レイヤー設定パネル" className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>表示レイヤー制御</h3>
              <p className={styles.panelSubtitle}>
                林業現場の目的に応じて不要な情報を薄く・非表示にします
              </p>
            </div>
            <button
              aria-label="パネルを閉じる"
              className={styles.closeButton}
              onClick={onToggleOpen}
              type="button"
            >
              <Icon name="close" />
            </button>
          </header>

          <div className={styles.presetSection}>
            <span className={styles.sectionLabel}>クイックプリセット:</span>
            <div className={styles.presetButtons}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`${styles.presetButton} ${
                    activePreset === preset.id ? styles.activePreset : ""
                  }`}
                  onClick={() => onPresetChange(preset.id)}
                  type="button"
                >
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.layerList}>
            {LAYER_CONFIGS.map((layer) => {
              const currentVisibility = layerStates[layer.id] ?? "visible";

              return (
                <div key={layer.id} className={styles.layerRow}>
                  <div className={styles.layerInfo}>
                    <span className={styles.layerIcon} aria-hidden="true">
                      {layer.iconName}
                    </span>
                    <div>
                      <strong className={styles.layerLabel}>
                        {layer.label}
                      </strong>
                      <p className={styles.layerDescription}>
                        {layer.description}
                      </p>
                    </div>
                  </div>

                  <div
                    aria-label={`${layer.label}の表示状態`}
                    className={styles.visibilityToggle}
                    role="group"
                  >
                    <button
                      aria-pressed={currentVisibility === "visible"}
                      className={`${styles.toggleOpt} ${
                        currentVisibility === "visible" ? styles.activeOpt : ""
                      }`}
                      onClick={() => onLayerChange(layer.id, "visible")}
                      title="100%表示"
                      type="button"
                    >
                      表示
                    </button>
                    <button
                      aria-pressed={currentVisibility === "faded"}
                      className={`${styles.toggleOpt} ${
                        currentVisibility === "faded" ? styles.activeOpt : ""
                      }`}
                      onClick={() => onLayerChange(layer.id, "faded")}
                      title="30%透過で薄く表示"
                      type="button"
                    >
                      薄く
                    </button>
                    <button
                      aria-pressed={currentVisibility === "hidden"}
                      className={`${styles.toggleOpt} ${
                        currentVisibility === "hidden" ? styles.activeOpt : ""
                      }`}
                      onClick={() => onLayerChange(layer.id, "hidden")}
                      title="非表示"
                      type="button"
                    >
                      消す
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
