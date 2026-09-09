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

import { useNotificationsSection } from "./notifications-section-context";
import { deriveNotificationsTab } from "./notifications-tab-defs";

/**
 * Ayarlar paketi — Dalga 3 / Ş9. Bölümün yedi sekmesini çizen tek gövde.
 *
 * Motorun `SettingsTabBody`'siyle aynı işi yapar, **bir** farkla: bir satır başka bir satırın
 * değerine bağlı olarak devre dışı kalabilir. Referansta bunun tek örneği `np3` —
 * `Paneli otomatik kapat` kapalıyken `Görünme süresi` seçilemez (Ş9 §6).
 *
 * Bağımlılık ağaca yazılmadı: `tree.ts` bu şeritte okunur ve "şu satır şu satıra bağlı" bilgisi
 * içerik değil, o sekmenin davranışıdır. Motorun `switch`'ine `disabled` eklemek de dört bölüm
 * şeridini aynı dosyada çakıştırırdı. Kapı bu yüzden satırın **dışında** duruyor: satırı yine
 * motor çiziyor (`SettingsTreeRow`), kapı yalnız ona dokunulup dokunulamayacağını söylüyor.
 *
 * Kapı `inert` kullanıyor: alt ağacın tamamı tıklama, sekme turu ve metin seçimi dışına çıkar.
 * `pointer-events:none` yalnız fareyi keserdi ve klavye kullanıcısı devre dışı bir segmentin
 * içinde dolaşmaya devam ederdi.
 */

const { toggle } = SETTINGS_METRICS.controls;

/**
 * Sekmenin çalışma zamanı tanımı — ağaçtaki tanım artı bölüm bağlamının türevi.
 *
 * Yedi sekme dosyası aynı iki satırı yazmasın diye burada: sekme dosyasının işi kendi
 * **özel** kararını (varsa) söylemek, ağacı yeniden bulmak değil.
 */
export function useNotificationsTabDef(tab: SettingsTab): SettingsTabDef | null {
  const { derivation } = useNotificationsSection();
  const definition = findSettingsTab("notifications", tab);

  if (!definition) return null;

  return deriveNotificationsTab(definition, derivation);
}

export type NotificationsTabBodyProps = {
  /** Devre dışı satır anahtarları. Boş küme normal çizimdir. */
  readonly disabledRowKeys?: readonly string[];
  readonly tab: SettingsTabDef;
};

export function NotificationsTabBody({ disabledRowKeys = [], tab }: NotificationsTabBodyProps) {
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
