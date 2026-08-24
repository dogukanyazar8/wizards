import type { HomeFocus, HomePresence, PresenceUpdateBody } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 3 §1.1 / §3.9. Timed focus mode, as pure arithmetic.
 *
 * Nothing here reads the clock: `now` is always a parameter, so the sweep, the
 * lazy read-time resolution and the write path can all be tested against a
 * fixed instant and cannot disagree with each other at runtime.
 */

export type UserStatusValue = "ONLINE" | "IDLE" | "DND" | "OFFLINE" | "INVISIBLE";

export type FocusRow = {
  readonly id: string;
  readonly status: UserStatusValue;
  readonly statusExpiresAt: Date | null;
  readonly statusFocusMinutes: number | null;
  readonly statusRestoreTo: UserStatusValue | null;
};

export type ExpiredFocusResolution = {
  readonly expected: PresenceUpdateData;
  readonly status: UserStatusValue;
  readonly userId: string;
};

export type FocusState = {
  /** True when the row still carries a window that `now` has already passed. */
  readonly expired: boolean;
  readonly focus: HomeFocus | null;
  readonly presence: HomePresence;
};

export type PresenceUpdateData = {
  readonly status: UserStatusValue;
  readonly statusExpiresAt: Date | null;
  readonly statusFocusMinutes: number | null;
  readonly statusRestoreTo: UserStatusValue | null;
};

export type PresenceUpdatePlan = {
  /**
   * False when the stored row already says exactly this. The route still
   * answers 200 — the caller simply has nothing to write or broadcast.
   */
  readonly changed: boolean;
  readonly data: PresenceUpdateData;
  readonly result: { focus: HomeFocus | null; presence: HomePresence };
};

const MINUTE_MS = 60_000;

/**
 * "Görünmez" is stored as `OFFLINE`, and any legacy `INVISIBLE` row publishes
 * the same way (`lib/friends/service.ts: mapStoredPresenceStatus`).
 */
export function toVisiblePresence(status: UserStatusValue): HomePresence {
  return status === "ONLINE" || status === "IDLE" || status === "DND" ? status : "OFFLINE";
}

/** The sweep's decision half: which rows must be written back, and to what. */
export function resolveExpiredFocus(
  rows: readonly FocusRow[],
  now: Date,
): ExpiredFocusResolution[] {
  const nowMs = now.getTime();

  return rows
    .filter((row) => row.statusExpiresAt !== null && row.statusExpiresAt.getTime() <= nowMs)
    .map((row) => ({
      expected: {
        status: row.status,
        statusExpiresAt: row.statusExpiresAt,
        statusFocusMinutes: row.statusFocusMinutes,
        statusRestoreTo: row.statusRestoreTo,
      },
      status: row.statusRestoreTo ?? "ONLINE",
      userId: row.id,
    }));
}

/** Read-time resolution: the right answer for one row, without writing anything. */
export function resolveFocusState(row: FocusRow, now: Date): FocusState {
  if (row.statusExpiresAt === null) {
    return { expired: false, focus: null, presence: toVisiblePresence(row.status) };
  }

  const remainingMs = row.statusExpiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return {
      expired: true,
      focus: null,
      presence: toVisiblePresence(row.statusRestoreTo ?? "ONLINE"),
    };
  }

  const minutesLeft = Math.ceil(remainingMs / MINUTE_MS);

  return {
    expired: false,
    focus: {
      active: true,
      // The absolute deadline, so the client's countdown never has to trust its
      // own arithmetic across a sleeping tab (`06-faz5` §3.2).
      expiresAt: row.statusExpiresAt.toISOString(),
      minutesLeft,
      // A row written before `statusFocusMinutes` existed has no recorded
      // length; a full ring is a better lie than a negative one.
      totalMinutes: Math.max(row.statusFocusMinutes ?? minutesLeft, minutesLeft),
    },
    presence: toVisiblePresence(row.status),
  };
}

function toStoredStatus(presence: NonNullable<PresenceUpdateBody["presence"]>): UserStatusValue {
  return presence === "INVISIBLE" ? "OFFLINE" : presence;
}

/**
 * The single decision point behind `PATCH /api/v1/users/me/presence`.
 *
 * Order matters: an expired window is resolved first, so a body that arrives
 * one second after the window closed acts on the restored status rather than on
 * the stale `DND`.
 */
export function planPresenceUpdate(input: {
  body: PresenceUpdateBody;
  now: Date;
  row: FocusRow;
}): PresenceUpdatePlan {
  const { body, now, row } = input;
  const state = resolveFocusState(row, now);
  const focusIsLive = state.focus !== null;

  // Post-expiry baseline: what the row would look like after the lazy resolve.
  const baseline: PresenceUpdateData = focusIsLive
    ? {
        status: row.status,
        statusExpiresAt: row.statusExpiresAt,
        statusFocusMinutes: row.statusFocusMinutes,
        statusRestoreTo: row.statusRestoreTo,
      }
    : {
        status: state.expired ? (row.statusRestoreTo ?? "ONLINE") : row.status,
        statusExpiresAt: null,
        statusFocusMinutes: null,
        statusRestoreTo: null,
      };

  let next: PresenceUpdateData = baseline;

  if (body.presence !== undefined) {
    const picked = toStoredStatus(body.presence);
    next = focusIsLive
      ? // A chip picked while focus is open changes where the window lands, not
        // the status the window itself is holding.
        { ...next, statusRestoreTo: picked }
      : { ...next, status: picked };
  }

  if (body.focus?.enabled === true) {
    const sameWindow = focusIsLive && (next.statusFocusMinutes ?? null) === body.focus.minutes;

    next = sameWindow
      ? next
      : {
          status: "DND",
          // Re-opening is not extending: the expiry only moves when the
          // requested length actually differs from the live one.
          statusExpiresAt: new Date(now.getTime() + body.focus.minutes * MINUTE_MS),
          statusFocusMinutes: body.focus.minutes,
          // The first open owns the restore target; a second one must not
          // overwrite it with the `DND` it just wrote.
          statusRestoreTo: focusIsLive ? next.statusRestoreTo : next.status,
        };
  }

  if (body.focus?.enabled === false) {
    next = {
      status: next.statusRestoreTo ?? next.status,
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    };
  }

  const resolved = resolveFocusState(
    {
      id: row.id,
      status: next.status,
      statusExpiresAt: next.statusExpiresAt,
      statusFocusMinutes: next.statusFocusMinutes,
      statusRestoreTo: next.statusRestoreTo,
    },
    now,
  );

  return {
    changed:
      next.status !== row.status ||
      (next.statusExpiresAt?.getTime() ?? null) !== (row.statusExpiresAt?.getTime() ?? null) ||
      next.statusFocusMinutes !== row.statusFocusMinutes ||
      next.statusRestoreTo !== row.statusRestoreTo,
    data: next,
    result: { focus: resolved.focus, presence: resolved.presence },
  };
}
