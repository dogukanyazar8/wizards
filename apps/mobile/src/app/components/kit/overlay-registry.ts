import type { ReactNode } from "react";

/** Stable registry identity for the 1d download sheet. */
export const MOBILE_ABOUT_UPDATE_OVERLAY_ID = "about-update";
/** Stable registry identity for the 2d beta-consent sheet. */
export const MOBILE_ABOUT_BETA_CONSENT_OVERLAY_ID = "about-beta-consent";
/** Stable registry identity for the 2h in-app rating sheet. */
export const MOBILE_ABOUT_RATING_OVERLAY_ID = "about-rating";
/**
 * Stable registry identity for the badge detail sheet. It is named because the
 * sheet swaps its own body between the badge list and a single badge (06 §2):
 * a generated id per view would register a second entry and stack two sheets
 * where the design has one.
 */
export const MOBILE_PROFILE_BADGE_DETAIL_OVERLAY_ID = "profile-badge-detail";

/**
 * One mounted overlay. `node` is the element the host renders on behalf of the
 * call site; `onClose` is the dismissal the top-most entry owns.
 */
export interface MobileOverlayEntry {
  readonly id: string;
  readonly node: ReactNode;
  readonly onClose: () => void;
}

export interface MobileOverlayRegistry {
  /** Mount order, which is z-order: the last entry draws on top. */
  getEntries(): readonly MobileOverlayEntry[];
  /** The overlay that owns the back key and the accessibility focus. */
  getTopEntry(): MobileOverlayEntry | null;
  hasHost(): boolean;
  /** A host announces itself so surfaces know a portal target exists. */
  mountHost(): () => void;
  remove(id: string): void;
  /** Test seam; production never tears the registry down. */
  reset(): void;
  /**
   * Appends an unknown id and replaces a known one in place, so a re-rendered
   * overlay keeps its stacking position instead of jumping to the top.
   */
  set(entry: MobileOverlayEntry): void;
  subscribe(listener: () => void): () => void;
  subscribeHost(listener: () => void): () => void;
}

const EMPTY_ENTRIES: readonly MobileOverlayEntry[] = Object.freeze([]);

/**
 * The overlay stack, kept outside React so opening a sheet re-renders the host
 * and nothing else. Pure module: no React, no react-native, no globals.
 */
export function createMobileOverlayRegistry(): MobileOverlayRegistry {
  let entries: readonly MobileOverlayEntry[] = EMPTY_ENTRIES;
  let hostCount = 0;
  const listeners = new Set<() => void>();
  const hostListeners = new Set<() => void>();

  const notify = (targets: Set<() => void>) => {
    for (const listener of [...targets]) {
      listener();
    }
  };

  return {
    getEntries: () => entries,
    getTopEntry: () => entries.at(-1) ?? null,
    hasHost: () => hostCount > 0,
    mountHost() {
      hostCount += 1;
      notify(hostListeners);
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        hostCount = Math.max(0, hostCount - 1);
        notify(hostListeners);
      };
    },
    remove(id) {
      const next = entries.filter((entry) => entry.id !== id);
      if (next.length === entries.length) {
        return;
      }
      entries = next.length === 0 ? EMPTY_ENTRIES : next;
      notify(listeners);
    },
    reset() {
      entries = EMPTY_ENTRIES;
      hostCount = 0;
      notify(listeners);
      notify(hostListeners);
    },
    set(entry) {
      const index = entries.findIndex((candidate) => candidate.id === entry.id);
      if (index < 0) {
        entries = [...entries, entry];
        notify(listeners);
        return;
      }

      const current = entries[index];
      // Identical re-registration is the common case while an overlay sits open
      // and its owner re-renders for unrelated reasons; skipping it keeps the
      // host out of that render.
      if (current && current.node === entry.node && current.onClose === entry.onClose) {
        return;
      }

      const next = [...entries];
      next[index] = entry;
      entries = next;
      notify(listeners);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeHost(listener) {
      hostListeners.add(listener);
      return () => {
        hostListeners.delete(listener);
      };
    },
  };
}

/** The single stack every overlay surface and host in the app shares. */
export const mobileOverlayRegistry = createMobileOverlayRegistry();
