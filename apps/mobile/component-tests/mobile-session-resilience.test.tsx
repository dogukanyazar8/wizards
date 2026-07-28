import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { MobileSessionSnapshot } from "../src/auth/session-types";

type MobileRefreshImplementation = () => Promise<MobileSessionSnapshot>;

let mockRefreshCalls = 0;
let mockRefreshImplementation: MobileRefreshImplementation = async () => {
  throw new Error("refresh implementation was not configured for this test");
};

jest.mock("../src/auth/mobile-auth-exchange", () => ({
  ...(jest.requireActual("../src/auth/mobile-auth-exchange") as object),
  refreshMobileAuthSession: () => {
    mockRefreshCalls += 1;
    return mockRefreshImplementation();
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

function SessionHarness() {
  const value = useMobileAuth();

  useEffect(() => {
    harnessValue = value;
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
  mockRefreshCalls = 0;
  harnessValue = null;
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
