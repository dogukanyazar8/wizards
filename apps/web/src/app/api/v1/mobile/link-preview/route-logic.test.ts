import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";

const route = import("./route-logic");

describe("mobile link preview route", () => {
  it("keeps URL fetches behind auth, rate limiting, and the existing SSRF-safe service", async () => {
    const { mobileLinkPreviewRoute } = await route;
    const calls: string[] = [];
    const response = await mobileLinkPreviewRoute(
      new Request("https://whispr.test/preview", {
        body: JSON.stringify({ url: "https://example.com/post" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async (_id: string, action: string) => {
          calls.push(action);
        },
        parseBody: parseJsonBody,
        fetchPreview: async (url: string) => {
          calls.push(url);
          return { description: "Safe", imageUrl: null, siteName: "Example", title: "Post", url };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["mobile:link-preview", "https://example.com/post"]);
  });
});
