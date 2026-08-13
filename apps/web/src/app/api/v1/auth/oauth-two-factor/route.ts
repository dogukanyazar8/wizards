import { oauthTwoFactorRoute } from "./route-logic";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return oauthTwoFactorRoute(request);
}
