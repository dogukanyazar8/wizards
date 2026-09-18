import assert from "node:assert/strict";
import { test } from "node:test";
import { changeFromCommit, verifyRemotePackage } from "./publish-release.mjs";
import { createHash } from "node:crypto";

test("release notes include user-facing changes and exclude internal/security work", () => {
  assert.deepEqual(changeFromCommit("fix(voice): Restore microphone"), {
    type: "FIXED",
    title: "Restore microphone",
  });
  assert.deepEqual(changeFromCommit("feat: Voice mini"), { type: "NEW", title: "Voice mini" });
  assert.equal(changeFromCommit("chore: rotate signing secrets"), null);
  assert.equal(changeFromCommit("fix: private issue", ["security"]), null);
  assert.equal(changeFromCommit("fix: internal cleanup", ["release-note:skip"]), null);
});

test("public package verification streams exact bytes and forbids redirects", async () => {
  const bytes = new TextEncoder().encode("binary");
  const item = {
    url: "https://updates.whispr.team/desktop/uat/releases/v1/a.exe",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  let options;
  await verifyRemotePackage(item, async (_url, init) => {
    options = init;
    return new Response(bytes);
  });
  assert.equal(options.redirect, "error");
  await assert.rejects(
    () => verifyRemotePackage({ ...item, sha256: "0".repeat(64) }, async () => new Response(bytes)),
    /digest/u,
  );
  await assert.rejects(
    () => verifyRemotePackage({ ...item, sizeBytes: 1 }, async () => new Response(bytes)),
    /size/u,
  );
  await assert.rejects(
    () =>
      verifyRemotePackage({ ...item, url: "https://evil.test/a.exe" }, async () => {
        throw new Error("must not fetch");
      }),
    /origin/u,
  );
});
