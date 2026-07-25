"use client";

import { Check, X } from "lucide-react";

type ServerFeatureToggleProps = {
  checked: boolean;
  description: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
  title: string;
};

export function ServerFeatureToggle({
  checked,
  description,
  disabled = false,
  onChange,
  testId,
  title,
}: ServerFeatureToggleProps) {
  return (
    <button
      aria-checked={checked}
      className="group flex w-full items-center justify-between gap-4 rounded-[22px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.34)] p-4 text-left transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--surface-soft)/0.52)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-app-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-app-muted">{description}</span>
      </span>
      <span
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition ${
          checked
            ? "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.24)]"
            : "border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-card)/0.78)]"
        }`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full shadow-xs transition ${
            checked
              ? "translate-x-6 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "translate-x-0 bg-[hsl(var(--surface-soft))] text-app-soft"
          }`}
        >
          {checked ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
      </span>
    </button>
  );
}
