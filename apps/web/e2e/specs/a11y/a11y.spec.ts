import AxeBuilder from "@axe-core/playwright";

import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import {
  gotoAppRoute,
  gotoTextChannelRoute,
  openSettingsFromUserQuickMenu,
} from "../../helpers/navigation";

// WCAG AAA is intentionally out of scope: it is not a realistic bar for a
// chat/voice product (several AAA criteria conflict with real-time UI
// patterns), so this scan enforces WCAG 2.0/2.1 A+AA only.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

type AxeViolation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

function formatViolation(violation: AxeViolation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
  return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${targets})`;
}

function assertNoBlockingViolations(violations: AxeViolation[]): void {
  const blocking = violations.filter(
    (violation) => violation.impact && BLOCKING_IMPACTS.has(violation.impact),
  );
  const nonBlocking = violations.filter(
    (violation) => !violation.impact || !BLOCKING_IMPACTS.has(violation.impact),
  );

  for (const violation of nonBlocking) {
    // eslint-disable-next-line no-console
    console.log(`a11y (non-blocking): ${formatViolation(violation)}`);
  }

  expect(
    blocking.map(formatViolation),
    "critical/serious WCAG A+AA violations must be fixed, not suppressed",
  ).toEqual([]);
}

test.describe("accessibility smoke", () => {
  test("login screen has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await gotoAppRoute(page, "/login", { readyTestId: "login-form" });

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  test("DM home shell has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "server-rail" });

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  test("server text channel view has no critical or serious WCAG A/AA violations", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  test("settings overlay has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "user-bar" });
    await openSettingsFromUserQuickMenu(page);

    // Wait for the loaded settings content, not the transient bootstrap
    // loading skeleton, so the scan is deterministic instead of racing
    // whichever state happens to be on screen when axe runs.
    await expect(
      page.locator('[data-testid="settings-panel"][data-client-ready="true"]'),
    ).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .include('[data-testid="in-app-settings-overlay"]')
      .withTags(WCAG_TAGS)
      .analyze();

    assertNoBlockingViolations(results.violations);
  });
});
