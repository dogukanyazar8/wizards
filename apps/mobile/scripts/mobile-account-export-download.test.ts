import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { downloadMobileAccountExport } from "../src/account/mobile-account-export-download";
import type { MobileApiClient } from "../src/api/mobile-api-client";

describe("mobile account export download", () => {
  it("hands the authenticated native descriptor to the filesystem without fetching in JS", async () => {
    const client: MobileApiClient = {
      createDownloadRequest: async () => ({
        headers: { Authorization: "Bearer access-token", "X-Whispr-Client": "mobile" },
        url: "https://api.example.test/api/v1/users/me/data-export",
      }),
      requestJson: async () => {
        throw new Error("requestJson must not buffer the export");
      },
    };
    let received:
      | (Parameters<typeof downloadMobileAccountExport>[1] extends (
          input: infer T,
        ) => Promise<string>
          ? T
          : never)
      | undefined;

    const uri = await downloadMobileAccountExport(
      client,
      async (input) => {
        received = input;
        return "file:///cache/whispr-data-export-2026-08-13.json";
      },
      new Date("2026-08-13T12:00:00.000Z"),
    );

    assert.equal(uri, "file:///cache/whispr-data-export-2026-08-13.json");
    assert.ok(received);
    assert.deepEqual(received, {
      filename: "whispr-data-export-2026-08-13.json",
      headers: { Authorization: "Bearer access-token", "X-Whispr-Client": "mobile" },
      url: "https://api.example.test/api/v1/users/me/data-export",
    });
  });
});
