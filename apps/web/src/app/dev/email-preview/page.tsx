import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { byteLength } from "@/lib/email/email-html";
import type { RenderedEmail } from "@/lib/email/email-shell";
import { EMAIL_MAX_BYTES } from "@/lib/email/email-theme";
import { renderAccountDeletionReauthEmail } from "@/lib/email/templates/account-deletion-reauth-email";
import { renderPasswordResetEmail } from "@/lib/email/templates/password-reset-email";
import { renderRegistrationAttemptEmail } from "@/lib/email/templates/registration-attempt-email";
import { renderVerificationCodeEmail } from "@/lib/email/templates/verification-code-email";
import { APP_LOCALES, type AppLocale } from "@/lib/locale";

/**
 * `/dev/email-preview` — işlemsel e-posta şablonlarının iç denetim galerisi.
 *
 * Üretimde 404 (`/dev/auth-states` deseni). Gerçek renderer çağrılır, yalnız veriler sahtedir:
 * teslim paketindeki (`design_handoff/eposta-handoff/SPEC.md`) örnek değerler kullanılır ki
 * çıktı ekran görüntüleriyle doğrudan karşılaştırılabilsin.
 *
 * Her varyant iki genişlikte çizilir: 600 px (masaüstü kart) ve 390 px (mobil, medya sorgusu
 * etkin). Kart altındaki sayaçlar teslim ölçütlerini gözle denetlenebilir kılar.
 */
const isGalleryEnabled = process.env.NODE_ENV !== "production";

export const metadata: Metadata = {
  description: "Whispr transactional email template gallery",
  title: "Email preview",
};

const VERIFICATION_URL = "https://whispr.app/verify-email?token=ornek-token";
const RESET_URL = "https://whispr.app/reset-password?token=ornek-token";

/** SPEC §5 örneğiyle aynı değerler — istek bağlamı burada sabit tutulur. */
const REQUEST_CONTEXT = {
  deviceLine: "Chrome · macOS · İstanbul, TR",
  requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)",
};

type PreviewVariant = {
  id: string;
  note: string;
  rendered: RenderedEmail;
  title: string;
};

function buildVariants(locale: AppLocale): PreviewVariant[] {
  return [
    {
      id: `verification-${locale}`,
      note: "SPEC §4 — kod kutusu + buton",
      rendered: renderVerificationCodeEmail({
        code: "482915",
        codeTtlMinutes: 10,
        locale,
        name: "Ada",
        verificationUrl: VERIFICATION_URL,
      }),
      title: "Doğrulama kodu",
    },
    {
      id: `verification-nocode-${locale}`,
      note: "Kod hız sınırına takıldı — kutu çizilmez, konu kodsuz biçime düşer",
      rendered: renderVerificationCodeEmail({
        code: null,
        codeTtlMinutes: 10,
        locale,
        name: "Ada",
        verificationUrl: VERIFICATION_URL,
      }),
      title: "Doğrulama kodu · kodsuz",
    },
    {
      id: `reset-${locale}`,
      note: "SPEC §5 — yedek URL kutusu + istek özeti",
      rendered: renderPasswordResetEmail({
        accountEmail: "ada@whispr.app",
        locale,
        name: "Ada",
        requestContext: REQUEST_CONTEXT,
        resetUrl: RESET_URL,
        ttlMinutes: 30,
      }),
      title: "Şifre sıfırlama",
    },
    {
      id: `reset-nodevice-${locale}`,
      note: "Cihaz satırı çözülemedi — hücre çizilmez, zaman tam genişliğe yayılır",
      rendered: renderPasswordResetEmail({
        accountEmail: "ada@whispr.app",
        locale,
        name: "Ada",
        requestContext: { deviceLine: null, requestedAtLabel: REQUEST_CONTEXT.requestedAtLabel },
        resetUrl: RESET_URL,
        ttlMinutes: 30,
      }),
      title: "Şifre sıfırlama · cihazsız",
    },
    {
      id: `registration-attempt-${locale}`,
      note: "Paket kararı K4 — kabuk ortak, metin korunur",
      rendered: renderRegistrationAttemptEmail({ locale, name: "Ada" }),
      title: "Kayıt denemesi",
    },
    {
      id: `reauth-web-${locale}`,
      note: "Kabuk ortak, metin korunur — E6/E7/E8 türetildi",
      rendered: renderAccountDeletionReauthEmail({
        expiryMinutes: 10,
        locale,
        name: "Ada",
        reauthUrl: "https://whispr.app/settings/reauth/ornek-token",
      }),
      title: "Hesap silme doğrulaması",
    },
    {
      id: `reauth-mobile-${locale}`,
      note: "Mobil çağrı — eylem bağlantısı uygulama şeması taşır",
      rendered: renderAccountDeletionReauthEmail({
        expiryMinutes: 10,
        locale,
        name: "Ada",
        reauthUrl: "whispr://reauth/account-delete/ornek-token",
      }),
      title: "Hesap silme doğrulaması · mobil",
    },
  ];
}

function countMatches(html: string, pattern: RegExp) {
  return [...html.matchAll(pattern)].length;
}

function readPreheader(html: string) {
  return /<span style="display:none[^"]*">([^<]*)<\/span>/.exec(html)?.[1] ?? "";
}

function VariantCard({ locale, variant }: { locale: AppLocale; variant: PreviewVariant }) {
  const { html, subject } = variant.rendered;
  const bytes = byteLength(html);
  const preheaderLength = readPreheader(html).length;
  const images = countMatches(html, /<img/gi);
  const scripts = countMatches(html, /<script/gi);

  const metrics = [
    { label: "bayt", ok: bytes < EMAIL_MAX_BYTES, value: `${bytes} / ${EMAIL_MAX_BYTES}` },
    {
      label: "önizleme",
      ok: preheaderLength >= 85 && preheaderLength <= 110,
      value: `${preheaderLength} karakter`,
    },
    { label: "img", ok: images === 0, value: String(images) },
    { label: "script", ok: scripts === 0, value: String(scripts) },
  ];

  return (
    <section
      className="rounded-2xl border border-neutral-300 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900"
      data-testid={`email-preview-${variant.id}`}
      id={variant.id}
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold">
          {variant.title} · {locale}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">{variant.note}</p>
        <p className="mt-2 font-mono text-xs break-all text-neutral-600 dark:text-neutral-400">
          {subject}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {metrics.map((metric) => (
            <li
              className={`rounded-full px-3 py-1 font-mono ${
                metric.ok
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
              }`}
              key={metric.label}
            >
              {metric.label}: {metric.value}
            </li>
          ))}
        </ul>
      </header>

      <div className="flex flex-wrap gap-6">
        <figure className="m-0">
          <figcaption className="mb-2 font-mono text-xs text-neutral-500">600 px</figcaption>
          <iframe
            className="rounded-lg border border-neutral-200 dark:border-neutral-800"
            height={780}
            /*
             * `allow-scripts` verilmez — mektupta betik yok ve olmamalı. `allow-same-origin`
             * bilerek açık: denetim sırasında çerçevenin içindeki hesaplanmış ölçüler
             * (kart genişliği, kod punto, medya sorgusu) dışarıdan okunabilsin diye.
             */
            sandbox="allow-same-origin"
            srcDoc={html}
            title={`${variant.id}-desktop`}
            width={640}
          />
        </figure>
        <figure className="m-0">
          <figcaption className="mb-2 font-mono text-xs text-neutral-500">390 px</figcaption>
          <iframe
            className="rounded-lg border border-neutral-200 dark:border-neutral-800"
            height={780}
            /*
             * `allow-scripts` verilmez — mektupta betik yok ve olmamalı. `allow-same-origin`
             * bilerek açık: denetim sırasında çerçevenin içindeki hesaplanmış ölçüler
             * (kart genişliği, kod punto, medya sorgusu) dışarıdan okunabilsin diye.
             */
            sandbox="allow-same-origin"
            srcDoc={html}
            title={`${variant.id}-mobile`}
            width={390}
          />
        </figure>
      </div>
    </section>
  );
}

export default function EmailPreviewPage() {
  if (!isGalleryEnabled) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">İşlemsel e-posta galerisi</h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-500">
          Gerçek renderer çağrılır; veriler sahtedir. Beklenen sonuç{" "}
          <code className="font-mono">design_handoff/eposta-handoff/ekran-goruntuleri/</code>{" "}
          klasöründeki görüntülerdir. Bu sayfa üretimde 404 döner.
        </p>
      </header>

      {APP_LOCALES.map((locale) => (
        <div className="flex flex-col gap-6" key={locale}>
          <h2 className="font-mono text-sm tracking-widest text-neutral-500 uppercase">{locale}</h2>
          {buildVariants(locale).map((variant) => (
            <VariantCard key={variant.id} locale={locale} variant={variant} />
          ))}
        </div>
      ))}
    </main>
  );
}
