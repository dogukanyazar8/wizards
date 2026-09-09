"use client";

import React, { type CSSProperties, type ReactNode } from "react";

import { ErrorCircleIcon, OfflineIcon } from "@/components/support/report-icons";
import { REPORT_METRICS, hairline, pxToRem } from "@/lib/support/report-metrics";

const { attachments, groupLabel, motion, notice, toggle } = REPORT_METRICS;

/** SPEC §A.3 — `600 10px`, `letter-spacing:.15em`, uppercase, `text-muted`. */
export function ReportGroupLabel({
  children,
  marginTop,
  pill,
}: {
  readonly children: ReactNode;
  readonly marginTop?: number;
  readonly pill?: ReactNode;
}) {
  const label = (
    <span
      style={{
        color: "hsl(var(--text-muted))",
        fontFamily: "var(--font-display), sans-serif",
        fontSize: pxToRem(groupLabel.fontSize),
        fontWeight: 600,
        letterSpacing: `${groupLabel.letterSpacing}em`,
        lineHeight: 1,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: pxToRem(groupLabel.gap),
        ...(marginTop === undefined ? {} : { marginTop: pxToRem(marginTop) }),
      }}
    >
      {label}
      {pill}
    </div>
  );
}

/** "Zorunlu" pili — SPEC §A.3. */
export function ReportRequiredPill({ children }: { readonly children: ReactNode }) {
  return (
    <span
      style={{
        background: `hsl(var(--danger) / ${groupLabel.pillSurfaceAlpha})`,
        borderRadius: pxToRem(groupLabel.pillRadius),
        color: "hsl(var(--danger))",
        fontFamily: "var(--font-display), sans-serif",
        fontSize: pxToRem(groupLabel.pillFontSize),
        fontWeight: 600,
        lineHeight: 1,
        padding: `${pxToRem(groupLabel.pillPaddingY)} ${pxToRem(groupLabel.pillPaddingX)}`,
      }}
    >
      {children}
    </span>
  );
}

/** SPEC §A.5 — 40×22 anahtar, `#fff` topuz (tasarımın üç sabit renginden biri). */
export function ReportToggle({
  checked,
  disabled = false,
  label,
  onChange,
  testId,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (next: boolean) => void;
  readonly testId: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      style={{
        background: checked ? "hsl(var(--primary))" : "hsl(var(--surface-tertiary))",
        border: 0,
        borderRadius: pxToRem(999),
        cursor: disabled ? "not-allowed" : "pointer",
        flex: "none",
        height: pxToRem(toggle.height),
        position: "relative",
        transition: `background ${motion.transitionSeconds}s`,
        width: pxToRem(toggle.width),
      }}
      type="button"
    >
      <span
        style={{
          background: "#fff",
          borderRadius: "50%",
          height: pxToRem(toggle.knobSize),
          left: pxToRem(checked ? toggle.knobLeftOn : toggle.knobLeftOff),
          position: "absolute",
          top: pxToRem(toggle.knobTop),
          transition: `left ${motion.transitionSeconds}s`,
          width: pxToRem(toggle.knobSize),
        }}
      />
    </button>
  );
}

/** "Rapora eklenecekler" kartındaki bir satır. */
export function ReportAttachmentRow({
  belowSubtitle,
  control,
  leading,
  subtitle,
  subtitleColor = "hsl(var(--text-muted))",
  testId,
  title,
  titleTrailing,
  withDivider,
}: {
  /** Alt metnin **altına** düşen blok; ellipsis kırpmasının dışında kalır. */
  readonly belowSubtitle?: ReactNode;
  readonly control: ReactNode;
  readonly leading?: ReactNode;
  readonly subtitle: ReactNode;
  readonly subtitleColor?: string;
  readonly testId: string;
  readonly title: string;
  readonly titleTrailing?: ReactNode;
  readonly withDivider: boolean;
}) {
  return (
    <>
      {withDivider ? (
        <div
          style={{
            background: `hsl(var(--border) / ${attachments.dividerAlpha})`,
            height: hairline(),
          }}
        />
      ) : null}
      <div
        data-testid={testId}
        style={{
          alignItems: "center",
          display: "flex",
          gap: pxToRem(attachments.rowGap),
          padding: `${pxToRem(attachments.rowPaddingY)} ${pxToRem(attachments.rowPaddingX)}`,
        }}
      >
        {leading}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: pxToRem(REPORT_METRICS.screenshot.actionGap),
            }}
          >
            <span
              style={{
                color: "hsl(var(--foreground))",
                fontSize: pxToRem(attachments.titleFontSize),
                fontWeight: 600,
                lineHeight: attachments.titleLineHeight,
              }}
            >
              {title}
            </span>
            {titleTrailing}
          </div>
          <div
            style={{
              color: subtitleColor,
              fontSize: pxToRem(attachments.subtitleFontSize),
              lineHeight: attachments.subtitleLineHeight,
              marginTop: pxToRem(attachments.subtitleMarginTop),
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
          {belowSubtitle}
        </div>
        {control}
      </div>
    </>
  );
}

export type ReportNoticeTone = "danger" | "warning";

/** SPEC §A.7 — hata ve çevrimdışı satırları; ton dışında aynı kutu. */
export function ReportNotice({
  action,
  children,
  testId,
  tone,
}: {
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly testId: string;
  readonly tone: ReportNoticeTone;
}) {
  const surfaceAlpha = tone === "danger" ? notice.dangerSurfaceAlpha : notice.warningSurfaceAlpha;
  const borderAlpha = tone === "danger" ? notice.dangerBorderAlpha : notice.warningBorderAlpha;
  const iconStyle: CSSProperties = { flex: "none", marginTop: pxToRem(notice.iconMarginTop) };

  return (
    <div
      data-testid={testId}
      role="alert"
      style={{
        alignItems: "flex-start",
        background: `hsl(var(--${tone}) / ${surfaceAlpha})`,
        border: `${hairline()} solid hsl(var(--${tone}) / ${borderAlpha})`,
        borderRadius: pxToRem(notice.radius),
        display: "flex",
        gap: pxToRem(notice.gap),
        marginTop: pxToRem(notice.marginTop),
        padding: `${pxToRem(notice.paddingY)} ${pxToRem(notice.paddingX)}`,
      }}
    >
      <span style={{ ...iconStyle, color: `hsl(var(--${tone}))` }}>
        {tone === "danger" ? (
          <ErrorCircleIcon size={notice.iconSize} strokeWidth={notice.iconStroke} />
        ) : (
          <OfflineIcon size={notice.iconSize} strokeWidth={notice.iconStroke} />
        )}
      </span>
      <span
        style={{
          color: `hsl(var(--${tone}))`,
          flex: 1,
          fontSize: pxToRem(notice.fontSize),
          lineHeight: notice.lineHeight,
          minWidth: 0,
          textWrap: "pretty",
        }}
      >
        {children}
      </span>
      {action}
    </div>
  );
}

/** Hata satırının sağındaki "Tekrar dene" düğmesi. */
export function ReportNoticeAction({
  children,
  onClick,
  testId,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      style={{
        background: "transparent",
        border: `${hairline()} solid hsl(var(--danger) / ${notice.retryBorderAlpha})`,
        borderRadius: pxToRem(notice.retryRadius),
        color: "hsl(var(--danger))",
        cursor: "pointer",
        flex: "none",
        fontSize: pxToRem(notice.retryFontSize),
        fontWeight: 600,
        height: pxToRem(notice.retryHeight),
        lineHeight: 1,
        padding: `0 ${pxToRem(notice.retryPaddingX)}`,
        whiteSpace: "nowrap",
      }}
      type="button"
    >
      {children}
    </button>
  );
}
