import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileApiClient, MobileApiError } from "../src/api/mobile-api-client";
import { MobileOfflineError } from "../src/network/mobile-network-contract";

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
        new Response(
          JSON.stringify({ code: "UNAUTHORIZED", token: "access-token-should-not-leak" }),
          {
            headers: { "content-type": "application/json" },
            status: 401,
          },
        ),
      getAccessToken: () => "access-token-1234567890",
    });

    await assert.rejects(
      () => client.requestJson("/api/v1/mobile/bootstrap"),
      (error) => {
        assert.equal(error instanceof MobileApiError, true);
        assert.equal((error as MobileApiError).apiPath, "/api/v1/mobile/bootstrap");
        assert.equal((error as MobileApiError).serverCode, "UNAUTHORIZED");
        assert.equal(String(error).includes("access-token"), false);
        assert.equal(String(error).includes("/api/v1/mobile/bootstrap"), true);
        assert.equal(String(error).includes("UNAUTHORIZED"), true);
        return true;
      },
    );
  });

  it("keeps query values out of HTTP error diagnostics", async () => {
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async () =>
        new Response("<html>not found</html>", {
          headers: { "content-type": "text/html" },
          status: 404,
        }),
    });

    await assert.rejects(
      () => client.requestJson("/api/v1/mobile/voice/states?serverId=server-secret-id"),
      (error) => {
        assert.equal(error instanceof MobileApiError, true);
        assert.equal((error as MobileApiError).apiPath, "/api/v1/mobile/voice/states");
        assert.equal((error as MobileApiError).status, 404);
        assert.equal(String(error).includes("server-secret-id"), false);
        assert.equal(String(error).includes("/api/v1/mobile/voice/states"), true);
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

  /**
   * The id is the only thing that ties a slow sample on a phone to the edge's
   * record of the same call. It has to be per-request and it has to be derived
   * from nothing the reader owns.
   */
  it("sends a fresh opaque correlation id on every request", async () => {
    const sentIds: (string | null)[] = [];
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async (_input, init) => {
        sentIds.push(new Headers(init?.headers).get("x-request-id"));
        return new Response(null, { status: 204 });
      },
      getAccessToken: () => "access-token-1234567890",
    });

    await client.requestJson("/api/v1/mobile/bootstrap");
    await client.requestJson("/api/v1/mobile/bootstrap");

    assert.equal(sentIds.length, 2);
    assert.notEqual(sentIds[0], sentIds[1]);
    for (const id of sentIds) {
      assert.match(id ?? "", /^[0-9a-f]{32}$/);
      // Nothing about the caller may be recoverable from it.
      assert.equal(id?.includes("access-token"), false);
    }
  });

  it("fails offline mutations before token resolution or fetch without queueing", async () => {
    let fetchCalls = 0;
    let tokenCalls = 0;
    const client = createMobileApiClient({
      baseUrl: "https://whispr.team",
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(null, { status: 204 });
      },
      getAccessToken: () => {
        tokenCalls += 1;
        return "unused-token";
      },
      getNetworkStatus: () => "offline",
    });

    await assert.rejects(
      () => client.requestJson("/api/v1/mobile/friends", { method: "POST" }),
      MobileOfflineError,
    );
    assert.equal(fetchCalls, 0);
    assert.equal(tokenCalls, 0);
  });
});
