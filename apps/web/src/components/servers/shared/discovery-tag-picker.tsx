"use client";

import React, { useId, useState } from "react";
import { Info } from "lucide-react";
import { SERVER_TAG_LIMIT } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVERY_TAG_GROUPS, normalizeDiscoveryTag } from "@/lib/servers/discovery-tag-groups";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { cn } from "@/lib/utils";
import { DISPLAY_FONT } from "./typography";

/**
 * Keşif etiketi seçicisi — SPEC-SUNUCU §7.5 ve §8.2.
 *
 * PROMPT §3'ün açık talebi: **tek** bileşen, iki yerde. Eski `server-tags-editor.tsx` (115
 * satır, `Ekle` düğmeli düz liste) buraya taşındı ve silindi; iki editör kalsaydı sunucu
 * ayarlarındaki etiket kutusu ile sunucu oluşturma penceresindeki kutu ayrı ayrı evrilirdi.
 *
 * Sözleşme taşınmadı, **korundu**: slug kuralı ve beş etiket tavanı hâlâ `ServerTagSchema` ve
 * `SERVER_TAG_LIMIT`'te (`normalizeDiscoveryTag` tek kapı). Bileşen yalnız reddedildiğinde ne
 * gösterileceğine karar verir.
 *
 * İki varyantın **gerçekten** ayrıştığı yerler: kart zemini/yarıçapı, başlığın dili (ayarlarda
 * cümle, oluşturmada versal etiket), öneri rozetinin boyu (31 ↔ 29) ve ayarlardaki iki ek metin
 * bloğu. Kalan her ölçü `discoveryTagPicker.shared`'da.
 */

export type DiscoveryTagPickerVariant = "create" | "settings";

export type DiscoveryTagPickerProps = {
  /** Sunucu herkese açık değilken kart solar ve girdi kapanır (00 §6). */
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  /**
   * Yüzeye özel metinler. Verilmezse `server.discoveryTags.*` ağacından okunur; Ş10'un
   * sunucu oluşturma penceresi başlığı ve giriş cümlesini kendi ağacından
   * (`server.create.tags.*`) veriyor ve giriş cümlesi orada **duruma göre** değişiyor
   * ("Keşfet'te listele" açık mı değil mi).
   */
  label?: string | undefined;
  lead?: string | undefined;
  onChange: (tags: string[]) => void;
  suggestionsLabel?: string | undefined;
  tags: readonly string[];
  testId?: string | undefined;
  variant?: DiscoveryTagPickerVariant | undefined;
};

export function DiscoveryTagPicker({
  disabled = false,
  disabledReason,
  label,
  lead,
  onChange,
  suggestionsLabel,
  tags,
  testId = "server-discovery-tag-picker",
  variant = "settings",
}: DiscoveryTagPickerProps) {
  const { t } = useI18n();
  const { shared } = SERVER_METRICS.discoveryTagPicker;
  const surface =
    variant === "settings"
      ? SERVER_METRICS.discoveryTagPicker.settings
      : SERVER_METRICS.discoveryTagPicker.create;
  const isSettings = variant === "settings";
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const reasonId = useId();
  const atLimit = tags.length >= SERVER_TAG_LIMIT;

  const addTag = (raw: string) => {
    if (disabled) {
      return;
    }

    if (atLimit) {
      setError(t("server.discoveryTags.limitReached", { count: SERVER_TAG_LIMIT }));
      return;
    }

    const tag = normalizeDiscoveryTag(raw);
    if (tag === null) {
      setError(t("server.discoveryTags.invalid"));
      return;
    }

    setError(null);
    setDraft("");

    if (!tags.includes(tag)) {
      onChange([...tags, tag]);
    }
  };

  const toggleTag = (tag: string) => {
    if (disabled) {
      return;
    }

    if (tags.includes(tag)) {
      onChange(tags.filter((current) => current !== tag));
      setError(null);
      return;
    }

    addTag(tag);
  };

  return (
    <div
      className="border"
      data-testid={testId}
      style={{
        background: isSettings ? "hsl(var(--surface-card))" : "hsl(var(--surface-base))",
        borderColor: `hsl(var(--border)/${surface.cardBorderAlpha})`,
        borderRadius: pxToRem(surface.cardRadius),
        opacity: disabled ? shared.disabledOpacity : undefined,
        padding: pxToRem(surface.cardPadding),
      }}
    >
      <div className="flex items-center" style={{ gap: pxToRem(surface.headGap) }}>
        {isSettings ? (
          <span
            className="font-semibold text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.titleFontSize),
              lineHeight: SERVER_METRICS.discoveryTagPicker.settings.titleLineHeight,
            }}
          >
            {label ?? t("server.discoveryTags.title")}
          </span>
        ) : (
          <span
            className="font-semibold uppercase text-[hsl(var(--text-muted))]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(SERVER_METRICS.modal.labelFontSize),
              letterSpacing: `${SERVER_METRICS.modal.labelLetterSpacing}em`,
              lineHeight: 1,
            }}
          >
            {label ?? t("server.discoveryTags.label")}
          </span>
        )}
        <span
          className={cn(
            "ml-auto shrink-0 font-semibold",
            atLimit ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-muted))]",
          )}
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(shared.countFontSize),
            lineHeight: 1,
          }}
        >
          {t("server.discoveryTags.counter", { count: tags.length, limit: SERVER_TAG_LIMIT })}
        </span>
      </div>

      <div
        className="text-pretty text-[hsl(var(--text-muted))]"
        style={{
          fontSize: pxToRem(shared.leadFontSize),
          lineHeight: shared.leadLineHeight,
          marginTop: pxToRem(surface.leadMarginTop),
        }}
      >
        {lead ?? t("server.discoveryTags.lead", { count: SERVER_TAG_LIMIT })}
      </div>

      <div
        className="flex flex-wrap items-center border border-[hsl(var(--border))]"
        style={{
          background: isSettings ? "hsl(var(--surface-base))" : "hsl(var(--surface-card))",
          borderRadius: pxToRem(shared.inputRowRadius),
          gap: pxToRem(shared.inputRowGap),
          marginTop: pxToRem(surface.inputRowMarginTop),
          padding: `${pxToRem(shared.inputRowPaddingY)} ${pxToRem(shared.inputRowPaddingX)}`,
        }}
      >
        {tags.map((tag) => (
          <span
            className="flex items-center font-semibold text-[hsl(var(--primary))]"
            data-testid={`server-tag-${tag}`}
            key={tag}
            style={{
              background: `hsl(var(--primary)/${shared.chipBackgroundAlpha})`,
              borderRadius: pxToRem(shared.chipRadius),
              fontSize: pxToRem(shared.chipFontSize),
              gap: pxToRem(shared.chipGap),
              lineHeight: 1,
              padding: `${pxToRem(shared.chipPaddingY)} ${pxToRem(shared.chipPaddingX)}`,
            }}
          >
            {tag}
            <button
              aria-label={t("server.discoveryTags.remove", { tag })}
              className="cursor-pointer font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              disabled={disabled}
              onClick={() => onChange(tags.filter((current) => current !== tag))}
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(shared.removeFontSize),
                lineHeight: 1,
                opacity: shared.removeOpacity,
              }}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-describedby={
            [error ? errorId : null, disabled && disabledReason ? reasonId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={error !== null}
          aria-label={t("server.discoveryTags.inputLabel")}
          className="min-w-0 flex-1 border-0 bg-transparent font-medium text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
          data-testid="server-tag-input"
          disabled={disabled || atLimit}
          id={inputId}
          maxLength={24}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            addTag(draft);
          }}
          placeholder={t("server.discoveryTags.placeholder")}
          style={{
            fontSize: pxToRem(shared.draftFontSize),
            lineHeight: 1,
            minWidth: pxToRem(shared.draftMinWidth),
            padding: `${pxToRem(shared.draftPaddingY)} 0`,
          }}
          value={draft}
        />
      </div>

      {error ? (
        <div
          className="text-pretty font-semibold text-[hsl(var(--danger))]"
          data-testid="server-tag-error"
          id={errorId}
          style={{
            fontSize: pxToRem(shared.leadFontSize),
            lineHeight: shared.leadLineHeight,
            marginTop: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.helperMarginTop),
          }}
        >
          {error}
        </div>
      ) : null}

      {disabled && disabledReason ? (
        <div
          className="text-pretty text-[hsl(var(--text-muted))]"
          id={reasonId}
          style={{
            fontSize: pxToRem(shared.leadFontSize),
            lineHeight: shared.leadLineHeight,
            marginTop: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.helperMarginTop),
          }}
        >
          {disabledReason}
        </div>
      ) : null}

      {isSettings && !error ? (
        <div
          className="text-pretty text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(shared.leadFontSize),
            lineHeight: shared.leadLineHeight,
            marginTop: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.helperMarginTop),
          }}
        >
          {t("server.discoveryTags.helper")}
        </div>
      ) : null}

      <div
        className="font-semibold uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(SERVER_METRICS.modal.labelFontSize),
          letterSpacing: `${SERVER_METRICS.modal.labelLetterSpacing}em`,
          lineHeight: 1,
          marginTop: pxToRem(surface.suggestionsLabelMarginTop),
        }}
      >
        {suggestionsLabel ??
          t(isSettings ? "server.discoveryTags.suggested" : "server.discoveryTags.suggestions")}
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(surface.suggestionGroupsGap),
          marginTop: pxToRem(surface.suggestionGroupsMarginTop),
        }}
      >
        {DISCOVERY_TAG_GROUPS.map((group) => (
          <div
            className="flex items-center"
            key={group.id}
            style={{ gap: pxToRem(surface.suggestionGroupGap) }}
          >
            {/*
              SPEC §8.2 grup kodu rozeti. Süslemedir: grubun adını yanındaki `role="group"`
              zaten `aria-label` olarak taşıyor, o yüzden ekran okuyucudan gizlenir.
            */}
            <span
              aria-hidden="true"
              className="grid flex-none place-items-center font-semibold text-[hsl(var(--text-secondary))]"
              style={{
                background: "hsl(var(--surface-soft))",
                borderRadius: pxToRem(shared.suggestionCodeRadius),
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(shared.suggestionCodeFontSize),
                height: pxToRem(surface.suggestionCodeSize),
                lineHeight: 1,
                width: pxToRem(surface.suggestionCodeSize),
              }}
            >
              {group.code}
            </span>
            <div
              aria-label={t(`server.discoveryTags.group.${group.id}`)}
              className="flex min-w-0 flex-1 flex-wrap"
              role="group"
              style={{ gap: pxToRem(shared.suggestionChipsGap) }}
            >
              {group.suggestions.map((suggestion) => {
                const selected = tags.includes(suggestion.tag);

                return (
                  <button
                    aria-disabled={disabled || undefined}
                    aria-pressed={selected}
                    className={cn(
                      "cursor-pointer whitespace-nowrap border font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      selected
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]"
                        : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))]",
                    )}
                    key={suggestion.tag}
                    onClick={() => toggleTag(suggestion.tag)}
                    style={{
                      borderRadius: pxToRem(shared.suggestionChipRadius),
                      fontSize: pxToRem(shared.suggestionChipFontSize),
                      lineHeight: 1,
                      padding: `${pxToRem(shared.suggestionChipPaddingY)} ${pxToRem(shared.suggestionChipPaddingX)}`,
                    }}
                    type="button"
                  >
                    {suggestion.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isSettings ? (
        <div
          className="flex items-start"
          style={{
            background: `hsl(var(--surface-soft)/${SERVER_METRICS.discoveryTagPicker.settings.infoBackgroundAlpha})`,
            borderRadius: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.infoRadius),
            gap: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.infoGap),
            marginTop: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.infoMarginTop),
            padding: `${pxToRem(SERVER_METRICS.discoveryTagPicker.settings.infoPaddingY)} ${pxToRem(SERVER_METRICS.discoveryTagPicker.settings.infoPaddingX)}`,
          }}
        >
          <Info
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(
                SERVER_METRICS.discoveryTagPicker.settings.infoIconSize,
                SERVER_METRICS.discoveryTagPicker.settings.infoFontSize,
              ),
              width: pxToEm(
                SERVER_METRICS.discoveryTagPicker.settings.infoIconSize,
                SERVER_METRICS.discoveryTagPicker.settings.infoFontSize,
              ),
            }}
          />
          <span
            className="text-pretty text-[hsl(var(--text-secondary))]"
            style={{
              fontSize: pxToRem(SERVER_METRICS.discoveryTagPicker.settings.infoFontSize),
              lineHeight: SERVER_METRICS.discoveryTagPicker.settings.infoLineHeight,
            }}
          >
            {t("server.discoveryTags.info")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
