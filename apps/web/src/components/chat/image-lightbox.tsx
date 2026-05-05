"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { ExternalLink, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { MessageAttachment } from "@wizards/types";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";

type ImageLightboxProps = {
  image: MessageAttachment | null;
  onClose: () => void;
};

export function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [image?.id]);

  return (
    <Modal
      className="max-h-[calc(100dvh-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-4"
      closeLabel={t("chat.attachments.closeImageViewer")}
      {...(image?.filename ? { description: image.filename } : {})}
      onClose={onClose}
      open={Boolean(image)}
      title={t("chat.attachments.imageViewer")}
    >
      {image ? (
        <div className="space-y-4" data-testid="image-lightbox">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-app-muted">
              {image.filename}
            </p>

            <div className="flex items-center gap-2">
              <button
                aria-label={t("chat.attachments.zoomOut")}
                className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:p-2"
                data-testid="image-lightbox-zoom-out"
                onClick={() => setZoom((current) => Math.max(0.5, current - 0.25))}
                type="button"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                aria-label={t("chat.attachments.resetZoom")}
                className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:p-2"
                data-testid="image-lightbox-reset-zoom"
                onClick={() => setZoom(1)}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                aria-label={t("chat.attachments.zoomIn")}
                className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:p-2"
                data-testid="image-lightbox-zoom-in"
                onClick={() => setZoom((current) => Math.min(3, current + 0.25))}
                type="button"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <a
                aria-label={t("chat.attachments.openOriginal")}
                className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:p-2"
                data-testid="image-lightbox-open-original"
                href={image.url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="max-h-[66dvh] overflow-auto rounded-[24px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.34)] p-2 sm:max-h-[72vh] sm:p-3">
            <div className="flex min-h-[42dvh] items-center justify-center sm:min-h-[48vh]">
              <img
                alt={image.filename}
                className="max-h-[60dvh] max-w-full touch-pan-x touch-pan-y rounded-[18px] object-contain shadow-[0_20px_55px_hsl(var(--shadow-color)/0.18)] transition-transform sm:max-h-[68vh]"
                src={image.url}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center",
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
