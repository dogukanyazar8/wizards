"use client";

import React, { memo } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { HomeCardState } from "@/hooks/use-home-queries";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToRem } from "@/lib/home/metrics";
import type { AppSummaryResponse, HomePresence } from "@/lib/home/types";
import { cn } from "@/lib/utils";

import { useFocusControls } from "@/components/providers/focus-controls-provider";
import { selectPresenceChip } from "@/lib/home/focus-machine";

import { HomeCard, HomeCardError, HomeSkeletonRows } from "./home-card";
import { DISPLAY_FONT, HomeCardNotice, HomeDivider, ON_ACCENT_COLOR } from "./home-primitives";

/**
 * "DURUMUN" — SPEC §3.4, `05-faz4` §4.4.
 *
 * Kartın içeriği sabittir; artan alan çip ızgarası ile ilerleme çubuğu arasındaki boşluğa gider
 * (SPEC §8.3). Odak kapalıyken ilerleme çubuğu ve alt açıklama **gizlenir ama yerleri boş kalır**:
 * yükseklik değişseydi ızgara satırı kayardı (§9 tuzağı).
 *
 * Faz 5: çipler ve toggle artık yazıyor. Karar noktaları saf (`focus-machine.ts`), yazım iyimser
 * (`mutations.ts`) ve odak katmanı `FocusControlsProvider`'dan geliyor — üst çubuk pill'i ile
 * kullanıcı ayağı satırı **aynı** kaynağı okusun diye (§3.3).
 *
 * Odak açıkken çipler **kilitlenmez**: seçim `statusRestoreTo`'yu değiştirir, görünen durum DND
 * kalır. Tasarımdaki "Çevrimiçi seçili + DND açık" görüntüsünün karşılığı budur (§3.1).
 */

const { presenceCard } = HOME_METRICS;

type PresenceChip = {
  /** Aktif çipin zeminini ve metnini veren token. */
  readonly accent: string;
  readonly id: HomePresence;
  readonly labelKey: string;
};

/** SPEC §3.4 sırası; `INVISIBLE` depoda `OFFLINE` olarak durur (Faz 3 §2). */
export const PRESENCE_CHIPS: readonly PresenceChip[] = [
  { accent: "success", id: "ONLINE", labelKey: "home.presence.online" },
  { accent: "danger", id: "DND", labelKey: "home.presence.busy" },
  { accent: "warning", id: "IDLE", labelKey: "home.presence.idle" },
  { accent: "text-muted", id: "OFFLINE", labelKey: "home.presence.invisible" },
];

const CHIP_LABEL_LINE_HEIGHT = 1;
const SUBTITLE_LINE_HEIGHT = 1.2;

/**
 * Odak kapalıyken bırakılacak boşluğun tam yüksekliği. Tasarımın kendi ölçüleri: alt açıklama
 * (3 + 11.5×1.2) ve ilerleme bloğu (12 + 5 + 7 + 10.5).
 */
const SUBTITLE_BLOCK_HEIGHT =
  presenceCard.dndSubtitleMarginTop + presenceCard.dndSubtitleFontSize * SUBTITLE_LINE_HEIGHT;
const PROGRESS_BLOCK_HEIGHT =
  presenceCard.progressMarginTop +
  presenceCard.progressHeight +
  presenceCard.progressLabelMarginTop +
  HOME_TYPE_SCALE.sectionLabel.size;

function PresenceChipButton({
  active,
  chip,
  disabled,
  onSelect,
}: {
  active: boolean;
  chip: PresenceChip;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "flex items-center outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        active ? "" : "bg-[hsl(var(--surface-secondary))] hover:bg-[var(--surface-hover)]",
      )}
      data-testid={`home-presence-chip-${chip.id.toLowerCase()}`}
      onClick={onSelect}
      style={{
        borderRadius: pxToRem(presenceCard.chipRadius),
        fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
        fontWeight: active ? 600 : 500,
        gap: pxToRem(presenceCard.chipGap),
        lineHeight: CHIP_LABEL_LINE_HEIGHT,
        padding: `${pxToRem(presenceCard.chipPaddingY)} ${pxToRem(presenceCard.chipPaddingX)}`,
        // Zemin vurgu renginin tint'i, **metin** okunabilir varyantı: aynı token ailesi, ama
        // 11,5px yazı 0.14 tint üzerinde 4.5:1'i geçmiyordu (globals.css `--*-readable`).
        ...(active
          ? {
              background: `hsl(var(--${chip.accent}) / 0.14)`,
              color: `var(--${chip.accent}-readable, hsl(var(--${chip.accent})))`,
            }
          : { color: "hsl(var(--text-muted))" }),
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full"
        style={{
          background: `hsl(var(--${chip.accent}))`,
          height: pxToRem(presenceCard.chipDotSize),
          width: pxToRem(presenceCard.chipDotSize),
        }}
      />
      {t(chip.labelKey)}
    </button>
  );
}

function FocusToggle({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      aria-checked={active}
      aria-label={t("home.presence.dnd")}
      className="relative shrink-0 outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait"
      data-testid="home-presence-focus-toggle"
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      style={{
        background: active ? "hsl(var(--primary))" : "hsl(var(--surface-tertiary))",
        borderRadius: pxToRem(HOME_METRICS.radius.pill),
        height: pxToRem(presenceCard.toggleHeight),
        width: pxToRem(presenceCard.toggleWidth),
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full transition-[left]"
        style={{
          background: ON_ACCENT_COLOR,
          height: pxToRem(presenceCard.toggleKnobSize),
          left: pxToRem(
            active ? presenceCard.toggleKnobOffsetLeftOn : presenceCard.toggleKnobOffsetTop,
          ),
          top: pxToRem(presenceCard.toggleKnobOffsetTop),
          width: pxToRem(presenceCard.toggleKnobSize),
        }}
      />
    </button>
  );
}

export type HomePresenceCardProps = {
  state: HomeCardState<AppSummaryResponse>;
};

function HomePresenceCardComponent({ state }: HomePresenceCardProps) {
  const { t } = useI18n();
  const controls = useFocusControls();
  const summary = state.status === "ready" ? state.data : null;
  const focus = summary?.focus ?? null;
  // Seçili çip kartın **kendi** verisinden türer; `restoreTo` yalnız odak açıkken
  // kullanıcının yerel tercihini üstüne bindirir (§3.1). İki ayrı presence kaynağı yok.
  const selectedChip = selectPresenceChip({
    restoreTo: controls.restoreTo,
    summary: summary ?? { focus: null, presence: "ONLINE" },
  });
  // §3.2 — the ring counts down from the absolute deadline, not from the number
  // the response happened to carry.
  const minutesLeft = controls.minutesLeft ?? focus?.minutesLeft ?? 0;
  const elapsed = focus ? Math.max(0, focus.totalMinutes - minutesLeft) : 0;
  const progress = focus && focus.totalMinutes > 0 ? (elapsed / focus.totalMinutes) * 100 : 0;

  return (
    <HomeCard
      columnSpan={presenceCard.columnSpan}
      cardId="presence"
      label={t("home.presence.title")}
      padding={pxToRem(presenceCard.padding)}
      testId="home-presence-card"
    >
      {state.status === "loading" ? (
        <HomeSkeletonRows
          count={2}
          gap={presenceCard.chipGridGap}
          radius={presenceCard.chipRadius}
          rowHeight={presenceCard.chipPaddingY * 2 + HOME_TYPE_SCALE.timestamp.size}
          style={{ marginTop: pxToRem(presenceCard.chipGridMarginTop) }}
          testId="home-presence-skeleton"
        />
      ) : state.status === "error" ? (
        <HomeCardError onRetry={state.retry} testId="home-presence-error" />
      ) : (
        <>
          <div
            className="grid"
            style={{
              gap: pxToRem(presenceCard.chipGridGap),
              gridTemplateColumns: `repeat(${presenceCard.chipGridColumns}, minmax(0, 1fr))`,
              marginTop: pxToRem(presenceCard.chipGridMarginTop),
            }}
          >
            {PRESENCE_CHIPS.map((chip) => (
              <PresenceChipButton
                active={selectedChip === chip.id}
                chip={chip}
                disabled={controls.isPending}
                key={chip.id}
                onSelect={() => controls.setPresence(chip.id)}
              />
            ))}
          </div>

          <HomeDivider
            style={{
              height: hairline(presenceCard.dividerHeight),
              margin: `${pxToRem(presenceCard.dividerMarginTop)} 0 ${pxToRem(
                presenceCard.dividerMarginBottom,
              )}`,
            }}
          />

          <div className="flex items-center" style={{ gap: pxToRem(presenceCard.dndGap) }}>
            <div className="min-w-0 flex-1">
              <div
                className="text-[hsl(var(--foreground))]"
                style={{
                  fontSize: pxToRem(presenceCard.dndTitleFontSize),
                  fontWeight: 600,
                  lineHeight: SUBTITLE_LINE_HEIGHT,
                }}
              >
                {t("home.presence.dnd")}
              </div>
              {focus?.active ? (
                <div
                  className="text-[hsl(var(--text-muted))]"
                  data-testid="home-presence-focus-subtitle"
                  style={{
                    fontSize: pxToRem(presenceCard.dndSubtitleFontSize),
                    lineHeight: SUBTITLE_LINE_HEIGHT,
                    marginTop: pxToRem(presenceCard.dndSubtitleMarginTop),
                  }}
                >
                  {t("home.presence.dndAutoOff", { minutes: minutesLeft })}
                </div>
              ) : (
                // Odak kapalı: satır aynı yüksekliği tutar, kart kısalmaz.
                <div aria-hidden="true" style={{ height: pxToRem(SUBTITLE_BLOCK_HEIGHT) }} />
              )}
            </div>
            <FocusToggle
              active={Boolean(focus?.active)}
              disabled={controls.isPending}
              onToggle={controls.toggleFocus}
            />
          </div>

          {focus?.active ? (
            <div data-testid="home-presence-progress">
              <div
                aria-valuemax={focus.totalMinutes}
                aria-valuemin={0}
                aria-valuenow={elapsed}
                className="overflow-hidden bg-[hsl(var(--surface-tertiary))]"
                role="progressbar"
                style={{
                  borderRadius: pxToRem(HOME_METRICS.radius.pill),
                  height: pxToRem(presenceCard.progressHeight),
                  marginTop: pxToRem(presenceCard.progressMarginTop),
                }}
              >
                <div
                  className="h-full bg-[hsl(var(--primary))]"
                  style={{
                    borderRadius: pxToRem(HOME_METRICS.radius.pill),
                    width: `${progress}%`,
                  }}
                />
              </div>
              <div
                className={cn(DISPLAY_FONT, "flex justify-between text-[hsl(var(--text-muted))]")}
                style={{
                  fontSize: pxToRem(HOME_TYPE_SCALE.sectionLabel.size),
                  fontWeight: 500,
                  lineHeight: 1,
                  marginTop: pxToRem(presenceCard.progressLabelMarginTop),
                }}
              >
                <span>{t("home.presence.elapsed", { minutes: elapsed })}</span>
                <span>{t("home.presence.total", { minutes: focus.totalMinutes })}</span>
              </div>
            </div>
          ) : (
            <div aria-hidden="true" style={{ height: pxToRem(PROGRESS_BLOCK_HEIGHT) }} />
          )}

          {/* §2 — düşen bir yazım sessizce geri alınmaz; satır kartın içinde durur. */}
          <HomeCardNotice message={controls.notice} />
        </>
      )}
    </HomeCard>
  );
}

export const HomePresenceCard = memo(HomePresenceCardComponent);
