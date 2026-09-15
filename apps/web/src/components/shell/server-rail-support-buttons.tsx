"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

import { BugIcon, DownloadArrowIcon } from "@/components/support/report-icons";
import { REPORT_METRICS, hairline, pxToRem } from "@/lib/support/report-metrics";

const { rail } = REPORT_METRICS;

/**
 * SPEC-INDIRME §0 — rayın dibindeki iki düğme.
 *
 * Hover tonları satır içi stille sürülüyor çünkü çerçeve rengi de değişiyor ve
 * satır içi bir `border` kısayolu bir `hover:` sınıfını her zaman yener. Odak
 * da aynı tonu alır: klavyeyle gezen biri fareyle gezenle aynı ipucunu görmeli.
 */

type RailSupportButtonProps = {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
  readonly tone: "success" | "warning";
  readonly borderWidth: number;
  readonly hoverBorderAlpha: number;
  readonly hoverSurfaceAlpha: number;
  readonly idleBackground: string;
  readonly idleBorderColor: string;
  readonly idleColor: string;
};

function RailSupportButton({
  borderWidth,
  children,
  hoverBorderAlpha,
  hoverSurfaceAlpha,
  idleBackground,
  idleBorderColor,
  idleColor,
  label,
  onClick,
  testId,
  tone,
}: RailSupportButtonProps) {
  const [active, setActive] = useState(false);

  return (
    <motion.button
      aria-label={label}
      className="grid shrink-0 place-items-center outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid={testId}
      onBlur={() => setActive(false)}
      onClick={onClick}
      onFocus={() => setActive(true)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      style={{
        background: active ? `hsl(var(--${tone}) / ${hoverSurfaceAlpha})` : idleBackground,
        border: `${hairline(borderWidth)} solid ${
          active ? `hsl(var(--${tone}) / ${hoverBorderAlpha})` : idleBorderColor
        }`,
        borderRadius: pxToRem(rail.buttonRadius),
        color: active ? `hsl(var(--${tone}))` : idleColor,
        cursor: "pointer",
        height: pxToRem(rail.buttonSize),
        transition: `background ${REPORT_METRICS.motion.transitionSeconds}s, border-color ${REPORT_METRICS.motion.transitionSeconds}s, color ${REPORT_METRICS.motion.transitionSeconds}s`,
        width: pxToRem(rail.buttonSize),
      }}
      title={label}
      type="button"
      whileHover={{ y: -rail.hoverLift }}
      whileTap={{ scale: 0.985 }}
    >
      {children}
    </motion.button>
  );
}

export function ServerRailDownloadButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <RailSupportButton
      borderWidth={rail.downloadBorderWidth}
      hoverBorderAlpha={rail.downloadBorderAlpha}
      hoverSurfaceAlpha={rail.downloadHoverSurfaceAlpha}
      idleBackground={`hsl(var(--success) / ${rail.downloadSurfaceAlpha})`}
      idleBorderColor={`hsl(var(--success) / ${rail.downloadBorderAlpha})`}
      idleColor="hsl(var(--success))"
      label={label}
      onClick={onClick}
      testId="server-rail-download-button"
      tone="success"
    >
      <DownloadArrowIcon size={rail.downloadIconSize} strokeWidth={rail.downloadIconStroke} />
    </RailSupportButton>
  );
}

export function ServerRailReportButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <RailSupportButton
      borderWidth={rail.reportBorderWidth}
      hoverBorderAlpha={rail.reportHoverBorderAlpha}
      hoverSurfaceAlpha={Math.min(1, rail.reportHoverSurfaceAlpha + 0.1)}
      idleBackground={`hsl(var(--warning) / ${rail.reportHoverSurfaceAlpha})`}
      idleBorderColor={`hsl(var(--warning) / ${rail.reportHoverBorderAlpha})`}
      idleColor="hsl(var(--warning))"
      label={label}
      onClick={onClick}
      testId="server-rail-report-button"
      tone="warning"
    >
      <BugIcon size={rail.reportIconSize} strokeWidth={rail.reportIconStroke} />
    </RailSupportButton>
  );
}
