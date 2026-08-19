import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceMemberAuthorizationRevision,
  advanceServerAuthorizationRevision,
  readServerAuthorizationRevisions,
} from "./authorization-revision";

function createRevisionClient() {
  let serverRevision = 0n;
  const memberRevisions = new Map<string, bigint>();
  const jobs: Array<{ idempotencyKey: string; payload: unknown; type: string }> = [];

  return {
    client: {
      outboxJob: {
        async upsert(args: { create: { idempotencyKey: string; payload: unknown; type: string } }) {
          jobs.push(args.create);
          return args.create;
        },
      },
      server: {
        async findUnique() {
          return {
            authorizationRevision: serverRevision,
            authorizationSubjectRevisions: [...memberRevisions].map(([userId, revision]) => ({
              revision,
              userId,
            })),
          };
        },
        async update() {
          serverRevision += 1n;
          return { authorizationRevision: serverRevision };
        },
      },
      serverAuthorizationSubjectRevision: {
        async upsert(args: { where: { serverId_userId: { userId: string } } }) {
          const userId = args.where.serverId_userId.userId;
          const revision = (memberRevisions.get(userId) ?? 0n) + 1n;
          memberRevisions.set(userId, revision);
          return { revision };
        },
      },
    },
    jobs,
  };
}

describe("workspace authorization revisions", () => {
  it("advances server revision and enqueues the exact revision in the same client", async () => {
    const fixture = createRevisionClient();

    const revision = await advanceServerAuthorizationRevision(fixture.client as never, "server-1");

    assert.deepEqual(revision, { serverId: "server-1", serverVersion: "1" });
    assert.deepEqual(fixture.jobs, [
      {
        idempotencyKey: "permission-revision:server:server-1:1",
        payload: { serverId: "server-1", serverVersion: "1" },
        type: "PERMISSION_CACHE_REVISION",
      },
    ]);
  });

  it("keeps a member revision after membership deletion and enqueues durable publication", async () => {
    const fixture = createRevisionClient();

    const revision = await advanceMemberAuthorizationRevision(
      fixture.client as never,
      "server-1",
      "user-1",
    );

    assert.deepEqual(revision, {
      memberVersion: "1",
      serverId: "server-1",
      serverVersion: "0",
      userId: "user-1",
    });
    assert.deepEqual(fixture.jobs[0], {
      idempotencyKey: "permission-revision:member:server-1:user-1:1",
      payload: {
        memberVersion: "1",
        serverId: "server-1",
        serverVersion: "0",
        userId: "user-1",
      },
      type: "PERMISSION_CACHE_REVISION",
    });
  });

  it("reads one server and all requested member revisions as one batch contract", async () => {
    const fixture = createRevisionClient();
    await advanceMemberAuthorizationRevision(fixture.client as never, "server-1", "user-1");

    const revisions = await readServerAuthorizationRevisions(fixture.client as never, "server-1", [
      "user-1",
      "user-2",
      "user-1",
    ]);

    assert.deepEqual(revisions, {
      revisionsByUser: new Map([
        ["user-1", { memberVersion: "1", serverVersion: "0" }],
        ["user-2", { memberVersion: "0", serverVersion: "0" }],
      ]),
      serverExists: true,
    });
  });
});
