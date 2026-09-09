import { EMAIL_TYPE, type EmailTypeRole, type EmailTypeSpec } from "@/lib/email/email-theme";

/**
 * E-posta HTML'i için ham yardımcılar.
 *
 * `escapeHtml` daha önce `email-verification.ts`, `password-reset.ts` ve `reauth-email.ts`
 * içinde birebir üç kopya hâlinde duruyordu; kaçış davranışı tek yerde tutulur ki bir
 * şablonun unuttuğu karakter diğerinde de unutulmasın.
 */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Konu satırına giren her değerden satır sonu çıkarılır: `\r`/`\n` taşıyan bir görünen ad
 * SMTP başlığını bölerek e-postaya ikinci bir başlık ekletebilir (başlık enjeksiyonu).
 */
export function stripHeaderNewlines(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export type StyleDeclarations = Record<string, string | number | null | undefined>;

/**
 * Satır içi stil dizesi. Anahtar sırası **korunur** — referans uygulamayla (`html/*.html`)
 * bayt düzeyinde karşılaştırma yapılabilsin diye bloklar kuralları referanstaki sırayla verir.
 */
export function inlineStyle(declarations: StyleDeclarations) {
  const rules = Object.entries(declarations)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([property, value]) => `${property}:${value}`);

  return rules.length > 0 ? `${rules.join(";")};` : "";
}

/**
 * `EMAIL_TYPE` rolünü stil kurallarına çevirir.
 *
 * İki bilinçli eleme var: `font-weight:400` ve tanımsız `letter-spacing` hiç yazılmaz — referans
 * uygulama da yazmıyor ve her ikisi de tarayıcı varsayılanı. `mso-line-height-rule:exactly`
 * her metin hücresinde zorunlu (Word motoru satır yüksekliğini yoksa kendi hesaplar).
 */
/** `exactOptionalPropertyTypes` altında "verilmedi" ile "açıkça undefined" aynı anlama gelsin. */
export type EmailTypeOverrides = { [K in keyof EmailTypeSpec]?: EmailTypeSpec[K] | undefined };

export function typeDeclarations(
  role: EmailTypeRole,
  overrides: EmailTypeOverrides = {},
): StyleDeclarations {
  const base: EmailTypeSpec = EMAIL_TYPE[role];
  const fontWeight = overrides.fontWeight ?? base.fontWeight;

  return {
    "font-family": overrides.fontFamily ?? base.fontFamily,
    "font-size": overrides.fontSize ?? base.fontSize,
    "font-weight": fontWeight === 400 ? undefined : fontWeight,
    "letter-spacing": overrides.letterSpacing ?? base.letterSpacing,
    "text-transform": overrides.textTransform ?? base.textTransform,
    color: overrides.color ?? base.color,
    "line-height": overrides.lineHeight ?? base.lineHeight,
    "mso-line-height-rule": "exactly",
  };
}

/** `typeDeclarations` + ek kuralları tek satır içi stile çevirir (ek kurallar önce yazılır). */
export function typeStyle(
  role: EmailTypeRole,
  options: {
    after?: StyleDeclarations | undefined;
    before?: StyleDeclarations | undefined;
    overrides?: EmailTypeOverrides | undefined;
  } = {},
) {
  return inlineStyle({
    ...options.before,
    ...typeDeclarations(role, options.overrides),
    ...options.after,
  });
}

/** Ölçüsüz dolgu hücresi — Outlook boş `<td>`yi çökertmesin diye `&nbsp;` taşır. */
export function spacerCell(width: number) {
  return `<td width="${width}" ${attribute("style", inlineStyle({ width: `${width}px`, "font-size": 0, "line-height": 0 }))}>&nbsp;</td>`;
}

export function attribute(name: string, value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "" : `${name}="${value}"`;
}

/** Boş parçaları eleyerek öznitelikleri birleştirir; iki boşluk kalmaz. */
export function attributes(...parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

export function byteLength(html: string) {
  return Buffer.byteLength(html, "utf8");
}
