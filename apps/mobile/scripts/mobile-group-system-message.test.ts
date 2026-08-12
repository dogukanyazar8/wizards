import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGroupSystemMessageSentence,
  formatGroupSystemMessage,
  toGroupSystemMessageLabels,
} from "../src/dm/group-system-message-copy";
import { mobileCopy } from "../src/locale/mobile-copy";

// Built through the real mapper rather than by hand: a copy key added to the
// labels type must land in `mobile-copy.ts` too, and a hand-built object hides
// exactly that.
const labels = toGroupSystemMessageLabels(mobileCopy.tr);

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

describe("naming the actor of a system row", () => {
  const leaver = {
    author: { displayName: "Ada Lovelace", username: "ada" },
    systemTargetUserIds: [],
    systemType: "MEMBER_LEFT" as const,
    systemValue: null,
    userId: "user-2",
  };

  /**
   * Leaving deletes the membership row, so by the time anybody reads
   * "{actor} gruptan ayrıldı" the actor is gone from `participants` and the
   * sentence used to start with a blank. The row's own author still names them.
   */
  it("names a leaver the roster no longer holds", () => {
    assert.equal(
      buildGroupSystemMessageSentence({
        currentUserId: "user-1",
        labels,
        message: leaver,
        participants: [{ displayName: "Sen", userId: "user-1", username: "me" }],
      }),
      "Ada Lovelace gruptan ayrıldı",
    );
  });

  it("still prefers the roster, which carries the newer name", () => {
    assert.equal(
      buildGroupSystemMessageSentence({
        currentUserId: "user-1",
        labels,
        message: { ...leaver, systemType: "NAME_CHANGED", systemValue: "Takım" },
        participants: [{ displayName: "Ada Byron", userId: "user-2", username: "ada" }],
      }),
      'Ada Byron grup adını "Takım" olarak değiştirdi',
    );
  });

  it("falls back to the handle when the author has no display name", () => {
    assert.equal(
      buildGroupSystemMessageSentence({
        currentUserId: "user-1",
        labels,
        message: { ...leaver, author: { displayName: null, username: "ada" } },
        participants: [],
      }),
      "ada gruptan ayrıldı",
    );
  });

  it("says 'Sen' for the reader's own departure rather than their name", () => {
    assert.equal(
      buildGroupSystemMessageSentence({
        currentUserId: "user-2",
        labels,
        message: leaver,
        participants: [],
      }),
      "Sen gruptan ayrıldı",
    );
  });
});

/** Faz 2 §C2. The seventh system type. */
describe("disappearing window system message", () => {
  it("turns the stored enum into a readable window", () => {
    // The server writes `H24`; the sentence a member reads is their locale's.
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "DISAPPEARING_CHANGED",
        systemValue: "H24",
        targetNames: [],
      }),
      "Ada kaybolan mesajları 24 saat olarak ayarladı",
    );
  });

  it("reads the off state as a window too", () => {
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: true,
        labels,
        systemType: "DISAPPEARING_CHANGED",
        systemValue: "OFF",
        targetNames: [],
      }),
      "Sen kaybolan mesajları Kapalı olarak ayarladı",
    );
  });

  it("prints an unknown window as-is rather than blanking the row", () => {
    // A client older than a future window still draws a readable line.
    assert.equal(
      formatGroupSystemMessage({
        actorName: "Ada",
        isActorSelf: false,
        labels,
        systemType: "DISAPPEARING_CHANGED",
        systemValue: "Y1",
        targetNames: [],
      }),
      "Ada kaybolan mesajları Y1 olarak ayarladı",
    );
  });

  it("covers every window the server can store", () => {
    const windows = ["OFF", "H24", "D7", "D90"] as const;

    for (const window of windows) {
      assert.notEqual(labels.disappearingWindows[window], undefined, `missing copy for ${window}`);
    }
  });
});
