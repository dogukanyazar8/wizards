"use client";

import React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";

/**
 * PROMPT §11 — her bölüm `lazy` yüklenir ve **kendi** iskeletini gösterir.
 *
 * Tek ortak iskelet yeterli görünürdü ama değil: `Genel` iki kolon, `Görünürlük` üç satır +
 * bir kart, `Roller` iki kolon (212 + esnek). Aynı gri dikdörtgeni üçüne de göstermek,
 * yükleme bittiğinde yerleşimin sıçramasına yol açar (CLS). İskeletin şekli bölümün şeklidir.
 *
 * Yükseklikler sözlükten türetilir; iskeletin kendisi ölçü uydurmaz.
 */

const { settings, settingsSections } = SERVER_METRICS;

function CardSkeleton({ height }: { height: number }) {
  return (
    <Skeleton
      className="w-full rounded-[var(--server-settings-card-radius)]"
      style={{
        ["--server-settings-card-radius" as string]: pxToRem(settings.cardSectionRadius),
        height: pxToRem(height),
      }}
    />
  );
}

function RowSkeleton() {
  return (
    <Skeleton
      className="w-full rounded-[var(--server-settings-row-radius)]"
      style={{
        ["--server-settings-row-radius" as string]: pxToRem(settingsSections.visibilityRowRadius),
        height: pxToRem(
          settingsSections.visibilityRowPaddingY * 2 + settingsSections.visibilityIconSize,
        ),
      }}
    />
  );
}

function Stack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return (
    <div className="flex flex-col" style={{ gap: pxToRem(gap) }}>
      {children}
    </div>
  );
}

/** §8.1 — iki kolon (`1fr / 286`). */
export function GeneralSectionSkeleton() {
  return (
    <div
      className="grid items-start [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_var(--server-settings-preview-width)]"
      data-testid="server-settings-general-skeleton"
      style={{
        ["--server-settings-preview-width" as string]: pxToRem(
          settingsSections.generalPreviewColumnWidth,
        ),
        gap: pxToRem(settingsSections.generalGridGap),
      }}
    >
      <Stack gap={settings.cardGap}>
        <CardSkeleton height={settingsSections.generalIconSize + settings.cardPadding * 4} />
        <CardSkeleton height={settingsSections.generalIconSize * 2} />
      </Stack>
      <CardSkeleton height={settingsSections.generalIconSize * 3} />
    </div>
  );
}

/** §8.2 — üç satır + keşif etiketi kartı. */
export function VisibilitySectionSkeleton() {
  return (
    <div data-testid="server-settings-visibility-skeleton">
      <Stack gap={settingsSections.visibilityRowsGap}>
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </Stack>
      <div style={{ marginTop: pxToRem(settingsSections.discoveryCardMarginTop) }}>
        <CardSkeleton height={settingsSections.generalIconSize * 4} />
      </div>
    </div>
  );
}

/** §8.3 — iki anahtar satırı + üç seçenek kartı. */
export function ContentSectionSkeleton() {
  return (
    <div data-testid="server-settings-content-skeleton">
      <Stack gap={settingsSections.visibilityRowsGap}>
        <RowSkeleton />
        <RowSkeleton />
      </Stack>
      <div style={{ marginTop: pxToRem(settingsSections.contentOptionsMarginTop) }}>
        <Stack gap={settingsSections.contentOptionsGap}>
          <CardSkeleton height={settingsSections.generalIconSize + settings.cardPadding} />
          <CardSkeleton height={settingsSections.generalIconSize + settings.cardPadding} />
          <CardSkeleton height={settingsSections.generalIconSize + settings.cardPadding} />
        </Stack>
      </div>
    </div>
  );
}

/** §8.4 — araç çubuğu + üç kategori kartı. */
export function ChannelsSectionSkeleton() {
  return (
    <div data-testid="server-settings-channels-skeleton">
      <Skeleton
        className="w-full rounded-[var(--server-settings-button-radius)]"
        style={{
          ["--server-settings-button-radius" as string]: pxToRem(
            settingsSections.channelsButtonRadius,
          ),
          height: pxToRem(settingsSections.channelsButtonHeight),
        }}
      />
      <div style={{ marginTop: pxToRem(settingsSections.channelsListMarginTop) }}>
        <Stack gap={settingsSections.channelsListGap}>
          <CardSkeleton height={settingsSections.generalIconSize * 2} />
          <CardSkeleton height={settingsSections.generalIconSize * 2} />
          <CardSkeleton height={settingsSections.generalIconSize * 2} />
        </Stack>
      </div>
    </div>
  );
}

/** §8.5 — sol rol listesi (212) + sağ ayrıntı. */
export function RolesSectionSkeleton() {
  return (
    <div
      className="grid items-start [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:var(--server-settings-roles-width)_minmax(0,1fr)]"
      data-testid="server-settings-roles-skeleton"
      style={{
        ["--server-settings-roles-width" as string]: pxToRem(settingsSections.rolesListColumnWidth),
        gap: pxToRem(settingsSections.rolesGridGap),
      }}
    >
      <CardSkeleton height={settingsSections.generalIconSize * 3} />
      <CardSkeleton height={settingsSections.generalIconSize * 5} />
    </div>
  );
}

/** §8.6 — arama + filtre çipleri + üye satırları. */
export function MembersSectionSkeleton() {
  return (
    <div data-testid="server-settings-members-skeleton">
      <Skeleton
        className="w-full rounded-[var(--server-settings-search-radius)]"
        style={{
          ["--server-settings-search-radius" as string]: pxToRem(
            settingsSections.membersSearchRadius,
          ),
          height: pxToRem(
            settingsSections.membersSearchPaddingY * 2 + settingsSections.membersSearchFontSize,
          ),
        }}
      />
      <div style={{ marginTop: pxToRem(settings.cardGap) }}>
        <Stack gap={settingsSections.visibilityRowsGap}>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </Stack>
      </div>
    </div>
  );
}

/** §8.7 — yeni davet kartı + iki mevcut davet. */
export function InvitesSectionSkeleton() {
  return (
    <div data-testid="server-settings-invites-skeleton">
      <Stack gap={settings.cardGap}>
        <CardSkeleton height={settingsSections.generalIconSize * 3} />
        <RowSkeleton />
        <RowSkeleton />
      </Stack>
    </div>
  );
}

/** §8.8 — segment + iki etkinlik kartı. */
export function EventsSectionSkeleton() {
  return (
    <div data-testid="server-settings-events-skeleton">
      <Stack gap={settings.cardGap}>
        <RowSkeleton />
        <CardSkeleton height={settingsSections.generalIconSize + settings.cardPadding * 2} />
        <CardSkeleton height={settingsSections.generalIconSize + settings.cardPadding * 2} />
      </Stack>
    </div>
  );
}

/** §8.9 — iki kart: sahiplik devri + silme. */
export function DangerSectionSkeleton() {
  return (
    <div data-testid="server-settings-danger-skeleton">
      <Stack gap={settings.cardGap}>
        <CardSkeleton height={settingsSections.generalIconSize * 4} />
        <CardSkeleton height={settingsSections.generalIconSize * 2} />
      </Stack>
    </div>
  );
}
