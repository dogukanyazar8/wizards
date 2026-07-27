import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveUploadCallbackUrl } from "./upload-callback-url";

describe("resolveUploadCallbackUrl", () => {
  /**
   * UploadThing derives this URL from the incoming request when it is not told
   * one. Behind a TLS-terminating proxy that derivation can come out as http://,
   * and this app answers http:// with a 301 — a redirect the ingest does not
   * follow. onUploadComplete then never runs, and a client that waits for server
   * data waits forever: an upload that reaches 100% and never answers.
   */
  it("pins the callback to the app's own public origin", () => {
    assert.equal(
      resolveUploadCallbackUrl({ APP_URL: "https://app.example.test" }),
      "https://app.example.test/api/uploadthing",
    );
    assert.equal(
      resolveUploadCallbackUrl({ APP_URL: "https://app.example.test/" }),
      "https://app.example.test/api/uploadthing",
    );
    // A path on the configured origin is not part of the API route.
    assert.equal(
      resolveUploadCallbackUrl({ APP_URL: "https://app.example.test/app" }),
      "https://app.example.test/api/uploadthing",
    );
  });

  it("falls back through the URLs this app already requires", () => {
    assert.equal(
      resolveUploadCallbackUrl({ AUTH_URL: "https://auth.example.test" }),
      "https://auth.example.test/api/uploadthing",
    );
    assert.equal(
      resolveUploadCallbackUrl({ NEXTAUTH_URL: "https://next.example.test" }),
      "https://next.example.test/api/uploadthing",
    );
    assert.equal(
      resolveUploadCallbackUrl({
        APP_URL: "https://app.example.test",
        NEXTAUTH_URL: "https://next.example.test",
      }),
      "https://app.example.test/api/uploadthing",
    );
  });

  // Nothing configured is the SDK's own default, which is the current behaviour.
  it("returns null rather than guessing an origin", () => {
    assert.equal(resolveUploadCallbackUrl({}), null);
    assert.equal(resolveUploadCallbackUrl({ APP_URL: "   " }), null);
    assert.equal(resolveUploadCallbackUrl({ APP_URL: "not a url" }), null);
    assert.equal(resolveUploadCallbackUrl({ APP_URL: "ftp://app.example.test" }), null);
  });
});
