import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";

const route = import("./route-logic");

describe("mobile Giphy attachment route", () => {
  it("authenticates, rate limits, validates, and delegates to the existing service", async () => {
    const { mobileGiphyAttachmentRoute } = await route;
    const calls: string[] = [];
    const response = await mobileGiphyAttachmentRoute(
      new Request("https://whispr.test/giphy", {
        body: JSON.stringify({ gifId: "gif-1" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async (_id: string, action: string) => {
          calls.push(action);
        },
        parseBody: parseJsonBody,
        createAttachment: async (userId: string, gifId: string) => {
          calls.push(`${userId}:${gifId}`);
          return {
            attachment: {
              contentType: "image/gif",
              filename: "giphy.gif",
              height: 120,
              id: "attachment-1",
              scanStatus: "CLEAN",
              size: 1024,
              url: "https://media.giphy.com/a.gif",
              width: 160,
            },
            input: { height: 120, id: "attachment-1", width: 160 },
          };
        },
      },
    );
    assert.equal(response.status, 201);
    assert.deepEqual(calls, ["mobile:giphy:attachment", "user-1:gif-1"]);
  });
});
