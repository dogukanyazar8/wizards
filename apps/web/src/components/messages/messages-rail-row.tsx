"use client";

import React from "react";
import Link from "next/link";
import type { ConversationRowDTO, MessagesPresence } from "@wizards/types";
import { getGroupAvatarColorTone, mapLegacyGroupAvatarColor } from "@wizards/types";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT, HomeAvatar, PresenceDot } from "@/components/home/home-primitives";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Sohbet rayının bir satırı — SPEC §3 "Satır anatomisi".
 *
 * Satır gerçek bir `a`: geri/ileri, orta tık ve "yeni sekmede aç" çalışsın.
 * `button` olsaydı üçü de kaybolurdu ve bağlantı olduğu ekran okuyucuya da
 * yalan söylerdi.
 */

const { rail } = MESSAGES_METRICS;

/**
 * `PresenceDot` Ana Sayfa'nın büyük harfli durumunu bekliyor; `ConversationRowDTO`
 * küçük harfli taşıyor. Nokta tek bir yerde çizildiği için çeviri de tek yerde.
 */
const DOT_PRESENCE: Readonly<Record<MessagesPresence, HomePresenceStatus>> = Object.freeze({
  dnd: "DND",
  idle: "IDLE",
  offline: "OFFLINE",
  online: "ONLINE",
});

export type MessagesRailRowProps = {
  active: boolean;
  href: string;
  onNavigate?: (() => void) | undefined;
  row: ConversationRowDTO;
};

export function MessagesRailRow({ active, href, onNavigate, row }: MessagesRailRowProps) {
  const { t } = useI18n();
  const swatch = row.tileColor ? mapLegacyGroupAvatarColor(row.tileColor) : null;
  const unread = row.unreadCount > 0;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        active ? "bg-[hsl(var(--surface-soft))]" : "hover:bg-[hsl(var(--surface-soft)/0.75)]",
      )}
      data-active={active ? "true" : undefined}
      // Konuşma kimliği bir kanca olarak duruyor: e2e belirli bir satırı
      // sırasından bağımsız bulmalı ve sıra `lastMessageAt` ile değişiyor.
      data-conversation-id={row.id}
      data-testid="messages-rail-row"
      href={href}
      style={{
        borderRadius: pxToRem(rail.rowRadius),
        gap: pxToRem(rail.rowGap),
        padding: `${pxToRem(rail.rowPaddingY)} ${pxToRem(rail.rowPaddingX)}`,
      }}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <span className="relative shrink-0">
        {swatch ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid place-items-center",
              DISPLAY_FONT,
              getGroupAvatarColorTone(swatch) === "dark" ? undefined : "text-white",
            )}
            style={{
              background: getGroupSwatchBackground(swatch),
              borderRadius: pxToRem(rail.rowAvatarRadius),
              ...(getGroupSwatchInk(swatch) ? { color: getGroupSwatchInk(swatch) } : {}),
              fontSize: pxToRem(rail.rowAvatarFontSize),
              fontWeight: 600,
              height: pxToRem(rail.rowAvatarSize),
              width: pxToRem(rail.rowAvatarSize),
            }}
          >
            {row.initials}
          </span>
        ) : (
          <HomeAvatar
            avatarUrl={null}
            displayName={row.name}
            fontSize={rail.rowAvatarFontSize}
            size={rail.rowAvatarSize}
          />
        )}

        {row.presence ? (
          <PresenceDot
            borderColor="hsl(var(--surface-panel))"
            borderWidth={rail.rowPresenceDotBorderWidth}
            presence={DOT_PRESENCE[row.presence]}
            size={rail.rowPresenceDotSize}
          />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(rail.rowNameFontSize),
            fontWeight: unread ? rail.rowNameWeightUnread : rail.rowNameWeightRead,
            lineHeight: rail.rowNameLineHeight,
          }}
        >
          {row.name}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(rail.rowPreviewFontSize),
            lineHeight: rail.rowPreviewLineHeight,
            marginTop: pxToRem(rail.rowPreviewMarginTop),
          }}
        >
          {row.preview.authorPrefix
            ? `${row.preview.authorPrefix}${row.preview.text}`
            : row.preview.text}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end" style={{ gap: pxToRem(rail.rowMetaGap) }}>
        <span
          className="text-[hsl(var(--text-muted))]"
          style={{ fontSize: pxToRem(rail.rowTimeFontSize), fontWeight: 500 }}
        >
          {row.timeLabel}
        </span>
        {unread ? (
          <span
            className={cn(
              "grid place-items-center bg-[hsl(var(--danger))] text-white",
              DISPLAY_FONT,
            )}
            style={{
              borderRadius: pxToRem(rail.rowUnreadRadius),
              fontSize: pxToRem(rail.rowUnreadFontSize),
              fontWeight: 600,
              height: pxToRem(rail.rowUnreadHeight),
              minWidth: pxToRem(rail.rowUnreadMinWidth),
              padding: `0 ${pxToRem(rail.rowUnreadPaddingX)}`,
            }}
          >
            {/*
              Rozetin kendisi yalnız sayıyı çiziyor; ekran okuyucu "3" duyar ve
              neyin üçü olduğunu bilmez. Görsel katman gizlenir, cümle `sr-only`
              satırdan gelir.
            */}
            <span aria-hidden="true" data-testid="messages-rail-row-unread">
              {row.unreadCount}
            </span>
            <span className="sr-only">
              {t("messages.rail.unreadLabel", { count: row.unreadCount })}
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
