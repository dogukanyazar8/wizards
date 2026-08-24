"use client";

import { useEffect, useSyncExternalStore } from "react";

import { createFocusCountdown, type FocusCountdown } from "@/lib/home/focus-countdown";
import type { HomeFocus } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5 §3.2 / §3.3. The one focus countdown, shared.
 *
 * Three surfaces show the same number — the top bar pill, the user footer row
 * and the `Durumun` card — and §7 allows exactly one timer between them. So the
 * engine lives in a module-level store and every reader subscribes to it;
 * mounting a fourth reader does not start a fourth interval.
 *
 * The server snapshot is deliberately `null`: the first paint shows the
 * `minutesLeft` the response carried, and the ticking value only takes over
 * after hydration. Any other choice renders a client clock into server HTML and
 * mismatches.
 */

const listeners = new Set<() => void>();

let engine: FocusCountdown | null = null;
let deadlineMs: number | null = null;
let snapshot: number | null = null;

function publish(minutesLeft: number | null) {
  if (snapshot === minutesLeft) {
    return;
  }

  snapshot = minutesLeft;
  for (const listener of listeners) {
    listener();
  }
}

function stopEngine() {
  engine?.destroy();
  engine = null;
}

function startEngine() {
  stopEngine();

  if (deadlineMs === null) {
    publish(null);
    return;
  }

  engine = createFocusCountdown({
    clearInterval: (handle) => window.clearInterval(handle),
    expiresAtMs: deadlineMs,
    isHidden: () => document.visibilityState === "hidden",
    now: () => Date.now(),
    onTick: publish,
    setInterval: (run, intervalMs) => window.setInterval(run, intervalMs),
    subscribeVisibility: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  });

  publish(engine.read());
}

/**
 * Points the shared engine at a deadline. Every reader passes the same value —
 * they all read one summary cache entry — so the last call simply confirms what
 * the first one set.
 */
function setDeadline(next: number | null) {
  if (deadlineMs === next && (next === null || engine !== null)) {
    return;
  }

  deadlineMs = next;
  startEngine();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    // The last reader out turns the timer off: a countdown nobody renders is a
    // wake-up nobody asked for.
    if (listeners.size === 0) {
      stopEngine();
      deadlineMs = null;
      snapshot = null;
    }
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): number | null {
  return null;
}

/** Minutes left in the open window, or `null` when there is no window. */
export function useFocusCountdown(focus: HomeFocus | null | undefined): number | null {
  const expiresAtMs = focus?.active ? Date.parse(focus.expiresAt) : Number.NaN;
  const deadline = Number.isNaN(expiresAtMs) ? null : expiresAtMs;
  const ticked = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    setDeadline(deadline);
  }, [deadline]);

  if (!focus?.active) {
    return null;
  }

  // Before the first tick — the server render and the hydrating one — the
  // response's own answer stands in. Reading the clock during render instead
  // would make the two renders disagree by a minute at the wrong moment.
  return ticked ?? focus.minutesLeft;
}
