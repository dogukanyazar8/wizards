"use client";

import React from "react";
import { Check } from "lucide-react";
import type { InviteCandidateDTO, MessagesPresence } from "@wizards/types";

import { DISPLAY_FONT, PresenceDot } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";

/**
 * SPEC-MESAJLAR §16 — one row of the `ARKADAŞLARIN` list. `Mesajlar.dc.html`
 * `L1456–L1476`.
 *
 * The **whole row** is the target. §16 says so outright and the reason is mechanical:
 * a 19×19 checkbox is a 19px target inside a 512px row, and every miss toggles nothing
 * while looking like a click. So the checkbox is `aria-hidden` decoration and the row
 * carries the state as `role="option"` + `aria-selected` — the pair a listbox announces.
 *
 * `role="option"` on a `<button>` rather than on a bare `<div>`: the ARIA the pattern
 * needs, with the click and `Enter`/`Space` activation the element already has. A
 * `div[role=option]` would have needed both re-implemented, and the one that gets
 * forgotten is always `Space`.
 */

const { inviteModal } = MESSAGES_METRICS;

/** `PresenceDot` speaks the Ana Sayfa casing; the DTO speaks the Mesajlar one. */
const DOT_PRESENCE: Readonly<Record<MessagesPresence, HomePresenceStatus>> = Object.freeze({
  dnd: "DND",
  idle: "IDLE",
  offline: "OFFLINE",
  online: "ONLINE",
});

const PRESENCE_LABEL_KEY: Readonly<Record<MessagesPresence, string>> = Object.freeze({
  dnd: "home.presence.dnd",
  idle: "home.presence.idle",
  offline: "home.friends.offline",
  online: "home.presence.online",
});

/**
 * The second line: the friend's own status text when they have one, otherwise the
 * presence word.
 *
 * §16's mock prints last-seen phrasings (`2 saat önce görüldü`, `Dün 23:10`) and this
 * row cannot: `InviteCandidateDTO` carries no `lastSeenAt`, and inventing a timestamp
 * would put a number on screen the product does not know. The gap is written up in
 * `raporlar/12-rapor.md` — closing it is a field on Dalga 0's DTO, not a guess here.
 */
export function inviteCandidateStatusKey(presence: MessagesPresence): string {
  return PRESENCE_LABEL_KEY[presence];
}

export type InviteCandidateRowProps = {
  candidate: InviteCandidateDTO;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement> | undefined;
  onToggle: (userId: string) => void;
  /** Roving tabindex: the list keeps exactly one option in the tab order. */
  rowRef?: ((node: HTMLButtonElement | null) => void) | undefined;
  selected: boolean;
  tabIndex?: number;
};

export function InviteCandidateRow({
  candidate,
  onKeyDown,
  onToggle,
  rowRef,
  selected,
  tabIndex = -1,
}: InviteCandidateRowProps) {
  const { t } = useI18n();
  const status = candidate.statusText ?? t(inviteCandidateStatusKey(candidate.presence));

  return (
    <button
      aria-selected={selected}
      className="flex w-full items-center text-left outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft)/0.8)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid={`invite-candidate-${candidate.userId}`}
      onClick={() => onToggle(candidate.userId)}
      {...(onKeyDown ? { onKeyDown } : {})}
      ref={rowRef ?? null}
      role="option"
      style={{
        background: selected ? "hsl(var(--primary)/0.1)" : "transparent",
        borderRadius: pxToRem(inviteModal.rowRadius),
        gap: pxToRem(inviteModal.rowGap),
        padding: `${pxToRem(inviteModal.rowPaddingY)} ${pxToRem(inviteModal.rowPaddingX)}`,
      }}
      tabIndex={tabIndex}
      type="button"
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center text-[hsl(var(--primary-foreground))]"
        data-testid={`invite-candidate-box-${candidate.userId}`}
        style={{
          background: selected ? "hsl(var(--primary))" : "transparent",
          border: `${hairline(inviteModal.checkboxBorderWidth)} solid ${
            selected ? "hsl(var(--primary))" : "hsl(var(--border))"
          }`,
          borderRadius: pxToRem(inviteModal.checkboxRadius),
          height: pxToRem(inviteModal.checkboxSize),
          width: pxToRem(inviteModal.checkboxSize),
        }}
      >
        {selected ? (
          <Check
            style={{
              height: pxToRem(inviteModal.checkboxIconSize),
              width: pxToRem(inviteModal.checkboxIconSize),
            }}
          />
        ) : null}
      </span>

      <span className="relative shrink-0">
        <span
          aria-hidden="true"
          className={`grid place-items-center rounded-full ${DISPLAY_FONT}`}
          style={{
            background: profileTintSurface(candidate.tint),
            color: profileTintForeground(candidate.tint),
            fontSize: pxToRem(inviteModal.rowAvatarFontSize),
            fontWeight: 600,
            height: pxToRem(inviteModal.rowAvatarSize),
            lineHeight: 1,
            width: pxToRem(inviteModal.rowAvatarSize),
          }}
        >
          {candidate.initials}
        </span>
        <PresenceDot
          borderColor="hsl(var(--surface-card))"
          borderWidth={inviteModal.rowPresenceDotBorderWidth}
          presence={DOT_PRESENCE[candidate.presence]}
          size={inviteModal.rowPresenceDotSize}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(inviteModal.rowNameFontSize),
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {candidate.name}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          data-testid={`invite-candidate-status-${candidate.userId}`}
          style={{
            fontSize: pxToRem(inviteModal.rowStatusFontSize),
            marginTop: pxToRem(inviteModal.rowStatusMarginTop),
          }}
        >
          {status}
        </span>
      </span>
    </button>
  );
}
