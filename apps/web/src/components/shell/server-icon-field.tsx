"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useUploadThing } from "@/lib/uploadthing";

type ServerIconFieldProps = {
  label: string;
  uploadthingEnabled: boolean;
  value?: string | null;
  onChange: (value: string | null) => void;
};

export function ServerIconField({
  label,
  onChange,
  uploadthingEnabled,
  value,
}: ServerIconFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(value ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLocalPreview(value ?? null);
  }, [value]);

  const { isUploading, startUpload } = useUploadThing("serverIconUploader", {
    onClientUploadComplete: (result) => {
      const nextUrl = result[0]?.serverData?.url ?? result[0]?.url ?? null;
      setProgress(100);
      onChange(nextUrl);
      setUploadError(null);
    },
    onUploadError: (error) => {
      setUploadError(error.message);
      setProgress(0);
    },
    onUploadProgress: (nextProgress) => {
      setProgress(nextProgress);
    },
  });

  return (
    <div className="app-panel rounded-[24px] border p-4">
      <div className="flex items-center gap-4">
        <Avatar
          alt={`${label} icon`}
          className="h-16 w-16 rounded-[22px]"
          fallback={label.slice(0, 2).toUpperCase()}
          src={localPreview}
        />

        <div className="min-w-0 flex-1">
          <p className="text-app-foreground text-sm font-semibold">Server Icon</p>
          <p className="text-app-muted mt-1 text-xs leading-5">
            Upload a square image for the rail. A live preview keeps the crop feeling intentional.
          </p>
          {uploadError ? <p className="mt-2 text-xs text-rose-300">{uploadError}</p> : null}
          {!uploadthingEnabled ? (
            <p className="mt-2 text-xs text-amber-300">
              Add `UPLOADTHING_TOKEN` to enable cloud uploads.
            </p>
          ) : null}
          {isUploading ? (
            <p className="mt-2 text-xs text-sky-300">Uploading icon... {progress}%</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];

            if (!file) {
              return;
            }

            const previewUrl = URL.createObjectURL(file);
            setLocalPreview(previewUrl);
            setUploadError(null);

            if (!uploadthingEnabled) {
              return;
            }

            await startUpload([file]);
            window.setTimeout(() => URL.revokeObjectURL(previewUrl), 2_000);
          }}
          ref={inputRef}
          type="file"
        />

        <button
          className="app-panel-soft text-app-foreground inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Choose Image
        </button>

        <button
          className="app-panel-soft text-app-muted inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition hover:opacity-90"
          onClick={() => {
            setLocalPreview(null);
            setUploadError(null);
            onChange(null);
          }}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  );
}
