import {
  MobileOfflineError,
  isMobileMutationMethod,
  type MobileNetworkStatus,
} from "../network/mobile-network-contract";
import {
  emitMobileOfflineMutationAttempt,
  getMobileNetworkStatusSnapshot,
} from "../network/mobile-network-events";
import { recordMobileRequestLatency } from "../performance/mobile-request-metrics";
import { MOBILE_CLIENT_HEADERS } from "./mobile-client-headers";
import { MOBILE_REQUEST_ID_HEADER, createMobileRequestId } from "./mobile-request-id";

export class MobileApiError extends Error {
  readonly apiPath: string | null;
  readonly code: string;
  readonly serverCode: string | null;
  readonly status: number;

  constructor(
    message: string,
    input: {
      apiPath?: string | null;
      code?: string;
      serverCode?: string | null;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = "MobileApiError";
    this.apiPath = input.apiPath ?? null;
    this.code = input.code ?? "mobile_api_error";
    this.serverCode = input.serverCode ?? null;
    this.status = input.status ?? 0;
  }
}

export interface MobileApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null> | string | null;
  getNetworkStatus?: () => MobileNetworkStatus;
  timeoutMs?: number;
}

export interface MobileApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export interface MobileApiClient {
  createDownloadRequest?(path: string): Promise<MobileDownloadRequest>;
  requestJson<TResponse>(path: string, options?: MobileApiRequestOptions): Promise<TResponse>;
}

export interface MobileDownloadRequest {
  headers: Record<string, string>;
  url: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function assertRelativeApiPath(path: string) {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("..")
  ) {
    throw new MobileApiError("Whispr mobile API requests must use a safe relative path.", {
      code: "unsafe_path",
    });
  }
}

function getSafeErrorPath(path: string) {
  return path.split("?")[0]?.slice(0, 160) ?? "/";
}

function buildRequestUrl(baseUrl: string, path: string): string {
  assertRelativeApiPath(path);
  return new URL(path, baseUrl).toString();
}

async function readSafeServerErrorCode(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    const payload = (await response.clone().json()) as unknown;

    if (!payload || typeof payload !== "object" || !("code" in payload)) {
      return null;
    }

    const code = (payload as { code?: unknown }).code;
    if (typeof code !== "string" || !/^[A-Z0-9_:-]{1,96}$/i.test(code)) {
      return null;
    }

    return code;
  } catch {
    return null;
  }
}

async function resolveAccessToken(
  getAccessToken: MobileApiClientOptions["getAccessToken"],
): Promise<string | null> {
  if (!getAccessToken) {
    return null;
  }

  const token = await getAccessToken();
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function createMobileApiClient(options: MobileApiClientOptions): MobileApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async createDownloadRequest(path: string) {
      assertRelativeApiPath(path);
      const accessToken = await resolveAccessToken(options.getAccessToken);
      if (!accessToken) {
        throw new MobileApiError("Whispr mobile download requires authentication.", {
          code: "missing_access_token",
        });
      }
      return {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...MOBILE_CLIENT_HEADERS,
        },
        url: buildRequestUrl(baseUrl, path),
      };
    },
    async requestJson<TResponse>(path: string, requestOptions: MobileApiRequestOptions = {}) {
      assertRelativeApiPath(path);
      const networkStatus = options.getNetworkStatus?.() ?? getMobileNetworkStatusSnapshot();
      if (networkStatus === "offline" && isMobileMutationMethod(requestOptions.method)) {
        emitMobileOfflineMutationAttempt();
        throw new MobileOfflineError();
      }

      /**
       * The request dies when either clock says so: the timeout below, or the
       * caller.
       *
       * `signal` used to be written into `fetchOptions` after the spread, so a
       * caller's signal was always discarded — TanStack could cancel a query and
       * its HTTP request would keep running, keep downloading and keep parsing on
       * the JS thread. A resume that abandoned a dozen refetches abandoned only
       * the bookkeeping.
       */
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const callerSignal = requestOptions.signal ?? null;
      const abortFromCaller = () => controller.abort(callerSignal?.reason);
      if (callerSignal) {
        if (callerSignal.aborted) {
          controller.abort(callerSignal.reason);
        } else {
          callerSignal.addEventListener("abort", abortFromCaller);
        }
      }

      try {
        const { body: requestBody, ...initWithoutBody } = requestOptions;
        const headers = new Headers(requestOptions.headers);
        headers.set("Accept", "application/json");

        for (const [name, value] of Object.entries(MOBILE_CLIENT_HEADERS)) {
          headers.set(name, value);
        }

        // Fresh per request, so a slow sample on this device can be found in the
        // edge's own record of the same call.
        const requestId = createMobileRequestId();
        headers.set(MOBILE_REQUEST_ID_HEADER, requestId);

        const accessToken = await resolveAccessToken(options.getAccessToken);
        if (accessToken) {
          headers.set("Authorization", `Bearer ${accessToken}`);
        }

        const fetchOptions: RequestInit = {
          ...initWithoutBody,
          headers,
          signal: controller.signal,
        };

        if (requestBody !== undefined) {
          headers.set("Content-Type", "application/json");
          fetchOptions.body = JSON.stringify(requestBody);
        }

        const safeErrorPath = getSafeErrorPath(path);
        const requestStartedAt = Date.now();
        const response = await fetchImpl(buildRequestUrl(baseUrl, path), fetchOptions);
        // Two numbers, because they answer different questions. The header
        // arrival is what the server's own `total` bucket lines up with; the
        // settle is what the caller waited for, and the difference between them
        // is body download plus JSON parse on the JS thread.
        const headersMs = Date.now() - requestStartedAt;
        const serverTimingHeader = response.headers.get("Server-Timing");
        let recorded = false;
        const recordLatency = () => {
          if (recorded) {
            return;
          }

          recorded = true;
          recordMobileRequestLatency({
            headersMs,
            method: requestOptions.method ?? "GET",
            path,
            requestId,
            serverTimingHeader,
            settledMs: Date.now() - requestStartedAt,
          });
        };

        try {
          if (!response.ok) {
            const serverCode = await readSafeServerErrorCode(response);
            const codeSuffix = serverCode ? ` (${serverCode})` : "";
            throw new MobileApiError(
              `Whispr API request failed with status ${response.status} at ${safeErrorPath}${codeSuffix}.`,
              {
                apiPath: safeErrorPath,
                code: "http_error",
                serverCode,
                status: response.status,
              },
            );
          }

          if (response.status === 204) {
            return undefined as TResponse;
          }

          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.toLowerCase().includes("application/json")) {
            throw new MobileApiError("Whispr API returned a non-JSON response.", {
              code: "invalid_content_type",
              status: response.status,
            });
          }

          return (await response.json()) as TResponse;
        } finally {
          // Every exit records exactly once, including the thrown ones: a route
          // that only ever fails would otherwise report no latency at all.
          recordLatency();
        }
      } catch (error) {
        if (error instanceof MobileApiError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new MobileApiError("Whispr API request timed out.", {
            code: "timeout",
          });
        }

        throw new MobileApiError("Whispr API request failed before a response was received.", {
          code: "network_error",
        });
      } finally {
        clearTimeout(timeout);
        callerSignal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
