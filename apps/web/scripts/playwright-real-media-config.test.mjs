import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Ekran paylaşımı Ş0.3 — `chromium-real-media` proje sözleşmesi.
 *
 * Node 24 TypeScript'i doğal olarak soyar, o yüzden `playwright.config.ts` doğrudan içe aktarılır
 * ve iddialar kaynak regex'ine değil gerçek nesneye bakar.
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configModule = await import(new URL("../playwright.config.ts", import.meta.url).href);
const config = configModule.default;

const REAL_MEDIA_PROJECT = "chromium-real-media";
const REAL_MEDIA_SPEC = "**/voice/screen-share-real-media.spec.ts";
const EXPECTED_ARGS = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--auto-select-desktop-capture-source=Entire screen",
  "--window-size=1920,1080",
  "--autoplay-policy=no-user-gesture-required",
];

function findProject(name) {
  const project = config.projects.find((candidate) => candidate.name === name);
  assert.ok(project, `Playwright project ${name} must exist`);
  return project;
}

test("real-media project exists with the five Chromium flags and the spec match", () => {
  const project = findProject(REAL_MEDIA_PROJECT);
  const args = project.use?.launchOptions?.args ?? [];

  assert.equal(configModule.REAL_MEDIA_PROJECT_NAME, REAL_MEDIA_PROJECT);
  assert.equal(project.testMatch, REAL_MEDIA_SPEC);
  for (const flag of EXPECTED_ARGS) {
    assert.ok(args.includes(flag), `${REAL_MEDIA_PROJECT} must launch Chromium with ${flag}`);
  }
  assert.deepEqual(project.use?.viewport, { height: 1080, width: 1920 });
  assert.equal(project.use?.deviceScaleFactor, 1);
});

test("the fake-provider projects ignore the real-media spec and keep their flags", () => {
  const chromium = findProject("chromium");
  assert.equal(chromium.testIgnore, REAL_MEDIA_SPEC);
  assert.deepEqual(chromium.use?.launchOptions?.args, [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ]);
  assert.equal(findProject("firefox").testIgnore, REAL_MEDIA_SPEC);
  // WebKit keeps its existing voice exclusion; the spec guards itself by project name.
  assert.equal(findProject("webkit").testIgnore, "**/voice/voice.spec.ts");
});

test("the pattern group captures the tab by title without the desktop auto-select", () => {
  const args = configModule.SCREEN_PATTERN_CHROMIUM_ARGS;

  assert.equal(configModule.SCREEN_PATTERN_PAGE_TITLE, "Whispr screen pattern");
  assert.equal(configModule.SCREEN_PATTERN_PAGE_PATH, "/e2e/screen-pattern");
  assert.ok(args.includes("--auto-select-tab-capture-source-by-title=Whispr screen pattern"));
  assert.ok(!args.some((flag) => flag.startsWith("--auto-select-desktop-capture-source")));
  assert.ok(!args.some((flag) => flag.startsWith("--use-fake-")));
  for (const flag of EXPECTED_ARGS.filter(
    (candidate) =>
      !candidate.startsWith("--auto-select-desktop-capture-source") &&
      !candidate.startsWith("--use-fake-"),
  )) {
    assert.ok(args.includes(flag), `pattern browser must keep ${flag}`);
  }
});

test("the real-media flag and LiveKit dev defaults reach the web server only when requested", () => {
  const source = readFileSync(join(webRoot, "playwright.config.ts"), "utf8");

  assert.equal(configModule.REAL_MEDIA_FLAG_ENV, "NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA");
  assert.equal(configModule.REAL_MEDIA_LIVEKIT_DEV_URL, "ws://127.0.0.1:7880");
  assert.equal(configModule.REAL_MEDIA_LIVEKIT_DEV_API_KEY, "devkey");
  assert.equal(configModule.REAL_MEDIA_LIVEKIT_DEV_API_SECRET, "secret");
  assert.match(
    source,
    /if \(realMediaRequested\) \{\s*webServerEnv\[REAL_MEDIA_FLAG_ENV\] = "true";/,
  );
  assert.match(source, /argument === `--project=\$\{REAL_MEDIA_PROJECT_NAME\}`/);
  // Off by default: the fake-provider builds never see the flag.
  assert.equal(
    process.env.NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA === "true" ||
      process.argv.includes(`--project=${REAL_MEDIA_PROJECT}`),
    config.webServer?.env?.NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA === "true",
  );
});

test("the e2e:real-media script runs the preflight and only the real-media project", () => {
  const packageJson = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8"));
  const script = packageJson.scripts["e2e:real-media"] ?? "";

  assert.match(script, /pnpm run e2e:check-env && /);
  assert.match(script, /playwright test --project=chromium-real-media/);
  assert.doesNotMatch(script, /--project=chromium(?:\s|$)/);
});

test("the pattern page and the fixture agree on the clock-strip geometry", () => {
  const page = readFileSync(
    join(webRoot, "src", "app", "e2e", "screen-pattern", "page.tsx"),
    "utf8",
  );
  const fixture = readFileSync(join(webRoot, "e2e", "fixtures", "screen-share.ts"), "utf8");

  for (const source of [page, fixture]) {
    assert.match(source, /CLOCK_STRIP_BITS = 24;/);
    assert.match(source, /CLOCK_STRIP_CELL_PX = 40;/);
  }
  assert.match(page, /title: \{ absolute: "Whispr screen pattern" \}/);
  assert.match(page, /isExplicitE2ETestMode\(/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /performance\.now\(\)/);
});
