import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

  it("keeps the affected GLib iterator unavailable to Whispr application code", async () => {
    const [manifest, sourceFiles] = await Promise.all([
      readFile(path.join(tauriDirectory, "Cargo.toml"), "utf8"),
      listRustSources(),
    ]);
    const sources = await Promise.all(sourceFiles.map((sourceFile) => readFile(sourceFile, "utf8")));

    assert.doesNotMatch(
      manifest,
      /(?:^\s*(?:glib(?:-sys)?|gtk)\s*=|package\s*=\s*"(?:glib(?:-sys)?|gtk)")/m,
      "Whispr must not make the GTK3/GLib chain a direct dependency",
    );
    assert.doesNotMatch(
      sources.join("\n"),
      /\bVariantStrIter\b/,
      "Whispr must not call the RustSec-affected GLib iterator API",
    );
  });
});

async function listRustSources() {
  const sourceDirectory = path.join(tauriDirectory, "src");
  const entries = await readdir(sourceDirectory, { recursive: true });
  const nestedSources = entries
    .filter((entry) => entry.endsWith(".rs"))
    .map((entry) => path.join(sourceDirectory, entry));

  return [path.join(tauriDirectory, "build.rs"), ...nestedSources];
}
