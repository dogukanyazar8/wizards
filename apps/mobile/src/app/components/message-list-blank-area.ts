import type { FlashListRef } from "@shopify/flash-list";
import type { NativeScrollEvent } from "react-native";

import {
  computeMobileListBlankArea,
  recordMobileListBlankArea,
  type MobileListBlankAreaSurface,
} from "../../performance/mobile-list-blank-area";

/**
 * Reads the blank area off a scrolling transcript.
 *
 * The list is the only thing that knows where its rendered rows actually sit, and
 * FlashList v2 exposes that through the ref rather than through a callback. Every
 * one of these calls is wrapped: an instrument that can throw inside `onScroll`
 * would cost the reader the scroll it is measuring.
 */
export function reportMobileListBlankArea<TItem>(
  surface: MobileListBlankAreaSurface,
  list: FlashListRef<TItem> | null,
  event: NativeScrollEvent,
): void {
  if (!list) {
    return;
  }

  try {
    const { endIndex, startIndex } = list.computeVisibleIndices();
    const first = list.getLayout(startIndex);
    const last = list.getLayout(endIndex);

    recordMobileListBlankArea(
      surface,
      computeMobileListBlankArea({
        contentHeight: event.contentSize.height,
        firstVisible: first ? { height: first.height, y: first.y } : null,
        lastVisible: last ? { height: last.height, y: last.y } : null,
        scrollOffset: event.contentOffset.y,
        viewportHeight: event.layoutMeasurement.height,
      }),
    );
  } catch {
    // A list that cannot answer where its rows are simply is not measured.
  }
}
