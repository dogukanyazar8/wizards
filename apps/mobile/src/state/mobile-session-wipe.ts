/**
 * When the device stops holding a session, and what has to happen in order.
 *
 * This used to be an effect that fired for every auth status other than
 * `signed-in`. The first status of every cold start is `checking`, so the
 * persisted cache was destroyed on launch — every restart threw away exactly the
 * data that was persisted to make the restart fast — and, once an encrypted
 * message database existed, its key went with it.
 *
 * A wipe is therefore driven by a *transition*, not by a status, and it runs as
 * one awaited sequence so a following sign-in cannot interleave with it.
 */
export type MobileSessionAuthSnapshot = {
  readonly status: "checking" | "error" | "signed-in" | "signed-out";
  readonly userId: string | null;
};

export type MobileSessionWipeReason = "account-switch" | "sign-out";

export type MobileSessionWipePlan = {
  readonly previousUserId: string;
  readonly reason: MobileSessionWipeReason;
};

export type MobileSessionWipeStep =
  | "cancel-realtime-work"
  | "close-message-store"
  | "drop-memory-caches"
  | "purge-message-store"
  | "purge-query-cache";

export type MobileSessionWipeResult = {
  readonly failedSteps: readonly MobileSessionWipeStep[];
  readonly reason: MobileSessionWipeReason;
  readonly status: "complete" | "partial";
};

export type MobileSessionWipeDependencies = {
  /** In-flight refetches and prefetches for the old account. */
  cancelRealtimeWork(): Promise<void>;
  /** Must run before any delete: an open connection can outlive the file. */
  closeMessageStore(): Promise<void>;
  dropMemoryCaches(): void;
  purgeMessageStore(previousUserId: string): Promise<void>;
  purgeQueryCache(): Promise<void>;
  report(result: MobileSessionWipeResult): void;
};

/**
 * Only a session that actually existed in this process can end. `checking` is
 * the launch state, `error` is transient and keeps the session, and a cold start
 * that resolves straight to `signed-out` has nothing of this account's in memory
 * to remove.
 */
export function planMobileSessionWipe(
  next: MobileSessionAuthSnapshot,
  previous: MobileSessionAuthSnapshot | null,
): MobileSessionWipePlan | null {
  if (previous?.status !== "signed-in" || !previous.userId) {
    return null;
  }

  if (next.status === "signed-out") {
    return { previousUserId: previous.userId, reason: "sign-out" };
  }

  if (next.status === "signed-in" && next.userId && next.userId !== previous.userId) {
    return { previousUserId: previous.userId, reason: "account-switch" };
  }

  return null;
}

export async function runMobileSessionWipe(
  plan: MobileSessionWipePlan,
  dependencies: MobileSessionWipeDependencies,
): Promise<MobileSessionWipeResult> {
  const failedSteps: MobileSessionWipeStep[] = [];

  async function step(name: MobileSessionWipeStep, work: () => Promise<void> | void) {
    try {
      await work();
    } catch {
      // Every step is independent cleanup: one failure must not leave the rest
      // of the old account's data behind. The result records what did not land.
      failedSteps.push(name);
    }
  }

  await step("cancel-realtime-work", () => dependencies.cancelRealtimeWork());
  await step("drop-memory-caches", () => dependencies.dropMemoryCaches());
  await step("purge-message-store", () => dependencies.purgeMessageStore(plan.previousUserId));
  // Closing after the purge keeps the delete inside a connection that is known to
  // be keyed; closing first would force a reopen just to empty the file.
  await step("close-message-store", () => dependencies.closeMessageStore());
  await step("purge-query-cache", () => dependencies.purgeQueryCache());

  const result: MobileSessionWipeResult = {
    failedSteps,
    reason: plan.reason,
    status: failedSteps.length === 0 ? "complete" : "partial",
  };
  dependencies.report(result);
  return result;
}
