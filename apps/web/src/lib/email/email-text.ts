import { buildFooterLinks } from "@/lib/email/email-links";
import { type AppLocale, translate } from "@/lib/locale";

/**
 * Düz metin (`text/plain`) sürümü.
 *
 * Resend'e HTML ile birlikte düz metin de gidiyor; görseli engelleyen istemcide ve ekran
 * okuyucularda okunan budur. Sıra HTML ile aynıdır, vurgu parçaları birleştirilir ve
 * bağlantılar çıplak adres olarak yazılır.
 */

/** `null`/`undefined` satırlar elenir; satır içi `\r`/`\n` tek boşluğa iner. */
export function buildEmailText(lines: ReadonlyArray<string | null | undefined>) {
  return lines
    .filter((line): line is string => line !== null && line !== undefined)
    .map((line) => line.replace(/[\r\n]+/g, " "))
    .join("\n");
}

/** Alt bilgi, HTML'deki gibi üç bağlantı ve telif satırı. */
export function emailTextFooter(locale: AppLocale) {
  const links = buildFooterLinks();

  return [
    "",
    `${translate(locale, "auth.email.common.footerPrivacy")}: ${links.privacy}`,
    `${translate(locale, "auth.email.common.footerTerms")}: ${links.terms}`,
    `${translate(locale, "auth.email.common.footerCookies")}: ${links.cookies}`,
    translate(locale, "auth.email.common.copyright"),
  ];
}
