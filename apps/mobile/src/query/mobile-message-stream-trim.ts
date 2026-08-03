/**
 * How many pages a conversation keeps once the reader has left it.
 *
 * An infinite stream never gives a page back: a reader who paged to the start of
 * a long conversation carried every one of those pages for as long as the query
 * lived, and the query lived a day. Three is the screenful the reader would land
 * on plus the two they can scroll into before the server has to answer — page 0
 * is on disk as well, and the rest is one `fetchNextPage` away.
 */
export const MOBILE_MESSAGE_STREAM_RETAINED_PAGES = 3;

export type MobileMessageStreamPages = {
  readonly pageParams: readonly unknown[];
  readonly pages: readonly unknown[];
};

/**
 * Drops everything past the newest `maxPages`, keeping the two arrays in step.
 *
 * `pages[0]` is the newest page — the same one the encrypted store persists — so
 * the retained slice is the head, not the tail. Returns the original object when
 * there is nothing to drop, which is what lets the caller skip a cache write and
 * the re-render that comes with it.
 */
export function trimMobileMessageStreamPages<TData extends MobileMessageStreamPages>(
  data: TData | undefined,
  maxPages: number = MOBILE_MESSAGE_STREAM_RETAINED_PAGES,
): TData | undefined {
  if (!data || maxPages <= 0 || data.pages.length <= maxPages) {
    return data;
  }

  return {
    ...data,
    pageParams: data.pageParams.slice(0, maxPages),
    pages: data.pages.slice(0, maxPages),
  };
}
