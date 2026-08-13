import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearMobileAccountExportState,
  readMobileAccountExportState,
  writeMobileAccountExportState,
} from "../src/account/mobile-account-export-state";

describe("mobile account export state", () => {
  it("turns an unfinished prior-account download into an interrupted retry state", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => void values.set(key, value),
    };

    await writeMobileAccountExportState(storage, "user-1", {
      startedAt: "2026-08-13T12:00:00.000Z",
      status: "downloading",
    });

    assert.deepEqual(await readMobileAccountExportState(storage, "user-1"), {
      startedAt: "2026-08-13T12:00:00.000Z",
      status: "interrupted",
    });
    assert.equal(await readMobileAccountExportState(storage, "other-user"), null);
  });

  it("removes only the deleted account's lifecycle marker", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      removeItem: async (key: string) => void values.delete(key),
      setItem: async (key: string, value: string) => void values.set(key, value),
    };
    await writeMobileAccountExportState(storage, "user-1", {
      fileUri: "file:///cache/export.json",
      startedAt: "2026-08-13T12:00:00.000Z",
      status: "ready",
    });
    await writeMobileAccountExportState(storage, "user-2", {
      startedAt: "2026-08-13T12:00:00.000Z",
      status: "error",
    });

    await clearMobileAccountExportState(storage, "user-1");

    assert.equal(await readMobileAccountExportState(storage, "user-1"), null);
    assert.equal((await readMobileAccountExportState(storage, "user-2"))?.status, "error");
  });
});
