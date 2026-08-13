import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shareMobileAccountExport } from "../src/account/mobile-account-export-share";

describe("mobile account export sharing", () => {
  it("shares Android exports as a granted content attachment instead of file URI text", async () => {
    let intent: { action: string; params: unknown } | null = null;

    await shareMobileAccountExport("file:///cache/account.json", {
      getContentUri: async () => "content://whispr/account.json",
      platform: "android",
      shareIos: async () => {
        throw new Error("Android must not use React Native text sharing");
      },
      startAndroidActivity: async (action, params) => {
        intent = { action, params };
      },
    });

    assert.deepEqual(intent, {
      action: "android.intent.action.SEND",
      params: {
        extra: { "android.intent.extra.STREAM": "content://whispr/account.json" },
        flags: 1,
        type: "application/json",
      },
    });
  });
});
