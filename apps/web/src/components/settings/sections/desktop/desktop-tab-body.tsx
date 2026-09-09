"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  SettingsTreeRow,
  splitSettingsGroup,
} from "@/components/settings/rows/render-settings-tab";
import { SettingsGroup } from "@/components/settings/rows/settings-group";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import type { SettingsTab } from "@/lib/settings/navigation";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";

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
  const { conflictCount, updater } = useDesktopSettings();
  const definition = findSettingsTab("desktop", tab);

  if (!definition) return null;

  return deriveDesktopTab(definition, { conflictCount, upToDate: updater.upToDate });
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
        splitSettingsGroup(group, t).map((rendered, runIndex) => (
          <SettingsGroup
            key={`${tab.key}-${groupIndex}-${runIndex}`}
            note={rendered.note}
            testId={`settings-group-${tab.key}-${groupIndex}-${runIndex}`}
            title={rendered.title}
          >
            {rendered.rows.map((row, rowIndex) =>
              disabled.has(row.key) ? (
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
        )),
      )}
    </>
  );
}
