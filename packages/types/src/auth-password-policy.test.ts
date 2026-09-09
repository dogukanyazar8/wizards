import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRED_RULE_COUNT,
  PASSWORD_RULE_IDS,
  evaluatePasswordStrength,
  getUnmetPasswordRules,
  meetsPasswordPolicy,
} from "./auth-password-policy";

describe("auth password policy", () => {
  it("keeps SPEC §4.4 constants", () => {
    assert.equal(PASSWORD_MIN_LENGTH, 10);
    assert.equal(PASSWORD_REQUIRED_RULE_COUNT, 3);
    assert.deepEqual([...PASSWORD_RULE_IDS], ["length", "case", "digit", "symbol"]);
  });

  it("scores an empty password at zero", () => {
    const strength = evaluatePasswordStrength("");

    assert.equal(strength.score, 0);
    assert.equal(strength.tone, "danger");
    assert.deepEqual(strength.rules, { case: false, digit: false, length: false, symbol: false });
  });

  it("applies the length rule at exactly ten characters", () => {
    assert.equal(evaluatePasswordStrength("abcdefghi").rules.length, false);
    assert.equal(evaluatePasswordStrength("abcdefghij").rules.length, true);
  });

  it("requires both cases for the case rule", () => {
    assert.equal(evaluatePasswordStrength("abcdefghij").rules.case, false);
    assert.equal(evaluatePasswordStrength("ABCDEFGHIJ").rules.case, false);
    assert.equal(evaluatePasswordStrength("abcdefghiJ").rules.case, true);
  });

  it("accepts Turkish letters on both sides of the case rule", () => {
    // `ı` küçük, `İ` büyük — ikisi de ASCII dışında.
    assert.equal(evaluatePasswordStrength("ışıkİŞIKabc").rules.case, true);
  });

  it("does not count Turkish letters as symbols", () => {
    assert.equal(evaluatePasswordStrength("şifreÇĞİÖabc").rules.symbol, false);
    assert.equal(evaluatePasswordStrength("şifreÇĞİÖab!").rules.symbol, true);
  });

  it("does not count whitespace as a symbol", () => {
    assert.equal(evaluatePasswordStrength("abc def ghi").rules.symbol, false);
  });

  it("maps every score to the SPEC §4.4/4 tone", () => {
    assert.equal(evaluatePasswordStrength("").tone, "danger"); // 0
    assert.equal(evaluatePasswordStrength("abcdefghij").tone, "danger"); // 1 — length
    assert.equal(evaluatePasswordStrength("abcdefghiJ").tone, "warning"); // 2 — length + case
    assert.equal(evaluatePasswordStrength("abcdefghiJ1").tone, "success"); // 3
    assert.equal(evaluatePasswordStrength("abcdefghiJ1!").tone, "success"); // 4
  });

  it("reaches score four with a full password", () => {
    const strength = evaluatePasswordStrength("Whispr!2026x");

    assert.equal(strength.score, 4);
    assert.equal(strength.satisfiedCount, 4);
    assert.deepEqual(strength.rules, { case: true, digit: true, length: true, symbol: true });
  });

  it("gates submission on the length rule even when three rules pass", () => {
    // Dokuz karakter: büyük-küçük, sayı ve sembol var ama uzunluk yok.
    const short = "Ab1!efghi";

    assert.equal(short.length, 9);
    assert.equal(evaluatePasswordStrength(short).satisfiedCount, 3);
    assert.equal(meetsPasswordPolicy(short), false);
  });

  it("opens submission at three satisfied rules including length", () => {
    assert.equal(meetsPasswordPolicy("abcdefghiJ"), false); // 2
    assert.equal(meetsPasswordPolicy("abcdefghiJ1"), true); // 3
    assert.equal(meetsPasswordPolicy("abcdefghiJ1!"), true); // 4
  });

  it("lists the unmet rules in SPEC order", () => {
    assert.deepEqual(getUnmetPasswordRules("abc"), ["length", "case", "digit", "symbol"]);
    assert.deepEqual(getUnmetPasswordRules("abcdefghiJ"), ["digit", "symbol"]);
    assert.deepEqual(getUnmetPasswordRules("Whispr!2026x"), []);
  });

  it("treats a non-string input as empty", () => {
    assert.equal(evaluatePasswordStrength(undefined as unknown as string).score, 0);
  });
});
