import {
  callToAction,
  codeBox,
  eyebrow,
  heading,
  paragraph,
  securitySection,
} from "@/lib/email/email-blocks";
import { escapeHtml, stripHeaderNewlines } from "@/lib/email/email-html";
import { renderEmailShell, type RenderedEmail } from "@/lib/email/email-shell";
import { buildEmailText, emailTextFooter } from "@/lib/email/email-text";
import { type AppLocale, translate } from "@/lib/locale";

/**
 * Kayıt doğrulama e-postası — SPEC §4.
 *
 * Aynı mektup hem altı haneli kodu hem de tarayıcıda tamamlama bağlantısını taşır. Kod, hız
 * sınırına takıldığında üretilemeyebilir (`requestEmailVerificationCode` "cooldown"/"rateLimited"
 * döner); o durumda kod kutusu hiç çizilmez, konu ve önizleme satırı kodsuz biçime düşer ve
 * mektup yalnız bağlantıyla gider. Kullanıcıyı boş bırakmaktansa eski yol çalışır.
 */

export type VerificationCodeEmailInput = {
  /** Altı haneli kod; üretilemediyse `null`. */
  code: string | null;
  codeTtlMinutes: number;
  locale: AppLocale;
  name: string;
  verificationUrl: string;
};

const CODE_PATTERN = /^\d{6}$/;

/** Önizleme satırında kod üçerli gruplanır: `482915` → `482 915`. */
export function toSpacedCode(code: string) {
  return code.replace(/(\d{3})(?=\d)/g, "$1 ");
}

export function renderVerificationCodeEmail(input: VerificationCodeEmailInput): RenderedEmail {
  const { locale } = input;
  /* Kod yalnız rakamsa kabul edilir; bozuk bir değer kutuya da konuya da girmez. */
  const code = input.code && CODE_PATTERN.test(input.code) ? input.code : null;
  const minutes = input.codeTtlMinutes;

  const documentTitle = translate(locale, "auth.email.verification.documentTitle");
  const bodyText = translate(locale, "auth.email.verification.body", { name: input.name });
  const ctaLabel = translate(locale, "auth.email.verification.cta");
  const ctaNote = translate(locale, "auth.email.verification.ctaNote");
  const codeLabel = translate(locale, "auth.email.verification.codeLabel");
  const expiryPrefix = translate(locale, "auth.email.verification.codeExpiryPrefix");
  const expiryValue = translate(locale, "auth.email.verification.codeExpiryValue", { minutes });
  const expirySuffix = translate(locale, "auth.email.verification.codeExpirySuffix");
  const securityLabel = translate(locale, "auth.email.verification.securityLabel");
  const securityBody = translate(locale, "auth.email.verification.securityBody");

  const preheader = code
    ? translate(locale, "auth.email.verification.preheader", {
        minutes,
        spacedCode: toSpacedCode(code),
      })
    : translate(locale, "auth.email.verification.preheaderNoCode");

  const subject = stripHeaderNewlines(
    code
      ? translate(locale, "auth.email.verification.subject", { code })
      : translate(locale, "auth.email.verification.subjectNoCode"),
  );

  const bodyHtml = [
    eyebrow(translate(locale, "auth.email.verification.eyebrow")),
    heading(translate(locale, "auth.email.verification.heading")),
    paragraph(escapeHtml(bodyText)),
    code
      ? codeBox({
          code,
          expiryPrefix,
          expirySuffix,
          expiryValue,
          label: codeLabel,
        })
      : null,
    callToAction({
      buttonPadding: "14px 32px",
      href: input.verificationUrl,
      label: ctaLabel,
      noteFontSize: "12px",
      noteHtml: escapeHtml(ctaNote),
      noteLineHeight: "18px",
      notePadding: "10px 0 22px 0",
      /*
       * Kod kutusu çizilmediğinde üstteki 22 px'lik ayırma paragrafın kendi alt boşluğuyla
       * üst üste binerdi; kutu yoksa buton doğrudan paragrafın boşluğuna dayanır.
       */
      wrapperPadding: code ? "22px 0 0 0" : undefined,
    }),
    securitySection({ bodyHtml: escapeHtml(securityBody), label: securityLabel }),
  ]
    .filter((block): block is string => block !== null)
    .join("\n\n        ");

  return {
    html: renderEmailShell({
      bandLabel: translate(locale, "auth.email.verification.bandLabel"),
      bodyHtml: `        ${bodyHtml}`,
      documentTitle,
      locale,
      mediaFeatures: code ? ["code"] : [],
      preheader,
    }),
    subject,
    text: buildEmailText([
      translate(locale, "auth.email.verification.heading"),
      "",
      bodyText,
      "",
      ...(code ? [codeLabel, code, `${expiryPrefix}${expiryValue}${expirySuffix}`, ""] : []),
      ctaLabel,
      input.verificationUrl,
      ctaNote,
      "",
      securityLabel,
      securityBody,
      ...emailTextFooter(locale),
    ]),
  };
}
