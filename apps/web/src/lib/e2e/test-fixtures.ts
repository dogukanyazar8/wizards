export type E2EUserKey = "alice" | "bob" | "charlie";

type E2ETestFixtureEnv = {
  [key: string]: string | undefined;
  E2E_TEST_MODE?: string | undefined;
  E2E_TEST_PASSWORD?: string | undefined;
};

export function resolveE2EUserPassword(env: E2ETestFixtureEnv = process.env) {
  const password = env.E2E_TEST_PASSWORD?.trim();

  if (password) {
    if (password.length < 8) {
      throw new Error("E2E_TEST_PASSWORD must be at least 8 characters.");
    }

    return password;
  }

  if (env.E2E_TEST_MODE === "true") {
    throw new Error("E2E_TEST_PASSWORD is required when E2E_TEST_MODE=true.");
  }

  return "";
}

export const e2eUserPassword = resolveE2EUserPassword();

export const e2eUsers = {
  alice: {
    email: "alice@whispr.test",
    username: "alice_e2e",
    displayName: "Alice E2E",
  },
  bob: {
    email: "bob@whispr.test",
    username: "bob_e2e",
    displayName: "Bob E2E",
  },
  charlie: {
    email: "charlie@whispr.test",
    username: "charlie_e2e",
    displayName: "Charlie E2E",
  },
} as const;

export const e2eServer = {
  name: "Whispr E2E Server",
  shortName: "E2E",
  description: "Disposable server used by Playwright E2E tests.",
  textChannelName: "e2e-text",
  voiceChannelName: "e2e-voice",
} as const;

export function getE2EUserByKey(userKey: E2EUserKey) {
  return e2eUsers[userKey];
}
