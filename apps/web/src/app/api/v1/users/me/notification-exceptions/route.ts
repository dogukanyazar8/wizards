import { notificationExceptionsRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(_request: Request) {
  return notificationExceptionsRoute();
}
