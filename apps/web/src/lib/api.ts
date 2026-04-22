import { type ZodSchema } from "zod";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return Response.json({ error: message }, { status: 500 });
}

export async function parseJsonBody<TSchema extends ZodSchema>(
  request: Request,
  schema: TSchema,
): Promise<ReturnType<TSchema["parse"]>> {
  const body = await request.json().catch(() => ({}));
  return schema.parse(body);
}
