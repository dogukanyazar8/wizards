"use client";

import React, { useState } from "react";
import Link from "next/link";

import { resolveNotificationTarget } from "@/lib/notifications/target";

import { useI18n } from "@/components/providers/locale-provider";
import { NOTIF_KIND_GLYPH, NOTIF_KIND_TONE } from "@/lib/notifications/panel-state";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import type { AppNotification } from "@wizards/types";

/**
 * Bildirimler paneli — SPEC §1 satırı (Ş11 §A.4).
 *
 * Satır hedefi açar; hedefi olmayan duyurunun tam metnini genişletir.
 *
 * Okunmamış durumu **renkle yetinmez**: 7 px nokta bir ekran okuyucuya görünmez, o yüzden
 * durum `aria-label`'da metin olarak da geçer (`Okunmadı` / `Okundu`). Etiket satırın tamamını
 * taşır — yalnız durumu taşısaydı, `aria-label` iç metni gölgelediği için başlık, gövde ve saat
 * ekran okuyucudan tamamen düşerdi.
 */

const { row } = SETTINGS_METRICS.panel;

function iconSurface(tone: string): string {
  return tone === "--text-muted"
    ? "hsl(var(--surface-soft))"
    : `hsl(var(${tone}) / ${row.iconSurfaceAlpha})`;
}

export type NotificationItemProps = {
  readonly notification: AppNotification;
  readonly onOpen: (notification: AppNotification) => void;
  readonly timeZone?: string | undefined;
};

export function NotificationItem({ notification, onOpen, timeZone }: NotificationItemProps) {
  const { locale, t } = useI18n();

  const [expanded, setExpanded] = useState(false);
  const href = resolveNotificationTarget(notification.actionUrl);
  const external = href?.startsWith("http");
  const unread = !notification.read;
  const tone = NOTIF_KIND_TONE[notification.kind];
  const time = formatNotificationTime(locale, notification.createdAt, timeZone);
  const stateLabel = t(unread ? "notif.panel.unreadState" : "notif.panel.readState");

  const rowProps = {
    "aria-label": [notification.title, notification.body, time, stateLabel]
      .filter(Boolean)
      .join(" · "),
    className:
      "flex w-full items-start text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
    "data-notification-id": notification.id,
    "data-testid": "notification-panel-row",
    "data-unread": unread || undefined,
    onClick: () => {
      onOpen({ ...notification, actionUrl: href });
      if (!href) setExpanded((value) => !value);
    },
    style: {
      background: unread ? `hsl(var(--surface-soft) / ${row.unreadSurfaceAlpha})` : "transparent",
      borderRadius: pxToRem(row.radius),
      gap: pxToRem(row.gap),
      padding: `${pxToRem(row.paddingY)} ${pxToRem(row.paddingX)}`,
      transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
    },
  };
  const content = (
    <>
      <span
        aria-hidden="true"
        className="font-display grid shrink-0 place-items-center"
        data-notification-kind={notification.kind}
        style={{
          background: iconSurface(tone),
          borderRadius: pxToRem(row.iconRadius),
          color: `hsl(var(${tone}))`,
          fontSize: pxToRem(row.iconFontSize),
          fontWeight: row.unreadWeight,
          height: pxToRem(row.iconSize),
          width: pxToRem(row.iconSize),
        }}
      >
        {NOTIF_KIND_GLYPH[notification.kind]}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline" style={{ gap: pxToRem(row.titleTimeGap) }}>
          <span
            className="min-w-0 flex-1 text-pretty text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(row.titleFontSize),
              fontWeight: unread ? row.unreadWeight : row.readWeight,
              lineHeight: row.titleLineHeight,
            }}
          >
            {notification.title}
          </span>
          <span
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(row.timeFontSize),
              fontWeight: row.timeWeight,
              lineHeight: row.titleLineHeight,
            }}
          >
            {time}
          </span>
        </span>
        <span
          className={`${expanded ? "whitespace-pre-wrap break-words" : "truncate"} block text-[hsl(var(--text-muted))]`}
          style={{
            fontSize: pxToRem(row.subFontSize),
            lineHeight: row.subLineHeight,
            marginTop: pxToRem(row.subMarginTop),
          }}
        >
          {notification.body}
        </span>
      </span>

      {unread ? (
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-[hsl(var(--primary))]"
          data-testid="notification-panel-row-dot"
          style={{
            height: pxToRem(row.unreadDotSize),
            marginTop: pxToRem(row.unreadDotMarginTop),
            width: pxToRem(row.unreadDotSize),
          }}
        />
      ) : null}
    </>
  );
  return (
    <div role="listitem">
      {href ? (
        <Link
          {...rowProps}
          href={href}
          prefetch={false}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {content}
        </Link>
      ) : (
        <button {...rowProps} type="button" aria-expanded={expanded}>
          {content}
        </button>
      )}
    </div>
  );
}

/**
 * Saat, gün kovasıyla **aynı** bölgede yazılır (00 tuzak #7).
 *
 * Kovayı sunucu izleyicinin kayıtlı bölgesinde hesaplıyor; saati tarayıcının yerel bölgesinde
 * yazmak, gece yarısına yakın bir bildirimi `DÜN` başlığının altında `00:30` olarak gösterirdi.
 * Bölge henüz yüklenmediyse tarayıcının kendi bölgesi kullanılır — liste de o anda yükleniyor.
 *
 * `hourCycle: "h23"` açıkça yazıldı: tasarım 24 saat gösteriyor ve `en` yerel ayarı
 * `hour: "2-digit"` ile `09:41 AM` üretirdi.
 */
export function formatNotificationTime(
  locale: string,
  createdAt: string,
  timeZone?: string | undefined,
): string {
  const value = new Date(createdAt);

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).format(value);
  } catch {
    // Elle düzenlenmiş bir ayar satırının yazdığı geçersiz bölge buraya düşer; satırı saatsiz
    // çizmek, paneli boş bırakmaktan iyidir.
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
    }).format(value);
  }
}
