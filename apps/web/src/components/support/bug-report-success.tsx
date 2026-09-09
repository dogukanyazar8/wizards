"use client";

import React from "react";

import { CheckIcon, CopyIcon } from "@/components/support/report-icons";
import { REPORT_METRICS, hairline, pxToRem } from "@/lib/support/report-metrics";

const { footer, motion, success } = REPORT_METRICS;

/**
 * SPEC §A.11 — gönderim bitince gövde ve alt bar yerine gelen ekran. Toast
 * değil: bilet numarası kullanıcının kopyalaması gereken bir şey, kaybolan bir
 * bildirimde duramaz.
 */
export function BugReportSuccess({
  body,
  closeLabel,
  copied,
  copiedLabel,
  copyLabel,
  onClose,
  onCopy,
  ticket,
  title,
}: {
  readonly body: string;
  readonly closeLabel: string;
  readonly copied: boolean;
  readonly copiedLabel: string;
  readonly copyLabel: string;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly ticket: string;
  readonly title: string;
}) {
  return (
    <div
      data-testid="bug-report-success"
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: pxToRem(success.gap),
        padding: `${pxToRem(success.paddingTop)} ${pxToRem(success.paddingX)} ${pxToRem(
          success.paddingBottom,
        )}`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          background: `hsl(var(--success) / ${success.circleSurfaceAlpha})`,
          borderRadius: "50%",
          color: "hsl(var(--success))",
          display: "grid",
          height: pxToRem(success.circleSize),
          placeItems: "center",
          width: pxToRem(success.circleSize),
        }}
      >
        <CheckIcon size={success.iconSize} strokeWidth={success.iconStroke} />
      </div>

      <div>
        <div
          style={{
            color: "hsl(var(--foreground))",
            fontFamily: "var(--font-display), sans-serif",
            fontSize: pxToRem(success.titleFontSize),
            fontWeight: 600,
            letterSpacing: "-.02em",
            lineHeight: success.titleLineHeight,
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: "hsl(var(--text-secondary))",
            fontSize: pxToRem(success.bodyFontSize),
            lineHeight: success.bodyLineHeight,
            marginTop: pxToRem(success.bodyMarginTop),
            maxWidth: pxToRem(success.bodyMaxWidth),
            textWrap: "pretty",
          }}
        >
          {body}
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          background: "hsl(var(--surface-base))",
          border: `${hairline()} solid hsl(var(--border) / ${success.ticketBorderAlpha})`,
          borderRadius: pxToRem(success.ticketRadius),
          display: "flex",
          gap: pxToRem(success.ticketGap),
          marginTop: pxToRem(success.ticketMarginTop),
          padding: `${pxToRem(success.ticketPaddingY)} ${pxToRem(
            success.ticketPaddingRight,
          )} ${pxToRem(success.ticketPaddingY)} ${pxToRem(success.ticketPaddingLeft)}`,
        }}
      >
        <span
          data-testid="bug-report-ticket"
          style={{
            color: "hsl(var(--foreground))",
            fontFamily: "var(--font-display), sans-serif",
            fontSize: pxToRem(success.ticketFontSize),
            fontWeight: 600,
            letterSpacing: `${success.ticketLetterSpacing}em`,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {ticket}
        </span>
        <button
          data-testid="bug-report-copy-ticket"
          onClick={onCopy}
          style={{
            alignItems: "center",
            background: copied
              ? `hsl(var(--success) / ${success.copiedSurfaceAlpha})`
              : "hsl(var(--surface-card))",
            border: `${hairline()} solid ${
              copied ? `hsl(var(--success) / ${success.copiedBorderAlpha})` : "hsl(var(--border))"
            }`,
            borderRadius: pxToRem(success.copyRadius),
            color: copied ? "hsl(var(--success))" : "hsl(var(--text-secondary))",
            cursor: "pointer",
            display: "flex",
            fontSize: pxToRem(success.copyFontSize),
            fontWeight: 600,
            gap: pxToRem(success.copyGap),
            height: pxToRem(success.copyHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(success.copyPaddingX)}`,
            transition: `background ${motion.transitionSeconds}s, color ${motion.transitionSeconds}s`,
            whiteSpace: "nowrap",
          }}
          type="button"
        >
          {copied ? (
            <CheckIcon size={success.copyIconSize} strokeWidth={3} />
          ) : (
            <CopyIcon size={success.copyIconSize} strokeWidth={1.9} />
          )}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>

      <button
        data-testid="bug-report-success-close"
        onClick={onClose}
        style={{
          background: "hsl(var(--primary))",
          border: 0,
          borderRadius: pxToRem(success.closeRadius),
          boxShadow: `0 ${pxToRem(footer.shadow.y)} ${pxToRem(footer.shadow.blur)} ${pxToRem(
            footer.shadow.spread,
          )} hsl(var(--primary))`,
          color: "#fff",
          cursor: "pointer",
          fontSize: pxToRem(success.closeFontSize),
          fontWeight: 600,
          height: pxToRem(success.closeHeight),
          lineHeight: 1,
          marginTop: pxToRem(success.closeMarginTop),
          padding: `0 ${pxToRem(success.closePaddingX)}`,
          transition: `filter ${motion.transitionSeconds}s`,
        }}
        type="button"
      >
        {closeLabel}
      </button>
    </div>
  );
}
