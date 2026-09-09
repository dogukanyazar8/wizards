"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DownloadEnvironment } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import {
  DownloadCompareTable,
  DownloadSectionCard,
} from "@/components/downloads/download-section-card";
import {
  CheckIcon,
  CloseIcon,
  DownloadArrowIcon,
  ShieldCheckIcon,
  WarningTriangleIcon,
} from "@/components/support/report-icons";
import {
  RELEASE_NOTES_ROUTE,
  downloadQueryKeys,
  fetchAppDownloads,
} from "@/lib/downloads/download-client";
import { DOWNLOAD_METRICS, hairline, pxToRem } from "@/lib/downloads/download-metrics";
import {
  catalogVersionPill,
  formatReleaseDate,
  formatVersionPill,
} from "@/lib/downloads/download-presentation";
import { REPORT_METRICS } from "@/lib/support/report-metrics";

/**
 * SPEC-INDIRME §B — "Whispr'i indir" penceresi.
 *
 * Uç iki ortamı tek istekte döndüğü için ortam değiştirmek **ağa çıkmaz**;
 * seçim yalnız hangi kataloğun çizileceğini belirler (K4).
 */

const { environment: environmentMetrics, notice, section } = DOWNLOAD_METRICS;
const { body: bodyMetrics, footer, header, motion, shell } = REPORT_METRICS;

const ENVIRONMENTS = ["prod", "uat"] as const satisfies readonly DownloadEnvironment[];

function environmentTone(environment: DownloadEnvironment): "success" | "warning" {
  return environment === "prod" ? "success" : "warning";
}

export type DownloadModalProps = {
  readonly onClose: () => void;
  readonly onNavigate: (href: string) => void;
  readonly open: boolean;
};

export function DownloadModal({ onClose, onNavigate, open }: DownloadModalProps) {
  const { locale, t } = useI18n();
  /**
   * Pencere her açılışta yeniden kurulur (`WorkspaceModals` anahtarı), bu yüzden
   * kapanışta sıfırlayan bir efekt yok: efekt olsaydı her kapanışta gereksiz bir
   * render zinciri tetiklerdi.
   */
  const [selected, setSelected] = useState<DownloadEnvironment | null>(null);

  const catalogQuery = useQuery({
    enabled: open,
    queryFn: () => fetchAppDownloads(),
    queryKey: downloadQueryKeys.catalog,
    staleTime: 60_000,
  });

  const defaultEnvironment = catalogQuery.data?.defaultEnvironment ?? "prod";
  const environment = selected ?? defaultEnvironment;
  const catalog = catalogQuery.data?.catalogs[environment] ?? null;
  const labelLocale = locale === "tr" ? "tr" : "en";

  const versionPill = useMemo(
    () => (catalog === null ? null : catalogVersionPill(catalog)),
    [catalog],
  );
  const releaseDate = useMemo(
    () => (catalog === null ? null : formatReleaseDate(catalog.desktop.releasedAt, labelLocale)),
    [catalog, labelLocale],
  );

  const tone = environmentTone(environment);

  return (
    <Modal
      className="max-w-none flex-col overflow-hidden rounded-none p-0 shadow-none backdrop-blur-none sm:rounded-none sm:p-0"
      hideHeader
      onClose={onClose}
      open={open}
      overlayClassName="items-center backdrop-blur-none"
      overlayStyle={{
        background: `hsl(var(--background) / ${shell.backdropAlpha})`,
        padding: pxToRem(shell.backdropPadding),
      }}
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(shell.radius),
        boxShadow: `0 ${pxToRem(shell.shadow.y)} ${pxToRem(shell.shadow.blur)} ${pxToRem(
          shell.shadow.spread,
        )} hsl(var(--shadow-color))`,
        display: "flex",
        maxHeight: "100%",
        maxWidth: "100%",
        width: pxToRem(DOWNLOAD_METRICS.shell.width),
      }}
      title={t("download.title")}
    >
      <div data-testid="download-modal" style={{ display: "contents" }}>
        <div
          style={{
            alignItems: "flex-start",
            borderBottom: `${hairline()} solid hsl(var(--border) / ${header.dividerAlpha})`,
            display: "flex",
            flex: "none",
            gap: pxToRem(header.gap),
            padding: `${pxToRem(header.paddingTop)} ${pxToRem(header.paddingX)} ${pxToRem(
              header.paddingBottom,
            )}`,
          }}
        >
          <div
            style={{
              background: `hsl(var(--success) / ${header.iconSurfaceAlpha})`,
              borderRadius: pxToRem(header.iconRadius),
              color: "hsl(var(--success))",
              display: "grid",
              flex: "none",
              height: pxToRem(header.iconBox),
              placeItems: "center",
              width: pxToRem(header.iconBox),
            }}
          >
            <DownloadArrowIcon size={header.iconSize} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: "hsl(var(--foreground))",
                fontFamily: "var(--font-display), sans-serif",
                fontSize: pxToRem(header.titleFontSize),
                fontWeight: 600,
                letterSpacing: "-.02em",
                lineHeight: header.titleLineHeight,
              }}
            >
              {t("download.title")}
            </div>
            <div
              style={{
                color: "hsl(var(--text-secondary))",
                fontSize: pxToRem(header.subtitleFontSize),
                lineHeight: header.subtitleLineHeight,
                marginTop: pxToRem(header.subtitleMarginTop),
              }}
            >
              {t("download.subtitle", { environment: t(`download.env.${environment}.name`) })}
            </div>
          </div>
          <button
            aria-label={t("download.footer.close")}
            data-testid="download-close"
            onClick={onClose}
            style={{
              background: "hsl(var(--surface-soft))",
              border: 0,
              borderRadius: pxToRem(header.closeRadius),
              color: "hsl(var(--text-muted))",
              cursor: "pointer",
              display: "grid",
              flex: "none",
              height: pxToRem(header.closeSize),
              placeItems: "center",
              transition: `background ${motion.transitionSeconds}s`,
              width: pxToRem(header.closeSize),
            }}
            title={t("download.footer.close")}
            type="button"
          >
            <CloseIcon size={header.closeIconSize} strokeWidth={header.closeIconStroke} />
          </button>
        </div>

        <div
          data-testid="download-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: `${pxToRem(bodyMetrics.paddingTop)} ${pxToRem(
              bodyMetrics.paddingX,
            )} ${pxToRem(bodyMetrics.paddingBottom)}`,
          }}
        >
          <span
            style={{
              color: "hsl(var(--text-muted))",
              display: "block",
              fontFamily: "var(--font-display), sans-serif",
              fontSize: pxToRem(section.labelFontSize),
              fontWeight: 600,
              letterSpacing: `${section.labelLetterSpacing}em`,
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            {t("download.environment")}
          </span>

          <div
            aria-label={t("download.environment")}
            role="radiogroup"
            style={{
              display: "grid",
              gap: pxToRem(environmentMetrics.gap),
              gridTemplateColumns: "1fr 1fr",
              marginTop: pxToRem(environmentMetrics.marginTop),
            }}
          >
            {ENVIRONMENTS.map((candidate) => {
              const active = candidate === environment;
              const candidateTone = environmentTone(candidate);

              return (
                <button
                  aria-checked={active}
                  data-testid={`download-environment-${candidate}`}
                  key={candidate}
                  onClick={() => setSelected(candidate)}
                  role="radio"
                  style={{
                    alignItems: "flex-start",
                    background: active
                      ? `hsl(var(--${candidateTone}) / ${environmentMetrics.surfaceSelectedAlpha})`
                      : "hsl(var(--surface-base))",
                    border: `${hairline(environmentMetrics.borderWidth)} solid ${
                      active
                        ? `hsl(var(--${candidateTone}))`
                        : `hsl(var(--border) / ${environmentMetrics.borderIdleAlpha})`
                    }`,
                    borderRadius: pxToRem(environmentMetrics.radius),
                    cursor: "pointer",
                    display: "flex",
                    gap: pxToRem(environmentMetrics.cardGap),
                    padding: `${pxToRem(environmentMetrics.paddingY)} ${pxToRem(
                      environmentMetrics.paddingX,
                    )}`,
                    textAlign: "left",
                    transition: `background ${motion.transitionSeconds}s, border-color ${motion.transitionSeconds}s`,
                  }}
                  type="button"
                >
                  <span
                    style={{
                      background: active ? `hsl(var(--${candidateTone}))` : "transparent",
                      border: `${hairline(environmentMetrics.dotBorderWidth)} solid ${
                        active ? `hsl(var(--${candidateTone}))` : "hsl(var(--border))"
                      }`,
                      borderRadius: "50%",
                      color: "#fff",
                      display: "grid",
                      flex: "none",
                      height: pxToRem(environmentMetrics.dotSize),
                      marginTop: pxToRem(environmentMetrics.dotMarginTop),
                      placeItems: "center",
                      width: pxToRem(environmentMetrics.dotSize),
                    }}
                  >
                    {active ? (
                      <CheckIcon
                        size={environmentMetrics.checkIconSize}
                        strokeWidth={environmentMetrics.checkIconStroke}
                      />
                    ) : null}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        alignItems: "center",
                        display: "flex",
                        gap: pxToRem(environmentMetrics.nameGap),
                      }}
                    >
                      <span
                        style={{
                          color: "hsl(var(--foreground))",
                          fontFamily: "var(--font-display), sans-serif",
                          fontSize: pxToRem(environmentMetrics.nameFontSize),
                          fontWeight: 600,
                          letterSpacing: `${environmentMetrics.nameLetterSpacing}em`,
                          lineHeight: environmentMetrics.nameLineHeight,
                        }}
                      >
                        {t(`download.env.${candidate}.name`)}
                      </span>
                      <span
                        style={{
                          background: `hsl(var(--${candidateTone}) / ${environmentMetrics.tagSurfaceAlpha})`,
                          borderRadius: pxToRem(environmentMetrics.tagRadius),
                          color: `hsl(var(--${candidateTone}))`,
                          fontFamily: "var(--font-display), sans-serif",
                          fontSize: pxToRem(environmentMetrics.tagFontSize),
                          fontWeight: 600,
                          lineHeight: 1,
                          padding: `${pxToRem(environmentMetrics.tagPaddingY)} ${pxToRem(
                            environmentMetrics.tagPaddingX,
                          )}`,
                        }}
                      >
                        {t(`download.env.${candidate}.pill`)}
                      </span>
                    </span>
                    <span
                      style={{
                        color: "hsl(var(--text-muted))",
                        display: "block",
                        fontSize: pxToRem(environmentMetrics.subtitleFontSize),
                        lineHeight: environmentMetrics.subtitleLineHeight,
                        marginTop: pxToRem(environmentMetrics.subtitleMarginTop),
                      }}
                    >
                      {t(`download.env.${candidate}.body`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            data-testid="download-notice"
            style={{
              alignItems: "center",
              background: `hsl(var(--${tone}) / ${
                environment === "prod" ? notice.prodSurfaceAlpha : notice.uatSurfaceAlpha
              })`,
              border: `${hairline()} solid hsl(var(--${tone}) / ${
                environment === "prod" ? notice.prodBorderAlpha : notice.uatBorderAlpha
              })`,
              borderRadius: pxToRem(notice.radius),
              display: "flex",
              flexWrap: "wrap",
              gap: pxToRem(notice.gap),
              marginTop: pxToRem(notice.marginTop),
              padding: `${pxToRem(notice.paddingY)} ${pxToRem(notice.paddingX)}`,
            }}
          >
            <span style={{ color: `hsl(var(--${tone}))`, display: "grid", flex: "none" }}>
              {environment === "prod" ? (
                <ShieldCheckIcon size={notice.iconSize} strokeWidth={notice.iconStroke} />
              ) : (
                <WarningTriangleIcon size={notice.iconSize} strokeWidth={notice.iconStroke} />
              )}
            </span>
            <span
              style={{
                color: `hsl(var(--${tone}))`,
                flex: 1,
                fontSize: pxToRem(notice.fontSize),
                lineHeight: notice.lineHeight,
                minWidth: pxToRem(notice.textMinWidth),
                textWrap: "pretty",
              }}
            >
              {t(`download.notice.${environment}`)}
            </span>
            {versionPill === null ? null : (
              <span
                data-testid="download-version-pill"
                style={{
                  background: "hsl(var(--surface-card))",
                  borderRadius: pxToRem(999),
                  color: "hsl(var(--text-secondary))",
                  flex: "none",
                  fontFamily: "var(--font-display), sans-serif",
                  fontSize: pxToRem(notice.pillFontSize),
                  fontWeight: 600,
                  lineHeight: 1,
                  padding: `${pxToRem(notice.pillPaddingY)} ${pxToRem(notice.pillPaddingX)}`,
                }}
              >
                {versionPill}
              </span>
            )}
          </div>

          {/* Tasarımda karşılığı olmayan iki durum: yükleniyor ve okunamadı.
              Yeni bir görsel dil kurulmadı, tek satırlık nötr metinler. */}
          {catalogQuery.isPending ? (
            <p
              data-testid="download-loading"
              style={{
                color: "hsl(var(--text-muted))",
                fontSize: pxToRem(section.emptyFontSize),
                marginTop: pxToRem(section.desktopMarginTop),
              }}
            >
              {t("download.loading")}
            </p>
          ) : null}

          {catalogQuery.isError ? (
            <div
              data-testid="download-error"
              role="alert"
              style={{
                alignItems: "center",
                background: `hsl(var(--danger) / ${REPORT_METRICS.notice.dangerSurfaceAlpha})`,
                border: `${hairline()} solid hsl(var(--danger) / ${REPORT_METRICS.notice.dangerBorderAlpha})`,
                borderRadius: pxToRem(REPORT_METRICS.notice.radius),
                color: "hsl(var(--danger))",
                display: "flex",
                gap: pxToRem(REPORT_METRICS.notice.gap),
                marginTop: pxToRem(section.desktopMarginTop),
                padding: `${pxToRem(REPORT_METRICS.notice.paddingY)} ${pxToRem(
                  REPORT_METRICS.notice.paddingX,
                )}`,
              }}
            >
              <span style={{ flex: 1, fontSize: pxToRem(REPORT_METRICS.notice.fontSize) }}>
                {t("download.error")}
              </span>
              <button
                data-testid="download-error-retry"
                onClick={() => void catalogQuery.refetch()}
                style={{
                  background: "transparent",
                  border: `${hairline()} solid hsl(var(--danger) / ${REPORT_METRICS.notice.retryBorderAlpha})`,
                  borderRadius: pxToRem(REPORT_METRICS.notice.retryRadius),
                  color: "hsl(var(--danger))",
                  cursor: "pointer",
                  flex: "none",
                  fontSize: pxToRem(REPORT_METRICS.notice.retryFontSize),
                  fontWeight: 600,
                  height: pxToRem(REPORT_METRICS.notice.retryHeight),
                  lineHeight: 1,
                  padding: `0 ${pxToRem(REPORT_METRICS.notice.retryPaddingX)}`,
                }}
                type="button"
              >
                {t("download.error.retry")}
              </button>
            </div>
          ) : null}

          {catalog === null ? null : (
            <>
              <DownloadSectionCard
                emptyLabel={t("download.empty")}
                environment={environment}
                label={t("download.desktop")}
                locale={labelLocale}
                marginTop={section.desktopMarginTop}
                note={releaseDate}
                section={catalog.desktop}
                testId="download-desktop"
                translate={t}
                versionPill={catalog.desktop.versionLabel}
              />

              <DownloadSectionCard
                emptyLabel={t("download.empty")}
                environment={environment}
                label={t("download.mobile")}
                locale={labelLocale}
                marginTop={section.mobileMarginTop}
                note={t(`download.mobile.note.${environment}`)}
                section={catalog.mobile}
                testId="download-mobile"
                translate={t}
                versionPill={formatVersionPill(catalog.mobile)}
              />
            </>
          )}

          <DownloadCompareTable environment={environment} translate={t} />
        </div>

        <div
          style={{
            alignItems: "center",
            background: `hsl(var(--surface-secondary) / ${footer.surfaceAlpha})`,
            borderTop: `${hairline()} solid hsl(var(--border) / ${footer.dividerAlpha})`,
            display: "flex",
            flex: "none",
            flexWrap: "wrap",
            gap: pxToRem(footer.gap),
            padding: `${pxToRem(footer.paddingY)} ${pxToRem(footer.paddingX)}`,
          }}
        >
          <span
            style={{
              color: "hsl(var(--text-muted))",
              flex: 1,
              fontSize: pxToRem(footer.noteFontSize),
              lineHeight: footer.noteLineHeight,
              minWidth: pxToRem(footer.noteMinWidth),
            }}
          >
            {t("download.footer.note")}
          </span>
          <button
            data-testid="download-release-notes"
            onClick={() => {
              onClose();
              onNavigate(RELEASE_NOTES_ROUTE);
            }}
            style={{
              background: "transparent",
              border: `${hairline()} solid hsl(var(--border))`,
              borderRadius: pxToRem(footer.buttonRadius),
              color: "hsl(var(--text-secondary))",
              cursor: "pointer",
              flex: "none",
              fontSize: pxToRem(footer.buttonFontSize),
              fontWeight: 600,
              height: pxToRem(footer.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(DOWNLOAD_METRICS.footer.secondaryPaddingX)}`,
              transition: `background ${motion.transitionSeconds}s`,
              whiteSpace: "nowrap",
            }}
            type="button"
          >
            {t("download.footer.releaseNotes")}
          </button>
          <button
            data-testid="download-footer-close"
            onClick={onClose}
            style={{
              background: "hsl(var(--primary))",
              border: 0,
              borderRadius: pxToRem(footer.buttonRadius),
              boxShadow: `0 ${pxToRem(footer.shadow.y)} ${pxToRem(footer.shadow.blur)} ${pxToRem(
                footer.shadow.spread,
              )} hsl(var(--primary))`,
              color: "#fff",
              cursor: "pointer",
              flex: "none",
              fontSize: pxToRem(footer.buttonFontSize),
              fontWeight: 600,
              height: pxToRem(footer.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(DOWNLOAD_METRICS.footer.primaryPaddingX)}`,
              transition: `filter ${motion.transitionSeconds}s`,
              whiteSpace: "nowrap",
            }}
            type="button"
          >
            {t("download.footer.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
