import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const tauriDirectory = path.resolve(scriptDirectory, "../src-tauri");

describe("desktop Cargo security baseline", () => {
  it("keeps Sentry on the patched Rustls/WebPKI dependency line", async () => {
    const [manifest, lockfile] = await Promise.all([
      readFile(path.join(tauriDirectory, "Cargo.toml"), "utf8"),
      readFile(path.join(tauriDirectory, "Cargo.lock"), "utf8"),
    ]);

    assert.match(
      manifest,
      /^sentry\s*=\s*\{\s*version\s*=\s*"0\.48"/m,
      "Sentry must remain on the maintained 0.48 release line",
    );
    assert.doesNotMatch(
      lockfile,
      /name = "rustls-webpki"\r?\nversion = "0\.102\.8"/,
      "Cargo.lock must not reintroduce the RustSec-vulnerable rustls-webpki 0.102.8 package",
    );
  });
});
