import { type AppLocale, translate } from "@/lib/locale";
import { attributes, escapeHtml, inlineStyle, spacerCell, typeStyle } from "@/lib/email/email-html";
import { buildFooterLinks } from "@/lib/email/email-links";
import {
  EMAIL_BRAND_GRADIENT,
  EMAIL_BRAND_GRADIENT_FALLBACK,
  EMAIL_BREAKPOINT,
  EMAIL_CARD_WIDTH,
  EMAIL_COLORS,
  EMAIL_FONT_STYLESHEET_URL,
  EMAIL_MARK,
  EMAIL_RADIUS,
} from "@/lib/email/email-theme";

/**
 * Ortak e-posta kabuğu — SPEC §3.
 *
 * Üç satırlı 600 px kart: koyu marka bandı, beyaz gövde, açık gri alt bilgi. Şablonlar yalnız
 * gövdenin içini üretir; bant etiketi, önizleme satırı ve medya kuralları parametredir.
 *
 * `<style>` bloğu **yalnız** satır içine yazılamayanı taşır (font `@import` ve medya sorgusu);
 * blok silinse bile e-posta doğru okunmalıdır (PROMPT.md katı kuralı).
 */

export type EmailMediaFeature = "code" | "meta" | "url";

/** Bir şablonun ürettiği üçlü — Resend `emails.send` çağrısına doğrudan verilir. */
export type RenderedEmail = {
  html: string;
  subject: string;
  text: string;
};

export type EmailShellInput = {
  bandLabel: string;
  bodyHtml: string;
  documentTitle: string;
  locale: AppLocale;
  mediaFeatures?: readonly EmailMediaFeature[];
  preheader: string;
};

export function presentationTable(...extraAttributes: string[]) {
  return `<table ${attributes('role="presentation"', 'cellpadding="0"', 'cellspacing="0"', 'border="0"', ...extraAttributes)}>`;
}

/**
 * Medya kuralları sabit sırada yazılır (referans uygulamayla aynı) ve şablon yalnız kullandığı
 * sınıfları ister: kullanılmayan bir sınıf için kural yazmak ölü bayt olurdu.
 */
function renderMediaQuery(features: readonly EmailMediaFeature[]) {
  const rules = [
    ".w-wrap{width:100%!important}",
    ".w-px{padding-left:22px!important;padding-right:22px!important}",
    features.includes("code")
      ? ".w-code{font-size:28px!important;letter-spacing:8px!important}"
      : null,
    ".w-h1{font-size:21px!important}",
    features.includes("url") ? ".w-url{font-size:11px!important}" : null,
    features.includes("meta")
      ? ".w-meta{display:block!important;width:100%!important;padding:0 0 10px 0!important}"
      : null,
  ].filter((rule): rule is string => rule !== null);

  return `@media only screen and (max-width:${EMAIL_BREAKPOINT}px){\n  ${rules.join("\n  ")}\n}`;
}

/**
 * Marka işareti: 36×36 gradyan kare, ortasında beş beyaz çubuk. Görsel değil — `<img>` yasak
 * olduğu için her çubuk kendi tablosunda çizilir; Outlook boş hücreyi çökerttiği için her
 * hücre `&nbsp;` taşır.
 */
function renderBrandMark() {
  const cells: string[] = [];

  EMAIL_MARK.barHeights.forEach((height, index) => {
    if (index > 0) {
      cells.push(spacerCell(EMAIL_MARK.barGap));
    }

    const barStyle = inlineStyle({
      width: `${EMAIL_MARK.barWidth}px`,
      height: `${height}px`,
      "background-color": EMAIL_COLORS.card,
      "border-radius": `${EMAIL_MARK.barRadius}px`,
      "font-size": 0,
      "line-height": 0,
    });

    cells.push(
      `<td width="${EMAIL_MARK.barWidth}" valign="middle" style="width:${EMAIL_MARK.barWidth}px;">` +
        `${presentationTable(`width="${EMAIL_MARK.barWidth}"`)}<tr>` +
        `<td width="${EMAIL_MARK.barWidth}" height="${height}" bgcolor="${EMAIL_COLORS.card}" style="${barStyle}">&nbsp;</td>` +
        `</tr></table></td>`,
    );
  });

  const markStyle = inlineStyle({
    width: `${EMAIL_MARK.size}px`,
    height: `${EMAIL_MARK.size}px`,
    "background-color": EMAIL_BRAND_GRADIENT_FALLBACK,
    "background-image": EMAIL_BRAND_GRADIENT,
    "border-radius": `${EMAIL_RADIUS.mark}px`,
  });

  return `${presentationTable(`width="${EMAIL_MARK.size}"`, `height="${EMAIL_MARK.size}"`, `style="${markStyle}"`)}
            <tr>
              <td width="${EMAIL_MARK.size}" height="${EMAIL_MARK.size}" align="center" valign="middle" style="width:${EMAIL_MARK.size}px;height:${EMAIL_MARK.size}px;">
                ${presentationTable(`style="height:${EMAIL_MARK.innerHeight}px;"`)}
                <tr>
                  ${cells.join("\n                  ")}
                </tr>
                </table>
              </td>
            </tr>
            </table>`;
}

function renderBrandBand(bandLabel: string) {
  const cellStyle = inlineStyle({
    "background-color": EMAIL_COLORS.bandBackground,
    padding: "18px 32px",
    "border-radius": `${EMAIL_RADIUS.card}px ${EMAIL_RADIUS.card}px 0 0`,
  });

  return `    <tr>
      <td class="w-px" bgcolor="${EMAIL_COLORS.bandBackground}" style="${cellStyle}">
        ${presentationTable('width="100%"', 'style="width:100%;"')}
        <tr>
          <td width="${EMAIL_MARK.size}" valign="middle" style="width:${EMAIL_MARK.size}px;">
            ${renderBrandMark()}
          </td>
          <td valign="middle" style="${typeStyle("brandName", { before: { "padding-left": "12px" } })}">Whispr</td>
          <td valign="middle" align="right" style="${typeStyle("bandLabel")}">${escapeHtml(bandLabel)}</td>
        </tr>
        </table>
      </td>
    </tr>`;
}

/**
 * Alt bilgi iki şablonda da aynıdır: yalnız Gizlilik · Şartlar · Çerezler ve telif satırı.
 * Adres, yardım merkezi, abonelik/tercih satırı **yoktur** (SPEC §3).
 */
function renderFooter(locale: AppLocale) {
  const links = buildFooterLinks();
  const linkStyle = inlineStyle({
    color: EMAIL_COLORS.textSecondary,
    "text-decoration": "none",
    "font-weight": 600,
  });
  const cellStyle = inlineStyle({
    "background-color": EMAIL_COLORS.surfaceSubtle,
    padding: "18px 32px 20px 32px",
    "border-left": `1px solid ${EMAIL_COLORS.border}`,
    "border-right": `1px solid ${EMAIL_COLORS.border}`,
    "border-bottom": `1px solid ${EMAIL_COLORS.border}`,
    "border-top": `1px solid ${EMAIL_COLORS.divider}`,
    "border-radius": `0 0 ${EMAIL_RADIUS.card}px ${EMAIL_RADIUS.card}px`,
  });

  const entries: Array<[string, string]> = [
    [links.privacy, translate(locale, "auth.email.common.footerPrivacy")],
    [links.terms, translate(locale, "auth.email.common.footerTerms")],
    [links.cookies, translate(locale, "auth.email.common.footerCookies")],
  ];

  const anchors = entries
    .map(
      ([href, label]) =>
        `<a href="${escapeHtml(href)}" style="${linkStyle}">${escapeHtml(label)}</a>`,
    )
    .join("\n          &nbsp;·&nbsp;\n          ");

  return `    <tr>
      <td class="w-px" bgcolor="${EMAIL_COLORS.surfaceSubtle}" align="center" style="${cellStyle}">
        <p style="${typeStyle("footerText", { before: { margin: "0 0 6px 0" } })}">
          ${anchors}
        </p>
        <p style="${typeStyle("copyright", { before: { margin: 0 } })}">${escapeHtml(translate(locale, "auth.email.common.copyright"))}</p>
      </td>
    </tr>`;
}

export function renderEmailShell(input: EmailShellInput) {
  const mediaFeatures = input.mediaFeatures ?? [];
  const bodyStyle = inlineStyle({
    margin: 0,
    padding: 0,
    "background-color": EMAIL_COLORS.pageBackground,
    "-webkit-text-size-adjust": "100%",
    "-ms-text-size-adjust": "100%",
  });
  const preheaderStyle = inlineStyle({
    display: "none!important",
    visibility: "hidden",
    opacity: 0,
    color: "transparent",
    height: 0,
    width: 0,
    "line-height": 0,
    "font-size": "1px",
    overflow: "hidden",
    "mso-hide": "all",
  });
  const bodyCellStyle = inlineStyle({
    "background-color": EMAIL_COLORS.card,
    padding: "30px 32px 26px 32px",
    "border-left": `1px solid ${EMAIL_COLORS.border}`,
    "border-right": `1px solid ${EMAIL_COLORS.border}`,
  });

  return `<!DOCTYPE html>
<html lang="${input.locale}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.documentTitle)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<!--[if !mso]><!-->
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${EMAIL_FONT_STYLESHEET_URL}">
<!--<![endif]-->
<style type="text/css">
@import url('${EMAIL_FONT_STYLESHEET_URL}');
${renderMediaQuery(mediaFeatures)}
</style>
</head>
<body style="${bodyStyle}">
<span style="${preheaderStyle}">${escapeHtml(input.preheader)}</span>

${presentationTable('width="100%"', `style="${inlineStyle({ "background-color": EMAIL_COLORS.pageBackground })}"`)}
<tr>
<td align="center" style="padding:24px 12px 32px 12px;">

  ${presentationTable('class="w-wrap"', `width="${EMAIL_CARD_WIDTH}"`, `style="${inlineStyle({ width: `${EMAIL_CARD_WIDTH}px`, "max-width": `${EMAIL_CARD_WIDTH}px` })}"`)}

${renderBrandBand(input.bandLabel)}

    <tr>
      <td class="w-px" bgcolor="${EMAIL_COLORS.card}" style="${bodyCellStyle}">

${input.bodyHtml}

      </td>
    </tr>

${renderFooter(input.locale)}

  </table>

</td>
</tr>
</table>
</body>
</html>`;
}
