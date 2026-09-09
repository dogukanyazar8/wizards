"use client";

import { useI18n } from "@/components/providers/locale-provider";

/**
 * SPEC-GIRIS-KAYIT §4.8 — sağlayıcı düğmeleri.
 *
 * Sıra ve durum sabittir: **Google aktif**, Microsoft ve Apple `Yakında` rozetiyle devre dışı.
 * Discord düğmesi paket kararı K4 ile kaldırıldı (NextAuth sağlayıcısına dokunulmadı).
 *
 * SPEC'in harf karoları geçici temsillerdi; burada her sağlayıcının resmî SVG'si kullanılıyor
 * (K14). Rozet erişilebilir ada girer, böylece ekran okuyucu "Microsoft ile devam et — Yakında"
 * duyar ve neden tıklayamadığını anlar (SPEC §11).
 */

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="100%" height="100%">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.76-.07-1.49-.19-2.19H12v4.14h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.48Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.51c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.06v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 13.88a6 6 0 0 1 0-3.76v-2.6H3.06a10 10 0 0 0 0 8.96l3.34-2.6Z" />
      <path
        fill="#EA4335"
        d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.86-2.87C16.96 3.01 14.7 2 12 2a10 10 0 0 0-8.94 5.52l3.34 2.6C7.19 7.75 9.4 5.99 12 5.99Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="100%" height="100%">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="100%" height="100%">
      <path
        fill="currentColor"
        d="M16.7 12.8c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8 2-.1 2.8-2.1c.9-1.3 1.3-2.6 1.3-2.7-.1-.1-2.7-1.1-2.7-4Zm-2.2-6.4c.7-.8 1.1-1.9 1-3-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.8-1.4Z"
      />
    </svg>
  );
}

export type AuthProviderKey = "apple" | "google" | "microsoft";

const PROVIDERS = [
  { available: true, icon: GoogleIcon, key: "google", labelKey: "auth.provider.google" },
  { available: false, icon: MicrosoftIcon, key: "microsoft", labelKey: "auth.provider.microsoft" },
  { available: false, icon: AppleIcon, key: "apple", labelKey: "auth.provider.apple" },
] as const;

export function SocialAuthButtons({
  disabled,
  onSelect,
  shortLabels,
}: {
  disabled?: boolean;
  onSelect?: (provider: AuthProviderKey) => void;
  /** SPEC §6/1 — mobilde etiketler kısalır (`Google` yerine `Google ile devam et` değil). */
  shortLabels?: boolean;
}) {
  const { t } = useI18n();
  const soon = t("auth.provider.soon");

  return (
    <div className="auth-provider-list">
      {PROVIDERS.map(({ available, icon: Icon, key, labelKey }) => {
        const label = t(labelKey);
        const shortLabel = label.split(" ")[0] ?? label;

        return (
          <button
            aria-disabled={available ? undefined : true}
            aria-label={available ? undefined : `${label} — ${soon}`}
            className="auth-provider"
            disabled={!available || disabled}
            key={key}
            onClick={available ? () => onSelect?.(key) : undefined}
            type="button"
          >
            <span aria-hidden="true" className="auth-provider-tile">
              <Icon />
            </span>
            <span>{shortLabels ? shortLabel : label}</span>
            {available ? null : <span className="auth-provider-badge ml-auto">{soon}</span>}
          </button>
        );
      })}
    </div>
  );
}
