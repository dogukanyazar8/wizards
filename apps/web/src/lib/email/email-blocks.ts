import { escapeHtml, inlineStyle, typeStyle } from "@/lib/email/email-html";
import { presentationTable } from "@/lib/email/email-shell";
import { EMAIL_COLORS, EMAIL_RADIUS, EMAIL_TYPE } from "@/lib/email/email-theme";

/**
 * Gövde blokları — SPEC §4 ve §5.
 *
 * Her blok saf fonksiyondur ve kendi tablosunu kapatır; şablonlar bunları sırayla dizer.
 * Ölçüler referans uygulamadan (`design_handoff/eposta-handoff/html/*.html`) birebir alınmıştır,
 * tahmin yoktur.
 */

function fullWidthTable(rows: string) {
  return `${presentationTable('width="100%"', 'style="width:100%;"')}
${rows}
        </table>`;
}

/** Göz üstü etiket — H1'in üstündeki küçük büyük harf satırı. */
export function eyebrow(text: string) {
  return `<p style="${typeStyle("eyebrow", { before: { margin: "0 0 10px 0" } })}">${escapeHtml(text)}</p>`;
}

export function heading(text: string) {
  return `<h1 class="w-h1" style="${typeStyle("heading", { before: { margin: "0 0 12px 0" } })}">${escapeHtml(text)}</h1>`;
}

/** `html` zaten kaçırılmış olmalıdır: paragraflar bağlantı ve vurgu `<span>` taşıyabiliyor. */
export function paragraph(html: string, options: { marginBottom?: string } = {}) {
  return `<p style="${typeStyle("body", { before: { margin: `0 0 ${options.marginBottom ?? "22px"} 0` } })}">${html}</p>`;
}

/** Süre vurgusu — "10 dakika" / "30 dakika" (SPEC §1 uyarı metni rengi). */
export function emphasis(text: string) {
  return `<span style="${inlineStyle({ color: EMAIL_COLORS.warning, "font-weight": 600 })}">${escapeHtml(text)}</span>`;
}

export type CodeBoxInput = {
  code: string;
  expiryPrefix: string;
  expirySuffix: string;
  expiryValue: string;
  label: string;
};

/**
 * Doğrulama kodu kutusu. Kod `letter-spacing:11px` ile yazılır ve mobilde medya sorgusu
 * `w-code` üzerinden 28 px / 8 px'e iner — bu yüzden kod satırı sınıfını taşımak zorundadır.
 */
export function codeBox(input: CodeBoxInput) {
  const cellStyle = inlineStyle({
    "background-color": EMAIL_COLORS.surfaceSubtle,
    border: `1px solid ${EMAIL_COLORS.border}`,
    "border-radius": `${EMAIL_RADIUS.box}px`,
    padding: "18px 16px 16px 16px",
  });

  return fullWidthTable(`        <tr>
          <td align="center" bgcolor="${EMAIL_COLORS.surfaceSubtle}" style="${cellStyle}">
            <p style="${typeStyle("boxLabel", { before: { margin: "0 0 8px 0" }, overrides: { letterSpacing: "1.6px" } })}">${escapeHtml(input.label)}</p>
            <p class="w-code" style="${typeStyle("code", { before: { margin: "0 0 6px 0" } })}">${escapeHtml(input.code)}</p>
            <p style="${typeStyle("smallNote", { before: { margin: 0 }, overrides: { lineHeight: "18px" } })}">${escapeHtml(input.expiryPrefix)}${emphasis(input.expiryValue)}${escapeHtml(input.expirySuffix)}</p>
          </td>
        </tr>`);
}

export type CtaInput = {
  buttonPadding: string;
  href: string;
  label: string;
  noteFontSize?: string | undefined;
  noteHtml: string;
  noteLineHeight?: string | undefined;
  notePadding: string;
  wrapperPadding?: string | undefined;
};

/**
 * "Bulletproof" buton + altındaki açıklama satırı.
 *
 * Buton zemini `<td bgcolor>` üzerinde durur, tıklama alanı `display:block` `<a>` ile hücrenin
 * tamamına yayılır. Görsel buton veya `<button>` kullanılmaz — ikisi de Outlook'ta çizilmez.
 */
export function callToAction(input: CtaInput) {
  /*
   * Kural sırası referans uygulamayla aynı tutulur: `text-decoration` rengin hemen ardından
   * gelir. `typeStyle` bunu araya sokamadığı için buton çapası kuralları elle dizer.
   */
  const buttonAnchorStyle = inlineStyle({
    display: "block",
    padding: input.buttonPadding,
    "font-family": EMAIL_TYPE.button.fontFamily,
    "font-size": EMAIL_TYPE.button.fontSize,
    "font-weight": EMAIL_TYPE.button.fontWeight,
    color: EMAIL_TYPE.button.color,
    "text-decoration": "none",
    "line-height": EMAIL_TYPE.button.lineHeight,
    "mso-line-height-rule": "exactly",
  });

  return fullWidthTable(`        <tr>
          <td align="center"${input.wrapperPadding ? ` style="padding:${input.wrapperPadding};"` : ""}>
            ${presentationTable()}
            <tr>
              <td align="center" bgcolor="${EMAIL_COLORS.primary}" style="${inlineStyle({ "background-color": EMAIL_COLORS.primary, "border-radius": `${EMAIL_RADIUS.button}px` })}">
                <a href="${escapeHtml(input.href)}" style="${buttonAnchorStyle}">${escapeHtml(input.label)}</a>
              </td>
            </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="${typeStyle("smallNote", { before: { padding: input.notePadding }, overrides: { fontSize: input.noteFontSize, lineHeight: input.noteLineHeight } })}">${input.noteHtml}</td>
        </tr>`);
}

export type FallbackUrlBoxInput = {
  label: string;
  url: string;
};

/**
 * Yedek bağlantı kutusu. Daktilo font kullanılmaz (SPEC); uzun token'lı adres
 * `word-break:break-all` ile kırılır, mobilde `w-url` ile 11 px'e iner.
 */
export function fallbackUrlBox(input: FallbackUrlBoxInput) {
  const cellStyle = inlineStyle({
    "background-color": EMAIL_COLORS.surfaceSubtle,
    border: `1px solid ${EMAIL_COLORS.border}`,
    "border-radius": `${EMAIL_RADIUS.box}px`,
    padding: "16px 18px",
  });
  const safeUrl = escapeHtml(input.url);

  return fullWidthTable(`        <tr>
          <td bgcolor="${EMAIL_COLORS.surfaceSubtle}" style="${cellStyle}">
            <p style="${typeStyle("boxLabel", { before: { margin: "0 0 6px 0" } })}">${escapeHtml(input.label)}</p>
            <p class="w-url" style="${typeStyle("smallNote", { after: { "word-break": "break-all" }, before: { margin: 0 }, overrides: { color: EMAIL_COLORS.link, lineHeight: "20px" } })}"><a href="${safeUrl}" style="${inlineStyle({ color: EMAIL_COLORS.link, "text-decoration": "underline", "word-break": "break-all" })}">${safeUrl}</a></p>
          </td>
        </tr>`);
}

export type MetaEntry = {
  label: string;
  value: string;
};

/**
 * İstek özeti ızgarası — eşit genişlikte hücreler.
 *
 * SPEC §5 notu: ayırıcı hücresine dolgu verilmez; verilirse arka plan rengi dolgu boyunca
 * boyanır ve 1 px çizgi kalın bir bant gibi görünür. Boşluk üstteki meta hücrelerinde durur.
 * Tek girdi kalırsa (cihaz satırı çözülemediyse) hücre tam genişliğe yayılır.
 */
export function metaGrid(entries: readonly MetaEntry[]) {
  if (entries.length === 0) {
    return "";
  }

  const width = `${Math.round(100 / entries.length)}%`;
  const cells = entries
    .map((entry, index) => {
      const isFirst = index === 0;
      const isLast = index === entries.length - 1;
      const padding = `18px ${isLast ? "0" : "10px"} 20px ${isFirst ? "0" : "10px"}`;
      /*
       * Hücre yalnız taban tipografiyi taşır; renk ve ağırlık içteki iki `<span>`de durur
       * (etiket soluk ve büyük harf, değer koyu ve 600).
       */
      const cellStyle = inlineStyle({
        width,
        padding,
        "font-family": EMAIL_TYPE.metaValue.fontFamily,
        "font-size": EMAIL_TYPE.metaValue.fontSize,
        "line-height": EMAIL_TYPE.metaValue.lineHeight,
        "mso-line-height-rule": "exactly",
      });

      return `          <td width="${width}" class="w-meta" style="${cellStyle}">
            <span style="${inlineStyle({
              display: "block",
              "font-size": "10px",
              "font-weight": 600,
              "letter-spacing": "1.3px",
              "text-transform": "uppercase",
              color: EMAIL_COLORS.textFaint,
            })}">${escapeHtml(entry.label)}</span>
            <span style="${inlineStyle({ color: EMAIL_COLORS.foreground, "font-weight": 600 })}">${escapeHtml(entry.value)}</span>
          </td>`;
    })
    .join("\n");

  return fullWidthTable(`        <tr>
${cells}
        </tr>`);
}

/**
 * Dikey boşluk satırı.
 *
 * Boşluk her zaman **üstteki** bloğa aittir: ayırıcı hücresine dolgu vermek arka planı dolgu
 * boyunca boyar ve 1 px çizgiyi kalın bir bant gibi gösterir (SPEC §5 notu). SPEC'in çizdiği iki
 * şablonda bu boşluğu meta ızgarası ya da buton altı not taşıyor; ikisi de bulunmayan bir
 * gövdede araya bu satır girer.
 */
export function spacerBlock(height: number) {
  return fullWidthTable(`        <tr>
          <td height="${height}" style="${inlineStyle({ height: `${height}px`, "font-size": 0, "line-height": 0 })}">&nbsp;</td>
        </tr>`);
}

export type SecuritySectionInput = {
  bodyHtml: string;
  label: string;
};

/**
 * 1 px ayırıcı + güvenlik notu. İkisi tek tabloda durur (referans uygulamada da öyle):
 * ayırıcı hücresi `font-size:0;line-height:0` taşımazsa Outlook onu 1 px'te tutmaz.
 */
export function securitySection(input: SecuritySectionInput) {
  return fullWidthTable(`        <tr><td height="1" bgcolor="${EMAIL_COLORS.divider}" style="${inlineStyle({ height: "1px", "background-color": EMAIL_COLORS.divider, "font-size": 0, "line-height": 0 })}">&nbsp;</td></tr>
        <tr>
          <td style="padding:20px 0 0 0;">
            <p style="${typeStyle("boxLabel", { before: { margin: "0 0 6px 0" } })}">${escapeHtml(input.label)}</p>
            <p style="${typeStyle("securityNote", { before: { margin: 0 } })}">${input.bodyHtml}</p>
          </td>
        </tr>`);
}

/** Gövde içi bağlantı — güvenlik notundaki "tüm oturumlarını kapat" gibi. */
export function inlineLink(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="${inlineStyle({ color: EMAIL_COLORS.link, "text-decoration": "underline", "font-weight": 600 })}">${escapeHtml(label)}</a>`;
}
