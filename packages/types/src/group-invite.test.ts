import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GROUP_INVITE_CODE_LENGTH,
  GroupInviteSettingsRequestSchema,
  buildGroupInviteDisplayUrl,
  buildGroupInviteUrl,
  isGroupInviteCode,
  resolveGroupInviteBlock,
} from "./group-invite";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function invite(overrides: Partial<Parameters<typeof resolveGroupInviteBlock>[0]> = {}) {
  return {
    enabled: true,
    expiresAt: null,
    maxUses: null,
    uses: 0,
    ...overrides,
  };
}

describe("resolveGroupInviteBlock", () => {
  it("passes an enabled, unexpired, unexhausted invite", () => {
    assert.equal(resolveGroupInviteBlock(invite(), NOW), null);
  });

  it("blocks a disabled invite", () => {
    assert.equal(resolveGroupInviteBlock(invite({ enabled: false }), NOW), "disabled");
  });

  it("blocks an expired invite", () => {
    assert.equal(
      resolveGroupInviteBlock(invite({ expiresAt: new Date(NOW.getTime() - 1) }), NOW),
      "expired",
    );
  });

  it("treats the expiry instant itself as still valid", () => {
    assert.equal(resolveGroupInviteBlock(invite({ expiresAt: new Date(NOW) }), NOW), null);
  });

  it("blocks an exhausted invite", () => {
    assert.equal(resolveGroupInviteBlock(invite({ maxUses: 3, uses: 3 }), NOW), "exhausted");
  });

  it("lets the last remaining use through", () => {
    assert.equal(resolveGroupInviteBlock(invite({ maxUses: 3, uses: 2 }), NOW), null);
  });

  it("reports disabled before expiry when both are true", () => {
    // B2's order is the order the endpoint's status codes follow; a disabled
    // invite must never leak that it also happens to be expired.
    assert.equal(
      resolveGroupInviteBlock(
        invite({ enabled: false, expiresAt: new Date(NOW.getTime() - 1), maxUses: 1, uses: 9 }),
        NOW,
      ),
      "disabled",
    );
  });

  it("reports expiry before exhaustion", () => {
    assert.equal(
      resolveGroupInviteBlock(
        invite({ expiresAt: new Date(NOW.getTime() - 1), maxUses: 1, uses: 1 }),
        NOW,
      ),
      "expired",
    );
  });

  it("accepts an ISO string expiry", () => {
    assert.equal(
      resolveGroupInviteBlock(invite({ expiresAt: "2026-08-11T11:59:59.000Z" }), NOW),
      "expired",
    );
  });
});

describe("buildGroupInviteUrl", () => {
  it("joins the runtime origin with the /g/ path", () => {
    assert.equal(
      buildGroupInviteUrl(new URL("https://whispr.example.com"), "ABCDEFGH2345"),
      "https://whispr.example.com/g/ABCDEFGH2345",
    );
  });

  it("does not double the slash when the origin carries a trailing one", () => {
    assert.equal(
      buildGroupInviteUrl(new URL("https://whispr.example.com/"), "ABCDEFGH2345"),
      "https://whispr.example.com/g/ABCDEFGH2345",
    );
  });

  it("keeps a non-standard port, which local development needs", () => {
    assert.equal(
      buildGroupInviteUrl("http://localhost:3000", "ABCDEFGH2345"),
      "http://localhost:3000/g/ABCDEFGH2345",
    );
  });

  it("returns null when the deployment has no configured origin", () => {
    // §B4: the host is runtime state. A missing one loses the link, it does not
    // invent `whispr.gg`.
    assert.equal(buildGroupInviteUrl(null, "ABCDEFGH2345"), null);
  });

  it("returns null for an empty code rather than a link to the invite index", () => {
    assert.equal(buildGroupInviteUrl("https://whispr.example.com", ""), null);
  });
});

describe("buildGroupInviteDisplayUrl", () => {
  it("drops the scheme for the copyable label", () => {
    assert.equal(
      buildGroupInviteDisplayUrl("whispr.example.com", "ABCDEFGH2345"),
      "whispr.example.com/g/ABCDEFGH2345",
    );
  });

  it("returns null without a host", () => {
    assert.equal(buildGroupInviteDisplayUrl(null, "ABCDEFGH2345"), null);
  });
});

describe("isGroupInviteCode", () => {
  it("accepts a freshly minted code", () => {
    assert.equal(isGroupInviteCode("ABCDEFGH2345"), true);
  });

  it("rejects the wrong length", () => {
    assert.equal(isGroupInviteCode("ABCDEFGH234"), false);
    assert.equal(isGroupInviteCode("ABCDEFGH23456"), false);
  });

  it("rejects characters outside the unambiguous charset", () => {
    // I, O, 0 and 1 are not in the alphabet, so a mistyped code fails before it
    // ever reaches the database.
    assert.equal(isGroupInviteCode("ABCDEFGH2I45"), false);
    assert.equal(isGroupInviteCode("abcdefgh2345"), false);
  });

  it("agrees with the advertised length", () => {
    assert.equal("ABCDEFGH2345".length, GROUP_INVITE_CODE_LENGTH);
  });
});

describe("GroupInviteSettingsRequestSchema", () => {
  it("accepts a plain toggle", () => {
    assert.deepEqual(GroupInviteSettingsRequestSchema.parse({ enabled: true }), { enabled: true });
  });

  it("rejects unknown keys so a client cannot smuggle a code in", () => {
    assert.equal(
      GroupInviteSettingsRequestSchema.safeParse({ code: "HACKED", enabled: true }).success,
      false,
    );
  });

  it("rejects a missing toggle", () => {
    assert.equal(GroupInviteSettingsRequestSchema.safeParse({}).success, false);
  });
});
