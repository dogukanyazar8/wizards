import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isRouteDataLoading, toSplashRuntimeInput, type ShellReadinessInput } from "./readiness";

const readyInput: ShellReadinessInput = {
  activeServerDetailLoading: false,
  appearanceHydrated: true,
  dmConversationsLoading: false,
  layoutSettingsLoaded: true,
  realtimeConnected: true,
  route: "other",
  serversLoading: false,
};

const extras = {
  bootstrapRequestSettled: true,
  elapsedMs: 0,
  online: true,
  sessionExpired: false,
  update: null,
};

describe("isRouteDataLoading", () => {
  it("only waits for the data the open route actually needs", () => {
    assert.equal(
      isRouteDataLoading({
        ...readyInput,
        activeServerDetailLoading: true,
        route: "server-channel",
      }),
      true,
    );
    assert.equal(
      isRouteDataLoading({ ...readyInput, activeServerDetailLoading: true, route: "dm-list" }),
      false,
    );
    assert.equal(
      isRouteDataLoading({ ...readyInput, dmConversationsLoading: true, route: "dm-conversation" }),
      true,
    );
    assert.equal(
      isRouteDataLoading({ ...readyInput, dmConversationsLoading: true, route: "settings" }),
      false,
    );
  });
});

describe("toSplashRuntimeInput", () => {
  it("folds appearance and layout into one session signal", () => {
    assert.equal(
      toSplashRuntimeInput({ ...readyInput, appearanceHydrated: false }, extras).sessionHydrated,
      false,
    );
    assert.equal(
      toSplashRuntimeInput({ ...readyInput, layoutSettingsLoaded: false }, extras).sessionHydrated,
      false,
    );
    assert.equal(toSplashRuntimeInput(readyInput, extras).sessionHydrated, true);
  });

  it("counts route data as part of the workspace phase", () => {
    assert.equal(
      toSplashRuntimeInput(
        { ...readyInput, activeServerDetailLoading: true, route: "server-channel" },
        extras,
      ).workspaceLoaded,
      false,
    );
    assert.equal(
      toSplashRuntimeInput(
        { ...readyInput, dmConversationsLoading: true, route: "dm-list" },
        extras,
      ).workspaceLoaded,
      false,
    );
    // Aynı yükleme, o veriyi istemeyen bir rotada aşamayı tutmaz.
    assert.equal(
      toSplashRuntimeInput(
        { ...readyInput, dmConversationsLoading: true, route: "settings" },
        extras,
      ).workspaceLoaded,
      true,
    );
  });

  it("passes the shell-external signals through untouched", () => {
    const update = { downloadedBytes: 4, totalBytes: 8, version: "2.5.0" };
    const mapped = toSplashRuntimeInput(readyInput, {
      bootstrapRequestSettled: false,
      elapsedMs: 12_000,
      online: false,
      sessionExpired: true,
      update,
    });

    assert.equal(mapped.bootstrapRequestSettled, false);
    assert.equal(mapped.elapsedMs, 12_000);
    assert.equal(mapped.online, false);
    assert.equal(mapped.sessionExpired, true);
    assert.equal(mapped.update, update);
    assert.equal(mapped.realtimeConnected, readyInput.realtimeConnected);
  });
});
