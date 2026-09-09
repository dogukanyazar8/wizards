"use client";

import React from "react";
import Link from "next/link";
import type { DiscoverServer } from "@wizards/types";
import { formatServerProfileCount } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";
import type { DiscoverRouteState } from "@/lib/discover/routes";

export type DiscoverFeaturedProps = {
  readonly onJoin: (server: DiscoverServer) => void;
  readonly onPreview?: () => void;
  readonly previewHref: string;
  readonly server: DiscoverServer;
};

export function discoverFeaturedPreviewId(serverId: string): string {
  return `discover-featured-preview-${serverId}`;
}

export function shouldShowDiscoverFeatured(
  route: DiscoverRouteState,
  server: DiscoverServer | null,
): boolean {
  return (
    route.lane === "servers" &&
    route.category === "all" &&
    route.q.length === 0 &&
    route.panelServerId === null &&
    server !== null &&
    server.featured
  );
}

function categoryKey(category: NonNullable<DiscoverServer["category"]>): string {
  return `discover.category.${category}`;
}

function formatLanguages(languages: readonly string[], locale: "tr" | "en"): string | null {
  if (languages.length === 0) {
    return null;
  }

  const names = new Intl.DisplayNames([locale], { type: "language" });
  return languages
    .map((language) => names.of(language) ?? language)
    .map((language) => `${language.charAt(0).toLocaleUpperCase(locale)}${language.slice(1)}`)
    .join(" · ");
}

export function DiscoverFeatured({
  onJoin,
  onPreview,
  previewHref,
  server,
}: DiscoverFeaturedProps) {
  const { locale, t } = useI18n();
  const metrics = DISCOVER_METRICS.featured;
  const category = server.category === null ? null : t(categoryKey(server.category));
  const languages = formatLanguages(server.languages, locale);
  const memberCount = formatServerProfileCount(server.memberCount, locale);
  const onlineCount = formatServerProfileCount(server.onlineCount, locale);

  return (
    <article
      className="flex flex-wrap bg-[hsl(var(--primary)/0.08)]"
      data-testid="discover-featured"
      style={{
        border: `${hairline(metrics.borderWidth)} solid hsl(var(--primary)/0.3)`,
        borderRadius: pxToRem(metrics.radius),
        gap: pxToRem(metrics.gap),
        marginBottom: pxToRem(metrics.marginBottom),
        padding: `${pxToRem(metrics.paddingY)} ${pxToRem(metrics.paddingX)}`,
      }}
    >
      <div
        aria-hidden
        className="grid flex-none place-items-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
        style={{
          background: server.iconUrl
            ? `center / cover no-repeat url(${JSON.stringify(server.iconUrl)})`
            : getServerIconToneColor(server.iconColor ?? "primary"),
          borderRadius: pxToRem(metrics.tileRadius),
          boxShadow: `${pxToRem(metrics.tileShadow.x)} ${pxToRem(metrics.tileShadow.y)} ${pxToRem(metrics.tileShadow.blur)} ${pxToRem(metrics.tileShadow.spread)} ${getServerIconToneColor(server.iconColor ?? "primary")}`,
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(metrics.tileFontSize),
          fontWeight: metrics.tileWeight,
          height: pxToRem(metrics.tileSize),
          width: pxToRem(metrics.tileSize),
        }}
      >
        {server.iconUrl ? "" : server.initials}
      </div>

      <div style={{ flex: `1 1 ${pxToRem(metrics.textColFlexBasis)}`, minWidth: 0 }}>
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(metrics.badgeRowGap) }}>
          <span
            className="flex-none bg-[hsl(var(--primary)/0.18)] uppercase"
            style={{
              borderRadius: pxToRem(metrics.badgeRadius),
              color: "color-mix(in srgb, hsl(var(--primary)) 55%, hsl(var(--foreground)))",
              fontFamily: "var(--font-sans)",
              fontSize: pxToRem(metrics.badgeFontSize),
              fontWeight: metrics.badgeWeight,
              letterSpacing: `${metrics.badgeLetterSpacing}em`,
              lineHeight: 1,
              padding: `${pxToRem(metrics.badgePaddingY)} ${pxToRem(metrics.badgePaddingX)}`,
            }}
          >
            {t("discover.featured")}
          </span>
          <span
            className="flex flex-none items-center text-[var(--success-readable)]"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: pxToRem(metrics.onlineFontSize),
              fontWeight: metrics.onlineWeight,
              gap: pxToRem(metrics.onlineGap),
              lineHeight: 1,
            }}
          >
            <span
              aria-hidden
              className="rounded-full bg-[hsl(var(--success))]"
              style={{
                height: pxToRem(metrics.onlineDotSize),
                width: pxToRem(metrics.onlineDotSize),
              }}
            />
            {t("discover.card.online", { count: onlineCount })}
          </span>
        </div>

        <h2
          className="truncate text-[hsl(var(--foreground))]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(metrics.nameFontSize),
            fontWeight: metrics.nameWeight,
            letterSpacing: `${metrics.nameLetterSpacing}em`,
            lineHeight: metrics.nameLineHeight,
            marginTop: pxToRem(metrics.nameMarginTop),
          }}
        >
          {server.name}
        </h2>
        <p
          className="text-[hsl(var(--text-secondary))]"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: pxToRem(metrics.bodyFontSize),
            lineHeight: metrics.bodyLineHeight,
            marginTop: pxToRem(metrics.bodyMarginTop),
            maxWidth: pxToRem(metrics.bodyMaxWidth),
            textWrap: "pretty",
          }}
        >
          {server.description}
        </p>
        <div
          className="flex flex-wrap items-center"
          style={{ gap: pxToRem(metrics.metaRowGap), marginTop: pxToRem(metrics.metaRowMarginTop) }}
        >
          {[t("discover.card.members", { count: memberCount }), category, languages]
            .filter((value): value is string => value !== null)
            .map((value) => (
              <span
                data-testid="discover-featured-meta"
                key={value}
                className="whitespace-nowrap bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))]"
                style={{
                  border: `${hairline(metrics.metaPillBorderWidth)} solid hsl(var(--border)/0.7)`,
                  borderRadius: pxToRem(metrics.metaPillRadius),
                  fontFamily: "var(--font-sans)",
                  fontSize: pxToRem(metrics.metaPillFontSize),
                  fontWeight: metrics.metaPillWeight,
                  lineHeight: 1,
                  padding: `${pxToRem(metrics.metaPillPaddingY)} ${pxToRem(metrics.metaPillPaddingX)}`,
                }}
              >
                {value}
              </span>
            ))}
        </div>
      </div>

      <div
        className="flex flex-none flex-col justify-center"
        data-testid="discover-featured-actions"
        style={{ gap: pxToRem(metrics.ctaColGap), width: pxToRem(metrics.ctaColWidth) }}
      >
        <button
          className={
            server.joined
              ? "border-0 bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-secondary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              : "border-0 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          }
          disabled={server.joined}
          onClick={() => onJoin(server)}
          style={{
            borderRadius: pxToRem(metrics.ctaRadius),
            fontFamily: "var(--font-sans)",
            fontSize: pxToRem(metrics.ctaFontSize),
            fontWeight: metrics.ctaWeight,
            height: pxToRem(metrics.ctaHeight),
            lineHeight: 1,
          }}
          type="button"
        >
          {server.joined ? t("discover.featured.member") : t("discover.card.join")}
        </button>
        <Link
          className="grid place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          href={previewHref}
          id={discoverFeaturedPreviewId(server.id)}
          {...(onPreview ? { onClick: onPreview } : {})}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(metrics.ctaRadius),
            fontFamily: "var(--font-sans)",
            fontSize: pxToRem(metrics.ctaFontSize),
            fontWeight: metrics.ctaWeight,
            height: pxToRem(metrics.ctaHeight),
            lineHeight: 1,
          }}
        >
          {t("discover.card.preview")}
        </Link>
      </div>
    </article>
  );
}
