import type { ProfileTint } from "@wizards/types";

import { MESSAGES_METRICS } from "@/lib/messages/metrics";

/**
 * SPEC-MESAJLAR §15.1 — the tint a person or group carries on every surface, turned
 * into the two CSS values a component actually needs.
 *
 * The **choice** of tint lives in `@wizards/types` (`resolveProfileTint`), because the
 * server stamps it onto every DTO and the client must not disagree. What lives here is
 * only the paint: which token, and at what opacity. Splitting it that way is what keeps
 * the rail, the profile identity block, the member rows and the invite candidates the
 * same colour for the same person — a second hash on the client would drift the moment
 * either side changed.
 *
 * `neutral` is the missing-identity fallback and is the one tint that is not a status
 * colour: it paints `--surface-tertiary`, so an unknown subject reads as "no colour"
 * rather than as a muted danger.
 */

const { profilePanel } = MESSAGES_METRICS;

/** The token each tint paints with. Not a colour — the name of one. */
const TINT_TOKEN: Readonly<Record<ProfileTint, string>> = Object.freeze({
  danger: "--danger",
  neutral: "--surface-tertiary",
  primary: "--primary",
  success: "--success",
  warning: "--warning",
});

/**
 * Danger sits a notch fainter than the other three: at the same opacity red reads
 * heavier than indigo, green or amber, and the design draws it back to compensate.
 */
function surfaceAlpha(tint: ProfileTint): number {
  return tint === "danger" ? profilePanel.tintSurfaceAlphaDanger : profilePanel.tintSurfaceAlpha;
}

/** Background for a letter tile, chip or avatar carrying this tint. */
export function profileTintSurface(tint: ProfileTint): string {
  return tint === "neutral"
    ? `hsl(var(${TINT_TOKEN.neutral}))`
    : `hsl(var(${TINT_TOKEN[tint]})/${surfaceAlpha(tint)})`;
}

/** Foreground (initials, icon) for that same tile. */
export function profileTintForeground(tint: ProfileTint): string {
  return tint === "neutral" ? "hsl(var(--text-secondary))" : `hsl(var(${TINT_TOKEN[tint]}))`;
}

/**
 * Solid fill — the group identity tile and the presence ring, which sit on the token
 * itself rather than on a tint of it.
 */
export function profileTintSolid(tint: ProfileTint): string {
  return `hsl(var(${TINT_TOKEN[tint]}))`;
}

/** A ring or border derived from the same tint, at an explicit opacity. */
export function profileTintAlpha(tint: ProfileTint, alpha: number): string {
  return `hsl(var(${TINT_TOKEN[tint]})/${alpha})`;
}
