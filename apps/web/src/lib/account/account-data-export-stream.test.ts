import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_DATA_EXPORT_PAGE_SIZE,
  createAccountDataExportStream,
  type AccountDataExportStreamSource,
} from "./account-data-export-stream";

function source(): AccountDataExportStreamSource {
  const messages = Array.from({ length: ACCOUNT_DATA_EXPORT_PAGE_SIZE + 1 }, (_, index) => ({
    content: `message-${index}`,
    id: `message-${String(index).padStart(4, "0")}`,
  }));

  return {
    loadHeader: async () => ({
      notificationSettings: null,
      settings: null,
      user: { id: "user-1", uploadedBytes: 12n },
    }),
    sections: [
      {
        close: "}",
        loadPage: async (cursor, take) => {
          assert.ok(take <= ACCOUNT_DATA_EXPORT_PAGE_SIZE);
          const start = cursor ? messages.findIndex((message) => message.id === cursor) + 1 : 0;
          return messages.slice(start, start + take);
        },
        open: '"content":{"authoredMessages":',
      },
    ],
  };
}

describe("account data export stream", () => {
  it("does not load cursor pages until the consumer pulls the stream", async () => {
    let pageCalls = 0;
    const stream = await createAccountDataExportStream("user-1", {
      exportedAt: new Date("2026-08-13T12:00:00.000Z"),
      source: {
        loadHeader: async () => ({
          notificationSettings: null,
          settings: null,
          user: { id: "user-1" },
        }),
        sections: [
          {
            close: "",
            open: ',"rows":',
            loadPage: async () => {
              pageCalls += 1;
              return [];
            },
          },
        ],
      },
    });

    assert.equal(pageCalls, 0);
    const reader = stream.getReader();
    await reader.read();
    assert.equal(pageCalls, 0);
    await reader.read();
    assert.equal(pageCalls, 0);
    await reader.read();
    assert.equal(pageCalls, 0);
    await reader.read();
    assert.equal(pageCalls, 1);
    await reader.cancel();
  });

  it("writes valid JSON from bounded cursor pages and stringifies bigint", async () => {
    const stream = await createAccountDataExportStream("user-1", {
      exportedAt: new Date("2026-08-13T12:00:00.000Z"),
      source: source(),
    });
    const payload = await new Response(stream).json();

    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.exportedAt, "2026-08-13T12:00:00.000Z");
    assert.equal(payload.user.uploadedBytes, "12");
    assert.equal(payload.content.authoredMessages.length, ACCOUNT_DATA_EXPORT_PAGE_SIZE + 1);
    assert.equal(
      payload.content.authoredMessages.at(-1).content,
      `message-${ACCOUNT_DATA_EXPORT_PAGE_SIZE}`,
    );
  });

  it("fails before returning a body when the authenticated user no longer exists", async () => {
    await assert.rejects(
      createAccountDataExportStream("missing", {
        source: {
          loadHeader: async () => null,
          sections: [],
        },
      }),
      (error: { code?: string }) => error.code === "USER_NOT_FOUND",
    );
  });
});
