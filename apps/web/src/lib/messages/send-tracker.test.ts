import assert from "node:assert/strict";
import { it } from "node:test";
import type { Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  MessageSendAck,
  ServerToClientEvents,
} from "@/lib/socket/events";
import { createMessageSendTracker } from "./send-tracker";

it("correlates reverse replies and ignores an old retry, confirmed echo, or disposed view", () => {
  const callbacks: Array<(error: Error | null, ack?: MessageSendAck) => void> = [];
  const emitted: Array<{ event: string; payload: { clientNonce: string } }> = [];
  const socket = {
    timeout(ms: number) {
      assert.equal(ms, 10_000);
      return this;
    },
    emit(event: string, payload: { clientNonce: string }, callback: (typeof callbacks)[number]) {
      emitted.push({ event, payload });
      callbacks.push(callback);
    },
  } as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;
  const tracker = createMessageSendTracker(socket);
  const outcomes: string[] = [];
  const send = (nonce: string, mode: "channel" | "dm" = "channel") =>
    tracker.send(
      mode,
      "conversation",
      {
        clientNonce: nonce,
        content: "same message",
        attachments: [],
      },
      (result) => outcomes.push(`${nonce}:${result.ok}`),
    );
  send("one");
  send("two", "dm");
  callbacks[1]!(null, { ok: true, messageId: "server-two" });
  callbacks[0]!(null, { ok: false, code: "SLOW_MODE", message: "wait" });
  assert.deepEqual(outcomes, ["two:true", "one:false"]);
  send("retry");
  send("retry");
  callbacks[2]!(new Error("old timeout"));
  assert.equal(outcomes.length, 2);
  callbacks[3]!(new Error("current timeout"));
  assert.equal(outcomes.at(-1), "retry:false");
  send("echo");
  tracker.confirm("echo");
  callbacks[4]!(new Error("late timeout"));
  send("unmounted");
  tracker.dispose();
  callbacks[5]!(null, { ok: true, messageId: "id" });
  assert.equal(outcomes.length, 3);
  assert.deepEqual(
    emitted.map((e) => e.event),
    [
      "message:send",
      "dm:message:send",
      "message:send",
      "message:send",
      "message:send",
      "message:send",
    ],
  );
  assert.equal(emitted[2]?.payload.clientNonce, emitted[3]?.payload.clientNonce);
});
