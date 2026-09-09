import {
  messagingPrivacyReadRoute,
  messagingPrivacyUpdateRoute,
  mobileMessagingPrivacyDefaults,
  // Relative on purpose: `route-contract.test.ts` resolves a `route-logic`
  // import against the route's own directory to find the identity gate, and a
  // `@/` alias reads to it as a file that does not exist.
} from "../../../users/me/privacy/route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Karar K1's mobile half of §15.5 madde 2.
 *
 * A separate endpoint rather than two more fields on
 * `/mobile/account/settings`: that response is a fixed contract shape the app
 * already parses, and widening it would move a schema owned elsewhere. Both ends
 * share `UpdatePrivacyRequestSchema` and `ConversationPrivacySchema`, so the
 * phone and the web card speak the same body either way.
 */
export function GET(request: Request) {
  return messagingPrivacyReadRoute(request, mobileMessagingPrivacyDefaults);
}

export function PATCH(request: Request) {
  return messagingPrivacyUpdateRoute(request, mobileMessagingPrivacyDefaults);
}
