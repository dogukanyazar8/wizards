export type MobileCrashReportTokenReader = () => Promise<string | null>;

/**
 * How the crash screen reaches an authenticated API without a provider above it.
 *
 * Both boundaries are mounted *outside* the auth provider on purpose — a crash
 * inside the session runtime has to land somewhere the session runtime is not —
 * so the fallback cannot read a token through context. The auth provider
 * publishes its reader here, and the boundary picks it up only when the user
 * asks to send a report.
 *
 * The reader outlives the provider that registered it, because a caught render
 * error unmounts that provider before the crash screen can ask for anything. It
 * keeps answering from the last known session, and a signed-out one answers
 * `null`, which is what the screen needs to know.
 *
 * Deliberately a token reader rather than a whole client: this module must never
 * become a second way to call the API.
 */
let readAccessToken: MobileCrashReportTokenReader | null = null;

export function setMobileCrashReportTokenReader(reader: MobileCrashReportTokenReader | null): void {
  readAccessToken = reader;
}

export function getMobileCrashReportTokenReader(): MobileCrashReportTokenReader | null {
  return readAccessToken;
}
