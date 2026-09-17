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

/**
 * Units a measured `value` may carry. `valueMs` predates this and stays: an
 * old client's batch parses unchanged, and a `ms` value still lands in the
 * `valueMs` column so the existing startup percentiles keep reading it.
 */
export const CLIENT_HEALTH_UNITS = ["ms", "fps", "kbps", "count", "pct"] as const;
export type ClientHealthUnit = (typeof CLIENT_HEALTH_UNITS)[number];
/** Generous ceiling for any unit; a 4K60 share tops out near 24 000 kbps. */
export const CLIENT_HEALTH_MAX_VALUE = 1_000_000;

const ClientHealthEventSchema = z
  .object({
    context: z.record(z.string(), z.unknown()).optional(),
    kind: z.enum(["STARTUP", "SCREEN_LOAD", "CRASH", "ERROR", "API_LATENCY"]),
    surface: z.string().trim().max(64).optional(),
    unit: z.enum(CLIENT_HEALTH_UNITS).optional(),
    value: z.number().finite().min(0).max(CLIENT_HEALTH_MAX_VALUE).optional(),
    valueMs: z
      .number()
      .int()
      .min(0)
      .max(10 * 60_000)
      .optional(),
  })
  .refine((event) => (event.value === undefined) === (event.unit === undefined), {
    message: "A measured value and its unit come together.",
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
 * The table has a `valueMs` column and a JSON `context`, nothing for a unit.
 * A measured `value` is therefore kept in the context next to its unit — the
 * rollup and the admin snapshot read it back from there
 * (`readClientHealthMeasuredValue`) — and a `ms` value is mirrored into
 * `valueMs` so nothing that reads the column today has to change. Adding
 * `value`/`unit` columns is a `@wizards/db` migration this strip cannot make.
 */
function toStoredMeasurement(event: ClientHealthBatch["events"][number]): {
  context: Record<string, unknown> | undefined;
  valueMs: number | undefined;
} {
  if (event.value === undefined || event.unit === undefined) {
    return { context: event.context, valueMs: event.valueMs };
  }

  return {
    context: { ...(event.context ?? {}), unit: event.unit, value: event.value },
    valueMs:
      event.valueMs ??
      (event.unit === "ms" ? Math.min(600_000, Math.round(event.value)) : undefined),
  };
}

/**
 * Size is checked before shape: a body that is too large is refused without
 * paying to validate every entry inside it.
 */
export function parseClientHealthBatch(input: unknown): ClientHealthBatch {
  const encoded = JSON.stringify(input ?? null);

  if (Buffer.byteLength(encoded, "utf8") > CLIENT_HEALTH_MAX_BYTES) {
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
      const stored = toStoredMeasurement(event);

      return {
        appVersion: args.attribution.appVersion,
        clientType: args.attribution.clientType,
        ...(stored.context ? { context: stored.context as Prisma.InputJsonValue } : {}),
        kind: event.kind,
        os: args.attribution.os,
        ...(sampleId ? { sampleId } : {}),
        ...(event.surface ? { surface: event.surface } : {}),
        userId: args.userId,
        ...(stored.valueMs === undefined ? {} : { valueMs: stored.valueMs }),
      };
    }),
    // A retried flush must not double-count; the unique index on `sampleId` is
    // what makes this safe rather than lossy.
    skipDuplicates: true,
  });

  return { accepted: result.count };
}
