"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import type { SettingsRiskyBlockKey } from "@/lib/settings/tree";

import { SettingActionButton } from "./setting-actions";

/**
 * Riskli akışın açılır bloğu — SPEC-AYARLAR §5.1, PROMPT §6.
 *
 * Parola değiştirme, 2FA kurulumu ve hesap silme **kendi satırının altında** açılır; ayrı bir
 * modal açsalardı kullanıcı hangi satırdan geldiğini kaybederdi ve `Esc` merdiveninde bir basamak
 * daha olurdu. Aynı anda **tek** blok açık kalır (tuzak #12) ve tekliği bu bileşen değil,
 * merdiveni tutan tek `openRisky` değeri sağlar — burada yalnız `open` okunur.
 *
 * `aria-expanded` ve `aria-controls` **düğmenin** üzerinde: bir sarmalayıcı `div` üzerinde
 * geçersizler ve ekran okuyucu "genişletilebilir" bilgisini hiç duyurmaz. Gövde bu şeridin işi
 * değil — Ş7 üç bloğun içini yazar ve `SettingRiskyBlockBody`'ye verir.
 */

const { riskyBlock } = SETTINGS_METRICS;

const OPEN_LABEL_KEY: Readonly<Record<SettingsRiskyBlockKey, string>> = {
  deleteAccount: "settings.control.risky.deleteAccount",
  password: "settings.control.risky.password",
  twoFactor: "settings.control.risky.twoFactor",
};

/** Tetikleyici ile gövdeyi bağlayan kimlik; ikisi ayrı yuvalarda çizildiği için türetilir. */
export function settingRiskyPanelId(rowKey: string): string {
  return `setting-risky-${rowKey}`;
}

export type SettingRiskyBlockTriggerProps = {
  readonly blockKey: SettingsRiskyBlockKey;
  readonly describedById?: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  /** Ş7 durum bilen bir etiket verebilir (2FA kuruluysa `Kapat`). */
  readonly openLabel?: string | undefined;
  readonly rowKey: string;
  readonly testId?: string;
};

export function SettingRiskyBlockTrigger({
  blockKey,
  describedById,
  onOpenChange,
  open,
  openLabel,
  rowKey,
  testId,
}: SettingRiskyBlockTriggerProps) {
  const { t } = useI18n();
  const label = open
    ? t("settings.control.risky.close")
    : (openLabel ?? t(OPEN_LABEL_KEY[blockKey]));

  return (
    <SettingActionButton
      controlsId={open ? settingRiskyPanelId(rowKey) : undefined}
      describedById={describedById}
      entry={{
        kind: open ? undefined : blockKey === "deleteAccount" ? "danger" : "primary",
        label,
        onClick: () => onOpenChange(!open),
      }}
      expanded={open}
      testId={testId}
    />
  );
}

export function SettingRiskyBlockBody({
  children,
  rowKey,
  testId,
}: {
  readonly children: React.ReactNode;
  readonly rowKey: string;
  readonly testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      id={settingRiskyPanelId(rowKey)}
      style={{
        borderTop: `${hairline()} solid hsl(var(--border) / ${riskyBlock.borderTopAlpha})`,
        marginTop: pxToRem(riskyBlock.marginTop),
        paddingTop: pxToRem(riskyBlock.paddingTop),
      }}
    >
      {children}
    </div>
  );
}
