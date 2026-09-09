import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TRANSFER_OWNERSHIP_INITIAL_STATE,
  canDeleteServer,
  canTransferOwnership,
  listTransferCandidates,
  selectTransferNote,
} from "./danger-zone";

const MEMBERS = [
  {
    accessLevel: "OWNER" as const,
    avatarUrl: null,
    displayName: "DY",
    userId: "u-owner",
    username: "me",
  },
  {
    accessLevel: "ADMIN" as const,
    avatarUrl: null,
    displayName: "dogukan",
    userId: "u-admin",
    username: "dogukan",
  },
  {
    accessLevel: "MEMBER" as const,
    avatarUrl: null,
    displayName: "Ayşe Kaya",
    userId: "u-ayse",
    username: "aysek",
  },
];

describe("sahiplik devri", () => {
  it("aday listesi sahibi dışarıda bırakır", () => {
    assert.deepEqual(
      listTransferCandidates(MEMBERS).map((candidate) => candidate.userId),
      ["u-admin", "u-ayse"],
    );
  });

  it("aday sırası üye listesinin sırasıdır", () => {
    assert.deepEqual(
      listTransferCandidates([...MEMBERS].reverse()).map((candidate) => candidate.userId),
      ["u-ayse", "u-admin"],
    );
  });

  it("alt satır önce eksik olanı söyler", () => {
    assert.equal(selectTransferNote(TRANSFER_OWNERSHIP_INITIAL_STATE), "selectMember");
    assert.equal(selectTransferNote({ acknowledged: true, targetUserId: null }), "selectMember");
    assert.equal(
      selectTransferNote({ acknowledged: false, targetUserId: "u-admin" }),
      "acknowledge",
    );
    assert.equal(selectTransferNote({ acknowledged: true, targetUserId: "u-admin" }), "ready");
  });

  it("düğme ancak iki koşul da tamamken aktif", () => {
    assert.equal(canTransferOwnership(TRANSFER_OWNERSHIP_INITIAL_STATE), false);
    assert.equal(canTransferOwnership({ acknowledged: true, targetUserId: null }), false);
    assert.equal(canTransferOwnership({ acknowledged: false, targetUserId: "u-admin" }), false);
    assert.equal(canTransferOwnership({ acknowledged: true, targetUserId: "u-admin" }), true);
  });
});

describe("sunucu silme onayı", () => {
  it("birebir eşleşme aktif eder", () => {
    assert.equal(canDeleteServer("Mobile Test", "Mobile Test"), true);
  });

  it("uçtaki boşluk kırpılır — uç da kırpıyor (Ş1 §2.4)", () => {
    assert.equal(canDeleteServer("  Mobile Test  ", "Mobile Test"), true);
  });

  it("büyük/küçük harf farkı reddedilir", () => {
    assert.equal(canDeleteServer("mobile test", "Mobile Test"), false);
  });

  it("ön ek, son ek ve içerideki fazladan boşluk reddedilir", () => {
    assert.equal(canDeleteServer("Mobile", "Mobile Test"), false);
    assert.equal(canDeleteServer("Mobile Test 2", "Mobile Test"), false);
    assert.equal(canDeleteServer("Mobile  Test", "Mobile Test"), false);
  });

  it("boş metin hiçbir zaman aktif etmez", () => {
    assert.equal(canDeleteServer("", "Mobile Test"), false);
    assert.equal(canDeleteServer("   ", "   "), false);
  });
});
