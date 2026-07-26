/**
 * What the crash screen is allowed to say about a caught error.
 *
 * The boundary must never print the error itself — a message can carry a token,
 * a channel name, or message text. So the raw error is only ever *matched* here,
 * and what leaves this module is a coarse kind plus a short reference code. The
 * kind drives one problem sentence and one fix sentence from the copy table; the
 * code lets support find the Sentry event without the user reading anything
 * sensitive out loud.
 */
export type MobileBoundaryFaultKind = "bundle" | "network" | "render" | "storage";

const NETWORK_ERROR_NAMES = ["AbortError", "MobileApiError", "MobileOfflineError"];
const NETWORK_MESSAGE = /network request failed|timed? ?out|econnreset|enotfound|failed to fetch/i;
const BUNDLE_MESSAGE =
  /requiring unknown module|unknown named module|failed to load (?:the )?bundle|chunkloaderror|loading chunk/i;
const STORAGE_MESSAGE = /securestore|asyncstorage|keychain|keystore|mmkv|sqlite/i;

const FAULT_KIND_PREFIX: Record<MobileBoundaryFaultKind, string> = {
  bundle: "B",
  network: "N",
  render: "R",
  storage: "S",
};

export function classifyMobileBoundaryFault(error: unknown): MobileBoundaryFaultKind {
  if (!(error instanceof Error)) {
    return "render";
  }

  if (NETWORK_ERROR_NAMES.includes(error.name) || NETWORK_MESSAGE.test(error.message)) {
    return "network";
  }

  if (BUNDLE_MESSAGE.test(error.message)) {
    return "bundle";
  }

  if (STORAGE_MESSAGE.test(error.message)) {
    return "storage";
  }

  return "render";
}

/**
 * `WB-<kind>-<minute>`: readable aloud over the phone, and coarse enough that
 * it identifies the crash window rather than the user. Two crashes in the same
 * minute of the same kind share a code on purpose — the Sentry event is found
 * by kind and time, not by this string being unique.
 */
export function createMobileBoundaryFaultReference(error: unknown, now = Date.now()): string {
  const kind = classifyMobileBoundaryFault(error);
  const minute = Math.floor(now / 60_000)
    .toString(36)
    .toUpperCase();

  return `WB-${FAULT_KIND_PREFIX[kind]}-${minute.slice(-6)}`;
}
