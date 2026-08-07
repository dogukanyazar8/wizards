import assert from "node:assert/strict";
import test from "node:test";
import { collectSensitiveEnvironmentValues, redactObject, redactText } from "./redaction.mjs";

test("redaction removes secret assignments, headers, URLs, and inherited values", () => {
  const inherited = "exact-inherited-secret-value";
  const input = [
    "Authorization: Bearer header-token",
    "DATABASE_URL=postgresql://user:db-password@127.0.0.1:5432/wizards_e2e",
    "API_TOKEN=plain-token",
    `message=${inherited}`,
  ].join("\n");

  const output = redactText(input, [inherited]);

  assert.doesNotMatch(output, /header-token|db-password|plain-token|exact-inherited-secret-value/u);
  assert.match(output, /\[REDACTED\]/u);
  assert.match(output, /postgresql:\/\/\[REDACTED\]@127\.0\.0\.1/u);
});

test("redaction removes private keys and bounds output", () => {
  const privateKey = "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----";
  const output = redactText(`${privateKey}\0${"x".repeat(100)}`, [], { maxLength: 48 });

  assert.doesNotMatch(output, /abc123|\0/u);
  assert.match(output, /\[REDACTED PRIVATE KEY\]/u);
  assert.match(output, /\[TRUNCATED\]$/u);
});

test("redaction recursively sanitizes objects without mutating input", () => {
  const input = { token: "secret", nested: ["password=hunter2", { safe: "ok" }] };
  const output = redactObject(input);

  assert.deepEqual(input, { token: "secret", nested: ["password=hunter2", { safe: "ok" }] });
  assert.equal(output.token, "[REDACTED]");
  assert.equal(output.nested[0].includes("hunter2"), false);
  assert.equal(output.nested[1].safe, "ok");
});

test("sensitive environment collection keeps only meaningful secret values", () => {
  const values = collectSensitiveEnvironmentValues({
    API_TOKEN: "long-token-value",
    DATABASE_URL: "postgresql://user:pass@localhost/db",
    PATH: "C:\\bin",
    EMPTY_SECRET: "",
    SHORT_PASSWORD: "abc",
  });

  assert.deepEqual(values, ["postgresql://user:pass@localhost/db", "long-token-value"]);
});
