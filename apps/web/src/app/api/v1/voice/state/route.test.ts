import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { deleteVoiceStateRoute, postVoiceStateRoute } from "./route-logic";

const sessionId = "11111111-1111-4111-8111-111111111111";

function jsonRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/voice/state", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function deleteRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/voice/state", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "DELETE",
  });
}

function validBody() {
  return {
    channelId: "voice-1",
    serverId: "server-1",
    sessionId,
  };
}

function routeDependencies(
  overrides: Partial<Parameters<typeof postVoiceStateRoute>[1]> &
    Partial<Parameters<typeof deleteVoiceStateRoute>[1]> = {},
) {
  return {
    clearVoiceState: async () => ({
      channelId: "voice-1",
      id: "voice-state-1",
      serverId: "server-1",
      sessionId,
      userId: "user-1",
    }),
    emitVoiceStateUpdate: async () => undefined,
    enforceApiRateLimit: async () => undefined,
    getVoicePerformanceDurationMs: () => 25,
    getVoicePerformanceErrorMetadata: (error: unknown) =>
      error instanceof ApiError
        ? {
            ...(error.code ? { errorCode: error.code } : {}),
            status: error.status,
          }
        : {},
    getVoicePerformanceNow: () => 1_000,
    jsonError,
    logError: () => undefined,
    parseJsonBody,
    readRequestAttribution: () => ({ appVersion: null, clientType: "UNKNOWN" as const }),
    recordVoicePerformanceMetric: () => undefined,
    requireApiUserId: async () => "user-1",
    upsertVoiceState: async () => ({
      channelId: "voice-1",
      participants: [],
      serverId: "server-1",
      sessionId,
    }),
    ...overrides,
  };
}

describe("voice state API route", () => {
  it("requires auth, rate limits joins, validates JSON, upserts state, emits fanout, and records success metrics", async () => {
    const calls: string[] = [];

    const response = await postVoiceStateRoute(
      jsonRequest(validBody()),
      routeDependencies({
        emitVoiceStateUpdate: async (payload) => {
          calls.push(
            `emit:${payload.action}:${payload.serverId}:${payload.channelId}:${payload.userId}`,
          );
        },
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        recordVoicePerformanceMetric: (metric) => {
          calls.push(`metric:${metric.operation}:${metric.result}:${metric.durationMs}`);
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "user-1";
        },
        upsertVoiceState: async (userId, input) => {
          calls.push(`upsert:${userId}:${input.serverId}:${input.channelId}:${input.sessionId}`);
          return {
            channelId: input.channelId,
            participants: [
              {
                avatarUrl: null,
                displayName: "Ada",
                isDeafened: false,
                userId,
                username: "ada",
              },
            ],
            serverId: input.serverId,
            sessionId: input.sessionId,
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      channelId: "voice-1",
      participants: [
        {
          avatarUrl: null,
          displayName: "Ada",
          isDeafened: false,
          userId: "user-1",
          username: "ada",
        },
      ],
      serverId: "server-1",
      sessionId,
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:voice:state",
      `upsert:user-1:server-1:voice-1:${sessionId}`,
      "emit:join:server-1:voice-1:user-1",
      "metric:voice_state_post:success:25",
    ]);
  });

  it("returns the shared 401 envelope for anonymous voice state joins", async () => {
    const response = await postVoiceStateRoute(
      jsonRequest(validBody()),
      routeDependencies({
        requireApiUserId: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "UNAUTHORIZED",
      error: "Unauthorized",
    });
  });

  it("returns the shared 400 envelope for invalid voice state payloads", async () => {
    const response = await postVoiceStateRoute(
      jsonRequest({ channelId: "", serverId: "server-1", sessionId: "not-a-uuid" }),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "String must contain at least 1 character(s)",
    });
  });

  it("returns the shared 429 envelope when voice joins are rate limited", async () => {
    const response = await postVoiceStateRoute(
      jsonRequest(validBody()),
      routeDependencies({
        enforceApiRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
  });

  it("requires auth, rate limits deletes, validates JSON, clears state, emits leave fanout, and records success metrics", async () => {
    const calls: string[] = [];

    const response = await deleteVoiceStateRoute(
      deleteRequest({ sessionId }),
      routeDependencies({
        clearVoiceState: async (userId, options) => {
          calls.push(`clear:${userId}:${options?.expectedSessionId}`);
          return {
            channelId: "voice-1",
            id: "voice-state-1",
            serverId: "server-1",
            sessionId,
            userId,
          };
        },
        emitVoiceStateUpdate: async (payload) => {
          calls.push(
            `emit:${payload.action}:${payload.serverId}:${payload.channelId}:${payload.userId}`,
          );
        },
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        recordVoicePerformanceMetric: (metric) => {
          calls.push(`metric:${metric.operation}:${metric.result}:${metric.durationMs}`);
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "user-1";
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:voice:state",
      `clear:user-1:${sessionId}`,
      "emit:leave:server-1:voice-1:user-1",
      "metric:voice_state_delete:success:25",
    ]);
  });

  it("returns the shared 400 envelope for invalid voice state delete payloads", async () => {
    const response = await deleteVoiceStateRoute(
      deleteRequest({ sessionId: "not-a-uuid" }),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Invalid uuid",
    });
  });
});
