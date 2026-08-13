import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  broadcastOpenModerationCaseCount,
  sendOpenModerationCaseCountToUser,
  type ModerationCaseCountBroadcastDependencies,
} from "@/lib/moderation/case-count-broadcast";
import type { AppSocketServer } from "@/lib/socket/runtime";

const socketServer = {} as AppSocketServer;

function harness(overrides: Partial<ModerationCaseCountBroadcastDependencies> = {}) {
  const emitted: { count: number; userIds: string[] }[] = [];

  const dependencies: ModerationCaseCountBroadcastDependencies = {
    canReadQueue: async (userId) => userId === "admin-1" || userId === "admin-2",
    countOpenCases: async () => 7,
    emit: (_io, userIds, count) => {
      emitted.push({ count, userIds });
    },
    listQueueReaderUserIds: async () => ["admin-1", "admin-2"],
    resolveSocketServer: () => socketServer,
    ...overrides,
  };

  return { dependencies, emitted };
}

describe("open moderation case count broadcast", () => {
  /**
   * F test 8: the number is the server's. Desktop subscribes and renders; if it
   * ever computed the count itself, a client with a stale idea of "open" would
   * put a wrong badge on the tray.
   */
  it("sends the server-side count to every admin who may read the queue", async () => {
    const { dependencies, emitted } = harness();

    const result = await broadcastOpenModerationCaseCount(dependencies);

    assert.deepEqual(result, { count: 7, recipients: 2 });
    assert.deepEqual(emitted, [{ count: 7, userIds: ["admin-1", "admin-2"] }]);
  });

  it("counts nothing and emits nothing when there is no socket server", async () => {
    let counted = 0;
    const { dependencies, emitted } = harness({
      countOpenCases: async () => {
        counted += 1;
        return 7;
      },
      resolveSocketServer: () => null,
    });

    const result = await broadcastOpenModerationCaseCount(dependencies);

    assert.deepEqual(result, { count: 0, recipients: 0 });
    assert.equal(counted, 0);
    assert.deepEqual(emitted, []);
  });

  it("skips the emit when no admin can read the queue", async () => {
    const { dependencies, emitted } = harness({ listQueueReaderUserIds: async () => [] });

    const result = await broadcastOpenModerationCaseCount(dependencies);

    assert.deepEqual(result, { count: 7, recipients: 0 });
    assert.deepEqual(emitted, []);
  });

  /**
   * A desktop that just launched has no badge until something changes, so the
   * count is pushed once on connect — and only to an account that may read the
   * queue, or the number would tell a non-admin how much moderation work exists.
   */
  it("syncs the count to a queue reader on connect and to nobody else", async () => {
    let listCalls = 0;
    const { dependencies } = harness({
      listQueueReaderUserIds: async () => {
        listCalls += 1;
        return ["admin-1", "admin-2"];
      },
    });
    const sent: { count: number }[] = [];
    const socket = {
      emit: (_event: "admin:open-case-count", data: { count: number }) => sent.push(data),
    };

    assert.deepEqual(await sendOpenModerationCaseCountToUser("admin-2", socket, dependencies), {
      sent: true,
    });
    assert.deepEqual(sent, [{ count: 7 }]);

    assert.deepEqual(await sendOpenModerationCaseCountToUser("user-9", socket, dependencies), {
      sent: false,
    });
    assert.equal(sent.length, 1);
    assert.equal(listCalls, 0);
  });

  it("reports zero as a real count rather than skipping the update", async () => {
    const { dependencies, emitted } = harness({ countOpenCases: async () => 0 });

    await broadcastOpenModerationCaseCount(dependencies);

    // A queue that just emptied has to clear the tray badge.
    assert.deepEqual(emitted, [{ count: 0, userIds: ["admin-1", "admin-2"] }]);
  });
});
