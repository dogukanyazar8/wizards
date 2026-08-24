import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PermissionBits } from "@/lib/workspace/permissions";
import {
  listInvitableServers,
  type InvitableMembershipRow,
  type InvitableServersDeps,
} from "@/lib/workspace/invitable-servers-service";

type Membership = InvitableMembershipRow;

function role(permissions: bigint, isDefault = false) {
  return { id: `role-${permissions}`, isDefault, name: "rol", permissions };
}

function deps(memberships: Membership[]): InvitableServersDeps {
  return { findMemberships: async () => memberships };
}

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    roles: [],
    server: {
      iconUrl: null,
      id: "server-1",
      name: "Whispr",
      ownerId: "someone-else",
      roles: [role(0n, true)],
    },
    ...overrides,
  };
}

describe("listInvitableServers", () => {
  it("MANAGE_INVITES taşıyan rolü olan sunucuyu verir", async () => {
    const rows = await listInvitableServers(
      "viewer",
      deps([membership({ roles: [{ role: role(PermissionBits.MANAGE_INVITES) }] })]),
    );

    assert.deepEqual(rows, [{ iconUrl: null, id: "server-1", name: "Whispr" }]);
  });

  /** Yönetici her şeyi yapabilir; `hasPermission` bunu kendi içinde kapsıyor. */
  it("ADMINISTRATOR yeterli", async () => {
    const rows = await listInvitableServers(
      "viewer",
      deps([membership({ roles: [{ role: role(PermissionBits.ADMINISTRATOR) }] })]),
    );

    assert.equal(rows.length, 1);
  });

  it("sahip her zaman davet edebilir", async () => {
    const rows = await listInvitableServers(
      "viewer",
      deps([
        membership({
          server: {
            iconUrl: null,
            id: "server-2",
            name: "Kendi sunucum",
            ownerId: "viewer",
            roles: [role(0n, true)],
          },
        }),
      ]),
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["server-2"],
    );
  });

  /**
   * Bu testin asıl işi: yetkisiz üyelik listeye **girmemeli**. Girseydi menü
   * kullanıcıya yapamayacağı bir işi gösterir ve tıklayınca 403 alırdı.
   */
  it("yalnız üye olan sunucu listede yok", async () => {
    const rows = await listInvitableServers("viewer", deps([membership()]));

    assert.deepEqual(rows, []);
  });

  it("ilgisiz izin yetmez", async () => {
    const rows = await listInvitableServers(
      "viewer",
      deps([membership({ roles: [{ role: role(PermissionBits.SEND_MESSAGES) }] })]),
    );

    assert.deepEqual(rows, []);
  });

  it("üyelik yoksa boş liste", async () => {
    assert.deepEqual(await listInvitableServers("viewer", deps([])), []);
  });
});
