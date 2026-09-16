import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = build({
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {AdminDownloads} from "@/components/admin/sections/admin-downloads";
      const root = createRoot(document.getElementById("root"));
      window.mount = (artifacts, canWrite) => root.render(<AdminDownloads artifacts={artifacts} canWrite={canWrite}/>);
    `,
  },
});
const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const css = readFile(cssPath, "utf8").then((content) =>
  postcss([tailwind()]).process(content, { from: cssPath }),
);
const artifact = {
  id: "artifact-1",
  channel: "UAT",
  platform: "WINDOWS",
  delivery: "DIRECT",
  url: "https://downloads.example.test/uat/setup.exe",
  versionLabel: "1.2.3",
  buildLabel: "42",
  extensionLabelTr: ".exe",
  extensionLabelEn: ".exe",
  metaLabelTr: "Windows 11",
  metaLabelEn: "Windows 11",
  sizeBytes: 96_000_000,
  sha256: "ab".repeat(32),
  releasedAt: "2026-09-16T09:34:56.789Z",
  publishedAt: null,
  createdAt: "2026-09-16T09:00:00.000Z",
  updatedAt: "2026-09-16T09:00:00.000Z",
};

async function fixture(page, artifacts = [], canWrite = true) {
  const state = {
    requests: [],
    failure: null,
    release: null,
    delay: false,
    rows: [...artifacts],
    errors: [],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().includes("/api/v1/admin/downloads")) {
      const body = request.postDataJSON();
      state.requests.push({ method: request.method(), url: request.url(), body });
      if (state.delay)
        await new Promise((resolve) => {
          state.release = resolve;
        });
      if (state.failure === "network") return route.abort("failed");
      if (typeof state.failure === "number")
        return route.fulfill({ status: state.failure, json: { error: "private detail" } });
      const existing = state.rows.find((row) => request.url().endsWith(`/${row.id}`));
      const saved = { ...(existing ?? artifact), ...body };
      if (body.published !== undefined)
        saved.publishedAt = body.published ? new Date().toISOString() : null;
      delete saved.published;
      state.rows = [...state.rows.filter((row) => row.id !== saved.id), saved];
      return route.fulfill({ status: existing ? 200 : 201, json: { artifact: saved } });
    }
    return route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="tr" class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root" style="padding:20px;max-width:1200px;margin:auto"></main></body></html>',
    });
  });
  await page.goto("https://downloads.invalid");
  await page.addStyleTag({ content: (await css).css });
  await page.addStyleTag({ content: "body {font-family:Arial,sans-serif;}" });
  await page.addScriptTag({ content: (await bundle).outputFiles[0].text });
  await page.evaluate(({ artifacts, canWrite }) => window.mount(artifacts, canWrite), {
    artifacts,
    canWrite,
  });
  await expect(page.getByRole("heading", { name: "İndirme Paketleri" })).toBeVisible();
  return state;
}

async function fillForm(page) {
  await page.getByLabel("HTTPS bağlantısı").fill(artifact.url);
  await page.getByLabel("Sürüm", { exact: true }).fill(artifact.versionLabel);
  for (const [label, value] of [
    ["Paket etiketi (TR)", ".exe"],
    ["Paket etiketi (EN)", ".exe"],
    ["Platform açıklaması (TR)", "Windows 11"],
    ["Platform açıklaması (EN)", "Windows 11"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
}

test("create, edit, publish and withdraw use the real form with JSON and preserve timestamps", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ timezoneId: "Europe/Istanbul" });
    const state = await fixture(page);
    await page.getByRole("button", { name: "Paket Ekle", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Ortam", exact: true })).toHaveValue("UAT");
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    await fillForm(page);
    await page.getByRole("combobox", { name: "Ortam", exact: true }).selectOption("STABLE");
    await page.getByLabel("Sürüm tarihi (yerel saat)").fill("2026-09-16T12:34:56.789");
    await page.getByRole("button", { name: "Taslak Oluştur", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("taslak olarak kaydedildi");
    assert.equal(state.requests[0].method, "POST");
    assert.equal(state.requests[0].body.channel, "STABLE");
    assert.equal(state.requests[0].body.releasedAt, artifact.releasedAt);
    assert.equal("published" in state.requests[0].body, false);
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await expect(page.getByLabel("HTTPS bağlantısı")).toHaveValue(artifact.url);
    await page.getByLabel("Sürüm", { exact: true }).fill("1.2.4");
    await page.getByLabel("Dosya boyutu (bayt, isteğe bağlı)").fill("96000000");
    await page.getByLabel("SHA-256 (isteğe bağlı)").fill("AB".repeat(32));
    await page.getByRole("button", { name: "Değişiklikleri Kaydet", exact: true }).click();
    await expect(page.getByRole("button", { name: "Yayınla", exact: true })).toBeEnabled();
    assert.equal(state.requests[1].method, "PATCH");
    assert.equal(state.requests[1].body.releasedAt, artifact.releasedAt);
    assert.equal(state.requests[1].body.sha256, "ab".repeat(32));
    await page.getByRole("button", { name: "Yayınla", exact: true }).click();
    await expect(page.getByRole("button", { name: "Yayından kaldır", exact: true })).toBeVisible();
    assert.deepEqual(state.requests[2].body, { published: true });
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await expect(page.getByText("Bu paket yayında.", { exact: false })).toBeVisible();
    await page.getByLabel("SHA-256 (isteğe bağlı)").fill("");
    await page.getByLabel("Dosya boyutu (bayt, isteğe bağlı)").fill("");
    await page.getByRole("button", { name: "Değişiklikleri Kaydet", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Yayındaki paket güncellendi.");
    assert.equal(state.requests[3].body.sha256, null);
    assert.equal(state.requests[3].body.sizeBytes, null);
    assert.equal("published" in state.requests[3].body, false);
    await page.getByRole("button", { name: "Yayından kaldır", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Paket yayından kaldırıldı.");
    assert.deepEqual(state.requests[4].body, { published: false });
    assert.deepEqual(state.errors, []);
  } finally {
    await browser.close();
  }
});

test("invalid input, duplicate and network failures preserve the form and allow retry", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const state = await fixture(page);
    await page.getByRole("button", { name: "Paket Ekle", exact: true }).click();
    await fillForm(page);
    await page.getByLabel("HTTPS bağlantısı").fill("http://downloads.example.test/setup.exe");
    await page.getByRole("button", { name: "Taslak Oluştur", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("HTTPS");
    assert.equal(state.requests.length, 0);
    await page.getByLabel("HTTPS bağlantısı").fill(artifact.url);
    state.failure = 409;
    await page.getByRole("button", { name: "Taslak Oluştur", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("zaten bir paket var");
    await expect(page.getByLabel("Sürüm", { exact: true })).toHaveValue("1.2.3");
    state.failure = "network";
    await page.getByRole("button", { name: "Taslak Oluştur", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Bağlantı kurulamadı");
    state.failure = null;
    state.delay = true;
    await page.getByRole("button", { name: "Taslak Oluştur", exact: true }).click();
    await expect(page.getByRole("button", { name: "Kaydediliyor…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Vazgeç", exact: true })).toBeDisabled();
    await expect.poll(() => typeof state.release).toBe("function");
    state.release();
    await expect(page.getByRole("status")).toContainText("taslak olarak kaydedildi");
    assert.equal(state.requests.length, 3);
    assert.deepEqual(state.errors, []);
  } finally {
    await browser.close();
  }
});

test("read-only admins cannot mutate and cancelling edits sends no request", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const reader = await browser.newPage();
    const readState = await fixture(reader, [artifact], false);
    await expect(reader.getByText("Salt okunur")).toBeVisible();
    assert.equal(await reader.getByRole("button").count(), 0);
    assert.equal(readState.requests.length, 0);
    const writer = await browser.newPage();
    const writeState = await fixture(writer, [artifact]);
    await writer.getByRole("button", { name: "Düzenle", exact: true }).click();
    await writer.getByLabel("Sürüm", { exact: true }).fill("9.9.9");
    await writer.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await writer.getByRole("button", { name: "Düzenle", exact: true }).click();
    await expect(writer.getByLabel("Sürüm", { exact: true })).toHaveValue("1.2.3");
    assert.equal(writeState.requests.length, 0);
  } finally {
    await browser.close();
  }
});

test("form supports every platform and delivery option without page overflow at mobile and desktop widths", async () => {
  const browser = await chromium.launch({ headless: true });
  const output = fileURLToPath(new URL("../../../output/playwright/", import.meta.url));
  await mkdir(output, { recursive: true });
  try {
    const page = await browser.newPage();
    const state = await fixture(page, [artifact]);
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    assert.deepEqual(
      await page
        .locator('select[name="platform"] option')
        .evaluateAll((nodes) => nodes.map((node) => node.value)),
      ["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS"],
    );
    assert.deepEqual(
      await page
        .locator('select[name="delivery"] option')
        .evaluateAll((nodes) => nodes.map((node) => node.value)),
      ["DIRECT", "STORE", "TESTFLIGHT"],
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({ path: `${output}/admin-downloads-${width}.png`, fullPage: true });
    }
    assert.deepEqual(state.errors, []);
  } finally {
    await browser.close();
  }
});
