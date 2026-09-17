"use client";

import { useEffect, useState } from "react";
import { GAME_CATALOG } from "@wizards/types";
import { getDesktopGoLiveCandidate } from "@/lib/desktop/controls";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import type { GoLiveCandidate } from "@/lib/voice/go-live";

type GoLiveSnapshot = { candidate: GoLiveCandidate; missingCount: number };

export function startGoLivePolling(
  probe: typeof getDesktopGoLiveCandidate,
  update: (snapshot: GoLiveSnapshot) => void,
) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let missingCount = 0;
  const poll = async () => {
    try {
      const result = await probe();
      if (cancelled) return;
      const game = GAME_CATALOG.find((item) => item.id === result.gameId);
      const label = game?.name ?? result.label;
      const candidate: GoLiveCandidate = !result.enabled
        ? { kind: "opt-in-required" }
        : result.canOfferGoLive && result.gameId && label
          ? { kind: "game", gameId: result.gameId, label }
          : null;
      // Lost foreground focus is not evidence that the process closed.
      missingCount = result.enabled && result.gameId === null ? Math.min(2, missingCount + 1) : 0;
      update({ candidate, missingCount });
    } catch {
      if (!cancelled) {
        missingCount = 0;
        update({ candidate: null, missingCount });
      }
    } finally {
      if (!cancelled) timer = setTimeout(() => void poll(), 15_000);
    }
  };
  void poll();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export function useGoLiveCandidate(active: boolean) {
  const [snapshot, setSnapshot] = useState<GoLiveSnapshot>({ candidate: null, missingCount: 0 });
  useEffect(() => {
    if (!active || !isWhisprDesktopRuntime()) return;
    return startGoLivePolling(getDesktopGoLiveCandidate, setSnapshot);
  }, [active]);
  return active ? snapshot : { candidate: null, missingCount: 0 };
}
