import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mobileDMHideRoute,
  mobileDMSetMutedRoute,
  type MobileDMConversationRouteDependencies,
} from "./route-logic";

type Recorded = {
  hidden: Array<{ conversationId: string; userId: string }>;
  limits: string[];
  muted: Array<{ conversationId: string; input: unknown; userId: string }>;
};

function createDependencies(overrides: Partial<MobileDMConversationRouteDependencies> = {}): {
  dependencies: MobileDMConversationRouteDependencies;
  recorded: Recorded;
} {
  const recorded: Recorded = { hidden: [], limits: [], muted: [] };

  return {
    dependencies: {
      authenticate: async () => "user-1",
      enforceRateLimit: async (_userId, action) => {
        recorded.limits.push(action);
      },
      hideConversation: async (userId, conversationId) => {
        recorded.hidden.push({ conversationId, userId });
      },
      setMuted: async (userId, conversationId, input) => {
        recorded.muted.push({ conversationId, input, userId });
      },
      ...overrides,
    },
    recorded,
  };
}

function request(body?: unknown): Request {
  return new Request("https://app.test/api/v1/mobile/dm/dm-group-1/mute", {
    ...(body === undefined
      ? { method: "DELETE" }
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
  });
}

const context = { params: Promise.resolve({ conversationId: "dm-group-1" }) };

describe("mobile DM conversation switches", () => {
  it("mutes the conversation for the bearer identity", async () => {
    const { dependencies, recorded } = createDependencies();

    const response = await mobileDMSetMutedRoute(request({ muted: true }), context, dependencies);

    assert.equal(response.status, 200);
    assert.deepEqual(recorded.muted, [
      { conversationId: "dm-group-1", input: { muted: true }, userId: "user-1" },
    ]);
    assert.deepEqual(recorded.limits, ["mobile:dm:mute"]);
  });

  // Karar K1. §17's duration ladder is the shared contract, so the phone reaches
  // the same service through the same schema rather than a mobile-only shape.
  it("forwards the mute duration the shared submenu contract carries", async () => {
    const { dependencies, recorded } = createDependencies();

    const response = await mobileDMSetMutedRoute(
      request({ duration: "8h", muted: true }),
      context,
      dependencies,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(recorded.muted, [
      { conversationId: "dm-group-1", input: { duration: "8h", muted: true }, userId: "user-1" },
    ]);
  });

  it("rejects a duration outside the submenu ladder", async () => {
    const { dependencies, recorded } = createDependencies();

    const response = await mobileDMSetMutedRoute(
      request({ duration: "3h", muted: true }),
      context,
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.muted, []);
  });

  it("rejects a mute body that is not a boolean", async () => {
    const { dependencies, recorded } = createDependencies();

    const response = await mobileDMSetMutedRoute(request({ muted: "yes" }), context, dependencies);

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.muted, []);
  });

  it("hides the conversation for the bearer identity", async () => {
    const { dependencies, recorded } = createDependencies();

    const response = await mobileDMHideRoute(request(), context, dependencies);

    assert.equal(response.status, 200);
    assert.deepEqual(recorded.hidden, [{ conversationId: "dm-group-1", userId: "user-1" }]);
    assert.deepEqual(recorded.limits, ["mobile:dm:hide"]);
  });

  it("never touches the conversation when the token does not resolve", async () => {
    const { dependencies, recorded } = createDependencies({
      authenticate: async () => {
        throw new Error("Unauthorized");
      },
    });

    const muteResponse = await mobileDMSetMutedRoute(
      request({ muted: true }),
      context,
      dependencies,
    );
    const hideResponse = await mobileDMHideRoute(request(), context, dependencies);

    assert.equal(muteResponse.status >= 400, true);
    assert.equal(hideResponse.status >= 400, true);
    assert.deepEqual(recorded.muted, []);
    assert.deepEqual(recorded.hidden, []);
  });
});
