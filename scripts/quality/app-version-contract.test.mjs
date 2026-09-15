import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const manifest = (path) => JSON.parse(read(path));
const version = manifest("package.json").version;

test("Whispr platform manifests and the native desktop package share one version", () => {
  for (const path of [
    "apps/web/package.json",
    "apps/mobile/package.json",
    "apps/desktop/package.json",
    "apps/desktop/src-tauri/tauri.conf.json",
  ]) {
    assert.equal(manifest(path).version, version, path);
  }

  for (const path of ["apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Cargo.lock"]) {
    const nativeVersion = /name = "whispr-desktop"\r?\nversion = "([^"]+)"/.exec(read(path))?.[1];
    assert.equal(nativeVersion, version, path);
  }
});

test("web fallback version and web/mobile release names stay aligned", () => {
  const web = read("apps/web/src/lib/app-version.ts");
  const fallbackVersion = /WHISPR_VERSION_NUMBER = [^;]+\?\? "([^"]+)"/.exec(web)?.[1];
  const codename = /WHISPR_RELEASE_CODENAME\s*=\s*[^;]+\?\? "([^"]+)"/.exec(web)?.[1];
  const mobileCodename = /MOBILE_RELEASE_CODENAME = "([^"]+)"/.exec(
    read("apps/mobile/src/about/mobile-app-identity.ts"),
  )?.[1];
  const buildCodename = /const whisprReleaseCodename =[\s\S]+?\?\? "([^"]+)"/.exec(
    read("apps/web/next.config.ts"),
  )?.[1];

  assert.equal(fallbackVersion, version);
  assert.ok(codename);
  assert.equal(mobileCodename, codename);
  assert.equal(buildCodename, codename);
});
