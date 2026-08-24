import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditMentionKinds,
  formatMentionKindAudit,
  repairRoleMentionsWithoutRole,
} from "./backfill-mention-kind";

function createClient(config: {
  channel: Array<{ _count: { _all: number }; kind: string }>;
  dm: Array<{ _count: { _all: number }; kind: string }>;
  orphanRoleRows: number;
}) {
  const updates: unknown[] = [];

  return {
    client: {
      dMMessageMention: { groupBy: async () => config.dm },
      messageMention: {
        count: async () => config.orphanRoleRows,
        groupBy: async () => config.channel,
        updateMany: async (args: unknown) => {
          updates.push(args);
          return { count: config.orphanRoleRows };
        },
      },
    },
    updates,
  };
}

describe("backfill-mention-kind", () => {
  it("counts every kind on both tables", async () => {
    const { client } = createClient({
      channel: [
        { _count: { _all: 412 }, kind: "SELF" },
        { _count: { _all: 9 }, kind: "ROLE" },
      ],
      dm: [{ _count: { _all: 88 }, kind: "SELF" }],
      orphanRoleRows: 0,
    });

    const audit = await auditMentionKinds(client);

    assert.deepEqual(audit.channelByKind, { ROLE: 9, SELF: 412 });
    assert.deepEqual(audit.dmByKind, { SELF: 88 });
    assert.equal(audit.channelRoleWithoutRoleId, 0);
    assert.equal(audit.dmNonSelf, 0);
  });

  /** DM'de rol ve `@herkes` yoktur; `SELF` dışında bir satır bir hatanın izidir. */
  it("flags DM rows that are not SELF", async () => {
    const { client } = createClient({
      channel: [],
      dm: [
        { _count: { _all: 88 }, kind: "SELF" },
        { _count: { _all: 2 }, kind: "ROLE" },
      ],
      orphanRoleRows: 0,
    });

    assert.equal((await auditMentionKinds(client)).dmNonSelf, 2);
  });

  it("repairs only ROLE rows that carry no role", async () => {
    const { client, updates } = createClient({
      channel: [],
      dm: [],
      orphanRoleRows: 3,
    });

    assert.equal(await repairRoleMentionsWithoutRole(client), 3);
    assert.deepEqual(updates, [{ where: { kind: "ROLE", roleId: null }, data: { kind: "SELF" } }]);
  });

  it("prints one line per table", () => {
    const lines = formatMentionKindAudit({
      channelByKind: { SELF: 1 },
      channelRoleWithoutRoleId: 0,
      dmByKind: { SELF: 2 },
      dmNonSelf: 0,
    });

    assert.equal(lines.length, 4);
    assert.match(lines[0] ?? "", /MessageMention/u);
  });
});
