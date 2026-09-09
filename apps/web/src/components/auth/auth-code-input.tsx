"use client";

import { useCallback, useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { AUTH_METRICS } from "@/lib/auth/metrics";

/**
 * SPEC-GIRIS-KAYIT §4.2 ve §11 — altı kod hücresi.
 *
 * Hücreler **tek bir alan gibi davranır**: ekran okuyucu ve şifre yöneticisi için görünmez tek
 * bir `<input inputmode="numeric" autocomplete="one-time-code">` vardır; hücreler onun görsel
 * karşılığıdır. Yapıştırma altı haneyi dağıtır, `Backspace` bir önceki haneye döner.
 *
 * Altıncı hane girildiğinde form **otomatik gönderilmez** — kazara gönderim kullanıcıyı yanlış
 * kodla kilitlenmeye yaklaştırır; düğme etkinleşir, karar kullanıcıda kalır.
 */

const { count } = AUTH_METRICS.codeCell;

export function AuthCodeInput({
  ariaLabel,
  disabled,
  onChange,
  onComplete,
  tone,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean | undefined;
  onChange: (value: string) => void;
  onComplete?: ((value: string) => void) | undefined;
  tone?: "danger" | undefined;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const digits = value.slice(0, count).split("");
  const activeIndex = Math.min(digits.length, count - 1);

  const commit = useCallback(
    (next: string) => {
      const normalized = next.replace(/\D/g, "").slice(0, count);
      onChange(normalized);

      if (normalized.length === count) {
        onComplete?.(normalized);
      }
    },
    [onChange, onComplete],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && value.length > 0) {
        event.preventDefault();
        commit(value.slice(0, -1));
      }
    },
    [commit, value],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      commit(event.clipboardData.getData("text"));
    },
    [commit],
  );

  return (
    <div className="relative">
      <input
        aria-label={ariaLabel}
        autoComplete="one-time-code"
        className="absolute inset-0 h-full w-full cursor-default opacity-0"
        disabled={disabled}
        id={inputId}
        inputMode="numeric"
        maxLength={count}
        onChange={(event) => commit(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        ref={inputRef}
        type="text"
        value={value}
      />

      <div aria-hidden="true" className="auth-code-row">
        {Array.from({ length: count }, (_, index) => {
          const digit = digits[index];
          const isActive = !disabled && index === activeIndex && digits.length < count;

          return (
            <div
              className="auth-cell"
              data-active={isActive ? "true" : undefined}
              data-filled={digit ? "true" : "false"}
              data-tone={tone}
              key={index}
              onClick={() => inputRef.current?.focus()}
            >
              {digit ?? (isActive ? <span className="auth-caret" /> : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
