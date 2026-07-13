import { mobileTwoFactorDisableRoute } from "./route-logic";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function DELETE(request: Request) {
  return mobileTwoFactorDisableRoute(request);
}
