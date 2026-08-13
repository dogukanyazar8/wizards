import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { desktopDownloadRoute } from "./route";

function request() {
  return new Request("https://whispr.test/api/v1/desktop/download");
}

describe("desktop download route", () => {
  it("rate limits before fetching the manifest", async () => {
    let fetches = 0;
    const response = await desktopDownloadRoute(request(), {
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests", 429, "RATE_LIMITED");
      },
      fetchManifest: async () => {
        fetches += 1;
        return new Response("{}", { status: 200 });
      },
      now: () => 1_000,
      resolveManifestUrl: () => new URL("https://updates.whispr.test/manifest.json"),
      resolveDownloadUrl: () => new URL("https://downloads.whispr.test/Whispr.exe"),
    });

    assert.equal(response.status, 429);
    assert.equal(fetches, 0);
  });

  it("reuses the resolved manifest URL within the short TTL", async () => {
    let fetches = 0;
    const dependencies = {
      enforceRateLimit: async () => undefined,
      fetchManifest: async () => {
        fetches += 1;
        return Response.json({ url: "ignored by fake resolver" });
      },
      now: () => 2_000,
      resolveManifestUrl: () => new URL("https://updates.whispr.test/manifest.json"),
      resolveDownloadUrl: () => new URL("https://downloads.whispr.test/Whispr.exe"),
    };

    const first = await desktopDownloadRoute(request(), dependencies);
    const second = await desktopDownloadRoute(request(), dependencies);

    assert.equal(first.headers.get("location"), "https://downloads.whispr.test/Whispr.exe");
    assert.equal(second.headers.get("location"), "https://downloads.whispr.test/Whispr.exe");
    assert.equal(fetches, 1);
  });
});
