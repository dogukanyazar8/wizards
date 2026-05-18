import { type ZodSchema } from "zod";
import { ZodError } from "zod";
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

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  logError("[api] Unhandled error", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

function hasJsonContentType(request: Request) {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

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

export async function parseJsonBody<TSchema extends ZodSchema>(
  request: Request,
  schema: TSchema,
): Promise<ReturnType<TSchema["parse"]>> {
  const body = await readJsonBodyWithLimit(request);
  return schema.parse(body);
}
