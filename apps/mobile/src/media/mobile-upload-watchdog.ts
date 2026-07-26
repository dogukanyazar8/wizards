/**
 * An upload is three very different waits wearing one coat.
 *
 * First the presign round trip, then the bytes, and then — because UploadThing
 * holds the request open until this app's own `onUploadComplete` answers — a
 * stretch of pure server work with no client-side signal at all. A single flat
 * deadline over all three is what turned a large screenshot on a slow uplink
 * into "Yükleme zaman aşımına uğradı": the request was killed while it was
 * still making progress, and the message named the wrong culprit.
 *
 * The watchdog times each stage against what that stage is actually doing. A
 * transfer is only late when it stops moving; the tail after the last byte gets
 * its own, longer budget; and a ceiling covers the whole attempt so nothing can
 * creep forever.
 */

/**
 * No byte has been reported yet — token refresh, presign, first packet. It is
 * deliberately the most forgiving budget: a runtime that never emits upload
 * progress at all would spend the entire upload in this stage, so shortening it
 * would fail healthy uploads that the old flat deadline let through.
 */
export const MOBILE_UPLOAD_FIRST_BYTE_TIMEOUT_MS = 45_000;
/** A transfer that has started and then stopped moving. */
export const MOBILE_UPLOAD_STALL_TIMEOUT_MS = 25_000;
/** The last byte is sent; the server is verifying and recording the image. */
export const MOBILE_UPLOAD_FINALIZE_TIMEOUT_MS = 90_000;
/** Backstop over the whole attempt, however healthy each stage looks. */
export const MOBILE_UPLOAD_CEILING_MS = 240_000;

export type MobileUploadStage = "finalizing" | "preparing" | "transferring";

export interface MobileUploadWatchdog {
  /** Feed every progress report from the transport in here. */
  progress(input: { readonly loaded: number; readonly total: number }): void;
  readonly stage: MobileUploadStage;
  /** Always call this when the attempt settles, success or failure. */
  stop(): void;
}

type TimerHandle = unknown;

export interface MobileUploadWatchdogOptions {
  clearTimer?: (handle: TimerHandle) => void;
  onExpire: (stage: MobileUploadStage) => void;
  setTimer?: (run: () => void, milliseconds: number) => TimerHandle;
}

export function createMobileUploadWatchdog(
  options: MobileUploadWatchdogOptions,
): MobileUploadWatchdog {
  const setTimer = options.setTimer ?? ((run, milliseconds) => setTimeout(run, milliseconds));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let stage: MobileUploadStage = "preparing";
  let stageTimer: TimerHandle | null = null;
  let stopped = false;

  const expire = () => {
    if (stopped) {
      return;
    }
    const expiredStage = stage;
    stop();
    options.onExpire(expiredStage);
  };

  const armStageTimer = (milliseconds: number) => {
    if (stageTimer !== null) {
      clearTimer(stageTimer);
    }
    stageTimer = setTimer(expire, milliseconds);
  };

  const ceilingTimer = setTimer(expire, MOBILE_UPLOAD_CEILING_MS);
  armStageTimer(MOBILE_UPLOAD_FIRST_BYTE_TIMEOUT_MS);

  function stop() {
    if (stopped) {
      return;
    }
    stopped = true;
    if (stageTimer !== null) {
      clearTimer(stageTimer);
      stageTimer = null;
    }
    clearTimer(ceilingTimer);
  }

  return {
    progress(input) {
      if (stopped) {
        return;
      }

      // The tail is entered once and never re-armed: repeated "100%" reports
      // must not push the server-side deadline out indefinitely.
      const isComplete = input.total > 0 && input.loaded >= input.total;
      if (isComplete) {
        if (stage === "finalizing") {
          return;
        }
        stage = "finalizing";
        armStageTimer(MOBILE_UPLOAD_FINALIZE_TIMEOUT_MS);
        return;
      }

      stage = "transferring";
      armStageTimer(MOBILE_UPLOAD_STALL_TIMEOUT_MS);
    },
    get stage() {
      return stage;
    },
    stop,
  };
}
