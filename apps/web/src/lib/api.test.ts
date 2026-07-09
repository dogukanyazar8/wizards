import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { z } from "zod";

import { ApiError, jsonError, parseJsonBody } from "./api";

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

describe("jsonError", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("serializes ApiError responses with stable status and code fields", async () => {
    const response = jsonError(new ApiError("Forbidden", 403, "FORBIDDEN"));

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "FORBIDDEN",
      error: "Forbidden",
    });
  });

  it("serializes Zod validation errors without leaking schema details", async () => {
    const parseResult = TestSchema.safeParse({});
    assert.equal(parseResult.success, false);

    const response = jsonError(parseResult.error);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Required",
    });
  });

  it("redacts unexpected errors behind the public 500 envelope and logs once", async () => {
    const errorLog = mock.method(console, "error", () => undefined);

    const response = jsonError(new Error("database password leaked"));

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Internal server error",
    });
    assert.equal(errorLog.mock.callCount(), 1);
  });
});
