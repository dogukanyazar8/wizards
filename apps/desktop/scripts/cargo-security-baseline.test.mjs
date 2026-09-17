import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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
      /^sentry\s*=\s*\{\s*version\s*=\s*"0\.49"/m,
      "Sentry must remain on the maintained 0.49 release line",
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
    const sources = await Promise.all(
      sourceFiles.map((sourceFile) => readFile(sourceFile, "utf8")),
    );
    const productionDependencies = manifest
      .split(/(?=^\[)/m)
      .filter((section) => /^\[(?:dependencies|target\.[^\n]+\.dependencies)\]/.test(section))
      .join("\n");

    assert.doesNotMatch(
      productionDependencies,
      /(?:^\s*(?:glib(?:-sys)?|gtk)\s*=|package\s*=\s*"(?:glib(?:-sys)?|gtk)")/m,
      "Whispr must not make the GTK3/GLib chain a direct dependency",
    );
    assert.doesNotMatch(
      sources.join("\n"),
      /\bVariantStrIter\b/,
      "Whispr must not call the RustSec-affected GLib iterator API",
    );
  });

  it("resolves the GLib backport and enables Tauri's macOS private API feature", async () => {
    const { stdout } = await execFileAsync(
      "cargo",
      ["metadata", "--locked", "--format-version", "1"],
      { cwd: tauriDirectory, maxBuffer: 8 * 1024 * 1024 },
    );
    const metadata = JSON.parse(stdout);
    const tauriPackage = metadata.packages.find((entry) => entry.name === "tauri");
    const tauriNode = metadata.resolve.nodes.find((entry) => entry.id === tauriPackage?.id);
    const glibPackages = metadata.packages.filter((entry) => entry.name === "glib");

    assert.equal(glibPackages.length, 1, "Every GTK3 consumer must resolve the same GLib backport");
    assert.equal(glibPackages[0].source, null, "GLib must resolve the reviewed local source");
    assert.equal(
      path.resolve(glibPackages[0].manifest_path),
      path.join(tauriDirectory, "vendor/glib/Cargo.toml"),
    );

    assert.ok(
      tauriNode?.features.includes("macos-private-api"),
      "Tauri must enable macos-private-api while companion windows use transparent(true)",
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
