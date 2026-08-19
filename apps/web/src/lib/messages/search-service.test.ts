import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, prisma } from "@wizards/db";

import { PermissionBits } from "@/lib/workspace/permissions";
import { searchServerMessages } from "./search-service";

type Restore = () => void;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

describe("server message search authorization", () => {
  it("never includes private-channel content after visibility resolution", async () => {
    const restores: Restore[] = [];
    const originalCacheDisabled = process.env.PERMISSION_CACHE_DISABLED;
    process.env.PERMISSION_CACHE_DISABLED = "true";
    let searchValues: unknown[] = [];

    patchMethod(
      prisma.server,
      "findMany",
      async () => [
        {
          authorizationRevision: 7n,
          authorizationSubjectRevisions: [{ revision: 3n, userId: "viewer" }],
          id: "server-1",
        },
      ],
      restores,
    );
    patchMethod(
      prisma.serverMember,
      "findMany",
      async () => [
        {
          id: "member-viewer",
          roles: [],
          server: { ownerId: "owner" },
          serverId: "server-1",
        },
      ],
      restores,
    );
    patchMethod(
      prisma.role,
      "findMany",
      async () => [
        {
          id: "role-everyone",
          isDefault: true,
          name: "@everyone",
          permissions: PermissionBits.VIEW_CHANNEL,
          serverId: "server-1",
        },
      ],
      restores,
    );
    patchMethod(prisma.serverBan, "findMany", async () => [], restores);
    patchMethod(
      prisma.channel,
      "findMany",
      async () => [
        {
          id: "public-channel",
          permissionOverrides: [],
          serverId: "server-1",
          type: ChannelType.TEXT,
        },
        {
          id: "private-channel",
          permissionOverrides: [
            {
              allow: 0n,
              deny: PermissionBits.VIEW_CHANNEL,
              targetId: "viewer",
              targetType: "USER",
            },
          ],
          serverId: "server-1",
          type: ChannelType.TEXT,
        },
      ],
      restores,
    );
    patchMethod(
      prisma,
      "$queryRaw",
      async (query: { values?: unknown[] }) => {
        searchValues = query.values ?? [];
        return [];
      },
      restores,
    );

    try {
      const result = await searchServerMessages({
        query: "secret",
        serverId: "server-1",
        userId: "viewer",
      });

      assert.deepEqual(result, { nextCursor: null, results: [] });
      assert.equal(searchValues.includes("public-channel"), true);
      assert.equal(searchValues.includes("private-channel"), false);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
      if (originalCacheDisabled === undefined) {
        delete process.env.PERMISSION_CACHE_DISABLED;
      } else {
        process.env.PERMISSION_CACHE_DISABLED = originalCacheDisabled;
      }
    }
  });
});
