"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { RiskyField, RiskyButton, RiskyGrid } from "@/components/settings/risky/risky-field";
import { PhoneNumberSchema, EmailChangeRequestSchema } from "@/lib/account/contact-contract";
import {
  saveAccountPhoneAction,
  requestAccountEmailChangeAction,
  confirmAccountEmailChangeAction,
  sendGoogleAccountEmailCodeAction,
} from "@/lib/account/contact-actions";

type Contact = {
  phone: string | null;
  hasPassword: boolean;
  googleAvailable: boolean;
  twoFactorEnabled: boolean;
};
const ERROR_CODES = new Set([
  "INVALID_INPUT",
  "INVALID_PASSWORD",
  "INVALID_TWO_FACTOR",
  "EXPIRED",
  "INVALID_CODE",
  "SAME_EMAIL",
  "RATE_LIMITED",
  "SEND_FAILED",
  "EMAIL_UNAVAILABLE",
  "GOOGLE_REQUIRED",
  "REAUTH_UNAVAILABLE",
]);

export function ContactBlock({
  kind,
  email,
  contact,
  onClose,
  onPhoneSaved,
}: {
  kind: "email" | "phone";
  email: string;
  contact: Contact;
  onClose: () => void;
  onPhoneSaved: (phone: string | null) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [challenge, setChallenge] = useState<{
    id: string;
    googleToken: string | null;
    method: "google" | "code";
  } | null>(null);

  const run = async (operation: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await operation();
    } catch {
      setError("UNAVAILABLE");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const fail = (errorCode: string) =>
    setError(ERROR_CODES.has(errorCode) ? errorCode : "UNAVAILABLE");
  const request = () =>
    run(async () => {
      if (kind === "phone") {
        if (!PhoneNumberSchema.safeParse(value).success) {
          fail("INVALID_INPUT");
          return;
        }
        const result = await saveAccountPhoneAction(value);
        if (!result.success) {
          fail(result.error);
          return;
        }
        onPhoneSaved(result.phone);
        if (mounted.current) onClose();
        return;
      }
      const input = { email: value, password, twoFactorCode };
      if (!EmailChangeRequestSchema.safeParse(input).success) {
        fail("INVALID_INPUT");
        return;
      }
      const result = await requestAccountEmailChangeAction(input);
      setPassword("");
      setTwoFactorCode("");
      if (!result.success) {
        fail(result.error);
        return;
      }
      setChallenge(result);
    });
  const confirm = () =>
    run(async () => {
      if (!challenge) return;
      if (challenge.method === "google") {
        const result = await sendGoogleAccountEmailCodeAction(challenge.id);
        if (!result.success) {
          fail(result.error);
          return;
        }
        setChallenge({ ...challenge, method: "code", googleToken: null });
      } else {
        const result = await confirmAccountEmailChangeAction({ id: challenge.id, code });
        if (!result.success) {
          fail(result.error);
          return;
        }
        setDone(true);
        setCode("");
        await signOut({ redirectTo: "/login" });
      }
    });

  return (
    <form
      aria-label={t(
        kind === "email" ? "settings.contact.emailTitle" : "settings.contact.phoneTitle",
      )}
      data-testid={`settings-contact-form-${kind}`}
      style={{
        fontFamily: "inherit",
        fontSize: pxToRem(SETTINGS_METRICS.row.subFontSize),
        lineHeight: SETTINGS_METRICS.row.subLineHeight,
      }}
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!done) void (challenge ? confirm() : request());
      }}
    >
      {kind === "email" && (
        <input autoComplete="username" name="username" type="text" value={email} readOnly hidden />
      )}
      <div className="space-y-4" aria-busy={pending}>
        {done ? (
          <>
            <p role="status">{t("settings.contact.done")}</p>
            <Link href="/login">{t("settings.contact.login")}</Link>
          </>
        ) : (
          <>
            <p className="text-[hsl(var(--text-muted))]">
              {t(kind === "phone" ? "settings.contact.phoneHelp" : "settings.contact.emailHelp")}
            </p>
            {!challenge ? (
              <RiskyGrid>
                <RiskyField
                  label={t(
                    kind === "email" ? "settings.contact.newEmail" : "settings.row.ap.title",
                  )}
                  autoComplete={kind === "email" ? "email" : "tel"}
                  type={kind === "email" ? "email" : "tel"}
                  disabled={pending}
                  value={value}
                  onChange={setValue}
                  span="full"
                  maxLength={kind === "email" ? 254 : 40}
                  placeholder={kind === "phone" ? "+90 532 123 45 67" : ""}
                  testId="settings-contact-value"
                />
                {kind === "email" && contact.hasPassword && (
                  <RiskyField
                    label={t("settings.block.password.current")}
                    autoComplete="current-password"
                    disabled={pending}
                    type="password"
                    value={password}
                    onChange={setPassword}
                    span="full"
                    maxLength={100}
                    testId="settings-contact-password"
                  />
                )}
                {kind === "email" && contact.twoFactorEnabled && (
                  <RiskyField
                    label={t("settings.contact.twoFactor")}
                    autoComplete="one-time-code"
                    disabled={pending}
                    value={twoFactorCode}
                    onChange={setTwoFactorCode}
                    span="full"
                    maxLength={32}
                    testId="settings-contact-two-factor"
                  />
                )}
              </RiskyGrid>
            ) : challenge.method === "google" ? (
              <div className="space-y-3">
                <p>{t("settings.contact.googleHelp")}</p>
                <a
                  className="inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`/settings/email-change/google?token=${encodeURIComponent(challenge.googleToken ?? "")}`}
                >
                  {t("settings.contact.googleVerify")}
                </a>
              </div>
            ) : (
              <>
                <p className="break-all" role="status">
                  {t("settings.contact.codeSent", { email: value })}
                </p>
                <RiskyField
                  label={t("settings.contact.code")}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  disabled={pending}
                  value={code}
                  onChange={setCode}
                  maxLength={6}
                  testId="settings-contact-code"
                />
              </>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {t(`settings.contact.error.${error}`)}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <RiskyButton
                disabled={pending}
                label={t("settings.contact.cancel")}
                onClick={onClose}
                testId="settings-contact-cancel"
              />
              {challenge && (
                <RiskyButton
                  disabled={pending}
                  label={t("settings.contact.restart")}
                  testId="settings-contact-restart"
                  onClick={() => {
                    setChallenge(null);
                    setCode("");
                    setError(null);
                  }}
                />
              )}
              <RiskyButton
                tone="primary"
                disabled={
                  pending ||
                  (kind === "email" &&
                    !challenge &&
                    ((!contact.hasPassword && !contact.googleAvailable) ||
                      !value ||
                      (contact.hasPassword && !password))) ||
                  (challenge?.method === "code" && !/^\d{6}$/.test(code))
                }
                label={t(
                  pending
                    ? "settings.contact.saving"
                    : challenge?.method === "google"
                      ? "settings.contact.googleContinue"
                      : challenge
                        ? "settings.contact.confirm"
                        : kind === "phone"
                          ? "settings.contact.save"
                          : "settings.contact.continue",
                )}
                onClick={() => {
                  void (challenge ? confirm() : request());
                }}
                testId="settings-contact-submit"
              />
            </div>
          </>
        )}
      </div>
    </form>
  );
}
