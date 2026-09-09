import {
  formatSplashVersionLine,
  resolveSplashEnvironment,
  type SplashEnvironment,
  type SplashVersionInfo,
} from "@wizards/types";

import {
  WHISPR_BUILD_NUMBER,
  WHISPR_RELEASE_CHANNEL,
  WHISPR_RELEASE_CODENAME,
  WHISPR_VERSION_NUMBER,
} from "@/lib/app-version";

/**
 * Açılış ekranının kimlik satırı ve ortam rozeti (SPEC-SPLASH §3.3/§3.4).
 *
 * Değerler build zamanında gömülür; splash bunları hiçbir uçtan sormaz. Sunucudan
 * okunan bir sürüm, *cevabı veren dağıtımı* anlatır — açılışta gösterilmesi gereken
 * ise çalışan istemcinin kendisidir.
 *
 * `WHISPR_APP_VERSION` bilerek kullanılmıyor: o `0.8.15 "Echo"` biçimini üretir,
 * SPEC'in istediği `Whispr 0.8.15 (1204) · Echo` değil. Ham parçalar okunur.
 */

export type SplashIdentitySource = {
  buildNumber: string;
  codename: string;
  version: string;
};

/**
 * Ortam değişkenleri boş dize olarak da gelebilir (`NEXT_PUBLIC_WHISPR_BUILD_NUMBER`
 * ayarlanmadığında next.config boş bırakır). Boş parça satırdan **düşer**, sıfır ya da
 * yer tutucu ile doldurulmaz.
 */
export function buildSplashVersionInfo(source: SplashIdentitySource): SplashVersionInfo {
  const buildNumber = source.buildNumber.trim();
  const codename = source.codename.trim();

  return {
    ...(buildNumber ? { buildNumber } : {}),
    ...(codename ? { codename } : {}),
    version: source.version.trim(),
  };
}

export function getSplashVersionInfo(): SplashVersionInfo {
  return buildSplashVersionInfo({
    buildNumber: WHISPR_BUILD_NUMBER,
    codename: WHISPR_RELEASE_CODENAME,
    version: WHISPR_VERSION_NUMBER,
  });
}

export function getSplashVersionLine(): string {
  return formatSplashVersionLine(getSplashVersionInfo());
}

export function getSplashEnvironment(): SplashEnvironment {
  return resolveSplashEnvironment(WHISPR_RELEASE_CHANNEL);
}
