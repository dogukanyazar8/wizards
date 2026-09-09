"use client";

import React from "react";

import { ReportAttachmentRow, ReportToggle } from "@/components/support/bug-report-parts";
import {
  ExpandIcon,
  ScreenshotBarsIcon,
  WarningTriangleIcon,
} from "@/components/support/report-icons";
import {
  bugReportScreenshotAction,
  bugReportScreenshotBoxIntent,
  isBugReportScreenshotActionVisible,
  type BugReportScreenshotState,
} from "@/lib/support/bug-report-form-model";
import { REPORT_METRICS, hairline, pxToRem } from "@/lib/support/report-metrics";

const { screenshot } = REPORT_METRICS;

/**
 * SPEC §A.5 alt bölümü — ekran görüntüsü satırının **dört** durumu.
 *
 * Yükleniyor durumunda tek başına bir spinner yetmez (kabul kriteri): yüzde
 * hem kutunun içinde hem alt metinde yazılı, altında da ilerleme çubuğu var.
 */

export type BugReportScreenshotRowProps = {
  readonly actionLabel: string;
  readonly boxTitle: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onAction: () => void;
  readonly onBoxClick: () => void;
  readonly onToggle: (next: boolean) => void;
  readonly percent: number;
  readonly state: BugReportScreenshotState;
  readonly subtitle: string;
  readonly title: string;
  readonly toggleLabel: string;
};

function boxBorderColor(state: BugReportScreenshotState): string {
  if (state === "failed") {
    return `hsl(var(--danger) / ${screenshot.boxBorderFailAlpha})`;
  }

  if (state === "uploading") {
    return `hsl(var(--primary) / ${screenshot.boxBorderBusyAlpha})`;
  }

  return "hsl(var(--border))";
}

export function BugReportScreenshotRow({
  actionLabel,
  boxTitle,
  checked,
  disabled,
  onAction,
  onBoxClick,
  onToggle,
  percent,
  state,
  subtitle,
  title,
  toggleLabel,
}: BugReportScreenshotRowProps) {
  const isFailed = state === "failed";
  const isUploading = state === "uploading";
  const isReady = state === "ready";
  const action = bugReportScreenshotAction(state);

  const box = (
    <button
      data-testid="bug-report-screenshot-box"
      data-state={state}
      disabled={disabled}
      onClick={onBoxClick}
      style={{
        alignItems: "center",
        background: isFailed
          ? `hsl(var(--danger) / ${screenshot.boxSurfaceFailAlpha})`
          : "hsl(var(--surface-secondary))",
        border: `${hairline()} ${state === "none" ? "dashed" : "solid"} ${boxBorderColor(state)}`,
        borderRadius: pxToRem(screenshot.boxRadius),
        color: isFailed ? "hsl(var(--danger))" : "hsl(var(--text-muted))",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "grid",
        flex: "none",
        height: pxToRem(screenshot.boxHeight),
        justifyItems: "center",
        overflow: "hidden",
        padding: 0,
        placeItems: "center",
        position: "relative",
        width: pxToRem(screenshot.boxWidth),
      }}
      title={boxTitle}
      type="button"
    >
      {state === "none" ? (
        <ScreenshotBarsIcon
          size={screenshot.emptyIconSize}
          strokeWidth={screenshot.emptyIconStroke}
        />
      ) : null}

      {isReady ? (
        <>
          <span
            style={{
              background: `repeating-linear-gradient(135deg,hsl(var(--surface-tertiary)) 0 ${pxToRem(
                screenshot.stripeStep,
              )},hsl(var(--surface-secondary)) ${pxToRem(screenshot.stripeStep)} ${pxToRem(
                screenshot.stripePeriod,
              )})`,
              inset: 0,
              position: "absolute",
            }}
          />
          <span
            style={{
              background: `hsl(var(--surface-card) / ${screenshot.zoomBadgeAlpha})`,
              borderRadius: "50%",
              color: "hsl(var(--text-secondary))",
              display: "grid",
              height: pxToRem(screenshot.zoomBadge),
              placeItems: "center",
              position: "relative",
              width: pxToRem(screenshot.zoomBadge),
            }}
          >
            <ExpandIcon size={screenshot.zoomIconSize} strokeWidth={screenshot.zoomIconStroke} />
          </span>
        </>
      ) : null}

      {isUploading ? (
        <span
          style={{
            color: "hsl(var(--primary))",
            fontFamily: "var(--font-display), sans-serif",
            fontSize: pxToRem(screenshot.busyFontSize),
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          %{percent}
        </span>
      ) : null}

      {isFailed ? (
        <WarningTriangleIcon
          size={screenshot.failIconSize}
          strokeWidth={screenshot.failIconStroke}
        />
      ) : null}
    </button>
  );

  const inlineAction = isBugReportScreenshotActionVisible(state) ? (
    <button
      data-testid="bug-report-screenshot-action"
      disabled={disabled}
      onClick={onAction}
      style={{
        background: "transparent",
        border: 0,
        color: action === "remove" ? "hsl(var(--danger))" : "hsl(var(--primary))",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: pxToRem(screenshot.actionFontSize),
        fontWeight: 600,
        lineHeight: 1,
        padding: 0,
        textDecoration: "underline",
        textUnderlineOffset: pxToRem(screenshot.actionUnderlineOffset),
        whiteSpace: "nowrap",
      }}
      type="button"
    >
      {actionLabel}
    </button>
  ) : null;

  const progress = isUploading ? (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      data-testid="bug-report-screenshot-progress"
      role="progressbar"
      style={{
        background: "hsl(var(--surface-tertiary))",
        borderRadius: pxToRem(999),
        height: pxToRem(screenshot.progressHeight),
        marginTop: pxToRem(screenshot.progressMarginTop),
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "hsl(var(--primary))",
          borderRadius: pxToRem(999),
          height: "100%",
          width: `${percent}%`,
        }}
      />
    </div>
  ) : null;

  return (
    <ReportAttachmentRow
      belowSubtitle={progress}
      control={
        <ReportToggle
          checked={checked}
          disabled={disabled}
          label={toggleLabel}
          onChange={onToggle}
          testId="bug-report-screenshot-toggle"
        />
      }
      leading={box}
      subtitle={subtitle}
      subtitleColor={isFailed ? "hsl(var(--danger))" : "hsl(var(--text-muted))"}
      testId="bug-report-screenshot-row"
      title={title}
      titleTrailing={inlineAction}
      withDivider
    />
  );
}

export { bugReportScreenshotBoxIntent };
