import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { MOBILE_CLIENT_HEADERS, MOBILE_CLIENT_VERSION } from "../src/api/mobile-client-headers";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("mobile client attribution headers", () => {
  it("declares the platform and a version the server will accept", () => {
    assert.deepEqual(MOBILE_CLIENT_HEADERS, {
      "x-whispr-client": "mobile",
      "x-whispr-capabilities": "badge-notifications-v1,profile-details-v2",
      "x-whispr-client-version": MOBILE_CLIENT_VERSION,
    });

    // Server-side whitelist: ^[0-9A-Za-z.\-+]{1,32}$ — anything else is dropped.
    assert.match(MOBILE_CLIENT_VERSION, /^[0-9A-Za-z.\-+]{1,32}$/u);
  });

  it("stays in step with the shipped app version", () => {
    const packageJson = JSON.parse(read("package.json")) as { version: string };

    assert.equal(MOBILE_CLIENT_VERSION, packageJson.version);
  });

  it("sends the headers on REST requests", () => {
    const source = read("src/api/mobile-api-client.ts");

    assert.match(source, /MOBILE_CLIENT_HEADERS/u);
    assert.match(source, /headers\.set\(name, value\)/u);
  });

  it("sends the headers on the socket handshake, where the session is opened", () => {
    const source = read("src/realtime/mobile-realtime-client.ts");

    assert.match(source, /extraHeaders: \{ \.\.\.MOBILE_CLIENT_HEADERS \}/u);
  });

  it("resolves the version at build time instead of reading package.json at runtime", () => {
    const source = read("src/api/mobile-client-headers.ts");

    assert.doesNotMatch(source, /require\(|import\(/u);
  });
});
