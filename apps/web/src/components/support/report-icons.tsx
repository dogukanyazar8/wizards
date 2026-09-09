import React, { type ReactNode } from "react";

import { pxToRem } from "@/lib/support/report-metrics";

/**
 * SPEC-INDIRME §0/§A ikonları.
 *
 * Path'ler `kaynak/Indirme ve Sorun Bildir.dc.html` içinden **birebir**
 * kopyalandı; yeni ikon çizilmedi. Hepsi 24×24 viewBox, `currentColor` ve
 * `stroke-linecap:round` — renk her zaman kapsayıcıdan gelir.
 */

type ReportIconProps = {
  readonly children: ReactNode;
  readonly size: number;
  readonly strokeWidth: number;
};

function ReportIcon({ children, size, strokeWidth }: ReportIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      style={{ height: pxToRem(size), width: pxToRem(size) }}
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

export function DownloadArrowIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
    </ReportIcon>
  );
}

export function BugIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M12 20a5 5 0 0 0 5-5v-3a5 5 0 0 0-10 0v3a5 5 0 0 0 5 5z" />
      <path d="M12 10v10M7 13H4M7 17H5M17 13h3M17 17h2" />
      <path d="M9.2 7.4 7.5 4.9M14.8 7.4l1.7-2.5" />
    </ReportIcon>
  );
}

/** Başlık şeridi ve "Sohbet" çipi aynı konuşma balonunu paylaşır. */
const SPEECH_BUBBLE_PATH = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";

export function ReportHeaderIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d={SPEECH_BUBBLE_PATH} />
      <path d="M12 7.5v4M12 13.6h.01" />
    </ReportIcon>
  );
}

export function CloseIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6 6l12 12M18 6 6 18" />
    </ReportIcon>
  );
}

export function VoiceCategoryIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </ReportIcon>
  );
}

export function ChatCategoryIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d={SPEECH_BUBBLE_PATH} />
    </ReportIcon>
  );
}

export function NotificationCategoryIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a2 2 0 0 0 3 0" />
    </ReportIcon>
  );
}

export function PerformanceCategoryIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="m4 13 3-3 3 5 4-9 3 7h3" />
    </ReportIcon>
  );
}

export function OtherCategoryIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M12 11v5" />
    </ReportIcon>
  );
}

/** Ekran görüntüsü kutusunun boş hâlindeki üç çubuk. */
export function ScreenshotBarsIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6 15V9M12 18V6M18 15v-6" />
    </ReportIcon>
  );
}

export function ExpandIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7" />
    </ReportIcon>
  );
}

export function WarningTriangleIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M10.3 4.3 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4.5M12 17h.01" />
    </ReportIcon>
  );
}

export function ShieldCheckIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M12 3l7 3v5.6c0 4.3-3 7.5-7 9.4-4-1.9-7-5.1-7-9.4V6z" />
      <path d="M9.2 12.2 11.3 14.4 15 10.6" />
    </ReportIcon>
  );
}

export function ErrorCircleIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5M12 16h.01" />
    </ReportIcon>
  );
}

export function OfflineIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-6-2.9M2 9.5A15 15 0 0 1 8 6M22 9.5A15 15 0 0 0 12 5.2" />
      <path d="M12 20h.01" />
    </ReportIcon>
  );
}

export function ImagePlaceholderIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <rect height="14" rx="2.5" width="18" x="3" y="4" />
      <path d="m6 15 4-4 3 3 2-2 3 3M8 21h8" />
    </ReportIcon>
  );
}

export function TrashIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </ReportIcon>
  );
}

export function CheckIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 12.5 9 17.5 20 6.5" />
    </ReportIcon>
  );
}

export function CopyIcon({ size, strokeWidth }: Omit<ReportIconProps, "children">) {
  return (
    <ReportIcon size={size} strokeWidth={strokeWidth}>
      <rect height="11" rx="2.5" width="11" x="9" y="9" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
    </ReportIcon>
  );
}
