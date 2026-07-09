"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileImage, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { MessageAttachment } from "@wizards/types";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { isMessageGifContentType } from "@/lib/messages/attachment-rules";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3;
const BUTTON_ZOOM_STEP = 0.25;
const WHEEL_ZOOM_STEP = 0.12;
const LIGHTBOX_ZOOM_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="16" cy="16" r="10" fill="white" fill-opacity=".96" stroke="#6366f1" stroke-width="2.5"/><path d="M16 11v10M11 16h10" stroke="#312e81" stroke-width="2.5" stroke-linecap="round"/><path d="m23.5 23.5 6 6" stroke="#6366f1" stroke-width="3" stroke-linecap="round"/></svg>',
)}") 16 16, zoom-in`;
const LIGHTBOX_PAN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect x="5" y="5" width="26" height="26" rx="13" fill="white" fill-opacity=".96" stroke="#6366f1" stroke-width="2"/><path d="M18 9v18M9 18h18M18 9l-4 4M18 9l4 4M18 27l-4-4M18 27l4-4M9 18l4-4M9 18l4 4M27 18l-4-4M27 18l-4 4" fill="none" stroke="#312e81" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}") 18 18, grab`;
const LIGHTBOX_PANNING_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect x="4" y="4" width="28" height="28" rx="14" fill="#312e81" fill-opacity=".96" stroke="#a5b4fc" stroke-width="2"/><path d="M18 9v18M9 18h18M18 9l-4 4M18 9l4 4M18 27l-4-4M18 27l4-4M9 18l4-4M9 18l4 4M27 18l-4-4M27 18l-4 4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}") 18 18, grabbing`;

type ImageLightboxProps = {
  image: MessageAttachment | null;
  onClose: () => void;
};

type PanOffset = {
  x: number;
  y: number;
};

type PanStart = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function getZoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function getLightboxCursor(canPan: boolean, isPanning: boolean) {
  if (isPanning) {
    return LIGHTBOX_PANNING_CURSOR;
  }

  if (canPan) {
    return LIGHTBOX_PAN_CURSOR;
  }

  return LIGHTBOX_ZOOM_CURSOR;
}

function getAttachmentDownloadUrl(attachmentId: string) {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`;
}

export function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<PanStart | null>(null);
  const isGif = image ? isMessageGifContentType(image.contentType) : false;

  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
    panStartRef.current = null;
  }, [image?.id]);

  const attachmentKind = image
    ? isGif
      ? t("chat.attachments.gif")
      : t("chat.attachments.image")
    : "";
  const zoomLabel = getZoomLabel(zoom);
  const canPan = zoom > 1;
  const lightboxCursor = getLightboxCursor(canPan, isPanning);
  const clampPanOffset = (offset: PanOffset, nextZoom = zoom) => {
    const stage = stageRef.current;

    if (!stage || nextZoom <= 1) {
      return { x: 0, y: 0 };
    }

    const maxX = (stage.clientWidth * (nextZoom - 1)) / 2;
    const maxY = (stage.clientHeight * (nextZoom - 1)) / 2;

    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
  };
  const updateZoom = (delta: number) => {
    setZoom((current) => {
      const nextZoom = clampZoom(Math.round((current + delta) * 100) / 100);
      setPanOffset((currentOffset) => clampPanOffset(currentOffset, nextZoom));
      return nextZoom;
    });
  };
  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
    panStartRef.current = null;
  };
  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "whispr-attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const downloadImage = async () => {
    if (!image || isDownloading) {
      return;
    }

    setIsDownloading(true);
    let objectUrl: string | null = null;

    try {
      const response = await fetch(getAttachmentDownloadUrl(image.id), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Attachment download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, image.filename);
    } catch {
      // Keep the viewer in place if the protected download endpoint cannot stream the file.
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000);
      }

      setIsDownloading(false);
    }
  };
  const stopPanning = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    panStartRef.current = null;
    setIsPanning(false);
  };

  return (
    <Modal
      className={cn(
        "max-h-[calc(100dvh-1rem)] overflow-hidden",
        isGif ? "max-w-[min(92vw,56rem)] p-3 sm:p-4" : "max-w-[min(96vw,76rem)] p-4 sm:p-5",
      )}
      closeLabel={t("chat.attachments.closeImageViewer")}
      onClose={onClose}
      open={Boolean(image?.url)}
      title={t("chat.attachments.imageViewer")}
    >
      {image?.url ? (
        <div className="space-y-4" data-testid="image-lightbox">
          <div className="flex flex-col gap-3 rounded-[24px] border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.68)] p-3 shadow-[0_16px_40px_hsl(var(--shadow-color)/0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.66)] text-app-soft">
                <FileImage className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-app-foreground">
                  {image.filename}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-app-soft">
                  <span>{attachmentKind}</span>
                  <span aria-hidden="true">/</span>
                  <span>{formatAttachmentSize(image.size)}</span>
                  <span aria-hidden="true">/</span>
                  <span>
                    {t("chat.attachments.zoomLevel", {
                      zoom: zoomLabel,
                    })}
                  </span>
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                aria-label={t("chat.attachments.zoomOut")}
                className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-10 sm:w-10"
                data-testid="image-lightbox-zoom-out"
                onClick={() => updateZoom(-BUTTON_ZOOM_STEP)}
                type="button"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                aria-label={t("chat.attachments.resetZoom")}
                className="app-panel-soft flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-semibold text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-10"
                data-testid="image-lightbox-reset-zoom"
                onClick={resetView}
                type="button"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {zoomLabel}
              </button>
              <button
                aria-label={t("chat.attachments.zoomIn")}
                className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-10 sm:w-10"
                data-testid="image-lightbox-zoom-in"
                onClick={() => updateZoom(BUTTON_ZOOM_STEP)}
                type="button"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                aria-label={t("chat.attachments.downloadImage", {
                  filename: image.filename,
                })}
                className="app-panel-soft flex h-11 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60 sm:h-10"
                data-testid="image-lightbox-download"
                disabled={isDownloading}
                onClick={downloadImage}
                type="button"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t("chat.attachments.download")}</span>
              </button>
              <a
                aria-label={t("chat.attachments.openOriginal")}
                className="app-panel-soft flex h-11 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-10"
                data-testid="image-lightbox-open-original"
                href={image.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">{t("chat.attachments.openOriginal")}</span>
              </a>
            </div>
          </div>

          <div
            className={cn(
              "relative overflow-hidden rounded-[30px] border border-[hsl(var(--border)/0.72)] shadow-inner",
              isGif
                ? "mx-auto w-fit max-w-full bg-black"
                : "bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_34%),hsl(var(--surface-soft)/0.42)]",
            )}
          >
            <div
              className={cn(
                "flex select-none items-center justify-center overflow-hidden",
                isGif
                  ? "max-h-[min(68dvh,720px)] max-w-full p-0"
                  : "h-[min(68dvh,720px)] min-h-[20rem] p-3 sm:min-h-[28rem] sm:p-5",
                isPanning && "touch-none",
              )}
              onPointerCancel={stopPanning}
              onPointerDown={(event) => {
                if (!canPan || (event.pointerType === "mouse" && event.button !== 0)) {
                  return;
                }

                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                panStartRef.current = {
                  originX: panOffset.x,
                  originY: panOffset.y,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                };
                setIsPanning(true);
              }}
              onPointerMove={(event) => {
                const panStart = panStartRef.current;

                if (!panStart || panStart.pointerId !== event.pointerId) {
                  return;
                }

                event.preventDefault();
                setPanOffset(
                  clampPanOffset({
                    x: panStart.originX + event.clientX - panStart.startX,
                    y: panStart.originY + event.clientY - panStart.startY,
                  }),
                );
              }}
              onPointerUp={stopPanning}
              onWheel={(event) => {
                event.preventDefault();
                updateZoom(event.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP);
              }}
              ref={stageRef}
              style={{ cursor: lightboxCursor }}
            >
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center",
                  isPanning ? "" : "transition-transform duration-150",
                )}
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
                }}
              >
                <img
                  alt={image.filename}
                  className={cn(
                    "transition-transform duration-150",
                    isGif
                      ? "block max-h-[min(68dvh,720px)] max-w-full rounded-[28px] object-contain shadow-none"
                      : "h-full w-full rounded-[22px] object-contain shadow-[0_24px_70px_hsl(var(--shadow-color)/0.18)]",
                  )}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  src={image.url}
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center",
                  }}
                />
              </div>
            </div>
            {!isGif ? (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                <span className="rounded-full border border-white/54 bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-sm backdrop-blur">
                  {attachmentKind}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
