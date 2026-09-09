"use client";

import React from "react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Whispr kartı (`o1`) — SPEC §5.6, başlıksız grup (sapma #8).
 *
 * 56 px logo, ürün açıklaması, dört bağlantı. Bağlantılar **gerçek** hedeflere gider:
 * `/privacy` ve `/terms` `(legal)/[legalDocument]` rotasının okuduğu iki belge
 * (`lib/legal/legal-documents.ts`), `Web sitesi` uygulamanın kendi köküdür.
 *
 * `Lisanslar`ın karşılığı web tarafında **yok** — açık kaynak lisans dökümü bugün yalnız mobil
 * uygulamada var (`apps/mobile/src/legal/`). Uydurma bir URL yazmak yerine satır `disabled`
 * çizilir; kullanıcı tıklanmayan bir bağlantı görür ama var olmayan bir sayfaya gitmez.
 *
 * TODO(api): web tarafına açık kaynak lisans manifesti + `/licenses` rotası geldiğinde
 * `LICENSES_HREF` doldurulur ve `disabled` kalkar.
 */

const { about } = SETTINGS_METRICS.blocks;

const LICENSES_HREF: string | null = null;

type AboutLink = {
  readonly href: string | null;
  readonly key: string;
  readonly labelKey: string;
};

const ABOUT_LINKS: readonly AboutLink[] = [
  { href: "/", key: "website", labelKey: "settings.block.about.link.website" },
  { href: "/privacy", key: "privacy", labelKey: "settings.block.about.link.privacy" },
  { href: "/terms", key: "terms", labelKey: "settings.block.about.link.terms" },
  { href: LICENSES_HREF, key: "licenses", labelKey: "settings.block.about.link.licenses" },
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
      <div
        aria-hidden="true"
        className="font-display grid flex-none place-items-center"
        style={{
          background: "hsl(var(--primary))",
          borderRadius: pxToRem(about.logoRadius),
          // Tasarımın tek ters metni: primary zemin üstündeki beyaz (kalite çıtası istisnası).
          color: "#fff",
          fontSize: pxToRem(about.logoFontSize),
          fontWeight: about.logoWeight,
          height: pxToRem(about.logoSize),
          lineHeight: 1,
          width: pxToRem(about.logoSize),
        }}
      >
        W
      </div>

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
            maxWidth: pxToRem(about.bodyMaxWidth),
          }}
        >
          {t("settings.block.about.body")}
        </div>

        <div
          className="flex flex-wrap"
          style={{ gap: pxToRem(about.linksGap), marginTop: pxToRem(about.linksMarginTop) }}
        >
          {ABOUT_LINKS.map((link) =>
            link.href ? (
              <Link
                className="text-[var(--primary-readable)] no-underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid={`settings-about-link-${link.key}`}
                href={link.href}
                key={link.key}
                style={linkStyle}
              >
                {t(link.labelKey)}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="cursor-not-allowed text-[hsl(var(--text-muted))]"
                data-testid={`settings-about-link-${link.key}`}
                data-unavailable="true"
                key={link.key}
                style={{
                  ...linkStyle,
                  borderBottom: `${hairline()} dashed hsl(var(--border))`,
                }}
              >
                {t(link.labelKey)}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
