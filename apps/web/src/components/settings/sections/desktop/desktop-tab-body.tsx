"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  SettingsTreeRow,
  splitSettingsGroup,
} from "@/components/settings/rows/render-settings-tab";
import { SettingsGroup } from "@/components/settings/rows/settings-group";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import type { SettingsTab } from "@/lib/settings/navigation";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";

import { DesktopNativeRow, NATIVE_DESKTOP_ROW_KEYS } from "./native-settings-rows";
import { useDesktopSettings } from "./desktop-settings-context";
import { deriveDesktopTab } from "./desktop-tab-defs";

/**
 * Masaüstü bölümünün beş sekmesini çizen tek gövde — Ş10.
 *
 * Ş9'un `NotificationsTabBody`'siyle aynı iş, aynı iki gerekçeyle: satır markup'ı yine motorun
 * (`SettingsTreeRow`), bağımlılık kapısı satırın **dışında**. Bu bölümde kapının iki kullanıcısı
 * var — `z7` (`Oyun bazlı ayarlar`, hedefi bu pakette yok) ve `z5`/`z3`/`z4` gibi ana anahtarı
 * kapalıyken anlamsız kalan satırlar değil: yalnız gerçekten dokunulamayacak olan kapatılır.
 *
 * `inert`: alt ağacın tamamı tıklama, sekme turu ve metin seçimi dışına çıkar.
 * `pointer-events:none` yalnız fareyi keserdi ve klavye kullanıcısı hedefi olmayan bir
 * `Yönet` düğmesine odaklanmaya devam ederdi.
 */

const { toggle } = SETTINGS_METRICS.controls;

export function useDesktopTabDef(tab: SettingsTab): SettingsTabDef | null {
  const { updater } = useDesktopSettings();
  const definition = findSettingsTab(tab === "updates" ? "updates" : "desktop", tab);

  if (!definition) return null;

  return deriveDesktopTab(definition, { upToDate: updater.upToDate });
}

export type DesktopTabBodyProps = {
  /** Devre dışı satır anahtarları. Boş küme normal çizimdir. */
  readonly disabledRowKeys?: readonly string[];
  readonly tab: SettingsTabDef;
};

export function DesktopTabBody({ disabledRowKeys = [], tab }: DesktopTabBodyProps) {
  const { t } = useI18n();
  const disabled = new Set(disabledRowKeys);

  return (
    <>
      {tab.groups.flatMap((group, groupIndex) =>
        splitSettingsGroup(group, t).map((rendered, runIndex) => {
          const collapsible =
            tab.key === "updates" && rendered.rows.some((row) => row.key === "n3");
          const content = (
            <SettingsGroup
              key={`${tab.key}-${groupIndex}-${runIndex}`}
              note={rendered.note}
              testId={`settings-group-${tab.key}-${groupIndex}-${runIndex}`}
              title={collapsible ? undefined : rendered.title}
            >
              {rendered.rows.map((row, rowIndex) =>
                NATIVE_DESKTOP_ROW_KEYS.has(row.key) ? (
                  <DesktopNativeRow key={row.key} row={row} divider={rowIndex > 0} />
                ) : disabled.has(row.key) ? (
                  <div
                    aria-disabled="true"
                    data-setting-row-gate={row.key}
                    inert
                    key={row.key}
                    style={{ opacity: toggle.lockedOpacity }}
                  >
                    <SettingsTreeRow divider={rowIndex > 0} row={row} />
                  </div>
                ) : (
                  <SettingsTreeRow divider={rowIndex > 0} key={row.key} row={row} />
                ),
              )}
            </SettingsGroup>
          );
          return collapsible ? (
            <details
              key={`${tab.key}-${groupIndex}-${runIndex}`}
              className="group mb-6"
              data-testid="settings-diagnostics-disclosure"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] px-4 py-3 text-[0.8125rem] font-semibold text-[hsl(var(--text-primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] [&::-webkit-details-marker]:hidden">
                {rendered.title}
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="mt-3">{content}</div>
            </details>
          ) : (
            content
          );
        }),
      )}
    </>
  );
}
