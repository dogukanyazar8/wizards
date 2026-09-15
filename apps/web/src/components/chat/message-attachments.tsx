"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useMemo, useState } from "react";
import { useAppearancePreferences } from "@/components/providers/appearance-preference-provider";
import { Download, ExternalLink, FileText, ImageIcon, Play } from "lucide-react";
import { isVoiceMessageAttachment, type MessageAttachment } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import {
  isMessageGifContentType,
  isMessageImageContentType,
  isMessageVideoContentType,
} from "@/lib/messages/attachment-rules";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";
import { VoiceMessagePlayer } from "./voice-message-player";

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
};

type VisibleMessageAttachment = MessageAttachment & { url: string };

function hasAttachmentUrl(attachment: MessageAttachment): attachment is VisibleMessageAttachment {
  return typeof attachment.url === "string" && attachment.url.length > 0;
}

function gridClassName(count: number) {
  if (count <= 1) {
    return "grid-cols-1 w-full max-w-full sm:max-w-[26rem]";
  }

  if (count === 2) {
    return "grid-cols-2 w-full max-w-full sm:max-w-[32rem]";
  }

  return "grid-cols-2 w-full max-w-full sm:max-w-[36rem] sm:grid-cols-3";
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

function scanStatusLabelKey(attachment: MessageAttachment) {
  if (attachment.scanStatus === "INFECTED") {
    return "chat.attachments.scanBlocked";
  }

  if (attachment.scanStatus === "ERROR") {
    return "chat.attachments.scanUnavailable";
  }

  return "chat.attachments.scanPending";
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { t } = useI18n();
  const { inlineAttachmentMedia } = useAppearancePreferences();
  const [selectedImage, setSelectedImage] = useState<VisibleMessageAttachment | null>(null);
  const visibleAttachments = useMemo(() => attachments.filter(hasAttachmentUrl), [attachments]);
  const unavailableAttachments = useMemo(
    () => attachments.filter((attachment) => !hasAttachmentUrl(attachment)),
    [attachments],
  );
  const imageAttachments = useMemo(
    () =>
      inlineAttachmentMedia
        ? visibleAttachments.filter((attachment) =>
            isMessageImageContentType(attachment.contentType),
          )
        : [],
    [inlineAttachmentMedia, visibleAttachments],
  );
  /**
   * Mesajlar karar #5. Kayıttan gelen ses, eklenmiş bir ses **dosyasından**
   * ayrılır: ikisi de `audio/*`, farkı süreyi yalnız kaydın yazması. Olmasaydı
   * iki saatlik bir podcast yüklemesi, oynatıcının dolduramayacağı bir kaydırma
   * çubuğuyla sesli not gibi çizilirdi.
   */
  const voiceAttachments = useMemo(
    () => visibleAttachments.filter((attachment) => isVoiceMessageAttachment(attachment)),
    [visibleAttachments],
  );
  const fileAttachments = useMemo(
    () =>
      visibleAttachments.filter(
        (attachment) =>
          (!inlineAttachmentMedia ||
            (!isMessageImageContentType(attachment.contentType) &&
              !isMessageVideoContentType(attachment.contentType))) &&
          !isVoiceMessageAttachment(attachment),
      ),
    [inlineAttachmentMedia, visibleAttachments],
  );
  const videoAttachments = useMemo(
    () =>
      inlineAttachmentMedia
        ? visibleAttachments.filter((attachment) =>
            isMessageVideoContentType(attachment.contentType),
          )
        : [],
    [inlineAttachmentMedia, visibleAttachments],
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      {voiceAttachments.length > 0 ? (
        <div className="mt-0 flex flex-col gap-1.5">
          {voiceAttachments.map((attachment) => (
            <VoiceMessagePlayer
              durationSeconds={attachment.duration ?? null}
              key={attachment.id}
              url={attachment.url}
              waveform={attachment.waveform ?? null}
            />
          ))}
        </div>
      ) : null}

      {imageAttachments.length > 0 ? (
        <div className={cn("mt-0 grid gap-1.5", gridClassName(imageAttachments.length))}>
          {imageAttachments.map((attachment, index) => (
            <button
              aria-label={t("chat.attachments.openImage", {
                filename: attachment.filename,
              })}
              className={cn(
                "group/image relative overflow-hidden rounded-[1.125rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.38)] shadow-[0_12px_26px_hsl(var(--shadow-color)/0.06)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.42)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                imageAttachments.length === 1
                  ? "inline-flex w-full max-w-full p-1"
                  : "aspect-square",
              )}
              data-content-type={attachment.contentType}
              data-filename={attachment.filename}
              data-testid="message-image-attachment"
              key={attachment.id}
              onClick={() => setSelectedImage(attachment)}
              type="button"
            >
              <img
                alt={attachment.filename}
                className={cn(
                  "h-full w-full transition duration-200 group-hover/image:scale-[1.02]",
                  imageAttachments.length === 1
                    ? "h-auto max-h-[16rem] max-w-full rounded-2xl object-contain sm:max-h-[22rem]"
                    : "object-cover",
                )}
                loading="lazy"
                src={attachment.url}
              />
              {!isMessageGifContentType(attachment.contentType) ? (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-white/90 bg-[linear-gradient(135deg,hsl(var(--backdrop)/0.94),hsl(var(--backdrop)/0.82))] px-1.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-white shadow-[0_10px_26px_rgba(0,0,0,0.55),0_0_0_1px_rgba(15,23,42,0.7),inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-md">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[hsl(var(--foreground))] shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                    <ImageIcon className="h-3 w-3" />
                  </span>
                  <span className="pr-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)]">
                    {`${index + 1}/${imageAttachments.length}`}
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {videoAttachments.length > 0 ? (
        <div className="mt-1 grid w-full max-w-full gap-1.5 sm:max-w-[32rem]">
          {videoAttachments.map((attachment) => (
            <div
              className="overflow-hidden rounded-[1.125rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.82)] shadow-[0_12px_26px_hsl(var(--shadow-color)/0.06)]"
              data-content-type={attachment.contentType}
              data-filename={attachment.filename}
              data-testid="message-video-attachment"
              key={attachment.id}
            >
              <video
                className="max-h-[28rem] w-full bg-black"
                controls
                playsInline
                preload="metadata"
                src={attachment.url}
              />
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-app-foreground">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.55)] text-app-soft">
                    <Play className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{attachment.filename}</span>
                </span>
                <a
                  className="shrink-0 rounded-full border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.55)] px-2.5 py-1 text-[0.6875rem] font-semibold text-app-soft transition hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  href={attachment.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("chat.attachments.openOriginal")}
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {fileAttachments.length > 0 ? (
        <div className="mt-1 grid w-full max-w-full gap-1.5 sm:max-w-[32rem]">
          {fileAttachments.map((attachment) => (
            <a
              aria-label={t("chat.attachments.openFile", {
                filename: attachment.filename,
              })}
              className="group/file flex min-w-0 items-center gap-3 rounded-[1.125rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.34)] px-3 py-2 text-left shadow-[0_12px_26px_hsl(var(--shadow-color)/0.05)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.42)] hover:bg-[hsl(var(--surface-card)/0.82)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              download={attachment.filename}
              data-content-type={attachment.contentType}
              data-filename={attachment.filename}
              data-testid="message-file-attachment"
              href={attachment.url}
              key={attachment.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.7)] bg-white/72 text-app-soft shadow-xs">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-app-foreground">
                  {attachment.filename}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-app-soft">
                  <span>{extensionFromFilename(attachment.filename)}</span>
                  <span aria-hidden="true">/</span>
                  <span>{formatAttachmentSize(attachment.size)}</span>
                </span>
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.72)] px-2.5 py-1 text-[0.6875rem] font-semibold text-app-soft transition group-hover/file:text-app-foreground sm:flex">
                <Download className="h-3.5 w-3.5" />
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </a>
          ))}
        </div>
      ) : null}

      {unavailableAttachments.length > 0 ? (
        <div className="mt-1 grid w-full max-w-full gap-1.5 sm:max-w-[32rem]">
          {unavailableAttachments.map((attachment) => (
            <div
              className="flex min-w-0 items-center gap-3 rounded-[1.125rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.34)] px-3 py-2 text-left opacity-85 shadow-[0_12px_26px_hsl(var(--shadow-color)/0.05)]"
              data-content-type={attachment.contentType}
              data-filename={attachment.filename}
              data-testid="message-attachment-unavailable"
              key={attachment.id}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.7)] bg-white/72 text-app-soft shadow-xs">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-app-foreground">
                  {attachment.filename}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-app-soft">
                  <span>{extensionFromFilename(attachment.filename)}</span>
                  <span aria-hidden="true">/</span>
                  <span>{formatAttachmentSize(attachment.size)}</span>
                  <span aria-hidden="true">/</span>
                  <span>{t(scanStatusLabelKey(attachment))}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <ImageLightbox
        image={inlineAttachmentMedia ? selectedImage : null}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}
