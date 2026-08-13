import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { gifsRoute } from "./route";

describe("GIF search route", () => {
  it("stops at the rate limit before reading the user locale", async () => {
    const calls: string[] = [];
    const response = await gifsRoute(
      new Request("https://whispr.test/api/v1/gifs?q=hello"),
      "user-1",
      {
        enforceSearchRateLimit: async () => {
          calls.push("rate");
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        findUserLocale: async () => {
          calls.push("locale");
          return "en";
        },
        listGifs: async () => {
          calls.push("list");
          return { gifs: [] };
        },
      },
    );

    assert.equal(response.status, 429);
    assert.deepEqual(calls, ["rate"]);
  });
});
