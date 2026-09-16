import assert from "node:assert/strict";
import { it } from "node:test";
import { createSentryTunnelHandler } from "./sentry-tunnel";

const dsn = "https://public-key@o123.ingest.de.sentry.io/456";
const envelope = Buffer.concat([
  Buffer.from(`${JSON.stringify({ dsn })}\n{"type":"event","length":4}\n`),
  Buffer.from([0, 128, 254, 255]),
]);

function request(body: BodyInit = envelope, headers: HeadersInit = {}, signal?: AbortSignal) {
  return new Request("https://app.test/monitoring?o=999&p=888&r=us", {
    method: "POST",
    body,
    headers,
    signal: signal ?? null,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

it("forwards envelope bytes only to the configured project, ignoring legacy query targets", async () => {
  let calls = 0;
  const handler = createSentryTunnelHandler({
    dsn,
    transport: async (target, body) => {
      calls++;
      assert.equal(target.href, "https://o123.ingest.de.sentry.io/api/456/envelope/");
      assert.deepEqual(body, envelope);
      return {
        status: 200,
        headers: { "set-cookie": "secret=value", "x-sentry-rate-limits": "60:error:organization" },
      };
    },
  });
  const response = await handler(
    request(envelope, { cookie: "session=secret", authorization: "Bearer secret" }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-sentry-rate-limits"), "60:error:organization");
});

it("rejects unconfigured, foreign and malformed DSNs before any network call", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return { status: 200, headers: {} };
  };
  for (const invalid of [
    undefined,
    "http://public-key@o123.ingest.de.sentry.io/456",
    "https://key@127.0.0.1/456",
    "https://key@o123.ingest.de.sentry.io.evil.test/456",
    `${dsn}?x=1`,
    `${dsn}#fragment`,
    "https://key:secret@o123.ingest.de.sentry.io/456",
  ]) {
    assert.equal(
      (await createSentryTunnelHandler({ dsn: invalid, transport })(request())).status,
      503,
    );
  }
  const handler = createSentryTunnelHandler({ dsn, transport });
  for (const body of [
    "",
    "{}",
    "null\n{}",
    "{}\n{}",
    "not-json\n{}",
    `${JSON.stringify({ dsn: "https://other@o123.ingest.de.sentry.io/456" })}\n{}`,
    `${JSON.stringify({ dsn: "https://public-key@o123.ingest.de.sentry.io/999" })}\n{}`,
    `${JSON.stringify({ dsn: "http://127.0.0.1:8080/456" })}\n{}`,
    "x".repeat(16_385) + "\n{}",
  ]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(calls, 0);
});

it("bounds declared and streamed bodies, cancelling oversized input", async () => {
  let calls = 0;
  let cancelled = false;
  const handler = createSentryTunnelHandler({
    dsn,
    transport: async () => {
      calls++;
      return { status: 200, headers: {} };
    },
  });
  assert.equal((await handler(request(envelope, { "content-length": "1048577" }))).status, 413);
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1_048_577));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal((await handler(request(body))).status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
  assert.equal((await handler(request(envelope, { "content-encoding": "gzip" }))).status, 415);
});

it("preserves Sentry rate limiting without reflecting upstream bodies or redirects", async () => {
  for (const [upstream, expected] of [
    [429, 429],
    [400, 400],
    [503, 502],
    [302, 502],
  ] as const) {
    const handler = createSentryTunnelHandler({
      dsn,
      transport: async () => ({
        status: upstream,
        headers: {
          "retry-after": "60",
          "x-sentry-rate-limits": "60::organization",
          location: "https://evil.test",
          "set-cookie": "secret=value",
        },
      }),
    });
    const response = await handler(request());
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    if (upstream === 429) {
      assert.equal(response.headers.get("retry-after"), "60");
      assert.equal(response.headers.get("x-sentry-rate-limits"), "60::organization");
    }
    assert.ok(!(await response.text()).includes("secret"));
  }
});

it("bounds stalled uploads and aborts upstream work when the deadline expires", async () => {
  let cancelled = false;
  let forwarded = false;
  const handler = createSentryTunnelHandler({
    dsn,
    timeoutMs: 20,
    transport: async () => {
      forwarded = true;
      return { status: 200, headers: {} };
    },
  });
  const stalled = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  assert.equal((await handler(request(stalled))).status, 408);
  assert.equal(cancelled, true);
  assert.equal(forwarded, false);
  let aborted = false;
  const timeoutHandler = createSentryTunnelHandler({
    dsn,
    timeoutMs: 20,
    transport: async (_target, _body, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  assert.equal((await timeoutHandler(request())).status, 504);
  assert.equal(aborted, true);
});

it("cancels disconnected requests and releases concurrency slots on failure", async (t) => {
  t.mock.method(console, "warn", () => {});
  const controller = new AbortController();
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const handler = createSentryTunnelHandler({
    dsn,
    maxConcurrent: 1,
    transport: async (_target, _body, signal) => {
      start();
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    },
  });
  const pending = handler(request(envelope, {}, controller.signal));
  await started;
  const busy = await handler(request());
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get("retry-after"), "1");
  controller.abort();
  assert.equal((await pending).status, 499);
  // An already cancelled request must not consume the released slot or call the transport.
  assert.equal((await handler(request(envelope, {}, controller.signal))).status, 499);
  let calls = 0;
  const recoverable = createSentryTunnelHandler({
    dsn,
    maxConcurrent: 1,
    transport: async () => {
      if (++calls === 1)
        throw Object.assign(new Error("sensitive internal hostname"), { code: "ECONNRESET" });
      return { status: 200, headers: {} };
    },
  });
  const failed = await recoverable(request());
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes("sensitive"));
  assert.equal((await recoverable(request())).status, 200);
  assert.equal(calls, 2);
});

it("rejects non-POST requests without forwarding them", async () => {
  const handler = createSentryTunnelHandler({
    dsn,
    transport: async () => {
      assert.fail("must not forward");
    },
  });
  assert.equal((await handler(new Request("https://app.test/monitoring"))).status, 405);
});
