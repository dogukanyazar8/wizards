import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_MENTION_ROSTER_MEMBER_LIMIT,
  applyMobileMentionSelection,
  extractMobileMentionUsernames,
  filterMobileMentionCandidates,
  hasMobileSelfMention,
  parseMobileMentionSegments,
  resolveMobileCaretAfterChange,
  resolveMobileMentionQuery,
  shouldLoadMoreMobileMentionRoster,
  type MobileMentionCandidate,
} from "../src/app/mobile-mention";

const members: readonly MobileMentionCandidate[] = [
  { avatarUrl: null, displayName: "Ada Lovelace", userId: "u1", username: "ada" },
  { avatarUrl: null, displayName: "Bora Yilmaz", userId: "u2", username: "bora" },
  { avatarUrl: null, displayName: "Cem Adali", userId: "u3", username: "cem" },
];
const knownUsernames = new Set(members.map((member) => member.username));

describe("mobile mention parser", () => {
  /**
   * Same example set as `apps/web/src/lib/workspace/message-notification-service.test.ts`.
   * Divergence here means the client highlights tokens the backend ignores.
   */
  it("extracts unique mention usernames case-insensitively", () => {
    assert.deepEqual(extractMobileMentionUsernames("hi @Ada and (@Bora) and @ada"), [
      "ada",
      "bora",
    ]);
  });

  it("ignores emails, short names, and invalid mention characters", () => {
    assert.deepEqual(extractMobileMentionUsernames("mail ada@example.com @a @valid_user @"), [
      "valid_user",
    ]);
  });

  it("keeps reserved mass mention names out of username mentions", () => {
    assert.deepEqual(extractMobileMentionUsernames("@everyone please ask @Ada or @here"), ["ada"]);
  });

  it("splits a body into mention, link and text runs", () => {
    assert.deepEqual(
      parseMobileMentionSegments("hey @Ada see https://whispr.test now", knownUsernames),
      [
        { type: "text", value: "hey " },
        { type: "mention", username: "ada", value: "@Ada" },
        { type: "text", value: " see " },
        { type: "link", value: "https://whispr.test" },
        { type: "text", value: " now" },
      ],
    );
  });

  it("leaves a mention of a non-member as plain text", () => {
    assert.deepEqual(parseMobileMentionSegments("ping @ghost and @ada", knownUsernames), [
      { type: "text", value: "ping @ghost and " },
      { type: "mention", username: "ada", value: "@ada" },
    ]);
  });

  it("highlights every valid mention when no member roster is supplied", () => {
    assert.deepEqual(parseMobileMentionSegments("ping @ghost"), [
      { type: "text", value: "ping " },
      { type: "mention", username: "ghost", value: "@ghost" },
    ]);
  });

  it("never highlights mass mentions or mid-word handles", () => {
    assert.deepEqual(parseMobileMentionSegments("@everyone mail ada@example.com"), [
      { type: "text", value: "@everyone mail ada@example.com" },
    ]);
  });

  it("reports a self mention only for the caller's own username", () => {
    assert.equal(hasMobileSelfMention("hey @Ada", "ada"), true);
    assert.equal(hasMobileSelfMention("hey @Ada", "bora"), false);
    assert.equal(hasMobileSelfMention("hey @Ada", null), false);
  });
});

describe("mobile mention composer query", () => {
  it("detects the token the caret is writing", () => {
    assert.deepEqual(resolveMobileMentionQuery("hey @ad", 7), {
      endIndex: 7,
      query: "ad",
      startIndex: 4,
    });
  });

  it("detects a bare @ at the start of a word", () => {
    assert.deepEqual(resolveMobileMentionQuery("@", 1), { endIndex: 1, query: "", startIndex: 0 });
    assert.deepEqual(resolveMobileMentionQuery("hey (@", 6), {
      endIndex: 6,
      query: "",
      startIndex: 5,
    });
  });

  it("ignores handles that do not start a word", () => {
    assert.equal(resolveMobileMentionQuery("mail ada@exam", 13), null);
  });

  it("ignores a caret that is not inside a mention", () => {
    assert.equal(resolveMobileMentionQuery("hey @ada there", 14), null);
    assert.equal(resolveMobileMentionQuery("plain text", 5), null);
  });

  it("stops looking past the server username length limit", () => {
    const text = `@${"a".repeat(33)}`;
    assert.equal(resolveMobileMentionQuery(text, text.length), null);
  });

  it("replaces the active token with the selected username and a trailing space", () => {
    const activeQuery = resolveMobileMentionQuery("hey @ad", 7);
    assert.ok(activeQuery);
    assert.deepEqual(applyMobileMentionSelection("hey @ad", activeQuery, "ada"), {
      cursor: 9,
      text: "hey @ada ",
    });
  });

  it("keeps text after the caret when completing a mention", () => {
    const activeQuery = resolveMobileMentionQuery("hey @ad done", 7);
    assert.ok(activeQuery);
    assert.equal(
      applyMobileMentionSelection("hey @ad done", activeQuery, "ada").text,
      "hey @ada  done",
    );
  });
});

describe("mobile mention candidate filter", () => {
  it("returns the first members for an empty query", () => {
    assert.deepEqual(
      filterMobileMentionCandidates(members, "", 2).map((member) => member.username),
      ["ada", "bora"],
    );
  });

  it("ranks prefix matches before contains matches", () => {
    assert.deepEqual(
      filterMobileMentionCandidates(members, "ada").map((member) => member.username),
      ["ada", "cem"],
    );
  });

  it("matches the display name as well as the username", () => {
    assert.deepEqual(
      filterMobileMentionCandidates(members, "bora y").map((member) => member.username),
      ["bora"],
    );
  });

  it("honours the suggestion limit", () => {
    assert.equal(filterMobileMentionCandidates(members, "a", 1).length, 1);
  });
});

/**
 * `onChangeText` fires before `onSelectionChange`, so these are the caret the
 * composer resolves its `@` query against for the frame in between.
 */
describe("mobile composer caret after a text change", () => {
  it("puts the caret after an insertion at the end", () => {
    assert.equal(resolveMobileCaretAfterChange("hey", "hey @", 3), 5);
  });

  it("puts the caret after an insertion in the middle", () => {
    assert.equal(resolveMobileCaretAfterChange("hey done", "hey @done", 4), 5);
    assert.equal(resolveMobileCaretAfterChange("hey done", "hey @ done", 4), 6);
  });

  it("keeps a mid-text mention query out of the trailing word", () => {
    const text = "hey @ad done";
    const caret = resolveMobileCaretAfterChange("hey @a done", text, 6);
    assert.equal(caret, 7);
    assert.deepEqual(resolveMobileMentionQuery(text, caret), {
      endIndex: 7,
      query: "ad",
      startIndex: 4,
    });
  });

  it("follows a backspace to the character it removed", () => {
    assert.equal(resolveMobileCaretAfterChange("hello", "helo", 3), 2);
    assert.equal(resolveMobileCaretAfterChange("hello", "hell", 5), 4);
  });

  it("lands after a replacement when a selection was typed over", () => {
    assert.equal(resolveMobileCaretAfterChange("hello", "hey", 5), 3);
  });

  it("lands at the end of an appended emoji, whatever the caret was", () => {
    assert.equal(resolveMobileCaretAfterChange("ab", "ab😀", 1), 4);
  });

  it("clamps a caret that no longer fits the text it is given", () => {
    assert.equal(resolveMobileCaretAfterChange("", "a", 9), 1);
    assert.equal(resolveMobileCaretAfterChange("abc", "abc", 2), 3);
  });
});

describe("mobile mention roster paging", () => {
  const base = {
    enabled: true,
    hasError: false,
    hasNextPage: true,
    isFetching: false,
    loadedMemberCount: 50,
  };

  it("walks the next page while the surface is open", () => {
    assert.equal(shouldLoadMoreMobileMentionRoster(base), true);
  });

  it("waits for the page in flight instead of racing it", () => {
    assert.equal(shouldLoadMoreMobileMentionRoster({ ...base, isFetching: true }), false);
  });

  it("stops on the last page, when disabled, and after a failure", () => {
    assert.equal(shouldLoadMoreMobileMentionRoster({ ...base, hasNextPage: false }), false);
    assert.equal(shouldLoadMoreMobileMentionRoster({ ...base, enabled: false }), false);
    assert.equal(shouldLoadMoreMobileMentionRoster({ ...base, hasError: true }), false);
  });

  it("stops at the member limit so a large server cannot walk every page", () => {
    assert.equal(
      shouldLoadMoreMobileMentionRoster({
        ...base,
        loadedMemberCount: MOBILE_MENTION_ROSTER_MEMBER_LIMIT,
      }),
      false,
    );
    assert.equal(
      shouldLoadMoreMobileMentionRoster({
        ...base,
        loadedMemberCount: MOBILE_MENTION_ROSTER_MEMBER_LIMIT - 1,
      }),
      true,
    );
  });
});
