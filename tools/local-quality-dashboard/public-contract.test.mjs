import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(toolRoot, "public");
const repositoryRoot = resolve(toolRoot, "..", "..");

test("dashboard HTML is semantic, local-only, and free of inline executable content", async () => {
  const html = await readFile(join(publicRoot, "index.html"), "utf8");

  assert.match(html, /<html[^>]+lang="tr"/u);
  assert.match(html, /<header/u);
  assert.match(html, /<main/u);
  assert.match(html, /<dialog[^>]+id="acceptance-dialog"/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /class="profile-impact"/u);
  assert.match(html, /class="profile-preconditions"/u);
  assert.match(html, /class="profile-exit"/u);
  assert.match(html, /src="\/assets\/whispr-logo\.png"/u);
  assert.match(html, /id="issues-panel"/u);
  assert.match(html, /role="tablist"/u);
  assert.match(html, /id="issue-filter-fail"[^>]+aria-selected="true"/u);
  assert.match(html, /id="issue-filter-blocked"[^>]+aria-selected="false"/u);
  assert.match(html, /id="issue-list"[^>]+aria-live="polite"/u);
  assert.match(html, /Güvenli Tümünü Çalıştır/u);
  assert.match(html, /Tam Kabul Testleri/u);
  assert.match(html, /Başarısızları Yeniden Çalıştır/u);
  assert.match(html, /Durdur/u);
  assert.match(html, /href="\/whispr\.css"/u);
  assert.match(html, /href="\/dashboard\.css"/u);
  assert.match(html, /<script src="\/app\.js" defer><\/script>/u);
  assert.doesNotMatch(html, /https?:\/\//iu);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=/iu);
  assert.doesNotMatch(html, /<script(?![^>]+src=)[^>]*>/iu);
});

test("dashboard CSS uses Whispr tokens, visible focus, responsiveness, and reduced motion", async () => {
  const css = await readFile(join(publicRoot, "dashboard.css"), "utf8");

  for (const token of [
    "--surface-base",
    "--surface-card",
    "--foreground",
    "--primary",
    "--success",
    "--warning",
    "--danger",
    "--border",
    "--ring",
  ]) {
    assert.match(css, new RegExp(`var\\(${token}\\)`, "u"));
  }
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(min-width: 48rem\)/u);
  assert.match(css, /@media \(min-width: 75rem\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /font-family:\s*var\(--font-display\)/u);
  assert.match(css, /\.issue-card/u);
  assert.match(css, /\.issue-source/u);
  assert.match(css, /backdrop-filter/u);
  assert.match(css, /position:\s*sticky/u);
});

test("browser controller uses safe DOM rendering and fixed API routes", async () => {
  const script = await readFile(join(publicRoot, "app.js"), "utf8");

  assert.match(script, /new EventSource\(/u);
  assert.match(script, /textContent/u);
  assert.match(script, /\/api\/bootstrap/u);
  assert.match(script, /\/api\/runs/u);
  assert.match(script, /\/api\/acceptance\/confirm/u);
  assert.match(script, /x-whispr-quality-token/u);
  assert.match(script, /evidenceWarnings/u);
  assert.match(script, /Kanıt uyarısı/u);
  assert.match(script, /event\.command/u);
  assert.match(script, /event\.nextAction/u);
  assert.match(script, /renderIssues/u);
  assert.match(script, /issue\.sources/u);
  assert.match(script, /issue\.excerpt/u);
  assert.match(script, /replayable/u);
  assert.match(script, /localStorage/u);
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/iu);
  assert.doesNotMatch(script, /https?:\/\//iu);
});

test("root scripts and local-gate documentation expose the supported dashboard workflow", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const documentation = await readFile(
    join(repositoryRoot, "docs", "development", "local-quality-gates.md"),
    "utf8",
  );

  assert.equal(
    packageJson.scripts["quality:dashboard"],
    "node tools/local-quality-dashboard/server.mjs",
  );
  assert.equal(
    packageJson.scripts["test:quality-dashboard"],
    "node --test tools/local-quality-dashboard/*.test.mjs",
  );
  assert.equal(
    packageJson.scripts["test:quality-dashboard:browser"],
    "pnpm --filter @wizards/web exec playwright test --config playwright.quality-dashboard.config.ts",
  );
  assert.match(documentation, /pnpm quality:dashboard/u);
  assert.match(documentation, /http:\/\/127\.0\.0\.1:47832/u);
  assert.match(documentation, /Güvenli Tümünü Çalıştır/u);
  assert.match(documentation, /E2EFull/u);
  assert.match(documentation, /Desktop/u);
  assert.match(documentation, /artifacts\/local-quality-dashboard/u);
});
