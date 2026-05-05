export type E2EUserKey = "alice" | "bob" | "charlie";

export const e2eUserPassword = process.env.E2E_TEST_PASSWORD ?? "WhisprE2E!2026";

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

