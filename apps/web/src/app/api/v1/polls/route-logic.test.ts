import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pollCreateRoute, type PollRouteDependencies } from "./route-logic";

const draft = {
  anonymous: true,
  duration: "24h",
  multi: false,
  options: ["Evet", "Hayır"],
  question: "Devam edelim mi?",
};

function dependencies(calls: unknown[]): PollRouteDependencies {
  return {
    authenticate: async () => "user-1",
    castVote: async () => {
      throw new Error("unused");
    },
    createPoll: (async (input: unknown) => {
      calls.push(input);
      return { id: "message-1" };
    }) as PollRouteDependencies["createPoll"],
    emitUpdated: () => undefined,
    enforceRateLimit: async () => undefined,
    getIo: () => null,
    getPoll: async () => {
      throw new Error("unused");
    },
    listVoters: async () => [],
  };
}

function request(body: unknown) {
  return new Request("https://whispr.local/api/v1/polls", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("poll create route targets", () => {
  it("accepts exactly one channel target", async () => {
    const calls: unknown[] = [];
    const response = await pollCreateRoute(
      request({ ...draft, channelId: "channel-1" }),
      dependencies(calls),
    );

    assert.equal(response.status, 201);
    assert.equal((calls[0] as { channelId?: string }).channelId, "channel-1");
    assert.equal("conversationId" in (calls[0] as object), false);
  });

  it("rejects missing or ambiguous targets", async () => {
    for (const body of [draft, { ...draft, channelId: "channel-1", conversationId: "dm-1" }]) {
      const response = await pollCreateRoute(request(body), dependencies([]));

      assert.equal(response.status, 400);
    }
  });
});
