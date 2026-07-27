import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_ADMIN_ACTIONS,
  canClaimMobileAdminCase,
  canRunMobileAdminAction,
  formatMobileAdminCaseAge,
  formatMobileAdminCaseNumber,
  getMobileAdminPriorityTone,
  isMobileAdminResolutionValid,
} from "../src/admin/mobile-admin-model";

const now = new Date("2026-07-27T12:00:00.000Z");
const ageLabels = {
  days: "{count} gün",
  hours: "{count} sa",
  justNow: "şimdi",
  minutes: "{count} dk",
};

describe("mobile admin triage model", () => {
  /**
   * Ban and message deletion are not in this list because those endpoints do
   * not exist on the mobile surface at all. A fourth action here would mean the
   * phone had grown a decision it cannot actually make.
   */
  it("offers exactly the three triage actions", () => {
    assert.deepEqual([...MOBILE_ADMIN_ACTIONS], ["claim", "dismiss", "escalate"]);
  });

  it("labels a case the way the queue and the notification do", () => {
    assert.equal(formatMobileAdminCaseNumber(42), "MOD-42");
    assert.equal(getMobileAdminPriorityTone("URGENT"), "critical");
    assert.equal(getMobileAdminPriorityTone("HIGH"), "high");
    assert.equal(getMobileAdminPriorityTone("NORMAL"), "normal");
    assert.equal(getMobileAdminPriorityTone("LOW"), "muted");
  });

  it("reads case age in the coarsest unit that still says something", () => {
    assert.equal(formatMobileAdminCaseAge("2026-07-27T11:59:40.000Z", now, ageLabels), "şimdi");
    assert.equal(formatMobileAdminCaseAge("2026-07-27T11:48:00.000Z", now, ageLabels), "12 dk");
    assert.equal(formatMobileAdminCaseAge("2026-07-27T08:00:00.000Z", now, ageLabels), "4 sa");
    assert.equal(formatMobileAdminCaseAge("2026-07-25T08:00:00.000Z", now, ageLabels), "2 gün");
    // A clock skew that puts the case in the future must not print "-3 dk".
    assert.equal(formatMobileAdminCaseAge("2026-07-27T12:30:00.000Z", now, ageLabels), "şimdi");
    assert.equal(formatMobileAdminCaseAge("not-a-date", now, ageLabels), "şimdi");
  });

  /**
   * F test 6: offline disables the buttons and sends nothing. There is no
   * queue — a decision that lands hours late on a case someone else already
   * closed is worse than no decision.
   */
  it("disables every action while the device is offline or a call is in flight", () => {
    assert.equal(canRunMobileAdminAction({ networkStatus: "online", pending: false }), true);
    assert.equal(canRunMobileAdminAction({ networkStatus: "unknown", pending: false }), true);
    assert.equal(canRunMobileAdminAction({ networkStatus: "offline", pending: false }), false);
    assert.equal(canRunMobileAdminAction({ networkStatus: "online", pending: true }), false);
  });

  it("requires a real dismissal reason", () => {
    assert.equal(isMobileAdminResolutionValid(""), false);
    assert.equal(isMobileAdminResolutionValid("   "), false);
    assert.equal(isMobileAdminResolutionValid("yinelenen rapor"), true);
    assert.equal(isMobileAdminResolutionValid("x".repeat(1001)), false);
  });

  it("offers claiming only on an unclaimed open case", () => {
    assert.equal(canClaimMobileAdminCase({ assigneeHandle: null, status: "OPEN" }), true);
    assert.equal(canClaimMobileAdminCase({ assigneeHandle: "moderator", status: "OPEN" }), false);
    assert.equal(canClaimMobileAdminCase({ assigneeHandle: null, status: "IN_REVIEW" }), false);
  });
});
