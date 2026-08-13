import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deleteOwnAccount,
  fetchAccountDeletionPreflight,
  openAccountDataSettingsInExternalBrowser,
  reauthenticateAccountDeletion,
} from "./privacy-client";

describe("account privacy client", () => {
  it("parses deletion preflight and sends purpose-bound reauth", async () => {
    const requests: Array<{ body: string | null; path: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ body: init?.body?.toString() ?? null, path: input.toString() });
      if (input.toString().endsWith("/deletion")) {
        return Response.json({
          canDelete: true,
          confirmationPhrase: "DELETE MY ACCOUNT",
          emailVerified: true,
          ownedServers: [],
          reauthMethod: "PASSWORD",
        });
      }
      return Response.json({
        expiresAt: "2026-08-13T12:05:00.000Z",
        reauthToken: "reauth-token",
        success: true,
      });
    };

    assert.equal((await fetchAccountDeletionPreflight(fetchImpl)).canDelete, true);
    assert.equal(await reauthenticateAccountDeletion("secret", fetchImpl), "reauth-token");
    assert.deepEqual(JSON.parse(requests[1]?.body ?? "{}"), {
      password: "secret",
      purpose: "account-delete",
    });
  });

  it("sends exact confirmation and reauth token once", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured = init;
      return Response.json({ deletedAt: "2026-08-13T12:00:00.000Z", success: true });
    };

    await deleteOwnAccount("reauth-token", fetchImpl);

    assert.equal(new Headers(captured?.headers).get("x-whispr-reauth-token"), "reauth-token");
    assert.deepEqual(JSON.parse(captured?.body?.toString() ?? "{}"), {
      confirmation: "DELETE MY ACCOUNT",
    });
  });

  it("opens a same-origin browser recovery route without carrying a credential", () => {
    let opened: [string, string, string] | undefined;
    openAccountDataSettingsInExternalBrowser("https://whispr.team/channels/@me", (...input) => {
      opened = input;
    });

    assert.deepEqual(opened, [
      "https://whispr.team/settings#account-data",
      "_blank",
      "noopener,noreferrer",
    ]);
  });
});
