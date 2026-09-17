"use client";

import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import {
  MOBILE_PROFILE_BANNER_COLORS,
  MobileMediaUploadCompletionResponseSchema,
} from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import {
  claimAccountBannerAction,
  getAccountBannerAction,
  updateAccountBannerAction,
} from "@/lib/account/banner-actions";
import type { AccountBanner, AccountBannerResult } from "@/lib/account/banner";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { useUploadThing } from "@/lib/uploadthing";
import { useSettingsSaveReporter } from "@/components/settings/settings-ladder";

const { hero } = SETTINGS_METRICS.blocks;
const EMPTY_BANNER: AccountBanner = {
  bannerUrl: null,
  bannerColor: null,
  bannerOffsetX: null,
  bannerOffsetY: null,
};
const buttonClass =
  "rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-white transition-[filter] hover:brightness-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55";

function bannerStyle(banner: AccountBanner): CSSProperties {
  return {
    background: banner.bannerUrl
      ? `url(${JSON.stringify(banner.bannerUrl)}) ${(banner.bannerOffsetX ?? 0.5) * 100}% ${(banner.bannerOffsetY ?? 0.5) * 100}% / cover no-repeat`
      : (banner.bannerColor ??
        "linear-gradient(120deg,hsl(var(--primary)/.45),hsl(var(--primary)/.14) 62%,hsl(var(--primary)/.3))"),
  };
}

export function ProfileBannerField({
  accountId,
  uploadthingEnabled,
}: {
  accountId: string | undefined;
  uploadthingEnabled: boolean;
}) {
  const { t } = useI18n();
  const reportSave = useSettingsSaveReporter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountBanner>(EMPTY_BANNER);
  const queryKey = ["account-banner", accountId] as const;
  const bannerQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getAccountBannerAction();
      if (!result.success) throw new Error(result.error);
      return result.banner;
    },
    enabled: Boolean(accountId) && !busy,
    staleTime: 0,
    retry: false,
  });
  const banner = bannerQuery.data ?? EMPTY_BANNER;
  const ready = Boolean(accountId) && Boolean(bannerQuery.data);
  const loadFailed = bannerQuery.isError;
  const { startUpload } = useUploadThing("profileBannerUploader", {
    onUploadProgress: (value) => {
      if (mountedRef.current) setProgress(value);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(next: File | null) {
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  function close() {
    if (busyRef.current) return;
    setOpen(false);
    selectFile(null);
    setError(null);
  }

  function edit() {
    setDraft(banner);
    selectFile(null);
    setError(null);
    setOpen(true);
  }

  async function mutate(operation: () => Promise<AccountBannerResult>) {
    if (busyRef.current || !ready) return;
    busyRef.current = true;
    setBusy(true);
    reportSave("saving");
    setError(null);
    setProgress(0);
    try {
      // A pre-existing read must not overwrite the result of this write.
      await queryClient.cancelQueries({ queryKey });
      const result = await operation();
      if (!result.success) {
        reportSave("error");
        if (mountedRef.current) setError(result.error);
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      queryClient.setQueryData(queryKey, result.banner);
      reportSave("saved");
      void queryClient.invalidateQueries({ queryKey: ["user-profile", accountId] });
      if (mountedRef.current) {
        setOpen(false);
        selectFile(null);
      }
    } catch {
      reportSave("error");
      if (mountedRef.current) setError("settings.account.banner.errors.save");
      // The response may have been lost after the server committed the change.
      void queryClient.invalidateQueries({ queryKey });
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  function save() {
    void mutate(async () => {
      if (file) {
        try {
          const uploads = await startUpload([file]);
          const completion = MobileMediaUploadCompletionResponseSchema.safeParse(
            uploads?.[0]?.serverData,
          );
          if (!completion.success || completion.data.purpose !== "profile-banner") {
            return { success: false, error: "settings.account.banner.errors.upload" };
          }
          return await claimAccountBannerAction(completion.data.claimId);
        } catch {
          return { success: false, error: "settings.account.banner.errors.upload" };
        }
      }
      if (draft.bannerUrl) {
        return updateAccountBannerAction({
          operation: "position",
          expectedUrl: draft.bannerUrl,
          offsetX: draft.bannerOffsetX ?? 0.5,
          offsetY: draft.bannerOffsetY ?? 0.5,
        });
      }
      return updateAccountBannerAction({ operation: "color", color: draft.bannerColor });
    });
  }

  function remove() {
    const expectedUrl = open ? draft.bannerUrl : banner.bannerUrl;
    if (!expectedUrl) return;
    void mutate(() => updateAccountBannerAction({ operation: "remove", expectedUrl }));
  }

  const feedback = error ?? (loadFailed ? "settings.account.banner.errors.load" : null);

  return (
    <>
      <div
        className="relative"
        style={{ ...bannerStyle(banner), height: pxToRem(hero.bannerHeight) }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0"
          style={{
            background:
              "linear-gradient(180deg,hsl(var(--surface-card)/0),hsl(var(--surface-card)/.55))",
            height: pxToRem(hero.bannerFadeHeight),
          }}
        />
        <div
          className="absolute flex"
          style={{
            gap: pxToRem(hero.bannerButtonGap),
            right: pxToRem(hero.bannerButtonRight),
            top: pxToRem(hero.bannerButtonTop),
          }}
        >
          <button
            className={`${buttonClass} flex items-center gap-2`}
            data-testid="settings-hero-change-banner"
            disabled={!ready || busy}
            onClick={edit}
            style={{
              borderRadius: pxToRem(hero.bannerButtonRadius),
              fontSize: pxToRem(11),
              height: pxToRem(hero.bannerButtonHeight),
              padding: `0 ${pxToRem(hero.bannerButtonPaddingX)}`,
            }}
            type="button"
          >
            <Camera aria-hidden="true" size={12} />
            {t("settings.block.hero.changeBanner")}
          </button>
          <button
            aria-label={t("settings.block.hero.removeBanner")}
            className={`${buttonClass} grid place-items-center`}
            data-testid="settings-hero-remove-banner"
            disabled={!ready || busy || !banner.bannerUrl}
            onClick={remove}
            style={{
              borderRadius: pxToRem(hero.bannerButtonRadius),
              height: pxToRem(hero.bannerRemoveSize),
              width: pxToRem(hero.bannerRemoveSize),
              padding: 0,
            }}
            type="button"
          >
            <X aria-hidden="true" size={13} />
          </button>
        </div>
        {!open && feedback ? (
          <div className="absolute bottom-3 right-3 max-w-[65%] rounded-lg bg-[hsl(var(--surface-card)/.95)] px-3 py-2 text-xs">
            <p role="alert">{t(feedback)}</p>
            {loadFailed ? (
              <button
                className="underline"
                disabled={bannerQuery.isFetching}
                onClick={() => {
                  void bannerQuery.refetch();
                }}
                type="button"
              >
                {t("settings.account.banner.retry")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <Modal
        overlayClassName="z-[110]"
        open={open}
        onClose={close}
        title={t("settings.account.banner.title")}
        closeLabel={t("common.close")}
        className="max-w-xl"
      >
        <div className="space-y-4" data-testid="profile-banner-editor">
          <div
            aria-label={t("settings.account.banner.preview")}
            className="overflow-hidden rounded-xl"
            role="img"
            style={{
              ...bannerStyle(file ? { ...EMPTY_BANNER, bannerUrl: previewUrl } : draft),
              height: pxToRem(hero.bannerHeight),
            }}
          />
          <p className="text-sm text-[hsl(var(--text-muted))]">
            {t("settings.account.banner.help")}
          </p>
          <input
            ref={inputRef}
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("settings.account.banner.choose")}
            className="hidden"
            disabled={busy || !uploadthingEnabled}
            type="file"
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!selected || busyRef.current) return;
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
                selected.size === 0 ||
                selected.size > 4 * 1024 * 1024
              ) {
                selectFile(null);
                setError("settings.account.banner.errors.file");
                return;
              }
              setError(null);
              selectFile(selected);
            }}
          />
          <button
            className={buttonClass}
            disabled={busy || !uploadthingEnabled}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {t("settings.account.banner.choose")}
          </button>
          {!uploadthingEnabled ? (
            <p className="text-sm" role="status">
              {t("settings.account.banner.errors.unavailable")}
            </p>
          ) : null}
          {file ? (
            <p className="break-all text-sm">{file.name}</p>
          ) : draft.bannerUrl ? (
            <fieldset className="space-y-3" disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">
                {t("settings.account.banner.position")}
              </legend>
              {(["X", "Y"] as const).map((axis) => (
                <label className="flex items-center gap-3 text-sm" key={axis}>
                  <span>{t(`settings.account.banner.position${axis}`)}</span>
                  <input
                    className="min-w-0 flex-1"
                    max={100}
                    min={0}
                    step={1}
                    type="range"
                    value={Math.round((draft[`bannerOffset${axis}`] ?? 0.5) * 100)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [`bannerOffset${axis}`]: Number(event.target.value) / 100,
                      })
                    }
                  />
                  <output>{Math.round((draft[`bannerOffset${axis}`] ?? 0.5) * 100)}%</output>
                </label>
              ))}
              <button
                className={buttonClass}
                onClick={() => setDraft({ ...draft, bannerOffsetX: 0.5, bannerOffsetY: 0.5 })}
                type="button"
              >
                {t("settings.account.banner.center")}
              </button>
            </fieldset>
          ) : (
            <fieldset className="flex flex-wrap gap-2" disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">
                {t("settings.account.banner.color")}
              </legend>
              {[null, ...MOBILE_PROFILE_BANNER_COLORS].map((color, index) => (
                <button
                  aria-label={t(`settings.account.banner.color${index}`)}
                  aria-pressed={draft.bannerColor === color}
                  className="h-9 w-9 rounded-full border-2 border-[hsl(var(--border))] aria-pressed:ring-2 aria-pressed:ring-[hsl(var(--ring))] aria-pressed:ring-offset-2"
                  key={color ?? "default"}
                  onClick={() => setDraft({ ...draft, bannerColor: color })}
                  style={bannerStyle({ ...EMPTY_BANNER, bannerColor: color })}
                  type="button"
                />
              ))}
            </fieldset>
          )}
          {error ? (
            <p className="text-sm text-[hsl(var(--danger))]" role="alert">
              {t(error)}
            </p>
          ) : null}
          {busy && file ? (
            <p className="text-sm" role="status">
              {t("settings.account.banner.uploading", { progress })}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {draft.bannerUrl && !file ? (
              <button className={buttonClass} disabled={busy} onClick={remove} type="button">
                {t("settings.block.hero.removeBanner")}
              </button>
            ) : null}
            <button className={buttonClass} disabled={busy} onClick={close} type="button">
              {t("common.cancel")}
            </button>
            <button
              className={buttonClass}
              disabled={
                busy ||
                error === "settings.account.banner.errors.file" ||
                (Boolean(file) && !uploadthingEnabled)
              }
              onClick={save}
              type="button"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
