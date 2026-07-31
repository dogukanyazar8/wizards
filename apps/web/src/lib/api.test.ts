import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { z } from "zod";

import { ApiError, jsonError, parseJsonBody } from "./api";
import { clearErrorReporter, registerErrorReporter } from "./observability/reporter";

const TestSchema = z.object({
  name: z.string(),
});

const CustomRequiredMessageSchema = z.object({
  name: z.string({ error: "validation.name.required" }),
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
    clearErrorReporter();
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

  it("preserves an explicit safe Zod validation message", async () => {
    const parseResult = CustomRequiredMessageSchema.safeParse({});
    assert.equal(parseResult.success, false);

    const response = jsonError(parseResult.error);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "validation.name.required",
    });
  });

  it("preserves legacy public messages for Zod default validation errors", async () => {
    const arrayResult = z.array(z.string()).safeParse("not-an-array");
    const minimumResult = z.string().min(1).safeParse("");
    const uuidResult = z.string().uuid().safeParse("not-a-uuid");
    assert.equal(arrayResult.success, false);
    assert.equal(minimumResult.success, false);
    assert.equal(uuidResult.success, false);

    const arrayResponse = jsonError(arrayResult.error);
    const minimumResponse = jsonError(minimumResult.error);
    const uuidResponse = jsonError(uuidResult.error);

    assert.deepEqual(await arrayResponse.json(), {
      error: "Expected array, received string",
    });
    assert.deepEqual(await minimumResponse.json(), {
      error: "String must contain at least 1 character(s)",
    });
    assert.deepEqual(await uuidResponse.json(), {
      error: "Invalid uuid",
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

  /**
   * A 500 the reader reported is otherwise impossible to find among the edge's
   * records: the correlation id has to reach both the response and the log line.
   */
  it("carries the caller's correlation id onto the failure and its log line", async () => {
    const lines: string[] = [];
    mock.method(console, "error", (line: string) => lines.push(line));

    const response = jsonError(new Error("boom"), "abcdef0123456789abcdef0123456789");

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-request-id"), "abcdef0123456789abcdef0123456789");
    assert.equal(
      (JSON.parse(lines[0] ?? "{}") as { requestId?: string }).requestId,
      "abcdef0123456789abcdef0123456789",
    );
  });

  it("passes only a safe diagnostic error to the observability reporter", async () => {
    mock.method(console, "error", () => undefined);
    const reports: unknown[] = [];
    registerErrorReporter((_scope, error) => reports.push(error));
    const original = new Error(
      "account lookup failed email=ada@example.com userId=user-123 query=private-search",
    );

    const response = jsonError(original);

    assert.equal(response.status, 500);
    assert.equal(reports.length, 1);
    assert.notEqual(reports[0], original);
    assert.ok(reports[0] instanceof Error);
    const diagnostic = `${(reports[0] as Error).message}\n${(reports[0] as Error).stack}`;
    assert.ok(!diagnostic.includes("ada@example.com"));
    assert.ok(!diagnostic.includes("user-123"));
    assert.ok(!diagnostic.includes("private-search"));
    assert.match(diagnostic, /\[redacted-(email|value)\]/);
  });
});
