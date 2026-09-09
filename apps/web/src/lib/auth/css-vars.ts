import type { CSSProperties } from "react";

import { AUTH_METRICS, pxToRem, type AuthSurface } from "@/lib/auth/metrics";

/**
 * `AUTH_METRICS` → CSS değişkenleri.
 *
 * Kimlik ekranlarının bütün ölçüleri tek sözlükten gelir (SPEC-GIRIS-KAYIT §1.4, §3–§6), ama
 * hover/odak/basılı durumları CSS'te yaşamak zorunda. Bu modül köprüdür: bileşenler kökte bir kez
 * bu değişkenleri basar, `globals.css` içindeki sınıflar `var(--auth-…)` ile okur.
 *
 * Böylece bileşen dosyalarında **çıplak `px` kalmaz** (Ş9 parity kapısının aradığı şey) ve
 * masaüstü ölçek kademesi (SPEC §5) tek anahtarla değişir.
 */

function rem(px: number) {
  return pxToRem(px);
}

export function buildAuthCssVars(surface: AuthSurface = "web"): CSSProperties {
  const isDesktop = surface === "desktop";
  const window = isDesktop ? AUTH_METRICS.window.desktop : AUTH_METRICS.window.web;
  const windowShadow = isDesktop
    ? AUTH_METRICS.window.shadow.desktop
    : AUTH_METRICS.window.shadow.web;
  const brand = isDesktop
    ? { ...AUTH_METRICS.brand.web, ...AUTH_METRICS.brand.desktop }
    : AUTH_METRICS.brand.web;
  const form = isDesktop ? AUTH_METRICS.form.desktop : AUTH_METRICS.form.web;
  const aurora = isDesktop ? AUTH_METRICS.aurora.desktop : AUTH_METRICS.aurora.web;
  const footer = isDesktop ? AUTH_METRICS.footer.desktop : AUTH_METRICS.footer.web;
  const selector = isDesktop ? AUTH_METRICS.selector.desktop : AUTH_METRICS.selector.web;

  const {
    banner,
    blocking,
    button,
    checkbox,
    codeCell,
    divider,
    field,
    fieldError,
    logo,
    motion,
    pill,
    statusCard,
    strength,
    suggestionChip,
    success,
    turnstile,
    type,
  } = AUTH_METRICS;

  return {
    // --- pencere ------------------------------------------------------------
    "--auth-window-width": rem(window.width),
    "--auth-window-height": rem(window.height),
    "--auth-window-radius": rem(window.radius),
    "--auth-window-border": `${window.borderWidth}px`,
    "--auth-window-border-alpha": String(window.borderAlpha),
    "--auth-window-shadow": `0 ${rem(windowShadow.y)} ${rem(windowShadow.blur)} ${rem(windowShadow.spread)} hsl(var(--foreground)/${windowShadow.alpha})`,

    // --- marka paneli -------------------------------------------------------
    "--auth-brand-width": rem(brand.width),
    "--auth-brand-padding-y": rem(brand.paddingY),
    "--auth-brand-padding-x": rem(brand.paddingX),
    "--auth-brand-ring": rem(brand.ring),
    "--auth-brand-ring-offset": rem(AUTH_METRICS.brand.web.ringOffsetLeft),
    "--auth-brand-logo-scale": String(isDesktop ? logo.scale.desktop : logo.scale.web),
    "--auth-brand-wordmark": rem(brand.wordmarkSize),
    "--auth-brand-wordmark-tracking": `${AUTH_METRICS.brand.web.wordmarkTracking}em`,
    "--auth-brand-wordmark-gap": rem(AUTH_METRICS.brand.web.wordmarkMarginTop),
    "--auth-brand-tagline": rem(brand.taglineSize),
    "--auth-brand-tagline-gap": rem(AUTH_METRICS.brand.web.taglineMarginTop),
    "--auth-brand-divider-top": rem(AUTH_METRICS.brand.web.dividerMarginTop),
    "--auth-brand-divider-bottom": rem(AUTH_METRICS.brand.web.dividerMarginBottom),
    "--auth-brand-divider-max": rem(brand.dividerMaxWidth),
    "--auth-brand-heading": rem(brand.headingSize),
    "--auth-brand-heading-tracking": `${AUTH_METRICS.brand.web.headingTracking}em`,
    "--auth-brand-heading-leading": String(AUTH_METRICS.brand.web.headingLeading),
    "--auth-brand-body": rem(brand.bodySize),
    "--auth-brand-body-leading": String(AUTH_METRICS.brand.web.bodyLeading),
    "--auth-brand-body-gap": rem(AUTH_METRICS.brand.web.bodyMarginTop),
    "--auth-brand-bullet": rem(AUTH_METRICS.brand.web.bulletSize),
    "--auth-brand-bullet-dot": rem(AUTH_METRICS.brand.web.bulletDot),
    "--auth-brand-bullet-gap": rem(AUTH_METRICS.brand.web.bulletGap),

    // --- form sütunu --------------------------------------------------------
    "--auth-form-padding": rem(form.paddingX),
    "--auth-form-narrow-padding": rem(AUTH_METRICS.form.mobile.paddingX),
    "--auth-form-max": rem(form.maxWidth),
    "--auth-form-register-padding": rem(form.registerPaddingX),
    "--auth-form-register-max": rem(form.registerMaxWidth),

    // --- tipografi ----------------------------------------------------------
    "--auth-eyebrow": rem(type.eyebrow.size),
    "--auth-eyebrow-tracking": `${type.eyebrow.tracking}em`,
    "--auth-title": rem(isDesktop ? type.title.desktop : type.title.web),
    "--auth-title-tracking": `${type.title.tracking}em`,
    "--auth-title-leading": String(type.title.leading),
    "--auth-title-gap": rem(type.title.marginTop),
    "--auth-description": rem(isDesktop ? type.description.desktop : type.description.web),
    "--auth-description-leading": String(type.description.leading),
    "--auth-description-gap": rem(type.description.marginTop),
    "--auth-label": rem(isDesktop ? type.label.desktop : type.label.web),
    "--auth-label-gap": rem(type.label.gap),
    "--auth-field-grid-gap": rem(field.gridGap),
    "--auth-hint": rem(type.hint.size),
    "--auth-link-small": rem(type.linkSmall.size),
    "--auth-footer-link": rem(type.footerLink.size),

    // --- alan ---------------------------------------------------------------
    "--auth-field-height": rem(isDesktop ? field.height.desktop : field.height.web),
    "--auth-field-height-compact": rem(field.height.compact),
    "--auth-field-height-code": rem(field.height.backupCode),
    "--auth-field-radius": rem(isDesktop ? field.radius.desktop : field.radius.web),
    "--auth-field-padding": rem(field.paddingX),
    "--auth-field-size": rem(isDesktop ? field.fontSize.desktop : field.fontSize.web),
    "--auth-field-border": `${field.borderWidth}px`,
    "--auth-focus-border": `${field.focusBorderWidth}px`,
    "--auth-focus-ring": rem(field.focusRingWidth),
    "--auth-focus-alpha": String(field.focusRingAlpha),
    "--auth-error-tint": String(field.errorTintAlpha),
    "--auth-error-ring-alpha": String(field.errorRingAlpha),
    "--auth-reveal-height": rem(field.revealHeight),
    "--auth-reveal-radius": rem(field.revealRadius),
    "--auth-reveal-size": rem(field.revealFontSize),
    "--auth-reveal-padding-x": rem(field.revealPaddingX),
    "--auth-reveal-inset-right": rem(field.revealInsetRight),
    "--auth-reveal-padding": rem(field.revealPaddingRight),
    "--auth-backup-size": rem(field.backupCodeFontSize),
    "--auth-backup-tracking": `${field.backupCodeTracking}em`,

    // --- düğmeler -----------------------------------------------------------
    "--auth-primary-height": rem(
      isDesktop ? button.primary.height.desktop : button.primary.height.web,
    ),
    "--auth-primary-radius": rem(
      isDesktop ? button.primary.radius.desktop : button.primary.radius.web,
    ),
    "--auth-primary-size": rem(
      isDesktop ? button.primary.fontSize.desktop : button.primary.fontSize.web,
    ),
    "--auth-primary-shadow": `0 ${rem(button.primary.shadow.y)} ${rem(button.primary.shadow.blur)} ${rem(button.primary.shadow.spread)} hsl(var(--primary)/${button.primary.shadow.alpha})`,
    "--auth-primary-hover": String(button.primary.hoverBrightness),
    "--auth-primary-press": String(button.primary.pressBrightness),
    "--auth-primary-press-y": `${button.primary.pressTranslateY}px`,
    "--auth-primary-ring-inner": rem(button.primary.focusRingInner),
    "--auth-primary-ring-outer": rem(button.primary.focusRingOuter),
    "--auth-primary-ring-inner-alpha": String(button.primary.focusRingInnerAlpha),
    "--auth-primary-ring-outer-alpha": String(button.primary.focusRingOuterAlpha),
    "--auth-primary-loading-alpha": String(button.primary.loadingBackgroundAlpha),
    "--auth-spinner": rem(button.primary.spinnerSize),
    "--auth-spinner-border": `${button.primary.spinnerBorderWidth}px`,
    "--auth-spinner-track-alpha": String(button.primary.spinnerTrackAlpha),
    "--auth-secondary-disabled": String(button.secondary.disabledOpacity),
    "--auth-provider-height": rem(
      isDesktop ? button.provider.height.desktop : button.provider.height.web,
    ),
    "--auth-provider-radius": rem(
      isDesktop ? button.provider.radius.desktop : button.provider.radius.web,
    ),
    "--auth-provider-tile": rem(button.provider.tile),
    "--auth-provider-tile-radius": rem(button.provider.tileRadius),
    "--auth-provider-label": rem(button.provider.labelSize),
    "--auth-provider-soon-bg": String(button.provider.soonBackgroundAlpha),
    "--auth-provider-soon-opacity": String(button.provider.soonOpacity),
    "--auth-badge-height": rem(button.provider.badgeHeight),
    "--auth-badge-radius": rem(button.provider.badgeRadius),
    "--auth-badge-size": rem(button.provider.badgeFontSize),
    "--auth-badge-tracking": `${button.provider.badgeTracking}em`,

    // --- kod hücresi --------------------------------------------------------
    "--auth-cell-width": rem(codeCell.width),
    "--auth-cell-height": rem(codeCell.height),
    "--auth-cell-gap": rem(codeCell.gap),
    "--auth-cell-radius": rem(codeCell.radius.web),
    "--auth-cell-digit": rem(codeCell.digitSize.web),
    "--auth-cell-empty-alpha": String(codeCell.emptyBackgroundAlpha),
    "--auth-caret-width": `${codeCell.caretWidth}px`,
    "--auth-caret-height": rem(codeCell.caretHeight.web),

    // --- onay kutusu, pill, ayırıcı ----------------------------------------
    "--auth-checkbox": rem(checkbox.size.web),
    "--auth-checkbox-label": rem(checkbox.labelSize),
    "--auth-checkbox-radius": rem(checkbox.radius),
    "--auth-checkbox-border": `${checkbox.borderWidth}px`,
    "--auth-checkbox-tick": rem(checkbox.tickSize),
    "--auth-checkbox-ring-alpha": String(checkbox.focusRingAlpha),
    "--auth-checkbox-disabled": String(checkbox.disabledOpacity),
    "--auth-pill-height": rem(isDesktop ? pill.height.desktop : pill.height.web),
    "--auth-pill-dot": rem(pill.dot),
    "--auth-pill-size": rem(pill.fontSize),
    "--auth-divider-alpha": String(divider.lineAlpha),
    "--auth-divider-size": rem(divider.fontSize),
    "--auth-divider-top": rem(divider.marginTop),
    "--auth-divider-bottom": rem(divider.marginBottom),

    // --- şifre gücü ---------------------------------------------------------
    "--auth-strength-bar": rem(strength.barHeight),
    "--auth-strength-transition": `${strength.transitionMs}ms`,
    "--auth-strength-label": rem(strength.labelSize),
    "--auth-strength-row-gap": rem(strength.ruleRowGap),
    "--auth-strength-col-gap": rem(strength.ruleColumnGap),
    "--auth-strength-rule": rem(strength.ruleFontSize),
    "--auth-strength-dot": rem(strength.ruleDot),
    "--auth-strength-tick": rem(strength.ruleTick),
    "--auth-strength-gap": rem(strength.ruleMarginTop),

    // --- turnstile, bant, hata ----------------------------------------------
    "--auth-turnstile-height": rem(turnstile.height),
    "--auth-turnstile-radius": rem(turnstile.radius),
    "--auth-turnstile-tile": rem(turnstile.tile),
    "--auth-turnstile-hint": rem(turnstile.hintSize),
    "--auth-banner-padding-y": rem(banner.paddingY),
    "--auth-banner-padding-x": rem(banner.paddingX),
    "--auth-banner-radius": rem(banner.radius),
    "--auth-banner-bg": String(banner.backgroundAlpha),
    "--auth-banner-border": String(banner.borderAlpha),
    "--auth-banner-border-success": String(banner.successBorderAlpha),
    "--auth-banner-tile": rem(banner.tile),
    "--auth-banner-tile-radius": rem(banner.tileRadius),
    "--auth-banner-glyph": rem(banner.glyphSize),
    "--auth-banner-title": rem(banner.titleSize),
    "--auth-banner-body": rem(banner.bodySize),
    "--auth-banner-body-leading": String(banner.bodyLeading),
    "--auth-banner-body-opacity": String(banner.bodyOpacity),
    "--auth-field-error": rem(fieldError.fontSize),
    "--auth-field-error-glyph": rem(fieldError.glyphCircle),

    // --- başarı, durum kartı, blok -----------------------------------------
    "--auth-success-tile": rem(success.tile),
    "--auth-success-radius": rem(success.tileRadius),
    "--auth-success-bg": String(success.tileBackgroundAlpha),
    "--auth-success-border": String(success.tileBorderAlpha),
    "--auth-success-final-bg": String(success.finalTileBackgroundAlpha),
    "--auth-success-final-border": String(success.finalTileBorderAlpha),
    "--auth-success-glyph": rem(success.glyphSize),
    "--auth-success-gap": rem(success.marginBottom),
    "--auth-success-ring": rem(success.ring),
    "--auth-success-band": rem(success.infoBandHeight),
    "--auth-success-band-radius": rem(success.infoBandRadius),
    "--auth-success-band-dot": rem(success.infoBandDot),
    "--auth-success-band-size": rem(success.infoBandFontSize),
    "--auth-success-tip": rem(success.tipFontSize),
    "--auth-success-tip-gap": rem(success.tipMarginTop),
    "--auth-card-width": rem(statusCard.width),
    "--auth-card-padding": rem(statusCard.padding),
    "--auth-card-radius": rem(statusCard.radius),
    "--auth-card-shadow": `0 ${rem(statusCard.shadow.y)} ${rem(statusCard.shadow.blur)} ${rem(statusCard.shadow.spread)} hsl(var(--foreground)/${statusCard.shadow.alpha})`,
    "--auth-card-tile": rem(statusCard.tile),
    "--auth-card-tile-radius": rem(statusCard.tileRadius),
    "--auth-card-label": rem(statusCard.labelSize),
    "--auth-card-label-tracking": `${statusCard.labelTracking}em`,
    "--auth-card-title": rem(statusCard.titleSize),
    "--auth-card-body": rem(statusCard.bodySize),
    "--auth-block-icon": rem(blocking.iconTile),
    "--auth-block-title": rem(blocking.titleSize),
    "--auth-block-band": rem(blocking.bandHeight),
    "--auth-chip-height": rem(suggestionChip.height),
    "--auth-chip-padding": rem(suggestionChip.paddingX),
    "--auth-chip-size": rem(suggestionChip.fontSize),
    "--auth-chip-tick": rem(suggestionChip.tick),

    // --- alt bilgi, seçici --------------------------------------------------
    "--auth-footer-gap": rem(AUTH_METRICS.footer.gap),
    "--auth-footer-size": rem(AUTH_METRICS.footer.fontSize.web),
    "--auth-footer-left": rem(footer.left),
    "--auth-footer-right": rem(footer.right),
    "--auth-footer-bottom": rem(footer.bottom),
    "--auth-selector-height": rem(
      isDesktop ? AUTH_METRICS.selector.height.desktop : AUTH_METRICS.selector.height.web,
    ),
    "--auth-selector-padding-left": rem(AUTH_METRICS.selector.paddingLeft),
    "--auth-selector-padding-right": rem(AUTH_METRICS.selector.paddingRight),
    "--auth-selector-size": rem(AUTH_METRICS.selector.fontSize),
    "--auth-selector-chevron": rem(AUTH_METRICS.selector.chevronCircle),
    "--auth-selector-chevron-size": rem(AUTH_METRICS.selector.chevronSize),
    "--auth-selector-chevron-alpha": String(AUTH_METRICS.selector.chevronActiveAlpha),
    "--auth-menu-width": rem(AUTH_METRICS.selector.menuWidth),
    "--auth-menu-radius": rem(AUTH_METRICS.selector.menuRadius),
    "--auth-menu-padding": rem(AUTH_METRICS.selector.menuPadding),
    "--auth-menu-shadow": `0 ${rem(AUTH_METRICS.selector.menuShadow.y)} ${rem(AUTH_METRICS.selector.menuShadow.blur)} ${rem(AUTH_METRICS.selector.menuShadow.spread)} hsl(var(--foreground)/${AUTH_METRICS.selector.menuShadow.alpha})`,
    "--auth-menu-row": rem(AUTH_METRICS.selector.menuRowHeight),
    "--auth-menu-row-radius": rem(AUTH_METRICS.selector.menuRowRadius),
    "--auth-menu-row-alpha": String(AUTH_METRICS.selector.menuRowActiveAlpha),
    "--auth-menu-tick": rem(AUTH_METRICS.selector.menuTick),
    "--auth-theme-padding": rem(AUTH_METRICS.selector.themePadding),
    "--auth-segment": rem(
      isDesktop
        ? AUTH_METRICS.selector.segmentWidth.desktop
        : AUTH_METRICS.selector.segmentWidth.web,
    ),
    "--auth-selector-top": rem(selector.top),
    "--auth-selector-right": rem(selector.right),

    // --- aurora ve hareket --------------------------------------------------
    "--auth-aurora-inset": `${aurora.inset}%`,
    "--auth-aurora-a": `${aurora.first.width}% ${aurora.first.height}% at ${aurora.first.x}% ${aurora.first.y}%`,
    "--auth-aurora-b": `${aurora.second.width}% ${aurora.second.height}% at ${aurora.second.x}% ${aurora.second.y}%`,
    "--auth-aurora-a-stop": `${aurora.first.stop}%`,
    "--auth-aurora-b-stop": `${aurora.second.stop}%`,
    "--auth-aurora-a-alpha": String(aurora.first.alpha),
    "--auth-aurora-b-alpha": String(aurora.second.alpha),
    "--auth-aurora-duration": `${aurora.durationMs}ms`,
    "--auth-glow-duration": `${motion.glowMs}ms`,
    "--auth-glow-alpha": String(logo.ring.alpha),
    "--auth-glow-stop": `${logo.ring.stop}%`,
    "--auth-caret-duration": `${motion.caretMs}ms`,
    "--auth-spin-duration": `${motion.spinMs}ms`,
    "--auth-drift-x": `${motion.driftTranslateX}%`,
    "--auth-drift-y": `${motion.driftTranslateY}%`,
    "--auth-drift-scale": String(motion.driftScale),
    "--auth-glow-min-opacity": String(motion.glowMinOpacity),
    "--auth-glow-min-scale": String(motion.glowMinScale),
    "--auth-glow-max-scale": String(motion.glowMaxScale),
  } as CSSProperties;
}
