import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

const LINK_PREVIEW_TIMEOUT_MS = 2500;
const LINK_PREVIEW_MAX_BYTES = 512 * 1024;
const LINK_PREVIEW_CACHE_SECONDS = 12 * 60 * 60;

export const LinkPreviewSchema = z.object({
  url: z.string().url(),
  title: z.string().max(160).nullable(),
  description: z.string().max(280).nullable(),
  siteName: z.string().max(80).nullable(),
  imageUrl: z.string().url().nullable(),
});

export type LinkPreview = z.infer<typeof LinkPreviewSchema>;

function isPrivateIPv4(ip: string) {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const a = parts[0];
  const b = parts[1];

  if (a === undefined || b === undefined) {
    return true;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string) {
  const normalized = ip.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.includes(":ffff:127.") ||
    normalized.includes(":ffff:10.") ||
    normalized.includes(":ffff:192.168.")
  );
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal"
  );
}

function isBlockedIP(address: string) {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateIPv4(address);
  }

  if (version === 6) {
    return isPrivateIPv6(address);
  }

  return true;
}

async function assertPublicHttpUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError("Invalid URL", 400, "INVALID_URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError("Only HTTP and HTTPS links can be previewed.", 400, "INVALID_URL");
  }

  if (parsed.username || parsed.password || parsed.hostname.length > 253) {
    throw new ApiError("This link cannot be previewed.", 400, "INVALID_URL");
  }

  if (isBlockedHostname(parsed.hostname) || isBlockedIP(parsed.hostname)) {
    throw new ApiError("This link cannot be previewed.", 400, "BLOCKED_URL");
  }

  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((address) => isBlockedIP(address.address))) {
    throw new ApiError("This link cannot be previewed.", 400, "BLOCKED_URL");
  }

  parsed.hash = "";
  return parsed;
}

function normalizeText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, maxLength) : null;
}

function readMeta(content: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${escapedName}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapedName}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function readTitle(content: string) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content);
  return match?.[1] ?? null;
}

function resolvePreviewImage(rawImageUrl: string | null, sourceUrl: URL) {
  if (!rawImageUrl) {
    return null;
  }

  try {
    const imageUrl = new URL(rawImageUrl, sourceUrl);
    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
      return null;
    }
    imageUrl.hash = "";
    return imageUrl.toString();
  } catch {
    return null;
  }
}

async function readLimitedBody(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > LINK_PREVIEW_MAX_BYTES) {
      throw new ApiError("Link preview response is too large.", 413, "LINK_TOO_LARGE");
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function cacheKey(url: string) {
  return `link-preview:${createHash("sha256").update(url).digest("hex")}`;
}

async function readCachedPreview(url: string) {
  try {
    const cached = await getRedis().get(cacheKey(url));
    if (!cached) {
      return null;
    }

    const parsed = LinkPreviewSchema.safeParse(JSON.parse(cached));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    logError("[link-preview] Cache read failed", error);
    return null;
  }
}

async function writeCachedPreview(url: string, preview: LinkPreview) {
  try {
    await getRedis().set(
      cacheKey(url),
      JSON.stringify(preview),
      "EX",
      LINK_PREVIEW_CACHE_SECONDS,
    );
  } catch (error) {
    logError("[link-preview] Cache write failed", error);
  }
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const url = await assertPublicHttpUrl(rawUrl);
  const normalizedUrl = url.toString();
  const cached = await readCachedPreview(normalizedUrl);

  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);

  try {
    let currentUrl = url;
    let response: Response | null = null;

    for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
      response = await fetch(currentUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "WhisprLinkPreview/1.0",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get("location");
      if (!location) {
        break;
      }

      currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl).toString());
    }

    if (!response?.ok) {
      throw new ApiError("Link preview is unavailable.", 502, "PREVIEW_UNAVAILABLE");
    }

    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(contentLength) && contentLength > LINK_PREVIEW_MAX_BYTES) {
      throw new ApiError("Link preview response is too large.", 413, "LINK_TOO_LARGE");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new ApiError("Link preview is unavailable.", 415, "PREVIEW_UNAVAILABLE");
    }

    const html = await readLimitedBody(response);
    const preview = LinkPreviewSchema.parse({
      url: normalizedUrl,
      title: normalizeText(readMeta(html, "og:title") ?? readTitle(html), 160),
      description: normalizeText(
        readMeta(html, "og:description") ?? readMeta(html, "description"),
        280,
      ),
      siteName: normalizeText(readMeta(html, "og:site_name") ?? url.hostname, 80),
      imageUrl: resolvePreviewImage(readMeta(html, "og:image"), currentUrl),
    });

    await writeCachedPreview(normalizedUrl, preview);
    return preview;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("Link preview is unavailable.", 502, "PREVIEW_UNAVAILABLE");
  } finally {
    clearTimeout(timeoutId);
  }
}
