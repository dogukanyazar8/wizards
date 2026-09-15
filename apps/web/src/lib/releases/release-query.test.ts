import assert from "node:assert/strict";
import { it } from "node:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { releaseDetailOptions, releaseListOptions } from "./release-query";

const release = (version: string) => ({
  version,
  releasedAt: "2026-09-15T00:00:00.000Z",
  changeCount: 1,
});

it("loads another page using its cursor and refreshes the published list", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  const paths: string[] = [];
  let refreshed = false;
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    paths.push(path);
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    const cursor = new URL(path, "https://whispr.test").searchParams.get("cursor");
    return Response.json({
      releases: [release(cursor ? "0.8.15" : refreshed ? "0.9.1" : "0.9.0")],
      total: 2,
      nextCursor: cursor ? null : "date|id",
    });
  });
  const options = releaseListOptions("0.9.0");
  await client.fetchInfiniteQuery(options);
  const observer = new InfiniteQueryObserver(client, options);
  const next = await observer.fetchNextPage();
  assert.deepEqual(
    next.data?.pages.flatMap((page) => page.releases.map((entry) => entry.version)),
    ["0.9.0", "0.8.15"],
  );
  assert.match(paths[1]!, /cursor=date%7Cid/u);
  assert.equal(next.hasNextPage, false);
  refreshed = true;
  await client.refetchQueries({ queryKey: ["release-notes"] });
  assert.equal(
    client.getQueryData<{ pages: Array<{ releases: Array<{ version: string }> }> }>(
      options.queryKey,
    )?.pages[0]?.releases[0]?.version,
    "0.9.1",
  );
  observer.destroy();
});

it("validates detail payloads and fails safely on HTTP or schema errors", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  let response = Response.json({
    ...release("0.9.0"),
    changes: [{ title: "Fixed", type: "fixed" }],
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => response);
  const options = releaseDetailOptions("0.9.0", "0.9.0");
  assert.equal((await client.fetchQuery(options)).changes[0]?.title, "Fixed");
  response = new Response("sensitive server error", { status: 500 });
  await assert.rejects(client.fetchQuery({ ...options, staleTime: 0 }), {
    message: "Unable to load release notes",
  });
  response = Response.json({ changes: "invalid" });
  await assert.rejects(client.fetchQuery({ ...options, staleTime: 0 }));
  assert.equal(fetch.mock.callCount(), 3);
});
