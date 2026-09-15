"use client";

import React from "react";

import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Eylem düğmeleri — SPEC-AYARLAR §4.4, PROMPT §4.
 *
 * **Düğme kümesi yasak.** Bu bileşen en çok üç düğme alır ve bu düğmeler **kendi satırında**
 * durur; "E-posta işlemleri" ya da "Cihaz listesi" gibi uydurma bir toplayıcı satır altında
 * toplanan düğme yığını üretilmez. Ağaçtaki en kalabalık satır üç düğme taşıyor (`s2`), yani
 * sınır bir tahmin değil, içeriğin kendisi.
 *
 * Sınırı aşan çağrı **sessizce kırpılmaz**: fazla düğme dizilir ama `data-actions-overflow`
 * niteliği bırakılır ve bir test bunu yakalar. Sessizce üçe kesmek, dördüncü düğmeyi ekleyen
 * kişiye hiçbir şey söylemeden onun işini yutmak olurdu.
 */

const { action } = SETTINGS_METRICS.controls;

/** PROMPT §4 — bir satırda en çok üç düğme. */
export const SETTING_ACTIONS_MAX = 3;

export type SettingActionDescriptor = {
  readonly controlsId?: string | undefined;
  readonly expanded?: boolean | undefined;
  readonly disabled?: boolean;
  readonly kind?: "danger" | "primary" | "success" | undefined;
  readonly label: string;
  readonly onClick: () => void;
};

export type SettingActionsProps = {
  readonly actions: readonly SettingActionDescriptor[];
  readonly describedById?: string | undefined;
  readonly labelledById?: string | undefined;
  readonly testId?: string;
};

export function SettingActions({
  actions,
  describedById,
  labelledById,
  testId,
}: SettingActionsProps) {
  return (
    // Küme `role="group"` + satır başlığı: düğmenin **adı** kendi metnidir ("Yeniden gönder"),
    // bağlamı satır başlığından gelir. Adı `aria-labelledby` ile başlığa bağlamak üç düğmenin
    // üçünü de "E-posta" diye okuturdu.
    <div
      aria-labelledby={labelledById}
      className="flex max-w-full shrink-0 flex-wrap items-center justify-end"
      data-actions-overflow={actions.length > SETTING_ACTIONS_MAX || undefined}
      data-testid={testId}
      role="group"
      style={{ gap: pxToRem(action.gap) }}
    >
      {actions.map((entry, index) => (
        <SettingActionButton
          controlsId={entry.controlsId}
          expanded={entry.expanded}
          describedById={index === 0 ? describedById : undefined}
          entry={entry}
          key={index}
          testId={testId ? `${testId}-${index}` : undefined}
        />
      ))}
    </div>
  );
}

/**
 * Tek düğme, aynı geometri.
 *
 * Riskli blok tetikleyicisi bunu doğrudan kullanır: `aria-expanded` ve `aria-controls`
 * **düğmenin** üzerinde olmak zorunda (bir `div role="group"` üzerinde geçersiz), ama düğmenin
 * ölçüsü ve tonu iki yerde tanımlanmamalı.
 */
export function SettingActionButton({
  controlsId,
  describedById,
  entry,
  expanded,
  testId,
}: {
  readonly controlsId?: string | undefined;
  readonly describedById?: string | undefined;
  readonly entry: SettingActionDescriptor;
  readonly expanded?: boolean | undefined;
  readonly testId?: string | undefined;
}) {
  const danger = entry.kind === "danger";
  const success = entry.kind === "success";

  return (
    <button
      aria-controls={controlsId}
      aria-describedby={describedById}
      aria-expanded={expanded}
      className={`max-w-full whitespace-normal transition-[filter] enabled:hover:brightness-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${success ? "disabled:cursor-default" : "disabled:cursor-not-allowed disabled:opacity-55"}`}
      data-testid={testId}
      disabled={entry.disabled ?? false}
      onClick={entry.onClick}
      style={{
        cursor: success ? "default" : undefined,
        background: success
          ? "hsl(var(--success) / 0.16)"
          : danger
            ? `hsl(var(--danger) / ${action.dangerSurfaceAlpha})`
            : "hsl(var(--primary))",
        border: danger
          ? `${hairline()} solid hsl(var(--danger) / ${action.dangerBorderAlpha})`
          : "0",
        borderRadius: pxToRem(action.radius),
        color: success ? "hsl(var(--success))" : danger ? "hsl(var(--danger))" : "#fff",
        fontSize: pxToRem(action.fontSize),
        fontWeight: action.weight,
        minHeight: pxToRem(action.height),
        lineHeight: 1,
        padding: `0 ${pxToRem(action.paddingX)}`,
        transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
      }}
      type="button"
    >
      {entry.label}
    </button>
  );
}
