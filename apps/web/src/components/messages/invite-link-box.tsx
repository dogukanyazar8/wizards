"use client";

import React, { useRef, useState } from "react";
import { Copy, Link2 } from "lucide-react";
import type { ConversationToast, InviteLinkExpiry } from "@wizards/types";

import {
  selectLiveInvite,
  toInviteDisplayUrl,
  type ProfileInvite,
} from "@/components/messages/profile-invite-link-card";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * SPEC-MESAJLAR §16's `BAĞLANTIYLA DAVET` box. `Mesajlar.dc.html` `L1486–L1500`.
 *
 * Two controls that look like one card and are not: the **segment** changes the link
 * (an `editInfo` act) and the **copy button** only reads it. A plain member of an open
 * group can reach this modal — `permAddMembers: ALL` lets them add people — so the
 * segment is drawn for whoever may manage the invite and the field for everyone. A
 * greyed-out segment would have been the third option and is the wrong one: it advertises
 * a control the server is going to refuse.
 *
 * `selectLiveInvite` and `toInviteDisplayUrl` come from Ş7's card rather than being
 * written again — an expired invite is "no invite" on both surfaces or the two disagree
 * about the same row.
 */

const { inviteModal } = MESSAGES_METRICS;

const EXPIRY_VALUES = ["7d", "1d", "never"] as const;

const EXPIRY_LABEL_KEY: Readonly<Record<InviteLinkExpiry, string>> = Object.freeze({
  "1d": "messages.invite.expiry1d",
  "7d": "messages.invite.expiry7d",
  never: "messages.invite.expiryNever",
});

/**
 * Copy the link, and say so either way.
 *
 * Pure and exported because the failure branch is the one that matters and the one a
 * rendered-markup test cannot click into. A refused clipboard is the ordinary case, not
 * the exotic one: an insecure origin, a denied permission and a backgrounded tab all
 * reject, and swallowing that leaves the user pasting whatever was in the buffer before.
 *
 * The failure gets its **own** kind (`copyFailed`), not the success kind in a danger
 * tone: a red strip reading "Davet bağlantısı kopyalandı" is a lie in the colour that
 * means it did not happen.
 */
export async function copyInviteLinkToClipboard(
  url: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
  onToast?: ((toast: ConversationToast) => void) | undefined,
): Promise<boolean> {
  try {
    if (!clipboard) {
      throw new Error("Clipboard unavailable");
    }

    await clipboard.writeText(url);
    onToast?.({ kind: "inviteCopied", tone: "success" });

    return true;
  } catch {
    onToast?.({ kind: "copyFailed", tone: "danger" });

    return false;
  }
}

export type InviteLinkBoxProps = {
  /**
   * Whether the viewer may change the link. `editInfo` in the schema; a plain `MEMBER`
   * never holds it, which is the same test Ş7's card applies.
   */
  canManage: boolean;
  expiry: InviteLinkExpiry;
  invite: ProfileInvite;
  now?: Date | undefined;
  /** No live link yet and the viewer may mint one. Absent → the row is not drawn. */
  onCreate?: (() => void) | undefined;
  onSelectExpiry?: ((expiry: InviteLinkExpiry) => void) | undefined;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  /** A write is in flight; the segment stops accepting a second click. */
  pending?: boolean;
};

export function InviteLinkBox({
  canManage,
  expiry,
  invite,
  now,
  onCreate,
  onSelectExpiry,
  onToast,
  pending = false,
}: InviteLinkBoxProps) {
  const { t } = useI18n();
  const [copying, setCopying] = useState(false);
  const segmentRefs = useRef(new Map<InviteLinkExpiry, HTMLButtonElement>());
  const live = selectLiveInvite(invite, now ?? new Date());

  // Nothing to show and nothing to offer: a member of a group with no link sees no
  // box at all rather than an empty one with a dead field in it.
  if (!live && !canManage) {
    return null;
  }

  const focusExpiry = (next: InviteLinkExpiry) => {
    onSelectExpiry?.(next);
    // Focus moves with the selection: `aria-checked` changing while focus stays on the
    // old segment leaves a screen reader reading the one that is no longer chosen.
    segmentRefs.current.get(next)?.focus();
  };

  const handleSegmentKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = EXPIRY_VALUES.length - 1;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = EXPIRY_VALUES[(index + step + EXPIRY_VALUES.length) % EXPIRY_VALUES.length];

      if (next) {
        focusExpiry(next);
      }

      return;
    }

    if (event.key === "Home" && EXPIRY_VALUES[0]) {
      event.preventDefault();
      focusExpiry(EXPIRY_VALUES[0]);
      return;
    }

    if (event.key === "End" && EXPIRY_VALUES[last]) {
      event.preventDefault();
      focusExpiry(EXPIRY_VALUES[last]);
    }
  };

  const copy = async () => {
    if (copying || !live) {
      return;
    }

    setCopying(true);

    try {
      await copyInviteLinkToClipboard(
        live.url,
        typeof navigator === "undefined" ? undefined : navigator.clipboard,
        onToast,
      );
    } finally {
      setCopying(false);
    }
  };

  return (
    <div
      className="border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-soft)/0.55)]"
      data-testid="invite-link-box"
      style={{
        borderRadius: pxToRem(inviteModal.linkBoxRadius),
        borderWidth: hairline(),
        marginTop: pxToRem(inviteModal.linkBoxMarginTop),
        padding: pxToRem(inviteModal.linkBoxPadding),
      }}
    >
      <div className="flex items-center" style={{ gap: pxToRem(inviteModal.linkHeaderGap) }}>
        <div className="min-w-0 flex-1">
          <ProfileSectionLabel rule>{t("messages.invite.linkTitle")}</ProfileSectionLabel>
        </div>

        {canManage ? (
          <div
            aria-label={t("messages.invite.linkTitle")}
            className="inline-flex shrink-0 items-center border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))]"
            data-testid="invite-expiry-segment"
            role="radiogroup"
            style={{
              borderRadius: pxToRem(inviteModal.expirySegmentRadius),
              borderWidth: hairline(),
              gap: pxToRem(inviteModal.expirySegmentGap),
              padding: pxToRem(inviteModal.expirySegmentPadding),
            }}
          >
            {EXPIRY_VALUES.map((value, index) => {
              const selected = value === expiry;

              return (
                <button
                  aria-checked={selected}
                  className="whitespace-nowrap outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
                  data-testid={`invite-expiry-${value}`}
                  disabled={pending}
                  key={value}
                  onClick={() => onSelectExpiry?.(value)}
                  onKeyDown={(event) => handleSegmentKeyDown(event, index)}
                  ref={(node) => {
                    if (node) {
                      segmentRefs.current.set(value, node);
                    } else {
                      segmentRefs.current.delete(value);
                    }
                  }}
                  role="radio"
                  style={{
                    background: selected ? "hsl(var(--primary))" : "transparent",
                    borderRadius: pxToRem(inviteModal.expiryButtonRadius),
                    color: selected
                      ? "hsl(var(--primary-foreground))"
                      : "hsl(var(--text-secondary))",
                    fontSize: pxToRem(inviteModal.expiryButtonFontSize),
                    fontWeight: 600,
                    height: pxToRem(inviteModal.expiryButtonHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(inviteModal.expiryButtonPaddingX)}`,
                  }}
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  {t(EXPIRY_LABEL_KEY[value])}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {live ? (
        <div
          className="flex items-center"
          style={{
            gap: pxToRem(inviteModal.linkFieldGap),
            marginTop: pxToRem(inviteModal.linkFieldMarginTop),
          }}
        >
          <span
            className="min-w-0 flex-1 truncate border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] font-mono text-[hsl(var(--text-secondary))]"
            data-testid="invite-link-url"
            style={{
              borderRadius: pxToRem(inviteModal.linkFieldRadius),
              borderWidth: hairline(),
              fontSize: pxToRem(inviteModal.linkFieldFontSize),
              fontWeight: 500,
              lineHeight: 1.2,
              padding: `${pxToRem(inviteModal.linkFieldPaddingY)} ${pxToRem(
                inviteModal.linkFieldPaddingX,
              )}`,
            }}
          >
            {toInviteDisplayUrl(live.url)}
          </span>
          <button
            className="flex shrink-0 items-center bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))] outline-hidden transition-colors hover:bg-[hsl(var(--primary)/0.24)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="invite-link-copy"
            onClick={() => void copy()}
            style={{
              borderRadius: pxToRem(inviteModal.copyButtonRadius),
              fontSize: pxToRem(inviteModal.copyButtonFontSize),
              fontWeight: 600,
              gap: pxToRem(inviteModal.copyButtonGap),
              height: pxToRem(inviteModal.copyButtonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(inviteModal.copyButtonPaddingX)}`,
            }}
            type="button"
          >
            <Copy
              aria-hidden="true"
              style={{
                height: pxToRem(inviteModal.copyButtonIconSize),
                width: pxToRem(inviteModal.copyButtonIconSize),
              }}
            />
            {t("messages.invite.copy")}
          </button>
        </div>
      ) : onCreate ? (
        <button
          className="flex w-full items-center justify-center border-dashed border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] outline-hidden transition-colors hover:bg-[hsl(var(--primary)/0.16)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
          data-testid="invite-link-create"
          disabled={pending}
          onClick={onCreate}
          style={{
            borderRadius: pxToRem(inviteModal.linkFieldRadius),
            borderWidth: hairline(),
            fontSize: pxToRem(inviteModal.copyButtonFontSize),
            fontWeight: 600,
            gap: pxToRem(inviteModal.copyButtonGap),
            height: pxToRem(inviteModal.copyButtonHeight),
            lineHeight: 1,
            marginTop: pxToRem(inviteModal.linkFieldMarginTop),
          }}
          type="button"
        >
          <Link2
            aria-hidden="true"
            style={{
              height: pxToRem(inviteModal.copyButtonIconSize),
              width: pxToRem(inviteModal.copyButtonIconSize),
            }}
          />
          {t("messages.profile.invite.create")}
        </button>
      ) : null}
    </div>
  );
}
