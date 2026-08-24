import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUsernameCandidate, normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("transliterates Turkish characters into stable ASCII usernames", () => {
    assert.equal(normalizeUsername("Do\u011fukan Yazar"), "dogukan_yazar");
    assert.equal(normalizeUsername("\u00c7a\u011fr\u0131 \u0130\u015eLER"), "cagri_isler");
    assert.equal(
      normalizeUsername("O\u011fuz G\u00fc\u011f\u00fcmc\u00fco\u011flu"),
      "oguz_gugumcuoglu",
    );
  });

  it("collapses separators and trims unsafe edges", () => {
    assert.equal(normalizeUsername("  Whispr   Team!!  "), "whispr_team");
  });

  it("falls back to a generated whispr username when nothing usable remains", () => {
    assert.match(normalizeUsername("\u2728"), /^whispr_[a-f0-9]{10}$/);
  });
});

describe("buildUsernameCandidate", () => {
  it("preserves suffixes while keeping usernames within the max length", () => {
    const candidate = buildUsernameCandidate("averyveryveryveryverylongusername", "_abc123");

    assert.equal(candidate.length, 32);
    assert.ok(candidate.endsWith("_abc123"));
  });
});
