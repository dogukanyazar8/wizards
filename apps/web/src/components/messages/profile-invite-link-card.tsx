"use client";

import React, { useState } from "react";
import { Copy, Link2 } from "lucide-react";
import type {
  ConversationToast,
  DMParticipantRole,
  GroupPermissionLevel,
  GroupProfilePanelDTO,
} from "@wizards/types";

import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * SPEC-MESAJLAR §15.4 — the `DAVET BAĞLANTISI` card. `Mesajlar.dc.html` `L1100–L1110`.
 *
 * Three states, and the third one is the point:
 *
 * 1. a live invite → the mono field, the 34×34 copy button and the validity line;
 * 2. no invite (or an expired one) and the viewer can manage the group → a single
 *    `Davet bağlantısı oluştur` row;
 * 3. no invite and the viewer is a plain member → **nothing at all**. Not a disabled
 *    field, not an empty card. A control the server will refuse is a promise the panel
 *    cannot keep.
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfileInvite = GroupProfilePanelDTO["invite"];

/**
 * `https://whispr.app/g/s24-ekibi` → `whispr.app/g/s24-ekibi`.
 *
 * Ş2's report §5.4: the DTO ships the **full** URL because a copyable link without a
 * scheme is not a link. The design's short form is a display concern and is derived here;
 * the clipboard still gets the full URL.
 */
export function toInviteDisplayUrl(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

/**
 * An expired invite is treated as no invite.
 *
 * The alternative — drawing the card and letting the copy button hand out a dead link —
 * fails at the far end, in a browser the sender cannot see, after they have already
 * pasted it into a chat.
 */
export function selectLiveInvite(invite: ProfileInvite, now: Date): ProfileInvite {
  if (!invite) {
    return null;
  }

  if (invite.expiresAt === null) {
    return invite;
  }

  const expiresAt = new Date(invite.expiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return invite;
  }

  return expiresAt.getTime() > now.getTime() ? invite : null;
}

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;

export type InviteValidity =
  | { readonly kind: "days"; readonly count: number }
  | { readonly kind: "forever" }
  | { readonly kind: "hours"; readonly count: number };

/** `7 gün geçerli` — the remaining window, rounded up to the unit the design prints. */
export function selectInviteValidity(
  invite: NonNullable<ProfileInvite>,
  now: Date,
): InviteValidity {
  if (invite.expiresAt === null) {
    return { kind: "forever" };
  }

  const remainingMs = new Date(invite.expiresAt).getTime() - now.getTime();

  if (Number.isNaN(remainingMs)) {
    return { kind: "forever" };
  }

  const remainingHours = Math.max(1, Math.ceil(remainingMs / MS_PER_HOUR));

  return remainingHours > HOURS_PER_DAY
    ? { kind: "days", count: Math.ceil(remainingHours / HOURS_PER_DAY) }
    : { kind: "hours", count: remainingHours };
}

/**
 * §15.4's second line reads `{süre} geçerli · {kural}` and the rule half is the **same**
 * value §15.5's `KİMLER ÜYE EKLEYEBİLİR` segment writes. One source: two lines that can
 * disagree will, and the panel would then be arguing with itself on one screen.
 */
export function inviteRuleKey(addPolicy: GroupPermissionLevel): string {
  return addPolicy === "ADMINS"
    ? "messages.profile.invite.ruleAdmins"
    : "messages.profile.invite.ruleEveryone";
}

/**
 * Copy the invite, and say so either way.
 *
 * A separate function rather than a closure inside the component because the failure path
 * is the one that matters and it is the one a rendered-markup test cannot reach. A refused
 * clipboard is the common case, not the exotic one: an insecure origin, a denied
 * permission and a background tab all reject, and swallowing that leaves the user pasting
 * whatever was in the buffer before.
 *
 * The strip has no `copyFailed` kind — `ConversationToastKindSchema` was frozen in Dalga 0
 * and `@wizards/types` is not this stripe's to write — so the failure travels as the same
 * kind in the danger tone. **Ş9 must read `tone` and print `chat.message.copyFailed` for
 * it**; a danger-toned "Davet bağlantısı kopyalandı" would be a red lie. See
 * `raporlar/09-rapor.md`.
 */
export async function copyInviteLink(
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
    // A failure needs its own sentence. `inviteCopied` in a danger tone would say
    // "Davet bağlantısı kopyalandı" in the colour that means it did not happen.
    onToast?.({ kind: "copyFailed", tone: "danger" });

    return false;
  }
}

export type ProfileInviteLinkCardProps = {
  addPolicy: GroupPermissionLevel;
  /** The create mutation is in flight; the row stops accepting a second click. */
  creating?: boolean;
  invite: ProfileInvite;
  now?: Date | undefined;
  /** Absent when the caller has no create path — the row is then not drawn. */
  onCreate?: (() => void) | undefined;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  viewerRole: DMParticipantRole;
};

export function ProfileInviteLinkCard({
  addPolicy,
  creating = false,
  invite,
  now,
  onCreate,
  onToast,
  viewerRole,
}: ProfileInviteLinkCardProps) {
  const { t } = useI18n();
  const [copying, setCopying] = useState(false);
  const live = selectLiveInvite(invite, now ?? new Date());

  if (!live) {
    if (viewerRole === "MEMBER" || !onCreate) {
      return null;
    }

    return (
      <button
        className="flex items-center justify-center border-dashed border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] outline-hidden transition-colors hover:bg-[hsl(var(--primary)/0.16)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
        data-testid="profile-invite-create"
        disabled={creating}
        onClick={onCreate}
        // The create row borrows the `Üye ekle` button's measurements rather than
        // inventing a second dashed shape; §15.4 draws no separate one.
        style={{
          borderRadius: pxToRem(profilePanel.memberAddButtonRadius),
          borderWidth: hairline(),
          fontSize: pxToRem(profilePanel.memberAddButtonFontSize),
          fontWeight: 600,
          gap: pxToRem(profilePanel.memberAddButtonGap),
          height: pxToRem(profilePanel.memberAddButtonHeight),
          lineHeight: 1,
        }}
        type="button"
      >
        <Link2
          aria-hidden="true"
          style={{
            height: pxToRem(profilePanel.memberAddButtonIconSize),
            width: pxToRem(profilePanel.memberAddButtonIconSize),
          }}
        />
        {t("messages.profile.invite.create")}
      </button>
    );
  }

  const validity = selectInviteValidity(live, now ?? new Date());
  const duration =
    validity.kind === "forever"
      ? t("messages.invite.expiryNever")
      : t(validity.kind === "days" ? "home.time.days" : "home.time.hours", {
          count: validity.count,
        });

  const copy = async () => {
    if (copying) {
      return;
    }

    setCopying(true);

    try {
      await copyInviteLink(
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
      className="border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))]"
      data-testid="profile-invite-card"
      style={{
        borderRadius: pxToRem(profilePanel.memberInviteCardRadius),
        borderWidth: hairline(),
        padding: pxToRem(profilePanel.memberInviteCardPadding),
      }}
    >
      <ProfileSectionLabel>{t("messages.profile.section.inviteLink")}</ProfileSectionLabel>

      <div
        className="flex items-center"
        style={{
          gap: pxToRem(profilePanel.memberInviteFieldGap),
          marginTop: pxToRem(profilePanel.memberInviteFieldMarginTop),
        }}
      >
        <span
          className="min-w-0 flex-1 truncate border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-soft)/0.8)] font-mono text-[hsl(var(--text-secondary))]"
          data-testid="profile-invite-url"
          style={{
            borderRadius: pxToRem(profilePanel.memberInviteFieldRadius),
            borderWidth: hairline(),
            fontSize: pxToRem(profilePanel.memberInviteFieldFontSize),
            fontWeight: 500,
            lineHeight: 1.2,
            padding: `${pxToRem(profilePanel.memberInviteFieldPaddingY)} ${pxToRem(
              profilePanel.memberInviteFieldPaddingX,
            )}`,
          }}
        >
          {toInviteDisplayUrl(live.url)}
        </span>
        <button
          aria-label={t("messages.profile.invite.copy")}
          className="grid shrink-0 place-items-center bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))] outline-hidden transition-colors hover:bg-[hsl(var(--primary)/0.24)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="profile-invite-copy"
          onClick={() => void copy()}
          style={{
            borderRadius: pxToRem(profilePanel.memberInviteCopyRadius),
            height: pxToRem(profilePanel.memberInviteCopySize),
            width: pxToRem(profilePanel.memberInviteCopySize),
          }}
          type="button"
        >
          <Copy
            aria-hidden="true"
            style={{
              height: pxToRem(profilePanel.memberInviteCopyIconSize),
              width: pxToRem(profilePanel.memberInviteCopyIconSize),
            }}
          />
        </button>
      </div>

      <div
        className="text-[hsl(var(--text-muted))]"
        data-testid="profile-invite-validity"
        style={{
          fontSize: pxToRem(profilePanel.memberInviteNoteFontSize),
          marginTop: pxToRem(profilePanel.memberInviteNoteMarginTop),
        }}
      >
        {t("messages.profile.invite.validity", { duration, rule: t(inviteRuleKey(addPolicy)) })}
      </div>
    </div>
  );
}
