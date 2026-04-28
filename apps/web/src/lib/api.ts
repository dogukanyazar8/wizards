import { type ZodSchema } from "zod";
import { ZodError } from "zod";

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

  console.error("[api] Unhandled error", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function parseJsonBody<TSchema extends ZodSchema>(
  request: Request,
  schema: TSchema,
): Promise<ReturnType<TSchema["parse"]>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    throw new ApiError("Request body too large", 413);
  }

  const body = await request.json().catch(() => ({}));
  return schema.parse(body);
}
