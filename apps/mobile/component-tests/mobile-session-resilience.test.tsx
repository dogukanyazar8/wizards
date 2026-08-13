import React, { useEffect } from "react";
import { Linking, Text, View } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as WebBrowser from "expo-web-browser";

import type { MobileSessionSnapshot } from "../src/auth/session-types";

type MobileRefreshImplementation = () => Promise<MobileSessionSnapshot>;

let mockRefreshCalls = 0;
let mockExchangeCalls = 0;
let mockAuthRevokeCalls = 0;
let mockAuthRevokeRefreshToken: string | null = null;
let mockPushRevokeCalls = 0;
let mockRefreshImplementation: MobileRefreshImplementation = async () => {
  throw new Error("refresh implementation was not configured for this test");
};
let mockExchangeImplementation: () => Promise<MobileSessionSnapshot> = async () =>
  buildRotatedSession();
let mockPushRevokeImplementation: (client: {
  requestJson<T>(path: string, options?: { method?: string }): Promise<T>;
}) => Promise<void> = async () => undefined;
let mockAuthRevokeImplementation: () => Promise<void> = async () => undefined;

jest.mock("../src/auth/mobile-auth-exchange", () => ({
  ...(jest.requireActual("../src/auth/mobile-auth-exchange") as object),
  exchangeMobileAuthHandoff: () => {
    mockExchangeCalls += 1;
    return mockExchangeImplementation();
  },
  refreshMobileAuthSession: () => {
    mockRefreshCalls += 1;
    return mockRefreshImplementation();
  },
  revokeMobileAuthSession: async (_client: unknown, input: { refreshToken: string }) => {
    mockAuthRevokeCalls += 1;
    mockAuthRevokeRefreshToken = input.refreshToken;
    await mockAuthRevokeImplementation();
  },
}));

jest.mock("../src/notifications/mobile-notification-client", () => ({
  revokeMobilePushToken: (client: Parameters<typeof mockPushRevokeImplementation>[0]) => {
    mockPushRevokeCalls += 1;
    return mockPushRevokeImplementation(client);
  },
}));

import { MobileApiError } from "../src/api/mobile-api-client";
import {
  MobileAuthProvider,
  useMobileAuth,
  type MobileAuthContextValue,
} from "../src/auth/mobile-auth-context";
import type { MobileAppLockPreferenceStore } from "../src/auth/mobile-app-lock-preference-store";
import type { MobileSessionRepository } from "../src/auth/session-store";
import type { MobileDeviceIntegrityDetector } from "../src/security/mobile-device-integrity";
import type { MobileBiometricAuthenticator } from "../src/security/mobile-app-lock";

const STORED_ACCESS_TOKEN = "mobile-access-token-stored-0123456789";
const ROTATED_ACCESS_TOKEN = "mobile-access-token-rotated-0123456789";

function buildSession(overrides: {
  accessToken: string;
  expiresAt: number;
  refreshToken: string | null;
}): MobileSessionSnapshot {
  return {
    lastValidatedAt: Date.now(),
    schemaVersion: 1,
    tokens: {
      accessToken: overrides.accessToken,
      expiresAt: overrides.expiresAt,
      issuedAt: overrides.expiresAt - 15 * 60_000,
      refreshToken: overrides.refreshToken,
      scopes: ["mobile:bootstrap"],
      tokenType: "Bearer",
    },
    user: {
      avatarUrl: null,
      displayName: "Ada Test",
      id: "user-1",
      username: "ada_test",
    },
  };
}

/** What the device finds on disk after being closed for longer than the access token TTL. */
function buildExpiredStoredSession(): MobileSessionSnapshot {
  return buildSession({
    accessToken: STORED_ACCESS_TOKEN,
    expiresAt: Date.now() - 60_000,
    refreshToken: "mobile-refresh-token-stored-0123456789",
  });
}

function buildRotatedSession(): MobileSessionSnapshot {
  return buildSession({
    accessToken: ROTATED_ACCESS_TOKEN,
    expiresAt: Date.now() + 15 * 60_000,
    refreshToken: "mobile-refresh-token-rotated-0123456789",
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createRepository(session: MobileSessionSnapshot | null) {
  const calls = { clear: 0, load: 0, saved: [] as MobileSessionSnapshot[] };
  const repository: MobileSessionRepository = {
    async clear() {
      calls.clear += 1;
    },
    async load() {
      calls.load += 1;
      return session;
    },
    async save(next) {
      calls.saved.push(next);
    },
  };

  return { calls, repository };
}

const appLockPreferenceStore: MobileAppLockPreferenceStore = {
  async load() {
    return false;
  },
  async save() {
    return undefined;
  },
};

const biometricAuthenticator: MobileBiometricAuthenticator = {
  async authenticate() {
    return { success: false };
  },
  async hasHardware() {
    return false;
  },
  async isEnrolled() {
    return false;
  },
};

const deviceIntegrityDetector: MobileDeviceIntegrityDetector = {
  isPhysicalDevice: () => true,
  async isRootedOrJailbroken() {
    return false;
  },
};

const runtimeConfig = {
  apiUrl: "https://mobile-session.test",
  environment: "development",
  releaseChannel: "development",
  socketUrl: "https://mobile-session.test",
  webUrl: "https://mobile-session.test",
} as const;

let harnessValue: MobileAuthContextValue | null = null;
let statusHistory: string[] = [];

function SessionHarness() {
  const value = useMobileAuth();

  useEffect(() => {
    harnessValue = value;
    statusHistory.push(value.status);
  }, [value]);

  return (
    <View>
      <Text testID="mobile-test-auth-status">{value.status}</Text>
      <Text testID="mobile-test-access-token">{value.session?.tokens.accessToken ?? "none"}</Text>
    </View>
  );
}

async function renderHarness(repository: MobileSessionRepository) {
  return await render(
    <MobileAuthProvider
      appLockPreferenceStore={appLockPreferenceStore}
      biometricAuthenticator={biometricAuthenticator}
      deviceIntegrityDetector={deviceIntegrityDetector}
      googleSignInClient={null}
      repository={repository}
      runtimeConfig={runtimeConfig}
      securitySignalLogger={{ log: () => undefined }}
    >
      <SessionHarness />
    </MobileAuthProvider>,
  );
}

function readText(view: Awaited<ReturnType<typeof renderHarness>>, testID: string) {
  return view.getByTestId(testID, { includeHiddenElements: true }).props.children;
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockAuthRevokeCalls = 0;
  mockAuthRevokeRefreshToken = null;
  mockExchangeCalls = 0;
  mockPushRevokeCalls = 0;
  mockRefreshCalls = 0;
  mockExchangeImplementation = async () => buildRotatedSession();
  mockPushRevokeImplementation = async () => undefined;
  mockAuthRevokeImplementation = async () => undefined;
  harnessValue = null;
  statusHistory = [];
});

describe("mobile session resilience", () => {
  it("keeps a stored session when the refresh fails for a transient reason", async () => {
    const { calls, repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = async () => {
      throw new MobileApiError("Whispr API request timed out.", { code: "timeout" });
    };

    const view = await renderHarness(repository);

    await waitFor(() => expect(mockRefreshCalls).toBe(1));
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));
    expect(readText(view, "mobile-test-access-token")).toBe(STORED_ACCESS_TOKEN);
    expect(calls.clear).toBe(0);
  });

  it("keeps a stored session when the device is offline at launch", async () => {
    const { calls, repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = async () => {
      throw new MobileApiError("Whispr API request failed before a response was received.", {
        code: "network_error",
      });
    };

    const view = await renderHarness(repository);

    await waitFor(() => expect(mockRefreshCalls).toBe(1));
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));
    expect(calls.clear).toBe(0);
  });

  it("keeps a stored session when the refresh endpoint rate limits the device", async () => {
    const { calls, repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = async () => {
      throw new MobileApiError("Whispr API request failed with status 429.", {
        code: "http_error",
        serverCode: "RATE_LIMITED",
        status: 429,
      });
    };

    const view = await renderHarness(repository);

    await waitFor(() => expect(mockRefreshCalls).toBe(1));
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));
    expect(calls.clear).toBe(0);
  });

  it("signs out and clears storage only when the server rejects the refresh token", async () => {
    const { calls, repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = async () => {
      throw new MobileApiError("Whispr API request failed with status 401.", {
        code: "http_error",
        serverCode: "INVALID_REFRESH",
        status: 401,
      });
    };

    const view = await renderHarness(repository);

    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-out"));
    expect(calls.clear).toBe(1);
  });

  it("signs the user in from storage before the refresh resolves", async () => {
    const { repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = () => new Promise<MobileSessionSnapshot>(() => undefined);

    const view = await renderHarness(repository);

    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));
    expect(readText(view, "mobile-test-access-token")).toBe(STORED_ACCESS_TOKEN);
  });

  it("stores and adopts the rotated session when the refresh succeeds", async () => {
    const { calls, repository } = createRepository(buildExpiredStoredSession());
    const rotatedSession = buildRotatedSession();
    mockRefreshImplementation = async () => rotatedSession;

    const view = await renderHarness(repository);

    await waitFor(() =>
      expect(readText(view, "mobile-test-access-token")).toBe(ROTATED_ACCESS_TOKEN),
    );
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-in");
    expect(calls.saved).toEqual([rotatedSession]);
    expect(calls.clear).toBe(0);
  });

  it("signs out an expired session that has no refresh token", async () => {
    const clear = createDeferred<void>();
    let clearCalls = 0;
    const session = buildSession({
      accessToken: STORED_ACCESS_TOKEN,
      expiresAt: Date.now() - 60_000,
      refreshToken: null,
    });
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => {
        clearCalls += 1;
        await clear.promise;
      }),
      load: jest.fn(async () => session),
      save: jest.fn(async () => undefined),
    };

    const view = await renderHarness(repository);

    await waitFor(() => expect(clearCalls).toBe(1));
    expect(readText(view, "mobile-test-auth-status")).toBe("checking");
    clear.resolve();
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-out"));
    expect(mockRefreshCalls).toBe(0);
    expect(clearCalls).toBe(1);
    expect(statusHistory).not.toContain("signed-in");
  });

  it("does not let an in-flight refresh revive a signed-out session", async () => {
    const refresh = createDeferred<MobileSessionSnapshot>();
    const { calls, repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = () => refresh.promise;

    const view = await renderHarness(repository);
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));

    await act(async () => {
      await harnessValue?.signOut();
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");

    refresh.resolve(buildRotatedSession());
    await act(async () => {
      await refresh.promise;
      await Promise.resolve();
    });

    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    expect(calls.saved).toEqual([]);
  });

  it("clears a refreshed session whose storage save finishes after sign-out", async () => {
    const save = createDeferred<void>();
    const operations: string[] = [];
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => {
        operations.push("clear");
      }),
      load: jest.fn(async () => buildExpiredStoredSession()),
      save: jest.fn(async () => {
        operations.push("save-start");
        await save.promise;
        operations.push("save-finish");
      }),
    };
    mockRefreshImplementation = async () => buildRotatedSession();

    const view = await renderHarness(repository);
    await waitFor(() => expect(operations).toContain("save-start"));

    let signOutPromise: Promise<void> | undefined;
    await act(async () => {
      signOutPromise = harnessValue?.signOut();
      await Promise.resolve();
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");

    save.resolve();
    await act(async () => {
      await signOutPromise;
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    expect(operations).toEqual(["save-start", "save-finish", "clear"]);
  });

  it("serializes an old refresh save, sign-out clear, and a new handoff save", async () => {
    const oldSave = createDeferred<void>();
    const operations: string[] = [];
    let persistedSession: MobileSessionSnapshot | null = buildExpiredStoredSession();
    const newSession = buildSession({
      accessToken: "mobile-access-token-new-account-0123456789",
      expiresAt: Date.now() + 15 * 60_000,
      refreshToken: "mobile-refresh-token-new-account-0123456789",
    });
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => {
        operations.push("clear");
        persistedSession = null;
      }),
      load: jest.fn(async () => persistedSession),
      save: jest.fn(async (session) => {
        if (session.tokens.accessToken === ROTATED_ACCESS_TOKEN) {
          operations.push("old-save-start");
          await oldSave.promise;
          operations.push("old-save-finish");
        } else {
          operations.push("new-save");
        }
        persistedSession = session;
      }),
    };
    mockRefreshImplementation = async () => buildRotatedSession();

    const view = await renderHarness(repository);
    await waitFor(() => expect(operations).toContain("old-save-start"));

    let signOutPromise: Promise<void> | undefined;
    await act(async () => {
      signOutPromise = harnessValue?.signOut();
      await Promise.resolve();
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");

    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await act(async () => {
      await harnessValue?.openWebSignIn();
    });
    const startUrl = new URL(String(openUrl.mock.calls[0]?.[0]));
    const completePath = startUrl.searchParams.get("callbackUrl") ?? "";
    const state = new URL(completePath, runtimeConfig.webUrl).searchParams.get("state") ?? "";
    mockExchangeImplementation = async () => newSession;
    let handoffPromise: Promise<boolean> | undefined;
    await act(async () => {
      handoffPromise = harnessValue?.completeAuthHandoff({
        callbackPath: "/channels/@me",
        handoffToken: "newaccountabcdefghijklmnopqrstuvwxyz1234567890_-",
        state,
      });
      await Promise.resolve();
    });

    oldSave.resolve();
    await act(async () => {
      await signOutPromise;
      expect(await handoffPromise).toBe(true);
    });

    expect(operations).toEqual(["old-save-start", "old-save-finish", "clear", "new-save"]);
    expect(persistedSession).toBe(newSession);
    expect(readText(view, "mobile-test-access-token")).toBe(newSession.tokens.accessToken);
  });

  it("commits local sign-out before background revocation and uses the refreshed access token", async () => {
    const refresh = createDeferred<MobileSessionSnapshot>();
    const { repository } = createRepository(buildExpiredStoredSession());
    let authorization: string | null = null;
    mockRefreshImplementation = () => refresh.promise;
    mockPushRevokeImplementation = async (client) => {
      await client.requestJson("/push-revoke-test", { method: "DELETE" });
    };
    jest.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    const view = await renderHarness(repository);
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));

    await act(async () => {
      await harnessValue?.signOut();
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    expect(authorization).toBeNull();

    refresh.resolve(buildRotatedSession());
    await waitFor(() => expect(authorization).toBe(`Bearer ${ROTATED_ACCESS_TOKEN}`));
    expect(mockAuthRevokeCalls).toBe(1);
    expect(mockAuthRevokeRefreshToken).toBe("mobile-refresh-token-rotated-0123456789");
  });

  it("finishes push unregister before revoking the refresh-token family", async () => {
    const pushRevoke = createDeferred<void>();
    const { repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = async () => buildRotatedSession();
    mockPushRevokeImplementation = async () => pushRevoke.promise;

    await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-in"));
    await act(async () => {
      await harnessValue?.signOut();
    });

    await waitFor(() => expect(mockPushRevokeCalls).toBe(1));
    expect(mockAuthRevokeCalls).toBe(0);
    pushRevoke.resolve();
    await waitFor(() => expect(mockAuthRevokeCalls).toBe(1));
  });

  it("blocks sign-in and retries local cleanup when sign-out cannot clear SecureStore", async () => {
    let clearCalls = 0;
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => {
        clearCalls += 1;
        if (clearCalls <= 2) {
          throw new Error("temporary keystore failure");
        }
      }),
      load: jest.fn(async () => buildRotatedSession()),
      save: jest.fn(async () => undefined),
    };
    const view = await renderHarness(repository);
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));

    await act(async () => {
      await harnessValue?.signOut();
    });
    expect(clearCalls).toBe(2);
    expect(readText(view, "mobile-test-auth-status")).toBe("error");
    expect(harnessValue?.sessionReadFailed).toBe(true);

    await act(async () => {
      await harnessValue?.refreshSessionFromStorage();
    });
    expect(clearCalls).toBe(3);
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    expect(harnessValue?.sessionReadFailed).toBe(false);
  });

  it("retries a secure-session read once before accepting the stored session", async () => {
    const session = buildRotatedSession();
    let loadCalls = 0;
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => undefined),
      load: jest.fn(async () => {
        loadCalls += 1;
        if (loadCalls === 1) {
          throw new Error("temporary keystore failure");
        }
        return session;
      }),
      save: jest.fn(async () => undefined),
    };

    const view = await renderHarness(repository);

    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("signed-in"));
    expect(loadCalls).toBe(2);
  });

  it("keeps a repeated secure-storage failure retryable without showing sign-in", async () => {
    const session = buildRotatedSession();
    let loadCalls = 0;
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => undefined),
      load: jest.fn(async () => {
        loadCalls += 1;
        if (loadCalls <= 2) {
          throw new Error("temporary keystore failure");
        }
        return session;
      }),
      save: jest.fn(async () => undefined),
    };

    const view = await renderHarness(repository);
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("error"));
    expect(harnessValue?.sessionReadFailed).toBe(true);

    await act(async () => {
      await harnessValue?.refreshSessionFromStorage();
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-in");
    expect(harnessValue?.sessionReadFailed).toBe(false);
    expect(loadCalls).toBe(3);
  });

  it("coalesces overlapping secure-storage retry requests", async () => {
    const retryLoad = createDeferred<MobileSessionSnapshot | null>();
    let loadCalls = 0;
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => undefined),
      load: jest.fn(async () => {
        loadCalls += 1;
        if (loadCalls <= 2) {
          throw new Error("temporary keystore failure");
        }
        return retryLoad.promise;
      }),
      save: jest.fn(async () => undefined),
    };

    const view = await renderHarness(repository);
    await waitFor(() => expect(readText(view, "mobile-test-auth-status")).toBe("error"));

    let firstRetry: Promise<void> | undefined;
    let secondRetry: Promise<void> | undefined;
    await act(async () => {
      firstRetry = harnessValue?.refreshSessionFromStorage();
      secondRetry = harnessValue?.refreshSessionFromStorage();
      await Promise.resolve();
    });
    await waitFor(() => expect(loadCalls).toBe(3));
    retryLoad.resolve(buildRotatedSession());
    await act(async () => {
      await Promise.all([firstRetry, secondRetry]);
    });

    expect(loadCalls).toBe(3);
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-in");
  });

  it("ignores a stored session read that resolves after sign-out", async () => {
    const load = createDeferred<MobileSessionSnapshot | null>();
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => undefined),
      load: jest.fn(() => load.promise),
      save: jest.fn(async () => undefined),
    };
    const view = await renderHarness(repository);

    let signOutPromise: Promise<void> | undefined;
    await act(async () => {
      signOutPromise = harnessValue?.signOut();
      await Promise.resolve();
    });
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    load.resolve(buildRotatedSession());
    await act(async () => {
      await signOutPromise;
    });

    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects unsolicited handoffs when no browser sign-in is in flight", async () => {
    const { repository } = createRepository(null);
    await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-out"));

    let completed = true;
    await act(async () => {
      completed =
        (await harnessValue?.completeAuthHandoff({
          callbackPath: "/channels/@me",
          handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
          state: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        })) ?? true;
    });

    expect(completed).toBe(false);
    expect(mockExchangeCalls).toBe(0);
  });

  it("binds web password sign-in handoffs to the state created before opening the browser", async () => {
    const { repository } = createRepository(null);
    await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-out"));
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

    await act(async () => {
      await harnessValue?.openWebSignIn();
    });
    const startUrl = new URL(String(openUrl.mock.calls[0]?.[0]));
    const completePath = startUrl.searchParams.get("callbackUrl") ?? "";
    const state = new URL(completePath, runtimeConfig.webUrl).searchParams.get("state");
    expect(state).toMatch(/^[0-9a-f]{64}$/u);

    let completed = false;
    await act(async () => {
      completed =
        (await harnessValue?.completeAuthHandoff({
          callbackPath: "/channels/@me",
          handoffToken: "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-",
          state: state ?? "",
        })) ?? false;
    });
    expect(completed).toBe(true);
  });

  it("does not adopt a handoff exchange that resolves after sign-out", async () => {
    const exchange = createDeferred<MobileSessionSnapshot>();
    const { calls, repository } = createRepository(null);
    const view = await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-out"));
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await act(async () => {
      await harnessValue?.openWebSignIn();
    });
    const startUrl = new URL(String(openUrl.mock.calls[0]?.[0]));
    const completePath = startUrl.searchParams.get("callbackUrl") ?? "";
    const state = new URL(completePath, runtimeConfig.webUrl).searchParams.get("state") ?? "";
    mockExchangeImplementation = () => exchange.promise;

    let handoffPromise: Promise<boolean> | undefined;
    await act(async () => {
      handoffPromise = harnessValue?.completeAuthHandoff({
        callbackPath: "/channels/@me",
        handoffToken: "lateexchangeabcdefghijklmnopqrstuvwxyz1234567890_-",
        state,
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(mockExchangeCalls).toBe(1));
    await act(async () => {
      await harnessValue?.signOut();
    });
    exchange.resolve(buildRotatedSession());
    await act(async () => {
      expect(await handoffPromise).toBe(false);
    });

    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
    expect(calls.saved).toEqual([]);
  });

  it("does not commit a handoff whose storage save finishes after sign-out", async () => {
    const save = createDeferred<void>();
    const operations: string[] = [];
    const repository: MobileSessionRepository = {
      clear: jest.fn(async () => {
        operations.push("clear");
      }),
      load: jest.fn(async () => null),
      save: jest.fn(async () => {
        operations.push("save-start");
        await save.promise;
        operations.push("save-finish");
      }),
    };
    const view = await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-out"));
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await act(async () => {
      await harnessValue?.openWebSignIn();
    });
    const startUrl = new URL(String(openUrl.mock.calls[0]?.[0]));
    const completePath = startUrl.searchParams.get("callbackUrl") ?? "";
    const state = new URL(completePath, runtimeConfig.webUrl).searchParams.get("state") ?? "";

    let handoffPromise: Promise<boolean> | undefined;
    await act(async () => {
      handoffPromise = harnessValue?.completeAuthHandoff({
        callbackPath: "/channels/@me",
        handoffToken: "latesaveabcdefghijklmnopqrstuvwxyz1234567890_-",
        state,
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(operations).toContain("save-start"));
    let signOutPromise: Promise<void> | undefined;
    await act(async () => {
      signOutPromise = harnessValue?.signOut();
      await Promise.resolve();
    });
    save.resolve();
    await act(async () => {
      expect(await handoffPromise).toBe(false);
      await signOutPromise;
    });

    expect(operations).toEqual(["save-start", "save-finish", "clear"]);
    expect(readText(view, "mobile-test-auth-status")).toBe("signed-out");
  });

  it("accepts only the state created for the active browser sign-in", async () => {
    const { repository } = createRepository(null);
    await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-out"));
    let startedState: string | null = null;
    jest.spyOn(WebBrowser, "openAuthSessionAsync").mockImplementation(async (startUrl) => {
      startedState = new URL(startUrl).searchParams.get("state");
      return {
        type: "success",
        url: `whispr://oauth/abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-?callbackUrl=%2Fchannels%2F%40me&state=${startedState}`,
      } as never;
    });

    let outcome: Awaited<ReturnType<MobileAuthContextValue["startSocialSignIn"]>> | null = null;
    await act(async () => {
      outcome = (await harnessValue?.startSocialSignIn("google")) ?? null;
    });

    expect(startedState).toMatch(/^[0-9a-f]{64}$/u);
    expect(outcome).toEqual({ ok: true, via: "in-app" });
    expect(mockExchangeCalls).toBe(1);
  });

  it("rejects a mismatched browser state", async () => {
    const { repository } = createRepository(null);
    await renderHarness(repository);
    await waitFor(() => expect(harnessValue?.status).toBe("signed-out"));
    jest.spyOn(WebBrowser, "openAuthSessionAsync").mockResolvedValue({
      type: "success",
      url: "whispr://oauth/abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-?callbackUrl=%2Fchannels%2F%40me&state=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    } as never);

    let mismatchOutcome: Awaited<ReturnType<MobileAuthContextValue["startSocialSignIn"]>> | null =
      null;
    await act(async () => {
      mismatchOutcome = (await harnessValue?.startSocialSignIn("google")) ?? null;
    });
    expect(mismatchOutcome).toEqual({ ok: false, reason: "failed" });
    expect(mockExchangeCalls).toBe(0);
  });

  it("never starts a handoff that could replace an existing signed-in session", async () => {
    const signedInRepository = createRepository(buildRotatedSession()).repository;
    const signedInView = await renderHarness(signedInRepository);
    await waitFor(() =>
      expect(readText(signedInView, "mobile-test-auth-status")).toBe("signed-in"),
    );
    const browserCallsBefore = jest.mocked(WebBrowser.openAuthSessionAsync).mock.calls.length;

    let signedInOutcome: Awaited<ReturnType<MobileAuthContextValue["startSocialSignIn"]>> | null =
      null;
    await act(async () => {
      signedInOutcome = (await harnessValue?.startSocialSignIn("google")) ?? null;
    });
    expect(signedInOutcome).toEqual({ ok: false, reason: "failed" });
    expect(jest.mocked(WebBrowser.openAuthSessionAsync)).toHaveBeenCalledTimes(browserCallsBefore);
  });

  it("backs off instead of retrying the refresh on every request", async () => {
    const { repository } = createRepository(buildExpiredStoredSession());
    mockRefreshImplementation = async () => {
      throw new MobileApiError("Whispr API request timed out.", { code: "timeout" });
    };

    await renderHarness(repository);

    await waitFor(() => expect(mockRefreshCalls).toBe(1));
    await waitFor(() => expect(harnessValue).not.toBeNull());

    let accessToken: string | null = null;
    await act(async () => {
      accessToken = (await harnessValue?.getAccessToken()) ?? null;
    });

    // Still one call: the cooldown blocked the retry, and the caller got the
    // stale token rather than a dead session.
    expect(mockRefreshCalls).toBe(1);
    expect(accessToken).toBe(STORED_ACCESS_TOKEN);
  });
});
