"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import type { MessageAttachment, UploadedAttachmentInput } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import {
  announceOverlayOpen,
  getOverlayOpenDetail,
  WHISPR_OVERLAY_OPEN_EVENT,
} from "@/lib/ui/overlay-coordinator";

type GiphyGif = {
  giphyUrl: string;
  height: number | null;
  id: string;
  previewUrl: string;
  size: number;
  title: string;
  url: string;
  width: number | null;
};

type GiphyListResponse = {
  gifs: GiphyGif[];
};

type GiphyAttachmentResponse = {
  attachment: MessageAttachment;
  input: UploadedAttachmentInput;
};

type GifPickerProps = {
  onClose: () => void;
  onSelect: (payload: GiphyAttachmentResponse) => void;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

export function GifPicker({ onClose, onSelect }: GifPickerProps) {
  const { t } = useI18n();
  const overlayId = useId();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGifId, setSelectedGifId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    announceOverlayOpen("composer-picker", overlayId);

    const handleOverlayOpen = (event: Event) => {
      const detail = getOverlayOpenDetail(event);

      if (detail?.group === "composer-picker" && detail.id !== overlayId) {
        onClose();
      }
    };

    window.addEventListener(WHISPR_OVERLAY_OPEN_EVENT, handleOverlayOpen);
    return () => window.removeEventListener(WHISPR_OVERLAY_OPEN_EVENT, handleOverlayOpen);
  }, [onClose, overlayId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: "24",
          offset: "0",
        });
        const trimmedQuery = query.trim();
        if (trimmedQuery.length > 0) {
          params.set("q", trimmedQuery);
        }

        const payload = await requestJson<GiphyListResponse>(`/api/v1/gifs?${params}`, {
          signal: controller.signal,
        });
        setGifs(payload.gifs);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error ? requestError.message : t("chat.gifs.loadFailed"),
          );
          setGifs([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, t]);

  const handleSelect = async (gif: GiphyGif) => {
    setSelectedGifId(gif.id);
    setError(null);

    try {
      const payload = await requestJson<GiphyAttachmentResponse>("/api/v1/gifs/attachment", {
        body: JSON.stringify({ gifId: gif.id }),
        method: "POST",
      });
      onSelect(payload);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("chat.gifs.selectFailed"));
    } finally {
      setSelectedGifId(null);
    }
  };

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[90] max-h-[min(64dvh,28rem)] rounded-[1.5rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.96)] p-2.5 shadow-[0_24px_62px_hsl(var(--shadow-color)/0.2)] backdrop-blur-xl md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-3 md:max-h-none md:w-[min(22rem,calc(100vw-2rem))]"
      data-testid="gif-picker"
      ref={containerRef}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-app-foreground">{t("chat.gifs.title")}</p>
          <p className="text-xs text-app-soft">{t("chat.gifs.poweredBy")}</p>
        </div>
        <WindowCloseButton aria-label={t("common.close")} onClick={onClose} />
      </div>

      <label className="mb-2.5 flex items-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.42)] px-3 py-2">
        <Search className="h-4 w-4 text-app-soft" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-app-foreground placeholder-app-muted outline-hidden"
          data-testid="gif-search-input"
          maxLength={50}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("chat.gifs.searchPlaceholder")}
          value={query}
        />
      </label>

      {error ? (
        <div className="mb-3 rounded-2xl border border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-medium text-[hsl(var(--danger))]">
          {error}
        </div>
      ) : null}

      <div className="max-h-[44dvh] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] md:max-h-[22rem] [&::-webkit-scrollbar]:hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-app-soft">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : gifs.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <button
                aria-label={t("chat.gifs.selectGif", { title: gif.title })}
                className="group/gif relative aspect-square overflow-hidden rounded-[1.125rem] border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.45)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.42)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-gif-id={gif.id}
                data-testid="gif-option"
                disabled={Boolean(selectedGifId)}
                key={gif.id}
                onClick={() => void handleSelect(gif)}
                type="button"
              >
                <img
                  alt={gif.title}
                  className="h-full w-full object-cover transition group-hover/gif:scale-[1.03]"
                  loading="lazy"
                  src={gif.previewUrl}
                />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/84 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--foreground))] shadow-xs">
                  <Sparkles className="h-3 w-3" />
                  GIF
                </span>
                {selectedGifId === gif.id ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/28 text-white">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center rounded-[1.375rem] border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] text-center">
            <Sparkles className="mb-2 h-5 w-5 text-app-soft" />
            <p className="text-sm font-semibold text-app-foreground">{t("chat.gifs.empty")}</p>
            <p className="mt-1 max-w-48 text-xs text-app-soft">{t("chat.gifs.emptyHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
