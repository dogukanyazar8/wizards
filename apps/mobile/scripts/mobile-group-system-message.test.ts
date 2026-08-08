import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatGroupSystemMessage } from "../src/dm/group-system-message-copy";
import { mobileCopy } from "../src/locale/mobile-copy";

const labels = {
  actorSelf: mobileCopy.tr.groupSystemActorSelf,
  added: mobileCopy.tr.groupSystemAdded,
  created: mobileCopy.tr.groupSystemCreated,
  iconChanged: mobileCopy.tr.groupSystemIconChanged,
  left: mobileCopy.tr.groupSystemLeft,
  nameChanged: mobileCopy.tr.groupSystemNameChanged,
  removed: mobileCopy.tr.groupSystemRemoved,
} as const;

describe("group system message copy", () => {
  it("names the actor who created the group", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "GROUP_CREATED",
        systemValue: null,
        targetNames: [],
      }),
      "Ada grubu oluşturdu",
    );
  });

  it("substitutes the reader's own pronoun for their own action", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: true,
        labels,
        systemType: "MEMBER_LEFT",
        systemValue: null,
        targetNames: [],
      }),
      "Sen gruptan ayrıldı",
    );
  });

  it("joins several targets into one sentence", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "MEMBER_ADDED",
        systemValue: null,
        targetNames: ["Selin", "Kaan"],
      }),
      "Ada, Selin, Kaan kişisini ekledi",
    );
  });

  it("puts the new name into the rename sentence", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "NAME_CHANGED",
        systemValue: "Takım",
        targetNames: [],
      }),
      'Ada grup adını "Takım" olarak değiştirdi',
    );
  });

  it("returns an empty string for an ordinary message", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: null,
        systemValue: null,
        targetNames: [],
      }),
      "",
    );
  });
});
