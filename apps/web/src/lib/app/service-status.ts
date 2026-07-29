import {
  MobileServiceStatusResponseSchema,
  type MobileServiceStatusResponse,
} from "@wizards/types";

import { getReadinessPayload, type ReadinessPayload } from "@/lib/health";

/**
 * 1b's "Servis durumu" row. The readiness probe already knows whether the
 * database and Redis answer; this reduces that to the three levels the row can
 * render and nothing else.
 *
 * No label crosses the wire. "Sorunsuz" / "Kısmi yavaşlık" / "Kesinti" are
 * client copy in `mobile-copy.ts`, so an English build must not receive a
 * Turkish string it cannot translate.
 */

export const WHISPR_STATUS_PAGE_URL =
  process.env.NEXT_PUBLIC_WHISPR_STATUS_PAGE_URL ?? "https://status.whispr.team";

export type MobileServiceStatusDependencies = {
  getReadiness: () => Promise<ReadinessPayload>;
  now: () => Date;
  statusUrl: string;
};

const defaultDependencies: MobileServiceStatusDependencies = {
  getReadiness: () => getReadinessPayload(),
  now: () => new Date(),
  statusUrl: WHISPR_STATUS_PAGE_URL,
};

export async function getMobileServiceStatus(
  dependencies: MobileServiceStatusDependencies = defaultDependencies,
): Promise<MobileServiceStatusResponse> {
  const checkedAt = dependencies.now().toISOString();

  let payload: ReadinessPayload | null = null;

  try {
    payload = await dependencies.getReadiness();
  } catch {
    // The probe itself failing is the strongest signal there is: the row says
    // "Kesinti" rather than pretending the check never happened.
    payload = null;
  }

  const level = resolveLevel(payload);

  return MobileServiceStatusResponseSchema.parse({
    checkedAt: payload?.timestamp ?? checkedAt,
    level,
    url: dependencies.statusUrl,
  });
}

/**
 * A dependency being down does not mean the app is: this endpoint answered, so
 * the worst it can honestly claim about itself is `degraded`. `down` is
 * reserved for the probe not completing at all.
 */
function resolveLevel(payload: ReadinessPayload | null) {
  if (!payload) {
    return "down" as const;
  }

  return payload.status === "ok" ? ("ok" as const) : ("degraded" as const);
}
