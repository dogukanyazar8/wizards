import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAccountDataExportResponse } from "./response";

describe("account data export response", () => {
  it("uses private no-store attachment headers without exposing a user id", () => {
    const response = createAccountDataExportResponse(
      new ReadableStream({ start: (controller) => controller.close() }),
      new Date("2026-08-13T12:00:00.000Z"),
    );

    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(
      response.headers.get("Content-Disposition"),
      'attachment; filename="whispr-data-export-2026-08-13.json"',
    );
    assert.equal(response.headers.get("Content-Disposition")?.includes("user-1"), false);
  });
});
