/**
 * K1 — telefon dalı bu pakette kapsam dışı.
 *
 * `design_handoff/giris-kayit-paketi/SPEC.md` §4.6 ve §6.4 telefon doğrulama ekranlarını,
 * §4.4/2 de tek alanda e-posta/telefon otomatik algılamasını tanımlıyor. Depoda SMS ya da sesli
 * arama sağlayıcı yok (twilio · sns · vonage · messagebird — hiçbiri bağımlılık değil), bu yüzden
 * kullanıcı kararıyla telefon tamamen kapsam dışında bırakıldı.
 *
 * Metinler sözlükten **silinmedi**: sağlayıcı geldiğinde ekran tek yerden açılsın ve SPEC §13
 * tablosu eksiksiz kalsın diye duruyorlar. Parity testi bu listeyi tanır ve "ekranda görünmeli"
 * kuralından muaf tutar.
 */
export const SKIPPED_BY_K1 = [
  "auth.field.contact",
  "auth.field.contactPlaceholder",
  "auth.field.phoneDetected",
  "auth.verifyPhone.eyebrow",
  "auth.verifyPhone.title",
  "auth.verifyPhone.subtitle",
  "auth.verifyPhone.changePhone",
  "auth.verifyPhone.callInstead",
] as const;

export type SkippedAuthCopyKey = (typeof SKIPPED_BY_K1)[number];

const SKIPPED_SET: ReadonlySet<string> = new Set(SKIPPED_BY_K1);

export function isSkippedByK1(key: string): boolean {
  return SKIPPED_SET.has(key);
}
