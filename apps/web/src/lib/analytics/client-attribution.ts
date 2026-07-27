import type { AnalyticsClientType } from "@wizards/db";
import { getAnalyticsClientInfo, type AnalyticsClientInfo } from "@/lib/analytics/client-info";

/**
 * Attribution travels through three independent write paths (REST, socket,
 * outbox). One carrier type keeps them from drifting: a new metric writer has to
 * accept this parameter, so the compiler asks the question instead of silently
 * recording UNKNOWN.
 */
export type ClientAttribution = {
  appVersion: string | null;
  clientType: AnalyticsClientType;
};

/** Pass this explicitly when the writer genuinely cannot know the client. */
export const UNKNOWN_ATTRIBUTION: ClientAttribution = {
  appVersion: null,
  clientType: "UNKNOWN",
};

export function toClientAttribution(info: AnalyticsClientInfo): ClientAttribution {
  return { appVersion: info.appVersion, clientType: info.clientType };
}

/**
 * The cutoff rule. A client that never identified itself leaves a guessed
 * `clientType` behind — sessions recorded before the header contract hold one
 * too. Metric tables have no flag to mark a guess, so guesses are recorded as
 * UNKNOWN rather than being passed off as measurements.
 */
export function resolveVerifiedAttribution(source: {
  appVersion: string | null;
  attributionVerified: boolean;
  clientType: AnalyticsClientType;
}): ClientAttribution {
  if (!source.attributionVerified) {
    return UNKNOWN_ATTRIBUTION;
  }

  return { appVersion: source.appVersion, clientType: source.clientType };
}

export function readRequestAttribution(
  headers: Parameters<typeof getAnalyticsClientInfo>[0],
): ClientAttribution {
  // REST requests have no persisted session record whose historic user-agent
  // guess needs quarantining. Keep the live fallback so ordinary browsers are
  // attributed as WEB while an absent user agent remains UNKNOWN.
  return toClientAttribution(getAnalyticsClientInfo(headers));
}
