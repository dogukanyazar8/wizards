"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import type { MessageAttachment } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
};

const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function gridClassName(count: number) {
  if (count <= 1) {
    return "grid-cols-1 max-w-[28rem]";
  }

  if (count === 2) {
    return "grid-cols-2 max-w-[34rem]";
  }

  return "grid-cols-2 sm:grid-cols-3 max-w-[38rem]";
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { t } = useI18n();
  const [selectedImage, setSelectedImage] = useState<MessageAttachment | null>(null);
  const imageAttachments = useMemo(
    () => attachments.filter((attachment) => IMAGE_CONTENT_TYPES.has(attachment.contentType)),
    [attachments],
  );

  if (imageAttachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn("mt-3 grid gap-2", gridClassName(imageAttachments.length))}>
        {imageAttachments.map((attachment, index) => (
          <button
            aria-label={t("chat.attachments.openImage", {
              filename: attachment.filename,
            })}
            className={cn(
              "group/image relative overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.38)] shadow-[0_18px_38px_hsl(var(--shadow-color)/0.08)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
              imageAttachments.length === 1 ? "inline-flex max-w-full p-1" : "aspect-square",
            )}
            key={attachment.id}
            onClick={() => setSelectedImage(attachment)}
            type="button"
          >
            <img
              alt={attachment.filename}
              className={cn(
                "h-full w-full transition duration-200 group-hover/image:scale-[1.02]",
                imageAttachments.length === 1
                  ? "h-auto max-h-[24rem] max-w-full rounded-[18px] object-contain"
                  : "object-cover",
              )}
              loading="lazy"
              src={attachment.url}
            />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/82 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-sm backdrop-blur">
              <ImageIcon className="h-3 w-3" />
              {index + 1}/{imageAttachments.length}
            </span>
          </button>
        ))}
      </div>

      <ImageLightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
}
