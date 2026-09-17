import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../api";
import {
  parseSocketPayload,
  SocketMessageReactionPayloadSchema,
  SocketMessageSendPayloadSchema,
  SocketVoiceScreenSharePayloadSchema,
  SocketVoiceScreenShareWatchPayloadSchema,
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

  /** Ekran paylaşımı Ş0.1 — K8 Go Live presence, K11 izleyen listesi. */
  describe("screen share presence and watch payloads", () => {
    const share = { channelId: "voice-1", isScreenSharing: true, serverId: "server-1" };

    it("keeps the pre-K8 payload valid and accepts an optional stream block", () => {
      assert.deepEqual(parseSocketPayload(SocketVoiceScreenSharePayloadSchema, share), share);

      for (const stream of [
        { kind: "screen", gameId: null, label: null },
        { kind: "window", gameId: null, label: null },
        { kind: "game", gameId: "valorant", label: null },
        { kind: "game", gameId: "custom:0a1b2c3d4e5f", label: "Hades" },
        { kind: "game", gameId: null, label: null },
      ]) {
        assert.deepEqual(
          parseSocketPayload(SocketVoiceScreenSharePayloadSchema, { ...share, stream }),
          { ...share, stream },
        );
      }
    });

    it("rejects a stream block that smuggles an exe name, a title, or a bad label", () => {
      for (const stream of [
        { kind: "tab", gameId: null, label: null },
        { kind: "game", gameId: "valorant" },
        { kind: "game", gameId: null, label: null, executable: "hades.exe" },
        { kind: "game", gameId: null, label: null, windowTitle: "Hades" },
        { kind: "game", gameId: "valorant", label: "" },
        { kind: "game", gameId: "valorant", label: "H".repeat(65) },
        { kind: "game", gameId: "valorant", label: "Hades\u0000" },
        null,
        "game",
      ]) {
        assert.throws(
          () => parseSocketPayload(SocketVoiceScreenSharePayloadSchema, { ...share, stream }),
          ApiError,
          JSON.stringify(stream),
        );
      }
    });

    it("accepts a watch toggle and refuses anything extra or missing", () => {
      const watch = {
        channelId: "voice-1",
        serverId: "server-1",
        sharerUserId: "user-1",
        watching: true,
      };

      assert.deepEqual(parseSocketPayload(SocketVoiceScreenShareWatchPayloadSchema, watch), watch);
      assert.deepEqual(
        parseSocketPayload(SocketVoiceScreenShareWatchPayloadSchema, { ...watch, watching: false }),
        { ...watch, watching: false },
      );

      for (const payload of [
        { ...watch, watching: "yes" },
        { ...watch, sharerUserId: "" },
        { ...watch, sharerUserId: "u".repeat(129) },
        { channelId: "voice-1", serverId: "server-1", watching: true },
        { ...watch, count: 3 },
        { ...watch, userId: "attacker-controlled-user" },
      ]) {
        assert.throws(
          () => parseSocketPayload(SocketVoiceScreenShareWatchPayloadSchema, payload),
          ApiError,
          JSON.stringify(payload),
        );
      }
    });
  });
});
