"use client";

import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SettingToggle } from "@/components/settings/rows/setting-toggle";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import {
  AppearanceSettingsProvider,
  resolveSystemAccessibilityOverrides,
  useAppearanceSettingsBridge,
  type SystemAccessibilityPreferences,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { SectionTabBody } from "@/components/settings/sections/av/av-tab-body";
import { findSettingsTab, type SettingsTabDef } from "@/lib/settings/tree";
import { useSettingValue } from "@/lib/settings/use-setting-value";

/**
 * Görünüm › Erişilebilirlik (`accessibility`) — yedi satır.
 *
 * İki kural bu dosyada:
 *
 * 1. `Yazı boyutu` (`x4`) kök font boyutunu **ölçek adımının üstüne** çarpan olarak yazar
 *    (`lib/settings/text-scale.ts`), adımın yerine geçmez. Etki köprüde uygulanıyor; burada
 *    yalnız satır çizilir.
 * 2. `Sistem erişilebilirlik tercihlerini takip et` (`x7`) açıkken `prefers-reduced-motion` ve
 *    `prefers-contrast` kullanıcı seçimini **ezer** ve iki satır kilitli görünür. Motorun kilit
 *    kümesi ağaçtan türeyen statik bir küme olduğu için kilit burada, satır seviyesinde veriliyor.
 */

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CONTRAST_QUERY = "(prefers-contrast: more)";

const NO_SYSTEM_PREFERENCES: SystemAccessibilityPreferences = {
  prefersContrast: false,
  prefersReducedMotion: false,
};

/**
 * Sistem tercihleri — `matchMedia` üzerinden **canlı**.
 *
 * Sunucu anlık görüntüsü "hiçbiri" (SSR'da medya sorgusu yok); istemci gerçek değeri okur ve
 * `change` olayına abone olur. Kullanıcı işletim sisteminden hareket azaltmayı açtığında satır
 * yeniden yüklemeye gerek kalmadan hizalanır.
 */
function useSystemAccessibilityPreferences(): SystemAccessibilityPreferences {
  const queries = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return null;
    }

    return {
      contrast: window.matchMedia(CONTRAST_QUERY),
      motion: window.matchMedia(MOTION_QUERY),
    };
  }, []);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!queries) {
        return () => {};
      }

      queries.motion.addEventListener("change", listener);
      queries.contrast.addEventListener("change", listener);

      return () => {
        queries.motion.removeEventListener("change", listener);
        queries.contrast.removeEventListener("change", listener);
      };
    },
    [queries],
  );

  const getSnapshot = useCallback(() => {
    if (!queries) {
      return "false:false";
    }

    return `${queries.motion.matches}:${queries.contrast.matches}`;
  }, [queries]);

  const encoded = useSyncExternalStore(subscribe, getSnapshot, () => "false:false");
  const [motion, contrast] = encoded.split(":");

  return { prefersContrast: contrast === "true", prefersReducedMotion: motion === "true" };
}

export function AppearanceAccessibilityTab({ tab }: { readonly tab?: SettingsTabDef }) {
  const definition = tab ?? findSettingsTab("appearance", "accessibility");
  const bridge = useAppearanceSettingsBridge();

  if (!definition) {
    return null;
  }

  return (
    <AppearanceSettingsProvider bridge={bridge}>
      <AccessibilityRows tab={definition} />
    </AppearanceSettingsProvider>
  );
}

function AccessibilityRows({ tab }: { readonly tab: SettingsTabDef }) {
  const system = useSystemAccessibilityPreferences();
  const followSystem = useSettingValue<boolean>("x7");
  const overrides = followSystem.value
    ? resolveSystemAccessibilityOverrides(true, system)
    : resolveSystemAccessibilityOverrides(false, NO_SYSTEM_PREFERENCES);

  return (
    <SectionTabBody
      overrides={{
        x1: ({ divider, row }) => (
          <SystemOwnedToggle
            disabled
            divider={divider}
            forced={overrides.reduceMotion as boolean | undefined}
            rowKey="reduceMotion"
            titleKey={row.titleKey}
            treeRowKey={row.key}
          />
        ),
        x2: ({ divider, row }) => (
          <SystemOwnedToggle
            disabled
            divider={divider}
            forced={overrides.x2 as boolean | undefined}
            rowKey="x2"
            titleKey={row.titleKey}
            treeRowKey={row.key}
          />
        ),
      }}
      tab={tab}
    />
  );
}

/**
 * Sistem tercihine bağlanabilen anahtar.
 *
 * `forced` doluyken satır kilitli çizilir ve **sistemin** değerini gösterir; ayrıca değeri
 * kutuya da yazar, çünkü belge etkilerini (hareket niteliği, kontrast niteliği) kutu sürüyor.
 */
function SystemOwnedToggle({
  disabled = false,
  divider,
  forced,
  rowKey,
  titleKey,
  treeRowKey,
}: {
  readonly disabled?: boolean;
  readonly divider: boolean;
  readonly forced: boolean | undefined;
  readonly rowKey: string;
  readonly titleKey: string | undefined;
  readonly treeRowKey: string;
}) {
  const { t } = useI18n();
  const { setValue, value } = useSettingValue<boolean>(rowKey);
  const locked = forced !== undefined;

  useEffect(() => {
    if (forced !== undefined && forced !== value) {
      setValue(forced);
    }
  }, [forced, setValue, value]);

  return (
    <SettingsRow
      badge={locked ? t("settings.control.locked") : undefined}
      badgeTone={locked ? "primary" : undefined}
      control={(ids) => (
        <SettingToggle
          checked={forced ?? value}
          describedById={ids.describedById}
          disabled={disabled}
          labelledById={ids.labelledById}
          locked={locked}
          onChange={setValue}
          testId={`setting-toggle-${treeRowKey}`}
        />
      )}
      divider={divider}
      rowKey={treeRowKey}
      title={titleKey ? t(titleKey) : undefined}
    />
  );
}
