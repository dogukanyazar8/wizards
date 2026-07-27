import React, { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getAdminAvatarGradient, getAdminAvatarInitials } from "./avatar-gradients";

/** Card: --card ground, border/0.7, radius 16, padding 18–22px (handoff). */
export function AdminCard({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card))] p-[18px] sm:p-[22px]",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

export function AdminCardHeader({
  action,
  subtitle,
  title,
}: {
  action?: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-app-foreground text-[16px] font-semibold">{title}</h2>
        {subtitle ? <p className="text-app-muted mt-1 text-[12px]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type AdminPillTone = "success" | "warning" | "danger" | "primary" | "neutral";

const PILL_TONES: Record<AdminPillTone, string> = {
  danger: "bg-[hsl(var(--danger)/0.14)] text-app-danger",
  neutral: "bg-[hsl(var(--surface-soft))] text-app-muted",
  primary: "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  success: "bg-[hsl(var(--success)/0.14)] text-app-success",
  warning: "bg-[hsl(var(--warning)/0.14)] text-app-warning",
};

/** Pill: 700 11.5px, 3px 9px, radius 999 (handoff). */
export function AdminPill({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: AdminPillTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[11.5px] font-bold",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminPageHeader({
  actions,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-app-foreground font-display text-[26px] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle ? <p className="text-app-muted mt-1 text-[13px]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminKpiCard({
  change,
  description,
  label,
  value,
}: {
  change?: { tone: AdminPillTone; label: string };
  description?: string;
  label: string;
  value: string;
}) {
  return (
    <AdminCard className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-app-muted text-[12.5px] font-semibold">{label}</span>
        {change ? <AdminPill tone={change.tone}>{change.label}</AdminPill> : null}
      </div>
      <p className="text-app-foreground font-display mt-2 text-[30px] font-bold tracking-[-0.02em]">
        {value}
      </p>
      {description ? <p className="text-app-muted mt-1 text-[12px]">{description}</p> : null}
    </AdminCard>
  );
}

export function AdminMiniStat({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: AdminPillTone;
  value: string;
}) {
  const valueTone =
    tone === "neutral"
      ? "text-app-foreground"
      : tone === "primary"
        ? "text-[hsl(var(--primary))]"
        : tone === "success"
          ? "text-app-success"
          : tone === "warning"
            ? "text-app-warning"
            : "text-app-danger";

  return (
    <AdminCard className="min-w-0">
      <p className="text-app-muted text-[12px]">{label}</p>
      <p className={cn("font-display mt-1 text-[21px] font-bold", valueTone)}>{value}</p>
    </AdminCard>
  );
}

export function AdminChip({
  children,
  onClick,
  selected = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={cn(
        "rounded-[12px] border px-3 py-[7px] text-[12.5px] font-semibold transition-colors",
        selected
          ? "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          : "text-[hsl(var(--text-secondary))] border-[hsl(var(--border)/0.7)] bg-transparent hover:bg-[hsl(var(--surface-soft))]",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Bars are drawn by hand: a chart library cannot be themed by token alone. */
export function AdminBarChart({
  bars,
  height = 170,
}: {
  bars: Array<{ label: string; value: number }>;
  height?: number;
}) {
  const peak = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bars.map((bar) => (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={bar.label}>
          <div className="flex w-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-[34px] rounded-[7px] bg-linear-to-b from-[hsl(var(--primary))] to-[hsl(var(--ambient-2))]"
              style={{ height: `${Math.max(2, (bar.value / peak) * 100)}%` }}
              title={`${bar.label}: ${bar.value}`}
            />
          </div>
          <span className="text-app-muted truncate text-[10.5px]">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminProgress({ label, value }: { label: ReactNode; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[hsl(var(--text-secondary))] mb-1 flex items-center justify-between gap-2 text-[12.5px]">
        {label}
      </div>
      <div className="h-[7px] w-full overflow-hidden rounded-full bg-[hsl(var(--surface-soft))]">
        <div
          className="h-full rounded-full bg-linear-to-r from-[hsl(var(--primary))] to-[hsl(var(--ambient-2))]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function AdminPulseDot({ tone = "success" }: { tone?: "success" | "danger" }) {
  return (
    <span
      className={cn(
        "admin-pulse-dot inline-block h-[8px] w-[8px] rounded-full",
        tone === "success" ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--danger))]",
      )}
    />
  );
}

export function AdminToggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange?: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "relative h-[24px] w-[42px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-soft))]",
        disabled && "cursor-not-allowed opacity-60",
      )}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      role="switch"
      type="button"
    >
      <span
        className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-[hsl(var(--card))] transition-[left] duration-200"
        style={{ left: checked ? 21 : 3 }}
      />
    </button>
  );
}

export function AdminAvatarSquare({
  avatarUrl,
  name,
  seed,
  size = 32,
  variant = "default",
}: {
  avatarUrl?: string | null;
  name: string;
  seed: string;
  size?: number;
  variant?: "default" | "system";
}) {
  const style: CSSProperties = {
    height: size,
    width: size,
    ...(avatarUrl
      ? {}
      : {
          backgroundImage:
            variant === "system"
              ? "linear-gradient(135deg, hsl(var(--surface-soft)), hsl(var(--text-soft)))"
              : getAdminAvatarGradient(seed),
        }),
  };

  return (
    <span
      className="text-white inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-cover bg-center text-[11.5px] font-bold"
      style={avatarUrl ? { ...style, backgroundImage: `url(${avatarUrl})` } : style}
    >
      {avatarUrl ? null : variant === "system" ? "S" : getAdminAvatarInitials(name)}
    </span>
  );
}

/**
 * A card-scoped CSS grid rather than a `<table>`: the handoff rows mix avatars,
 * pills and action menus, and grid keeps every column aligned across them.
 */
export function AdminGridTable({
  columns,
  emptyLabel = "Kayıt yok.",
  headers,
  rows,
}: {
  columns: string;
  emptyLabel?: string;
  headers: string[];
  rows: Array<{ cells: ReactNode[]; id: string }>;
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="min-w-[720px]">
        <div
          className="text-app-muted grid gap-2 rounded-t-[12px] bg-[hsl(var(--surface-secondary))] px-4 py-[9px] text-[11px] font-bold tracking-[0.06em] uppercase"
          style={{ gridTemplateColumns: columns }}
        >
          {headers.map((header) => (
            <span className="truncate" key={header}>
              {header}
            </span>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="text-app-muted border-t border-[hsl(var(--border)/0.45)] px-4 py-6 text-[13px]">
            {emptyLabel}
          </p>
        ) : (
          rows.map((row) => (
            <div
              className="text-app-foreground grid items-center gap-2 border-t border-[hsl(var(--border)/0.45)] px-4 py-[11px] text-[13px] hover:bg-[hsl(var(--surface-secondary))]"
              key={row.id}
              style={{ gridTemplateColumns: columns }}
            >
              {row.cells.map((cell, index) => (
                <div className="min-w-0" key={`${row.id}-${index}`}>
                  {cell}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
