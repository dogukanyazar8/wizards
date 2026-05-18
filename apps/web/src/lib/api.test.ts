import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { ApiError, parseJsonBody } from "./api";

const TestSchema = z.object({
  name: z.string(),
});

function jsonRequest(headers: HeadersInit = {}) {
  return new Request("https://whispr.team/api/v1/test", {
    body: JSON.stringify({ name: "Whispr" }),
    headers,
    method: "POST",
  });
}

describe("parseJsonBody", () => {
  it("accepts application/json bodies with parameters", async () => {
    const body = await parseJsonBody(
      jsonRequest({ "Content-Type": "application/json; charset=utf-8" }),
      TestSchema,
    );

    assert.deepEqual(body, { name: "Whispr" });
  });

  it("rejects browser-formable text/plain JSON bodies", async () => {
    await assert.rejects(
      () => parseJsonBody(jsonRequest({ "Content-Type": "text/plain" }), TestSchema),
      (error) =>
        error instanceof ApiError &&
        error.status === 415 &&
        error.code === "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("rejects request bodies with a missing content type", async () => {
    await assert.rejects(
      () => parseJsonBody(jsonRequest(), TestSchema),
      (error) =>
        error instanceof ApiError &&
        error.status === 415 &&
        error.code === "UNSUPPORTED_MEDIA_TYPE",
    );
  });
});
