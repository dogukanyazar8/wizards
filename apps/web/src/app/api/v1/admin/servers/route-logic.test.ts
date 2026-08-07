import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AdminCreateServerSchema } from "@wizards/types";

import { createAdminServer, deleteAdminServer } from "@/app/api/v1/admin/servers/route-logic";
import { ApiError } from "@/lib/api";
import type { AdminAuditLogInput } from "@/lib/admin/audit-log";

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
      deleteServer: async (serverId: string) => {
        calls.push("delete");
        deleted.push(serverId);
      },
      findServer: async (_serverId: string) => {
        calls.push("find");
        return server;
      },
      writeAuditLog: async (args: AdminAuditLogInput) => {
        calls.push("audit");
        audited.push(args);
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

  // `createAdminServer` no longer validates its input — the caller (`route.ts`,
  // via `parseJsonBody`) is the only place `AdminCreateServerSchema` runs in
  // production, so the rejection cases below assert the schema directly.
  // Neither test calls `createAdminServer` (there is no valid
  // `AdminCreateServerInput` to construct from rejected data), so there is no
  // "no server was created" side effect left to assert here — both rejections
  // are caught before this function would ever be reached.
  it("rejects a community server that is not publicly joinable", () => {
    const result = AdminCreateServerSchema.safeParse({
      isPublic: false,
      name: "Whispr Topluluk",
      type: "COMMUNITY",
    });

    assert.equal(result.success, false);
  });

  it("never creates a server when validation fails", () => {
    const result = AdminCreateServerSchema.safeParse({ name: "x" });

    assert.equal(result.success, false);
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
});
