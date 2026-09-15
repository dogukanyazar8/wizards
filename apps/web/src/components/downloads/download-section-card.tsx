"use client";

import React from "react";
import type { DownloadEnvironment, DownloadSection } from "@wizards/types";

import {
  DownloadPlatformIcon,
  ExternalLinkIcon,
  type DownloadPlatformIconKey,
} from "@/components/downloads/download-icons";
import { DownloadArrowIcon } from "@/components/support/report-icons";
import {
  downloadActionIcon,
  downloadActionLabelKey,
  downloadEnvironmentTone,
  downloadExtensionTone,
  downloadPlatformTone,
  opensInNewTab,
  visibleDownloadArtifacts,
} from "@/lib/downloads/download-presentation";
import { DOWNLOAD_METRICS, hairline, pxToRem } from "@/lib/downloads/download-metrics";

const { section } = DOWNLOAD_METRICS;

/**
 * SPEC-INDIRME §B.4/§B.5 — masaüstü ve mobil kart listeleri.
 *
 * İki bölüm aynı satır anatomisini paylaşır; farkları veri taşır: tile tonu
 * platformdan, düğme tonu ortamdan, düğme metni ve ikonu teslim biçiminden
 * gelir.
 */

export type DownloadSectionCardProps = {
  readonly emptyLabel: string;
  readonly environment: DownloadEnvironment;
  readonly label: string;
  readonly locale: "en" | "tr";
  readonly note: string | null;
  readonly section: DownloadSection;
  readonly testId: string;
  readonly translate: (key: string) => string;
  readonly versionPill: string | null;
  readonly marginTop: number;
};

export function DownloadSectionCard({
  emptyLabel,
  environment,
  label,
  locale,
  marginTop,
  note,
  section: source,
  testId,
  translate,
  versionPill,
}: DownloadSectionCardProps) {
  const artifacts = visibleDownloadArtifacts(source);
  const buttonTone = downloadEnvironmentTone(environment);

  return (
    <>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: pxToRem(section.headerGap),
          marginTop: pxToRem(marginTop),
        }}
      >
        <span
          style={{
            color: "hsl(var(--text-muted))",
            fontFamily: "var(--font-display), sans-serif",
            fontSize: pxToRem(section.labelFontSize),
            fontWeight: 600,
            letterSpacing: `${section.labelLetterSpacing}em`,
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {versionPill === null ? null : (
          <span
            style={{
              background: "hsl(var(--surface-tertiary))",
              borderRadius: pxToRem(section.versionPillRadius),
              color: "hsl(var(--text-muted))",
              fontFamily: "var(--font-display), sans-serif",
              fontSize: pxToRem(section.versionPillFontSize),
              fontWeight: 600,
              lineHeight: 1,
              padding: `${pxToRem(section.versionPillPaddingY)} ${pxToRem(
                section.versionPillPaddingX,
              )}`,
            }}
          >
            {versionPill}
          </span>
        )}
        {note === null ? null : (
          <span
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(section.noteFontSize),
              fontWeight: 500,
              lineHeight: 1,
              marginLeft: "auto",
            }}
          >
            {note}
          </span>
        )}
      </div>

      <div
        data-testid={testId}
        style={{
          background: "hsl(var(--surface-base))",
          border: `${hairline()} solid hsl(var(--border) / ${section.cardBorderAlpha})`,
          borderRadius: pxToRem(section.cardRadius),
          marginTop: pxToRem(section.cardMarginTop),
          overflow: "hidden",
        }}
      >
        {artifacts.length === 0 ? (
          <p
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(section.emptyFontSize),
              lineHeight: section.metaLineHeight,
              margin: 0,
              padding: `${pxToRem(section.emptyPaddingY)} ${pxToRem(section.emptyPaddingX)}`,
            }}
          >
            {emptyLabel}
          </p>
        ) : (
          artifacts.map((artifact, index) => {
            const tone = downloadPlatformTone(artifact.platform);
            const extensionTone = downloadExtensionTone(artifact, environment);
            const external = downloadActionIcon(artifact) === "external";

            return (
              <div
                data-testid={`download-row-${artifact.platform}`}
                key={artifact.platform}
                style={{
                  alignItems: "center",
                  borderTop: `${hairline()} solid ${
                    index === 0 ? "transparent" : `hsl(var(--border) / ${section.rowDividerAlpha})`
                  }`,
                  display: "flex",
                  gap: pxToRem(section.rowGap),
                  padding: `${pxToRem(section.rowPaddingY)} ${pxToRem(section.rowPaddingX)}`,
                }}
              >
                <div
                  style={{
                    background: `hsl(var(--${tone}) / ${section.tileSurfaceAlpha})`,
                    borderRadius: pxToRem(section.tileRadius),
                    color: `hsl(var(--${tone}))`,
                    display: "grid",
                    flex: "none",
                    height: pxToRem(section.tileSize),
                    placeItems: "center",
                    width: pxToRem(section.tileSize),
                  }}
                >
                  <DownloadPlatformIcon
                    platform={artifact.platform as DownloadPlatformIconKey}
                    size={section.tileIconSize}
                    strokeWidth={section.tileIconStroke}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      alignItems: "center",
                      display: "flex",
                      gap: pxToRem(section.nameGap),
                    }}
                  >
                    <span
                      style={{
                        color: "hsl(var(--foreground))",
                        fontSize: pxToRem(section.nameFontSize),
                        fontWeight: 600,
                        lineHeight: section.nameLineHeight,
                      }}
                    >
                      {translate(`download.platform.${artifact.platform}`)}
                    </span>
                    <span
                      style={{
                        background:
                          extensionTone === null
                            ? "hsl(var(--surface-tertiary))"
                            : `hsl(var(--${extensionTone}) / ${section.extensionSurfaceAlpha})`,
                        borderRadius: pxToRem(section.extensionRadius),
                        color:
                          extensionTone === null
                            ? "hsl(var(--text-muted))"
                            : `hsl(var(--${extensionTone}))`,
                        flex: "none",
                        fontFamily: "var(--font-display), sans-serif",
                        fontSize: pxToRem(section.extensionFontSize),
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: `${pxToRem(section.extensionPaddingY)} ${pxToRem(
                          section.extensionPaddingX,
                        )}`,
                      }}
                    >
                      {artifact.extensionLabel[locale]}
                    </span>
                  </div>
                  <div
                    style={{
                      color: "hsl(var(--text-muted))",
                      fontSize: pxToRem(section.metaFontSize),
                      lineHeight: section.metaLineHeight,
                      marginTop: pxToRem(section.metaMarginTop),
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {artifact.metaLabel[locale]}
                  </div>
                </div>

                <a
                  data-testid={`download-action-${artifact.platform}`}
                  href={artifact.href}
                  {...(opensInNewTab(artifact)
                    ? { rel: "noopener noreferrer", target: "_blank" }
                    : {})}
                  style={{
                    alignItems: "center",
                    background: `hsl(var(--${buttonTone}) / ${section.buttonSurfaceAlpha})`,
                    border: `${hairline()} solid hsl(var(--${buttonTone}) / ${section.buttonBorderAlpha})`,
                    borderRadius: pxToRem(section.buttonRadius),
                    color: `hsl(var(--${buttonTone}))`,
                    display: "flex",
                    flex: "none",
                    fontSize: pxToRem(section.buttonFontSize),
                    fontWeight: 600,
                    gap: pxToRem(section.buttonGap),
                    height: pxToRem(section.buttonHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(section.buttonPaddingX)}`,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {external ? (
                    <ExternalLinkIcon
                      size={section.buttonIconSize}
                      strokeWidth={section.buttonIconStroke}
                    />
                  ) : (
                    <DownloadArrowIcon
                      size={section.buttonIconSize}
                      strokeWidth={section.buttonIconStroke}
                    />
                  )}
                  {translate(downloadActionLabelKey(artifact))}
                </a>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
