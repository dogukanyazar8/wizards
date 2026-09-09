"use client";

import React, { useId, useRef } from "react";

import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";

/**
 * Sunucu ayarları bölümlerinin üç ortak parçası — Ş13 (§8.6 · §8.7 · §8.8 · §8.9).
 *
 * `components/servers/shared/` altındaki dört parça (`ToggleRow`, `OptionChipGroup`,
 * `DiscoveryTagPicker`, `PermissionGroupCard`) **pencerelerle paylaşılıyor**; buradakiler
 * yalnız ayarlar bölümlerinin içinde geçiyor ve bir pencerede karşılığı yok. Aynı klasöre
 * koymak "paylaşılan" kelimesini boşaltırdı.
 *
 * - `SectionLabel` — `600 10px uppercase .15em` küçük başlık (`YENİ SAHİP`, `MEVCUT DAVETLER`,
 *   `HEDEF KANAL`). Referansta dört bölümde de birebir aynı satır.
 * - `ChipRadioGroup` — kartsız çip grubu. `OptionChipGroup` bir **kart** çiziyor (başlık +
 *   primary değer çipi + açıklama); §8.6'nın süzgeç çipleri ile §8.7'nin üç grubu kartsız ve
 *   değer çipi taşımıyor. Ortak olan tek şey klavye davranışı, o da burada tekrar edilmiyor:
 *   iki bileşen de aynı `radiogroup` sözleşmesini uygular (ok tuşları + roving tabindex).
 * - `CollapsibleList` — K3'ün iki katlanır listesi (`Yasaklılar (N)`,
 *   `Bekleyen davetler (N)`). Referansta karşılığı yok; ölçüler `settingsSections.collapsible*`
 *   altında ve gerekçesi orada.
 */

export function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  const { settings } = SERVER_METRICS;

  return (
    <div
      className="uppercase text-[hsl(var(--text-muted))]"
      style={{
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(settings.sectionLabelFontSize),
        fontWeight: 600,
        letterSpacing: `${settings.sectionLabelLetterSpacing}em`,
        lineHeight: 1,
      }}
    >
      {children}
    </div>
  );
}

export type ChipOption<Value extends string> = {
  readonly label: string;
  readonly value: Value;
};

export type ChipRadioGroupMetrics = {
  readonly chipFontSize: number;
  readonly chipGap: number;
  readonly chipPaddingX: number;
  readonly chipPaddingY: number;
  readonly chipRadius: number;
};

export type ChipRadioGroupProps<Value extends string> = {
  readonly ariaLabel?: string | undefined;
  readonly label?: string | undefined;
  readonly labelMarginTop?: number | undefined;
  readonly metrics: ChipRadioGroupMetrics;
  readonly onChange: (value: Value) => void;
  readonly options: readonly ChipOption<Value>[];
  readonly testId?: string | undefined;
  readonly value: Value;
};

export function ChipRadioGroup<Value extends string>({
  ariaLabel,
  label,
  labelMarginTop,
  metrics,
  onChange,
  options,
  testId,
  value,
}: ChipRadioGroupProps<Value>) {
  const labelId = useId();
  const chipRefs = useRef(new Map<Value, HTMLButtonElement>());
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const jumpTo = (index: number) => {
    const next = options[((index % options.length) + options.length) % options.length];

    if (!next) {
      return;
    }

    onChange(next.value);
    chipRefs.current.get(next.value)?.focus();
  };

  return (
    <div>
      {label ? (
        <div style={labelMarginTop ? { marginTop: pxToRem(labelMarginTop) } : undefined}>
          <span id={labelId}>
            <SectionLabel>{label}</SectionLabel>
          </span>
        </div>
      ) : null}
      <div
        className="flex flex-wrap"
        data-testid={testId}
        {...(label ? { "aria-labelledby": labelId } : { "aria-label": ariaLabel })}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            jumpTo(selectedIndex + 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            jumpTo(selectedIndex - 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            jumpTo(0);
          } else if (event.key === "End") {
            event.preventDefault();
            jumpTo(options.length - 1);
          }
        }}
        role="radiogroup"
        style={{
          gap: pxToRem(metrics.chipGap),
          marginTop: label ? pxToRem(SERVER_METRICS.settingsSections.invitesChipsMarginTop) : 0,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              aria-checked={selected}
              className="whitespace-nowrap border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              key={option.value}
              onClick={() => onChange(option.value)}
              ref={(node) => {
                if (node) {
                  chipRefs.current.set(option.value, node);
                } else {
                  chipRefs.current.delete(option.value);
                }
              }}
              role="radio"
              style={{
                background: selected ? "hsl(var(--primary)/0.16)" : "hsl(var(--surface-card))",
                borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)",
                borderRadius: pxToRem(metrics.chipRadius),
                color: selected ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                fontSize: pxToRem(metrics.chipFontSize),
                fontWeight: 600,
                lineHeight: 1,
                padding: `${pxToRem(metrics.chipPaddingY)} ${pxToRem(metrics.chipPaddingX)}`,
              }}
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CHEVRON_PATH = "m6 9 6 6 6-6";

export type CollapsibleListProps = {
  readonly children: React.ReactNode;
  readonly expanded: boolean;
  readonly label: string;
  readonly onToggle: () => void;
  readonly testId?: string | undefined;
};

export function CollapsibleList({
  children,
  expanded,
  label,
  onToggle,
  testId,
}: CollapsibleListProps) {
  const { settingsSections } = SERVER_METRICS;
  const panelId = useId();

  return (
    <div style={{ marginTop: pxToRem(settingsSections.collapsibleMarginTop) }}>
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="flex w-full items-center border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid={testId}
        onClick={onToggle}
        style={{
          borderRadius: pxToRem(settingsSections.collapsibleHeaderRadius),
          fontSize: pxToRem(settingsSections.collapsibleHeaderFontSize),
          fontWeight: 600,
          gap: pxToRem(settingsSections.collapsibleHeaderGap),
          height: pxToRem(settingsSections.collapsibleHeaderHeight),
          lineHeight: 1,
          padding: `0 ${pxToRem(settingsSections.collapsibleHeaderPaddingX)}`,
        }}
        type="button"
      >
        <span className="min-w-0 flex-1 text-left">{label}</span>
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          style={{
            height: pxToEm(
              settingsSections.collapsibleHeaderIconSize,
              settingsSections.collapsibleHeaderFontSize,
            ),
            transform: expanded ? "rotate(180deg)" : undefined,
            width: pxToEm(
              settingsSections.collapsibleHeaderIconSize,
              settingsSections.collapsibleHeaderFontSize,
            ),
          }}
          viewBox="0 0 24 24"
        >
          <path d={CHEVRON_PATH} />
        </svg>
      </button>
      {expanded ? (
        <div id={panelId} style={{ marginTop: pxToRem(settingsSections.collapsibleRowsMarginTop) }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function CollapsibleEmpty({ children }: { readonly children: React.ReactNode }) {
  const { settingsSections } = SERVER_METRICS;

  return (
    <div
      className="border border-dashed border-[hsl(var(--border))] text-center text-[hsl(var(--text-muted))]"
      style={{
        borderRadius: pxToRem(settingsSections.collapsibleEmptyRadius),
        fontSize: pxToRem(settingsSections.collapsibleEmptyFontSize),
        lineHeight: 1.45,
        padding: `${pxToRem(settingsSections.collapsibleEmptyPaddingY)} ${pxToRem(
          settingsSections.collapsibleEmptyPaddingX,
        )}`,
      }}
    >
      {children}
    </div>
  );
}

/** Bölüm başlığı — `Yeni davet`, `Sahipliği devret`, `Sunucuyu sil`. */
export function SectionCardTitle({
  children,
  fontSize,
  tone = "foreground",
}: {
  readonly children: React.ReactNode;
  readonly fontSize: number;
  readonly tone?: "foreground" | "danger";
}) {
  return (
    <div
      style={{
        color: tone === "danger" ? "hsl(var(--danger))" : "hsl(var(--foreground))",
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(fontSize),
        fontWeight: 600,
        letterSpacing: DISPLAY_TRACKING,
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  );
}

/** `yalnızca sahip` çipi — §8.5, §8.9 ve yetki satırlarının ortak rozeti. */
export function OwnerOnlyChip({ label }: { readonly label: string }) {
  const { settingsSections } = SERVER_METRICS;

  return (
    <span
      className="flex-none"
      style={{
        background: `hsl(var(--danger)/${settingsSections.dangerOwnerChipBackgroundAlpha})`,
        borderRadius: pxToRem(settingsSections.dangerOwnerChipRadius),
        color: "hsl(var(--danger))",
        fontFamily: DISPLAY_FONT,
        fontSize: pxToRem(settingsSections.dangerOwnerChipFontSize),
        fontWeight: 600,
        lineHeight: 1,
        padding: `${pxToRem(settingsSections.dangerOwnerChipPaddingY)} ${pxToRem(
          settingsSections.dangerOwnerChipPaddingX,
        )}`,
      }}
    >
      {label}
    </span>
  );
}
