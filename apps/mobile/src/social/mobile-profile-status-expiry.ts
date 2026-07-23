/**
 * 2a lets the user pick how long a status message lives; the contract stores an absolute
 * instant. Both directions live here so the screen stays free of clock math and the
 * conversion is testable without React.
 */
export type MobileStatusExpiryChoice = "never" | "30m" | "1h" | "4h" | "today";

export const MOBILE_STATUS_EXPIRY_CHOICES: readonly MobileStatusExpiryChoice[] = [
  "never",
  "30m",
  "1h",
  "4h",
  "today",
];

export type MobileStatusExpiryDescription =
  { kind: "expired" } | { kind: "none" } | { count: number; kind: "days" | "hours" | "minutes" };

const MINUTE_MS = 60_000;
const CHOICE_MINUTES: Readonly<
  Record<Exclude<MobileStatusExpiryChoice, "never" | "today">, number>
> = {
  "1h": 60,
  "30m": 30,
  "4h": 240,
};

/** Absolute instant the chosen duration lands on, or null when the status is permanent. */
export function resolveMobileStatusExpiresAt(
  choice: MobileStatusExpiryChoice,
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
export function describeMobileStatusExpiry(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): MobileStatusExpiryDescription {
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
export function isMobileStatusExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return describeMobileStatusExpiry(expiresAt, now).kind === "expired";
}

/**
 * Which chip to preselect for a stored instant. The server keeps no record of the option
 * the user picked, so the closest offered duration wins.
 */
export function inferMobileStatusExpiryChoice(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): MobileStatusExpiryChoice {
  const description = describeMobileStatusExpiry(expiresAt, now);
  if (description.kind === "none" || description.kind === "expired") {
    return "never";
  }

  const target = Date.parse(expiresAt as string);
  let closest: MobileStatusExpiryChoice = "30m";
  let smallestGap = Number.POSITIVE_INFINITY;

  for (const choice of MOBILE_STATUS_EXPIRY_CHOICES) {
    if (choice === "never") {
      continue;
    }

    const candidate = resolveMobileStatusExpiresAt(choice, now);
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
