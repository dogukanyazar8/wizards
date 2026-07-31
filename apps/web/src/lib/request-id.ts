/**
 * One request, findable from both ends.
 *
 * A device panel can say a DM read took 1347ms and the edge can say a DM GET
 * took 337ms, and until now there was no way to tell whether those were the same
 * request. The client mints a random token per request and this reflects it back
 * on the response and into the error log, so a single slow sample on a phone can
 * be looked up in the edge's record of the same call.
 *
 * Read-only on purpose: the id is never generated here. An id the device does
 * not know correlates nothing, and one derived from a user or session would turn
 * every log line into a stable identifier for the person who made the request.
 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Opaque, bounded, and echoed — so it is validated before it is trusted with
 * either a response header or a log line.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function readRequestId(headers: Headers): string | null {
  const value = headers.get(REQUEST_ID_HEADER)?.trim();

  return value && SAFE_REQUEST_ID.test(value) ? value : null;
}
