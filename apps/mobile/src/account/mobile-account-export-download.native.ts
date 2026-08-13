import { MobileApiError, type MobileApiClient } from "../api/mobile-api-client";
import { getExpoFileSystemModule } from "../media/expo-mobile-media-modules";
import { getMobileNetworkStatusSnapshot } from "../network/mobile-network-events";
import { MobileOfflineError, type MobileNetworkStatus } from "../network/mobile-network-contract";
import { downloadMobileAccountExport } from "./mobile-account-export-download";

const ACCOUNT_EXPORT_DOWNLOAD_TIMEOUT_MS = 120_000;

type MobileAccountExportNativeOptions = {
  downloadFile?: (
    input: { filename: string; headers: Record<string, string>; url: string },
    signal: AbortSignal,
  ) => Promise<string>;
  getNetworkStatus?: () => MobileNetworkStatus;
  timeoutMs?: number;
};

export function downloadMobileAccountExportFile(
  client: MobileApiClient,
  now = new Date(),
  options: MobileAccountExportNativeOptions = {},
): Promise<string> {
  if ((options.getNetworkStatus ?? getMobileNetworkStatusSnapshot)() === "offline") {
    return Promise.reject(new MobileOfflineError());
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("account export download timeout"),
    options.timeoutMs ?? ACCOUNT_EXPORT_DOWNLOAD_TIMEOUT_MS,
  );
  const downloadFile =
    options.downloadFile ??
    (async ({ filename, headers, url }, signal) => {
      const { File, Paths } = getExpoFileSystemModule();
      const destination = new File(Paths.cache, filename);
      const file = await File.downloadFileAsync(url, destination, {
        headers,
        idempotent: true,
        signal,
      });
      return file.uri;
    });

  return downloadMobileAccountExport(client, (input) => downloadFile(input, controller.signal), now)
    .catch((error: unknown) => {
      if (controller.signal.aborted) {
        throw new MobileApiError("Native account export download timed out.", {
          code: "download_timeout",
        });
      }
      if (error instanceof MobileApiError || error instanceof MobileOfflineError) throw error;
      throw new MobileApiError("Native account export download failed.", {
        code: "download_failed",
      });
    })
    .finally(() => clearTimeout(timeout));
}

export function deleteMobileAccountExportFile(fileUri: string): void {
  if (!fileUri.startsWith("file://")) return;
  const { File } = getExpoFileSystemModule();
  const file = new File(fileUri);
  if (file.exists) file.delete();
}
