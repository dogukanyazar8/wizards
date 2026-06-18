"use client";

import {
  ImagePlus,
  LoaderCircle,
  Move,
  RotateCcw,
  Trash2,
  Upload,
  ZoomIn,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import {
  updateAccountAvatarAction,
  type AccountSettingsState,
  type UpdateAccountAvatarResult,
} from "@/lib/account/actions";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";

const AVATAR_CROP_SIZE = 320;
const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type CropDraft = {
  fileName: string;
  mimeType: string;
  naturalHeight: number;
  naturalWidth: number;
  offsetX: number;
  offsetY: number;
  sourceUrl: string;
  zoom: number;
};

type DragState = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

type UploadedAvatarResponse = {
  serverData?: {
    url?: unknown;
  };
  url?: unknown;
};

type ProfileAvatarFieldProps = {
  account: AccountSettingsState;
  onAvatarUpdated: (account: AccountSettingsState) => void;
  uploadthingEnabled: boolean;
};

function buildAvatarFallback(account: AccountSettingsState) {
  return account.displayName?.trim() || account.username;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCropGeometry(draft: CropDraft, zoom = draft.zoom) {
  const baseScale = Math.max(
    AVATAR_CROP_SIZE / draft.naturalWidth,
    AVATAR_CROP_SIZE / draft.naturalHeight,
  );
  const scaledWidth = draft.naturalWidth * baseScale * zoom;
  const scaledHeight = draft.naturalHeight * baseScale * zoom;

  return {
    maxOffsetX: Math.max(0, (scaledWidth - AVATAR_CROP_SIZE) / 2),
    maxOffsetY: Math.max(0, (scaledHeight - AVATAR_CROP_SIZE) / 2),
    scaledHeight,
    scaledWidth,
  };
}

function clampDraftOffset(draft: CropDraft, offsetX: number, offsetY: number, zoom = draft.zoom) {
  const geometry = getCropGeometry(draft, zoom);

  return {
    offsetX: clamp(offsetX, -geometry.maxOffsetX, geometry.maxOffsetX),
    offsetY: clamp(offsetY, -geometry.maxOffsetY, geometry.maxOffsetY),
  };
}

function getUploadUrl(result: unknown[] | undefined) {
  const uploaded = result?.[0] as UploadedAvatarResponse | undefined;
  const serverUrl = uploaded?.serverData?.url;
  const fallbackUrl = uploaded?.url;

  return typeof serverUrl === "string"
    ? serverUrl
    : typeof fallbackUrl === "string"
      ? fallbackUrl
      : null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Avatar image could not be loaded."));
    image.src = src;
  });
}

async function createCroppedAvatarFile(draft: CropDraft) {
  const image = await loadImage(draft.sourceUrl);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Avatar crop could not be prepared.");
  }

  const geometry = getCropGeometry(draft);
  const scale = AVATAR_OUTPUT_SIZE / AVATAR_CROP_SIZE;
  const drawX = (AVATAR_CROP_SIZE - geometry.scaledWidth) / 2 + draft.offsetX;
  const drawY = (AVATAR_CROP_SIZE - geometry.scaledHeight) / 2 + draft.offsetY;

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  context.drawImage(
    image,
    drawX * scale,
    drawY * scale,
    geometry.scaledWidth * scale,
    geometry.scaledHeight * scale,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("Avatar crop could not be exported."));
          return;
        }

        resolve(nextBlob);
      },
      "image/webp",
      0.92,
    );
  });

  const safeBaseName = draft.fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-");
  return new File([blob], `${safeBaseName || "whispr-avatar"}.webp`, {
    type: "image/webp",
  });
}

export function ProfileAvatarField({
  account,
  onAvatarUpdated,
  uploadthingEnabled,
}: ProfileAvatarFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cropDraftRef = useRef<CropDraft | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const isBusy = isSaving;

  const closeCropModal = useCallback(() => {
    setCropDraft((current) => {
      if (current) {
        URL.revokeObjectURL(current.sourceUrl);
      }
      return null;
    });
    dragRef.current = null;
    setProgress(0);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    cropDraftRef.current = cropDraft;
  }, [cropDraft]);

  useEffect(
    () => () => {
      if (cropDraftRef.current) {
        URL.revokeObjectURL(cropDraftRef.current.sourceUrl);
      }
    },
    [],
  );

  const publishAccountUpdate = (nextAccount: AccountSettingsState) => {
    onAvatarUpdated(nextAccount);
    window.dispatchEvent(
      new CustomEvent("whispr:account-updated", {
        detail: nextAccount,
      }),
    );
  };

  const { startUpload } = useUploadThing("profileAvatarUploader", {
    onUploadError: (uploadError) => {
      setError(uploadError.message);
      setProgress(0);
    },
    onUploadProgress: (nextProgress) => {
      setProgress(nextProgress);
    },
  });

  const handleFileChange = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setError(null);

    if (!AVATAR_CONTENT_TYPES.has(file.type)) {
      setError(t("settings.account.avatar.errors.type"));
      return;
    }

    if (file.size > AVATAR_MAX_BYTES) {
      setError(t("settings.account.avatar.errors.size"));
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(sourceUrl);
      setCropDraft((current) => {
        if (current) {
          URL.revokeObjectURL(current.sourceUrl);
        }

        return {
          fileName: file.name,
          mimeType: file.type,
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          offsetX: 0,
          offsetY: 0,
          sourceUrl,
          zoom: 1,
        };
      });
    } catch {
      URL.revokeObjectURL(sourceUrl);
      setError(t("settings.account.avatar.errors.load"));
    }
  };

  const updateCropOffset = (nextOffsetX: number, nextOffsetY: number) => {
    setCropDraft((current) => {
      if (!current) {
        return current;
      }

      const nextOffset = clampDraftOffset(current, nextOffsetX, nextOffsetY);
      return {
        ...current,
        ...nextOffset,
      };
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropDraft) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      originX: cropDraft.offsetX,
      originY: cropDraft.offsetY,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    updateCropOffset(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY,
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handleZoomChange = (nextZoom: number) => {
    setCropDraft((current) => {
      if (!current) {
        return current;
      }

      const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const nextOffset = clampDraftOffset(current, current.offsetX, current.offsetY, zoom);
      return {
        ...current,
        ...nextOffset,
        zoom,
      };
    });
  };

  const saveCroppedAvatar = async () => {
    if (!cropDraft || isBusy) {
      return;
    }

    if (!uploadthingEnabled) {
      setError(t("settings.account.avatar.errors.uploadsDisabled"));
      return;
    }

    setIsSaving(true);
    setError(null);
    setProgress(5);

    try {
      const avatarFile = await createCroppedAvatarFile(cropDraft);
      const uploadResult = await startUpload([avatarFile]);
      const avatarUrl = getUploadUrl(uploadResult);

      if (!avatarUrl) {
        throw new Error(t("settings.account.avatar.errors.upload"));
      }

      const result = (await updateAccountAvatarAction(avatarUrl)) as UpdateAccountAvatarResult;
      if (!result.success || !result.user) {
        throw new Error(t(result.error ?? "settings.account.avatar.errors.save"));
      }

      publishAccountUpdate(result.user);
      closeCropModal();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("settings.account.avatar.errors.save"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const clearAvatar = async () => {
    if (isBusy) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = (await updateAccountAvatarAction(null)) as UpdateAccountAvatarResult;
      if (!result.success || !result.user) {
        throw new Error(t(result.error ?? "settings.account.avatar.errors.save"));
      }

      publishAccountUpdate(result.user);
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : t("settings.account.avatar.errors.save"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const imageStyle = cropDraft
    ? (() => {
        const geometry = getCropGeometry(cropDraft);
        return {
          height: `${geometry.scaledHeight}px`,
          transform: `translate(-50%, -50%) translate(${cropDraft.offsetX}px, ${cropDraft.offsetY}px)`,
          width: `${geometry.scaledWidth}px`,
        };
      })()
    : undefined;

  return (
    <div className="space-y-3" data-testid="profile-avatar-field">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar
            alt={account.displayName ?? account.username}
            className="h-24 w-24 rounded-full border-[hsl(var(--primary)/0.22)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.22),hsl(var(--surface-soft)/0.96))] text-xl shadow-[0_18px_46px_hsl(var(--primary)/0.14)] ring-4 ring-[hsl(var(--primary)/0.08)]"
            fallback={buildAvatarFallback(account)}
            src={account.avatarUrl}
          />
          <span className="absolute bottom-0.5 right-0.5 grid h-9 w-9 place-items-center rounded-xl border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--surface)/0.96)] text-[hsl(var(--primary))] shadow-[0_12px_30px_hsl(var(--primary)/0.16)]">
            <ImagePlus className="h-3.5 w-3.5" />
          </span>
        </div>

        {!uploadthingEnabled ? (
          <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold leading-4 text-amber-600">
            {t("settings.account.avatar.uploadsDisabled")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold leading-4 text-rose-600">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <input
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            void handleFileChange(event.target.files?.[0]);
          }}
          ref={inputRef}
          type="file"
        />

        <button
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.12)] px-3 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="profile-avatar-choose"
          disabled={isBusy || !uploadthingEnabled}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {t("settings.account.avatar.choose")}
        </button>

        <button
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.58)] px-3 text-xs font-semibold text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.86)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-55"
          data-testid="profile-avatar-clear"
          disabled={isBusy || !account.avatarUrl}
          onClick={() => {
            void clearAvatar();
          }}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
          {t("settings.account.avatar.remove")}
        </button>
      </div>

      <Modal
        className="max-w-2xl"
        closeLabel={t("common.close")}
        description={t("settings.account.avatar.cropDescription")}
        onClose={closeCropModal}
        open={Boolean(cropDraft)}
        title={t("settings.account.avatar.cropTitle")}
      >
        {cropDraft ? (
          <div className="space-y-4" data-testid="profile-avatar-crop-modal">
            <div className="flex flex-col items-center gap-3 lg:flex-row lg:items-start">
              <div
                className={cn(
                  "relative aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-[34px] border border-[hsl(var(--primary)/0.28)] bg-[linear-gradient(135deg,hsl(var(--surface-soft)/0.86),hsl(var(--surface-card)/0.98))] shadow-[0_22px_60px_hsl(var(--shadow-color)/0.16)]",
                  isBusy ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
                )}
                onPointerCancel={handlePointerUp}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                role="presentation"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  draggable={false}
                  src={cropDraft.sourceUrl}
                  style={imageStyle}
                />
                <div className="pointer-events-none absolute inset-0 rounded-[34px] ring-1 ring-inset ring-white/40" />
                <div className="pointer-events-none absolute inset-4 rounded-[28px] border border-dashed border-white/55 shadow-[inset_0_0_0_999px_hsl(var(--background)/0.08)]" />
                <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur-xl">
                  <Move className="h-3.5 w-3.5" />
                  {t("settings.account.avatar.dragHint")}
                </div>
              </div>

              <div className="w-full min-w-0 flex-1 space-y-3">
                <div className="rounded-[18px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.35)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ZoomIn className="h-4 w-4 text-app-muted" />
                      <p className="text-sm font-semibold text-app-foreground">
                        {t("settings.account.avatar.zoom")}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-app-soft">
                      {Math.round(cropDraft.zoom * 100)}%
                    </span>
                  </div>
                  <input
                    aria-label={t("settings.account.avatar.zoom")}
                    className="mt-3 w-full accent-[hsl(var(--primary))]"
                    disabled={isBusy}
                    max={MAX_ZOOM}
                    min={MIN_ZOOM}
                    onChange={(event) => handleZoomChange(Number(event.target.value))}
                    step={0.01}
                    type="range"
                    value={cropDraft.zoom}
                  />
                </div>

                <button
                  className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.58)] px-3 text-xs font-semibold text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.86)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={isBusy}
                  onClick={() =>
                    setCropDraft((current) =>
                      current
                        ? {
                            ...current,
                            offsetX: 0,
                            offsetY: 0,
                            zoom: 1,
                          }
                        : current,
                    )
                  }
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("settings.account.avatar.resetCrop")}
                </button>

                <div className="rounded-[18px] border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] p-3 text-xs leading-5 text-app-muted">
                  {t("settings.account.avatar.liveUpdateNote")}
                </div>
              </div>
            </div>

            {progress > 0 ? (
              <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--surface-soft)/0.72)]">
                <div
                  className="h-full rounded-full bg-[hsl(var(--primary))] transition-all"
                  style={{ width: `${clamp(progress, 8, 100)}%` }}
                />
              </div>
            ) : null}

            {error ? <p className="text-sm font-medium text-app-danger">{error}</p> : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.54)] px-4 text-xs font-semibold text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.86)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                disabled={isBusy}
                onClick={closeCropModal}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-semibold text-white shadow-[0_14px_30px_hsl(var(--primary)/0.2)] transition hover:bg-[hsl(var(--primary)/0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-70"
                data-testid="profile-avatar-save-crop"
                disabled={isBusy}
                onClick={() => {
                  void saveCroppedAvatar();
                }}
                type="button"
              >
                {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isBusy
                  ? t("settings.account.avatar.uploading", { progress })
                  : t("settings.account.avatar.save")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
