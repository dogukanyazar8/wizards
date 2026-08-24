"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

const URL_PATTERN = /https?:\/\/[^\s<>()\]]+/i;

function extractFirstUrl(content: string) {
  const match = URL_PATTERN.exec(content);
  if (!match) {
    return null;
  }

  return match[0].replace(/[.,;:!?]+$/g, "");
}

async function fetchPreview(url: string) {
  const requestUrl = new URL("/api/v1/link-preview", window.location.origin);
  requestUrl.searchParams.set("url", url);

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error("Link preview unavailable");
  }

  return (await response.json()) as {
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
    title: string | null;
    url: string;
  };
}

export function LinkPreviewCard({ className, content }: { className?: string; content: string }) {
  const { t } = useI18n();
  const previewUrl = useMemo(() => extractFirstUrl(content), [content]);
  const query = useQuery({
    enabled: Boolean(previewUrl),
    queryFn: () => fetchPreview(previewUrl!),
    queryKey: ["link-preview", previewUrl],
    retry: false,
    staleTime: 12 * 60 * 60 * 1000,
  });

  if (!previewUrl) {
    return null;
  }

  if (query.isLoading) {
    return (
      <div
        className={cn(
          "mt-1.5 flex w-full max-w-[34rem] items-center gap-2 rounded-[1.125rem] border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-soft)/0.28)] px-3 py-2 text-xs font-medium text-app-muted",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("chat.linkPreview.loading")}
      </div>
    );
  }

  if (!query.data) {
    return null;
  }

  const title = query.data.title ?? query.data.url;

  return (
    <a
      className={cn(
        "mt-1.5 grid w-full max-w-[34rem] overflow-hidden rounded-[1.25rem] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.78)] text-left shadow-[0_14px_30px_hsl(var(--shadow-color)/0.07)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.42)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:grid-cols-[minmax(0,1fr)_8rem]",
        className,
      )}
      data-testid="message-link-preview"
      href={query.data.url}
      rel="noopener noreferrer nofollow"
      target="_blank"
    >
      <span className="min-w-0 p-3">
        <span className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-app-soft">
          {query.data.siteName ?? t("chat.linkPreview.link")}
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
        <span className="mt-1 block line-clamp-2 text-sm font-semibold text-app-foreground">
          {title}
        </span>
        {query.data.description ? (
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-app-muted">
            {query.data.description}
          </span>
        ) : null}
      </span>
      {query.data.imageUrl ? (
        <span className="hidden min-h-28 overflow-hidden border-l border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-soft)/0.45)] sm:block">
          <img
            alt=""
            className="h-full min-h-28 w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={query.data.imageUrl}
          />
        </span>
      ) : null}
    </a>
  );
}
