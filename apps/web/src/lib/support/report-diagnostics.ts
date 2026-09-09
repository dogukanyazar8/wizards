import {
  resolveBugReportReleaseChannel,
  type BugReportClientPlatform,
  type MobileBugReportRequest,
  type MobileReleaseChannel,
} from "@wizards/types";

import { WHISPR_APP_VERSION, WHISPR_BUILD_ID, WHISPR_RELEASE_CHANNEL } from "@/lib/app-version";
import { collectWebBugReportLogLines } from "@/lib/observability/fault-log";
import { REPORT_LOG_LINE_COUNT } from "@/lib/support/report-metrics";

/**
 * SPEC §A.5 üçüncü satırının içeriği: `{tarayıcı} · {OS} · {sürüm} ({build}) · {kanal}`.
 *
 * Mobil `collectDeviceInfo`'nun web karşılığı ve aynı sözü verir: **kullanıcı
 * kimliği girmez**. Buradan çıkan nesne hem görünen satırın hem de istek
 * gövdesinin tek izin listesidir; ekranda görünmeyen bir alan gövdeye de girmez.
 */

export type ReportDeviceInfo = NonNullable<MobileBugReportRequest["deviceInfo"]>;

export type ReportDiagnostics = {
  readonly appBuild: string;
  readonly appVersion: string;
  readonly deviceInfo: ReportDeviceInfo;
  readonly platform: BugReportClientPlatform;
  readonly releaseChannel: MobileReleaseChannel;
};

export type ReportDiagnosticsSource = {
  readonly desktopReleaseRing?: unknown;
  readonly isDesktop: boolean;
  readonly locale: string;
  readonly platformLabel: string | null;
  readonly userAgent: string;
};

type BrowserRule = { readonly label: string; readonly pattern: RegExp };

/**
 * Sıra önemli: Edge ve Opera kendilerini Chrome diye de tanıtır, Chrome da
 * Safari diye. En özgül eşleşme önce denenir.
 */
const BROWSER_RULES: readonly BrowserRule[] = [
  { label: "Edge", pattern: /\bEdg(?:e|A|iOS)?\/(\d+)/ },
  { label: "Opera", pattern: /\bOPR\/(\d+)/ },
  { label: "Firefox", pattern: /\bFirefox\/(\d+)/ },
  { label: "Chrome", pattern: /\bChrome\/(\d+)/ },
  { label: "Safari", pattern: /\bVersion\/(\d+)[.\d]*\s+Safari\// },
];

const OS_RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "Windows", pattern: /Windows NT ([\d.]+)/ },
  { name: "macOS", pattern: /Mac OS X ([\d_]+)/ },
  { name: "Android", pattern: /Android ([\d.]+)/ },
  { name: "iOS", pattern: /(?:iPhone )?OS ([\d_]+) like Mac OS X/ },
  { name: "Linux", pattern: /\b(Linux)\b/ },
];

/** Windows sürüm numarası kullanıcıya `10` değil `NT 10.0` gelir; tabloya çevrilir. */
const WINDOWS_RELEASE: Readonly<Record<string, string>> = {
  "6.1": "7",
  "6.2": "8",
  "6.3": "8.1",
  "10.0": "10/11",
};

/** `Chrome 128`. Tanınmayan tarayıcı adsız kalır, uydurulmaz. */
export function parseBrowserLabel(userAgent: string): string | null {
  for (const rule of BROWSER_RULES) {
    const match = userAgent.match(rule.pattern);
    if (match?.[1]) {
      return `${rule.label} ${match[1]}`;
    }
  }

  return null;
}

/** `{ name: "macOS", version: "14.5" }`. */
export function parseOperatingSystem(
  userAgent: string,
): { readonly name: string; readonly version: string | null } | null {
  for (const rule of OS_RULES) {
    const match = userAgent.match(rule.pattern);
    if (!match) {
      continue;
    }

    if (rule.name === "Linux") {
      return { name: "Linux", version: null };
    }

    const raw = (match[1] ?? "").replace(/_/g, ".");
    if (rule.name === "Windows") {
      return { name: "Windows", version: WINDOWS_RELEASE[raw] ?? raw };
    }

    return { name: rule.name, version: raw.length > 0 ? raw : null };
  }

  return null;
}

/**
 * `WHISPR_APP_VERSION` kod adını da taşır (`0.8.15 "Echo"`). Cihaz satırı yalnız
 * sürüm numarasını gösterir — kod adı orada bir bilgi değil, gürültü.
 */
export function stripReleaseCodename(version: string): string {
  return version.split('"')[0]?.trim() ?? version;
}

function readRuntimeSource(): ReportDiagnosticsSource {
  const desktop = (globalThis as { __WHISPR_DESKTOP__?: { releaseRing?: unknown; shell?: string } })
    .__WHISPR_DESKTOP__;
  const navigatorRef =
    typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & { userAgentData?: { platform?: string } });

  return {
    desktopReleaseRing: desktop?.releaseRing,
    isDesktop: desktop?.shell === "desktop",
    locale: navigatorRef?.language ?? "tr",
    platformLabel: navigatorRef?.userAgentData?.platform ?? null,
    userAgent: navigatorRef?.userAgent ?? "",
  };
}

export function collectReportDiagnostics(
  source: ReportDiagnosticsSource = readRuntimeSource(),
): ReportDiagnostics {
  const browser = parseBrowserLabel(source.userAgent);
  const operatingSystem = parseOperatingSystem(source.userAgent);
  const osName = operatingSystem?.name ?? source.platformLabel;

  return {
    appBuild: WHISPR_BUILD_ID,
    appVersion: stripReleaseCodename(WHISPR_APP_VERSION),
    deviceInfo: {
      ...(browser === null ? {} : { deviceModel: browser }),
      locale: source.locale,
      ...(osName === null ? {} : { osName }),
      ...(operatingSystem?.version == null ? {} : { osVersion: operatingSystem.version }),
    },
    platform: source.isDesktop ? "desktop" : "web",
    // Masaüstü kabuğu kendi halkasını bilir; tarayıcı yalnız derleme kanalını.
    releaseChannel: source.isDesktop
      ? resolveBugReportReleaseChannel(source.desktopReleaseRing)
      : normalizeReleaseChannel(WHISPR_RELEASE_CHANNEL),
  };
}

function normalizeReleaseChannel(value: string): MobileReleaseChannel {
  const normalized = value.trim().toLowerCase();

  if (normalized === "uat" || normalized === "beta" || normalized === "stable") {
    return normalized;
  }

  return "stable";
}

/**
 * `{tarayıcı} · {OS} · {sürüm} ({build}) · {kanal}` — toggle kapalıyken de
 * görünür (SPEC §A.5), o yüzden bilinmeyen parçalar cümleyi bozmadan
 * `unknownLabel` ile dolar.
 */
export function formatReportDeviceLine(
  diagnostics: ReportDiagnostics,
  unknownLabel: string,
): string {
  const operatingSystem = [diagnostics.deviceInfo.osName, diagnostics.deviceInfo.osVersion]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");

  return [
    diagnostics.deviceInfo.deviceModel ?? unknownLabel,
    operatingSystem.length > 0 ? operatingSystem : unknownLabel,
    `${diagnostics.appVersion} (${diagnostics.appBuild})`,
    diagnostics.releaseChannel,
  ].join(" · ");
}

/**
 * Günlük satırları. Halka tamponu boşsa **satır hiç çizilmez** (SPEC §A.5), o
 * yüzden çağıran boş diziyi "kaynak yok" diye okur.
 */
export function collectReportLogLines(limit = REPORT_LOG_LINE_COUNT): readonly string[] {
  return collectWebBugReportLogLines(limit);
}
