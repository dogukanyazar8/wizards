/**
 * Şifre gücü — tek kaynak.
 *
 * `design_handoff/giris-kayit-paketi/SPEC.md` §4.4/5 dört kural ve dört regex tanımlıyor;
 * §10 "üçü karşılanmadan `Hesabı oluştur` etkin olmaz" diyor. Web kayıt ekranı, web şifre
 * sıfırlama ekranı, mobil kayıt ekranı ve sunucu şeması **aynı** hesabı yapmak zorunda —
 * yoksa istemci yeşil gösterirken sunucu reddeder. Bu modül o hesabın tek yeridir.
 *
 * Regexler SPEC'ten birebir alındı: Türkçe küçük/büyük harfler kapsanıyor ve sembol kuralı
 * Türkçe harfleri sembol saymıyor.
 */

/** SPEC §4.4 kural 1 — `En az 10 karakter`. */
export const PASSWORD_MIN_LENGTH = 10;

/** SPEC §10 — dört kuralın kaçı karşılanmadan gönderim açılmaz. */
export const PASSWORD_REQUIRED_RULE_COUNT = 3;

export type PasswordRuleId = "length" | "case" | "digit" | "symbol";

/** SPEC §4.4/5 sırası: uzunluk · büyük-küçük · sayı · sembol. */
export const PASSWORD_RULE_IDS: readonly PasswordRuleId[] = Object.freeze([
  "length",
  "case",
  "digit",
  "symbol",
]);

/** Skor 0–4; SPEC §4.4/4 ton eşlemesi bu skoru okur. */
export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/** SPEC §4.4/4 — skor → ton. 0–1 danger, 2 warning, 3–4 success. */
export type PasswordStrengthTone = "danger" | "warning" | "success";

export type PasswordStrength = {
  rules: Record<PasswordRuleId, boolean>;
  satisfiedCount: number;
  score: PasswordScore;
  tone: PasswordStrengthTone;
};

const LOWERCASE_PATTERN = /[a-zçğıöşü]/;
const UPPERCASE_PATTERN = /[A-ZÇĞİÖŞÜ]/;
const DIGIT_PATTERN = /\d/;
const SYMBOL_PATTERN = /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ\s]/;

function toTone(score: PasswordScore): PasswordStrengthTone {
  if (score <= 1) {
    return "danger";
  }

  if (score === 2) {
    return "warning";
  }

  return "success";
}

export function evaluatePasswordStrength(value: string): PasswordStrength {
  const input = typeof value === "string" ? value : "";
  const rules: Record<PasswordRuleId, boolean> = {
    case: LOWERCASE_PATTERN.test(input) && UPPERCASE_PATTERN.test(input),
    digit: DIGIT_PATTERN.test(input),
    length: input.length >= PASSWORD_MIN_LENGTH,
    symbol: SYMBOL_PATTERN.test(input),
  };

  const satisfiedCount = PASSWORD_RULE_IDS.reduce(
    (total, ruleId) => (rules[ruleId] ? total + 1 : total),
    0,
  );
  const score = satisfiedCount as PasswordScore;

  return { rules, satisfiedCount, score, tone: toTone(score) };
}

/**
 * Gönderim kapısı. SPEC §10: uzunluk kuralı **her zaman** zorunlu, kalan üç kuraldan
 * yeterince çoğu karşılanmalı. `satisfiedCount >= 3` tek başına yetmez — 10 karakterden
 * kısa ama üç kuralı sağlayan bir şifre geçerdi.
 */
export function meetsPasswordPolicy(value: string): boolean {
  const strength = evaluatePasswordStrength(value);

  return strength.rules.length && strength.satisfiedCount >= PASSWORD_REQUIRED_RULE_COUNT;
}

/** Kural listesi ikonları için: hangi kurallar eksik. */
export function getUnmetPasswordRules(value: string): PasswordRuleId[] {
  const strength = evaluatePasswordStrength(value);

  return PASSWORD_RULE_IDS.filter((ruleId) => !strength.rules[ruleId]);
}
