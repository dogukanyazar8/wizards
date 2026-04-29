"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { Download, ExternalLink, FileText, ImageIcon } from "lucide-react";
import type { MessageAttachment } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import {
  isMessageGifContentType,
  isMessageImageContentType,
} from "@/lib/messages/attachment-rules";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
};

function gridClassName(count: number) {
  if (count <= 1) {
    return "grid-cols-1 max-w-[28rem]";
  }

  if (count === 2) {
    return "grid-cols-2 max-w-[34rem]";
  }

  return "grid-cols-2 sm:grid-cols-3 max-w-[38rem]";
}

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function extensionFromFilename(filename: string) {
  const extension = filename.split(".").pop()?.trim();
  return extension && extension !== filename ? extension.toUpperCase() : "FILE";
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { t } = useI18n();
  const [selectedImage, setSelectedImage] = useState<MessageAttachment | null>(null);
  const imageAttachments = useMemo(
    () => attachments.filter((attachment) => isMessageImageContentType(attachment.contentType)),
    [attachments],
  );
  const fileAttachments = useMemo(
    () => attachments.filter((attachment) => !isMessageImageContentType(attachment.contentType)),
    [attachments],
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      {imageAttachments.length > 0 ? (
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
                {isMessageGifContentType(attachment.contentType)
                  ? t("chat.attachments.gif")
                  : `${index + 1}/${imageAttachments.length}`}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {fileAttachments.length > 0 ? (
        <div className="mt-3 grid max-w-[34rem] gap-2">
          {fileAttachments.map((attachment) => (
            <a
              aria-label={t("chat.attachments.openFile", {
                filename: attachment.filename,
              })}
              className="group/file flex items-center gap-3 rounded-[22px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.34)] p-3 text-left shadow-[0_18px_38px_hsl(var(--shadow-color)/0.07)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.42)] hover:bg-[hsl(var(--surface-card)/0.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              download={attachment.filename}
              href={attachment.url}
              key={attachment.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.7)] bg-white/72 text-app-soft shadow-sm">
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-app-foreground">
                  {attachment.filename}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-app-soft">
                  <span>{extensionFromFilename(attachment.filename)}</span>
                  <span aria-hidden="true">/</span>
                  <span>{formatAttachmentSize(attachment.size)}</span>
                </span>
              </span>
              <span className="flex items-center gap-1 rounded-full border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.72)] px-2.5 py-1 text-[11px] font-semibold text-app-soft transition group-hover/file:text-app-foreground">
                <Download className="h-3.5 w-3.5" />
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </a>
          ))}
        </div>
      ) : null}

      <ImageLightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
}
