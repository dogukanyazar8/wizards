"use client";

import React from "react";
import { EVENT_ATTENDEE_ROLE_TONE, type EventAttendee } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";

/**
 * Katılımcı satırı — SPEC §5.3.
 *
 * Rol pili tonunu `EVENT_ATTENDEE_ROLE_TONE`den alır; ton bir **token adıdır**, renk değil.
 * `listening` ile `going` aynı tonu paylaşır ve **metinleriyle** ayrışır: renk tek başına
 * anlam taşımaz.
 *
 * `initials` sunucudan gelir; satır onu addan **türetmez** — türetseydi iki istemci aynı
 * kişiye iki farklı baş harf yazardı.
 */

const { detailPanel } = EVENTS_METRICS;

export type EventAttendeeRowProps = {
  readonly attendee: EventAttendee;
};

export function EventAttendeeRow({ attendee }: EventAttendeeRowProps) {
  const { t } = useI18n();
  const tone = EVENT_ATTENDEE_ROLE_TONE[attendee.role];

  return (
    <div
      className="flex items-center transition hover:bg-[hsl(var(--surface-soft)/0.7)]"
      data-testid="event-detail-attendee"
      style={{
        borderRadius: pxToRem(detailPanel.attendeeRowRadius),
        gap: pxToRem(detailPanel.attendeeRowGap),
        padding: `${pxToRem(detailPanel.attendeeRowPaddingY)} ${pxToRem(
          detailPanel.attendeeRowPaddingX,
        )}`,
      }}
    >
      <Avatar
        alt={attendee.name}
        fallback={attendee.initials}
        src={attendee.avatarUrl}
        style={{
          fontSize: pxToRem(detailPanel.sourceTileFontSize),
          height: pxToRem(detailPanel.attendeeAvatarSize),
          width: pxToRem(detailPanel.attendeeAvatarSize),
        }}
      />

      <span
        className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(detailPanel.attendeeNameFontSize),
          fontWeight: detailPanel.attendeeNameWeight,
          lineHeight: detailPanel.infoTextLineHeight,
        }}
      >
        {attendee.name}
      </span>

      <span
        className="rounded-full"
        style={{
          background: `hsl(var(${tone})/${detailPanel.rolePillSurfaceAlpha})`,
          color: `hsl(var(${tone}))`,
          flex: "none",
          fontSize: pxToRem(detailPanel.rolePillFontSize),
          fontWeight: detailPanel.rolePillWeight,
          lineHeight: 1,
          padding: `${pxToRem(detailPanel.rolePillPaddingY)} ${pxToRem(
            detailPanel.rolePillPaddingX,
          )}`,
        }}
      >
        {t(`events.detail.role.${attendee.role}`)}
      </span>
    </div>
  );
}
