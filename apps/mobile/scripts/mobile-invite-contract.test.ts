import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMobileDeepLink } from "../src/deep-link/mobile-deep-links";
import {
  getMobileInviteReadiness,
  validateMobileInviteContract,
} from "../src/invite/mobile-invite-contract";

const webUrl = "https://whispr.team";

describe("mobile invite contract", () => {
  it("keeps invite acceptance blocked until the mobile server contract is available", () => {
    const link = parseMobileDeepLink("https://whispr.team/invite/ABC_def-123?mobile=1", {
      webUrl,
    });
    const readiness = getMobileInviteReadiness({
      invitesFeature: {
        label: "Invites",
        reason: "Mobile invite acceptance endpoint pending.",
        status: "requires-server-contract",
      },
      lastDeepLink: link,
    });

    assert.equal(readiness.canAcceptInvite, false);
    assert.equal(readiness.code, "ABC_def-123");
    assert.equal(readiness.reason, "server-contract-required");
  });

  it("allows safe invite links only when bootstrap explicitly enables invites", () => {
    const link = parseMobileDeepLink("whispr://invite/Join_Me-42?mobile=true", { webUrl });
    const readiness = getMobileInviteReadiness({
      invitesFeature: {
        label: "Invites",
        status: "available",
      },
      lastDeepLink: link,
    });

    assert.deepEqual(readiness, {
      canAcceptInvite: true,
      code: "Join_Me-42",
      reason: "ready",
      status: "available",
    });
  });

  it("rejects unsafe or non-invite links without exposing the raw URL", () => {
    const unsafe = parseMobileDeepLink("https://whispr.team/invite/ABC?token=secret", {
      webUrl,
    });
    const route = parseMobileDeepLink("https://whispr.team/channels/@me", { webUrl });

    assert.deepEqual(
      getMobileInviteReadiness({
        invitesFeature: {
          label: "Invites",
          status: "available",
        },
        lastDeepLink: unsafe,
      }),
      {
        canAcceptInvite: false,
        code: null,
        reason: "unsafe-link",
        status: "available",
      },
    );
    assert.equal(
      getMobileInviteReadiness({
        invitesFeature: {
          label: "Invites",
          status: "available",
        },
        lastDeepLink: route,
      }).reason,
      "not-an-invite",
    );
  });

  it("keeps the quality gate invite readiness contract healthy", () => {
    assert.deepEqual(validateMobileInviteContract(), []);
  });
});
