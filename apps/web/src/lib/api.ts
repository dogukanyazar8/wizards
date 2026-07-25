import { type output, type ZodType, ZodError } from "zod";
import { logError } from "@/lib/logger";

const MAX_JSON_BODY_BYTES = 1_048_576;
const JSON_CONTENT_TYPE = "application/json";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function publicZodErrorMessage(error: ZodError) {
  const issue = error.issues[0];

  if (issue?.code === "invalid_type") {
    const match = /^Invalid input: expected (.+), received (.+)$/.exec(issue.message);
    if (match) {
      const [, expected, received] = match;
      return received === "undefined" ? "Required" : `Expected ${expected}, received ${received}`;
    }
  }

  if (
    issue?.code === "too_small" &&
    issue.origin === "string" &&
    issue.inclusive &&
    issue.message === `Too small: expected string to have >=${issue.minimum} characters`
  ) {
    return `String must contain at least ${issue.minimum} character(s)`;
  }

  if (
    issue?.code === "invalid_format" &&
    issue.format === "uuid" &&
    issue.message === "Invalid UUID"
  ) {
    return "Invalid uuid";
  }

  return issue?.message ?? "Invalid request body";
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json({ error: publicZodErrorMessage(error) }, { status: 400 });
  }

  logError("[api] Unhandled error", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

function hasJsonContentType(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

  return mediaType === JSON_CONTENT_TYPE;
}

async function readJsonBodyWithLimit(request: Request) {
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;

  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new ApiError("Request body too large", 413);
  }

  if (!request.body) {
    return {};
  }

  if (!hasJsonContentType(request)) {
    throw new ApiError("Unsupported Media Type", 415, "UNSUPPORTED_MEDIA_TYPE");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_JSON_BODY_BYTES) {
      throw new ApiError("Request body too large", 413);
    }

    chunks.push(value);
  }

  if (receivedBytes === 0) {
    return {};
  }

  const buffer = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(buffer).trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("Invalid request body", 400);
  }
}

export async function parseJsonBody<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
): Promise<output<TSchema>> {
  const body = await readJsonBodyWithLimit(request);
  return schema.parse(body);
}
