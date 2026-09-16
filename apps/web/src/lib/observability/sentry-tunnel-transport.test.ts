import assert from "node:assert/strict";
import https from "node:https";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough, Writable } from "node:stream";
import { it, type TestContext } from "node:test";
import { postSentryEnvelope } from "./sentry-tunnel-transport";

function upstream(t: TestContext, send: (response: PassThrough & IncomingMessage) => void) {
  const calls: Array<{ url: URL; options: RequestOptions; body: Buffer[] }> = [];
  t.mock.method(
    https,
    "request",
    (url: URL, options: RequestOptions, onResponse: (response: IncomingMessage) => void) => {
      const call = { url, options, body: [] as Buffer[] };
      calls.push(call);
      return new Writable({
        write(chunk, _encoding, callback) {
          call.body.push(Buffer.from(chunk));
          callback();
        },
        final(callback) {
          const response = new PassThrough() as PassThrough & IncomingMessage;
          response.statusCode = 200;
          response.headers = {};
          onResponse(response);
          send(response);
          callback();
        },
      }) as unknown as ClientRequest;
    },
  );
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return calls;
}

it("uses a bounded reusable IPv4 TLS pool and sends only envelope headers and bytes", async (t) => {
  const calls = upstream(t, (response) => response.end("{}"));
  const body = Buffer.from([0, 128, 255]);
  const signal = new AbortController().signal;
  const target = new URL("https://o123.ingest.de.sentry.io/api/456/envelope/");
  for (let i = 0; i < 2; i++)
    assert.equal((await postSentryEnvelope(target, body, signal)).status, 200);
  assert.equal(calls.length, 2);
  const [first, second] = calls;
  assert.ok(first && second);
  assert.equal(first.url.href, target.href);
  assert.deepEqual(Buffer.concat(first.body), body);
  assert.deepEqual(first.options.headers, {
    "content-type": "application/x-sentry-envelope",
    "content-length": 3,
  });
  assert.equal(first.options.signal, signal);
  assert.equal(first.options.method, "POST");
  assert.equal(first.options.family, 4);
  assert.equal(first.options.agent, second.options.agent);
  const agent = first.options.agent as https.Agent;
  assert.ok(agent.maxSockets > 0 && agent.maxSockets <= 8);
  assert.ok(agent.maxTotalSockets > 0 && agent.maxTotalSockets <= 8);
  assert.notEqual(agent.options.rejectUnauthorized, false);
});

it("destroys oversized upstream responses instead of buffering or leaving them open", async (t) => {
  let response!: PassThrough & IncomingMessage;
  upstream(t, (value) => {
    response = value;
    value.end(Buffer.alloc(65_537));
  });
  await assert.rejects(
    postSentryEnvelope(
      new URL("https://o123.ingest.de.sentry.io/api/456/envelope/"),
      Buffer.from("{}"),
      new AbortController().signal,
    ),
    /size limit/,
  );
  assert.equal(response.destroyed, true);
});

it("propagates broken response streams without retrying a potentially delivered envelope", async (t) => {
  const calls = upstream(t, (response) => response.destroy(new Error("connection closed")));
  await assert.rejects(
    postSentryEnvelope(
      new URL("https://o123.ingest.de.sentry.io/api/456/envelope/"),
      Buffer.from("{}"),
      new AbortController().signal,
    ),
    /connection closed/,
  );
  assert.equal(calls.length, 1);
});
