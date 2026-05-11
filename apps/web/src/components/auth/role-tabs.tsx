"use client";

import { BriefcaseBusiness, Check, Gamepad2, UserRound, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import type { AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type LoginRole = "individual" | "gamer" | "business";

const ROLE_COPY: Record<
  AppLocale,
  Record<LoginRole, { hint: string; label: string; previewLabel?: string }>
> = {
  en: {
    business: {
      hint: "Continue working with your team through your business workspace.",
      label: "Business",
      previewLabel: "Preview",
    },
    gamer: {
      hint: "Join your community, coordinate with your squad, and keep game nights flowing.",
      label: "Gamer",
      previewLabel: "Preview",
    },
    individual: {
      hint: "Message friends securely, share files, and stay connected privately.",
      label: "Personal",
    },
  },
  tr: {
    business: {
      hint: "Kurumsal hesabınla ekibinle çalışmaya devam et.",
      label: "Kurumsal",
      previewLabel: "Preview",
    },
    gamer: {
      hint: "Topluluğuna katıl, takımınla koordine ol ve oyun akışını koru.",
      label: "Oyuncu",
      previewLabel: "Preview",
    },
    individual: {
      hint: "Arkadaşlarınla güvenle iletişim kur, fotoğraf ve dosya paylaş.",
      label: "Bireysel",
    },
  },
};

const ROLE_OPTIONS: Array<{
  Icon: LucideIcon;
  value: LoginRole;
}> = [
  {
    Icon: UserRound,
    value: "individual",
  },
  {
    Icon: Gamepad2,
    value: "gamer",
  },
  {
    Icon: BriefcaseBusiness,
    value: "business",
  },
];

export function getLoginRoleHint(value: LoginRole, locale: AppLocale) {
  return ROLE_COPY[locale][value].hint;
}

export function RoleTabs({
  onChange,
  value,
}: {
  onChange: (value: LoginRole) => void;
  value: LoginRole;
}) {
  const { locale } = useI18n();

  return (
    <div
      className="modern-role-tabs"
      role="radiogroup"
      aria-label={locale === "tr" ? "Hesap türü" : "Account type"}
    >
      {ROLE_OPTIONS.map((role) => {
        const selected = role.value === value;
        const Icon = role.Icon;
        const copy = ROLE_COPY[locale][role.value];

        return (
          <button
            aria-checked={selected}
            className={cn("modern-role-tab", `is-${role.value}`, selected && "is-active")}
            key={role.value}
            onClick={() => onChange(role.value)}
            role="radio"
            type="button"
          >
            <span className="modern-role-icon" aria-hidden="true">
              <Icon className="h-4 w-4" />
            </span>
            <span>{copy.label}</span>
            {copy.previewLabel ? (
              <span className="modern-role-preview-badge">{copy.previewLabel}</span>
            ) : null}
            {selected ? (
              <i aria-hidden="true">
                <Check className="h-3 w-3" />
              </i>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
