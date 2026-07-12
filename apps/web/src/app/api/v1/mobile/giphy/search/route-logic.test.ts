import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileGiphySearchRoute } from "./route-logic";

const gif = { giphyUrl: "https://giphy.com/gifs/1", height: 100, id: "gif-1", previewUrl: "https://media.giphy.com/preview.gif", size: 1024, title: "Hello", url: "https://media.giphy.com/full.gif", width: 100 };
describe("mobile Giphy search route", () => {
  it("forwards bounded query, locale, and country without exposing keys", async () => {
    const calls: unknown[] = [];
    const response = await mobileGiphySearchRoute(new Request("https://whispr.test/search?q=hello&limit=12&offset=3", { headers: { "x-country-code": "TR" } }), {
      authenticate: async () => "user-1", enforceRateLimit: async (_id, action) => { calls.push(action); }, getLocale: async () => "tr", listGifs: async (input) => { calls.push(input); return { gifs: [gif] }; },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["mobile:giphy:search", { countryCode: "TR", limit: 12, locale: "tr", offset: 3, query: "hello", userId: "user-1" }]);
    assert.deepEqual(await response.json(), { gifs: [gif] });
  });
  it("rejects unknown and oversized query input before upstream", async () => {
    const response = await mobileGiphySearchRoute(new Request("https://whispr.test/search?q=ok&api_key=secret"), { authenticate: async () => "user-1", enforceRateLimit: async () => undefined, getLocale: async () => null, listGifs: async () => { throw new Error("must not run"); } });
    assert.equal(response.status, 400);
  });
});
