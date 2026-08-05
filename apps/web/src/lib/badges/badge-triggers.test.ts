import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdvanceBadgeProgressArgs } from "@/lib/badges/badge-service";
import {
  onAppSessionEnded,
  onAppSessionStarted,
  onBugReportResolved,
  onFeedbackShipped,
  onInviteRedeemed,
  onMediaSessionEnded,
  onMessageCreated,
  type BadgeTriggerDependencies,
} from "@/lib/badges/badge-triggers";

const DAY = new Date("2026-08-05T00:00:00.000Z");

function harness(options: { fail?: boolean } = {}) {
  const advanced: AdvanceBadgeProgressArgs[] = [];
  const failures: string[] = [];

  const dependencies: BadgeTriggerDependencies = {
    advanceProgress: async (args) => {
      if (options.fail) {
        throw new Error("store is down");
      }
      advanced.push(args);
      return { previousTier: 0, tier: 1, value: args.amount };
    },
    logFailure: (scope) => {
      failures.push(scope);
    },
  };

  return { advanced, dependencies, failures };
}

/** Every trigger with arguments that would normally write something. */
const TRIGGERS: ReadonlyArray<{
  name: string;
  run: (dependencies: BadgeTriggerDependencies) => Promise<void>;
}> = [
  {
    name: "onAppSessionEnded",
    run: (dependencies) =>
      onAppSessionEnded({ appSeconds: 600, day: DAY, userId: "user-1" }, dependencies),
  },
  {
    name: "onAppSessionStarted",
    run: (dependencies) =>
      onAppSessionStarted({ releaseChannel: "BETA", userId: "user-1" }, dependencies),
  },
  {
    name: "onMessageCreated",
    run: (dependencies) => onMessageCreated({ day: DAY, userId: "user-1" }, dependencies),
  },
  {
    name: "onMediaSessionEnded",
    run: (dependencies) =>
      onMediaSessionEnded({ durationSeconds: 90, kind: "VOICE", userId: "user-1" }, dependencies),
  },
  {
    name: "onInviteRedeemed",
    run: (dependencies) =>
      onInviteRedeemed({ inviterId: "user-1", joinedUserId: "user-2" }, dependencies),
  },
  {
    name: "onFeedbackShipped",
    run: (dependencies) => onFeedbackShipped({ userIds: ["user-1"] }, dependencies),
  },
  {
    name: "onBugReportResolved",
    run: (dependencies) => onBugReportResolved({ userId: "user-1" }, dependencies),
  },
];

describe("badge triggers", () => {
  it("swallows every store failure and reports it instead of throwing", async () => {
    for (const trigger of TRIGGERS) {
      const { dependencies, failures } = harness({ fail: true });

      await assert.doesNotReject(() => trigger.run(dependencies), trigger.name);
      assert.deepEqual(failures, [`[badges] ${trigger.name} failed`], trigger.name);
    }
  });

  it("writes the badge each trigger owns when the call succeeds", async () => {
    const seen: Array<[string, string]> = [];

    for (const trigger of TRIGGERS) {
      const { advanced, dependencies } = harness();
      await trigger.run(dependencies);
      seen.push([trigger.name, advanced[0]?.badge ?? "none"]);
    }

    assert.deepEqual(seen, [
      ["onAppSessionEnded", "streak"],
      ["onAppSessionStarted", "betaTester"],
      ["onMessageCreated", "regular"],
      ["onMediaSessionEnded", "voice"],
      ["onInviteRedeemed", "inviter"],
      ["onFeedbackShipped", "ideaShipped"],
      ["onBugReportResolved", "bugHunter"],
    ]);
  });

  it("ignores an invite somebody spent on themselves", async () => {
    const { advanced, dependencies } = harness();

    await onInviteRedeemed({ inviterId: "user-1", joinedUserId: "user-1" }, dependencies);

    assert.deepEqual(advanced, []);
  });

  it("ignores a session too short to make the day active", async () => {
    const { advanced, dependencies } = harness();

    await onAppSessionEnded({ appSeconds: 59, day: DAY, userId: "user-1" }, dependencies);
    assert.deepEqual(advanced, []);

    await onAppSessionEnded({ appSeconds: 60, day: DAY, userId: "user-1" }, dependencies);
    assert.equal(advanced.length, 1);
  });

  it("gives camera time to no badge at all", async () => {
    const { advanced, dependencies } = harness();

    await onMediaSessionEnded(
      { durationSeconds: 7_200, kind: "CAMERA", userId: "user-1" },
      dependencies,
    );
    assert.equal(advanced.length, 0);

    await onMediaSessionEnded(
      { durationSeconds: 7_200, kind: "SCREEN_SHARE", userId: "user-1" },
      dependencies,
    );
    assert.equal(advanced[0]?.badge, "broadcaster");
  });

  it("leaves a stable channel alone and credits every author of a shipped idea", async () => {
    const beta = harness();
    await onAppSessionStarted({ releaseChannel: "STABLE", userId: "user-1" }, beta.dependencies);
    assert.deepEqual(beta.advanced, []);

    const shipped = harness();
    await onFeedbackShipped({ userIds: ["user-1", "user-2", "user-1"] }, shipped.dependencies);
    assert.deepEqual(
      shipped.advanced.map((call) => call.userId),
      ["user-1", "user-2"],
    );
  });
});
