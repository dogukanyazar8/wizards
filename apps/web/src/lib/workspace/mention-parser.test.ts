import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  containsRoleMentionCandidate,
  extractMentionUsernames,
  filterRolesByMentionQuery,
  matchRoleNameCandidate,
  normalizeRoleMentionName,
  parseMentionTokens,
} from "./mention-parser";

describe("mention parser", () => {
  /**
   * Bahsedilmeler Ş2, tuzak #3. `extractMentionUsernames` yalnız taşındı; davranışı bit
   * birebir aynı kalmalı, çünkü `message-notification-service` testleri onu değişmeden
   * doğruluyor ve rol ayrıştırıcısı ayrı bir desendir.
   */
  it("keeps the username pattern unchanged after the move", () => {
    assert.deepEqual(extractMentionUsernames("hi @Ada and (@Bora) and @ada"), ["ada", "bora"]);
    assert.deepEqual(extractMentionUsernames("mail ada@example.com @a @valid_user @"), [
      "valid_user",
    ]);
    assert.deepEqual(extractMentionUsernames("@everyone please ask @Ada or @here"), ["ada"]);
  });

  /**
   * `usernames` burada `tasar` taşıyor: ASCII deseni `ı`da durur ve **öyle durmalı** — bu
   * fonksiyonun bugünkü davranışı, tuzak #3'ün koruduğu şey tam olarak bu. Artık token bir
   * kullanıcıya çözülmediği için zararsız; rol dalı ayrı desenden besleniyor.
   */
  it("collects role candidates the username pattern cannot see", () => {
    const tokens = parseMentionTokens("@tasarım ekibi ve @ürün bakar mısınız");

    assert.deepEqual(tokens.roleNames, ["tasarım", "ürün"]);
    assert.deepEqual(tokens.usernames, ["tasar"]);
    assert.equal(tokens.mass, false);
  });

  it("keeps an ambiguous token in both lists so the data layer can decide", () => {
    const tokens = parseMentionTokens("@ada bak");

    assert.deepEqual(tokens.usernames, ["ada"]);
    assert.deepEqual(tokens.roleNames, ["ada"]);
  });

  it("excludes everyone and here from both lists", () => {
    const tokens = parseMentionTokens("@everyone @here @Everyone");

    assert.deepEqual(tokens.usernames, []);
    assert.deepEqual(tokens.roleNames, []);
    assert.equal(tokens.mass, true);
  });

  it("dedupes role candidates case-insensitively and keeps the first spelling", () => {
    const tokens = parseMentionTokens("@Tasarım sonra yine @tasarım");

    assert.deepEqual(tokens.roleNames, ["Tasarım"]);
  });

  it("refuses tokens longer than a role name can be", () => {
    const tokens = parseMentionTokens(`@${"a".repeat(33)}`);

    assert.deepEqual(tokens.roleNames, []);
  });

  it("requires a boundary before the at sign, exactly like the username pattern", () => {
    assert.deepEqual(parseMentionTokens("mail ada@tasarım.com").roleNames, []);
    assert.deepEqual(parseMentionTokens("(@tasarım)").roleNames, ["tasarım"]);
  });

  /**
   * Türkçe rol adlarında `I`/`ı` ve `İ`/`i` çiftleri iki küçültme kuralında ters düşer:
   * `"IŞIK".toLowerCase()` → `işik`, `"Info".toLocaleLowerCase("tr")` → `ınfo`. İkisi de tek
   * başına yanlış eşleşme üretir, bu yüzden arama iki anahtarı da dener.
   */
  it("matches Turkish and English role spellings under both casing rules", () => {
    const roles = [
      { id: "role-isik", name: "IŞIK" },
      { id: "role-info", name: "Info" },
    ];

    assert.equal(matchRoleNameCandidate(roles, "ışık")?.id, "role-isik");
    assert.equal(matchRoleNameCandidate(roles, "IŞIK")?.id, "role-isik");
    assert.equal(matchRoleNameCandidate(roles, "info")?.id, "role-info");
    assert.equal(matchRoleNameCandidate(roles, "Info")?.id, "role-info");
    assert.equal(matchRoleNameCandidate(roles, "tasarım"), null);
  });

  it("normalizes a role name to both casing keys", () => {
    assert.deepEqual(normalizeRoleMentionName("IŞIK"), ["ışık", "işik"]);
    assert.deepEqual(normalizeRoleMentionName("ekip"), ["ekip"]);
  });

  it("answers whether a message is worth a role fan-out at all", () => {
    assert.equal(containsRoleMentionCandidate("selam"), false);
    assert.equal(containsRoleMentionCandidate("@everyone"), false);
    assert.equal(containsRoleMentionCandidate("@tasarım"), true);
    assert.equal(containsRoleMentionCandidate("@ada"), true);
  });

  it("suggests roles under both casing rules and caps the list", () => {
    const roles = [
      { name: "IŞIK" },
      { name: "ışıkçılar" },
      { name: "Info" },
      { name: "ışık-ekibi" },
      { name: "ışık-2" },
    ];

    assert.deepEqual(
      filterRolesByMentionQuery(roles, "ışık").map((role) => role.name),
      ["IŞIK", "ışıkçılar", "ışık-ekibi", "ışık-2"],
    );
    assert.deepEqual(
      filterRolesByMentionQuery(roles, "info").map((role) => role.name),
      ["Info"],
    );
    assert.deepEqual(filterRolesByMentionQuery(roles, "ışık", 2).length, 2);
  });

  it("returns every role for an empty query, which is what `@` alone means", () => {
    assert.equal(filterRolesByMentionQuery([{ name: "tasarım" }, { name: "ürün" }], "").length, 2);
  });
});
