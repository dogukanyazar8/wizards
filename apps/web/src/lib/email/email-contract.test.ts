import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { EMAIL_MAX_BYTES } = await import("@/lib/email/email-theme");
const { byteLength } = await import("@/lib/email/email-html");
const { renderVerificationCodeEmail } =
  await import("@/lib/email/templates/verification-code-email");
const { renderRegistrationAttemptEmail } =
  await import("@/lib/email/templates/registration-attempt-email");
const { renderPasswordResetEmail } = await import("@/lib/email/templates/password-reset-email");
const { renderAccountDeletionReauthEmail } =
  await import("@/lib/email/templates/account-deletion-reauth-email");

/**
 * SPEC §6 kabul ölçütleri — her şablon varyantı için tek yerden.
 *
 * Bu dosya "tasarım doğru mu"yu değil, "e-posta olarak gönderilebilir mi"yi denetler: yasak
 * eleman yok, boyut sınırı aşılmıyor, bağlantılar gerçek, düzen tablo tabanlı.
 */

const VERIFICATION_URL = "https://whispr.app/verify-email?token=ornek-token";

type ContractVariant = {
  allowedSchemes?: readonly string[];
  name: string;
  rendered: { html: string; subject: string; text: string };
};

const VARIANTS: ContractVariant[] = (["tr", "en"] as const).flatMap((locale) => [
  {
    name: `doğrulama/${locale}`,
    rendered: renderVerificationCodeEmail({
      code: "482915",
      codeTtlMinutes: 10,
      locale,
      name: "Ada",
      verificationUrl: VERIFICATION_URL,
    }),
  },
  {
    name: `doğrulama-kodsuz/${locale}`,
    rendered: renderVerificationCodeEmail({
      code: null,
      codeTtlMinutes: 10,
      locale,
      name: "Ada",
      verificationUrl: VERIFICATION_URL,
    }),
  },
  {
    name: `kayıt-denemesi/${locale}`,
    rendered: renderRegistrationAttemptEmail({ locale, name: "Ada" }),
  },
  {
    name: `sıfırlama/${locale}`,
    rendered: renderPasswordResetEmail({
      accountEmail: "ada@whispr.app",
      locale,
      name: "Ada",
      requestContext: {
        deviceLine: "Chrome · macOS · İstanbul, TR",
        requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)",
      },
      resetUrl: "https://whispr.app/reset-password?token=ornek-token",
      ttlMinutes: 30,
    }),
  },
  {
    name: `sıfırlama-cihazsız/${locale}`,
    rendered: renderPasswordResetEmail({
      accountEmail: "ada@whispr.app",
      locale,
      name: "Ada",
      requestContext: { deviceLine: null, requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)" },
      resetUrl: "https://whispr.app/reset-password?token=ornek-token",
      ttlMinutes: 30,
    }),
  },
  {
    name: `hesap-silme-web/${locale}`,
    rendered: renderAccountDeletionReauthEmail({
      expiryMinutes: 10,
      locale,
      name: "Ada",
      reauthUrl: "https://whispr.app/settings/reauth/ornek-token",
    }),
  },
  {
    /*
     * Mobil çağrıda eylem bağlantısı uygulama şeması taşır; alt bilgi bağlantıları yine
     * https kalır. Kapı bu varyantta şemayı bilerek genişletir.
     */
    allowedSchemes: ["https://", "whispr://"],
    name: `hesap-silme-mobil/${locale}`,
    rendered: renderAccountDeletionReauthEmail({
      expiryMinutes: 10,
      locale,
      name: "Ada",
      reauthUrl: "whispr://reauth/account-delete/ornek-token",
    }),
  },
]);

const FORBIDDEN = [
  { label: "görsel", pattern: /<img/i },
  { label: "betik", pattern: /<script/i },
  { label: "form butonu", pattern: /<button/i },
  { label: "flexbox", pattern: /display:\s*flex/i },
  { label: "grid", pattern: /display:\s*grid/i },
  { label: "float", pattern: /float:\s*(left|right)/i },
  { label: "position", pattern: /position:\s*(absolute|relative|fixed|sticky)/i },
  { label: "daktilo font", pattern: /monospace|courier/i },
  { label: "ölü çapa", pattern: /href="#"/i },
];

describe("e-posta teslim sözleşmesi", () => {
  for (const variant of VARIANTS) {
    describe(variant.name, () => {
      const { html, subject, text } = variant.rendered;

      it("yasak eleman ve düzen kuralı taşımaz", () => {
        for (const { label, pattern } of FORBIDDEN) {
          assert.doesNotMatch(html, pattern, `${label} bulundu`);
        }
      });

      it(`boyut ${EMAIL_MAX_BYTES} baytın altında`, () => {
        assert.ok(
          byteLength(html) < EMAIL_MAX_BYTES,
          `${byteLength(html)} bayt, sınır ${EMAIL_MAX_BYTES}`,
        );
      });

      it("gövdenin ilk elemanı gizli önizleme satırıdır", () => {
        const body = html.slice(html.indexOf("<body"));
        const firstElement = /<body[^>]*>\s*(<[^>]+>)/.exec(body)?.[1] ?? "";

        assert.match(firstElement, /^<span [^>]*display:none!important/);
      });

      it("tüm bağlantılar gerçek adrestir", () => {
        const schemes = variant.allowedSchemes ?? ["https://", "http://localhost"];
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? "");

        assert.ok(hrefs.length > 0);
        for (const href of hrefs) {
          assert.ok(
            schemes.some((scheme) => href.startsWith(scheme)),
            `gerçek olmayan adres: ${href}`,
          );
        }
      });

      it("düzen yalnız sunum tablolarıyla kurulur", () => {
        const tables = [...html.matchAll(/<table([^>]*)>/g)].map((match) => match[1] ?? "");

        assert.ok(tables.length > 0);
        for (const attributes of tables) {
          assert.match(attributes, /role="presentation"/);
          assert.match(attributes, /cellpadding="0" cellspacing="0" border="0"/);
        }
      });

      it("konu ve düz metin satır sonu taşımaz", () => {
        assert.doesNotMatch(subject, /[\r\n]/);
        assert.ok(subject.length > 0);
        assert.ok(text.length > 0);
      });

      it("alt bilgi yalnız üç bağlantı ve telif satırı içerir", () => {
        const footer = html.slice(html.lastIndexOf('bgcolor="#F9FAFB" align="center"'));

        assert.equal([...footer.matchAll(/<a href=/g)].length, 3);
        assert.ok(footer.includes("© 2026 Whispr"));
      });
    });
  }
});
