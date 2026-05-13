import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

const LINK_PREVIEW_TIMEOUT_MS = 2500;
const LINK_PREVIEW_MAX_BYTES = 512 * 1024;
const LINK_PREVIEW_CACHE_SECONDS = 12 * 60 * 60;
const LINK_PREVIEW_USER_AGENT = "WhisprLinkPreview/1.0";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ResolvedAddress = {
  address: string;
  family: number;
};

type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>;

type PublicHttpUrl = {
  addresses: ResolvedAddress[];
  url: URL;
};

type LinkPreviewHttpResponse = {
  body: string;
  headers: http.IncomingHttpHeaders;
  ok: boolean;
  status: number;
};

export type LinkPreviewFetchOptions = {
  resolveHost?: ResolveHost;
};

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

function normalizeIpLiteral(hostname: string) {
  return hostname.replace(/^\[(.*)\]$/, "$1");
}

function isBlockedIpLiteral(hostname: string) {
  const normalizedHostname = normalizeIpLiteral(hostname);

  return isIP(normalizedHostname) !== 0 && isBlockedIP(normalizedHostname);
}

async function resolvePublicHostAddresses(hostname: string): Promise<ResolvedAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

async function assertPublicResolvedAddresses(
  hostname: string,
  resolveHost: ResolveHost,
): Promise<ResolvedAddress[]> {
  const addresses = await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some((address) => isBlockedIP(address.address))) {
    throw new ApiError("This link cannot be previewed.", 400, "BLOCKED_URL");
  }

  return addresses;
}

export async function assertPublicHttpUrl(
  rawUrl: string,
  resolveHost: ResolveHost = resolvePublicHostAddresses,
): Promise<PublicHttpUrl> {
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

  if (isBlockedHostname(parsed.hostname) || isBlockedIpLiteral(parsed.hostname)) {
    throw new ApiError("This link cannot be previewed.", 400, "BLOCKED_URL");
  }

  const addresses = await assertPublicResolvedAddresses(parsed.hostname, resolveHost);

  parsed.hash = "";
  return { addresses, url: parsed };
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

function getHeader(headers: http.IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];

  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function isRedirectStatus(status: number) {
  return REDIRECT_STATUSES.has(status);
}

export function createPublicLookup(resolveHost: ResolveHost) {
  return (
    hostname: string,
    _options: unknown,
    callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
  ) => {
    void assertPublicResolvedAddresses(hostname, resolveHost)
      .then((addresses) => {
        const selectedAddress = addresses[0];
        if (!selectedAddress) {
          callback(new ApiError("This link cannot be previewed.", 400, "BLOCKED_URL"), "", 0);
          return;
        }

        callback(null, selectedAddress.address, selectedAddress.family);
      })
      .catch((error: unknown) => {
        callback(error as NodeJS.ErrnoException, "", 0);
      });
  };
}

function requestPublicHttpUrl(
  target: PublicHttpUrl,
  signal: AbortSignal,
  resolveHost: ResolveHost,
): Promise<LinkPreviewHttpResponse> {
  return new Promise((resolve, reject) => {
    const requestUrl = target.url;
    const client = requestUrl.protocol === "https:" ? https : http;
    let settled = false;

    const finish = (error: unknown, response?: LinkPreviewHttpResponse) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      if (error) {
        reject(error);
        return;
      }
      if (response) {
        resolve(response);
        return;
      }
      reject(new ApiError("Link preview is unavailable.", 502, "PREVIEW_UNAVAILABLE"));
    };

    const request = client.request(
      {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": LINK_PREVIEW_USER_AGENT,
        },
        hostname: requestUrl.hostname,
        lookup: createPublicLookup(resolveHost),
        method: "GET",
        path: `${requestUrl.pathname}${requestUrl.search}`,
        port: requestUrl.port ? Number.parseInt(requestUrl.port, 10) : undefined,
        protocol: requestUrl.protocol,
        timeout: LINK_PREVIEW_TIMEOUT_MS,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 0;

        if (isRedirectStatus(status)) {
          incoming.resume();
          incoming.on("end", () => {
            finish(null, {
              body: "",
              headers: incoming.headers,
              ok: status >= 200 && status < 300,
              status,
            });
          });
          incoming.on("error", finish);
          return;
        }

        const contentLength = Number.parseInt(getHeader(incoming.headers, "content-length") ?? "0", 10);
        if (Number.isFinite(contentLength) && contentLength > LINK_PREVIEW_MAX_BYTES) {
          incoming.resume();
          request.destroy();
          finish(new ApiError("Link preview response is too large.", 413, "LINK_TOO_LARGE"));
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        incoming.on("data", (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > LINK_PREVIEW_MAX_BYTES) {
            request.destroy();
            finish(new ApiError("Link preview response is too large.", 413, "LINK_TOO_LARGE"));
            return;
          }

          chunks.push(chunk);
        });
        incoming.on("end", () => {
          finish(null, {
            body: Buffer.concat(chunks).toString("utf8"),
            headers: incoming.headers,
            ok: status >= 200 && status < 300,
            status,
          });
        });
        incoming.on("error", finish);
      },
    );

    function abort() {
      request.destroy(new ApiError("Link preview is unavailable.", 502, "PREVIEW_UNAVAILABLE"));
    }

    request.on("timeout", abort);
    request.on("error", finish);
    signal.addEventListener("abort", abort, { once: true });

    if (signal.aborted) {
      abort();
      return;
    }

    request.end();
  });
}

export async function fetchLinkPreview(
  rawUrl: string,
  options: LinkPreviewFetchOptions = {},
): Promise<LinkPreview> {
  const resolveHost = options.resolveHost ?? resolvePublicHostAddresses;
  const initialTarget = await assertPublicHttpUrl(rawUrl, resolveHost);
  const normalizedUrl = initialTarget.url.toString();
  const cached = await readCachedPreview(normalizedUrl);

  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);

  try {
    let currentTarget = initialTarget;
    let response: LinkPreviewHttpResponse | null = null;

    for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
      response = await requestPublicHttpUrl(currentTarget, controller.signal, resolveHost);

      if (!isRedirectStatus(response.status)) {
        break;
      }

      const location = getHeader(response.headers, "location");
      if (!location) {
        break;
      }

      currentTarget = await assertPublicHttpUrl(
        new URL(location, currentTarget.url).toString(),
        resolveHost,
      );
    }

    if (!response?.ok) {
      throw new ApiError("Link preview is unavailable.", 502, "PREVIEW_UNAVAILABLE");
    }

    const contentType = getHeader(response.headers, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new ApiError("Link preview is unavailable.", 415, "PREVIEW_UNAVAILABLE");
    }

    const html = response.body;
    const preview = LinkPreviewSchema.parse({
      url: normalizedUrl,
      title: normalizeText(readMeta(html, "og:title") ?? readTitle(html), 160),
      description: normalizeText(
        readMeta(html, "og:description") ?? readMeta(html, "description"),
        280,
      ),
      siteName: normalizeText(readMeta(html, "og:site_name") ?? initialTarget.url.hostname, 80),
      imageUrl: resolvePreviewImage(readMeta(html, "og:image"), currentTarget.url),
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
