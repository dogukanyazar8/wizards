import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSettingsBootstrapPayload } from "./bootstrap";

const user = {
  avatarUrl: null,
  displayName: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  id: "user-1",
  status: "ONLINE" as const,
  twoFactorEnabled: false,
  username: "ada",
};

describe("settings bootstrap", () => {
  it("memoizes process-static package and contributor reads", async () => {
    let contributorReads = 0;
    let packageReads = 0;
    const dependencies = {
      readContributors: async () => {
        contributorReads += 1;
        return ["Grace", "Ada"];
      },
      readPackageVersion: async () => {
        packageReads += 1;
        return "1.2.3";
      },
    };

    await getSettingsBootstrapPayload({ locale: "en", user }, dependencies);
    await getSettingsBootstrapPayload({ locale: "tr", user }, dependencies);

    assert.equal(contributorReads, 1);
    assert.equal(packageReads, 1);
  });
});
