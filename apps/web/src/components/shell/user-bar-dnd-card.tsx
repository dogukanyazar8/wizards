"use client";

import React, { useId } from "react";
import { MinusCircle } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { DND_DURATIONS, DND_DURATION_LABEL_KEYS, type DndDuration } from "@/lib/presence/dnd";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";

/**
 * Ayarlar Ş12 §2 / K8 — `Rahatsız Etmeyin` kartı.
 *
 * Kart bir görünüm; karar `lib/presence/dnd.ts` içinde. Burada tutulan tek bilgi hangi çipin
 * seçili çizildiği ve o da dışarıdan gelir — süreyi **mevcut odak makinesi** yönetiyor, bu
 * bileşen ikinci bir geri sayım kurmuyor.
 *
 * Dört çip **tek satırda** durur (SPEC §3). Sarma yok: sığmadığında küçülen şey yazı boyutu
 * değil çipin iç boşluğudur — `min()` tasarımın 10 px'ini kutunun yüzdesiyle karşılaştırır, ×1
 * ölçekte 10 px çıkar, dar bir kabukta (mobil çekmece) orantılı daralır.
 */

const { dnd } = SETTINGS_METRICS.userMenu;

/** `min(10px, 3.6%)` — 278 px'lik iç genişlikte tam 10 px, altında daralan iç boşluk. */
const CHIP_PADDING_INLINE = `min(${pxToRem(dnd.chipPaddingX)}, 3.6%)`;

export type UserBarDndCardProps = {
  readonly active: boolean;
  readonly duration: DndDuration | null;
  readonly onSelectDuration: (duration: DndDuration) => void;
  readonly onToggle: () => void;
  readonly pending?: boolean;
};

export function UserBarDndCard({
  active,
  duration,
  onSelectDuration,
  onToggle,
  pending = false,
}: UserBarDndCardProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();

  const durationLabel = duration ? t(DND_DURATION_LABEL_KEYS[duration]) : null;
  const subtitle = active
    ? durationLabel
      ? t("settings.userMenu.dnd.on", { duration: durationLabel })
      : t("settings.userMenu.dnd.onGeneric")
    : t("settings.userMenu.dnd.off");

  return (
    <div data-testid="user-menu-dnd">
      <div
        className="flex items-center"
        style={{
          background: active ? "hsl(var(--danger) / 0.1)" : "hsl(var(--surface-soft) / 0.5)",
          border: `${hairline()} solid ${active ? "hsl(var(--danger) / 0.35)" : "transparent"}`,
          borderRadius: pxToRem(dnd.cardRadius),
          gap: pxToRem(dnd.cardGap),
          padding: `${pxToRem(dnd.cardPaddingY)} ${pxToRem(dnd.cardPaddingX)}`,
        }}
      >
        <span
          className="grid flex-none place-items-center"
          style={{
            background: active ? "hsl(var(--danger) / 0.18)" : "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(dnd.iconRadius),
            color: `hsl(var(--${active ? "danger" : "text-muted"}))`,
            height: pxToRem(dnd.iconSize),
            width: pxToRem(dnd.iconSize),
          }}
        >
          <MinusCircle
            aria-hidden="true"
            style={{ height: pxToEm(dnd.iconGlyphSize), width: pxToEm(dnd.iconGlyphSize) }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p
            id={titleId}
            style={{
              color: "hsl(var(--foreground))",
              fontSize: pxToRem(dnd.titleFontSize),
              fontWeight: 600,
              lineHeight: dnd.titleLineHeight,
            }}
          >
            {t("settings.userMenu.dnd.title")}
          </p>
          <p
            data-testid="user-menu-dnd-subtitle"
            id={descriptionId}
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(dnd.subFontSize),
              lineHeight: dnd.subLineHeight,
              marginTop: pxToRem(dnd.subMarginTop),
            }}
          >
            {subtitle}
          </p>
        </div>

        {/* 40×23 anahtar. `ToggleSwitch` tasarımın bu ölçüsünü almıyor; rol ve klavye davranışı
            yerel bir `button` üzerinde aynı sözleşmeyle kurulur. */}
        <button
          aria-checked={active}
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          className="relative flex-none transition disabled:cursor-wait disabled:opacity-70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="user-menu-dnd-switch"
          disabled={pending}
          onClick={onToggle}
          role="switch"
          style={{
            background: active ? "hsl(var(--danger))" : "hsl(var(--surface-tertiary))",
            border: 0,
            borderRadius: pxToRem(999),
            height: pxToRem(dnd.switchHeight),
            width: pxToRem(dnd.switchWidth),
          }}
          type="button"
        >
          <span
            aria-hidden="true"
            className="absolute transition-[left]"
            style={{
              background: "#fff",
              borderRadius: "50%",
              boxShadow: `0 ${pxToRem(1)} ${pxToRem(3)} hsl(var(--shadow-color) / 0.4)`,
              height: pxToRem(dnd.switchKnob),
              left: pxToRem(
                active
                  ? dnd.switchWidth - dnd.switchKnob - dnd.switchKnobInset
                  : dnd.switchKnobInset,
              ),
              top: pxToRem(dnd.switchKnobInset),
              width: pxToRem(dnd.switchKnob),
            }}
          />
        </button>
      </div>

      {active ? (
        <div
          aria-label={t("settings.userMenu.dnd.durationGroup")}
          className="flex flex-nowrap"
          data-testid="user-menu-dnd-durations"
          role="group"
          style={{ gap: pxToRem(dnd.chipGap), marginTop: pxToRem(dnd.chipRowMarginTop) }}
        >
          {DND_DURATIONS.map((option) => {
            const selected = option === duration;

            return (
              <button
                aria-pressed={selected}
                className="min-w-0 flex-none overflow-hidden text-ellipsis whitespace-nowrap transition disabled:cursor-wait disabled:opacity-70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                data-testid={`user-menu-dnd-duration-${option}`}
                disabled={pending}
                key={option}
                onClick={() => onSelectDuration(option)}
                style={{
                  background: selected
                    ? `hsl(var(--danger) / ${dnd.chipSelectedSurfaceAlpha})`
                    : "hsl(var(--surface-card))",
                  border: `${hairline()} solid hsl(var(--${selected ? "danger" : "border"}) / ${selected ? dnd.chipSelectedBorderAlpha : 0.7})`,
                  borderRadius: pxToRem(dnd.chipRadius),
                  color: `hsl(var(--${selected ? "danger" : "text-secondary"}))`,
                  flexShrink: 1,
                  fontSize: pxToRem(dnd.chipFontSize),
                  fontWeight: 600,
                  height: pxToRem(dnd.chipHeight),
                  lineHeight: 1,
                  paddingInline: CHIP_PADDING_INLINE,
                }}
                type="button"
              >
                {t(DND_DURATION_LABEL_KEYS[option])}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
