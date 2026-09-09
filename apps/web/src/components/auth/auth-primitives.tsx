"use client";

import Link from "next/link";
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

/**
 * SPEC-GIRIS-KAYIT §4 ortak form tablosu ve §9 etkileşim durumları.
 *
 * Ölçüler `globals.css` içindeki `.auth-*` sınıflarından, sınıflar da kökteki
 * `buildAuthCssVars` değişkenlerinden okur. Bu dosyada tek bir çıplak `px` yoktur.
 */

export function AuthEyebrow({ children }: { children: ReactNode }) {
  return <p className="auth-eyebrow">{children}</p>;
}

export function AuthTitle({ children }: { children: ReactNode }) {
  return <h1 className="auth-title">{children}</h1>;
}

export function AuthDescription({ children }: { children: ReactNode }) {
  return <p className="auth-description">{children}</p>;
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Alan içi hata (SPEC §8/1). Verildiğinde alan `aria-invalid` ve `aria-describedby` alır. */
  error?: ReactNode;
  label: string;
  /** Etiket satırının sağı — `Şifremi unuttum` bağlantısı buraya girer (SPEC §4.1). */
  labelAction?: ReactNode;
  /** Alanın altındaki ipucu/algılama satırı (SPEC §4.4/1-2). */
  hint?: ReactNode;
  /** Alanın **içinde** sağda duran denetim (SPEC §4.4/3 `Göster`/`Gizle`). */
  trailing?: ReactNode;
  /** SPEC §1.4 — alan yuksekligi. `size` adi native `<input size>` ile cakisiyor. */
  fieldSize?: "code" | "compact" | "default" | undefined;
  tone?: "danger" | "warning" | undefined;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    className,
    error,
    fieldSize = "default",
    hint,
    id,
    label,
    labelAction,
    tone = "danger",
    trailing,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div
      className="flex flex-col"
      style={
        tone === "warning"
          ? ({
              "--auth-tone": "var(--warning)",
              "--auth-tone-soft": "var(--warning-soft)",
            } as never)
          : undefined
      }
    >
      <div className="auth-label-row">
        <label className="auth-label" htmlFor={inputId}>
          {label}
        </label>
        {labelAction}
      </div>

      <div className="auth-input-wrap">
        <input
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          className={cn("auth-input", className)}
          data-size={fieldSize === "default" ? undefined : fieldSize}
          id={inputId}
          ref={ref}
          {...props}
        />
        {trailing}
      </div>

      {hint ? (
        <p className="auth-hint mt-[var(--auth-label-gap)]" id={hintId}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="auth-field-error mt-[var(--auth-label-gap)]" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

type PasswordInputProps = Omit<TextInputProps, "fieldSize" | "type">;

/** SPEC §4.4/3 — sağ içinde `Göster`/`Gizle` düğmesi olan şifre alanı. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);

    return (
      <TextInput
        {...props}
        data-reveal="true"
        ref={ref}
        trailing={
          <button
            className="auth-reveal"
            onClick={() => setVisible((current) => !current)}
            type="button"
          >
            {visible ? t("auth.field.hide") : t("auth.field.show")}
          </button>
        }
        type={visible ? "text" : "password"}
      />
    );
  },
);

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export function PrimaryButton({ children, className, loading, ...props }: PrimaryButtonProps) {
  return (
    <button
      className={cn("auth-btn-primary", className)}
      data-loading={loading ? "true" : undefined}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="auth-spinner" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function SecondaryButton({
  children,
  className,
  href,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { href?: string }) {
  if (href) {
    return (
      <Link className={cn("auth-btn-secondary", className)} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cn("auth-btn-secondary", className)} {...props}>
      {children}
    </button>
  );
}

export function AuthLink({
  children,
  href,
  size,
  tone,
  ...props
}: {
  children: ReactNode;
  href: string;
  size?: "small";
  tone?: "muted";
} & Omit<React.ComponentProps<typeof Link>, "children" | "href">) {
  return (
    <Link className="auth-link" data-size={size} data-tone={tone} href={href} {...props}>
      {children}
    </Link>
  );
}

/** SPEC §4 — `veya` ayırıcısı. */
export function AuthDivider() {
  const { t } = useI18n();

  return (
    <div className="auth-divider" role="separator">
      {t("auth.field.or")}
    </div>
  );
}

type AuthCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  /** Satırın sağına yerleşen sayaç — `3 deneme kaldı` (SPEC §8/1). */
  trailing?: ReactNode;
};

export function AuthCheckbox({ label, trailing, ...props }: AuthCheckboxProps) {
  return (
    <div className="flex items-center justify-between gap-[var(--auth-label-gap)]">
      <label className="auth-checkbox">
        <input className="sr-only" type="checkbox" {...props} />
        <span aria-hidden="true" className="auth-checkbox-box">
          ✓
        </span>
        <span className="auth-checkbox-label">{label}</span>
      </label>
      {trailing}
    </div>
  );
}
