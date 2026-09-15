"use client";

import React, { useEffect, useRef } from "react";

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
  email: "settings.action.ae.1",
  phone: "settings.action.ap.1",
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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When switching rows, the previous panel's cleanup may restore its own
    // trigger first. Resolve this row's trigger instead of capturing that focus.
    const trigger =
      panelRef.current
        ?.closest("[data-setting-row]")
        ?.querySelector<HTMLElement>(`[aria-controls="${settingRiskyPanelId(rowKey)}"]`) ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    // Expanded rows can start below the scroll viewport. Focus the form so the
    // newly opened fields are revealed and keyboard input stays in this flow.
    panelRef.current
      ?.querySelector<HTMLElement>(
        "input:not(:disabled):not([hidden]):not([type='hidden']), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)",
      )
      ?.focus();

    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [rowKey]);

  return (
    <div
      data-testid={testId}
      id={settingRiskyPanelId(rowKey)}
      ref={panelRef}
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
