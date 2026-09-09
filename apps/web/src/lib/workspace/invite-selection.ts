import type { MobileServerInvite, WorkspaceInvite } from "@wizards/types";

/**
 * Pure invite-liveness and projection rules shared by the mobile invite sheet
 * (handoff 2a/2b), the targeted-invite writes and the search's server context.
 * Kept free of Prisma so "is this invite still usable?" and "what may a device
 * see of it?" are each stated once and tested directly.
 */

export interface InviteLifetimeFields {
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly uses: number;
}

/** Live = not past its expiry and not out of seats. */
export function isLiveInvite(invite: InviteLifetimeFields, now: number): boolean {
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now) {
    return false;
  }

  return invite.maxUses === null || invite.uses < invite.maxUses;
}

export interface LinkInviteCandidate extends InviteLifetimeFields {
  readonly createdAt: Date;
  readonly targetUserId: string | null;
}

/**
 * The link card shows one reusable invite: the newest live invite that is not
 * aimed at a specific person. A targeted invite is single-use and private to
 * its recipient, so it can never become the shared link.
 */
export function selectActiveLinkInvite<TInvite extends LinkInviteCandidate>(
  invites: readonly TInvite[],
  now: number,
): TInvite | null {
  let selected: TInvite | null = null;

  for (const invite of invites) {
    if (invite.targetUserId !== null || !isLiveInvite(invite, now)) {
      continue;
    }
    if (!selected || invite.createdAt.getTime() > selected.createdAt.getTime()) {
      selected = invite;
    }
  }

  return selected;
}

/**
 * Projects a stored invite into the shape a device may see.
 *
 * The raw `WorkspaceInvite` carries `code`, and the mobile contract is
 * `.strict()` without it — spreading the stored row into a response is both a
 * secret leak and a parse failure. Every mobile invite response goes through
 * this one projection so neither can happen at a single call site.
 */
export function toMobileServerInvite(
  invite: WorkspaceInvite,
  buildShareUrl: (code: string) => string,
): MobileServerInvite {
  return {
    channelId: invite.channelId,
    createdAt: invite.createdAt,
    createdByDisplayName: invite.createdByDisplayName,
    expiresAt: invite.expiresAt,
    id: invite.id,
    maxUses: invite.maxUses,
    shareUrl: buildShareUrl(invite.code),
    // K10: hedefli davet artık mobil sözleşmede de görünür. Kimlik değil, yalnız
    // "bu bağlantı tek kişiye ait mi" bilgisi geçiyor.
    targetUserId: invite.targetUserId,
    uses: invite.uses,
  };
}
