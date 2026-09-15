"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AuthAurora, type AuthAuroraTone } from "@/components/auth/auth-aurora";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { useAuthSurface } from "@/components/auth/auth-surface";
import { ThemeLanguageControls } from "@/components/auth/theme-language-controls";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import { buildAuthCssVars } from "@/lib/auth/css-vars";

/**
 * Kimlik akışının kabuğu — SPEC-GIRIS-KAYIT §3 ve §4 giriş paragrafı.
 *
 * Sıra sözleşmenin parçası: aurora **kökün ilk çocuğu**, sonra marka paneli, sonra form sütunu
 * (kabul kriteri 1). Kolonlar opak zemin almaz; yalnız `z-index` ile öne gelir.
 *
 * Ölçüler kökte bir kez basılan CSS değişkenlerinden okunur; masaüstü kademesi (SPEC §5) yüzey
 * bağlamıyla seçilir, bileşenlerin içinde koşul yoktur.
 */

export { BrandLogo };
export { ThemeLanguageControls };
export {
  AuthCheckbox,
  AuthDescription,
  AuthDivider,
  AuthEyebrow,
  AuthLink,
  AuthTitle,
  PasswordInput,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/auth/auth-primitives";
export { SocialAuthButtons } from "@/components/auth/social-login";

export type AuthScreenVariant = "default" | "register";

/** SPEC §3.5 — `Whispr 2026` + üç bağlantı. Hesap oluşturma ekranında çizilmez (K13). */
export function FooterSecurity() {
  const { t } = useI18n();

  return (
    <footer className="auth-footer">
      <span>{t("auth.footer.copyright")}</span>
      <Link href="/privacy">{t("auth.footer.privacy")}</Link>
      <Link href="/terms">{t("auth.footer.terms")}</Link>
      <Link href="/cookies">{t("auth.footer.cookies")}</Link>
    </footer>
  );
}

export function AuthScreenLayout({
  align = "start",
  auroraTone = "default",
  children,
  variant = "default",
}: {
  /** SPEC §4.7 — `Şifre güncellendi` akışın tek ortalanmış ekranı. */
  align?: "center" | "start";
  auroraTone?: AuthAuroraTone;
  children: ReactNode;
  variant?: AuthScreenVariant;
}) {
  const surface = useAuthSurface();

  return (
    /*
     * Reference width and minimum height stay centered. Longer real forms (validation,
     * security checks, translations) may grow and scroll without clipping their controls.
     */
    <div
      className="auth-page"
      data-auth-surface=""
      data-variant={variant}
      style={buildAuthCssVars(surface)}
    >
      <main className="auth-window">
        <AuthAurora tone={auroraTone} />
        <AuthBrandPanel />

        <div className="auth-form-column" data-variant={variant}>
          <div className="auth-form" data-align={align === "center" ? "center" : undefined}>
            {children}
          </div>

          {/*
           * SPEC §3.5 — alt bilgi form sütununun içinde durur, pencerenin değil: referansta
           * `left/right:72px` marka panelinin **sağındaki** sütuna göre ölçülüyor. Pencereye
           * bağlanınca satır iki kolonun ortasına, yani marka panelinin altına kayıyordu.
           */}
          {variant === "register" ? null : <FooterSecurity />}
        </div>

        <ThemeLanguageControls />
      </main>
    </div>
  );
}
