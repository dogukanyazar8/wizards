import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "./permissions";
import {
  deleteWorkspaceRole,
  listAssignableWorkspaceRoles,
  listMobileWorkspaceRoleOverview,
  updateWorkspaceRole,
} from "./role-service";

type Restore = () => void;
type UnknownRecord = Record<string, unknown>;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as UnknownRecord;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

async function withRoleEnvironment(
  args: { owner?: boolean },
  run: (restores: Restore[]) => Promise<void>,
) {
  const restores: Restore[] = [];
  const userId = args.owner ? "owner" : "manager";

  patchMethod(prisma.serverBan, "findUnique", async () => null, restores);
  patchMethod(
    prisma.serverMember,
    "findFirst",
    async () => ({
      id: `member-${userId}`,
      roles: [
        {
          role: {
            color: 1,
            id: "role-manager",
            isDefault: false,
            name: "Manager",
            permissions: PermissionBits.MANAGE_ROLES,
          },
        },
      ],
      server: {
        id: "server-1",
        name: "Guild",
        ownerId: "owner",
        roles: [],
      },
    }),
    restores,
  );

  try {
    await run(restores);
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
  }
}

const roleRows = [
  {
    color: 1,
    id: "role-default",
    isDefault: true,
    managed: false,
    name: "@everyone",
    permissions: 0n,
    position: 0,
  },
  {
    color: 2,
    id: "role-managed",
    isDefault: false,
    managed: true,
    name: "Integration",
    permissions: 0n,
    position: 1,
  },
  {
    color: 3,
    id: "role-ordinary",
    isDefault: false,
    managed: false,
    name: "Ordinary",
    permissions: PermissionBits.MANAGE_MESSAGES,
    position: 2,
  },
  {
    color: 4,
    id: "role-elevated",
    isDefault: false,
    managed: false,
    name: "Not inferred from this name",
    permissions: PermissionBits.MANAGE_SERVER,
    position: 3,
  },
];

describe("assignable workspace roles", { concurrency: false }, () => {
  it("excludes default, managed, and elevated roles for a non-owner", async () => {
    await withRoleEnvironment({ owner: false }, async (restores) => {
      patchMethod(prisma.role, "findMany", async () => roleRows, restores);

      const result = await listAssignableWorkspaceRoles("manager", "server-1");

      assert.deepEqual(result, [
        {
          color: 3,
          id: "role-ordinary",
          name: "Ordinary",
          position: 2,
        },
      ]);
      assert.deepEqual(Object.keys(result[0] ?? {}).sort(), ["color", "id", "name", "position"]);
      assert.equal("permissions" in (result[0] ?? {}), false);
    });
  });

  it("allows the owner to assign elevated roles while still excluding default and managed roles", async () => {
    await withRoleEnvironment({ owner: true }, async (restores) => {
      patchMethod(prisma.role, "findMany", async () => roleRows, restores);

      const result = await listAssignableWorkspaceRoles("owner", "server-1");

      assert.deepEqual(result, [
        {
          color: 3,
          id: "role-ordinary",
          name: "Ordinary",
          position: 2,
        },
        {
          color: 4,
          id: "role-elevated",
          name: "Not inferred from this name",
          position: 3,
        },
      ]);
    });
  });

  it("uses a stable 101-row sentinel and fails closed before filtering overflow", async () => {
    await withRoleEnvironment({ owner: true }, async (restores) => {
      let capturedQuery: unknown;
      patchMethod(
        prisma.role,
        "findMany",
        async (query?: unknown) => {
          capturedQuery = query;
          return Array.from({ length: 101 }, (_, index) => ({
            color: index,
            id: `role-${index}`,
            isDefault: index !== 100,
            managed: false,
            name: `Role ${index}`,
            permissions: 0n,
            position: index,
          }));
        },
        restores,
      );

      await assert.rejects(
        () => listAssignableWorkspaceRoles("owner", "server-1"),
        (error) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === "MOBILE_RESPONSE_LIMIT_EXCEEDED",
      );
      const query = capturedQuery as { orderBy?: unknown; take?: unknown };
      assert.deepEqual(query.take, 101);
      assert.deepEqual(query.orderBy, [{ position: "desc" }, { createdAt: "asc" }, { id: "asc" }]);
    });
  });

  it("returns every visible role with its real member count for the mobile read-only overview", async () => {
    await withRoleEnvironment({ owner: false }, async (restores) => {
      patchMethod(
        prisma.role,
        "findMany",
        async () => [
          {
            _count: { memberRoles: 4 },
            color: 1,
            id: "role-default",
            isDefault: true,
            managed: false,
            name: "@everyone",
            permissions: 0n,
            position: 0,
          },
          {
            _count: { memberRoles: 2 },
            color: 2,
            id: "role-moderator",
            isDefault: false,
            managed: false,
            name: "Moderator",
            permissions: PermissionBits.MANAGE_MESSAGES,
            position: 2,
          },
        ],
        restores,
      );

      const result = await listMobileWorkspaceRoleOverview("manager", "server-1");

      assert.deepEqual(result, [
        {
          color: 2,
          id: "role-moderator",
          isDefault: false,
          managed: false,
          memberCount: 2,
          name: "Moderator",
          permissionKeys: ["MANAGE_MESSAGES"],
          position: 2,
        },
        {
          color: 1,
          id: "role-default",
          isDefault: true,
          managed: false,
          memberCount: 4,
          name: "@everyone",
          permissionKeys: [],
          position: 0,
        },
      ]);
    });
  });

  it("commits role permission removal and deletion with server revision outbox jobs", async () => {
    await withRoleEnvironment({ owner: true }, async (restores) => {
      const operations: string[] = [];
      const originalCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
      process.env.PERMISSION_CACHE_DISABLED = "true";
      restores.push(() => {
        if (originalCacheDisabled === undefined) delete process.env.PERMISSION_CACHE_DISABLED;
        else process.env.PERMISSION_CACHE_DISABLED = originalCacheDisabled;
      });
      patchMethod(
        prisma.role,
        "findFirst",
        async () => ({
          color: 0,
          id: "role-mod",
          isDefault: false,
          managed: false,
          mentionable: false,
          name: "Moderator",
          permissions: PermissionBits.MANAGE_MESSAGES,
          position: 1,
        }),
        restores,
      );
      patchMethod(
        prisma,
        "$transaction",
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            outboxJob: {
              upsert: async () => {
                operations.push("outbox.upsert");
                return {};
              },
            },
            role: {
              delete: async () => {
                operations.push("role.delete");
                return {};
              },
              update: async (args: { data: { permissions?: bigint } }) => {
                operations.push(`role.update:${args.data.permissions?.toString()}`);
                return {
                  color: 0,
                  id: "role-mod",
                  isDefault: false,
                  managed: false,
                  mentionable: false,
                  name: "Moderator",
                  permissions: args.data.permissions ?? 0n,
                  position: 1,
                };
              },
            },
            server: {
              update: async () => {
                operations.push("revision.increment");
                return { authorizationRevision: 1n };
              },
            },
          };
          const result = await callback(tx);
          operations.push("transaction.commit");
          return result;
        },
        restores,
      );

      await updateWorkspaceRole("owner", "server-1", "role-mod", { permissions: [] });
      await deleteWorkspaceRole("owner", "server-1", "role-mod");

      assert.equal(operations.includes("role.update:0"), true);
      assert.equal(operations.includes("role.delete"), true);
      assert.equal(operations.filter((value) => value === "revision.increment").length, 2);
      assert.equal(operations.filter((value) => value === "outbox.upsert").length, 2);
      assert.ok(operations.indexOf("outbox.upsert") < operations.indexOf("transaction.commit"));
    });
  });
});
