import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS,
  MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS,
  MOBILE_CONNECTIVITY_RESTORED_HOLD_MS,
  createInitialMobileConnectivityPresentation,
  getMobileConnectivityHealth,
  planMobileConnectivityPresentation,
  type MobileConnectivityHealth,
  type MobileConnectivityPresentation,
} from "../src/app/mobile-connectivity-presentation";
import {
  createInitialMobileRealtimeSnapshot,
  mobileRealtimeReducer,
} from "../src/realtime/mobile-realtime-state";
import type { MobileRealtimeConnectionSnapshot } from "../src/realtime/mobile-realtime-contract";

function connected(): MobileRealtimeConnectionSnapshot {
  return mobileRealtimeReducer(
    mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
      now: 1_000,
      type: "connect-started",
    }),
    { now: 1_100, type: "connected" },
  );
}

function dropped(): MobileRealtimeConnectionSnapshot {
  return mobileRealtimeReducer(connected(), { now: 2_000, type: "disconnected" });
}

/** Advances a presentation the way the hook does: re-plan whenever asked to. */
function advance(input: {
  from: MobileConnectivityPresentation;
  health: MobileConnectivityHealth;
  healthSince: number;
  now: number;
}): MobileConnectivityPresentation {
  return planMobileConnectivityPresentation({
    health: input.health,
    healthSince: input.healthSince,
    now: input.now,
    previous: input.from,
  });
}

describe("mobile connectivity health", () => {
  it("reads a lost network as offline even before sign-in finishes", () => {
    assert.equal(
      getMobileConnectivityHealth({
        authStatus: "checking",
        networkStatus: "offline",
        realtime: createInitialMobileRealtimeSnapshot(),
      }),
      "offline",
    );
  });

  it("reads a backgrounded app as irrelevant, because the socket is closed on purpose", () => {
    assert.equal(
      getMobileConnectivityHealth({
        authStatus: "signed-in",
        networkStatus: "online",
        realtime: mobileRealtimeReducer(connected(), {
          now: 3_000,
          type: "visibility-changed",
          visibility: "background",
        }),
      }),
      "irrelevant",
    );
  });

  it("reads a dropped socket on a live network as degraded", () => {
    assert.equal(
      getMobileConnectivityHealth({
        authStatus: "signed-in",
        networkStatus: "online",
        realtime: dropped(),
      }),
      "degraded",
    );
  });

  it("reads a live socket as healthy", () => {
    assert.equal(
      getMobileConnectivityHealth({
        authStatus: "signed-in",
        networkStatus: "online",
        realtime: connected(),
      }),
      "healthy",
    );
  });

  it("stays healthy on the auth screens, where there is no socket to report", () => {
    assert.equal(
      getMobileConnectivityHealth({
        authStatus: "signed-out",
        networkStatus: "online",
        realtime: createInitialMobileRealtimeSnapshot(),
      }),
      "healthy",
    );
  });
});

describe("mobile connectivity presentation", () => {
  it("starts hidden", () => {
    assert.equal(createInitialMobileConnectivityPresentation(0).phase, "hidden");
  });

  it("never surfaces a socket blip that heals inside the grace window", () => {
    const hidden = createInitialMobileConnectivityPresentation(0);

    const duringBlip = advance({
      from: hidden,
      health: "degraded",
      healthSince: 1_000,
      now: 1_400,
    });
    assert.equal(duringBlip.phase, "hidden");

    const afterBlip = advance({
      from: duringBlip,
      health: "healthy",
      healthSince: 1_500,
      now: 1_500,
    });
    assert.equal(afterBlip.phase, "hidden");
  });

  it("asks to be re-checked exactly when the grace window ends", () => {
    const pending = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "degraded",
      healthSince: 1_000,
      now: 1_400,
    });

    assert.equal(pending.nextCheckInMs, MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS - 400);
  });

  it("surfaces a sustained reconnect once the grace window passes", () => {
    const shown = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "degraded",
      healthSince: 1_000,
      now: 1_000 + MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS,
    });

    assert.equal(shown.phase, "reconnecting");
    assert.equal(shown.nextCheckInMs, null);
  });

  it("surfaces a lost network faster than a reconnect, because the user caused it", () => {
    const hidden = createInitialMobileConnectivityPresentation(0);

    assert.equal(
      advance({ from: hidden, health: "offline", healthSince: 0, now: 200 }).phase,
      "hidden",
    );
    assert.equal(
      advance({
        from: hidden,
        health: "offline",
        healthSince: 0,
        now: MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS,
      }).phase,
      "offline",
    );
  });

  it("morphs offline straight into reconnecting with no hidden gap", () => {
    const offline = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "offline",
      healthSince: 0,
      now: 1_000,
    });
    assert.equal(offline.phase, "offline");

    // Airplane mode off: the network is back but the socket has not landed yet.
    const morphed = advance({ from: offline, health: "degraded", healthSince: 1_100, now: 1_100 });

    assert.equal(morphed.phase, "reconnecting");
    assert.equal(morphed.since, 1_100);
  });

  it("closes a visible outage with a restored note instead of vanishing", () => {
    const reconnecting = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "degraded",
      healthSince: 0,
      now: MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS,
    });

    const restored = advance({
      from: reconnecting,
      health: "healthy",
      healthSince: 5_000,
      now: 5_000,
    });
    assert.equal(restored.phase, "restored");
    assert.equal(restored.nextCheckInMs, MOBILE_CONNECTIVITY_RESTORED_HOLD_MS);

    const stillHolding = advance({
      from: restored,
      health: "healthy",
      healthSince: 5_000,
      now: 5_000 + MOBILE_CONNECTIVITY_RESTORED_HOLD_MS - 1,
    });
    assert.equal(stillHolding.phase, "restored");

    const settled = advance({
      from: restored,
      health: "healthy",
      healthSince: 5_000,
      now: 5_000 + MOBILE_CONNECTIVITY_RESTORED_HOLD_MS,
    });
    assert.equal(settled.phase, "hidden");
  });

  it("skips the restored note when nothing was ever shown", () => {
    const settled = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "healthy",
      healthSince: 0,
      now: 10_000,
    });

    assert.equal(settled.phase, "hidden");
  });

  it("drops the bar immediately when the app leaves the foreground", () => {
    const reconnecting = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "degraded",
      healthSince: 0,
      now: MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS,
    });

    const backgrounded = advance({
      from: reconnecting,
      health: "irrelevant",
      healthSince: 4_000,
      now: 4_000,
    });

    assert.equal(backgrounded.phase, "hidden");
    assert.equal(backgrounded.nextCheckInMs, null);
  });

  it("keeps a shown reconnect up while it is still failing", () => {
    const shown = advance({
      from: createInitialMobileConnectivityPresentation(0),
      health: "degraded",
      healthSince: 0,
      now: MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS,
    });

    const later = advance({
      from: shown,
      health: "degraded",
      healthSince: 0,
      now: 30_000,
    });

    assert.equal(later.phase, "reconnecting");
    assert.equal(later.since, shown.since);
  });
});
