import {
  getDesktopDownloadManifestUrl,
  resolveDesktopDownloadUrlFromManifest,
} from "@/lib/desktop-download";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DESKTOP_DOWNLOAD_TIMEOUT_MS = 5000;

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

export async function GET() {
  try {
    const manifestUrl = getDesktopDownloadManifestUrl(
      process.env.WHISPR_DESKTOP_DOWNLOAD_MANIFEST_URL,
    );
    const response = await fetch(manifestUrl, {
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
    const downloadUrl = resolveDesktopDownloadUrlFromManifest(manifest, manifestUrl);

    return Response.redirect(downloadUrl, 307);
  } catch {
    return jsonDesktopDownloadError(503, "DESKTOP_DOWNLOAD_UNAVAILABLE");
  }
}
