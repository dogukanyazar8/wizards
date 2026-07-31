/**
 * A token that exists only so one request can be found from both ends.
 *
 * The device can say a DM read took 1347ms and the edge can say a DM GET took
 * 337ms; without a shared id there is no way to know whether those describe the
 * same call, and a single slow sample cannot be looked up in the edge's record.
 *
 * Derived from nothing about the reader. An id built from a user or session
 * would make every server log line a stable identifier for the person behind it,
 * which is the opposite of what a correlation token is for. What it needs is
 * collision resistance across a session, not unpredictability.
 */
export const MOBILE_REQUEST_ID_HEADER = "X-Request-Id";

/** 16 bytes: 32 hex characters, inside the server's 8-64 validation window. */
const REQUEST_ID_BYTES = 16;

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

export function createMobileRequestId(): string {
  const bytes = new Uint8Array(REQUEST_ID_BYTES);
  const randomSource = globalThis.crypto;

  if (typeof randomSource?.getRandomValues === "function") {
    randomSource.getRandomValues(bytes);
  } else {
    // Hermes without a crypto global. Still derived from nothing the reader
    // owns, which is the property that matters here.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return toHex(bytes);
}
