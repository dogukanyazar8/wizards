const DESKTOP_UPDATE_ORIGIN = "https://updates.whispr.team";
const DESKTOP_DOWNLOAD_ROUTE = "/api/v1/desktop/download";
const DEFAULT_DESKTOP_DOWNLOAD_MANIFEST_URL = `${DESKTOP_UPDATE_ORIGIN}/desktop/stable/latest.json`;

const DESKTOP_MANIFEST_RINGS = new Set(["stable", "uat"]);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

type DesktopUpdateManifest = {
  platforms?: {
    "windows-x86_64"?: {
      signature?: unknown;
      url?: unknown;
    };
  };
  version?: unknown;
};

function normalizeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function ringFromManifestUrl(manifestUrl: URL) {
  const match = manifestUrl.pathname.match(/^\/desktop\/([^/]+)\/latest\.json$/);
  return match?.[1] ?? null;
}

function assertSafeManifestUrl(manifestUrl: URL) {
  const ring = ringFromManifestUrl(manifestUrl);

  if (
    manifestUrl.protocol !== "https:" ||
    manifestUrl.origin !== DESKTOP_UPDATE_ORIGIN ||
    !ring ||
    !DESKTOP_MANIFEST_RINGS.has(ring)
  ) {
    throw new Error("Desktop download manifest must be a Whispr HTTPS latest.json endpoint.");
  }

  return ring;
}

export function getSafeDesktopDownloadUrl(value: string | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return DESKTOP_DOWNLOAD_ROUTE;
  }

  if (trimmedValue === DESKTOP_DOWNLOAD_ROUTE) {
    return DESKTOP_DOWNLOAD_ROUTE;
  }

  const url = normalizeUrl(trimmedValue);
  if (url?.protocol === "https:") {
    return url.toString();
  }

  return DESKTOP_DOWNLOAD_ROUTE;
}

export function getDesktopDownloadManifestUrl(value: string | undefined) {
  const manifestUrl = normalizeUrl(value?.trim() || DEFAULT_DESKTOP_DOWNLOAD_MANIFEST_URL);

  if (!manifestUrl) {
    throw new Error("Desktop download manifest URL is invalid.");
  }

  assertSafeManifestUrl(manifestUrl);
  return manifestUrl;
}

export function resolveDesktopDownloadUrlFromManifest(
  manifest: DesktopUpdateManifest,
  manifestUrl: URL,
) {
  const ring = assertSafeManifestUrl(manifestUrl);
  const version = typeof manifest.version === "string" ? manifest.version.trim() : "";
  const platform = manifest.platforms?.["windows-x86_64"];
  const signature = platform?.signature;
  const rawArtifactUrl = typeof platform?.url === "string" ? platform.url.trim() : "";
  const artifactUrl = normalizeUrl(rawArtifactUrl);

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error("Desktop download manifest version is invalid.");
  }

  if (typeof signature !== "string" || signature.trim().length === 0) {
    throw new Error("Desktop download manifest signature is missing.");
  }

  if (
    !artifactUrl ||
    artifactUrl.protocol !== "https:" ||
    artifactUrl.origin !== DESKTOP_UPDATE_ORIGIN
  ) {
    throw new Error("Desktop download artifact URL must be a Whispr HTTPS URL.");
  }

  const expectedFilename = `Whispr_${version}_x64-setup.exe`;
  const expectedPrefix = `/desktop/${ring}/releases/`;

  if (
    !artifactUrl.pathname.startsWith(expectedPrefix) ||
    !artifactUrl.pathname.endsWith(`/${expectedFilename}`)
  ) {
    throw new Error("Desktop download artifact URL does not match the selected release ring.");
  }

  return artifactUrl;
}

export const WHISPR_DESKTOP_DOWNLOAD_URL = getSafeDesktopDownloadUrl(
  process.env.NEXT_PUBLIC_WHISPR_DESKTOP_DOWNLOAD_URL,
);
