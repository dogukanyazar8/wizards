"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  splitSettingsGroup,
  SettingsTreeRow,
} from "@/components/settings/rows/render-settings-tab";
import { SettingsGroup } from "@/components/settings/rows/settings-group";
import type { SettingsRowDef, SettingsTabDef } from "@/lib/settings/tree";

/**
 * Sekme gövdesi, **üç satırlık** bir istisnayla.
 *
 * Ş6'nın kuralı yerinde: bölüm şeritleri elle satır markup'ı yazmaz, 169 satırın kaynağı ağaç.
 * Ama cihaz menülerinin seçenekleri ağaçta **veri** olarak duruyor (referansın örnek cihaz
 * adları) ve üründe canlı `enumerateDevices()` sonucundan gelmek zorunda. Motorun `SettingSelect`
 * sarmalayıcısı seçenekleri `row.options`'tan okuduğu için bu üç satır — ve yalnız bu üçü —
 * kendi kontrolünü verir; kalan 23 satır motordan geçer.
 *
 * Alternatif "ağaca dinamik seçenek alanı eklemek" olurdu; o da satır motorunu (Ş6, bu şeritte
 * **yazılmaz**) ve ağacı birden değiştirirdi.
 *
 * Gövde bölümden bağımsız (`SectionTabBody`): Görünüm › Erişilebilirlik de aynı kapıyı kullanıyor,
 * çünkü `Sistem tercihlerini takip et` açıkken iki satır **dinamik olarak** kilitleniyor ve
 * motorun kilit kümesi ağaçtan türeyen **statik** bir kümedir. Dosya `av/` altında duruyor;
 * ikinci bir kopya çıkarmak, iki gövdenin sessizce ayrışması demekti.
 */

export type SectionRowOverride = (input: {
  readonly divider: boolean;
  readonly row: SettingsRowDef;
}) => React.ReactNode;

export function SectionTabBody({
  overrides = {},
  tab,
}: {
  readonly overrides?: Readonly<Record<string, SectionRowOverride>>;
  readonly tab: SettingsTabDef;
}) {
  const { t } = useI18n();

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
            {rendered.rows.map((row, rowIndex) => {
              const override = overrides[row.key];
              const divider = rowIndex > 0;

              return override ? (
                <React.Fragment key={row.key}>{override({ divider, row })}</React.Fragment>
              ) : (
                <SettingsTreeRow divider={divider} key={row.key} row={row} />
              );
            })}
          </SettingsGroup>
        )),
      )}
    </>
  );
}
