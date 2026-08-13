import {
  getDesktopDownloadManifestUrl,
  resolveDesktopDownloadUrlFromManifest,
} from "@/lib/desktop-download";
import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { createNetworkRateLimitIdentity } from "@/lib/security/client-ip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DESKTOP_DOWNLOAD_TIMEOUT_MS = 5000;
const DESKTOP_MANIFEST_CACHE_TTL_MS = 60_000;

type DesktopDownloadRouteDependencies = {
  enforceRateLimit(identity: string, action: "desktop:download"): Promise<void>;
  fetchManifest(input: URL, init: RequestInit): Promise<Response>;
  now(): number;
  resolveDownloadUrl: typeof resolveDesktopDownloadUrlFromManifest;
  resolveManifestUrl: typeof getDesktopDownloadManifestUrl;
};

const defaultDependencies: DesktopDownloadRouteDependencies = {
  enforceRateLimit: enforceApiRateLimit,
  fetchManifest: (input, init) => fetch(input, init),
  now: Date.now,
  resolveDownloadUrl: resolveDesktopDownloadUrlFromManifest,
  resolveManifestUrl: getDesktopDownloadManifestUrl,
};

let cachedDownload: { expiresAt: number; url: string } | null = null;

function jsonDesktopDownloadError(status: number, code: string) {
  return Response.json(
    {
      code,
      message: "Whispr Desktop download is temporarily unavailable.",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
      status,
    },
  );
}

export async function desktopDownloadRoute(
  request: Request,
  dependencies: DesktopDownloadRouteDependencies = defaultDependencies,
) {
  try {
    await dependencies.enforceRateLimit(
      createNetworkRateLimitIdentity({ headers: request.headers }),
      "desktop:download",
    );

    const now = dependencies.now();
    if (cachedDownload && cachedDownload.expiresAt > now) {
      return Response.redirect(cachedDownload.url, 307);
    }

    const manifestUrl = dependencies.resolveManifestUrl(
      process.env.WHISPR_DESKTOP_DOWNLOAD_MANIFEST_URL,
    );
    const response = await dependencies.fetchManifest(manifestUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(DESKTOP_DOWNLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      return jsonDesktopDownloadError(502, "DESKTOP_DOWNLOAD_MANIFEST_UNAVAILABLE");
    }

    const manifest = await response.json();
    const downloadUrl = dependencies.resolveDownloadUrl(manifest, manifestUrl).toString();
    cachedDownload = { expiresAt: now + DESKTOP_MANIFEST_CACHE_TTL_MS, url: downloadUrl };

    return Response.redirect(downloadUrl, 307);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error);
    }
    return jsonDesktopDownloadError(503, "DESKTOP_DOWNLOAD_UNAVAILABLE");
  }
}

export async function GET(request: Request) {
  return desktopDownloadRoute(request);
}
