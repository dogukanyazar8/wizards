import {
  callToAction,
  emphasis,
  eyebrow,
  fallbackUrlBox,
  heading,
  inlineLink,
  metaGrid,
  paragraph,
  securitySection,
  type MetaEntry,
} from "@/lib/email/email-blocks";
import { escapeHtml, stripHeaderNewlines } from "@/lib/email/email-html";
import { buildSecurityUrl } from "@/lib/email/email-links";
import type { EmailRequestContext } from "@/lib/email/email-request-context";
import { renderEmailShell, type RenderedEmail } from "@/lib/email/email-shell";
import { buildEmailText, emailTextFooter } from "@/lib/email/email-text";
import { type AppLocale, translate } from "@/lib/locale";

/**
 * Şifre sıfırlama e-postası — SPEC §5.
 *
 * Buton ve yedek URL kutusu **aynı** adresi taşır; kutu, düğmeyi çizemeyen istemciler için var.
 * İstek özeti (zaman + cihaz) gerçek istekten türer: cihaz satırı çözülemezse hücre hiç
 * çizilmez ve zaman tek kolona yayılır — uydurma bir cihaz adı yazmaktansa satır eksilir.
 */

export type PasswordResetEmailInput = {
  accountEmail: string;
  locale: AppLocale;
  name: string;
  requestContext: EmailRequestContext;
  resetUrl: string;
  ttlMinutes: number;
};

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const { locale } = input;
  const minutes = input.ttlMinutes;

  const bodyText = translate(locale, "auth.email.reset.body", {
    email: input.accountEmail,
    name: input.name,
  });
  const ctaLabel = translate(locale, "auth.email.reset.cta");
  const notePrefix = translate(locale, "auth.email.reset.ctaNotePrefix");
  const noteValue = translate(locale, "auth.email.reset.ctaNoteValue", { minutes });
  const noteSuffix = translate(locale, "auth.email.reset.ctaNoteSuffix");
  const fallbackLabel = translate(locale, "auth.email.reset.fallbackLabel");
  const timeLabel = translate(locale, "auth.email.reset.metaTimeLabel");
  const deviceLabel = translate(locale, "auth.email.reset.metaDeviceLabel");
  const securityLabel = translate(locale, "auth.email.reset.securityLabel");
  const securityBefore = translate(locale, "auth.email.reset.securityBodyBefore");
  const securityLink = translate(locale, "auth.email.reset.securityBodyLink");
  const securityAfter = translate(locale, "auth.email.reset.securityBodyAfter");

  const metaEntries: MetaEntry[] = [
    { label: timeLabel, value: input.requestContext.requestedAtLabel },
    ...(input.requestContext.deviceLine
      ? [{ label: deviceLabel, value: input.requestContext.deviceLine }]
      : []),
  ];

  const bodyHtml = [
    eyebrow(translate(locale, "auth.email.reset.eyebrow")),
    heading(translate(locale, "auth.email.reset.heading")),
    paragraph(escapeHtml(bodyText)),
    callToAction({
      buttonPadding: "15px 36px",
      href: input.resetUrl,
      label: ctaLabel,
      noteHtml: `${escapeHtml(notePrefix)}${emphasis(noteValue)}${escapeHtml(noteSuffix)}`,
      notePadding: "10px 0 20px 0",
    }),
    fallbackUrlBox({ label: fallbackLabel, url: input.resetUrl }),
    metaGrid(metaEntries),
    securitySection({
      bodyHtml: `${escapeHtml(securityBefore)}${inlineLink(buildSecurityUrl(), securityLink)}${escapeHtml(securityAfter)}`,
      label: securityLabel,
    }),
  ].join("\n\n        ");

  return {
    html: renderEmailShell({
      bandLabel: translate(locale, "auth.email.reset.bandLabel"),
      bodyHtml: `        ${bodyHtml}`,
      documentTitle: translate(locale, "auth.email.reset.documentTitle"),
      locale,
      mediaFeatures: ["url", "meta"],
      preheader: translate(locale, "auth.email.reset.preheader", { minutes }),
    }),
    subject: stripHeaderNewlines(translate(locale, "auth.email.reset.subject", { minutes })),
    text: buildEmailText([
      translate(locale, "auth.email.reset.heading"),
      "",
      bodyText,
      "",
      ctaLabel,
      input.resetUrl,
      `${notePrefix}${noteValue}${noteSuffix}`,
      "",
      `${timeLabel}: ${input.requestContext.requestedAtLabel}`,
      input.requestContext.deviceLine ? `${deviceLabel}: ${input.requestContext.deviceLine}` : null,
      "",
      securityLabel,
      `${securityBefore}${securityLink}${securityAfter}`,
      buildSecurityUrl(),
      ...emailTextFooter(locale),
    ]),
  };
}
