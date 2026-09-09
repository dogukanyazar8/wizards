import {
  callToAction,
  emphasis,
  eyebrow,
  fallbackUrlBox,
  heading,
  paragraph,
  securitySection,
  spacerBlock,
} from "@/lib/email/email-blocks";
import { escapeHtml, stripHeaderNewlines } from "@/lib/email/email-html";
import { renderEmailShell, type RenderedEmail } from "@/lib/email/email-shell";
import { buildEmailText, emailTextFooter } from "@/lib/email/email-text";
import { type AppLocale, translate } from "@/lib/locale";

/**
 * Hesap silme yeniden kimlik doğrulama e-postası.
 *
 * SPEC bu mektubu çizmiyor; ortak kabuğa taşınırken metin korundu ve yalnız kabuk için gereken
 * değerler türetildi (paket belgesindeki E6–E9). Yapı şifre sıfırlamanın eylem gövdesiyle aynı:
 * buton + yedek bağlantı kutusu + güvenlik notu. Meta ızgarası yok — bu mektupta istek özeti
 * gösterilmiyor.
 *
 * Mobil çağrıda bağlantı uygulama şeması taşır (`whispr://reauth/account-delete/<token>`);
 * token sorgu dizesinde değil yolda durur, çünkü sorgu dizesi tarayıcı geçmişine ve istek
 * telemetrisine kopyalanır.
 */

export type AccountDeletionReauthEmailInput = {
  expiryMinutes: number;
  locale: AppLocale;
  name: string;
  reauthUrl: string;
};

export function renderAccountDeletionReauthEmail(
  input: AccountDeletionReauthEmailInput,
): RenderedEmail {
  const { locale } = input;
  const minutes = input.expiryMinutes;

  const headingText = translate(locale, "auth.email.reauth.heading");
  const greeting = translate(locale, "auth.email.reauth.greeting", { name: input.name });
  const bodyText = translate(locale, "auth.email.reauth.body");
  const rationale = translate(locale, "auth.email.reauth.rationale");
  const ctaLabel = translate(locale, "auth.email.reauth.cta");
  const expiryPrefix = translate(locale, "auth.email.reauth.expiryPrefix");
  const expiryValue = translate(locale, "auth.email.reauth.expiryValue", { minutes });
  const expirySuffix = translate(locale, "auth.email.reauth.expirySuffix");
  /* Yedek kutu etiketi SPEC'in şifre sıfırlama metnidir (E8): kabuğun kısa etiket biçimine
     uyan, zaten onaylanmış tek karşılık. */
  const fallbackLabel = translate(locale, "auth.email.reset.fallbackLabel");
  const securityLabel = translate(locale, "auth.email.reauth.securityLabel");
  const securityBody = translate(locale, "auth.email.reauth.securityBody");

  const bodyHtml = [
    eyebrow(translate(locale, "auth.email.reauth.eyebrow")),
    heading(headingText),
    paragraph(escapeHtml(greeting), { marginBottom: "12px" }),
    paragraph(escapeHtml(bodyText), { marginBottom: "12px" }),
    paragraph(escapeHtml(rationale)),
    callToAction({
      buttonPadding: "15px 36px",
      href: input.reauthUrl,
      label: ctaLabel,
      noteHtml: `${escapeHtml(expiryPrefix)}${emphasis(expiryValue)}${escapeHtml(expirySuffix)}`,
      notePadding: "10px 0 20px 0",
    }),
    fallbackUrlBox({ label: fallbackLabel, url: input.reauthUrl }),
    /* Ayırıcıdan önceki boşluk: bu gövdede meta ızgarası yok, boşluğu taşıyacak blok da yok. */
    spacerBlock(20),
    securitySection({ bodyHtml: escapeHtml(securityBody), label: securityLabel }),
  ].join("\n\n        ");

  return {
    html: renderEmailShell({
      bandLabel: translate(locale, "auth.email.reauth.bandLabel"),
      bodyHtml: `        ${bodyHtml}`,
      documentTitle: headingText,
      locale,
      mediaFeatures: ["url"],
      preheader: translate(locale, "auth.email.reauth.preheader"),
    }),
    subject: stripHeaderNewlines(translate(locale, "auth.email.reauth.subject")),
    text: buildEmailText([
      headingText,
      "",
      greeting,
      bodyText,
      rationale,
      "",
      ctaLabel,
      input.reauthUrl,
      `${expiryPrefix}${expiryValue}${expirySuffix}`,
      "",
      securityLabel,
      securityBody,
      ...emailTextFooter(locale),
    ]),
  };
}
