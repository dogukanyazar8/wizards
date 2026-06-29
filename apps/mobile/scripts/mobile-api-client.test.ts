import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileApiClient, MobileApiError } from "../src/api/mobile-api-client";

describe("mobile API client", () => {
  it("uses safe relative API paths and attaches bearer tokens", async () => {
    const requests: Array<{ headers: Headers; url: string }> = [];
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team/",
      fetchImpl: async (input, init) => {
        requests.push({
          headers: new Headers(init?.headers),
          url: String(input),
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
      getAccessToken: () => "access-token-1234567890",
    });

    const result = await client.requestJson<{ ok: boolean }>("/api/v1/mobile/bootstrap");

    assert.deepEqual(result, { ok: true });
    assert.equal(requests[0]?.url, "https://whispr.team/api/v1/mobile/bootstrap");
    assert.equal(requests[0]?.headers.get("authorization"), "Bearer access-token-1234567890");
  });

  it("rejects absolute, protocol-relative, and traversal paths", async () => {
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    });

    await assert.rejects(
      () => client.requestJson("https://evil.example/api"),
      (error) => error instanceof MobileApiError && error.code === "unsafe_path",
    );
    await assert.rejects(
      () => client.requestJson("//evil.example/api"),
      (error) => error instanceof MobileApiError && error.code === "unsafe_path",
    );
    await assert.rejects(
      () => client.requestJson("/api/../admin"),
      (error) => error instanceof MobileApiError && error.code === "unsafe_path",
    );
  });

  it("does not echo response bodies or tokens into HTTP errors", async () => {
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async () =>
        new Response(JSON.stringify({ token: "access-token-should-not-leak" }), {
          headers: { "content-type": "application/json" },
          status: 401,
        }),
      getAccessToken: () => "access-token-1234567890",
    });

    await assert.rejects(
      () => client.requestJson("/api/v1/mobile/bootstrap"),
      (error) => {
        assert.equal(error instanceof MobileApiError, true);
        assert.equal(String(error).includes("access-token"), false);
        return true;
      },
    );
  });

  it("rejects non-JSON responses", async () => {
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
    });

    await assert.rejects(
      () => client.requestJson("/api/v1/mobile/bootstrap"),
      (error) => error instanceof MobileApiError && error.code === "invalid_content_type",
    );
  });

  it("accepts 204 responses for revoke-style endpoints", async () => {
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async () => new Response(null, { status: 204 }),
    });

    const result = await client.requestJson<void>("/api/v1/mobile/auth/revoke", {
      body: { refreshToken: "refresh-token-1234567890" },
      method: "POST",
    });

    assert.equal(result, undefined);
  });
});
