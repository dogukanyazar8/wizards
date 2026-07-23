/**
 * 10a mention parsing. The server decides who gets a MENTION notification with
 * `extractMentionUsernames` in
 * `apps/web/src/lib/workspace/message-notification-service.ts`; the client must
 * highlight exactly the tokens that produce a notification, so the pattern and
 * the reserved-name list below are a literal port of that service. Both sides
 * are pinned by the same example set in
 * `apps/mobile/scripts/mobile-mention.test.ts`.
 */

/** Mirrors the server pattern: a mention only starts a word. */
const MENTION_PATTERN = /(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/g;
/** Same character class as the pattern, for cursor-side query detection. */
const MENTION_CHARACTER = /[a-zA-Z0-9_.-]/;
const MENTION_BOUNDARY = /[\s([{]/;
const MENTION_MAX_LENGTH = 32;
const LINK_PATTERN = /(https:\/\/[^\s]+)/g;

/** `@everyone` and `@here` are mass mentions, never usernames. */
export const MOBILE_RESERVED_MENTIONS: ReadonlySet<string> = new Set(["everyone", "here"]);

export const MOBILE_MENTION_SUGGESTION_LIMIT = 6;

/**
 * How many members the composer keeps in memory for autocomplete and mention
 * highlighting. The roster is paged 50 at a time; without a bound, opening a
 * channel on a large server would walk every page, and the loaded pages both
 * persist to disk and get refetched as one unit. Past this point the client
 * degrades the way it always has — an unloaded member is not suggested and
 * their handle renders as plain text — while the server still delivers the
 * notification, because it resolves mentions from the database.
 */
export const MOBILE_MENTION_ROSTER_MEMBER_LIMIT = 200;

export type MobileMentionSegment =
  | { readonly type: "link"; readonly value: string }
  | { readonly type: "mention"; readonly username: string; readonly value: string }
  | { readonly type: "text"; readonly value: string };

export interface MobileMentionCandidate {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly userId: string;
  readonly username: string;
}

export interface MobileMentionQuery {
  /** Text between `@` and the caret, may be empty right after typing `@`. */
  readonly query: string;
  /** Index of the `@` character. */
  readonly startIndex: number;
  /** Caret index; the replacement range ends here. */
  readonly endIndex: number;
}

export function normalizeMobileMentionUsername(username: string): string {
  return username.toLocaleLowerCase("en-US");
}

/** Port of the server `extractMentionUsernames`: unique, lowercase, ordered. */
export function extractMobileMentionUsernames(content: string): string[] {
  const mentions = new Set<string>();
  const pattern = new RegExp(MENTION_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const username = normalizeMobileMentionUsername(match[2] ?? "");
    if (!MOBILE_RESERVED_MENTIONS.has(username)) {
      mentions.add(username);
    }
  }

  return Array.from(mentions);
}

export function hasMobileSelfMention(content: string, username: string | null): boolean {
  if (!username) {
    return false;
  }

  return extractMobileMentionUsernames(content).includes(normalizeMobileMentionUsername(username));
}

/**
 * Splits a message body into link, mention and plain-text runs.
 *
 * `knownUsernames` is the server member list the client already holds. A
 * `@handle` that nobody in the server answers to renders as plain text, which
 * matches what the backend does with it. Passing `undefined` highlights every
 * syntactically valid mention — that is the DM path, where there is no member
 * roster to check against.
 */
export function parseMobileMentionSegments(
  content: string,
  knownUsernames?: ReadonlySet<string>,
): MobileMentionSegment[] {
  const segments: MobileMentionSegment[] = [];

  for (const part of content.split(LINK_PATTERN)) {
    if (part.length === 0) {
      continue;
    }

    if (part.startsWith("https://")) {
      segments.push({ type: "link", value: part });
      continue;
    }

    appendMentionSegments(segments, part, knownUsernames);
  }

  return segments;
}

function appendMentionSegments(
  segments: MobileMentionSegment[],
  text: string,
  knownUsernames?: ReadonlySet<string>,
) {
  const pattern = new RegExp(MENTION_PATTERN.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const rawUsername = match[2] ?? "";
    const username = normalizeMobileMentionUsername(rawUsername);
    if (MOBILE_RESERVED_MENTIONS.has(username)) {
      continue;
    }
    if (knownUsernames && !knownUsernames.has(username)) {
      continue;
    }

    const mentionStart = match.index + (match[1] ?? "").length;
    if (mentionStart > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, mentionStart) });
    }
    segments.push({ type: "mention", username, value: `@${rawUsername}` });
    cursor = mentionStart + rawUsername.length + 1;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }
}

/**
 * The `@query` token the caret currently sits in, or `null` when the caret is
 * not writing a mention. The word-start rule is the same one the server applies
 * when it extracts mentions, so the composer never suggests a token that the
 * backend would ignore.
 */
export function resolveMobileMentionQuery(text: string, cursor: number): MobileMentionQuery | null {
  const caret = Math.max(0, Math.min(cursor, text.length));

  for (let index = caret - 1; index >= 0 && caret - index <= MENTION_MAX_LENGTH + 1; index -= 1) {
    const character = text[index] ?? "";

    if (character === "@") {
      const previous = index > 0 ? (text[index - 1] ?? "") : "";
      if (index > 0 && !MENTION_BOUNDARY.test(previous)) {
        return null;
      }

      return { endIndex: caret, query: text.slice(index + 1, caret), startIndex: index };
    }

    if (!MENTION_CHARACTER.test(character)) {
      return null;
    }
  }

  return null;
}

/** Replaces the active `@query` token with `@username ` and reports the caret. */
export function applyMobileMentionSelection(
  text: string,
  activeQuery: MobileMentionQuery,
  username: string,
): { readonly cursor: number; readonly text: string } {
  const insertion = `@${username} `;
  const nextText = `${text.slice(0, activeQuery.startIndex)}${insertion}${text.slice(activeQuery.endIndex)}`;

  return { cursor: activeQuery.startIndex + insertion.length, text: nextText };
}

/**
 * Whether the roster should pull one more member page in the background.
 *
 * The first page lands with the channel and the panel works immediately; the
 * rest arrive one request at a time so the list never blocks a render. A failed
 * page stops the walk — the query state keeps the error until something
 * invalidates it, and retrying from an effect would spin.
 */
export function shouldLoadMoreMobileMentionRoster({
  enabled,
  hasError,
  hasNextPage,
  isFetching,
  loadedMemberCount,
  memberLimit = MOBILE_MENTION_ROSTER_MEMBER_LIMIT,
}: {
  readonly enabled: boolean;
  readonly hasError: boolean;
  readonly hasNextPage: boolean;
  /** Covers the first page and refetches too, so pages are never raced. */
  readonly isFetching: boolean;
  readonly loadedMemberCount: number;
  readonly memberLimit?: number;
}): boolean {
  return (
    enabled && hasNextPage && !isFetching && !hasError && loadedMemberCount < memberLimit
  );
}

/**
 * Where the caret sits after `onChangeText`, given the text it replaced and the
 * caret it replaced it at.
 *
 * React Native fires `onChangeText` before `onSelectionChange`, so a composer
 * that waits for the selection event reads a stale caret for one frame and can
 * resolve the wrong `@` token when the edit was mid-text. The common single
 * insertion or deletion at the caret is verified against the surrounding text
 * and answered exactly; anything else (autocorrect, a paste over a selection, a
 * programmatic rewrite) falls back to the end of the run that actually changed.
 */
export function resolveMobileCaretAfterChange(
  previous: string,
  next: string,
  previousCaret: number,
): number {
  const caret = Math.max(0, Math.min(previousCaret, previous.length));
  const delta = next.length - previous.length;

  if (delta > 0) {
    const insertionEnd = caret + delta;
    if (
      previous.slice(0, caret) === next.slice(0, caret) &&
      previous.slice(caret) === next.slice(insertionEnd)
    ) {
      return insertionEnd;
    }
  } else if (delta < 0) {
    const deletionStart = caret + delta;
    if (
      deletionStart >= 0 &&
      previous.slice(0, deletionStart) === next.slice(0, deletionStart) &&
      previous.slice(caret) === next.slice(deletionStart)
    ) {
      return deletionStart;
    }
  }

  const shorter = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < shorter && previous[prefix] === next[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < shorter - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return next.length - suffix;
}

/**
 * Local prefix-then-contains filter over the member pages the client already
 * fetched. 10a deliberately ships no mention-search endpoint; the roster walks
 * up to `MOBILE_MENTION_ROSTER_MEMBER_LIMIT` members in the background instead.
 */
export function filterMobileMentionCandidates(
  candidates: readonly MobileMentionCandidate[],
  query: string,
  limit: number = MOBILE_MENTION_SUGGESTION_LIMIT,
): MobileMentionCandidate[] {
  const needle = query.trim().toLocaleLowerCase("en-US");

  if (needle.length === 0) {
    return candidates.slice(0, limit);
  }

  const prefixMatches: MobileMentionCandidate[] = [];
  const containsMatches: MobileMentionCandidate[] = [];

  for (const candidate of candidates) {
    const username = candidate.username.toLocaleLowerCase("en-US");
    const displayName = candidate.displayName.toLocaleLowerCase("en-US");

    if (username.startsWith(needle) || displayName.startsWith(needle)) {
      prefixMatches.push(candidate);
    } else if (username.includes(needle) || displayName.includes(needle)) {
      containsMatches.push(candidate);
    }
  }

  return [...prefixMatches, ...containsMatches].slice(0, limit);
}
