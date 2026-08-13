import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountDeletionPreflightRoute,
  type AccountDeletionPreflightDependencies,
} from "./route-logic";

function dependencies(
  overrides: Partial<AccountDeletionPreflightDependencies> = {},
): AccountDeletionPreflightDependencies {
  return {
    authenticate: async () => "user-1",
    loadUser: async (userId) => ({
      emailVerified: true,
      id: userId,
      ownedServers: [],
      passwordHash: "hash",
    }),
    ...overrides,
  };
}

describe("account deletion preflight route", () => {
  it("derives password reauth and delete eligibility from authenticated user", async () => {
    const seen: string[] = [];
    const response = await accountDeletionPreflightRoute(
      dependencies({
        loadUser: async (userId) => {
          seen.push(userId);
          return {
            emailVerified: true,
            id: userId,
            ownedServers: [],
            passwordHash: "hash",
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["user-1"]);
    assert.deepEqual(await response.json(), {
      canDelete: true,
      confirmationPhrase: "DELETE MY ACCOUNT",
      emailVerified: true,
      ownedServers: [],
      reauthMethod: "PASSWORD",
    });
  });

  it("reports email reauth and owned-server blockers without leaking extra user fields", async () => {
    const response = await accountDeletionPreflightRoute(
      dependencies({
        loadUser: async () => ({
          emailVerified: true,
          id: "user-1",
          ownedServers: [{ id: "server-1", name: "Guild" }],
          passwordHash: null,
        }),
      }),
    );

    assert.deepEqual(await response.json(), {
      canDelete: false,
      confirmationPhrase: "DELETE MY ACCOUNT",
      emailVerified: true,
      ownedServers: [{ id: "server-1", name: "Guild" }],
      reauthMethod: "EMAIL",
    });
  });
});
