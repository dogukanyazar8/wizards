"use client";

import React, { useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { RiskyButton, RiskyField, RiskyFooter, RiskyGrid, RiskyMessage } from "./risky-field";
import { regenerateRecoveryCodesAction } from "@/lib/account/actions";

export function downloadRecoveryCodes(codes: readonly string[]) {
  const url = URL.createObjectURL(
    new Blob([`${codes.join("\n")}\n`], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "whispr-recovery-codes.txt";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function RecoveryCodesBlock({
  codes,
  renewing,
  hasPassword,
  onRenew,
  onGenerated,
  onClose,
}: {
  codes: readonly string[] | null;
  renewing: boolean;
  hasPassword: boolean | null;
  onRenew: () => void;
  onGenerated: (codes: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const regenerate = async () => {
    if (submitting.current || !password || !code.trim() || hasPassword !== true) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await regenerateRecoveryCodesAction({ password, code });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPassword("");
      setCode("");
      onGenerated(result.recoveryCodes);
    } catch {
      setError("settings.account.twoFactor.errors.unavailable");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  if (!renewing) {
    return (
      <RiskyGrid>
        <RiskyMessage
          testId="settings-recovery-note"
          text={t(codes ? "settings.recovery.saveHint" : "settings.recovery.unavailable")}
          tone={codes ? "success" : "warning"}
        />
        {codes ? (
          <ul
            className="col-span-full grid grid-cols-2 gap-2 font-mono text-sm text-[hsl(var(--foreground))]"
            data-testid="settings-recovery-codes"
          >
            {codes.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        ) : null}
        <RiskyFooter help={t("settings.recovery.singleUse")}>
          <RiskyButton
            label={t("settings.control.risky.close")}
            onClick={onClose}
            testId="settings-recovery-close"
          />
          {codes ? (
            <RiskyButton
              label={t("settings.action.s2.2")}
              onClick={() => downloadRecoveryCodes(codes)}
              testId="settings-recovery-download"
              tone="primary"
            />
          ) : (
            <RiskyButton
              label={t("settings.action.s2.3")}
              onClick={onRenew}
              testId="settings-recovery-renew"
              tone="primary"
            />
          )}
        </RiskyFooter>
      </RiskyGrid>
    );
  }

  return (
    <RiskyGrid>
      <RiskyMessage
        testId="settings-recovery-replace-note"
        text={t("settings.recovery.replaceWarning")}
        tone="warning"
      />
      {hasPassword === false ? (
        <RiskyMessage
          testId="settings-recovery-password-note"
          text={t("settings.recovery.passwordRequired")}
          tone="warning"
        />
      ) : null}
      <RiskyField
        autoComplete="current-password"
        disabled={pending}
        label={t("settings.account.twoFactor.passwordPlaceholder")}
        onChange={setPassword}
        testId="settings-recovery-password"
        type="password"
        value={password}
      />
      <RiskyField
        autoComplete="one-time-code"
        disabled={pending}
        label={t("auth.login.twoFactorLabel")}
        maxLength={64}
        onChange={setCode}
        testId="settings-recovery-code"
        value={code}
      />
      {error ? (
        <RiskyMessage text={t(error)} tone="danger" testId="settings-recovery-error" />
      ) : null}
      <RiskyFooter help={t("settings.recovery.reauthHelp")}>
        <RiskyButton
          label={t("settings.block.password.cancel")}
          onClick={onClose}
          testId="settings-recovery-cancel"
        />
        <RiskyButton
          disabled={pending || !password || !code.trim() || hasPassword !== true}
          label={t("settings.recovery.confirm")}
          onClick={() => void regenerate()}
          testId="settings-recovery-confirm"
          tone="primary"
        />
      </RiskyFooter>
    </RiskyGrid>
  );
}
