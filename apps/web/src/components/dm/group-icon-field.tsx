"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { useUploadThing } from "@/lib/uploadthing";

type GroupIconFieldProps = {
  /**
   * Null while the group is still being created: the uploader authorizes against
   * an existing group when it has one, and treats a null id as "nothing to own
   * yet" — the URL it returns stays inert until POST /dm/groups accepts it.
   */
  conversationId: string | null;
  label: string;
  onChange: (value: string | null) => void;
  value?: string | null;
};

/**
 * Faz 7 kapanış. The web half of the mobile group-photo flow, on the same
 * `groupIconUploader` route: one uploader, two clients, no media-claim record
 * (see task-12-report.md).
 */
export function GroupIconField({ conversationId, label, onChange, value }: GroupIconFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!localPreview?.startsWith("blob:")) {
      return;
    }

    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const { isUploading, startUpload } = useUploadThing("groupIconUploader", {
    onClientUploadComplete: (result) => {
      const nextUrl = result[0]?.serverData?.url ?? result[0]?.url ?? null;
      setLocalPreview(null);
      setUploadError(null);
      // Only an https URL is worth handing on; the create and update schemas
      // reject anything else, and a rejected body is a worse error than none.
      onChange(nextUrl?.startsWith("https://") ? nextUrl : null);
    },
    onUploadError: (error) => {
      setUploadError(error.message);
    },
  });

  return (
    <div className="flex items-center gap-3" data-testid="group-icon-field">
      <Avatar
        alt={label}
        className="h-12 w-12"
        fallback={label}
        src={localPreview ?? value ?? null}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              setLocalPreview(URL.createObjectURL(file));
              setUploadError(null);
              await startUpload([file], { conversationId });
            }}
            ref={inputRef}
            type="file"
          />
          <button
            className="inline-flex h-9 items-center gap-2 rounded-2xl bg-[hsl(var(--surface-soft)/0.6)] px-3 text-xs font-bold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.85)] disabled:cursor-not-allowed disabled:opacity-55"
            data-testid="group-icon-choose"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {isUploading ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            {t("dm.group.photoAction")}
          </button>
          {value || localPreview ? (
            <button
              aria-label={t("dm.group.photoClearAction")}
              className="inline-flex h-9 items-center gap-2 rounded-2xl bg-[hsl(var(--surface-soft)/0.4)] px-3 text-xs font-bold text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.7)]"
              data-testid="group-icon-clear"
              onClick={() => {
                setLocalPreview(null);
                setUploadError(null);
                onChange(null);
              }}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {uploadError ? (
          <p className="text-xs font-semibold text-[hsl(var(--danger))]">{uploadError}</p>
        ) : null}
      </div>
    </div>
  );
}
