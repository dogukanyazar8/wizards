/**
 * Ana Sayfa 1a — Faz 3 §5.1.7. Every link the home screen renders is produced
 * here, and every link that came from stored data (`Notification.actionUrl`,
 * `Notification.metadata`) is run through `toRelativeAppHref` before it can be
 * attached to an anchor.
 *
 * The rule is deliberately narrow: an in-app absolute path, nothing else. No
 * scheme, no authority, no leading whitespace, no control characters — browsers
 * strip tabs and newlines from URLs, so `"/\t/evil.example"` would resolve as
 * the protocol-relative `//evil.example` if it were allowed through.
 */

const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;
const MAX_HREF_LENGTH = 2048;

export function toRelativeAppHref(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length === 0 || value.length > MAX_HREF_LENGTH) {
    return null;
  }

  if (CONTROL_OR_SPACE.test(value)) {
    return null;
  }

  if (!value.startsWith("/")) {
    return null;
  }

  // `//host` is protocol-relative and `/\host` is the same thing once the
  // browser normalizes the backslash.
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }

  return value;
}

/** Ids come from the database, but a path segment is still a path segment. */
function segment(value: string): string {
  return encodeURIComponent(value);
}

export function buildChannelHref(serverId: string, channelId: string): string {
  return `/channels/${segment(serverId)}/${segment(channelId)}`;
}

export function buildDMHref(conversationId: string): string {
  return `/messages/${segment(conversationId)}`;
}

export function buildServerHref(serverId: string): string {
  return `/channels/${segment(serverId)}`;
}

export function buildEventHref(serverId: string, eventId: string): string {
  return `/servers/${segment(serverId)}/about?event=${segment(eventId)}`;
}

export function buildMentionHref(input: {
  channelId: string;
  messageId: string;
  serverId: string | null;
}): string {
  const base = input.serverId
    ? buildChannelHref(input.serverId, input.channelId)
    : buildDMHref(input.channelId);

  return `${base}?message=${segment(input.messageId)}`;
}

export const HOME_FRIENDS_HREF = "/messages";
export const HOME_INBOX_HREF = "/inbox";
export const HOME_MENTIONS_HREF = "/mentions";
export const HOME_EVENTS_HREF = "/events";

/**
 * Faz 5 §1 — "Yanıtla" hedef ekrana gider **ve besteciyi odaklar**.
 *
 * İşaret bir query parametresi, çünkü gezinme bir `Link`'tir: hedef ekran ayrı bir rota ve
 * aralarında paylaşılan bir bellek yok. `?message=` zaten aynı yolla taşınıyor (`buildMentionHref`).
 */
export const COMPOSER_FOCUS_PARAM = "compose";

export function withComposerFocus(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${COMPOSER_FOCUS_PARAM}=1`;
}

/** Hedef ekranın okuduğu taraf. Yalnız `1` kabul edilir; başka değer odak istemez. */
export function shouldFocusComposer(search: string): boolean {
  return new URLSearchParams(search).get(COMPOSER_FOCUS_PARAM) === "1";
}
