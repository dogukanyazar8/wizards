"use client";

import { BriefcaseBusiness, Check, Gamepad2, User, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export type AudienceSelectorValue = "individual" | "gamer" | "business";

interface AudienceSelectorOption {
  icon: LucideIcon;
  labelKey: string;
  tone: "business" | "gamer" | "individual";
  value: AudienceSelectorValue;
}

const AUDIENCE_SELECTOR_OPTIONS: AudienceSelectorOption[] = [
  {
    icon: User,
    labelKey: "auth.layout.audience.selector.individual",
    tone: "individual",
    value: "individual",
  },
  {
    icon: Gamepad2,
    labelKey: "auth.layout.audience.selector.gamer",
    tone: "gamer",
    value: "gamer",
  },
  {
    icon: BriefcaseBusiness,
    labelKey: "auth.layout.audience.selector.business",
    tone: "business",
    value: "business",
  },
];

interface AudienceSelectorProps {
  onChange: (value: AudienceSelectorValue) => void;
  value: AudienceSelectorValue;
}

export function AudienceSelector({ onChange, value }: AudienceSelectorProps) {
  const { t } = useI18n();

  return (
    <div
      aria-label={t("auth.layout.audience.selectorLabel")}
      className="auth-audience-selector grid grid-cols-3 gap-3"
      role="radiogroup"
    >
      {AUDIENCE_SELECTOR_OPTIONS.map(({ icon: Icon, labelKey, tone, value: optionValue }) => {
        const selected = value === optionValue;

        return (
          <button
            aria-checked={selected}
            className={cn("auth-audience-card", selected && "is-selected")}
            key={optionValue}
            onClick={() => onChange(optionValue)}
            role="radio"
            type="button"
          >
            {selected ? (
              <span aria-hidden="true" className="auth-audience-check">
                <Check className="h-3 w-3" />
              </span>
            ) : null}
            <span className={cn("auth-audience-icon", `is-${tone}`)} aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <span className="auth-audience-label">{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
