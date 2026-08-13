import { MobileApiError, type MobileApiClient } from "../api/mobile-api-client";

export interface MobileAccountExportDownloadInput {
  readonly filename: string;
  readonly headers: Record<string, string>;
  readonly url: string;
}

export type MobileAccountExportNativeDownloader = (
  input: MobileAccountExportDownloadInput,
) => Promise<string>;

export async function downloadMobileAccountExport(
  client: MobileApiClient,
  downloadNative: MobileAccountExportNativeDownloader,
  now = new Date(),
): Promise<string> {
  if (!client.createDownloadRequest) {
    throw new MobileApiError("Native account export download is unavailable.", {
      code: "download_unavailable",
    });
  }

  const request = await client.createDownloadRequest("/api/v1/users/me/data-export");
  const uri = await downloadNative({
    filename: `whispr-data-export-${now.toISOString().slice(0, 10)}.json`,
    headers: request.headers,
    url: request.url,
  });
  if (!uri.startsWith("file://")) {
    throw new MobileApiError("Native account export did not produce a local file.", {
      code: "invalid_download_uri",
    });
  }
  return uri;
}
