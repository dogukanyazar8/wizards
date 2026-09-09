import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "./permissions";
import { timeoutWorkspaceMember } from "./member-timeout-service";

const FUTURE = "2099-08-25T18:00:00.000Z";
const PAST = "2020-08-25T18:00:00.000Z";

function access(overrides: Record<string, unknown> = {}) {
  return {
    accessLevel: "OWNER",
    isPublic: false,
    memberId: "member-owner",
    ownerId: "actor",
    roles: [],
    serverId: "server-1",
    serverName: "Guild",
    type: "PERSONAL",
    userId: "actor",
    ...overrides,
  };
}

function moderatorAccess() {
  return access({
    accessLevel: "MEMBER",
    memberId: "member-moderator",
    ownerId: "owner",
    roles: [
      {
        id: "role-mod",
        isDefault: false,
        managed: false,
        permissions: PermissionBits.TIMEOUT_MEMBERS,
      },
    ],
    userId: "moderator",
  });
}

type Recorder = { audits: string[]; operations: string[]; updates: Array<Date | null> };

function recorder(): Recorder {
  return { audits: [], operations: [], updates: [] };
}

function createDependencies(
  state: Recorder,
  options: { accessContext?: () => unknown; member?: unknown } = {},
) {
  const io = {
    to(room: string) {
      return {
        emit(event: string) {
          state.operations.push(`emit:${room}:${event}`);
        },
      };
    },
  };
  const tx = {
    auditLog: {
      create: async (args: { data: { action: string } }) => {
        state.audits.push(args.data.action);
        state.operations.push("audit.create");
        return {};
      },
    },
    outboxJob: { upsert: async () => ({}) },
    server: { findUnique: async () => ({ authorizationRevision: 4n }) },
    serverAuthorizationSubjectRevision: {
      upsert: async () => {
        state.operations.push("revision.increment");
        return { revision: 9n };
      },
    },
    serverMember: {
      findFirst: async () =>
        options.member === undefined
          ? { id: "member-target", roles: [], userId: "target" }
          : options.member,
      update: async (args: { data: { communicationDisabledUntil: Date | null } }) => {
        state.operations.push("member.update");
        state.updates.push(args.data.communicationDisabledUntil);
        return {};
      },
    },
  };

  return {
    client: {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        const value = await callback(tx);
        state.operations.push("transaction.commit");
        return value;
      },
    },
    getAccessContext: async () => (options.accessContext ?? access)(),
    getSocketServer: () => io,
    publishCommittedAuthorizationRevision: async () => {
      state.operations.push("revision.publish");
      return "published";
    },
  } as never;
}

describe("workspace member timeout service", () => {
  it("writes the column, its audit row and its revision before announcing anything", async () => {
    const state = recorder();
    const result = await timeoutWorkspaceMember(
      "actor",
      "server-1",
      "member-target",
      { reason: "spam", until: FUTURE },
      createDependencies(state),
    );

    assert.equal(result.communicationDisabledUntil, FUTURE);
    assert.deepEqual(state.updates, [new Date(FUTURE)]);
    assert.deepEqual(state.audits, ["MEMBER_TIMED_OUT"]);
    assert.ok(state.operations.indexOf("member.update") < state.operations.indexOf("audit.create"));
    assert.ok(
      state.operations.indexOf("audit.create") < state.operations.indexOf("revision.increment"),
    );
    assert.ok(
      state.operations.indexOf("transaction.commit") < state.operations.indexOf("revision.publish"),
    );
    assert.ok(state.operations.includes("emit:user:target:server:settings:updated"));
  });

  it("lifts the timeout through the same call and says so in the audit trail", async () => {
    const state = recorder();
    const result = await timeoutWorkspaceMember(
      "actor",
      "server-1",
      "member-target",
      { until: null },
      createDependencies(state),
    );

    assert.equal(result.communicationDisabledUntil, null);
    assert.deepEqual(state.updates, [null]);
    assert.deepEqual(state.audits, ["MEMBER_TIMEOUT_REMOVED"]);
  });

  it("refuses a member without the timeout permission", async () => {
    const state = recorder();

    await assert.rejects(
      () =>
        timeoutWorkspaceMember(
          "member",
          "server-1",
          "member-target",
          { until: FUTURE },
          createDependencies(state, {
            accessContext: () =>
              access({
                accessLevel: "MEMBER",
                memberId: "member-plain",
                ownerId: "owner",
                roles: [
                  {
                    id: "role-everyone",
                    isDefault: true,
                    managed: false,
                    permissions: PermissionBits.SEND_MESSAGES,
                  },
                ],
                userId: "member",
              }),
          }),
        ),
      (error) => error instanceof ApiError && error.status === 403,
    );
    assert.deepEqual(state.updates, []);
  });

  it("lets a moderator time a member out without owning the server", async () => {
    const state = recorder();
    await timeoutWorkspaceMember(
      "moderator",
      "server-1",
      "member-target",
      { until: FUTURE },
      createDependencies(state, { accessContext: moderatorAccess }),
    );

    assert.deepEqual(state.updates, [new Date(FUTURE)]);
  });

  it("refuses the owner as a target with 400, not 403", async () => {
    const state = recorder();

    await assert.rejects(
      () =>
        timeoutWorkspaceMember(
          "moderator",
          "server-1",
          "member-owner",
          { until: FUTURE },
          createDependencies(state, {
            accessContext: moderatorAccess,
            member: { id: "member-owner", roles: [], userId: "owner" },
          }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 400 && error.code === "INVALID_TARGET",
    );
    assert.deepEqual(state.updates, []);
  });

  it("refuses the actor as their own target", async () => {
    const state = recorder();

    await assert.rejects(
      () =>
        timeoutWorkspaceMember(
          "actor",
          "server-1",
          "member-self",
          { until: FUTURE },
          createDependencies(state, {
            member: { id: "member-self", roles: [], userId: "actor" },
          }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 400 && error.code === "INVALID_TARGET",
    );
    assert.deepEqual(state.updates, []);
  });

  it("refuses a date already in the past instead of writing a dead column", async () => {
    const state = recorder();

    await assert.rejects(
      () =>
        timeoutWorkspaceMember(
          "actor",
          "server-1",
          "member-target",
          { until: PAST },
          createDependencies(state),
        ),
      (error) =>
        error instanceof ApiError && error.status === 400 && error.code === "INVALID_TIMEOUT",
    );
    assert.deepEqual(state.updates, []);
  });

  it("reports a missing member as missing", async () => {
    const state = recorder();

    await assert.rejects(
      () =>
        timeoutWorkspaceMember(
          "actor",
          "server-1",
          "member-gone",
          { until: FUTURE },
          createDependencies(state, { member: null }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 404 && error.code === "MEMBER_NOT_FOUND",
    );
  });
});
