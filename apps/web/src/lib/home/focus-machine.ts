import type {
  AppSummaryResponse,
  HomeFocus,
  HomePresence,
  PresenceUpdateBody,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5 §3.1. The client half of the focus state machine.
 *
 * ```
 * kapalı --toggle--> açık(status=DND, restoreTo=önceki, expiresAt=now+25)
 * açık   --toggle--> kapalı(status=restoreTo)
 * açık   --expiry--> kapalı(status=restoreTo)   // aynı geri dönüş
 * ```
 *
 * Everything here is a pure function of `(summary, now)`. It plans two things at
 * once: the body the `PATCH` will carry, and the cache value the screen may show
 * before the answer arrives. Planning them apart is how an optimistic write ends
 * up disagreeing with the server it just called.
 *
 * The expiry branch plans **no request**. `06-faz5` §9: the server's sweep owns
 * the close, and a client `PATCH` racing it can apply `statusRestoreTo` twice.
 */

/** Faz 5 §3.1 — fixed for this package. A different length is a product decision. */
export const FOCUS_DEFAULT_MINUTES = 25;

const MINUTE_MS = 60_000;

/** The four chips, in the order the card draws them (SPEC §3.4). */
export type PresenceChipId = Extract<HomePresence, "ONLINE" | "IDLE" | "DND" | "OFFLINE">;

export type FocusProjection = {
  readonly focus: HomeFocus | null;
  readonly presence: HomePresence;
};

export type PresencePlan = {
  readonly body: PresenceUpdateBody;
  readonly optimistic: FocusProjection;
  /**
   * Where the screen should send the status back to when the window closes.
   * `undefined` when this plan does not move the target.
   */
  readonly restoreTo?: PresenceChipId;
};

/**
 * `OFFLINE` is what the store and the DTO call it; `INVISIBLE` is what the write
 * endpoint calls the same thing (`lib/home/types.ts`). The chip is one button, so
 * the translation happens once, here.
 */
function toWirePresence(chip: PresenceChipId): NonNullable<PresenceUpdateBody["presence"]> {
  return chip === "OFFLINE" ? "INVISIBLE" : chip;
}

function isFocusOpen(summary: Pick<AppSummaryResponse, "focus">): boolean {
  return summary.focus?.active === true;
}

/**
 * Which chip is drawn as selected.
 *
 * While the window is open the published status is `DND`, but the chips keep
 * showing the user's own choice — that is the design's "Çevrimiçi selected while
 * DND is on". `restoreTo` is the locally picked target; without one the window's
 * own status is the only honest answer.
 */
export function selectPresenceChip(input: {
  restoreTo?: PresenceChipId | null;
  summary: Pick<AppSummaryResponse, "focus" | "presence">;
}): HomePresence {
  if (isFocusOpen(input.summary) && input.restoreTo) {
    return input.restoreTo;
  }

  return input.summary.presence;
}

/** Toggling the `Rahatsız etmeyin` switch, in either direction. */
export function planFocusToggle(input: {
  now: Date;
  restoreTo?: PresenceChipId | null;
  summary: Pick<AppSummaryResponse, "focus" | "presence">;
}): PresencePlan {
  const { now, summary } = input;

  if (isFocusOpen(summary)) {
    return {
      body: { focus: { enabled: false } },
      optimistic: {
        focus: null,
        presence: input.restoreTo ?? "ONLINE",
      },
    };
  }

  const expiresAt = new Date(now.getTime() + FOCUS_DEFAULT_MINUTES * MINUTE_MS);

  return {
    body: { focus: { enabled: true, minutes: FOCUS_DEFAULT_MINUTES } },
    optimistic: {
      focus: {
        active: true,
        expiresAt: expiresAt.toISOString(),
        minutesLeft: FOCUS_DEFAULT_MINUTES,
        totalMinutes: FOCUS_DEFAULT_MINUTES,
      },
      presence: "DND",
    },
    // The status the window is expected to hand back. `DND` would be a lie: the
    // window would restore to itself.
    restoreTo: summary.presence === "DND" ? "ONLINE" : (summary.presence as PresenceChipId),
  };
}

/**
 * Tapping a presence chip. Returns `null` when the tap changes nothing — a
 * second tap on the selected chip must not repeat the request (§2.1).
 */
export function planPresencePick(input: {
  next: PresenceChipId;
  restoreTo?: PresenceChipId | null;
  summary: Pick<AppSummaryResponse, "focus" | "presence">;
}): PresencePlan | null {
  const { next, summary } = input;
  const selected = selectPresenceChip({ restoreTo: input.restoreTo ?? null, summary });

  if (selected === next) {
    return null;
  }

  if (isFocusOpen(summary)) {
    return {
      body: { presence: toWirePresence(next) },
      // The window keeps holding `DND`; the chip only moves where it lands.
      optimistic: { focus: summary.focus, presence: summary.presence },
      restoreTo: next,
    };
  }

  return {
    body: { presence: toWirePresence(next) },
    optimistic: { focus: null, presence: next },
  };
}

/**
 * What the screen should show once the window's absolute deadline has passed,
 * while it waits for the sweep's `presence:update`. `null` means "nothing has
 * expired, leave the cache alone".
 */
export function projectExpiredFocus(input: {
  now: Date;
  restoreTo?: PresenceChipId | null;
  summary: Pick<AppSummaryResponse, "focus" | "presence">;
}): FocusProjection | null {
  const focus = input.summary.focus;

  if (!focus?.active) {
    return null;
  }

  const expiresAt = Date.parse(focus.expiresAt);
  if (Number.isNaN(expiresAt) || expiresAt > input.now.getTime()) {
    return null;
  }

  return { focus: null, presence: input.restoreTo ?? "ONLINE" };
}
