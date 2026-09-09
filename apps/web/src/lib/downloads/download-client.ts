import { AppDownloadsResponseSchema, type AppDownloadsResponse } from "@wizards/types";

/**
 * SPEC-INDIRME §B verisi. Uç iki ortamı tek istekte döndüğü için ortam
 * değiştirmek yeniden sorgu açmaz; bu yüzden tek bir sorgu anahtarı yeterli.
 */

export const APP_DOWNLOADS_ENDPOINT = "/api/v1/app/downloads";

export const downloadQueryKeys = {
  catalog: ["app", "downloads"] as const,
};

export async function fetchAppDownloads(
  fetchImplementation: typeof globalThis.fetch = (...args) => globalThis.fetch(...args),
): Promise<AppDownloadsResponse> {
  const response = await fetchImplementation(APP_DOWNLOADS_ENDPOINT, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Download catalog request failed with status ${response.status}.`);
  }

  return AppDownloadsResponseSchema.parse(await response.json());
}

/** Alt bardaki "Sürüm notları" düğmesinin hedefi: Ayarlar › Hakkında › Yenilikler. */
export const RELEASE_NOTES_ROUTE = "/settings/about/about";
