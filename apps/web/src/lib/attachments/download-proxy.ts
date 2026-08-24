import * as http from "node:http";
import * as https from "node:https";
import { Readable } from "node:stream";
import { ApiError } from "@/lib/api";
import {
  assertPublicHttpUrl,
  createPublicLookup,
  type LinkPreviewFetchOptions,
} from "@/lib/messages/link-preview";

const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 10_000;
const ATTACHMENT_DOWNLOAD_USER_AGENT = "WhisprAttachmentProxy/1.0";
const ATTACHMENT_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_ATTACHMENT_REDIRECTS = 4;

type AttachmentHttpResponse = {
  body: ReadableStream<Uint8Array> | null;
  headers: http.IncomingHttpHeaders;
  ok: boolean;
  status: number;
};

function getHeader(headers: http.IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function isRedirectStatus(status: number) {
  return ATTACHMENT_REDIRECT_STATUSES.has(status);
}

async function requestPublicAttachmentUrl(
  target: Awaited<ReturnType<typeof assertPublicHttpUrl>>,
  resolveHost: NonNullable<LinkPreviewFetchOptions["resolveHost"]>,
): Promise<AttachmentHttpResponse> {
  return new Promise((resolve, reject) => {
    const requestUrl = target.url;
    const client = requestUrl.protocol === "https:" ? https : http;
    let settled = false;

    const finish = (error: unknown, response?: AttachmentHttpResponse) => {
      if (settled) {
        return;
      }
      settled = true;

      if (error) {
        reject(error);
        return;
      }

      if (response) {
        resolve(response);
        return;
      }

      reject(
        new ApiError("Attachment could not be downloaded.", 502, "ATTACHMENT_DOWNLOAD_FAILED"),
      );
    };

    const request = client.request(
      {
        headers: {
          "user-agent": ATTACHMENT_DOWNLOAD_USER_AGENT,
        },
        hostname: requestUrl.hostname,
        lookup: createPublicLookup(resolveHost),
        method: "GET",
        path: `${requestUrl.pathname}${requestUrl.search}`,
        port: requestUrl.port ? Number.parseInt(requestUrl.port, 10) : undefined,
        protocol: requestUrl.protocol,
        timeout: ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 0;

        if (isRedirectStatus(status)) {
          incoming.resume();
          incoming.on("end", () => {
            finish(null, {
              body: null,
              headers: incoming.headers,
              ok: status >= 200 && status < 300,
              status,
            });
          });
          incoming.on("error", finish);
          return;
        }

        finish(null, {
          body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
          headers: incoming.headers,
          ok: status >= 200 && status < 300,
          status,
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(
        new ApiError("Attachment could not be downloaded.", 502, "ATTACHMENT_DOWNLOAD_FAILED"),
      );
    });
    request.on("error", finish);
    request.end();
  });
}

export async function openPublicAttachmentDownload(
  rawUrl: string,
  options: LinkPreviewFetchOptions = {},
) {
  const resolveHost =
    options.resolveHost ??
    (async (hostname: string) => {
      const { lookup } = await import("node:dns/promises");
      return lookup(hostname, { all: true, verbatim: true });
    });
  let currentTarget = await assertPublicHttpUrl(rawUrl, resolveHost);
  let response: AttachmentHttpResponse | null = null;

  for (let redirectCount = 0; redirectCount < MAX_ATTACHMENT_REDIRECTS; redirectCount += 1) {
    response = await requestPublicAttachmentUrl(currentTarget, resolveHost);

    if (!isRedirectStatus(response.status)) {
      break;
    }

    const location = getHeader(response.headers, "location");
    if (!location) {
      break;
    }

    currentTarget = await assertPublicHttpUrl(
      new URL(location, currentTarget.url).toString(),
      resolveHost,
    );
  }

  if (!response?.ok || !response.body) {
    throw new ApiError("Attachment could not be downloaded.", 502, "ATTACHMENT_DOWNLOAD_FAILED");
  }

  return {
    body: response.body,
    url: currentTarget.url,
  };
}
