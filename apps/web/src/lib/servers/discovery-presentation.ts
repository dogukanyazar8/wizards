/**
 * S3 Bölüm E requires the three known join failures (banned, full, not
 * available) to render separate, honest copy instead of one blanket "bir
 * şeyler ters gitti". Pure so the mapping is assertable without a component:
 * each `ServerDiscoveryClientError.code` resolves to a locale key *base* --
 * the caller reads `${base}.title` and `${base}.description` from the
 * dictionary, the same two-key shape `serverSettings.visibility.*` already
 * uses.
 *
 * `SERVER_NOT_FOUND` covers both "no such server" and "private/not
 * discoverable" (S3's binding contract: the join route never distinguishes
 * the two, so this does not invent a distinction the backend does not make).
 * Anything else -- network failure, an unmapped code, no code at all -- falls
 * back to a generic, still-honest "couldn't join, try again" bucket, which is
 * not the same thing as papering over a *known* reason.
 */
export function resolveServerJoinErrorMessageKey(code: string | undefined): string {
  switch (code) {
    case "SERVER_BANNED":
      return "discover.joinError.banned";
    case "SERVER_FULL":
      return "discover.joinError.full";
    case "SERVER_NOT_FOUND":
      return "discover.joinError.unavailable";
    default:
      return "discover.joinError.generic";
  }
}
