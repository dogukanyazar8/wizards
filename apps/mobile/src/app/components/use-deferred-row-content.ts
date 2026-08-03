import { useEffect, useState } from "react";

import { scheduleMobileIdleTask } from "../../performance/mobile-idle-task";

/**
 * Keeps a row's optional subtree out of the frame the transcript opens on.
 *
 * A link preview is a `useQuery` per row: thirty rows with links are thirty query
 * observers created while the reader is waiting for the first paint, and the card
 * renders `null` until its fetch resolves — so it contributes nothing to that
 * frame except the cost of being in it. A device measured 560ms (DM) and 1186ms
 * (channel) between `list-mounted` and `content`, and this is work that had no
 * business being inside either number.
 *
 * Deliberately not used for attachments: an image card that appears a frame late
 * moves the rows under it, and a transcript that shifts under the thumb is worse
 * than one that opens slightly later.
 *
 * Once true it stays true, which is what a recycled row needs — the next message
 * to land in this cell shows its preview immediately.
 */
export function useMobileDeferredRowContent(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || ready) {
      return;
    }

    const handle = scheduleMobileIdleTask(() => setReady(true));
    return () => {
      handle.cancel();
    };
  }, [enabled, ready]);

  return enabled && ready;
}
