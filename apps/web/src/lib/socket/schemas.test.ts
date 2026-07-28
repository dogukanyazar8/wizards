import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../api";
import {
  parseSocketPayload,
  SocketMessageReactionPayloadSchema,
  SocketMessageSendPayloadSchema,
  SocketVoiceScreenSharePayloadSchema,
} from "./schemas";

describe("socket payload schemas", () => {
  it("accepts a minimal channel message payload", () => {
    assert.deepEqual(
      parseSocketPayload(SocketMessageSendPayloadSchema, {
        channelId: "channel-1",
        content: "hello",
      }),
      {
        channelId: "channel-1",
        content: "hello",
      },
    );
  });

  /**
   * The nonce is client-supplied and comes straight back to that same client, so
   * the only thing standing between it and an unbounded echo is this schema.
   */
  it("bounds the optimistic-bubble nonce", () => {
    assert.deepEqual(
      parseSocketPayload(SocketMessageSendPayloadSchema, {
        channelId: "channel-1",
        clientNonce: "optimistic-1-1",
        content: "hello",
      }),
      {
        channelId: "channel-1",
        clientNonce: "optimistic-1-1",
        content: "hello",
      },
    );
    assert.throws(
      () =>
        parseSocketPayload(SocketMessageSendPayloadSchema, {
          channelId: "channel-1",
          clientNonce: "n".repeat(129),
          content: "hello",
        }),
      ApiError,
    );
  });

  it("rejects unknown fields at the socket boundary", () => {
    assert.throws(
      () =>
        parseSocketPayload(SocketMessageReactionPayloadSchema, {
          emoji: "👍",
          messageId: "message-1",
          userId: "attacker-controlled-user",
        }),
      ApiError,
    );
  });

  it("rejects malformed voice screen-share payloads", () => {
    assert.throws(
      () =>
        parseSocketPayload(SocketVoiceScreenSharePayloadSchema, {
          channelId: "voice-1",
          isScreenSharing: "true",
          serverId: "server-1",
        }),
      ApiError,
    );
  });
});
