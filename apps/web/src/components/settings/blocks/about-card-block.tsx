"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/**
 * Whispr kartı (`o1`) — SPEC §5.6, başlıksız grup (sapma #8).
 * Sabit logo ve yerelleştirilmiş açıklama. Bağlantılar webde yeni sekmede açılır;
 * Tauri `on_new_window` bunları sistem tarayıcısına yönlendirir.
 */

const { about } = SETTINGS_METRICS.blocks;

type AboutLink = {
  readonly href: string;
  readonly key: string;
  readonly labelKey: string;
};

const ABOUT_LINKS: readonly AboutLink[] = [
  { href: "https://whispr.team/", key: "website", labelKey: "settings.block.about.link.website" },
  {
    href: "https://whispr.team/privacy",
    key: "privacy",
    labelKey: "settings.block.about.link.privacy",
  },
  { href: "https://whispr.team/terms", key: "terms", labelKey: "settings.block.about.link.terms" },
];

export function AboutCardBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();

  const linkStyle = {
    fontSize: pxToRem(about.linkFontSize),
    fontWeight: about.linkWeight,
    lineHeight: 1,
  } as const;

  return (
    <div
      className="flex"
      data-block="about"
      data-testid={`settings-block-${rowDef.key}`}
      style={{
        gap: pxToRem(about.gap),
        padding: `${pxToRem(about.paddingY)} ${pxToRem(about.paddingX)}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Shared static SVG needs no image optimizer. */}
      <img
        alt=""
        src="/favicon.svg"
        width={about.logoSize}
        height={about.logoSize}
        className="flex-none"
        style={{
          height: pxToRem(about.logoSize),
          width: pxToRem(about.logoSize),
        }}
      />

      <div className="min-w-0 flex-1">
        <div
          className="font-display text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(about.titleFontSize),
            fontWeight: about.titleWeight,
            lineHeight: 1.2,
          }}
        >
          {t("settings.block.about.title")}
        </div>
        <div
          className="text-pretty text-[hsl(var(--text-secondary))]"
          style={{
            fontSize: pxToRem(about.bodyFontSize),
            lineHeight: about.bodyLineHeight,
            marginTop: pxToRem(about.bodyMarginTop),
          }}
        >
          {t("settings.block.about.body")}
        </div>

        <div
          className="flex flex-wrap"
          style={{ gap: pxToRem(about.linksGap), marginTop: pxToRem(about.linksMarginTop) }}
        >
          {ABOUT_LINKS.map((link) => (
            <a
              className="text-[var(--primary-readable)] no-underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid={`settings-about-link-${link.key}`}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              key={link.key}
              style={linkStyle}
            >
              {t(link.labelKey)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
