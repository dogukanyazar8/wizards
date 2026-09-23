/**
 * "Whispr'i indir" penceresinin ölçü sözlüğü (SPEC-INDIRME §B).
 *
 * Kaynak sırası ve kurallar `@/lib/support/report-metrics` ile aynı: değerler
 * ×1 tasarım pikseli, sözlük renk taşımaz, `alpha` bir opaklıktır.
 *
 * Kabuk, başlık şeridi ve alt bar iki pencerede **birebir aynı** olduğu için
 * onlar burada tekrarlanmaz; `REPORT_METRICS.shell/header/footer` yeniden
 * kullanılır ve yalnız genişlik farkı burada durur.
 */

import { hairline, pxToRem } from "@/lib/support/report-metrics";

export { hairline, pxToRem };

export const DOWNLOAD_METRICS = {
  /** SPEC §B.1 — tek fark genişlik; geri kalanı Sorun bildir kabuğu. */
  shell: {
    width: 560,
  },

  /** SPEC §B.2 — ortam kartları. */
  environment: {
    marginTop: 10,
    gap: 9,
    paddingY: 11,
    paddingX: 12,
    radius: 14,
    borderWidth: 1.5,
    borderIdleAlpha: 0.7,
    surfaceSelectedAlpha: 0.1,
    cardGap: 9,
    dotSize: 17,
    dotBorderWidth: 1.5,
    dotMarginTop: 1,
    checkIconSize: 10,
    checkIconStroke: 3.2,
    nameGap: 6,
    nameFontSize: 13,
    nameLineHeight: 1.2,
    nameLetterSpacing: 0.04,
    tagPaddingY: 2,
    tagPaddingX: 6,
    tagRadius: 6,
    tagFontSize: 9.5,
    tagSurfaceAlpha: 0.16,
    subtitleMarginTop: 5,
    subtitleFontSize: 11.5,
    subtitleLineHeight: 1.4,
  },

  /** SPEC §B.3 — ortam uyarı şeridi. */
  notice: {
    marginTop: 11,
    paddingY: 10,
    paddingX: 13,
    radius: 13,
    gap: 8,
    iconSize: 15,
    iconStroke: 1.9,
    textMinWidth: 120,
    fontSize: 11.5,
    lineHeight: 1.45,
    prodSurfaceAlpha: 0.1,
    prodBorderAlpha: 0.32,
    uatSurfaceAlpha: 0.12,
    uatBorderAlpha: 0.38,
    pillPaddingY: 3,
    pillPaddingX: 9,
    pillFontSize: 10.5,
  },

  /** SPEC §B.4/§B.5 — bölüm başlığı ve kart listesi. */
  section: {
    desktopMarginTop: 19,
    mobileMarginTop: 16,
    headerGap: 9,
    labelFontSize: 10,
    labelLetterSpacing: 0.15,
    versionPillPaddingY: 2,
    versionPillPaddingX: 7,
    versionPillRadius: 6,
    versionPillFontSize: 9.5,
    noteFontSize: 11,
    cardMarginTop: 9,
    cardRadius: 16,
    cardBorderAlpha: 0.7,
    rowPaddingY: 12,
    rowPaddingX: 13,
    rowGap: 11,
    rowDividerAlpha: 0.5,
    tileSize: 34,
    tileRadius: 11,
    tileSurfaceAlpha: 0.14,
    tileIconSize: 17,
    tileIconStroke: 1.9,
    nameGap: 7,
    nameFontSize: 13,
    nameLineHeight: 1.2,
    extensionPaddingY: 2,
    extensionPaddingX: 6,
    extensionRadius: 6,
    extensionFontSize: 9.5,
    extensionSurfaceAlpha: 0.14,
    metaMarginTop: 4,
    metaFontSize: 11.5,
    metaLineHeight: 1.45,
    buttonHeight: 32,
    buttonPaddingX: 12,
    buttonRadius: 10,
    buttonFontSize: 12,
    buttonGap: 6,
    buttonIconSize: 13,
    buttonIconStroke: 2.2,
    buttonBorderAlpha: 0.4,
    buttonSurfaceAlpha: 0.14,
    emptyPaddingY: 14,
    emptyPaddingX: 13,
    emptyFontSize: 11.5,
  },

  /** SPEC §B.7 — alt bar; ölçüler Sorun bildir alt barıyla ortak. */
  footer: {
    secondaryPaddingX: 15,
    primaryPaddingX: 18,
  },
} as const;
