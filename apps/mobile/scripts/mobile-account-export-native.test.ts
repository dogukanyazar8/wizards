import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { downloadMobileAccountExportFile } from "../src/account/mobile-account-export-download.native";
import { MobileApiError, type MobileApiClient } from "../src/api/mobile-api-client";
import { MobileOfflineError } from "../src/network/mobile-network-contract";

describe("native mobile account export", () => {
  it("fails offline before resolving credentials or starting native I/O", async () => {
    let descriptorCalls = 0;
    const client: MobileApiClient = {
      createDownloadRequest: async () => {
        descriptorCalls += 1;
        throw new Error("must stay offline");
      },
      requestJson: async () => undefined as never,
    };

    await assert.rejects(
      downloadMobileAccountExportFile(client, new Date(), {
        downloadFile: async () => "file:///never",
        getNetworkStatus: () => "offline",
      }),
      MobileOfflineError,
    );
    assert.equal(descriptorCalls, 0);
  });

  it("aborts and maps a native transfer that exceeds its bounded deadline", async () => {
    const client: MobileApiClient = {
      createDownloadRequest: async () => ({ headers: {}, url: "https://api.test/export" }),
      requestJson: async () => undefined as never,
    };

    await assert.rejects(
      downloadMobileAccountExportFile(client, new Date(), {
        downloadFile: async (_input, signal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
          ),
        getNetworkStatus: () => "online",
        timeoutMs: 5,
      }),
      (error) => error instanceof MobileApiError && error.code === "download_timeout",
    );
  });
});
