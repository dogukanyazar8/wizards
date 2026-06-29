export class MobileApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, input: { code?: string; status?: number } = {}) {
    super(message);
    this.name = "MobileApiError";
    this.code = input.code ?? "mobile_api_error";
    this.status = input.status ?? 0;
  }
}

export interface MobileApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null> | string | null;
  timeoutMs?: number;
}

export interface MobileApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export interface MobileApiClient {
  requestJson<TResponse>(path: string, options?: MobileApiRequestOptions): Promise<TResponse>;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function assertRelativeApiPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("..")) {
    throw new MobileApiError("Whispr mobile API requests must use a safe relative path.", {
      code: "unsafe_path",
    });
  }
}

function buildRequestUrl(baseUrl: string, path: string): string {
  assertRelativeApiPath(path);
  return new URL(path, baseUrl).toString();
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
    async requestJson<TResponse>(path: string, requestOptions: MobileApiRequestOptions = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const { body: requestBody, ...initWithoutBody } = requestOptions;
        const headers = new Headers(requestOptions.headers);
        headers.set("Accept", "application/json");

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

        const response = await fetchImpl(buildRequestUrl(baseUrl, path), fetchOptions);

        if (!response.ok) {
          throw new MobileApiError(`Whispr API request failed with status ${response.status}.`, {
            code: "http_error",
            status: response.status,
          });
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
      }
    },
  };
}
