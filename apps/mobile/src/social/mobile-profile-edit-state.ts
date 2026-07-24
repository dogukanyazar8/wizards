import type { MobileProfileUpdate } from "@wizards/types";

import {
  inferMobileStatusExpiryChoice,
  resolveMobileStatusExpiresAt,
  type MobileStatusExpiryChoice,
} from "./mobile-profile-status-expiry";

/** Server-side values the editor diffs against; the shape the 2a screen loads. */
export type MobileProfileEditBaseline = {
  readonly bannerColor: string | null;
  /** Normalized banner focal point (0..1); null means centred, never repositioned. */
  readonly bannerOffsetX: number | null;
  readonly bannerOffsetY: number | null;
  readonly bannerUrl: string | null;
  readonly bio: string | null;
  readonly customStatus: string | null;
  readonly customStatusEmoji: string | null;
  readonly customStatusExpiresAt: string | null;
  readonly displayName: string | null;
  readonly username: string;
};

export type MobileProfileEditDraft = {
  readonly bannerColor: string | null;
  readonly bannerOffsetX: number | null;
  readonly bannerOffsetY: number | null;
  readonly bannerUrl: string | null;
  readonly bio: string;
  readonly customStatus: string;
  readonly customStatusEmoji: string | null;
  readonly displayName: string;
  /** The picked duration, not an instant: "4 hours" means 4h from the save, not from load. */
  readonly statusExpiry: MobileStatusExpiryChoice;
  readonly username: string;
};

export function createMobileProfileEditDraft(
  baseline: MobileProfileEditBaseline,
  now: Date = new Date(),
): MobileProfileEditDraft {
  return {
    bannerColor: baseline.bannerColor,
    bannerOffsetX: baseline.bannerOffsetX,
    bannerOffsetY: baseline.bannerOffsetY,
    bannerUrl: baseline.bannerUrl,
    bio: baseline.bio ?? "",
    customStatus: baseline.customStatus ?? "",
    customStatusEmoji: baseline.customStatusEmoji,
    displayName: baseline.displayName ?? "",
    statusExpiry: inferMobileStatusExpiryChoice(baseline.customStatusExpiresAt, now),
    username: baseline.username,
  };
}

/**
 * The single PATCH the "Kaydet" chip sends: only fields the user actually moved.
 * An unchanged status message never re-sends its expiry, so opening the screen cannot
 * quietly push an existing deadline forward.
 */
export function buildMobileProfileEditPatch(input: {
  readonly baseline: MobileProfileEditBaseline;
  readonly draft: MobileProfileEditDraft;
  readonly now?: Date;
}): MobileProfileUpdate {
  const { baseline, draft } = input;
  const now = input.now ?? new Date();
  const patch: Record<string, unknown> = {};

  const displayName = draft.displayName.trim();
  if (displayName !== (baseline.displayName ?? "")) {
    patch.displayName = displayName || null;
  }

  const username = draft.username.trim();
  if (username !== baseline.username) {
    patch.username = username;
  }

  const bio = draft.bio.trim();
  if (bio !== (baseline.bio ?? "")) {
    patch.bio = bio || null;
  }

  if (draft.bannerColor !== baseline.bannerColor) {
    patch.bannerColor = draft.bannerColor;
  }

  if (draft.bannerUrl !== baseline.bannerUrl) {
    patch.bannerUrl = draft.bannerUrl;
  }

  if (draft.bannerOffsetX !== baseline.bannerOffsetX) {
    patch.bannerOffsetX = draft.bannerOffsetX;
  }

  if (draft.bannerOffsetY !== baseline.bannerOffsetY) {
    patch.bannerOffsetY = draft.bannerOffsetY;
  }

  const customStatus = draft.customStatus.trim();
  const statusTextChanged = customStatus !== (baseline.customStatus ?? "");
  const statusEmojiChanged = draft.customStatusEmoji !== baseline.customStatusEmoji;
  const statusExpiryChanged =
    draft.statusExpiry !== inferMobileStatusExpiryChoice(baseline.customStatusExpiresAt, now);

  if (statusTextChanged) {
    patch.customStatus = customStatus || null;
  }

  // Clearing the message drops its emoji and deadline with it.
  if (statusEmojiChanged || (statusTextChanged && !customStatus)) {
    patch.customStatusEmoji = customStatus ? draft.customStatusEmoji : null;
  }

  if (statusExpiryChanged || statusTextChanged) {
    patch.customStatusExpiresAt = customStatus
      ? resolveMobileStatusExpiresAt(draft.statusExpiry, now)
      : null;
  }

  return patch as MobileProfileUpdate;
}

export function isMobileProfileEditDirty(input: {
  readonly baseline: MobileProfileEditBaseline;
  readonly draft: MobileProfileEditDraft;
  readonly now?: Date;
}): boolean {
  return Object.keys(buildMobileProfileEditPatch(input)).length > 0;
}
