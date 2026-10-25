"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppSidebar } from "../../../components/ui/app-sidebar";
import {
  Button,
  HealthBadge,
  KpiTile,
  StatusBadge,
} from "../../../components/ui/ui-primitives";
import { Icon } from "../../monitoring/components/icon";
import { DEMO_SENSORS } from "../../monitoring/demo-data";
import {
  formatJapanDateTime,
  OBSERVATION_LABELS,
} from "../../monitoring/monitoring-utils";
import type { DemoSensor, ObservationSeverity } from "../../monitoring/types";
import type { TestSensor, TestSensorListResponse } from "../sensor-api-types";

import styles from "./sensor-management.module.css";

type ManagedSeverity = ObservationSeverity | "unknown";
type ManagedCommunicationStatus = DemoSensor["communicationStatus"] | "unknown";
type ManagedDeviceFaultStatus = DemoSensor["deviceFaultStatus"] | "unknown";

type ManagedSensor = Omit<
  DemoSensor,
  | "observationSeverity"
  | "communicationStatus"
  | "deviceFaultStatus"
  | "lowBattery"
  | "source"
> & {
  observationSeverity: ManagedSeverity;
  communicationStatus: ManagedCommunicationStatus;
  deviceFaultStatus: ManagedDeviceFaultStatus;
  lowBattery: boolean | null;
  source: "demo" | "device_test";
};

type SensorDataMode = "demo" | "test";

type SensorFormValues = {
  sensorCode: string;
  name: string;
  latitude: string;
  longitude: string;
};

type SensorFormErrors = Partial<Record<keyof SensorFormValues, string>>;

type EditorState =
  { mode: "create"; sensorId: null } | { mode: "edit"; sensorId: string };

const SEVERITY_LABELS: Record<ManagedSeverity, string> = {
  ...OBSERVATION_LABELS,
  unknown: "未判定",
};

const COMMUNICATION_LABELS: Record<ManagedCommunicationStatus, string> = {
  online: "オンライン",
  offline: "通信断",
  unknown: "未接続",
};

// 観測重要度と機器状態を混同しないよう、カード内でも別項目として表示します。
const DEVICE_STATUS_LABELS: Record<ManagedDeviceFaultStatus, string> = {
  ok: "正常",
  fault: "故障",
  unknown: "未判定",
};

const EMPTY_FORM: SensorFormValues = {
  sensorCode: "",
  name: "",
  latitude: "",
  longitude: "",
};

function toManagedSensor(sensor: DemoSensor): ManagedSensor {
  return { ...sensor };
}

function fromTestSensor(sensor: TestSensor): ManagedSensor {
  return {
    id: sensor.id,
    sensorCode: sensor.sensor_code,
    name: sensor.name,
    latitude: sensor.latitude,
    longitude: sensor.longitude,
    observationSeverity: sensor.observation_severity,
    communicationStatus: sensor.communication_status,
    deviceFaultStatus: sensor.device_fault_status,
    lowBattery: sensor.low_battery,
    soilMoistureValue: null,
    tiltValue: null,
    batteryPercent: null,
    lastReceivedAt: sensor.last_received_at,
    source: sensor.source,
  };
}

// ID形式は未決定のため必須・重複だけを検証し、独自の形式制約は追加しません。
function validateSensorForm(
  values: SensorFormValues,
  sensors: ManagedSensor[],
  editingSensorId: string | null,
): SensorFormErrors {
  const errors: SensorFormErrors = {};
  const normalizedCode = values.sensorCode.trim().toLocaleLowerCase("ja-JP");
  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);

  if (!values.sensorCode.trim()) {
    errors.sensorCode = "センサーIDを入力してください";
  } else if (
    sensors.some(
      (sensor) =>
        sensor.id !== editingSensorId &&
        sensor.sensorCode.toLocaleLowerCase("ja-JP") === normalizedCode,
    )
  ) {
    errors.sensorCode = "同じセンサーIDが登録されています";
  }

  if (!values.name.trim()) {
    errors.name = "名称を入力してください";
  }

  if (!values.latitude.trim()) {
    errors.latitude = "緯度を入力してください";
  } else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.latitude = "緯度は-90から90の範囲で入力してください";
  }

  if (!values.longitude.trim()) {
    errors.longitude = "経度を入力してください";
  } else if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    errors.longitude = "経度は-180から180の範囲で入力してください";
  }

  return errors;
}

export function SensorManagement({
  dataMode = "demo",
}: {
  dataMode?: SensorDataMode;
}) {
  const [sensors, setSensors] = useState<ManagedSensor[]>(() =>
    dataMode === "demo" ? DEMO_SENSORS.map(toManagedSensor) : [],
  );
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formValues, setFormValues] = useState<SensorFormValues>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<SensorFormErrors>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(dataMode === "test");
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const sensorCodeInputRef = useRef<HTMLInputElement>(null);
  const sensorNameInputRef = useRef<HTMLInputElement>(null);
  const lastEditorTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (dataMode !== "test") {
      return;
    }

    let cancelled = false;
    const loadSensors = async () => {
      setIsLoading(true);
      setApiError(null);
      try {
        const response = await fetch("/api/test-sensors?limit=200", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("センサー一覧を取得できませんでした");
        }
        const body = (await response.json()) as TestSensorListResponse;
        if (!cancelled) {
          setSensors(body.items.map(fromTestSensor));
        }
      } catch {
        if (!cancelled) {
          setApiError("検証用DBへ接続できません。起動状態を確認してください。");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSensors();
    return () => {
      cancelled = true;
    };
  }, [dataMode]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    // ダイアログを開いたら最初の編集可能項目へ移動し、閉じたら起点へ戻します。
    if (editor.mode === "create") {
      sensorCodeInputRef.current?.focus();
    } else {
      sensorNameInputRef.current?.focus();
    }

    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditor(null);
        setFormErrors({});
      }
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      window.removeEventListener("keydown", closeWithEscape);
      lastEditorTriggerRef.current?.focus();
    };
  }, [editor]);

  const filteredSensors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
    if (!normalizedQuery) {
      return sensors;
    }
    return sensors.filter((sensor) =>
      `${sensor.sensorCode} ${sensor.name}`
        .toLocaleLowerCase("ja-JP")
        .includes(normalizedQuery),
    );
  }, [query, sensors]);

  const summary = useMemo(
    () => ({
      total: sensors.length,
      online: sensors.filter(
        (sensor) => sensor.communicationStatus === "online",
      ).length,
      needsAttention: sensors.filter(
        (sensor) =>
          sensor.communicationStatus === "offline" ||
          sensor.deviceFaultStatus === "fault" ||
          sensor.lowBattery === true,
      ).length,
      unobserved: sensors.filter(
        (sensor) => sensor.observationSeverity === "unknown",
      ).length,
    }),
    [sensors],
  );

  const openCreateEditor = (event: ReactMouseEvent<HTMLButtonElement>) => {
    lastEditorTriggerRef.current = event.currentTarget;
    setEditor({ mode: "create", sensorId: null });
    setFormValues(EMPTY_FORM);
    setFormErrors({});
    setStatusMessage(null);
    setApiError(null);
  };

  const openEditEditor = (
    sensor: ManagedSensor,
    trigger: HTMLButtonElement,
  ) => {
    lastEditorTriggerRef.current = trigger;
    setEditor({ mode: "edit", sensorId: sensor.id });
    setFormValues({
      sensorCode: sensor.sensorCode,
      name: sensor.name,
      latitude: sensor.latitude.toString(),
      longitude: sensor.longitude.toString(),
    });
    setFormErrors({});
    setStatusMessage(null);
    setApiError(null);
  };

  const closeEditor = () => {
    setEditor(null);
    setFormErrors({});
  };

  const updateFormValue = (field: keyof SensorFormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  const keepFocusInsideEditor = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    // Tab移動がモーダルの背面へ抜けないよう、操作可能要素の端で循環させます。
    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
      ),
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    if (!firstElement || !lastElement) {
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const saveSensor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) {
      return;
    }

    const errors = validateSensorForm(formValues, sensors, editor.sensorId);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const normalizedValues = {
      sensorCode: formValues.sensorCode.trim(),
      name: formValues.name.trim(),
      latitude: Number(formValues.latitude),
      longitude: Number(formValues.longitude),
    };

    if (dataMode === "test") {
      setIsSaving(true);
      setApiError(null);
      try {
        const isEditing = editor.mode === "edit";
        const endpoint = isEditing
          ? `/api/test-sensors/${encodeURIComponent(editor.sensorId)}`
          : "/api/test-sensors";
        const response = await fetch(endpoint, {
          body: JSON.stringify({
            ...(!isEditing ? { sensor_code: normalizedValues.sensorCode } : {}),
            name: normalizedValues.name,
            latitude: normalizedValues.latitude,
            longitude: normalizedValues.longitude,
          }),
          headers: { "Content-Type": "application/json" },
          method: isEditing ? "PATCH" : "POST",
        });
        if (!response.ok) {
          if (response.status === 409) {
            setFormErrors({
              sensorCode: "同じセンサーIDが登録されています",
            });
            return;
          }
          throw new Error("センサーを保存できませんでした");
        }

        const saved = fromTestSensor((await response.json()) as TestSensor);
        setSensors((current) =>
          isEditing
            ? current.map((sensor) => (sensor.id === saved.id ? saved : sensor))
            : [...current, saved],
        );
        setStatusMessage(
          `${saved.sensorCode}を検証用DBへ${isEditing ? "保存" : "登録"}しました`,
        );
        closeEditor();
      } catch {
        setApiError("検証用DBへ保存できません。接続状態を確認してください。");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (editor.mode === "edit") {
      setSensors((current) =>
        current.map((sensor) =>
          sensor.id === editor.sensorId
            ? { ...sensor, ...normalizedValues }
            : sensor,
        ),
      );
      setStatusMessage(`${normalizedValues.sensorCode}をデモ上で更新しました`);
    } else {
      // 未観測の新規端末を正常とはみなさず、状態はすべて未判定で登録します。
      const newSensor: ManagedSensor = {
        id: `demo-created-${Date.now()}`,
        ...normalizedValues,
        observationSeverity: "unknown",
        communicationStatus: "unknown",
        deviceFaultStatus: "unknown",
        lowBattery: null,
        soilMoistureValue: null,
        tiltValue: null,
        batteryPercent: null,
        lastReceivedAt: null,
        source: "demo",
      };
      setSensors((current) => [...current, newSensor]);
      setStatusMessage(`${normalizedValues.sensorCode}をデモ上で登録しました`);
    }

    closeEditor();
  };

  return (
    <main className={styles.appShell}>
      <AppSidebar
        activePath="/sensors"
        demoDescription={
          dataMode === "test" ? "検証用DBへ保存します" : "変更は保存されません"
        }
        environmentLabel={dataMode === "test" ? "test環境" : "デモモード"}
        inert={Boolean(editor)}
      />

      <section className={styles.workspace} inert={editor ? true : undefined}>
        <header className={styles.topbar}>
          <div className={styles.titleBlock}>
            <p>管理 / センサー</p>
            <div>
              <h1>センサー管理</h1>
              <span className={styles.demoBadge}>
                {dataMode === "test" ? "検証DB" : "デモ"}
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <Button className={styles.secondaryButton} disabled>
              CSV一括登録
              <small>未実装</small>
            </Button>
            <Button variant="primary" onClick={openCreateEditor}>
              <span aria-hidden="true">＋</span>
              センサーを登録
            </Button>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.demoNotice} aria-label="デモ操作の注意">
            <span className={styles.demoPulse} aria-hidden="true" />
            <p>
              {dataMode === "test"
                ? "この画面の登録・編集は検証用DBへ保存され、再起動後も保持されます。"
                : "この画面の登録・編集はデモ表示のみです。再読み込みすると初期状態へ戻ります。"}
            </p>
          </section>

          {apiError ? (
            <div className={styles.statusMessage} role="alert">
              <span aria-hidden="true">!</span>
              {apiError}
            </div>
          ) : null}

          {statusMessage ? (
            <div className={styles.statusMessage} role="status">
              <span aria-hidden="true">✓</span>
              {statusMessage}
              <button
                data-sanmou-button="secondary"
                aria-label="完了メッセージを閉じる"
                type="button"
                onClick={() => setStatusMessage(null)}
              >
                ×
              </button>
            </div>
          ) : null}

          <section className={styles.summaryGrid} aria-label="登録状況">
            <KpiTile label="登録センサー" suffix="台" value={summary.total} />
            <KpiTile
              label="オンライン"
              suffix="台"
              tone="normal"
              value={summary.online}
            />
            <KpiTile
              label="機器要確認"
              suffix="台"
              tone="caution"
              value={summary.needsAttention}
            />
            <KpiTile
              label="未観測"
              suffix="台"
              tone="unknown"
              value={summary.unobserved}
            />
          </section>

          <section
            className={styles.sensorSection}
            aria-labelledby="sensor-list"
          >
            <div className={styles.sensorSectionHeader}>
              <div>
                <p>SENSORS</p>
                <h2 id="sensor-list">センサー一覧</h2>
              </div>
              <label className={styles.searchBox}>
                <Icon name="search" />
                <span className="sr-only">センサーを検索</span>
                <input
                  aria-label="センサーを検索"
                  placeholder="ID・名称で検索"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <button
                    data-sanmou-button="secondary"
                    aria-label="検索をクリア"
                    type="button"
                    onClick={() => setQuery("")}
                  >
                    ×
                  </button>
                ) : null}
              </label>
            </div>

            {isLoading ? (
              <p className={styles.emptyState}>検証用DBから読み込んでいます</p>
            ) : filteredSensors.length > 0 ? (
              <ul className={styles.sensorGrid} aria-label="センサー一覧">
                {filteredSensors.map((sensor) => (
                  <li className={styles.sensorCard} key={sensor.id}>
                    <header className={styles.cardHeader}>
                      <div className={styles.sensorIdentity}>
                        <strong>{sensor.sensorCode}</strong>
                        <span>{sensor.name}</span>
                      </div>
                    </header>

                    <div className={styles.cardStates}>
                      <div>
                        <span>重要度</span>
                        <StatusBadge
                          label={SEVERITY_LABELS[sensor.observationSeverity]}
                          status={sensor.observationSeverity}
                        />
                      </div>
                      <div>
                        <span>通信</span>
                        <HealthBadge
                          label={
                            COMMUNICATION_LABELS[sensor.communicationStatus]
                          }
                          status={sensor.communicationStatus}
                        />
                      </div>
                      <div>
                        <span>機器</span>
                        <HealthBadge
                          label={DEVICE_STATUS_LABELS[sensor.deviceFaultStatus]}
                          status={sensor.deviceFaultStatus}
                        />
                      </div>
                      <div>
                        <span>電池</span>
                        <strong className={styles.batteryValue}>
                          {sensor.batteryPercent === null
                            ? "未取得"
                            : `${sensor.batteryPercent}%`}
                        </strong>
                        {sensor.lowBattery === true ? (
                          <HealthBadge label="低電池" status="lowBattery" />
                        ) : null}
                      </div>
                    </div>

                    <dl className={styles.cardDetails}>
                      <div>
                        <dt>設置位置</dt>
                        <dd>
                          {sensor.latitude.toFixed(6)},{" "}
                          {sensor.longitude.toFixed(6)}
                        </dd>
                      </div>
                      <div>
                        <dt>最終受信</dt>
                        <dd>
                          {sensor.lastReceivedAt ? (
                            <time dateTime={sensor.lastReceivedAt}>
                              {formatJapanDateTime(sensor.lastReceivedAt)}
                            </time>
                          ) : (
                            <span className={styles.unsetValue}>未受信</span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <footer className={styles.cardActions}>
                      {/* 画面内だけで追加した未観測センサーは詳細URLを持たせません。 */}
                      {sensor.observationSeverity === "unknown" ? (
                        <Button
                          aria-label={`${sensor.sensorCode}の状態は未取得`}
                          disabled
                          variant="ghost"
                        >
                          状態未取得
                        </Button>
                      ) : (
                        <Link
                          aria-label={`${sensor.sensorCode}の状態を確認`}
                          data-sanmou-button="secondary"
                          className={styles.detailLink}
                          href={`/sensors/${encodeURIComponent(sensor.id)}?from=sensors`}
                        >
                          状態を確認
                        </Link>
                      )}
                      <Button
                        aria-label={`${sensor.sensorCode}を編集`}
                        variant="ghost"
                        onClick={(event) =>
                          openEditEditor(sensor, event.currentTarget)
                        }
                      >
                        編集
                      </Button>
                    </footer>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyState}>該当するセンサーはありません</p>
            )}

            <footer className={styles.sensorSectionFooter}>
              <span>{filteredSensors.length}件を表示</span>
              <span>論理削除は後続フェーズで実装</span>
            </footer>
          </section>
        </div>
      </section>

      {editor ? (
        <div className={styles.modalBackdrop}>
          <section
            aria-labelledby="sensor-editor-title"
            aria-modal="true"
            className={styles.modal}
            ref={dialogRef}
            role="dialog"
            onKeyDown={keepFocusInsideEditor}
          >
            <header>
              <div>
                <p>{editor.mode === "create" ? "NEW SENSOR" : "EDIT SENSOR"}</p>
                <h2 id="sensor-editor-title">
                  {editor.mode === "create"
                    ? "センサーを登録"
                    : "センサーを編集"}
                </h2>
              </div>
              <button
                data-sanmou-button="secondary"
                aria-label="編集画面を閉じる"
                type="button"
                onClick={closeEditor}
              >
                ×
              </button>
            </header>

            <form noValidate onSubmit={saveSensor}>
              <label>
                <span>
                  センサーID <b>必須</b>
                </span>
                <input
                  aria-describedby={
                    formErrors.sensorCode ? "sensor-code-error" : undefined
                  }
                  aria-invalid={Boolean(formErrors.sensorCode)}
                  disabled={editor.mode === "edit"}
                  maxLength={80}
                  placeholder="例: DEMO-007"
                  ref={sensorCodeInputRef}
                  value={formValues.sensorCode}
                  onChange={(event) =>
                    updateFormValue("sensorCode", event.target.value)
                  }
                />
                {formErrors.sensorCode ? (
                  <small id="sensor-code-error">{formErrors.sensorCode}</small>
                ) : null}
              </label>

              <label>
                <span>
                  名称 <b>必須</b>
                </span>
                <input
                  aria-describedby={
                    formErrors.name ? "sensor-name-error" : undefined
                  }
                  aria-invalid={Boolean(formErrors.name)}
                  maxLength={120}
                  placeholder="例: 北沢 下流"
                  ref={sensorNameInputRef}
                  value={formValues.name}
                  onChange={(event) =>
                    updateFormValue("name", event.target.value)
                  }
                />
                {formErrors.name ? (
                  <small id="sensor-name-error">{formErrors.name}</small>
                ) : null}
              </label>

              <div className={styles.coordinateFields}>
                <label>
                  <span>
                    緯度 <b>必須</b>
                  </span>
                  <input
                    aria-describedby={
                      formErrors.latitude ? "latitude-error" : undefined
                    }
                    aria-invalid={Boolean(formErrors.latitude)}
                    inputMode="decimal"
                    placeholder="35.000000"
                    step="any"
                    type="number"
                    value={formValues.latitude}
                    onChange={(event) =>
                      updateFormValue("latitude", event.target.value)
                    }
                  />
                  {formErrors.latitude ? (
                    <small id="latitude-error">{formErrors.latitude}</small>
                  ) : null}
                </label>
                <label>
                  <span>
                    経度 <b>必須</b>
                  </span>
                  <input
                    aria-describedby={
                      formErrors.longitude ? "longitude-error" : undefined
                    }
                    aria-invalid={Boolean(formErrors.longitude)}
                    inputMode="decimal"
                    placeholder="137.000000"
                    step="any"
                    type="number"
                    value={formValues.longitude}
                    onChange={(event) =>
                      updateFormValue("longitude", event.target.value)
                    }
                  />
                  {formErrors.longitude ? (
                    <small id="longitude-error">{formErrors.longitude}</small>
                  ) : null}
                </label>
              </div>

              <label>
                <span>通信識別子</span>
                <input
                  disabled
                  placeholder="実機仕様の確定後に対応"
                  value=""
                  readOnly
                />
              </label>

              <p className={styles.formNote}>
                登録・編集内容はデモ表示だけに反映され、APIやDBには保存されません。
              </p>

              <footer>
                <Button variant="secondary" onClick={closeEditor}>
                  キャンセル
                </Button>
                <Button disabled={isSaving} type="submit" variant="primary">
                  {isSaving
                    ? "保存中"
                    : editor.mode === "create"
                      ? "登録する"
                      : "変更を保存"}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
