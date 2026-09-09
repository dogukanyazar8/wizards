"use client";

import { useState, type ReactNode } from "react";

import { evaluatePasswordStrength } from "@wizards/types";

import { AuthCodeInput } from "@/components/auth/auth-code-input";
import { AuthBanner, AuthBlockingPanel } from "@/components/auth/auth-error-levels";
import { AuthPasswordStrength } from "@/components/auth/auth-password-strength";
import {
  AuthCountdownPill,
  AuthInfoBand,
  AuthStatusCard,
  AuthSuccessRing,
  AuthSuccessTile,
  AuthSuggestionChip,
  AuthTurnstileRow,
} from "@/components/auth/auth-pieces";
import {
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
import { AuthSurfaceProvider } from "@/components/auth/auth-surface";
import { SocialAuthButtons } from "@/components/auth/social-login";
import { ThemeLanguageControls } from "@/components/auth/theme-language-controls";
import { useI18n } from "@/components/providers/locale-provider";
import { buildAuthCssVars } from "@/lib/auth/css-vars";
import { AUTH_STATUS_IDS, AUTH_STATUS_CATALOG } from "@/lib/auth/status-catalog";

/**
 * `/dev/auth-states` — SPEC-GIRIS-KAYIT §7 · §8 · §9 için iç denetim galerisi.
 *
 * Üretimde açılmaz. Amacı, tasarım denetimini elle yapılabilir kılmak: 10 durum kartı, üç hata
 * seviyesi ve bileşenlerin beş durumu **tek sayfada** ve iki temada yan yana durur. Görsel test
 * de bu sayfayı hedefler; on ekranı tek tek gezmek yerine tek ekran görüntüsü karşılaştırılır.
 *
 * Sayfa başlıkları burada düz metin: bu bir ürün yüzeyi değil, geliştirici aracı. Ürün metinleri
 * (kart etiketleri, başlıklar, düğmeler) yine yalnız sözlükten okunur — kartların içi bu
 * dosyada tek bir Türkçe/İngilizce dize taşımaz.
 */

/** SPEC §7 kart içi parçalarının örnek verisi; yalnız bu galeride kullanılır. */
const SAMPLE = {
  attemptsLeft: 3,
  code: "914027",
  host: "whispr.app",
  lockCountdown: "14:32",
  linkDate: "26.08.2026",
  linkTime: "14:02",
  rateCountdown: "01:58",
  rateProgressPercent: 34,
  reference: "WSP-40219",
  statusCode: "503",
  suggestions: ["ada.dev", "ada_42", "adalovelace"],
  weakPassword: "whispr2026",
} as const;

function GallerySection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".04em", opacity: 0.62 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function GalleryRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", opacity: 0.5 }}>{label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>{children}</div>
    </div>
  );
}

/** SPEC §7 — her kartın kendi iç parçası. Kabuk `AuthStatusCard`, içerik burada. */
function StatusCardBody({ statusId }: { statusId: (typeof AUTH_STATUS_IDS)[number] }) {
  const { t } = useI18n();
  const status = AUTH_STATUS_CATALOG[statusId];

  switch (statusId) {
    case "credentials":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <PasswordInput
            defaultValue={SAMPLE.weakPassword}
            error={t("auth.status.credentials.field")}
            label={t("auth.login.password")}
            name="gallery-credentials"
            readOnly
          />
          <p className="auth-tip">
            {t("auth.status.credentials.attemptsLeft", { count: SAMPLE.attemptsLeft })}
          </p>
        </div>
      );

    case "accountLocked":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="auth-block-band">
            {t("auth.status.accountLocked.countdown", { countdown: SAMPLE.lockCountdown })}
          </div>
          <PrimaryButton type="button">{t("auth.status.accountLocked.action")}</PrimaryButton>
          <SecondaryButton type="button">{t("auth.common.backToLogin")}</SecondaryButton>
        </div>
      );

    case "codeInvalid":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <AuthCodeInput
            ariaLabel={t("auth.twoFactor.codeLabel")}
            onChange={() => undefined}
            tone="danger"
            value={SAMPLE.code}
          />
          <AuthLink href="/login/backup-code">{t("auth.status.codeInvalid.action")}</AuthLink>
        </div>
      );

    case "usernameTaken":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <TextInput
            defaultValue="ada"
            error={t("auth.status.usernameTaken.title")}
            label={t("auth.register.username")}
            name="gallery-username"
            readOnly
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SAMPLE.suggestions.map((suggestion) => (
              <AuthSuggestionChip key={suggestion} onSelect={() => undefined}>
                {suggestion}
              </AuthSuggestionChip>
            ))}
          </div>
        </div>
      );

    case "passwordWeak":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <PasswordInput
            defaultValue={SAMPLE.weakPassword}
            error={t("auth.status.passwordWeak.field")}
            label={t("auth.login.password")}
            name="gallery-password-weak"
            readOnly
          />
          <AuthPasswordStrength strength={evaluatePasswordStrength(SAMPLE.weakPassword)} />
        </div>
      );

    case "emailRegistered":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <TextInput
            defaultValue="ada@whispr.app"
            error={t("auth.status.emailRegistered.title")}
            label={t("auth.login.email")}
            name="gallery-email"
            readOnly
          />
          <PrimaryButton type="button">{t("auth.login.cta")}</PrimaryButton>
          <SecondaryButton type="button">{t("auth.status.accountLocked.action")}</SecondaryButton>
        </div>
      );

    case "network":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <AuthInfoBand>
            {t("auth.status.network.detail", { host: SAMPLE.host, status: SAMPLE.statusCode })}
          </AuthInfoBand>
          <PrimaryButton type="button">{t("auth.status.network.action")}</PrimaryButton>
        </div>
      );

    case "linkExpired":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <AuthInfoBand>
            {t("auth.status.linkExpired.meta", { date: SAMPLE.linkDate, time: SAMPLE.linkTime })}
          </AuthInfoBand>
          <PrimaryButton type="button">{t("auth.status.linkExpired.action")}</PrimaryButton>
          <SecondaryButton type="button">{t("auth.common.backToLogin")}</SecondaryButton>
        </div>
      );

    case "rateLimit":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <PrimaryButton disabled type="button">
            {t("auth.status.rateLimit.countdown", { countdown: SAMPLE.rateCountdown })}
          </PrimaryButton>
          {/*
           * SPEC §7/9 — bekleme yüzdesi. Geometri güç çubuğuyla aynı olduğu için ikinci bir
           * sınıf çifti açılmadı; ton değişkeni kartın tonundan geliyor.
           */}
          <div className="auth-strength-track">
            <div
              className="auth-strength-fill"
              style={{ width: `${SAMPLE.rateProgressPercent}%` }}
            />
          </div>
        </div>
      );

    case "accountSuspended":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <AuthInfoBand>
            {t("auth.status.accountSuspended.reference", { code: SAMPLE.reference })}
          </AuthInfoBand>
          <PrimaryButton type="button">{t(status.primaryActionKey ?? "")}</PrimaryButton>
          <SecondaryButton type="button">{t(status.secondaryActionKey ?? "")}</SecondaryButton>
        </div>
      );

    default:
      return null;
  }
}

function ComponentStates() {
  const { t } = useI18n();
  const [code, setCode] = useState("48");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <GalleryRow label="TextInput — default · filled · focus-hint · error · disabled">
        <div style={{ display: "grid", gap: 10, width: 320 }}>
          <TextInput label={t("auth.login.email")} name="s-default" />
          <TextInput defaultValue="ada@whispr.app" label={t("auth.login.email")} name="s-filled" />
          <TextInput
            defaultValue="ada@whispr.app"
            hint={t("auth.register.usernameHint")}
            label={t("auth.login.email")}
            name="s-hint"
          />
          <TextInput
            defaultValue="ada@"
            error={t("auth.status.emailRegistered.title")}
            label={t("auth.login.email")}
            name="s-error"
          />
          <TextInput disabled label={t("auth.login.email")} name="s-disabled" />
        </div>
      </GalleryRow>

      <GalleryRow label="PasswordInput — empty · filled · error · disabled">
        <div style={{ display: "grid", gap: 10, width: 320 }}>
          <PasswordInput label={t("auth.login.password")} name="p-empty" />
          <PasswordInput
            defaultValue={SAMPLE.weakPassword}
            label={t("auth.login.password")}
            name="p-filled"
          />
          <PasswordInput
            defaultValue="123"
            error={t("auth.status.passwordWeak.field")}
            label={t("auth.login.password")}
            name="p-error"
          />
          <PasswordInput disabled label={t("auth.login.password")} name="p-disabled" />
        </div>
      </GalleryRow>

      <GalleryRow label="PrimaryButton / SecondaryButton — idle · loading · disabled">
        <div style={{ display: "grid", gap: 10, width: 320 }}>
          <PrimaryButton type="button">{t("auth.login.cta")}</PrimaryButton>
          <PrimaryButton loading type="button">
            {t("auth.login.cta")}
          </PrimaryButton>
          <PrimaryButton disabled type="button">
            {t("auth.login.cta")}
          </PrimaryButton>
          <SecondaryButton type="button">{t("auth.common.backToLogin")}</SecondaryButton>
          <SecondaryButton disabled type="button">
            {t("auth.common.backToLogin")}
          </SecondaryButton>
        </div>
      </GalleryRow>

      <GalleryRow label="AuthCodeInput — empty · partial · full · danger · disabled">
        <div style={{ display: "grid", gap: 12, width: 340 }}>
          <AuthCodeInput
            ariaLabel={t("auth.twoFactor.codeLabel")}
            onChange={() => undefined}
            value=""
          />
          <AuthCodeInput
            ariaLabel={t("auth.twoFactor.codeLabel")}
            onChange={setCode}
            value={code}
          />
          <AuthCodeInput
            ariaLabel={t("auth.twoFactor.codeLabel")}
            onChange={() => undefined}
            value={SAMPLE.code}
          />
          <AuthCodeInput
            ariaLabel={t("auth.twoFactor.codeLabel")}
            onChange={() => undefined}
            tone="danger"
            value={SAMPLE.code}
          />
          <AuthCodeInput
            ariaLabel={t("auth.twoFactor.codeLabel")}
            disabled
            onChange={() => undefined}
            value={SAMPLE.code}
          />
        </div>
      </GalleryRow>

      <GalleryRow label="AuthPasswordStrength — 0 · 1 · 2 · 3 · 4">
        <div style={{ display: "grid", gap: 12, width: 340 }}>
          {["", "a", "abcdefghij", "Abcdefghij", "Whispr!2026x"].map((sample, index) => (
            <AuthPasswordStrength key={index} strength={evaluatePasswordStrength(sample)} />
          ))}
        </div>
      </GalleryRow>

      <GalleryRow label="AuthCheckbox · AuthLink · AuthDivider · AuthCountdownPill · Turnstile">
        <div style={{ display: "grid", gap: 12, width: 340 }}>
          <AuthCheckbox label={t("auth.login.remember")} name="c-1" />
          <AuthCheckbox defaultChecked label={t("auth.login.remember")} name="c-2" />
          <AuthCheckbox disabled label={t("auth.login.remember")} name="c-3" />
          <AuthLink href="/forgot-password">{t("auth.login.forgot")}</AuthLink>
          <AuthDivider />
          <AuthCountdownPill>
            {t("auth.status.rateLimit.countdown", { countdown: SAMPLE.rateCountdown })}
          </AuthCountdownPill>
          <AuthTurnstileRow verified={false} />
          <AuthTurnstileRow verified />
        </div>
      </GalleryRow>

      <GalleryRow label="SocialAuthButtons — Google aktif, MS/Apple yakında">
        <div style={{ width: 340 }}>
          <SocialAuthButtons />
        </div>
      </GalleryRow>

      <GalleryRow label="ThemeLanguageControls · AuthSuccessTile · AuthSuccessRing">
        <div style={{ display: "grid", gap: 12, width: 340 }}>
          <ThemeLanguageControls />
          <AuthSuccessTile />
          <AuthSuccessTile final />
          <AuthSuccessRing>{t("auth.resetDone.title")}</AuthSuccessRing>
        </div>
      </GalleryRow>

      <GalleryRow label="Tipografi — eyebrow · title · description">
        <div style={{ display: "grid", gap: 8, width: 340 }}>
          <AuthEyebrow>{t("auth.login.eyebrow")}</AuthEyebrow>
          <AuthTitle>{t("auth.login.title")}</AuthTitle>
          <AuthDescription>{t("auth.login.subtitle")}</AuthDescription>
        </div>
      </GalleryRow>
    </div>
  );
}

function GalleryBody() {
  const { t } = useI18n();

  return (
    <div style={{ display: "grid", gap: 36 }}>
      <GallerySection title="SPEC §7 — 10 durum kartı">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {AUTH_STATUS_IDS.map((statusId) => (
            <div key={statusId} style={{ maxWidth: 440, width: "100%" }}>
              <AuthStatusCard statusId={statusId}>
                <StatusCardBody statusId={statusId} />
              </AuthStatusCard>
              <p style={{ fontSize: 11, marginTop: 6, opacity: 0.5 }}>
                {`level ${AUTH_STATUS_CATALOG[statusId].level} · ${AUTH_STATUS_CATALOG[statusId].tone}` +
                  (AUTH_STATUS_CATALOG[statusId].supported ? "" : " · supported:false")}
              </p>
            </div>
          ))}
        </div>
      </GallerySection>

      <GallerySection title="SPEC §8 — üç gösterim seviyesi">
        <GalleryRow label="Seviye 1 — alan içi">
          <div style={{ width: 340 }}>
            <TextInput
              defaultValue="ada@"
              error={t("auth.status.credentials.field")}
              label={t("auth.login.email")}
              name="level-one"
              readOnly
            />
          </div>
        </GalleryRow>
        <GalleryRow label="Seviye 2 — form üstü bant">
          <div style={{ display: "grid", gap: 10, width: 440 }}>
            <AuthBanner
              body={t("auth.status.network.description")}
              title={t("auth.status.network.title")}
            />
            <AuthBanner
              body={t("auth.status.rateLimit.description")}
              title={t("auth.status.rateLimit.title")}
              tone="warning"
            />
            <AuthBanner title={t("auth.forgotSent.resent")} tone="success" />
          </div>
        </GalleryRow>
        <GalleryRow label="Seviye 3 — formu engelleyen blok">
          <div style={{ display: "grid", gap: 24, width: 440 }}>
            <AuthBlockingPanel
              band={t("auth.status.accountLocked.countdown", { countdown: SAMPLE.lockCountdown })}
              primaryAction={
                <PrimaryButton type="button">{t("auth.status.accountLocked.action")}</PrimaryButton>
              }
              secondaryAction={
                <SecondaryButton type="button">{t("auth.common.backToLogin")}</SecondaryButton>
              }
              statusId="accountLocked"
            />
            <AuthBlockingPanel
              band={t("auth.status.accountSuspended.reference", { code: SAMPLE.reference })}
              primaryAction={
                <PrimaryButton type="button">
                  {t("auth.status.accountSuspended.action")}
                </PrimaryButton>
              }
              statusId="accountSuspended"
            />
          </div>
        </GalleryRow>
      </GallerySection>

      <GallerySection title="SPEC §9 — bileşenlerin durumları">
        <ComponentStates />
      </GallerySection>
    </div>
  );
}

/** Her tema kendi kökünde çizilir; iki tema aynı sayfada yan yana denetlenir. */
function ThemedPane({ theme }: { theme: "dark" | "light" }) {
  return (
    <div data-auth-theme={theme} style={{ flex: "1 1 520px", minWidth: 0 }}>
      <div
        data-auth-surface=""
        style={{
          ...buildAuthCssVars("web"),
          backgroundColor: "hsl(var(--background))",
          borderRadius: 18,
          color: "hsl(var(--foreground))",
          padding: 24,
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", opacity: 0.45 }}>
          {theme.toUpperCase()}
        </p>
        <div style={{ marginTop: 18 }}>
          <GalleryBody />
        </div>
      </div>
    </div>
  );
}

export function AuthStatesGallery() {
  return (
    <AuthSurfaceProvider surface="web">
      <main style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: 24 }}>
        <ThemedPane theme="light" />
        <ThemedPane theme="dark" />
      </main>
    </AuthSurfaceProvider>
  );
}
