import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertServerDeleteAllowed,
  assertServerIsDeletableByOwner,
  assertServerUpdateAllowed,
  assertVisibilityFieldsWritable,
  buildServerCreateData,
  resolveVisibilityUpdateData,
} from "@/lib/workspace/server-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { AccessContext } from "@/lib/workspace/workspace-types";

const BASE_INPUT = {
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  description: null,
  iconUrl: null,
  name: "Test sunucu",
  shortName: null,
};

describe("buildServerCreateData", () => {
  it("defaults to a private personal server when no options are given", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal(data.type, "PERSONAL");
    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
    assert.equal(data.ownerId, "u1");
  });

  it("applies the privileged options the admin surface passes", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234", {
      discoverable: true,
      isPublic: true,
      type: "COMMUNITY",
    });

    assert.equal(data.type, "COMMUNITY");
    assert.equal(data.isPublic, true);
    assert.equal(data.discoverable, true);
  });

  it("starts the member counter at one for the founding member", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal(data.memberCount, 1);
  });
});

describe("community server protection", () => {
  it("lets an owner delete a personal server", () => {
    assert.doesNotThrow(() => assertServerIsDeletableByOwner("PERSONAL"));
  });

  it("refuses owner deletion of a community server", () => {
    assert.throws(() => assertServerIsDeletableByOwner("COMMUNITY"), /403|admin/i);
  });

  it("lets a personal server owner flip visibility", () => {
    assert.doesNotThrow(() =>
      assertVisibilityFieldsWritable("PERSONAL", { discoverable: true, isPublic: true }),
    );
  });

  it("refuses visibility writes on a community server", () => {
    assert.throws(() => assertVisibilityFieldsWritable("COMMUNITY", { isPublic: false }));
    assert.throws(() => assertVisibilityFieldsWritable("COMMUNITY", { discoverable: false }));
  });

  it("allows unrelated community updates to pass through", () => {
    assert.doesNotThrow(() => assertVisibilityFieldsWritable("COMMUNITY", {}));
  });
});

/**
 * The gates above are asserted in isolation, which cannot catch the wrong
 * variable being handed to one of them. These drive the same preludes
 * `updateWorkspaceServer` and `deleteWorkspaceServer` run, with the access
 * context they actually receive.
 */
describe("community protection through the real update and delete preludes", () => {
  function buildAccess(overrides: Partial<AccessContext> = {}): AccessContext {
    return {
      accessLevel: "OWNER",
      isPublic: false,
      memberId: "m1",
      ownerId: "u1",
      roles: [
        {
          color: 0,
          id: "r1",
          isDefault: true,
          name: "everyone",
          permissions: PermissionBits.ADMINISTRATOR,
        },
      ],
      serverId: "s1",
      serverName: "Whispr Topluluk",
      type: "PERSONAL",
      userId: "u1",
      ...overrides,
    };
  }

  it("refuses a visibility write on a community server through the update prelude", () => {
    assert.throws(
      () => assertServerUpdateAllowed(buildAccess({ type: "COMMUNITY" }), { discoverable: true }),
      /403|admin/i,
    );
  });

  it("lets the same write through on a personal server", () => {
    assert.doesNotThrow(() => assertServerUpdateAllowed(buildAccess(), { discoverable: true }));
  });

  it("stops a non-manager before the visibility gate is even consulted", () => {
    assert.throws(() =>
      assertServerUpdateAllowed(
        buildAccess({
          accessLevel: "MEMBER",
          ownerId: "someone-else",
          roles: [{ color: 0, id: "r1", isDefault: true, name: "everyone", permissions: 0n }],
        }),
        { name: "Yeni ad" },
      ),
    );
  });

  it("refuses community deletion through the delete prelude, before the owner check", () => {
    // The caller is not the owner either; the community gate has to be the one
    // that throws, which is what pins the ordering.
    assert.throws(
      () =>
        assertServerDeleteAllowed(buildAccess({ accessLevel: "MEMBER", type: "COMMUNITY" }), {
          confirmationName: "Whispr Topluluk",
        }),
      /admin surface/i,
    );
  });

  it("still requires the owner and the typed name on a personal server", () => {
    assert.throws(() =>
      assertServerDeleteAllowed(buildAccess({ accessLevel: "ADMIN" }), {
        confirmationName: "Whispr Topluluk",
      }),
    );
    assert.throws(
      () => assertServerDeleteAllowed(buildAccess(), { confirmationName: "yanlış ad" }),
      /confirmation/i,
    );
    assert.doesNotThrow(() =>
      assertServerDeleteAllowed(buildAccess(), { confirmationName: "Whispr Topluluk" }),
    );
  });
});

describe("resolveVisibilityUpdateData", () => {
  it("forces discoverable off in the same update that turns isPublic off, even if discoverable:true was also sent", () => {
    const data = resolveVisibilityUpdateData(true, { discoverable: true, isPublic: false });

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });

  it("forces discoverable off when isPublic is turned off and discoverable is not part of the request", () => {
    const data = resolveVisibilityUpdateData(true, { isPublic: false });

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });

  it("blocks turning discoverable on while isPublic stays off (not sent, already false in the database)", () => {
    const data = resolveVisibilityUpdateData(false, { discoverable: true });

    assert.equal(data.isPublic, undefined);
    assert.equal(data.discoverable, false);
  });

  it("leaves discoverable untouched when isPublic is (or becomes) true and discoverable is not requested", () => {
    const data = resolveVisibilityUpdateData(false, { isPublic: true });

    assert.equal(data.isPublic, true);
    assert.equal(data.discoverable, undefined);
  });

  it("allows turning discoverable on when isPublic is already true", () => {
    const data = resolveVisibilityUpdateData(true, { discoverable: true });

    assert.equal(data.isPublic, undefined);
    assert.equal(data.discoverable, true);
  });

  it("is a no-op when neither field is part of the request and isPublic is already true", () => {
    const data = resolveVisibilityUpdateData(true, {});

    assert.equal(data.isPublic, undefined);
    assert.equal(data.discoverable, undefined);
  });
});
