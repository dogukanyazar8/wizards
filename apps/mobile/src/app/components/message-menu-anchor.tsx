import { createContext, useContext, type ReactNode } from "react";
import type { View } from "react-native";

/**
 * MSG-1g §2 "1g".2: the selected message **stays where it is**. That rule only
 * survives if the overlay knows where "there" is, so a row hands the menu its
 * on-screen rectangle (window coordinates) when it is long-pressed, and the
 * menu draws the message at exactly that rectangle — no move, no scale.
 */
export interface MobileMessageAnchorRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Measures a row in window coordinates and hands the result back.
 *
 * Callback rather than promise on purpose: the row measures on *press in*, so
 * by the time the 400ms long press fires the rectangle is already known and the
 * menu can open in the same tick. Anything that cannot be measured (a recycled
 * row, a test renderer with no native layout) reports `null` synchronously, and
 * the menu falls back to its bottom-anchored stack.
 */
export function measureMobileMessageAnchor(
  target: View | null,
  onMeasured: (anchor: MobileMessageAnchorRect | null) => void,
): void {
  if (!target || typeof target.measureInWindow !== "function") {
    onMeasured(null);
    return;
  }

  try {
    target.measureInWindow((x, y, width, height) => {
      onMeasured(
        [x, y, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0
          ? { height, width, x, y }
          : null,
      );
    });
  } catch {
    onMeasured(null);
  }
}

/**
 * §2 "1g".1: the scrim covers the conversation only. The header dims itself to
 * .5 and the composer does not dim at all, so the darkened band has to stop at
 * the message area's edges — which only the list that owns that area can know.
 */
const MobileMessageMenuBoundsContext = createContext<MobileMessageAnchorRect | null>(null);

export function MobileMessageMenuBoundsProvider({
  bounds,
  children,
}: {
  readonly bounds: MobileMessageAnchorRect | null;
  readonly children: ReactNode;
}) {
  return (
    <MobileMessageMenuBoundsContext.Provider value={bounds}>
      {children}
    </MobileMessageMenuBoundsContext.Provider>
  );
}

export function useMobileMessageMenuBounds(): MobileMessageAnchorRect | null {
  return useContext(MobileMessageMenuBoundsContext);
}
