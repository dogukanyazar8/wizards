import {
  ConversationPrivacySchema,
  UpdatePrivacyRequestSchema,
  type ConversationPrivacy,
  type UpdatePrivacyRequest,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { getMessagingPrivacy, updateMessagingPrivacy } from "@/lib/account/privacy-service";
import { requireApiUserId, requireMobileApiUserId } from "@/lib/auth/api";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

/**
 * Mesajlar §15.5 madde 2 — the two switches on the profile panel's
 * `GİZLİLİK VE GÜVENLİK` card (karar K9).
 *
 * The path is `/users/me/...` rather than a conversation-scoped one because the
 * columns are account-wide: the card is only where the switches happen to be
 * drawn, and a per-conversation endpoint would promise a per-conversation
 * setting the schema cannot keep.
 *
 * The card's third row reports transport encryption (karar K2) and has no
 * preference behind it, so nothing here reads or writes one.
 *
 * Karar K1: the web and mobile routes are this same pair of handlers with a
 * different identity and rate-limit bucket, so a preference written from a phone
 * is the same column the web publisher reads.
 */
export type MessagingPrivacyRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  rateLimits: { read: ApiRateLimitAction; update: ApiRateLimitAction };
  read(userId: string): Promise<ConversationPrivacy>;
  update(userId: string, input: UpdatePrivacyRequest): Promise<ConversationPrivacy>;
};

export const webMessagingPrivacyDefaults: MessagingPrivacyRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  rateLimits: { read: "user:privacy:read", update: "user:privacy:update" },
  read: (userId) => getMessagingPrivacy(userId),
  update: (userId, input) => updateMessagingPrivacy(userId, input),
};

/**
 * Only the identity and the bucket are rewritten, the same way the DM
 * participant routes mirror theirs — overriding more would be a second
 * behaviour to keep in step with the web one.
 */
export const mobileMessagingPrivacyDefaults: MessagingPrivacyRouteDependencies = {
  ...webMessagingPrivacyDefaults,
  authenticate: (request) => requireMobileApiUserId(request),
  rateLimits: { read: "mobile:account:settings", update: "mobile:account:settings" },
};

export async function messagingPrivacyReadRoute(
  request: Request,
  dependencies: MessagingPrivacyRouteDependencies = webMessagingPrivacyDefaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, dependencies.rateLimits.read);

    return Response.json(ConversationPrivacySchema.parse(await dependencies.read(userId)), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function messagingPrivacyUpdateRoute(
  request: Request,
  dependencies: MessagingPrivacyRouteDependencies = webMessagingPrivacyDefaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, dependencies.rateLimits.update);
    const input = await parseJsonBody(request, UpdatePrivacyRequestSchema);

    // The response carries both switches, not only the one that moved: the card
    // draws two rows, and echoing one would leave the other to a second read.
    return Response.json(
      ConversationPrivacySchema.parse(await dependencies.update(userId, input)),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonError(error);
  }
}
