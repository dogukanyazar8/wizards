import assert from "node:assert/strict";
import { it } from "node:test";
import { settingsRouteFromPathname, writeSettingsHistory } from "./window-navigation";

it("keeps full-page history and replaces modal history without fetching a route", () => {
  const calls: unknown[][] = [];
  const history = {
    pushState: (...args: unknown[]) => calls.push(["push", ...args]),
    replaceState: (...args: unknown[]) => calls.push(["replace", ...args]),
  };
  writeSettingsHistory(history, "push", { section: "account", tab: "badges" });
  writeSettingsHistory(history, "replace", { section: "account", tab: "privacy" }, "g1&g2");
  assert.deepEqual(calls, [
    ["push", null, "", "/settings/account/badges"],
    ["replace", null, "", "/settings/account/privacy?highlight=g1%26g2"],
  ]);
});

it("reads Back/Forward URLs, while unrelated routes retain the server fallback", () => {
  const fallback = { section: "account", tab: "profile" } as const;
  assert.deepEqual(settingsRouteFromPathname("/settings/account/badges", fallback), {
    section: "account",
    tab: "badges",
  });
  assert.deepEqual(settingsRouteFromPathname("/settings/av/camera", fallback), {
    section: "av",
    tab: "camera",
  });
  assert.deepEqual(settingsRouteFromPathname("/messages", fallback), fallback);
  assert.deepEqual(settingsRouteFromPathname(null, fallback), fallback);
});
