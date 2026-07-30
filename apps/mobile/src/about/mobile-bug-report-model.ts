import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MobileBugReportRequestSchema,
  MOBILE_BUG_REPORT_BODY_MAX_LENGTH,
  MOBILE_BUG_REPORT_BODY_MIN_LENGTH,
  MOBILE_BUG_REPORT_LOG_MAX_LINES,
  type MobileBugReportCategory,
  type MobileBugReportRequest,
  type MobileReleaseChannel,
} from "@wizards/types";

export const MOBILE_BUG_REPORT_QUEUE_KEY = "whispr.report.queuedDrafts";
export const MOBILE_BUG_REPORT_QUEUE_LIMIT = 5;

const SENSITIVE_LOG_PATTERN =
  /(?:access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|authorization\s*:|bearer\s+[a-z0-9._~-]|(?:message|content|body|person(?:[_-]?name)?|contact|display[_-]?name|user[_-]?name|file[_-]?name|attachment[_-]?name)\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:^|[\\/])[^\\/\s]+\.(?:docx?|pdf|png|jpe?g|webp|gif|zip|txt|csv)\b)/i;

export type MobileBugReportValidationReason = "body-long" | "body-short" | "category";

export type MobileBugReportValidation =
  | { readonly valid: true }
  | { readonly reason: MobileBugReportValidationReason; readonly valid: false };

export interface BuildMobileBugReportRequestInput {
  readonly appBuild?: string | undefined;
  readonly appVersion?: string | undefined;
  readonly body: string;
  readonly category: MobileBugReportCategory;
  readonly deviceInfo?: MobileBugReportRequest["deviceInfo"];
  readonly includesDeviceInfo: boolean;
  readonly includesLogs: boolean;
  readonly includesScreenshot: boolean;
  readonly logLines?: readonly string[] | undefined;
  readonly platform?: string | undefined;
  readonly releaseChannel?: MobileReleaseChannel | undefined;
  readonly screenshotUploadKey?: string | undefined;
}

export interface MobileBugReportQueuedDraft {
  readonly id: string;
  readonly queuedAt: string;
  readonly request: MobileBugReportRequest;
  /**
   * Local-only retry context. This never enters `MobileBugReportRequest` and
   * therefore never crosses the support API trust boundary.
   */
  readonly screenshotLocalUri?: string | undefined;
}

export interface MobileBugReportQueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function validateMobileBugReportDraft(input: {
  readonly body: string;
  readonly category: MobileBugReportCategory | null;
}): MobileBugReportValidation {
  if (input.category === null) {
    return { reason: "category", valid: false };
  }

  const length = input.body.trim().length;
  if (length < MOBILE_BUG_REPORT_BODY_MIN_LENGTH) {
    return { reason: "body-short", valid: false };
  }
  if (length > MOBILE_BUG_REPORT_BODY_MAX_LENGTH) {
    return { reason: "body-long", valid: false };
  }

  return { valid: true };
}

/**
 * Diagnostics are allow-listed elsewhere, but every line is redacted again at
 * the last client-side boundary. A suspicious line is removed wholesale: a
 * partial mask can leave a person's name or a file stem behind.
 */
export function redactMobileBugReportLogLines(
  lines: readonly string[],
  limit = MOBILE_BUG_REPORT_LOG_MAX_LINES,
): readonly string[] {
  const boundedLimit = Math.max(0, Math.min(MOBILE_BUG_REPORT_LOG_MAX_LINES, Math.trunc(limit)));
  if (boundedLimit === 0) {
    return [];
  }

  return lines.slice(-boundedLimit).map((line) => {
    const normalized = line.replace(/[\r\n]+/g, " ").trim();
    return SENSITIVE_LOG_PATTERN.test(normalized) ? "[redacted]" : normalized;
  });
}

export function buildMobileBugReportRequest(
  input: BuildMobileBugReportRequestInput,
): MobileBugReportRequest {
  const logLines = input.includesLogs ? redactMobileBugReportLogLines(input.logLines ?? []) : [];
  const logExcerpt = logLines.length === 0 ? undefined : logLines.join("\n");

  return MobileBugReportRequestSchema.parse({
    ...(input.appBuild ? { appBuild: input.appBuild } : {}),
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    body: input.body.trim(),
    category: input.category,
    ...(input.includesDeviceInfo && input.deviceInfo ? { deviceInfo: input.deviceInfo } : {}),
    includesDeviceInfo: input.includesDeviceInfo,
    includesLogs: input.includesLogs,
    includesScreenshot: input.includesScreenshot,
    ...(logExcerpt === undefined ? {} : { logExcerpt }),
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.releaseChannel ? { releaseChannel: input.releaseChannel } : {}),
    ...(input.includesScreenshot && input.screenshotUploadKey
      ? { screenshotUploadKey: input.screenshotUploadKey }
      : {}),
  });
}

export function enqueueMobileBugReportDraft(
  current: readonly MobileBugReportQueuedDraft[],
  draft: MobileBugReportQueuedDraft,
): readonly MobileBugReportQueuedDraft[] {
  return [...current.filter((entry) => entry.id !== draft.id), draft].slice(
    -MOBILE_BUG_REPORT_QUEUE_LIMIT,
  );
}

export function createMobileBugReportQueuedDraft(
  request: MobileBugReportRequest,
  options: {
    readonly now?: Date;
    readonly random?: number;
    readonly screenshotLocalUri?: string | undefined;
  } = {},
): MobileBugReportQueuedDraft {
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random();

  return {
    id: `report-${now.getTime()}-${Math.floor(Math.abs(random) * 1_000_000)}`,
    queuedAt: now.toISOString(),
    request,
    ...(options.screenshotLocalUri ? { screenshotLocalUri: options.screenshotLocalUri } : {}),
  };
}

function parseMobileBugReportQueuedDraft(input: unknown): MobileBugReportQueuedDraft | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const value = input as Record<string, unknown>;
  const allowedKeys = new Set(["id", "queuedAt", "request", "screenshotLocalUri"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const request = MobileBugReportRequestSchema.safeParse(value.request);
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 120 ||
    typeof value.queuedAt !== "string" ||
    !Number.isFinite(Date.parse(value.queuedAt)) ||
    (value.screenshotLocalUri !== undefined &&
      (typeof value.screenshotLocalUri !== "string" ||
        value.screenshotLocalUri.length === 0 ||
        value.screenshotLocalUri.length > 4_096)) ||
    !request.success
  ) {
    return null;
  }

  return {
    id: value.id,
    queuedAt: value.queuedAt,
    request: request.data,
    ...(typeof value.screenshotLocalUri === "string"
      ? { screenshotLocalUri: value.screenshotLocalUri }
      : {}),
  };
}

export async function readQueuedMobileBugReports(
  storage: MobileBugReportQueueStorage = AsyncStorage,
): Promise<readonly MobileBugReportQueuedDraft[]> {
  try {
    const raw = await storage.getItem(MOBILE_BUG_REPORT_QUEUE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .flatMap((entry) => {
        const draft = parseMobileBugReportQueuedDraft(entry);
        return draft === null ? [] : [draft];
      })
      .slice(-MOBILE_BUG_REPORT_QUEUE_LIMIT);
  } catch {
    return [];
  }
}

export async function writeQueuedMobileBugReports(
  drafts: readonly MobileBugReportQueuedDraft[],
  storage: MobileBugReportQueueStorage = AsyncStorage,
): Promise<void> {
  const safeDrafts = drafts
    .flatMap((draft) => {
      const parsed = parseMobileBugReportQueuedDraft(draft);
      return parsed === null ? [] : [parsed];
    })
    .slice(-MOBILE_BUG_REPORT_QUEUE_LIMIT);

  await storage.setItem(MOBILE_BUG_REPORT_QUEUE_KEY, JSON.stringify(safeDrafts));
}

export async function queueMobileBugReport(
  draft: MobileBugReportQueuedDraft,
  storage: MobileBugReportQueueStorage = AsyncStorage,
): Promise<readonly MobileBugReportQueuedDraft[]> {
  const next = enqueueMobileBugReportDraft(await readQueuedMobileBugReports(storage), draft);
  await writeQueuedMobileBugReports(next, storage);
  return next;
}
