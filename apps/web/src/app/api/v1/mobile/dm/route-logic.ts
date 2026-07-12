import { MobileDMCreateRequestSchema, MobileDMCreateResponseSchema } from "@wizards/types";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { createOrOpenDirectMessage } from "@/lib/dm/service";

export type MobileDMCreateDependencies = {
  authenticate(request: Request): Promise<string>;
  createDM(userId: string, targetUserId: string): ReturnType<typeof createOrOpenDirectMessage>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
};
const defaults: MobileDMCreateDependencies = { authenticate: (request) => requireMobileApiUserId(request), createDM: createOrOpenDirectMessage, enforceRateLimit: enforceApiRateLimit, parseBody: (request, schema) => parseJsonBody(request, schema) };

export async function mobileDMCreateRoute(request: Request, dependencies: MobileDMCreateDependencies = defaults) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:create");
    const { userId: targetUserId } = await dependencies.parseBody(request, MobileDMCreateRequestSchema);
    const conversation = await dependencies.createDM(userId, targetUserId);
    return Response.json(MobileDMCreateResponseSchema.parse({ conversation }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
