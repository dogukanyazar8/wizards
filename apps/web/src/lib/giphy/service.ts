import { z } from "zod";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { MESSAGE_GIF_MAX_BYTES } from "@/lib/messages/attachment-rules";

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs";
const GIPHY_DEFAULT_LIMIT = 24;
const GIPHY_MAX_LIMIT = 36;
const GIPHY_RATING = "pg";
const GIPHY_BUNDLE = "messaging_non_clips";

export const GiphySearchQuerySchema = z.object({
  q: z.string().trim().max(50).optional().default(""),
  limit: z.coerce.number().int().min(1).max(GIPHY_MAX_LIMIT).optional().default(GIPHY_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).max(4999).optional().default(0),
});

export const CreateGiphyAttachmentSchema = z.object({
  gifId: z.string().trim().min(1).max(128),
});

type GiphyImage = {
  height?: string;
  size?: string;
  url?: string;
  width?: string;
  webp?: string;
  webp_size?: string;
};

type GiphyImages = {
  downsized?: GiphyImage;
  fixed_height?: GiphyImage;
  fixed_width?: GiphyImage;
  fixed_width_small?: GiphyImage;
  original?: GiphyImage;
};

type GiphyApiGif = {
  id?: string;
  images?: GiphyImages;
  title?: string;
  url?: string;
};

type GiphyListResponse = {
  data?: GiphyApiGif[];
};

type GiphySingleResponse = {
  data?: GiphyApiGif;
};

export type GiphyGifDTO = {
  giphyUrl: string;
  height: number | null;
  id: string;
  previewUrl: string;
  size: number;
  title: string;
  url: string;
  width: number | null;
};

function getGiphyApiKey() {
  const key = process.env.GIPHY_API_KEY?.trim();

  if (!key) {
    throw new ApiError("GIF search is not configured.", 503, "GIPHY_NOT_CONFIGURED");
  }

  return key;
}

function normalizePositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanTitle(title: string | undefined, fallback: string) {
  const trimmed = title?.replace(/\s+GIF\s*$/i, "").trim();
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, 120) : fallback;
}

function pickDisplayImage(images: GiphyImages | undefined) {
  return images?.downsized ?? images?.fixed_height ?? images?.fixed_width ?? images?.original;
}

function pickPreviewImage(images: GiphyImages | undefined) {
  return images?.fixed_width_small ?? images?.fixed_width ?? images?.downsized ?? images?.original;
}

function mapGiphyGif(gif: GiphyApiGif): GiphyGifDTO | null {
  const id = gif.id?.trim();
  const displayImage = pickDisplayImage(gif.images);
  const previewImage = pickPreviewImage(gif.images);
  const url = normalizeUrl(displayImage?.url);
  const previewUrl = normalizeUrl(previewImage?.webp) ?? normalizeUrl(previewImage?.url);
  const giphyUrl = normalizeUrl(gif.url);

  if (!id || !url || !previewUrl || !giphyUrl) {
    return null;
  }

  return {
    giphyUrl,
    height: normalizePositiveInteger(displayImage?.height),
    id,
    previewUrl,
    size:
      normalizePositiveInteger(displayImage?.size) ??
      normalizePositiveInteger(previewImage?.webp_size) ??
      1,
    title: cleanTitle(gif.title, "GIPHY GIF"),
    url,
    width: normalizePositiveInteger(displayImage?.width),
  };
}

function normalizeCountryCode(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeLocaleLanguage(locale: string | null | undefined) {
  const normalized = locale?.split("-")[0]?.trim().toLowerCase();
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : "en";
}

async function enforceGiphyRateLimit(userId: string) {
  try {
    const allowed = await checkRateLimit(getRedis(), `rate:giphy:${userId}`, 60, 60);
    if (!allowed) {
      throw new ApiError("Too many GIF requests. Please try again shortly.", 429, "RATE_LIMITED");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // GIF search should remain available if Redis has a short outage.
  }
}

async function fetchGiphyJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new ApiError("Unable to load GIFs right now.", 502, "GIPHY_UPSTREAM_ERROR");
  }

  return (await response.json()) as T;
}

export async function listGiphyGifs(args: {
  countryCode?: string | null;
  limit: number;
  locale?: string | null;
  offset: number;
  query: string;
  userId: string;
}) {
  await enforceGiphyRateLimit(args.userId);

  const apiKey = getGiphyApiKey();
  const hasQuery = args.query.trim().length > 0;
  const url = new URL(`${GIPHY_API_BASE}/${hasQuery ? "search" : "trending"}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("offset", String(args.offset));
  url.searchParams.set("rating", GIPHY_RATING);
  url.searchParams.set("bundle", GIPHY_BUNDLE);

  const countryCode = normalizeCountryCode(args.countryCode ?? null);
  if (countryCode) {
    url.searchParams.set("country_code", countryCode);
  }

  if (hasQuery) {
    url.searchParams.set("q", args.query.trim());
    url.searchParams.set("lang", normalizeLocaleLanguage(args.locale));
  }

  const payload = await fetchGiphyJson<GiphyListResponse>(url);
  return {
    gifs: (payload.data ?? []).map(mapGiphyGif).filter((gif): gif is GiphyGifDTO => Boolean(gif)),
  };
}

export async function createGiphyAttachment(userId: string, gifId: string) {
  await enforceGiphyRateLimit(userId);

  const apiKey = getGiphyApiKey();
  const url = new URL(`${GIPHY_API_BASE}/${encodeURIComponent(gifId)}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("rating", GIPHY_RATING);
  url.searchParams.set("bundle", GIPHY_BUNDLE);

  const payload = await fetchGiphyJson<GiphySingleResponse>(url);
  const gif = payload.data ? mapGiphyGif(payload.data) : null;

  if (!gif) {
    throw new ApiError("GIF was not found.", 404, "GIF_NOT_FOUND");
  }

  if (gif.size > MESSAGE_GIF_MAX_BYTES) {
    throw new ApiError("This GIF is too large to send.", 400, "GIF_TOO_LARGE");
  }

  const attachment = await prisma.attachment.create({
    data: {
      userId,
      url: gif.url,
      filename: `giphy-${gif.id}.gif`,
      contentType: "image/gif",
      size: gif.size,
      width: gif.width,
      height: gif.height,
      description: gif.title,
    },
    select: {
      id: true,
      url: true,
      filename: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
    },
  });

  return {
    attachment: {
      ...attachment,
      width: attachment.width ?? undefined,
      height: attachment.height ?? undefined,
    },
    input: {
      id: attachment.id,
      width: attachment.width,
      height: attachment.height,
    },
  };
}
