import { z } from "zod";
import type { AnalyticsClientType, ClientHealthKind, Prisma } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";

/** One flush carries at most a screenful of signals; the rest waits. */
export const CLIENT_HEALTH_MAX_EVENTS = 50;
export const CLIENT_HEALTH_MAX_BYTES = 32 * 1024;

/**
 * A crash or an uncaught error can happen before anyone signs in, so those two
 * kinds are accepted without a session. Measurements are not: a client that can
 * time a screen can also send its token, and an open write endpoint for them
 * would be free storage for anyone.
 */
export const ANONYMOUS_CLIENT_HEALTH_KINDS = [
  "CRASH",
  "ERROR",
] as const satisfies readonly ClientHealthKind[];

const ClientHealthEventSchema = z.object({
  context: z.record(z.string(), z.unknown()).optional(),
  kind: z.enum(["STARTUP", "SCREEN_LOAD", "CRASH", "ERROR", "API_LATENCY"]),
  surface: z.string().trim().max(64).optional(),
  valueMs: z
    .number()
    .int()
    .min(0)
    .max(10 * 60_000)
    .optional(),
});

const ClientHealthBatchSchema = z.object({
  events: z.array(ClientHealthEventSchema).min(1).max(CLIENT_HEALTH_MAX_EVENTS),
});

export type ClientHealthBatch = z.infer<typeof ClientHealthBatchSchema>;

export type ClientHealthAttribution = {
  appVersion: string | null;
  clientType: AnalyticsClientType;
  os: string | null;
};

export type ClientHealthStore = {
  clientHealthEvent: {
    createMany(args: {
      data: Prisma.ClientHealthEventCreateManyInput[];
      skipDuplicates?: boolean;
    }): Promise<{
      count: number;
    }>;
  };
};

/**
 * The id the client stamped on the measurement, if it sent one.
 *
 * The reporter retries a batch it may already have delivered, so the same sample
 * can arrive twice; this is what the unique index dedupes on. Bounded to the
 * column width, and anything that is not a plain string is ignored rather than
 * coerced.
 */
function readSampleId(context: Record<string, unknown> | undefined): string | undefined {
  const sampleId = context?.sampleId;
  return typeof sampleId === "string" && sampleId.length > 0 && sampleId.length <= 64
    ? sampleId
    : undefined;
}

/**
 * Size is checked before shape: a body that is too large is refused without
 * paying to validate every entry inside it.
 */
export function parseClientHealthBatch(input: unknown): ClientHealthBatch {
  const encoded = JSON.stringify(input ?? null);

  if (encoded.length > CLIENT_HEALTH_MAX_BYTES) {
    throw new ApiError("Health payload is too large.", 400, "PAYLOAD_TOO_LARGE");
  }

  const parsed = ClientHealthBatchSchema.safeParse(input);

  if (!parsed.success) {
    throw new ApiError("Invalid health payload.", 400, "INVALID_PAYLOAD");
  }

  return parsed.data;
}

export async function recordClientHealthEvents(
  args: {
    attribution: ClientHealthAttribution;
    batch: ClientHealthBatch;
    userId: string | null;
  },
  client: ClientHealthStore = prisma,
) {
  if (args.userId === null) {
    const anonymousKinds = new Set<string>(ANONYMOUS_CLIENT_HEALTH_KINDS);
    const refused = args.batch.events.find((event) => !anonymousKinds.has(event.kind));

    if (refused) {
      throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
    }
  }

  const result = await client.clientHealthEvent.createMany({
    data: args.batch.events.map((event) => {
      const sampleId = readSampleId(event.context);

      return {
        appVersion: args.attribution.appVersion,
        clientType: args.attribution.clientType,
        ...(event.context ? { context: event.context as Prisma.InputJsonValue } : {}),
        kind: event.kind,
        os: args.attribution.os,
        ...(sampleId ? { sampleId } : {}),
        ...(event.surface ? { surface: event.surface } : {}),
        userId: args.userId,
        ...(event.valueMs === undefined ? {} : { valueMs: event.valueMs }),
      };
    }),
    // A retried flush must not double-count; the unique index on `sampleId` is
    // what makes this safe rather than lossy.
    skipDuplicates: true,
  });

  return { accepted: result.count };
}
