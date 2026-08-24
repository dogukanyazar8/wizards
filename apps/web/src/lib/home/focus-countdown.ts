/**
 * Ana Sayfa 1a — Faz 5 §3.2. The focus countdown, as a plain object.
 *
 * Three rules the design and §9 fix in place, and one reason each:
 *
 * - **Absolute deadline, not a counter.** A `minutesLeft--` ticker drifts while
 *   the tab is asleep and comes back reading a number nobody can explain.
 * - **One tick a minute, and none while hidden.** A background tab must not hold
 *   a timer open; on return the value is recomputed from the deadline, so the
 *   sleep costs nothing.
 * - **Released on destroy.** The interval and the visibility listener both go.
 *
 * The timer, the clock and the visibility source are all parameters. That is what
 * lets the contract above be tested against a fake clock instead of asserted in a
 * comment — the React wrapper (`hooks/use-focus-countdown.ts`) supplies the real
 * `window`/`document` ones.
 */

export const FOCUS_COUNTDOWN_TICK_MS = 60_000;

export type FocusCountdownOptions = {
  clearInterval: (handle: number) => void;
  /** Epoch millis the window closes; `null` (or unparseable) means no window. */
  expiresAtMs: number | null;
  isHidden: () => boolean;
  now: () => number;
  onTick: (minutesLeft: number | null) => void;
  setInterval: (run: () => void, intervalMs: number) => number;
  subscribeVisibility: (listener: () => void) => () => void;
};

export type FocusCountdown = {
  destroy: () => void;
  /** The value right now, read off the deadline rather than off the last tick. */
  read: () => number | null;
};

/**
 * Minutes still to run, rounded **up**: with forty seconds left the card says
 * "1 dk", not "0 dk". Past the deadline it says 0 and stops.
 */
export function getFocusMinutesLeft(
  expiresAtMs: number | null | undefined,
  nowMs: number,
): number | null {
  if (expiresAtMs === null || expiresAtMs === undefined || Number.isNaN(expiresAtMs)) {
    return null;
  }

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / FOCUS_COUNTDOWN_TICK_MS));
}

export function createFocusCountdown(options: FocusCountdownOptions): FocusCountdown {
  const { clearInterval, expiresAtMs, isHidden, now, onTick, setInterval } = options;
  let handle: number | null = null;

  const read = () => getFocusMinutesLeft(expiresAtMs, now());

  const stop = () => {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  };

  const start = () => {
    if (handle !== null || expiresAtMs === null || isHidden()) {
      return;
    }

    // A window that has already closed gets no timer at all: there is nothing
    // left to count and the sweep owns what happens next.
    if (read() === 0) {
      return;
    }

    handle = setInterval(() => {
      const minutesLeft = read();
      onTick(minutesLeft);

      if (minutesLeft === 0) {
        stop();
      }
    }, FOCUS_COUNTDOWN_TICK_MS);
  };

  const unsubscribe = options.subscribeVisibility(() => {
    if (isHidden()) {
      stop();
      return;
    }

    // Back in the foreground: publish the value the deadline implies *first*, so
    // the screen is right immediately rather than a minute later.
    onTick(read());
    start();
  });

  start();

  return {
    destroy: () => {
      stop();
      unsubscribe();
    },
    read,
  };
}
