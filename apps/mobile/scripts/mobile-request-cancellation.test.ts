import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createMobileApiClient } from "../src/api/mobile-api-client";

function createHangingFetch() {
  const seen: { signal: AbortSignal | null | undefined }[] = [];
  const fetchImpl = ((_input: unknown, init?: { signal?: AbortSignal | null }) => {
    seen.push({ signal: init?.signal });
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new Error("AbortError"));
      // A signal that arrived already aborted never fires the event, and a fake
      // that only listens would hang the test instead of failing it.
      if (init?.signal?.aborted) {
        abort();
        return;
      }
      init?.signal?.addEventListener("abort", abort);
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, seen };
}

function createClient(fetchImpl: typeof fetch) {
  return createMobileApiClient({
    baseUrl: "https://uat.whispr.team",
    fetchImpl,
    getNetworkStatus: () => "online",
    timeoutMs: 60_000,
  });
}

describe("request cancellation", () => {
  it("dies when the caller's signal aborts", async () => {
    const { fetchImpl } = createHangingFetch();
    const controller = new AbortController();
    const pending = createClient(fetchImpl).requestJson("/api/v1/mobile/bootstrap", {
      signal: controller.signal,
    });

    controller.abort();

    // `signal` used to be written after the spread, so the caller's signal was
    // discarded: TanStack cancelled the query and the request kept downloading
    // and parsing on the JS thread the reader was waiting on.
    await assert.rejects(pending);
  });

  it("dies immediately when the caller arrives already aborted", async () => {
    const { fetchImpl, seen } = createHangingFetch();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      createClient(fetchImpl).requestJson("/api/v1/mobile/bootstrap", {
        signal: controller.signal,
      }),
    );
    assert.equal(seen[0]?.signal?.aborted, true);
  });

  it("keeps a request without a caller signal alive on its own timeout", async () => {
    const { fetchImpl, seen } = createHangingFetch();
    const client = createMobileApiClient({
      baseUrl: "https://uat.whispr.team",
      fetchImpl,
      getNetworkStatus: () => "online",
      timeoutMs: 30,
    });

    await assert.rejects(client.requestJson("/api/v1/mobile/bootstrap"));
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.signal?.aborted, true);
  });

  it("hands TanStack's signal to every stream and root query function", () => {
    const read = (relativePath: string) =>
      readFileSync(path.join(__dirname, "..", relativePath), "utf8");

    assert.match(
      read("src/query/mobile-message-queries.ts"),
      /queryFn: \(\{ pageParam, signal \}\) =>\s*fetchMobileChannelMessages\(client, \{[\s\S]{0,200}?channelId,\s*cursor: pageParam,\s*signal,\s*\}\)/u,
    );
    assert.match(
      read("src/query/mobile-message-queries.ts"),
      /queryFn: \(\{ pageParam, signal \}\) =>\s*fetchMobileDMMessages\(client, \{ conversationId, cursor: pageParam, signal \}\)/u,
    );
    assert.match(
      read("src/query/mobile-bootstrap-query.ts"),
      /queryFn: \(\{ signal \}\) => fetchMobileBootstrap\(client, signal\)/u,
    );
    assert.match(
      read("src/query/mobile-workspace-query.ts"),
      /queryFn: \(\{ signal \}\) => fetchMobileWorkspaceServer\(client, \{ serverId, signal \}\)/u,
    );
  });
});
