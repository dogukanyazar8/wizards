import { toMessageBlocks } from "@/lib/messages/message-blocks";

/**
 * §15.5's `PAYLAŞILAN BAĞLANTILAR` list.
 *
 * The scanner runs over `toMessageBlocks` rather than over the raw body, which
 * is the whole point of this module: a URL inside a fenced block or inside
 * backticks is a **code sample**, not a link the reader shared. The chat bubble
 * already renders those as code — listing them in the links tab would offer a
 * tappable row for a string the conversation never treated as a destination.
 *
 * Skipped block types: `codeBlock` and `inlineCode`. Only `text` blocks are
 * scanned.
 */

/**
 * Bare URLs, matched exactly the way the mobile message renderer's
 * `LINK_PATTERN` (`apps/mobile/src/app/mobile-mention.ts`) matches them —
 * trailing punctuation included. Both surfaces must agree on where a link ends,
 * otherwise the gallery opens a different URL than the bubble does.
 */
const BARE_LINK_SOURCE = "https:\\/\\/[^\\s]+";

/**
 * A markdown link and a bare URL, in one pass so the written order is preserved
 * without a second sort. The markdown alternative is first: at a `[` the engine
 * must try the labelled form before the body's URL is reached, or the label
 * would be lost and the closing paren swallowed into the href.
 */
const LINK_SCAN_PATTERN = new RegExp(
  `\\[([^\\]\\n]*)\\]\\((https:\\/\\/[^\\s)]+)\\)|${BARE_LINK_SOURCE}`,
  "g",
);

/**
 * A single message can technically carry an unbounded number of URLs. The page
 * size is a message count, so without a per-message cap one pathological
 * message could blow past the response schema's item bound.
 */
export const DM_SHARED_LINKS_PER_MESSAGE = 10;

/** Longer than any URL a browser will follow; a paste that long is not a link. */
const MAX_LINK_LENGTH = 2048;

/**
 * The label of `[Sürüm 2.4 notları](https://whispr.app/changelog)` is the only
 * title this product actually has: there is no embed or link-preview table in
 * the schema, so a title that is not written in the body cannot exist. It is
 * bounded because a label is free-form text and the row renders on one line.
 */
const MAX_LINK_TITLE_LENGTH = 200;

export type SharedLinkMatch = {
  host: string;
  /** `null` when the URL was written bare; the client falls back to the host. */
  title: string | null;
  url: string;
};

/**
 * Every link a message body shares, in the order it was written, deduplicated
 * within the message and capped.
 *
 * A token the URL parser rejects (a bare `https://`, an over-long paste) is
 * dropped rather than shipped: `SharedLinkDTOSchema` needs a host, and a value
 * `new URL()` cannot parse has none.
 */
export function extractSharedLinks(
  content: string,
  limit: number = DM_SHARED_LINKS_PER_MESSAGE,
): SharedLinkMatch[] {
  const links: SharedLinkMatch[] = [];
  const seen = new Set<string>();

  if (limit <= 0) {
    return links;
  }

  for (const block of toMessageBlocks(content)) {
    if (block.type !== "text") {
      continue;
    }

    const pattern = new RegExp(LINK_SCAN_PATTERN.source, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(block.value)) !== null && links.length < limit) {
      const labelled = match[2] !== undefined;
      const url = labelled ? (match[2] as string) : match[0];

      if (seen.has(url) || url.length > MAX_LINK_LENGTH) {
        continue;
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }

      if (parsed.protocol !== "https:" || parsed.host.length === 0) {
        continue;
      }

      seen.add(url);
      links.push({ host: parsed.host, title: toLinkTitle(match[1]), url });
    }

    if (links.length >= limit) {
      break;
    }
  }

  return links;
}

function toLinkTitle(label: string | undefined): string | null {
  const trimmed = label?.trim() ?? "";

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, MAX_LINK_TITLE_LENGTH);
}
