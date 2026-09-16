import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readAdminDownloadForm,
  toDownloadDateTimeInput,
  writeAdminDownloadArtifact,
} from "./admin-download-client";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    channel: "UAT",
    platform: "WINDOWS",
    delivery: "DIRECT",
    url: " https://downloads.example.test/uat/setup.exe ",
    versionLabel: " 1.2.3 ",
    buildLabel: "",
    releasedAt: "2026-09-16T12:34:56.789",
    extensionLabelTr: ".exe",
    extensionLabelEn: ".exe",
    metaLabelTr: "Windows 11 · x64",
    metaLabelEn: "Windows 11 · x64",
    sizeBytes: "",
    sha256: "",
    ...overrides,
  }))
    data.set(key, value);
  return data;
}

describe("admin download form payload", () => {
  it("trims links and converts optional blanks to null without publishing", () => {
    const input = readAdminDownloadForm(form());
    assert.equal(input.url, "https://downloads.example.test/uat/setup.exe");
    assert.equal(input.versionLabel, "1.2.3");
    assert.equal(input.buildLabel, null);
    assert.equal(input.sizeBytes, null);
    assert.equal(input.sha256, null);
    assert.equal(input.releasedAt, new Date("2026-09-16T12:34:56.789").toISOString());
    assert.equal("published" in input, false);
  });

  it("preserves the exact release timestamp when opening and saving an edit", () => {
    const timestamp = "2026-09-16T09:34:56.789Z";
    assert.equal(
      readAdminDownloadForm(form({ releasedAt: toDownloadDateTimeInput(timestamp) })).releasedAt,
      timestamp,
    );
  });

  it("saves exact byte counts and normalizes uppercase checksums", () => {
    const input = readAdminDownloadForm(form({ sizeBytes: "96000000", sha256: "AB".repeat(32) }));
    assert.equal(input.sizeBytes, 96_000_000);
    assert.equal(input.sha256, "ab".repeat(32));
  });

  for (const overrides of [
    { url: "http://downloads.example.test/setup.exe" },
    { url: "javascript:alert(1)" },
    { sizeBytes: "1.5" },
    { sizeBytes: "-1" },
    { sizeBytes: "9007199254740992" },
    { sha256: "invalid" },
    { releasedAt: "" },
    { releasedAt: "invalid" },
    { versionLabel: " " },
    { metaLabelTr: " " },
    { channel: "PROD" },
    { platform: "UNKNOWN" },
  ]) {
    it(`rejects invalid form values: ${JSON.stringify(overrides)}`, () => {
      assert.throws(() => readAdminDownloadForm(form(overrides)));
    });
  }
});

describe("admin download mutations", () => {
  it("posts a new draft and patches an existing id with JSON only", async (context) => {
    const requests: Array<{ url: string; options: RequestInit | undefined }> = [];
    context.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
      requests.push({ url, options });
      return Response.json({ artifact: { id: "saved" } });
    });
    const input = readAdminDownloadForm(form());
    await writeAdminDownloadArtifact(null, input);
    await writeAdminDownloadArtifact("artifact/1", input);
    assert.equal(requests[0]?.url, "/api/v1/admin/downloads");
    assert.equal(requests[0]?.options?.method, "POST");
    assert.equal(requests[1]?.url, "/api/v1/admin/downloads/artifact%2F1");
    assert.equal(requests[1]?.options?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(requests[1]?.options?.body)), input);
  });

  for (const [status, message] of [
    [409, "Bu ortam ve platform için zaten bir paket var"],
    [403, "yetkiniz yok"],
    [401, "Oturumunuz"],
    [404, "Paket bulunamadı"],
    [429, "Çok fazla istek"],
    [500, "kaydedilemedi"],
  ] as const) {
    it(`reports a safe actionable message for HTTP ${status}`, async (context) => {
      context.mock.method(
        globalThis,
        "fetch",
        async () => new Response("internal details", { status }),
      );
      await assert.rejects(
        () => writeAdminDownloadArtifact(null, readAdminDownloadForm(form())),
        new RegExp(message),
      );
    });
  }

  it("reports network failures without leaking internal details", async (context) => {
    context.mock.method(globalThis, "fetch", async () => {
      throw new Error("private host");
    });
    await assert.rejects(
      () => writeAdminDownloadArtifact("artifact-1", { published: true }),
      /Bağlantı kurulamadı/,
    );
  });
});
