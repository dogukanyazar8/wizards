import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = build({
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "confirm-boundary",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/confirmation$/ }, () => ({
          path: "confirmation",
          namespace: "test",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: "export const confirmAction = async () => true;",
        }));
      },
    },
  ],
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
import React from "react"; import {createRoot} from "react-dom/client";
import {AdminReleases} from "@/components/admin/sections/admin-releases";
import {AdminReleaseEditor} from "@/components/admin/sections/admin-release-editor";
const root = createRoot(document.getElementById("root"));
window.mount = (mode, props) => root.render(mode === "list" ? <AdminReleases {...props}/> : <AdminReleaseEditor {...props}/>);
`,
  },
});
const release = {
  id: "release-desktop",
  product: "DESKTOP",
  channel: "UAT",
  version: "1.2.3",
  releasedAt: "2026-09-18T09:34:56.789Z",
  publishedAt: "2026-09-18T09:34:56.789Z",
  createdAt: "2026-09-18T09:34:56.789Z",
  updatedAt: "2026-09-18T09:34:56.789Z",
  withdrawnAt: null,
  active: true,
  sourceSha: "a".repeat(40),
  sourceRunId: "123",
  sourceRunUrl: "https://github.com/owner/whispr/actions/runs/123",
  codename: null,
  summary: null,
  highlight: null,
  mandatory: false,
  managed: true,
  changes: [
    { id: "change1", position: 0, type: "FIXED", title: "Microphone restored", detail: null },
  ],
  changeCount: 1,
  packages: [
    {
      platform: "WINDOWS",
      arch: "x86_64",
      url: "https://updates.whispr.team/desktop/uat/releases/v1.2.3/Whispr.exe",
      sha256: "b".repeat(64),
      sizeBytes: 100,
      signature: "c2lnbmF0dXJl",
    },
  ],
};
const artifact = {
  id: "artifact1",
  releaseId: release.id,
  channel: "UAT",
  platform: "WINDOWS",
  delivery: "DIRECT",
  url: release.packages[0].url,
  versionLabel: release.version,
  buildLabel: null,
  extensionLabelTr: ".exe",
  extensionLabelEn: ".exe",
  metaLabelTr: "Windows",
  metaLabelEn: "Windows",
  sizeBytes: 100,
  sha256: "b".repeat(64),
  publishedAt: release.publishedAt,
  releasedAt: release.releasedAt,
  createdAt: release.createdAt,
  updatedAt: release.updatedAt,
};

async function mount(page, mode, props) {
  const requests = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (route.request().url().includes("/api/")) {
      requests.push({
        url: route.request().url(),
        method: route.request().method(),
        body: route.request().postDataJSON(),
      });
      return route.fulfill({ status: 409, json: { error: "Yayın durumu değişti" } });
    }
    return route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><main id="root"></main></body></html>',
    });
  });
  await page.goto("https://release.invalid");
  await page.addScriptTag({ content: (await bundle).outputFiles[0].text });
  assert.deepEqual(errors, []);
  await page.evaluate(({ mode, props }) => window.mount(mode, props), { mode, props });
  return { requests, errors };
}

test("unified center filters products/channels and routes managed packages to their release", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const { errors } = await mount(page, "list", {
      canWrite: true,
      artifacts: [artifact],
      releases: [
        release,
        {
          ...release,
          id: "release-mobile",
          product: "MOBILE",
          channel: "STABLE",
          version: "2.0.0",
        },
      ],
    });
    await expect(page.getByRole("heading", { name: "Yayın Merkezi", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Yayını yönet" })).toHaveAttribute(
      "href",
      "/admin/releases/release-desktop",
    );
    await page.getByLabel("Ürün filtresi").selectOption("MOBILE");
    await expect(page.getByRole("link", { name: "Mobil · 2.0.0" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Masaüstü · 1.2.3" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Yayını yönet" })).toHaveCount(0);
    await page.getByLabel("Kanal filtresi").selectOption("UAT");
    await expect(page.getByRole("link", { name: "Mobil · 2.0.0" })).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("release editor shows immutable evidence and withdraws through the release endpoint", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const { requests, errors } = await mount(page, "editor", { release, canWrite: true });
    await expect(page.getByText(`SHA-256: ${artifact.sha256}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sil", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Yayını geri çek", exact: true }).click();
    await expect(page.getByText("Yayın durumu değişti", { exact: true })).toBeVisible();
    assert.equal(requests[0].method, "POST");
    assert.ok(requests[0].url.endsWith("/releases/release-desktop/withdraw"));
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    assert.equal(requests[1].body.releasedAt, release.releasedAt);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
