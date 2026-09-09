import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertServerDeleteAllowed,
  assertServerIsDeletableByOwner,
  assertServerUpdateAllowed,
  assertVisibilityFieldsWritable,
  buildServerCreateData,
  buildServerUpdateData,
  requiresChannelPermissionMetadataInvalidation,
  resolveVisibilityCreateData,
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
  shortName: "TST",
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

  /**
   * Ş10 §7.4. Erişim radyosunun üç kombinasyonu gövdeden gelir; admin yolu aynı iki alanı
   * `options` üzerinden verir ve ikisi çakıştığında ayrıcalıklı olan kazanır.
   */
  it("writes the access radio the create window sends", () => {
    const data = buildServerCreateData(
      "u1",
      { ...BASE_INPUT, discoverable: true, isPublic: true },
      "abcd1234",
    );

    assert.equal(data.isPublic, true);
    assert.equal(data.discoverable, true);
    assert.equal(data.type, "PERSONAL");
  });

  it("lets the admin options override the body", () => {
    const data = buildServerCreateData(
      "u1",
      { ...BASE_INPUT, discoverable: true, isPublic: true },
      "abcd1234",
      { discoverable: false, isPublic: false },
    );

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });

  /** `discoverable` yalnız `isPublic` açıkken bir anlam taşır — `PATCH` tarafının eşi. */
  it("never stores a discoverable server that is not public", () => {
    const data = buildServerCreateData(
      "u1",
      { ...BASE_INPUT, discoverable: true, isPublic: false },
      "abcd1234",
    );

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });

  it("writes the swatch choice and leaves the column null without one (K2)", () => {
    assert.equal(
      buildServerCreateData("u1", { ...BASE_INPUT, iconColor: "accent2" }, "abcd1234").iconColor,
      "accent2",
    );
    assert.equal(buildServerCreateData("u1", BASE_INPUT, "abcd1234").iconColor, null);
  });

  /**
   * K7: alanlar yoksa kolonun varsayılanı geçerli kalmalı. Prisma'da bunun yolu alanı
   * `undefined` bırakmak; `null` yazmak `NOT NULL` kolonu kırardı.
   */
  it("omits the advanced fields entirely when the form did not choose (K7)", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal("messageCharacterLimit" in data, false);
    assert.equal("deletedMessageNoticeMinutes" in data, false);
    assert.equal("tags" in data, false);
  });

  it("carries the advanced fields and tags when the form did choose", () => {
    const data = buildServerCreateData(
      "u1",
      {
        ...BASE_INPUT,
        deletedMessageNoticeMinutes: 180,
        messageCharacterLimit: 250,
        tags: ["oyun", "espor"],
      },
      "abcd1234",
    );

    assert.equal(data.messageCharacterLimit, 250);
    assert.equal(data.deletedMessageNoticeMinutes, 180);
    assert.deepEqual(data.tags, ["oyun", "espor"]);
  });
});

describe("resolveVisibilityCreateData", () => {
  it("mirrors the update-side invariant: discoverable implies public", () => {
    assert.deepEqual(resolveVisibilityCreateData({}), {
      discoverable: false,
      isPublic: false,
    });
    assert.deepEqual(resolveVisibilityCreateData({ discoverable: true, isPublic: true }), {
      discoverable: true,
      isPublic: true,
    });
    assert.deepEqual(resolveVisibilityCreateData({ discoverable: true, isPublic: false }), {
      discoverable: false,
      isPublic: false,
    });
  });

  it("prefers the privileged options over the request body", () => {
    assert.deepEqual(
      resolveVisibilityCreateData(
        { discoverable: false, isPublic: false },
        { discoverable: true, isPublic: true },
      ),
      { discoverable: true, isPublic: true },
    );
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

/**
 * Ş1 §1 — `Server.iconColor` ve `Server.slowModeDelay`'in yazma yolu.
 *
 * Üç durum ayrı ayrı kanıtlanır çünkü ikisi kolayca birbirine karışır:
 * alan **yok** (dokunma), alan **null** (seçimi kaldır) ve alan **değer**.
 */
describe("buildServerUpdateData — Ş1 sütunları", () => {
  it("leaves both columns alone when the request does not mention them", () => {
    const data = buildServerUpdateData(true, { name: "Yeni ad" });

    assert.equal("iconColor" in data, false);
    assert.equal("slowModeDelay" in data, false);
  });

  it("writes a chosen icon tone", () => {
    const data = buildServerUpdateData(true, { iconColor: "accent2" });

    assert.equal(data.iconColor, "accent2");
  });

  it("writes an explicit null as a reset, not as an absent field", () => {
    const data = buildServerUpdateData(true, { iconColor: null });

    // `Kaldır` "eski deterministik türetmeye dön" demek; alanı atlamak
    // "hiçbir şey değişmesin" demek olurdu ve swatch yalan söylerdi.
    assert.equal("iconColor" in data, true);
    assert.equal(data.iconColor, null);
  });

  it("writes a server-wide slow mode, including the Kapalı option", () => {
    assert.equal(buildServerUpdateData(true, { slowModeDelay: 300 }).slowModeDelay, 300);
    assert.equal(buildServerUpdateData(true, { slowModeDelay: 0 }).slowModeDelay, 0);
  });

  it("still forces discoverable off with isPublic through the shared resolver", () => {
    const data = buildServerUpdateData(true, { discoverable: true, isPublic: false });

    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
  });
});

describe("requiresChannelPermissionMetadataInvalidation", () => {
  it("expires cached channel snapshots for every server column the send path reads", () => {
    for (const input of [
      { messageCharacterLimit: 4_000 },
      { slowModeDelay: 60 },
      { allowGifs: false },
      { allowFileUploads: false },
      { allowMemberAdds: false },
    ]) {
      assert.equal(
        requiresChannelPermissionMetadataInvalidation(input),
        true,
        JSON.stringify(input),
      );
    }
  });

  it("does not expire them for columns the send path never reads", () => {
    for (const input of [
      { name: "Yeni ad" },
      { iconColor: "info" as const },
      { description: "merhaba" },
      { tags: ["oyun"] },
    ]) {
      assert.equal(
        requiresChannelPermissionMetadataInvalidation(input),
        false,
        JSON.stringify(input),
      );
    }
  });
});

/**
 * Ş1 §4 — silme onayı. Uç zaten vardı; bu paket davranışı **değiştirmiyor**,
 * birebir eşleşmeyi kilitliyor: karşılaştırma büyük/küçük harfe duyarlı ve
 * yalnız şemanın `trim()`'i kadar toleranslı.
 */
describe("server delete confirmation is an exact match", () => {
  function ownerAccess(serverName: string): AccessContext {
    return {
      accessLevel: "OWNER",
      isPublic: false,
      memberId: "m1",
      ownerId: "u1",
      roles: [],
      serverId: "s1",
      serverName,
      type: "PERSONAL",
      userId: "u1",
    };
  }

  it("accepts only the server name, character for character", () => {
    assert.doesNotThrow(() =>
      assertServerDeleteAllowed(ownerAccess("Mobile Test"), { confirmationName: "Mobile Test" }),
    );
  });

  it("rejects a case difference", () => {
    assert.throws(
      () =>
        assertServerDeleteAllowed(ownerAccess("Mobile Test"), { confirmationName: "mobile test" }),
      /confirmation/i,
    );
  });

  it("rejects a whitespace difference inside the name", () => {
    assert.throws(
      () =>
        assertServerDeleteAllowed(ownerAccess("Mobile Test"), { confirmationName: "Mobile  Test" }),
      /confirmation/i,
    );
  });

  it("rejects a prefix, a suffix and an empty-ish value", () => {
    for (const confirmationName of ["Mobile", "Mobile Testt", " Mobile Test "]) {
      // Son satır kasıtlı: uçtaki boşlukları **şema** kırpar
      // (`DeleteServerSchema.confirmationName` `.trim()`), servis değil. Servis
      // ham metni görürse eşleşme başarısız olmalı.
      assert.throws(
        () => assertServerDeleteAllowed(ownerAccess("Mobile Test"), { confirmationName }),
        /confirmation/i,
        confirmationName,
      );
    }
  });

  it("rejects an admin even with the right name", () => {
    assert.throws(
      () =>
        assertServerDeleteAllowed(
          { ...ownerAccess("Mobile Test"), accessLevel: "ADMIN", ownerId: "someone-else" },
          { confirmationName: "Mobile Test" },
        ),
      /owner/i,
    );
  });
});
