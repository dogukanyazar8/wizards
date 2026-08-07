import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  HttpError,
  assertExactKeys,
  assertLoopbackHost,
  assertMutationRequest,
  readJsonBody,
  securityHeaders,
} from "./http-security.mjs";

test("loopback Host validation rejects suffixes, userinfo, and remote hosts", () => {
  for (const host of ["127.0.0.1:47832", "localhost:47832", "[::1]:47832"]) {
    assert.doesNotThrow(() => assertLoopbackHost(host));
  }
  for (const host of ["127.0.0.1.evil.test", "user@127.0.0.1", "192.168.1.5", "", undefined]) {
    assert.throws(() => assertLoopbackHost(host), HttpError);
  }
});

test("mutation validation requires exact origin, JSON, and process token", () => {
  const request = {
    headers: {
      origin: "http://127.0.0.1:47832",
      "content-type": "application/json; charset=utf-8",
      "x-whispr-quality-token": "token-value",
    },
  };
  assert.doesNotThrow(() =>
    assertMutationRequest(request, {
      expectedOrigin: "http://127.0.0.1:47832",
      token: "token-value",
    }),
  );
  assert.throws(
    () =>
      assertMutationRequest(
        { ...request, headers: { ...request.headers, origin: "https://evil.test" } },
        { expectedOrigin: "http://127.0.0.1:47832", token: "token-value" },
      ),
    HttpError,
  );
  assert.throws(
    () =>
      assertMutationRequest(
        { ...request, headers: { ...request.headers, "x-whispr-quality-token": "wrong" } },
        { expectedOrigin: "http://127.0.0.1:47832", token: "token-value" },
      ),
    HttpError,
  );
});

test("JSON reader rejects oversized and malformed request bodies", async () => {
  const valid = Readable.from([Buffer.from('{"kind":"profile"}')]);
  assert.deepEqual(await readJsonBody(valid, { maxBytes: 64 }), { kind: "profile" });

  const oversized = Readable.from([Buffer.alloc(65, "x")]);
  await assert.rejects(() => readJsonBody(oversized, { maxBytes: 64 }), HttpError);

  const malformed = Readable.from([Buffer.from("{")]);
  await assert.rejects(() => readJsonBody(malformed, { maxBytes: 64 }), HttpError);
});

test("exact-key and response-header guards fail closed", () => {
  assert.doesNotThrow(() => assertExactKeys({ kind: "profile", id: "Fast" }, ["kind", "id"]));
  assert.throws(
    () => assertExactKeys({ kind: "profile", id: "Fast", command: "whoami" }, ["kind", "id"]),
    HttpError,
  );
  assert.equal(securityHeaders["Access-Control-Allow-Origin"], undefined);
  assert.match(securityHeaders["Content-Security-Policy"], /default-src 'self'/u);
  assert.equal(securityHeaders["X-Content-Type-Options"], "nosniff");
});
