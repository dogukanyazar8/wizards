import {
  WebBugReportResponseSchema,
  type WebBugReportRequest,
  type WebBugReportResponse,
} from "@wizards/types";

/**
 * SPEC §A.8 gönderimi. Yanıt şemayla doğrulanır: başarı ekranı bilet numarasını
 * panoya kopyalıyor, o yüzden "201 döndü" yetmez — gövdenin gerçekten
 * `WSP-#####` taşıdığı burada kanıtlanır.
 */

export const BUG_REPORT_ENDPOINT = "/api/v1/support/report";

export type SubmitBugReportDependencies = {
  fetch: typeof globalThis.fetch;
};

const defaultDependencies: SubmitBugReportDependencies = {
  fetch: (...args) => globalThis.fetch(...args),
};

export class BugReportSubmitError extends Error {
  constructor(readonly status: number) {
    super(`Bug report submission failed with status ${status}.`);
    this.name = "BugReportSubmitError";
  }
}

export async function submitBugReport(
  request: WebBugReportRequest,
  dependencies: SubmitBugReportDependencies = defaultDependencies,
): Promise<WebBugReportResponse> {
  const response = await dependencies.fetch(BUG_REPORT_ENDPOINT, {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new BugReportSubmitError(response.status);
  }

  return WebBugReportResponseSchema.parse(await response.json());
}

/**
 * Gövdeyi kurar. Her toggle **kendi** alanını kapatır: kapalı bir toggle'ın
 * verisi gövdeye hiç girmez, sunucunun onu atmasına güvenilmez.
 */
export function buildBugReportRequest(input: {
  readonly appBuild: string;
  readonly appVersion: string;
  readonly body: string;
  readonly category: NonNullable<WebBugReportRequest["category"]>;
  readonly deviceInfo: WebBugReportRequest["deviceInfo"];
  readonly includesDeviceInfo: boolean;
  readonly includesLogs: boolean;
  readonly logLines: readonly string[];
  readonly platform: string;
  readonly releaseChannel: WebBugReportRequest["releaseChannel"];
  readonly screenshotUploadKey?: string | undefined;
}): WebBugReportRequest {
  const logExcerpt = input.includesLogs ? input.logLines.join("\n") : "";

  return {
    appBuild: input.appBuild,
    appVersion: input.appVersion,
    body: input.body.trim(),
    category: input.category,
    ...(input.includesDeviceInfo && input.deviceInfo ? { deviceInfo: input.deviceInfo } : {}),
    includesDeviceInfo: input.includesDeviceInfo,
    includesLogs: input.includesLogs,
    includesScreenshot: input.screenshotUploadKey !== undefined,
    ...(logExcerpt.length === 0 ? {} : { logExcerpt }),
    platform: input.platform,
    ...(input.releaseChannel === undefined ? {} : { releaseChannel: input.releaseChannel }),
    ...(input.screenshotUploadKey === undefined
      ? {}
      : { screenshotUploadKey: input.screenshotUploadKey }),
  };
}
