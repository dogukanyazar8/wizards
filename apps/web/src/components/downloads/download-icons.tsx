import React from "react";

import { pxToRem } from "@/lib/downloads/download-metrics";

/**
 * SPEC-INDIRME §B ikonları. Path'ler `kaynak/Indirme ve Sorun Bildir.dc.html`
 * içinden birebir kopyalandı.
 *
 * Mağaza logosu **çizilmez** (SPEC §B.5): telefon ikonları nötrdür ve marka
 * varlıklarını yeniden çizmek hem yanlış hem gereksiz olurdu.
 */

type DownloadIconProps = {
  readonly size: number;
  readonly strokeWidth: number;
};

function DownloadIcon({
  children,
  size,
  strokeWidth,
}: DownloadIconProps & { readonly children: React.ReactNode }) {
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

export function ExternalLinkIcon({ size, strokeWidth }: DownloadIconProps) {
  return (
    <DownloadIcon size={size} strokeWidth={strokeWidth}>
      <path d="M7 17 17 7M9 7h8v8" />
    </DownloadIcon>
  );
}

export function WindowsIcon({ size, strokeWidth }: DownloadIconProps) {
  return (
    <DownloadIcon size={size} strokeWidth={strokeWidth}>
      <rect height="7" rx="1" width="7" x="3.5" y="4" />
      <rect height="7" rx="1" width="7" x="13.5" y="4" />
      <rect height="7" rx="1" width="7" x="3.5" y="13" />
      <rect height="7" rx="1" width="7" x="13.5" y="13" />
    </DownloadIcon>
  );
}

export function MacOsIcon({ size, strokeWidth }: DownloadIconProps) {
  return (
    <DownloadIcon size={size} strokeWidth={strokeWidth}>
      <path d="M9 4h1.5a2 2 0 0 1 2 2v1.5M15 20h-1.5a2 2 0 0 1-2-2v-1.5M20 9V7.5a2 2 0 0 0-2-2h-1.5M4 15v1.5a2 2 0 0 0 2 2h1.5" />
      <rect height="7" rx="1.5" width="7" x="8.5" y="8.5" />
    </DownloadIcon>
  );
}

export function LinuxIcon({ size, strokeWidth }: DownloadIconProps) {
  return (
    <DownloadIcon size={size} strokeWidth={strokeWidth}>
      <rect height="13" rx="2.5" width="18" x="3" y="4.5" />
      <path d="M7 9l2.5 2.5L7 14M12 14h4.5" />
    </DownloadIcon>
  );
}

export function AndroidPhoneIcon({ size, strokeWidth }: DownloadIconProps) {
  return (
    <DownloadIcon size={size} strokeWidth={strokeWidth}>
      <rect height="19" rx="3" width="12" x="6" y="2.5" />
      <path d="M10.5 5.5h3" />
      <path d="m9.5 9.5 5 3-5 3z" />
    </DownloadIcon>
  );
}

export function IosPhoneIcon({ size, strokeWidth }: DownloadIconProps) {
  return (
    <DownloadIcon size={size} strokeWidth={strokeWidth}>
      <rect height="19" rx="3" width="11" x="6.5" y="2.5" />
      <path d="M10 5h4M11 18.5h2" />
    </DownloadIcon>
  );
}

const PLATFORM_ICONS = {
  android: AndroidPhoneIcon,
  ios: IosPhoneIcon,
  linux: LinuxIcon,
  macos: MacOsIcon,
  windows: WindowsIcon,
} as const;

export type DownloadPlatformIconKey = keyof typeof PLATFORM_ICONS;

export function DownloadPlatformIcon({
  platform,
  size,
  strokeWidth,
}: DownloadIconProps & { readonly platform: DownloadPlatformIconKey }) {
  const Icon = PLATFORM_ICONS[platform];
  return <Icon size={size} strokeWidth={strokeWidth} />;
}
