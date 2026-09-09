import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceRole } from "@wizards/types";

import { NO_SERVER_PERMISSIONS, resolveViewerPermissions, viewerCan } from "./viewer-permissions";

function role(overrides: Partial<WorkspaceRole> & Pick<WorkspaceRole, "id">): WorkspaceRole {
  return {
    color: 0,
    isDefault: false,
    managed: false,
    mentionable: false,
    name: overrides.id,
    permissions: [],
    position: 0,
    ...overrides,
  };
}

describe("izleyici yetkileri", () => {
  it("sahip her şeyi yapar", () => {
    const permissions = resolveViewerPermissions({
      currentUserId: "u-owner",
      members: [],
      roles: [],
      server: { isOwner: true },
    });

    assert.equal(permissions.all, true);
    assert.equal(viewerCan(permissions, "BAN_MEMBERS"), true);
    assert.equal(viewerCan(permissions, "MANAGE_EVENTS"), true);
  });

  it("`ADMINISTRATOR` taşıyan rol her biti açar", () => {
    const permissions = resolveViewerPermissions({
      currentUserId: "u-1",
      members: [{ roles: [{ id: "r-admin" }], userId: "u-1" }],
      roles: [role({ id: "r-admin", permissions: ["ADMINISTRATOR"] })],
      server: { isOwner: false },
    });

    assert.equal(permissions.all, true);
    assert.equal(viewerCan(permissions, "MANAGE_INVITES"), true);
  });

  it("bitler rollerin birleşimidir", () => {
    const permissions = resolveViewerPermissions({
      currentUserId: "u-1",
      members: [{ roles: [{ id: "r-a" }, { id: "r-b" }], userId: "u-1" }],
      roles: [
        role({ id: "r-a", permissions: ["BAN_MEMBERS"] }),
        role({ id: "r-b", permissions: ["MANAGE_INVITES"] }),
        role({ id: "r-c", permissions: ["MANAGE_EVENTS"] }),
      ],
      server: { isOwner: false },
    });

    assert.equal(permissions.all, false);
    assert.equal(viewerCan(permissions, "BAN_MEMBERS"), true);
    assert.equal(viewerCan(permissions, "MANAGE_INVITES"), true);
    // Taşımadığı rolün biti sızmaz.
    assert.equal(viewerCan(permissions, "MANAGE_EVENTS"), false);
  });

  it("`@everyone` üye satırında olmasa bile sayılır", () => {
    const permissions = resolveViewerPermissions({
      currentUserId: "u-1",
      members: [{ roles: [], userId: "u-1" }],
      roles: [role({ id: "r-0", isDefault: true, permissions: ["MANAGE_INVITES"] })],
      server: { isOwner: false },
    });

    assert.equal(viewerCan(permissions, "MANAGE_INVITES"), true);
  });

  it("üye listesinde olmayan izleyici hiçbir bit almaz", () => {
    const permissions = resolveViewerPermissions({
      currentUserId: "u-yok",
      members: [{ roles: [{ id: "r-a" }], userId: "u-1" }],
      roles: [role({ id: "r-a", permissions: ["BAN_MEMBERS"] })],
      server: { isOwner: false },
    });

    assert.equal(viewerCan(permissions, "BAN_MEMBERS"), false);
  });

  it("boş küme hiçbir anahtara evet demez", () => {
    assert.equal(viewerCan(NO_SERVER_PERMISSIONS, "MANAGE_SERVER"), false);
  });
});
