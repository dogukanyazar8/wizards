"use client";

import React, { useEffect, useMemo, useState } from "react";
import { create as createQrCode } from "qrcode";

import { useI18n } from "@/components/providers/locale-provider";
import {
  RiskyButton,
  RiskyField,
  RiskyFooter,
  RiskyGrid,
  RiskyMessage,
} from "@/components/settings/risky/risky-field";
import {
  beginTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
} from "@/lib/account/actions";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * İki aşamalı doğrulama bloğu (`s1`) — SPEC-AYARLAR §5.1, Ş7 §4.
 *
 * **QR istemcide üretilir.** Sunucu `otpauth://` URI'si ve dörtlü gruplanmış manuel anahtar
 * gönderir, resim göndermez (Ş3 §1.3): bir data-URL görüntü, aynı sırrı ikinci bir biçimde daha
 * ağdan geçirmek demekti. Matris burada `qrcode`'un `create`'iyle çıkarılıp `<rect>` olarak
 * çizilir — tuval yok, `innerHTML` yok.
 *
 * Kapatma **reauth** ister: hesap parolası **ve** canlı ikinci faktör (Ş3 §4 sapma 2).
 */

const { twoFactorQr } = SETTINGS_METRICS.blocks;

/** SPEC §5.1 — altı haneli kod. */
const CODE_LENGTH = 6;

export type TwoFactorBlockProps = {
  readonly enabled: boolean;
  readonly onChanged: () => void;
  readonly onClose: () => void;
};

type SetupState = { manualEntryKey: string; otpauthUri: string } | null;

export function TwoFactorQr({ label, uri }: { readonly label: string; readonly uri: string }) {
  const matrix = useMemo(() => {
    try {
      const { modules } = createQrCode(uri, { errorCorrectionLevel: "M" });
      return { data: modules.data, size: modules.size };
    } catch {
      return null;
    }
  }, [uri]);

  if (!matrix) {
    return null;
  }

  const cells: React.ReactNode[] = [];

  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.data[row * matrix.size + column]) {
        cells.push(<rect height={1} key={`${row}-${column}`} width={1} x={column} y={row} />);
      }
    }
  }

  return (
    <div
      className="grid shrink-0 place-items-center"
      data-testid="settings-two-factor-qr"
      style={{
        // QR kontrastı okuyucunun temasına bırakılamaz: kamera siyah/beyaz arıyor.
        background: "#fff",
        borderRadius: pxToRem(twoFactorQr.radius),
        height: pxToRem(twoFactorQr.size),
        width: pxToRem(twoFactorQr.size),
      }}
    >
      <svg
        aria-label={label}
        role="img"
        style={{ height: pxToRem(twoFactorQr.size - 24), width: pxToRem(twoFactorQr.size - 24) }}
        viewBox={`0 0 ${matrix.size} ${matrix.size}`}
      >
        <g fill="#111">{cells}</g>
      </svg>
    </div>
  );
}

export function TwoFactorBlock({ enabled, onChanged, onClose }: TwoFactorBlockProps) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<SetupState>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (enabled) return;

    let active = true;

    void beginTwoFactorSetupAction().then((result) => {
      if (!active) return;

      if (result.success) {
        setSetup({ manualEntryKey: result.manualEntryKey, otpauthUri: result.otpauthUri });
        return;
      }

      setErrorKey(result.error);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  const confirm = () => {
    if (pending) return;

    setPending(true);
    setErrorKey(null);

    void confirmTwoFactorSetupAction(code)
      .then((result) => {
        if (result.success) {
          setCode("");
          onChanged();
          onClose();
          return;
        }

        setErrorKey(result.error);
      })
      .finally(() => setPending(false));
  };

  const disable = () => {
    if (pending) return;

    setPending(true);
    setErrorKey(null);

    void disableTwoFactorAction({ code, password })
      .then((result) => {
        if (result.success) {
          setCode("");
          setPassword("");
          onChanged();
          onClose();
          return;
        }

        setErrorKey(result.error);
      })
      .finally(() => setPending(false));
  };

  if (enabled) {
    return (
      <RiskyGrid>
        <RiskyMessage
          testId="settings-two-factor-disable-note"
          text={t("settings.account.twoFactor.disableDescription")}
          tone="danger"
        />
        <RiskyField
          autoComplete="current-password"
          label={t("settings.account.twoFactor.passwordPlaceholder")}
          onChange={setPassword}
          testId="settings-two-factor-password"
          type="password"
          value={password}
        />
        <RiskyField
          inputMode="numeric"
          label={t("settings.account.twoFactor.confirmLabel")}
          maxLength={CODE_LENGTH}
          onChange={setCode}
          testId="settings-two-factor-code"
          value={code}
        />
        {errorKey ? (
          <RiskyMessage testId="settings-two-factor-error" text={t(errorKey)} tone="danger" />
        ) : null}
        <RiskyFooter help={t("settings.block.twoFactor.reauthHelp")}>
          <RiskyButton
            label={t("settings.block.password.cancel")}
            onClick={onClose}
            testId="settings-two-factor-cancel"
          />
          <RiskyButton
            disabled={pending || password.length === 0 || code.length < CODE_LENGTH}
            label={t("settings.account.twoFactor.disableCta")}
            onClick={disable}
            testId="settings-two-factor-disable"
            tone="danger"
          />
        </RiskyFooter>
      </RiskyGrid>
    );
  }

  return (
    <div className="flex" style={{ gap: pxToRem(16) }}>
      {setup ? (
        <TwoFactorQr label={t("settings.account.twoFactor.qrAlt")} uri={setup.otpauthUri} />
      ) : (
        <div
          aria-busy="true"
          aria-label={t("settings.control.block.loading")}
          className="shrink-0 motion-safe:animate-pulse"
          role="status"
          style={{
            background: `hsl(var(--surface-soft) / ${SETTINGS_METRICS.body.skeletonSurfaceAlpha})`,
            borderRadius: pxToRem(twoFactorQr.radius),
            height: pxToRem(twoFactorQr.size),
            width: pxToRem(twoFactorQr.size),
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: pxToRem(10) }}>
        <p
          style={{
            color: "hsl(var(--text-secondary))",
            fontSize: pxToRem(11.5),
            lineHeight: 1.5,
          }}
        >
          {t("settings.block.twoFactor.intro")}
        </p>

        <div
          className="flex items-center"
          style={{
            background: "hsl(var(--surface-base))",
            border: `${hairline()} solid hsl(var(--border) / 0.75)`,
            borderRadius: pxToRem(10),
            gap: pxToRem(8),
            padding: `${pxToRem(8)} ${pxToRem(11)}`,
          }}
        >
          <span
            aria-label={t("settings.account.twoFactor.manualKey")}
            className="min-w-0 flex-1 truncate"
            data-testid="settings-two-factor-manual-key"
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(12),
              fontWeight: 600,
              letterSpacing: "0.08em",
              lineHeight: 1,
            }}
          >
            {setup?.manualEntryKey ?? ""}
          </span>
          <button
            className="shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
            data-testid="settings-two-factor-copy"
            disabled={!setup}
            onClick={() => {
              if (!setup) return;

              void navigator.clipboard?.writeText(setup.manualEntryKey).then(() => setCopied(true));
            }}
            style={{
              background: "transparent",
              border: `${hairline()} solid hsl(var(--border) / 0.75)`,
              borderRadius: pxToRem(7),
              color: "hsl(var(--text-secondary))",
              fontSize: pxToRem(10.5),
              fontWeight: 600,
              height: pxToRem(25),
              lineHeight: 1,
              padding: `0 ${pxToRem(9)}`,
            }}
            type="button"
          >
            {copied ? t("settings.block.twoFactor.copied") : t("settings.block.twoFactor.copy")}
          </button>
        </div>

        <div className="flex items-center" style={{ gap: pxToRem(9) }}>
          <div className="min-w-0 flex-1">
            <RiskyField
              inputMode="numeric"
              label={t("settings.account.twoFactor.confirmLabel")}
              maxLength={CODE_LENGTH}
              onChange={setCode}
              placeholder={t("settings.account.twoFactor.codePlaceholder")}
              span="full"
              testId="settings-two-factor-setup-code"
              value={code}
            />
          </div>
          <RiskyButton
            disabled={pending || !setup || code.length < CODE_LENGTH}
            label={t("settings.block.twoFactor.confirm")}
            onClick={confirm}
            testId="settings-two-factor-confirm"
            tone="primary"
          />
        </div>

        {errorKey ? (
          <RiskyMessage testId="settings-two-factor-error" text={t(errorKey)} tone="danger" />
        ) : null}
      </div>
    </div>
  );
}
