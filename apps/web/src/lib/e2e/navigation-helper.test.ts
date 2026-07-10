import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Page } from "@playwright/test";

import { gotoAppRoute } from "../../../e2e/helpers/navigation";

describe("Playwright app-route navigation helper", () => {
  it("waits for an interrupted browser navigation and retries the target route once", async () => {
    let gotoCount = 0;
    let waitForLoadStateCount = 0;
    const page = {
      async goto() {
        gotoCount += 1;
        if (gotoCount === 1) {
          throw new Error(
            'page.goto: Navigation to "http://127.0.0.1/channels/server/channel" is interrupted by another navigation to "http://127.0.0.1/channels/@me"',
          );
        }

        return null;
      },
      async waitForLoadState() {
        waitForLoadStateCount += 1;
      },
    } as unknown as Page;

    await gotoAppRoute(page, "/login");

    assert.equal(gotoCount, 2);
    assert.equal(waitForLoadStateCount, 1);
  });
});
