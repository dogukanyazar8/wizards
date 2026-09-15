"use client";

import React, { useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { MicLevelSessionContext } from "@/hooks/use-mic-level";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import { SettingToggle } from "@/components/settings/rows/setting-toggle";
import { SelfMonitorSession, type SelfMonitorStatus } from "@/lib/voice/self-monitor";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { useVoiceStore } from "@/store/voice-store";

const idle = (): SelfMonitorStatus => "idle";
const inactive = () => false;

export function SelfMonitorRow({ divider }: { readonly divider: boolean }) {
  const { t } = useI18n();
  const preferences = useVoiceStore((state) => state.audioPreferences);
  const micTest = useContext(MicLevelSessionContext);
  const [session] = useState(() => new SelfMonitorSession());
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<SelfMonitorStatus | null>(null);
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, idle);
  const subscribeTest = useCallback(
    (listener: () => void) => micTest?.subscribe(listener) ?? (() => {}),
    [micTest],
  );
  // Subscribe to status only; meter samples must not rerender the whole audio tab.
  const readTestActive = useCallback(
    () => micTest?.getSnapshot().status === "listening",
    [micTest],
  );
  const testActive = useSyncExternalStore(subscribeTest, readTestActive, inactive);

  useEffect(
    () =>
      subscribeTest(() => {
        if (!readTestActive()) {
          // Stop playback immediately, including capture requests still awaiting permission.
          session.stop();
          setEnabled(false);
          setError(null);
        }
      }),
    [readTestActive, session, subscribeTest],
  );

  useEffect(
    () =>
      session.subscribe(() => {
        const next = session.getSnapshot();
        if (next !== "idle" && next !== "starting" && next !== "listening") {
          setError(next);
          setEnabled(false);
        }
      }),
    [session],
  );

  useEffect(() => {
    if (enabled && testActive) void session.start(preferences);
    return () => session.stop();
  }, [enabled, preferences, session, testActive]);

  return (
    <SettingsRow
      rowKey="i4"
      divider={divider}
      title={t("settings.row.i4.title")}
      description={t("settings.row.i4.description")}
      control={(ids) => (
        <SettingToggle
          {...ids}
          checked={enabled && testActive}
          disabled={!testActive}
          onChange={(next) => {
            setError(null);
            setEnabled(next);
          }}
          testId="setting-toggle-i4"
        />
      )}
      below={
        error || status === "starting" || status === "listening" ? (
          <p
            role={error ? "alert" : "status"}
            data-testid="settings-self-monitor-status"
            style={{
              color: error ? "var(--danger-readable)" : "hsl(var(--text-muted))",
              fontSize: pxToRem(SETTINGS_METRICS.row.subFontSize),
              lineHeight: SETTINGS_METRICS.row.subLineHeight,
              marginTop: pxToRem(SETTINGS_METRICS.row.subMarginTop),
            }}
          >
            {t(`settings.selfMonitor.${error ?? status}`)}
          </p>
        ) : null
      }
    />
  );
}
