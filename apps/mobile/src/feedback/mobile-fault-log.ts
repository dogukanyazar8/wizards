import type { MobileFeedbackDiagnostics } from "@wizards/types";

import {
  classifyMobileBoundaryFault,
  createMobileBoundaryFaultReference,
} from "../app/mobile-error-boundary-model";

export type MobileFeedbackFault = MobileFeedbackDiagnostics["recentFaults"][number];

/** Matches the diagnostics contract cap, so the buffer can never overflow it. */
export const MOBILE_FAULT_LOG_LIMIT = 5;

/**
 * The crash trail a 4a report can carry.
 *
 * Deliberately only the classified kind and the reference code the boundary
 * already prints — never the error message, which can hold a token, a channel
 * name or message text. In-memory on purpose: a fault trail is context for a
 * report written in the same session, not a durable log that outlives it.
 */
let faults: readonly MobileFeedbackFault[] = [];

export function recordMobileFault(error: unknown, now: Date = new Date()): void {
  const entry: MobileFeedbackFault = {
    at: now.toISOString(),
    kind: classifyMobileBoundaryFault(error),
    reference: createMobileBoundaryFaultReference(error, now.getTime()),
  };

  faults = [entry, ...faults].slice(0, MOBILE_FAULT_LOG_LIMIT);
}

/** Newest first, matching the order the diagnostics contract documents. */
export function readMobileFaultLog(): readonly MobileFeedbackFault[] {
  return faults;
}

export function clearMobileFaultLog(): void {
  faults = [];
}
