import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { SERVER_ADMIN_PERMISSIONS } from "@/lib/workspace/permissions";
import { transferServerOwnership } from "@/lib/workspace/server-ownership-service";
import type { AccessContext } from "@/lib/workspace/workspace-types";

type Recorder = {
  auditRows: Array<Record<string, unknown>>;
  createdRoles: Array<Record<string, unknown>>;
  memberRoleRows: Array<{ memberId: string; roleId: string }>;
  operations: string[];
  ownerUpdates: string[];
  publishedRevisions: Array<Record<string, unknown>>;
  socketEmits: string[];
};

function ownerAccess(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    accessLevel: "OWNER",
    isPublic: false,
    memberId: "member-owner",
    ownerId: "owner-1",
    roles: [],
    serverId: "server-1",
    serverName: "Mobile Test",
    type: "PERSONAL",
    userId: "owner-1",
    ...overrides,
  };
}

function createHarness(
  options: {
    access?: AccessContext;
    adminRole?: { id: string } | null;
    adminRoleByName?: { id: string } | null;
    members?: Array<{ id: string; userId: string }>;
  } = {},
) {
  const recorder: Recorder = {
    auditRows: [],
    createdRoles: [],
    memberRoleRows: [],
    operations: [],
    ownerUpdates: [],
    publishedRevisions: [],
    socketEmits: [],
  };
  const members = options.members ?? [
    { id: "member-owner", userId: "owner-1" },
    { id: "member-target", userId: "user-2" },
  ];
  let subjectRevision = 4n;

  const tx = {
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        recorder.operations.push("audit.create");
        recorder.auditRows.push(data);
        return {};
      },
    },
    memberRole: {
      createMany: async ({ data }: { data: Array<{ memberId: string; roleId: string }> }) => {
        recorder.operations.push("memberRole.createMany");
        recorder.memberRoleRows.push(...data);
        return { count: data.length };
      },
    },
    outboxJob: {
      upsert: async () => {
        recorder.operations.push("outbox.upsert");
        return {};
      },
    },
    role: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        recorder.operations.push("role.create");
        recorder.createdRoles.push(data);
        return { id: "role-created-admin" };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if ("permissions" in where) {
          return options.adminRole === undefined ? { id: "role-admin" } : options.adminRole;
        }
        return options.adminRoleByName ?? null;
      },
    },
    server: {
      findUnique: async () => ({ authorizationRevision: 9n }),
      update: async ({ data }: { data: { ownerId?: string } }) => {
        if (data.ownerId) {
          recorder.operations.push("server.ownerId");
          recorder.ownerUpdates.push(data.ownerId);
          return { authorizationRevision: 9n };
        }
        recorder.operations.push("server.revision");
        return { authorizationRevision: 9n };
      },
    },
    serverAuthorizationSubjectRevision: {
      upsert: async () => {
        recorder.operations.push("subjectRevision.upsert");
        subjectRevision += 1n;
        return { revision: subjectRevision };
      },
    },
    serverMember: {
      findFirst: async ({ where }: { where: { userId: string } }) =>
        members.find((member) => member.userId === where.userId) ?? null,
    },
  };

  const dependencies = {
    client: {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    },
    getAccessContext: async () => options.access ?? ownerAccess(),
    getSocketServer: () => ({
      to(room: string) {
        return {
          emit(event: string) {
            recorder.socketEmits.push(`${room}:${event}`);
          },
        };
      },
    }),
    publishCommittedAuthorizationRevision: async (revision: Record<string, unknown>) => {
      recorder.publishedRevisions.push(revision);
      return "published" as const;
    },
  };

  return { dependencies, recorder };
}

async function run(harness: ReturnType<typeof createHarness>, newOwnerUserId = "user-2") {
  return transferServerOwnership(
    "owner-1",
    "server-1",
    { acknowledged: true, newOwnerUserId },
    harness.dependencies as never,
  );
}

describe("transferServerOwnership (Ş1 §3, SPEC-SUNUCU §8.9)", () => {
  it("refuses anyone but the current owner", async () => {
    const harness = createHarness({
      access: ownerAccess({ accessLevel: "ADMIN", ownerId: "someone-else" }),
    });

    await assert.rejects(
      () => run(harness),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        return true;
      },
    );
    assert.deepEqual(harness.recorder.ownerUpdates, []);
  });

  it("refuses a target who is not a member of the server", async () => {
    const harness = createHarness({ members: [{ id: "member-owner", userId: "owner-1" }] });

    await assert.rejects(
      () => run(harness, "stranger"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "MEMBER_NOT_FOUND");
        return true;
      },
    );
    assert.deepEqual(harness.recorder.ownerUpdates, []);
  });

  it("refuses a transfer to the current owner before it touches the database", async () => {
    const harness = createHarness();

    await assert.rejects(
      () => run(harness, "owner-1"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "INVALID_TARGET");
        return true;
      },
    );
    assert.deepEqual(harness.recorder.operations, []);
  });

  it("moves the owner column, drops the old owner to Admin and writes the audit row", async () => {
    const harness = createHarness();

    const result = await run(harness);

    assert.deepEqual(result, { newOwnerUserId: "user-2", success: true });
    assert.deepEqual(harness.recorder.ownerUpdates, ["user-2"]);
    assert.deepEqual(harness.recorder.memberRoleRows, [
      { memberId: "member-owner", roleId: "role-admin" },
    ]);
    assert.deepEqual(harness.recorder.auditRows, [
      {
        action: "SERVER_OWNERSHIP_TRANSFERRED",
        changes: { newOwnerUserId: "user-2", previousOwnerUserId: "owner-1" },
        serverId: "server-1",
        targetId: "user-2",
        targetType: "SERVER",
        userId: "owner-1",
      },
    ]);
  });

  it("advances the server revision before the two member revisions", async () => {
    const harness = createHarness();

    await run(harness);

    const { operations } = harness.recorder;
    const serverRevisionIndex = operations.indexOf("server.revision");
    const firstSubjectIndex = operations.indexOf("subjectRevision.upsert");

    assert.notEqual(serverRevisionIndex, -1);
    assert.notEqual(firstSubjectIndex, -1);
    // `ownerId` her üyenin önbelleklenmiş izin bağlamının parçası, o yüzden
    // sunucu revizyonu da artar — yalnız iki kişinin özne revizyonu yetmez.
    assert.ok(serverRevisionIndex < firstSubjectIndex);
    assert.equal(
      operations.filter((operation) => operation === "subjectRevision.upsert").length,
      2,
    );
    assert.equal(harness.recorder.publishedRevisions.length, 3);
    assert.deepEqual(
      harness.recorder.publishedRevisions.map((revision) => revision.userId ?? null),
      [null, "owner-1", "user-2"],
    );
  });

  it("commits the owner column, role and audit row before anything is published", async () => {
    const harness = createHarness();

    await run(harness);

    const { operations } = harness.recorder;
    assert.ok(operations.indexOf("server.ownerId") < operations.indexOf("audit.create"));
    assert.ok(operations.indexOf("memberRole.createMany") < operations.indexOf("audit.create"));
    assert.deepEqual(harness.recorder.socketEmits, ["server:server-1:server:settings:updated"]);
  });

  it("recreates the Admin role when the server no longer has one", async () => {
    const harness = createHarness({ adminRole: null, adminRoleByName: null });

    await run(harness);

    assert.equal(harness.recorder.createdRoles.length, 1);
    assert.equal(harness.recorder.createdRoles[0]?.name, "Admin");
    assert.equal(harness.recorder.createdRoles[0]?.permissions, SERVER_ADMIN_PERMISSIONS);
    assert.deepEqual(harness.recorder.memberRoleRows, [
      { memberId: "member-owner", roleId: "role-created-admin" },
    ]);
  });

  it("reuses a renamed admin role by name before creating a new one", async () => {
    const harness = createHarness({ adminRole: null, adminRoleByName: { id: "role-by-name" } });

    await run(harness);

    assert.deepEqual(harness.recorder.createdRoles, []);
    assert.deepEqual(harness.recorder.memberRoleRows, [
      { memberId: "member-owner", roleId: "role-by-name" },
    ]);
  });
});
