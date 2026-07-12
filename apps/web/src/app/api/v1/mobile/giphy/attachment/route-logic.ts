import {
  MobileGiphyAttachmentRequestSchema,
  MobileGiphyAttachmentResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { createGiphyAttachment } from "@/lib/giphy/service";

export type MobileGiphyAttachmentRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  createAttachment: typeof createGiphyAttachment;
};

const defaultDependencies: MobileGiphyAttachmentRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  createAttachment: createGiphyAttachment,
};

export async function mobileGiphyAttachmentRoute(
  request: Request,
  dependencies: MobileGiphyAttachmentRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:giphy:attachment");
    const input = await dependencies.parseBody(request, MobileGiphyAttachmentRequestSchema);
    const result = await dependencies.createAttachment(userId, input.gifId);
    return Response.json(MobileGiphyAttachmentResponseSchema.parse(result), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
