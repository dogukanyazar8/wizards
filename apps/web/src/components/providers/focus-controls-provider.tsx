"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useFocusCountdown } from "@/hooks/use-focus-countdown";
import {
  HOME_STALE_TIME_MS,
  fetchHomeSummary,
  homeQueryKeys,
  updateHomePresence,
} from "@/lib/home/client";
import {
  planFocusToggle,
  planPresencePick,
  projectExpiredFocus,
  type PresenceChipId,
} from "@/lib/home/focus-machine";
import { createPresenceMutation } from "@/lib/home/mutations";
import { applyPresenceProjection } from "@/lib/home/optimistic";
import type { AppSummaryResponse, HomeFocus } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5 §3.3. One focus layer, three readers.
 *
 * The top bar pill, the user footer row and the `Durumun` card all show the same
 * window, and the command palette can open and close it too. They read it from
 * here rather than each computing their own — four copies of a countdown is four
 * chances to disagree by a minute.
 *
 * The provider opens no new request: it subscribes to `homeQueryKeys.summary`,
 * which the shell already holds for the unread badge, so React Query
 * de-duplicates it.
 */

export type FocusControls = {
  readonly focus: HomeFocus | null;
  readonly isPending: boolean;
  /** Ticked down from the absolute deadline; `null` when no window is open. */
  readonly minutesLeft: number | null;
  /** One short line after a failed write, cleared on the next attempt. */
  readonly notice: string | null;
  /**
   * The locally picked return target while the window is open — what the chips
   * draw as chosen. `null` means "no local pick"; the card then falls back to the
   * status its own summary carries, so the chip highlight has one source, not two.
   */
  readonly restoreTo: PresenceChipId | null;
  readonly setPresence: (next: PresenceChipId) => void;
  readonly toggleFocus: () => void;
};

/** i18n: `home.presence.error` */
const PRESENCE_ERROR_TEXT = "Durum güncellenemedi";

const FocusControlsContext = createContext<FocusControls | null>(null);

export function FocusControlsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Where the window should hand the status back. Not a second source of truth
   * for presence — only for which chip looks chosen while focus holds `DND`.
   */
  const [restoreTo, setRestoreTo] = useState<PresenceChipId | null>(null);

  const summaryQuery = useQuery({
    queryFn: fetchHomeSummary,
    queryKey: homeQueryKeys.summary,
    staleTime: HOME_STALE_TIME_MS.summary,
  });
  const summary = summaryQuery.data ?? null;
  const focus = summary?.focus ?? null;
  const minutesLeft = useFocusCountdown(focus);

  const presence = useMutation(
    createPresenceMutation({
      onFailure: () => {
        setRestoreTo(null);
        setNotice(PRESENCE_ERROR_TEXT);
      },
      queryClient,
      updatePresence: updateHomePresence,
    }),
  );

  /**
   * §3.2 — when the window runs out the client refreshes **its own view** and
   * waits for `presence:update`. It sends no `PATCH`: the server sweep already
   * owns the close, and a second closer can apply `statusRestoreTo` twice.
   */
  useEffect(() => {
    if (minutesLeft !== 0 || !summary) {
      return;
    }

    const projection = projectExpiredFocus({ now: new Date(), restoreTo, summary });
    if (!projection) {
      return;
    }

    // Only the cache is written. `restoreTo` is deliberately left alone: with the
    // window closed nothing reads it (`selectPresenceChip` ignores it), and
    // clearing it here would be a state write inside an effect for no visible
    // difference. The next toggle sets it again.
    queryClient.setQueryData<AppSummaryResponse>(homeQueryKeys.summary, (current) =>
      applyPresenceProjection(current, projection),
    );
  }, [minutesLeft, queryClient, restoreTo, summary]);

  const toggleFocus = useCallback(() => {
    if (presence.isPending || !summary) {
      return;
    }

    setNotice(null);
    const plan = planFocusToggle({ now: new Date(), restoreTo, summary });
    setRestoreTo(plan.restoreTo ?? null);
    presence.mutate(plan);
  }, [presence, restoreTo, summary]);

  const setPresence = useCallback(
    (next: PresenceChipId) => {
      if (presence.isPending || !summary) {
        return;
      }

      const plan = planPresencePick({ next, restoreTo, summary });

      // §2.1 — a second tap on the chip that is already chosen repeats nothing.
      if (!plan) {
        return;
      }

      setNotice(null);
      if (plan.restoreTo) {
        setRestoreTo(plan.restoreTo);
      }

      presence.mutate(plan);
    },
    [presence, restoreTo, summary],
  );

  const value = useMemo<FocusControls>(
    () => ({
      focus,
      isPending: presence.isPending,
      minutesLeft,
      notice,
      restoreTo,
      setPresence,
      toggleFocus,
    }),
    [focus, minutesLeft, notice, presence.isPending, restoreTo, setPresence, toggleFocus],
  );

  return <FocusControlsContext.Provider value={value}>{children}</FocusControlsContext.Provider>;
}

export function useFocusControls(): FocusControls {
  const value = useContext(FocusControlsContext);

  if (!value) {
    throw new Error("useFocusControls must be used within FocusControlsProvider");
  }

  return value;
}

/**
 * The same layer for a component that is **also** rendered outside the shell.
 *
 * `UserProfileFooter` is shared with surfaces that mount no focus layer, and a
 * missing window there is a fact, not a failure — the row simply shows the
 * status. Everything that lives only inside the shell uses the strict hook, so a
 * genuinely missing provider still fails loudly where it matters.
 */
export function useOptionalFocusControls(): FocusControls | null {
  return useContext(FocusControlsContext);
}
