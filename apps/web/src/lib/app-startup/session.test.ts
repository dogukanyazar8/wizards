import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getInitialShellSplashPhase,
  hasSeenShellStartupSplash,
  markShellStartupSplashSeen,
  resetShellStartupSplashSeenForTests,
  resolveShellSplashPhaseForClientSession,
} from "./session";

type FakeSessionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function withSessionStorage(storage: FakeSessionStorage, run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  });

  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

describe("app startup session state", () => {
  afterEach(() => {
    resetShellStartupSplashSeenForTests();
  });

  it("shows the shell splash on a fresh browser runtime", () => {
    assert.equal(hasSeenShellStartupSplash(), false);
    assert.equal(getInitialShellSplashPhase(), "showing");
  });

  it("dismisses repeated shell splash mounts within the same runtime", () => {
    markShellStartupSplashSeen();

    assert.equal(hasSeenShellStartupSplash(), true);
    assert.equal(getInitialShellSplashPhase(), "dismissed");
  });

  it("persists the seen marker for a reload in the same tab or WebView", () => {
    const values = new Map<string, string>();

    withSessionStorage(
      {
        getItem: (key) => values.get(key) ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, value),
      },
      () => {
        markShellStartupSplashSeen();

        assert.deepEqual([...values.values()], ["1"]);
      },
    );
  });

  it("restores the seen marker without changing the hydration-safe initial phase", () => {
    withSessionStorage(
      {
        getItem: () => "1",
        removeItem: () => undefined,
        setItem: () => undefined,
      },
      () => {
        assert.equal(getInitialShellSplashPhase(), "showing");
        assert.equal(hasSeenShellStartupSplash(), true);
        assert.equal(resolveShellSplashPhaseForClientSession("showing"), "dismissed");
      },
    );
  });

  it("marks a fresh client session while keeping its first splash visible", () => {
    const values = new Map<string, string>();

    withSessionStorage(
      {
        getItem: (key) => values.get(key) ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, value),
      },
      () => {
        assert.equal(resolveShellSplashPhaseForClientSession("showing"), "showing");
        assert.equal(hasSeenShellStartupSplash(), true);
      },
    );
  });

  it("keeps the first resolution stable across StrictMode effect replay", () => {
    const values = new Map<string, string>();

    withSessionStorage(
      {
        getItem: (key) => values.get(key) ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, value),
      },
      () => {
        const firstResolution = resolveShellSplashPhaseForClientSession("showing");
        const replayedResolution = resolveShellSplashPhaseForClientSession(
          "showing",
          firstResolution,
        );

        assert.equal(firstResolution, "showing");
        assert.equal(replayedResolution, "showing");
      },
    );
  });

  it("keeps the module fallback when session storage is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.defineProperty({}, "sessionStorage", {
        get() {
          throw new Error("storage denied");
        },
      }),
    });

    try {
      assert.doesNotThrow(() => markShellStartupSplashSeen());
      assert.equal(hasSeenShellStartupSplash(), true);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "window", descriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
