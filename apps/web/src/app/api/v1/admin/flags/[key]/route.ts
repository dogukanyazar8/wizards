import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { updateFeatureFlag } from "@/lib/feature-flags/admin-service";

type RouteContext = {
  params: Promise<{
    key: string;
  }>;
};

export const UpdateFeatureFlagSchema = z
  .object({
    clientTypes: z
      .array(z.enum(["WEB", "DESKTOP", "MOBILE", "UNKNOWN"]))
      .max(4)
      .optional(),
    description: z.string().trim().max(280).nullable().optional(),
    enabled: z.boolean().optional(),
    rolloutPercent: z.number().int().min(0).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update.",
  });

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("flag.write");
    await enforceApiRateLimit(admin.id, "admin:flag:update");

    const input = await parseJsonBody(request, UpdateFeatureFlagSchema);
    const { key } = await context.params;
    const flag = await updateFeatureFlag({
      adminUserId: admin.id,
      headers: request.headers,
      key,
      update: {
        ...(input.clientTypes === undefined ? {} : { clientTypes: input.clientTypes }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.rolloutPercent === undefined ? {} : { rolloutPercent: input.rolloutPercent }),
      },
    });

    return Response.json({ flag });
  } catch (error) {
    return jsonError(error);
  }
}
