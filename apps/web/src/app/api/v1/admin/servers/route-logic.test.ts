import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AdminCreateServerSchema, AdminUpdateServerSchema } from "@wizards/types";

import {
  createAdminServer,
  deleteAdminServer,
  recountAdminServerMembers,
  resolveAdminServerUpdate,
  updateAdminServer,
  type AdminServerDeleteTransaction,
  type AdminServerRecountTransaction,
  type AdminServerUpdateData,
  type AdminServerUpdateSource,
  type AdminServerUpdateTransaction,
} from "@/app/api/v1/admin/servers/route-logic";
import { ApiError } from "@/lib/api";
import type { AdminAuditLogInput } from "@/lib/admin/audit-log";

function buildServerSource(
  overrides: Partial<AdminServerUpdateSource> = {},
): AdminServerUpdateSource {
  return {
    discoverable: false,
    features: [],
    isPublic: false,
    name: "Whispr Topluluk",
    type: "PERSONAL",
    verificationLevel: "NONE",
    ...overrides,
  };
}

/**
 * `withTransaction` just runs `run` immediately against a `tx` whose two
 * methods behave exactly like the old top-level `updateServer` /
 * `writeAuditLog` dependencies did, so every existing assertion below (call
 * order, update contents, audit contents) is unchanged by Finding 8's
 * atomicity fix. The dedicated rollback test further down uses its own,
 * transaction-shaped double instead of this one.
 */
function buildUpdateDependencies(server: AdminServerUpdateSource | null) {
  const audited: AdminAuditLogInput[] = [];
  const calls: string[] = [];
  const updates: AdminServerUpdateData[] = [];

  return {
    audited,
    calls,
    updates,
    dependencies: {
      findServer: async (_serverId: string) => {
        calls.push("find");
        return server;
      },
      withTransaction: async (run: (tx: AdminServerUpdateTransaction) => Promise<void>) => {
        await run({
          updateServer: async (_serverId: string, data: AdminServerUpdateData) => {
            calls.push("update");
            updates.push(data);
          },
          writeAuditLog: async (args: AdminAuditLogInput) => {
            calls.push("audit");
            audited.push(args);
          },
        });
      },
    },
  };
}

function buildDependencies() {
  const created: Array<{ options: unknown; userId: string }> = [];
  const audited: AdminAuditLogInput[] = [];

  return {
    audited,
    created,
    dependencies: {
      createServer: async (userId: string, _input: unknown, options: unknown) => {
        created.push({ options, userId });
        return { id: "server-1" };
      },
      writeAuditLog: async (args: AdminAuditLogInput) => {
        audited.push(args);
      },
    },
  };
}

function buildDeleteDependencies(server: { name: string; type: "COMMUNITY" | "PERSONAL" } | null) {
  const calls: string[] = [];
  const audited: AdminAuditLogInput[] = [];
  const deleted: string[] = [];

  return {
    audited,
    calls,
    deleted,
    dependencies: {
      findServer: async (_serverId: string) => {
        calls.push("find");
        return server;
      },
      withTransaction: async (run: (tx: AdminServerDeleteTransaction) => Promise<void>) => {
        await run({
          deleteServer: async (serverId: string) => {
            calls.push("delete");
            deleted.push(serverId);
          },
          writeAuditLog: async (args: AdminAuditLogInput) => {
            calls.push("audit");
            audited.push(args);
          },
        });
      },
    },
  };
}

describe("createAdminServer", () => {
  it("creates a community server with the privileged options applied", async () => {
    const { created, dependencies } = buildDependencies();
    const input = AdminCreateServerSchema.parse({
      discoverable: true,
      isPublic: true,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    const result = await createAdminServer("admin-1", input, null, dependencies as never);

    assert.equal(result.id, "server-1");
    assert.equal(created.length, 1);
    assert.deepEqual(created[0]?.options, {
      discoverable: true,
      isPublic: true,
      type: "COMMUNITY",
      verificationLevel: "NONE",
    });
  });

  it("writes an audit entry naming the created server", async () => {
    const { audited, dependencies } = buildDependencies();
    const input = AdminCreateServerSchema.parse({
      isPublic: true,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    await createAdminServer("admin-1", input, null, dependencies as never);

    assert.equal(audited.length, 1);
    assert.equal(audited[0]?.action, "server.create");
    assert.equal(audited[0]?.adminUserId, "admin-1");
    assert.equal(audited[0]?.targetId, "server-1");
    assert.equal(audited[0]?.targetType, "Server");
  });
});

// `createAdminServer` does not validate its input — the caller (`route.ts`, via
// `parseJsonBody`) is the only place `AdminCreateServerSchema` runs in
// production, so these two cases assert the schema and never reach the
// function. They used to live inside `describe("createAdminServer")`, which
// read as if the function were rejecting them.
describe("AdminCreateServerSchema rejections that never reach createAdminServer", () => {
  it("rejects a community server that is not publicly joinable", () => {
    const result = AdminCreateServerSchema.safeParse({
      isPublic: false,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    assert.equal(result.success, false);
  });

  it("rejects a create payload that fails validation before any server is created", () => {
    const result = AdminCreateServerSchema.safeParse({ name: "x" });

    assert.equal(result.success, false);
  });
});

describe("resolveAdminServerUpdate", () => {
  it("forces isPublic when a personal server is promoted to community", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ isPublic: false }),
      AdminUpdateServerSchema.parse({ type: "COMMUNITY" }),
    );

    assert.equal(data.type, "COMMUNITY");
    assert.equal(data.isPublic, true);
  });

  it("refuses to unpublish a community server even when the caller asks", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ isPublic: true, type: "COMMUNITY" }),
      AdminUpdateServerSchema.parse({ isPublic: false }),
    );

    assert.equal(data.isPublic, true);
  });

  it("clears discoverable when a community server is demoted to personal", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ discoverable: true, isPublic: true, type: "COMMUNITY" }),
      AdminUpdateServerSchema.parse({ type: "PERSONAL" }),
    );

    assert.equal(data.type, "PERSONAL");
    assert.equal(data.discoverable, false);
  });

  it("leaves a personal server's discoverable flag alone when the type does not change", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ discoverable: true, isPublic: true }),
      AdminUpdateServerSchema.parse({ verificationLevel: "HIGH" }),
    );

    assert.equal(data.discoverable, true);
    assert.equal(data.verificationLevel, "HIGH");
  });

  it("never lets discoverable turn on while isPublic stays off", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ discoverable: false, isPublic: false }),
      AdminUpdateServerSchema.parse({ discoverable: true }),
    );

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });

  it("clears discoverable when a public personal server is turned private", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ discoverable: true, isPublic: true }),
      AdminUpdateServerSchema.parse({ isPublic: false }),
    );

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });

  it("adds and removes the feature flags without touching the media-settings flags", () => {
    const source = buildServerSource({ features: ["TEXT_GIFS_DISABLED", "VERIFIED"] });

    const promoted = resolveAdminServerUpdate(
      source,
      AdminUpdateServerSchema.parse({ featured: true }),
    );
    assert.deepEqual(promoted.features.sort(), ["FEATURED", "TEXT_GIFS_DISABLED", "VERIFIED"]);

    const unverified = resolveAdminServerUpdate(
      source,
      AdminUpdateServerSchema.parse({ verified: false }),
    );
    assert.deepEqual(unverified.features, ["TEXT_GIFS_DISABLED"]);
  });

  it("never duplicates a flag the server already carries", () => {
    const data = resolveAdminServerUpdate(
      buildServerSource({ features: ["FEATURED"] }),
      AdminUpdateServerSchema.parse({ featured: true }),
    );

    assert.deepEqual(data.features, ["FEATURED"]);
  });
});

describe("updateAdminServer", () => {
  it("rejects when the server does not exist, updating nothing and writing no audit entry", async () => {
    const { audited, calls, dependencies, updates } = buildUpdateDependencies(null);

    await assert.rejects(
      updateAdminServer(
        "admin-1",
        "server-404",
        AdminUpdateServerSchema.parse({ type: "COMMUNITY" }),
        null,
        dependencies as never,
      ),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "SERVER_NOT_FOUND");
        return true;
      },
    );

    assert.deepEqual(calls, ["find"]);
    assert.equal(updates.length, 0);
    assert.equal(audited.length, 0);
  });

  it("writes the forced columns and audits the before/after pair", async () => {
    const { audited, calls, dependencies, updates } = buildUpdateDependencies(
      buildServerSource({ isPublic: false }),
    );

    const result = await updateAdminServer(
      "admin-1",
      "server-1",
      AdminUpdateServerSchema.parse({ type: "COMMUNITY", verified: true }),
      null,
      dependencies as never,
    );

    assert.deepEqual(result, { success: true });
    assert.deepEqual(calls, ["find", "update", "audit"]);
    assert.equal(updates[0]?.isPublic, true);
    assert.deepEqual(updates[0]?.features, ["VERIFIED"]);

    assert.equal(audited[0]?.action, "server.update");
    assert.equal(audited[0]?.adminUserId, "admin-1");
    assert.equal(audited[0]?.targetId, "server-1");
    assert.equal(audited[0]?.targetType, "Server");
    assert.deepEqual(audited[0]?.metadata, {
      after: {
        discoverable: false,
        featured: false,
        isPublic: true,
        type: "COMMUNITY",
        verificationLevel: "NONE",
        verified: true,
      },
      before: {
        discoverable: false,
        featured: false,
        isPublic: false,
        type: "PERSONAL",
        verificationLevel: "NONE",
        verified: false,
      },
      name: "Whispr Topluluk",
    });
  });

  it("rolls back the server mutation when the audit write fails inside the shared transaction", async () => {
    // Deliberately its own double rather than `buildUpdateDependencies`: this
    // one mirrors what a real `prisma.$transaction` does -- writes made
    // through `tx` land in a staging area, and only reach `committedUpdates`
    // once the whole `run` callback resolves. A throw anywhere inside,
    // including from the audit write, discards the stage instead of
    // promoting it, exactly like a ROLLBACK (Finding 8,
    // 06-kesif-imleci-ve-audit.md).
    const committedUpdates: AdminServerUpdateData[] = [];
    const dependencies = {
      findServer: async (_serverId: string) => buildServerSource({ isPublic: false }),
      withTransaction: async (run: (tx: AdminServerUpdateTransaction) => Promise<void>) => {
        const staged: AdminServerUpdateData[] = [];

        await run({
          updateServer: async (_serverId: string, data: AdminServerUpdateData) => {
            staged.push(data);
          },
          writeAuditLog: async (_args: AdminAuditLogInput) => {
            throw new Error("audit log write failed");
          },
        });

        committedUpdates.push(...staged);
      },
    };

    await assert.rejects(
      updateAdminServer(
        "admin-1",
        "server-1",
        AdminUpdateServerSchema.parse({ type: "COMMUNITY" }),
        null,
        dependencies as never,
      ),
      /audit log write failed/,
    );

    assert.equal(committedUpdates.length, 0);
  });
});

describe("recountAdminServerMembers", () => {
  function buildRecountDependencies(server: { memberCount: number; name: string } | null) {
    const audited: AdminAuditLogInput[] = [];
    const calls: string[] = [];

    return {
      audited,
      calls,
      dependencies: {
        findServer: async (_serverId: string) => {
          calls.push("find");
          return server;
        },
        withTransaction: async (run: (tx: AdminServerRecountTransaction) => Promise<void>) => {
          await run({
            recomputeMemberCount: async (_serverId: string) => {
              calls.push("recount");
              return 7;
            },
            writeAuditLog: async (args: AdminAuditLogInput) => {
              calls.push("audit");
              audited.push(args);
            },
          });
        },
      },
    };
  }

  it("rejects an unknown server before recomputing anything", async () => {
    const { calls, dependencies } = buildRecountDependencies(null);

    await assert.rejects(
      recountAdminServerMembers("admin-1", "server-404", null, dependencies as never),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        return true;
      },
    );

    assert.deepEqual(calls, ["find"]);
  });

  it("returns the drift it repaired and audits it", async () => {
    const { audited, calls, dependencies } = buildRecountDependencies({
      memberCount: 3,
      name: "Whispr Topluluk",
    });

    const result = await recountAdminServerMembers(
      "admin-1",
      "server-1",
      null,
      dependencies as never,
    );

    assert.deepEqual(result, { after: 7, before: 3, success: true });
    assert.deepEqual(calls, ["find", "recount", "audit"]);
    assert.equal(audited[0]?.action, "server.recount");
    assert.deepEqual(audited[0]?.metadata, { after: 7, before: 3, name: "Whispr Topluluk" });
  });

  it("rolls back the member-count recompute when the audit write fails inside the shared transaction", async () => {
    const committedRecounts: number[] = [];
    const dependencies = {
      findServer: async (_serverId: string) => ({ memberCount: 3, name: "Whispr Topluluk" }),
      withTransaction: async (run: (tx: AdminServerRecountTransaction) => Promise<void>) => {
        const staged: number[] = [];

        await run({
          recomputeMemberCount: async (_serverId: string) => {
            staged.push(7);
            return 7;
          },
          writeAuditLog: async (_args: AdminAuditLogInput) => {
            throw new Error("audit log write failed");
          },
        });

        committedRecounts.push(...staged);
      },
    };

    await assert.rejects(
      recountAdminServerMembers("admin-1", "server-1", null, dependencies as never),
      /audit log write failed/,
    );

    assert.equal(committedRecounts.length, 0);
  });
});

describe("deleteAdminServer", () => {
  it("rejects when the server does not exist, deleting nothing and writing no audit entry", async () => {
    const { audited, calls, deleted, dependencies } = buildDeleteDependencies(null);

    await assert.rejects(
      deleteAdminServer("admin-1", "server-404", null, dependencies as never),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "SERVER_NOT_FOUND");
        return true;
      },
    );

    assert.deepEqual(calls, ["find"]);
    assert.equal(deleted.length, 0);
    assert.equal(audited.length, 0);
  });

  it("deletes the server and writes an audit entry with the pre-delete name/type", async () => {
    const { audited, dependencies } = buildDeleteDependencies({
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    const result = await deleteAdminServer("admin-1", "server-1", null, dependencies as never);

    assert.deepEqual(result, { success: true });
    assert.equal(audited.length, 1);
    assert.equal(audited[0]?.action, "server.delete");
    assert.equal(audited[0]?.adminUserId, "admin-1");
    assert.equal(audited[0]?.targetId, "server-1");
    assert.equal(audited[0]?.targetType, "Server");
    assert.deepEqual(audited[0]?.metadata, { name: "Whispr Topluluk", type: "COMMUNITY" });
  });

  it("deletes the server before writing the audit entry", async () => {
    const { calls, dependencies } = buildDeleteDependencies({ name: "Kişisel", type: "PERSONAL" });

    await deleteAdminServer("admin-1", "server-1", null, dependencies as never);

    assert.deepEqual(calls, ["find", "delete", "audit"]);
  });

  it("rolls back the server deletion when the audit write fails inside the shared transaction", async () => {
    const committedDeletes: string[] = [];
    const dependencies = {
      findServer: async (_serverId: string) => ({
        name: "Whispr Topluluk",
        type: "PERSONAL" as const,
      }),
      withTransaction: async (run: (tx: AdminServerDeleteTransaction) => Promise<void>) => {
        const staged: string[] = [];

        await run({
          deleteServer: async (serverId: string) => {
            staged.push(serverId);
          },
          writeAuditLog: async (_args: AdminAuditLogInput) => {
            throw new Error("audit log write failed");
          },
        });

        committedDeletes.push(...staged);
      },
    };

    await assert.rejects(
      deleteAdminServer("admin-1", "server-1", null, dependencies as never),
      /audit log write failed/,
    );

    assert.equal(committedDeletes.length, 0);
  });
});
