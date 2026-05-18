import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { openPublicAttachmentDownload } from "./download-proxy";

describe("attachment download proxy SSRF guard", () => {
  it("rejects private IP URL literals before opening a connection", async () => {
    await assert.rejects(
      () => openPublicAttachmentDownload("http://127.0.0.1/secret"),
      (error) => error instanceof ApiError && error.code === "BLOCKED_URL",
    );
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    await assert.rejects(
      () =>
        openPublicAttachmentDownload("https://cdn.example.test/file.png", {
          resolveHost: async () => [{ address: "169.254.169.254", family: 4 }],
        }),
      (error) => error instanceof ApiError && error.code === "BLOCKED_URL",
    );
  });
});
