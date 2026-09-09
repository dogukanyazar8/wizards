import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { getAppDownloadCatalog } from "@/lib/downloads/download-catalog-service";

/**
 * SPEC-INDIRME §B — "Whispr'i indir" penceresinin verisi.
 *
 * Yanıt kullanıcıya özel değil ama oturum arkasında duruyor: bir indirme
 * bağlantısı uygulamanın içinden istenir. `private, max-age=60` bu yüzden
 * doğru ton — `no-store` her açılışta gereksiz bir sorgu demekti, paylaşımlı
 * bir önbellek ise oturum kapısını delerdi.
 */

export type AppDownloadsRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string, action: "app:downloads"): Promise<void>;
  readCatalog: typeof getAppDownloadCatalog;
};

const defaultDependencies: AppDownloadsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  readCatalog: getAppDownloadCatalog,
};

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=60",
} as const;

export async function appDownloadsRoute(
  _request: Request,
  dependencies: AppDownloadsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "app:downloads");
    const payload = await dependencies.readCatalog();

    return Response.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
