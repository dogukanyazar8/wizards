import { z } from "zod";

export const PROFILE_BIO_MAX_LENGTH = 250;
export const PROFILE_STATUS_MAX_LENGTH = 128;
export const PROFILE_STATUS_EMOJI_MAX_LENGTH = 64;

/** Append whole selections; never truncate a skin tone or ZWJ emoji midway. */
export function appendProfileStatusEmoji(
  current: string | null | undefined,
  emoji: string,
): string {
  const next = `${current ?? ""}${emoji}`;
  return next.length <= PROFILE_STATUS_EMOJI_MAX_LENGTH ? next : (current ?? "");
}

export function profileStatusRefetchInterval(expiresAt: string | null | undefined): number | false {
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) return false;
  return Math.max(1000, Math.min(60_000, Date.parse(expiresAt) - Date.now() + 50));
}

export const ProfileDetailsUpdateSchema = z
  .object({
    bio: z.string().trim().max(PROFILE_BIO_MAX_LENGTH).nullable().optional(),
    customStatus: z.string().trim().max(PROFILE_STATUS_MAX_LENGTH).nullable().optional(),
    customStatusEmoji: z.string().trim().max(PROFILE_STATUS_EMOJI_MAX_LENGTH).nullable().optional(),
    customStatusExpiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type ProfileDetailsUpdate = z.infer<typeof ProfileDetailsUpdateSchema>;

export function activeProfileStatus<
  T extends {
    customStatus: string | null;
    customStatusEmoji: string | null;
    customStatusExpiresAt: string | Date | null;
  },
>(value: T, now = Date.now()) {
  const expires = value.customStatusExpiresAt
    ? new Date(value.customStatusExpiresAt).getTime()
    : null;
  const visible = Boolean(value.customStatus?.trim()) && (expires === null || expires > now);
  return {
    customStatus: visible ? value.customStatus : null,
    customStatusEmoji: visible ? value.customStatusEmoji : null,
    customStatusExpiresAt: visible && expires !== null ? new Date(expires).toISOString() : null,
  };
}

/**
 * 2a lets the user pick how long a status message lives; the contract stores an absolute
 * instant. Both directions live here so the screen stays free of clock math and the
 * conversion is testable without React.
 */
export type ProfileStatusExpiryChoice = "never" | "30m" | "1h" | "4h" | "today";

export const PROFILE_STATUS_EXPIRY_CHOICES: readonly ProfileStatusExpiryChoice[] = [
  "never",
  "30m",
  "1h",
  "4h",
  "today",
];

export type ProfileStatusExpiryDescription =
  { kind: "expired" } | { kind: "none" } | { count: number; kind: "days" | "hours" | "minutes" };

const MINUTE_MS = 60_000;
const CHOICE_MINUTES: Readonly<
  Record<Exclude<ProfileStatusExpiryChoice, "never" | "today">, number>
> = {
  "1h": 60,
  "30m": 30,
  "4h": 240,
};

/** Absolute instant the chosen duration lands on, or null when the status is permanent. */
export function resolveProfileStatusExpiresAt(
  choice: ProfileStatusExpiryChoice,
  now: Date = new Date(),
): string | null {
  if (choice === "never") {
    return null;
  }

  if (choice === "today") {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    // Just before midnight "today" would resolve into the past, which the API rejects.
    return new Date(Math.max(endOfDay.getTime(), now.getTime() + MINUTE_MS)).toISOString();
  }

  return new Date(now.getTime() + CHOICE_MINUTES[choice] * MINUTE_MS).toISOString();
}

/** Rounded remaining time, so the screen only has to pick a copy key. */
export function describeProfileStatusExpiry(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): ProfileStatusExpiryDescription {
  if (!expiresAt) {
    return { kind: "none" };
  }

  const target = Date.parse(expiresAt);
  if (!Number.isFinite(target)) {
    return { kind: "none" };
  }

  const remaining = target - now.getTime();
  if (remaining <= 0) {
    return { kind: "expired" };
  }

  const minutes = Math.ceil(remaining / MINUTE_MS);
  if (minutes < 60) {
    return { count: minutes, kind: "minutes" };
  }

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) {
    return { count: hours, kind: "hours" };
  }

  return { count: Math.ceil(hours / 24), kind: "days" };
}

/** A status whose instant has passed is already hidden server-side; the device agrees. */
export function isProfileStatusExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return describeProfileStatusExpiry(expiresAt, now).kind === "expired";
}

/**
 * Which chip to preselect for a stored instant. The server keeps no record of the option
 * the user picked, so the closest offered duration wins.
 */
export function inferProfileStatusExpiryChoice(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): ProfileStatusExpiryChoice {
  const description = describeProfileStatusExpiry(expiresAt, now);
  if (description.kind === "none" || description.kind === "expired") {
    return "never";
  }

  const target = Date.parse(expiresAt as string);
  let closest: ProfileStatusExpiryChoice = "30m";
  let smallestGap = Number.POSITIVE_INFINITY;

  for (const choice of PROFILE_STATUS_EXPIRY_CHOICES) {
    if (choice === "never") {
      continue;
    }

    const candidate = resolveProfileStatusExpiresAt(choice, now);
    if (!candidate) {
      continue;
    }

    const gap = Math.abs(Date.parse(candidate) - target);
    if (gap < smallestGap) {
      smallestGap = gap;
      closest = choice;
    }
  }

  return closest;
}
