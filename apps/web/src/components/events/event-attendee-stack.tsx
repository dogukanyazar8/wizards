"use client";

import React from "react";
import type { EventAttendee } from "@wizards/types";

import { Avatar } from "@/components/ui/avatar";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";

/**
 * Üst üste binen katılımcı avatarları — SPEC §3.6, `.dc.html` `:365`–`:369`.
 *
 * Yığın **`aria-hidden`**: yanındaki satır zaten `{n} kişi katılıyor · {host} düzenliyor`
 * yazıyor. Üç avatarın erişilebilir adını da okutmak, ekran okuyucuda aynı bilgiyi iki kez
 * — ve ikinci kez eksik olarak (yalnız üç kişi) — söylerdi.
 *
 * İlk avatar bitişik, sonrakiler `-8 px` kayar; halka `--surface-card` renginde 2 px ve
 * `box-shadow` ile çizilir — kenarlık kullanılsaydı avatarın kendi çapı büyür ve dizilim
 * kayardı.
 */

const { card } = EVENTS_METRICS;

export type EventAttendeeStackProps = {
  readonly attendees: readonly EventAttendee[];
  /** Halkanın rengi yüzeye göre değişir; kart `--surface-card` üzerinde durur. */
  readonly ringColor?: string;
  readonly size?: number;
};

export function EventAttendeeStack({
  attendees,
  ringColor = "hsl(var(--surface-card))",
  size = card.avatarSize,
}: EventAttendeeStackProps) {
  if (attendees.length === 0) {
    return null;
  }

  return (
    <div aria-hidden="true" className="flex flex-none" data-testid="event-attendee-stack">
      {attendees.slice(0, card.maxAvatars).map((attendee, index) => (
        <span
          className="inline-flex"
          key={attendee.id}
          style={{
            borderRadius: "50%",
            boxShadow: `0 0 0 ${pxToRem(card.avatarRing)} ${ringColor}`,
            marginLeft: index === 0 ? "0" : pxToRem(card.avatarOverlap),
          }}
        >
          <Avatar
            alt={attendee.name}
            fallback={attendee.initials}
            src={attendee.avatarUrl}
            style={{ height: pxToRem(size), width: pxToRem(size) }}
          />
        </span>
      ))}
    </div>
  );
}
