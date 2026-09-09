"use client";

import React, { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import type { AccountDeletionPreflight } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import {
  RiskyButton,
  RiskyField,
  RiskyFooter,
  RiskyGrid,
  RiskyMessage,
} from "@/components/settings/risky/risky-field";
import {
  deleteOwnAccount,
  fetchAccountDeletionPreflight,
  reauthenticateAccountDeletion,
  requestAccountDeletionEmailReauth,
} from "@/lib/account/privacy-client";
import { matchesDeletionConfirmation } from "@/lib/settings/security-client";

/**
 * Hesabı sil bloğu (`d3`) — SPEC-AYARLAR §5.1, Ş7 §6.
 *
 * Doğrulama cümlesi ekranda **Türkçe**, telde sabit literal (Ş3 §4 sapma 4): istemci
 * yerelleştirilmiş cümleyi karşılaştırır, `deleteOwnAccount` protokol literalini gönderir ve
 * sunucu onu `z.literal` ile **yeniden** denetler. İstemci kontrolü atlansa bile hesap silinmez.
 *
 * Sahiplenilen sunucular önce devredilmeli: `canDelete` false iken düğme açılmaz.
 */

export type DeleteAccountBlockProps = {
  readonly onClose: () => void;
};

export function DeleteAccountBlock({ onClose }: DeleteAccountBlockProps) {
  const { t } = useI18n();
  const [preflight, setPreflight] = useState<AccountDeletionPreflight | null>(null);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchAccountDeletionPreflight()
      .then((next) => {
        if (active) setPreflight(next);
      })
      .catch(() => {
        if (active) setErrorKey("settings.account.data.delete.preflightError");
      });

    return () => {
      active = false;
    };
  }, []);

  const phrase = t("settings.block.deleteAccount.phrase");
  const phraseMatches = matchesDeletionConfirmation(typed, phrase);
  const usesPassword = preflight?.reauthMethod === "PASSWORD";

  const authenticate = () => {
    if (pending) return;

    setPending(true);
    setErrorKey(null);

    const run = usesPassword
      ? reauthenticateAccountDeletion(password).then((token) => {
          setReauthToken(token);
          setNoticeKey("settings.account.data.delete.reauthReady");
        })
      : requestAccountDeletionEmailReauth().then(() => {
          setNoticeKey("settings.account.data.delete.emailSent");
        });

    void run
      .catch(() => setErrorKey("settings.account.data.delete.reauthError"))
      .finally(() => setPending(false));
  };

  const destroy = () => {
    if (pending || !reauthToken || !phraseMatches) return;

    setPending(true);
    setErrorKey(null);

    void deleteOwnAccount(reauthToken)
      .then(() => signOut({ redirectTo: "/login" }))
      .catch(() => {
        setErrorKey("settings.account.data.delete.error");
        setPending(false);
      });
  };

  return (
    <RiskyGrid>
      <RiskyMessage
        testId="settings-delete-account-warning"
        text={t("settings.block.deleteAccount.ownedServers", {
          count: preflight?.ownedServers.length ?? 0,
        })}
        tone="danger"
      />

      <RiskyField
        autoComplete="current-password"
        disabled={!usesPassword}
        label={t("settings.block.deleteAccount.password")}
        onChange={setPassword}
        testId="settings-delete-account-password"
        type="password"
        value={password}
      />
      <RiskyField
        invalid={typed.length > 0 && !phraseMatches}
        label={t("settings.block.deleteAccount.confirmationLabel")}
        onChange={setTyped}
        placeholder={phrase}
        testId="settings-delete-account-phrase"
        value={typed}
      />

      {noticeKey ? (
        <RiskyMessage testId="settings-delete-account-notice" text={t(noticeKey)} tone="success" />
      ) : null}
      {errorKey ? (
        <RiskyMessage testId="settings-delete-account-error" text={t(errorKey)} tone="danger" />
      ) : null}

      <RiskyFooter help={t("settings.block.deleteAccount.irreversible")}>
        <RiskyButton
          label={t("settings.block.deleteAccount.cancel")}
          onClick={onClose}
          testId="settings-delete-account-cancel"
        />
        <RiskyButton
          disabled={pending || reauthToken !== null || (usesPassword && password.length === 0)}
          label={t("settings.account.data.delete.reauth")}
          onClick={authenticate}
          testId="settings-delete-account-reauth"
        />
        <RiskyButton
          // Cümle yanlışken düğme açılmaz; `canDelete` false iken de (sahiplenilen sunucular).
          disabled={
            pending || !phraseMatches || reauthToken === null || preflight?.canDelete !== true
          }
          label={t("settings.block.deleteAccount.submit")}
          onClick={destroy}
          testId="settings-delete-account-submit"
          tone="danger"
        />
      </RiskyFooter>
    </RiskyGrid>
  );
}
