import { eyebrow, heading, paragraph, securitySection } from "@/lib/email/email-blocks";
import { escapeHtml, stripHeaderNewlines } from "@/lib/email/email-html";
import { renderEmailShell, type RenderedEmail } from "@/lib/email/email-shell";
import { buildEmailText, emailTextFooter } from "@/lib/email/email-text";
import { type AppLocale, translate } from "@/lib/locale";

/**
 * Kayıt denemesi bildirimi — var olan bir e-posta adresiyle yeni hesap açılmaya çalışıldığında
 * adresin sahibine gider.
 *
 * SPEC bu mektubu çizmiyor; paket kararı K4 yalnız **kabuğu** ortaklaştırır, metin olduğu gibi
 * korunur. Kabuğa taşımak için üç değer türetildi (paket belgesindeki E1–E3): bant etiketi
 * "Hesap güvenliği", göz üstü etiketi "Bildirim" ve eylemsiz gövde düzeni (kod kutusu, buton,
 * yedek URL ve meta ızgarası kullanılmaz — bu mektupta tıklanacak bir şey yok).
 */

export type RegistrationAttemptEmailInput = {
  locale: AppLocale;
  name: string;
};

export function renderRegistrationAttemptEmail(
  input: RegistrationAttemptEmailInput,
): RenderedEmail {
  const { locale } = input;
  const greeting = translate(locale, "auth.email.registrationAttempt.greeting", {
    name: input.name,
  });
  const bodyText = translate(locale, "auth.email.registrationAttempt.body");
  const securityLabel = translate(locale, "auth.email.registrationAttempt.securityLabel");
  const securityBody = translate(locale, "auth.email.registrationAttempt.securityBody");
  const headingText = translate(locale, "auth.email.registrationAttempt.heading");

  const bodyHtml = [
    eyebrow(translate(locale, "auth.email.registrationAttempt.eyebrow")),
    heading(headingText),
    paragraph(escapeHtml(greeting), { marginBottom: "12px" }),
    paragraph(escapeHtml(bodyText)),
    securitySection({ bodyHtml: escapeHtml(securityBody), label: securityLabel }),
  ].join("\n\n        ");

  return {
    html: renderEmailShell({
      bandLabel: translate(locale, "auth.email.registrationAttempt.bandLabel"),
      bodyHtml: `        ${bodyHtml}`,
      documentTitle: translate(locale, "auth.email.registrationAttempt.documentTitle"),
      locale,
      preheader: translate(locale, "auth.email.registrationAttempt.preheader"),
    }),
    subject: stripHeaderNewlines(translate(locale, "auth.email.registrationAttempt.subject")),
    text: buildEmailText([
      headingText,
      "",
      greeting,
      bodyText,
      "",
      securityLabel,
      securityBody,
      ...emailTextFooter(locale),
    ]),
  };
}
